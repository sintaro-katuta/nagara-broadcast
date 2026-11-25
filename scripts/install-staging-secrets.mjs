import {randomBytes} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,gate=process.env.NAGARA_STAGE_GATE;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token||!/^[a-f0-9]{64}$/.test(gate||''))throw new Error('Staging configuration missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/nagara-auth-staging`,headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function request(path,options={}){const response=await fetch(base+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`Staging settings request failed (HTTP ${response.status})`);return data.result;}
const settings=await request('/settings'),bindings=settings?.bindings;
if(!Array.isArray(bindings)||!bindings.some(x=>x.name==='DB'&&x.type==='d1'&&(x.database_id||x.id)==='5de2882e-e9f5-45be-bf33-81eaab1c4c90')||!bindings.some(x=>x.name==='PREVIEW_ONLY'&&x.text==='true')||!bindings.some(x=>x.name==='AUTH_ORIGIN'&&x.text==='https://nagara-auth-staging.sintaro-katuta.workers.dev'))throw new Error('Staging isolation check failed');
const names=['AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY','PREVIEW_ACCESS_TOKEN'];
const list=await request('/secrets');if(!Array.isArray(list)||names.some(name=>list.some(x=>x.name===name)))throw new Error('Staging secrets already exist; stop to avoid replacing them');
for(const name of names){
 const value=name==='PREVIEW_ACCESS_TOKEN'?gate:randomBytes(32).toString('hex');
 await request('/secrets',{method:'PUT',body:JSON.stringify({name,text:value,type:'secret_text'})});
 console.log(`${name} installed in staging`);
}
