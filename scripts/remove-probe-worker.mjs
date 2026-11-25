const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare configuration missing');
// This is the disposable Worker created by the earlier permission check.
const name='nagara-probe-45613830144';
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${name}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(10000)});
const data=await response.json().catch(()=>null);
if(!response.ok||!data?.success)throw new Error(`Unable to remove the test Worker (HTTP ${response.status})`);
console.log('Disposable test Worker removed.');
