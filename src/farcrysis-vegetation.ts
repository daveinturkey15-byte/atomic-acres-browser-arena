/**
 * farcrysis-vegetation.ts — Pass 69 dense THREE.js tropical jungle vegetation module.
 *
 * Exports:
 *   buildVegetation(scene: THREE.Group): void
 *   FARCRYSIS_VEGE_STATS(): { totalInstances: number; treeTypes: number; totalTriangles: number; textureCount: number }
 *
 * Target: 500+ vegetation instances via InstancedMesh, 8+ distinct tree/palm types,
 * ground cover (grass + leaf litter), multi-layer undergrowth, hanging vines —
 * all via InstancedMesh / merged-geometry for 60fps. Deterministic seeded placement.
 * All procedural — no copied IP. Presentation only — never adds colliders.
 * Mount from farcrysis.ts buildFarcrysis to add dense jungle dressing over the arena.
 */
import * as THREE from 'three';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOUNDS = FARCRYSIS_BOUNDS;
const MARGIN = 1.8;

/** Golden ratio conjugate — produces even angular distribution. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// ---------------------------------------------------------------------------
// Module-level stats tracker (populated during buildVegetation, read by stats fn)
// ---------------------------------------------------------------------------

interface VegeStatAccumulator {
  totalInstances: number;
  treeTypeNames: Set<string>; // only distinct tree/palm types (not ground cover)
  totalTriangles: number;
  textureCount: number;
}

let _s: VegeStatAccumulator = { totalInstances: 0, treeTypeNames: new Set(), totalTriangles: 0, textureCount: 0 };

function resetStats(): void {
  _s = { totalInstances: 0, treeTypeNames: new Set(), totalTriangles: 0, textureCount: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count rendered triangles for a BufferGeometry (instanced or single-use). */
function triCount(geometry: THREE.BufferGeometry): number {
  const idx = geometry.index;
  if (idx) return idx.count / 3;
  const pos = geometry.getAttribute('position');
  return pos ? pos.count / 3 : 0;
}

/** Shorthand for PBR material matching the art-lane palette style. */
function vegeMat(color: number, roughness = 0.88, metalness = 0.04): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** Register an InstancedMesh in stats and apply art-layer conventions.
 *  Pass `treeType` only for distinct tree/palm types (not ground cover).
 *  Use opts to override shadow behaviour for small dressing layers. */
function register(
  mesh: THREE.InstancedMesh,
  treeType?: string,
  opts?: { castShadow?: boolean; receiveShadow?: boolean },
): THREE.InstancedMesh {
  _s.totalInstances += mesh.count;
  if (treeType) _s.treeTypeNames.add(treeType);
  _s.totalTriangles += triCount(mesh.geometry) * mesh.count;
  mesh.castShadow = opts?.castShadow ?? true;
  mesh.receiveShadow = opts?.receiveShadow ?? true;
  mesh.userData.farcrysisArt = true;
  return mesh;
}

/**
 * Generate positions evenly distributed within a disc (Fibonacci lattice).
 * Used for trees that prefer the inland jungle core.
 */
function discPositions(count: number, maxRadius: number): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const radius = maxRadius * Math.sqrt((i + 0.5) / count);
    const theta = i * GOLDEN_ANGLE;
    let x = Math.cos(theta) * radius;
    let z = Math.sin(theta) * radius * 0.88;
    x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
    z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
    result.push([x, z, theta]);
  }
  return result;
}

/**
 * Generate positions in an annular ring (Fibonacci-based).
 * Used for trees preferring the beach fringe or mid-ring transitions.
 */
