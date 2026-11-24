import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {oauth} from '../cloudflare/oauth.mjs';
import {generateKeyPair,exportJWK,exportPKCS8,SignJWT} from 'jose';
const sqlite=await import('node:sqlite').catch(()=>null);
test('OAuth starts with one-time state and fails closed on forged callbacks', {skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');
 for(const file of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_oauth_states.sql'])sql.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){return {async run(){return sql.prepare(query).run(...args)},async first(){return sql.prepare(query).get(...args)||null}}}}}};
 const env={DB:db,AUTH_ORIGIN:'https://radio.example',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'secret',APPLE_CLIENT_ID:'apple',APPLE_TEAM_ID:'team',APPLE_KEY_ID:'key',APPLE_PRIVATE_KEY:'test'};
 assert.equal((await oauth(new Request('https://evil.example/api/auth/google/start'),env)).status,503);
 const start=await oauth(new Request('https://radio.example/api/auth/google/start'),env);
 const location=new URL(start.headers.get('Location'));
 assert.equal(location.searchParams.get('scope'),'openid');assert.equal(location.searchParams.get('code_challenge_method'),'S256');
 const state=location.searchParams.get('state'),cookie=start.headers.get('Set-Cookie').split(';')[0];
 assert.ok(state);assert.match(cookie,/^__Host-nagara_oauth=/);
 const invalid=await oauth(new Request('https://radio.example/api/auth/google/callback?state=bad&code=x',{headers:{Cookie:cookie}}),env);
 assert.equal(invalid.headers.get('Location'),'/?login=failed');
 const apple=await oauth(new Request('https://radio.example/api/auth/apple/start'),env);
 const appleUrl=new URL(apple.headers.get('Location'));assert.equal(appleUrl.searchParams.get('response_mode'),'query');assert.equal(appleUrl.searchParams.has('scope'),false);
 const originalFetch=globalThis.fetch;let callback;
 try{globalThis.fetch=async()=>new Response(null,{status:400});callback=await oauth(new Request('https://radio.example/api/auth/google/callback?state='+state+'&code=x',{headers:{Cookie:cookie}}),env);}finally{globalThis.fetch=originalFetch;}
 assert.equal(callback.headers.get('Location'),'/?login=failed');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM oauth_states WHERE provider=?').get('google').n,0);
 sql.close();
});

test('valid Apple identity creates a session without requesting profile scope',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_oauth_states.sql'])sql.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){return {async run(){return sql.prepare(query).run(...args)},async first(){return sql.prepare(query).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{for(const item of items)await item.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
 const clientKey=await generateKeyPair('ES256',{extractable:true});
 const env={DB:db,AUTH_ORIGIN:'https://radio.example',APPLE_CLIENT_ID:'apple-client',APPLE_TEAM_ID:'team',APPLE_KEY_ID:'key',APPLE_PRIVATE_KEY:await exportPKCS8(clientKey.privateKey)};
 const start=await oauth(new Request('https://radio.example/api/auth/apple/start'),env),location=new URL(start.headers.get('Location'));
 const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='apple-test-key';jwk.alg='RS256';
 const token=await new SignJWT({nonce:location.searchParams.get('nonce')}).setProtectedHeader({alg:'RS256',kid:'apple-test-key'}).setIssuer('https://appleid.apple.com').setAudience('apple-client').setSubject('apple-subject').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const originalFetch=globalThis.fetch;let callback;
 try{globalThis.fetch=async url=>String(url).includes('/token')?Response.json({id_token:token}):Response.json({keys:[jwk]});callback=await oauth(new Request('https://radio.example/api/auth/apple/callback?state='+location.searchParams.get('state')+'&code=test',{headers:{Cookie:start.headers.get('Set-Cookie').split(';')[0]}}),env);}finally{globalThis.fetch=originalFetch;}
 assert.equal(callback.headers.get('Location'),'/');assert.match(callback.headers.get('Set-Cookie'),/__Host-nagara_session=/);
 assert.equal(sql.prepare('SELECT subject FROM account_identities').get().subject,'apple-subject');
 sql.close();
});

test('valid Google identity creates a session without storing profile data',{skip:!sqlite&&'node:sqlite unavailable'},async()=>{
 const sql=new sqlite.DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of ['../cloudflare/schema.sql','../cloudflare/migrations/0001_account_data.sql','../cloudflare/migrations/0002_identity_sessions.sql','../cloudflare/migrations/0003_oauth_states.sql'])sql.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){return {async run(){return sql.prepare(query).run(...args)},async first(){return sql.prepare(query).get(...args)||null}}}}},async batch(items){sql.exec('BEGIN');try{for(const item of items)await item.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}};
 const env={DB:db,AUTH_ORIGIN:'https://radio.example',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'secret'};
 const start=await oauth(new Request('https://radio.example/api/auth/google/start'),env),location=new URL(start.headers.get('Location'));
 const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);jwk.kid='test-key';jwk.alg='RS256';
 const token=await new SignJWT({nonce:location.searchParams.get('nonce')}).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuer('https://accounts.google.com').setAudience('test').setSubject('provider-subject').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const originalFetch=globalThis.fetch;let callback;
 try{
  globalThis.fetch=async url=>String(url).includes('/token')?Response.json({id_token:token}):Response.json({keys:[jwk]});
  callback=await oauth(new Request('https://radio.example/api/auth/google/callback?state='+location.searchParams.get('state')+'&code=test',{headers:{Cookie:start.headers.get('Set-Cookie').split(';')[0]}}),env);
 }finally{globalThis.fetch=originalFetch;}
 assert.equal(callback.headers.get('Location'),'/');assert.match(callback.headers.get('Set-Cookie'),/__Host-nagara_session=/);
 assert.equal(sql.prepare('SELECT subject FROM account_identities').get().subject,'provider-subject');
 assert.equal(sql.prepare('SELECT count(*) AS n FROM account_sessions').get().n,1);
 sql.close();
});
