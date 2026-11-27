import {emailLookup,decryptEmail} from './recovery-crypto.mjs';
import {registrationOptions,verifyRegistration} from './passkeys.mjs';
import {issueRecoveryToken} from './recovery-tokens.mjs';
import {prepareSession} from './sessions.mjs';
import {adminRecoveryApprovalCode} from './admin-recovery-code.mjs';

const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const valid=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);

// The caller must apply client and email rate limits and protect the operator
// approval separately. Existing credentials remain until replacement succeeds.
export function makeAdminRecovery({options=registrationOptions,verify=verifyRegistration,clock=()=>Math.floor(Date.now()/1000)}={}){
 return {
  async issue(db,email,lookupKey,encryptionKey){
   const lookup=await emailLookup(email,lookupKey);
   const row=await db.prepare('SELECT e.account_id,e.email_ciphertext FROM recovery_emails e INNER JOIN account_admins a ON a.account_id=e.account_id WHERE e.email_lookup=?').bind(lookup).first();
   if(!row)return null;const to=await decryptEmail(row.email_ciphertext,row.account_id,encryptionKey),token=await issueRecoveryToken(db,row.account_id,'recover_account',clock()*1000);return {to,token};
  },
  async confirm(db,token){
   if(!valid(token))return null;const now=clock(),browserToken=hex(crypto.getRandomValues(new Uint8Array(32))),browserHash=await digest(browserToken),tokenHash=await digest(token);
   const result=await db.batch([
    db.prepare('INSERT INTO passkey_recovery_attempts(browser_token_hash,account_id,expires_at) SELECT ?,t.account_id,? FROM recovery_tokens t WHERE t.token_hash=? AND t.purpose=? AND t.expires_at>? AND EXISTS (SELECT 1 FROM account_admins a WHERE a.account_id=t.account_id) ON CONFLICT(account_id) DO UPDATE SET browser_token_hash=excluded.browser_token_hash,challenge=NULL,challenge_expires_at=NULL,expires_at=excluded.expires_at RETURNING account_id').bind(browserHash,now+1800,tokenHash,'recover_account',now),
    db.prepare('DELETE FROM recovery_tokens WHERE token_hash=? AND purpose=? AND EXISTS (SELECT 1 FROM passkey_recovery_attempts WHERE browser_token_hash=?)').bind(tokenHash,'recover_account',browserHash)
   ]);
   return result[0]?.results?.length?{browserToken,approvalCode:await adminRecoveryApprovalCode(browserHash)}:null;
  },
  async status(db,browserToken){
   if(!valid(browserToken))return null;const key=await digest(browserToken),now=clock();
   const row=await db.prepare('SELECT r.account_id FROM passkey_recovery_attempts r WHERE r.browser_token_hash=? AND r.expires_at>? AND EXISTS (SELECT 1 FROM account_admins a WHERE a.account_id=r.account_id)').bind(key,now).first();
   return row?{approvalCode:await adminRecoveryApprovalCode(key)}:null;
  },
  async cancel(db,browserToken){if(!valid(browserToken))return;await db.prepare('DELETE FROM passkey_recovery_attempts WHERE browser_token_hash=?').bind(await digest(browserToken)).run();},
  async options(db,browserToken,origin){
   if(!valid(browserToken))return null;const key=await digest(browserToken),now=clock();
   const row=await db.prepare("SELECT r.account_id,r.challenge FROM passkey_recovery_attempts r WHERE r.browser_token_hash=? AND (r.challenge='approved' OR r.challenge LIKE 'admin:%') AND r.expires_at>? AND r.challenge_expires_at>? AND EXISTS (SELECT 1 FROM account_admins a WHERE a.account_id=r.account_id)").bind(key,now,now).first();if(!row)return null;
   const {results}=await db.prepare('SELECT credential_id FROM passkeys WHERE account_id=? LIMIT 21').bind(row.account_id).all();
   const value=await options(origin,row.account_id,results.map(x=>x.credential_id)),current=clock();
   const updated=await db.prepare("UPDATE passkey_recovery_attempts SET challenge='admin:'||? WHERE browser_token_hash=? AND challenge=? AND expires_at>? AND challenge_expires_at>? AND EXISTS (SELECT 1 FROM account_admins WHERE account_id=passkey_recovery_attempts.account_id) RETURNING account_id").bind(value.challenge,key,row.challenge,current,current).first();
   return updated?value:null;
  },
  async finish(db,browserToken,origin,response){
   if(!valid(browserToken))return null;const key=await digest(browserToken),now=clock();
   const row=await db.prepare("SELECT account_id,challenge,expires_at,challenge_expires_at FROM passkey_recovery_attempts WHERE browser_token_hash=? AND challenge LIKE 'admin:%' AND expires_at>? AND challenge_expires_at>? AND EXISTS (SELECT 1 FROM account_admins WHERE account_id=passkey_recovery_attempts.account_id)").bind(key,now,now).first();if(!row)return null;
   let result;try{result=await verify(origin,row.challenge.slice(6),response);}catch{return null;}
   const credential=result?.verified&&result.registrationInfo?.credential;
   if(!credential||typeof credential.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(credential.id)||!(credential.publicKey instanceof Uint8Array)||!Number.isSafeInteger(credential.counter)||credential.counter<0)return null;
   const current=clock(),claim=await db.prepare('UPDATE passkey_recovery_attempts SET challenge=NULL,challenge_expires_at=NULL WHERE browser_token_hash=? AND challenge=? AND expires_at>? AND challenge_expires_at>? RETURNING account_id').bind(key,row.challenge,current,current).first();if(!claim)return null;
   const session=await prepareSession(current*1000),commitTime=clock();if(row.expires_at<=commitTime||row.challenge_expires_at<=commitTime)return null;
   try{
    const changes=await db.batch([
     db.prepare('INSERT INTO passkeys(credential_id,account_id,public_key,sign_count,transports,created_at) VALUES (CASE WHEN EXISTS (SELECT 1 FROM account_admins WHERE account_id=?) AND EXISTS (SELECT 1 FROM passkey_recovery_attempts WHERE browser_token_hash=? AND account_id=? AND challenge IS NULL AND expires_at>?) THEN ? ELSE NULL END,?,?,?,?,?) RETURNING credential_id').bind(row.account_id,key,row.account_id,commitTime,credential.id,row.account_id,credential.publicKey,credential.counter,JSON.stringify(credential.transports||[]),new Date(commitTime*1000).toISOString()),
     db.prepare('INSERT INTO account_auth_generations(account_id,generation) VALUES (?,1) ON CONFLICT(account_id) DO UPDATE SET generation=generation+1').bind(row.account_id),
     db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(row.account_id),
     db.prepare('DELETE FROM passkeys WHERE account_id=? AND credential_id<>?').bind(row.account_id,credential.id),
     db.prepare('DELETE FROM recovery_tokens WHERE account_id=?').bind(row.account_id),
     db.prepare('DELETE FROM passkey_registration_attempts WHERE account_id=?').bind(row.account_id),
     db.prepare('DELETE FROM passkey_recovery_attempts WHERE account_id=?').bind(row.account_id),
     db.prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)').bind(session.tokenHash,row.account_id,session.expiresAt),
     db.prepare('INSERT INTO recovery_notice_outbox(id,account_id,created_at,next_attempt_at) VALUES (?,?,?,?)').bind('admin-recover:v2:'+crypto.randomUUID(),row.account_id,commitTime,commitTime)
    ]);
    return changes[0]?.results?.length?session.cookie:null;
   }catch{return null;}
  }
 };
}
