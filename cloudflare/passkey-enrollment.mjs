import {emailLookup,encryptEmail} from './recovery-crypto.mjs';
import {registrationOptions,verifyRegistration} from './passkeys.mjs';
import {createSession} from './sessions.mjs';

const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const valid=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const clock=()=>Math.floor(Date.now()/1000);

// Internal service only. Callers must enforce request limits, hide whether an
// address already has an account, and send tokens without logging them.
export function makeEnrollment({options=registrationOptions,verify=verifyRegistration}={}){
 return {
  async begin(db,email,lookupKey,encryptionKey,now=clock()){
   const accountId=crypto.randomUUID(),token=random();
   const [lookup,ciphertext,tokenHash]=await Promise.all([emailLookup(email,lookupKey),encryptEmail(email,accountId,encryptionKey),digest(token)]);
   await db.prepare('INSERT INTO passkey_enrollments(account_id,email_lookup,email_ciphertext,email_token_hash,expires_at) VALUES (?,?,?,?,?)').bind(accountId,lookup,ciphertext,tokenHash,now+900).run();
   return token;
  },
  // Must be invoked by an explicit POST, never by opening an email link: mail
  // scanners may open links before their owners do.
  async confirm(db,token,now=clock()){
   if(!valid(token))return null;
   const browserToken=random();
   const row=await db.prepare('UPDATE passkey_enrollments SET email_token_hash=NULL,browser_token_hash=?,expires_at=? WHERE email_token_hash=? AND expires_at>? AND browser_token_hash IS NULL RETURNING account_id').bind(await digest(browserToken),now+900,await digest(token),now).first();
   return row?browserToken:null;
  },
  async options(db,browserToken,origin,now=clock()){
   if(!valid(browserToken))return null;
   const key=await digest(browserToken);
   const row=await db.prepare('SELECT account_id FROM passkey_enrollments WHERE browser_token_hash=? AND email_token_hash IS NULL AND expires_at>?').bind(key,now).first();
   if(!row)return null;
   const value=await options(origin,row.account_id,[]);
   const updated=await db.prepare('UPDATE passkey_enrollments SET challenge=? WHERE browser_token_hash=? AND expires_at>? RETURNING account_id').bind(value.challenge,key,now).first();
   return updated?value:null;
  },
  async finish(db,browserToken,origin,response,now=clock()){
   if(!valid(browserToken))return null;
   const key=await digest(browserToken);
   const row=await db.prepare('DELETE FROM passkey_enrollments WHERE browser_token_hash=? AND challenge IS NOT NULL AND expires_at>? RETURNING account_id,email_lookup,email_ciphertext,challenge').bind(key,now).first();
   if(!row)return null;
   let result;try{result=await verify(origin,row.challenge,response);}catch{return null;}
   const credential=result.verified&&result.registrationInfo?.credential;
   if(!credential||typeof credential.id!=='string'||!/^[A-Za-z0-9_-]{1,2048}$/.test(credential.id)||!(credential.publicKey instanceof Uint8Array)||!Number.isSafeInteger(credential.counter)||credential.counter<0)return null;
   try{
    await db.batch([
     db.prepare('INSERT INTO accounts(id) VALUES (?)').bind(row.account_id),
     db.prepare('INSERT INTO recovery_emails(account_id,email_lookup,email_ciphertext,verified_at) VALUES (?,?,?,?)').bind(row.account_id,row.email_lookup,row.email_ciphertext,new Date(now*1000).toISOString()),
     db.prepare('INSERT INTO passkeys(credential_id,account_id,public_key,sign_count,transports,created_at) VALUES (?,?,?,?,?,?)').bind(credential.id,row.account_id,credential.publicKey,credential.counter,JSON.stringify(credential.transports||[]),new Date(now*1000).toISOString())
    ]);
   }catch{return null;}
   return createSession(db,row.account_id,now*1000);
  }
 };
}
