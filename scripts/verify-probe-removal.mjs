const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare configuration missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`,headers={Authorization:`Bearer ${token}`};
for(const path of ['/scripts/nagara-probe-45613830144/settings','/workers/nagara-probe-45613830144']){
 const response=await fetch(base+path,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 console.log(`${path.startsWith('/scripts/')?'script':'worker'} HTTP ${response.status}, success ${data?.success===true}, codes ${Array.isArray(data?.errors)?data.errors.map(x=>x.code).join(','):''}`);
}
