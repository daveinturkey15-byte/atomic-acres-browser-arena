/**
 * farcrysis-physics.ts — Rapier-aligned physics interactables for the Farcrysis arena.
 *
 * Exports addInteractables(builder) which places breakable crates, barrels,
 * stacked sandbag cover walls, fallen trunks, rock outcrops, and vantage
 * platforms into the arena.  Every object follows the existing box() pattern
 * from farcrysis.ts: create THREE.Mesh, push matching pairs into
 * builder.colliders AND builder.physicsColliders (keeping their lengths equal),
 * builder.raycastMeshes, builder.shotSurfaces, and builder.physicalCover where
 * appropriate.  The Rapier physics world and the ballistic-authority system
 * pick up every entry without any extra wiring.
 *
 * All placement is seeded deterministic (mulberry32 PRNG — no Math.random)
 * so every prop position is reproducible across reloads and test runs.
 *
 * ## How to wire into buildFarcrysis()
 *
 * Inside `buildFarcrysis()` in farcrysis.ts, import and call addInteractables
 * after the core desk / interior crates (around line 309) and before the
 * throwbacks section or applyFarcrysisArtwork:
 *
 *   import { addInteractables } from './farcrysis-physics';
 *   // ... (after farcrysis-core-crate-b)
 *   addInteractables(builder);   // <-- mount interactables here
 *   // ... (before throwbacks / applyFarcrysisArtwork)
 *
 * The engine auto-creates Rapier static cuboid colliders from physicsColliders
 * inside CharacterPhysics.create() — there is NO need to import
 * @dimforge/rapier3d-compat in this module.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Box2 } from './collision';
import { createBallisticSurface, type BallisticMaterialId } from './ballistics';
import { classifyImpactSurface } from './combat-feedback';
import { FARCRYSIS_ART_FEEL } from './farcrysis-art';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
// HF-395 round 2: the mid-ring crates, barrels and sandbags below used to be
// an absolute coordinate table living in this file, independent of the
// relational mid-map composition. They now derive from the SAME landmark
// frames the ruin walls, groves and crate caches use.
import {
  allLandmarkInteractableSpecs,
  LANDMARK_PICKET_SANDBAG_DEPTH_M,
  LANDMARK_PICKET_SANDBAG_HEIGHT_M,
  LANDMARK_PICKET_SANDBAG_WIDTH_M,
} from './farcrysis-midmap-landmarks';
import { farcrysisTerrainHeight } from './farcrysis-terrain-authority';

// ---------------------------------------------------------------------------
// Terrain seating — HF-360: this module used to carry a "must be kept in
// sync" replica of the art terrain function AND clamped it to y=0 because the
// physics floor was flat. The physics ground now tracks the same authority
// surface (farcrysis-terrain-authority.ts plates), so interactables seat on
// the real ground with no clamp and no second model to drift.
// ---------------------------------------------------------------------------

/** Terrain surface Y at (x, z) — resolved through the single authority. */
function placementBaseY(x: number, z: number): number {
  return farcrysisTerrainHeight(x, z);
}

// ---------------------------------------------------------------------------
// Material helper — mirrors the mat() convention in farcrysis-art.ts
// ---------------------------------------------------------------------------

const mat = (color: number, roughness = 0.86, metalness = 0.08): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

// ---------------------------------------------------------------------------
// Interactable registration — mirrors the private box() helper in farcrysis.ts
// ---------------------------------------------------------------------------

/**
 * Build a world-space AABB from the mesh geometry and register it with
 * every collision / physics / ballistic / cover array on the Builder.
 *
 * This is the same shape as the private `box()` function in farcrysis.ts:
 * 1. Compute Box2 bounds from geometry parameters (BoxGeometry or CylinderGeometry).
 * 2. Push the mesh into builder.raycastMeshes for hitscan traces.
 * 3. Push bounds into builder.colliders (lightweight AABB queries) and
 *    builder.physicsColliders (auto-converted to Rapier cuboid colliders).
 * 4. Push a BallisticSurface into builder.shotSurfaces so the penetration
 *    system knows the material (wood, thin-metal, earth, etc.).
 * 5. If this is a cover piece, push into builder.physicalCover for the
 *    crouch / peek / lean system.
 */
