import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeEnrollment} from '../cloudflare/passkey-enrollment.mjs';
import {decryptEmail} from '../cloudflare/recovery-crypto.mjs';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {verifySession} from '../cloudflare/sessions.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

test('email confirmation and credential verification are required before creating an account',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0009_passkey_enrollments.sql','../cloudflare/migrations/0011_enrollment_challenge_expiry.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){return sql.prepare(q).run(...args)},async first(){return sql.prepare(q).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{for(const item of items)await item.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
 const lookupKey=crypto.getRandomValues(new Uint8Array(32)),encryptionKey=crypto.getRandomValues(new Uint8Array(32));
 const enrollment=makeEnrollment({options:async()=>({challenge:'c'.repeat(43)}),verify:async(_origin,challenge,response)=>({verified:challenge==='c'.repeat(43)&&response.valid,registrationInfo:{credential:{id:'credential',publicKey:new Uint8Array([1,2]),counter:0,transports:[]}}})});
 const token=await enrollment.begin(db,'test@example.com',lookupKey,encryptionKey,1000);
 const pending=sql.prepare('SELECT * FROM passkey_enrollments').get();assert.notEqual(pending.email_token_hash,token);assert.equal(pending.email_ciphertext.includes('test@example.com'),false);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,0);
 assert.equal(await enrollment.confirm(db,token,1900),null);
 const browser=await enrollment.confirm(db,token,1001);assert.ok(browser);
 assert.equal(await enrollment.confirm(db,token,1002),null);
 assert.equal(await enrollment.options(db,'0'.repeat(64),'https://radio.example',1002),null);
 assert.equal((await enrollment.options(db,browser,'https://radio.example',1002)).challenge,'c'.repeat(43));
 assert.equal(await enrollment.finish(db,browser,'https://radio.example',{valid:true},1302),null);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,0);
 assert.equal((await enrollment.options(db,browser,'https://radio.example',1303)).challenge,'c'.repeat(43));
 const session=await enrollment.finish(db,browser,'https://radio.example',{valid:true},1304);
 assert.match(session,/__Host-nagara_session=/);
 assert.equal(await enrollment.finish(db,browser,'https://radio.example',{valid:true},1004),null);
 const row=sql.prepare('SELECT account_id,email_ciphertext FROM recovery_emails').get();
 assert.equal(await decryptEmail(row.email_ciphertext,row.account_id,encryptionKey),'test@example.com');
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM passkeys').get().n,1);
 const duplicateToken=await enrollment.begin(db,'test@example.com',lookupKey,encryptionKey,1004);
 const duplicateBrowser=await enrollment.confirm(db,duplicateToken,1005);
 await enrollment.options(db,duplicateBrowser,'https://radio.example',1006);
 assert.equal(await enrollment.finish(db,duplicateBrowser,'https://radio.example',{valid:true},1007),null);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,1);
 sql.close();
});

test('enrollment accepts a real WebAuthn registration response and saves the public key',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0009_passkey_enrollments.sql','../cloudflare/migrations/0011_enrollment_challenge_expiry.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){return sql.prepare(q).run(...args)},async first(){return sql.prepare(q).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{for(const item of items)await item.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
 const key=crypto.getRandomValues(new Uint8Array(32)),enrollment=makeEnrollment(),origin='https://radio.example';
 const token=await enrollment.begin(db,'real@example.com',key,key,1000),browser=await enrollment.confirm(db,token,1001),options=await enrollment.options(db,browser,origin,1002);
 const {publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
 const cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
 const id=Buffer.from('test-credential'),auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([0x45,0,0,0,0]),Buffer.alloc(16),Buffer.from([0,id.length]),id,cose]);
 const attestation=Buffer.concat([Buffer.from('a363666d74646e6f6e656761747453746d74a068617574684461746158','hex'),Buffer.from([auth.length]),auth]);
 const client=Buffer.from(JSON.stringify({type:'webauthn.create',challenge:options.challenge,origin,crossOrigin:false}));
 const response={id:id.toString('base64url'),rawId:id.toString('base64url'),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),attestationObject:attestation.toString('base64url'),transports:['internal']}};
 const session=await enrollment.finish(db,browser,origin,response,1003);
 assert.match(session,/__Host-nagara_session=/);assert.equal(sql.prepare('SELECT credential_id FROM passkeys').get().credential_id,id.toString('base64url'));
 sql.close();
});

test('a failed credential cannot create an account and consumes the enrollment',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0009_passkey_enrollments.sql','../cloudflare/migrations/0011_enrollment_challenge_expiry.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async run(){return sql.prepare(q).run(...args)},async first(){return sql.prepare(q).get(...args)||null}}}}}};
 const key=crypto.getRandomValues(new Uint8Array(32));
 const enrollment=makeEnrollment({options:async()=>({challenge:'c'.repeat(43)}),verify:async()=>({verified:false})});
 const emailToken=await enrollment.begin(db,'fail@example.com',key,key,1000),browser=await enrollment.confirm(db,emailToken,1001);
 await enrollment.options(db,browser,'https://radio.example',1002);
 assert.equal(await enrollment.finish(db,browser,'https://radio.example',{},1003),null);
 assert.equal(await enrollment.finish(db,browser,'https://radio.example',{},1004),null);
 assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,0);
 sql.close();
});

test('a delayed enrollment response does not recreate a session revoked by recovery',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_passkeys.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0009_passkey_enrollments.sql','../cloudflare/migrations/0011_enrollment_challenge_expiry.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 let release,entered;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 const db={prepare(q){return {bind(...args){return {async run(){return sql.prepare(q).run(...args)},async first(){return sql.prepare(q).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{for(const item of items)await item.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}entered();await gate}};
 const key=crypto.getRandomValues(new Uint8Array(32));
 const enrollment=makeEnrollment({options:async()=>({challenge:'c'.repeat(43)}),verify:async()=>({verified:true,registrationInfo:{credential:{id:'key',publicKey:new Uint8Array([1]),counter:0}}})});
 const token=await enrollment.begin(db,'race@example.com',key,key,1000),browser=await enrollment.confirm(db,token,1001);
 await enrollment.options(db,browser,'https://radio.example',1002);
 const pending=enrollment.finish(db,browser,'https://radio.example',{},1003);await ready;
 sql.exec('DELETE FROM account_sessions');release();const session=await pending;
 const request=new Request('https://radio.example/api/account',{headers:{Cookie:session.split(';')[0]}});
 assert.equal(await verifySession(request,db,1004000),null);
 sql.close();
});
