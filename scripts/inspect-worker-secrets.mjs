const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare configuration missing');
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/nagara-broadcast/secrets`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(10000)});
if(!response.ok)throw new Error(`Unable to inspect secret names (HTTP ${response.status})`);
const data=await response.json();if(!data.success||!Array.isArray(data.result))throw new Error('Invalid Cloudflare response');
const names=new Set(data.result.map(x=>x.name));
for(const name of ['RESEND_API_KEY','RESEND_USAGE_API_KEY','AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY'])console.log(`${name}: ${names.has(name)?'configured':'not configured'}`);
