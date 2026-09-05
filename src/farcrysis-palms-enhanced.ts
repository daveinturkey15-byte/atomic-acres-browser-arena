/**
 * farcrysis-palms-enhanced.ts — Pass 69 Farcrysis palm re-authoring.
 *
 * Replaces the old flat-box palm dressing (addInstancedPalms in
 * farcrysis-art.ts) with proper fan-shaped palm crowns and tapered,
 * slightly leaning trunks:
 *
 *   - Custom BufferGeometry palm crown: 8 drooping frond blades with a
 *     raised center spine per blade plus a closed hub — a 3-4 m fan that
 *     reads as a coconut-palm fountain from any angle.
 *   - Tapered CylinderGeometry trunk (0.18 top / 0.34 base, 2.5 m tall),
 *     translated so its base rests at the terrain estimate, with a small
 *     per-palm lean around the base.
 *   - 52 palms: 32 in a shore-edge band just behind the sand (waterline to
 *     a quarter of the dry-land depth, following the SQUARE shoreline on
 *     every azimuth) + 20 scattered through the jungle interior, varied
 *     scale 0.7-1.3, kept inside FARCRYSIS_BOUNDS with a 1.5 m margin and
 *     off the flat corridor lane strips (no sightline-blocking trunks).
 *   - Coconut clusters: 3 small spheres tucked under each crown.
 *
 * Everything is InstancedMesh (one draw call per material group) and
 * placement is fully deterministic via a local Mulberry32 PRNG (same
 * implementation as farcrysis-terrain.ts) — no Math.random, no external
 * assets. Presentation only: no colliders, no gameplay authority.
 *
 * NOTE on imports: farcrysis-art.ts imports buildEnhancedPalms from here
 * and this module imports FARCRYSIS_ART_FEEL from farcrysis-art.ts — a
 * deliberate cycle mirroring the existing art <-> terrain cycle. ESM live
 * bindings make this safe because FARCRYSIS_ART_FEEL is only read inside
 * function bodies, never at module evaluation time.
 */
import * as THREE from 'three';
import { farcrysisInstancedMesh } from './farcrysis-instancing';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_LANDMARKS } from './farcrysis-midmap-landmarks';
import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';
import {
  FARCRYSIS_ARENA_HALF,
  FARCRYSIS_INLAND_DEPTH,
  FARCRYSIS_WATERLINE_EDGE,
  farcrysisEdgeDistance,
  farcrysisSquarePoint,
} from './farcrysis-shore-bands';

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------

/** Seeded PRNG (copied from farcrysis-terrain.ts) so placement is stable. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


// ---------------------------------------------------------------------------
// Placement / terrain-fit constants
// ---------------------------------------------------------------------------

// HF-396 grew the island to +/-64 m; the old CIRCULAR beach/jungle rings only
// hugged the square shore along the axis faces and stranded corner palms up to
// ~22 m inland of the real waterline. Placement is now an EDGE-DISTANCE band
// measured inward from the square boundary face — the terrain authority's own
// Chebyshev convention — so beach palms follow the shoreline on every azimuth,
// corners included, and re-derive automatically if the extent changes again.
const PALM_COUNT = 52;
const BEACH_PALM_COUNT = 32; // first 32 palms ring the beach lagoon; rest are jungle scatter
/**
 * HF-395: the composed landmark groves own their quadrant. A palm trunk
 * inside a ruin wall or under a grove canopy is exactly the "thrown
 * together" scatter the owner rejected, and its collider would intersect
 * the grove colliders (canopy trunks reach ~3.8 m from centre, crate/wall
 * AABBs ~6.5 m). 7 m clears every grove collider with margin.
 */
const LANDMARK_GROVE_KEEP_OUT_M = 7;
const BOUNDS_MARGIN = 1.5;
export const TRUNK_HEIGHT = 2.5;

const ARENA_HALF = FARCRYSIS_ARENA_HALF;

/** Beach palms sit just behind the sand, from the waterline to a quarter of
 *  the dry-land depth inland (the same relative zone the vegetation module's
 *  beach/transition bands occupy). */
const PALM_BEACH_BAND: Readonly<[number, number]> = [
  FARCRYSIS_WATERLINE_EDGE + 0.5,
  FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.25,
];
/** Jungle palms fill the deep interior out to the bound-wall margin. */
const PALM_JUNGLE_BAND: Readonly<[number, number]> = [
  FARCRYSIS_WATERLINE_EDGE + FARCRYSIS_INLAND_DEPTH * 0.35,
  ARENA_HALF - BOUNDS_MARGIN - 0.5,
];

