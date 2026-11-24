const name='__Host-nagara_session';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async token=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))));
const cookie=token=>`${name}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax`;

// Only random 256-bit session tokens are hashed with SHA-256; passwords are never stored.
export async function createSession(db,accountId,now=Date.now()) {
 const token=hex(crypto.getRandomValues(new Uint8Array(32)));
 const expires=Math.floor(now/1000)+30*24*60*60;
 await db.prepare('INSERT INTO account_sessions (token_hash,account_id,expires_at) VALUES (?,?,?)').bind(await digest(token),accountId,expires).run();
 return `${cookie(token)}; Max-Age=${30*24*60*60}`;
}

function tokenFrom(request) {
 const values=(request.headers.get('Cookie')||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'='));
 if(values.length!==1)return null;
 const token=values[0].slice(name.length+1);
 return /^[a-f0-9]{64}$/.test(token)?token:null;
}

export async function verifySession(request,db,now=Date.now()) {
 const token=tokenFrom(request);if(!token)return null;
 const row=await db.prepare('SELECT s.account_id, a.account_id AS admin_id FROM account_sessions s LEFT JOIN account_admins a ON a.account_id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),Math.floor(now/1000)).first();
 return row?{accountId:row.account_id,admin:!!row.admin_id}:null;
}

export async function revokeSession(request,db) {
 const token=tokenFrom(request);
 if(token)await db.prepare('DELETE FROM account_sessions WHERE token_hash=?').bind(await digest(token)).run();
 return `${cookie('')}; Max-Age=0`;
}
