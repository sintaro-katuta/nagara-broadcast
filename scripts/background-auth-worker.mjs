import {makeAuthRoutes} from '../cloudflare/auth-routes.mjs';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,env,ctx){
 const value=request.headers.get('X-Test-Access')||'',hash=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 if(hash!==env.TEST_HASH)return new Response(null,{status:403});
 const origin=new URL(request.url).origin;
 const db={prepare(){return {bind(_key,expiry){return {async first(){return {attempts:1,expires_at:expiry}}}}}}};
 const recovery={async issue(){await new Promise(resolve=>setTimeout(resolve,5000));await env.STATE.prepare('INSERT INTO events(name) VALUES (?)').bind('completed').run();return null;}};
 const routes=makeAuthRoutes({recovery});
 const fakeEnv={DB:db,AUTH_ORIGIN:origin,AUTH_RATE_KEY:'01'.repeat(32),AUTH_LOOKUP_KEY:'02'.repeat(32),AUTH_ENCRYPTION_KEY:'03'.repeat(32),AUTH_EMAIL_FROM:'sender@example.com',EMAIL:{async send(){throw new Error('No email should be sent')}}};
 const probe=new Request(origin+'/api/auth/recovery/start',{method:'POST',headers:{Origin:origin,'CF-Connecting-IP':'192.0.2.1','Content-Type':'application/json'},body:JSON.stringify({email:'synthetic@example.com'})});
 return routes(probe,fakeEnv,ctx);
}};
