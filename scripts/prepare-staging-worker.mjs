import {writeFile} from 'node:fs/promises';
import {previewConfig} from './auth-preview-config.mjs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,workerToken=process.env.CLOUDFLARE_API_TOKEN,d1Token=process.env.CLOUDFLARE_D1_READ_TOKEN;
const id='5de2882e-e9f5-45be-bf33-81eaab1c4c90',name='nagara-auth-preview';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!workerToken||!d1Token)throw new Error('Cloudflare configuration missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function request(path,token,options={}){
 const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);return {response,data};
}
const existing=await request('/workers/scripts/nagara-auth-staging/settings',workerToken);
if(existing.response.status!==404||!existing.data?.errors?.some(error=>error.code===10007))throw new Error('Staging Worker already exists or cannot be inspected; stop to prevent overwrite');
const database=await request(`/d1/database/${id}`,d1Token);
if(!database.response.ok||!database.data?.success||database.data.result?.uuid!==id||database.data.result?.name!==name)throw new Error('Expected staging database not found');
const check=await request(`/d1/database/${id}/query`,d1Token,{method:'POST',body:JSON.stringify({sql:'SELECT (SELECT COUNT(*) FROM episodes) AS episodes, (SELECT COUNT(*) FROM accounts) AS accounts'})});
if(!check.response.ok||!check.data?.success||check.data.result?.[0]?.results?.[0]?.episodes!==0||check.data.result?.[0]?.results?.[0]?.accounts!==0)throw new Error('Staging database is not empty or not initialized');
const config=previewConfig({databaseId:id,origin:'https://nagara-auth-staging.sintaro-katuta.workers.dev',expiresAt:String(Math.floor(Date.now()/1000)+86400)});
await writeFile('/tmp/nagara-auth-staging.json',JSON.stringify(config),{mode:0o600});
console.log('Isolated empty D1 verified; staging configuration prepared.');