/**
 * Muse v9 layout review: these two deterministic instances landed on the
 * 4.5 m core loop / lane-e sightline. The collider builder imports this same
 * placement function, so re-seating the visual instance also re-seats its
 * existing named trunk proxy without deleting or adding collision authority.
 * w5-378: the dressing-stage reseat of 37 opened pair spawn-t0-2 ->
 * spawn-t1-1 (58.9 m, 21st open pair); no trunk seat on that line clears the
 * routes (low ground west, lane-e corridor east), so 37 keeps its reviewed
 * seat and 35 closes pair spawn-t0-5 -> spawn-t1-1 (66.0 m) instead, back at
 * the <= 20 ceiling. Seat (-20.4, -11.1) sits exactly on that eye line, 2.64 m
 * clear of every route edge, 6.4 m from any spawn, outside all collider
 * boxes, doorways, corridor strips and grove keep-outs, and blocks with
 * either trunk scale.
 */
export const RESEATED_ENHANCED_PALMS: Readonly<Record<35 | 37, readonly [number, number]>> = Object.freeze({
  35: [-20.4, -11.1],
  37: [29, 13],
});

// HF-360: this module used to carry its own guessed terrain model ("close
// enough"), which drifted from the rendered ground and left trunk bases
// floating or buried on every hill. All seating now resolves through the one
// terrain authority so palms, physics and the rendered surface agree exactly.

/** True when (x, z) falls on the flat corridor lane strips (|x|≈40 or |z|≈40). */
function onCorridorStrip(x: number, z: number): boolean {
  const laneHW = 11;
  return Math.abs(Math.abs(x) - 40) < laneHW || Math.abs(Math.abs(z) - 40) < laneHW;
}

// ---------------------------------------------------------------------------
// Believability (pass75 owner feedback: cloned-looking palms)
// ---------------------------------------------------------------------------

/**
 * Deterministic per-instance colour variation via instanceColor — rides the
 * existing instanced draw, so draw-call structure is unchanged.
 */
