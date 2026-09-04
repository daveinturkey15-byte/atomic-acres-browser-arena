/**
 * HF-398 — the analytic proxy scene the ray-traced preset actually traces
 * against, and the intersection routines that do it.
 *
 * WHY ANALYTIC SHAPES RATHER THAN A TRIANGLE BVH.
 * The row 19 technique extends BVH acceleration to cover triangle meshes AND
 * quadric shapes, and it is explicit that quadrics are the better deal: an
 * analytic sphere or cylinder costs one closed-form solve, stays perfectly
 * round at any zoom, and never shows the faceting that a tessellated sphere
 * displays most cruelly in exactly the mirror material you would want on it.
 *
 * Our arenas are authored for a rasterizer by other lanes and can be a quarter
 * of a million triangles. Uploading and traversing that per frame in a fragment
 * shader is the "collapses as soon as anything moves" failure this technique is
 * famous for. So the tracer gets a PROXY: a small, bounded set of oriented
 * boxes, spheres and one ground plane fitted to the arena's largest occluders.
 *
 * The honest consequences, stated up front rather than discovered in review:
 *   - A reflection shows the proxy silhouette, not every railing bolt. At the
 *     reflection intensities this preset is allowed (see `raytracing-profile`),
 *     that reads as a correct reflection of the room, because a reflection is
 *     already a dim, Fresnel-weighted, secondary image.
 *   - It reflects geometry that is OFF SCREEN, which is the one thing the
 *     existing screen-space reflection tier structurally cannot do, and it is
 *     the reason this is ray tracing rather than another screen-space trick.
 *   - Shadow rays against the proxy give hard, pixel-perfect contact edges
 *     without a shadow map's resolution or peter-panning artefacts.
 *
 * The proxy is built ONCE per arena, at arena build time, behind the loading
 * screen. It is never rebuilt per frame. Dynamic objects (players, bots,
 * vehicles) are deliberately NOT in it — see `raytracing-profile.ts`, where the
 * preset-parity rule explains why a reflected enemy is a competitive-integrity
 * decision and not a graphics one.
 */

import type * as THREE from 'three';
import { type Vec3, add, dot, normalize, scale, sub, vec3 } from './whitted-materials';

export type ProxyShapeKind = 'box' | 'sphere' | 'plane';

/**
 * One traceable shape. Boxes carry a yaw only: arena architecture is built on
 * the world Y axis, and a yaw-only frame is a two-multiply rotation in the
 * shader instead of a full matrix, which matters when it runs per ray per hit.
 */
export type ProxyShape = Readonly<{
  kind: ProxyShapeKind;
  /** World-space centre. For a plane, the point on it. */
  centre: Vec3;
  /** Box half-extents in the shape's own frame; sphere radius in x. */
  halfExtents: Vec3;
  /** Yaw about world Y, radians. Zero for spheres and planes. */
  yaw: number;
  /** Plane normal. Zero vector for boxes and spheres. */
  normal: Vec3;
  /** Linear albedo used when a ray lands on this proxy. */
  albedo: Vec3;
  /** Packed metalness/roughness so the hit can be classified like any surface. */
  metalness: number;
  roughness: number;
  /** Source object name, for auditability. */
  name: string;
}>;

export type ProxyScene = Readonly<{
  shapes: readonly ProxyShape[];
  /** World-space AABB of everything in `shapes`, used as the traversal's root. */
  boundsMin: Vec3;
  boundsMax: Vec3;
  /** How many meshes were considered before the cap was applied. */
  candidatesConsidered: number;
  /**
   * How many visible arena meshes are smooth enough to SPAWN a reflection ray
   * at all. This is the number that says whether the trace can do anything on
   * this arena, and it is measured rather than assumed: a map made entirely of
   * grass, brick and stucco is a map where a correctly-implemented reflection
   * layer is correctly invisible, and that has to be reportable rather than
   * mistaken for a broken pass.
   */
  reflectiveMeshCount: number;
  /** Their combined world footprint, m^2. Area, because area is the cost. */
  reflectiveFootprintM2: number;
  /** Why the set stops where it does. */
  capReason: string;
}>;

