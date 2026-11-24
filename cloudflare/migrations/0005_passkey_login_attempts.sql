CREATE TABLE IF NOT EXISTS passkey_login_attempts (
  browser_token_hash TEXT PRIMARY KEY NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_login_attempts_expiry ON passkey_login_attempts(expires_at);
