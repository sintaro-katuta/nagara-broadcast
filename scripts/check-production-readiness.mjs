const account=process.env.CLOUDFLARE_ACCOUNT_ID,d1=process.env.CLOUDFLARE_D1_READ_TOKEN,worker=process.env.CLOUDFLARE_API_TOKEN,id='27cb398e-0c26-4740-804d-f6bd49f75764';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!d1||!worker)throw new Error('Read-only configuration missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function request(path,token,options={}){const res=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});const data=await res.json();if(!res.ok||!data.success)throw new Error(`Read-only request failed: ${res.status}`);return data.result;}
const db=await request(`/d1/database/${id}`,d1);if(db.uuid!==id||db.name!=='yorimichi-radio-db')throw new Error('Unexpected production database');
const sql='SELECT (SELECT COUNT(*) FROM accounts) AS accounts,(SELECT COUNT(*) FROM account_admins) AS admins';
const result=await request(`/d1/database/${id}/query`,d1,{method:'POST',body:JSON.stringify({sql})});
const settings=await request('/workers/scripts/nagara-broadcast/settings',worker),find=n=>settings.bindings.find(x=>x.name===n);
const row=result[0]?.results?.[0];if(!row)throw new Error('Missing aggregate result');
console.log(JSON.stringify({accounts:row.accounts,admins:row.admins,authEnabled:find('AUTH_ENABLED')?.text==='true',cleanupEnabled:find('AUTH_CLEANUP_ENABLED')?.text==='true',usageKeyPresent:find('RESEND_USAGE_API_KEY')?.type==='secret_text'}));