function ringPositions(
  count: number,
  innerRadius: number,
  outerRadius: number,
): Array<[number, number, number]> {
  const result: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    const theta = i * GOLDEN_ANGLE + (i % 5) * 0.22;
    let x = Math.cos(theta) * radius;
    let z = Math.sin(theta) * radius * 0.88;
    x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
    z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));
    result.push([x, z, theta]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pass 69 extended helpers — deterministic seeded RNG, terrain height, clearance
// ---------------------------------------------------------------------------

/** Mulberry32 seeded PRNG — deterministic, reproducible placement. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smoothstep helper. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Terrain height at (x,z) — exact replica of farcrysis-terrain.ts's terrainHeight.
 * Guarantees vegetation sits on the actual procedural terrain surface.
 *
 * Zones:
 *   - Sand beach (edgeDist < 10): y ≈ 0
 *   - Cliff ring  (edgeDist 10–20): y 2–5m
 *   - Plateau     (edgeDist ≥ 20): y 3.5–8m
 *   - Path corridors (|x|≈20, |z|≈20): flat y=0
 */
function terrainHeightAt(x: number, z: number): number {
  const cx = Math.max(-32, Math.min(32, x));
  const cz = Math.max(-32, Math.min(32, z));
  const dist = Math.sqrt(cx * cx + cz * cz);

  // Gameplay path corridors — flat
  const pathHalf = 4.5;
  const onPath = (
    Math.abs(cx - 20) < pathHalf || Math.abs(cx + 20) < pathHalf ||
    Math.abs(cz - 20) < pathHalf || Math.abs(cz + 20) < pathHalf
  );
  if (onPath && dist > 4) return 0;

  const edgeDist = 32 - Math.max(Math.abs(cx), Math.abs(cz));
  const sandW = 10;

  // Sand beach (outer ring, flat)
  if (edgeDist < sandW && !onPath) {
    const t = edgeDist / sandW;
    const dune = Math.sin(cx * 0.7 + cz * 0.5) * Math.cos(cx * 0.4 - cz * 0.6) * 0.25;
    const duneH = smoothstep(0.6, 1.0, t) * dune;
    return Math.max(0, duneH);
  }

  // Cliff ring (rising 2–5m)
  if (edgeDist >= sandW && edgeDist < sandW + 10) {
    const ct = (edgeDist - sandW) / 10;
    const base = 2 + ct * 3;
    const jagged = Math.sin(cx * 1.3 + cz * 0.7) * 0.8
      + Math.cos(cx * 0.9 - cz * 1.1) * 0.6
      + Math.sin(cx * 2.1) * 0.4
      + Math.cos(cz * 1.8) * 0.5;
    return Math.max(0.2, base + jagged * ct);
  }

  // Jungle plateau (interior 3.5–8m)
  const plateauBase = 3.5
    + Math.sin(cx * 0.35 + cz * 0.28) * 1.8
    + Math.cos(cx * 0.55 - cz * 0.42) * 1.4
    + Math.sin(cx * 1.1) * Math.cos(cz * 0.9) * 0.9
    + Math.sin(cx * 0.18 + cz * 0.33) * 0.6;

  // Core dip near the research station
  const coreDist = Math.sqrt(cx * cx + cz * cz);
  const dip = coreDist < 8 ? smoothstep(0, 8, coreDist) * 1.5 : 0;

  return Math.max(0.2, plateauBase - dip);
}

// Spawn positions and patrol points (from farcrysis.ts) for clearance checks
const SPAWNS_ALL: Array<[number, number]> = [
  [-26, -26], [-22, -24], [-24, -20], [-18, -26], // team 0 NW
  [26, 26], [22, 24], [24, 20], [18, 26], // team 1 SE
];
const SPAWN_CLEAR = 5.5; // metres clearance around each spawn point

const PATROL_PTS: Array<[number, number]> = [
  [-26, -26], [-18, -20], [-12, -16], [-4, -12], [0, 0], [12, 16], [18, 20], [26, 26],
  [-20, 18], [20, -18], [-8, -24], [8, 24],
];
const PATROL_CLEAR = 3.0;

const PATH_CLEAR_WIDTH = 6.5; // wider than the terrain path to keep foliage visually off the corridors
const CORE_CLEAR = 7.0; // keep central research-station area clear

/**
 * Returns true if (x,z) is clear of gameplay lanes — safe to place vegetation.
 * Uses a larger margin for tall vegetation; small ground dressing can use
 * a smaller margin pass.
 */
function clearOfGameplay(x: number, z: number, margin: number): boolean {
  // Orthogonal path corridors (x≈±20, z≈±20)
  if (Math.abs(Math.abs(x) - 20) < PATH_CLEAR_WIDTH + margin) return false;
  if (Math.abs(Math.abs(z) - 20) < PATH_CLEAR_WIDTH + margin) return false;

  // Core research-station zone
  if (Math.sqrt(x * x + z * z) < CORE_CLEAR + margin) return false;

  // Spawn clear zones
  for (const [sx, sz] of SPAWNS_ALL) {
    if (Math.hypot(x - sx, z - sz) < SPAWN_CLEAR + margin) return false;
  }

  // Patrol point clear zones
  for (const [px, pz] of PATROL_PTS) {
    if (Math.hypot(x - px, z - pz) < PATROL_CLEAR + margin) return false;
  }

  return true;
}

/**
 * Generate a list of (x, z, groundY, angle) positions within an annular zone,
 * filtered for gameplay clearance. Uses Fibonacci-like spiralled scatter with
 * a seeded RNG for deterministic reproducibility.
 */
function layerPositions(
  count: number,
  minRadius: number,
  maxRadius: number,
  clearanceMargin: number,
  seed: number,
): Array<[number, number, number, number]> {
  const rng = mulberry32(seed);
  const result: Array<[number, number, number, number]> = [];
  let attempts = 0;
  const maxAttempts = count * 30;

  while (result.length < count && attempts < maxAttempts) {
    const radius = minRadius + rng() * (maxRadius - minRadius);
    const angle = rng() * Math.PI * 2;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
    z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));

    if (clearOfGameplay(x, z, clearanceMargin)) {
      const groundY = terrainHeightAt(x, z);
      result.push([x, z, groundY, angle]);
    }

    attempts += 1;
  }

  return result;
}

/**
 * Merge an array of transformed geometries into one BufferGeometry for instancing.
 * Adds normal/uv attributes from the first source geom when merged output lacks them.
 */
