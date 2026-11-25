import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeStagingGate} from '../cloudflare/staging-gate.mjs';

test('test environment requires an unexpired, origin-bound access secret',async()=>{
 let calls=0;const app={fetch:async()=>{calls++;return new Response('ok',{headers:{'Cache-Control':'public, max-age=600'}});}};
 const gate=makeStagingGate(app,()=>1000000),token='a'.repeat(64),origin='https://test.example',env={PREVIEW_ACCESS_TOKEN:token,PREVIEW_EXPIRES_AT:'1100',PREVIEW_ONLY:'true',AUTH_ORIGIN:origin};
 const get=(cookie='')=>new Request(origin+'/api/account',{headers:{Cookie:cookie}});
 const post=(value,requestOrigin=origin)=>new Request(origin+'/__preview/access',{method:'POST',headers:{Origin:requestOrigin,'Content-Type':'application/json'},body:JSON.stringify({token:value})});
 assert.equal((await gate.fetch(get(),env)).status,401);assert.equal(calls,0);
 assert.equal((await gate.fetch(post(token,'https://evil.example'),env)).status,403);
 assert.equal((await gate.fetch(post('b'.repeat(64)),env)).status,403);
 const access=await gate.fetch(post(token),env);assert.equal(access.status,204);assert.match(access.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 const request=get(access.headers.get('set-cookie').split(';')[0]);const result=await gate.fetch(request,env);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(calls,1);
 assert.equal((await gate.fetch(request,{...env,PREVIEW_EXPIRES_AT:'999'})).status,503);
 assert.equal((await gate.fetch(request,{...env,PREVIEW_ACCESS_TOKEN:undefined})).status,503);
 assert.equal((await gate.fetch(request,{...env,PREVIEW_ONLY:'false'})).status,503);
 assert.equal((await gate.fetch(request,{...env,AUTH_ORIGIN:'https://another.example'})).status,503);
 assert.equal((await gate.fetch(new Request('https://nagara-broadcast.sintaro-katuta.com/'),{...env,AUTH_ORIGIN:'https://nagara-broadcast.sintaro-katuta.com'})).status,503);
});