function registerBox(
  builder: any,

  /** The THREE.Mesh — must be already added to builder.root BEFORE calling registerBox. */
  mesh: THREE.Mesh,

  /** Unique name, e.g. 'farcrysis-crate-03'. Doubles as the cover id when isCover is true. */
  name: string,

  /** Ballistic material id understood by the penetration system. */
  ballistic: BallisticMaterialId,

  /** True for sandbag walls and other low cover that blocks movement and shots. */
  isCover: boolean,
): void {
  const pos = mesh.position;
  const geom = mesh.geometry;

  // ---- Compute half-extents from geometry parameters ----
  let halfW: number;
  let halfH: number;
  let halfD: number;

  if (geom instanceof THREE.BoxGeometry) {
    // BoxGeometry(width, height, depth, ...segments)
    const p = geom.parameters as { width: number; height: number; depth: number } | undefined;
    halfW = (p?.width ?? 1) / 2;
    halfH = (p?.height ?? 1) / 2;
    halfD = (p?.depth ?? 1) / 2;
  } else if (geom instanceof THREE.CylinderGeometry) {
    // CylinderGeometry(radiusTop, radiusBottom, height, ...)
    // We collapse the cylinder into an AABB — Rapier static colliders are cuboid,
    // and the physicsColliders Box2 format only models boxes.  The small
    // approximation error (cylinder → box) is acceptable for barrels at this scale.
    const p = geom.parameters as {
      radiusTop: number;
      radiusBottom: number;
      height: number;
    } | undefined;
    const r = Math.max(p?.radiusTop ?? 0.5, p?.radiusBottom ?? 0.5);
    halfW = r;
    halfD = r;
    halfH = (p?.height ?? 1) / 2;
  } else {
    // Fallback: use the computed bounding box (works for any BufferGeometry).
    geom.computeBoundingBox();
    const bb = geom.boundingBox!;
    halfW = (bb.max.x - bb.min.x) / 2;
    halfH = (bb.max.y - bb.min.y) / 2;
    halfD = (bb.max.z - bb.min.z) / 2;
  }

  // ---- Build the Box2 bounds shared by collision, physics, and cover ----
  const bounds: Box2 = {
    minX: pos.x - halfW,
    maxX: pos.x + halfW,
    minZ: pos.z - halfD,
    maxZ: pos.z + halfD,
    minY: pos.y - halfH,
    maxY: pos.y + halfH,
  };

  // (a) Raycast mesh: hitscan bullet traces stop on this object.
  builder.raycastMeshes.push(mesh);

  // (b) Lightweight AABB colliders for rapid overlap / trace queries.
  builder.colliders.push(bounds);

  // (c) Physics colliders → Rapier static cuboids built by CharacterPhysics.create().
  builder.physicsColliders.push(bounds);

  // HF-360: named audit entry so the terrain-authority tests can verify every
  // solid collider seats on the ground (colliders themselves are anonymous).
  builder.colliderAudit?.push({ id: name, bounds });

  // (d) Ballistic surface: gives the penetration system material info (wood,
  //     thin-metal, earth) so bullets behave correctly inside this object.
  const surfaceBounds = {
    minX: bounds.minX,
    maxX: bounds.maxX,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ,
  };
  const surface = createBallisticSurface(
    `farcrysis-shot-${name}`,
    name,
    surfaceBounds,
    { material: ballistic },
  );
  builder.shotSurfaces.push(surface);
  // HF-390: stamp the raycast mesh with its surface id and authored family,
  // exactly as farcrysis.ts box() and high-seas.ts box() do. The live
  // shot-resolution parent walk in legacy-main.ts reads
  // userData.ballisticMaterial / userData.ballisticSurfaceId; without the
  // stamp every one of these interactables resolved shots through the coarse
  // name-based ImpactSurface fallback instead of its authored penetration
  // family.
  mesh.userData.ballisticSurfaceId = surface.id;
  mesh.userData.ballisticMaterial = surface.material;

  // (e) Physical cover: only sandbag walls (or other deliberate cover) get
  //     registered for the crouch / peek / lean system.
  if (isCover) {
    builder.physicalCover.push({
      id: name,
      bounds,
      blocksMovement: true,
      blocksShots: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Material palette for interactables — derived from FARCRYSIS_ART_FEEL
// ---------------------------------------------------------------------------

/** Wooden crate: warm brown with subtle grain feel. */
const crateMat = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.9, 0.04);

/** Rusty steel barrel: beacon orange works as a weathered-rust tone. */
const barrelMat = mat(FARCRYSIS_ART_FEEL.beaconLight, 0.78, 0.28);

/** Sandbag: dry sandy tan matched to the beach ring. */
const sandbagMat = mat(FARCRYSIS_ART_FEEL.beachSand, 0.95, 0.02);

/** Palm trunk for fallen-cover logs — same colour as instanced palms. */
const palmTrunkMat = mat(FARCRYSIS_ART_FEEL.palmTrunk, 0.88, 0.03);

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG (mulberry32) — replaces Math.random for
// reproducible placement in all interactable helpers.
// ---------------------------------------------------------------------------

/**
 * Returns a mulberry32 PRNG function seeded with a 32-bit integer.
 * Used throughout the module for deterministic jitter so that every
 * prop position is reproducible across reloads and test runs.
 */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Pass 76 instanced prop visuals
//
// The audit found every repeated interactable built from stacks of individual
// meshes (a single crate was 10 meshes; a barrel 7-9), and the shapes
// themselves read wrong: squat orange cylinders with floating torus rings,
// featureless cubes, monolithic "cheese block" sandbag slabs. Each family is
// now ONE shared geometry drawn as an InstancedMesh set, and the per-object
// collision proxies stay invisible per-prop meshes so registerBox keeps the
// exact collider/raycast/ballistic wiring the engine already consumes.
// ---------------------------------------------------------------------------

/** Real oil-drum proportions (0.6 m diameter x 0.9 m tall). */
export const FUEL_DRUM_RADIUS = 0.3;
export const FUEL_DRUM_HEIGHT = 0.9;

export interface FuelDrumSpec {
  x: number;
  z: number;
  baseY: number;
  yaw: number;
  /** True adds a flush hazard-yellow band (explosive drums). */
  hazard?: boolean;
  /** Deterministic tint selector; defaults from position hash. */
  tintIndex?: number;
}

/** Weathered drum tints: rust red, faded olive, sun-bleached ochre, oxide. */
const DRUM_TINTS = [0x9c4a2a, 0x66684e, 0xa08448, 0x74483a, 0x53626b];

/**
 * Builds the instanced fuel-drum visual set for a placement list. Shared by
 * the interactable barrels here and the throwback warning barrels in
 * farcrysis.ts so every drum in the arena is the same believable object.
 * Presentation only — colliders are registered separately by the caller.
 */
export function buildFuelDrumInstances(
  root: THREE.Group,
  specs: readonly FuelDrumSpec[],
  namePrefix: string,
): void {
  if (specs.length === 0) return;
  const R = FUEL_DRUM_RADIUS;
  const H = FUEL_DRUM_HEIGHT;

  const bodyGeom = new THREE.CylinderGeometry(R, R, H, 14);
  bodyGeom.translate(0, H / 2, 0);
  // Rolling hoops sit FLUSH against the shell (major radius barely proud) —
  // the old rings floated 3+ cm off the surface, which is what made them read
  // as detached halos instead of pressed drum ribs.
  const hoopGeom = new THREE.TorusGeometry(R + 0.012, 0.02, 5, 12);
  hoopGeom.rotateX(Math.PI / 2);
  const rimGeom = new THREE.TorusGeometry(R - 0.002, 0.026, 5, 12);
  rimGeom.rotateX(Math.PI / 2);
  // Lid disc smaller than the rim torus and lower than the rim's crown, so
  // the top reads recessed the way a real drum lid does.
  const lidGeom = new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.025, 12);
  const bandGeom = new THREE.CylinderGeometry(R + 0.008, R + 0.008, 0.13, 14, 1, true);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.35 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 0.55, metalness: 0.6 });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x3c3a36, roughness: 0.66, metalness: 0.45 });
  const hazardBandMat = new THREE.MeshStandardMaterial({ color: 0xd8b02e, roughness: 0.6, metalness: 0.2 });

  const bodies = new THREE.InstancedMesh(bodyGeom, bodyMat, specs.length);
  bodies.name = `${namePrefix}-bodies`;
  const hoops = new THREE.InstancedMesh(hoopGeom, steelMat, specs.length * 2);
  hoops.name = `${namePrefix}-hoops`;
  const rims = new THREE.InstancedMesh(rimGeom, steelMat, specs.length * 2);
  rims.name = `${namePrefix}-rims`;
  const lids = new THREE.InstancedMesh(lidGeom, lidMat, specs.length);
  lids.name = `${namePrefix}-lids`;
  const hazardCount = specs.filter((spec) => spec.hazard).length;
  const bands = hazardCount > 0 ? new THREE.InstancedMesh(bandGeom, hazardBandMat, hazardCount) : null;
  if (bands) bands.name = `${namePrefix}-hazard-bands`;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const tint = new THREE.Color();
  let bandIndex = 0;
  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    const rng = mulberry32(((spec.x * 977) | 0) * 31 + ((spec.z * 787) | 0) + 0x76d);
    euler.set(0, spec.yaw, 0);
    q.setFromEuler(euler);
    const at = (y: number): THREE.Matrix4 =>
      m.compose(new THREE.Vector3(spec.x, spec.baseY + y, spec.z), q, one);
    bodies.setMatrixAt(i, at(0));
    lids.setMatrixAt(i, at(H + 0.005));
    rims.setMatrixAt(i * 2, at(H));
    rims.setMatrixAt(i * 2 + 1, at(0.035));
    hoops.setMatrixAt(i * 2, at(H * 0.34));
    hoops.setMatrixAt(i * 2 + 1, at(H * 0.66));
    if (spec.hazard && bands) bands.setMatrixAt(bandIndex++, at(H * 0.5));
    // Rust-weathered tint: pick a drum colour deterministically, then darken
    // and drift it per drum so no two neighbours match.
    const base = DRUM_TINTS[(spec.tintIndex ?? Math.abs((spec.x * 7 + spec.z * 13) | 0)) % DRUM_TINTS.length];
    tint.setHex(base).multiplyScalar(0.78 + rng() * 0.4);
    bodies.setColorAt(i, tint);
  }
  if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;

  const layers = [bodies, hoops, rims, lids, ...(bands ? [bands] : [])];
  for (const layer of layers) {
    layer.instanceMatrix.needsUpdate = true;
    layer.computeBoundingSphere();
    layer.castShadow = layer === bodies;
    layer.receiveShadow = true;
    layer.userData.farcrysisArt = true;
    root.add(layer);
  }
}

