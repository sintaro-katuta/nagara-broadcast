import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {makePasskeyLogin} from '../cloudflare/passkey-login.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

test('login binds a one-use challenge to the browser and issues a session only after verification',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0005_passkey_login_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts VALUES ('a'); INSERT INTO passkeys VALUES ('credential','a',x'0102',2,'[]','2026-01-01')");
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const env={DB:db,AUTH_ORIGIN:'https://radio.example'},challenge='a'.repeat(43);let checked=0;
 const login=makePasskeyLogin({options:async()=>({challenge}),verify:async(origin,expected,response,credential)=>{
  checked++;assert.equal(origin,env.AUTH_ORIGIN);assert.equal(expected,challenge);assert.equal(credential.counter,2);
  return {verified:response.valid===true,authenticationInfo:{newCounter:3}};
 }});
 const req=(path,body,headers={})=>new Request(env.AUTH_ORIGIN+path,{method:'POST',headers:{Origin:env.AUTH_ORIGIN,'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await login(req('/api/auth/passkey/options',{}, {Origin:'https://evil.example'}),env)).status,403);
 const start=await login(req('/api/auth/passkey/options',{}),env),cookie=start.headers.get('Set-Cookie').split(';')[0];
 assert.equal((await login(req('/api/auth/passkey/verify',{id:'credential',valid:true}),env)).status,401);
 const finish=await login(req('/api/auth/passkey/verify',{id:'credential',valid:true},{Cookie:cookie}),env);
 assert.equal(finish.status,200);assert.match(finish.headers.get('Set-Cookie'),/__Host-nagara_session=/);assert.equal(checked,1);
 assert.equal(sql.prepare('SELECT sign_count FROM passkeys').get().sign_count,3);
 assert.equal((await login(req('/api/auth/passkey/verify',{id:'credential',valid:true},{Cookie:cookie}),env)).status,401);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n,1);
 sql.close();
});

test('login verifies an actual signed assertion before issuing a session',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0005_passkey_login_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts VALUES ('a')");
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
 const cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
 sql.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?)').run('Y3JlZA','a',cose,0,'[]','2026-01-01');
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin},login=makePasskeyLogin();
 const req=(path,body,cookie)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const start=await login(req('/api/auth/passkey/options',{}),env),options=await start.json(),cookie=start.headers.get('Set-Cookie').split(';')[0];
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:options.challenge,origin,crossOrigin:false}));
 const auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([5,0,0,0,1])]);
 const sig=sign('sha256',Buffer.concat([auth,createHash('sha256').update(client).digest()]),privateKey);
 const response={id:'Y3JlZA',rawId:'Y3JlZA',type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:sig.toString('base64url'),userHandle:null}};
 const finish=await login(req('/api/auth/passkey/verify',response,cookie),env);
 assert.equal(finish.status,200);assert.equal(sql.prepare('SELECT sign_count FROM passkeys').get().sign_count,1);
 assert.equal((await login(req('/api/auth/passkey/verify',response,cookie),env)).status,401);
 sql.close();
});

test('login started before account recovery cannot create a session afterwards',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0005_passkey_login_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts VALUES ('a'); INSERT INTO passkeys VALUES ('credential','a',x'0102',2,'[]','2026-01-01')");
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
 const login=makePasskeyLogin({options:async()=>({challenge:'c'.repeat(43)}),verify:async()=>{entered();await gate;return {verified:true,authenticationInfo:{newCounter:3}}}});
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin};
 const request=(path,body,cookie)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(body)});
 const start=await login(request('/api/auth/passkey/options',{}),env),cookie=start.headers.get('Set-Cookie').split(';')[0];
 const pending=login(request('/api/auth/passkey/verify',{id:'credential'},cookie),env);await ready;
 sql.exec("INSERT INTO account_auth_generations(account_id,generation) VALUES ('a',1); DELETE FROM account_sessions WHERE account_id='a'");
 release();assert.equal((await pending).status,401);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n,0);
 assert.equal(sql.prepare('SELECT sign_count FROM passkeys').get().sign_count,2);
 sql.close();
});
