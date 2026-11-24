CREATE TABLE IF NOT EXISTS passkey_recovery_attempts (
  browser_token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  challenge TEXT,
  challenge_expires_at INTEGER,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_recovery_attempts_expiry ON passkey_recovery_attempts(expires_at);
