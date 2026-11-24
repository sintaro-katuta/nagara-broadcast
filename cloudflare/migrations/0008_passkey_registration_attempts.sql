CREATE TABLE IF NOT EXISTS passkey_registration_attempts (
  browser_token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_registration_attempts_expiry ON passkey_registration_attempts(expires_at);
