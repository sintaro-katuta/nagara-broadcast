import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import worker from '../cloudflare/worker.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

function registration(options,id,key,origin){
 const jwk=key.export({format:'jwk'}),cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
 const auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([0x45,0,0,0,0]),Buffer.alloc(16),Buffer.from([0,id.length]),id,cose]);
 const attestation=Buffer.concat([Buffer.from('a363666d74646e6f6e656761747453746d74a068617574684461746158','hex'),Buffer.from([auth.length]),auth]);
 const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false}));
 return {id:id.toString('base64url'),rawId:id.toString('base64url'),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),attestationObject:attestation.toString('base64url'),transports:['internal']}};
}
function assertion(options,id,privateKey,origin){
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin,crossOrigin:false}));
 const auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([5,0,0,0,1])]);
 const signature=sign('sha256',Buffer.concat([auth,createHash('sha256').update(client).digest()]),privateKey);
 return {id:id.toString('base64url'),rawId:id.toString('base64url'),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:signature.toString('base64url'),userHandle:null}};
}

test('Worker registration, login, data access and recovery use actual WebAuthn verification',{skip:!sqlite&&'node:sqlite unavailable'},async(t)=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const migrations=['0001_account_data.sql','0002_identity_sessions.sql','0003_passkeys.sql','0004_recovery_email.sql','0005_passkey_login_attempts.sql','0006_recovery_tokens.sql','0007_auth_rate_limits.sql','0008_passkey_registration_attempts.sql','0009_passkey_enrollments.sql','0010_passkey_recovery_attempts.sql','0011_enrollment_challenge_expiry.sql','0012_account_auth_generations.sql','0013_position_write_cursors.sql','0015_recovery_notice_outbox.sql'];
 for(const f of ['../cloudflare/schema.sql',...migrations.map(x=>'../cloudflare/migrations/'+x)])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 sql.exec("INSERT INTO episodes VALUES ('ep','title','tech','','',10,3,'2026-01-01','audio/ep')");
 const db={
  prepare(q){return {
   bind(...args){return {
    async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},
    async first(){return sql.prepare(q).get(...args)||null},
    async all(){return {results:sql.prepare(q).all(...args)}}
   }},
   async all(){return {results:sql.prepare(q).all()}}
  }},
  async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}
 };
 const messages=[],origin='https://radio.example',env={DB:db,AUTH_ENABLED:'true',PASSKEY_API_ENABLED:'true',AUTH_NOTICES_ENABLED:'true',AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',RESEND_API_KEY:'re_test_key_12345'};
 t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');messages.push(JSON.parse(options.body));return Response.json({id:'test-message'});});
 const post=(path,data,cookie)=>worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(data)}),env);
 const get=(path,cookie)=>worker.fetch(new Request(origin+path,{headers:{Cookie:cookie}}),env);
 const put=(path,data,cookie,tag)=>worker.fetch(new Request(origin+path,{method:'PUT',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-Account-Session':tag},body:JSON.stringify(data)}),env);
 const cookie=(response,name)=>response.headers.getSetCookie().find(x=>x.startsWith(name+'=')).split(';')[0];
 const first=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),firstId=Buffer.from('first-key');
 assert.equal((await post('/api/auth/enroll/start',{email:'u@example.com'})).status,200);
 const token=/#confirm-email=([a-f0-9]{64})/.exec(messages[0].text)[1];
 const confirm=await post('/api/auth/enroll/confirm',{token}),enrollCookie=cookie(confirm,'__Host-nagara_enroll');
 const options=await (await post('/api/auth/enroll/options',{},enrollCookie)).json();
 const finish=await post('/api/auth/enroll/finish',registration(options,firstId,first.publicKey,origin),enrollCookie),original=cookie(finish,'__Host-nagara_session');
 assert.equal(finish.status,200);const originalData=await (await get('/api/account',original)).json();
 assert.equal((await put('/api/account/favorite',{episodeId:'ep',enabled:true},original,originalData.sessionTag)).status,200);
 const loginOptionsResponse=await post('/api/auth/passkey/options',{}),loginCookie=cookie(loginOptionsResponse,'__Host-nagara_passkey_attempt'),loginOptions=await loginOptionsResponse.json();
 const signed=await post('/api/auth/passkey/verify',assertion(loginOptions,firstId,first.privateKey,origin),loginCookie);
 assert.equal(signed.status,200);
 assert.equal((await post('/api/auth/recovery/start',{email:'u@example.com'})).status,200);
 const recoveryToken=/#recover-account=([a-f0-9]{64})/.exec(messages[1].text)[1];
 const recoverConfirm=await post('/api/auth/recovery/confirm',{token:recoveryToken}),recoveryCookie=cookie(recoverConfirm,'__Host-nagara_recovery');
 const recoveryOptions=await (await post('/api/auth/recovery/options',{},recoveryCookie)).json(),second=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),secondId=Buffer.from('second-key');
 const recovered=await post('/api/auth/recovery/finish',registration(recoveryOptions,secondId,second.publicKey,origin),recoveryCookie);
 assert.equal(recovered.status,200);assert.equal((await get('/api/account',original)).status,401);
 const newCookie=cookie(recovered,'__Host-nagara_session'),newData=await (await get('/api/account',newCookie)).json();
 assert.equal((await put('/api/account/favorite',{episodeId:'ep',enabled:false},newCookie,originalData.sessionTag)).status,409);
 assert.equal((await put('/api/account/history',{episodeId:'ep',positionSeconds:40,writerId:'writer-1234567890',sequence:2},newCookie,newData.sessionTag)).status,200);
 assert.equal((await put('/api/account/history',{episodeId:'ep',positionSeconds:5,writerId:'writer-1234567890',sequence:1},newCookie,newData.sessionTag)).status,200);
 assert.equal((await (await get('/api/account',newCookie)).json()).history[0].position_seconds,40);
 const logout=tag=>worker.fetch(new Request(origin+'/api/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:newCookie,'X-Account-Session':tag}}),env);
 assert.equal((await logout(originalData.sessionTag)).status,409);
 assert.equal((await get('/api/account',newCookie)).status,200);
 assert.equal((await logout(newData.sessionTag)).status,200);
 assert.equal((await get('/api/account',newCookie)).status,401);
 sql.close();
});
