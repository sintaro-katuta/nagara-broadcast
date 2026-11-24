import {registrationOptions,verifyRegistration} from './passkeys.mjs';
import {verifySession} from './sessions.mjs';

const cookieName='__Host-nagara_registration';
const enc=new TextEncoder();
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const cookie=(v,age)=>`${cookieName}=${v}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
const json=(v,status=200,c)=>Response.json(v,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(c?{'Set-Cookie':c}:{})}});
function readCookie(request){const parts=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookieName+'='));const value=parts.length===1?parts[0].slice(cookieName.length+1):'';return /^[a-f0-9]{64}$/.test(value)?value:null;}
async function readBody(request){
 if(!request.body||Number(request.headers.get('Content-Length'))>16384)throw new Error('invalid body');
 const reader=request.body.getReader(),chunks=[];let length=0;
 for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>16384){await reader.cancel();throw new Error('invalid body');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
// This is for adding a credential to an already authenticated account only.
// Initial enrollment and email recovery require separate verified authorization.
// This handler remains disconnected until recent authentication, rate limits,
// email notifications and management controls are available.
export function makePasskeyRegistration({session=verifySession,options=registrationOptions,verify=verifyRegistration}={}){
 return async function register(request,env){
  const url=new URL(request.url);if(!['/api/auth/passkey/register/options','/api/auth/passkey/register/verify'].includes(url.pathname))return null;
  if(!env.AUTH_ORIGIN||url.origin!==env.AUTH_ORIGIN||request.headers.get('Origin')!==env.AUTH_ORIGIN)return json({error:'リクエストを確認できません。'},403);
  if(request.method!=='POST')return json({error:'許可されていない操作です。'},405);
  const identity=await session(request,env.DB);if(!identity?.accountId)return json({error:'ログインが必要です。'},401);
  if(url.pathname.endsWith('/options')){
   const {results}=await env.DB.prepare('SELECT credential_id FROM passkeys WHERE account_id=? LIMIT 21').bind(identity.accountId).all();
   if(results.length>=20)return json({error:'パスキーの登録数が上限です。'},409);
   const value=await options(env.AUTH_ORIGIN,identity.accountId,results.map(x=>x.credential_id));
   const token=hex(crypto.getRandomValues(new Uint8Array(32)));
   await env.DB.prepare('INSERT INTO passkey_registration_attempts(browser_token_hash,account_id,challenge,expires_at) VALUES (?,?,?,?)').bind(await hash(token),identity.accountId,value.challenge,Math.floor(Date.now()/1000)+300).run();
   return json(value,200,cookie(token,300));
  }
  const token=readCookie(request);if(!token)return json({error:'登録を確認できません。'},401);
  const attempt=await env.DB.prepare('DELETE FROM passkey_registration_attempts WHERE browser_token_hash=? AND account_id=? AND expires_at>? RETURNING challenge').bind(await hash(token),identity.accountId,Math.floor(Date.now()/1000)).first();
  const clear=cookie('',0);if(!attempt)return json({error:'登録を確認できません。'},401,clear);
  let response;try{response=await readBody(request);}catch{return json({error:'データが不正です。'},400,clear);}
  let result;try{result=await verify(env.AUTH_ORIGIN,attempt.challenge,response);}catch{return json({error:'登録できませんでした。'},400,clear);}
  if(!result.verified||!result.registrationInfo?.credential)return json({error:'登録できませんでした。'},400,clear);
  const credential=result.registrationInfo.credential;
  if(typeof credential.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(credential.id)||!(credential.publicKey instanceof Uint8Array)||!Number.isSafeInteger(credential.counter)||credential.counter<0)return json({error:'登録できませんでした。'},400,clear);
  try{const inserted=await env.DB.prepare('INSERT INTO passkeys(credential_id,account_id,public_key,sign_count,transports,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM passkeys WHERE account_id=?)<20 RETURNING credential_id').bind(credential.id,identity.accountId,credential.publicKey,credential.counter,JSON.stringify(credential.transports||[]),new Date().toISOString(),identity.accountId).first();if(!inserted)return json({error:'パスキーの登録数が上限です。'},409,clear);}catch{return json({error:'登録できませんでした。'},400,clear);}
  return json({ok:true},200,clear);
 };
}
