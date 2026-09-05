// Mechanical WALKABLE-SURFACE parity audit (HF-411, PASS 85).
//
// Shared by:
//   - scripts/qa/audit-walkable-surface-parity.ts (CLI sweep, exit-coded gate)
//   - src/walkable-surface-parity-gate.test.ts    (permanent vitest gate)
//
// WHY THIS EXISTS, given collider-visual-parity-core.ts already runs.
// -----------------------------------------------------------------
// That audit asks two questions and both of them miss floors:
//
//   Direction A "invisible collider" walks from COLLIDER to mesh, so a surface
//     with no collider at all is invisible to it by construction.
//   Direction B "walk-through prop" walks from MESH to collider, but it only
//     censuses meshes that are TALL (>= 0.9 m) and NARROW, because it is
//     hunting for cover you can walk through. A 0.06 m thick horizontal panel
//     is neither, and on top of that Direction B's SECOND name rule (the first
//     is water) excludes anything matching /floor|deck-plank|ground|terrain/ as
//     a "walkable surface" - i.e. it deliberately drops the exact class this
//     module measures.
//
// So a horizontal presentation panel strung across a gap at roof height -
// grating, catwalk, mesh fence laid flat, camo netting, a tarp deck - passed
// BOTH directions while being a hole a player falls through. That is HF-411,
// reported by the owner on Firing Range (test1) on 2026-09-02:
// "on firing range sometimes you go to run onto a metal fence layed as a floor
//  on the roof level of the map and you fall through it, fix all that shit".
//
// Direction D - FALL-THROUGH FLOOR: every VISIBLE mesh whose top face is
//   horizontal, elevated above grade, and big enough for a player to stand on
//   must have movement authority under EVERY part of that top face, at a top
//   height a player would not notice stepping onto. The metric is the share of
//   the top face with no collider beneath it within the step tolerance, and the
//   world AABB of the unsupported region, so a partial collider or an EDGE GAP
//   is reported with numbers rather than a boolean.
//
// The support test is deliberately the same geometry Rapier is given: the
// arena's own Box2 movement colliders, turned into oriented cuboids by exactly
// the transform CharacterPhysics.create uses (src/physics.ts boxShape), so a
// yaw-rotated container reports its real footprint and not its AABB.
import * as THREE from 'three';
import type { Box2 } from '../../src/collision';
import type { ArenaMap } from '../../src/map';
import {
  ALL_ARENA_IDS,
  colliderYRange,
  installHeadlessArenaShims,
  loadArenaFactories,
  round,
} from './collider-visual-parity-core';

export { ALL_ARENA_IDS } from './collider-visual-parity-core';

// ---------------------------------------------------------------------------
// Calibration. Every constant is derived from the shipped character
// controller (src/physics.ts CHARACTER_PHYSICS_CONFIG / STANCE_SHAPES), not
// chosen to make a run green. Moving one DOWN needs evidence; moving one UP
// hides findings and is forbidden by the repo contract.
// ---------------------------------------------------------------------------

/**
 * A surface below this is grade: the hardpan, kerbs, road paint and the sunken
 * paving complements. Falling 0.6 m is not the defect the owner reported and
 * the safety floor catches it anyway.
 */
export const WALKABLE_MIN_TOP_Y_M = 0.6;
/** Standing capsule diameter is 0.76 m: below this you cannot stand on it. */
export const WALKABLE_MIN_SPAN_M = 0.9;
/** ...and you need somewhere to put the other foot. 0.9 x 0.9 rounded down. */
export const WALKABLE_MIN_AREA_M2 = 1.6;
/**
 * maximumSlopeClimbDegrees is 50, but a face steeper than this reads as a
 * wall/ramp rather than a floor and the owner's report is about floors.
 * The two camo nets on test1 are authored at 2.0 degrees, well inside.
 */
export const WALKABLE_MAX_SLOPE_DEG = 20;
/**
 * Meshes covering more than this share of the arena's own footprint are
 * terrain, ridge rings, treeline silhouettes and sky: never a floor panel.
 * Same value the collider/visual audit uses for the same reason.
 */
export const TERRAIN_FOOTPRINT_SHARE = 0.4;
/**
 * How far BELOW the visual top a collider top may sit and still count as
 * support. snapToGround is 0.24 m and autostepHeight is 0.42 m; 0.20 m is
 * inside both, so a player crossing this seam neither drops nor climbs
 * visibly. A collider top ABOVE the visual is always support (you stand on
 * the collider and the visual is buried in it).
 */
