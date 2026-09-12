/* Prove/disprove: are the r9 greenhouse spawn pairs pathable to the street? */
import * as THREE from 'three';
import { buildArena } from '../src/map';
import { ARENA_BOUNDS } from '../src/arena-layout';
import { CHARACTER_PHYSICS_CONFIG } from '../src/physics';
import { circleIntersectsBox } from '../src/collision';

const CELL = 0.25;
const RADIUS = CHARACTER_PHYSICS_CONFIG.playerRadius;
const map = buildArena(new THREE.Scene());

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
      const dx = x - cx, dz = z - cz;
      bx = cx + dx * Math.cos(yaw) - dz * Math.sin(yaw);
      bz = cz + dx * Math.sin(yaw) + dz * Math.cos(yaw);
    }
    if (circleIntersectsBox(bx, bz, RADIUS, b)) return true;
  }
  return false;
}

const cols = Math.round((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL);
const rows = Math.round((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL);
const W = cols + 1;
const idx = (x, z) => [
  Math.round((x - ARENA_BOUNDS.minX) / CELL),
  Math.round((z - ARENA_BOUNDS.minZ) / CELL),
];

// A* 8-connected, mirrors the traversal harness.
const walk = new Uint8Array(W * (rows + 1));
for (let j = 0; j <= rows; j += 1)
  for (let i = 0; i <= cols; i += 1)
    if (!blocked(ARENA_BOUNDS.minX + i * CELL, ARENA_BOUNDS.minZ + j * CELL)) walk[j * W + i] = 1;

// Full-grid label pass once, then classify each probe point.
const label = new Int32Array(W * (rows + 1)).fill(-1);
{
  let next = 0;
  for (let s = 0; s < walk.length; s += 1) {
    if (!walk[s] || label[s] >= 0) continue;
    const id = next += 1;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const k = stack.pop();
      const i = k % W, j = Math.floor(k / W);
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || ni >= W || nj < 0 || nj > rows) continue;
        const nk = nj * W + ni;
        if (walk[nk] && label[nk] < 0) { label[nk] = id; stack.push(nk); }
      }
    }
  }
}
function path(from, to) {
  const [ti, tj] = idx(to[0], to[1]);
  // Snap: nearest walkable cell within 1.2 m of the requested point.
  let best = null, bestD = Infinity;
  for (let dj = -5; dj <= 5; dj += 1) {
    for (let di = -5; di <= 5; di += 1) {
      const ni = idx(from[0], from[1])[0] + di;
      const nj = idx(from[0], from[1])[1] + dj;
      if (ni < 0 || ni >= W || nj < 0 || nj > rows) continue;
      const k = nj * W + ni;
      if (!walk[k]) continue;
      const d = di * di + dj * dj;
      if (d < bestD) { bestD = d; best = [ni, nj]; }
    }
  }
  if (!best) return 'START-CELL-BLOCKED>1.2m';
  const [si, sj] = best;
  const seen = new Set([sj * W + si]);
  const prev = new Map();
  const queue = [[si, sj]];
  while (queue.length) {
    const [ci, cj] = queue.shift();
    if (ci === ti && cj === tj) {
      let n = 0, cur = cj * W + ci;
      while (prev.has(cur)) { n += 1; cur = prev.get(cur); }
      return `${n + 1} waypoints`;
    }
    for (let di = -1; di <= 1; di += 1) {
      for (let dj = -1; dj <= 1; dj += 1) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || ni >= W || nj < 0 || nj > rows) continue;
        const nk = nj * W + ni;
        if (seen.has(nk) || !walk[nk]) continue;
        if (di && dj && (blocked(ARENA_BOUNDS.minX + (ci + di) * CELL, ARENA_BOUNDS.minZ + cj * CELL) || blocked(ARENA_BOUNDS.minX + ci * CELL, ARENA_BOUNDS.minZ + (cj + dj) * CELL))) continue;
        seen.add(nk);
        prev.set(nk, cj * W + ci);
        queue.push([ni, nj]);
      }
    }
  }
  return `NO PATH (comp ${label[tj * W + ti]} vs start comp ${label[sj * W + si]})`;
}

const cases = [
  ["team0 spawn (24.5,-16)", [24.5, -16], [10, -4]],
  ["team1 spawn (-24.5,16)", [-24.5, 16], [-10, 4]],
  ["lap NE turn (28.5,-26)", [28.5, -26], [10, -4]],
  ["lap E turn (30,25.5)", [30, 25.5], [10, 4]],
  ["lap N turn (-18,26)", [-18, 26], [-10, 4]],
  ["lap W turn (-28.5,14)", [-28.5, 14], [-10, 4]],
  ["lap SW start (-28.5,-26)", [-28.5, -26], [-10, -4]],
  ['team0 spawn A (24.5,-21)', [24.5, -21], [10, -4]],
  ['team1 spawn A (-24.5,21)', [-24.5, 21], [-10, 4]],
  ['team0 yard corner [-21,-20]', [-21, -20], [10, -4]],
  ['nw-strip probe (-28.5,26)', [-28.5, 26], [-10, 4]],
];
for (const [label, from, to] of cases) {
  const n = path(from, to);
  console.log(`${label}: ${n === null ? 'NO PATH' : `${n} waypoints`}`);
}
