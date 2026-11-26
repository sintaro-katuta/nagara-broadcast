import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeAuthRoutes} from '../cloudflare/auth-routes.mjs';
import worker from '../cloudflare/worker.mjs';
import {readFileSync} from 'node:fs';
import {makeEnrollment} from '../cloudflare/passkey-enrollment.mjs';
import {makeRecovery} from '../cloudflare/passkey-recovery.mjs';
import {makePasskeyLogin} from '../cloudflare/passkey-login.mjs';
import {verifySession} from '../cloudflare/sessions.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

test('recovery response does not wait for account lookup or delivery when a Worker context is available',async()=>{
 const db={prepare(){return {bind(_key,expiry){return {async first(){return {attempts:1,expires_at:expiry}}}}}}};
 let release;const pending=new Promise(resolve=>{release=resolve});let sent=0;const tasks=[];
 const recovery={async issue(){await pending;return {to:'synthetic@example.com',token:'a'.repeat(64)}}};
 const routes=makeAuthRoutes({recovery,sendRecovery:async()=>{sent++}});
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',EMAIL:{async send(){}}};
 const request=new Request(origin+'/api/auth/recovery/start',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({email:'synthetic@example.com'})});
 const response=await routes(request,env,{waitUntil(task){tasks.push(task)}});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});assert.equal(tasks.length,1);assert.equal(sent,0);
 release();await Promise.all(tasks);assert.equal(sent,1);
});

test('Worker forwards its execution context to email delivery',async(t)=>{
 const buckets=new Map(),db={prepare(){return {bind(id,expires){return {async first(){const n=(buckets.get(id)||0)+1;buckets.set(id,n);return {attempts:n,expires_at:expires}},async run(){return {success:true}}}}}}};
 let release;const pending=new Promise(resolve=>{release=resolve});const tasks=[];let requested=false;
 t.mock.method(globalThis,'fetch',async()=>{requested=true;await pending;return Response.json({id:'synthetic'})});
 const origin='https://radio.example',env={DB:db,AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'true',AUTH_NOTICES_ENABLED:'true',AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',RESEND_API_KEY:'re_test_key_12345'};
 const request=new Request(origin+'/api/auth/enroll/start',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({email:'synthetic@example.com'})});
 const response=await worker.fetch(request,env,{waitUntil(task){tasks.push(task)}});assert.equal(response.status,200);assert.equal(tasks.length,1);
 release();await Promise.all(tasks);assert.equal(requested,true);
});

test('background recovery errors do not change the response or expose details',async(t)=>{
 const db={prepare(){return {bind(_key,expiry){return {async first(){return {attempts:1,expires_at:expiry}}}}}}};
 const tasks=[],logged=[];t.mock.method(console,'error',value=>logged.push(value));
 const routes=makeAuthRoutes({recovery:{async issue(){throw new Error('sensitive test detail')}}});
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',EMAIL:{async send(){}}};
 const request=new Request(origin+'/api/auth/recovery/start',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({email:'synthetic@example.com'})});
 const response=await routes(request,env,{waitUntil(task){tasks.push(task)}});assert.deepEqual(await response.json(),{ok:true});await Promise.all(tasks);
 assert.deepEqual(logged,['Authentication email preparation failed']);
});

