const enc=new TextEncoder();
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');

// Identifiers such as IPs and addresses must not be written to D1 in plaintext.
// Call separately for client, destination and account; fail closed on errors.
export async function rateLimitKey(secret,scope,identifier){
 if(!(secret instanceof Uint8Array)||secret.length!==32||typeof identifier!=='string'||!identifier||!['client','destination','account'].includes(scope))throw new TypeError('invalid rate limit key');
 const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(`${scope}\0${identifier}`))));
}
export async function consumeRateLimit(db,key,limit,windowSeconds,now=Date.now()){
 if(!/^[a-f0-9]{64}$/.test(key)||!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowSeconds)||windowSeconds<1)throw new TypeError('invalid rate limit');
 const time=Math.floor(now/1000);
 const row=await db.prepare('INSERT INTO auth_rate_limits(bucket_key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket_key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts,expires_at').bind(key,time+windowSeconds,time,time).first();
 return {allowed:row.attempts<=limit,retryAfter:Math.max(0,row.expires_at-time)};
}
