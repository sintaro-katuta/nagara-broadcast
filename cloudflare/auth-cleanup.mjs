// Only whole records whose authorization has expired are removed here.
// Position cursors need a separate safe retention strategy and are excluded.
const tables=['account_sessions','passkey_challenges','passkey_login_attempts','recovery_tokens','auth_rate_limits','passkey_registration_attempts','passkey_enrollments','passkey_recovery_attempts'];
const batchSize=200;

export async function cleanupExpiredAuth(db,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid cleanup time');
 const cutoff=Math.floor(now/1000);
 const statements=tables.map(table=>db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expires_at<=? ORDER BY expires_at LIMIT ?)`).bind(cutoff,batchSize));
 const results=await db.batch(statements);
 return Object.fromEntries(tables.map((table,index)=>[table,results[index].meta.changes]));
}
