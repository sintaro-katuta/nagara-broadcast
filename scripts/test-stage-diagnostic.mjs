const origin='https://nagara-auth-staging.sintaro-katuta.workers.dev';
const token=process.env.NAGARA_STAGE_GATE;
if(!/^[a-f0-9]{64}$/.test(token||''))throw new Error('Missing gate');
const access=await fetch(origin+'/__preview/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token})});
if(access.status!==204)throw new Error(`Access failed: ${access.status}`);
const cookie=access.headers.getSetCookie()[0].split(';')[0];
const response=await fetch(origin+'/__preview/resend-diagnostic',{method:'POST',headers:{Origin:origin,Cookie:cookie}});
if(!response.ok)throw new Error(`Diagnostic failed: ${response.status}`);
console.log(JSON.stringify(await response.json()));
