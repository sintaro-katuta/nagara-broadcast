const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token)throw new Error('Cloudflare configuration unavailable');
const base='https://api.cloudflare.com/client/v4';
async function api(path,options={}){
 const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.success)throw new Error(`Cloudflare DNS permission or configuration unavailable (HTTP ${response.status})`);
 return data.result;
}
const zones=await api('/zones?name=sintaro-katuta.com&status=active');
const matches=zones.filter(x=>x.name==='sintaro-katuta.com'&&x.account?.id===account);
if(matches.length!==1)throw new Error('Expected active domain is not accessible');
const zone=matches[0].id,name='mail.nagara-broadcast.sintaro-katuta.com',target='receive.forge.rmta.net';
const records=await api(`/zones/${zone}/dns_records?type=MX&name=${encodeURIComponent(name)}`);
if(records.some(x=>x.name!==name||x.type!=='MX'||x.content!==target||x.priority!==10))throw new Error('An existing MX conflicts; no changes made');
if(records.length>1)throw new Error('Duplicate MX records require manual review');
if(records.length===0)await api(`/zones/${zone}/dns_records`,{method:'POST',body:JSON.stringify({type:'MX',name,content:target,priority:10,ttl:1})});
const after=await api(`/zones/${zone}/dns_records?type=MX&name=${encodeURIComponent(name)}`);
if(after.length!==1||after[0].content!==target||after[0].priority!==10)throw new Error('MX verification failed');
console.log('Resend support inbox MX is configured.');
