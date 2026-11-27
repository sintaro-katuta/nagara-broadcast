import {writeFile,readFile} from 'node:fs/promises';
import {previewConfig} from './auth-preview-config.mjs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,workerToken=process.env.CLOUDFLARE_API_TOKEN,readToken=process.env.CLOUDFLARE_D1_READ_TOKEN,writeToken=process.env.CLOUDFLARE_D1_WRITE_TOKEN;
const id='5de2882e-e9f5-45be-bf33-81eaab1c4c90',origin='https://nagara-auth-staging.sintaro-katuta.workers.dev';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!workerToken||!readToken||!writeToken)throw new Error('Missing staging configuration');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function request(path,token,options={}){
 const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`Staging validation failed (${response.status})`);return data.result;
}
const database=await request(`/d1/database/${id}`,readToken);
if(database.uuid!==id||database.name!=='nagara-auth-preview')throw new Error('Unexpected database');
const settings=await request('/workers/scripts/nagara-auth-staging/settings',workerToken),bindings=settings?.bindings;
if(!Array.isArray(bindings)||!bindings.some(x=>x.name==='DB'&&x.type==='d1'&&(x.database_id||x.id)===id)||!bindings.some(x=>x.name==='PREVIEW_ONLY'&&x.text==='true')||!bindings.some(x=>x.name==='AUTH_ORIGIN'&&x.text===origin))throw new Error('Existing worker is not isolated staging');
const secrets=await request('/workers/scripts/nagara-auth-staging/secrets',workerToken);
if(!Array.isArray(secrets)||!['PREVIEW_ACCESS_TOKEN','AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY','RESEND_API_KEY'].every(name=>secrets.some(x=>x.name===name)))throw new Error('Staging secret missing');
const query=async(sql,token=readToken)=>request(`/d1/database/${id}/query`,token,{method:'POST',body:JSON.stringify({sql})});
const eligible=await query("SELECT EXISTS (SELECT 1 FROM recovery_emails e JOIN passkeys p ON p.account_id=e.account_id LEFT JOIN account_admins a ON a.account_id=e.account_id WHERE a.account_id IS NULL) AS eligible");
if(eligible[0]?.results?.[0]?.eligible!==1)throw new Error('No existing regular test account available');
const table=await query("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='account_history_generations'");
if(table[0]?.results?.[0]?.n===0)await query(await readFile(new URL('../cloudflare/migrations/0018_history_generations.sql',import.meta.url),'utf8'),writeToken);
const config=previewConfig({databaseId:id,origin,expiresAt:String(Math.floor(Date.now()/1000)+86340)});
config.vars.ADMIN_BOOTSTRAP_ENABLED='false';config.vars.ADMIN_RECOVERY_ENABLED='false';
await writeFile('/tmp/nagara-mobile-stage.json',JSON.stringify(config),{mode:0o600});
console.log('Existing isolated staging and regular test account verified; configuration prepared.');