test('auth routes enforce origin, limit email requests and keep tokens in cookies',async()=>{
 const buckets=new Map(),db={prepare(){return {bind(id,expires){return {async first(){const n=(buckets.get(id)||0)+1;buckets.set(id,n);return {attempts:n,expires_at:expires}}}}}}};
 const calls=[],token='a'.repeat(64),session='__Host-nagara_session=abc; Path=/; Secure; HttpOnly; SameSite=Lax';
 const enrollment={async begin(_db,email){calls.push(['begin',email]);return token},async confirm(_db,value){return value===token?'b'.repeat(64):null},async options(_db,browser){return browser==='b'.repeat(64)?{challenge:'challenge'}:null},async finish(_db,browser,_origin,data){return browser==='b'.repeat(64)&&data.ok?session:null}};
 const recovery={async issue(){return null}};
 const routes=makeAuthRoutes({enrollment,recovery,sendEnroll:async(_binding,details)=>calls.push(['email',details.to]),sendRecovery:async()=>{throw new Error('should not send')}});
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin,AUTH_NOTICES_ENABLED:'true',AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',EMAIL:{async send(){}}};
 const request=(path,data,headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 assert.equal((await routes(request('/api/auth/enroll/start',{email:'u@example.com'},{Origin:'https://evil.example'}),env)).status,403);
 for(let i=0;i<4;i++)assert.equal((await routes(request('/api/auth/enroll/start',{email:'u@example.com'}),env)).status,200);
 assert.equal(calls.filter(x=>x[0]==='email').length,3);
 assert.deepEqual(await (await routes(request('/api/auth/recovery/start',{email:'unknown@example.com'}),env)).json(),{ok:true});
 const confirm=await routes(request('/api/auth/enroll/confirm',{token}),env),confirmBody=await confirm.json();
 assert.deepEqual(confirmBody,{ok:true});const browser=confirm.headers.get('Set-Cookie').split(';')[0];assert.match(browser,/^__Host-nagara_enroll=/);
 assert.deepEqual(await (await routes(request('/api/auth/enroll/options',{}, {Cookie:browser}),env)).json(),{challenge:'challenge'});
 const finish=await routes(request('/api/auth/enroll/finish',{ok:true},{Cookie:browser}),env);
 assert.equal(finish.status,200);assert.match(finish.headers.get('Set-Cookie'),/__Host-nagara_session=/);
 assert.equal((await routes(request('/api/auth/enroll/confirm',{token:'bad'}),env)).status,400);
 assert.equal((await routes(request('/api/auth/enroll/start',{email:'u@example.com'}),{...env,AUTH_RATE_KEY:'bad'})).status,503);
});

test('backup passkey routes stay disabled until notification configuration is ready',async()=>{
 const db={prepare(){return {bind(_key,expiry){return {async first(){return {attempts:1,expires_at:expiry}}}}}}};let called=0;
 const routes=makeAuthRoutes({registration:async()=>{called++;return Response.json({ok:true})}}),origin='https://radio.example';
 const env={DB:db,AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_ENCRYPTION_KEY:'02'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',EMAIL:{async send(){}},AUTH_NOTICES_ENABLED:'true'};
 const request=()=>new Request(origin+'/api/auth/passkey/register/reauth-options',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:'{}'});
 assert.equal((await routes(request(),env)).status,503);assert.equal((await routes(request(),{...env,PASSKEY_ADD_ENABLED:'true',AUTH_NOTICES_ENABLED:'false'})).status,503);
 assert.equal((await routes(request(),{...env,PASSKEY_ADD_ENABLED:'true'})).status,200);assert.equal(called,1);
});

test('public Worker does not expose passkey routes without the release flags',async()=>{
 const request=new Request('https://radio.example/api/auth/enroll/start',{method:'POST',headers:{Origin:'https://radio.example'}});
 const response=await worker.fetch(request,{AUTH_ENABLED:'false'});
 assert.equal(response.status,404);
 const status=await worker.fetch(new Request('https://radio.example/api/auth/status'),{AUTH_ENABLED:'false'});
 assert.deepEqual(await status.json(),{available:false,passkeyAddAvailable:false,adminSetupAvailable:false});
 const ready={AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'true',AUTH_NOTICES_ENABLED:'true',AUTH_ORIGIN:'https://radio.example',AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',RESEND_API_KEY:'re_test_key_12345'};
 assert.deepEqual(await (await worker.fetch(new Request('https://radio.example/api/auth/status'),ready)).json(),{available:true,passkeyAddAvailable:false,adminSetupAvailable:false});
 assert.deepEqual(await (await worker.fetch(new Request('https://radio.example/api/auth/status'),{...ready,PASSKEY_ADD_ENABLED:'true',ADMIN_BOOTSTRAP_ENABLED:'true'})).json(),{available:true,passkeyAddAvailable:true,adminSetupAvailable:true});
 assert.deepEqual(await (await worker.fetch(new Request('https://radio.example/api/auth/status'),{...ready,AUTH_LOOKUP_KEY:ready.AUTH_RATE_KEY})).json(),{available:false,passkeyAddAvailable:false,adminSetupAvailable:false});
 assert.deepEqual(await (await worker.fetch(new Request('https://radio.example/api/auth/status'),{...ready,AUTH_NOTICES_ENABLED:'false'})).json(),{available:false,passkeyAddAvailable:false,adminSetupAvailable:false});
 assert.deepEqual(await (await worker.fetch(new Request('https://radio.example/api/auth/status'),{...ready,RESEND_API_KEY:''})).json(),{available:false,passkeyAddAvailable:false,adminSetupAvailable:false});
});

test('registration, login and recovery integrate without sending real email',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const files=['../cloudflare/schema.sql',...Array.from({length:12},(_,i)=>['0001_account_data.sql','0002_identity_sessions.sql','0003_passkeys.sql','0004_recovery_email.sql','0005_passkey_login_attempts.sql','0006_recovery_tokens.sql','0007_auth_rate_limits.sql','0008_passkey_registration_attempts.sql','0009_passkey_enrollments.sql','0010_passkey_recovery_attempts.sql','0011_enrollment_challenge_expiry.sql','0012_account_auth_generations.sql'][i]).map(f=>'../cloudflare/migrations/'+f)];
 for(const file of [...files,'../cloudflare/migrations/0015_recovery_notice_outbox.sql'])sql.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const options=async()=>({challenge:'c'.repeat(43)}),verify=async(_origin,_challenge,response)=>({verified:response.valid===true,registrationInfo:{credential:{id:response.id,publicKey:new Uint8Array([1,2]),counter:0,transports:[]}}});
 const enrollment=makeEnrollment({options,verify}),recovery=makeRecovery({options,verify});
 const login=makePasskeyLogin({options,verify:async()=>({verified:true,authenticationInfo:{newCounter:0}})});
 const sent=[],routes=makeAuthRoutes({enrollment,recovery,login,sendEnroll:async(_b,details)=>sent.push(details),sendRecovery:async(_b,details)=>sent.push(details)});
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin,AUTH_NOTICES_ENABLED:'true',AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',EMAIL:{async send(){}}};
 const request=(path,data,cookie)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)});
 const getCookie=(response,name)=>response.headers.getSetCookie().find(s=>s.startsWith(name+'=')).split(';')[0];
 assert.equal((await routes(request('/api/auth/enroll/start',{email:'u@example.com'}),env)).status,200);
 const confirm=await routes(request('/api/auth/enroll/confirm',{token:sent[0].token}),env),enrollCookie=getCookie(confirm,'__Host-nagara_enroll');
 assert.equal((await routes(request('/api/auth/enroll/options',{},enrollCookie),env)).status,200);
 const finish=await routes(request('/api/auth/enroll/finish',{id:'first',valid:true},enrollCookie),env),oldSession=getCookie(finish,'__Host-nagara_session');
 assert.equal(finish.status,200);
 const loginStart=await routes(request('/api/auth/passkey/options',{}),env),loginCookie=getCookie(loginStart,'__Host-nagara_passkey_attempt');
 const loginFinish=await routes(request('/api/auth/passkey/verify',{id:'first'},loginCookie),env);
 assert.equal(loginFinish.status,200);
 assert.equal((await routes(request('/api/auth/recovery/start',{email:'u@example.com'}),env)).status,200);
 const recoveryConfirm=await routes(request('/api/auth/recovery/confirm',{token:sent[1].token}),env),recoveryCookie=getCookie(recoveryConfirm,'__Host-nagara_recovery');
 assert.equal((await routes(request('/api/auth/recovery/options',{},recoveryCookie),env)).status,200);
 assert.equal((await routes(request('/api/auth/recovery/finish',{id:'second',valid:true},recoveryCookie),{...env,AUTH_NOTICES_ENABLED:'false'})).status,503);
 const recovered=await routes(request('/api/auth/recovery/finish',{id:'second',valid:true},recoveryCookie),env);
 assert.equal(recovered.status,200);
 assert.equal(await verifySession(request('/api/account',{},oldSession),db),null);
 assert.ok(await verifySession(request('/api/account',{},getCookie(recovered,'__Host-nagara_session')),db));
 sql.close();
});