export type RayHit = Readonly<{
  /** Distance along the ray. Positive, and `Infinity` when there is no hit. */
  t: number;
  point: Vec3;
  normal: Vec3;
  shapeIndex: number;
}>;

export const NO_HIT: RayHit = Object.freeze({
  t: Number.POSITIVE_INFINITY,
  point: vec3(0, 0, 0),
  normal: vec3(0, 1, 0),
  shapeIndex: -1,
});

/**
 * Ray origins are pushed this far along the surface normal before a secondary
 * ray is cast. Without it the new ray re-hits the surface it left at t~=0,
 * which is the classic acne that makes a first ray tracer look like it is
 * covered in static.
 */
export const SURFACE_EPSILON_M = 1e-3;

function rotateYaw(point: Vec3, yaw: number): Vec3 {
  if (yaw === 0) return point;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return vec3(point[0] * c + point[2] * s, point[1], -point[0] * s + point[2] * c);
}

function unrotateYaw(point: Vec3, yaw: number): Vec3 {
  return rotateYaw(point, -yaw);
}

/**
 * Slab test against a yaw-oriented box. Returns the nearest positive entry
 * with the box's outward geometric normal. The previous implementation kept
 * the entry sign when a ray started inside and selected a ray-facing sign on
 * one exterior side: harmless for sign-symmetric mirrors, wrong for diffuse.
 */
export function intersectBox(origin: Vec3, direction: Vec3, shape: ProxyShape): RayHit {
  const localOrigin = rotateYaw(sub(origin, shape.centre), shape.yaw);
  const localDirection = rotateYaw(direction, shape.yaw);
  let near = Number.NEGATIVE_INFINITY;
  let far = Number.POSITIVE_INFINITY;
  let nearAxis = 0;
  let nearSign = 1;
  let farAxis = 0;
  let farSign = 1;
  for (let index = 0; index < 3; index += 1) {
    const half = shape.halfExtents[index];
    const d = localDirection[index];
    const o = localOrigin[index];
    if (Math.abs(d) < 1e-9) {
      if (o < -half || o > half) return NO_HIT;
      continue;
    }
    const inverse = 1 / d;
    let t0 = (-half - o) * inverse;
    let t1 = (half - o) * inverse;
    let nearFaceSign = -1;
    let farFaceSign = 1;
    if (t0 > t1) {
      const swap = t0;
      t0 = t1;
      t1 = swap;
      nearFaceSign = 1;
      farFaceSign = -1;
    }
    if (t0 > near) {
      near = t0;
      nearAxis = index;
      nearSign = nearFaceSign;
    }
    if (t1 < far) {
      far = t1;
      farAxis = index;
      farSign = farFaceSign;
    }
    if (near > far) return NO_HIT;
  }
  const t = near > SURFACE_EPSILON_M ? near : far;
  if (!(t > SURFACE_EPSILON_M) || !Number.isFinite(t)) return NO_HIT;
  const axis = near > SURFACE_EPSILON_M ? nearAxis : farAxis;
  const sign = near > SURFACE_EPSILON_M ? nearSign : farSign;
  const localNormal = vec3(
    axis === 0 ? sign : 0,
    axis === 1 ? sign : 0,
    axis === 2 ? sign : 0,
  );
  return Object.freeze({
    t,
    point: add(origin, scale(direction, t)),
    normal: normalize(unrotateYaw(localNormal, shape.yaw)),
    shapeIndex: -1,
  });
}

/** Closed-form quadric solve. This is where analytic shapes earn their place. */
export function intersectSphere(origin: Vec3, direction: Vec3, shape: ProxyShape): RayHit {
  const radius = shape.halfExtents[0];
  const toCentre = sub(origin, shape.centre);
  const b = dot(toCentre, direction);
  const c = dot(toCentre, toCentre) - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return NO_HIT;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  const far = -b + root;
  const t = near > SURFACE_EPSILON_M ? near : far;
  if (!(t > SURFACE_EPSILON_M)) return NO_HIT;
  const point = add(origin, scale(direction, t));
  return Object.freeze({
    t,
    point,
    normal: normalize(sub(point, shape.centre)),
    shapeIndex: -1,
  });
}

