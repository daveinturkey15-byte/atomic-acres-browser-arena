/**
 * farcrysis-vegetation.ts — Pass 69 dense THREE.js tropical jungle vegetation module.
 *
 * Exports:
 *   buildVegetation(scene: THREE.Group): void
 *   FARCRYSIS_VEGE_STATS(): { totalInstances: number; treeTypes: number; totalTriangles: number; textureCount: number }
 *   animateVegetationWind(time: number): void   — frame wind-sway update (call each frame)
 *   setVegetationLOD(dist: number): void        — distance LOD toggle for large tree layers
 *
 * Target: 600+ vegetation instances via InstancedMesh, 8+ distinct tree/palm types,
 * ground cover (grass + leaf litter + fallen fronds + flower patches + beach pebbles),
 * multi-layer undergrowth, hanging vines — all via InstancedMesh / merged-geometry
 * for 60fps. Deterministic seeded placement. All procedural — no copied IP.
 * Presentation only — never adds colliders.
 * Mount from farcrysis.ts buildFarcrysis to add dense jungle dressing over the arena.
 *
 * Wind: lightweight GPU vertex displacement via onBeforeCompile shader injection
 * on select wind-enabled materials. Subtle (~0.15m max displacement), no collision impact.
 * LOD: far-distance impostor meshes (simple cross/cone) for palm + mangrove layers.
 * Ground: 3 new deterministic layers — fallen fronds (60), flower patches (5×8),
 * beach pebbles (40).
 */
import * as THREE from 'three';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Wind-sway animation (module-level shared state)
// ---------------------------------------------------------------------------

/** Per-material wind uniform references pushed by onBeforeCompile. */
const _windUniforms: Array<Record<string, { value: unknown }>> = [];

/**
 * Wrap a MeshStandardMaterial with onBeforeCompile wind-displacement injection.
 * The shader gets uWindTime / uWindStrength / uWindDir uniforms, and gentle
 * position-based vertex sway (local-space, ~0.15m max displacement).
 * Safe to call multiple times on the same material (idempotent guard).
 */
