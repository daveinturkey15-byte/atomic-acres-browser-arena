CREATE TABLE IF NOT EXISTS leaderboard (
  name_key TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 16),
  best_streak INTEGER NOT NULL CHECK(best_streak BETWEEN 1 AND 100),
  kills INTEGER NOT NULL CHECK(kills BETWEEN best_streak AND 100),
  deaths INTEGER NOT NULL CHECK(deaths BETWEEN 0 AND 200),
  updated_at INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  install_hash TEXT NOT NULL CHECK(length(install_hash) = 64)
);

CREATE INDEX IF NOT EXISTS leaderboard_rank
  ON leaderboard(best_streak DESC, kills DESC, deaths ASC, updated_at ASC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 1),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, bucket)
);

CREATE TABLE IF NOT EXISTS streak_claims (
  idempotency_key TEXT PRIMARY KEY NOT NULL,
  received_at INTEGER NOT NULL
);
