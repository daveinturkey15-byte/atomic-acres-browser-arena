/**
 * grass-contact-layer.ts — DAY-3 GRASS-CONTACT lane (fix-grass).
 *
 * The ground-contact tier of the turf stack: everything in the bottom 0–0.08 m,
 * below the blade field (`src/rendering/instanced-grass-field.ts`), which does
 * not exist today at all. One instanced tier of short, splayed, near-horizontal
 * thatch strips (the litter and lodged growth under a kept lawn) plus a flat
 * procedural litter scatter (clover/moss/dry-leaf quads with irregular
 * silhouettes), so that at a grazing view angle the lawn plate is not visible
 * between the blades.
 *
 * Arena-agnostic: takes regions, a placement filter, a ground-height lookup and
 * an eye list. Nothing in it is spelled `nuketown2`. The Nuke Town wiring lives
 * in `src/nuketown-lawn-field.ts`, which parents the tier next to the blade
 * field; the blade renderer itself is untouched (sibling-lane hold).
 *
 * Contracts (brief NT.GRASSCONTACT.1a–4a + coordinator amendment 3a):
 * - three/webgpu NodeMaterials + TSL only. No ShaderMaterial, no
 *   onBeforeCompile, no compute pass, no textures, no samplers.
 * - Budget: <= 22,000 instances, <= 120,000 triangles, <= 8 draws,
 *   0 samplers / targets / passes. Counted on the returned objects.
 * - Deterministic fixed-seed stream, no Math.random().
 * - Presentation only: zero colliders/raycast/shot surfaces, nothing inside a
 *   keep-out (the caller's placementAllowed filter is the keep-out truth).
 * - Bounding top in [0.05, 0.08] m — under the 0.25 m art-only ceiling, and
 *   tall enough to stop the decals-on-lino read.
 * - WebGL2 compat route: the tier does not construct (lawn stays intact).
 * - Reduced detail: cell size doubles, LOD band collapses to 4 m → 8 m.
 *
 * Wind: the tier is static on purpose. `src/map3/weather-system.ts` is the
 * sole wind/wetness owner; importing it here would drag map3 arena code into
 * the Nuke Town bundle for lodged litter that barely moves, so the coupling
 * is skipped (brief allows this with a stated reason).
 *
 * Skills applied:
 * - threejs-procedural-vegetation: InstancedMesh thatch+litter, per-instance
 *   Matrix4.compose variation from the seed stream, merged-strip geometry,
 *   mulberry32 deterministic placement, presentation-only art-layer flags.
 * - webgpu-tsl-arena-forging: TSL-only material (no custom GLSL), instanced
 *   meshes parented into the arena presentation root, bounding-sphere from
 *   real instance bounds, WebGL2-fail-closed compat guard.
 * - photoreal-procedural-scene-forge: contact darkening at the ground (nothing
 *   sits ON the plate without sitting IN it), procedural-only geometry, and —
 *   per its competitive-game inversion bound — presentation geometry never
 *   derives collision and readability caps hold (0.08 m band, 0.25 m ceiling).
 * - threejs-frame-loop-audit: zero per-frame allocation (no time uniform at
 *   all — a static tier writes nothing per frame), GPU-side smooth LOD
 *   collapse so the CPU does nothing per frame, one shared material.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import {
  cameraPosition,
  cos,
  float,
  fract,
  instanceIndex,
  materialColor,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  vec3,
} from 'three/tsl';
import type {
  GrassNearBandSpec,
  GrassRegionRect,
} from '../rendering/instanced-grass-field';

// ---------------------------------------------------------------------------
// Constants — the numbers that make the tier work (recipe §2)
// ---------------------------------------------------------------------------

/** Height band of the tier: the bottom 8 cm under the blades. */
export const GRASS_CONTACT_BAND_HEIGHT_M = 0.08;
/**
 * Root albedo as a fraction of the lawn plate: 0.22 against the blade root's
 * 0.55. The step down that puts pixels into the shade band.
 */
