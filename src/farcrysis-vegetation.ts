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
 * Wind (HF-359): typed TSL per-instance phase-offset sway in positionNode —
 * no onBeforeCompile, no ShaderMaterial. See farcrysis-tsl-foliage.ts.
 * LOD: far-distance impostor meshes (simple cross/cone) for palm + mangrove layers.
 * Ground: 3 new deterministic layers — fallen fronds (60), flower patches (5×8),
 * beach pebbles (40).
 */
import * as THREE from 'three';
import { farcrysisInstancedMesh } from './farcrysis-instancing';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import { farcrysisTerrainHeight as terrainHeightAt, FARCRYSIS_WATER_LEVEL } from './farcrysis-terrain-authority';
import {
  FARCRYSIS_ARENA_HALF,
  FARCRYSIS_INLAND_DEPTH,
  FARCRYSIS_WATERLINE_EDGE,
  farcrysisEdgeDistance,
} from './farcrysis-shore-bands';
import { buildPalmStandInstances, type PalmPlacement } from './farcrysis-palms-enhanced';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  makeTslFoliageMaterial,
  tslAdvanceWind,
  type FoliageOptions,
} from './farcrysis-tsl-foliage';
import type { MeshStandardNodeMaterial } from 'three/webgpu';

// ---------------------------------------------------------------------------
// Wind-sway animation (module-level shared state)
// ---------------------------------------------------------------------------

// HF-359: wind moved from onBeforeCompile GLSL injection to typed TSL
// MeshStandardNodeMaterial position nodes (farcrysis-tsl-foliage.ts).
// The legacy uniform registry is kept only as a no-op shim so the
// animateVegetationWind driver contract is unchanged.


/** HF-359: wind is now TSL-side; this legacy comment kept for history. */

/**
 * Call once per frame to advance wind animation.
 * @param time Seconds elapsed (e.g. performance.now() / 1000 or a clock delta accumulator).
 */
