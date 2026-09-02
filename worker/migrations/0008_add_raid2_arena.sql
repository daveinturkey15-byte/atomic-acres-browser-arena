-- RAID2, Pass 87 (owner 2026-09-02, HF-408): the Raid layout rebuild joins the
-- canonical arena set. Keep the D1 persistence boundary aligned with the
-- ten-arena diagnostics schema. SQLite cannot alter a CHECK constraint in
-- place, so rebuild the table without discarding retained diagnostic rows
-- (same pattern as 0005, 0006 and 0007).
--
-- The shipped Raid keeps its own id `test2`: retained rows recorded against it
-- still name the arena they were recorded on, which is the whole reason the
-- rebuild ships beside it under a new id instead of taking its place.

PRAGMA foreign_keys = OFF;

CREATE TABLE match_diagnostics_v5 (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at_minute INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  release_pass TEXT NOT NULL,
  backend TEXT NOT NULL CHECK(backend IN ('webgpu', 'webgl-compatibility')),
  arena TEXT NOT NULL CHECK(arena IN ('atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range', 'farcrysis', 'high-seas', 'test1', 'test2', 'map3', 'raid2')),
  mode TEXT NOT NULL CHECK(mode IN ('solo', 'tdm', 'ffa', 'domination')),
  role TEXT NOT NULL CHECK(role IN ('offline', 'host', 'guest')),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes BETWEEN 2 AND 49152),
  payload_json TEXT NOT NULL
);

INSERT INTO match_diagnostics_v5 (
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
ALTER TABLE match_diagnostics_v5 RENAME TO match_diagnostics;

CREATE INDEX match_diagnostics_retention
  ON match_diagnostics(expires_at);

CREATE INDEX match_diagnostics_completed
  ON match_diagnostics(completed_at_minute, arena, mode);

PRAGMA foreign_keys = ON;
