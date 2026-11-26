import {adminRecoveryApprovalCode} from './admin-recovery-code.mjs';

// This public pseudonymous code only identifies an account to the operator.
// Possession of the code alone does not grant privileges.
export async function adminBootstrapCode(accountId){
 if(typeof accountId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(accountId))throw new TypeError('invalid account');
 const bytes=accountId.replaceAll('-','').match(/../g).map(value=>parseInt(value,16));
 return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export async function accountIdFromAdminCode(code){
 if(typeof code!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(code))throw new TypeError('invalid administrator code');
 let value;try{value=atob(code.replaceAll('-','+').replaceAll('_','/')+'==');}catch{throw new TypeError('invalid administrator code');}
 if(value.length!==16)throw new TypeError('invalid administrator code');
 const hex=Array.from(value,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''),id=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
 if(await adminBootstrapCode(id)!==code)throw new TypeError('invalid administrator code');return id;
}

// The caller must be an operator with D1 write access. The conditional INSERT
// is one atomic statement so two concurrent bootstrap attempts cannot both win.
export async function bootstrapFirstAdmin(db,code,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid bootstrap input');
 const accountId=await accountIdFromAdminCode(code);
 const seconds=Math.floor(now/1000);
 const result=await db.prepare("INSERT INTO account_admins(account_id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM account_admins) AND (SELECT COUNT(*) FROM passkeys WHERE account_id=?)>=2 AND EXISTS (SELECT 1 FROM recovery_emails WHERE account_id=?) AND EXISTS (SELECT 1 FROM account_sessions WHERE account_id=? AND expires_at>?) AND NOT EXISTS (SELECT 1 FROM recovery_tokens WHERE account_id=? AND expires_at>?) AND NOT EXISTS (SELECT 1 FROM passkey_recovery_attempts WHERE account_id=? AND expires_at>?) RETURNING account_id").bind(accountId,accountId,accountId,accountId,seconds,accountId,seconds,accountId,seconds).first();
 return !!result;
}

// Both codes are necessary: one identifies the administrator, the other binds
// approval to the browser that opened the verified-email link.
export async function approveAdminRecovery(db,accountCode,browserCode,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(browserCode||'')||!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid recovery approval');
 const accountId=await accountIdFromAdminCode(accountCode),seconds=Math.floor(now/1000);
 const attempt=await db.prepare('SELECT browser_token_hash FROM passkey_recovery_attempts WHERE account_id=? AND (challenge IS NULL OR challenge_expires_at<=?) AND expires_at>? AND EXISTS (SELECT 1 FROM account_admins WHERE account_id=?)').bind(accountId,seconds,seconds,accountId).first();
 if(!attempt||await adminRecoveryApprovalCode(attempt.browser_token_hash)!==browserCode)return false;
 const approved=await db.prepare("UPDATE passkey_recovery_attempts SET challenge='approved',challenge_expires_at=MIN(expires_at,?) WHERE account_id=? AND browser_token_hash=? AND (challenge IS NULL OR challenge_expires_at<=?) AND expires_at>? AND EXISTS (SELECT 1 FROM account_admins WHERE account_id=?) RETURNING account_id").bind(seconds+300,accountId,attempt.browser_token_hash,seconds,seconds,accountId).first();
 return !!approved;
}