export const GRASS_CONTACT_ROOT_RATIO = 0.22;
/** Ramp exponent: occlusion hugs the ground, then releases toward the plate. */
export const GRASS_CONTACT_RAMP_EXPONENT = 1.6;
/** Smooth distance-LOD band (full detail): full size at 6 m, gone by 14 m. */
export const GRASS_CONTACT_LOD_NEAR_M = 6;
export const GRASS_CONTACT_LOD_FAR_M = 14;
/** Collapsed LOD band on geometryDetail 'reduced' / the low quality tier. */
export const GRASS_CONTACT_LOD_NEAR_REDUCED_M = 4;
export const GRASS_CONTACT_LOD_FAR_REDUCED_M = 8;
/** Jittered-grid cell for the thatch tier (doubles on reduced). */
export const GRASS_CONTACT_CELL_M = 0.36;
/** Jittered-grid cell for the litter scatter (own seed, own density). */
export const GRASS_CONTACT_LITTER_CELL_M = 0.95;
/** Thatch geometry: 3 splayed strips = 6 triangles per instance. */
export const GRASS_CONTACT_THATCH_TRIANGLES = 6;
/** Litter geometry: one clipped-corner quad fan = 3 triangles. */
export const GRASS_CONTACT_LITTER_TRIANGLES = 3;
/** ~1 cell in 6 carries a lodged pale straw strand (same mesh, tint only). */
export const GRASS_CONTACT_STRAW_FRACTION = 1 / 6;
/** ~1 litter quad in 6 is a dry pale leaf rather than moss/clover. */
export const GRASS_CONTACT_DRY_LEAF_FRACTION = 1 / 6;
/** Per-instance height scale keeps the constructed top inside [0.05, 0.08]. */
export const GRASS_CONTACT_SCALE_RANGE: readonly [number, number] = Object.freeze([0.75, 1.0]);
/**
 * Bundle-membership marker: the one string only this change can produce.
 * Quoted by the lane's `grep -rl` bundle proof in REPORT.md.
 */
export const GRASS_CONTACT_TIER_MARKER = 'nt-grasscontact-thatch-v1';

// ---------------------------------------------------------------------------
// Pure behaviour functions — the SAME functions the material builder calls,
// stashed onto material.userData so tests prove material identity (row A/E)
// ---------------------------------------------------------------------------

/**
 * Vertical occlusion ramp: near-black where the tier meets the ground, rising
 * to the lawn plate value (1.0) at the top of the band. The material builder
 * evaluates this at 0 and 1 for its TSL constants, so this function IS the
 * shipped ramp, not a re-typed copy.
 */
export function grassContactRamp(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return (
    GRASS_CONTACT_ROOT_RATIO +
    (1 - GRASS_CONTACT_ROOT_RATIO) * Math.pow(clamped, GRASS_CONTACT_RAMP_EXPONENT)
  );
}

/**
 * Smooth distance-LOD scale. Exactly 1 at nearM, exactly 0 at farM, monotone
 * non-increasing, no step — instances shrink out instead of popping and the
 * CPU does nothing per frame. Mirrors the TSL
 * `1 - smoothstep(near, far, distance)` in the vertex graph (the well-defined
 * operand order; WGSL smoothstep with edge0 > edge1 is undefined, so the
 * brief's `smoothstep(far, near, d)` spelling is NOT used in the shader — same
 * curve, defined behaviour).
 */
export function grassContactDistanceScale(
  distanceM: number,
  nearM: number,
  farM: number,
): number {
  if (!(farM > nearM)) return distanceM <= nearM ? 1 : 0;
  const t = Math.min(1, Math.max(0, (distanceM - farM) / (nearM - farM)));
  return t * t * (3 - 2 * t);
}

/**
 * Patch field 0..1: low-frequency spatial structure blended 50/50 with a
 * per-instance hash, so the darkness has structure instead of reading as a
 * uniform stain. The GPU evaluates the same shape (spatial sin/cos field +
 * fract-sin instance hash) with its own hash stream; this CPU twin pins the
 * distribution (patchy, never uniform, never full-black), not per-instance
 * equality across the CPU/GPU hash boundary.
 */
