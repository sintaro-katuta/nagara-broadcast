// One-time setup for the production Worker. Never prints secret values.
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const names=['AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY'];
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare configuration missing');
const values=names.map(name=>process.env[name]);
if(values.some(value=>!/^([a-f0-9]{64})$/i.test(value||''))||new Set(values.map(x=>x.toLowerCase())).size!==3)throw new Error('Three distinct 32-byte secrets are required');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/nagara-broadcast/secrets`;
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const settingsResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/nagara-broadcast/settings`,{headers,signal:AbortSignal.timeout(10000),redirect:'error'});
if(!settingsResponse.ok)throw new Error(`Cannot inspect Worker settings (HTTP ${settingsResponse.status})`);
const settings=await settingsResponse.json();if(!settings.success||!Array.isArray(settings.result?.bindings))throw new Error('Cannot inspect Worker bindings');
for(const name of ['AUTH_ENABLED','PASSKEY_API_ENABLED','AUTH_NOTICES_ENABLED']){
 const binding=settings.result.bindings.find(item=>item.name===name);
 if(binding&&(binding.type!=='plain_text'||binding.text==='true'))throw new Error(`${name} may be enabled; stop before changing keys`);
}
const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(10000),redirect:'error'});
if(!response.ok)throw new Error(`Cannot inspect Worker secrets (HTTP ${response.status})`);
const list=await response.json();if(!list.success||!Array.isArray(list.result))throw new Error('Cannot inspect Worker secrets');
if(names.some(name=>list.result.some(item=>item.name===name)))throw new Error('An authentication key already exists; stop to avoid replacing it');
for(let i=0;i<names.length;i++){
 const result=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({name:names[i],text:values[i],type:'secret_text'}),signal:AbortSignal.timeout(10000),redirect:'error'});
 const data=await result.json().catch(()=>null);
 if(!result.ok||!data?.success)throw new Error(`Unable to install ${names[i]} (HTTP ${result.status}); stop and inspect existing secrets before retrying`);
 console.log(`${names[i]} installed`);
}
