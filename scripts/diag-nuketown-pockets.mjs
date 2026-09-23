/* Diagnostic: locate unreachable walkable pockets on Nuke Town (read-only).
 * Mirrors src/nuketown-traversal.test.ts groundBlocked + flood fill exactly. */
import * as THREE from 'three';
import { buildArena } from '../src/map';
import { ARENA_BOUNDS } from '../src/arena-layout';
import { CHARACTER_PHYSICS_CONFIG } from '../src/physics';
import { circleIntersectsBox } from '../src/collision';

const CELL = 0.25;
const RADIUS = CHARACTER_PHYSICS_CONFIG.playerRadius;

const map = buildArena(new THREE.Scene());
const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);

function blocked(x, z) {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    let bx = x;
    let bz = z;
    const yaw = b.rotation?.[1];
    if (yaw !== undefined && yaw !== 0) {
      const cx = (b.minX + b.maxX) / 2;
      const cz = (b.minZ + b.maxZ) / 2;
      const dx = x - cx;
      const dz = z - cz;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      bx = cx + dx * cos - dz * sin;
      bz = cz + dx * sin + dz * cos;
    }
    if (circleIntersectsBox(bx, bz, RADIUS, b)) return true;
  }
  return false;
}

const W = cols + 1;
const walkable = new Uint8Array(W * (rows + 1));
let walkableCount = 0;
for (let j = 0; j <= rows; j += 1) {
  for (let i = 0; i <= cols; i += 1) {
    if (!blocked(ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL)) {
      walkable[j * W + i] = 1;
      walkableCount += 1;
    }
  }
}

const label = new Int32Array(W * (rows + 1)).fill(-1);
const comps = [];
for (let s = 0; s < walkable.length; s += 1) {
  if (!walkable[s] || label[s] >= 0) continue;
  const id = comps.length;
  const stack = [s];
  label[s] = id;
  const c = { size: 0, minI: s % W, maxI: s % W, minJ: Math.floor(s / W), maxJ: Math.floor(s / W) };
  while (stack.length) {
    const k = stack.pop();
    c.size += 1;
    const i = k % W;
    const j = Math.floor(k / W);
    if (i < c.minI) c.minI = i;
    if (i > c.maxI) c.maxI = i;
    if (j < c.minJ) c.minJ = j;
    if (j > c.maxJ) c.maxJ = j;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || ni >= W || nj < 0 || nj > rows) continue;
      const nk = nj * W + ni;
      if (walkable[nk] && label[nk] < 0) { label[nk] = id; stack.push(nk); }
    }
  }
  comps.push(c);
}
comps.forEach((c, id) => { c.id = id; });

const seeds = [[-10, 0], [10, -4], [-10, 4], [-25, 25], [25, -25], ...[[-15,-12],[15,12],[-6,-6],[6,6],[-19,-7],[19,7],[-24,-20],[24,20]]];
const seedIds = new Set();
for (const [sx, sz] of seeds) {
  const i = Math.round((sx - ARENA_BOUNDS.minX) / CELL);
  const j = Math.round((sz - ARENA_BOUNDS.minZ) / CELL);
  if (label[j * W + i] >= 0) seedIds.add(label[j * W + i]);
}

const wx = (i) => (ARENA_BOUNDS.minX + i * CELL).toFixed(2);
const wz = (j) => (ARENA_BOUNDS.minZ + j * CELL).toFixed(2);
const probes = [
  ['team0 spawn', 24.5, -16], ['team1 spawn', -24.5, 16],
  ['old t0', 24.5, -21], ['old t1', -24.5, 21],
  ['NE turn', 28.5, -26], ['E turn', 30, 25.5],
  ['N turn', -18, 26], ['W turn', -28.5, 14], ['SW start', -28.5, -26],
];
for (const [name, px, pz] of probes) {
  const i = Math.round((px - ARENA_BOUNDS.minX) / CELL);
  const j = Math.round((pz - ARENA_BOUNDS.minZ) / CELL);
  const k = j * W + i;
  const cid = label[k];
  const c = comps.find((c) => c.id === cid);
  console.log(`${name} (${px},${pz}) cell=${walkable[k] ? 'walkable' : 'BLOCKED'} comp=${cid}${c ? ` size=${c.size} bbox x[${wx(c.minI)}..${wx(c.maxI)}] z[${wz(c.minJ)}..${wz(c.maxJ)}]` : ''}`);
}
console.log('---');
console.log(`components=${comps.length} total walkable=${walkableCount} seedComps=${[...seedIds].join(',')}`);
comps.sort((a, b) => b.size - a.size);
for (const c of comps.slice(0, 12)) {
  console.log(
    `comp#${c.id} size=${c.size} bbox x[${wx(c.minI)}..${wx(c.maxI)}] z[${wz(c.minJ)}..${wz(c.maxJ)}]${seedIds.has(c.id) ? '  <-- seeded' : ''}`,
  );
}

// Colliders near the bbox of each big non-seed component.
for (const c of comps.filter((x) => !seedIds.has(x.id) && x.size > 40).slice(0, 6)) {
  const x0 = ARENA_BOUNDS.minX + c.minI * CELL - 1.5;
  const x1 = ARENA_BOUNDS.minX + c.maxI * CELL + 1.5;
  const z0 = ARENA_BOUNDS.minZ + c.minJ * CELL - 1.5;
  const z1 = ARENA_BOUNDS.minZ + c.maxJ * CELL + 1.5;
  console.log(`\n--- comp#${c.id} size=${c.size} nearby colliders:`);
  for (const b of map.physicsColliders) {
    if ((b.maxX ?? b.minX) < x0 || b.minX > x1) continue;
    if ((b.maxZ ?? b.minZ) < z0 || b.minZ > z1) continue;
    console.log(`   ${b.name ?? '<unnamed>'} x[${b.minX.toFixed(2)}..${b.maxX.toFixed(2)}] z[${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)}] y[${(b.minY ?? 0).toFixed(2)}..${(b.maxY ?? 3).toFixed(2)}]`);
  }
}