export function grassContactPatch01(x: number, z: number, hash01: number): number {
  const spatial = 0.5 + 0.5 * Math.sin(x * 0.37 + 1.7) * Math.cos(z * 0.33 - 0.6);
  return 0.5 * spatial + 0.5 * Math.min(1, Math.max(0, hash01));
}

/** Effective shade multiplier from the patch field: 0.45 (hollow) .. 1.0. */
export function grassContactPatchShade(x: number, z: number, hash01: number): number {
  return 1 - 0.55 * grassContactPatch01(x, z, hash01);
}

// ---------------------------------------------------------------------------
// Seeded PRNG — the donor's mulberry32 idiom (no Math.random, ever)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function webgl2CompatRoute(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement?.dataset.renderBackend === 'webgl2'
  );
}

/** fract-sin instance hash — the donor's TSL recipe, own salt stream. */
function instanceHash(salt: number) {
  const idx = float(instanceIndex);
  return fract(sin(idx.mul(12.9898).add(salt * 7.13)).mul(43758.5453));
}

// ---------------------------------------------------------------------------
// Geometry — built in code, no meshes, no assets
// ---------------------------------------------------------------------------

/**
 * Thatch: 3 near-horizontal strips crossing at 60°, one end pinned near the
 * plate, the other lodged up into the band. 6 triangles. Tops land at
 * 0.070–0.075 m so per-instance scale [0.75, 1.0] keeps the constructed top
 * inside [0.05, 0.08] m.
 */
