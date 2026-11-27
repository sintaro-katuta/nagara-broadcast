import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encryptEmail} from '../cloudflare/recovery-crypto.mjs';
import {deliverRecoveryNotices} from '../cloudflare/recovery-notices.mjs';
import {ResendDeliveryError} from '../cloudflare/resend-email.mjs';
import worker from '../cloudflare/worker.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

async function setup(){
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const path of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0004_recovery_email.sql','../cloudflare/migrations/0015_recovery_notice_outbox.sql','../cloudflare/migrations/0016_recovery_notice_failures.sql'])sql.exec(readFileSync(new URL(path,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts(id) VALUES ('a')");const key=crypto.getRandomValues(new Uint8Array(32));
 sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run('a','lookup',await encryptEmail('person@example.com','a',key),'2026-01-01');
 sql.exec("INSERT INTO recovery_notice_outbox(id,account_id,created_at,next_attempt_at) VALUES ('notice','a',1000,1000)");
 const db={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)||null},async run(){return sql.prepare(query).run(...args)}}}}}};
 return {sql,key,db};
}

test('failed notices remain for retry and a successful send removes the record',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();let calls=0,message;
 const binding={async send(value){calls++;if(calls===1)throw new Error('temporary');message=value;}};
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1000000),{sent:0,failed:1});
 const row=sql.prepare('SELECT * FROM recovery_notice_outbox').get();assert.equal(row.attempts,1);assert.equal(row.next_attempt_at,1060);assert.equal(row.lease_until,0);
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1059000),{sent:0,failed:0});
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1060000),{sent:1,failed:0});
 assert.equal(message.to,'person@example.com');assert.match(message.text,/復旧/);assert.match(message.text,/support@mail\.nagara-broadcast\.sintaro-katuta\.com/);assert.doesNotMatch(message.text,/notice|lookup|#recover/);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM recovery_notice_outbox').get().n,0);sql.close();
});

test('added passkeys send an accurate notification using the retry queue',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();sql.exec("UPDATE recovery_notice_outbox SET id='passkey-add:test'");let message;
 assert.deepEqual(await deliverRecoveryNotices(db,{async send(value){message=value}},'sender@example.com',key,1000000),{sent:1,failed:0});
 assert.match(message.subject,/パスキー追加/);assert.match(message.text,/新しいパスキーが追加/);assert.match(message.text,/support@mail\.nagara-broadcast\.sintaro-katuta\.com/);assert.doesNotMatch(message.text,/メールによる復旧/);assert.equal(sql.prepare('SELECT COUNT(*) n FROM recovery_notice_outbox').get().n,0);sql.close();
});
test('administrator recovery sends a distinct security notice',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();sql.exec("UPDATE recovery_notice_outbox SET id='admin-recover:test'");let message;
 assert.deepEqual(await deliverRecoveryNotices(db,{async send(value){message=value}},'sender@example.com',key,1000000),{sent:1,failed:0});
 assert.match(message.subject,/管理者/);assert.match(message.text,/以前のパスキーとログイン状態は無効/);assert.match(message.text,/support@mail\.nagara-broadcast\.sintaro-katuta\.com/);sql.close();
});

test('concurrent workers cannot claim the same notification before its lease expires',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();let release,entered,calls=0;const gate=new Promise(resolve=>{release=resolve}),started=new Promise(resolve=>{entered=resolve});
 const binding={async send(){calls++;entered();await gate;}};
 const first=deliverRecoveryNotices(db,binding,'sender@example.com',key,1000000);await started;
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1000000),{sent:0,failed:0});
 release();assert.deepEqual(await first,{sent:1,failed:0});assert.equal(calls,1);sql.close();
});

test('an abandoned lease becomes eligible again after expiry',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();let calls=0;
 sql.prepare('UPDATE recovery_notice_outbox SET lease_token=?,lease_until=?').run('abandoned',1120);
 const binding={async send(){calls++}};
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1119000),{sent:0,failed:0});
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1120000),{sent:1,failed:0});
 assert.equal(calls,1);sql.close();
});

test('permanent provider errors stop retries but retain notices for the administrator',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();let calls=0;
 const binding={async send(){calls++;throw new ResendDeliveryError(403,{retryable:false});}};
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1000000),{sent:0,failed:1});
 const row=sql.prepare('SELECT blocked_at,blocked_reason FROM recovery_notice_outbox').get();assert.equal(row.blocked_at,1000);assert.equal(row.blocked_reason,'http_403');
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,9999000),{sent:0,failed:0});assert.equal(calls,1);sql.close();
});

test('rate limits retain the notice and respect the requested wait',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,key,db}=await setup();let calls=0;
 const binding={async send(){calls++;if(calls===1)throw new ResendDeliveryError(429,{retryable:true,retryAfter:7200});}};
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,1000000),{sent:0,failed:1});
 assert.equal(sql.prepare('SELECT next_attempt_at FROM recovery_notice_outbox').get().next_attempt_at,8200);
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,8199000),{sent:0,failed:0});
 assert.deepEqual(await deliverRecoveryNotices(db,binding,'sender@example.com',key,8200000),{sent:1,failed:0});sql.close();
});

test('notification trigger is disabled by default and rejects missing configuration',async()=>{
 await worker.scheduled({cron:'*/5 * * * *'},{});
 await assert.rejects(worker.scheduled({cron:'*/5 * * * *'},{AUTH_NOTICES_ENABLED:'true'}),/configuration unavailable/);
});

test('enabled notification trigger sends queued messages',{skip:!sqlite&&'node:sqlite unavailable'},async(t)=>{
 const {sql,key,db}=await setup();const messages=[];
 t.mock.method(globalThis,'fetch',async(_url,options)=>{messages.push(JSON.parse(options.body));return Response.json({id:'test'});});
 await worker.scheduled({cron:'*/5 * * * *'},{AUTH_NOTICES_ENABLED:'true',AUTH_ENCRYPTION_KEY:Buffer.from(key).toString('hex'),AUTH_EMAIL_FROM:'sender@example.com',RESEND_API_KEY:'re_test_key_12345',DB:db});
 assert.equal(messages.length,1);assert.equal(messages[0].to,'person@example.com');assert.equal(sql.prepare('SELECT COUNT(*) n FROM recovery_notice_outbox').get().n,0);sql.close();
});
