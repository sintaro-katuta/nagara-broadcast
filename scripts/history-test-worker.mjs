import worker from '../cloudflare/worker.mjs';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,env,ctx){
 const access=request.headers.get('X-Test-Access')||'',digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access))));
 if(digest!==env.TEST_HASH)return new Response(null,{status:403});
 return worker.fetch(request,env,ctx);
}};
