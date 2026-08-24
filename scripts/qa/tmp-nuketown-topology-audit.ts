// TEMPORARY Pass 79 HF-383 audit — deleted after the run, not committed.
// Measures route cleanliness on the arena the game actually builds:
//   1. spawn safety (clearance at knee/chest/eye),
//   2. perimeter escape gaps (walkable hole in the fence line at body height),
//   3. lane connectivity (one component joins every spawn, patrol and target),
//   4. snag points: passable pinches narrower than 0.95 m clearance.
import * as THREE from 'three';
import { buildArena } from '../../src/map';
import { ARENA_BOUNDS, SPAWN_LAYOUT, PATROL_LAYOUT } from '../../src/arena-layout';
import { circleIntersectsBox, type Box2 } from '../../src/collision';

const PLAYER_RADIUS = 0.44;
const map = buildArena(new THREE.Scene());
const colliders = map.colliders as ReadonlyArray<Box2>;


// --- 1. spawn safety -------------------------------------------------------
const blockers = colliders.filter((b) => {
  const minY = b.minY ?? 0;
  const maxY = b.maxY ?? Number.POSITIVE_INFINITY;
  return maxY > 0.15 && minY < 1.75 && !b.rotation;
});
console.log(`colliders total=${colliders.length} ground-level blockers=${blockers.length}`);
let unsafe = 0;
for (const team of [0, 1] as const) {
  for (const [x, z] of SPAWN_LAYOUT[team]) {
    for (const r of [PLAYER_RADIUS, 0.6]) {
      if (blockers.some((b) => circleIntersectsBox(x, z, r, b))) { unsafe++; console.log(`UNSAFE spawn t${team} (${x},${z}) r=${r}`); }
    }
  }
}
console.log(`spawn-safety: ${unsafe === 0 ? 'PASS' : 'FAIL'} (${unsafe} violations)`);

// --- 2. perimeter escape gaps ----------------------------------------------
const step = 0.25;
const margin = 0.35; // walk ring just inside the fence
let gapCount = 0;
function fenceCovered(x: number, z: number): boolean {
  return blockers.some((b) =>
    x >= b.minX - PLAYER_RADIUS && x <= b.maxX + PLAYER_RADIUS
    && z >= b.minZ - PLAYER_RADIUS && z <= b.maxZ + PLAYER_RADIUS);
}
for (let x = ARENA_BOUNDS.minX + margin; x <= ARENA_BOUNDS.maxX - margin; x += step) {
  for (const z of [ARENA_BOUNDS.minZ + margin, ARENA_BOUNDS.maxZ - margin]) {
    if (!fenceCovered(x, z)) { gapCount++; if (gapCount < 12) console.log(`PERIMETER GAP at (${x.toFixed(2)}, ${z.toFixed(2)})`); }
  }
}
for (let z = ARENA_BOUNDS.minZ + margin; z <= ARENA_BOUNDS.maxZ - margin; z += step) {
  for (const x of [ARENA_BOUNDS.minX + margin, ARENA_BOUNDS.maxX - margin]) {
    if (!fenceCovered(x, z)) { gapCount++; if (gapCount < 12) console.log(`PERIMETER GAP at (${x.toFixed(2)}, ${z.toFixed(2)})`); }
  }
}
console.log(`perimeter-escape: ${gapCount === 0 ? 'PASS' : `${gapCount} gap samples`}`);

