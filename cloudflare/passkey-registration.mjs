import {registrationOptions,verifyRegistration,authenticationOptions,verifyAuthentication} from './passkeys.mjs';
import {verifySession} from './sessions.mjs';
import {rateLimitKey,consumeRateLimit} from './auth-rate-limit.mjs';

const cookieName='__Host-nagara_registration';
const enc=new TextEncoder();
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const cookie=(v,age)=>`${cookieName}=${v}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
const json=(v,status=200,c)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(c?{'Set-Cookie':c}:{})}});
function readCookie(request){const parts=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));const value=parts.length===1?parts[0].slice(cookieName.length+1):'';return /^[a-f0-9]{64}$/.test(value)?value:null;}
async function readBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||!request.body||Number(request.headers.get('Content-Length'))>16384)throw new Error('invalid body');
 const reader=request.body.getReader(),chunks=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();throw new Error('invalid body');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
// This is for adding a credential to an already authenticated account only.
// Initial enrollment and email recovery require separate verified authorization.
// The handler is separately feature-flagged; keep it disabled until the full
// recovery, device-management and real-device release checks are complete.
export function makePasskeyRegistration({session=verifySession,options=registrationOptions,verify=verifyRegistration,authOptions=authenticationOptions,authVerify=verifyAuthentication,rateLimit=async(db,secret,id)=>{if(typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret))throw new Error('rate key unavailable');const key=await rateLimitKey(Uint8Array.from(secret.match(/../g),x=>parseInt(x,16)),'account','passkey-add:'+id);return consumeRateLimit(db,key,30,3600);}}={}){
 return async function register(request,env){
  const url=new URL(request.url);if(!['/api/auth/passkey/register/reauth-options','/api/auth/passkey/register/reauth-verify','/api/auth/passkey/register/options','/api/auth/passkey/register/verify'].includes(url.pathname))return null;
  if(!env.AUTH_ORIGIN||url.origin!==env.AUTH_ORIGIN||request.headers.get('Origin')!==env.AUTH_ORIGIN)return json({error:'リクエストを確認できません。'},403);
  if(request.method!=='POST')return json({error:'許可されていない操作です。'},405);
  const identity=await session(request,env.DB);if(!identity?.accountId)return json({error:'ログインが必要です。'},401);
  if(!identity.sessionHash||!identity.sessionTag||request.headers.get('X-Account-Session')!==identity.sessionTag)return json({error:'アカウントが変更されました。'},409);
  const limit=await rateLimit(env.DB,env.AUTH_RATE_KEY,identity.accountId);if(!limit.allowed)return json({error:'時間をおいてもう一度お試しください。'},429);
  if(url.pathname.endsWith('/reauth-options')){
   const value=await authOptions(env.AUTH_ORIGIN),token=hex(crypto.getRandomValues(new Uint8Array(32)));
   await env.DB.prepare('INSERT INTO passkey_registration_attempts(browser_token_hash,account_id,challenge,expires_at) VALUES (?,?,?,?)').bind(await hash(token+':'+identity.sessionHash),identity.accountId,'auth:'+value.challenge,Math.floor(Date.now()/1000)+300).run();
   return json(value,200,cookie(token,300));
  }
  if(url.pathname.endsWith('/reauth-verify')){
   const token=readCookie(request);if(!token)return json({error:'本人確認できませんでした。'},401);
   const key=await hash(token+':'+identity.sessionHash),now=Math.floor(Date.now()/1000);
   const attempt=await env.DB.prepare("DELETE FROM passkey_registration_attempts WHERE browser_token_hash=? AND account_id=? AND expires_at>? AND challenge LIKE 'auth:%' RETURNING challenge,expires_at").bind(key,identity.accountId,now).first();
   if(!attempt)return json({error:'本人確認できませんでした。'},401,cookie('',0));
   let response;try{response=await readBody(request);}catch{return json({error:'データが不正です。'},400,cookie('',0));}
   if(typeof response?.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(response.id))return json({error:'本人確認できませんでした。'},401,cookie('',0));
   const credential=await env.DB.prepare('SELECT credential_id,public_key,sign_count,transports FROM passkeys WHERE credential_id=? AND account_id=?').bind(response.id,identity.accountId).first();
   if(!credential)return json({error:'本人確認できませんでした。'},401,cookie('',0));
   let result;try{result=await authVerify(env.AUTH_ORIGIN,attempt.challenge.slice(5),response,{id:credential.credential_id,publicKey:new Uint8Array(credential.public_key),counter:credential.sign_count,transports:JSON.parse(credential.transports)});}catch{return json({error:'本人確認できませんでした。'},401,cookie('',0));}
   const counter=result?.authenticationInfo?.newCounter,verifiedAt=Math.floor(Date.now()/1000);if(!result?.verified||!Number.isSafeInteger(counter)||counter<0||attempt.expires_at<=verifiedAt)return json({error:'本人確認できませんでした。'},401,cookie('',0));
   const results=await env.DB.batch([
    env.DB.prepare("INSERT INTO passkey_registration_attempts(browser_token_hash,account_id,challenge,expires_at) SELECT ?,?,'verified',? WHERE EXISTS (SELECT 1 FROM account_sessions WHERE token_hash=? AND account_id=? AND expires_at>?) AND EXISTS (SELECT 1 FROM passkeys WHERE credential_id=? AND account_id=? AND sign_count=?) RETURNING account_id").bind(key,identity.accountId,verifiedAt+300,identity.sessionHash,identity.accountId,verifiedAt,credential.credential_id,identity.accountId,credential.sign_count),
    env.DB.prepare('UPDATE passkeys SET sign_count=? WHERE credential_id=? AND account_id=? AND sign_count=? AND EXISTS (SELECT 1 FROM passkey_registration_attempts WHERE browser_token_hash=? AND account_id=?)').bind(counter,credential.credential_id,identity.accountId,credential.sign_count,key,identity.accountId)
   ]);
   return results[0]?.results?.length?json({ok:true}):json({error:'本人確認できませんでした。'},401,cookie('',0));
  }
  if(url.pathname.endsWith('/options')){
   const token=readCookie(request);if(!token)return json({error:'本人確認が必要です。'},401);
   const proof=await env.DB.prepare("DELETE FROM passkey_registration_attempts WHERE browser_token_hash=? AND account_id=? AND expires_at>? AND challenge='verified' RETURNING account_id,expires_at").bind(await hash(token+':'+identity.sessionHash),identity.accountId,Math.floor(Date.now()/1000)).first();
   if(!proof)return json({error:'本人確認が必要です。'},401,cookie('',0));
   const {results}=await env.DB.prepare('SELECT credential_id FROM passkeys WHERE account_id=? LIMIT 21').bind(identity.accountId).all();
   if(results.length>=20)return json({error:'パスキーの登録数が上限です。'},409);
   const value=await options(env.AUTH_ORIGIN,identity.accountId,results.map(x=>x.credential_id));
   const now=Math.floor(Date.now()/1000);if(proof.expires_at<=now)return json({error:'本人確認の有効期限が切れました。'},401,cookie('',0));
   const created=await env.DB.prepare('INSERT INTO passkey_registration_attempts(browser_token_hash,account_id,challenge,expires_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM account_sessions WHERE token_hash=? AND account_id=? AND expires_at>?) RETURNING account_id').bind(await hash(token+':'+identity.sessionHash),identity.accountId,value.challenge,now+300,identity.sessionHash,identity.accountId,now).first();
   if(!created)return json({error:'ログインが必要です。'},401,cookie('',0));
   return json(value,200,cookie(token,300));
  }
  const token=readCookie(request);if(!token)return json({error:'登録を確認できません。'},401);
  const attempt=await env.DB.prepare("DELETE FROM passkey_registration_attempts WHERE browser_token_hash=? AND account_id=? AND expires_at>? AND challenge<>'verified' AND challenge NOT LIKE 'auth:%' RETURNING challenge,expires_at").bind(await hash(token+':'+identity.sessionHash),identity.accountId,Math.floor(Date.now()/1000)).first();
  const clear=cookie('',0);if(!attempt)return json({error:'登録を確認できません。'},401,clear);
  let response;try{response=await readBody(request);}catch{return json({error:'データが不正です。'},400,clear);}
  let result;try{result=await verify(env.AUTH_ORIGIN,attempt.challenge,response);}catch{return json({error:'登録できませんでした。'},400,clear);}
  if(!result.verified||!result.registrationInfo?.credential||attempt.expires_at<=Math.floor(Date.now()/1000))return json({error:'登録できませんでした。'},400,clear);
  const credential=result.registrationInfo.credential;
  if(typeof credential.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(credential.id)||!(credential.publicKey instanceof Uint8Array)||!Number.isSafeInteger(credential.counter)||credential.counter<0)return json({error:'登録できませんでした。'},400,clear);
  const now=Math.floor(Date.now()/1000);
  try{
   const results=await env.DB.batch([
    env.DB.prepare('INSERT INTO passkeys(credential_id,account_id,public_key,sign_count,transports,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM passkeys WHERE account_id=?)<20 AND EXISTS (SELECT 1 FROM account_sessions WHERE token_hash=? AND account_id=? AND expires_at>?) AND EXISTS (SELECT 1 FROM recovery_emails WHERE account_id=?) RETURNING credential_id').bind(credential.id,identity.accountId,credential.publicKey,credential.counter,JSON.stringify(credential.transports||[]),new Date(now*1000).toISOString(),identity.accountId,identity.sessionHash,identity.accountId,now,identity.accountId),
    env.DB.prepare('INSERT INTO recovery_notice_outbox(id,account_id,created_at,next_attempt_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM passkeys WHERE credential_id=? AND account_id=?)').bind('passkey-add:'+crypto.randomUUID(),identity.accountId,now,now,credential.id,identity.accountId)
   ]);
   if(!results[0]?.results?.length)return json({error:'セッションまたは登録数を確認してください。'},409,clear);
  }catch{return json({error:'登録できませんでした。'},400,clear);}
  return json({ok:true},200,clear);
 };
}