function mergeTransformed(geomParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }>): THREE.BufferGeometry {
  const transformed: THREE.BufferGeometry[] = [];
  for (const { geom, matrix } of geomParts) {
    const clone = geom.clone();
    clone.applyMatrix4(matrix);
    // Convert to non-indexed so every part has compatible attributes for mergeGeometries.
    // Some three.js primitives are indexed, others are not — force uniform non-indexed.
    const nonIndexed = clone.index !== null ? clone.toNonIndexed() : clone;
    transformed.push(nonIndexed);
  }
  const merged = mergeGeometries(transformed, false);

  // mergeGeometries may drop normals/uvs on some three.js versions — re-compute if needed
  if (!merged.getAttribute('normal')) {
    merged.computeVertexNormals();
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 1. Palm trees — tall tropical palms (beach / outer ring)
// ---------------------------------------------------------------------------

function addPalms(root: THREE.Group): void {
  const count = 22;
  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.34, 2.8, 8);
  const frondGeom = new THREE.BoxGeometry(3.2, 0.16, 3.2);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(FARCRYSIS_ART_FEEL.palmTrunk, 0.88, 0.03), count);
  trunks.name = 'farcrysis-vege-palm-trunks';
  const fronds = new THREE.InstancedMesh(frondGeom, vegeMat(FARCRYSIS_ART_FEEL.palmFrond, 0.85, 0.02), count);
  fronds.name = 'farcrysis-vege-palm-fronds';

  const tMat = new THREE.Matrix4();
  const fMat = new THREE.Matrix4();
  const positions = ringPositions(count, 19, 30);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const baseY = 1.4;
    const frondY = baseY + 2.7;
    const lean = (i % 3 === 0 ? 0.07 : -0.06) * (Math.sin(angle) * 0.25);

    tMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, angle + 0.3, 0)),
      new THREE.Vector3(0.85 + (i % 3) * 0.12, 1.0, 0.85 + (i % 3) * 0.12),
    );
    trunks.setMatrixAt(i, tMat);

    fMat.compose(
      new THREE.Vector3(x, frondY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 1.3 + i * 0.15, 0)),
      new THREE.Vector3(0.85 + (i % 4) * 0.1, 1.0, 0.85 + ((i + 1) % 4) * 0.1),
    );
    fronds.setMatrixAt(i, fMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'palm'));
  root.add(register(fronds, 'palm'));
}

// ---------------------------------------------------------------------------
// 2. Broadleaf jungle trees — thick trunk + wide canopy (inland)
// ---------------------------------------------------------------------------

function addBroadleafTrees(root: THREE.Group): void {
  const count = 28;
  const trunkGeom = new THREE.CylinderGeometry(0.22, 0.44, 2.6, 10);
  const canopyGeom = new THREE.SphereGeometry(1.0, 10, 6);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x6b4e30, 0.92, 0.02), count);
  trunks.name = 'farcrysis-vege-broadleaf-trunks';
  const canopies = new THREE.InstancedMesh(canopyGeom, vegeMat(0x3a6e32, 0.88, 0.01), count);
  canopies.name = 'farcrysis-vege-broadleaf-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = discPositions(count, 20);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const baseY = 1.3;
    const canopyY = baseY + 2.4;
    const twist = angle + (i % 7) * 0.35;

    tMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, twist, 0)),
      new THREE.Vector3(0.8 + (i % 5) * 0.12, 0.9 + (i % 4) * 0.08, 0.8 + (i % 5) * 0.12),
    );
    trunks.setMatrixAt(i, tMat);

    // Canopy: squashed sphere (wider than tall), slight random rotation
    const cScale = 1.2 + (i % 5) * 0.14;
    cMat.compose(
      new THREE.Vector3(x, canopyY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.22, twist * 0.7, 0)),
      new THREE.Vector3(cScale, 0.55 + (i % 3) * 0.15, cScale * 0.92),
    );
    canopies.setMatrixAt(i, cMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'broadleaf'));
  root.add(register(canopies, 'broadleaf'));
}

// ---------------------------------------------------------------------------
// 3. Conifer / cypress — tall columnar evergreen (mid ring)
// ---------------------------------------------------------------------------

function addConifers(root: THREE.Group): void {
  const count = 20;
  const coneGeom = new THREE.ConeGeometry(0.42, 3.6, 10, 1);

  const cones = new THREE.InstancedMesh(coneGeom, vegeMat(0x2a5528, 0.9, 0.02), count);
  cones.name = 'farcrysis-vege-conifers';

  const matrix = new THREE.Matrix4();
  const positions = discPositions(count, 16);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const s = 0.75 + (i % 5) * 0.14;
    matrix.compose(
      new THREE.Vector3(x, 1.8, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(s, 0.85 + (i % 4) * 0.1, s),
    );
    cones.setMatrixAt(i, matrix);
  }

  cones.instanceMatrix.needsUpdate = true;
  root.add(register(cones, 'conifer'));
}

// ---------------------------------------------------------------------------
// 4. Banana plants — short trunk + broad flat leaves (inland clusters)
// ---------------------------------------------------------------------------

function addBananaPlants(root: THREE.Group): void {
  const plantCount = 14;
  const leavesPerPlant = 4;
  const leafCount = plantCount * leavesPerPlant;

  const trunkGeom = new THREE.CylinderGeometry(0.1, 0.2, 1.6, 7);
  const leafGeom = new THREE.BoxGeometry(2.2, 0.07, 0.65);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x7a9a38, 0.85, 0.02), plantCount);
  trunks.name = 'farcrysis-vege-banana-trunks';
  const leaves = new THREE.InstancedMesh(leafGeom, vegeMat(0x4d8c2a, 0.82, 0.02), leafCount);
  leaves.name = 'farcrysis-vege-banana-leaves';

  const tMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = discPositions(plantCount, 14);

  for (let p = 0; p < plantCount; p += 1) {
    const [x, z, baseAngle] = positions[p];
    const baseY = 0.8;
    const leafY = baseY + 1.55;

    tMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, baseAngle, 0)),
      new THREE.Vector3(0.85 + (p % 3) * 0.12, 1.0, 0.85 + (p % 3) * 0.12),
    );
    trunks.setMatrixAt(p, tMat);

    for (let l = 0; l < leavesPerPlant; l += 1) {
      const leafAngle = baseAngle + (l / leavesPerPlant) * Math.PI * 2 + (p % 3) * 0.25;
      const tilt = 0.2 + (l % 3) * 0.15; // slight upward/downward tilt
      const leafIdx = p * leavesPerPlant + l;
      lMat.compose(
        new THREE.Vector3(x, leafY + tilt * 0.3, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, leafAngle, 0)),
        new THREE.Vector3(0.8 + (p % 4) * 0.12, 1.0, 0.85 + (l % 3) * 0.1),
      );
      leaves.setMatrixAt(leafIdx, lMat);
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'banana'));
  root.add(register(leaves, 'banana'));
}

