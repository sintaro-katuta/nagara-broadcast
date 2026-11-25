import {authenticationOptions,verifyAuthentication} from './passkeys.mjs';
import {clearSessionCookie} from './sessions.mjs';

const json=(body,status=200,cookie)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
async function readBody(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||!request.body||Number(request.headers.get('Content-Length'))>16384)throw new Error();
 const reader=request.body.getReader(),parts=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new Error();}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export function makeAccountDeletion({options=authenticationOptions,verify=verifyAuthentication}={}){
 return async function accountDeletion(request,env,verifyIdentity){
  const url=new URL(request.url);if(!['/api/account/delete/options','/api/account/delete/finish'].includes(url.pathname))return null;
  if(request.method!=='POST')return json({error:'許可されていない操作です。'},405);
  if(!env.AUTH_ORIGIN||url.origin!==env.AUTH_ORIGIN||request.headers.get('Origin')!==env.AUTH_ORIGIN)return json({error:'リクエストを確認できません。'},403);
  const identity=await verifyIdentity(request);if(!identity?.accountId||!identity.sessionHash)return json({error:'ログインが必要です。'},401);
  if(!identity.sessionTag||request.headers.get('X-Account-Session')!==identity.sessionTag)return json({error:'アカウントが変更されました。'},409);
  if(identity.admin)return json({error:'管理者アカウントは削除できません。'},403);
  const now=Math.floor(Date.now()/1000),db=env.DB;
  if(url.pathname.endsWith('/options')){
   const value=await options(env.AUTH_ORIGIN);
   const row=await db.prepare('INSERT INTO account_deletion_attempts(session_hash,account_id,challenge,expires_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM account_sessions WHERE token_hash=? AND account_id=? AND expires_at>?) AND NOT EXISTS (SELECT 1 FROM account_admins WHERE account_id=?) ON CONFLICT(session_hash) DO UPDATE SET challenge=excluded.challenge,expires_at=excluded.expires_at RETURNING session_hash').bind(identity.sessionHash,identity.accountId,value.challenge,now+300,identity.sessionHash,identity.accountId,now,identity.accountId).first();
   return row?json(value):json({error:'操作を確認できません。'},401);
  }
  const attempt=await db.prepare('DELETE FROM account_deletion_attempts WHERE session_hash=? AND account_id=? AND expires_at>? RETURNING challenge').bind(identity.sessionHash,identity.accountId,now).first();
  if(!attempt)return json({error:'操作を確認できません。'},400);
  let response;try{response=await readBody(request);}catch{return json({error:'データが不正です。'},400);}
  if(typeof response?.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(response.id))return json({error:'本人確認できませんでした。'},401);
  const credential=await db.prepare('SELECT credential_id,public_key,sign_count,transports FROM passkeys WHERE credential_id=? AND account_id=?').bind(response.id,identity.accountId).first();
  if(!credential)return json({error:'本人確認できませんでした。'},401);
  let result;try{result=await verify(env.AUTH_ORIGIN,attempt.challenge,response,{id:credential.credential_id,publicKey:new Uint8Array(credential.public_key),counter:credential.sign_count,transports:JSON.parse(credential.transports)});}catch{return json({error:'本人確認できませんでした。'},401);}
  if(!result?.verified||!Number.isSafeInteger(result.authenticationInfo?.newCounter)||result.authenticationInfo.newCounter<0)return json({error:'本人確認できませんでした。'},401);
  const deleted=await db.prepare('DELETE FROM accounts WHERE id=? AND NOT EXISTS (SELECT 1 FROM account_admins WHERE account_id=?) AND EXISTS (SELECT 1 FROM account_sessions WHERE token_hash=? AND account_id=? AND expires_at>?) AND EXISTS (SELECT 1 FROM passkeys WHERE credential_id=? AND account_id=? AND sign_count=?) RETURNING id').bind(identity.accountId,identity.accountId,identity.sessionHash,identity.accountId,Math.floor(Date.now()/1000),credential.credential_id,identity.accountId,credential.sign_count).first();
  return deleted?json({ok:true},200,clearSessionCookie()):json({error:'アカウントが変更されました。'},409);
 };
}
