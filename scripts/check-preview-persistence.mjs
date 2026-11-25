const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_READ_TOKEN,id='5de2882e-e9f5-45be-bf33-81eaab1c4c90';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Read-only credentials unavailable');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${id}`;
async function request(path,options={}){const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});const body=await response.json();if(!response.ok||!body.success)throw new Error('Isolated database inspection failed');return body.result;}
const db=await request('');if(db.uuid!==id||db.name!=='nagara-auth-preview')throw new Error('Wrong database');
const sql="SELECT (SELECT COUNT(*) FROM auth_rate_limits WHERE attempts>=3 AND expires_at>unixepoch() AND expires_at-unixepoch()>300) AS limited_long_windows, (SELECT COALESCE(MIN(expires_at-unixepoch()),0) FROM auth_rate_limits WHERE attempts>=3 AND expires_at>unixepoch() AND expires_at-unixepoch()>300) AS shortest_remaining_seconds, (SELECT COUNT(*) FROM recovery_emails) AS recovery_addresses, (SELECT COUNT(*) FROM account_admins) AS admins, (SELECT COUNT(*) FROM recovery_tokens WHERE expires_at>unixepoch()) AS unexpired_recovery_tokens";
const result=await request('/query',{method:'POST',body:JSON.stringify({sql})});
const row=result[0]?.results?.[0];if(!row)throw new Error('No aggregate result');console.log(JSON.stringify(row));
