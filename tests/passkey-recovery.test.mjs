import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emailLookup,encryptEmail} from '../cloudflare/recovery-crypto.mjs';
import {makeRecovery} from '../cloudflare/passkey-recovery.mjs';
import {sendRecoveryEmail} from '../cloudflare/recovery-email.mjs';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {verifySession} from '../cloudflare/sessions.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

test('email recovery requires verification and refuses administrators',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0006_recovery_tokens.sql','../cloudflare/migrations/0010_passkey_recovery_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){const statement=sql.prepare(q);return /RETURNING/i.test(q)?{results:statement.all(...args)}:(statement.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}};
 const key=crypto.getRandomValues(new Uint8Array(32)),other=crypto.getRandomValues(new Uint8Array(32));
 sql.exec("INSERT INTO accounts VALUES ('a'),('admin'); INSERT INTO account_admins VALUES ('admin'); INSERT INTO account_sessions VALUES ('old','a',9999999)");
 for(const [id,email] of [['a','user@example.com'],['admin','admin@example.com']])sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run(id,await emailLookup(email,key),await encryptEmail(email,id,other),'2026-01-01');
 const recovery=makeRecovery({options:async()=>({challenge:'c'.repeat(43)}),verify:async(_origin,challenge,response)=>({verified:challenge==='c'.repeat(43)&&response.valid,registrationInfo:{credential:{id:response.id||'credential',publicKey:new Uint8Array([1,2]),counter:0,transports:[]}}})});
 assert.equal(await recovery.issue(db,'missing@example.com',key,other,1000),null);
 assert.equal(await recovery.issue(db,'admin@example.com',key,other,1000),null);
 const issued=await recovery.issue(db,'user@example.com',key,other,1000);assert.equal(issued.to,'user@example.com');
 assert.equal(await recovery.confirm(db,issued.token,1900),null);
 const browser=await recovery.confirm(db,issued.token,1001);assert.ok(browser);
 assert.equal(await recovery.confirm(db,issued.token,1002),null);
 assert.equal(await recovery.options(db,'0'.repeat(64),'https://radio.example',1002),null);
 assert.equal((await recovery.options(db,browser,'https://radio.example',1002)).challenge,'c'.repeat(43));
 const session=await recovery.finish(db,browser,'https://radio.example',{valid:true},1003);
 assert.match(session,/__Host-nagara_session=/);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM recovery_notice_outbox WHERE account_id=?').get('a').n,1);
 assert.equal(sql.prepare("SELECT generation FROM account_auth_generations WHERE account_id='a'").get().generation,1);
 assert.equal(await recovery.finish(db,browser,'https://radio.example',{valid:true},1004),null);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account_sessions WHERE token_hash='old'").get().n,0);
 assert.equal(sql.prepare("SELECT account_id FROM passkeys WHERE credential_id='credential'").get().account_id,'a');
 // A later recovery request supersedes an earlier browser attempt.
 const first=await recovery.issue(db,'user@example.com',key,other,1004),second=await recovery.issue(db,'user@example.com',key,other,1004);
 const oldBrowser=await recovery.confirm(db,first.token,1005),newBrowser=await recovery.confirm(db,second.token,1006);
 assert.equal(await recovery.options(db,oldBrowser,'https://radio.example',1007),null);
 assert.ok(await recovery.options(db,newBrowser,'https://radio.example',1007));
 // A user promoted to administrator cannot use email recovery to add a key.
 sql.exec("INSERT INTO account_admins VALUES ('a')");
 const sessionsBefore=sql.prepare("SELECT COUNT(*) AS n FROM account_sessions WHERE account_id='a'").get().n;
 assert.equal(await recovery.finish(db,newBrowser,'https://radio.example',{valid:true,id:'other'},1008),null);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE account_id='a'").get().n,1);
 assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM account_sessions WHERE account_id='a'").get().n,sessionsBefore);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM recovery_notice_outbox').get().n,1);
 sql.close();
});

