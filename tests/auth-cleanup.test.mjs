import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {cleanupExpiredAuth,cleanupOldPositionCursors} from '../cloudflare/auth-cleanup.mjs';
import {setListeningPosition} from '../cloudflare/account-data.mjs';
import worker from '../cloudflare/worker.mjs';

const sqlite=await import('node:sqlite').catch(()=>null);
function database(){
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 sql.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 for(const file of readdirSync(new URL('../cloudflare/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../cloudflare/migrations/'+file,import.meta.url),'utf8'));
 sql.exec("INSERT INTO accounts(id) VALUES ('a'); INSERT INTO episodes VALUES ('ep','title','tech','','',10,3,'2026-01-01','audio/ep')");
 const d1={prepare(query){return {bind(...args){return {run(){return sql.prepare(query).run(...args)},async all(){return {results:sql.prepare(query).all(...args)}},batch(){const s=sql.prepare(query);if(s.columns().length)return {results:s.all(...args),meta:{changes:0}};return {results:[],meta:{changes:Number(s.run(...args).changes)}}}}}}},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(statement=>statement.batch());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 return {sql,d1};
}
const tables=['account_sessions','passkey_challenges','passkey_login_attempts','recovery_tokens','auth_rate_limits','passkey_registration_attempts','passkey_enrollments','passkey_recovery_attempts'];
function insert(sql,kind,suffix,expiry){
 const statements={
  account_sessions:'INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,\'a\',?)',
  passkey_challenges:'INSERT INTO passkey_challenges(challenge,purpose,expires_at) VALUES (?,\'authentication\',?)',
  passkey_login_attempts:'INSERT INTO passkey_login_attempts(browser_token_hash,challenge,expires_at) VALUES (?,\'challenge\',?)',
  recovery_tokens:'INSERT INTO recovery_tokens(token_hash,account_id,purpose,expires_at) VALUES (?,\'a\',\'recover_account\',?)',
  auth_rate_limits:'INSERT INTO auth_rate_limits(bucket_key,attempts,expires_at) VALUES (?,1,?)',
  passkey_registration_attempts:'INSERT INTO passkey_registration_attempts(browser_token_hash,account_id,challenge,expires_at) VALUES (?,\'a\',\'challenge\',?)',
  passkey_enrollments:'INSERT INTO passkey_enrollments(account_id,email_lookup,email_ciphertext,expires_at) VALUES (?,?,\'cipher\',?)',
  passkey_recovery_attempts:'INSERT INTO passkey_recovery_attempts(browser_token_hash,account_id,expires_at) VALUES (?, ?, ?)'
 };
 if(kind==='passkey_enrollments')sql.prepare(statements[kind]).run(suffix,suffix,expiry);
 else if(kind==='passkey_recovery_attempts'){sql.prepare('INSERT OR IGNORE INTO accounts(id) VALUES (?)').run(suffix);sql.prepare(statements[kind]).run(suffix,suffix,expiry);}
 else sql.prepare(statements[kind]).run(suffix,expiry);
}

test('cleanup removes expired authorization data in bounded batches and preserves live data',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,d1}=database(),now=1700000000000,seconds=now/1000;
 for(const table of tables){insert(sql,table,'expired',seconds);insert(sql,table,'live',seconds+1);}
 for(let i=0;i<200;i++)insert(sql,'account_sessions','extra'+i,seconds-1);
 sql.exec("INSERT INTO favorites(account_id,episode_id,saved_at) VALUES ('a','ep','2026-01-01'); INSERT INTO position_write_cursors VALUES ('a','ep','writer',1,'id','2000-01-01'); INSERT INTO passkeys(credential_id,account_id,public_key,created_at) VALUES ('key','a',X'01','2026-01-01'); INSERT INTO recovery_emails VALUES ('a','lookup','cipher','2026-01-01')");
 const result=await cleanupExpiredAuth(d1,now);assert.equal(result.account_sessions,200);
 for(const table of tables){if(table!=='account_sessions')assert.equal(result[table],1);assert.equal(sql.prepare(`SELECT COUNT(*) n FROM ${table} WHERE expires_at>?`).get(seconds).n,1);}
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM account_sessions WHERE expires_at<=?').get(seconds).n,1);
 for(const table of ['accounts','favorites','position_write_cursors','passkeys','recovery_emails'])assert.ok(sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n>=1);
 const next=await cleanupExpiredAuth(d1,now);assert.equal(next.account_sessions,1);assert.equal((await cleanupExpiredAuth(d1,now)).account_sessions,0);
 await assert.rejects(cleanupExpiredAuth(d1,NaN),TypeError);sql.close();
});

