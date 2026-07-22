-- Pass 48: raise kill/streak ceiling from 100 → 9999 to match shared/leaderboard-policy.ts
-- SQLite cannot ALTER CHECK constraints in place, so rebuild the leaderboard table.

PRAGMA foreign_keys = OFF;

CREATE TABLE leaderboard_v2 (
  name_key TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 16),
  best_streak INTEGER NOT NULL CHECK(best_streak BETWEEN 1 AND 9999),
  kills INTEGER NOT NULL CHECK(kills BETWEEN best_streak AND 9999),
  deaths INTEGER NOT NULL CHECK(deaths BETWEEN 0 AND 200),
  updated_at INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  install_hash TEXT NOT NULL CHECK(length(install_hash) = 64)
);

INSERT INTO leaderboard_v2 (
  name_key, name, best_streak, kills, deaths, updated_at, build_id, install_hash
)
SELECT
  name_key, name, best_streak, kills, deaths, updated_at, build_id, install_hash
FROM leaderboard;

DROP TABLE leaderboard;
ALTER TABLE leaderboard_v2 RENAME TO leaderboard;

CREATE INDEX IF NOT EXISTS leaderboard_rank
  ON leaderboard(best_streak DESC, kills DESC, deaths ASC, updated_at ASC);

PRAGMA foreign_keys = ON;