export function animateVegetationWind(time: number): void {
  // HF-359: drive the TSL wind uniforms (the old onBeforeCompile uniforms
  // registry is gone — nothing else to update here).
  tslAdvanceWind(time);
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
 * Drop every registered LOD pair.
 *
 * The registry is module-level so `setVegetationLOD` can toggle impostors
 * without re-traversing the scene graph, but that also means a second
 * `buildVegetation` (arena reload, rematch, map switch back to farcrysis)
 * used to APPEND to the pairs from the torn-down arena. The stale entries
 * pinned disposed InstancedMeshes — and their geometries — alive, and every
 * `setVegetationLOD` call then wrote `.visible` to detached objects.
 * `buildVegetation` resets first so the registry only ever describes the
 * arena that is actually mounted.
 */
function resetLODPairs(): void {
  _lodPairs.length = 0;
}

/** Diagnostic: how many LOD pairs the live arena registered. */
export function farcrysisVegetationLodPairCount(): number {
  return _lodPairs.length;
}

/**
 * Call when camera distance changes to toggle near/far LOD impostors.
 * Threshold: dist < 80m → near (full detail); dist >= 80m → far (impostor).
 *
 * Pass 76: the old 35 m threshold was measured to the ARENA CENTRE, but a
 * player standing at a corner spawn is already ~38 m out — the entire jungle
 * swapped to crude impostor cones DURING NORMAL PLAY. In-arena cameras top
 * out around 45 m from centre, so 80 m keeps full detail for every gameplay
 * camera and reserves the impostors for menu fly-bys and review orbits.
 *
 * Non-breaking: if no LOD pairs registered (e.g. buildVegetation not called
 * yet), this is a safe no-op.
 *
 * @param dist Camera-to-arena-centre distance in metres.
 */
export function setVegetationLOD(dist: number): void {
  const useNear = dist < 80;
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

// ---------------------------------------------------------------------------
// HF-395/HF-396 placement zones — re-derived from the LIVE island extent.
//
// The Pass 69/76 extended layers were authored against the old +/-32 m island
// and still sampled CIRCULAR radii <= 31.5 m from the origin. After HF-396
// grew the island to +/-64 m (FARCRYSIS_BOUNDS), those bands stranded beach
// species up to ~30 m inland of the real shore — the audited "beach grass
// ~23 m inland of the beach". Every band below is an EDGE-DISTANCE interval
// measured inward from the square arena boundary — the SAME Chebyshev
// convention the terrain authority's HF-393 shore profile uses — so
// shoreline bands follow the square shoreline (a circular ring would sit on
// sand along the axes and inland at the corners), and every band re-derives
// automatically from the bounds + shore constants if the extent ever changes
// again. No layer carries a hand-scaled legacy radius.
// ---------------------------------------------------------------------------

// Shore arithmetic — arena half-extent, waterline edge distance, dry-land
// depth, Chebyshev edge distance — is imported from farcrysis-shore-bands:
// the ONE square-shore convention shared with the palms module, derived from
// the terrain authority's HF-393 profile.

/** Placement zones as [innerEdge, outerEdge] shore-edge intervals. */
const ZONE = {
  /** Golden sand rim: just above the waterline to the top of the beach shelf. */
  beach: Object.freeze([FARCRYSIS_WATERLINE_EDGE + 0.6, FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.16]),
  /** Beach-to-jungle transition (the flattened approach band). */
  transition: Object.freeze([FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.1, FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.34]),
  /** Jungle interior, out to near the bound wall. */
  jungle: Object.freeze([FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.3, FARCRYSIS_ARENA_HALF - MARGIN - 1]),
  /** Shallow-waterline straddle for mangroves. */
  mangrove: Object.freeze([FARCRYSIS_WATERLINE_EDGE - 3.5, FARCRYSIS_WATERLINE_EDGE + 3.5]),
  /** Wave-washed strand line for driftwood. */
  strand: Object.freeze([FARCRYSIS_WATERLINE_EDGE + 0.5, FARCRYSIS_WATERLINE_EDGE + 6]),
} as const;

/** Mid-jungle depth: halfway between the jungle zone's inner and outer
 *  shore-edge bounds. Species bands that stop partway inland derive from
 *  this instead of a hand-scaled legacy radius. */
const MID_JUNGLE_EDGE = ZONE.jungle[0] + (ZONE.jungle[1] - ZONE.jungle[0]) * 0.5;

/**
 * Edge-band scatter: uniform deterministic samples over the island square,
 * accepted when their shore-edge distance falls inside [innerEdge, outerEdge].
 * Same return shape as the legacy radius samplers. This is the shoreline
 * replacement for the pre-rescale circular radii: bands hug the SQUARE shore
 * on every azimuth, corners included.
 */
function edgeBandPositions(
  count: number,
  innerEdge: number,
  outerEdge: number,
  clearanceMargin: number,
  seed: number,
): Array<[number, number, number, number]> {
  const rng = mulberry32(seed);
  const result: Array<[number, number, number, number]> = [];
  let attempts = 0;
  const maxAttempts = count * 60;
  const span = FARCRYSIS_ARENA_HALF - MARGIN;
  while (result.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = (rng() * 2 - 1) * span;
    const z = (rng() * 2 - 1) * span;
    const edge = farcrysisEdgeDistance(x, z);
    if (edge < innerEdge || edge > outerEdge) continue;
    if (!clearOfGameplay(x, z, clearanceMargin)) continue;
    result.push([x, z, terrainHeightAt(x, z), rng() * Math.PI * 2]);
  }
  return result;
}

/** Poisson-disc variant of edgeBandPositions for non-overlapping scatter. */
function poissonEdgeBandPositions(
  count: number,
  innerEdge: number,
  outerEdge: number,
  clearanceMargin: number,
  seed: number,
  minSeparation: number,
): Array<[number, number, number, number]> {
  const rng = mulberry32(seed);
  const result: Array<[number, number, number, number]> = [];
  let attempts = 0;
  const maxAttempts = count * 90;
  const span = FARCRYSIS_ARENA_HALF - MARGIN;
  while (result.length < count && attempts < maxAttempts) {
    attempts += 1;
    const x = (rng() * 2 - 1) * span;
    const z = (rng() * 2 - 1) * span;
    const edge = farcrysisEdgeDistance(x, z);
    if (edge < innerEdge || edge > outerEdge) continue;
    if (!clearOfGameplay(x, z, clearanceMargin)) continue;
    let tooClose = false;
    for (let j = 0; j < result.length; j += 1) {
      if (Math.hypot(x - result[j][0], z - result[j][1]) < minSeparation) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    result.push([x, z, terrainHeightAt(x, z), rng() * Math.PI * 2]);
  }
  return result;
}

/**
 * Grove variant of edgeBandPositions: Poisson-separated grove centres inside
 * an edge band, then splayed stems are scattered around each centre.
 */
function groveEdgePositions(
  groves: number,
  stemsPerGrove: number,
  splay: number,
  innerEdge: number,
  outerEdge: number,
  clearanceMargin: number,
  seed: number,
): Array<[number, number, number, number, number, number]> {
  const rng = mulberry32(seed);
  const result: Array<[number, number, number, number, number, number]> = [];
  const centres = poissonEdgeBandPositions(groves, innerEdge, outerEdge, clearanceMargin, seed, splay * 3);
  for (let g = 0; g < centres.length; g += 1) {
    const [cx, cz] = centres[g];
    for (let s = 0; s < stemsPerGrove; s += 1) {
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
// Module-level stats tracker (populated during buildVegetation, read by stats fn)
// ---------------------------------------------------------------------------

interface VegeStatAccumulator {
  totalInstances: number;
  treeTypeNames: Set<string>; // only distinct tree/palm types (not ground cover)
  totalTriangles: number;
}

let _s: VegeStatAccumulator = { totalInstances: 0, treeTypeNames: new Set(), totalTriangles: 0 };

function resetStats(): void {
  _s = { totalInstances: 0, treeTypeNames: new Set(), totalTriangles: 0 };
  _vegeMaterials.length = 0;
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

/** Shorthand for PBR material matching the art-lane palette style.
 *  Every material created here is tracked so FARCRYSIS_VEGE_STATS() can
 *  report how many carry real texture maps after applyFarcrysisTextures runs. */
const _vegeMaterials: Array<THREE.MeshStandardMaterial | MeshStandardNodeMaterial> = [];

function vegeMat(color: number, roughness = 0.88, metalness = 0.04): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  _vegeMaterials.push(mat);
  return mat;
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

// HF-360: the phantom terrain model that lived here — a 3.5-8 m plateau with
// a 2-5 m cliff ring, "replicated" from a terrain module that had already
// been deleted — is gone. The real rendered ground never rose above ~2.2 m,
// so every layer seated on that model floated metres in the air. All ground
// queries now resolve through the single terrain authority (imported above
// under the old local name so the many call sites read unchanged).

// Spawn positions and patrol points (from farcrysis.ts) for clearance checks.
// HF-396: kept in sync with the 128 m island rescale in buildFarcrysis —
// update both together when spawns move.
const SPAWNS_ALL: Array<[number, number]> = [
  [-52, -52], [-44, -48], [-48, -40], [-36, -52], // team 0 NW
  [52, 52], [44, 48], [48, 40], [36, 52], // team 1 SE
];
const SPAWN_CLEAR = 5.5; // metres clearance around each spawn point

const PATROL_PTS: Array<[number, number]> = [
  [-52, -52], [-36, -40], [-24, -32], [-8, -24], [0, 0], [24, 32], [36, 40], [52, 52],
  [-40, 36], [40, -36], [-16, -48], [16, 48],
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


// ---------------------------------------------------------------------------
// Believability helpers (pass75 owner feedback: "trees read as solid blobs")
// ---------------------------------------------------------------------------

/**
 * Deterministic position-hash noise in [0, 1). Depends ONLY on the vertex
 * position, so duplicated seam vertices (split normals after toNonIndexed /
 * merge) receive identical offsets — the surface stays watertight.
 */
function positionHashNoise(x: number, y: number, z: number, salt: number): number {
  const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 94.673) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Lumpy-canopy pass: displaces each vertex radially from the geometry origin
 * by a low-amplitude multi-octave position-hash noise. Index buffers and
 * triangle counts are untouched (positions only), so the WebGL2 static
 * batcher's toNonIndexed() path sees an unchanged, in-range index set.
 */
export function lumpify(geometry: THREE.BufferGeometry, amplitude: number, salt: number): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!pos) return geometry;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-5) continue; // origin vertex — no stable radial direction
    // Two octaves keep silhouettes organic without spiky artifacts.
    const n =
      positionHashNoise(x * 1.7, y * 1.7, z * 1.7, salt) * 0.65 +
      positionHashNoise(x * 4.1, y * 4.1, z * 4.1, salt + 17) * 0.35;
    const d = (n - 0.5) * 2 * amplitude;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Per-instance colour variation scratch objects (allocated once). */
const _varyColor = new THREE.Color();

/**
 * Deterministic per-instance colour variation on an InstancedMesh via
 * instanceColor — stops plants looking cloned at ZERO extra draw calls
 * (the attribute rides the existing instanced draw).
 */
function varyInstanceColors(mesh: THREE.InstancedMesh, seed: number): void {
  if (typeof mesh.setColorAt !== 'function') return;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  const baseColor = mat && mat.color ? mat.color : new THREE.Color(0xffffff);
  const hsl = { h: 0, s: 0, l: 0 };
  baseColor.getHSL(hsl);
  const rng = mulberry32(seed);
  for (let i = 0; i < mesh.count; i += 1) {
    const h = hsl.h + (rng() - 0.5) * 0.035;                       // gentle hue drift
    const s = Math.max(0, Math.min(1, hsl.s * (0.82 + rng() * 0.36)));
    const l = Math.max(0, Math.min(1, hsl.l * (0.72 + rng() * 0.62)));
    _varyColor.setHSL(h, s, l);
    mesh.setColorAt(i, _varyColor);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

/** Stable per-mesh seed derived from the layer name (deterministic builds). */
function nameSeed(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Walk an arena group and give every vegetation InstancedMesh colour variation. */
function _applyInstanceColorVariation(group: THREE.Group): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.InstancedMesh)) return;
    if (!obj.name.startsWith('farcrysis-vege')) return;
    varyInstanceColors(obj, nameSeed(obj.name));
  });
}

/**
 * HF-396 "a little bit more jungle like": foliage rendered near-black from
 * the shaded side — dark leaf albedo (e.g. emergent crowns 0x2f5f28 is only
 * ~3% linear green) and mid-brown bark (broadleaf trunks 0x6b4e30 is ~9%
 * linear) fall to the 0.3 ambient wherever the sun-facing upper geometry
 * self-shadows them, so every tree read as a burnt silhouette in captured
 * WebGPU frames. Fake-subsurface lift (technique register row 18's
 * "subsurface-scattering approximation for backlit translucency"): a small
 * emissive of each layer's OWN hue lifts shadowed faces toward a readable
 * colour without touching the Pass 76 light rig (raising ambient/ exposure
 * washed the whole island beige — the rejected look). Canopy layers get the
 * stronger lift; trunk/stem layers a weaker one — bark must keep its natural
 * shading direction, it just must not collapse to black. Ground cover is
 * already sun-bright and stays untouched. Zero draw-call or per-frame cost —
 * a material property set once at build.
 */
const CANOPY_LIFT_PATTERN = /(canopies|crowns|midstorey-clumps)/;
const CANOPY_LIFT_SCALE = 0.22;
const TRUNK_LIFT_PATTERN = /(trunks|-stems)/;
const TRUNK_LIFT_SCALE = 0.12;

function _applyFoliageShadeLift(group: THREE.Group): void {
  group.traverse((obj) => {
    if (!(obj instanceof THREE.InstancedMesh)) return;
    if (!obj.name.startsWith('farcrysis-vege')) return;
    const mat = obj.material as THREE.MeshStandardMaterial;
    if (!mat || !mat.color) return;
    if (CANOPY_LIFT_PATTERN.test(obj.name)) {
      mat.emissive.copy(mat.color).multiplyScalar(CANOPY_LIFT_SCALE);
    } else if (TRUNK_LIFT_PATTERN.test(obj.name)) {
      mat.emissive.copy(mat.color).multiplyScalar(TRUNK_LIFT_SCALE);
    }
  });
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
  // Pass 76 consolidation: this layer used to be its OWN palm species — a
  // straight cylinder wearing a flat 3.2 m slab of "fronds". It now renders
  // through the shared enhanced-palm builder (fan crowns, tapered leaning
  // trunks, coconuts), so all three palm systems in the arena are one look.
  const count = 44; // HF-396: doubled with the island area
  // fw-vegetation-radii: beach/outer-ring species keyed to the SQUARE shore
  // via the same edge-band convention as the migrated Pass 69 layers — the
  // pre-HF-396 circular ring 38-60 stranded beach palms inland along the
  // diagonals.
  const positions = edgeBandPositions(
    count, ZONE.beach[0], ZONE.transition[1], 2.5, nameSeed('farcrysis-vege-palm-trunks'),
  );
  const placements: PalmPlacement[] = positions.map(([x, z, , angle], i) => {
    const scale = 0.85 + (i % 3) * 0.12;
    return {
      x,
      z,
      // HF-360: seat each trunk on the terrain authority.
      baseY: terrainHeightAt(x, z),
      yaw: angle + 0.3,
      lean: (i % 3 === 0 ? 0.07 : -0.06) * (Math.sin(angle) * 0.9),
      scale,
      crownSpin: angle * 1.3 + i * 0.15,
      crownTilt: ((i % 3) - 1) * 0.06,
      crownScale: scale * (0.95 + ((i * 5) % 4) * 0.04),
    };
  });
  const { trunkInstances, frondInstances, coconutInstances } =
    buildPalmStandInstances(root, placements, 'farcrysis-vege-palm');
  register(trunkInstances, 'palm');
  register(frondInstances, 'palm');
  register(coconutInstances, 'palm', { castShadow: false, receiveShadow: true });

  // --- Palm far-LOD impostor: simplified dark palm (trunk + 5 frond cards),
  // NEVER the old bare cone the audit flagged rendering as white spikes. ---
  const lodParts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [
    {
      geom: new THREE.CylinderGeometry(0.14, 0.26, 2.5, 5),
      matrix: new THREE.Matrix4().makeTranslation(0, 1.25, 0),
    },
  ];
  for (let f = 0; f < 5; f += 1) {
    const frondAngle = (f / 5) * Math.PI * 2;
    lodParts.push({
      geom: new THREE.BoxGeometry(1.7, 0.05, 0.42),
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(frondAngle) * 0.7, 2.5 - (f % 2) * 0.12, Math.sin(frondAngle) * 0.7),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, frondAngle, 0.1)),
        new THREE.Vector3(1, 1, 1),
      ),
    });
  }
  const lodGeom = mergeTransformed(lodParts);
  // Deep jungle green — distinct from the frond palette so the texture
  // classifier never mistakes the impostor for a frond surface again.
  const lodMat = vegeMat(0x2b4d26, 0.9, 0.02);
  const lodMesh = farcrysisInstancedMesh(lodGeom, lodMat, placements.length);
  lodMesh.name = 'farcrysis-vege-palm-imposters';
  lodMesh.castShadow = false;
  lodMesh.receiveShadow = true;
  lodMesh.userData.farcrysisArt = true;

  const lodM = new THREE.Matrix4();
  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];
    lodM.compose(
      new THREE.Vector3(placement.x, placement.baseY, placement.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placement.crownSpin, 0)),
      new THREE.Vector3(placement.scale, placement.scale, placement.scale),
    );
    lodMesh.setMatrixAt(i, lodM);
  }
  lodMesh.instanceMatrix.needsUpdate = true;
  lodMesh.computeBoundingSphere();

  registerLODPair([trunkInstances, frondInstances, coconutInstances], [lodMesh]);
  root.add(lodMesh);
}

