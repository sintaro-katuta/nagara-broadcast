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
