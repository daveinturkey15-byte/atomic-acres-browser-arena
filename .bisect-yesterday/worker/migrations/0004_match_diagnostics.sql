CREATE TABLE IF NOT EXISTS match_diagnostics (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at_minute INTEGER NOT NULL,
  build_id TEXT NOT NULL,
  release_pass TEXT NOT NULL,
  backend TEXT NOT NULL CHECK(backend IN ('webgpu', 'webgl-compatibility')),
  arena TEXT NOT NULL CHECK(arena IN ('atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range')),
  mode TEXT NOT NULL CHECK(mode IN ('solo', 'tdm', 'ffa')),
  role TEXT NOT NULL CHECK(role IN ('offline', 'host', 'guest')),
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes BETWEEN 2 AND 49152),
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS match_diagnostics_retention
  ON match_diagnostics(expires_at);

CREATE INDEX IF NOT EXISTS match_diagnostics_completed
  ON match_diagnostics(completed_at_minute, arena, mode);
