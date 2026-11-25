const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare configuration missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`,headers={Authorization:`Bearer ${token}`};
for(const [label,path] of [['worker','/scripts/nagara-broadcast/subdomain'],['account','/subdomain']]){
 const response=await fetch(base+path,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.success){console.log(`${label}: unavailable (HTTP ${response.status})`);continue;}
 if(label==='worker')console.log(JSON.stringify({worker:label,enabled:data.result?.enabled,previews_enabled:data.result?.previews_enabled}));
 else console.log(JSON.stringify({worker:label,subdomain:data.result?.subdomain}));
}
const settings=await fetch(base+'/scripts/nagara-broadcast/settings',{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
const json=await settings.json().catch(()=>null);
if(!settings.ok||!json?.success||!Array.isArray(json.result?.bindings))throw new Error('Worker settings unavailable');
const bindings=json.result.bindings;
for(const [name,expected] of [['AUTH_ORIGIN','https://nagara-broadcast.sintaro-katuta.com'],['AUTH_EMAIL_FROM','no-reply@mail.nagara-broadcast.sintaro-katuta.com'],['AUTH_ENABLED','false'],['PASSKEY_API_ENABLED','false'],['AUTH_NOTICES_ENABLED','false']]){
 const item=bindings.find(b=>b.name===name);console.log(`${name}: ${item?.type==='plain_text'&&item.text===expected?'matches':'not matching'}`);
}
for(const name of ['RESEND_API_KEY','AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY'])console.log(`${name}: ${bindings.some(x=>x.name===name&&x.type==='secret_text')?'present':'not present'}`);
