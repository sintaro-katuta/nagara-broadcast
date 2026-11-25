import {readFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_D1_WRITE_TOKEN,state=JSON.parse(await readFile('/tmp/nagara-background-state.json','utf8'));
if(!/^[a-f0-9]{32}$/i.test(account||'')||!token||!/^nagara-auth-check-[a-f0-9]{32}$/.test(state.worker)||!/^nagara-auth-check-db-[a-f0-9]{32}$/.test(state.name)||!/^[-a-f0-9]{36}$/i.test(state.id)||!/^[a-f0-9]{64}$/.test(state.access))throw new Error('Invalid temporary resource state');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${state.id}/query`;
const count=async()=>{const res=await fetch(base,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql:"SELECT COUNT(*) AS n FROM events WHERE name='completed'"})});const body=await res.json();if(!res.ok||!body.success)throw new Error('Cannot inspect synthetic result');return body.result[0].results[0].n;};
let response,start;for(let i=0;i<15;i++){start=Date.now();response=await fetch(`https://${state.worker}.sintaro-katuta.workers.dev/probe`,{headers:{'X-Test-Access':state.access}});if(response.status!==404)break;await new Promise(resolve=>setTimeout(resolve,2000));}
if(!response.ok||(await response.json()).ok!==true||Date.now()-start>=4000)throw new Error('Public response did not return promptly');
if(await count()!==0)throw new Error('Background task finished before response');
const deadline=Date.now()+15000;while(Date.now()<deadline){if(await count()===1){console.log('Cloudflare Worker returned before account lookup and completed the background task after the response.');process.exit(0);}await new Promise(resolve=>setTimeout(resolve,1000));}
throw new Error('Background task did not finish');