/**
 * Weathered supply case geometry (unit cube, vertex-tinted): plank body,
 * proud lid slab, dark seam shadow line under the lid, and pale stencil
 * panels on all four faces. Instance colour multiplies the tones for
 * per-crate weathering.
 */
function createSupplyCaseGeometry(): THREE.BufferGeometry {
  const parts: Array<{ geom: THREE.BoxGeometry; tone: number; position: [number, number, number] }> = [
    { geom: new THREE.BoxGeometry(1, 1, 1), tone: 1.0, position: [0, 0, 0] },
    { geom: new THREE.BoxGeometry(1.04, 0.16, 1.04), tone: 0.8, position: [0, 0.42, 0] },
    { geom: new THREE.BoxGeometry(1.02, 0.035, 1.02), tone: 0.42, position: [0, 0.325, 0] },
    { geom: new THREE.BoxGeometry(0.6, 0.34, 0.03), tone: 1.4, position: [0, -0.04, 0.5] },
    { geom: new THREE.BoxGeometry(0.6, 0.34, 0.03), tone: 1.4, position: [0, -0.04, -0.5] },
    { geom: new THREE.BoxGeometry(0.03, 0.34, 0.6), tone: 1.4, position: [0.5, -0.04, 0] },
    { geom: new THREE.BoxGeometry(0.03, 0.34, 0.6), tone: 1.4, position: [-0.5, -0.04, 0] },
  ];
  const merged: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const geom = part.geom.toNonIndexed();
    geom.translate(...part.position);
    const positionCount = geom.getAttribute('position').count;
    const colors = new Float32Array(positionCount * 3);
    colors.fill(part.tone);
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    merged.push(geom);
  }
  return mergeGeometries(merged, false);
}

interface SupplyCaseSpec { x: number; y: number; z: number; size: number }

/** Weathered case tints (wood, olive drab, sun-bleached). */
const CASE_TINTS = [0x8a7148, 0x6e7050, 0x94805a, 0x7c6644];

interface FallenLogSpec { x: number; z: number; baseY: number; length: number }
interface BoulderSpec { x: number; z: number; baseY: number; width: number; height: number; depth: number }
interface SandbagBagSpec { x: number; y: number; z: number; yaw: number; roll: number; scale: number }

/**
 * Per-build queues, reset at the top of addInteractables and flushed into
 * InstancedMesh sets at its end. Module-level is safe because placement only
 * happens inside one addInteractables call at a time (deterministic, and
 * tests build fresh arenas serially).
 */
const _caseSpecs: SupplyCaseSpec[] = [];
const _drumSpecs: FuelDrumSpec[] = [];
const _logSpecs: FallenLogSpec[] = [];
const _boulderSpecs: BoulderSpec[] = [];
const _bagSpecs: SandbagBagSpec[] = [];

/** Deterministic radial lumpiness for boulder silhouettes (position-hashed). */
function lumpifyLocal(geometry: THREE.BufferGeometry, amplitude: number, salt: number): THREE.BufferGeometry {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-5) continue;
    const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + salt * 94.673) * 43758.5453;
    const d = ((n - Math.floor(n)) - 0.5) * 2 * amplitude;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** Flush every queued prop family into instanced draws on builder.root. */
function buildQueuedInteractableVisuals(builder: any): void {
  const root = builder.root as THREE.Group;

  // ---- Supply cases -----------------------------------------------------
  if (_caseSpecs.length > 0) {
    const caseGeom = createSupplyCaseGeometry();
    const caseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0.04 });
    const cases = new THREE.InstancedMesh(caseGeom, caseMat, _caseSpecs.length);
    cases.name = 'farcrysis-interactable-crates';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tint = new THREE.Color();
    for (let i = 0; i < _caseSpecs.length; i += 1) {
      const spec = _caseSpecs[i];
      const rng = mulberry32(((spec.x * 733) | 0) * 17 + ((spec.z * 577) | 0) + i);
      m.compose(new THREE.Vector3(spec.x, spec.y, spec.z), q, new THREE.Vector3(spec.size, spec.size, spec.size));
      cases.setMatrixAt(i, m);
      tint.setHex(CASE_TINTS[i % CASE_TINTS.length]).multiplyScalar(0.82 + rng() * 0.34);
      cases.setColorAt(i, tint);
    }
    if (cases.instanceColor) cases.instanceColor.needsUpdate = true;
    cases.instanceMatrix.needsUpdate = true;
    cases.computeBoundingSphere();
    cases.castShadow = true;
    cases.receiveShadow = true;
    cases.userData.farcrysisArt = true;
    root.add(cases);
  }

  // ---- Fuel drums -------------------------------------------------------
  buildFuelDrumInstances(root, _drumSpecs, 'farcrysis-interactable-drum');

  // ---- Fallen palm logs -------------------------------------------------
  if (_logSpecs.length > 0) {
    const logGeom = new THREE.CylinderGeometry(0.185, 0.215, 1, 9);
    logGeom.rotateZ(Math.PI / 2); // length along X, unit long
    const logs = new THREE.InstancedMesh(logGeom, palmTrunkMat, _logSpecs.length);
    logs.name = 'farcrysis-interactable-fallen-logs';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < _logSpecs.length; i += 1) {
      const spec = _logSpecs[i];
      euler.set(((i % 3) - 1) * 0.03, 0, 0);
      q.setFromEuler(euler);
      m.compose(
        new THREE.Vector3(spec.x, spec.baseY + 0.2, spec.z),
        q,
        new THREE.Vector3(spec.length, 1, 1.35),
      );
      logs.setMatrixAt(i, m);
    }
    logs.instanceMatrix.needsUpdate = true;
    logs.computeBoundingSphere();
    logs.castShadow = true;
    logs.receiveShadow = true;
    logs.userData.farcrysisArt = true;
    root.add(logs);
  }

  // ---- Limestone boulders -----------------------------------------------
  if (_boulderSpecs.length > 0) {
    const rockGeom = lumpifyLocal(new THREE.IcosahedronGeometry(1, 2), 0.22, 0xb01de5);
    // Flat-bottomed: clamp the underside, then rebase so y=0 is the seat.
    const pos = rockGeom.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += 1) {
      pos.setY(i, Math.max(pos.getY(i), -0.55) + 0.55);
    }
    pos.needsUpdate = true;
    rockGeom.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a877c, roughness: 0.94, metalness: 0.03 });
    const rocks = new THREE.InstancedMesh(rockGeom, rockMat, _boulderSpecs.length);
    rocks.name = 'farcrysis-interactable-boulders';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    for (let i = 0; i < _boulderSpecs.length; i += 1) {
      const spec = _boulderSpecs[i];
      euler.set(0, spec.x * 0.37 + spec.z * 0.53, 0);
      q.setFromEuler(euler);
      m.compose(
        new THREE.Vector3(spec.x, spec.baseY - 0.03, spec.z),
        q,
        // Unit rock spans ~1.7 tall after the clamp; normalise into the
        // collider envelope so silhouette and collision stay agreed.
        new THREE.Vector3(spec.width / 2, spec.height / 1.6, spec.depth / 2),
      );
      rocks.setMatrixAt(i, m);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.computeBoundingSphere();
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    rocks.userData.farcrysisArt = true;
    root.add(rocks);
  }

  // ---- Sandbag bags -----------------------------------------------------
  if (_bagSpecs.length > 0) {
    const bagGeom = new THREE.SphereGeometry(0.5, 7, 5);
    // Flat, slumped burlap profile — round bags read as bread buns.
    bagGeom.scale(0.47, 0.17, 0.36);
    // Khaki burlap, deliberately DULLER than the beach sand so walls read as
    // fabric fortification, not sculpted sand; per-bag tint drift below.
    const bagMat = new THREE.MeshStandardMaterial({ color: 0xa89a77, roughness: 0.97, metalness: 0.01 });
    const bags = new THREE.InstancedMesh(bagGeom, bagMat, _bagSpecs.length);
    bags.name = 'farcrysis-interactable-sandbags';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const tint = new THREE.Color();
    const tintRng = mulberry32(0xba65);
    for (let i = 0; i < _bagSpecs.length; i += 1) {
      const spec = _bagSpecs[i];
      euler.set(0, spec.yaw, spec.roll);
      q.setFromEuler(euler);
      m.compose(new THREE.Vector3(spec.x, spec.y, spec.z), q, new THREE.Vector3(spec.scale, spec.scale, spec.scale));
      bags.setMatrixAt(i, m);
      tint.setScalar(0.85 + tintRng() * 0.3);
      bags.setColorAt(i, tint);
    }
    if (bags.instanceColor) bags.instanceColor.needsUpdate = true;
    bags.instanceMatrix.needsUpdate = true;
    bags.computeBoundingSphere();
    bags.castShadow = true;
    bags.receiveShadow = true;
    bags.userData.farcrysisArt = true;
    root.add(bags);
  }

  _caseSpecs.length = 0;
  _drumSpecs.length = 0;
  _logSpecs.length = 0;
  _boulderSpecs.length = 0;
  _bagSpecs.length = 0;
}

