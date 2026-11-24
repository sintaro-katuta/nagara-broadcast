import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSession,verifySession,revokeSession} from '../cloudflare/sessions.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);

test('sessions use opaque hashed tokens, expire and revoke', {skip:!sqlite&&'node:sqlite unavailable'}, async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql'])sql.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts VALUES ('a'); INSERT INTO account_admins VALUES ('a')");
 const db={prepare(query){return {bind(...args){return {async run(){return sql.prepare(query).run(...args)},async first(){return sql.prepare(query).get(...args)||null}}}}}};
 const issued=await createSession(db,'a',1000000);assert.match(issued,/Secure; HttpOnly; SameSite=Lax/);
 const pair=issued.split(';')[0],token=pair.split('=')[1];
 assert.notEqual(sql.prepare('SELECT token_hash FROM account_sessions').get().token_hash,token);
 const req=new Request('https://example.test/api/account',{headers:{Cookie:pair}});
 const verified=await verifySession(req,db,1000000);assert.equal(verified.accountId,'a');assert.equal(verified.admin,true);assert.match(verified.sessionTag,/^[a-f0-9]{64}$/);assert.notEqual(verified.sessionTag,token);assert.notEqual(verified.sessionTag,sql.prepare('SELECT token_hash FROM account_sessions').get().token_hash);
 assert.equal(await verifySession(req,db,1000000+31*86400000),null);
 assert.equal(await verifySession(new Request(req,{headers:{Cookie:pair+'; '+pair}}),db,1000000),null);
 assert.match(await revokeSession(req,db),/Max-Age=0/);
 assert.equal(await verifySession(req,db,1000000),null);
 sql.close();
});
