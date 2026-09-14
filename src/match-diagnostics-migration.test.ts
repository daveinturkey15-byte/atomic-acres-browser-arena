import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from './arena-identity';

const initialMigration = readFileSync(
  new URL('../worker/migrations/0004_match_diagnostics.sql', import.meta.url),
  'utf8',
);
const arenaExpansionMigration = readFileSync(
  new URL('../worker/migrations/0005_expand_match_diagnostic_arenas.sql', import.meta.url),
  'utf8',
);
// owner 2026-08-30: Test1/Test2 arenas added — 0006 rebuilds the CHECK to the
// eight-arena set, so the full chain must run before every canonical arena inserts.
const testArenaExpansionMigration = readFileSync(
  new URL('../worker/migrations/0006_add_test_arenas.sql', import.meta.url),
  'utf8',
);
// MAP3 (owner 2026-09-02, HF-405): 0007 rebuilds the CHECK to the nine-arena
// set. Same pattern, same reason - SQLite cannot alter a CHECK in place.
const map3ArenaExpansionMigration = readFileSync(
  new URL('../worker/migrations/0007_add_map3_arena.sql', import.meta.url),
  'utf8',
);
// NUKETOWN2 (owner 2026-09-02, HF-407): 0008 rebuilds the CHECK to the
// ten-arena set. Same pattern, same reason.
const nuketown2ArenaExpansionMigration = readFileSync(
  new URL('../worker/migrations/0008_add_nuketown2_arena.sql', import.meta.url),
  'utf8',
);
// RAID2 (owner 2026-09-02, HF-408): the eleventh arena. Renumbered 0008 -> 0009
// at integration, because the Nuke Town Rebuild had already taken 0008.
// Applied AFTER 0008 in the
// same order production applies them, so this test exercises the real chain
// rather than the newest migration against a fresh table.
const raid2ArenaExpansionMigration = readFileSync(
  new URL('../worker/migrations/0009_add_raid2_arena.sql', import.meta.url),
  'utf8',
);

const insertDiagnostic = (database: DatabaseSync, receiptId: string, arena: string): void => {
  database.prepare(`
    INSERT INTO match_diagnostics (
      receipt_id, idempotency_key, received_at, expires_at, completed_at_minute,
      build_id, release_pass, backend, arena, mode, role, payload_bytes, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    receiptId,
    `idempotency-${receiptId}`,
    1_800_000_000_000,
    1_800_086_400_000,
    30_000_000,
    'pass75-migration-test',
    'PASS 75',
    'webgpu',
    arena,
    'solo',
    'offline',
    2,
    '{}',
  );
};

describe('match diagnostics arena expansion migration', () => {
  it('preserves retained rows and indexes while admitting every canonical arena', () => {
    const database = new DatabaseSync(':memory:');

    try {
      database.exec(initialMigration);
      insertDiagnostic(database, 'retained-row', 'atomic-acres');

      database.exec(arenaExpansionMigration);
      database.exec(testArenaExpansionMigration);
      database.exec(map3ArenaExpansionMigration);
      database.exec(nuketown2ArenaExpansionMigration);
      database.exec(raid2ArenaExpansionMigration);

      for (const arena of ARENA_IDS) insertDiagnostic(database, `new-${arena}`, arena);

      const rows = database.prepare(`
        SELECT receipt_id, arena, payload_json
        FROM match_diagnostics
        ORDER BY receipt_id
      `).all();
      expect(rows).toContainEqual({
        receipt_id: 'retained-row',
        arena: 'atomic-acres',
        payload_json: '{}',
      });
      expect(rows).toContainEqual({
        receipt_id: 'new-high-seas',
        arena: 'high-seas',
        payload_json: '{}',
      });
      expect(rows).toHaveLength(ARENA_IDS.length + 1);

      const indexNames = database.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'index' AND tbl_name = 'match_diagnostics'
      `).all().map((row) => row.name);
      expect(indexNames).toEqual(expect.arrayContaining([
        'match_diagnostics_retention',
        'match_diagnostics_completed',
      ]));

      expect(() => insertDiagnostic(database, 'invalid-arena', 'not-an-arena')).toThrow(/CHECK constraint failed/u);
    } finally {
      database.close();
    }
  });
});
