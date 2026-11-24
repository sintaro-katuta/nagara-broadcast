import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {issueRecoveryToken,consumeRecoveryToken} from '../cloudflare/recovery-tokens.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);
test('recovery tokens are hashed, purpose-bound, expiring and one-use',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const f of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0006_recovery_tokens.sql'])sql.exec(readFileSync(new URL(f,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts VALUES ('a')");
 const db={prepare(q){return {bind(...args){return {async run(){return sql.prepare(q).run(...args)},async first(){return sql.prepare(q).get(...args)||null}}}}}};
 const token=await issueRecoveryToken(db,'a','recover_account',1000000);
 assert.match(token,/^[a-f0-9]{64}$/);assert.notEqual(sql.prepare('SELECT token_hash FROM recovery_tokens').get().token_hash,token);
 assert.equal(await consumeRecoveryToken(db,token,'verify_email',1000000),null);
 assert.equal((await consumeRecoveryToken(db,token,'recover_account',1000000)).account_id,'a');
 assert.equal(await consumeRecoveryToken(db,token,'recover_account',1000000),null);
 const expired=await issueRecoveryToken(db,'a','recover_account',1000000);
 assert.equal(await consumeRecoveryToken(db,expired,'recover_account',1900000),null);
 sql.close();
});
