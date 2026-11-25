import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {makeAccountDeletion} from '../cloudflare/account-deletion.mjs';

const sqlite=await import('node:sqlite').catch(()=>null);
test('account deletion requires its own current session and a real signed passkey assertion',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
 for(const f of readdirSync(new URL('../cloudflare/migrations/',import.meta.url)).sort())sql.exec(readFileSync(new URL('../cloudflare/migrations/'+f,import.meta.url),'utf8'));
 const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null},async run(){return sql.prepare(q).run(...args)}}}}}};
 sql.exec("INSERT INTO accounts VALUES ('a'),('b'); INSERT INTO episodes VALUES ('ep','title','tech','','',10,3,'2026-01-01','audio/ep'); INSERT INTO favorites VALUES ('a','ep','2026-01-01'),('b','ep','2026-01-01'); INSERT INTO account_sessions VALUES ('session-a','a',9999999999),('session-b','b',9999999999)");
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
 const cose=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
 sql.prepare('INSERT INTO passkeys VALUES (?,?,?,?,?,?)').run('Y3JlZA','a',cose,0,'[]','2026-01-01');
 const origin='https://radio.example',env={DB:db,AUTH_ORIGIN:origin},identity={accountId:'a',sessionHash:'session-a',sessionTag:'tag-a',admin:false};
 const handle=makeAccountDeletion(),user=async()=>identity;
 const request=(path,body={},headers={})=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Account-Session':'tag-a',...headers},body:JSON.stringify(body)});
 assert.equal((await handle(request('/api/account/delete/options',{}, {Origin:'https://evil.example'}),env,user)).status,403);
 assert.equal((await handle(request('/api/account/delete/options',{}, {'X-Account-Session':'old'}),env,user)).status,409);
 assert.equal((await handle(request('/api/account/delete/options'),env,async()=>({...identity,admin:true}))).status,403);
 const start=await handle(request('/api/account/delete/options'),env,user),opts=await start.json();
 const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:opts.challenge,origin,crossOrigin:false}));
 const auth=Buffer.concat([createHash('sha256').update('radio.example').digest(),Buffer.from([5,0,0,0,1])]);
 const sig=sign('sha256',Buffer.concat([auth,createHash('sha256').update(client).digest()]),privateKey);
 const response={id:'Y3JlZA',rawId:'Y3JlZA',type:'public-key',clientExtensionResults:{},response:{clientDataJSON:client.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:sig.toString('base64url'),userHandle:null}};
 const other=await handle(request('/api/account/delete/finish',response,{'X-Account-Session':'tag-b'}),env,async()=>({accountId:'b',sessionHash:'session-b',sessionTag:'tag-b'}));assert.equal(other.status,400);
 const finished=await handle(request('/api/account/delete/finish',response),env,user);assert.equal(finished.status,200);assert.match(finished.headers.get('set-cookie'),/Max-Age=0/);
 assert.deepEqual(sql.prepare('SELECT id FROM accounts').all().map(row=>row.id),['b']);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM favorites WHERE account_id=?').get('a').n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM account_sessions WHERE account_id=?').get('a').n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM passkeys WHERE account_id=?').get('a').n,0);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM favorites WHERE account_id=?').get('b').n,1);
 assert.equal((await handle(request('/api/account/delete/finish',response),env,user)).status,400);
 sql.close();
});

test('deletion fails if the session is revoked or the account becomes an admin while verifying',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 for(const change of ['revoke','promote']){
  const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');sql.exec(readFileSync(new URL('../cloudflare/schema.sql',import.meta.url),'utf8'));
  for(const f of readdirSync(new URL('../cloudflare/migrations/',import.meta.url)).sort())sql.exec(readFileSync(new URL('../cloudflare/migrations/'+f,import.meta.url),'utf8'));
  sql.exec("INSERT INTO accounts VALUES ('a'); INSERT INTO account_sessions VALUES ('session','a',9999999999); INSERT INTO passkeys VALUES ('credential','a',x'0102',0,'[]','2026-01-01')");
  const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)||null}}}}}};
  const env={DB:db,AUTH_ORIGIN:'https://radio.example'},identity=async()=>({accountId:'a',sessionHash:'session',sessionTag:'tag',admin:false});
  const deletion=makeAccountDeletion({options:async()=>({challenge:'test'}),verify:async()=>{sql.exec(change==='revoke'?"DELETE FROM account_sessions WHERE token_hash='session'":"INSERT INTO account_admins VALUES ('a')");return {verified:true,authenticationInfo:{newCounter:1}};}});
  const req=(path,body={})=>new Request(env.AUTH_ORIGIN+path,{method:'POST',headers:{Origin:env.AUTH_ORIGIN,'X-Account-Session':'tag','Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await deletion(req('/api/account/delete/options'),env,identity)).status,200);
  assert.equal((await deletion(req('/api/account/delete/finish',{id:'credential'}),env,identity)).status,409);
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM accounts').get().n,1);sql.close();
 }
});
