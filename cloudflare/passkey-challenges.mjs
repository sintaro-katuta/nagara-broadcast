// Challenge issuance and consumption are internal; registration must additionally
// be tied to a verified enrollment/recovery or an existing authenticated session.
export async function storeChallenge(db,challenge,purpose,accountId=null,now=Date.now()) {
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(challenge)||!['registration','authentication'].includes(purpose))throw new TypeError('invalid challenge');
 if(purpose==='registration'&&!accountId)throw new TypeError('account required');
 await db.prepare('INSERT INTO passkey_challenges(challenge,purpose,account_id,expires_at) VALUES (?,?,?,?)').bind(challenge,purpose,accountId,Math.floor(now/1000)+300).run();
}
export async function consumeChallenge(db,challenge,purpose,now=Date.now()) {
 if(typeof challenge!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(challenge)||!['registration','authentication'].includes(purpose))return null;
 return db.prepare('DELETE FROM passkey_challenges WHERE challenge=? AND purpose=? AND expires_at>? RETURNING account_id').bind(challenge,purpose,Math.floor(now/1000)).first();
}