// ---------------------------------------------------------------------------
// 2. Broadleaf jungle trees — thick trunk + wide canopy (inland)
// ---------------------------------------------------------------------------

function addBroadleafTrees(root: THREE.Group): void {
  const count = 56; // HF-396: doubled with the island area
  const trunkGeom = new THREE.CylinderGeometry(0.22, 0.44, 2.6, 10);
  const canopyGeom = new THREE.SphereGeometry(1.0, 10, 6);
  // Believability: broadleaf canopies stop reading as smooth balls.
  lumpify(canopyGeom, 0.2, 0x0b1a);

  const trunks = farcrysisInstancedMesh(trunkGeom, vegeMat(0x6b4e30, 0.92, 0.02), count);
  trunks.name = 'farcrysis-vege-broadleaf-trunks';
  const canopies = farcrysisInstancedMesh(canopyGeom, vegeMat(0x4a8038, 0.88, 0.01), count);
  canopies.name = 'farcrysis-vege-broadleaf-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 3.5, nameSeed('farcrysis-vege-broadleaf-trunks'));

  for (let i = 0; i < count; i += 1) {
    const [x, z, , angle] = positions[i];
    // HF-360: seated on the terrain authority (was flat baseY=1.3).
    const baseY = terrainHeightAt(x, z) + 1.3;
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
// 3. Traveller's fan palms — upright leaf fans on short trunks (mid ring)
//
// Pass 76: this slot used to be CONIFER cones — an alpine species that has no
// business on a tropical island (the audit's "wrong biome" P1). Replaced with
// a traveller's-palm archetype: a short trunk with a single plane of six
// upright oval leaf cards fanned ±72°, which is unmistakably tropical.
// ---------------------------------------------------------------------------

function addFanPalms(root: THREE.Group): void {
  const count = 40; // HF-396: doubled with the island area

  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [
    {
      geom: new THREE.CylinderGeometry(0.09, 0.15, 1.3, 7),
      matrix: new THREE.Matrix4().makeTranslation(0, 0.65, 0),
    },
  ];
  for (let leaf = 0; leaf < 6; leaf += 1) {
    // Fan the leaves in ONE plane (traveller's palm signature): -72°..+72°
    const fanAngle = (leaf / 5 - 0.5) * 2.4;
    parts.push({
      geom: new THREE.BoxGeometry(0.3, 1.7, 0.04),
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(fanAngle) * 0.55, 1.3 + Math.cos(fanAngle) * 0.8, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -fanAngle)),
        new THREE.Vector3(1, 1, 1),
      ),
    });
  }
  const fanGeom = mergeTransformed(parts);

  const fans = farcrysisInstancedMesh(fanGeom, vegeMat(0x2f6b2b, 0.88, 0.02), count);
  fans.name = 'farcrysis-vege-fan-palms';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], MID_JUNGLE_EDGE, 2.0, nameSeed('farcrysis-vege-fan-palms'));

  for (let i = 0; i < count; i += 1) {
    const [x, z, , angle] = positions[i];
    const s = 0.75 + (i % 5) * 0.14;
    matrix.compose(
      // HF-360: seated on the terrain authority (base-origin geometry).
      new THREE.Vector3(x, terrainHeightAt(x, z), z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(s, 0.85 + (i % 4) * 0.1, s),
    );
    fans.setMatrixAt(i, matrix);
  }

  fans.instanceMatrix.needsUpdate = true;
  fans.computeBoundingSphere();
  root.add(register(fans, 'fan-palm'));
}

// ---------------------------------------------------------------------------
// 4. Banana plants — short trunk + broad flat leaves (inland clusters)
// ---------------------------------------------------------------------------

