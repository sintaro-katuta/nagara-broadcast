// Internal persistence only. Callers must derive accountId from a verified session,
// never from request parameters. No public routes use this module yet.
export async function getAccountData(db, accountId) {
 const [favorites,history,version]=await db.batch([
  db.prepare('SELECT episode_id FROM favorites WHERE account_id=? ORDER BY saved_at DESC, episode_id').bind(accountId),
  db.prepare('SELECT episode_id, played_at, position_seconds FROM listening_history WHERE account_id=? ORDER BY played_at DESC, episode_id LIMIT 200').bind(accountId),
  db.prepare('SELECT COALESCE((SELECT generation FROM account_history_generations WHERE account_id=?),0) AS generation').bind(accountId)
 ]);
 return {favorites:favorites.results.map(row=>row.episode_id),history:history.results,historyGeneration:version.results[0].generation};
}

export async function setFavorite(db, accountId, episodeId, enabled, now=new Date().toISOString()) {
 if(typeof enabled!=='boolean')throw new TypeError('enabled must be a boolean');
 if(enabled) return db.prepare('INSERT INTO favorites (account_id,episode_id,saved_at) VALUES (?,?,?) ON CONFLICT(account_id,episode_id) DO NOTHING').bind(accountId,episodeId,now).run();
 return db.prepare('DELETE FROM favorites WHERE account_id=? AND episode_id=?').bind(accountId,episodeId).run();
}

export async function setListeningPosition(db, accountId, episodeId, seconds, writerId, sequence, generation, now=new Date().toISOString()) {
 if(typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<0||seconds>604800)throw new RangeError('invalid position');
 if(typeof writerId!=='string'||!/^[-a-zA-Z0-9_]{16,80}$/.test(writerId)||!Number.isSafeInteger(sequence)||sequence<1)throw new TypeError('invalid write order');
 if(!Number.isSafeInteger(generation)||generation<0)throw new TypeError('invalid history generation');
 const writeId=crypto.randomUUID();
 const results=await db.batch([
  db.prepare('INSERT INTO position_write_cursors(account_id,episode_id,writer_id,sequence,write_id,updated_at) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT generation FROM account_history_generations WHERE account_id=?),0)=? ON CONFLICT(account_id,episode_id,writer_id) DO UPDATE SET sequence=excluded.sequence,write_id=excluded.write_id,updated_at=excluded.updated_at WHERE excluded.sequence>position_write_cursors.sequence').bind(accountId,episodeId,writerId,sequence,writeId,now,accountId,generation),
  db.prepare('INSERT INTO listening_history(account_id,episode_id,played_at,position_seconds) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM position_write_cursors WHERE account_id=? AND episode_id=? AND writer_id=? AND write_id=?) ON CONFLICT(account_id,episode_id) DO UPDATE SET played_at=excluded.played_at,position_seconds=excluded.position_seconds').bind(accountId,episodeId,now,seconds,accountId,episodeId,writerId,writeId),
  db.prepare('SELECT COALESCE((SELECT generation FROM account_history_generations WHERE account_id=?),0) AS generation').bind(accountId)
 ]);
 return results[2].results[0].generation===generation;
}

export async function clearListeningHistory(db, accountId) {
 return db.batch([
  db.prepare('INSERT INTO account_history_generations(account_id,generation) VALUES (?,1) ON CONFLICT(account_id) DO UPDATE SET generation=generation+1').bind(accountId),
  db.prepare('DELETE FROM listening_history WHERE account_id=?').bind(accountId),
  db.prepare('DELETE FROM position_write_cursors WHERE account_id=?').bind(accountId)
 ]);
}
