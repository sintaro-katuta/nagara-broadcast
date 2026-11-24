-- A per-page sequence prevents delayed writes from overwriting a newer write
-- from the same page. Cursor rows require periodic expiry/cleanup before launch.
CREATE TABLE IF NOT EXISTS position_write_cursors (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  writer_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  write_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(account_id,episode_id,writer_id)
);
CREATE INDEX IF NOT EXISTS position_write_cursors_updated ON position_write_cursors(updated_at);