export function createGrassContactGeometry(name: string): THREE.BufferGeometry {
  const LEN = 0.24;
  const WID = 0.05;
  const YAWS = [0, Math.PI / 3, (2 * Math.PI) / 3];
  const TILT: Array<readonly [number, number]> = [
    [0.008, 0.075],
    [0.006, 0.07],
    [0.01, 0.072],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  for (let strip = 0; strip < 3; strip += 1) {
    const yaw = YAWS[strip]!;
    const [y0, y1] = TILT[strip]!;
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const corner = (lx: number, y: number, lz: number): number => {
      const wx = lx * cosY - lz * sinY;
      const wz = lx * sinY + lz * cosY;
      positions.push(wx, y, wz);
      return positions.length / 3 - 1;
    };
    const a = corner(-LEN / 2, y0, -WID / 2);
    const b = corner(LEN / 2, y1, -WID / 2);
    const c = corner(LEN / 2, y1, WID / 2);
    const d = corner(-LEN / 2, y0, WID / 2);
    indices.push(a, b, d, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = name;
  return geometry;
}

/**
 * Litter: one flat irregular quad (a rectangle with a clipped corner, fanned
 * to 3 triangles) lying in the plane — clover/moss/dry-leaf read without a
 * single vertical blade. Costs no overdraw at standing height.
 */
export function createGrassLitterGeometry(name: string): THREE.BufferGeometry {
  const rim: Array<readonly [number, number, number]> = [
    [-0.05, 0.005, -0.035],
    [0.05, 0.006, -0.03],
    [0.055, 0.005, 0.012],
    [0.008, 0.007, 0.045],
    [-0.045, 0.006, 0.03],
  ];
  const positions: number[] = [];
  for (const v of rim) positions.push(v[0], v[1], v[2]);
  // Rim fan: a clipped-corner quad triangulates to exactly 3.
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 4];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = name;
  return geometry;
}

// ---------------------------------------------------------------------------
// Material — one TSL graph shared by both meshes, zero textures
// ---------------------------------------------------------------------------

export type GrassContactMaterialDiagnostics = {
  /** The ramp function the graph constants were evaluated from. */
  rampFn: typeof grassContactRamp;
  /** The distance-scale function mirroring the vertex LOD term. */
  distanceFn: typeof grassContactDistanceScale;
  lodNearM: number;
  lodFarM: number;
  /** Sampler count: always 0 (a texture here is a silent-rollback risk). */
  samplers: number;
};

function makeContactMaterial(
  plateColor: number,
  roughness: number,
  lodNearM: number,
  lodFarM: number,
): { material: THREE.Material; diagnostics: GrassContactMaterialDiagnostics } {
  const mat = new MeshStandardNodeMaterial({
    color: plateColor,
    roughness,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // Donor rule: map the node material onto the standard shaderID so a
  // non-node renderer can still compile it.
  mat.type = 'MeshStandardMaterial';

  // ---- smooth distance LOD (vertex stage): shrink out, never pop ----
  const camDist = positionWorld.distance(cameraPosition);
  const lod = float(1).sub(smoothstep(float(lodNearM), float(lodFarM), camDist));
  mat.positionNode = positionLocal.mul(lod) as unknown as Node<'vec3'>;

  // ---- contact darkening ramp + patch field (fragment stage) ----
  // The constants come out of grassContactRamp itself: root = ramp(0),
  // tip = ramp(1). There is exactly one ramp definition in this module.
  const rootK = grassContactRamp(0);
  const tipK = grassContactRamp(1);
  const hN = positionLocal.y.div(GRASS_CONTACT_BAND_HEIGHT_M).clamp(0, 1);
  const ramp = float(rootK).add(
    float(tipK - rootK).mul(hN.pow(GRASS_CONTACT_RAMP_EXPONENT)),
  );
  // Patch: same shape as grassContactPatch01 — spatial field + instance hash.
  const spatial = sin(positionWorld.x.mul(0.37).add(1.7))
    .mul(cos(positionWorld.z.mul(0.33).sub(0.6)))
    .mul(0.5)
    .add(0.5);
  const patch01 = spatial.mul(0.5).add(instanceHash(11).mul(0.5));
  const shade = float(1).sub(patch01.mul(0.55));
  const base = vec3(materialColor as unknown as Node<'vec3'>);
  mat.colorNode = base.mul(ramp).mul(shade);

  const diagnostics: GrassContactMaterialDiagnostics = {
    rampFn: grassContactRamp,
    distanceFn: grassContactDistanceScale,
    lodNearM,
    lodFarM,
    samplers: 0,
  };
  mat.userData.grassContact = diagnostics;
  return { material: mat, diagnostics };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface GrassContactLayerOptions {
  /** Mesh name prefix, e.g. 'nuketown2-lawn'. */
  name: string;
  /** Fixed placement seed — identical tier on every peer. */
  seed: number;
  /** Placement rectangles; one candidate per cell, jittered. */
  regions: readonly GrassRegionRect[];
  /** Arena keep-out truth: return false to reject a candidate. */
  placementAllowed?: (x: number, z: number) => boolean;
  /** Ground height lookup; default flat 0. */
  groundY?: (x: number, z: number) => number;
  /** Lawn plate reference: the caller already passes this tint. */
  plateColor: number;
  roughness?: number;
  /** Near-camera density twins (same shape as the blade field's band). */
  nearBand?: GrassNearBandSpec | null;
  /** Reduced detail: cell doubles, LOD band collapses to 4 m → 8 m. */
  reduced?: boolean;
  /** Ground litter scatter (amendment experiment 3a). Default true. */
  litter?: boolean;
}

export interface GrassContactLayerStats {
  thatchInstances: number;
  litterInstances: number;
  instances: number;
  triangles: number;
  drawCalls: number;
  samplers: number;
}

export interface GrassContactLayer {
  group: THREE.Group;
  meshes: readonly THREE.InstancedMesh[];
  /** Shared TSL material (one pipeline for both meshes); null on WebGL2. */
  material: THREE.Material | null;
  stats: Readonly<GrassContactLayerStats>;
  /** Static tier: no uniforms, nothing to advance. Kept for call symmetry. */
  advanceWind(_seconds: number): void;
  dispose(): void;
}

const STRAW_TINT = Object.freeze({ r: 1.28, g: 1.16, b: 0.72 });
const LITTER_MOSS_A = Object.freeze({ r: 0.32, g: 0.44, b: 0.28 });
const LITTER_MOSS_B = Object.freeze({ r: 0.42, g: 0.5, b: 0.3 });
const LITTER_DRY = Object.freeze({ r: 1.12, g: 1.0, b: 0.68 });

export function buildGrassContactLayer(options: GrassContactLayerOptions): GrassContactLayer {
  const group = new THREE.Group();
  group.name = `${options.name}-contact`;
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const empty: GrassContactLayer = {
    group,
    meshes: [],
    material: null,
    stats: {
      thatchInstances: 0,
      litterInstances: 0,
      instances: 0,
      triangles: 0,
      drawCalls: 0,
      samplers: 0,
    },
    advanceWind: () => {},
    dispose: () => {},
  };
  // Lowest-tier graceful degradation: the tier does not construct on the
  // WebGL2 compat route — the lawn stays exactly as it was. Never an error.
  if (webgl2CompatRoute()) return empty;

  const reduced = options.reduced === true;
  const cell = (options.reduced === true ? GRASS_CONTACT_CELL_M * 2 : GRASS_CONTACT_CELL_M);
  const litterCell = GRASS_CONTACT_LITTER_CELL_M * (reduced ? 2 : 1);
  const lodNearM = reduced ? GRASS_CONTACT_LOD_NEAR_REDUCED_M : GRASS_CONTACT_LOD_NEAR_M;
  const lodFarM = reduced ? GRASS_CONTACT_LOD_FAR_REDUCED_M : GRASS_CONTACT_LOD_FAR_M;
  const groundY = options.groundY ?? (() => 0);
  const allowed = options.placementAllowed ?? (() => true);
  const [scaleMin, scaleMax] = GRASS_CONTACT_SCALE_RANGE;

  const thatchGeometry = createGrassContactGeometry(`${GRASS_CONTACT_TIER_MARKER}-${options.name}`);
  const withLitter = options.litter !== false;
  const litterGeometry = withLitter
    ? createGrassLitterGeometry(`${GRASS_CONTACT_TIER_MARKER}-litter-${options.name}`)
    : null;
  const { material } = makeContactMaterial(
    options.plateColor,
    options.roughness ?? 0.92,
    lodNearM,
    lodFarM,
  );

  const band = options.nearBand ?? null;
  const twinChance = band ? Math.min(1, Math.max(0, band.densityFactor - 1)) : 0;
  const bandRadiusSq = band ? band.radiusM * band.radiusM : 0;
  const inBand =
    band && band.points.length > 0 && twinChance > 0
      ? (x: number, z: number): boolean => {
        for (const point of band.points) {
          const dx = x - point[0];
          const dz = z - point[1];
          if (dx * dx + dz * dz <= bandRadiusSq) return true;
        }
        return false;
      }
      : null;

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const tint = new THREE.Color();

  type Candidate = { x: number; z: number; yaw: number; scale: number; hash: number };
  // Deterministic candidate pass: the RNG stream is consumed identically
  // regardless of rejections, so a keep-out change never rearranges the rest
  // of the tier. Two builds with the same options are identical on every peer.
  const collect = (
    seed: number,
    cellM: number,
    twin: boolean,
  ): Candidate[] => {
    const rng = mulberry32(seed);
    const out: Candidate[] = [];
    for (let regionIndex = 0; regionIndex < options.regions.length; regionIndex += 1) {
      const region = options.regions[regionIndex]!;
      for (let pz = region.minZ; pz < region.maxZ; pz += cellM) {
        for (let px = region.minX; px < region.maxX; px += cellM) {
          const x = px + rng() * cellM;
          const z = pz + rng() * cellM;
          const yaw = rng() * Math.PI * 2;
          const scale = scaleMin + rng() * (scaleMax - scaleMin);
          const hash = rng();
          if (x > region.maxX || z > region.maxZ) continue;
          if (!allowed(x, z)) continue;
          out.push({ x, z, yaw, scale, hash });
          if (twin && inBand && inBand(x, z) && rng() < twinChance) {
            const tx = Math.min(region.maxX, Math.max(region.minX, x + (rng() - 0.5) * cellM * 0.8));
            const tz = Math.min(region.maxZ, Math.max(region.minZ, z + (rng() - 0.5) * cellM * 0.8));
            if (allowed(tx, tz)) {
              out.push({
                x: tx,
                z: tz,
                yaw: rng() * Math.PI * 2,
                scale: scaleMin + rng() * (scaleMax - scaleMin),
                hash: rng(),
              });
            }
          }
        }
      }
    }
    return out;
  };

  // One InstancedMesh per tier across ALL regions: a single draw each, so the
  // region count of the caller's lawn can never push the tier over budget.
  const thatch = collect(options.seed, cell, true);
  const meshes: THREE.InstancedMesh[] = [];

  const fillMesh = (
    geometry: THREE.BufferGeometry,
    meshName: string,
    candidates: Candidate[],
    straw: boolean,
  ): void => {
    if (candidates.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, candidates.length);
    mesh.name = meshName;
    for (let k = 0; k < candidates.length; k += 1) {
      const inst = candidates[k]!;
      euler.set(0, inst.yaw, 0);
      quaternion.setFromEuler(euler);
      position.set(inst.x, groundY(inst.x, inst.z), inst.z);
      const xz = 0.85 + (k % 5) * 0.07;
      scaleVec.set(xz, inst.scale, xz);
      matrix.compose(position, quaternion, scaleVec);
      mesh.setMatrixAt(k, matrix);
      if (straw) {
        // Same mesh, per-instance tint: ~1 cell in 6 a lodged pale strand.
        if (inst.hash < GRASS_CONTACT_STRAW_FRACTION) tint.setRGB(STRAW_TINT.r, STRAW_TINT.g, STRAW_TINT.b);
        else tint.setRGB(1, 1, 1);
      } else if (inst.hash < GRASS_CONTACT_DRY_LEAF_FRACTION) {
        tint.setRGB(LITTER_DRY.r, LITTER_DRY.g, LITTER_DRY.b);
      } else if (inst.hash < 0.5) {
        tint.setRGB(LITTER_MOSS_A.r, LITTER_MOSS_A.g, LITTER_MOSS_A.b);
      } else {
        tint.setRGB(LITTER_MOSS_B.r, LITTER_MOSS_B.g, LITTER_MOSS_B.b);
      }
      mesh.setColorAt(k, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Donor gotcha: the bounding volume must wrap the instance BOUNDS.
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    group.add(mesh);
    meshes.push(mesh);
  };

  fillMesh(
    thatchGeometry,
    `${GRASS_CONTACT_TIER_MARKER}-${options.name}`,
    thatch,
    true,
  );
  const litter = withLitter && litterGeometry
    ? collect((options.seed ^ 0x1eaf_77aa) >>> 0, litterCell, false)
    : [];
  if (withLitter && litterGeometry) {
    fillMesh(
      litterGeometry,
      `${GRASS_CONTACT_TIER_MARKER}-litter-${options.name}`,
      litter,
      false,
    );
  }

  const stats: GrassContactLayerStats = {
    thatchInstances: thatch.length === 0 ? 0 : (meshes[0]?.count ?? 0),
    litterInstances: litter.length === 0 ? 0 : (meshes[1]?.count ?? 0),
    instances: meshes.reduce((n, mesh) => n + mesh.count, 0),
    triangles:
      (meshes[0]?.count ?? 0) * GRASS_CONTACT_THATCH_TRIANGLES +
      (meshes[1]?.count ?? 0) * GRASS_CONTACT_LITTER_TRIANGLES,
    drawCalls: meshes.length,
    samplers: 0,
  };

  return {
    group,
    meshes,
    material,
    stats,
    advanceWind: () => {},
    dispose: () => {
      thatchGeometry.dispose();
      litterGeometry?.dispose();
      material.dispose();
    },
  };
}