export const SUPPORT_TOLERANCE_M = 0.2;
/** Sampling inset from the top-face edge, so a float-exact edge is not a hole. */
export const SAMPLE_INSET_M = 0.02;
/** Grid resolution along each axis of the top face, plus a forced edge ring. */
export const SAMPLE_STEP_M = 0.25;
export const SAMPLE_MIN_PER_AXIS = 5;
export const SAMPLE_MAX_PER_AXIS = 64;
/**
 * A finding is any surface with more unsupported top face than this. It is not
 * zero because the sample grid lands on float-authored seams. The HF-411 net
 * measured 97% unsupported (971 of 999 samples), three orders of magnitude
 * clear of this floor - but see UNSUPPORTED_HOLE_FLOOR_M2 below, because a
 * share alone is not a safe sole criterion.
 */
export const UNSUPPORTED_SHARE_FLOOR = 0.02;
/**
 * ...and because a SHARE is relative to the panel, the share floor alone scales
 * the sensitivity with the size of the thing being measured: 2% of the 9 x 6.4 m
 * camo net is 1.15 m2 of open air, the same defect class the owner reported, an
 * order of magnitude smaller. So the largest CONNECTED unsupported region is
 * measured as well, and a contiguous hole bigger than this fails regardless of
 * how large the surface around it is. 0.5 m2 is under the 0.76 m standing
 * capsule diameter squared (0.58 m2): a hole this size cannot swallow a
 * standing player whole, and anything that can, does.
 */
export const UNSUPPORTED_HOLE_FLOOR_M2 = 0.5;

/**
 * A real floor has a real flat top FACE. A rock, a tree canopy, a dome or a
 * sculpted hull has a curved cap whose axis-aligned bounding box top is a
 * rectangle that exists nowhere in the geometry. This is the share of the
 * bounding-box top rectangle that must be covered by actual near-horizontal
 * triangles at the top of the mesh before the mesh is called a floor.
 * Measured 2026-09-02: every authored slab scores 1.0, every detail rock,
 * canopy and cliff chunk on farcrysis scores under 0.2.
 */
export const FLAT_TOP_COVERAGE = 0.6;
/** Triangles within this band of the top count as the top face. */
export const FLAT_TOP_BAND_M = 0.06;
/** InstancedMesh instances audited individually before the mesh is reported. */
export const INSTANCE_SAMPLE_CAP = 512;
/**
 * A body has to FIT on a floor. STANCE_SHAPES.prone is halfHeight 0.02 plus
 * radius 0.36, so the smallest pose the controller has is 0.76 m tall; a
 * surface with solid geometry closer than that above it cannot hold a player
 * in any stance, which is what an interior ceiling under its own roof, a
 * shelf under an overhang and a soffit all are.
 */
export const STANDING_CLEARANCE_M = 0.76;
/** Share of the top face that must be overhead-blocked before it is not a floor. */
export const CLEARANCE_BLOCKED_SHARE = 0.8;
/**
 * Roof-clearance samples are pulled this far in from the top-face edge: the
 * standing capsule radius (0.38 m) rounded up, because a capsule centre can
 * never be closer than its own radius to the parapet beside the roof.
 */
export const CLEARANCE_SAMPLE_INSET_M = 0.4;

/**
 * Name rules for meshes that are not floors, each with a stated reason.
 *
 * EVERY pattern is word-anchored. An unanchored /sea/ excluded all 260 meshes
 * of `high-seas` and an unanchored /sky/ excluded all of `skyline-terminal` -
 * a sweep that silently skips two shipped arenas because their NAME collides
 * with an exclusion token is exactly the hardcoded-roster failure this repo
 * has already paid for twice. The guard is pinned in the gate test.
 */