// --- 3+4. grid connectivity + snag points ---------------------------------
const cell = 0.2;
const nx = Math.ceil((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / cell);
const nz = Math.ceil((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / cell);
const blockedGrid = new Uint8Array(nx * nz);
const clearGrid = new Float32Array(nx * nz);
for (let ix = 0; ix < nx; ix++) {
  for (let iz = 0; iz < nz; iz++) {
    const x = ARENA_BOUNDS.minX + (ix + 0.5) * cell;
    const z = ARENA_BOUNDS.minZ + (iz + 0.5) * cell;
    let minDist = Infinity;
    for (const b of blockers) {
      const dx = Math.max(b.minX - x, 0, x - b.maxX);
      const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      const d = Math.hypot(dx, dz);
      if (d < minDist) minDist = d;
    }
    clearGrid[ix * nz + iz] = minDist;
    if (minDist <= PLAYER_RADIUS) blockedGrid[ix * nz + iz] = 1;
  }
}
const idx = (ix: number, iz: number) => ix * nz + iz;
const comp = new Int32Array(nx * nz).fill(-1);
let components = 0;
const queue: number[] = [];
for (let i = 0; i < nx * nz; i++) {
  if (blockedGrid[i] || comp[i] >= 0) continue;
  const id = components++;
  queue.length = 0; queue.push(i); comp[i] = id;
  while (queue.length) {
    const cur = queue.pop()!;
    const cx = Math.floor(cur / nz), cz = cur % nz;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ax = cx + dx, az = cz + dz;
      if (ax < 0 || az < 0 || ax >= nx || az >= nz) continue;
      const j = idx(ax, az);
      if (!blockedGrid[j] && comp[j] < 0) { comp[j] = id; queue.push(j); }
    }
  }
}
function componentOfPoint(x: number, z: number): number {
  const ix = Math.floor((x - ARENA_BOUNDS.minX) / cell);
  const iz = Math.floor((z - ARENA_BOUNDS.minZ) / cell);
  return comp[idx(ix, iz)];
}
const anchors: Array<[string, number, number]> = [
  ...SPAWN_LAYOUT[0].map(([x, z], i) => [`spawn0-${i}`, x, z] as [string, number, number]),
  ...SPAWN_LAYOUT[1].map(([x, z], i) => [`spawn1-${i}`, x, z] as [string, number, number]),

  ...PATROL_LAYOUT.map(([x, z], i) => [`patrol-${i}`, x, z] as [string, number, number]),
];
// Where is the non-main component? Localise its bounding box.
const compSizes = new Map<number, number>();
for (let i = 0; i < nx * nz; i++) {
  if (!blockedGrid[i] && comp[i] >= 0) compSizes.set(comp[i], (compSizes.get(comp[i]) ?? 0) + 1);
}
for (const [id, size] of [...compSizes].sort((a, b) => b[1] - a[1])) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const j = idx(ix, iz);
    if (!blockedGrid[j] && comp[j] === id) {
      const x = ARENA_BOUNDS.minX + (ix + 0.5) * cell, z = ARENA_BOUNDS.minZ + (iz + 0.5) * cell;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  console.log(`component ${id}: ${size} cells, bbox (${minX.toFixed(1)},${minZ.toFixed(1)})..(${maxX.toFixed(1)},${maxZ.toFixed(1)})`);
}
const anchorComps = anchors.map(([label, x, z]) => ({ label, c: componentOfPoint(x, z) }));
const mainComp = anchorComps.map((a) => a.c).sort((a, b) => a - b)[Math.floor(anchorComps.length / 2)];
const disconnected = anchorComps.filter((a) => a.c !== mainComp);
console.log(`grid components=${components}; anchors off main component=${disconnected.length}`);
if (disconnected.length) console.log(disconnected);

// Snag points: a passable cell squeezed between blockers on BOTH sides —
// i.e. clearance < 0.95 m with another blocker within 1.5 m in each of the
// two opposite perpendicular directions (X and Z checked separately). A cell
// hugging one wall is NOT a snag; threading between two obstacles is.
let pinchCells = 0;
const pinchSamples: string[] = [];
const blockedAt = (ix: number, iz: number): boolean =>
  ix < 0 || iz < 0 || ix >= nx || iz >= nz || blockedGrid[idx(ix, iz)] === 1 || clearGrid[idx(ix, iz)] < 0.6;
for (let ix = 1; ix < nx - 1; ix++) {
  for (let iz = 1; iz < nz - 1; iz++) {
    const i = idx(ix, iz);
    if (blockedGrid[i] || clearGrid[i] >= 0.95) continue;
    const span = Math.ceil(1.5 / cell);
    let xPinch = false, zPinch = false;
    for (let d = 1; d <= span && !(xPinch && zPinch); d++) {
      if (!xPinch && blockedAt(ix + d, iz) && blockedAt(ix - d, iz)) xPinch = true;
      if (!zPinch && blockedAt(ix, iz + d) && blockedAt(ix, iz - d)) zPinch = true;
    }
    if (!xPinch && !zPinch) continue;
    pinchCells++;
    if (pinchSamples.length < 20) {
      pinchSamples.push(`(${(ARENA_BOUNDS.minX + (ix + 0.5) * cell).toFixed(1)}, ${(ARENA_BOUNDS.minZ + (iz + 0.5) * cell).toFixed(1)}) clr=${clearGrid[i].toFixed(2)} ${xPinch ? 'x' : ''}${zPinch ? 'z' : ''}`);
    }
  }
}
console.log(`pinch cells (threading between two obstacles, clearance<0.95m): ${pinchCells}`);
for (const s of pinchSamples) console.log('  pinch ' + s);

// Comfortable-route check: same flood fill but requiring 0.75 m clearance
// (a 1.5 m corridor). If every spawn/patrol anchor stays connected here,
// no route anywhere forces a player through an awkward squeeze.
const comfy = new Uint8Array(nx * nz);
for (let i = 0; i < nx * nz; i++) comfy[i] = !blockedGrid[i] && clearGrid[i] >= 0.75 ? 1 : 0;
const comp2 = new Int32Array(nx * nz).fill(-1);
let comps2 = 0;
for (let i = 0; i < nx * nz; i++) {
  if (!comfy[i] || comp2[i] >= 0) continue;
  const id = comps2++;
  queue.length = 0; queue.push(i); comp2[i] = id;
  while (queue.length) {
    const cur = queue.pop()!;
    const cx = Math.floor(cur / nz), cz = cur % nz;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ax = cx + dx, az = cz + dz;
      if (ax < 0 || az < 0 || ax >= nx || az >= nz) continue;
      const j = idx(ax, az);
      if (comfy[j] && comp2[j] < 0) { comp2[j] = id; queue.push(j); }
    }
  }
}

