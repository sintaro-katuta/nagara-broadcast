import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rateLimitKey,consumeRateLimit,getMailPoolStatus} from '../cloudflare/auth-rate-limit.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);
test('rate limits use separate keyed buckets and reset after expiry',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../cloudflare/migrations/0007_auth_rate_limits.sql',import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null}}}}}};
 const secret=crypto.getRandomValues(new Uint8Array(32));const key=await rateLimitKey(secret,'client','192.0.2.1');
 assert.notEqual(key,await rateLimitKey(secret,'account','192.0.2.1'));
 assert.equal((await consumeRateLimit(db,key,2,60,1000000)).allowed,true);
 assert.equal((await consumeRateLimit(db,key,2,60,1000000)).allowed,true);
 assert.equal((await consumeRateLimit(db,key,2,60,1000000)).allowed,false);
 assert.equal((await consumeRateLimit(db,key,2,60,1060000)).allowed,true);
 assert.equal(sql.prepare('SELECT bucket_key FROM auth_rate_limits').get().bucket_key.includes('192.0.2.1'),false);
 sql.close();
});

test('mail pool status reports reservations and resets without disclosing addresses',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../cloudflare/migrations/0007_auth_rate_limits.sql',import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null}}}}}};
 const secret='01'.repeat(32),bytes=Uint8Array.from(secret.match(/../g),x=>parseInt(x,16));
 const enroll=await rateLimitKey(bytes,'account','mail-pool:enroll');
 for(let i=0;i<41;i++)await consumeRateLimit(db,enroll,40,86400,1000000);
 const result=await getMailPoolStatus(db,secret,1001000);
 assert.deepEqual(result.enroll,{used:40,limit:40,resetsAt:new Date(87400000).toISOString()});
 assert.deepEqual(result.recovery,{used:0,limit:25,resetsAt:null});
 assert.deepEqual(result['admin-recovery'],{used:0,limit:5,resetsAt:null});
 assert.equal((await getMailPoolStatus(db,secret,87400000)).enroll.used,0);
 assert.equal(await getMailPoolStatus(db,'invalid'),null);
 assert.equal(await getMailPoolStatus({prepare(){throw new Error('unavailable')}},secret),null);
 sql.close();
});
