import {decryptEmail,normalizeEmail} from './recovery-crypto.mjs';
import {ResendDeliveryError} from './resend-email.mjs';

// Messages may be delivered more than once if the worker stops after sending.
// Do not put addresses, tokens, or database IDs in the message or logs.
export async function deliverRecoveryNotices(db,binding,from,encryptionKey,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid time');
 const sender=normalizeEmail(from);
 if(!(encryptionKey instanceof Uint8Array)||encryptionKey.length!==32||typeof binding?.send!=='function')throw new TypeError('notification configuration unavailable');
 const seconds=Math.floor(now/1000);let sent=0,failed=0;
 for(let i=0;i<10;i++){
  const lease=crypto.randomUUID();
  const row=await db.prepare('UPDATE recovery_notice_outbox SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE id=(SELECT id FROM recovery_notice_outbox WHERE blocked_at IS NULL AND next_attempt_at<=? AND lease_until<=? ORDER BY next_attempt_at,created_at,id LIMIT 1) RETURNING id,account_id,created_at,attempts').bind(lease,seconds+120,seconds,seconds).first();
  if(!row)break;
  try{
   const email=await db.prepare('SELECT email_ciphertext FROM recovery_emails WHERE account_id=?').bind(row.account_id).first();
   if(!email)throw new Error('recovery address unavailable');
   const to=await decryptEmail(email.email_ciphertext,row.account_id,encryptionKey);
   const added=row.id.startsWith('passkey-add:'),admin=row.id.startsWith('admin-recover:');
   const subject=added?'ながら放送 パスキー追加のお知らせ':admin?'ながら放送 管理者アカウント復旧のお知らせ':'ながら放送 アカウント復旧のお知らせ';
   const text=added?`ながら放送のアカウントに、新しいパスキーが追加されました。\n\n追加日時（UTC）: ${new Date(row.created_at*1000).toISOString()}\n\n心当たりがない場合は、メールアカウントの安全を確認し、サービス管理者へご連絡ください。`:admin?`ながら放送の管理者アカウントで、メールと運用者の確認を経てパスキーが再登録されました。以前のパスキーとログイン状態は無効です。\n\n復旧日時（UTC）: ${new Date(row.created_at*1000).toISOString()}\n\n心当たりがない場合は、メールアカウントの安全を確認し、サービス管理者へご連絡ください。`:`ながら放送のアカウントで、メールによる復旧と新しいパスキーの登録が完了しました。以前のパスキーとログイン状態は無効です。\n\n復旧日時（UTC）: ${new Date(row.created_at*1000).toISOString()}\n\n心当たりがない場合は、メールアカウントの安全を確認し、サービス管理者へご連絡ください。`;
   // Existing queued messages retain their original body for provider retries.
   const modern=['recovery:v2:','passkey-add:v2:','admin-recover:v2:'].some(prefix=>row.id.startsWith(prefix));
   await binding.send({from:sender,to,subject,text:modern?`${text}\n\nお問い合わせ：support@mail.nagara-broadcast.sintaro-katuta.com`:text},{idempotencyKey:`recovery-notice/${row.id}`});
  }catch(error){
   if(error instanceof ResendDeliveryError&&!error.retryable){
    await db.prepare('UPDATE recovery_notice_outbox SET lease_token=NULL,lease_until=0,blocked_at=?,blocked_reason=? WHERE id=? AND lease_token=?').bind(seconds,`http_${error.status}`,row.id,lease).run();
   }else{
    const backoff=Math.min(3600,60*2**Math.min(row.attempts-1,6));
    const delay=Math.max(backoff,error instanceof ResendDeliveryError?error.retryAfter:0);
    await db.prepare('UPDATE recovery_notice_outbox SET lease_token=NULL,lease_until=0,next_attempt_at=? WHERE id=? AND lease_token=?').bind(Math.min(Number.MAX_SAFE_INTEGER,seconds+delay),row.id,lease).run();
   }
   failed++;continue;
  }
  await db.prepare('DELETE FROM recovery_notice_outbox WHERE id=? AND lease_token=?').bind(row.id,lease).run();sent++;
 }
 return {sent,failed};
}
