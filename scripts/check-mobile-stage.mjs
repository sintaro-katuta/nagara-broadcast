const token=process.env.NAGARA_STAGE_GATE,origin='https://nagara-auth-staging.sintaro-katuta.workers.dev';
if(!/^[a-f0-9]{64}$/.test(token||''))throw new Error('Staging gate unavailable');
let gate;
for(let i=0;i<15;i++){
 gate=await fetch(origin+'/__preview/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(10000)});
 if(gate.status===204)break;
 await new Promise(resolve=>setTimeout(resolve,2000));
}
if(gate.status!==204)throw new Error(`Staging access failed (${gate.status})`);
const cookie=gate.headers.getSetCookie().find(value=>value.startsWith('__Host-nagara_preview='))?.split(';')[0];
if(!cookie)throw new Error('Staging cookie unavailable');
const response=await fetch(origin+'/api/auth/status',{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)});
const status=await response.json();if(!response.ok||status.available!==true||status.adminRecoveryAvailable!==false)throw new Error('Staging authentication not ready');
console.log('Staging gate and regular account recovery are available.');