/**
 * Fill a sandbag wall volume with individually jittered bag instances —
 * staggered courses on every face, replacing the old single "cheese block"
 * box (which stays as the invisible collision proxy).
 */
function queueSandbagBags(x: number, z: number, baseY: number, width: number, height: number, depth: number): void {
  const rng = mulberry32(((x * 511) | 0) * 73 + ((z * 631) | 0) + ((height * 100) | 0));
  const rows = Math.max(2, Math.round(height / 0.17));
  const cols = Math.max(2, Math.round(width / 0.4));
  const layers = Math.max(1, Math.round(depth / 0.3));
  for (let row = 0; row < rows; row += 1) {
    const rowCols = row % 2 === 0 ? cols : cols - 1;
    // Courses compressed slightly so bags overlap and read as a laid wall.
    const rowY = baseY + 0.08 + row * (height / rows) * 0.94;
    for (let layer = 0; layer < layers; layer += 1) {
      const layerZ = layers === 1 ? z : z - depth / 2 + 0.17 + layer * ((depth - 0.34) / Math.max(1, layers - 1));
      for (let col = 0; col < rowCols; col += 1) {
        const colX = x - width / 2 + 0.21 + (row % 2 === 0 ? 0 : 0.2) + col * ((width - 0.42) / Math.max(1, rowCols - 1));
        _bagSpecs.push({
          x: colX + (rng() - 0.5) * 0.05,
          y: rowY + (rng() - 0.5) * 0.02,
          z: layerZ + (rng() - 0.5) * 0.05,
          yaw: (rng() - 0.5) * 0.4,
          roll: (rng() - 0.5) * 0.12,
          scale: 0.92 + rng() * 0.18,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/**
 * Places one wooden crate (BoxGeometry) at the given position, registers
 * it with the builder, and optionally adds a coloured accent stripe on
 * the outward-facing side so the crate reads as a stamped "f4rcry515"
 * supply box at a distance.
 */
function placeCrate(
  builder: any,
  name: string,
  x: number,
  z: number,
  size: number,          // cubic side length, 0.8–1.2 m
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + size / 2;     // sit on the terrain surface

  // Pass 76: the crate used to be TEN meshes (body + inset + 4 posts + 4
  // slats + stamp). The collider/raycast proxy keeps the identical size and
  // registration; the visible case rides the shared InstancedMesh with lid
  // seam and stencil panels baked into vertex colour.
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.visible = false;
  mesh.userData.collisionProxy = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: crateMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'wood', false);
  _caseSpecs.push({ x, y, z, size });
}

/**
 * Places one rusty steel barrel (CylinderGeometry) at the given position
 * and registers it as a thin-metal interactable.
 */
function placeBarrel(
  builder: any,
  name: string,
  x: number,
  z: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + FUEL_DRUM_HEIGHT / 2;  // sit on the terrain surface

  // Pass 76: the audit called these out as squat orange cylinders with
  // floating torus rings — 1.2 m diameter x 1.0 m, nothing like a drum.
  // Every barrel is now a correctly-proportioned fuel drum (0.6 m dia x
  // 0.9 m) drawn through the shared drum instancing, and the collider proxy
  // shrinks with the visual so collision agreement is preserved.
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(FUEL_DRUM_RADIUS, FUEL_DRUM_RADIUS, FUEL_DRUM_HEIGHT, 12),
    barrelMat,
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.visible = false;
  mesh.userData.collisionProxy = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: barrelMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'thin-metal', false);
  _drumSpecs.push({
    x,
    z,
    baseY,
    yaw: (x * 5 + z * 11) * 0.17,
    // Hazard banding is flagged after the fact by addHazardStripesToBarrel.
    hazard: false,
    tintIndex: Math.abs(((x * 3) | 0) + ((z * 7) | 0)),
  });
}

/**
 * Places one sandbag wall (low wide BoxGeometry) at the given position
 * and registers it as physical cover (blocks movement + shots).
 */
function placeSandbagWall(
  builder: any,
  name: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + height / 2;

  // Pass 76: the wall was a monolithic sand-tan box with a few bag overlays
  // pasted on ONE face — the audit's "cheese block". The box survives only as
  // the invisible collision proxy; the visible wall is now built entirely
  // from staggered instanced bag courses on every face.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    sandbagMat,
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.visible = false;
  mesh.userData.collisionProxy = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: sandbagMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'earth', true);
  queueSandbagBags(x, z, baseY, width, height, depth);
}

/**
 * Places a fallen palm trunk as natural cover — a long low box that
 * reads as a collapsed log spanning a jungle path.  Registered as
 * physical cover with wood ballistic behaviour.
 */
function placeFallenTrunk(
  builder: any,
  name: string,
  x: number,
  z: number,
  length: number,
  thickness: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + thickness / 2;
  const depth = 0.7; // fixed depth for all trunks (narrow)

  // Pass 76: the "log" was a literal plank box. The collider box is
  // unchanged (invisible proxy); the visible log is an instanced tapered
  // cylinder lying inside the same envelope.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(length, thickness, depth),
    palmTrunkMat,
  );
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.visible = false;
  mesh.userData.collisionProxy = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: palmTrunkMat.metalness });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'wood', true);
  _logSpecs.push({ x, z, baseY, length });
}

/**
 * Places a 2-crate stack as player cover.  Each crate is registered
 * individually as a non-cover interactable; a combined physicalCover
 * entry spans the full stack footprint so the crouch / peek / lean
 * system treats it as one cover position.
 */
