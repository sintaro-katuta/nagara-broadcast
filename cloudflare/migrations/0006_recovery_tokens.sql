CREATE TABLE IF NOT EXISTS recovery_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','recover_account')),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS recovery_tokens_account ON recovery_tokens(account_id,purpose);
CREATE INDEX IF NOT EXISTS recovery_tokens_expiry ON recovery_tokens(expires_at);