function addBananaPlants(root: THREE.Group): void {
  const plantCount = 28; // HF-396: doubled with the island area
  const leavesPerPlant = 4;
  const leafCount = plantCount * leavesPerPlant;

  const trunkGeom = new THREE.CylinderGeometry(0.1, 0.2, 1.6, 7);
  const leafGeom = new THREE.BoxGeometry(2.2, 0.07, 0.65);

  const trunks = farcrysisInstancedMesh(trunkGeom, vegeMat(0x7a9a38, 0.85, 0.02), plantCount);
  trunks.name = 'farcrysis-vege-banana-trunks';
  const leaves = farcrysisInstancedMesh(leafGeom, vegeMat(0x4d8c2a, 0.82, 0.02), leafCount);
  leaves.name = 'farcrysis-vege-banana-leaves';

  const tMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = edgeBandPositions(plantCount, ZONE.jungle[0], MID_JUNGLE_EDGE, 2.0, nameSeed('farcrysis-vege-banana-trunks'));

  for (let p = 0; p < plantCount; p += 1) {
    const [x, z, , baseAngle] = positions[p];
    // HF-360: seated on the terrain authority (was flat baseY=0.8).
    const baseY = terrainHeightAt(x, z) + 0.8;
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
  const clusters = 14; // HF-396: doubled with the island area
  const stemsPerCluster = 5;
  const count = clusters * stemsPerCluster;

  const stemGeom = new THREE.CylinderGeometry(0.05, 0.07, 2.8, 6);

  const stems = farcrysisInstancedMesh(stemGeom, vegeMat(0x6a8a3a, 0.84, 0.03), count);
  stems.name = 'farcrysis-vege-bamboo-stems';

  const matrix = new THREE.Matrix4();
  const clusterCenters = edgeBandPositions(clusters, ZONE.jungle[0], ZONE.jungle[1], 3.0, nameSeed('farcrysis-vege-bamboo-stems'));

  for (let c = 0; c < clusters; c += 1) {
    const [cx, cz, , ca] = clusterCenters[c];
    for (let s = 0; s < stemsPerCluster; s += 1) {
      const offsetAngle = (s / stemsPerCluster) * Math.PI * 2 + ca;
      const offsetRadius = 0.25 + (s % 3) * 0.18;
      const sx = cx + Math.cos(offsetAngle) * offsetRadius;
      const sz = cz + Math.sin(offsetAngle) * offsetRadius;
      const heightScale = 0.85 + (s % 4) * 0.1;
      const idx = c * stemsPerCluster + s;

      matrix.compose(
        // HF-360: seated on the terrain authority (was flat ground).
        new THREE.Vector3(sx, terrainHeightAt(sx, sz) + 1.4 * heightScale, sz),
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
  const count = 20; // HF-396: doubled with the island area
  const trunkGeom = new THREE.CylinderGeometry(0.14, 0.24, 2.4, 7);

  const trunks = farcrysisInstancedMesh(trunkGeom, vegeMat(0x6e6258, 0.94, 0.05), count);
  trunks.name = 'farcrysis-vege-dead-trunks';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], ZONE.jungle[1], 3.0, nameSeed('farcrysis-vege-dead-trunks'));

  for (let i = 0; i < count; i += 1) {
    const [x, z, , angle] = positions[i];
    // Lean the dead tree significantly
    const leanAngle = 0.3 + (i % 4) * 0.15;
    const leanDir = angle + (i % 3) * 0.6;
    const s = 0.7 + (i % 3) * 0.2;

    matrix.compose(
      // HF-360: seated on the terrain authority (was flat y=1.2).
      new THREE.Vector3(x, terrainHeightAt(x, z) + 1.2, z),
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
  const count = 70; // HF-396: doubled with the island area
  const fernGeom = new THREE.BoxGeometry(0.35, 1.2, 0.12);

  const ferns = farcrysisInstancedMesh(fernGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  ferns.name = 'farcrysis-vege-ferns';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], MID_JUNGLE_EDGE, 1.2, nameSeed('farcrysis-vege-ferns'));

  for (let i = 0; i < count; i += 1) {
    const [x, z, , angle] = positions[i];
    const s = 0.75 + (i % 5) * 0.16;
    matrix.compose(
      // HF-360: seated on the terrain authority (was flat y=0.6).
      new THREE.Vector3(x, terrainHeightAt(x, z) + 0.6, z),
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
  const count = 90; // HF-396: doubled with the island area
  const grassGeom = new THREE.ConeGeometry(0.12, 0.45, 5, 1);

  const grass = farcrysisInstancedMesh(grassGeom, vegeMat(0x4d7a36, 0.9, 0.01), count);
  grass.name = 'farcrysis-vege-grass-tufts';

  const matrix = new THREE.Matrix4();
  // Grass everywhere — one full-island shore-edge band (beach to jungle).
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.jungle[1], 0.5, nameSeed('farcrysis-vege-grass-tufts'));

  for (let i = 0; i < count; i += 1) {
    const [x, z] = positions[i];
    const s = 0.6 + (i % 6) * 0.1;
    matrix.compose(
      // HF-360: seated on the terrain authority (was flat y=0.22).
      new THREE.Vector3(x, terrainHeightAt(x, z) + 0.22, z),
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
  const count = 56; // HF-396: doubled with the island area
  const bushGeom = new THREE.IcosahedronGeometry(0.7, 1);
  // Believability: irregular bush silhouette.
  lumpify(bushGeom, 0.12, 0x0b05);

  const bushes = farcrysisInstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.9, 0.01), count);
  bushes.name = 'farcrysis-vege-bushes';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 1.5, nameSeed('farcrysis-vege-bushes'));

  for (let i = 0; i < count; i += 1) {
    const [x, z, , angle] = positions[i];
    const s = 0.7 + (i % 5) * 0.14;
    matrix.compose(
      // HF-360: seated on the terrain authority (was flat y=0.45).
      new THREE.Vector3(x, terrainHeightAt(x, z) + 0.45, z),
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
  const count = 36; // HF-396: doubled with the island area
  // Thin, long cylinder placed at an angle — reads as a hanging vine
  const vineGeom = new THREE.CylinderGeometry(0.03, 0.04, 2.4, 6);

  const vines = farcrysisInstancedMesh(vineGeom, vegeMat(0x3d6e30, 0.82, 0.02), count);
  vines.name = 'farcrysis-vege-vines';

  const matrix = new THREE.Matrix4();
  // Place vines near tree positions — use mid-ring scatter
  const positions = edgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 2.0, nameSeed('farcrysis-vege-vines'));

  for (let i = 0; i < count; i += 1) {
    const [x, z, , angle] = positions[i];
    const lean = 0.5 + (i % 3) * 0.2; // diagonal lean
    const twist = angle + (i % 5) * 0.4;
    const s = 0.6 + (i % 4) * 0.15;
    matrix.compose(
      // HF-360: seated on the terrain authority (was flat ground).
      new THREE.Vector3(x, terrainHeightAt(x, z) + 1.0 + (i % 3) * 0.6, z),
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
  // Believability: break up the smooth two-sphere blob silhouette.
  lumpify(kapokCanopyGeom, 0.22, 0x4b0b);

  const trunks = farcrysisInstancedMesh(kapokTrunkGeom, vegeMat(0x7a5e3e, 0.9, 0.03), count);
  trunks.name = 'farcrysis-vege-kapok-trunks';
  const canopies = farcrysisInstancedMesh(kapokCanopyGeom, vegeMat(0x498540, 0.86, 0.01), count);
  canopies.name = 'farcrysis-vege-kapok-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 3.5, SEED);
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

  const palms = farcrysisInstancedMesh(
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

  const cTrunks = farcrysisInstancedMesh(coconutTrunkGeom, vegeMat(FARCRYSIS_ART_FEEL.palmTrunk, 0.87, 0.03), count);
  cTrunks.name = 'farcrysis-vege-coconut-trunks';
  const cFronds = farcrysisInstancedMesh(coconutFrondGeom, vegeMat(FARCRYSIS_ART_FEEL.palmFrond, 0.83, 0.02), count);
  cFronds.name = 'farcrysis-vege-coconut-fronds';

  const tMat = new THREE.Matrix4();
  const fMat = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.transition[1], 3.5, SEED);
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

  const vines = farcrysisInstancedMesh(vineGeom, vegeMat(0x3d6e30, 0.8, 0.02), count);
  vines.name = 'farcrysis-vege-canopy-vines';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 2.5, SEED);
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

  const litter = farcrysisInstancedMesh(litterGeom, vegeMat(0x6b5230, 0.92, 0.01), count);
  litter.name = 'farcrysis-vege-leaf-litter';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], ZONE.jungle[1], 0.5, SEED);
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

  const grass = farcrysisInstancedMesh(grassGeom, vegeMat(0x4d7a36, 0.88, 0.01), count);
  grass.name = 'farcrysis-vege-dense-grass';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.jungle[1], 0.5, SEED);
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

  const flowers = farcrysisInstancedMesh(flowerAccentGeom, vegeMat(0xd8542f, 0.72, 0.03), count);
  flowers.name = 'farcrysis-vege-flowering-accents';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], ZONE.transition[1], 3.0, SEED);
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
  // Believability: lobed undergrowth shrubs get an irregular outline too.
  lumpify(shrubClusterGeom, 0.12, 0x38a8);

  const shrubs = farcrysisInstancedMesh(shrubClusterGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.88, 0.02), count);
  shrubs.name = 'farcrysis-vege-undergrowth-shrubs';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], ZONE.transition[1], 3.0, SEED);
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

  const ferns = farcrysisInstancedMesh(fernClusterGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.85, 0.02), count);
  ferns.name = 'farcrysis-vege-understory-ferns';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], ZONE.transition[1], 2.0, SEED);
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
  // Believability: lumpy mangrove leaf clumps instead of smooth spheres.
  lumpify(mangroveCanopyGeom, 0.16, 0x9a46);

  const trunks = farcrysisInstancedMesh(mangroveTrunkGeom, vegeMat(0x5a4232, 0.9, 0.04), count);
  trunks.name = 'farcrysis-vege-mangrove-trunks';
  const canopies = farcrysisInstancedMesh(mangroveCanopyGeom, vegeMat(0x3d6b38, 0.88, 0.02), count);
  canopies.name = 'farcrysis-vege-mangrove-canopies';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const positions = poissonEdgeBandPositions(count, ZONE.mangrove[0], ZONE.mangrove[1], 2.5, SEED, 3.5);
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

  // --- Mangrove far-LOD impostor: a lumpy canopy blob on a stub trunk.
  // Pass 76: was a bare 4.5 m cone — a pine silhouette on a tropical shore.
  const lodCount = count;
  const lodGeom = mergeTransformed([
    {
      geom: new THREE.CylinderGeometry(0.12, 0.2, 1.6, 5),
      matrix: new THREE.Matrix4().makeTranslation(0, -1.4, 0),
    },
    {
      geom: lumpify(new THREE.IcosahedronGeometry(1.25, 1), 0.28, 0x9a47),
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 0.72, 1),
      ),
    },
  ]);
  const lodMat = vegeMat(0x3d6b38, 0.88, 0.02);
  const lodMesh = farcrysisInstancedMesh(lodGeom, lodMat, lodCount);
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

  const stems = farcrysisInstancedMesh(stemGeom, vegeMat(0x8a9a3a, 0.82, 0.03), count);
  stems.name = 'farcrysis-vege-bamboo-grove-stems';

  const matrix = new THREE.Matrix4();
  const SEED = 0xa860_0091;
  const rng = mulberry32(SEED);

  const positions = groveEdgePositions(groves, stemsPerGrove, 2.2, ZONE.jungle[0], ZONE.jungle[1], 3.5, SEED);

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
  // Believability: irregular flowering-bush silhouette.
  lumpify(bushGeom, 0.12, 0x710a);

  // Bloom head: small emissive sphere
  const bloomGeom = new THREE.IcosahedronGeometry(0.1, 1);

  const bushes = farcrysisInstancedMesh(bushGeom, vegeMat(FARCRYSIS_ART_FEEL.bushGreen, 0.88, 0.01), count);
  bushes.name = 'farcrysis-vege-flowering-bushes';

  // Emissive bloom material — warm magenta-pink glow
  const bloomMat = new THREE.MeshStandardMaterial({
    color: 0xff5a9e,
    roughness: 0.5,
    metalness: 0.05,
    emissive: 0xff3070,
    emissiveIntensity: 0.6,
  });
  const blooms = farcrysisInstancedMesh(bloomGeom, bloomMat, bloomCount);
  blooms.name = 'farcrysis-vege-flowering-blooms';

  const bMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = poissonEdgeBandPositions(count, ZONE.transition[0], ZONE.transition[1], 3.0, SEED, 2.8);
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

  const clusters = farcrysisInstancedMesh(vineClusterGeom, vegeMat(0x3d6e30, 0.8, 0.02), count);
  clusters.name = 'farcrysis-vege-jungle-vine-clusters';

  const matrix = new THREE.Matrix4();
  const positions = poissonEdgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 2.5, SEED, 2.0);
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

  const grass = farcrysisInstancedMesh(grassGeom, vegeMat(0xb8a04a, 0.86, 0.02), count);
  grass.name = 'farcrysis-vege-beach-grass';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.beach[1], 0.5, SEED);
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

  const ferns = farcrysisInstancedMesh(largeFernGeom, vegeMat(FARCRYSIS_ART_FEEL.fernGreen, 0.84, 0.02), count);
  ferns.name = 'farcrysis-vege-large-ferns';

  const matrix = new THREE.Matrix4();
  // Place the majority through the transition band (the old cliff ring, now
  // derived from the live extent), a handful near the cave at its CURRENT
  // authored position [52, 32] (farcrysis.ts cave colliders).
  const cliffCount = Math.floor(count * 0.85);
  const cliffPositions = poissonEdgeBandPositions(cliffCount, ZONE.transition[0], ZONE.jungle[0] + 10, 2.0, SEED, 1.8);
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
  // Cave-adjacent ferns: scatter a few near the CURRENT cave entrance
  // [52, 32] (HF-396 rescale moved it from the pre-rescale [26, 16]).
  const caveCount = count - cliffPositions.length;
  const caveRng = mulberry32(SEED + 99);
  for (let i = 0; i < caveCount; i++) {
    const cx = 52 + (caveRng() - 0.5) * 6;
    const cz = 32 + (caveRng() - 0.5) * 5;
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

  const fronds = farcrysisInstancedMesh(frondGeom, vegeMat(0x8b6b3a, 0.9, 0.01), count);
  fronds.name = 'farcrysis-vege-fallen-fronds'; // named so shore audits attribute this layer

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.jungle[1], 0.8, SEED);
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

  const flowers = farcrysisInstancedMesh(flowerGeom, flowerMat, count);
  flowers.name = 'farcrysis-vege-flower-patches';

  const matrix = new THREE.Matrix4();
  // Generate 5 patch centres with Poisson separation
  const patchCenters = poissonEdgeBandPositions(patches, ZONE.jungle[0], ZONE.jungle[1], 2.5, SEED, 5.0);

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

  const pebbles = farcrysisInstancedMesh(pebbleGeom, vegeMat(0xb8a890, 0.78, 0.08), count);
  pebbles.name = 'farcrysis-vege-beach-pebbles';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.beach[1], 0.3, SEED);
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

  const trunks = farcrysisInstancedMesh(trunkCyl, vegeMat(0x6b4e30, 0.9, 0.03), count);
  trunks.name = 'farcrysis-vege-cycad-trunks';
  const leaves = farcrysisInstancedMesh(cycadLeafGeom, vegeMat(0x3a7a34, 0.84, 0.02), count);
  leaves.name = 'farcrysis-vege-cycad-leaves';

  const tMat = new THREE.Matrix4();
  const lMat = new THREE.Matrix4();
  const positions = poissonEdgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 2.5, SEED, 2.4);
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
  // Believability: bloom-tree crown silhouette broken up.
  lumpify(canopyGeom, 0.18, 0x1a4f);

  // Blossom head: small detail-0 icosahedron (20 tris)
  const blossomGeom = new THREE.IcosahedronGeometry(0.12, 0);

  const trunks = farcrysisInstancedMesh(trunkGeom, vegeMat(0x6d5438, 0.9, 0.03), count);
  trunks.name = 'farcrysis-vege-bloom-trunks';
  const canopies = farcrysisInstancedMesh(canopyGeom, vegeMat(0x428a38, 0.86, 0.01), count);
  canopies.name = 'farcrysis-vege-bloom-canopies';
  const blossoms = farcrysisInstancedMesh(blossomGeom, vegeMat(0xe8602a, 0.6, 0.02), bloomCount);
  blossoms.name = 'farcrysis-vege-bloom-blossoms';

  const tMat = new THREE.Matrix4();
  const cMat = new THREE.Matrix4();
  const bMat = new THREE.Matrix4();
  const positions = poissonEdgeBandPositions(count, ZONE.jungle[0], MID_JUNGLE_EDGE, 3.5, SEED, 4.5);
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

  const bushes = farcrysisInstancedMesh(scrubGeom, vegeMat(0x4c7a38, 0.88, 0.02), count);
  bushes.name = 'farcrysis-vege-beach-scrub-bushes';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.beach[1], 1.5, SEED);
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

  const patches = farcrysisInstancedMesh(patchGeom, vegeMat(0x4d8a36, 0.88, 0.01), count);
  patches.name = 'farcrysis-vege-grass-patches';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.beach[0], ZONE.jungle[1], 0.5, SEED);
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

  const twigs = farcrysisInstancedMesh(twigGeom, vegeMat(0x6b5230, 0.92, 0.01), count);
  twigs.name = 'farcrysis-vege-twigs';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.transition[0], ZONE.jungle[1], 0.5, SEED);
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

  const rocks = farcrysisInstancedMesh(rockGeom, vegeMat(0x6e6a64, 0.85, 0.06), count);
  rocks.name = 'farcrysis-vege-small-rocks';

  const matrix = new THREE.Matrix4();
  const positions = poissonEdgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 1.0, SEED, 1.5);
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

