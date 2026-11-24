CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts > 0),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_limits_expiry ON auth_rate_limits(expires_at);