// ---------------------------------------------------------------------------
// 5. Bamboo clusters — thin tall cylinders in small groups (dense inland)
// ---------------------------------------------------------------------------

function addBamboo(root: THREE.Group): void {
  const clusters = 7;
  const stemsPerCluster = 5;
  const count = clusters * stemsPerCluster;

  const stemGeom = new THREE.CylinderGeometry(0.05, 0.07, 2.8, 6);

  const stems = new THREE.InstancedMesh(stemGeom, vegeMat(0x6a8a3a, 0.84, 0.03), count);
  stems.name = 'farcrysis-vege-bamboo-stems';

  const matrix = new THREE.Matrix4();
  const clusterCenters = discPositions(clusters, 13);

  for (let c = 0; c < clusters; c += 1) {
    const [cx, cz, ca] = clusterCenters[c];
    for (let s = 0; s < stemsPerCluster; s += 1) {
      const offsetAngle = (s / stemsPerCluster) * Math.PI * 2 + ca;
      const offsetRadius = 0.25 + (s % 3) * 0.18;
      const sx = cx + Math.cos(offsetAngle) * offsetRadius;
      const sz = cz + Math.sin(offsetAngle) * offsetRadius;
      const heightScale = 0.85 + (s % 4) * 0.1;
      const idx = c * stemsPerCluster + s;

      matrix.compose(
        new THREE.Vector3(sx, 1.4 * heightScale, sz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, offsetAngle + s * 0.3, 0)),
        new THREE.Vector3(0.8 + (s % 3) * 0.12, heightScale, 0.8 + (s % 3) * 0.12),
      );
      stems.setMatrixAt(idx, matrix);
    }
  }

  stems.instanceMatrix.needsUpdate = true;
  root.add(register(stems, 'bamboo'));
}

// ---------------------------------------------------------------------------
// 6. Dead / rotted trees — leaning, leafless (scattered, thin toward beach)
// ---------------------------------------------------------------------------

function addDeadTrees(root: THREE.Group): void {
  const count = 10;
  const trunkGeom = new THREE.CylinderGeometry(0.14, 0.24, 2.4, 7);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x6e6258, 0.94, 0.05), count);
  trunks.name = 'farcrysis-vege-dead-trunks';

  const matrix = new THREE.Matrix4();
  const positions = ringPositions(count, 6, 24);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    // Lean the dead tree significantly
    const leanAngle = 0.3 + (i % 4) * 0.15;
    const leanDir = angle + (i % 3) * 0.6;
    const s = 0.7 + (i % 3) * 0.2;

    matrix.compose(
      new THREE.Vector3(x, 1.2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(leanAngle, leanDir, (i % 2) * 0.2)),
      new THREE.Vector3(s, 0.85 + (i % 3) * 0.12, s),
    );
    trunks.setMatrixAt(i, matrix);
  }

  trunks.instanceMatrix.needsUpdate = true;
  root.add(register(trunks, 'dead-tree'));
}

// ---------------------------------------------------------------------------
// 7. Ferns — thin vertical frond clusters (undergrowth, mid ring)
// ---------------------------------------------------------------------------

function addFerns(root: THREE.Group): void {
  const count = 35;
  const fernGeom = new THREE.BoxGeometry(0.35, 1.2, 0.12);

  const ferns = new THREE.InstancedMesh(fernGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  ferns.name = 'farcrysis-vege-ferns';

  const matrix = new THREE.Matrix4();
  const positions = discPositions(count, 22);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const s = 0.75 + (i % 5) * 0.16;
    matrix.compose(
      new THREE.Vector3(x, 0.6, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 2.1 + i * 0.4, 0)),
      new THREE.Vector3(s, 0.7 + (i % 4) * 0.18, 1.0),
    );
    ferns.setMatrixAt(i, matrix);
  }

  ferns.instanceMatrix.needsUpdate = true;
  root.add(register(ferns));
}

// ---------------------------------------------------------------------------
// 8. Grass tufts — tiny cones scattered everywhere (ground cover)
// ---------------------------------------------------------------------------

function addGrassTufts(root: THREE.Group): void {
  const count = 45;
  const grassGeom = new THREE.ConeGeometry(0.12, 0.45, 5, 1);

  const grass = new THREE.InstancedMesh(grassGeom, vegeMat(0x4d7a36, 0.9, 0.01), count);
  grass.name = 'farcrysis-vege-grass-tufts';

  const matrix = new THREE.Matrix4();
  // Grass everywhere — use full disc + some outer scatter
  const inner = discPositions(Math.floor(count * 0.7), 18);
  const outer = ringPositions(count - inner.length, 18, 30);
  const positions = [...inner, ...outer];

  for (let i = 0; i < count; i += 1) {
    const [x, z] = positions[i];
    const s = 0.6 + (i % 6) * 0.1;
    matrix.compose(
      new THREE.Vector3(x, 0.22, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i * 1.7, 0)),
      new THREE.Vector3(s, 0.7 + (i % 4) * 0.18, s),
    );
    grass.setMatrixAt(i, matrix);
  }

  grass.instanceMatrix.needsUpdate = true;
  root.add(register(grass));
}