// HF-359/HF-363: layers that should sway, grouped by dapple strength.
// Canopy leaves get subtle transmittance dapple; undergrowth medium;
// ground-level litter/grass strong (sun breaks through to the floor there).
const WIND_LAYER_DAPPLE: Array<[string, number]> = [
  // strong ground dapple
  ['farcrysis-vege-undergrowth-carpet', 0.85],
  ['farcrysis-vege-midstorey-clumps', 0.5],
  ['farcrysis-vege-emergent', 0.28],
  ['farcrysis-vege-leaf-litter', 0.85],
  ['farcrysis-vege-fallen-fronds', 0.8],
  ['farcrysis-vege-grass-tufts', 0.75],
  ['farcrysis-vege-dense-grass', 0.75],
  ['farcrysis-vege-beach-grass', 0.75],
  ['farcrysis-vege-grass-patches', 0.7],
  ['farcrysis-vege-flower-patches', 0.6],
  // medium undergrowth
  ['farcrysis-vege-ferns', 0.55],
  ['farcrysis-vege-large-ferns', 0.55],
  ['farcrysis-vege-understory-ferns', 0.55],
  ['farcrysis-vege-bushes', 0.45],
  ['farcrysis-vege-flowering-bushes', 0.45],
  ['farcrysis-vege-beach-scrub', 0.4],
  ['farcrysis-vege-cycad-leaves', 0.4],
  ['farcrysis-vege-banana-leaves', 0.4],
  // subtle canopy dapple
  ['farcrysis-vege-palm-fronds', 0.3],
  ['farcrysis-vege-coconut-fronds', 0.3],
  ['farcrysis-vege-canopy-vines', 0.25],
  ['farcrysis-vege-jungle-vine-clusters', 0.25],
  ['farcrysis-vege-vines', 0.25],
];

