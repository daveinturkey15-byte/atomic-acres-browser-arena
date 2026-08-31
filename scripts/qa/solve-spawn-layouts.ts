// Proposes valid, well-spread spawn sets for arenas whose authored lists fail
// src/spawn-layout-quality.test.ts. Read-only: it prints coordinates for a human
// to paste, and never edits a map.
//
// Guessing spawn coordinates by eye is how invalid points got authored in the
// first place; this searches the arena's own collider set instead.
import * as THREE from 'three';
import { buildArena } from '../../src/map';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from '../../src/additional-maps';
import { buildHighSeas } from '../../src/high-seas';
import { buildTest1, buildTest2 } from '../../src/test-maps';
import { validArenaSpawnPoint } from '../../src/spawn-safety';

const BUILDERS: Record<string, (scene: THREE.Scene) => any> = {
  'atomic-acres': buildArena as never,
  'rustworks-1v1': buildRustworks1v1 as never,
  'gun-range': buildGunRange as never,
  'skyline-terminal': buildSkylineTerminal as never,
  'high-seas': ((scene: THREE.Scene) => buildHighSeas(scene)) as never,
  test1: buildTest1 as never,
  test2: buildTest2 as never,
};

const MIN_PAIR = 4.5;      // comfortably above the gate's 3 m floor
const WANTED = 6;

/** Mirrors a team-0 point to team 1 about the arena centre, keeping the map's symmetry. */
function mirror(point: { x: number; z: number }, centreX: number): { x: number; z: number } {
  return { x: 2 * centreX - point.x, z: point.z };
}

for (const [id, build] of Object.entries(BUILDERS)) {
  const arena = build(new THREE.Scene());
  const { bounds, colliders } = arena;
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const existing: Array<{ x: number; z: number }> = (arena.spawns[0] ?? []).map((p: any) => ({ x: p.x, z: p.z }));

  // Keep the authored points that are still valid; they encode designer intent.
  const kept = existing.filter((p) => validArenaSpawnPoint({ x: p.x, y: 1.7, z: p.z }, bounds, colliders));
  const chosen: Array<{ x: number; z: number }> = [];
  for (const point of kept) {
    if (chosen.every((c) => Math.hypot(c.x - point.x, c.z - point.z) >= MIN_PAIR)) chosen.push(point);
  }

  // Then search the team's own half for extra points, preferring maximum spread.
  const teamSign = chosen.length > 0 && chosen[0]!.x < centreX ? -1 : 1;
  const candidates: Array<{ x: number; z: number }> = [];
  for (let x = bounds.minX + 3; x <= bounds.maxX - 3; x += 1) {
    // Only the team's own third of the map, so a spawn never lands mid-field.
    const fraction = (x - bounds.minX) / (bounds.maxX - bounds.minX);
    if (teamSign < 0 ? fraction > 0.28 : fraction < 0.72) continue;
    for (let z = bounds.minZ + 3; z <= bounds.maxZ - 3; z += 1) {
      if (validArenaSpawnPoint({ x, y: 1.7, z }, bounds, colliders)) candidates.push({ x, z });
    }
  }
  // Greedy farthest-point: each new spawn is the candidate furthest from those chosen.
  while (chosen.length < WANTED && candidates.length > 0) {
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const nearest = chosen.length === 0
        ? Infinity
        : Math.min(...chosen.map((c) => Math.hypot(c.x - candidate.x, c.z - candidate.z)));
      if (nearest < MIN_PAIR) continue;
      if (nearest > bestScore) { bestScore = nearest; best = candidate; }
    }
    if (!best) break;
    chosen.push(best);
  }

  const spanX = Math.max(...chosen.map((p) => p.x)) - Math.min(...chosen.map((p) => p.x));
  const spanZ = Math.max(...chosen.map((p) => p.z)) - Math.min(...chosen.map((p) => p.z));
  const longest = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
  let minPair = Infinity;
  for (let i = 0; i < chosen.length; i += 1) {
    for (let j = i + 1; j < chosen.length; j += 1) minPair = Math.min(minPair, Math.hypot(chosen[i]!.x - chosen[j]!.x, chosen[i]!.z - chosen[j]!.z));
  }
  console.log(`\n=== ${id} === kept ${kept.length}/${existing.length} authored, now ${chosen.length} points`);
  console.log(`    spread ${Math.max(spanX, spanZ).toFixed(1)} m of ${longest.toFixed(0)} m (${(Math.max(spanX, spanZ) / longest * 100).toFixed(0)}%), min pair ${minPair.toFixed(2)} m`);
  console.log('    team0: ' + JSON.stringify(chosen.map((p) => [p.x, p.z])));
  const other = chosen.map((p) => mirror(p, centreX)).filter((p) => validArenaSpawnPoint({ x: p.x, y: 1.7, z: p.z }, bounds, colliders));
  console.log(`    team1 (mirrored, ${other.length} valid): ` + JSON.stringify(other.map((p) => [p.x, p.z])));
}
