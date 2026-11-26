const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');

// This public pseudonymous code only identifies an account to the operator.
// Possession of the code alone does not grant privileges.
export async function adminBootstrapCode(accountId){
 if(typeof accountId!=='string'||!/^[a-f0-9-]{36}$/i.test(accountId))throw new TypeError('invalid account');
 return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode('nagara-admin-bootstrap-v1:'+accountId))));
}

// The caller must be an operator with D1 write access. The conditional INSERT
// is one atomic statement so two concurrent bootstrap attempts cannot both win.
export async function bootstrapFirstAdmin(db,code,now=Date.now()){
 if(typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code)||!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid bootstrap input');
 const candidates=await db.prepare('SELECT id FROM accounts ORDER BY id LIMIT 101').all();
 if(candidates.results.length>100)throw new Error('too many accounts for first-admin setup');
 let accountId=null;for(const row of candidates.results){if(await adminBootstrapCode(row.id)===code){if(accountId)throw new Error('ambiguous account');accountId=row.id;}}
 if(!accountId)return false;
 const seconds=Math.floor(now/1000);
 const result=await db.prepare("INSERT INTO account_admins(account_id) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM account_admins) AND (SELECT COUNT(*) FROM passkeys WHERE account_id=?)>=2 AND EXISTS (SELECT 1 FROM recovery_emails WHERE account_id=?) AND EXISTS (SELECT 1 FROM account_sessions WHERE account_id=? AND expires_at>?) AND NOT EXISTS (SELECT 1 FROM recovery_tokens WHERE account_id=? AND expires_at>?) AND NOT EXISTS (SELECT 1 FROM passkey_recovery_attempts WHERE account_id=? AND expires_at>?) RETURNING account_id").bind(accountId,accountId,accountId,accountId,seconds,accountId,seconds,accountId,seconds).first();
 return !!result;
}
