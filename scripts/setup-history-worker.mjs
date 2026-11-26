import {randomUUID,randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Missing test configuration');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`,nonce=randomUUID().replaceAll('-',''),worker=`nagara-history-check-${nonce}`,name=`nagara-history-check-db-${nonce}`;
async function request(path='',method='GET',body){const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const json=await res.json().catch(()=>null);if(!res.ok||!json?.success)throw new Error(`D1 setup failed (${res.status})`);return json.result;}
const created=await request('','POST',{name});if(created?.name!==name||!/^[-a-f0-9]{36}$/i.test(created.uuid||''))throw new Error('Unexpected temporary database');
const id=created.uuid,access=randomBytes(32).toString('hex'),sessions=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')],hash=s=>createHash('sha256').update(s).digest('hex');
await writeFile('/tmp/nagara-history-state.json',JSON.stringify({worker,name,id,access,sessions}),{mode:0o600});
async function sql(query,params=[]){const result=await request(`/${id}/query`,'POST',{sql:query,params});if(result[0]?.success!==true)throw new Error('D1 fixture failed');}
const migrations=(await readdir(new URL('../cloudflare/migrations/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort();
for(const path of [new URL('../cloudflare/schema.sql',import.meta.url),...migrations.map(x=>new URL('../cloudflare/migrations/'+x,import.meta.url))])await sql(await readFile(path,'utf8'));
await sql("INSERT INTO accounts(id) VALUES ('synthetic-a'),('synthetic-b')");await sql("INSERT INTO episodes VALUES ('test-ep','test','tech','','',30,10,'2026-01-01','test/audio')");
const expires=Math.floor(Date.now()/1000)+600;for(let i=0;i<2;i++)await sql('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)',[hash(sessions[i]),i?'synthetic-b':'synthetic-a',expires]);
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
await sql('INSERT INTO passkeys VALUES (?,?,?,?,?,?)',[Buffer.from('original').toString('base64url'),'synthetic-a',Array.from(cose),0,'[]','2026-01-01']);
await sql("INSERT INTO recovery_emails VALUES ('synthetic-a','test-lookup','not-a-real-email','2026-01-01')");
await writeFile('/tmp/nagara-history-state.json',JSON.stringify({worker,name,id,access,sessions,privateKey:pair.privateKey.export({format:'pem',type:'pkcs8'})}),{mode:0o600});
const origin=`https://${worker}.sintaro-katuta.workers.dev`;
const config={name:worker,main:fileURLToPath(new URL('./history-test-worker.mjs',import.meta.url)),compatibility_date:'2026-10-20',workers_dev:true,vars:{TEST_HASH:hash(access),AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'true',PASSKEY_ADD_ENABLED:'true',AUTH_NOTICES_ENABLED:'true',AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'no-reply@example.com',RESEND_API_KEY:'re_test_synthetic_12345'},d1_databases:[{binding:'DB',database_name:name,database_id:id}]};
await writeFile('/tmp/nagara-history-config.json',JSON.stringify(config),{mode:0o600});console.log('Temporary history test Worker and D1 prepared.');
