import {authenticationOptions,verifyAuthentication} from './passkeys.mjs';
import {prepareSession} from './sessions.mjs';

const attemptName='__Host-nagara_passkey_attempt';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const attemptCookie=(value,age)=>`${attemptName}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
const json=(body,status=200,cookie)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
function browserToken(request){
 const values=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(attemptName+'='));
 const value=values.length===1?values[0].slice(attemptName.length+1):'';
 return /^[a-f0-9]{64}$/.test(value)?value:null;
}
async function readBody(request){
 if(!request.body||Number(request.headers.get('content-length'))>16384)throw new Error('invalid body');
 const reader=request.body.getReader(),parts=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error('invalid body');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}

// The Worker does not expose this handler until enrollment, recovery and rate
// limits are implemented. Tests can inject a verifier without modifying routes.
export function makePasskeyLogin({options=authenticationOptions,verify=verifyAuthentication}={}){
 return async function passkeyLogin(request,env){
  const url=new URL(request.url);
  if(!['/api/auth/passkey/options','/api/auth/passkey/verify'].includes(url.pathname))return null;
  if(!env.AUTH_ORIGIN||url.origin!==env.AUTH_ORIGIN||request.headers.get('Origin')!==env.AUTH_ORIGIN)return json({error:'リクエストを確認できません。'},403);
  if(request.method!=='POST')return json({error:'許可されていない操作です。'},405);
  if(url.pathname.endsWith('/options')){
   const result=await options(env.AUTH_ORIGIN),token=hex(crypto.getRandomValues(new Uint8Array(32)));
   await env.DB.prepare('INSERT INTO passkey_login_attempts(browser_token_hash,challenge,expires_at) VALUES (?,?,?)').bind(await hash(token),result.challenge,Math.floor(Date.now()/1000)+300).run();
   return json(result,200,attemptCookie(token,300));
  }
  const token=browserToken(request);if(!token)return json({error:'ログインできませんでした。'},401);
  const attempt=await env.DB.prepare('DELETE FROM passkey_login_attempts WHERE browser_token_hash=? AND expires_at>? RETURNING challenge').bind(await hash(token),Math.floor(Date.now()/1000)).first();
  const expired=attemptCookie('',0);if(!attempt)return json({error:'ログインできませんでした。'},401,expired);
  let response;try{response=await readBody(request);}catch{return json({error:'データが不正です。'},400,expired);}
  if(!response||typeof response.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(response.id))return json({error:'ログインできませんでした。'},401,expired);
  const row=await env.DB.prepare('SELECT p.account_id,p.credential_id,p.public_key,p.sign_count,p.transports,COALESCE(g.generation,0) AS generation FROM passkeys p LEFT JOIN account_auth_generations g ON g.account_id=p.account_id WHERE p.credential_id=?').bind(response.id).first();
  if(!row)return json({error:'ログインできませんでした。'},401,expired);
  let result;try{result=await verify(env.AUTH_ORIGIN,attempt.challenge,response,{id:row.credential_id,publicKey:new Uint8Array(row.public_key),counter:row.sign_count,transports:JSON.parse(row.transports)});}catch{return json({error:'ログインできませんでした。'},401,expired);}
  if(!result.verified)return json({error:'ログインできませんでした。'},401,expired);
  const counter=result.authenticationInfo.newCounter;
  if(!Number.isSafeInteger(counter)||counter<0)return json({error:'ログインできませんでした。'},401,expired);
  const session=await prepareSession();
  const changes=await env.DB.batch([
   env.DB.prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM passkeys p LEFT JOIN account_auth_generations g ON g.account_id=p.account_id WHERE p.credential_id=? AND p.account_id=? AND p.sign_count=? AND COALESCE(g.generation,0)=?) RETURNING token_hash').bind(session.tokenHash,row.account_id,session.expiresAt,row.credential_id,row.account_id,row.sign_count,row.generation),
   env.DB.prepare('UPDATE passkeys SET sign_count=? WHERE credential_id=? AND sign_count=? AND EXISTS (SELECT 1 FROM account_sessions WHERE token_hash=?)').bind(counter,row.credential_id,row.sign_count,session.tokenHash)
  ]);
  if(!changes[0]?.results?.length)return json({error:'ログインできませんでした。'},401,expired);
  const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  headers.append('Set-Cookie',expired);headers.append('Set-Cookie',session.cookie);
  return new Response(JSON.stringify({ok:true}),{status:200,headers});
 };
}
