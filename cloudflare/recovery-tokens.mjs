const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const purposes=['verify_email','recover_account'];

// Internal operations only. Callers must first enforce throttling, delivery
// controls, verified-address rules, and single-purpose recovery authorization.
export async function issueRecoveryToken(db,accountId,purpose,now=Date.now()){
 if(typeof accountId!=='string'||!accountId||!purposes.includes(purpose))throw new TypeError('invalid recovery request');
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 await db.prepare('INSERT INTO recovery_tokens(token_hash,account_id,purpose,expires_at) VALUES (?,?,?,?)').bind(await hash(token),accountId,purpose,Math.floor(now/1000)+900).run();
 return token;
}
export async function consumeRecoveryToken(db,token,purpose,now=Date.now()){
 if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!purposes.includes(purpose))return null;
 return db.prepare('DELETE FROM recovery_tokens WHERE token_hash=? AND purpose=? AND expires_at>? RETURNING account_id').bind(await hash(token),purpose,Math.floor(now/1000)).first();
}
