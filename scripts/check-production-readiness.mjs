const account=process.env.CLOUDFLARE_ACCOUNT_ID,workerToken=process.env.CLOUDFLARE_API_TOKEN,d1Token=process.env.CLOUDFLARE_D1_READ_TOKEN;
if(!/^[a-f0-9]{32}$/i.test(account||'')||!workerToken||!d1Token)throw new Error('Missing read-only inspection configuration');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`,dbId='27cb398e-0c26-4740-804d-f6bd49f75764';
async function request(path,token,options={}){
 const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>null);if(!response.ok||!body?.success)throw new Error(`Read-only inspection failed (${response.status})`);return body.result;
}
const settings=await request('/workers/scripts/nagara-broadcast/settings',workerToken),bindings=settings?.bindings;
if(!Array.isArray(bindings))throw new Error('Worker settings unavailable');
const dbCorrect=bindings.some(x=>x.name==='DB'&&x.type==='d1'&&(x.database_id||x.id)===dbId);
const vars=Object.fromEntries(['AUTH_ENABLED','PASSKEY_API_ENABLED','PASSKEY_ADD_ENABLED','ADMIN_BOOTSTRAP_ENABLED','ADMIN_RECOVERY_ENABLED','AUTH_NOTICES_ENABLED','AUTH_CLEANUP_ENABLED','POSITION_CURSOR_CLEANUP_ENABLED'].map(name=>[name,bindings.find(x=>x.name===name)?.text??null]));
const originCorrect=bindings.some(x=>x.name==='AUTH_ORIGIN'&&x.text==='https://nagara-broadcast.sintaro-katuta.com');
const senderCorrect=bindings.some(x=>x.name==='AUTH_EMAIL_FROM'&&x.text==='no-reply@mail.nagara-broadcast.sintaro-katuta.com');
const secrets=await request('/workers/scripts/nagara-broadcast/secrets',workerToken);
if(!Array.isArray(secrets))throw new Error('Worker secret names unavailable');
const present=Object.fromEntries(['AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY','RESEND_API_KEY','RESEND_USAGE_API_KEY'].map(name=>[name,secrets.some(x=>x.name===name)]));
const result=await request(`/d1/database/${dbId}/query`,d1Token,{method:'POST',body:JSON.stringify({sql:'SELECT EXISTS (SELECT 1 FROM account_admins) AS admin_exists'})});
const adminExists=result[0]?.results?.[0]?.admin_exists;if(![0,1].includes(adminExists))throw new Error('Administrator aggregate unavailable');
console.log(JSON.stringify({dbCorrect,originCorrect,senderCorrect,flags:vars,secretsPresent:present,adminExists:!!adminExists},null,2));
