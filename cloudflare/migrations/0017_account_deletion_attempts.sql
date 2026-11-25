CREATE TABLE account_deletion_attempts (
 session_hash TEXT PRIMARY KEY NOT NULL REFERENCES account_sessions(token_hash) ON DELETE CASCADE,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 challenge TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX account_deletion_attempts_expiry ON account_deletion_attempts(expires_at);
