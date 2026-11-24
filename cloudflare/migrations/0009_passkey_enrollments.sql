-- Private, temporary enrollment state. Expired rows must be cleaned up.
CREATE TABLE IF NOT EXISTS passkey_enrollments (
  account_id TEXT PRIMARY KEY NOT NULL,
  email_lookup TEXT NOT NULL,
  email_ciphertext TEXT NOT NULL,
  email_token_hash TEXT UNIQUE,
  browser_token_hash TEXT UNIQUE,
  challenge TEXT,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS passkey_enrollments_expiry ON passkey_enrollments(expires_at);