export const WALKABLE_NAME_RULES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(sky|skybox|skydome|dome|cloud|atmosphere|backdrop|horizon)\b|ridge-ring/i, reason: 'sky/backdrop dressing' },
  { pattern: /\b(water|ocean|sea|wave|foam|caustic|waterline|surf)\b/i, reason: 'water volume presentation' },
  { pattern: /\b(grass|foliage|fern|bush|shrub|tuft|canopy|canopies|leaf|leaves|frond|vine|tree|trees|hedge|crown|crowns|trunk|trunks|planting)\b/i, reason: 'soft foliage' },
  // `light-shaft`, hyphenated, is how this repo actually spells it - both
  // map3-godrays-light-shaft-volume and map3-colosseum-light-shaft-volume.
  // The rule listed only the closed-up `lightshaft`, so the godrays one was
  // excluded by its `godrays` token while the colosseum one - the same class of
  // mesh, a non-solid non-shot cone of shaft material 24 m up and 156 m out -
  // was censused as a walkable floor with a 12,480 m2 hole under it. Nobody can
  // reach it, stand on it or shoot it. Same intent, one missing spelling.
  { pattern: /\b(particle|particles|sprite|spark|smoke|dust|mist|rain|glow|godray|godrays|light[-\s]?shafts?)\b/i, reason: 'particle/volumetric effect' },
  { pattern: /\b(decal|scorch|stripe|marking|markings|paint|number|numbers|sign|signage|poster|label)\b/i, reason: 'surface decal/dressing' },
  { pattern: /\b(terrain|hardpan|verge)\b|berm-ring/i, reason: 'terrain shell outside the playfield' },
];

export type WalkableFinding = {
  name: string;
  path: string;
  /** Centre of the top face. */
  centre: [number, number, number];
  /** Top-face XZ span and area. */
  span: [number, number];
  area: number;
  topY: number;
  slopeDeg: number;
  /** Share of the sampled top face with no movement authority beneath it. */
  unsupportedShare: number;
  samples: number;
  unsupportedSamples: number;
  /** Area of the LARGEST 4-connected unsupported region, in m2. */
  largestHoleM2: number;
  /** Which floor the finding tripped: the share, the contiguous hole, or both. */
  trippedBy: 'share' | 'hole' | 'share+hole';
  /** World AABB of the unsupported region: minX, maxX, minZ, maxZ. */
  hole: [number, number, number, number] | null;
  /** Highest collider top found under the hole, or null if there is nothing at all. */
  bestColliderTopUnderHole: number | null;
  /** How far a player standing at the hole centre would fall to that support. */
  dropM: number | null;
};

/** One censused walkable visual: the roster the traversal probe walks. */
export type WalkableSurface = {
  name: string;
  centre: [number, number, number];
  span: [number, number];
  area: number;
  topY: number;
  slopeDeg: number;
  unsupportedShare: number;
  /** Area of the LARGEST 4-connected unsupported region, in m2. */
  largestHoleM2: number;
  /** Top-face corners, world space, for a probe that wants edge points. */
  quad: Array<[number, number, number]>;
};