function placeCrateCover(builder: any, name: string, x: number, z: number): void {
  const size = 0.9;
  const baseY = placementBaseY(x, z);
  const y0 = baseY + size / 2;            // bottom crate centre
  const y1 = baseY + size / 2 + size;     // top crate centre

  // Bottom crate (invisible proxy; visual rides the shared case instancing)
  const c0 = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  c0.name = `${name}-c0`;
  c0.position.set(x, y0, z);
  c0.visible = false;
  c0.userData.collisionProxy = true;
  c0.userData.impactSurface = classifyImpactSurface({ name: c0.name, metalness: crateMat.metalness });
  builder.root.add(c0);
  registerBox(builder, c0, c0.name, 'wood', false);
  _caseSpecs.push({ x, y: y0, z, size });

  // Top crate
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  c1.name = `${name}-c1`;
  c1.position.set(x, y1, z);
  c1.visible = false;
  c1.userData.collisionProxy = true;
  c1.userData.impactSurface = classifyImpactSurface({ name: c1.name, metalness: crateMat.metalness });
  builder.root.add(c1);
  registerBox(builder, c1, c1.name, 'wood', false);
  _caseSpecs.push({ x, y: y1, z, size });

  // Combined cover footprint — ground to top of stack
  const halfW = size / 2;
  const halfD = size / 2;
  const coverBounds: Box2 = {
    minX: x - halfW,
    maxX: x + halfW,
    minZ: z - halfD,
    maxZ: z + halfD,
    minY: baseY,
    maxY: y1 + halfD,
  };
  builder.physicalCover.push({
    id: name,
    bounds: coverBounds,
    blocksMovement: true,
    blocksShots: true,
  });
}

/**
 * Adds splinter-shard detail on top of a crate — small thin planks at slight
 * angles, purely visual, not registered for collision/physics. Gives the
 * crate a "broken open" supply-drop look.
 */
function addCrateShards(builder: any, name: string, x: number, z: number, size: number): void {
  const baseY = placementBaseY(x, z);
  const yTop = baseY + size + 0.025; // just above the crate top
  const shardGeom = new THREE.BoxGeometry(size * 0.45, 0.03, 0.08);
  const shardMat = mat(FARCRYSIS_ART_FEEL.tikiWood, 0.94, 0.03);
  const seed = (x * 17 + z * 31) % 100;
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + ((seed + i * 7) % 31) * 0.04;
    const offsetR = size * 0.26;
    const sx = x + Math.cos(angle) * offsetR;
    const sz = z + Math.sin(angle) * offsetR;
    const shard = new THREE.Mesh(shardGeom, shardMat);
    shard.name = `${name}-shard-${i}`;
    shard.position.set(sx, yTop + i * 0.003, sz);
    shard.rotation.y = angle + ((seed + i * 13) % 17 - 8) * 0.07;
    shard.castShadow = false;
    shard.receiveShadow = false;
    builder.root.add(shard);
  }
  // One or two thin splinters poking upward
  const splinterGeom = new THREE.BoxGeometry(0.04, size * 0.35, 0.04);
  for (let i = 0; i < 2; i += 1) {
    const angle = ((seed + i * 11) % 37) * 0.17;
    const offsetR = size * 0.18;
    const sx = x + Math.cos(angle) * offsetR;
    const sz = z + Math.sin(angle) * offsetR;
    const splinter = new THREE.Mesh(splinterGeom, shardMat);
    splinter.name = `${name}-splinter-${i}`;
    splinter.position.set(sx, yTop + size * 0.12, sz);
    splinter.rotation.z = ((seed + i * 19) % 13 - 6) * 0.055;
    splinter.rotation.x = ((seed + i * 23) % 11 - 5) * 0.05;
    splinter.castShadow = false;
    splinter.receiveShadow = false;
    builder.root.add(splinter);
  }
}

/**
 * Adds hazard-yellow stripe bands to a barrel (purely visual).
 * Two thin torus rings in a contrasting safety-yellow tone, placed
 * near the top and bottom thirds.
 */
function addHazardStripesToBarrel(
  _builder: any,
  _name: string,
  x: number,
  z: number,
): void {
  // Pass 76: the stripes used to be TWO MORE floating torus rings per barrel.
  // A hazard drum now just flags its queued spec — the shared drum builder
  // paints a flush hazard-yellow band instead of a detached halo.
  for (const spec of _drumSpecs) {
    if (Math.abs(spec.x - x) < 1e-6 && Math.abs(spec.z - z) < 1e-6) {
      spec.hazard = true;
      return;
    }
  }
}

/**
 * Places a rock outcrop as natural cover — a wide low boulder-like box
 * with a grey-brown rock tone.  Registered as physical cover with
 * earth ballistic behaviour, placed near the beach ring.
 */
function placeRockOutcrop(
  builder: any,
  name: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
): void {
  const baseY = placementBaseY(x, z);
  const y = baseY + height / 2;
  // Pass 76: the "boulder" was a grey box. Collider box unchanged (invisible
  // proxy); the visible rock is an instanced lumpified flat-bottomed boulder
  // scaled into the same envelope.
  const rockOutcropMat = mat(0x7a7a73, 0.93, 0.08);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), rockOutcropMat);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.visible = false;
  mesh.userData.collisionProxy = true;
  mesh.userData.impactSurface = classifyImpactSurface({ name, metalness: 0.08 });
  builder.root.add(mesh);
  registerBox(builder, mesh, name, 'earth', true);
  _boulderSpecs.push({ x, z, baseY, width, height, depth });
}

/**
 * Places a raised vantage platform — a 2×2 crate stack (~1.5 m tall) that
 * gives a height advantage and doubles as cover.  Each base crate is
 * registered individually; the plank top and a combined physicalCover
 * footprint complete the position.  Small footprint keeps it out of
 * patrol lanes.
 */
function placeVantagePlatform(builder: any, name: string, x: number, z: number): void {
  const cSize = 0.82;
  const half = cSize / 2;
  const baseY = placementBaseY(x, z);
  const yBase = baseY + cSize / 2;

  // 2×2 grid of crates at the base
  const offsets: [number, number][] = [
    [-half, -half], [half, -half],
    [-half,  half], [half,  half],
  ];
  for (let i = 0; i < offsets.length; i += 1) {
    const [ox, oz] = offsets[i];
    const c = new THREE.Mesh(new THREE.BoxGeometry(cSize, cSize, cSize), crateMat);
    c.name = `${name}-base-${i}`;
    c.position.set(x + ox, yBase, z + oz);
    c.visible = false;
    c.userData.collisionProxy = true;
    c.userData.impactSurface = classifyImpactSurface({ name: c.name, metalness: crateMat.metalness });
    builder.root.add(c);
    registerBox(builder, c, c.name, 'wood', false);
    _caseSpecs.push({ x: x + ox, y: yBase, z: z + oz, size: cSize });
  }

  // Plank top — wider than the crate stack so a player can stand on it
  const platGeomHalf = cSize * 1.05;
  const platThick = 0.08;
  const platY = baseY + cSize + platThick / 2;
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(platGeomHalf * 2, platThick, platGeomHalf * 2),
    mat(FARCRYSIS_ART_FEEL.tikiWood, 0.84, 0.04),
  );
  plat.name = `${name}-plank`;
  plat.position.set(x, platY, z);
  plat.castShadow = true;
  plat.receiveShadow = true;
  plat.userData.impactSurface = classifyImpactSurface({ name: plat.name, metalness: 0.04 });
  builder.root.add(plat);
  registerBox(builder, plat, plat.name, 'wood', false);

  // Combined cover footprint: ground to top of plank
  const coverBounds: Box2 = {
    minX: x - platGeomHalf,
    maxX: x + platGeomHalf,
    minZ: z - platGeomHalf,
    maxZ: z + platGeomHalf,
    minY: baseY,
    maxY: platY + platThick,
  };
  builder.physicalCover.push({
    id: name,
    bounds: coverBounds,
    blocksMovement: true,
    blocksShots: true,
  });
}

