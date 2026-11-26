import worker from '../cloudflare/worker.mjs';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export default {async fetch(request,env,ctx){
 const access=request.headers.get('X-Test-Access')||'',digest=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access))));
 if(digest!==env.TEST_HASH)return new Response(null,{status:403});
 if(new URL(request.url).pathname==='/__test/count')return Response.json({passkeys:(await env.DB.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE account_id='synthetic-a'").first()).n,notices:(await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_notice_outbox WHERE id LIKE 'passkey-add:%'").first()).n,adminKeys:(await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE account_id=?').bind(env.TEST_ADMIN_ID).first()).n,oldAdminKeys:(await env.DB.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE credential_id='old-admin-key'").first()).n,admins:(await env.DB.prepare('SELECT COUNT(*) AS n FROM account_admins WHERE account_id=?').bind(env.TEST_ADMIN_ID).first()).n,adminNotices:(await env.DB.prepare("SELECT COUNT(*) AS n FROM recovery_notice_outbox WHERE id LIKE 'admin-recover:%'").first()).n,oldSessions:(await env.DB.prepare("SELECT COUNT(*) AS n FROM account_sessions WHERE token_hash='synthetic-old-admin-session'").first()).n});
 return worker.fetch(request,env,ctx);
}};
