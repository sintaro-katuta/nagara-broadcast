import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const state=JSON.parse(await readFile('/tmp/nagara-history-state.json','utf8'));
if(!/^nagara-history-check-[a-f0-9]{32}$/.test(state.worker)||!/^[a-f0-9]{64}$/.test(state.access)||!Array.isArray(state.sessions)||state.sessions.length!==2||!state.sessions.every(x=>/^[a-f0-9]{64}$/.test(x)))throw new Error('Invalid temporary resource state');
const origin=`https://${state.worker}.sintaro-katuta.workers.dev`;
const call=(path,method,index,body,tag)=>fetch(origin+path,{method,headers:{Origin:origin,'X-Test-Access':state.access,...(index===null?{}:{Cookie:`__Host-nagara_session=${state.sessions[index]}`}),...(tag?{'X-Account-Session':tag}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
let response;for(let i=0;i<15;i++){response=await call('/api/account','GET',null);if(response.status!==404)break;await new Promise(resolve=>setTimeout(resolve,2000));}assert.equal(response.status,401);
const read=async index=>{const res=await call('/api/account','GET',index);assert.equal(res.status,200);return res.json();};
const body=(position,generation,sequence=1)=>({episodeId:'test-ep',positionSeconds:position,writerId:'test-writer-123456789',sequence,historyGeneration:generation});
let a=await read(0),b=await read(1);assert.equal(a.historyGeneration,0);assert.equal(b.historyGeneration,0);
assert.equal((await call('/api/account/history','PUT',0,body(10,0),a.sessionTag)).status,200);assert.equal((await call('/api/account/history','PUT',1,body(20,0),b.sessionTag)).status,200);
for(let i=0;i<5;i++){
 a=await read(0);const [write,clear]=await Promise.all([call('/api/account/history','PUT',0,body(15,a.historyGeneration,i+2),a.sessionTag),call('/api/account/history','DELETE',0,null,a.sessionTag)]);
 assert.ok([200,409].includes(write.status));assert.equal(clear.status,200);assert.deepEqual((await read(0)).history,[]);
}
a=await read(0);assert.equal((await call('/api/account/history','PUT',0,body(8,0,10),a.sessionTag)).status,409);assert.deepEqual((await read(0)).history,[]);
assert.equal((await read(1)).history[0].position_seconds,20);assert.equal((await call('/api/account/history','PUT',0,body(25,a.historyGeneration,11),a.sessionTag)).status,200);assert.equal((await read(0)).history[0].position_seconds,25);
console.log('Real Cloudflare Worker and D1: concurrent deletion, stale-write rejection and account isolation verified.');
