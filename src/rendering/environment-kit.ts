/**
 * environment-kit.ts — arena-agnostic vegetation scatter + terrain backdrop.
 *
 * WHY THIS EXISTS: the owner played the new maps and called the backdrop thin
 * ("we need to use some of your better techniques to sort the quality of
 * trees, grass mountains etc"). Today Test1 dresses its horizon with ~140
 * `ConeGeometry` tufts and 18 squashed `SphereGeometry` domes
 * (src/test-maps-art.ts:541-552, :608-636) and Test2 with twelve cones in two
 * dead-straight 11 m rows plus twelve separate trunk draws
 * (src/test-maps-art.ts:709-729). Both read as obvious primitives: identical
 * clones, all plumb, all the same size, meeting a flat plane on a razor edge.
 *
 * WHAT THIS IS: a reusable kit implementing the vegetation and world-building
 * techniques restated in docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md, in
 * our own code:
 *
 *   - MULTI-PART INSTANCED PROTOTYPES. A plant is a prototype with N parts
 *     (trunk, canopy, contact skirt) that share one XZ position and one
 *     instance basis, each part emitted as its own InstancedMesh. One draw
 *     call per (kind, tier, part), never per plant.
 *     (doc: "Instanced prop prototypes with per-instance jitter", "Assembler
 *     with prop prototypes ... per-prototype cull distance")
 *   - POSITION-HASHED VARIATION. Yaw, scale, stretch and tilt come from a
 *     hash of the instance's QUANTISED WORLD POSITION plus a stream id, never
 *     from `Math.random` and never from the instance index. The doc is
 *     explicit about why index hashing is a latent bug: an index-derived
 *     value changes the moment a candidate ahead of it is rejected or the
 *     batch is split, so a keep-out tweak silently re-rolls the whole field.
 *     Position hashing is immune to rejection, reordering and bucketing.
 *     (doc: "Position-hashed per-instance variation ... never the instance
 *     index")
 *   - FORKED STREAMS. Placement runs on a seeded mulberry32; variation runs
 *     on the position hash. They are never the same stream, so retuning the
 *     look cannot reshuffle positions across peers.
 *     (doc: "Per-prototype 'looseness': jitter rig on a forked RNG stream")
 *   - LAYERED POISSON CLEARANCE. Layer N declares a vector of N+1 distances:
 *     entries 0..N-1 are the minimum separation from each PRIOR layer and the
 *     last entry is its own self-spacing. Length is a build-time contract
 *     that throws. This is what expresses "no shrub within 1.5 m of a
 *     cypress" — a jittered grid cannot.
 *     (doc: "32 m periodic Poisson tile with layered inter-layer clearance")
 *   - REJECTION-STABLE SAMPLING. Every candidate attempt consumes exactly the
 *     same two RNG draws whether it is accepted or rejected, so adding a
 *     keep-out never rearranges the rest of the field — the same discipline
 *     src/rendering/instanced-grass-field.ts already applies to grass.
 *   - CLEARANCE PREDICATE. Callers pass `allow(x, z, radiusM)` and keep their
 *     own gameplay lanes, spawns and capture zones clear. Art that blocks no
 *     shots can still block SIGHT; the predicate is where that is decided.
 *     (doc: "Clearance zones with a build-time contract that throws")
 *   - CONTACT SKIRTS. Woody prototypes emit a low, never-tilted ground fillet
 *     so a trunk stops meeting the deck on a straight polygon edge.
 *     (doc: "Contact skirt: a dust fillet auto-emitted under every heavy
 *     instance"; note the doc's NOT-adopted warning — never per grass blade)
 *   - SLOPE AWARENESS. Layers may tilt to the ground normal via Gram-Schmidt
 *     off the authored yaw. Default is FALSE, because the upstream rule worth
 *     writing down is that trunks stay vertical regardless of terrain.
 *   - TWO BUILD-TIME LOD TIERS. Tier is chosen once, at build, by a distance
 *     band from an authored origin — we cannot swap per frame cheaply. The
 *     far tier collapses a multi-part plant into one merged silhouette part,
 *     so the far band costs fewer draw calls as well as fewer triangles.
 *   - RIDGELINE BACKDROP. A seeded, displaced heightfield annulus with real
 *     computed normals, a seamless theta wrap and per-vertex distance haze —
 *     landforms on the horizon instead of squashed spheres.
 *     (doc: "Terrain: gameplay-flat by construction, visually undulating
 *     everywhere else"; "Mountains" build-order note)
 *
 * WHAT THIS IS NOT: gameplay authority. Nothing here adds a collider, a shot
 * surface, a spawn or navigation. Every mesh is tagged
 * `userData.presentationOnly = true`, `userData.blocksShots = false` and has
 * its `raycast` replaced with a no-op, matching src/test-maps-art.ts:487-493.
 *
 * DETERMINISTIC: seeded mulberry32 + integer position hashes only, no
 * `Math.random`, so the arena builds identically on every peer and run.
 *
 * HEADLESS-SAFE: pure `three` geometry and MeshStandardMaterial. No canvas,
 * no `document`, no renderer, no WebGPU. The collider/visual parity audit and
 * the vitest suites construct arenas in plain Node, so every path here must
 * work with nothing but the three core classes — and does.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Deterministic streams
// ---------------------------------------------------------------------------

/** Placement stream. Same generator as src/test-maps-art.ts:19-27. */
export function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quantise a world coordinate to a 1/256 m lattice for hashing. */
function quantise(v: number): number {
  return Math.round(v * 256) | 0;
}