function dappleFor(name: string): number {
  for (const [n, d] of WIND_LAYER_DAPPLE) {
    if (name === n || name.startsWith(n)) return d;
  }
  return 0.35; // unnamed flexible foliage gets a gentle default
}

/**
 * HF-359/HF-363: convert every named foliage InstancedMesh's material to a
 * typed-TSL MeshStandardNodeMaterial carrying per-instance phase-offset wind
 * (positionNode) and analytic canopy-transmittance dapple (colorNode).
 * Replaces the old no-op onBeforeCompile shim walk.
 */
function _applyTslFoliage(scene: THREE.Group): void {
  // pass74-arena-boot-smoke: WebGLRenderer cannot compile MeshStandardNodeMaterial (TSL).
  // On WebGL2 compat paths, retain the authored MeshStandardMaterial so WebGLRenderer
  // compiles clean without NodeMaterial / resolveIncludes errors.
  if (typeof document !== 'undefined' && document.documentElement?.dataset.renderBackend === 'webgl2') {
    return;
  }
  for (let i = 0; i < scene.children.length; i++) {
    const child = scene.children[i];
    if (!(child instanceof THREE.InstancedMesh)) continue;

    const std = child.material as THREE.MeshStandardMaterial;
    if (!(std && std.isMeshStandardMaterial)) continue;
    child.geometry.computeBoundingBox();
    const bb = child.geometry.boundingBox;
    const height = Math.max(0.5, (bb ? bb.max.y - bb.min.y : 1));

    const opts: FoliageOptions = {
      color: std.color.getHex(),
      roughness: std.roughness,
      metalness: std.metalness,
      dapple: dappleFor(child.name),
      // Amplitude scales with card size so big fronds move more than blades.
      swayAmount: Math.min(0.09, 0.02 + height * 0.02),
      swayHeight: height,
      doubleSided: true,
    };
    const tslMat = makeTslFoliageMaterial(opts);
    // Keep the FARCRYSIS_VEGE_STATS textureCount ledger truthful: the TSL
    // material REPLACES the authored standard material as the mesh's live
    // material, so the tracked slot must follow the replacement. Without this
    // the wiring proof counts orphaned originals that never receive maps.
    const trackedAt = _vegeMaterials.indexOf(std);
    if (trackedAt !== -1) _vegeMaterials[trackedAt] = tslMat;
    child.material = tslMat;
  }
}


// ---------------------------------------------------------------------------
// HF-363 density/species expansion (reference-technique, independently
// authored): one bent leaf-card primitive + one swept-tube primitive cover two
// whole new species families. Both are InstancedMesh with per-profile-safe
// counts; presentation only, no colliders added.
// ---------------------------------------------------------------------------

/**
 * HF-363 species #34 — "heliconia clumps": broad bent leaf cards (curved via
 * multi-segment bend baked into merged geometry) rising from a tiny stem.
 * Inland undergrowth filler; strong dapple + wind apply automatically.
 */
function addHeliconiaClumps(root: THREE.Group): void {
  const count = 70;
  const SEED = 0x5f11_c7a2;

  // Bent leaf card: three stacked segments, each rotated ~18° more than the
  // last so the blade arcs over like a real heliconia leaf.
  const seg = new THREE.BoxGeometry(0.16, 0.55, 0.02);
  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let sgi = 0; sgi < 3; sgi++) {
    const bend = sgi * 0.32;
    parts.push({
      geom: seg,
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(bend) * 0.28, 0.24 + Math.cos(bend) * 0.26, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-bend, 0, 0)),
        new THREE.Vector3(1 + sgi * 0.25, 1, 1),
      ),
    });
  }
  const clumpGeom = mergeTransformed(parts);

  const clumps = farcrysisInstancedMesh(clumpGeom, vegeMat(0x3f7a2c, 0.84, 0.02), count);
  clumps.name = 'farcrysis-vege-heliconia-clumps';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.jungle[0], ZONE.jungle[1], 1.6, SEED);
  const rng = mulberry32(SEED + 9);
  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    const s = 0.65 + rng() * 0.75;
    matrix.compose(
      new THREE.Vector3(x, groundY + 0.02, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.25, angle + rng() * Math.PI * 2, rng() * 0.25)),
      new THREE.Vector3(s, s * (0.85 + rng() * 0.5), s),
    );
    clumps.setMatrixAt(i, matrix);
  }
  clumps.instanceMatrix.needsUpdate = true;
  clumps.computeBoundingSphere();
  root.add(register(clumps, 'heliconia', { castShadow: false, receiveShadow: true }));
}

/**
 * Pass 76 species #36 — dense leaf-card undergrowth: clumps of three arched
 * cards at ~3.5x the density of the old box shrubs. This is the layer that
 * fills the space between the ground litter and the waist-high shrubs, which
 * is where the Far Cry jungles get their depth.
 */
function addLeafCardUndergrowth(root: THREE.Group): void {
  const clumps = 110;
  const cardsPerClump = 3;
  const count = clumps * cardsPerClump;
  const SEED = 0x76c4_ad05;

  const cardGeom = new THREE.BoxGeometry(0.5, 0.72, 0.03);
  cardGeom.translate(0, 0.36, 0); // root pivot so tilts arch outward

  const cardMat = vegeMat(0x2f6428, 0.86, 0.02);
  cardMat.side = THREE.DoubleSide;
  const cards = farcrysisInstancedMesh(cardGeom, cardMat, count);
  cards.name = 'farcrysis-vege-undergrowth-cards';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(clumps, ZONE.transition[0], ZONE.jungle[1], 1.2, SEED);
  const rng = mulberry32(SEED + 3);

  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY, angle] = positions[i];
    for (let card = 0; card < cardsPerClump; card += 1) {
      const cardYaw = angle + (card / cardsPerClump) * Math.PI * 2 + rng() * 0.7;
      const spread = 0.08 + rng() * 0.22;
      const s = 0.7 + rng() * 0.75;
      matrix.compose(
        new THREE.Vector3(x + Math.cos(cardYaw) * spread, groundY + 0.02, z + Math.sin(cardYaw) * spread),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28 + rng() * 0.3, cardYaw, (rng() - 0.5) * 0.2)),
        new THREE.Vector3(s, s * (0.85 + rng() * 0.4), 1),
      );
      cards.setMatrixAt(i * cardsPerClump + card, matrix);
    }
  }

  cards.instanceMatrix.needsUpdate = true;
  cards.computeBoundingSphere();
  root.add(register(cards, undefined, { castShadow: false, receiveShadow: true }));
}

/**
 * HF-363 ground scatter #35 — "driftwood logs": weathered swept tubes washed
 * up along the outer beach ring, breaking up flat sand. No collision — pure
 * dressing (walk-through unchanged).
 */
function addDriftwoodLogs(root: THREE.Group): void {
  const count = 26;
  const SEED = 0x2ad9_40e1;

  // Swept tube: slightly tapered cylinder laid on its side with a gentle bow.
  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  for (let sgi = 0; sgi < 4; sgi++) {
    const t0 = sgi / 4;
    const bow = Math.sin(t0 * Math.PI) * 0.09;
    parts.push({
      geom: new THREE.CylinderGeometry(0.09 - t0 * 0.03, 0.1 - t0 * 0.03, 0.42, 6),
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3((t0 - 0.375) * 1.7, bow, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 + (t0 - 0.5) * 0.22)),
        new THREE.Vector3(1, 1, 1),
      ),
    });
  }
  const logGeom = mergeTransformed(parts);

  const logs = farcrysisInstancedMesh(logGeom, vegeMat(0x8a7a64, 0.95, 0.01), count);
  logs.name = 'farcrysis-vege-driftwood-logs';

  const matrix = new THREE.Matrix4();
  const positions = edgeBandPositions(count, ZONE.strand[0], ZONE.strand[1], 1.4, SEED); // HF-396 square-shore strand
  const rng = mulberry32(SEED + 4);
  for (let i = 0; i < positions.length; i++) {
    const [x, z, groundY] = positions[i];
    matrix.compose(
      new THREE.Vector3(x, groundY + 0.08, z),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rng() * 0.15 - 0.07, rng() * Math.PI * 2, rng() * 0.12 - 0.06),
      ),
      new THREE.Vector3(0.8 + rng() * 0.9, 0.8 + rng() * 0.6, 0.8 + rng() * 0.7),
    );
    logs.setMatrixAt(i, matrix);
  }
  logs.instanceMatrix.needsUpdate = true;
  logs.computeBoundingSphere();
  root.add(register(logs, undefined, { castShadow: false, receiveShadow: true }));
}