function makeWindMaterial(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  if ((base as any).__farcrysisWind) return base;
  (base as any).__farcrysisWind = true;

  base.onBeforeCompile = (shader: any) => {
    shader.uniforms.uWindTime = { value: 0 };
    shader.uniforms.uWindStrength = { value: 0.12 };
    shader.uniforms.uWindDir = { value: new THREE.Vector2(0.3, 0.7) };
    _windUniforms.push(shader.uniforms);

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>

      // Wind sway — gentle vertex displacement in local space.
      // position.y acts as height factor: more sway near the top of geometry.
      float _windH = clamp(position.y / 3.2, 0.0, 1.0);
      float _windN = sin(position.x * 2.5 + position.y * 1.3 + uWindTime * 4.0) * 0.5
                   + cos(position.z * 3.1 - position.y * 0.7 + uWindTime * 2.7) * 0.3;
      transformed.x += _windN * uWindDir.x * uWindStrength * _windH;
      transformed.z += _windN * uWindDir.y * uWindStrength * _windH;`,
    );
  };

  return base;
}

/**
 * Call once per frame to advance wind animation on all wind-enabled materials.
 * @param time Seconds elapsed (e.g. performance.now() / 1000 or a clock delta accumulator).
 */
export function animateVegetationWind(time: number): void {
  for (let i = 0; i < _windUniforms.length; i++) {
    const u = _windUniforms[i];
    if (u.uWindTime) u.uWindTime.value = time;
  }
}

// ---------------------------------------------------------------------------
// Distance-LOD for large tree layers (module-level registry)
// ---------------------------------------------------------------------------

interface LODPair {
  near: THREE.InstancedMesh[];
  far: THREE.InstancedMesh[];
}

const _lodPairs: LODPair[] = [];

function registerLODPair(near: THREE.InstancedMesh[], far: THREE.InstancedMesh[]): void {
  far.forEach((m) => { m.visible = false; });
  _lodPairs.push({ near, far });
}

/**
 * Call when camera distance changes to toggle near/far LOD impostors.
 * Threshold: dist < 35m → near (full detail); dist >= 35m → far (impostor).
 * Non-breaking: if no LOD pairs registered (e.g. buildVegetation not called yet),
 * this is a safe no-op.
 *
 * @param dist Camera-to-arena-centre distance in metres.
 */
export function setVegetationLOD(dist: number): void {
  const useNear = dist < 35;
  for (const pair of _lodPairs) {
    pair.near.forEach((m) => { m.visible = useNear; });
    pair.far.forEach((m) => { m.visible = !useNear; });
  }
}

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

/**
 * Poisson-disc-based layer positions (seeded dart-throwing rejection).
 * Same signature as layerPositions but enforces minimum separation between
 * placed points for a more natural, non-overlapping scatter.
 */
function poissonLayerPositions(
  count: number,
  minRadius: number,
  maxRadius: number,
  clearanceMargin: number,
  seed: number,
  minSeparation: number,
): Array<[number, number, number, number]> {
  const rng = mulberry32(seed);
  const result: Array<[number, number, number, number]> = [];
  let attempts = 0;
  const maxAttempts = count * 60;

  while (result.length < count && attempts < maxAttempts) {
    const radius = minRadius + rng() * (maxRadius - minRadius);
    const angle = rng() * Math.PI * 2;
    let x = Math.cos(angle) * radius;
    let z = Math.sin(angle) * radius;
    x = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, x));
    z = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, z));

    if (clearOfGameplay(x, z, clearanceMargin)) {
      let tooClose = false;
      for (let j = 0; j < result.length; j++) {
        if (Math.hypot(x - result[j][0], z - result[j][1]) < minSeparation) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        const groundY = terrainHeightAt(x, z);
        result.push([x, z, groundY, angle]);
      }
    }

    attempts += 1;
  }

  return result;
}

/**
 * Generate grove-like clustered positions: pick N grove centres, then scatter
 * `splay` stems around each centre with a small in-grove radius.
 */
function grovePositions(
  groves: number,
  stemsPerGrove: number,
  splay: number,
  minRadius: number,
  maxRadius: number,
  clearanceMargin: number,
  seed: number,
): Array<[number, number, number, number, number, number]> {
  const rng = mulberry32(seed);
  const result: Array<[number, number, number, number, number, number]> = [];
  const centres = poissonLayerPositions(groves, minRadius, maxRadius, clearanceMargin, seed, splay * 3);

  for (let g = 0; g < centres.length; g++) {
    const [cx, cz, _groundC, _angleC] = centres[g];
    for (let s = 0; s < stemsPerGrove; s++) {
      const sa = rng() * Math.PI * 2;
      const sr = rng() * splay;
      const sx = cx + Math.cos(sa) * sr;
      const sz = cz + Math.sin(sa) * sr;
      const sy = terrainHeightAt(sx, sz);
      result.push([sx, sz, sy, sa, sr, g + s * 0.01]);
    }
  }

  return result;
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

  // --- Palm LOD impostor: simple cone (half triangle count) ---
  const lodCount = count;
  const lodGeom = new THREE.ConeGeometry(0.4, 5.0, 6, 1);
  const lodMat = vegeMat(FARCRYSIS_ART_FEEL.palmFrond, 0.86, 0.02);
  const lodMesh = new THREE.InstancedMesh(lodGeom, lodMat, lodCount);
  lodMesh.name = 'farcrysis-vege-palm-lod';
  lodMesh.castShadow = false;
  lodMesh.receiveShadow = true;
  lodMesh.userData.farcrysisArt = true;

  const lodM = new THREE.Matrix4();
  for (let i = 0; i < lodCount; i++) {
    const [x, z, angle] = positions[i];
    const frondY = 1.4 + 2.7; // match original frond centre height
    lodM.compose(
      new THREE.Vector3(x, frondY - 0.5, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 1.3 + i * 0.15, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    lodMesh.setMatrixAt(i, lodM);
  }
  lodMesh.instanceMatrix.needsUpdate = true;

  // Wind-enable fronds for gentle sway
  makeWindMaterial(fronds.material as THREE.MeshStandardMaterial);

  registerLODPair([trunks, fronds], [lodMesh]);
  root.add(lodMesh);
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
  const count = 120;
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
  const count = 340;
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
  const count = 90;
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
// 19. Mangrove trees — twisted multi-trunk, small dark leaves (lagoon edges)
//     Placed in the outer sand/beach ring near the water transition.
//     Trunk: 3 leaning thin cylinders (merged). Canopy: 4 small dark spheres (merged).
// ---------------------------------------------------------------------------

function addMangroveTrees(root: THREE.Group): void {
  const count = 18;
  const SEED = 0x9a46_0e11;

  // --- Build merged mangrove trunk (3 leaning cylinders) ---
  const trunkCyl = new THREE.CylinderGeometry(0.1, 0.16, 2.4, 7);
  const trunkParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let t = 0; t < 3; t++) {
    const leanAngle = (t - 1) * 0.22;
    const leanDir = (t / 3) * Math.PI * 2;
    const tiltQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(leanAngle, leanDir, 0));
    trunkParts.push({
      geom: trunkCyl,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(leanDir) * 0.18, 1.2, Math.sin(leanDir) * 0.18),
        tiltQ,
        new THREE.Vector3(0.75 + (t % 2) * 0.15, 0.85 + t * 0.08, 0.75 + (t % 2) * 0.15),
      ),
    });
  }
  const mangroveTrunkGeom = mergeTransformed(trunkParts);

  // --- Build merged mangrove canopy (4 small dark spheres) ---
  const leafBlob = new THREE.IcosahedronGeometry(0.55, 1);
  const canopyParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let l = 0; l < 4; l++) {
    const la = (l / 4) * Math.PI * 2;
    canopyParts.push({
      geom: leafBlob,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(la) * 0.55, 2.3 + (l % 3) * 0.22, Math.sin(la) * 0.55),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((l % 2) * 0.3, la, 0)),
        new THREE.Vector3(0.65 + (l % 2) * 0.2, 0.6 + (l % 3) * 0.12, 0.6 + (l % 3) * 0.15),
      ),
    });
  }
  canopyParts.push({
    geom: leafBlob,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 2.55, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.7, 0.55, 0.65),
    ),
  });
  const mangroveCanopyGeom = mergeTransformed(canopyParts);

  const trunks = new THREE.InstancedMesh(mangroveTrunkGeom, vegeMat(0x5a4232, 0.9, 0.04), count);
  trunks.name = 'farcrysis-vege-mangrove-trunks';
  const canopies = new THREE.InstancedMesh(mangroveCanopyGeom, vegeMat(0x2a4a28, 0.88, 0.02), count);
  canopies.name = 'farcrysis-vege-mangrove-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = poissonLayerPositions(count, 23, 30.5, 2.5, SEED, 3.5);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const trunkBaseY = groundY;
    const trunkCenterY = trunkBaseY + 1.2;
    const canopyY = trunkBaseY + 2.3;

    const s = 0.8 + rng() * 0.35;
    tMat.compose(
      new THREE.Vector3(x, trunkCenterY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.08, angle + rng() * 0.6, 0)),
      new THREE.Vector3(s, 0.85 + rng() * 0.2, s),
    );
    trunks.setMatrixAt(i, tMat);

    cMat.compose(
      new THREE.Vector3(x, canopyY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.25, angle + rng() * 1.2, 0)),
      new THREE.Vector3(0.8 + rng() * 0.3, 0.65 + rng() * 0.2, 0.8 + rng() * 0.3),
    );
    canopies.setMatrixAt(i, cMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;

  root.add(register(trunks, 'mangrove', { castShadow: true, receiveShadow: true }));
  root.add(register(canopies, 'mangrove', { castShadow: false, receiveShadow: true }));

  // --- Mangrove LOD impostor: simple cone (half triangle count) ---
  const lodCount = count;
  const lodGeom = new THREE.ConeGeometry(0.35, 4.5, 6, 1);
  const lodMat = vegeMat(0x2a4a28, 0.88, 0.02);
  const lodMesh = new THREE.InstancedMesh(lodGeom, lodMat, lodCount);
  lodMesh.name = 'farcrysis-vege-mangrove-lod';
  lodMesh.castShadow = false;
  lodMesh.receiveShadow = true;
  lodMesh.userData.farcrysisArt = true;

  const lodM = new THREE.Matrix4();
  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const canopyY = groundY + 2.3;
    lodM.compose(
      new THREE.Vector3(x, canopyY - 0.3, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    lodMesh.setMatrixAt(i, lodM);
  }
  lodMesh.instanceMatrix.needsUpdate = true;

  registerLODPair([trunks, canopies], [lodMesh]);
  root.add(lodMesh);
}

// ---------------------------------------------------------------------------
// 20. Dense bamboo groves — tall thin cylinders, green-yellow, clustered
//     Placed along path corridor edges (not on paths) in the jungle interior.
// ---------------------------------------------------------------------------

function addBambooGroves(root: THREE.Group): void {
  const groves = 14;
  const stemsPerGrove = 14;
  const count = groves * stemsPerGrove; // 196

  const stemGeom = new THREE.CylinderGeometry(0.04, 0.06, 3.2, 6);

  const stems = new THREE.InstancedMesh(stemGeom, vegeMat(0x8a9a3a, 0.82, 0.03), count);
  stems.name = 'farcrysis-vege-bamboo-grove-stems';

  const matrix = new THREE.Matrix4();
  const SEED = 0xa860_0091;
  const rng = mulberry32(SEED);

  const positions = grovePositions(groves, stemsPerGrove, 2.2, 5, 24, 3.5, SEED);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle, _sr, _gi] = positions[i];
    const heightScale = 0.8 + rng() * 0.4;
    const lean = (rng() - 0.5) * 0.06;

    matrix.compose(
      new THREE.Vector3(x, groundY + 1.55 * heightScale, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, angle + rng() * 0.6, lean * 0.5)),
      new THREE.Vector3(0.7 + rng() * 0.3, heightScale, 0.7 + rng() * 0.3),
    );
    stems.setMatrixAt(i, matrix);
  }

  stems.instanceMatrix.needsUpdate = true;
  root.add(register(stems, 'bamboo-grove', { castShadow: true, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 21. Flowering bushes — icosahedron bush bodies + small emissive blooms
//     Scattered accents across the jungle interior and cliff ring.
// ---------------------------------------------------------------------------

function addFloweringBushes(root: THREE.Group): void {
  const count = 36;
  const bloomsPerBush = 2;
  const bloomCount = count * bloomsPerBush;
  const SEED = 0x710a_a5a5;

  // Bush body: 2 overlapping icosahedrons
  const blobGeom = new THREE.IcosahedronGeometry(0.7, 1);
  const bushParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [
    {
      geom: blobGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0), new THREE.Quaternion(),
        new THREE.Vector3(1, 0.65, 0.9),
      ),
    },
    {
      geom: blobGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0.3, 0.05, -0.1),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, 0)),
        new THREE.Vector3(0.8, 0.55, 0.8),
      ),
    },
  ];
  const bushGeom = mergeTransformed(bushParts);

  // Bloom head: small emissive sphere
  const bloomGeom = new THREE.IcosahedronGeometry(0.1, 1);

  const bushes = new THREE.InstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.88, 0.01), count);
  bushes.name = 'farcrysis-vege-flowering-bushes';

  // Emissive bloom material — warm magenta-pink glow
  const bloomMat = new THREE.MeshStandardMaterial({
    color: 0xff5a9e,
    roughness: 0.5,
    metalness: 0.05,
    emissive: 0xff3070,
    emissiveIntensity: 0.6,
  });
  const blooms = new THREE.InstancedMesh(bloomGeom, bloomMat, bloomCount);
  blooms.name = 'farcrysis-vege-flowering-blooms';

  const bMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = poissonLayerPositions(count, 6, 24, 3.0, SEED, 2.8);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const baseY = groundY + 0.15 * rng();
    const s = 0.7 + rng() * 0.45;

    bMat.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.2, angle + rng() * 1.5, rng() * 0.2)),
      new THREE.Vector3(s, 0.65 + rng() * 0.3, s * 0.9),
    );
    bushes.setMatrixAt(i, bMat);

    // Blooms offset to top/sides of bush
    for (let b = 0; b < bloomsPerBush; b++) {
      const bloomAngle = angle + ((b + i * 0.5) / bloomsPerBush) * Math.PI * 2;
      const bx = x + Math.cos(bloomAngle) * 0.35 * s;
      const bz = z + Math.sin(bloomAngle) * 0.35 * s * 0.85;
      const by = baseY + 0.55 + rng() * 0.35;
      const bidx = i * bloomsPerBush + b;

      lMat.compose(
        new THREE.Vector3(bx, by, bz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.5, bloomAngle, 0)),
        new THREE.Vector3(0.7 + rng() * 0.4, 0.7 + rng() * 0.4, 0.7 + rng() * 0.4),
      );
      blooms.setMatrixAt(bidx, lMat);
    }
  }

  bushes.instanceMatrix.needsUpdate = true;
  blooms.instanceMatrix.needsUpdate = true;

  root.add(register(bushes, undefined, { castShadow: false, receiveShadow: true }));
  root.add(register(blooms, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 22. Jungle vine clusters — procedural multi-strand hanging vine bundles
//     Placed near kapok and coconut tree positions in the canopy zone.
// ---------------------------------------------------------------------------

function addJungleVineClusters(root: THREE.Group): void {
  const count = 30;
  const SEED = 0x6659_1e11;

  // Each vine cluster: 5 strands, each strand = 2-3 thin cylinder segments
  // with slight alternating bends for a natural hanging look.
  const strandSeg = new THREE.CylinderGeometry(0.02, 0.025, 0.55, 5);
  const clusterParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];

  for (let s = 0; s < 5; s++) {
    const baseAngle = (s / 5) * Math.PI * 2;
    const offsetR = 0.08 + (s % 3) * 0.05;
    const ox = Math.cos(baseAngle) * offsetR;
    const oz = Math.sin(baseAngle) * offsetR;

    // 3 segments per strand, descending vertically
    for (let seg = 0; seg < 3; seg++) {
      const segY = 3.2 - seg * 0.9;
      const bendX = ox + (seg % 2 === 0 ? 0.06 : -0.04);
      const bendZ = oz + (seg % 3 === 0 ? -0.05 : 0.04);
      clusterParts.push({
        geom: strandSeg,
        matrix: new THREE.Matrix4().compose(
          new THREE.Vector3(bendX, segY, bendZ),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, baseAngle + s * 0.3, 0.08)),
          new THREE.Vector3(0.7 + (seg % 2) * 0.15, 0.8 + (seg % 3) * 0.1, 0.7 + (seg % 2) * 0.15),
        ),
      });
    }
  }
  const vineClusterGeom = mergeTransformed(clusterParts);

  const clusters = new THREE.InstancedMesh(vineClusterGeom, vegeMat(0x3d6e30, 0.8, 0.02), count);
  clusters.name = 'farcrysis-vege-jungle-vine-clusters';

  const matrix = new THREE.Matrix4();
  const positions = poissonLayerPositions(count, 5, 24, 2.5, SEED, 2.0);
  const rng = mulberry32(SEED + 2);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    // Hang from high canopy (~3.5-5m above ground)
    const hangTop = groundY + 3.5 + rng() * 1.8;
    const scale = 0.75 + rng() * 0.45;

    matrix.compose(
      new THREE.Vector3(x, hangTop - 1.6 * scale, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.25, angle + rng() * 1.0, (rng() - 0.5) * 0.2)),
      new THREE.Vector3(scale, 0.9 + rng() * 0.2, scale),
    );
    clusters.setMatrixAt(i, matrix);
  }

  clusters.instanceMatrix.needsUpdate = true;
  root.add(register(clusters, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 23. Beach grass tufts — taller, golden-tinged cones along the sand/shore rim
//     Dense scatter in the outer sand ring (beach-to-water transition).
// ---------------------------------------------------------------------------

function addBeachGrass(root: THREE.Group): void {
  const count = 140;
  const SEED = 0xdea4_c055;

  const grassGeom = new THREE.ConeGeometry(0.06, 0.72, 5, 1);

  const grass = new THREE.InstancedMesh(grassGeom, vegeMat(0xb8a04a, 0.86, 0.02), count);
  grass.name = 'farcrysis-vege-beach-grass';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 24, 31.5, 0.5, SEED);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const grassY = groundY + 0.36;
    const s = 0.6 + rng() * 0.55;
    const leanAngle = (rng() - 0.5) * 0.18;
    const leanDir = angle + rng() * 0.8;

    matrix.compose(
      new THREE.Vector3(x, grassY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(leanAngle, leanDir, 0)),
      new THREE.Vector3(s, 0.7 + rng() * 0.55, s),
    );
    grass.setMatrixAt(i, matrix);
  }

  grass.instanceMatrix.needsUpdate = true;
  root.add(register(grass, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 24. Large ferns — broader fronds (5-7 blades) forming dense understory
//     Placed in the cliff ring and near rocky areas (cave entrance).
// ---------------------------------------------------------------------------

function addLargeFerns(root: THREE.Group): void {
  const count = 50;
  const SEED = 0x3e29_f0ae;

  // Merged: 6 broad flat blades arranged radially with upward arch
  const bladeGeom = new THREE.BoxGeometry(0.6, 1.6, 0.1);
  const fernParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let b = 0; b < 6; b++) {
    const bladeAngle = (b / 6) * Math.PI * 2;
    const tilt = -0.3 + (b % 3) * 0.18; // gentle outward arch
    fernParts.push({
      geom: bladeGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0.8, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, bladeAngle + (b % 2) * 0.15, 0)),
        new THREE.Vector3(0.8 + (b % 3) * 0.12, 1, 0.6 + (b % 3) * 0.25),
      ),
    });
  }
  // Extra 7th blade for fullness
  fernParts.push({
    geom: bladeGeom,
    matrix: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.75, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, Math.PI / 3, 0)),
      new THREE.Vector3(0.7, 0.9, 0.65),
    ),
  });
  const largeFernGeom = mergeTransformed(fernParts);

  const ferns = new THREE.InstancedMesh(largeFernGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.84, 0.02), count);
  ferns.name = 'farcrysis-vege-large-ferns';

  const matrix = new THREE.Matrix4();
  // Place majority in cliff ring (radius 14-24), a handful near the cave at (26,16)
  const cliffCount = Math.floor(count * 0.85);
  const cliffPositions = poissonLayerPositions(cliffCount, 14, 24, 2.0, SEED, 1.8);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < cliffPositions.length; i++) {
    const [x, z, groundY, angle] = cliffPositions[i];
    const baseY = groundY + 0.08 * rng();
    const s = 0.65 + rng() * 0.5;
    const hScale = 0.65 + rng() * 0.6;

    matrix.compose(
      new THREE.Vector3(x, baseY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + rng() * 2.0, 0)),
      new THREE.Vector3(s, hScale, s),
    );
    ferns.setMatrixAt(i, matrix);
  }

  // Cave-adjacent ferns: scatter a few near (26, 16) with local jitter
  const caveCount = count - cliffPositions.length;
  const caveRng = mulberry32(SEED + 99);
  for (let i = 0; i < caveCount; i++) {
    const cx = 26 + (caveRng() - 0.5) * 6;
    const cz = 16 + (caveRng() - 0.5) * 5;
    const dx = Math.max(BOUNDS.minX + MARGIN, Math.min(BOUNDS.maxX - MARGIN, cx));
    const dz = Math.max(BOUNDS.minZ + MARGIN, Math.min(BOUNDS.maxZ - MARGIN, cz));
    const groundY = terrainHeightAt(dx, dz);
    const angle = caveRng() * Math.PI * 2;
    const s = 0.65 + caveRng() * 0.45;
    const hScale = 0.65 + caveRng() * 0.55;
    const idx = cliffPositions.length + i;

    matrix.compose(
      new THREE.Vector3(dx, groundY + 0.08, dz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(s, hScale, s),
    );
    ferns.setMatrixAt(idx, matrix);
  }

  ferns.instanceMatrix.needsUpdate = true;
  root.add(register(ferns, undefined, { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 25. Fallen palm fronds — scattered brown leaf-litter on sand + grass rings
//     60 flat box instances, deterministic seeded placement, near-zero height.
// ---------------------------------------------------------------------------

function addFallenFronds(root: THREE.Group): void {
  const count = 60;
  const SEED = 0xfa11_3eaf;

  const frondGeom = new THREE.BoxGeometry(1.2, 0.03, 0.25);

  const fronds = new THREE.InstancedMesh(frondGeom, vegeMat(0x8b6b3a, 0.9, 0.01), count);
  fronds.name = 'farcrysis-vege-fallen-fronds';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 3, 30, 0.8, SEED);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const frondY = groundY + 0.02;
    const scaleXZ = 0.7 + rng() * 0.8;

    matrix.compose(
      new THREE.Vector3(x, frondY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        -Math.PI / 2 + (rng() - 0.5) * 0.4,
        angle + rng() * 2.0,
        (rng() - 0.5) * 0.3,
      )),
      new THREE.Vector3(scaleXZ, 1, scaleXZ * 0.38),
    );
    fronds.setMatrixAt(i, matrix);
  }

  fronds.instanceMatrix.needsUpdate = true;
  root.add(register(fronds, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 26. Flower patches — 5 clusters × 8 tiny emissive-tinted sphere flowers
//     Scattered across jungle interior, deterministically placed.
// ---------------------------------------------------------------------------

function addFlowerPatches(root: THREE.Group): void {
  const patches = 5;
  const flowersPerPatch = 8;
  const count = patches * flowersPerPatch;
  const SEED = 0xbea0_7101;

  const flowerGeom = new THREE.IcosahedronGeometry(0.08, 1);
  const flowerMat = new THREE.MeshStandardMaterial({
    color: 0xff6090,
    roughness: 0.55,
    metalness: 0.03,
    emissive: 0xff3060,
    emissiveIntensity: 0.5,
  });

  const flowers = new THREE.InstancedMesh(flowerGeom, flowerMat, count);
  flowers.name = 'farcrysis-vege-flower-patches';

  const matrix = new THREE.Matrix4();
  // Generate 5 patch centres with Poisson separation
  const patchCenters = poissonLayerPositions(patches, 5, 26, 2.5, SEED, 5.0);

  for (let p = 0; p < patchCenters.length; p++) {
    const [cx, cz, groundY] = patchCenters[p];
    const patchRng = mulberry32(SEED + p + 1);

    for (let f = 0; f < flowersPerPatch; f++) {
      const fa = patchRng() * Math.PI * 2;
      const fr = patchRng() * 1.5;
      const fx = cx + Math.cos(fa) * fr;
      const fz = cz + Math.sin(fa) * fr;
      const fy = groundY + 0.05 + patchRng() * 0.15;
      const s = 0.7 + patchRng() * 0.6;
      const idx = p * flowersPerPatch + f;

      matrix.compose(
        new THREE.Vector3(fx, fy, fz),
        new THREE.Quaternion(),
        new THREE.Vector3(s, s * (0.8 + patchRng() * 0.3), s),
      );
      flowers.setMatrixAt(idx, matrix);
    }
  }

  flowers.instanceMatrix.needsUpdate = true;
  root.add(register(flowers, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 27. Beach pebbles — ~40 tiny icosahedron stones scattered on the outer sand
//     Non-shadow-casting for performance, deterministically placed.
// ---------------------------------------------------------------------------

function addBeachPebbles(root: THREE.Group): void {
  const count = 40;
  const SEED = 0x5eab_1100;

  const pebbleGeom = new THREE.IcosahedronGeometry(0.12, 0);

  const pebbles = new THREE.InstancedMesh(pebbleGeom, vegeMat(0xb8a890, 0.78, 0.08), count);
  pebbles.name = 'farcrysis-vege-beach-pebbles';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 26, 31.5, 0.3, SEED);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY] = positions[i];
    const pebbleY = groundY + 0.02;
    const s = 0.5 + rng() * 0.7;

    matrix.compose(
      new THREE.Vector3(x, pebbleY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        rng() * Math.PI,
        rng() * Math.PI,
        rng() * Math.PI,
      )),
      new THREE.Vector3(s, s * (0.4 + rng() * 0.5), s),
    );
    pebbles.setMatrixAt(i, matrix);
  }

  pebbles.instanceMatrix.needsUpdate = true;
  root.add(register(pebbles, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 28. Cycad palms (sago-palm archetype) — short spiky rosette trees
//     Jungle interior + cliff ring. Separate trunk + leaf InstancedMeshes:
//     squat tapered trunk, 9 outer arching spiky leaves + 3 inner uprights.
// ---------------------------------------------------------------------------

function addCycadPalms(root: THREE.Group): void {
  const count = 14;
  const SEED = 0x2f5c_0c11;

  // Squat trunk, translated so its base rests at y=0
  const trunkCyl = new THREE.CylinderGeometry(0.16, 0.26, 0.8, 8);
  trunkCyl.translate(0, 0.4, 0);

  // Merged leaf rosette: 9 outer arching spikes + 3 inner upright spikes
  const leafCone = new THREE.ConeGeometry(0.055, 0.62, 4, 1);
  const leafParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let k = 0; k < 9; k++) {
    const angle = (k / 9) * Math.PI * 2 + 0.12;
    leafParts.push({
      geom: leafCone,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(angle) * 0.14, 0.72, Math.sin(angle) * 0.14),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55 + (k % 3) * 0.14, angle, 0)),
        new THREE.Vector3(0.85 + (k % 3) * 0.15, 0.9 + (k % 2) * 0.15, 0.85 + (k % 3) * 0.15),
      ),
    });
  }
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2 + 0.3;
    leafParts.push({
      geom: leafCone,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(angle) * 0.07, 0.78, Math.sin(angle) * 0.07),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.18, angle, 0)),
        new THREE.Vector3(0.7 + k * 0.1, 1.05 + k * 0.1, 0.7 + k * 0.1),
      ),
    });
  }
  const cycadLeafGeom = mergeTransformed(leafParts);

  const trunks = new THREE.InstancedMesh(trunkCyl, vegeMat(0x6b4e30, 0.9, 0.03), count);
  trunks.name = 'farcrysis-vege-cycad-trunks';
  const leaves = new THREE.InstancedMesh(cycadLeafGeom, vegeMat(0x3a7a34, 0.84, 0.02), count);
  leaves.name = 'farcrysis-vege-cycad-leaves';

  const tMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = poissonLayerPositions(count, 4, 22, 2.5, SEED, 2.4);
  const rng = mulberry32(SEED + 1);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const s = 0.8 + rng() * 0.5;
    const yaw = angle + rng() * 0.8;

    tMat.compose(
      new THREE.Vector3(x, groundY + 0.02, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(s, 0.8 + rng() * 0.35, s),
    );
    trunks.setMatrixAt(i, tMat);

    lMat.compose(
      new THREE.Vector3(x, groundY + 0.02, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(s, 0.8 + rng() * 0.35, s),
    );
    leaves.setMatrixAt(i, lMat);
  }

  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  trunks.computeBoundingSphere();
  leaves.computeBoundingSphere();

  root.add(register(trunks, 'cycad', { castShadow: true, receiveShadow: true }));
  root.add(register(leaves, 'cycad', { castShadow: true, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 29. Tropical bloom trees (flame-tree archetype) — broad crown + orange blooms
//     Inland jungle plateau. Trunk + squashed 2-lobe canopy + 6 small
//     emissive blossom heads per tree (separate InstancedMeshes).
// ---------------------------------------------------------------------------

function addBloomTrees(root: THREE.Group): void {
  const count = 12;
  const bloomsPerTree = 6;
  const bloomCount = count * bloomsPerTree;
  const SEED = 0x1a4f_b011;

  const trunkGeom = new THREE.CylinderGeometry(0.18, 0.3, 2.4, 8);
  trunkGeom.translate(0, 1.2, 0);

  // Canopy: 2 stacked squashed spheres (merged)
  const sphereSrc = new THREE.SphereGeometry(1.05, 8, 5);
  const canopyParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [
    {
      geom: sphereSrc,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(1.15, 0.6, 1.0),
      ),
    },
    {
      geom: sphereSrc,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(-0.2, 0.5, 0.1),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, 0)),
        new THREE.Vector3(0.9, 0.52, 0.85),
      ),
    },
  ];
  const canopyGeom = mergeTransformed(canopyParts);

  // Blossom head: small detail-0 icosahedron (20 tris)
  const blossomGeom = new THREE.IcosahedronGeometry(0.12, 0);

  const trunks = new THREE.InstancedMesh(trunkGeom, vegeMat(0x6d5438, 0.9, 0.03), count);
  trunks.name = 'farcrysis-vege-bloom-trunks';
  const canopies = new THREE.InstancedMesh(canopyGeom, vegeMat(0x357a2e, 0.86, 0.01), count);
  canopies.name = 'farcrysis-vege-bloom-canopies';
  const blossoms = new THREE.InstancedMesh(blossomGeom, vegeMat(0xe8602a, 0.6, 0.02), bloomCount);
  blossoms.name = 'farcrysis-vege-bloom-blossoms';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const bMat = new THREE.Matrix4();
  const positions = poissonLayerPositions(count, 6, 20, 3.5, SEED, 4.5);
  const rng = mulberry32(SEED + 2);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const trunkY = groundY;
    const canopyY = groundY + 2.5;
    const s = 0.85 + rng() * 0.4;
    const yaw = angle + rng() * 0.6;

    tMat.compose(
      new THREE.Vector3(x, trunkY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.08, yaw, 0)),
      new THREE.Vector3(s, 0.85 + rng() * 0.2, s),
    );
    trunks.setMatrixAt(i, tMat);

    cMat.compose(
      new THREE.Vector3(x, canopyY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.2, yaw + rng() * 1.2, 0)),
      new THREE.Vector3(0.9 + rng() * 0.3, 0.8 + rng() * 0.25, 0.9 + rng() * 0.3),
    );
    canopies.setMatrixAt(i, cMat);

    // 6 blossom heads tucked around the crown rim
    for (let b = 0; b < bloomsPerTree; b++) {
      const ba = yaw + (b / bloomsPerTree) * Math.PI * 2 + (i % 2) * 0.2;
      const br = 0.75 + ((i * 7 + b * 3) % 5) * 0.06;
      const by = canopyY + ((i + b) % 3) * 0.18;
      bMat.compose(
        new THREE.Vector3(x + Math.cos(ba) * br, by, z + Math.sin(ba) * br),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.4, ba, 0)),
        new THREE.Vector3(0.7 + rng() * 0.4, 0.7 + rng() * 0.4, 0.7 + rng() * 0.4),
      );
      blossoms.setMatrixAt(i * bloomsPerTree + b, bMat);
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  blossoms.instanceMatrix.needsUpdate = true;
  trunks.computeBoundingSphere();
  canopies.computeBoundingSphere();
  blossoms.computeBoundingSphere();

  root.add(register(trunks, 'bloom-tree', { castShadow: true, receiveShadow: true }));
  root.add(register(canopies, 'bloom-tree', { castShadow: false, receiveShadow: true }));
  root.add(register(blossoms, 'bloom-tree', { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 30. Beach scrub bushes (sea-grape archetype) — lobed body + broad flat leaves
//     Beach fringe (ring 21-31) between palms and the waterline.
// ---------------------------------------------------------------------------

function addBeachScrubBushes(root: THREE.Group): void {
  const count = 24;
  const SEED = 0x9b3c_2a11;

  const blobGeom = new THREE.IcosahedronGeometry(0.5, 0);
  const leafGeom = new THREE.BoxGeometry(0.5, 0.03, 0.38);

  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [
    {
      geom: blobGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0), new THREE.Quaternion(),
        new THREE.Vector3(1, 0.72, 0.9),
      ),
    },
    {
      geom: blobGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0.3, 0.05, 0.12),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.5, 0)),
        new THREE.Vector3(0.85, 0.6, 0.8),
      ),
    },
    {
      geom: blobGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(-0.28, -0.02, -0.18),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.15, -0.4, 0.1)),
        new THREE.Vector3(0.8, 0.55, 0.85),
      ),
    },
  ];
  // Broad rounded "sea-grape" leaves fanning over the lobes
  for (let l = 0; l < 4; l++) {
    const la = (l / 4) * Math.PI * 2 + 0.25;
    parts.push({
      geom: leafGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(la) * 0.42, 0.28 + (l % 2) * 0.08, Math.sin(la) * 0.42),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, la, (l % 3) * 0.2)),
        new THREE.Vector3(0.9 + (l % 2) * 0.15, 1, 0.9 + (l % 3) * 0.1),
      ),
    });
  }
  const scrubGeom = mergeTransformed(parts);

  const bushes = new THREE.InstancedMesh(scrubGeom, vegeMat(0x4c7a38, 0.88, 0.02), count);
  bushes.name = 'farcrysis-vege-beach-scrub-bushes';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 21, 31, 1.5, SEED);
  const rng = mulberry32(SEED + 3);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const s = 0.7 + rng() * 0.5;
    matrix.compose(
      new THREE.Vector3(x, groundY + 0.05, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.2, angle + rng() * 1.5, rng() * 0.2)),
      new THREE.Vector3(s, 0.7 + rng() * 0.35, s * 0.9),
    );
    bushes.setMatrixAt(i, matrix);
  }

  bushes.instanceMatrix.needsUpdate = true;
  bushes.computeBoundingSphere();
  root.add(register(bushes, undefined, { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// 31. Grass patches — multi-blade tufts (4 thin cones merged), dense cover
//     Arena-wide low dressing; overlaps paths (grass is ankle-height).
// ---------------------------------------------------------------------------

function addGrassPatches(root: THREE.Group): void {
  const count = 120;
  const SEED = 0x77c0_fa11;

  const bladeGeom = new THREE.ConeGeometry(0.06, 0.55, 4, 1);
  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let b = 0; b < 4; b++) {
    const ba = (b / 4) * Math.PI * 2 + 0.2;
    const tilt = 0.12 + (b % 2) * 0.14;
    parts.push({
      geom: bladeGeom,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(ba) * 0.06, 0.27, Math.sin(ba) * 0.06),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ba, 0)),
        new THREE.Vector3(0.85 + (b % 3) * 0.12, 0.8 + (b % 2) * 0.18, 0.85 + (b % 3) * 0.12),
      ),
    });
  }
  const patchGeom = mergeTransformed(parts);

  const patches = new THREE.InstancedMesh(patchGeom, vegeMat(0x4d8a36, 0.88, 0.01), count);
  patches.name = 'farcrysis-vege-grass-patches';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 1, 30, 0.5, SEED);
  const rng = mulberry32(SEED + 4);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const s = 0.7 + rng() * 0.6;
    matrix.compose(
      new THREE.Vector3(x, groundY + 0.03, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + rng() * 2.0, 0)),
      new THREE.Vector3(s, 0.75 + rng() * 0.5, s),
    );
    patches.setMatrixAt(i, matrix);
  }

  patches.instanceMatrix.needsUpdate = true;
  patches.computeBoundingSphere();
  root.add(register(patches, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 32. Twigs — thin fallen sticks lying on the jungle floor
//     Low-cost dressing: 4-segment cylinders laid near-flat, random yaw.
// ---------------------------------------------------------------------------

function addTwigs(root: THREE.Group): void {
  const count = 90;
  const SEED = 0x4c1e_a011;

  const twigGeom = new THREE.CylinderGeometry(0.015, 0.028, 0.55, 4);
  twigGeom.translate(0, 0, 0);

  const twigs = new THREE.InstancedMesh(twigGeom, vegeMat(0x6b5230, 0.92, 0.01), count);
  twigs.name = 'farcrysis-vege-twigs';

  const matrix = new THREE.Matrix4();
  const positions = layerPositions(count, 3, 28, 0.5, SEED);
  const rng = mulberry32(SEED + 5);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const twigY = groundY + 0.02;
    const s = 0.6 + rng() * 0.8;
    // Lay near-flat with a slight random tilt; cylinder's +Y becomes ground axis
    matrix.compose(
      new THREE.Vector3(x, twigY, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        Math.PI / 2 + (rng() - 0.5) * 0.35,
        angle + rng() * Math.PI,
        (rng() - 0.5) * 0.3,
      )),
      new THREE.Vector3(s, 1, s),
    );
    twigs.setMatrixAt(i, matrix);
  }

  twigs.instanceMatrix.needsUpdate = true;
  twigs.computeBoundingSphere();
  root.add(register(twigs, undefined, { castShadow: false, receiveShadow: false }));
}

// ---------------------------------------------------------------------------
// 33. Small rocks — inland stone scatter (jungle plateau + cliff ring)
//     Squashed detail-1 icosahedra, bigger and chunkier than beach pebbles.
// ---------------------------------------------------------------------------

function addSmallRocks(root: THREE.Group): void {
  const count = 60;
  const SEED = 0x63d4_7711;

  const rockGeom = new THREE.IcosahedronGeometry(0.26, 1);

  const rocks = new THREE.InstancedMesh(rockGeom, vegeMat(0x6e6a64, 0.85, 0.06), count);
  rocks.name = 'farcrysis-vege-small-rocks';

  const matrix = new THREE.Matrix4();
  const positions = poissonLayerPositions(count, 6, 26, 1.0, SEED, 1.5);
  const rng = mulberry32(SEED + 6);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const s = 0.7 + rng() * 0.8;
    matrix.compose(
      new THREE.Vector3(x, groundY + 0.03, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        rng() * Math.PI,
        angle + rng() * Math.PI,
        rng() * Math.PI,
      )),
      new THREE.Vector3(s, s * (0.55 + rng() * 0.35), s),
    );
    rocks.setMatrixAt(i, matrix);
  }

  rocks.instanceMatrix.needsUpdate = true;
  rocks.computeBoundingSphere();
  root.add(register(rocks, undefined, { castShadow: false, receiveShadow: true }));
}

// ---------------------------------------------------------------------------
// Wind-enable helper — walks the scene's direct children (InstancedMesh only)
// and applies makeWindMaterial to layers that should sway.
// Trunks, dead trees, pebbles, leaf litter, and LOD impostors are excluded.
// ---------------------------------------------------------------------------

function _windEnableAll(scene: THREE.Group): void {
  const windNames: string[] = [
    'farcrysis-vege-palm-fronds',        // already done in addPalms, but idempotent
    'farcrysis-vege-banana-leaves',
    'farcrysis-vege-bamboo-stems',
    'farcrysis-vege-ferns',
    'farcrysis-vege-grass-tufts',
    'farcrysis-vege-vines',
    'farcrysis-vege-coconut-fronds',
    'farcrysis-vege-canopy-vines',
    'farcrysis-vege-dense-grass',
    'farcrysis-vege-flowering-accents',
    'farcrysis-vege-understory-ferns',
    'farcrysis-vege-bamboo-grove-stems',
    'farcrysis-vege-flowering-blooms',
    'farcrysis-vege-jungle-vine-clusters',
    'farcrysis-vege-beach-grass',
    'farcrysis-vege-large-ferns',
    'farcrysis-vege-cycad-leaves',
    'farcrysis-vege-grass-patches',
  ];

  for (let i = 0; i < scene.children.length; i++) {
    const child = scene.children[i];
    if (!(child instanceof THREE.InstancedMesh)) continue;
    if (windNames.includes(child.name)) {
      makeWindMaterial(child.material as THREE.MeshStandardMaterial);
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry: add every vegetation layer to the arena group.
// ---------------------------------------------------------------------------

export function buildVegetation(scene: THREE.Group): void {
  resetStats();

  // Trees — 6 distinct types (existing)
  addPalms(scene);              // LOD pair registered + fronds wind-enabled inside
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
  addLeafLitter(scene);          // 120 ground leaf-litter patches
  addDenseGrass(scene);          // 340 dense grass tufts
  addFloweringAccents(scene);    // 40 flowering accent clusters
  addUndergrowthShrubs(scene);   // 40 multi-lobe undergrowth shrubs
  addUnderstoryFerns(scene);     // 90 varied-height understory fern clusters

  // ---- Pass 69 vegetation enrichment (6 new families, Poisson-disc, groves) ----
  addMangroveTrees(scene);       // tree family #9 — 18 mangroves (LOD pair registered inside)
  addBambooGroves(scene);        // 196 stems in 14 dense groves along path edges
  addFloweringBushes(scene);     // 36 bushes + 72 emissive magenta blooms
  addJungleVineClusters(scene);  // 30 multi-strand hanging vine bundles
  addBeachGrass(scene);          // 140 golden beach grass tufts
  addLargeFerns(scene);          // 50 broad-blade large understory ferns

  // ---- Pass 69 wind + LOD + ground detail (3 new layers) ----
  addFallenFronds(scene);        // #25 — 60 fallen palm-frond patches
  addFlowerPatches(scene);       // #26 — 5×8=40 emissive flower blooms in clusters
  addBeachPebbles(scene);        // #27 — 40 tiny beach pebbles

  // ---- Pass 69 vegetation density polish: 3 new plant families + ground cover ----
  addCycadPalms(scene);          // #28 tree family — 14 cycad trunks + 14 leaves
  addBloomTrees(scene);          // #29 tree family — 12 trunks + 12 canopies + 72 blossoms
  addBeachScrubBushes(scene);    // #30 bush family — 24 beach scrub clusters
  addGrassPatches(scene);        // #31 ground cover — 120 multi-blade grass patches
  addTwigs(scene);               // #32 ground cover — 90 fallen twigs
  addSmallRocks(scene);          // #33 ground cover — 60 inland rocks

  // ---- Wind-enable remaining flexible vegetation (non-LOD-managed) ----
  _windEnableAll(scene);
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

// ---------------------------------------------------------------------------
// Standalone density-polish entry — wires only the new 3 plant families +
// ground cover (layers #28-#33) into an existing scene without resetting
// the module-level stat accumulator. Returns deltas so the orchestrator can
// log exactly what the polish pass added.
// ---------------------------------------------------------------------------

export interface VegetationPolishStats {
  addedInstances: number;
  addedTriangles: number;
  addedTreeTypes: string[];
}

export function buildAdditionalVegetation(root: THREE.Group): VegetationPolishStats {
  const beforeInstances = _s.totalInstances;
  const beforeTriangles = _s.totalTriangles;
  const beforeTypes = new Set(_s.treeTypeNames);

  addCycadPalms(root);
  addBloomTrees(root);
  addBeachScrubBushes(root);
  addGrassPatches(root);
  addTwigs(root);
  addSmallRocks(root);
  _windEnableAll(root);

  // Diff the set to get only newly added tree-type names
  const addedTreeTypes: string[] = [];
  for (const t of _s.treeTypeNames) {
    if (!beforeTypes.has(t)) addedTreeTypes.push(t);
  }

  return {
    addedInstances: _s.totalInstances - beforeInstances,
    addedTriangles: _s.totalTriangles - beforeTriangles,
    addedTreeTypes,
  };
}
