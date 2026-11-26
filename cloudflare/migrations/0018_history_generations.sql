-- History deletion advances the generation so delayed writes cannot restore it.
CREATE TABLE IF NOT EXISTS account_history_generations (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  generation INTEGER NOT NULL DEFAULT 0 CHECK(generation >= 0)
);