// ===========================================================================
// HF-396/HF-398 LAYERED JUNGLE — emergent canopy / midstorey / undergrowth
// ===========================================================================
//
// Owner bar (HF-398): cadle.gg — "the grass, trees, mountains are
// incredible". The grass field and island rescale are owned by the
// HF-396 water/grass lane (farcrysis-grass-field.ts); this section closes
// the remaining STRUCTURAL gaps in the jungle's vertical profile:
//
//   #37 EMERGENT CANOPY — 10-16 m giants rising above the existing broadleaf
//       canopy, giving the skyline the tall layered jungle read.
//   #38 MIDSTOREY — eye-level broadleaf clumps clustered RELATIONALLY under
//       the emergent crowns (arXiv 2608.17975 relational placement), so the
//       tiers connect instead of reading as thrown-together scatter (HF-395).
//   #39 UNDERGROWTH CARPET — dense low leaf-card filler between the grass
//       field and the midstorey, completing every height band.
//
// Every placement here is terrain-constrained through the single terrain
// authority: seated on farcrysisTerrainHeight, REJECTED on slopes steeper
// than the layer threshold and below the authored waterline + margin. All
// randomness is seeded mulberry32 — deterministic, never Math.random.
// Presentation only: no colliders, no raycast/shot-surface registration.

/**
 * Terrain slope (rise/run) at (x, z) via central differences on the one
 * terrain authority. Pure and deterministic; exported for contract tests.
 */
export function farcrysisTerrainSlope(x: number, z: number): number {
  const e = 0.35;
  const dx = (terrainHeightAt(x + e, z) - terrainHeightAt(x - e, z)) / (2 * e);
  const dz = (terrainHeightAt(x, z + e) - terrainHeightAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

interface TerrainFitConstraints {
  /** Reject sites steeper than this rise/run. */
  maxSlope: number;
  /** Reject sites less than this far ABOVE the authored waterline (metres). */
  minAboveWater: number;
}

function seatsOnTerrain(x: number, z: number, fit: TerrainFitConstraints): boolean {
  if (terrainHeightAt(x, z) < FARCRYSIS_WATER_LEVEL + fit.minAboveWater) return false;
  return farcrysisTerrainSlope(x, z) <= fit.maxSlope;
}

/**
 * Slope/height-constrained jittered-grid scatter across the FULL island disc.
 * The older species layers scatter annular rings; the ground/understorey
 * tiers here must blanket the whole 128 m playfield uniformly, then any site
 * failing bounds, gameplay clearance, spawn clearance, the optional clump
 * gate, or the terrain-fit constraints is rejected.
 */
function constrainedScatter(
  count: number,
  seed: number,
  opts: {
    margin: number;
    fit: TerrainFitConstraints;
    /** Clump-noise salt + threshold: accept only where noise >= threshold. */
    clumpSalt?: number;
    clumpThreshold?: number;
    /** Metres kept clear around each spawn point (small dressing layers). */
    spawnClearance?: number;
    /** Candidate grid multiplier; default 2.5. Raise for strict fits. */
    oversample?: number;
  },
): Array<[number, number, number, number]> {
  const rng = mulberry32(seed);
  const out: Array<[number, number, number, number]> = [];
  // Oversample (default 2.5x) — slope/water/clump/clearance rejections cull
  // the rest. Sparse strict-fit layers pass a higher multiplier so enough
  // candidates survive to reach `count`.
  const oversample = opts.oversample ?? 2.5;
  const span = FARCRYSIS_ARENA_HALF - MARGIN;
  const step = Math.sqrt(((2 * span) ** 2) / (count * oversample));
  for (let gx = -span; gx <= span && out.length < count; gx += step) {
    for (let gz = -span; gz <= span && out.length < count; gz += step) {
      const x = gx + (rng() - 0.5) * step;
      const z = gz + (rng() - 0.5) * step;
      if (x < BOUNDS.minX + MARGIN || x > BOUNDS.maxX - MARGIN) continue;
      if (z < BOUNDS.minZ + MARGIN || z > BOUNDS.maxZ - MARGIN) continue;
      if (!clearOfGameplay(x, z, opts.margin)) continue;
      if (opts.spawnClearance !== undefined) {
        let nearSpawn = false;
        for (const [sx, sz] of SPAWNS_ALL) {
          if (Math.hypot(x - sx, z - sz) < opts.spawnClearance) { nearSpawn = true; break; }
        }
        if (nearSpawn) continue;
      }
      if (
        opts.clumpSalt !== undefined && opts.clumpThreshold !== undefined
        && positionHashNoise(x * 0.13, 0, z * 0.13, opts.clumpSalt) < opts.clumpThreshold
      ) continue;
      if (!seatsOnTerrain(x, z, opts.fit)) continue;
      out.push([x, z, terrainHeightAt(x, z), rng() * Math.PI * 2]);
    }
  }
  return out;
}

/** One bent leaf card: tapered strip arching along local +X. Presentation. */
function bentLeafCard(height: number, width: number, arch: number): THREE.BufferGeometry {
  const segments = 4;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const y = t * height;
    const cx = arch * t * t; // quadratic lean
    if (i === segments) {
      positions.push(cx, y, 0); // single tip vertex
      uvs.push(0.5, 1);
      break;
    }
    const halfWidth = width * 0.5 * Math.pow(1 - t, 1.15);
    positions.push(cx - halfWidth, y, 0, cx + halfWidth, y, 0);
    // u across the blade, v base->tip so the albedo map reads along the leaf.
    uvs.push(0, t, 1, t);
  }
  for (let i = 0; i < segments - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // Final row: closing triangle between the last vertex pair and the tip.
  const tip = positions.length / 3 - 1;
  indices.push(tip - 2, tip - 1, tip);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Anchor positions of accepted emergent trees (consumed by the midstorey). */
let _emergentAnchors: Array<[number, number]> = [];

// ---------------------------------------------------------------------------
// #37 Emergent canopy — giants above the broadleaf canopy
// ---------------------------------------------------------------------------

function addEmergentCanopyTrees(root: THREE.Group): void {
  // Module-level state must reset per arena build: tests rebuild arenas in
  // one process, and stale anchors would grow the next build's relational
  // midstorey pass (nondeterministic instance counts across builds).
  _emergentAnchors.length = 0;
  const TARGET = 120;
  const SEED = 0x4a91_2c07;
  // Strict fit (slope <= 0.35, dry interior) rejects most of the island, so
  // oversample the candidate grid hard enough to land well past 60 instances.
  const sites = constrainedScatter(TARGET, SEED, {
    margin: 1.4,
    fit: { maxSlope: 0.35, minAboveWater: 0.6 },
    oversample: 8,
  });

  // Crown spheres are baked at their canopy height INSIDE the geometry so
  // every instance origin stays seated on the terrain authority (the layered
  // jungle contract decomposes matrices and re-checks each origin against
  // farcrysisTerrainHeight). The local offset compensates for the
  // non-uniform per-instance scale: worldY = cy * scaleY * s.
  const trunkGeom = new THREE.CylinderGeometry(0.38, 0.85, 11.5, 8);
  trunkGeom.translate(0, 5.75, 0);
  const crownLowerGeom = lumpify(new THREE.SphereGeometry(1, 10, 7), 0.24, 0x71c3);
  crownLowerGeom.translate(0, 10.2 / 1.5, 0); // scaleY = 1.5*s -> +10.2*s
  const crownUpperGeom = lumpify(new THREE.SphereGeometry(1, 9, 6), 0.2, 0x71c4);
  crownUpperGeom.translate(0, 11.4 / 1.05, 0); // scaleY = 1.05*s -> +11.4*s

  const trunks = farcrysisInstancedMesh(trunkGeom, vegeMat(0x54402a, 0.92, 0.02), sites.length);
  trunks.name = 'farcrysis-vege-emergent-trunks';
  const crownsLower = farcrysisInstancedMesh(crownLowerGeom, vegeMat(0x2f5f28, 0.9, 0.01), sites.length);
  crownsLower.name = 'farcrysis-vege-emergent-crowns-lower';
  const crownsUpper = farcrysisInstancedMesh(crownUpperGeom, vegeMat(0x3b7430, 0.88, 0.01), sites.length);
  crownsUpper.name = 'farcrysis-vege-emergent-crowns-upper';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const rng = mulberry32(SEED ^ 0x9e37);
  for (const [i, site] of sites.entries()) {
    const [x, z] = [site[0], site[1]];
    const y = terrainHeightAt(x, z);
    const s = 0.9 + rng() * 0.5; // 0.9-1.4 → 10.4-16.1 m giants
    const yaw = (x * 0.83 + z * 0.47) % (Math.PI * 2);
    euler.set(0, yaw, ((i % 3) - 1) * 0.03);
    q.setFromEuler(euler);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m);
    euler.set(((i % 3) - 1) * 0.06, yaw * 1.6, (((i + 1) % 3) - 1) * 0.05);
    q.setFromEuler(euler);
    // Crowns stay seated at the trunk base; the canopy height lives in the
    // translated geometry and scales with the instance.
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(3.4 * s, 1.5 * s, 3.2 * s));
    crownsLower.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(2.1 * s, 1.05 * s, 2.0 * s));
    crownsUpper.setMatrixAt(i, m);
    _emergentAnchors.push([x, z]);
  }
  root.add(register(trunks, 'emergent'));
  root.add(register(crownsLower, 'emergent'));
  root.add(register(crownsUpper, 'emergent'));
}