test('scheduled cleanup is disabled by default and reports database failures',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 await worker.scheduled({scheduledTime:1700000000000,cron:'0 * * * *'},{});
 await worker.scheduled({scheduledTime:1700000000000,cron:'0 * * * *'},{AUTH_CLEANUP_ENABLED:'false'});
 const {sql,d1}=database();insert(sql,'account_sessions','expired',1699999999);
 await worker.scheduled({scheduledTime:1700000000000,cron:'0 * * * *'},{AUTH_CLEANUP_ENABLED:'true',DB:d1});
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,0);
 await assert.rejects(worker.scheduled({scheduledTime:1700000000000,cron:'0 * * * *'},{AUTH_CLEANUP_ENABLED:'true',DB:{prepare(){throw new Error('DB unavailable')}}}),/DB unavailable/);sql.close();
});

test('failed batch rolls back all cleanup deletions',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,d1}=database();insert(sql,'account_sessions','expired',1);
 const failing={prepare(query){if(query.includes('passkey_challenges'))return {bind(){return {batch(){throw new Error('simulated failure')}}}};return d1.prepare(query)},batch:statements=>d1.batch(statements)};
 await assert.rejects(cleanupExpiredAuth(failing,2000),/simulated failure/);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM account_sessions').get().n,1);sql.close();
});

test('cursor expiry preserves history and blocks delayed writes from the previous generation',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,d1}=database(),now=Date.parse('2026-11-26T00:00:00.000Z');
 sql.exec("INSERT INTO accounts VALUES ('b'); INSERT INTO listening_history VALUES ('a','ep','2026-01-01',42); INSERT INTO position_write_cursors VALUES ('a','ep','writer-1234567890',1,'old','2026-01-01T00:00:00.000Z'),('b','ep','writer-1234567890',1,'live','2026-11-25T00:00:00.000Z')");
 assert.equal(await cleanupOldPositionCursors(d1,now),1);
 assert.equal(sql.prepare("SELECT position_seconds FROM listening_history WHERE account_id='a'").get().position_seconds,42);
 assert.equal(sql.prepare("SELECT generation FROM account_history_generations WHERE account_id='a'").get().generation,1);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM position_write_cursors WHERE account_id='b'").get().n,1);
 assert.equal(await setListeningPosition(d1,'a','ep',50,'writer-1234567890',2,0),false);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM position_write_cursors WHERE account_id='a'").get().n,0);
 assert.equal(await setListeningPosition(d1,'a','ep',60,'writer-1234567890',3,1),true);
 assert.equal(sql.prepare("SELECT position_seconds FROM listening_history WHERE account_id='a'").get().position_seconds,60);
 assert.equal(await cleanupOldPositionCursors(d1,now),0);sql.close();
});

test('cursor expiry is bounded and rolls generation back when deletion fails',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,d1}=database(),now=Date.parse('2026-11-26T00:00:00.000Z');
 const insert=sql.prepare("INSERT INTO position_write_cursors VALUES ('a','ep',?,1,?,'2026-01-01T00:00:00.000Z')");for(let i=0;i<201;i++)insert.run('writer-'+i,'id-'+i);
 sql.exec("CREATE TRIGGER stop_cursor_delete BEFORE DELETE ON position_write_cursors BEGIN SELECT RAISE(ABORT, 'delete failed'); END");
 await assert.rejects(cleanupOldPositionCursors(d1,now),/delete failed/);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM account_history_generations').get().n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM position_write_cursors').get().n,201);
 sql.exec('DROP TRIGGER stop_cursor_delete');assert.equal(await cleanupOldPositionCursors(d1,now),200);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM position_write_cursors').get().n,1);
 assert.equal(await cleanupOldPositionCursors(d1,now),1);
 assert.equal(sql.prepare("SELECT generation FROM account_history_generations WHERE account_id='a'").get().generation,2);sql.close();
});
