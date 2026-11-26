import {getAccountData,setFavorite,setListeningPosition,clearListeningHistory} from './account-data.mjs';
import {storageSummary} from './storage-summary.mjs';

const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readLimitedJson(request) {
 if(!request.body)throw new SyntaxError('empty body');
 const reader=request.body.getReader(),chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();throw new RangeError('body too large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
// verifyIdentity must verify the credential and return a server-derived accountId
// and admin flag. This module is not routed until a real verifier is installed.
export async function accountApi(request,db,verifyIdentity,{getUsage=async()=>null,getNoticeStatus=async()=>null}={}) {
 const url=new URL(request.url);
 if(!['/api/account','/api/account/favorite','/api/account/history','/api/admin/storage','/api/admin/usage','/api/admin/notices/retry'].includes(url.pathname))return null;
 const identity=await verifyIdentity(request);
 if(!identity?.accountId)return json({error:'ログインが必要です。'},401);
 if(request.method!=='GET'&&request.headers.get('Origin')!==url.origin)return json({error:'リクエストを確認できません。'},403);
 if(request.method!=='GET'&&(!identity.sessionTag||request.headers.get('X-Account-Session')!==identity.sessionTag))return json({error:'アカウントが変更されました。'},409);
 if(url.pathname.startsWith('/api/admin/')){
  if(identity.admin!==true)return json({error:'権限がありません。'},403);
  if(url.pathname==='/api/admin/notices/retry'){
   if(request.method!=='POST')return json({error:'許可されていない操作です。'},405);
   const now=Math.floor(Date.now()/1000);
   const result=await db.prepare('UPDATE recovery_notice_outbox SET blocked_at=NULL,blocked_reason=NULL,attempts=0,next_attempt_at=? WHERE id IN (SELECT id FROM recovery_notice_outbox WHERE blocked_at IS NOT NULL AND lease_until<=? ORDER BY blocked_at,id LIMIT 10)').bind(now,now).run();
   return json({queued:result.meta?.changes??result.changes??0});
  }
  if(request.method!=='GET')return json({error:'許可されていない操作です。'},405);
  if(url.pathname==='/api/admin/usage'){
   if(request.headers.get('X-Account-Session')!==identity.sessionTag)return json({error:'アカウントが変更されました。'},409);
   const [storage,resend,notices]=await Promise.all([storageSummary(db),getUsage(),getNoticeStatus()]);return json({storage:{bytes:storage.bytes,count:storage.count},resend,notices});
  }
  return json(await storageSummary(db));
 }
 if(url.pathname==='/api/account'&&request.method==='GET')return json({...await getAccountData(db,identity.accountId),sessionTag:identity.sessionTag,admin:identity.admin===true});
 if(url.pathname==='/api/account/history'&&request.method==='DELETE'){
  await clearListeningHistory(db,identity.accountId);return json({ok:true});
 }
 if(request.method!=='PUT'||!['/api/account/favorite','/api/account/history'].includes(url.pathname))return json({error:'許可されていない操作です。'},405);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return json({error:'JSONが必要です。'},415);
 if(Number(request.headers.get('Content-Length'))>1024)return json({error:'データが大きすぎます。'},413);
 let body;try{body=await readLimitedJson(request);}catch(error){return json({error:'データが不正です。'},error instanceof RangeError?413:400);}
 if(!body||typeof body!=='object'||Array.isArray(body)||typeof body.episodeId!=='string'||!/^[-\w]{1,100}$/.test(body.episodeId))return json({error:'エピソードが不正です。'},400);
 const episode=await db.prepare('SELECT id FROM episodes WHERE id=?').bind(body.episodeId).first();
 if(!episode)return json({error:'エピソードが見つかりません。'},404);
 if(url.pathname==='/api/account/favorite'){
  if(typeof body.enabled!=='boolean')return json({error:'指定が不正です。'},400);
  await setFavorite(db,identity.accountId,body.episodeId,body.enabled);
 }else{
  if(typeof body.positionSeconds!=='number'||!Number.isFinite(body.positionSeconds)||body.positionSeconds<0||body.positionSeconds>604800)return json({error:'再生位置が不正です。'},400);
  if(typeof body.writerId!=='string'||!/^[-a-zA-Z0-9_]{16,80}$/.test(body.writerId)||!Number.isSafeInteger(body.sequence)||body.sequence<1)return json({error:'再生位置の更新が不正です。'},400);
  if(!Number.isSafeInteger(body.historyGeneration)||body.historyGeneration<0)return json({error:'再生履歴の状態が不正です。'},400);
  if(!await setListeningPosition(db,identity.accountId,body.episodeId,body.positionSeconds,body.writerId,body.sequence,body.historyGeneration))return json({error:'再生履歴が変更されました。'},409);
 }
 return json({ok:true});
}