// ---------------------------------------------------------------------------
// 9. Bushes — low rounded shrubs (mid ring, inland cover dressing)
// ---------------------------------------------------------------------------

function addBushes(root: THREE.Group): void {
  const count = 28;
  const bushGeom = new THREE.IcosahedronGeometry(0.7, 1);

  const bushes = new THREE.InstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.9, 0.01), count);
  bushes.name = 'farcrysis-vege-bushes';

  const matrix = new THREE.Matrix4();
  const positions = discPositions(count, 20);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const s = 0.7 + (i % 5) * 0.14;
    matrix.compose(
      new THREE.Vector3(x, 0.45, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.1, angle, i * 0.15)),
      new THREE.Vector3(s, 0.55 + (i % 3) * 0.18, s * 0.9),
    );
    bushes.setMatrixAt(i, matrix);
  }

  bushes.instanceMatrix.needsUpdate = true;
  root.add(register(bushes));
}

// ---------------------------------------------------------------------------
// 10. Vines — diagonal thin cylinders near tree trunks (jungle atmosphere)
// ---------------------------------------------------------------------------

function addVines(root: THREE.Group): void {
  const count = 18;
  // Thin, long cylinder placed at an angle — reads as a hanging vine
  const vineGeom = new THREE.CylinderGeometry(0.03, 0.04, 2.4, 6);

  const vines = new THREE.InstancedMesh(vineGeom, vegeMat(0x3d6e30, 0.82, 0.02), count);
  vines.name = 'farcrysis-vege-vines';

  const matrix = new THREE.Matrix4();
  // Place vines near tree positions — use mid-ring scatter
  const positions = ringPositions(count, 4, 22);

  for (let i = 0; i < count; i += 1) {
    const [x, z, angle] = positions[i];
    const lean = 0.5 + (i % 3) * 0.2; // diagonal lean
    const twist = angle + (i % 5) * 0.4;
    const s = 0.6 + (i % 4) * 0.15;
    matrix.compose(
      new THREE.Vector3(x, 1.0 + (i % 3) * 0.6, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, twist, lean * 0.3)),
      new THREE.Vector3(s, 0.9 + (i % 3) * 0.1, s),
    );
    vines.setMatrixAt(i, matrix);
  }

  vines.instanceMatrix.needsUpdate = true;
  root.add(register(vines));
}

// ===========================================================================
// PASS 69 EXTENDED VEGETATION LAYERS
// ===========================================================================

// ---------------------------------------------------------------------------
// 11. Kapok (Ceiba-style) tall emergent trees — thick trunk, billowy canopy
//     Placed on the jungle plateau interior, avoiding paths / spawns.
//     Trunk: tall cylinder + 4 buttress fins (merged).
//     Canopy: 2 stacked squashed spheres (merged).
// ---------------------------------------------------------------------------

