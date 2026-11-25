import {randomBytes,randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,workerToken=process.env.CLOUDFLARE_API_TOKEN,d1Token=process.env.CLOUDFLARE_D1_WRITE_TOKEN,gate=process.env.NAGARA_STAGE_GATE;
const dbId='5de2882e-e9f5-45be-bf33-81eaab1c4c90',origin='https://nagara-auth-staging.sintaro-katuta.workers.dev';
if(!/^[a-f0-9]{32}$/i.test(account||'')||!workerToken||!d1Token||!/^[a-f0-9]{64}$/.test(gate||''))throw new Error('Missing test credentials');
const base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function cf(path,token,options={}){const res=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});const data=await res.json();if(!res.ok||!data.success)throw new Error(`Cloudflare request failed: ${res.status}`);return data.result;}
const db=await cf(`/d1/database/${dbId}`,d1Token);if(db.uuid!==dbId||db.name!=='nagara-auth-preview')throw new Error('Wrong database');
const stage=await cf('/workers/scripts/nagara-auth-staging/settings',workerToken),prod=await cf('/workers/scripts/nagara-broadcast/settings',workerToken);
const find=(s,n)=>s.bindings.find(x=>x.name===n);
if((find(stage,'DB')?.database_id||find(stage,'DB')?.id)!==dbId||find(stage,'PREVIEW_ONLY')?.text!=='true')throw new Error('Unsafe stage configuration');
const hasUsage=s=>find(s,'RESEND_USAGE_API_KEY')?.type==='secret_text';
console.log(JSON.stringify({productionUsageSecret:hasUsage(prod),stageUsageSecret:hasUsage(stage)}));
async function sql(query,params=[]){const result=await cf(`/d1/database/${dbId}/query`,d1Token,{method:'POST',body:JSON.stringify({sql:query,params})});if(result[0]?.success!==true)throw new Error('D1 test query failed');return result[0];}
const digest=s=>createHash('sha256').update(s).digest('hex');
const accounts=[`preview-admin-${randomUUID()}`,`preview-user-${randomUUID()}`],tokens=[randomBytes(32).toString('hex'),randomBytes(32).toString('hex')];
try{
 for(let i=0;i<accounts.length;i++){await sql('INSERT INTO accounts(id) VALUES (?)',[accounts[i]]);await sql('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)',[digest(tokens[i]),accounts[i],Math.floor(Date.now()/1000)+600]);}
 await sql('INSERT INTO account_admins(account_id) VALUES (?)',[accounts[0]]);
 const access=await fetch(origin+'/__preview/access',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({token:gate})});assert.equal(access.status,204);
 const stageCookie=access.headers.getSetCookie()[0].split(';')[0],cookie=i=>`${stageCookie}; __Host-nagara_session=${tokens[i]}`;
 const req=(path,headers)=>fetch(origin+path,{headers});
 assert.equal((await req('/api/admin/usage',{Cookie:stageCookie})).status,401);
 assert.equal((await req('/api/admin/usage',{Cookie:cookie(1)})).status,403);
 const accountResponse=await req('/api/account',{Cookie:cookie(0)});assert.equal(accountResponse.status,200);const admin=await accountResponse.json();assert.equal(admin.admin,true);
 assert.equal((await req('/api/admin/usage',{Cookie:cookie(0)})).status,409);
 const usageResponse=await req('/api/admin/usage',{Cookie:cookie(0),'X-Account-Session':admin.sessionTag});assert.equal(usageResponse.status,200);const usage=await usageResponse.json();
 assert.ok(Number.isFinite(usage.storage.bytes));assert.ok(Number.isInteger(usage.notices.waiting));assert.ok(Number.isInteger(usage.notices.blocked));
 if(!hasUsage(stage))assert.equal(usage.resend,null);
 console.log(JSON.stringify({unauthenticatedRejected:true,nonAdminRejected:true,staleSessionRejected:true,adminMetricsResponded:true,stageUsageAvailable:!!usage.resend}));
}finally{
 for(const id of accounts){if(!/^preview-(admin|user)-[a-f0-9-]{36}$/.test(id))throw new Error('Unsafe test account');await sql('DELETE FROM accounts WHERE id=?',[id]);}
 console.log('Synthetic test accounts removed');
}
