import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {productionMailCheck} from '../cloudflare/production-mail-check.mjs';
import worker from '../cloudflare/worker.mjs';

const secret='01'.repeat(32),now=1795776000000,time=String(Math.floor(now/1000));
const base='https://nagara-broadcast.sintaro-katuta.com/api/internal/production-mail-check';
const sign=(t=time,key=secret)=>createHmac('sha256',Buffer.from(key,'hex')).update(`nagara-production-mail-check:v1\0${t}`).digest('hex');
const req=(opts={})=>new Request(opts.url||base,{method:opts.method||'POST',headers:{'X-Mail-Check-Time':opts.time||time,'X-Mail-Check-Signature':opts.signature||sign()}});
function setup(){
 let attempts=0;const messages=[];
 const DB={prepare(){return {bind(){return {async first(){return {attempts:++attempts,expires_at:Math.floor(now/1000)+86400}}}}}}};
 const env={DB,AUTH_ENABLED:'false',PASSKEY_API_ENABLED:'false',AUTH_RATE_KEY:secret,AUTH_EMAIL_FROM:'no-reply@mail.nagara-broadcast.sintaro-katuta.com',RESEND_API_KEY:'re_test'};
 return {env,messages,options:{now,makeEmail:()=>({async send(message,options){messages.push({message,options})}})}};
}
test('only authenticated fixed simulator messages can be sent before launch',async()=>{
 const {env,messages,options}=setup();
 for(const request of [req({signature:'00'.repeat(32)}),req({time:String(Number(time)-121),signature:sign(String(Number(time)-121))})])assert.equal((await productionMailCheck(request,env,options)).status,403);
 assert.equal((await productionMailCheck(req({url:'https://other.example/api/internal/production-mail-check'}),env,options)).status,404);
 assert.equal((await productionMailCheck(req(),{...env,AUTH_ENABLED:'true'},options)).status,404);
 assert.equal((await productionMailCheck(req(),{...env,PASSKEY_API_ENABLED:'true'},options)).status,404);
 assert.equal((await productionMailCheck(req(),{...env,AUTH_EMAIL_FROM:'other@example.com'},options)).status,503);
 assert.equal(messages.length,0);
 assert.equal((await productionMailCheck(req(),env,options)).status,204);
 assert.equal(messages[0].message.to,'delivered@resend.dev');
 assert.equal(messages[0].message.from,env.AUTH_EMAIL_FROM);
 assert.equal(messages[0].options.idempotencyKey,`production-mail-check:${time}`);
 assert.equal((await productionMailCheck(req(),env,options)).status,204);
 assert.equal((await productionMailCheck(req(),env,options)).status,204);
 assert.equal((await productionMailCheck(req(),env,options)).status,429);
 assert.equal(messages.length,3);
});
test('delivery and database failures do not claim success or expose details',async()=>{
 const {env,options}=setup();
 assert.equal((await productionMailCheck(req(),env,{...options,makeEmail:()=>null})).status,503);
 const failed=await productionMailCheck(req(),env,{...options,makeEmail:()=>({async send(){throw new Error('private provider details')}})});
 assert.equal(failed.status,502);assert.equal(await failed.text(),'');
 const dbFail=await productionMailCheck(req(),{...env,DB:{prepare(){throw new Error('private database details')}}},options);
 assert.equal(dbFail.status,502);assert.equal(await dbFail.text(),'');
});
test('worker routes the signed request to Resend using its own configured key',async()=>{
 const {env}=setup(),originalFetch=globalThis.fetch,calls=[];
 env.RESEND_API_KEY='re_abcdefghijklmnop';
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({id:'simulated-id'});};
 try{
  const current=String(Math.floor(Date.now()/1000));
  const result=await worker.fetch(req({time:current,signature:sign(current)}),env,{});
  assert.equal(result.status,204);assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.resend.com/emails');
  assert.equal(JSON.parse(calls[0].options.body).to,'delivered@resend.dev');
  assert.equal(calls[0].options.headers.Authorization,`Bearer ${env.RESEND_API_KEY}`);
 }finally{globalThis.fetch=originalFetch;}
});