const compBBoxes = new Map<number, { n: number; minX: number; maxX: number; minZ: number; maxZ: number }>();
for (let ix = 0; ix < nx; ix++) {
  for (let iz = 0; iz < nz; iz++) {
    const j = idx(ix, iz);
    if (!comfy[j]) continue;
    const id = comp2[j];
    const x = ARENA_BOUNDS.minX + (ix + 0.5) * cell;
    const z = ARENA_BOUNDS.minZ + (iz + 0.5) * cell;
    const entry = compBBoxes.get(id) ?? { n: 0, minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    entry.n++; entry.minX = Math.min(entry.minX, x); entry.maxX = Math.max(entry.maxX, x);
    entry.minZ = Math.min(entry.minZ, z); entry.maxZ = Math.max(entry.maxZ, z);
    compBBoxes.set(id, entry);
  }
}
for (const [id, b] of [...compBBoxes].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`comfy ${id}: ${b.n} cells (${b.minX.toFixed(1)},${b.minZ.toFixed(1)})..(${b.maxX.toFixed(1)},${b.maxZ.toFixed(1)})`);
}

// Choke cells: low-clearance free cells whose neighbours bridge two different
// comfortable components. These are the exact squeezes separating regions.
const chokes: string[] = [];
for (let ix = 1; ix < nx - 1; ix++) {
  for (let iz = 1; iz < nz - 1; iz++) {
    const j = idx(ix, iz);
    if (blockedGrid[j] || clearGrid[j] >= 0.75) continue;
    const neighbourComps = new Set<number>();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = idx(ix + dx, iz + dz);
      if (!blockedGrid[k]) {
        const c = comp2[k];
        if (c >= 0) neighbourComps.add(c);
      }
    }
    if (neighbourComps.size < 2) continue;
    const x = ARENA_BOUNDS.minX + (ix + 0.5) * cell;
    const z = ARENA_BOUNDS.minZ + (iz + 0.5) * cell;
    chokes.push(`(${x.toFixed(1)},${z.toFixed(1)}) w=${(clearGrid[j] * 2).toFixed(2)} comps=[${[...neighbourComps].join(',')}]`);
  }
}
console.log(`choke cells bridging comfortable components: ${chokes.length}`);
for (const c of chokes.slice(0, 60)) console.log('  choke ' + c);
const comfyAnchorComps = new Set(anchors.map(([, x, z]) => {
  const ix = Math.floor((x - ARENA_BOUNDS.minX) / cell);
  const iz = Math.floor((z - ARENA_BOUNDS.minZ) / cell);
  return comp2[idx(ix, iz)];
}));
console.log(`comfortable corridors (>=1.5m wide): components=${comps2}, distinct anchor components=${comfyAnchorComps.size}`);
if (comfyAnchorComps.size > 1) {
  for (const [label, x, z] of anchors) {
    const ix = Math.floor((x - ARENA_BOUNDS.minX) / cell);
    const iz = Math.floor((z - ARENA_BOUNDS.minZ) / cell);
    console.log(`  ${label} (${x},${z}) -> comfy comp ${comp2[idx(ix, iz)]}`);
  }
}