function varyPalmInstanceColors(mesh: THREE.InstancedMesh, seed: number): void {
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (!mat || !mat.color) return;
  const hsl = { h: 0, s: 0, l: 0 };
  mat.color.getHSL(hsl);
  const rng = mulberry32(seed);
  const c = new THREE.Color();
  for (let i = 0; i < mesh.count; i += 1) {
    const h = hsl.h + (rng() - 0.5) * 0.03;
    const s = Math.max(0, Math.min(1, hsl.s * (0.85 + rng() * 0.3)));
    const l = Math.max(0, Math.min(1, hsl.l * (0.78 + rng() * 0.48)));
    c.setHSL(h, s, l);
    mesh.setColorAt(i, c);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Palm crown geometry — fan of drooping frond blades
// ---------------------------------------------------------------------------

/**
 * Builds a single fan-shaped palm crown as one BufferGeometry:
 *   - 8 tapered leaf blades radiating from a closed center hub,
 *   - each blade droops outward (tip lower than hub) like a coconut palm,
 *   - each blade carries a thin raised center spine ridge,
 *   - crown dish spans ~3-4 m across, ~0.3 m thick at the hub.
 * The crown's local origin is the hub center (where the trunk top sits).
 */
export function createPalmCrownGeometry(): THREE.BufferGeometry {
  const bladeCount = 8;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Hub center vertex (crown origin)
  const hubIndex = 0;
  positions.push(0, 0.03, 0);
  uvs.push(0.5, 0.5);

  // Per-blade hub rim vertex indices for the closing cap triangles
  const hubRim: number[] = [];

  for (let k = 0; k < bladeCount; k += 1) {
    const theta = (k / bladeCount) * Math.PI * 2 + 0.21;
    const ux = Math.cos(theta);
    const uz = Math.sin(theta);
    // Tangent dir chosen so u x v = +Y (outward/upward facing triangles)
    const vx = uz;
    const vz = -ux;

    // Deterministic per-blade variation: 1.5-2.05 m long, 0.5-0.85 m droop
    const len = 1.5 + (((k * 37) % 10) / 10) * 0.55;
    const droop = 0.5 + (((k * 13) % 7) / 7) * 0.35;
    const w0 = 0.34; // base half width
    const w1 = 0.6;  // mid half width

    // First vertex of this blade: vertex 0 is the hub center, then 11 verts
    // per blade (5 leaf + 6 spine). A previous `4 + k * 11` here shifted every
    // blade's indices by +3 and drove the last blade's spine indices past the
    // end of the position buffer — toNonIndexed() then read NaN, which is how
    // the WebGL2 static batcher poisoned the whole render batch.
    const bl = 1 + k * 11;
    const br = bl + 1;

    // Leaf: base-left, base-right, mid-left, mid-right, tip
    positions.push(
      ux * 0.3 + vx * w0, 0.05, uz * 0.3 + vz * w0,
      ux * 0.3 - vx * w0, 0.05, uz * 0.3 - vz * w0,
      ux * 1.0 + vx * w1, -0.16, uz * 1.0 + vz * w1,
      ux * 1.0 - vx * w1, -0.16, uz * 1.0 - vz * w1,
      ux * len, -droop, uz * len,
    );
    // u across the blade, v base->tip so the frond albedo/alpha reads along
    // the blade. Without this attribute applyFarcrysisTextures skips the
    // crown entirely and the beach palms render as flat solid colour.
    uvs.push(0, 0, 1, 0, 0, 0.55, 1, 0.55, 0.5, 1);
    hubRim.push(bl, br);

    // Leaf triangles (tapered blade: base -> mid -> tip)
    indices.push(bl, bl + 2, bl + 3);
    indices.push(bl, bl + 3, br);
    indices.push(bl + 2, bl + 4, bl + 3);

    // Spine ridge: raised thin center rib along the blade (6 verts)
    const sr = 0.05;
    positions.push(
      ux * 0.32 + vx * sr, 0.18, uz * 0.32 + vz * sr,
      ux * 0.32 - vx * sr, 0.18, uz * 0.32 - vz * sr,
      ux * 1.0 + vx * sr, 0.04, uz * 1.0 + vz * sr,
      ux * 1.0 - vx * sr, 0.04, uz * 1.0 - vz * sr,
      ux * len * 0.92 + vx * sr * 0.6, -droop * 0.92, uz * len * 0.92 + vz * sr * 0.6,
      ux * len * 0.92 - vx * sr * 0.6, -droop * 0.92, uz * len * 0.92 - vz * sr * 0.6,
    );
    // Spine ridge shares the blade's UV space (a narrow band up the centre).
    uvs.push(0.4, 0.05, 0.6, 0.05, 0.4, 0.55, 0.6, 0.55, 0.45, 0.92, 0.55, 0.92);
    const s0 = bl + 5;
    indices.push(s0, s0 + 2, s0 + 3);
    indices.push(s0, s0 + 3, s0 + 1);
    indices.push(s0 + 2, s0 + 4, s0 + 5);
    indices.push(s0 + 2, s0 + 5, s0 + 3);
  }

  // Closing cap: hub center -> each blade's base rim (facing up)
  for (let k = 0; k < bladeCount; k += 1) {
    indices.push(hubIndex, hubRim[k * 2 + 1], hubRim[k * 2]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Palm placement — deterministic scatter
// ---------------------------------------------------------------------------

export interface PalmPlacement {
  x: number;
  z: number;
  baseY: number;
  yaw: number;
  lean: number;
  scale: number;
  crownSpin: number;
  crownTilt: number;
  crownScale: number;
}

/** Deterministic placement: beach band first, then jungle interior. */
function buildPlacements(): PalmPlacement[] {
  const rng = mulberry32(0x9e3779b9);
  const placements: PalmPlacement[] = [];
  let guard = 0;

  while (placements.length < PALM_COUNT && guard < 6000) {
    guard += 1;
    const isBeach = placements.length < BEACH_PALM_COUNT;
    // Uniform square-island draw, accepted inside the palm's shore-edge band
    // (two rng() calls per attempt keep the seed chain deterministic). The
    // old circular rings only hugged the square shore along the axis faces —
    // corner palms sat up to ~22 m inland of the real waterline.
    const [x, z] = farcrysisSquarePoint(rng, BOUNDS_MARGIN);
    const edge = farcrysisEdgeDistance(x, z);
    if (isBeach) {
      if (edge < PALM_BEACH_BAND[0] || edge > PALM_BEACH_BAND[1]) continue;
    } else if (edge < PALM_JUNGLE_BAND[0] || edge > PALM_JUNGLE_BAND[1]) continue;

    // Keep trunks off the flat corridor lane strips (no sightline blocking)
    if (onCorridorStrip(x, z)) continue;

    // And out of the composed landmark groves (HF-395 keep-out).
    if (
      FARCRYSIS_LANDMARKS.some(
        (frame) => Math.hypot(x - frame.center[0], z - frame.center[1]) < LANDMARK_GROVE_KEEP_OUT_M,
      )
    ) continue;

    const scale = 0.7 + rng() * 0.6; // varied heights 0.7x-1.3x
    placements.push({
      x,
      z,
      baseY: farcrysisTerrainHeight(x, z),
      yaw: Math.atan2(z, x) + (rng() - 0.5) * 0.5,
      lean: (rng() - 0.5) * 0.24, // slight per-trunk lean
      scale,
      crownSpin: rng() * Math.PI * 2,
      crownTilt: (rng() - 0.5) * 0.14,
      crownScale: scale * (1 + (rng() - 0.5) * 0.16),
    });
  }

  for (const index of [35, 37] as const) {
    const seat = RESEATED_ENHANCED_PALMS[index];
    const palm = placements[index];
    if (!seat || !palm) continue;
    palm.x = seat[0];
    palm.z = seat[1];
    palm.baseY = farcrysisTerrainHeight(palm.x, palm.z);
    palm.yaw = Math.atan2(palm.z, palm.x);
  }

  return placements;
}

/**
 * HF-360: exported so buildFarcrysis can author trunk colliders for these
 * palms in the gameplay file. Placement stays deterministic (seeded PRNG), so
 * the collider set and the rendered instances always agree — and the art
 * layer itself still adds no gameplay authority, keeping the module contract.
 */
export function enhancedPalmPlacements(): readonly PalmPlacement[] {
  return buildPlacements();
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

/**
 * Instanced palm stand builder for an arbitrary placement list.
 *
 * Pass-76 consolidation: the arena used to carry THREE palm systems (gameplay
 * box-trunk palms in farcrysis.ts, slab-frond palms in farcrysis-vegetation.ts
 * and the enhanced palms here). All of them now render through this one
 * builder so every palm in the arena shares the same crown/trunk silhouette;
 * only placement lists differ. Presentation only — colliders stay authored in
 * farcrysis.ts against the same deterministic placements.
 */
export function buildPalmStandInstances(
  root: THREE.Group,
  placements: readonly PalmPlacement[],
  namePrefix: string,
): {
  trunkInstances: THREE.InstancedMesh;
  frondInstances: THREE.InstancedMesh;
  coconutInstances: THREE.InstancedMesh;
} {
  const count = placements.length;

  // Tapered trunk, translated so its base rests at y=0 (lean pivots at ground)
  const trunkGeometry = new THREE.CylinderGeometry(0.18, 0.34, TRUNK_HEIGHT, 8);
  trunkGeometry.translate(0, TRUNK_HEIGHT / 2, 0);

  const crownGeometry = createPalmCrownGeometry();
  const coconutGeometry = new THREE.SphereGeometry(0.15, 6, 4);

  // Materials mirror the old mat() conventions from farcrysis-art.ts
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.palmTrunk,
    roughness: 0.88,
    metalness: 0.03,
  });
  const frondMaterial = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.palmFrond,
    roughness: 0.85,
    metalness: 0.02,
    side: THREE.DoubleSide, // drooped blades must read from below too
  });
  const coconutMaterial = new THREE.MeshStandardMaterial({
    color: FARCRYSIS_ART_FEEL.palmTrunk,
    roughness: 0.7,
    metalness: 0.05,
  });

  const trunkInstances = farcrysisInstancedMesh(trunkGeometry, trunkMaterial, count);
  trunkInstances.name = `${namePrefix}-trunks`;
  trunkInstances.castShadow = true;
  trunkInstances.receiveShadow = true;
  trunkInstances.userData.farcrysisArt = true;

  const frondInstances = farcrysisInstancedMesh(crownGeometry, frondMaterial, count);
  frondInstances.name = `${namePrefix}-fronds`;
  frondInstances.castShadow = true;
  frondInstances.receiveShadow = true;
  frondInstances.userData.farcrysisArt = true;

  const coconutInstances = farcrysisInstancedMesh(coconutGeometry, coconutMaterial, count * 3);
  coconutInstances.name = `${namePrefix}-coconuts`;
  coconutInstances.castShadow = true;
  coconutInstances.receiveShadow = true;
  coconutInstances.userData.farcrysisArt = true;

  // Scratch objects for matrix composition (allocated once)
  const matrix = new THREE.Matrix4();
  const basePos = new THREE.Vector3();
  const trunkQuat = new THREE.Quaternion();
  const tmpQuat = new THREE.Quaternion();
  const tmpEuler = new THREE.Euler();
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  const scl = new THREE.Vector3();

  for (let i = 0; i < count; i += 1) {
    const p = placements[i];

    // ---- Trunk: base on terrain, yaw + lean around the base ----
    basePos.set(p.x, p.baseY + 0.02, p.z);
    tmpEuler.set(p.lean, p.yaw, 0);
    trunkQuat.setFromEuler(tmpEuler);
    scl.set(1, p.scale, 1);
    matrix.compose(basePos, trunkQuat, scl);
    trunkInstances.setMatrixAt(i, matrix);

    // ---- Crown: at the top of the (possibly leaning) trunk ----
    local.set(0, TRUNK_HEIGHT * p.scale, 0);
    world.copy(local).applyQuaternion(trunkQuat).add(basePos);
    tmpEuler.set(0, p.crownSpin, p.crownTilt);
    tmpQuat.setFromEuler(tmpEuler);
    const crownQuat = tmpQuat.clone().premultiply(trunkQuat);
    // Believability: slight per-palm crown squash variance so crowns are not
    // all identical fans (deterministic from the placement index).
    const crownSquash = 0.94 + ((i * 37) % 7) * 0.02; // 0.94-1.06
    scl.set(p.crownScale, p.crownScale * crownSquash, p.crownScale);
    matrix.compose(world, crownQuat, scl);
    frondInstances.setMatrixAt(i, matrix);

    // ---- Coconuts: 3 small spheres clustered just under the crown ----
    for (let c = 0; c < 3; c += 1) {
      const cocoIndex = i * 3 + c;
      const cAngle = (c / 3) * Math.PI * 2 + p.yaw * 0.7 + (i % 2) * 0.25;
      const cRadius = 0.2 + ((i * 7 + c * 11) % 5) * 0.018; // 0.20-0.27 m
      const cY = TRUNK_HEIGHT * p.scale - 0.05 + ((i + c) % 3) * 0.03;
      local.set(Math.cos(cAngle) * cRadius, cY, Math.sin(cAngle) * cRadius);
      world.copy(local).applyQuaternion(trunkQuat).add(basePos);

      tmpEuler.set(0, (i * 13 + c * 29) % 7, 0); // cosmetic spin
      tmpQuat.setFromEuler(tmpEuler);
      const cocoQuat = tmpQuat.clone().premultiply(trunkQuat);
      scl.setScalar(0.8 + ((i * 5 + c * 3) % 4) * 0.08); // 0.8-1.04 x
      matrix.compose(world, cocoQuat, scl);
      coconutInstances.setMatrixAt(cocoIndex, matrix);
    }
  }

  trunkInstances.instanceMatrix.needsUpdate = true;
  frondInstances.instanceMatrix.needsUpdate = true;
  coconutInstances.instanceMatrix.needsUpdate = true;

  // Instances are spread across the whole arena — compute a correct
  // bounding sphere so frustum culling never drops distant palms.
  trunkInstances.computeBoundingSphere();
  frondInstances.computeBoundingSphere();
  coconutInstances.computeBoundingSphere();

  // Believability: per-instance colour variation (rides existing draws).
  varyPalmInstanceColors(trunkInstances, 0x7a11);
  varyPalmInstanceColors(frondInstances, 0xf0dd);
  varyPalmInstanceColors(coconutInstances, 0xc0c0);

  root.add(trunkInstances);
  root.add(frondInstances);
  root.add(coconutInstances);

  return { trunkInstances, frondInstances, coconutInstances };
}

export function buildEnhancedPalms(root: THREE.Group): {
  trunkInstances: THREE.InstancedMesh;
  frondInstances: THREE.InstancedMesh;
  coconutInstances?: THREE.InstancedMesh;
} {
  return buildPalmStandInstances(root, buildPlacements(), 'farcrysis-art-enhanced-palm');
}
