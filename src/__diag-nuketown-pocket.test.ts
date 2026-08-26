/** Diagnostic: locate the unreachable walkable pockets on Nuke Town. */
import * as THREE from 'three';
import { buildArena } from './map';
import { ARENA_BOUNDS } from './arena-layout';
import { CHARACTER_PHYSICS_CONFIG } from './physics';

const CELL = 0.25;
const R = CHARACTER_PHYSICS_CONFIG.playerRadius;

const scene = new THREE.Scene();
const map = buildArena(scene);

const groundBlocked = (x: number, z: number): boolean => {
  for (const b of map.colliders) {
    if (
      x + R > b.minX && x - R < b.maxX &&
      z + R > b.minZ && z - R < b.maxZ &&
      (b.minY ?? 0) < 1.0 && (b.maxY ?? 3) > 0.2
    ) return true;
  }
  return false;
};

const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
const W = cols + 1;
const walkable = new Uint8Array(W * (rows + 1));
let walkableCount = 0;
for (let j = 0; j <= rows; j += 1) {
  for (let i = 0; i <= cols; i += 1) {
    if (!groundBlocked(ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL)) {
      walkable[j * W + i] = 1;
      walkableCount += 1;
    }
  }
}
const seeds: Array<readonly [number, number]> = [[-10, 0], [10, -4], [-10, 4]];
const seen = new Uint8Array(walkable.length);
const stack: number[] = [];
for (const [sx, sz] of seeds) {
  const i = Math.round((sx - ARENA_BOUNDS.minX) / CELL);
  const j = Math.round((sz - ARENA_BOUNDS.minZ) / CELL);
  const k = j * W + i;
  if (walkable[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
}
while (stack.length > 0) {
  const k = stack.pop()!;
  const i = k % W;
  const j = Math.floor(k / W);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
    const nk = nj * W + ni;
    if (walkable[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
  }
}
// Label remaining components.
const comp = new Int32Array(walkable.length).fill(-1);
let compCount = 0;
const report: Array<{ id: number; cells: number; minX: number; maxX: number; minZ: number; maxZ: number }> = [];
for (let k = 0; k < walkable.length; k += 1) {
  if (!walkable[k] || seen[k] || comp[k] >= 0) continue;
  const id = compCount++;
  let cells = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const st = [k];
  comp[k] = id;
  while (st.length > 0) {
    const c = st.pop()!;
    cells += 1;
    const i = c % W, j = Math.floor(c / W);
    const x = ARENA_BOUNDS.minX + i * CELL, z = ARENA_BOUNDS.minZ + j * CELL;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
      const nk = nj * W + ni;
      if (walkable[nk] && !seen[nk] && comp[nk] < 0) { comp[nk] = id; st.push(nk); }
    }
  }
  report.push({ id, cells, minX, maxX, minZ, maxZ });
}
console.log(`walkable=${walkableCount} total-unreachable=${report.reduce((a, r) => a + r.cells, 0)}`);
for (const r of report.sort((a, b) => b.cells - a.cells)) {
  console.log(`comp${r.id}: ${r.cells} cells, x[${r.minX},${r.maxX}] z[${r.minZ},${r.maxZ}]`);
}
// Where does the lap goal (-28.5, 26) sit?
const gi = Math.round((-28.5 - ARENA_BOUNDS.minX) / CELL);
const gj = Math.round((26 - ARENA_BOUNDS.minZ) / CELL);
const gk = gj * W + gi;
console.log(`lap goal (-28.5,26): walkable=${walkable[gk]} reachableFromSeeds=${seen[gk] ? 1 : 0} comp=${comp[gk]}`);

// Full seed set as the traversal test uses.
import { SPAWN_LAYOUT, PATROL_LAYOUT } from './arena-layout';
const seen2 = new Uint8Array(walkable.length);
const st2: number[] = [];
for (const [sx, sz] of [...SPAWN_LAYOUT[0], ...SPAWN_LAYOUT[1], ...PATROL_LAYOUT, [-10, 0] as const, [10, -4] as const, [-10, 4] as const]) {
  const i = Math.round((sx - ARENA_BOUNDS.minX) / CELL);
  const j = Math.round((sz - ARENA_BOUNDS.minZ) / CELL);
  const k = j * W + i;
  if (walkable[k] && !seen2[k]) { seen2[k] = 1; st2.push(k); }
}
while (st2.length > 0) {
  const k = st2.pop()!;
  const i = k % W, j = Math.floor(k / W);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
    const nk = nj * W + ni;
    if (walkable[nk] && !seen2[nk]) { seen2[nk] = 1; st2.push(nk); }
  }
}
let unreach2 = 0;
for (let k = 0; k < walkable.length; k += 1) if (walkable[k] && !seen2[k]) unreach2 += 1;
console.log(`with-full-seeds unreachable=${unreach2}`);
// Colliders bounding the NW strip's east side.
console.log('--- colliders overlapping x[-27,-15] z[24,31.5]:');
for (const b of map.colliders) {
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  if (cx > -28 && cx < -14 && cz > 23) {
    console.log(`${(map.root.children.find((c) => Math.hypot(c.position.x - cx, c.position.z - cz) < 0.6)?.name ?? '?')} sig=[${(b.maxX-b.minX).toFixed(2)}x${((b.maxY??3)-(b.minY??0)).toFixed(2)}x${(b.maxZ-b.minZ).toFixed(2)}] centre=(${cx.toFixed(2)},${cz.toFixed(2)}) y[${(b.minY??0).toFixed(2)},${(b.maxY??3).toFixed(2)}]`);
  }
}
console.log('--- spawn/patrol seeds:', JSON.stringify([...SPAWN_LAYOUT[0], ...SPAWN_LAYOUT[1]]), JSON.stringify(PATROL_LAYOUT));

import { describe, it } from 'vitest';
describe('diag2', () => {
  it('candidates', () => {
    const cand: Array<[number, number]> = [
      [-28.5, 14], [-28.5, 12], [-26, 15], [-18, 26], [-17, 27], [-13, 27],
      [-28.5, -26], [-29, -20],
    ];
    for (const [x, z] of cand) {
      const i = Math.round((x - ARENA_BOUNDS.minX) / CELL);
      const j = Math.round((z - ARENA_BOUNDS.minZ) / CELL);
      const k = j * W + i;
      console.log(`(${x},${z}): walkable=${walkable[k]} main=${seen2[k]}`);
    }
    // Per-region unreachable counts for pinned budgets.
    const boxes: Array<[string, number, number, number, number]> = [
      ['nw-strip', -31, -23.9, 25.1, 32],
      ['gh-interior', -29.6, -26.4, 17, 25.1],
      ['ne-nook', 22, 32, 20, 32],
    ];
    const counts = new Map<string, number>(boxes.map(([n]) => [n, 0]));
    let outside = 0;
    for (let kk = 0; kk < walkable.length; kk += 1) {
      if (!walkable[kk] || seen2[kk]) continue;
      const x = ARENA_BOUNDS.minX + (kk % W) * CELL;
      const z = ARENA_BOUNDS.minZ + Math.floor(kk / W) * CELL;
      const hit = boxes.find(([, x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
      if (hit) counts.set(hit[0], counts.get(hit[0])! + 1);
      else { outside += 1; console.log(`OUTSIDE-BOX unreachable at (${x},${z})`); }
    }
    console.log('region counts:', JSON.stringify([...counts]), 'outside=', outside);
  });
});