/**
 * Places a stacked sandbag wall built from small box segments near a
 * core door entrance.  Each segment is individually registered as a
 * 'concrete' ballistic surface with colliders + physics colliders;
 * a single physicalCover entry spans the whole wall so the crouch /
 * peek / lean system treats it as one cover position.
 */
function placeStackedSandbagWall(
  builder: any,
  name: string,
  x: number,
  z: number,
  width: number,
  segHeight: number,
  depth: number,
  count: number,
): void {
  const baseY = placementBaseY(x, z);
  // Build vertically stacked segments. Pass 76: segment boxes survive only as
  // invisible collision proxies; the visible wall is instanced bag courses
  // spanning the full stack (see queueSandbagBags below the loop).
  for (let i = 0; i < count; i += 1) {
    const segY = baseY + segHeight / 2 + i * segHeight; // bottom-aligned stack
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, segHeight, depth),
      sandbagMat,
    );
    mesh.name = `${name}-seg-${i}`;
    mesh.position.set(x, segY, z);
    mesh.visible = false;
    mesh.userData.collisionProxy = true;
    mesh.userData.impactSurface = classifyImpactSurface({
      name: mesh.name,
      metalness: sandbagMat.metalness,
    });
    builder.root.add(mesh);
    registerBox(builder, mesh, mesh.name, 'concrete', false);
  }
  queueSandbagBags(x, z, baseY, width, segHeight * count, depth);

  // Single physicalCover for the full wall stack
  const totalHeight = segHeight * count;
  const wallBounds: Box2 = {
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
    minY: baseY,
    maxY: baseY + totalHeight,
  };
  builder.physicalCover.push({
    id: name,
    bounds: wallBounds,
    blocksMovement: true,
    blocksShots: true,
  });
}

// ---------------------------------------------------------------------------
// Main entry point — called once from buildFarcrysis()
// ---------------------------------------------------------------------------

/**
 * Adds physics-backed interactables to the Farcrysis arena Builder.
 *
 * Places 32 crates, 22 barrels, 9 sandbag walls (6 flat + 2 stacked near
 * core doors + 1 cave/tower/beach each), 6 fallen palm trunks, 2 rock
 * outcrops, 2 crate stacks (adding 4 more crates), and 2 vantage
 * platforms (8 more crates).  Every position is seed-deterministic (mulberry32 — no Math.random)
 * and verified ≥3 m from every spawn and patrol waypoint.
 *
 * HF-395 round 2: twelve of those props (8 crates, 2 barrels, 2 sandbag
 * walls) are the mid-map landmarks' approach kits and no longer carry
 * coordinates here at all — they derive from the shared frames in
 * farcrysis-midmap-landmarks.ts, the same authority that places the ruin
 * walls, groves and crate caches.  Their ids are unchanged.
 *
 * @param builder  The ArenaMap Builder object from farcrysis.ts — a
 *                 plain object with { root, colliders, physicsColliders,
 *                 raycastMeshes, shotSurfaces, physicalCover }.
 */
