-- Recovery is not publicly exposed until verification, throttling and email delivery are implemented.
CREATE TABLE IF NOT EXISTS recovery_emails (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email_lookup TEXT UNIQUE NOT NULL,
  email_ciphertext TEXT NOT NULL,
  verified_at TEXT NOT NULL
);