export type WalkableArenaResult = {
  id: string;
  error?: string;
  colliderCount?: number;
  visibleMeshes?: number;
  /** Meshes that entered the walkable census. */
  census?: number;
  /** Census meshes with full movement authority under their top face. */
  supported?: number;
  excludedByRuleCounts?: Record<string, number>;
  findings?: WalkableFinding[];
  /** Every censused walkable visual, supported or not. */
  surfaces?: WalkableSurface[];
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

type OrientedCollider = {
  centre: THREE.Vector3;
  halfExtents: THREE.Vector3;
  /** World -> collider-local rotation. */
  inverse: THREE.Quaternion;
  top: number;
};

/**
 * The exact cuboid CharacterPhysics.create hands Rapier for one Box2. Kept in
 * lockstep with src/physics.ts boxShape: same half-extent floor, same Y
 * defaults as collision.ts navigation, same Euler order.
 */
function orientedCollider(box: Box2): OrientedCollider {
  const y = colliderYRange(box);
  const rotation = new THREE.Quaternion();
  if (box.rotation) {
    rotation.setFromEuler(new THREE.Euler(box.rotation[0], box.rotation[1], box.rotation[2], 'XYZ'));
  }
  const halfExtents = new THREE.Vector3(
    Math.max(0.01, (box.maxX - box.minX) / 2),
    Math.max(0.01, (y.max - y.min) / 2),
    Math.max(0.01, (box.maxZ - box.minZ) / 2),
  );
  const centre = new THREE.Vector3((box.minX + box.maxX) / 2, (y.min + y.max) / 2, (box.minZ + box.maxZ) / 2);
  // The rotated cuboid's highest point, used only to report the drop.
  const top = centre.y + halfExtents.clone().applyQuaternion(rotation).length();
  return { centre, halfExtents, inverse: rotation.clone().invert(), top };
}

const scratchPoint = new THREE.Vector3();

function containsPoint(collider: OrientedCollider, x: number, y: number, z: number): boolean {
  scratchPoint.set(x - collider.centre.x, y - collider.centre.y, z - collider.centre.z);
  scratchPoint.applyQuaternion(collider.inverse);
  return Math.abs(scratchPoint.x) <= collider.halfExtents.x
    && Math.abs(scratchPoint.y) <= collider.halfExtents.y
    && Math.abs(scratchPoint.z) <= collider.halfExtents.z;
}

/**
 * Support at one point of a visual top face: probe straight down from just
 * under the surface to the step tolerance. Anything the capsule would stand on
 * without a visible drop counts, whatever its orientation.
 */
function supportedAt(colliders: readonly OrientedCollider[], x: number, topY: number, z: number): boolean {
  const probes = 6;
  for (let index = 0; index <= probes; index += 1) {
    const y = topY - (SUPPORT_TOLERANCE_M * index) / probes - 0.01;
    for (const collider of colliders) {
      if (containsPoint(collider, x, y, z)) return true;
    }
  }
  return false;
}

/** True when solid geometry sits within the smallest player pose above the surface. */
function overheadBlockedAt(colliders: readonly OrientedCollider[], x: number, topY: number, z: number): boolean {
  const probes = 6;
  for (let index = 1; index <= probes; index += 1) {
    const y = topY + (STANDING_CLEARANCE_M * index) / probes;
    for (const collider of colliders) {
      if (containsPoint(collider, x, y, z)) return true;
    }
  }
  return false;
}

function highestColliderTopUnder(colliders: readonly OrientedCollider[], x: number, z: number, below: number): number | null {
  let best: number | null = null;
  // Walk down from the surface in 0.05 m steps to the safety floor; the first
  // collider hit is the thing the player actually lands on.
  for (let y = below; y >= -1; y -= 0.05) {
    for (const collider of colliders) {
      if (containsPoint(collider, x, y, z)) {
        if (best === null || y > best) best = y;
      }
    }
    if (best !== null) return round(best);
  }
  return null;
}

/**
 * The oriented top face of one placed geometry: the four local-bounding-box
 * corners at local max Y, in world space. Rotation is honoured, so a
 * yaw-rotated panel reports its real quad rather than an inflated AABB, and a
 * tilted panel reports its real slope.
 */
function topFaceQuad(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4): THREE.Vector3[] | null {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const local = geometry.boundingBox;
  if (!local) return null;
  const corners = [
    new THREE.Vector3(local.min.x, local.max.y, local.min.z),
    new THREE.Vector3(local.max.x, local.max.y, local.min.z),
    new THREE.Vector3(local.max.x, local.max.y, local.max.z),
    new THREE.Vector3(local.min.x, local.max.y, local.max.z),
  ];
  for (const corner of corners) corner.applyMatrix4(matrixWorld);
  return corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y) && Number.isFinite(corner.z))
    ? corners
    : null;
}

/**
 * The share of the bounding-box top rectangle that real, near-horizontal
 * triangles at the top of the geometry actually cover.
 *
 * This is what separates a FLOOR from a bounding box. A rock, a canopy, a
 * dome or a sculpted hull has a bbox top rectangle that exists nowhere in its
 * geometry; measuring it as a floor produced 49 findings on farcrysis alone,
 * every one of them a rounded cap. An authored slab scores 1.0.
 *
 * Areas are XZ-projected, which is exactly the projection the support sampler
 * and the player's own footprint use.
 */