export function intersectPlane(origin: Vec3, direction: Vec3, shape: ProxyShape): RayHit {
  const denominator = dot(shape.normal, direction);
  if (Math.abs(denominator) < 1e-9) return NO_HIT;
  const t = dot(sub(shape.centre, origin), shape.normal) / denominator;
  if (!(t > SURFACE_EPSILON_M)) return NO_HIT;
  return Object.freeze({
    t,
    point: add(origin, scale(direction, t)),
    normal: denominator < 0 ? shape.normal : scale(shape.normal, -1),
    shapeIndex: -1,
  });
}

export function intersectShape(origin: Vec3, direction: Vec3, shape: ProxyShape): RayHit {
  if (shape.kind === 'sphere') return intersectSphere(origin, direction, shape);
  if (shape.kind === 'plane') return intersectPlane(origin, direction, shape);
  return intersectBox(origin, direction, shape);
}

/** Nearest hit across the whole proxy set. Linear: the set is capped for this. */
export function intersectScene(origin: Vec3, direction: Vec3, scene: ProxyScene): RayHit {
  let best = NO_HIT;
  for (let index = 0; index < scene.shapes.length; index += 1) {
    const hit = intersectShape(origin, direction, scene.shapes[index]);
    if (hit.t < best.t) best = Object.freeze({ ...hit, shapeIndex: index });
  }
  return best;
}

/**
 * Occlusion query for a shadow ray. Stops at the first hit rather than finding
 * the nearest one, because a shadow ray only asks "is anything in the way".
 * Transparent proxies do not block: light that survives refraction through them
 * is what the caustic term is made of.
 */
