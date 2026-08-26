-- Shared-systems contribution: activate only with the season-aware client and Worker.
-- Deliberately does not preserve legacy rows because the owner requested a full reset.

PRAGMA foreign_keys = OFF;

CREATE TABLE leaderboard_v3 (
  season TEXT NOT NULL,
  name_key TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 16),
  best_streak INTEGER NOT NULL CHECK(best_streak BETWEEN 1 AND 9999),
  kills INTEGER NOT NULL CHECK(kills BETWEEN best_streak AND 9999),
  deaths INTEGER NOT NULL CHECK(deaths BETWEEN 0 AND 200),
  updated_at INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  install_hash TEXT NOT NULL CHECK(length(install_hash) = 64),
  PRIMARY KEY (season, name_key)
);

DROP TABLE leaderboard;
ALTER TABLE leaderboard_v3 RENAME TO leaderboard;

CREATE INDEX leaderboard_rank
  ON leaderboard(season, best_streak DESC, kills DESC, deaths ASC, updated_at ASC);

DELETE FROM streak_claims;
DELETE FROM rate_limits;

PRAGMA foreign_keys = ON;
