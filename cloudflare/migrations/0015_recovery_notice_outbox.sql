CREATE TABLE IF NOT EXISTS recovery_notice_outbox (
 id TEXT PRIMARY KEY NOT NULL,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 next_attempt_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS recovery_notice_outbox_due ON recovery_notice_outbox(next_attempt_at,lease_until);
