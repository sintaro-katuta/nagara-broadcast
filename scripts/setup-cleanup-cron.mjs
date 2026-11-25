import {randomUUID} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Missing test configuration');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,nonce=randomUUID().replaceAll('-',''),worker=`nagara-cleanup-check-${nonce}`,name=`nagara-cleanup-db-${nonce}`;
async function request(path='',method='GET',body){const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const json=await res.json().catch(()=>null);if(!res.ok||!json?.success)throw new Error(`D1 setup failed (${res.status})`);return json.result;}
const created=await request('','POST',{name});if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created.uuid||''))throw new Error('Unexpected temporary database');
const id=created.uuid;await writeFile('/tmp/nagara-cleanup-state.json',JSON.stringify({worker,name,id}),{mode:0o600});
async function sql(query,params=[]){const result=await request(`/${id}/query`,'POST',{sql:query,params});if(result[0]?.success!==true)throw new Error('D1 fixture failed');}
const migrations=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
for(const path of [new URL('../cloudflare/schema.sql',import.meta.url),...migrations.map(x=>new URL('../cloudflare/migrations/'+x,import.meta.url))])await sql(await readFile(path,'utf8'));
const now=Math.floor(Date.now()/1000);await sql('INSERT INTO auth_rate_limits(bucket_key,attempts,expires_at) VALUES (?,?,?),(?,?,?)',['expired-fixture',1,now-1,'live-fixture',1,now+1800]);
const config={name:worker,main:fileURLToPath(new URL('./cleanup-cron-worker.mjs',import.meta.url)),compatibility_date:'2026-10-20',workers_dev:false,triggers:{crons:['* * * * *']},d1_databases:[{binding:'DB',database_name:name,database_id:id}]};
await writeFile('/tmp/nagara-cleanup-config.json',JSON.stringify(config),{mode:0o600});console.log('Temporary database and synthetic records prepared.');