function addKapokTrees(root: THREE.Group): void {
  const count = 16;
  const SEED = 0x6b52_4311;

  // --- Build merged kapok trunk (cylinder + 4 buttress fins) ---
  const trunkHeight = 3.6;
  const trunkGeomSrc = new THREE.CylinderGeometry(0.22, 0.32, trunkHeight, 10);
  const finGeomSrc = new THREE.BoxGeometry(0.14, trunkHeight * 0.65, 0.9);

  const trunkParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  // Main trunk cylinder (centered vertically)
  trunkParts.push({
    geom: trunkGeomSrc,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0, trunkHeight / 2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    ),
  });
  // 4 buttress fins radiating from base
  for (let f = 0; f < 4; f++) {
    const angle = (f / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(angle) * 0.55 + (f % 2 ? 0.08 : -0.08), trunkHeight * 0.28, Math.sin(angle) * 0.55),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + Math.PI / 2, 0.05)),
      new THREE.Vector3(1, 0.9 + (f % 3) * 0.08, 1),
    );
    trunkParts.push({ geom: finGeomSrc, matrix: m });
  }
  const kapokTrunkGeom = mergeTransformed(trunkParts);

  // --- Build merged kapok canopy (2 stacked squashed spheres) ---
  const sphereSrc = new THREE.SphereGeometry(1.15, 12, 7);
  const canopyParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  canopyParts.push({
    geom: sphereSrc,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0.1, 0, 0.05),
      new THREE.Quaternion(),
      new THREE.Vector3(1.1, 0.55, 1.0),
    ),
  });
  canopyParts.push({
    geom: sphereSrc,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(-0.15, 0.55, -0.08),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.3, 0)),
      new THREE.Vector3(0.95, 0.48, 0.9),
    ),
  });
  const kapokCanopyGeom = mergeTransformed(canopyParts);

  const trunks = new THREE.InstancedMesh(kapokTrunkGeom, vegeMat(0x7a5e3e, 0.9, 0.03), count);
  trunks.name = 'farcrysis-vege-kapok-trunks';
  const canopies = new THREE.InstancedMesh(kapokCanopyGeom, vegeMat(0x3a7234, 0.86, 0.01), count);
  canopies.name = 'farcrysis-vege-kapok-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = layerPositions(count, 7, 18, 3.5, SEED);
  const rng = mulberry32(SEED);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const trunkBaseY = groundY;
    const trunkCenterY = trunkBaseY + trunkHeight / 2;
    const canopyY = trunkBaseY + trunkHeight + 0.3;

    const trunkScale = 0.85 + rng() * 0.3;
    tMat.compose(
      new THREE.Vector3(x, trunkCenterY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.06, angle + rng() * 0.4, 0)),
      new THREE.Vector3(trunkScale, 0.85 + rng() * 0.2, trunkScale),
    );
    trunks.setMatrixAt(i, tMat);

    const canopyScale = 0.9 + rng() * 0.35;
    cMat.compose(
      new THREE.Vector3(x, canopyY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.3, angle + rng() * 1.2, 0)),
      new THREE.Vector3(canopyScale, 0.6 + rng() * 0.25, canopyScale * 0.9),
    );
    canopies.setMatrixAt(i, cMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'kapok', { castShadow: true, receiveShadow: true }));
  root.add(register(canopies, 'kapok', { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 12. Coconut palms — curved trunk + radiating fronds (merged per palm)
//     Placed in the sand/cliff transition ring (beach-to-jungle edge).
// ---------------------------------------------------------------------------

function addCoconutPalms(root: THREE.Group): void {
  const count = 14;
  const SEED = 0xc0c0_1e55;

  // --- Build merged coconut palm geometry (curved trunk + 6 fronds) ---
  const segH = 1.05;
  const segGeom = new THREE.CylinderGeometry(0.13, 0.17, segH, 8);
  const frondGeomSrc = new THREE.BoxGeometry(2.4, 0.09, 0.4);

  const palmParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];

  // 3 trunk segments with progressive tilt for a natural curve
  palmParts.push({
    geom: segGeom,
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, segH * 0.5, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)),
  });
  palmParts.push({
    geom: segGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0.08, segH * 1.5, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, 0.05, 0)),
      new THREE.Vector3(0.92, 1, 0.92),
    ),
  });
  palmParts.push({
    geom: segGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0.14, segH * 2.5, -0.05),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.25, 0)),
      new THREE.Vector3(0.8, 1, 0.8),
    ),
  });

  // 6 fronds radiating from crown
  for (let f = 0; f < 6; f++) {
    const frondAngle = (f / 6) * Math.PI * 2;
    const tilt = -0.4 + (f % 3) * 0.12;
    palmParts.push({
      geom: frondGeomSrc,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(frondAngle) * 0.25, segH * 2.9, Math.sin(frondAngle) * 0.25),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, frondAngle, 0.15)),
        new THREE.Vector3(0.85 + (f % 3) * 0.12, 1, 0.6 + (f % 3) * 0.25),
      ),
    });
  }

  const coconutPalmGeom = mergeTransformed(palmParts);

  const palms = new THREE.InstancedMesh(
    coconutPalmGeom,
    vegeMat(FARCRYSIS_ART_FEEL.palmFrond, 0.84, 0.02),
    count,
  );
  palms.name = 'farcrysis-vege-coconut-palms';

  // Override material per-instance? Can't directly — single material for entire InstancedMesh.
  // Use a warm green-brown that reads as coconut palm (trunk + fronds share it).
  // We'll set the material color to a neutral warm bark tone and let the fronds read
  // as a silhouette. Actually, let me use separate trunk and frond InstancedMeshes —
  // that's cleaner and follows the existing pattern. Split into trunk-only merge
  // and frond-only merge for two InstancedMeshes.

  // Let's rebuild: coconut trunk merged (3 segments) + coconut fronds merged (6 fronds)
  const trunkOnly = [palmParts[0], palmParts[1], palmParts[2]];
  const frondOnly = palmParts.slice(3);

  const coconutTrunkGeom = mergeTransformed(trunkOnly);
  const coconutFrondGeom = mergeTransformed(frondOnly);

  const cTrunks = new THREE.InstancedMesh(coconutTrunkGeom, vegeMat(FARCRYSIS_ART_FEEL.palmTrunk, 0.87, 0.03), count);
  cTrunks.name = 'farcrysis-vege-coconut-trunks';
  const cFronds = new THREE.InstancedMesh(coconutFrondGeom, vegeMat(FARCRYSIS_ART_FEEL.palmFrond, 0.83, 0.02), count);
  cFronds.name = 'farcrysis-vege-coconut-fronds';

  const tMat = new THREE.Matrix4();
  const fMat = new THREE.Matrix4();
  const positions = layerPositions(count, 14, 26, 3.5, SEED);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const trunkBaseY = groundY;
    const trunkCenterY = trunkBaseY + segH * 1.6;
    const frondY = trunkBaseY + segH * 3.0;

    const s = 0.8 + rng() * 0.35;
    tMat.compose(
      new THREE.Vector3(x, trunkCenterY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.1, angle + rng() * 0.5, 0)),
      new THREE.Vector3(s, 0.85 + rng() * 0.2, s),
    );
    cTrunks.setMatrixAt(i, tMat);

    fMat.compose(
      new THREE.Vector3(x, frondY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + rng() * 1.5, 0)),
      new THREE.Vector3(0.85 + rng() * 0.2, 0.9 + rng() * 0.15, 0.85 + rng() * 0.2),
    );
    cFronds.setMatrixAt(i, fMat);
  }

  cTrunks.instanceMatrix.needsUpdate = true;
  cFronds.instanceMatrix.needsUpdate = true;

  root.add(register(cTrunks, 'coconut', { castShadow: true, receiveShadow: true }));
  root.add(register(cFronds, 'coconut', { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 13. Canopy hanging vines — long thin strands hanging down from canopy height
//     Placed near tree canopies in the jungle interior.
// ---------------------------------------------------------------------------

function addCanopyVines(root: THREE.Group): void {
  const count = 26;
  const SEED = 0xdee7_7101;

  const vineGeom = new THREE.CylinderGeometry(0.025, 0.032, 1.0, 5);

  const vines = new THREE.InstancedMesh(vineGeom, vegeMat(0x3d6e30, 0.8, 0.02), count);
  vines.name = 'farcrysis-vege-canopy-vines';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 5, 20, 2.5, SEED);
  const rng = mulberry32(SEED + 2);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    // Hang from canopy height (~3.5–6m above ground depending on terrain zone)
    const canopyRange = terrainHeightAt(x, z) < 1.5 ? 3.5 : 4.5;
    const vineLength = 1.8 + rng() * 2.0;
    const hangTop = groundY + canopyRange + rng() * 0.8;
    const hangCenter = hangTop - vineLength / 2;
    const sway = (rng() - 0.5) * 0.3;

    matrix.compose(
      new THREE.Vector3(x, hangCenter, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(sway, Math.sin(angle) * 0.2 + rng() * 0.5, sway * 0.5)),
      new THREE.Vector3(0.7 + rng() * 0.4, vineLength, 0.7 + rng() * 0.4),
    );
    vines.setMatrixAt(i, matrix);
  }

  vines.instanceMatrix.needsUpdate = true;
  root.add(register(vines, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 14. Leaf litter — flat brown patches scattered on the jungle floor
//     Plateau and cliff-ring floor covering, near-zero height above terrain.
// ---------------------------------------------------------------------------

function addLeafLitter(root: THREE.Group): void {
  const count = 90;
  const SEED = 0x11af_0455;

  const litterGeom = new THREE.BoxGeometry(0.7, 0.025, 0.55);

  const litter = new THREE.InstancedMesh(litterGeom, vegeMat(0x6b5230, 0.92, 0.01), count);
  litter.name = 'farcrysis-vege-leaf-litter';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 6, 28, 0.5, SEED);
  const rng = mulberry32(SEED + 3);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const litterY = groundY + 0.03;
    const scaleXZ = 0.7 + rng() * 0.9;
    const flatRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (rng() - 0.5) * 0.3, angle + rng() * 1.5, 0));
    matrix.compose(
      new THREE.Vector3(x, litterY, z),
      flatRot,
      new THREE.Vector3(scaleXZ, 1, scaleXZ * (0.7 + rng() * 0.6)),
    );
    litter.setMatrixAt(i, matrix);
  }

  litter.instanceMatrix.needsUpdate = true;
  root.add(register(litter, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 15. Dense grass tufts — high-count small cone layer across the arena
//     Avoids spawns + core, but OK to overlap paths (grass is low).
// ---------------------------------------------------------------------------

function addDenseGrass(root: THREE.Group): void {
  const count = 260;
  const SEED = 0x600d_a55e;

  const grassGeom = new THREE.ConeGeometry(0.08, 0.42, 5, 1);

  const grass = new THREE.InstancedMesh(grassGeom, vegeMat(0x4d7a36, 0.88, 0.01), count);
  grass.name = 'farcrysis-vege-dense-grass';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 1, 30, 0.5, SEED);
  const rng = mulberry32(SEED + 4);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const grassY = groundY + 0.22;
    const s = 0.55 + rng() * 0.5;
    matrix.compose(
      new THREE.Vector3(x, grassY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + rng() * 2.0, 0)),
      new THREE.Vector3(s, 0.6 + rng() * 0.5, s),
    );
    grass.setMatrixAt(i, matrix);
  }

  grass.instanceMatrix.needsUpdate = true;
  root.add(register(grass, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 16. Flowering accents — heliconia / warm-flower clusters (undergrowth)
//     Small stem + flower heads, placed on plateau and cliff edges.
// ---------------------------------------------------------------------------

function addFloweringAccents(root: THREE.Group): void {
  const count = 40;
  const SEED = 0x7e10_da11;

  // Merged geometry: thin stem cylinder + small flower head sphere
  const stemGeom = new THREE.CylinderGeometry(0.04, 0.06, 0.75, 6);
  const flowerGeom = new THREE.IcosahedronGeometry(0.09, 1);

  const flowerParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  flowerParts.push({
    geom: stemGeom,
    matrix: new THREE.Matrix4().compose(new THREE.Vector3(0, 0.375, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)),
  });
  // Two small flower buds at the top
  flowerParts.push({
    geom: flowerGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0.04, 0.78, 0.02),
      new THREE.Quaternion(),
      new THREE.Vector3(0.7, 0.65, 0.7),
    ),
  });
  flowerParts.push({
    geom: flowerGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(-0.05, 0.72, -0.03),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.5, 0)),
      new THREE.Vector3(0.6, 0.55, 0.65),
    ),
  });

  const flowerAccentGeom = mergeTransformed(flowerParts);

  const flowers = new THREE.InstancedMesh(flowerAccentGeom, vegeMat(0xd8542f, 0.72, 0.03), count);
  flowers.name = 'farcrysis-vege-flowering-accents';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 8, 22, 3.0, SEED);
  const rng = mulberry32(SEED + 5);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const baseY = groundY + 0.15 * rng();
    const s = 0.8 + rng() * 0.5;
    matrix.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + rng() * 1.5, 0)),
      new THREE.Vector3(s, 0.9 + rng() * 0.4, s),
    );
    flowers.setMatrixAt(i, matrix);
  }

  flowers.instanceMatrix.needsUpdate = true;
  root.add(register(flowers, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 17. Undergrowth shrubs — multi-lobe rounded shrubs (cliff ring + plateau edge)
// ---------------------------------------------------------------------------

function addUndergrowthShrubs(root: THREE.Group): void {
  const count = 40;
  const SEED = 0x38a8_fa11;

  // Merged: 3 small icosahedrons forming a lobed shrub cluster
  const blobGeom = new THREE.IcosahedronGeometry(0.65, 1);

  const shrubParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  shrubParts.push({
    geom: blobGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.7, 0.9),
    ),
  });
  shrubParts.push({
    geom: blobGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0.38, 0.05, 0.15),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, 0)),
      new THREE.Vector3(0.85, 0.55, 0.8),
    ),
  });
  shrubParts.push({
    geom: blobGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(-0.32, -0.02, -0.22),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, -0.3, 0.1)),
      new THREE.Vector3(0.75, 0.5, 0.85),
    ),
  });

  const shrubClusterGeom = mergeTransformed(shrubParts);

  const shrubs = new THREE.InstancedMesh(shrubClusterGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.88, 0.02), count);
  shrubs.name = 'farcrysis-vege-undergrowth-shrubs';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 10, 28, 3.0, SEED);
  const rng = mulberry32(SEED + 6);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const baseY = groundY + 0.1;
    const s = 0.75 + rng() * 0.55;
    matrix.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.3, angle + rng() * 2.0, rng() * 0.3)),
      new THREE.Vector3(s, 0.7 + rng() * 0.4, s * 0.9),
    );
    shrubs.setMatrixAt(i, matrix);
  }

  shrubs.instanceMatrix.needsUpdate = true;
  root.add(register(shrubs, undefined, { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 18. Understory ferns — varied-height 3-blade fern clusters (plateau + cliff)
// ---------------------------------------------------------------------------

function addUnderstoryFerns(root: THREE.Group): void {
  const count = 60;
  const SEED = 0x6e2d_f45e;

  // Merged: 3 crossed flat blades (thin boxes) forming a fern cluster
  const bladeGeom = new THREE.BoxGeometry(0.45, 1.0, 0.09);

  const fernParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let b = 0; b < 3; b++) {
    const bladeAngle = (b / 3) * Math.PI * 2;
    const tilt = 0.1 + (b % 2) * 0.2;
    fernParts.push({
      geom: bladeGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0.5, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, bladeAngle, 0)),
        new THREE.Vector3(1, 1, 1),
      ),
    });
  }

  const fernClusterGeom = mergeTransformed(fernParts);

  const ferns = new THREE.InstancedMesh(fernClusterGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  ferns.name = 'farcrysis-vege-understory-ferns';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 4, 26, 2.0, SEED);
  const rng = mulberry32(SEED + 7);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const baseY = groundY + 0.1 * rng();
    const s = 0.7 + rng() * 0.55;
    const hScale = 0.7 + rng() * 0.65;
    matrix.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + rng() * 2.5, 0)),
      new THREE.Vector3(s, hScale, s),
    );
    ferns.setMatrixAt(i, matrix);
  }

  ferns.instanceMatrix.needsUpdate = true;
  root.add(register(ferns, undefined, { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// Main entry: add every vegetation layer to the arena group.
// ---------------------------------------------------------------------------

export function buildVegetation(scene: THREE.Group): void {
  resetStats();

  // Trees — 6 distinct types (existing)
  addPalms(scene);
  addBroadleafTrees(scene);
  addConifers(scene);
  addBananaPlants(scene);
  addBamboo(scene);
  addDeadTrees(scene);

  // Ground cover (existing)
  addFerns(scene);
  addGrassTufts(scene);
  addBushes(scene);
  addVines(scene);

  // ---- Pass 69 extended layers (all new) ----
  addKapokTrees(scene);          // tree family #7 — 16 kapok trunks + 16 canopies
  addCoconutPalms(scene);        // tree family #8 — 14 coconut trunks + 14 fronds
  addCanopyVines(scene);         // 26 hanging vine strands from canopy height
  addLeafLitter(scene);          // 90 ground leaf-litter patches
  addDenseGrass(scene);          // 260 dense grass tufts
  addFloweringAccents(scene);    // 40 flowering accent clusters
  addUndergrowthShrubs(scene);   // 40 multi-lobe undergrowth shrubs
  addUnderstoryFerns(scene);     // 60 varied-height understory fern clusters
}

// ---------------------------------------------------------------------------
// Stats query — read the accumulated stats after buildVegetation() runs.
// ---------------------------------------------------------------------------

export function FARCRYSIS_VEGE_STATS(): {
  totalInstances: number;
  treeTypes: number;
  totalTriangles: number;
  /** Number of textures used (currently 0 — all procedural solid-colour materials). */
  textureCount: number;
} {
  return {
    totalInstances: _s.totalInstances,
    treeTypes: _s.treeTypeNames.size,
    totalTriangles: _s.totalTriangles,
    textureCount: _s.textureCount,
  };
}
