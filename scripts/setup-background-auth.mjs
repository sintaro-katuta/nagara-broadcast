import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Missing test configuration');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,nonce=randomUUID().replaceAll('-',''),worker=`nagara-auth-check-${nonce}`,name=`nagara-auth-check-db-${nonce}`;
async function request(path='',method='GET',body){const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const json=await res.json().catch(()=>null);if(!res.ok||!json?.success)throw new Error(`D1 setup failed (${res.status})`);return json.result;}
const created=await request('','POST',{name});if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created.uuid||''))throw new Error('Unexpected temporary database');
const id=created.uuid,access=randomBytes(32).toString('hex');await writeFile('/tmp/nagara-background-state.json',JSON.stringify({worker,name,id,access}),{mode:0o600});
const result=await request(`/${id}/query`,'POST',{sql:'CREATE TABLE events (name TEXT NOT NULL)'});if(!result[0]?.success)throw new Error('Fixture setup failed');
const config={name:worker,main:fileURLToPath(new URL('./background-auth-worker.mjs',import.meta.url)),compatibility_date:'2026-10-20',workers_dev:true,vars:{TEST_HASH:createHash('sha256').update(access).digest('hex')},d1_databases:[{binding:'STATE',database_name:name,database_id:id}]};
await writeFile('/tmp/nagara-background-config.json',JSON.stringify(config),{mode:0o600});console.log('Temporary background-auth test prepared.');
