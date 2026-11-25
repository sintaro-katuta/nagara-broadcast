import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
import {emailLookup,encryptEmail} from '../cloudflare/recovery-crypto.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN,resend=process.env.NAGARA_STAGE_RESEND_KEY;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token||!/^re_[A-Za-z0-9_-]{10,250}$/.test(resend||''))throw new Error('Test configuration missing');
const api=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,realFetch=globalThis.fetch.bind(globalThis),name=`nagara-notice-delivery-${randomUUID()}`;let id;
async function request(path='',method='GET',body){const response=await realFetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`D1 request failed (${response.status})`);return data.result;}
async function sql(query,params=[]){const result=await request(`/${id}/query`,'POST',{sql:query,params});if(result[0]?.success!==true)throw new Error('D1 test query failed');return result[0];}
const db={prepare(query){return {bind(...params){return {async run(){return sql(query,params)},async first(){return (await sql(query,params)).results?.[0]||null}}}}}};
try{
 const created=await request('','POST',{name});if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created?.uuid||''))throw new Error('Unexpected temporary D1 response');id=created.uuid;
 for(const path of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql','../cloudflare/migrations/0016_recovery_notice_failures.sql'])await sql(await readFile(new URL(path,import.meta.url),'utf8'));
 const lookupKey=new Uint8Array(32).fill(2),key=new Uint8Array(32).fill(3),address='delivered@resend.dev',now=Date.now(),seconds=Math.floor(now/1000);
 await sql('INSERT INTO accounts(id) VALUES (?)',['synthetic']);
 await sql('INSERT INTO recovery_emails VALUES (?,?,?,?)',['synthetic',await emailLookup(address,lookupKey),await encryptEmail(address,'synthetic',key),new Date(now).toISOString()]);
 await sql('INSERT INTO recovery_notice_outbox(id,account_id,created_at,next_attempt_at) VALUES (?,?,?,?)',['notice-synthetic','synthetic',seconds,seconds]);
 const env={DB:db,AUTH_NOTICES_ENABLED:'true',AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'no-reply@mail.nagara-broadcast.sintaro-katuta.com',RESEND_API_KEY:resend};
 let calls=0;globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(JSON.parse(options.body).to,address);assert.equal(++calls,1);return realFetch(url,options);};
 await worker.scheduled({cron:'*/5 * * * *',scheduledTime:now},env);
 assert.equal(calls,1);assert.equal((await sql('SELECT COUNT(*) AS n FROM recovery_notice_outbox')).results[0].n,0);
 console.log('One approved recovery notice was accepted by Resend for the official test recipient.');
}finally{globalThis.fetch=realFetch;if(id){await request(`/${id}`,'DELETE');console.log('Temporary test database deleted');}}
