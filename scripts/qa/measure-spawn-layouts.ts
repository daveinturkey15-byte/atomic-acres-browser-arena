// HF-402: measures every authored spawn on every selectable arena against the
// constraints the spawn gate enforces, and prints one table per arena plus a
// JSON record. Read-only: it never edits a map.
//
//   npx tsx scripts/qa/measure-spawn-layouts.ts [--out artifacts/qa/hf402/layouts.json] [--arenas a,b]
//
// The roster is DERIVED from ARENA_SELECTIONS (selectable !== false), never a
// hand-kept list - a hardcoded roster is how three earlier gates went green
// while never looking at the newest arenas.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as THREE from 'three';
import { SELECTABLE_ARENA_BUILDERS, measureSpawnLayout, type SpawnLayoutReport } from '../../src/spawn-layout-constraints';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string | null): string | null => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : fallback;
};
const OUT = arg('--out', null);
const ONLY = arg('--arenas', null)?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? null;

const reports: SpawnLayoutReport[] = [];
// MAP3 (HF-409 finisher 2): buildMap3 throws until its wasm is resolved.
await (await import('../../src/map3-arena')).prepareMap3();
for (const [id, build] of SELECTABLE_ARENA_BUILDERS()) {
  if (ONLY && !ONLY.includes(id)) continue;
  const arena = build(new THREE.Scene());
  const report = measureSpawnLayout(id, arena);
  reports.push(report);
  console.log(`\n=== ${id} === ${report.summary.spawnCount} spawns, in-envelope ${report.summary.inEnvelopePercent}% (floor ${report.summary.floorPercent}%, reach ${report.summary.reachablePercent}%), `
    + `POI median ${report.summary.medianPoiDistanceM} m, cover max ${report.summary.maxCoverDistanceM} m, standoff min ${report.summary.minWallStandoffM} m, open arc min ${report.summary.minOpenArcFraction}, cross-team min ${report.summary.crossTeamMinDistanceM} m, enemy-LOS pairs ${report.summary.enemyLosPairs}`);
  console.log('  team  x       z       y     floor(src)      route   jump  cover   poi   stand   arc   los(nearest)  verdict');
  for (const point of report.points) {
    const floor = point.floorGapM === null ? 'NONE' : `${point.floorGapM.toFixed(2)} ${point.floorSource}`;
    const los = `${point.enemySpawnsVisible}${point.nearestVisibleEnemyM === null ? '' : ` (${point.nearestVisibleEnemyM.toFixed(0)} m)`}`;
    const standoff = Number.isFinite(point.wallStandoffM) ? point.wallStandoffM.toFixed(2) : ' inf';
    console.log(`  ${point.team}   ${point.x.toFixed(1).padStart(6)} ${point.z.toFixed(1).padStart(7)} ${point.y.toFixed(1).padStart(6)}  ${floor.padEnd(16)} ${point.reachable ? 'yes' : 'NO '}     ${point.reachableByJump ? 'yes' : 'NO '}   ${point.coverDistanceM.toFixed(1).padStart(5)}  ${point.poiDistanceM.toFixed(1).padStart(5)}  ${standoff.padStart(5)}  ${point.openArcFraction.toFixed(2)}  ${los.padEnd(12)}  ${point.failures.length === 0 ? 'ok' : point.failures.join(',')}`);
  }
  if (report.failures.length > 0) console.log(`  layout: ${report.failures.join(', ')}`);
  if (report.summary.worstOffender) console.log(`  worst: ${report.summary.worstOffender}`);
}

if (OUT) {
  const path = resolve(process.cwd(), OUT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2));
  console.log(`\nwrote ${path}`);
}
