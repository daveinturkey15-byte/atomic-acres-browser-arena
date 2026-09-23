-- Pass 79 (owner 2026-08-30): Test1/Test2 arenas join the canonical arena set.
-- Keep the D1 persistence boundary aligned with the eight-arena diagnostics
-- schema. SQLite cannot alter a CHECK constraint in place, so rebuild the
-- table without discarding retained diagnostic rows (same pattern as 0005).

PRAGMA foreign_keys = OFF;

CREATE TABLE match_diagnostics_v3 (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at_minute INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  release_pass TEXT NOT NULL,
  backend TEXT NOT NULL CHECK(backend IN ('webgpu', 'webgl-compatibility')),
  arena TEXT NOT NULL CHECK(arena IN ('atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range', 'farcrysis', 'high-seas', 'test1', 'test2')),
  mode TEXT NOT NULL CHECK(mode IN ('solo', 'tdm', 'ffa', 'domination')),
  role TEXT NOT NULL CHECK(role IN ('offline', 'host', 'guest')),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes BETWEEN 2 AND 49152),
  payload_json TEXT NOT NULL
);

INSERT INTO match_diagnostics_v3 (
  receipt_id,
  idempotency_key,
  received_at,
  expires_at,
  completed_at_minute,
  build_id,
  release_pass,
  backend,
  arena,
  mode,
  role,
  payload_bytes,
  payload_json
)
SELECT
  receipt_id,
  idempotency_key,
  received_at,
  expires_at,
  completed_at_minute,
  build_id,
  release_pass,
  backend,
  arena,
  mode,
  role,
  payload_bytes,
  payload_json
FROM match_diagnostics;

DROP TABLE match_diagnostics;
ALTER TABLE match_diagnostics_v3 RENAME TO match_diagnostics;

CREATE INDEX match_diagnostics_retention
  ON match_diagnostics(expires_at);

CREATE INDEX match_diagnostics_completed
  ON match_diagnostics(completed_at_minute, arena, mode);

PRAGMA foreign_keys = ON;
