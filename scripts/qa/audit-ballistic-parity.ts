#!/usr/bin/env tsx
// Ballistic visual-parity sweep (Direction C) - enumerates, per arena:
//   1. every authored shot surface with its resolved material + classification
//      (explicit / rule / fallback), and
//   2. the substantial-visible-mesh census: rated directly, rated by an
//      overlapping shot-surface footprint, dynamic target, excluded by a
//      stated shoot-through rule, ACCEPTED (ledger row with reason), or
//      UNRATED (ghost cover: bullets cross it with no impact and no cost).
//
// Writes one JSON ledger per arena under docs/ballistic-parity/ with an
// explicit completion percentage. The permanent CI gate over the same engine
// lives in src/collider-visual-parity-gate.test.ts; the accepted rows and
// ratchet ceilings live in scripts/qa/ballistic-parity-ledger.ts.
//
// Exit codes: 0 = every requested arena within its ratchet ceiling,
//             1 = ceiling exceeded, 2 = an arena failed to construct.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ALL_ARENA_IDS, runColliderVisualParityAudit } from './collider-visual-parity-core';
import {
  ACCEPTED_SHOOT_THROUGH,
  BALLISTIC_UNRATED_CEILINGS,
  matchAcceptedShootThrough,
} from './ballistic-parity-ledger';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const OUT_DIR = resolve(arg('--out', 'docs/ballistic-parity'));
const ARENAS = arg('--arenas', ALL_ARENA_IDS.join(','))
  .split(',').map((value) => value.trim()).filter(Boolean);

async function main(): Promise<void> {
  const results = await runColliderVisualParityAudit(ARENAS);
  mkdirSync(OUT_DIR, { recursive: true });

  let exitCode = 0;
  for (const result of results) {
    if (result.error) {
      exitCode = 2;
      console.log(`\n=== ${result.id}: AUDIT ERROR ===\n${result.error}`);
      continue;
    }
    const census = result.ballisticCensus!;
    const { unmatched, accepted, staleRows } = matchAcceptedShootThrough(result.id, result.ballisticGhostMeshes ?? []);
    const ceiling = BALLISTIC_UNRATED_CEILINGS[result.id] ?? 0;
    const explained = census.ratedDirect + census.ratedByFootprint + census.dynamicTargets
      + census.excludedByRule + accepted.length;
    const completionPercent = census.total === 0 ? 100 : Math.round((explained / census.total) * 1000) / 10;
    const ledger = {
      arena: result.id,
      // What this ledger claims, in one line a reviewer can falsify.
      contract: 'every substantial visible mesh is rated for gunfire, excluded by a stated rule, or accepted below with a reason; unrated is the honest remainder',
      completionPercent,
      ratchet: { unratedAfterLedger: unmatched.length, ceiling, withinCeiling: unmatched.length <= ceiling },
      census: { ...census, acceptedByLedger: accepted.length, unratedAfterLedger: unmatched.length },
      shotSurfaceStats: result.shotSurfaceStats,
      excludedByRule: result.ballisticExcludedByRuleCounts,
      footprintExplained: result.ballisticFootprintExplained,
      acceptedShootThrough: accepted,
      unratedMeshes: unmatched,
      staleLedgerRows: staleRows,
      shotSurfaces: result.shotSurfaceRoster,
    };
    const path = resolve(OUT_DIR, `${result.id}.json`);
    writeFileSync(path, `${JSON.stringify(ledger, null, 1)}\n`);
    console.log(`\n=== ${result.id}: census ${census.total} | direct ${census.ratedDirect}`
      + ` | footprint ${census.ratedByFootprint} | targets ${census.dynamicTargets}`
      + ` | excluded ${census.excludedByRule} | accepted ${accepted.length}`
      + ` | UNRATED ${unmatched.length} (ceiling ${ceiling}) | completion ${completionPercent}%`);
    console.log(`  surfaces: ${JSON.stringify(result.shotSurfaceStats)}`);
    if (staleRows.length > 0) console.log(`  STALE ledger rows: ${staleRows.map((row) => row.name).join(', ')}`);
    for (const ghost of unmatched.slice(0, 40)) console.log(`  UNRATED ${JSON.stringify(ghost)}`);
    if (unmatched.length > 40) console.log(`  ... and ${unmatched.length - 40} more (full list in ${path})`);
    if (unmatched.length > ceiling) exitCode = Math.max(exitCode, 1);
  }
  console.log(`\nLedgers written to ${OUT_DIR}`);
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