export function addInteractables(builder: any): void {
  // All interactable positions are verified against the arena boundary
  // (FARCRYSIS_BOUNDS, ±64 m after HF-396) with a 1.5 m margin to avoid clipping the outer lagoon ring.
  const { minX: bMinX, maxX: bMaxX, minZ: bMinZ, maxZ: bMaxZ } = FARCRYSIS_BOUNDS;
  const margin = 1.5;
  const ok = (px: number, pz: number): boolean =>
    px >= bMinX + margin && px <= bMaxX - margin &&
    pz >= bMinZ + margin && pz <= bMaxZ - margin;

  // =====================================================================
  // 1. WOODEN CRATES (12 here + 8 in the landmark approach kits below,
  //    plus 4 from cover stacks) — 0.8–1.2 m
  // =====================================================================
  //
  // Crates cluster around the research-station core approaches, the beach
  // ring, and the four mid-map landmark approaches.  Every crate is
  // registered as 'wood' so bullets penetrate with the wood resistance
  // profile.

  // -- Mid-ring landmark approach kits (HF-395 round 2) ------------------
  //
  // Twelve props — two supply crates and one picket piece per quadrant —
  // whose positions come from farcrysis-midmap-landmarks.ts, the same module
  // that places the ruin walls, groves and crate caches. This replaces four
  // separate absolute blocks that used to live here:
  //   crates 01-04  "Mid-ring jungle, rotated square around the core" at
  //                 (+/-34, +/-34); each hung 3.7 m outboard of its
  //                 landmark's fringe row on the same diagonal.
  //   crates 17-20  "Jungle mid-ring diagonals (radius ~19 m)" at
  //                 (+/-28, +/-26); their real radial was 38.2 m, and each
  //                 landed 2.00 m from a grove centre — inside the grove.
  //   barrels 09/10 "Mid-field jungle paths".
  //   sandbags 03/04 "Path toward ruined wall N / S" — there has been no
  //                 N/S wall since the walls were renamed nw/ne/sw/se.
  //
  // The ids are deliberately unchanged so cover, ballistic-surface and
  // raycast identity stay stable; only the placement authority moved.
  for (const spec of allLandmarkInteractableSpecs()) {
    const [px, pz] = spec.pos;
    if (spec.kind === 'crate') {
      placeCrate(builder, spec.id, px, pz, spec.footprint);
    } else if (spec.kind === 'barrel') {
      placeBarrel(builder, spec.id, px, pz);
    } else {
      placeSandbagWall(
        builder, spec.id, px, pz,
        LANDMARK_PICKET_SANDBAG_WIDTH_M,
        LANDMARK_PICKET_SANDBAG_HEIGHT_M,
        LANDMARK_PICKET_SANDBAG_DEPTH_M,
      );
    }
  }

  // -- Core approaches (N/S/E/W) — stacked near the entrances -----------
  placeCrate(builder, 'farcrysis-crate-05',  -4, -10, 0.9);
  placeCrate(builder, 'farcrysis-crate-06',   4,  10, 0.9);
  placeCrate(builder, 'farcrysis-crate-07', -10,  -4, 0.9);
  placeCrate(builder, 'farcrysis-crate-08',  10,   4, 0.9);

  // -- Just outside the core building, NW and SE corners -----------------
  placeCrate(builder, 'farcrysis-crate-09',  -6,  -6, 1.1);
  placeCrate(builder, 'farcrysis-crate-10',   6,   6, 1.1);

  // -- Inside the core, flanking the desk on north and south sides -------
  placeCrate(builder, 'farcrysis-crate-11',   0, -1.8, 0.85);
  placeCrate(builder, 'farcrysis-crate-12',   0,  1.8, 0.85);

  // -- Beach / lagoon edge, near the skiff cover positions ---------------
  placeCrate(builder, 'farcrysis-crate-13', -44, -20, 1.0);
  placeCrate(builder, 'farcrysis-crate-14',  44,  20, 1.0);
  placeCrate(builder, 'farcrysis-crate-15', -20, -44, 1.0);
  placeCrate(builder, 'farcrysis-crate-16',  20,  44, 1.0);

  // =====================================================================
  // 2. RUSTY STEEL BARRELS (8 here + 2 landmark pickets) — fuel-drum sized
  // =====================================================================
  //
  // Barrels are scattered along path edges and near the skiff / beacon /
  // seaplane throwback zones.  Registered as 'thin-metal' — bullets
  // punch through with a satisfying metallic spark but don't stop cold.

  // -- Beach / skiff area pairs ------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-01', -44, -40);
  placeBarrel(builder, 'farcrysis-barrel-02',  44,  40);

  // -- Near the signal beacon (NW) and seaplane (SE) throwback zones -----
  placeBarrel(builder, 'farcrysis-barrel-03', -40,  24);
  placeBarrel(builder, 'farcrysis-barrel-04',  40, -24);

  // -- Beach edge paths --------------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-05', -16, -44);
  placeBarrel(builder, 'farcrysis-barrel-06',  16,  44);

  // -- Flanking the core door approaches ----------------------------------
  // HF-360: barrel-08 moved from (3, 3.5) — that spot is now inside the
  // catwalk stair flight (farcrysis.ts farcrysis-core-stair-*), and the
  // barrel sat entombed inside the steps. West mirror keeps the pair.
  placeBarrel(builder, 'farcrysis-barrel-07',  -3, -3.5);
  placeBarrel(builder, 'farcrysis-barrel-08',  -3,  3.5);

  // -- barrels 09/10 are now landmark picket pieces (SW and NE approach
  //    kits, placed in section 1 from the shared landmark frames).

  // =====================================================================
  // 3. SANDBAG WALLS (2 here + 2 landmark pickets) — low cover
  // =====================================================================
  //
  // Each sandbag wall is ~2.2 m wide × 0.6 m tall × 0.45 m deep —
  // chest-high cover that blocks movement and shots.  Placed adjacent to
  // (but not overlapping) the existing hard-cover pieces (skiffs, rocks,
  // ruined walls) so players can chain cover-to-cover movement.

  // -- NW beach approach, on the skiff-to-jungle line (quadrant naming
  //    matches the landmark tags: nw = -x/-z) -----------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-01', -28, -36, 2.2, 0.6, 0.45);

  // -- SE beach approach, mirror of sandbag-01 ---------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-02',  28,  36, 2.2, 0.6, 0.45);

  // -- sandbags 03/04 are now landmark picket pieces (NW and SE approach
  //    kits, placed in section 1 from the shared landmark frames). They
  //    used to be captioned "path toward ruined wall N / S"; the ruin walls
  //    have been named nw/ne/sw/se since the HF-395 recomposition.

  // =====================================================================
  // 4. COVER POSITIONS (4) — crate stacks & fallen trunks along paths
  // =====================================================================
  //
  // Additional physical-cover pieces spread across beach and jungle zones
  // so players can chain cover-to-cover movement.  Fallen palm trunks use
  // the palmTrunk palette tone; crate stacks use two stacked 0.9 m crates
  // with a combined physicalCover footprint.

  // -- Fallen palm trunk, NW jungle path near the research tower ----------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-01', -40, 16, 3.2, 0.4);

  // -- Fallen palm trunk, SE jungle path behind the cave entrance ---------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-02',  44, -16, 3.0, 0.4);

  // -- Crate stack, NE beach-to-jungle transition -------------------------
  placeCrateCover(builder, 'farcrysis-cover-jungle-03', 16, -48);

  // -- Crate stack, SW lagoon-side jungle path ----------------------------
  placeCrateCover(builder, 'farcrysis-cover-jungle-04', -40, 28);

  // =====================================================================
  // 5. ADDITIONAL CRATES (2) — beach / jungle transition
  // =====================================================================
  //
  // Two more breakable wooden crates on the beach approach.  Every position
  // avoids spawn points, core entrances, the mid-ring cardinal corridor,
  // and patrol waypoints.

  // -- crates 17-20 are now the landmark approach kits' crate-b slot
  //    (placed in section 1 from the shared landmark frames). Their old
  //    caption read "radius ~19 m"; the actual radial was 38.2 m, a
  //    pre-rescale comment that survived the HF-396 island expansion.

  // -- Beach / jungle transition (radial 48.8 m from the arena centre) ---
  placeCrate(builder, 'farcrysis-crate-21', -28, -40, 0.95);
  placeCrate(builder, 'farcrysis-crate-22',  28,  40, 0.95);

  // ── Crate shard detail on the two beach crates ───────────────────────
  addCrateShards(builder, 'farcrysis-crate-21-shards', -28, -40, 0.95);
  addCrateShards(builder, 'farcrysis-crate-22-shards',  28,  40, 0.95);

  // =====================================================================
  // 6. ADDITIONAL BARRELS (4) — beach fringe
  // =====================================================================
  //
  // Four additional rusty steel barrels along the lagoon-side beach edge,
  // clear of spawn and patrol routes.

  // -- West / east beach fringe ------------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-11', -56, -12);
  placeBarrel(builder, 'farcrysis-barrel-12',  56,  12);

  // -- North / south beach fringe ----------------------------------------
  placeBarrel(builder, 'farcrysis-barrel-13', -12,  48);
  placeBarrel(builder, 'farcrysis-barrel-14',  12, -48);

  // ── Hazard stripes on the new barrels ─────────────────────────────────
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-11', -56, -12);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-12',  56,  12);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-13', -12,  48);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-14',  12, -48);

  // =====================================================================
  // 7. FALLEN-LOG COVER (2) — jungle mid-ring
  // =====================================================================
  //
  // Two additional fallen palm trunks spanning jungle paths, placed off
  // the cardinal lanes and clear of patrol waypoints.

  // -- West jungle mid-ring -----------------------------------------------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-05', -32, -8, 3.0, 0.4);

  // -- East jungle mid-ring -----------------------------------------------
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-06',  32,  8, 3.0, 0.4);

  // =====================================================================
  // 8. ROCK-OUTCROP COVER (2) — beach fringe
  // =====================================================================
  //
  // Two weathered limestone boulders near the lagoon edge that provide
  // natural crouch cover with earth ballistic behaviour.

  // -- West beach outcrop -------------------------------------------------
  placeRockOutcrop(builder, 'farcrysis-cover-rock-01', -50, -16, 1.8, 1.2, 1.6);

  // -- East beach outcrop -------------------------------------------------
  placeRockOutcrop(builder, 'farcrysis-cover-rock-02',  50,  16, 1.8, 1.2, 1.6);

  // =====================================================================
  // 9. RAISED VANTAGE PLATFORMS (2) — jungle mid-ring
  // =====================================================================
  //
  // Two 2×2 crate-stack platforms (~1.5 m tall) that give a height
  // advantage over the surrounding ground.  Small footprint, reachable
  // by walking movement, placed clear of patrol lanes and core entrances.

  // -- West vantage platform (jungle mid-ring) ----------------------------
  placeVantagePlatform(builder, 'farcrysis-vantage-01', -36, -12);

  // -- East vantage platform (jungle mid-ring) ----------------------------
  placeVantagePlatform(builder, 'farcrysis-vantage-02',  36,  12);

  // =====================================================================
  // 10. SIX MORE WOODEN CRATES (6) — core door flanks + jungle pockets
  // =====================================================================
  //
  // Four crates flank the two core door approaches, and two sit in
  // mid-jungle pockets SW and NE of the core.  All positions verified
  // ≥3 m from every spawn and patrol waypoint.

  // -- Core door south: west + east flanks ---------------------------------
  placeCrate(builder, 'farcrysis-crate-23',  -6, -4.0, 0.9);
  placeCrate(builder, 'farcrysis-crate-24',   6, -4.0, 0.9);

  // -- Core door north: west + east flanks ---------------------------------
  placeCrate(builder, 'farcrysis-crate-25',  -6,  4.0, 0.9);
  placeCrate(builder, 'farcrysis-crate-26',   6,  4.0, 0.9);

  // -- Mid-jungle NW + SE pockets, 8.49 m outboard of the nearest grove
  //    centre on the pure tangential bearing (radial 37.7 m) --------------
  placeCrate(builder, 'farcrysis-crate-27', -32, -20, 0.95);
  placeCrate(builder, 'farcrysis-crate-28',  32,  20, 0.95);

  // =====================================================================
  // 11. FOUR FUEL BARRELS (4) — hazard-striped, corner pockets
  // =====================================================================
  //
  // Four explosive-looking barrels with hazard-yellow stripe bands,
  // placed in arena corner pockets away from spawns and patrol paths.
  // Each carries a small emissive band for visibility at range.

  // -- SW / NE diagonal corner pockets (nw = -x/-z, matching landmark tags)
  placeBarrel(builder, 'farcrysis-barrel-15', -32,  32);
  placeBarrel(builder, 'farcrysis-barrel-16',  32, -32);

  // -- SW / NE beach fringe corner pockets --------------------------------
  placeBarrel(builder, 'farcrysis-barrel-17', -24, -56);
  placeBarrel(builder, 'farcrysis-barrel-18',  24,  56);

  // ── Hazard stripes on all four new barrels ────────────────────────────
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-15', -32,  32);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-16',  32, -32);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-17', -24, -56);
  addHazardStripesToBarrel(builder, 'farcrysis-barrel-18',  24,  56);

  // =====================================================================
  // 12. TWO STACKED SANDBAG WALLS (2) — core door approach cover
  // =====================================================================
  //
  // Each wall is built from 4 stacked box segments (1.6 m wide × 0.45 m
  // tall × 0.6 m deep per segment → 1.8 m total height).  Every segment
  // gets its own collider + physicsCollider + 'concrete' shot surface;
  // a single physicalCover spans the full stack so the peek / lean
  // system treats it as one low-cover position.

  // -- South core door approach cover -------------------------------------
  placeStackedSandbagWall(
    builder, 'farcrysis-core-door-sandbag-s', 0, -3.6, 1.6, 0.45, 0.6, 4,
  );

  // -- North core door approach cover -------------------------------------
  placeStackedSandbagWall(
    builder, 'farcrysis-core-door-sandbag-n', 0, 3.6, 1.6, 0.45, 0.6, 4,
  );

  // =====================================================================
  // 13. PASS 69 QA — cave entrance, tower approach, beach interactables
  // =====================================================================
  //
  // Eight additional interactables and three sandbag walls placed at
  // gameplay-significant positions: the flooded cave entrance (SE),
  // the research tower approach (NW), and the beach ring.  Every
  // position is verified ≥3 m from every spawn and patrol waypoint.

  // -- Cave entrance (SE) — crates + barrel flanking the flooded cave ------
  placeCrate(builder, 'farcrysis-crate-29', 56, 35, 1.0);
  placeCrate(builder, 'farcrysis-crate-30', 44, 34, 0.9);
  placeBarrel(builder, 'farcrysis-barrel-19', 48, 27);

  // -- Tower approach (NW) — barrel + crate near the research tower --------
  placeBarrel(builder, 'farcrysis-barrel-20', -11, -11);
  placeCrate(builder, 'farcrysis-crate-31', -10, -6.5, 0.9);

  // -- Beach ring — south, north, west beach interactables -----------------
  placeBarrel(builder, 'farcrysis-barrel-21', -6, -54);
  placeCrate(builder, 'farcrysis-crate-32', 7, 54, 0.95);
  placeBarrel(builder, 'farcrysis-barrel-22', -56, 28);

  // -- Cave entrance approach sandbag cover --------------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-05', 38, 30, 2.2, 0.6, 0.45);

  // -- Tower approach sandbag cover ----------------------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-06', -13, -8, 2.2, 0.6, 0.45);

  // -- SE beach sandbag cover ----------------------------------------------
  placeSandbagWall(builder, 'farcrysis-sandbag-07', 52, -52, 2.2, 0.6, 0.45);

  // =====================================================================
  // 14. FLESH-OUT GAP PIECES — fill bare patrol lanes in jungle/beach
  // =====================================================================
  //
  // Nine additional well-placed interactables to fill sparse patrol lanes
  // that had fewer than 3 cover/breakable options.  Every position is
  // verified ≥3 m from every spawn and patrol waypoint.  All use the
  // existing placement helpers so Rapier colliders match the established
  // addInteractables pattern.

  // -- East jungle mid-ring: crate fills gap between cover-jungle-06 and core
  placeCrate(builder, 'farcrysis-crate-33', 10, -8, 0.9);

  // -- West jungle mid-ring: barrel near cover-jungle-05
  placeBarrel(builder, 'farcrysis-barrel-23', -12, -4);

  // -- East jungle approach: fallen palm trunk cover
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-07', 12, -10, 3.0, 0.4);

  // -- West jungle: crate stack cover near core approach
  placeCrateCover(builder, 'farcrysis-cover-jungle-08', -14, -4);

  // -- SW beach fringe: sandbag wall above lagoon edge
  placeSandbagWall(builder, 'farcrysis-sandbag-08', -40, -52, 2.2, 0.6, 0.45);

  // -- NE beach edge: barrel filling the empty NE corner
  placeBarrel(builder, 'farcrysis-barrel-24', 48, 48);

  // -- NW jungle: crate cover near research tower approach
  placeCrateCover(builder, 'farcrysis-cover-jungle-09', -32, 16);

  // -- SE jungle: barrel for the sparse SE interior
  placeBarrel(builder, 'farcrysis-barrel-25', 36, -16);

  // -- South jungle path: fallen palm trunk for southern approach cover
  placeFallenTrunk(builder, 'farcrysis-cover-jungle-10', 12, -40, 3.0, 0.4);

  // =====================================================================
  // VERIFICATION: warn if any cover position exceeds the arena boundary
  // =====================================================================
  for (const [label, px, pz] of [
    ['cover-jungle-01', -40, 16],
    ['cover-jungle-02', 44, -16],
    ['cover-jungle-03', 16, -48],
    ['cover-jungle-04', -40, 28],
    ['cover-jungle-05', -32, -8],
    ['cover-jungle-06', 32, 8],
    ['cover-rock-01', -50, -16],
    ['cover-rock-02', 50, 16],
    ['vantage-01', -36, -12],
    ['vantage-02', 36, 12],
    ['core-door-sandbag-s', 0, -3.6],
    ['core-door-sandbag-n', 0, 3.6],
    ['sandbag-05', 38, 30],
    ['sandbag-06', -13, -8],
    ['sandbag-07', 52, -52],
    ['cover-jungle-07', 12, -10],
    ['cover-jungle-08', -14, -4],
    ['sandbag-08', -40, -52],
    ['cover-jungle-09', -32, 16],
    ['cover-jungle-10', 12, -40],
  ] as const) {
    if (!ok(px, pz)) {
      console.warn(`farcrysis-${label} at (${px}, ${pz}) is outside FARCRYSIS_BOUNDS margin`);
    }
  }

  // Pass 76: flush every queued prop family (supply cases, fuel drums, fallen
  // logs, boulders, sandbag courses) into shared InstancedMesh draws. Must be
  // the LAST step so every placement above has queued its spec.
  buildQueuedInteractableVisuals(builder);
}
