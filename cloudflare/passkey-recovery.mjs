import {emailLookup,decryptEmail} from './recovery-crypto.mjs';
import {registrationOptions,verifyRegistration} from './passkeys.mjs';
import {issueRecoveryToken} from './recovery-tokens.mjs';
import {prepareSession} from './sessions.mjs';

const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const valid=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const clock=()=>Math.floor(Date.now()/1000);

// Internal service only. Before exposing, callers must enforce rate limits on
// client and destination, return indistinguishable responses, and send notices.
export function makeRecovery({options=registrationOptions,verify=verifyRegistration}={}){
 return {
  async issue(db,email,lookupKey,encryptionKey,now=clock()){
   const lookup=await emailLookup(email,lookupKey);
   const row=await db.prepare('SELECT e.account_id,e.email_ciphertext FROM recovery_emails e LEFT JOIN account_admins a ON a.account_id=e.account_id WHERE e.email_lookup=? AND a.account_id IS NULL').bind(lookup).first();
   if(!row)return null;
   const to=await decryptEmail(row.email_ciphertext,row.account_id,encryptionKey);
   const token=await issueRecoveryToken(db,row.account_id,'recover_account',now*1000);
   return {to,token};
  },
  // Email scanners can open links: confirmation must require an explicit POST.
  async confirm(db,token,now=clock()){
   if(!valid(token))return null;
   const browserToken=random(),browserHash=await digest(browserToken),tokenHash=await digest(token);
   // D1 batches execute transactionally: no recovery completion can occur
   // between the insertion of the browser attempt and token consumption.
   const results=await db.batch([
    db.prepare('INSERT INTO passkey_recovery_attempts(browser_token_hash,account_id,expires_at) SELECT ?,t.account_id,? FROM recovery_tokens t WHERE t.token_hash=? AND t.purpose=? AND t.expires_at>? AND NOT EXISTS (SELECT 1 FROM account_admins a WHERE a.account_id=t.account_id) ON CONFLICT(account_id) DO UPDATE SET browser_token_hash=excluded.browser_token_hash,challenge=NULL,challenge_expires_at=NULL,expires_at=excluded.expires_at RETURNING account_id').bind(browserHash,now+900,tokenHash,'recover_account',now),
    db.prepare('DELETE FROM recovery_tokens WHERE token_hash=? AND purpose=? AND EXISTS (SELECT 1 FROM passkey_recovery_attempts WHERE browser_token_hash=?)').bind(tokenHash,'recover_account',browserHash)
   ]);
   return results[0]?.results?.length?browserToken:null;
  },
  async options(db,browserToken,origin,now=clock()){
   if(!valid(browserToken))return null;
   const key=await digest(browserToken);
   const row=await db.prepare('SELECT r.account_id FROM passkey_recovery_attempts r LEFT JOIN account_admins a ON a.account_id=r.account_id WHERE r.browser_token_hash=? AND r.expires_at>? AND a.account_id IS NULL').bind(key,now).first();
   if(!row)return null;
   const {results}=await db.prepare('SELECT credential_id FROM passkeys WHERE account_id=? LIMIT 21').bind(row.account_id).all();
   if(results.length>=20)return null;
   const value=await options(origin,row.account_id,results.map(x=>x.credential_id));
   const updated=await db.prepare('UPDATE passkey_recovery_attempts SET challenge=?,challenge_expires_at=MIN(expires_at,?) WHERE browser_token_hash=? AND expires_at>? RETURNING account_id').bind(value.challenge,now+300,key,now).first();
   return updated?value:null;
  },
  async finish(db,browserToken,origin,response,now=clock()){
   if(!valid(browserToken))return null;
   const browserHash=await digest(browserToken);
   const row=await db.prepare('SELECT account_id,challenge FROM passkey_recovery_attempts WHERE browser_token_hash=? AND challenge IS NOT NULL AND expires_at>? AND challenge_expires_at>?').bind(browserHash,now,now).first();
   if(!row)return null;
   const invalidate=()=>db.prepare('UPDATE passkey_recovery_attempts SET challenge=NULL,challenge_expires_at=NULL WHERE browser_token_hash=? AND challenge=?').bind(browserHash,row.challenge).run();
   let result;try{result=await verify(origin,row.challenge,response);}catch{await invalidate();return null;}
   const credential=result.verified&&result.registrationInfo?.credential;
   if(!credential||typeof credential.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(credential.id)||!(credential.publicKey instanceof Uint8Array)||!Number.isSafeInteger(credential.counter)||credential.counter<0){await invalidate();return null;}
   const claim=await db.prepare('UPDATE passkey_recovery_attempts SET challenge=NULL,challenge_expires_at=NULL WHERE browser_token_hash=? AND challenge=? AND expires_at>? AND challenge_expires_at>? RETURNING account_id').bind(browserHash,row.challenge,now,now).first();
   if(!claim)return null;
   const session=await prepareSession(now*1000);
   let changes;
   try{
    changes=await db.batch([
     db.prepare('INSERT INTO passkeys(credential_id,account_id,public_key,sign_count,transports,created_at) VALUES (CASE WHEN NOT EXISTS (SELECT 1 FROM account_admins WHERE account_id=?) AND (SELECT COUNT(*) FROM passkeys WHERE account_id=?)<20 AND EXISTS (SELECT 1 FROM passkey_recovery_attempts WHERE browser_token_hash=? AND account_id=? AND challenge IS NULL AND expires_at>?) THEN ? ELSE NULL END,?,?,?,?,?) RETURNING credential_id').bind(row.account_id,row.account_id,browserHash,row.account_id,now,credential.id,row.account_id,credential.publicKey,credential.counter,JSON.stringify(credential.transports||[]),new Date(now*1000).toISOString()),
     db.prepare('DELETE FROM account_sessions WHERE account_id=?').bind(row.account_id),
     db.prepare('DELETE FROM recovery_tokens WHERE account_id=? AND purpose=?').bind(row.account_id,'recover_account'),
     db.prepare('DELETE FROM passkey_recovery_attempts WHERE account_id=?').bind(row.account_id),
     db.prepare('INSERT INTO account_sessions(token_hash,account_id,expires_at) VALUES (?,?,?)').bind(session.tokenHash,row.account_id,session.expiresAt)
    ]);
   }catch{return null;}
   if(!changes[0]?.results?.length)return null;
   return session.cookie;
  }
 };
}
