const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_READ_TOKEN,id='5de2882e-e9f5-45be-bf33-81eaab1c4c90';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('D1 configuration missing');
const query="SELECT (SELECT COUNT(*) FROM passkey_enrollments) AS registrations, (SELECT COUNT(*) FROM auth_rate_limits) AS rate_buckets, (SELECT COUNT(*) FROM accounts) AS accounts";
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql:query}),redirect:'error',signal:AbortSignal.timeout(10000)});
if(!response.ok)throw new Error(`D1 inspection failed (HTTP ${response.status})`);
const result=await response.json();if(!result?.success||!result.result?.[0]?.results?.[0])throw new Error('D1 inspection returned invalid data');
const {registrations,rate_buckets,accounts}=result.result[0].results[0];console.log(JSON.stringify({registrations,rate_buckets,accounts}));