test('recovery messages keep the token in the URL fragment',async()=>{
 let message;await sendRecoveryEmail({async send(v){message=v}},{origin:'https://radio.example',from:'no-reply@example.com',to:'user@example.com',token:'a'.repeat(64)});
 assert.match(message.text,/https:\/\/radio\.example\/#recover-account=/);
 await assert.rejects(sendRecoveryEmail({send(){}},{origin:'http://radio.example',from:'x@example.com',to:'y@example.com',token:'a'.repeat(64)}));
});

test('recovery cannot commit if its notification cannot be queued',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0006_recovery_tokens.sql','../cloudflare/migrations/0010_passkey_recovery_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const lookup=crypto.getRandomValues(new Uint8Array(32)),key=crypto.getRandomValues(new Uint8Array(32));sql.exec("INSERT INTO accounts VALUES ('a'); INSERT INTO account_sessions VALUES ('old','a',9999999)");
 sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run('a',await emailLookup('user@example.com',lookup),await encryptEmail('user@example.com','a',key),'2026-01-01');
 const recovery=makeRecovery({options:async()=>({challenge:'c'.repeat(43)}),verify:async()=>({verified:true,registrationInfo:{credential:{id:'newkey',publicKey:new Uint8Array([1]),counter:0}}})});
 const issued=await recovery.issue(db,'user@example.com',lookup,key,1000),browser=await recovery.confirm(db,issued.token,1001);await recovery.options(db,browser,'https://radio.example',1002);
 assert.equal(await recovery.finish(db,browser,'https://radio.example',{},1003),null);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM passkeys').get().n,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM account_sessions WHERE token_hash='old'").get().n,1);sql.close();
});

test('recovery challenges expire independently after five minutes',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0006_recovery_tokens.sql','../cloudflare/migrations/0010_passkey_recovery_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const key=crypto.getRandomValues(new Uint8Array(32)),encKey=crypto.getRandomValues(new Uint8Array(32));sql.exec("INSERT INTO accounts VALUES ('a')");
 sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run('a',await emailLookup('expire@example.com',key),await encryptEmail('expire@example.com','a',encKey),'2026-01-01');
 const recovery=makeRecovery({options:async()=>({challenge:'c'.repeat(43)}),verify:async()=>({verified:true,registrationInfo:{credential:{id:'id',publicKey:new Uint8Array([1]),counter:0}}})});
 const issued=await recovery.issue(db,'expire@example.com',key,encKey,1000),browser=await recovery.confirm(db,issued.token,1001);
 await recovery.options(db,browser,'https://radio.example',1002);
 assert.equal(await recovery.finish(db,browser,'https://radio.example',{},1302),null);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM passkeys').get().n,0);
 assert.ok(await recovery.options(db,browser,'https://radio.example',1303));
 assert.match(await recovery.finish(db,browser,'https://radio.example',{},1304),/__Host-nagara_session=/);
 sql.close();
});

test('a pending confirmation cannot recreate authorization after another recovery succeeds',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0006_recovery_tokens.sql','../cloudflare/migrations/0010_passkey_recovery_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 let pause=false,release,entered;const reached=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){if(pause){pause=false;entered();await gate;}sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const key=crypto.getRandomValues(new Uint8Array(32)),encKey=crypto.getRandomValues(new Uint8Array(32));sql.exec("INSERT INTO accounts VALUES ('a')");
 sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run('a',await emailLookup('race@example.com',key),await encryptEmail('race@example.com','a',encKey),'2026-01-01');
 const recovery=makeRecovery({options:async()=>({challenge:'c'.repeat(43)}),verify:async()=>({verified:true,registrationInfo:{credential:{id:'newkey',publicKey:new Uint8Array([1]),counter:0}}})});
 const first=await recovery.issue(db,'race@example.com',key,encKey,1000),second=await recovery.issue(db,'race@example.com',key,encKey,1000);
 const browser=await recovery.confirm(db,first.token,1001);await recovery.options(db,browser,'https://radio.example',1002);
 pause=true;const pending=recovery.confirm(db,second.token,1003);await reached;
 assert.match(await recovery.finish(db,browser,'https://radio.example',{},1004),/__Host-nagara_session=/);
 release();assert.equal(await pending,null);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM passkey_recovery_attempts').get().n,0);
 sql.close();
});

