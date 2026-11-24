-- Generation changes invalidate authentication attempts started before recovery.
CREATE TABLE IF NOT EXISTS account_auth_generations (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation >= 0)
);
