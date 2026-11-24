-- Apply after schema.sql. Authentication identities are added separately.
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL
);
CREATE TABLE IF NOT EXISTS favorites (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (account_id, episode_id)
);
CREATE TABLE IF NOT EXISTS listening_history (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  played_at TEXT NOT NULL,
  position_seconds REAL NOT NULL CHECK(position_seconds >= 0),
  PRIMARY KEY (account_id, episode_id)
);
CREATE INDEX IF NOT EXISTS history_by_account_time ON listening_history(account_id, played_at DESC);