test('a delayed recovery response cannot recreate a session after a newer recovery',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0006_recovery_tokens.sql','../cloudflare/migrations/0010_passkey_recovery_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 let pause=false,release,entered;const reached=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');let out;try{out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}if(pause){pause=false;entered();await gate;}return out}};
 const key=crypto.getRandomValues(new Uint8Array(32)),encKey=crypto.getRandomValues(new Uint8Array(32));sql.exec("INSERT INTO accounts VALUES ('a')");
 sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run('a',await emailLookup('race@example.com',key),await encryptEmail('race@example.com','a',encKey),'2026-01-01');
 const recovery=makeRecovery({options:async()=>({challenge:'c'.repeat(43)}),verify:async(_origin,_challenge,response)=>({verified:true,registrationInfo:{credential:{id:response.id,publicKey:new Uint8Array([1]),counter:0}}})});
 const first=await recovery.issue(db,'race@example.com',key,encKey,1000),browser=await recovery.confirm(db,first.token,1001);
 await recovery.options(db,browser,'https://radio.example',1002);pause=true;
 const pending=recovery.finish(db,browser,'https://radio.example',{id:'first'},1003);await reached;
 const second=await recovery.issue(db,'race@example.com',key,encKey,1004),browser2=await recovery.confirm(db,second.token,1005);
 await recovery.options(db,browser2,'https://radio.example',1006);
 const fresh=await recovery.finish(db,browser2,'https://radio.example',{id:'second'},1007);
 release();const stale=await pending;
 const request=c=>new Request('https://radio.example/api/account',{headers:{Cookie:c.split(';')[0]}});
 assert.equal(await verifySession(request(stale),db,1008000),null);
 const freshIdentity=await verifySession(request(fresh),db,1008000);assert.equal(freshIdentity.accountId,'a');assert.equal(freshIdentity.admin,false);assert.match(freshIdentity.sessionTag,/^[a-f0-9]{64}$/);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM account_sessions').get().n,1);
 sql.close();
});

test('recovery accepts a real WebAuthn registration response',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0006_recovery_tokens.sql','../cloudflare/migrations/0010_passkey_recovery_attempts.sql','../cloudflare/migrations/0012_account_auth_generations.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){const s=sql.prepare(q);return /RETURNING/i.test(q)?{results:s.all(...args)}:(s.run(...args),{results:[]})},async first(){return sql.prepare(q).get(...args)||null},async all(){return {results:sql.prepare(q).all(...args)}}}}}},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const key=crypto.getRandomValues(new Uint8Array(32)),encKey=crypto.getRandomValues(new Uint8Array(32));sql.exec("INSERT INTO accounts VALUES ('a')");
 sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run('a',await emailLookup('real@example.com',key),await encryptEmail('real@example.com','a',encKey),'2026-01-01');
 const recovery=makeRecovery(),origin='https://radio.example',issued=await recovery.issue(db,'real@example.com',key,encKey,1000),browser=await recovery.confirm(db,issued.token,1001),options=await recovery.options(db,browser,origin,1002);
 const {publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
 const cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
 const id=Buffer.from('recovery-credential'),auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([0x45,0,0,0,0]),Buffer.alloc(16),Buffer.from([0,id.length]),id,cose]);
 const attestation=Buffer.concat([Buffer.from('a363666d74646e6f6e656761747453746d74a068617574684461746158','hex'),Buffer.from([auth.length]),auth]);
 const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false}));
 const response={id:id.toString('base64url'),rawId:id.toString('base64url'),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),attestationObject:attestation.toString('base64url'),transports:['internal']}};
 assert.match(await recovery.finish(db,browser,origin,response,1003),/__Host-nagara_session=/);
 assert.equal(sql.prepare('SELECT credential_id FROM passkeys').get().credential_id,id.toString('base64url'));
 sql.close();
});