/**
 * Variation stream: an xor-multiply-shift finaliser over the quantised world
 * position plus a stream id. The SAME point yields the SAME plant whether it
 * was the 3rd or the 3000th accepted candidate, whether its neighbours were
 * rejected, or whether the batch was later split for LOD.
 */
export function detailHash(seed: number, hx: number, hz: number, stream: number): number {
  let h = (seed | 0) ^ Math.imul(hx | 0, 0x9e3779b9) ^ Math.imul(hz | 0, 0x85ebca6b) ^ Math.imul(stream | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h ^ (h >>> 16), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Deterministic integer-mixed hash used by the ridge displacement. */
function coordHash(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Presentation-only contract
// ---------------------------------------------------------------------------

/**
 * Stamp the art-layer contract onto a mesh: presentation-only, blocks no
 * shots, and unreachable by any raycast (so it can never become movement,
 * ballistic or interaction authority). Matches src/test-maps-art.ts:487-493.
 */
function presentationMesh<T extends THREE.Mesh | THREE.InstancedMesh>(mesh: T, castShadow: boolean, receiveShadow = true): T {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.userData.presentationOnly = true;
  mesh.userData.blocksShots = false;
  mesh.raycast = () => undefined;
  return mesh;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Triangle count of a geometry, indexed or not. */
export function triangleCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

/**
 * Merge authored pieces into one part geometry. three's primitives mix
 * indexed (Cylinder/Cone/Circle) and non-indexed (Icosahedron) forms and
 * `mergeGeometries` refuses the mix, so every piece is normalised to
 * non-indexed first. Every piece comes from a three primitive, so the index
 * buffers are in range by construction (the toNonIndexed NaN gotcha only
 * bites hand-built index buffers).
 */
function mergePieces(pieces: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (pieces.length === 1) {
    const only = pieces[0];
    return only.getIndex() ? only.toNonIndexed() : only;
  }
  const flat = pieces.map((piece) => (piece.getIndex() ? piece.toNonIndexed() : piece));
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('environment-kit: part merge failed (mismatched attributes)');
  merged.clearGroups();
  return merged;
}

function cylinderPiece(radiusTop: number, radiusBottom: number, height: number, segments: number, baseY: number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, true);
  geometry.translate(0, baseY + height / 2, 0);
  return geometry;
}

function conePiece(radius: number, height: number, segments: number, baseY: number): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(radius, height, segments);
  geometry.translate(0, baseY + height / 2, 0);
  return geometry;
}

function lobePiece(radius: number, detail: number, x: number, y: number, z: number, squash: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(radius, detail);
  geometry.scale(1, squash, 1);
  geometry.translate(x, y, z);
  return geometry;
}

/**
 * The contact skirt: a low lobed disc of ground litter. Deliberately NOT a
 * clean circle — the radius is modulated by a deterministic hash per rim
 * vertex so it reads as a dust pile rather than a decal ring.
 */
function skirtPiece(radius: number, segments: number, seed: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const rim: Array<readonly [number, number]> = [];
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const wobble = 0.72 + coordHash(seed, i, 5) * 0.5;
    rim.push([Math.cos(theta) * radius * wobble, Math.sin(theta) * radius * wobble]);
  }
  for (let i = 0; i < segments; i += 1) {
    const a = rim[i];
    const b = rim[(i + 1) % segments];
    positions.push(0, 0, 0, b[0], 0, b[1], a[0], 0, a[1]);
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uvs.push(0.5, 0.5, 0.5 + b[0] / (radius * 2), 0.5 + b[1] / (radius * 2), 0.5 + a[0] / (radius * 2), 0.5 + a[1] / (radius * 2));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.translate(0, 0.008, 0);
  return geometry;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

export interface VegetationPalette {
  readonly trunk: number;
  readonly broadleafCanopy: number;
  readonly coniferCanopy: number;
  readonly shrub: number;
  readonly dryScrub: number;
  readonly litter: number;
}

/** Sun-bleached defaults; every arena is expected to override for its brief. */
export const DEFAULT_VEGETATION_PALETTE: VegetationPalette = Object.freeze({
  trunk: 0x5a4530,
  broadleafCanopy: 0x546b36,
  coniferCanopy: 0x334f31,
  shrub: 0x4a6338,
  dryScrub: 0x99885a,
  litter: 0x8f7c58,
});

// ---------------------------------------------------------------------------
// Plant prototypes
// ---------------------------------------------------------------------------

export type PlantKind = 'broadleaf' | 'conifer' | 'shrub' | 'dry-scrub';
export type LodTier = 'near' | 'far';

export const PLANT_KINDS: readonly PlantKind[] = Object.freeze(['broadleaf', 'conifer', 'shrub', 'dry-scrub'] as const);

interface PlantPart {
  readonly id: string;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.MeshStandardMaterial;
  readonly castShadow: boolean;
  /** Rigid parts (contact skirts) never inherit the plant's tilt or stretch. */
  readonly rigid: boolean;
}

interface PlantPrototype {
  readonly kind: PlantKind;
  readonly tier: LodTier;
  readonly parts: readonly PlantPart[];
  /** Canopy radius in metres at unit scale — what the clearance predicate sees. */
  readonly radiusM: number;
  readonly heightM: number;
  readonly scaleRange: readonly [number, number];
  /** Max out-of-true, radians. Vertical landmarks (conifers) declare 0. */
  readonly tiltRad: number;
  /** Lowered by this much so a raised rim does not float. */
  readonly sinkM: number;
  readonly skirtRadiusM: number;
}

/**
 * Canopy radius and scale band per kind, at unit scale. Declared as data so a
 * caller-facing decision (clearance radius, scale jitter) never has to build
 * geometry to be answered.
 */
const PROTOTYPE_RADIUS: Readonly<Record<PlantKind, number>> = Object.freeze({
  broadleaf: 1.6,
  conifer: 1.05,
  shrub: 0.78,
  'dry-scrub': 0.36,
});

const PROTOTYPE_SCALE_RANGE: Readonly<Record<PlantKind, readonly [number, number]>> = Object.freeze({
  broadleaf: [0.78, 1.28] as const,
  conifer: [0.72, 1.34] as const,
  shrub: [0.7, 1.35] as const,
  'dry-scrub': [0.62, 1.4] as const,
});

interface PrototypeMaterials {
  readonly trunk: THREE.MeshStandardMaterial;
  readonly broadleaf: THREE.MeshStandardMaterial;
  readonly conifer: THREE.MeshStandardMaterial;
  readonly shrub: THREE.MeshStandardMaterial;
  readonly scrub: THREE.MeshStandardMaterial;
  readonly litter: THREE.MeshStandardMaterial;
}

function foliageMaterial(color: number, name: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 });
  material.name = name;
  return material;
}

function buildMaterials(palette: VegetationPalette): PrototypeMaterials {
  const trunk = new THREE.MeshStandardMaterial({ color: palette.trunk, roughness: 0.98, metalness: 0 });
  trunk.name = 'env-kit-trunk';
  const litter = new THREE.MeshStandardMaterial({ color: palette.litter, roughness: 1, metalness: 0 });
  litter.name = 'env-kit-litter';
  return {
    trunk,
    broadleaf: foliageMaterial(palette.broadleafCanopy, 'env-kit-broadleaf'),
    conifer: foliageMaterial(palette.coniferCanopy, 'env-kit-conifer'),
    shrub: foliageMaterial(palette.shrub, 'env-kit-shrub'),
    scrub: foliageMaterial(palette.dryScrub, 'env-kit-dry-scrub'),
    litter,
  };
}

/**
 * Build the prototype for one kind at one tier.
 *
 * NEAR tiers are genuinely multi-part: trunk and canopy are separate
 * InstancedMeshes sharing the instance basis, which is what lets bark and
 * foliage carry different materials without a per-plant draw.
 *
 * FAR tiers collapse the same plant into ONE merged silhouette part. At the
 * distances where the far band lives the material split is invisible, and
 * collapsing it halves the far band's draw calls as well as its triangles.
 */
function buildPrototype(kind: PlantKind, tier: LodTier, materials: PrototypeMaterials, wantSkirt: boolean): PlantPrototype {
  const parts: PlantPart[] = [];
  const push = (id: string, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, castShadow: boolean, rigid = false): void => {
    parts.push({ id, geometry, material, castShadow, rigid });
  };

  if (kind === 'broadleaf') {
    if (tier === 'near') {
      push('trunk', mergePieces([
        cylinderPiece(0.13, 0.21, 2.35, 6, 0),
        cylinderPiece(0.07, 0.11, 0.9, 5, 2.2),
      ]), materials.trunk, true);
      push('canopy', mergePieces([
        lobePiece(1.42, 1, 0, 3.25, 0, 0.82),
        lobePiece(0.94, 0, -0.85, 2.86, 0.42, 0.86),
        lobePiece(0.86, 0, 0.72, 3.02, -0.58, 0.8),
      ]), materials.broadleaf, true);
    } else {
      push('silhouette', mergePieces([
        cylinderPiece(0.14, 0.2, 2.4, 4, 0),
        lobePiece(1.5, 0, 0, 3.2, 0, 0.84),
      ]), materials.broadleaf, true);
    }
    if (wantSkirt) push('skirt', skirtPiece(1.05, 9, 0x10b1), materials.litter, false, true);
    return { kind, tier, parts, radiusM: 1.6, heightM: 4.4, scaleRange: [0.78, 1.28], tiltRad: 0.035, sinkM: 0.06, skirtRadiusM: 1.05 };
  }

  if (kind === 'conifer') {
    if (tier === 'near') {
      push('trunk', mergePieces([cylinderPiece(0.1, 0.17, 1.05, 6, 0)]), materials.trunk, true);
      push('canopy', mergePieces([
        conePiece(1.02, 2.3, 7, 0.75),
        conePiece(0.78, 2.05, 7, 2.15),
        conePiece(0.5, 1.9, 6, 3.45),
      ]), materials.conifer, true);
    } else {
      push('silhouette', mergePieces([
        cylinderPiece(0.11, 0.16, 1.0, 4, 0),
        conePiece(1.0, 4.5, 6, 0.8),
      ]), materials.conifer, true);
    }
    if (wantSkirt) push('skirt', skirtPiece(0.78, 8, 0x20c2), materials.litter, false, true);
    // tiltRad 0: the upstream rule worth writing down is that trunks stay
    // vertical regardless of terrain — a leaning conifer reads as broken.
    return { kind, tier, parts, radiusM: 1.05, heightM: 5.35, scaleRange: [0.72, 1.34], tiltRad: 0, sinkM: 0.05, skirtRadiusM: 0.78 };
  }

  if (kind === 'shrub') {
    if (tier === 'near') {
      push('stems', mergePieces([
        cylinderPiece(0.045, 0.07, 0.34, 5, 0),
        cylinderPiece(0.03, 0.05, 0.26, 4, 0.1),
      ]), materials.trunk, false);
      push('foliage', mergePieces([
        lobePiece(0.52, 1, 0, 0.62, 0, 0.78),
        lobePiece(0.36, 0, -0.36, 0.46, 0.2, 0.8),
        lobePiece(0.33, 0, 0.31, 0.52, -0.26, 0.78),
        lobePiece(0.27, 0, 0.05, 0.86, 0.22, 0.74),
      ]), materials.shrub, true);
    } else {
      push('silhouette', mergePieces([lobePiece(0.58, 0, 0, 0.56, 0, 0.8)]), materials.shrub, true);
    }
    if (wantSkirt) push('skirt', skirtPiece(0.52, 8, 0x30d3), materials.litter, false, true);
    return { kind, tier, parts, radiusM: 0.78, heightM: 1.12, scaleRange: [0.7, 1.35], tiltRad: 0.1, sinkM: 0.04, skirtRadiusM: 0.52 };
  }

  // dry-scrub: a low bunch tuft. No skirt at any tier — the doc's explicit
  // NOT-adopted note is that a contact fillet under every small instance is
  // ruinous at ground-cover density and invisible under the blades anyway.
  if (tier === 'near') {
    const blades: THREE.BufferGeometry[] = [];
    for (let blade = 0; blade < 3; blade += 1) {
      const piece = conePiece(0.2, 0.48, 4, 0);
      piece.rotateZ(0.34 * (blade - 1));
      piece.rotateY(blade * 1.9);
      piece.translate((blade - 1) * 0.12, 0, (blade % 2 === 0 ? 0.1 : -0.11));
      blades.push(piece);
    }
    push('tuft', mergePieces(blades), materials.scrub, false);
  } else {
    push('tuft', mergePieces([conePiece(0.3, 0.42, 4, 0)]), materials.scrub, false);
  }
  return { kind, tier, parts, radiusM: 0.36, heightM: 0.5, scaleRange: [0.62, 1.4], tiltRad: 0.2, sinkM: 0.02, skirtRadiusM: 0 };
}

// ---------------------------------------------------------------------------
// Vegetation scatter
// ---------------------------------------------------------------------------

export interface ScatterArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Caller-owned gameplay guard. Return false to reject a candidate. `radiusM`
 * is the plant's canopy radius at its final scale, so a caller can keep a
 * firing lane clear of anything that would overhang it — art that blocks no
 * shots can still block sight.
 */
export type ClearancePredicate = (x: number, z: number, radiusM: number, kind: PlantKind) => boolean;

export interface VegetationLayerSpec {
  readonly kind: PlantKind;
  /** Target accepted instances. Sampling stops at this many or at the attempt cap. */
  readonly count: number;
  /**
   * Length MUST equal this layer's index + 1 (build-time contract, throws).
   * Entries 0..index-1 are the minimum separation from each PRIOR layer;
   * the last entry is this layer's own self-spacing. Metres.
   */
  readonly spacings: readonly number[];
  /** Overrides the prototype's scale band. */
  readonly scaleRange?: readonly [number, number];
  /** Default false. Grass/ground cover tilts to slope; trunks never do. */
  readonly tiltToSlope?: boolean;
  /** Default true for woody kinds, ignored for dry-scrub. */
  readonly skirt?: boolean;
  /** Candidate draws per requested instance. Default 30. */
  readonly attemptsPerInstance?: number;
}

export interface VegetationLodSpec {
  /** Distance from the origin below which the NEAR tier is used, metres. */
  readonly nearBandM: number;
  readonly originX?: number;
  readonly originZ?: number;
}

export interface VegetationScatterOptions {
  readonly seed: number;
  readonly area: ScatterArea;
  readonly layers: readonly VegetationLayerSpec[];
  readonly allow?: ClearancePredicate;
  readonly groundY?: (x: number, z: number) => number;
  readonly groundNormal?: (x: number, z: number) => THREE.Vector3;
  readonly lod?: VegetationLodSpec;
  readonly palette?: Partial<VegetationPalette>;
  readonly namePrefix?: string;
}

export interface EnvironmentStats {
  readonly instances: number;
  /** Distinct plant kinds that actually placed at least one instance. */
  readonly plantTypes: number;
  readonly triangles: number;
  /** One per emitted InstancedMesh / Mesh — what the arena budget counts. */
  readonly drawCalls: number;
  readonly rejected: number;
  readonly perKind: Readonly<Record<PlantKind, number>>;
  readonly perTier: Readonly<Record<LodTier, number>>;
}

export interface VegetationScatterResult {
  readonly group: THREE.Group;
  readonly meshes: readonly THREE.InstancedMesh[];
  readonly stats: EnvironmentStats;
}

interface PlacedPoint {
  readonly x: number;
  readonly z: number;
  readonly layer: number;
  readonly kind: PlantKind;
  readonly tier: LodTier;
  readonly tiltToSlope: boolean;
  readonly scale: number;
}

const SCRATCH_POSITION = new THREE.Vector3();
const SCRATCH_SCALE = new THREE.Vector3();
const SCRATCH_QUATERNION = new THREE.Quaternion();
const SCRATCH_EULER = new THREE.Euler();
const SCRATCH_MATRIX = new THREE.Matrix4();
const SCRATCH_UP = new THREE.Vector3();
const SCRATCH_FORWARD = new THREE.Vector3();
const SCRATCH_RIGHT = new THREE.Vector3();

/** Central-difference normal from whatever `groundY` the caller supplied. */
function defaultGroundNormal(groundY: (x: number, z: number) => number): (x: number, z: number) => THREE.Vector3 {
  const step = 0.25;
  return (x: number, z: number) => {
    const dx = groundY(x + step, z) - groundY(x - step, z);
    const dz = groundY(x, z + step) - groundY(x, z - step);
    return new THREE.Vector3(-dx, 2 * step, -dz).normalize();
  };
}

function validateLayers(layers: readonly VegetationLayerSpec[]): void {
  layers.forEach((layer, index) => {
    if (layer.spacings.length !== index + 1) {
      throw new Error(
        `environment-kit: layer ${index} ("${layer.kind}") declares ${layer.spacings.length} spacings; ` +
        `a layer's spacing vector must hold one clearance per PRIOR layer plus its own self-spacing (expected ${index + 1}).`,
      );
    }
    for (const spacing of layer.spacings) {
      if (!(spacing > 0) || !Number.isFinite(spacing)) {
        throw new Error(`environment-kit: layer ${index} ("${layer.kind}") has a non-positive spacing (${spacing}).`);
      }
    }
    if (!Number.isInteger(layer.count) || layer.count < 0) {
      throw new Error(`environment-kit: layer ${index} ("${layer.kind}") count must be a non-negative integer.`);
    }
  });
}

/**
 * Place instanced vegetation into `root`.
 *
 * Determinism contract: placement consumes exactly two draws from the seeded
 * stream per ATTEMPT — accepted or not — so adding, removing or tightening a
 * keep-out never rearranges the candidate sequence. Per-instance look is a
 * pure function of the quantised world position, so any instance that
 * survives both a before and an after build is byte-identical in both.
 */
export function scatterVegetation(root: THREE.Object3D, options: VegetationScatterOptions): VegetationScatterResult {
  validateLayers(options.layers);
  const { area } = options;
  if (!(area.maxX > area.minX) || !(area.maxZ > area.minZ)) {
    throw new Error('environment-kit: scatter area must have positive extent on both axes.');
  }

  const palette: VegetationPalette = { ...DEFAULT_VEGETATION_PALETTE, ...options.palette };
  const materials = buildMaterials(palette);
  const namePrefix = options.namePrefix ?? 'env';
  const groundY = options.groundY ?? (() => 0);
  const groundNormal = options.groundNormal ?? defaultGroundNormal(groundY);
  const lodOriginX = options.lod?.originX ?? 0;
  const lodOriginZ = options.lod?.originZ ?? 0;
  const nearBandM = options.lod?.nearBandM ?? Number.POSITIVE_INFINITY;

  const group = new THREE.Group();
  group.name = `${namePrefix}-vegetation`;
  group.userData.presentationOnly = true;

  // --- layered Poisson dart-throwing -------------------------------------
  const placeRng = mulberry32(options.seed);
  let maxSpacing = 0;
  for (const layer of options.layers) {
    for (const spacing of layer.spacings) maxSpacing = Math.max(maxSpacing, spacing);
  }
  const cellSize = Math.max(maxSpacing, 0.25);
  const grid = new Map<string, PlacedPoint[]>();
  const cellKey = (x: number, z: number): string => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
  const placed: PlacedPoint[] = [];
  let rejected = 0;

  options.layers.forEach((layer, layerIndex) => {
    const scaleRange = layer.scaleRange ?? PROTOTYPE_SCALE_RANGE[layer.kind];
    const radiusAtUnit = PROTOTYPE_RADIUS[layer.kind];
    const attemptCap = layer.count * (layer.attemptsPerInstance ?? 30);
    let accepted = 0;
    for (let attempt = 0; attempt < attemptCap && accepted < layer.count; attempt += 1) {
      // Two draws EVERY attempt, before any test, so rejections cannot shift
      // the stream for the candidates that follow.
      const u = placeRng();
      const v = placeRng();
      const x = area.minX + u * (area.maxX - area.minX);
      const z = area.minZ + v * (area.maxZ - area.minZ);

      const hx = quantise(x);
      const hz = quantise(z);
      const scale = scaleRange[0] + detailHash(options.seed, hx, hz, 3) * (scaleRange[1] - scaleRange[0]);
      const radius = radiusAtUnit * scale;

      // Layered clearance: a prior-layer neighbour must respect THIS layer's
      // clearance-from-that-layer entry; a same-layer neighbour respects the
      // self-spacing, which is the last entry. Both are `spacings[p.layer]`.
      let clear = true;
      const cx = Math.floor(x / cellSize);
      const cz = Math.floor(z / cellSize);
      for (let ox = -1; ox <= 1 && clear; ox += 1) {
        for (let oz = -1; oz <= 1 && clear; oz += 1) {
          const bucket = grid.get(`${cx + ox},${cz + oz}`);
          if (!bucket) continue;
          for (const point of bucket) {
            const required = layer.spacings[point.layer];
            const dx = point.x - x;
            const dz = point.z - z;
            if (dx * dx + dz * dz < required * required) { clear = false; break; }
          }
        }
      }
      if (!clear) { rejected += 1; continue; }
      if (options.allow && !options.allow(x, z, radius, layer.kind)) { rejected += 1; continue; }

      const distanceToOrigin = Math.hypot(x - lodOriginX, z - lodOriginZ);
      const point: PlacedPoint = {
        x, z, layer: layerIndex, kind: layer.kind,
        tier: distanceToOrigin <= nearBandM ? 'near' : 'far',
        tiltToSlope: layer.tiltToSlope === true,
        scale,
      };
      placed.push(point);
      const key = cellKey(x, z);
      const bucket = grid.get(key);
      if (bucket) bucket.push(point); else grid.set(key, [point]);
      accepted += 1;
    }
  });

  // --- emit one InstancedMesh per (kind, tier, part) ----------------------
  const skirtByKind = new Map<PlantKind, boolean>();
  for (const layer of options.layers) {
    const wants = layer.skirt ?? layer.kind !== 'dry-scrub';
    skirtByKind.set(layer.kind, (skirtByKind.get(layer.kind) ?? false) || wants);
  }

  const buckets = new Map<string, PlacedPoint[]>();
  for (const point of placed) {
    const key = `${point.kind}|${point.tier}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(point); else buckets.set(key, [point]);
  }

  const meshes: THREE.InstancedMesh[] = [];
  let triangles = 0;
  const perKind: Record<PlantKind, number> = { broadleaf: 0, conifer: 0, shrub: 0, 'dry-scrub': 0 };
  const perTier: Record<LodTier, number> = { near: 0, far: 0 };

  // Sorted for a stable emission order regardless of Map insertion order.
  for (const key of Array.from(buckets.keys()).sort()) {
    const points = buckets.get(key);
    if (!points || points.length === 0) continue;
    const first = points[0];
    const prototype = buildPrototype(first.kind, first.tier, materials, skirtByKind.get(first.kind) === true && first.tier === 'near');
    perKind[first.kind] += points.length;
    perTier[first.tier] += points.length;

    for (const part of prototype.parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, points.length);
      mesh.name = `${namePrefix}-${first.kind}-${first.tier}-${part.id}`;
      for (let i = 0; i < points.length; i += 1) {
        writeInstanceMatrix(SCRATCH_MATRIX, points[i], prototype, part, options.seed, groundY, groundNormal);
        mesh.setMatrixAt(i, SCRATCH_MATRIX);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // MANDATORY: an InstancedMesh whose instances are spread across the map
      // culls against the SOURCE geometry's bounds unless this is called, so
      // the batch pops out of the frustum the moment the origin leaves it.
      mesh.computeBoundingSphere();
      mesh.userData.plantKind = first.kind;
      mesh.userData.lodTier = first.tier;
      mesh.userData.partId = part.id;
      group.add(presentationMesh(mesh, part.castShadow));
      meshes.push(mesh);
      triangles += triangleCount(part.geometry) * points.length;
    }
  }

  root.add(group);

  const plantTypes = PLANT_KINDS.filter((kind) => perKind[kind] > 0).length;
  return {
    group,
    meshes,
    stats: {
      instances: placed.length,
      plantTypes,
      triangles,
      drawCalls: meshes.length,
      rejected,
      perKind,
      perTier,
    },
  };
}

/**
 * Compose one instance basis. Every varying term is a position hash, so this
 * is a pure function of (seed, x, z, prototype, part).
 */
function writeInstanceMatrix(
  target: THREE.Matrix4,
  point: PlacedPoint,
  prototype: PlantPrototype,
  part: PlantPart,
  seed: number,
  groundY: (x: number, z: number) => number,
  groundNormal: (x: number, z: number) => THREE.Vector3,
): void {
  const hx = quantise(point.x);
  const hz = quantise(point.z);
  const yaw = detailHash(seed, hx, hz, part.rigid ? 7 : 4) * Math.PI * 2;
  const scale = point.scale;
  const surfaceY = groundY(point.x, point.z);

  if (part.rigid) {
    // The skirt is a pile of ground litter, not part of the plant: no tilt,
    // no stretch, no sink, its own yaw stream.
    SCRATCH_POSITION.set(point.x, surfaceY, point.z);
    SCRATCH_EULER.set(0, yaw, 0, 'YXZ');
    SCRATCH_QUATERNION.setFromEuler(SCRATCH_EULER);
    SCRATCH_SCALE.set(scale, 1, scale);
    target.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
    return;
  }

  const stretch = 0.86 + detailHash(seed, hx, hz, 8) * 0.34;
  SCRATCH_SCALE.set(scale, scale * stretch, scale);
  SCRATCH_POSITION.set(point.x, surfaceY - prototype.sinkM * scale, point.z);

  if (point.tiltToSlope) {
    // Gram-Schmidt off the AUTHORED yaw. Quaternion.setFromUnitVectors would
    // discard the yaw, which is exactly what makes tilted scatter read as a
    // single stamped clone.
    SCRATCH_UP.copy(groundNormal(point.x, point.z));
    if (!Number.isFinite(SCRATCH_UP.lengthSq()) || SCRATCH_UP.lengthSq() < 1e-8) SCRATCH_UP.set(0, 1, 0);
    SCRATCH_UP.normalize();
    SCRATCH_FORWARD.set(Math.sin(yaw), 0, Math.cos(yaw));
    SCRATCH_FORWARD.addScaledVector(SCRATCH_UP, -SCRATCH_FORWARD.dot(SCRATCH_UP));
    if (SCRATCH_FORWARD.lengthSq() < 1e-8) SCRATCH_FORWARD.set(0, 0, 1);
    SCRATCH_FORWARD.normalize();
    SCRATCH_RIGHT.copy(SCRATCH_UP).cross(SCRATCH_FORWARD).normalize();
    target.makeBasis(SCRATCH_RIGHT, SCRATCH_UP, SCRATCH_FORWARD);
    target.scale(SCRATCH_SCALE);
    target.setPosition(SCRATCH_POSITION);
    return;
  }

  const tilt = prototype.tiltRad;
  const tiltX = tilt === 0 ? 0 : (detailHash(seed, hx, hz, 5) * 2 - 1) * tilt;
  const tiltZ = tilt === 0 ? 0 : (detailHash(seed, hx, hz, 6) * 2 - 1) * tilt;
  SCRATCH_EULER.set(tiltX, yaw, tiltZ, 'YXZ');
  SCRATCH_QUATERNION.setFromEuler(SCRATCH_EULER);
  target.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
}

// ---------------------------------------------------------------------------
// Ridgeline backdrop
// ---------------------------------------------------------------------------

export interface RidgeRingOptions {
  readonly seed: number;
  /** Inner rim radius. MUST clear the arena; see `arenaClearRadiusM`. */
  readonly innerRadiusM: number;
  readonly outerRadiusM: number;
  /**
   * Build-time contract: the largest radius any gameplay geometry reaches.
   * If the ring's inner rim would fall inside it the build throws, because a
   * backdrop inside the playfield is a sightline blocker dressed as scenery.
   */
  readonly arenaClearRadiusM?: number;
  /** Columns around the ring. Default 128. */
  readonly radialSegments?: number;
  /** Rows across the band. Default 12. */
  readonly bandSegments?: number;
  /** Height of both rims. Default -1.6 — the rim is buried, never a lip. */
  readonly baseY?: number;
  /** Crest height above `baseY`. Default 24. */
  readonly peakHeightM?: number;
  /** Ridge lobe frequencies around the ring. Default [3, 7, 13]. */
  readonly lobes?: readonly [number, number, number];
  readonly nearColor?: number;
  readonly farColor?: number;
  readonly hazeColor?: number;
  /** 0 = no haze, 1 = the outer rim is fully the haze colour. Default 0.72. */
  readonly hazeStrength?: number;
  readonly name?: string;
}

export interface RidgeRingStats {
  readonly triangles: number;
  readonly vertices: number;
  readonly drawCalls: number;
  readonly peakY: number;
  readonly minRadiusM: number;
  readonly maxRadiusM: number;
  /** Max elevation of any vertex above a 1.6 m eye at the origin, degrees. */
  readonly maxElevationDeg: number;
}

export interface RidgeRingResult {
  readonly mesh: THREE.Mesh;
  readonly stats: RidgeRingStats;
}

/**
 * A seeded, displaced heightfield annulus: the horizon reads as landforms
 * rather than a ring of squashed spheres.
 *
 * Both rims sit at `baseY` (below y = 0), so the band rises out of the ground
 * and falls away again — the far side drops below the horizon and is never
 * seen. Displacement is three ridge lobes plus a position-hashed crag term,
 * all evaluated from theta and the band parameter, so the theta = 0 seam is
 * exact: the last column reuses the FIRST column's vertices by index, which
 * makes `computeVertexNormals` continuous across the join with no welding.
 */
export function buildRidgeRing(options: RidgeRingOptions): RidgeRingResult {
  const radialSegments = Math.max(16, Math.floor(options.radialSegments ?? 128));
  const bandSegments = Math.max(2, Math.floor(options.bandSegments ?? 12));
  const baseY = options.baseY ?? -1.6;
  const peakHeightM = options.peakHeightM ?? 24;
  const inner = options.innerRadiusM;
  const outer = options.outerRadiusM;
  if (!(outer > inner) || !(inner > 0)) {
    throw new Error(`environment-kit: ridge ring needs 0 < innerRadiusM (${inner}) < outerRadiusM (${outer}).`);
  }
  if (options.arenaClearRadiusM !== undefined && inner <= options.arenaClearRadiusM) {
    throw new Error(
      `environment-kit: ridge ring inner rim ${inner} m is inside the arena clear radius ` +
      `${options.arenaClearRadiusM} m. The backdrop must sit outside arena bounds so it can never ` +
      'occlude a gameplay sightline.',
    );
  }

  const lobes = options.lobes ?? ([3, 7, 13] as const);
  const phaseA = coordHash(options.seed, 11, 1) * Math.PI * 2;
  const phaseB = coordHash(options.seed, 23, 2) * Math.PI * 2;
  const phaseC = coordHash(options.seed, 37, 3) * Math.PI * 2;
  const phaseR = coordHash(options.seed, 53, 4) * Math.PI * 2;

  const nearColor = new THREE.Color(options.nearColor ?? 0x6f6a52);
  const farColor = new THREE.Color(options.farColor ?? 0x8a8168);
  const hazeColor = new THREE.Color(options.hazeColor ?? 0xc7c0aa);
  const hazeStrength = THREE.MathUtils.clamp(options.hazeStrength ?? 0.72, 0, 1);

  const columns = radialSegments;
  const rows = bandSegments + 1;
  const vertexCount = columns * rows;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const scratchColor = new THREE.Color();

  let peakY = baseY;
  let minRadius = Number.POSITIVE_INFINITY;
  let maxRadius = 0;
  let maxElevationDeg = 0;

  for (let column = 0; column < columns; column += 1) {
    const theta = (column / columns) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    // Break the perfect circle so the rim is a coastline, not a compass. The
    // wobble scales the BAND WIDTH, never the inner rim: `minRadiusM` is then
    // exactly `innerRadiusM` by construction, which is what lets the caller's
    // `arenaClearRadiusM` contract be a real guarantee rather than a hope.
    const radialWobble = 1 + 0.07 * Math.sin(theta * 5 + phaseR) + 0.035 * Math.sin(theta * 11 + phaseB);
    // Ridge modulation: three lobes plus a crag term, all in [0, 1].
    const ridge = 0.5 + 0.5 * (
      0.55 * Math.sin(theta * lobes[0] + phaseA) +
      0.29 * Math.sin(theta * lobes[1] + phaseB) +
      0.16 * Math.sin(theta * lobes[2] + phaseC)
    );

    for (let row = 0; row < rows; row += 1) {
      const t = row / bandSegments;
      // Rises from the buried inner rim to a crest pulled toward the inner
      // half of the band, then falls away out of sight beyond the crest.
      const shape = Math.sin(Math.PI * Math.pow(t, 0.62));
      const radius = inner + (outer - inner) * t * radialWobble;
      const x = cos * radius;
      const z = sin * radius;
      const crag = (coordHash(Math.round(x * 8), Math.round(z * 8), options.seed | 0) - 0.5) * 2;
      const height = baseY + peakHeightM * shape * (0.42 + 0.58 * ridge) + crag * peakHeightM * 0.085 * shape;

      const index = column * rows + row;
      positions[index * 3] = x;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = z;
      uvs[index * 2] = column / columns;
      uvs[index * 2 + 1] = t;

      // Distance haze: the far rows and the far lobes wash toward the sky
      // colour, which is what turns a solid ring into depth.
      scratchColor.copy(nearColor).lerp(farColor, THREE.MathUtils.clamp(shape * 0.6 + t * 0.4, 0, 1));
      scratchColor.lerp(hazeColor, hazeStrength * THREE.MathUtils.smoothstep(t, 0.05, 0.95));
      colors[index * 3] = scratchColor.r;
      colors[index * 3 + 1] = scratchColor.g;
      colors[index * 3 + 2] = scratchColor.b;

      if (height > peakY) peakY = height;
      const horizontal = Math.hypot(x, z);
      if (horizontal < minRadius) minRadius = horizontal;
      if (horizontal > maxRadius) maxRadius = horizontal;
      const elevation = Math.atan2(height - 1.6, Math.max(horizontal, 1e-3)) * (180 / Math.PI);
      if (elevation > maxElevationDeg) maxElevationDeg = elevation;
    }
  }

  const indices: number[] = [];
  for (let column = 0; column < columns; column += 1) {
    const next = (column + 1) % columns; // exact seam: the last column wraps
    for (let row = 0; row < bandSegments; row += 1) {
      const a = column * rows + row;
      const b = next * rows + row;
      const c = next * rows + row + 1;
      const d = column * rows + row + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  material.name = 'env-kit-ridge';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = options.name ?? 'env-ridge-ring';
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  // A distant backdrop neither casts nor receives: it sits far outside the
  // shadow cascade and paying for it would be pure cost.
  presentationMesh(mesh, false, false);

  return {
    mesh,
    stats: {
      triangles: indices.length / 3,
      vertices: vertexCount,
      drawCalls: 1,
      peakY,
      minRadiusM: minRadius,
      maxRadiusM: maxRadius,
      maxElevationDeg,
    },
  };
}

// ---------------------------------------------------------------------------
// Combined entry point
// ---------------------------------------------------------------------------

export interface EnvironmentBuildOptions {
  readonly vegetation?: VegetationScatterOptions;
  readonly ridge?: RidgeRingOptions;
  readonly name?: string;
}

export interface EnvironmentBuildResult {
  readonly group: THREE.Group;
  readonly vegetation: VegetationScatterResult | null;
  readonly ridge: RidgeRingResult | null;
  /** Vegetation stats plus the ridge's one draw call and its triangles. */
  readonly stats: EnvironmentStats;
}

const EMPTY_STATS: EnvironmentStats = Object.freeze({
  instances: 0,
  plantTypes: 0,
  triangles: 0,
  drawCalls: 0,
  rejected: 0,
  perKind: Object.freeze({ broadleaf: 0, conifer: 0, shrub: 0, 'dry-scrub': 0 }),
  perTier: Object.freeze({ near: 0, far: 0 }),
});

/** Build both halves of the kit under one presentation-only group. */
export function buildEnvironment(root: THREE.Object3D, options: EnvironmentBuildOptions): EnvironmentBuildResult {
  const group = new THREE.Group();
  group.name = options.name ?? 'environment-kit';
  group.userData.presentationOnly = true;
  root.add(group);

  const vegetation = options.vegetation ? scatterVegetation(group, options.vegetation) : null;
  const ridge = options.ridge ? buildRidgeRing(options.ridge) : null;
  if (ridge) group.add(ridge.mesh);

  const base = vegetation?.stats ?? EMPTY_STATS;
  return {
    group,
    vegetation,
    ridge,
    stats: {
      ...base,
      triangles: base.triangles + (ridge?.stats.triangles ?? 0),
      drawCalls: base.drawCalls + (ridge?.stats.drawCalls ?? 0),
    },
  };
}
