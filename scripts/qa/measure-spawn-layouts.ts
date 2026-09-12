// HF-456: measures every authored spawn on every registered arena against the
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
import { ARENA_BUILDERS, measureSpawnLayout, type SpawnLayoutReport } from '../../src/spawn-layout-constraints';
import { ARENA_SELECTIONS } from '../../src/map-selection';

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string | null): string | null => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : fallback;
};
const OUT = arg('--out', null);
const ONLY = arg('--arenas', null)?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? null;

type SpawnTableMetrics = Readonly<{
  count: number;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  spanX: number;
  spanZ: number;
  meanNearestNeighbourM: number | null;
}>;

function tableMetrics(points: readonly THREE.Vector3[]): SpawnTableMetrics {
  const x = points.map((point) => point.x);
  const z = points.map((point) => point.z);
  const nearest = points.map((point, index) => {
    const distances = points
      .filter((_, otherIndex) => otherIndex !== index)
      .map((other) => Math.hypot(point.x - other.x, point.z - other.z));
    return distances.length === 0 ? null : Math.min(...distances);
  }).filter((distance): distance is number => distance !== null);
  return {
    count: points.length,
    bounds: {
      minX: Math.min(...x), maxX: Math.max(...x),
      minZ: Math.min(...z), maxZ: Math.max(...z),
    },
    spanX: Math.max(...x) - Math.min(...x),
    spanZ: Math.max(...z) - Math.min(...z),
    meanNearestNeighbourM: nearest.length === 0 ? null : Number((nearest.reduce((sum, distance) => sum + distance, 0) / nearest.length).toFixed(2)),
  };
}

async function main(): Promise<void> {
  const reports: SpawnLayoutReport[] = [];
  const metrics: Array<{
    id: string;
    displayName: string;
    kind: string;
    status: 'offered' | 'parked';
    tables: [SpawnTableMetrics, SpawnTableMetrics];
  }> = [];
  // MAP3 (HF-409 finisher 2): buildMap3 throws until its wasm is resolved.
  await (await import('../../src/map3-arena')).prepareMap3();
  for (const selection of ARENA_SELECTIONS) {
    const id = selection.id;
    if (ONLY && !ONLY.includes(id)) continue;
    const arena = ARENA_BUILDERS[id](new THREE.Scene());
    const report = measureSpawnLayout(id, arena);
    reports.push(report);
    const tables: [SpawnTableMetrics, SpawnTableMetrics] = [tableMetrics(arena.spawns[0]), tableMetrics(arena.spawns[1])];
    metrics.push({
      id,
      displayName: selection.displayName,
      kind: selection.kind,
      status: selection.selectable === false ? 'parked' : 'offered',
      tables,
    });
    console.log(`\n=== ${id} === ${selection.selectable === false ? 'PARKED' : 'OFFERED'} ${selection.kind}; `
      + `team0 ${tables[0].count} (${tables[0].spanX.toFixed(1)} x ${tables[0].spanZ.toFixed(1)} m, `
      + `mean-NN ${tables[0].meanNearestNeighbourM ?? 'n/a'} m), team1 ${tables[1].count} (${tables[1].spanX.toFixed(1)} x ${tables[1].spanZ.toFixed(1)} m, `
      + `mean-NN ${tables[1].meanNearestNeighbourM ?? 'n/a'} m); `
      + `in-envelope ${report.summary.inEnvelopePercent}% (floor ${report.summary.floorPercent}%, reach ${report.summary.reachablePercent}%), `
      + `cover max ${report.summary.maxCoverDistanceM} m, standoff min ${report.summary.minWallStandoffM} m, open arc min ${report.summary.minOpenArcFraction}, `
      + `cross-team min ${report.summary.crossTeamMinDistanceM} m, enemy-LOS pairs ${report.summary.enemyLosPairs}`);
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
    writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), metrics, reports }, null, 2));
    console.log(`\nwrote ${path}`);
  }
}

main().catch((error: unknown) => {
  console.error('[spawn-layout] audit crashed:', error);
  process.exitCode = 2;
});
