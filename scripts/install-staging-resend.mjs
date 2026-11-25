const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,key=process.env.NAGARA_STAGE_RESEND_KEY;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token||!/^re_[A-Za-z0-9_-]{10,250}$/.test(key||''))throw new Error('Staging email key or Cloudflare configuration is missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/nagara-auth-staging`,headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
async function request(path,options={}){const response=await fetch(base+path,{...options,headers,redirect:'error',signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>null);if(!response.ok||!data?.success)throw new Error(`Staging settings request failed (HTTP ${response.status})`);return data.result;}
const settings=await request('/settings'),bindings=settings?.bindings;
if(!Array.isArray(bindings)||!bindings.some(x=>x.name==='DB'&&x.type==='d1'&&(x.database_id||x.id)==='5de2882e-e9f5-45be-bf33-81eaab1c4c90')||!bindings.some(x=>x.name==='PREVIEW_ONLY'&&x.text==='true')||!bindings.some(x=>x.name==='AUTH_ORIGIN'&&x.text==='https://nagara-auth-staging.sintaro-katuta.workers.dev'))throw new Error('Staging isolation check failed');
const names=await request('/secrets');
if(!Array.isArray(names)||names.some(x=>x.name==='RESEND_API_KEY'))throw new Error('Staging email key already exists; stop to avoid replacing it');
if(!['PREVIEW_ACCESS_TOKEN','AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY'].every(name=>names.some(x=>x.name===name)))throw new Error('Required staging secrets are missing');
await request('/secrets',{method:'PUT',body:JSON.stringify({name:'RESEND_API_KEY',text:key,type:'secret_text'})});
console.log('Email sending key installed on isolated staging Worker.');