function flatTopCoverage(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
  quadArea: number,
): number {
  const position = geometry.getAttribute('position');
  if (!position || quadArea <= 0) return 0;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  // The band is measured in the geometry's OWN frame, not in world Y: the
  // test1 camo nets are authored with a 2 degree tilt, and a world-Y band
  // discarded 97% of a perfectly flat panel because one end hangs 0.31 m
  // lower than the other. Horizontality is still judged in world space below.
  const localTopY = geometry.boundingBox?.max.y ?? 0;
  const index = geometry.getIndex();
  const triangles = (index ? index.count : position.count) / 3;
  // A pathological mesh is reported as not-a-floor rather than stalling the
  // sweep; the count is surfaced by the caller's exclusion tally.
  if (!Number.isFinite(triangles) || triangles > 200_000) return 0;
  const cosLimit = Math.cos(THREE.MathUtils.degToRad(WALKABLE_MAX_SLOPE_DEG));
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const localA = new THREE.Vector3();
  const localB = new THREE.Vector3();
  const localC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let flat = 0;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const i0 = index ? index.getX(triangle * 3) : triangle * 3;
    const i1 = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const i2 = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    localA.fromBufferAttribute(position, i0);
    localB.fromBufferAttribute(position, i1);
    localC.fromBufferAttribute(position, i2);
    a.copy(localA).applyMatrix4(matrixWorld);
    b.copy(localB).applyMatrix4(matrixWorld);
    c.copy(localC).applyMatrix4(matrixWorld);
    if (localA.y < localTopY - FLAT_TOP_BAND_M
      || localB.y < localTopY - FLAT_TOP_BAND_M
      || localC.y < localTopY - FLAT_TOP_BAND_M) continue;
    normal.copy(ab.subVectors(b, a)).cross(ac.subVectors(c, a));
    const length = normal.length();
    if (length < 1e-9) continue;
    if (Math.abs(normal.y) / length < cosLimit) continue;
    // |normal| is twice the triangle area; its Y component is twice the
    // XZ-projected area, which is the footprint a player stands on.
    flat += Math.abs(normal.y) / 2;
  }
  return flat / quadArea;
}

/** One placed geometry: a plain mesh, or one instance of an InstancedMesh. */
type SurfaceCandidate = {
  mesh: THREE.Mesh;
  matrixWorld: THREE.Matrix4;
  instance: number | null;
};

/**
 * Expands the scene into placed geometries. InstancedMesh is expanded per
 * instance because the instance matrices, not the object matrix, are where a
 * batched floor panel would actually sit; over the cap the mesh is reported
 * as an exclusion rather than silently skipped.
 */
function surfaceCandidates(mesh: THREE.Mesh, overCap: () => void): SurfaceCandidate[] {
  if (!(mesh instanceof THREE.InstancedMesh)) {
    return [{ mesh, matrixWorld: mesh.matrixWorld, instance: null }];
  }
  if (mesh.count > INSTANCE_SAMPLE_CAP) {
    overCap();
    return [];
  }
  const candidates: SurfaceCandidate[] = [];
  for (let instance = 0; instance < mesh.count; instance += 1) {
    const local = new THREE.Matrix4();
    mesh.getMatrixAt(instance, local);
    candidates.push({
      mesh,
      matrixWorld: new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, local),
      instance,
    });
  }
  return candidates;
}

function quadSlopeDegrees(quad: readonly THREE.Vector3[]): number {
  const normal = new THREE.Vector3()
    .subVectors(quad[1], quad[0])
    .cross(new THREE.Vector3().subVectors(quad[3], quad[0]));
  if (normal.lengthSq() < 1e-12) return 90;
  normal.normalize();
  return THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(normal.y))));
}

function visibleChain(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

function objectPath(object: THREE.Object3D): string {
  const parts: string[] = [];
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.name) parts.unshift(node.name);
    node = node.parent;
  }
  return parts.join('/');
}

/**
 * Largest 4-connected region of set cells in a countU x countV occupancy grid,
 * in CELLS. Iterative flood fill with an explicit stack: a 64 x 64 grid of open
 * air is 4096 deep and recursion would blow the stack on exactly the worst
 * defect this module exists to find.
 */
