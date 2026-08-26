// TEMPORARY repair-round diagnostic — mirrors nuketown-traversal.test.ts
// helpers exactly (CELL 0.25, MOVEMENT_RADIUS 0.38, physicsColliders) and
// dumps every walkfield component with bbox + size. Not committed.
import * as THREE from 'three';
import { buildArena } from '../../src/map';
import { circleIntersectsBox } from '../../src/collision';
import { ARENA_BOUNDS, SPAWN_LAYOUT } from '../../src/arena-layout';

const CELL = 0.25;
const R = 0.38;

const map = buildArena(new THREE.Scene());

function groundBlocked(x: number, z: number): boolean {
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    const yaw = b.rotation?.[1];
    let bx = x;
    let bz = z;
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
    if (circleIntersectsBox(bx, bz, R, b)) return true;
  }
  return false;
}

const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
const key = (i: number, j: number) => j * (cols + 1) + i;
const blocked = new Uint8Array((cols + 1) * (rows + 1));
for (let j = 0; j <= rows; j += 1)
  for (let i = 0; i <= cols; i += 1)
    blocked[key(i, j)] = groundBlocked(ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL) ? 1 : 0;

const comp = new Int32Array(blocked.length).fill(-1);
const compCells: number[][] = [];
for (let seed = 0; seed < blocked.length; seed += 1) {
  if (blocked[seed] || comp[seed] >= 0) continue;
  const cells: number[] = [];
  const stack = [seed];
  comp[seed] = compCells.length;
  while (stack.length > 0) {
    const c = stack.pop()!;
    cells.push(c);
    const ci = c % (cols + 1);
    const cj = Math.floor(c / (cols + 1));
    for (let dj = -1; dj <= 1; dj += 1)
      for (let di = -1; di <= 1; di += 1) {
        if (di === 0 && dj === 0) continue;
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || ni > cols || nj < 0 || nj > rows) continue;
        const nk = key(ni, nj);
        if (blocked[nk] || comp[nk] >= 0) continue;
        if (di !== 0 && dj !== 0 && (blocked[key(ni, cj)] || blocked[key(ci, nj)])) continue;
        comp[nk] = compCells.length;
        stack.push(nk);
      }
  }
  compCells.push(cells);
}

const order = compCells
  .map((cells, id) => ({ id, size: cells.length }))
  .sort((a, b) => b.size - a.size);
console.log(`bounds x ${ARENA_BOUNDS.minX}..${ARENA_BOUNDS.maxX} z ${ARENA_BOUNDS.minZ}..${ARENA_BOUNDS.maxZ}`);
for (const { id, size } of order.slice(0, 12)) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const c of compCells[id]) {
    const i = c % (cols + 1);
    const j = Math.floor(c / (cols + 1));
    const x = ARENA_BOUNDS.minX + i * CELL;
    const z = ARENA_BOUNDS.minZ + j * CELL;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  console.log(`comp ${id}: ${size} cells bbox (${minX.toFixed(2)},${minZ.toFixed(2)})..(${maxX.toFixed(2)},${maxZ.toFixed(2)})`);
}

const probe = (label: string, x: number, z: number) => {
  const i = Math.round((x - ARENA_BOUNDS.minX) / CELL);
  const j = Math.round((z - ARENA_BOUNDS.minZ) / CELL);
  console.log(`${label} (${x},${z}): blocked=${blocked[key(i, j)]} comp=${comp[key(i, j)]}`);
};
probe('corner-to-corner start', -29, -27);
for (const [ti, spawnsRaw] of Object.entries(SPAWN_LAYOUT))
  for (const [si, s] of (spawnsRaw as ReadonlyArray<readonly [number, number]>).entries())
    probe(`spawn${ti}-${si}`, s[0], s[1]);

// Clearance of a point vs every ground blocker, mirroring groundBlocked but
// reporting the minimum distance so candidate spawns can require >= 0.7 m.
function clearanceAt(x: number, z: number): number {
  let best = Infinity;
  for (const b of map.physicsColliders) {
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? minY + 3;
    if (maxY <= 0.45 || minY >= 2.2) continue;
    const yaw = b.rotation?.[1];
    let bx = x;
    let bz = z;
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
    const nx = Math.max(b.minX, Math.min(bx, b.maxX));
    const nz = Math.max(b.minZ, Math.min(bz, b.maxZ));
    best = Math.min(best, Math.hypot(bx - nx, bz - nz));
  }
  return best;
}

console.log('--- symmetric pair candidates (both sides clearance>=0.75, |z|>=13, comp0, dist-to-origin 24..34, >=2.5m from other spawns):');
const others = [...SPAWN_LAYOUT[0], ...SPAWN_LAYOUT[1]];
const found: Array<{ x: number; z: number; c: number }> = [];
for (let x = 14; x <= 30.5; x += 0.25)
  for (let z = -30; z <= -12.5; z += 0.25) {
    if (Math.hypot(x, z) < 24 || Math.hypot(x, z) > 34) continue;
    if (others.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < 2.5)) continue;
    const c0 = clearanceAt(x, z);
    if (c0 < 0.75) continue;
    const c1 = clearanceAt(-x, -z);
    if (c1 < 0.75) continue;
    found.push({ x, z, c: Math.min(c0, c1) });
  }
found.sort((a, b) => b.c - a.c);
for (const f of found.slice(0, 25)) console.log(`  pair (${f.x.toFixed(2)},${f.z.toFixed(2)})/${(-f.x).toFixed(2)},${(-f.z).toFixed(2)} minClearance ${f.c.toFixed(2)}`);
// Colliders intersecting the NW pocket band and the east strip.
const inBand = (b: typeof map.physicsColliders[number]) =>
  b.maxX > -31 && b.minX < -21 && b.maxZ > 24.5 && b.minZ < 32;
console.log('--- colliders overlapping NW band x[-31,-21] z[24.5,32]:');
for (const b of map.physicsColliders) {
  const minY = b.minY ?? 0;
  const maxY = b.maxY ?? minY + 3;
  if (maxY <= 0.45 || minY >= 2.2) continue;
  if (!inBand(b)) continue;
  console.log(`  x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)} z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)} y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
}
console.log('--- colliders overlapping NE strip x[27,32] z[17,32]:');
for (const b of map.physicsColliders) {
  const minY = b.minY ?? 0;
  const maxY = b.maxY ?? minY + 3;
  if (maxY <= 0.45 || minY >= 2.2) continue;
  if (!(b.maxX > 27 && b.minX < 32 && b.maxZ > 17 && b.minZ < 32)) continue;
  console.log(`  x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)} z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)} y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
}
console.log('--- colliders in WEST SEAL band x[-32,-18] z[8,20]:');
for (const b of map.physicsColliders) {
  const minY = b.minY ?? 0;
  const maxY = b.maxY ?? minY + 3;
  if (maxY <= 0.45 || minY >= 2.2) continue;
  if (!(b.maxX > -32 && b.minX < -18 && b.maxZ > 8 && b.minZ < 20)) continue;
  console.log(`  x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)} z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)} y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
}
console.log('--- colliders in EAST SEAL band x[18,32] z[-20,-8]:');
for (const b of map.physicsColliders) {
  const minY = b.minY ?? 0;
  const maxY = b.maxY ?? minY + 3;
  if (maxY <= 0.45 || minY >= 2.2) continue;
  if (!(b.maxX > 18 && b.minX < 32 && b.maxZ > -20 && b.minZ < -8)) continue;
  console.log(`  x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)} z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)} y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
}