// For every anchor outside the comfortable main component, find the widest
// path (maximise the minimum clearance along the route) to any main-comp cell.
// Reports the exact bottleneck cell a player must thread.
const mainId = 0;
const widest = new Float32Array(nx * nz); // best bottleneck-clearance to reach this cell
function widestPathFrom(startIx: number, startIz: number): void {
  widest.fill(-1);
  const pq: Array<[number, number, number]> = []; // [negClearance, ix, iz]
  const s = idx(startIx, startIz);
  if (blockedGrid[s]) return;
  widest[s] = clearGrid[s];
  pq.push([-clearGrid[s], startIx, startIz]);
  while (pq.length) {
    pq.sort((a, b) => a[0] - b[0]);
    const [, cx, cz] = pq.shift()!;
    const ci = idx(cx, cz);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ax = cx + dx, az = cz + dz;
      if (ax < 0 || az < 0 || ax >= nx || az >= nz) continue;
      const j = idx(ax, az);
      if (blockedGrid[j]) continue;
      const bottle = Math.min(widest[ci], clearGrid[j]);
      if (bottle > widest[j] + 1e-9) { widest[j] = bottle; pq.push([-bottle, ax, az]); }
    }
  }
}
for (const [label, x, z] of anchors) {
  const ix = Math.floor((x - ARENA_BOUNDS.minX) / cell);
  const iz = Math.floor((z - ARENA_BOUNDS.minZ) / cell);
  if (comfy[idx(ix, iz)] && comp2[idx(ix, iz)] === mainId) continue;
  widestPathFrom(ix, iz);
  let bestJ = -1;
  for (let i = 0; i < nx * nz; i++) {
    if (comp2[i] === mainId && widest[i] >= 0 && (bestJ < 0 || widest[i] > widest[bestJ])) bestJ = i;
  }
  if (bestJ < 0) { console.log(`BOTTLENECK ${label}: no comfortable route to main space exists`); continue; }
  const bx = ARENA_BOUNDS.minX + (Math.floor(bestJ / nz) + 0.5) * cell;
  const bz = ARENA_BOUNDS.minZ + ((bestJ % nz) + 0.5) * cell;
  console.log(`BOTTLENECK ${label} (${x},${z}): widest corridor ${ (widest[bestJ] * 2).toFixed(2) }m wide near (${bx.toFixed(1)}, ${bz.toFixed(1)})`);
}

// Dump every ground-level blocker intersecting the two front-hedge lines.
for (const band of [{ lo: 7.5, hi: 10.5 }, { lo: -10.5, hi: -7.5 }] as const) {
  console.log(`--- blockers crossing z ${band.lo}..${band.hi} ---`);
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    const minY = b.minY ?? 0;
    const maxY = b.maxY ?? Number.POSITIVE_INFINITY;
    if (maxY <= 0.15 || minY >= 1.75 || b.rotation) continue;
    if (b.maxZ < band.lo || b.minZ > band.hi) continue;
    console.log(`  [${i}] x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)}  z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)}  y ${minY}..${maxY}`);
  }
}

// Blockers within 3 m of each patrol point.
for (const [pi, [px, pz]] of PATROL_LAYOUT.entries()) {
  console.log(`--- patrol-${pi} (${px},${pz}) neighbours ---`);
  for (const b of blockers) {
    const dx = Math.max(b.minX - px, 0, px - b.maxX);
    const dz = Math.max(b.minZ - pz, 0, pz - b.maxZ);
    if (Math.hypot(dx, dz) < 3) {
      console.log(`  x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)}  z ${b.minZ.toFixed(2)}..${b.maxZ.toFixed(2)}  d=${Math.hypot(dx, dz).toFixed(2)}`);
    }
  }
}
