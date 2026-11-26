import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {adminBootstrapCode,bootstrapFirstAdmin} from '../cloudflare/admin-bootstrap.mjs';
import {runAdminBootstrap} from '../scripts/bootstrap-first-admin.mjs';
const sqlite=await import('node:sqlite').catch(()=>null);
function fixture(){
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 for(const f of readdirSync(new URL('../cloudflare/migrations/',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../cloudflare/migrations/'+f,import.meta.url),'utf8'));
 const id='10000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
 sql.prepare('INSERT INTO accounts VALUES (?),(?)').run(id,other);sql.prepare('INSERT INTO recovery_emails VALUES (?,?,?,?)').run(id,'lookup','cipher','2026');
 sql.prepare('INSERT INTO account_sessions VALUES (?,?,?)').run('session',id,2000000000);
 const db={prepare(query){return {async all(){return {results:sql.prepare(query).all()}},bind(...args){return {async first(){return sql.prepare(query).get(...args)||null}}}}}};return {sql,db,id,other};
}
test('first administrator setup requires the selected signed-in account, two passkeys and no recovery in progress',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,db,id,other}=fixture(),now=1900000000000,code=await adminBootstrapCode(id);
 assert.equal(code.length,64);assert.notEqual(code,await adminBootstrapCode(other));
 assert.equal(await bootstrapFirstAdmin(db,'f'.repeat(64),now),false);
 assert.equal(await bootstrapFirstAdmin(db,code,now),false);
 const key=sql.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?)');key.run('key-1',id,new Uint8Array([1]),0,'[]','2026');key.run('key-2',id,new Uint8Array([2]),0,'[]','2026');
 sql.prepare("INSERT INTO recovery_tokens(token_hash,account_id,purpose,expires_at) VALUES (?,?,'recover_account',?)").run('pending',id,2000000000);
 assert.equal(await bootstrapFirstAdmin(db,code,now),false);sql.exec('DELETE FROM recovery_tokens');
 const results=await Promise.all([bootstrapFirstAdmin(db,code,now),bootstrapFirstAdmin(db,code,now)]);assert.deepEqual(results.sort(),[false,true]);
 assert.equal(sql.prepare('SELECT account_id FROM account_admins').get().account_id,id);assert.equal(await bootstrapFirstAdmin(db,await adminBootstrapCode(other),now),false);sql.close();
});
test('first administrator setup rejects expired sessions and malformed codes',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,db,id}=fixture(),code=await adminBootstrapCode(id);const key=sql.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?)');key.run('key-1',id,new Uint8Array([1]),0,'[]','2026');key.run('key-2',id,new Uint8Array([2]),0,'[]','2026');
 assert.equal(await bootstrapFirstAdmin(db,code,2100000000000),false);await assert.rejects(bootstrapFirstAdmin(db,'bad',1900000000000),TypeError);sql.close();
});
test('operator workflow checks the exact database and all feature flags before writing',async()=>{
 const account='a'.repeat(32),code='b'.repeat(64),calls=[];
 const bindings=['AUTH_ENABLED','PASSKEY_API_ENABLED','PASSKEY_ADD_ENABLED','AUTH_NOTICES_ENABLED','ADMIN_BOOTSTRAP_ENABLED'].map(name=>({name,text:'true'}));
 let enabled=false;const fetcher=async(url,options)=>{calls.push({url,options});if(url.includes('/workers/'))return Response.json({success:true,result:{bindings:enabled?bindings:[]}});return Response.json({success:true,result:{uuid:'27cb398e-0c26-4740-804d-f6bd49f75764',name:'yorimichi-radio-db'}});};
 await assert.rejects(runAdminBootstrap({account,d1Token:'d1',workerToken:'worker',code,fetcher}),/flags/);
 assert.equal(calls.length,2);assert.equal(calls.some(call=>call.options.method==='POST'),false);
 calls.length=0;enabled=true;
 const wrongDb=async(url,options)=>{calls.push({url,options});return Response.json({success:true,result:{uuid:'wrong',name:'yorimichi-radio-db'}})};
 await assert.rejects(runAdminBootstrap({account,d1Token:'d1',workerToken:'worker',code,fetcher:wrongDb}),/Unexpected D1/);assert.equal(calls.length,1);
});
test('operator workflow uses the selected code and provisions only one account',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const {sql,id,other}=fixture(),code=await adminBootstrapCode(id),key=sql.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?)');key.run('key-1',id,new Uint8Array([1]),0,'[]','2026');key.run('key-2',id,new Uint8Array([2]),0,'[]','2026');
 // Ensure the synthetic session remains valid regardless of test date.
 sql.prepare('UPDATE account_sessions SET expires_at=?').run(Math.floor(Date.now()/1000)+3600);
 const bindings=['AUTH_ENABLED','PASSKEY_API_ENABLED','PASSKEY_ADD_ENABLED','AUTH_NOTICES_ENABLED','ADMIN_BOOTSTRAP_ENABLED'].map(name=>({name,text:'true'}));
 const fetcher=async(url,options)=>{if(url.endsWith('/settings')){assert.equal(options.headers.Authorization,'Bearer worker');return Response.json({success:true,result:{bindings}});}assert.equal(options.headers.Authorization,'Bearer d1');if(url.endsWith('/query')){const {sql:statement,params}=JSON.parse(options.body);return Response.json({success:true,result:[{results:sql.prepare(statement).all(...params)}]});}return Response.json({success:true,result:{uuid:'27cb398e-0c26-4740-804d-f6bd49f75764',name:'yorimichi-radio-db'}});};
 const config={account:'a'.repeat(32),d1Token:'d1',workerToken:'worker',code,fetcher};assert.equal(await runAdminBootstrap(config),true);
 assert.equal(sql.prepare('SELECT account_id FROM account_admins').get().account_id,id);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM account_admins WHERE account_id=?').get(other).n,0);
 await assert.rejects(runAdminBootstrap(config),/conditions were not met/);sql.close();
});
