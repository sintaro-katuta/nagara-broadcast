import {readFile} from 'node:fs/promises';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,d1=process.env.CLOUDFLARE_D1_WRITE_TOKEN,workerToken=process.env.CLOUDFLARE_API_TOKEN;
let state;try{state=JSON.parse(await readFile('/tmp/nagara-cleanup-state.json','utf8'));}catch{console.log('No temporary resources recorded');process.exit(0);}
if(!/^[a-f0-9]{32}$/i.test(account||'')||!d1||!workerToken||!/^nagara-cleanup-check-[a-f0-9]{32}$/.test(state.worker)||!/^nagara-cleanup-db-[a-f0-9]{32}$/.test(state.name)||!/^[-a-f0-9]{36}$/i.test(state.id)||state.worker.slice(-32)!==state.name.slice(-32))throw new Error('Invalid temporary resource state');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function request(path,token,method){const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});const body=await res.json().catch(()=>null);return {res,body};}
const detail=await request(`/d1/database/${state.id}`,d1,'GET');if(!detail.res.ok||detail.body?.result?.name!==state.name||detail.body?.result?.uuid!==state.id)throw new Error('Temporary database identity check failed');
const script=await request(`/workers/scripts/${state.worker}`,workerToken,'DELETE');if(!script.res.ok&&script.res.status!==404)throw new Error(`Temporary Worker cleanup failed (${script.res.status})`);
const db=await request(`/d1/database/${state.id}`,d1,'DELETE');if(!db.res.ok||!db.body?.success)throw new Error('Temporary database cleanup failed');
console.log('Temporary Cron Worker and isolated test database deleted.');
