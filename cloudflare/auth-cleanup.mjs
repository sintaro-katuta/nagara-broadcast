// Only whole records whose authorization has expired are removed here.
const tables=['account_sessions','passkey_challenges','passkey_login_attempts','recovery_tokens','auth_rate_limits','passkey_registration_attempts','passkey_enrollments','passkey_recovery_attempts'];
const batchSize=200;

export async function cleanupExpiredAuth(db,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0)throw new TypeError('invalid cleanup time');
 const cutoff=Math.floor(now/1000);
 const statements=tables.map(table=>db.prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE expires_at<=? ORDER BY expires_at LIMIT ?)`).bind(cutoff,batchSize));
 const results=await db.batch(statements);
 return Object.fromEntries(tables.map((table,index)=>[table,results[index].meta.changes]));
}

// Incrementing the account history generation in the same transaction prevents
// a delayed old write from recreating a cursor after its ordering data is gone.
export async function cleanupOldPositionCursors(db,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<30*86400*1000)throw new TypeError('invalid cleanup time');
 const cutoff=new Date(now-30*86400*1000).toISOString();
 const accounts=await db.prepare('SELECT account_id FROM (SELECT account_id,updated_at FROM position_write_cursors WHERE updated_at<? ORDER BY updated_at,account_id LIMIT 2000) GROUP BY account_id ORDER BY MIN(updated_at),account_id LIMIT 10').bind(cutoff).all();
 let removed=0;
 for(const {account_id:accountId} of accounts.results){
  const results=await db.batch([
   db.prepare('INSERT INTO account_history_generations(account_id,generation) SELECT ?,1 WHERE EXISTS (SELECT 1 FROM position_write_cursors WHERE account_id=? AND updated_at<?) ON CONFLICT(account_id) DO UPDATE SET generation=generation+1').bind(accountId,accountId,cutoff),
   db.prepare('DELETE FROM position_write_cursors WHERE rowid IN (SELECT rowid FROM position_write_cursors WHERE account_id=? AND updated_at<? ORDER BY updated_at LIMIT 200)').bind(accountId,cutoff)
  ]);
  removed+=results[1].meta.changes;
 }
 return removed;
}