// ---------------------------------------------------------------------------
// #38 Midstorey — eye-level broadleaf clumps under the emergent crowns
// ---------------------------------------------------------------------------

function addMidstoreyClumps(root: THREE.Group): void {
  const SEED = 0x5d2e_81aa;
  const rng = mulberry32(SEED);
  const sites: Array<[number, number, number, number]> = [];
  const FIT = { maxSlope: 0.55, minAboveWater: 0.35 };
  // Relational pass: 2-3 clumps scattered around each emergent crown so the
  // tiers visually stack instead of scattering independently.
  for (const [ax, az] of _emergentAnchors) {
    const clumps = 3 + Math.floor(rng() * 2); // 3-4 per emergent crown
    for (let k = 0; k < clumps; k += 1) {
      const angle = rng() * Math.PI * 2;
      const dist = 2.5 + rng() * 5; // strictly inside the 8 m cluster radius
      const x = ax + Math.cos(angle) * dist;
      const z = az + Math.sin(angle) * dist;
      if (Math.abs(x) > BOUNDS.maxX - MARGIN || Math.abs(z) > BOUNDS.maxZ - MARGIN) continue;
      if (!clearOfGameplay(x, z, 0.8)) continue;
      if (!seatsOnTerrain(x, z, FIT)) continue;
      sites.push([x, z, terrainHeightAt(x, z), rng() * Math.PI * 2]);
    }
  }
  // Independent fill to reach target density across the interior.
  const fillTarget = Math.max(0, 170 - sites.length);
  sites.push(...constrainedScatter(fillTarget, SEED ^ 0x77aa, {
    margin: 0.8, fit: FIT,
  }));

  // Clump: four arched leaf cards fanned around a short stem.
  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  const cardRng = mulberry32(SEED ^ 0x33cc);
  for (let card = 0; card < 4; card += 1) {
    const cardGeom = bentLeafCard(1.15 + cardRng() * 0.5, 0.34, 0.55);
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3((cardRng() - 0.5) * 0.25, 0, (cardRng() - 0.5) * 0.25),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        (cardRng() - 0.5) * 0.5,
        (card / 4) * Math.PI * 2 + cardRng() * 0.6,
        0.18 + cardRng() * 0.22,
      )),
      new THREE.Vector3(1, 1, 1),
    );
    parts.push({ geom: cardGeom, matrix });
  }
  const clumpGeom = mergeTransformed(parts);

  const mesh = farcrysisInstancedMesh(clumpGeom, vegeMat(0x35682c, 0.87, 0.01), sites.length);
  mesh.name = 'farcrysis-vege-midstorey-clumps';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleRng = mulberry32(SEED ^ 0x11bb);
  for (const [i, [x, z, y]] of sites.entries()) {
    const s = 0.75 + scaleRng() * 0.7;
    euler.set(0, x * 0.61 + z * 0.29, ((i % 3) - 1) * 0.07);
    q.setFromEuler(euler);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  root.add(register(mesh, 'midstorey'));
}

// ---------------------------------------------------------------------------
// #39 Undergrowth carpet — dense low leaf-card filler over the jungle floor
// ---------------------------------------------------------------------------

function addUndergrowthCarpet(root: THREE.Group): void {
  const TARGET = 900;
  const SEED = 0x6e41_b2d3;
  const sites = constrainedScatter(TARGET, SEED, {
    margin: 0.4,
    fit: { maxSlope: 0.75, minAboveWater: 0.14 },
    clumpSalt: 0x21ab,
    clumpThreshold: 0.3,
    spawnClearance: 3.2,
  });

  // Clump: three small arched cards, lower and broader than the midstorey.
  const parts: Array<{ geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = [];
  const cardRng = mulberry32(SEED ^ 0x44dd);
  for (let card = 0; card < 3; card += 1) {
    parts.push({
      geom: bentLeafCard(0.5 + cardRng() * 0.3, 0.26, 0.4),
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3((cardRng() - 0.5) * 0.3, 0, (cardRng() - 0.5) * 0.3),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(
          (cardRng() - 0.5) * 0.6,
          (card / 3) * Math.PI * 2 + cardRng() * 0.8,
          0.12 + cardRng() * 0.3,
        )),
        new THREE.Vector3(1, 1, 1),
      ),
    });
  }
  const clumpGeom = mergeTransformed(parts);

  const mesh = farcrysisInstancedMesh(clumpGeom, vegeMat(0x3d7a33, 0.86, 0.01), sites.length);
  mesh.name = 'farcrysis-vege-undergrowth-carpet';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleRng = mulberry32(SEED ^ 0x22ee);
  for (const [i, [x, z, y]] of sites.entries()) {
    const s = 0.7 + scaleRng() * 0.8;
    euler.set(0, x * 0.47 + z * 0.53, ((i % 3) - 1) * 0.09);
    q.setFromEuler(euler);
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  // Ground-level dressing: analytic dapple supplies the broken light, so the
  // blades/cards stay OUT of the sun's shadow map (jungle-trail case study).
  root.add(register(mesh, 'undergrowth-carpet', { castShadow: false }));
}

// ---------------------------------------------------------------------------
// Main entry: add every vegetation layer to the arena group.
// ---------------------------------------------------------------------------

export function buildVegetation(scene: THREE.Group): void {
  resetStats();
  resetLODPairs();

  // Trees — 6 distinct types (existing)
  addPalms(scene);              // LOD pair registered + fronds wind-enabled inside
  addBroadleafTrees(scene);
  addFanPalms(scene);           // pass 76: replaced the wrong-biome conifers
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

  // ---- HF-363 density/species expansion ----
  addHeliconiaClumps(scene);     // species #34 — 70 bent leaf-card clumps
  addDriftwoodLogs(scene);       // ground scatter #35 — 26 beach driftwood logs
  addLeafCardUndergrowth(scene); // pass 76 #36 — 330 arched leaf cards (~3.5x density)

  // ---- HF-396/HF-398 layered jungle: canopy / midstorey / undergrowth ----
  addEmergentCanopyTrees(scene); // #37 — emergent tier above the broadleaf canopy
  addMidstoreyClumps(scene);     // #38 — eye-level band clustered under the emergents
  addUndergrowthCarpet(scene);   // #39 — dense low filler over the jungle floor
  // ---- Wind-enable remaining flexible vegetation (non-LOD-managed) ----
  _applyTslFoliage(scene); // HF-359/HF-363: TSL wind + canopy dapple on foliage layers

  // Believability: per-instance colour variation (rides existing draws).
  _applyInstanceColorVariation(scene);

  // HF-396: lift shaded canopy AND trunk faces toward their own hue (fake
  // subsurface) — trunks at the weaker bark scale.
  _applyFoliageShadeLift(scene);
 }

// ---------------------------------------------------------------------------
// Stats query — read the accumulated stats after buildVegetation() runs.
// ---------------------------------------------------------------------------

export function FARCRYSIS_VEGE_STATS(): {
  totalInstances: number;
  treeTypes: number;
  totalTriangles: number;
  /** Vegetation materials currently carrying real PBR texture maps.
   *  Zero until applyFarcrysisTextures runs (it is applied to the built
   *  scene by farcrysis-art.ts after buildVegetation returns). */
  textureCount: number;
} {
  return {
    totalInstances: _s.totalInstances,
    treeTypes: _s.treeTypeNames.size,
    totalTriangles: _s.totalTriangles,
    textureCount: _vegeMaterials.filter(
      (m) => Boolean(m.map || m.normalMap || m.roughnessMap || m.alphaMap || m.bumpMap),
    ).length,
  };
}

