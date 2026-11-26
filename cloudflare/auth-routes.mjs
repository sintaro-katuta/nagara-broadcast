import {makePasskeyLogin} from './passkey-login.mjs';
import {makeEnrollment} from './passkey-enrollment.mjs';
import {makeRecovery} from './passkey-recovery.mjs';
import {makeAdminRecovery} from './admin-recovery.mjs';
import {makePasskeyRegistration} from './passkey-registration.mjs';
import {sendEnrollmentEmail} from './enrollment-email.mjs';
import {sendRecoveryEmail,sendAdminRecoveryEmail} from './recovery-email.mjs';
import {normalizeEmail} from './recovery-crypto.mjs';
import {rateLimitKey,consumeRateLimit,MAIL_POOLS} from './auth-rate-limit.mjs';

const paths=new Set(['/api/auth/passkey/options','/api/auth/passkey/verify','/api/auth/passkey/register/reauth-options','/api/auth/passkey/register/reauth-verify','/api/auth/passkey/register/options','/api/auth/passkey/register/verify','/api/auth/enroll/start','/api/auth/enroll/confirm','/api/auth/enroll/options','/api/auth/enroll/finish','/api/auth/recovery/start','/api/auth/recovery/confirm','/api/auth/recovery/options','/api/auth/recovery/finish','/api/auth/admin-recovery/start','/api/auth/admin-recovery/confirm','/api/auth/admin-recovery/status','/api/auth/admin-recovery/cancel','/api/auth/admin-recovery/options','/api/auth/admin-recovery/finish']);
const names={enroll:'__Host-nagara_enroll',recovery:'__Host-nagara_recovery','admin-recovery':'__Host-nagara_admin_recovery'};
const cookie=(name,value,age)=>`${name}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
const json=(value,status=200,c)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...(c?{'Set-Cookie':c}:{})}});
function tokenCookie(request,name){const parts=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));const value=parts.length===1?parts[0].slice(name.length+1):'';return /^[a-f0-9]{64}$/.test(value)?value:null;}
function key(s){if(typeof s!=='string'||!/^[a-f0-9]{64}$/i.test(s))throw new Error('configuration unavailable');return Uint8Array.from(s.match(/../g),x=>parseInt(x,16));}
async function body(request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||'')||!request.body||Number(request.headers.get('Content-Length'))>16384)throw new TypeError('invalid request');
 const reader=request.body.getReader(),parts=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();throw new TypeError('invalid request');}parts.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('invalid request');return value;
}

// Not routed to production until the feature flag and release prerequisites
// (including notifications, cleanup and real-service tests) are complete.
export function makeAuthRoutes({login=makePasskeyLogin(),registration=makePasskeyRegistration(),enrollment=makeEnrollment(),recovery=makeRecovery(),adminRecovery=makeAdminRecovery(),sendEnroll=sendEnrollmentEmail,sendRecovery=sendRecoveryEmail,sendAdminRecovery=sendAdminRecoveryEmail}={}){
 return async function authRoutes(request,env,ctx){
  const url=new URL(request.url),path=url.pathname;if(!paths.has(path))return null;
  if(request.method!=='POST')return json({error:'許可されていない操作です。'},405);
  let origin;try{origin=new URL(env.AUTH_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.AUTH_ORIGIN||origin.username||origin.password)throw new Error();}catch{return json({error:'認証は準備中です。'},503);}
  if(url.origin!==origin.origin||request.headers.get('Origin')!==origin.origin)return json({error:'リクエストを確認できません。'},403);
  let rateKey;try{rateKey=key(env.AUTH_RATE_KEY);}catch{return json({error:'認証は準備中です。'},503);}
  const ip=request.headers.get('CF-Connecting-IP');if(!ip||!/^[:.0-9a-f]{2,45}$/i.test(ip))return json({error:'リクエストを確認できません。'},403);
  try{
   const client=await rateLimitKey(rateKey,'client',ip),limit=await consumeRateLimit(env.DB,client,60,300);
   if(!limit.allowed)return json({error:'時間をおいてもう一度お試しください。'},429);
   if(path==='/api/auth/passkey/options'||path==='/api/auth/passkey/verify')return login(request,env);
   if(path.startsWith('/api/auth/passkey/register/')){
    try{if(env.PASSKEY_ADD_ENABLED!=='true'||env.AUTH_NOTICES_ENABLED!=='true'||typeof env.EMAIL?.send!=='function')throw new Error();normalizeEmail(env.AUTH_EMAIL_FROM);key(env.AUTH_ENCRYPTION_KEY);}catch{return json({error:'パスキー追加は準備中です。'},503);}
    return await registration(request,env);
   }
   const type=path.includes('/enroll/')?'enroll':path.includes('/admin-recovery/')?'admin-recovery':'recovery',service=type==='enroll'?enrollment:type==='admin-recovery'?adminRecovery:recovery;
   if(type==='admin-recovery'&&(env.ADMIN_RECOVERY_ENABLED!=='true'||env.AUTH_NOTICES_ENABLED!=='true'))return json({error:'管理者の復旧は準備中です。'},503);
   const operation=path.slice(path.lastIndexOf('/')+1);
   let data;try{data=await body(request);}catch{return json({error:'データが不正です。'},400);}
   if(operation==='start'){
    let email,lookup,encryption;
    try{email=normalizeEmail(data.email);lookup=key(env.AUTH_LOOKUP_KEY);encryption=key(env.AUTH_ENCRYPTION_KEY);if(env.AUTH_LOOKUP_KEY.toLowerCase()===env.AUTH_ENCRYPTION_KEY.toLowerCase()||env.AUTH_LOOKUP_KEY.toLowerCase()===env.AUTH_RATE_KEY.toLowerCase()||env.AUTH_ENCRYPTION_KEY.toLowerCase()===env.AUTH_RATE_KEY.toLowerCase()||!env.EMAIL||!env.AUTH_EMAIL_FROM)throw new Error();}
    catch{return json({error:'入力内容または設定を確認してください。'},400);}
    // Separate pools keep enrollment traffic from consuming the recovery
    // allowance. These are application caps, not a provider quota guarantee.
    const addressKey=await rateLimitKey(rateKey,'destination',`${type}\0${email}`),addressLimit=await consumeRateLimit(env.DB,addressKey,3,3600);
    const senderKey=await rateLimitKey(rateKey,'client',`mail:${type}:${ip}`),senderLimit=await consumeRateLimit(env.DB,senderKey,10,3600);
    const reserve=async()=>{const poolKey=await rateLimitKey(rateKey,'account',`mail-pool:${type}`);return (await consumeRateLimit(env.DB,poolKey,MAIL_POOLS[type],86400)).allowed;};
    const deliver=async()=>{if(addressLimit.allowed&&senderLimit.allowed){
     if(type==='enroll'){
      if(await reserve()){
       const token=await service.begin(env.DB,email,lookup,encryption);
       try{await sendEnroll(env.EMAIL,{origin:origin.origin,from:env.AUTH_EMAIL_FROM,to:email,token});}catch{console.error('Enrollment email delivery failed');}
      }
     }else{
      const result=await service.issue(env.DB,email,lookup,encryption);
      if(result&&await reserve())try{await (type==='admin-recovery'?sendAdminRecovery:sendRecovery)(env.EMAIL,{origin:origin.origin,from:env.AUTH_EMAIL_FROM,to:result.to,token:result.token});}catch{console.error('Recovery email delivery failed');}
     }
    }};
    // Account lookup and delivery must not determine when the public response
    // is returned. The Worker retains the task after the response is sent.
    const task=deliver().catch(()=>console.error('Authentication email preparation failed'));
    if(typeof ctx?.waitUntil==='function')ctx.waitUntil(task);else await task;
    return json({ok:true});
   }
   const name=names[type];
   if(operation==='confirm'){
    const token=await service.confirm(env.DB,data.token);if(!token)return json({error:'リンクを確認できません。'},400);
    return type==='admin-recovery'?json({ok:true,approvalCode:token.approvalCode},200,cookie(name,token.browserToken,1800)):json({ok:true},200,cookie(name,token,900));
   }
   const token=tokenCookie(request,name);if(!token)return json({error:'操作を確認できません。'},401);
   if(type==='admin-recovery'&&operation==='status'){const result=await service.status(env.DB,token);return result?json(result):json({error:'操作を確認できません。'},401,cookie(name,'',0));}
   if(type==='admin-recovery'&&operation==='cancel'){await service.cancel(env.DB,token);return json({ok:true},200,cookie(name,'',0));}
   if(operation==='options'){
    const result=await service.options(env.DB,token,origin.origin);return result?json(result):type==='admin-recovery'?json({error:'運用者の確認をお待ちください。'},409):json({error:'操作を確認できません。'},400,cookie(name,'',0));
   }
   if(operation==='finish'){
    if(type==='recovery'||type==='admin-recovery'){
     try{if(env.AUTH_NOTICES_ENABLED!=='true'||typeof env.EMAIL?.send!=='function')throw new Error();normalizeEmail(env.AUTH_EMAIL_FROM);key(env.AUTH_ENCRYPTION_KEY);}catch{return json({error:'復旧機能は準備中です。'},503);}
    }
    const session=await service.finish(env.DB,token,origin.origin,data);if(!session)return type==='admin-recovery'?json({error:'登録できませんでした。復旧画面から再試行してください。'},400):json({error:'登録できませんでした。'},400,cookie(name,'',0));
    const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
    headers.append('Set-Cookie',cookie(name,'',0));headers.append('Set-Cookie',session);
    return new Response(JSON.stringify({ok:true}),{status:200,headers});
   }
   return json({error:'見つかりません。'},404);
  }catch{console.error('Authentication request failed');return json({error:'処理できませんでした。'},503);}
 };
}
