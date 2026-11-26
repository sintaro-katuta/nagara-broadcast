import worker from '../cloudflare/worker.mjs';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,env,ctx){
 const access=request.headers.get('X-Test-Access')||'',digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access))));
 if(digest!==env.TEST_HASH)return new Response(null,{status:403});
 if(new URL(request.url).pathname==='/__test/count')return Response.json({passkeys:(await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys').first()).n,notices:(await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_notice_outbox WHERE id LIKE 'passkey-add:%'").first()).n});
 return worker.fetch(request,env,ctx);
}};