export function occluded(
  origin: Vec3,
  direction: Vec3,
  maximumDistance: number,
  scene: ProxyScene,
  isTransparent: (shape: ProxyShape) => boolean = () => false,
): boolean {
  for (const shape of scene.shapes) {
    if (isTransparent(shape)) continue;
    const hit = intersectShape(origin, direction, shape);
    if (hit.t > SURFACE_EPSILON_M && hit.t < maximumDistance) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Extraction from a real arena scene graph
// ---------------------------------------------------------------------------

type MeshLike = {
  isMesh?: boolean;
  visible: boolean;
  name: string;
  geometry?: { boundingBox?: unknown; computeBoundingBox?: () => void };
  matrixWorld?: unknown;
  material?: unknown;
};

type BoxLike = { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };

export type ProxyExtractionOptions = Readonly<{
  /**
   * Hard cap on traced shapes. Every shape is tested by every ray, so this is
   * the single number that decides the shader's cost, and it is a declared
   * budget rather than a discovered one.
   */
  maximumShapes: number;
  /** Smallest world-space footprint area, m^2, worth a proxy at all. */
  minimumFootprintM2: number;
  /**
   * Water surfaces REGISTERED BY NAME as analytic plane proxies. Water is
   * reflective by design — an ocean, lagoon or sea plane that happens to carry
   * an authored roughness above the mirror ceiling (the compat-route sea
   * planes sit at 0.24-0.30 for their raster look) must still spawn
   * reflections, because "the sea does not reflect" is not a defensible read
   * of any ocean arena. A matched mesh whose world bounds are thin along Y is
   * emitted as a `plane` proxy (the only orientation the packed uniform
   * layout can round-trip, see `unpackProxyShape`); anything else falls back
   * to the ordinary box path. The PROXY's roughness is clamped to
   * `REFLECTIVE_ROUGHNESS_CEILING` and its metalness to
   * `WATER_PROXY_MAXIMUM_METALNESS` — water is a dielectric — while the
   * authored raster material is left byte-for-byte alone. Registration lives
   * in `arena-proxy-registration.ts`, never inline here.
   */
  waterSurfaces?: readonly Readonly<{
    /** Matches the SOURCE MESH name; first match wins. */
    namePattern: RegExp;
  }>[];
}>;

export const DEFAULT_PROXY_EXTRACTION: ProxyExtractionOptions = Object.freeze({
  maximumShapes: 24,
  minimumFootprintM2: 6,
});

function boundsOf(object: MeshLike, three: typeof THREE): BoxLike | null {
  const geometry = object.geometry as { boundingBox: BoxLike | null; computeBoundingBox: () => void } | undefined;
  if (!geometry) return null;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingBox) return null;
  const box = new three.Box3().copy(geometry.boundingBox as unknown as THREE.Box3);
  box.applyMatrix4(object.matrixWorld as THREE.Matrix4);
  if (!Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return null;
  return box as unknown as BoxLike;
}

function materialSample(material: unknown): { albedo: Vec3; metalness: number; roughness: number } {
  const record = material as {
    color?: { r: number; g: number; b: number };
    metalness?: number;
    roughness?: number;
  } | undefined;
  const colour = record?.color;
  return {
    albedo: vec3(colour?.r ?? 0.5, colour?.g ?? 0.5, colour?.b ?? 0.5),
    metalness: typeof record?.metalness === 'number' ? record.metalness : 0,
    roughness: typeof record?.roughness === 'number' ? record.roughness : 1,
  };
}

/**
 * Fits the proxy set to an arena root.
 *
 * Selection is by world-space FOOTPRINT AREA, largest first, which picks the
 * walls, floors, containers and vehicles that actually define what a reflection
 * of the room looks like, and rejects the thousand small props whose absence
 * from a secondary image nobody can see.
 */
export function extractProxyScene(
  root: THREE.Object3D,
  three: typeof THREE,
  options: ProxyExtractionOptions = DEFAULT_PROXY_EXTRACTION,
): ProxyScene {
  type Candidate = { area: number; shape: ProxyShape };
  const candidates: Candidate[] = [];
  let reflectiveMeshCount = 0;
  let reflectiveFootprintM2 = 0;
  root.traverse((node) => {
    const mesh = node as unknown as MeshLike;
    if (!mesh.isMesh || !mesh.visible) return;
    const box = boundsOf(mesh, three);
    if (!box) return;
    const sizeX = box.max.x - box.min.x;
    const sizeY = box.max.y - box.min.y;
    const sizeZ = box.max.z - box.min.z;
    const name = mesh.name || '(unnamed)';
    // Registered water becomes an analytic PLANE proxy, counted as reflective
    // whatever its authored raster roughness says — see the option's contract.
    // Only a Y-thin surface can take the plane path: the packed uniform layout
    // reconstructs planes as +Y horizontal (unpackProxyShape), so anything
    // else keeps the ordinary box fit rather than lying about its orientation.
    const registeredWater = options.waterSurfaces?.some(({ namePattern }) => namePattern.test(name)) ?? false;
    // Degeneracy guard. A proxy needs a surface for a slab test to describe, so
    // two positive axes is the real floor and the third is required only for
    // the box path.
    //
    // PASS 81: a sea plane is EXACTLY that third case. Every water surface this
    // project registers is a PlaneGeometry laid flat, i.e. zero-thickness by
    // construction, and it reached the water branch at all only because
    // `cos(-PI/2)` is 6.12e-17 rather than 0 and a rotated plane therefore
    // measures 8.6e-15 m thick. Bake the same surface with an exact zero extent
    // — a merged buffer, a pre-rotated geometry, a GLB — and the whole water
    // registration would have gone silently dead. Flatness is admitted for
    // registered water only: an unregistered flat card (foam ring, decal, sand
    // gradient) has no volume to trace and its large area would take slots in
    // the 24-shape budget away from the walls a reflection is made of.
    const flatWater = registeredWater && sizeY <= sizeX && sizeY <= sizeZ;
    if (!(sizeX > 0) || !(sizeZ > 0)) return;
    if (!(sizeY > 0) && !flatWater) return;
    // Footprint, not volume: a tall thin lamp post and a wide low crate have
    // similar volumes and completely different presence in a reflection.
    const area = Math.max(sizeX * sizeZ, sizeX * sizeY, sizeZ * sizeY);
    if (area < options.minimumFootprintM2) return;
    const sample = materialSample(mesh.material);
    const centre = vec3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    const halfExtents = vec3(sizeX / 2, sizeY / 2, sizeZ / 2);
    if (flatWater) {
      reflectiveMeshCount += 1;
      reflectiveFootprintM2 += area;
      candidates.push({
        area,
        shape: Object.freeze({
          kind: 'plane' as const,
          centre,
          halfExtents,
          yaw: 0,
          normal: vec3(0, 1, 0),
          albedo: sample.albedo,
          metalness: Math.min(sample.metalness, WATER_PROXY_MAXIMUM_METALNESS),
          roughness: Math.min(sample.roughness, REFLECTIVE_ROUGHNESS_CEILING),
          name,
        }),
      });
      return;
    }
    if (sample.roughness <= REFLECTIVE_ROUGHNESS_CEILING) {
      reflectiveMeshCount += 1;
      reflectiveFootprintM2 += area;
    }
    candidates.push({
      area,
      shape: Object.freeze({
        kind: 'box' as const,
        centre,
        halfExtents,
        yaw: 0,
        normal: vec3(0, 0, 0),
        albedo: sample.albedo,
        metalness: sample.metalness,
        roughness: sample.roughness,
        name,
      }),
    });
  });
  candidates.sort((left, right) => right.area - left.area);
  const kept = candidates.slice(0, Math.max(0, options.maximumShapes)).map(({ shape }) => shape);
  return finaliseProxyScene(kept, candidates.length, options, {
    reflectiveMeshCount,
    reflectiveFootprintM2,
  });
}

/**
 * Mirror-roughness ceiling, restated here so the extractor can count reflective
 * surfaces without importing the classifier's whole rule table. It is the same
 * number: `MIRROR_ROUGHNESS_CEILING`, asserted equal in the suite.
 */
export const REFLECTIVE_ROUGHNESS_CEILING = 0.22;

/**
 * Water is a dielectric: its reflection is Fresnel sky/glint, never metallic.
 * A registered sea plane whose authored raster material carries a decorative
 * metalness (the contained-feature waters sit at 0.28 for their colour
 * response) is clamped to this for the PROXY only — the classifier must read
 * it as the water it is.
 */
export const WATER_PROXY_MAXIMUM_METALNESS = 0.05;

export function finaliseProxyScene(
  shapes: readonly ProxyShape[],
  candidatesConsidered: number,
  options: ProxyExtractionOptions = DEFAULT_PROXY_EXTRACTION,
  reflective: Readonly<{ reflectiveMeshCount: number; reflectiveFootprintM2: number }> = {
    reflectiveMeshCount: 0,
    reflectiveFootprintM2: 0,
  },
): ProxyScene {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const shape of shapes) {
    const extent = shape.kind === 'sphere'
      ? vec3(shape.halfExtents[0], shape.halfExtents[0], shape.halfExtents[0])
      : shape.halfExtents;
    minX = Math.min(minX, shape.centre[0] - extent[0]);
    minY = Math.min(minY, shape.centre[1] - extent[1]);
    minZ = Math.min(minZ, shape.centre[2] - extent[2]);
    maxX = Math.max(maxX, shape.centre[0] + extent[0]);
    maxY = Math.max(maxY, shape.centre[1] + extent[1]);
    maxZ = Math.max(maxZ, shape.centre[2] + extent[2]);
  }
  const empty = shapes.length === 0;
  return Object.freeze({
    shapes: Object.freeze([...shapes]),
    boundsMin: empty ? vec3(0, 0, 0) : vec3(minX, minY, minZ),
    boundsMax: empty ? vec3(0, 0, 0) : vec3(maxX, maxY, maxZ),
    candidatesConsidered,
    reflectiveMeshCount: reflective.reflectiveMeshCount,
    reflectiveFootprintM2: Number(reflective.reflectiveFootprintM2.toFixed(2)),
    capReason: candidatesConsidered > options.maximumShapes
      ? `capped at ${options.maximumShapes} of ${candidatesConsidered} candidates by world footprint area`
      : `all ${candidatesConsidered} candidates above ${options.minimumFootprintM2} m^2 retained`,
  });
}

/**
 * Packs the proxy set into the flat float layout the shader's uniform array
 * consumes. Kept here rather than in the node module so the packing is
 * testable without a GPU, which is the only way this stays debuggable.
 *
 * Four vec4s per shape, because that is what a GPU uniform array actually
 * wants; packing two values into one float to save a slot is how a proxy set
 * silently decodes wrong on one driver and not another.
 *   vec4 0: centre.xyz,       kind (0 box, 1 sphere, 2 plane)
 *   vec4 1: halfExtents.xyz,  yaw            (sphere radius lives in .x)
 *   vec4 2: albedo.rgb,       metalness
 *   vec4 3: roughness, 0, 0, 0
 */
export const PROXY_FLOATS_PER_SHAPE = 16;

export function packProxyScene(scene: ProxyScene, maximumShapes: number): Float32Array {
  const packed = new Float32Array(maximumShapes * PROXY_FLOATS_PER_SHAPE);
  const count = Math.min(scene.shapes.length, maximumShapes);
  for (let index = 0; index < count; index += 1) {
    const shape = scene.shapes[index];
    const base = index * PROXY_FLOATS_PER_SHAPE;
    packed[base + 0] = shape.centre[0];
    packed[base + 1] = shape.centre[1];
    packed[base + 2] = shape.centre[2];
    packed[base + 3] = shape.kind === 'box' ? 0 : shape.kind === 'sphere' ? 1 : 2;
    packed[base + 4] = shape.halfExtents[0];
    packed[base + 5] = shape.halfExtents[1];
    packed[base + 6] = shape.halfExtents[2];
    packed[base + 7] = shape.yaw;
    packed[base + 8] = shape.albedo[0];
    packed[base + 9] = shape.albedo[1];
    packed[base + 10] = shape.albedo[2];
    packed[base + 11] = Math.min(1, Math.max(0, shape.metalness));
    packed[base + 12] = Math.min(1, Math.max(0, shape.roughness));
  }
  return packed;
}

/** Reverses `packProxyScene` for one slot, so the packing has a proven inverse. */
export function unpackProxyShape(packed: Float32Array, index: number): ProxyShape {
  const base = index * PROXY_FLOATS_PER_SHAPE;
  const kindCode = packed[base + 3];
  return Object.freeze({
    kind: kindCode === 0 ? 'box' : kindCode === 1 ? 'sphere' : 'plane',
    centre: vec3(packed[base + 0], packed[base + 1], packed[base + 2]),
    halfExtents: vec3(packed[base + 4], packed[base + 5], packed[base + 6]),
    yaw: packed[base + 7],
    normal: kindCode === 2 ? vec3(0, 1, 0) : vec3(0, 0, 0),
    albedo: vec3(packed[base + 8], packed[base + 9], packed[base + 10]),
    metalness: packed[base + 11],
    roughness: packed[base + 12],
    name: `(packed ${index})`,
  });
}

/** Convenience for callers building a ground plane proxy under an arena. */
export function groundPlaneProxy(heightM: number, albedo: Vec3, roughness = 0.8): ProxyShape {
  return Object.freeze({
    kind: 'plane' as const,
    centre: vec3(0, heightM, 0),
    halfExtents: vec3(0, 0, 0),
    yaw: 0,
    normal: vec3(0, 1, 0),
    albedo,
    metalness: 0,
    roughness,
    name: 'arena-ground-plane',
  });
}

export { dot, normalize, scale, sub, add, vec3 };
export type { Vec3 };
