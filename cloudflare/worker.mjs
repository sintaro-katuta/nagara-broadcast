import {validateCaptions} from '../lib/captions.mjs';
import {channels,metadata,parseRange,xml} from '../lib/core.mjs';
import {episodeTitle} from '../public/programs.js';
import {accountApi} from './account-api.mjs';
import {verifySession,revokeSession} from './sessions.mjs';
import {makeAuthRoutes} from './auth-routes.mjs';
import {cleanupExpiredAuth} from './auth-cleanup.mjs';
import {deliverRecoveryNotices} from './recovery-notices.mjs';
import {makeResendEmail,getResendUsage} from './resend-email.mjs';
import {makeAccountDeletion} from './account-deletion.mjs';

const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const publicEpisode=row=>({id:row.id,title:episodeTitle(row),channel:row.channel,description:row.description,source:row.source,duration:row.duration,size:row.size,date:row.date,audio:`/audio/${row.id}.mp3`,demo:false});
const authRoutes=makeAuthRoutes();
const accountDeletion=makeAccountDeletion();
async function authorized(request,env){
 if(typeof env.UPLOAD_SECRET!=='string'||env.UPLOAD_SECRET.length<32)return false;
 const provided=request.headers.get('Authorization')||'';
 const enc=new TextEncoder();
 const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(provided)),crypto.subtle.digest('SHA-256',enc.encode('Bearer '+env.UPLOAD_SECRET))]);
 return crypto.subtle.timingSafeEqual(a,b);
}
async function list(env){
 const {results}=await env.DB.prepare('SELECT id,title,channel,description,source,duration,size,date FROM episodes ORDER BY date DESC LIMIT 1000').all();
 return results.map(publicEpisode);
}
export default {
 async scheduled(controller,env){
  if(controller.cron==='0 * * * *'&&env.AUTH_CLEANUP_ENABLED==='true'){
   const removed=await cleanupExpiredAuth(env.DB,controller.scheduledTime);
   console.log('Expired auth cleanup',JSON.stringify(removed));
  }
  if(controller.cron==='*/5 * * * *'&&env.AUTH_NOTICES_ENABLED==='true'){
   const value=env.AUTH_ENCRYPTION_KEY;if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value))throw new Error('Notification configuration unavailable');
   const result=await deliverRecoveryNotices(env.DB,makeResendEmail(env.RESEND_API_KEY),env.AUTH_EMAIL_FROM,Uint8Array.from(value.match(/../g),x=>parseInt(x,16)));
   console.log('Recovery notices',JSON.stringify(result));
  }
 },
 async fetch(request,env){
  const url=new URL(request.url);
  try{
   if(request.method==='GET'&&url.pathname==='/api/auth/status'){
    const configured=env.AUTH_ENABLED==='true'&&env.PASSKEY_API_ENABLED==='true'&&env.AUTH_NOTICES_ENABLED==='true'&&env.AUTH_ORIGIN===url.origin&&!!makeResendEmail(env.RESEND_API_KEY)&&typeof env.AUTH_EMAIL_FROM==='string'&&['AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY'].every(k=>typeof env[k]==='string'&&/^[a-f0-9]{64}$/i.test(env[k]))&&new Set(['AUTH_RATE_KEY','AUTH_LOOKUP_KEY','AUTH_ENCRYPTION_KEY'].map(k=>env[k].toLowerCase())).size===3;
    return json({available:configured});
   }
   if(env.AUTH_ENABLED==='true'){
    if(env.PASSKEY_API_ENABLED==='true'){
     const response=await authRoutes(request,{...env,EMAIL:makeResendEmail(env.RESEND_API_KEY)});if(response)return response;
     const deletion=await accountDeletion(request,env,req=>verifySession(req,env.DB));if(deletion)return deletion;
    }
    if(url.pathname==='/api/auth/logout'&&request.method==='POST'){
     if(request.headers.get('Origin')!==url.origin)return json({error:'リクエストを確認できません。'},403);
     const identity=await verifySession(request,env.DB);
     if(!identity)return json({error:'ログインが必要です。'},401);
     if(request.headers.get('X-Account-Session')!==identity.sessionTag)return json({error:'アカウントが変更されました。'},409);
     const cookie=await revokeSession(request,env.DB);
     return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Set-Cookie':cookie}});
    }
    const accountResponse=await accountApi(request,env.DB,req=>verifySession(req,env.DB),{
     getUsage:()=>getResendUsage(env.RESEND_USAGE_API_KEY),
     getNoticeStatus:async()=>{try{const row=await env.DB.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN blocked_at IS NOT NULL THEN 1 ELSE 0 END),0) AS blocked FROM recovery_notice_outbox').first();return {waiting:row.total-row.blocked,blocked:row.blocked};}catch{return null;}}
    });if(accountResponse)return accountResponse;
   }
   if(request.method==='GET'&&url.pathname==='/api/episodes'){
    const episodes=await list(env);return json({episodes,channels,storageBytes:episodes.reduce((n,x)=>n+x.size,0)});
   }
   if(request.method==='GET'&&url.pathname==='/api/health')return json({ok:true,mode:'cloudflare'});
   if(request.method==='POST'&&url.pathname==='/api/episodes'){
    if(!await authorized(request,env))return json({error:'認証が必要です。'},401);
    let meta;try{meta=metadata(url.searchParams);}catch(e){return json({error:e.message},400);}
    if(!(request.headers.get('content-type')||'').startsWith('audio/mpeg'))return json({error:'MP3を指定してください。'},415);
    const length=Number(request.headers.get('content-length'));
    if(!Number.isSafeInteger(length)||length<3||length>20*1024*1024)return json({error:'3バイト以上20 MiB以下のMP3を指定してください。'},413);
    const key=request.headers.get('X-Episode-Key');
    if(key&&!/^\d{4}-\d{2}-\d{2}$/.test(key))return json({error:'エピソードキーが正しくありません。'},400);
    const id=key?'daily-'+key:crypto.randomUUID();
    const existing=await env.DB.prepare('SELECT id,title,channel,description,source,duration,size,date FROM episodes WHERE id=?').bind(id).first();
    if(existing)return json(publicEpisode(existing));
    const body=await request.arrayBuffer();
    const bytes=new Uint8Array(body);
    if(bytes.length!==length||!(bytes[0]===73&&bytes[1]===68&&bytes[2]===51||bytes[0]===255&&(bytes[1]&224)===224))return json({error:'MP3を確認できません。'},415);
    const objectKey=`audio/${id}-${crypto.randomUUID()}.mp3`;
    await env.AUDIO.put(objectKey,body,{httpMetadata:{contentType:'audio/mpeg'}});
    const date=new Date().toISOString();
    await env.DB.prepare('INSERT OR IGNORE INTO episodes (id,title,channel,description,source,duration,size,date,object_key) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,meta.title,meta.channel,meta.description,meta.source,meta.duration,length,date,objectKey).run();
    const row=await env.DB.prepare('SELECT id,title,channel,description,source,duration,size,date FROM episodes WHERE id=?').bind(id).first();
    return json(publicEpisode(row),201);
   }
   const captions=/^\/api\/episodes\/([\w-]+)\/captions$/.exec(url.pathname);
   if(captions&&['GET','PUT'].includes(request.method)){
    if(request.method==='PUT'&&!await authorized(request,env))return json({error:'認証が必要です。'},401);
    const row=await env.DB.prepare('SELECT id FROM episodes WHERE id=?').bind(captions[1]).first();
    if(!row)return json({error:'エピソードが見つかりません。'},404);
    const key=`captions/${captions[1]}.json`;
    if(request.method==='GET'){const object=await env.AUDIO.get(key);if(!object)return json({error:'字幕がありません。'},404);return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
    if(Number(request.headers.get('content-length'))>1000000)return json({error:'字幕が大きすぎます。'},413);
    const body=await request.text();if(body.length>1000000)return json({error:'字幕が大きすぎます。'},413);
    try{validateCaptions(JSON.parse(body));}catch{return json({error:'字幕データが不正です。'},400);}
    await env.AUDIO.put(key,body,{httpMetadata:{contentType:'application/json'}});return json({ok:true});
   }
   const match=/^\/audio\/([\w-]+)\.mp3$/.exec(url.pathname);
   if(match&&['GET','HEAD'].includes(request.method)){
    const row=await env.DB.prepare('SELECT object_key,size FROM episodes WHERE id=?').bind(match[1]).first();
    if(!row)return json({error:'音声が見つかりません。'},404);
    const range=parseRange(request.headers.get('Range'),row.size);
    if(range===false)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${row.size}`}});
    const start=range?.start??0,end=range?.end??row.size-1;
    const headers={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
    if(range)headers['Content-Range']=`bytes ${start}-${end}/${row.size}`;
    if(request.method==='HEAD')return new Response(null,{status:range?206:200,headers});
    const object=await env.AUDIO.get(row.object_key,range?{range:{offset:start,length:end-start+1}}:undefined);
    if(!object)return json({error:'音声が見つかりません。'},404);
    return new Response(object.body,{status:range?206:200,headers});
   }
   if(request.method==='GET'&&url.pathname==='/feed.xml'){
    const episodes=await list(env),base=url.origin;
    const items=episodes.map(e=>`<item><title>${xml(e.title)}</title><description>${xml(e.description)}</description><guid isPermaLink="false">${xml(e.id)}</guid><pubDate>${new Date(e.date).toUTCString()}</pubDate><enclosure url="${xml(base+e.audio)}" length="${e.size}" type="audio/mpeg"/></item>`).join('');
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>ながら放送</title><link>${xml(base)}</link><description>いつもの時間に、気ままな声を。</description><language>ja</language>${items}</channel></rss>`,{headers:{'Content-Type':'application/rss+xml; charset=utf-8'}});
   }
   if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/audio/'))return json({error:'見つかりません。'},404);
   return env.ASSETS.fetch(request);
  }catch(e){console.error(e);return json({error:'処理に失敗しました。'},500);}
 }
};
