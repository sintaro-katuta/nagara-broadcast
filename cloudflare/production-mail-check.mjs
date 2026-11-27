import {consumeRateLimit,rateLimitKey} from './auth-rate-limit.mjs';
import {makeResendEmail} from './resend-email.mjs';

const origin='https://nagara-broadcast.sintaro-katuta.com';
const from='no-reply@mail.nagara-broadcast.sintaro-katuta.com';
const enc=new TextEncoder();
const bytes=value=>Uint8Array.from(value.match(/../g),x=>parseInt(x,16));
const signatureText=time=>`nagara-production-mail-check:v1\0${time}`;

// Available only before authentication is enabled. It cannot choose a recipient
// or message, and it never exposes the Worker-held Resend key.
export async function productionMailCheck(request,env,{now=Date.now(),makeEmail=makeResendEmail}={}){
 const url=new URL(request.url);
 if(url.origin!==origin||url.pathname!=='/api/internal/production-mail-check'||request.method!=='POST'||env.AUTH_ENABLED!=='false'||env.PASSKEY_API_ENABLED!=='false')return new Response(null,{status:404});
 const time=request.headers.get('X-Mail-Check-Time')||'',signature=request.headers.get('X-Mail-Check-Signature')||'',secret=env.AUTH_RATE_KEY;
 if(!/^\d{10}$/.test(time)||Math.abs(Math.floor(now/1000)-Number(time))>120||!/^[a-f0-9]{64}$/.test(signature)||typeof secret!=='string'||!/^[a-f0-9]{64}$/i.test(secret))return new Response(null,{status:403});
 const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,bytes(signature),enc.encode(signatureText(time))))return new Response(null,{status:403});
 if(env.AUTH_EMAIL_FROM!==from)return new Response(null,{status:503});
 const email=makeEmail(env.RESEND_API_KEY);if(!email)return new Response(null,{status:503});
 try{
  const bucket=await rateLimitKey(bytes(secret),'account','production-mail-check:v1');
  if(!(await consumeRateLimit(env.DB,bucket,3,86400,now)).allowed)return new Response(null,{status:429});
  await email.send({from,to:'delivered@resend.dev',subject:'ながら放送 本番メール送信テスト',text:'本番環境のメール送信設定の確認です。'}, {idempotencyKey:`production-mail-check:${time}`});
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 }catch{return new Response(null,{status:502,headers:{'Cache-Control':'no-store'}});}
}