export function largestConnectedRegion(grid: Uint8Array, countU: number, countV: number): number {
  const seen = new Uint8Array(grid.length);
  const stack: number[] = [];
  let largest = 0;
  for (let start = 0; start < grid.length; start += 1) {
    if (grid[start] !== 1 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    let size = 0;
    while (stack.length > 0) {
      const index = stack.pop()!;
      size += 1;
      const iu = Math.floor(index / countV);
      const iv = index - iu * countV;
      if (iu > 0) { const n = index - countV; if (grid[n] === 1 && seen[n] === 0) { seen[n] = 1; stack.push(n); } }
      if (iu < countU - 1) { const n = index + countV; if (grid[n] === 1 && seen[n] === 0) { seen[n] = 1; stack.push(n); } }
      if (iv > 0) { const n = index - 1; if (grid[n] === 1 && seen[n] === 0) { seen[n] = 1; stack.push(n); } }
      if (iv < countV - 1) { const n = index + 1; if (grid[n] === 1 && seen[n] === 0) { seen[n] = 1; stack.push(n); } }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

function sampleCount(span: number): number {
  return THREE.MathUtils.clamp(Math.ceil(span / SAMPLE_STEP_M) + 1, SAMPLE_MIN_PER_AXIS, SAMPLE_MAX_PER_AXIS);
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function auditWalkableSurfaces(id: string, scene: THREE.Scene, map: ArenaMap): WalkableArenaResult {
  scene.updateMatrixWorld(true);
  const colliders = [...map.colliders, ...map.physicsColliders].map(orientedCollider);
  const arenaArea = Math.max(1, (map.bounds.maxX - map.bounds.minX) * (map.bounds.maxZ - map.bounds.minZ));

  const excludedByRuleCounts: Record<string, number> = {};
  const findings: WalkableFinding[] = [];
  const surfaces: WalkableSurface[] = [];
  let visibleMeshes = 0;
  let census = 0;
  let supported = 0;

  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (!visibleChain(object)) return;
    visibleMeshes += 1;
    meshes.push(object);
  });

  const exclude = (reason: string) => {
    excludedByRuleCounts[reason] = (excludedByRuleCounts[reason] ?? 0) + 1;
  };

  const candidates = meshes.flatMap((mesh) => surfaceCandidates(
    mesh,
    () => exclude(`instanced mesh over the ${INSTANCE_SAMPLE_CAP}-instance audit cap`),
  ));

  for (const candidate of candidates) {
    const { mesh } = candidate;
    const quad = topFaceQuad(mesh.geometry, candidate.matrixWorld);
    if (!quad) continue;
    const topY = Math.max(...quad.map((corner) => corner.y));
    if (topY < WALKABLE_MIN_TOP_Y_M) continue;
    const spanX = Math.max(...quad.map((c) => c.x)) - Math.min(...quad.map((c) => c.x));
    const spanZ = Math.max(...quad.map((c) => c.z)) - Math.min(...quad.map((c) => c.z));
    if (spanX < WALKABLE_MIN_SPAN_M || spanZ < WALKABLE_MIN_SPAN_M) continue;
    // Real quad area (shoelace on XZ), so a diagonal panel is not credited
    // with its AABB.
    let area = 0;
    for (let index = 0; index < 4; index += 1) {
      const a = quad[index];
      const b = quad[(index + 1) % 4];
      area += a.x * b.z - b.x * a.z;
    }
    area = Math.abs(area) / 2;
    if (area < WALKABLE_MIN_AREA_M2) continue;
    if (area / arenaArea > TERRAIN_FOOTPRINT_SHARE) continue;
    const slopeDeg = quadSlopeDegrees(quad);
    if (slopeDeg > WALKABLE_MAX_SLOPE_DEG) continue;
    const name = mesh.name || `(unnamed ${mesh.type})`;
    // Some authored structural dressing deliberately has a visible top face
    // but is not a player floor. Nuketown2 records that semantic explicitly
    // on its rooflines and exterior stair carpentry; honoring the marker keeps
    // this floor audit about movement surfaces rather than treating every
    // non-solid presentation body as a promised route.
    if (mesh.userData.nuketown2RoofWalkable === false
      || mesh.userData.nuketown2ExteriorStairWalkable === false) {
      exclude('authored non-walkable structural dressing');
      continue;
    }
    const rule = WALKABLE_NAME_RULES.find((entry) => entry.pattern.test(name));
    if (rule) {
      exclude(rule.reason);
      continue;
    }
    // The decisive census question: is there a real flat top FACE here, or
    // only a bounding box with a rounded cap inside it?
    const coverage = flatTopCoverage(mesh.geometry, candidate.matrixWorld, area);
    if (coverage < FLAT_TOP_COVERAGE) {
      exclude('no flat top face (rounded/sculpted cap)');
      continue;
    }

    census += 1;

    // Bilinear sampling over the quad, inset so a float-exact edge is not read
    // as a hole, with the edge ring always sampled: an EDGE GAP is the defect
    // class the owner's "sometimes" points at.
    const countU = sampleCount(quad[0].distanceTo(quad[1]));
    const countV = sampleCount(quad[0].distanceTo(quad[3]));
    const insetU = SAMPLE_INSET_M / Math.max(0.05, quad[0].distanceTo(quad[1]));
    const insetV = SAMPLE_INSET_M / Math.max(0.05, quad[0].distanceTo(quad[3]));
    let samples = 0;
    let unsupportedSamples = 0;
    let overheadBlockedSamples = 0;
    let holeMinX = Infinity;
    let holeMaxX = -Infinity;
    let holeMinZ = Infinity;
    let holeMaxZ = -Infinity;
    let holeSumX = 0;
    let holeSumZ = 0;
    let holeTopSum = 0;
    // Occupancy grid for the connected-component hole measure below. A share
    // alone cannot tell 1 m2 of contiguous open air from the same number of
    // samples sprinkled along four float-authored seams.
    const unsupportedGrid = new Uint8Array(countU * countV);
    for (let iu = 0; iu < countU; iu += 1) {
      const u = insetU + (iu / (countU - 1)) * (1 - 2 * insetU);
      for (let iv = 0; iv < countV; iv += 1) {
        const v = insetV + (iv / (countV - 1)) * (1 - 2 * insetV);
        const point = new THREE.Vector3()
          .copy(quad[0]).multiplyScalar((1 - u) * (1 - v))
          .addScaledVector(quad[1], u * (1 - v))
          .addScaledVector(quad[2], u * v)
          .addScaledVector(quad[3], (1 - u) * v);
        samples += 1;
        if (overheadBlockedAt(colliders, point.x, point.y, point.z)) overheadBlockedSamples += 1;
        if (supportedAt(colliders, point.x, point.y, point.z)) continue;
        unsupportedSamples += 1;
        unsupportedGrid[iu * countV + iv] = 1;
        holeMinX = Math.min(holeMinX, point.x);
        holeMaxX = Math.max(holeMaxX, point.x);
        holeMinZ = Math.min(holeMinZ, point.z);
        holeMaxZ = Math.max(holeMaxZ, point.z);
        holeSumX += point.x;
        holeSumZ += point.z;
        holeTopSum += point.y;
      }
    }
    if (samples > 0 && overheadBlockedSamples / samples >= CLEARANCE_BLOCKED_SHARE) {
      census -= 1;
      exclude('no standing clearance above (ceiling/soffit/shelf)');
      continue;
    }
    const unsupportedShare = samples === 0 ? 0 : unsupportedSamples / samples;
    // Largest CONTIGUOUS hole, in m2. The grid is uniform over the quad, so one
    // cell is the quad's real area divided by the sample count; 4-connected so
    // two regions touching only at a corner are not fused into one.
    const cellArea = samples === 0 ? 0 : area / samples;
    const largestHoleM2 = round(largestConnectedRegion(unsupportedGrid, countU, countV) * cellArea);
    const centre: [number, number, number] = [
      round(quad.reduce((sum, c) => sum + c.x, 0) / 4),
      round(topY),
      round(quad.reduce((sum, c) => sum + c.z, 0) / 4),
    ];
    surfaces.push({
      name: candidate.instance === null ? name : `${name}#${candidate.instance}`,
      centre,
      span: [round(spanX), round(spanZ)],
      area: round(area),
      topY: round(topY),
      slopeDeg: round(slopeDeg),
      unsupportedShare: round(unsupportedShare),
      largestHoleM2,
      quad: quad.map((corner) => [round(corner.x), round(corner.y), round(corner.z)] as [number, number, number]),
    });
    const trippedShare = unsupportedShare > UNSUPPORTED_SHARE_FLOOR;
    const trippedHole = largestHoleM2 > UNSUPPORTED_HOLE_FLOOR_M2;
    if (!trippedShare && !trippedHole) {
      supported += 1;
      continue;
    }
    const holeCentreX = holeSumX / unsupportedSamples;
    const holeCentreZ = holeSumZ / unsupportedSamples;
    const holeTopY = holeTopSum / unsupportedSamples;
    const landing = highestColliderTopUnder(colliders, holeCentreX, holeCentreZ, holeTopY - SUPPORT_TOLERANCE_M);
    findings.push({
      name: candidate.instance === null ? name : `${name}#${candidate.instance}`,
      path: objectPath(mesh),
      centre,
      span: [round(spanX), round(spanZ)],
      area: round(area),
      topY: round(topY),
      slopeDeg: round(slopeDeg),
      unsupportedShare: round(unsupportedShare),
      samples,
      unsupportedSamples,
      largestHoleM2,
      trippedBy: trippedShare && trippedHole ? 'share+hole' : trippedShare ? 'share' : 'hole',
      hole: [round(holeMinX), round(holeMaxX), round(holeMinZ), round(holeMaxZ)],
      bestColliderTopUnderHole: landing,
      dropM: landing === null ? round(holeTopY) : round(holeTopY - landing),
    });
  }

  findings.sort((a, b) => (b.unsupportedShare * b.area) - (a.unsupportedShare * a.area));
  surfaces.sort((a, b) => b.topY - a.topY || b.area - a.area);
  return {
    id,
    colliderCount: colliders.length,
    visibleMeshes,
    census,
    supported,
    excludedByRuleCounts,
    findings,
    surfaces,
  };
}

/**
 * ROOF-LEVEL EYE CLEARANCE.
 *
 * `scripts/qa/sweep-eye-clearance-spots.ts` samples eye heights 1.70 / 1.16 /
 * 0.61 in ABSOLUTE world Y, so every spot it generates stands on grade: it has
 * never looked at a roof, a deck or a container top on any arena. This
 * measures the same question one storey up - how much room is there above each
 * elevated walkable surface - so a fix that adds movement authority cannot
 * quietly create a low ceiling over a place players stand.
 *
 * Returns metres of clear air above each surface's worst sampled point,
 * capped at `limit`.
 */
export function measureRoofClearance(
  map: Pick<ArenaMap, 'colliders' | 'physicsColliders'>,
  surfaces: readonly WalkableSurface[],
  limit = 3,
  inset = CLEARANCE_SAMPLE_INSET_M,
): Array<{ name: string; centre: [number, number, number]; minClearanceM: number; worstPoint: [number, number] }> {
  const colliders = [...map.colliders, ...map.physicsColliders].map(orientedCollider);
  const step = 0.02;
  return surfaces.map((surface) => {
    const [a, b, c, d] = surface.quad;
    let minClearance = limit;
    let worstPoint: [number, number] = [surface.centre[0], surface.centre[2]];
    const perAxis = 9;
    // Sample the standable INTERIOR. A capsule centre can never come closer
    // than its own radius to a wall, so an edge sample that grazes the parapet
    // beside a roof reports 0.02 m of "ceiling" that no player can ever be in.
    const insetU = Math.min(0.45, inset / Math.max(0.05, Math.hypot(b[0] - a[0], b[2] - a[2])));
    const insetV = Math.min(0.45, inset / Math.max(0.05, Math.hypot(d[0] - a[0], d[2] - a[2])));
    for (let iu = 0; iu < perAxis; iu += 1) {
      const u = insetU + (iu / (perAxis - 1)) * (1 - 2 * insetU);
      for (let iv = 0; iv < perAxis; iv += 1) {
        const v = insetV + (iv / (perAxis - 1)) * (1 - 2 * insetV);
        const x = a[0] * (1 - u) * (1 - v) + b[0] * u * (1 - v) + c[0] * u * v + d[0] * (1 - u) * v;
        const y = a[1] * (1 - u) * (1 - v) + b[1] * u * (1 - v) + c[1] * u * v + d[1] * (1 - u) * v;
        const z = a[2] * (1 - u) * (1 - v) + b[2] * u * (1 - v) + c[2] * u * v + d[2] * (1 - u) * v;
        let clearance = limit;
        for (let offset = step; offset <= limit; offset += step) {
          if (colliders.some((collider) => containsPoint(collider, x, y + offset, z))) {
            clearance = offset;
            break;
          }
        }
        if (clearance < minClearance) {
          minClearance = clearance;
          worstPoint = [round(x), round(z)];
        }
      }
    }
    return { name: surface.name, centre: surface.centre, minClearanceM: round(minClearance), worstPoint };
  });
}

/** Builds each arena the way the game does and runs Direction D over it. */
export async function runWalkableSurfaceParityAudit(
  arenaIds: readonly string[] = ALL_ARENA_IDS,
): Promise<WalkableArenaResult[]> {
  installHeadlessArenaShims();
  const factories = await loadArenaFactories();
  const results: WalkableArenaResult[] = [];
  for (const id of arenaIds) {
    const entry = factories[id];
    if (!entry) {
      results.push({ id, error: 'unknown arena id' });
      continue;
    }
    try {
      const scene = new THREE.Scene();
      const built = entry.build(scene);
      const map = { ...built, id: built.id ?? id } as ArenaMap;
      await entry.enrich?.(scene);
      results.push(auditWalkableSurfaces(id, scene, map));
    } catch (error) {
      results.push({ id, error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
    }
  }
  return results;
}
