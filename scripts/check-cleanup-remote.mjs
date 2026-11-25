import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import worker from '../cloudflare/worker.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('D1 test configuration missing');
const api=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,name=`nagara-cleanup-test-${randomUUID()}`;let id;
async function request(path='',method='GET',body){const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`D1 request failed (${response.status})`);return data.result;}
async function sql(query,params=[]){const result=await request(`/${id}/query`,'POST',{sql:query,params});if(result[0]?.success!==true)throw new Error('D1 test query failed');return result[0];}
const db={prepare(query){return {query,params:[],bind(...params){return {...this,params};}}},async batch(statements){const result=await request(`/${id}/query`,'POST',{batch:statements.map(s=>({sql:s.query,params:s.params}))});if(result.some(x=>!x.success))throw new Error('D1 batch failed');return result;}};
const tables=['account_sessions','passkey_challenges','passkey_login_attempts','recovery_tokens','auth_rate_limits','passkey_registration_attempts','passkey_enrollments','passkey_recovery_attempts'];
try{
 const created=await request('','POST',{name});if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created?.uuid||''))throw new Error('Unexpected temporary D1 response');id=created.uuid;
 const migrations=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
 for(const path of [new URL('../cloudflare/schema.sql',import.meta.url),...migrations.map(x=>new URL('../cloudflare/migrations/'+x,import.meta.url))])await sql(await readFile(path,'utf8'));
 const now=Date.now(),seconds=Math.floor(now/1000);await sql("INSERT INTO accounts(id) VALUES ('test-account'),('expired-recovery'),('live-recovery')");await sql("INSERT INTO episodes VALUES ('test-episode','test','tech','','',30,10,'2026-01-01','test/audio')");
 const inserts={account_sessions:"INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,'test-account',?)",passkey_challenges:"INSERT INTO passkey_challenges(challenge,purpose,expires_at) VALUES (?,'authentication',?)",passkey_login_attempts:"INSERT INTO passkey_login_attempts(browser_token_hash,challenge,expires_at) VALUES (?,'challenge',?)",recovery_tokens:"INSERT INTO recovery_tokens(token_hash,account_id,purpose,expires_at) VALUES (?,'test-account','recover_account',?)",auth_rate_limits:'INSERT INTO auth_rate_limits(bucket_key,attempts,expires_at) VALUES (?,1,?)',passkey_registration_attempts:"INSERT INTO passkey_registration_attempts(browser_token_hash,account_id,challenge,expires_at) VALUES (?,'test-account','challenge',?)",passkey_enrollments:"INSERT INTO passkey_enrollments(account_id,email_lookup,email_ciphertext,expires_at) VALUES (?,?,'cipher',?)",passkey_recovery_attempts:'INSERT INTO passkey_recovery_attempts(browser_token_hash,account_id,expires_at) VALUES (?,?,?)'};
 for(const table of tables)for(const [label,expiry] of [['expired',seconds-1],['live',seconds+3600]]){const params=table==='passkey_enrollments'?[label,label,expiry]:table==='passkey_recovery_attempts'?[label,`${label}-recovery`,expiry]:[label,expiry];await sql(inserts[table],params);}
 await sql("INSERT INTO favorites(account_id,episode_id,saved_at) VALUES ('test-account','test-episode','2026-01-01')");
 await sql("INSERT INTO listening_history(account_id,episode_id,played_at,position_seconds) VALUES ('test-account','test-episode','2026-01-01',10)");
 await sql("INSERT INTO recovery_emails VALUES ('test-account','lookup','cipher','2026-01-01')");
 await sql("INSERT INTO passkeys(credential_id,account_id,public_key,created_at) VALUES ('key','test-account',X'01','2026-01-01')");
 await worker.scheduled({scheduledTime:now,cron:'0 * * * *'},{AUTH_CLEANUP_ENABLED:'true',DB:db});
 for(const table of tables){const row=(await sql(`SELECT SUM(CASE WHEN expires_at<=? THEN 1 ELSE 0 END) AS expired,SUM(CASE WHEN expires_at>? THEN 1 ELSE 0 END) AS live FROM ${table}`,[seconds,seconds])).results[0];assert.equal(row.expired,0,table);assert.equal(row.live,1,table);}
 for(const table of ['favorites','listening_history','recovery_emails','passkeys'])assert.equal((await sql(`SELECT COUNT(*) AS n FROM ${table}`)).results[0].n,1,table);
 console.log('Remote temporary D1: expired auth records removed, valid auth and account data preserved.');
}finally{if(id){await request(`/${id}`,'DELETE');console.log('Temporary test database deleted');}}
