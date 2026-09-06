import * as THREE from 'three';

/**
 * HF-346: shared surface-audit utilities for detecting near-coplanar horizontal
 * overlay geometry that can z-fight at an arena's max view distance.
 */

/** WebGL depth buffers are 24-bit on every target platform we ship. */
export const ARENA_DEPTH_BITS = 24;

/** A small overlay/decal is treated as a horizontal coplanar candidate. */
export const DEFAULT_OVERLAY_MAX_HEIGHT = 0.05;

export type HorizontalSurfaceSpec = Readonly<{
  name: string;
  topY: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  material: THREE.Material | null;
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
}>;

export type CoplanarPair = Readonly<{
  a: string;
  b: string;
  topA: number;
  topB: number;
  dy: number;
  overlapX: number;
  overlapZ: number;
}>;

/**
 * HF-346: minimum safe vertical separation for perspective depth precision.
 *
 * Uses the standard perspective projection derivative:
 *   dz = (1 / (2^bits - 1)) * ((far - near) / (far * near)) * z^2
 * rounded up to the nearest millimetre so authored tiers land on clean values.
 */
export function computeMinimumSafeVerticalSeparation(
  near: number,
  far: number,
  maxViewDistance: number,
  depthBits: number = ARENA_DEPTH_BITS,
): number {
  if (!Number.isFinite(near) || near <= 0) throw new Error('near must be positive');
  if (!Number.isFinite(far) || far <= near) throw new Error('far must exceed near');
  if (!Number.isFinite(maxViewDistance) || maxViewDistance <= 0) throw new Error('maxViewDistance must be positive');
  const depthSteps = 2 ** depthBits - 1;
  const step = 1 / depthSteps;
  const dz = step * ((far - near) / (far * near)) * maxViewDistance * maxViewDistance;
  // Round up to 1 mm so re-spaced tiers are authoring-friendly and unambiguous.
  return Math.ceil(dz * 1000) / 1000;
}

/** HF-346: collect world-up box tops that look like floor/apron decals. */
export function collectHorizontalOverlaySpecs(
  root: THREE.Object3D,
  maxHeight: number = DEFAULT_OVERLAY_MAX_HEIGHT,
): HorizontalSurfaceSpec[] {
  const specs: HorizontalSurfaceSpec[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    if (!(geometry instanceof THREE.BoxGeometry)) return;
    if (node.userData.skylineQualityPlaceholder) return;
    // HF-346 (Pass 74): inspect polygonOffset configuration on the material.
    // Hoisted out of collectMatrix because an InstancedMesh shares a single
    // material across every instance, so each instance inherits the same tier.
    const material = Array.isArray(node.material) ? node.material[0] ?? null : node.material;
    const polygonOffset = Boolean(material?.polygonOffset);
    const polygonOffsetFactor = material?.polygonOffset ? (material.polygonOffsetFactor ?? 0) : 0;
    const polygonOffsetUnits = material?.polygonOffset ? (material.polygonOffsetUnits ?? 0) : 0;
    const collectMatrix = (matrix: THREE.Matrix4, name: string): void => {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      matrix.decompose(position, quaternion, scale);
      const rotation = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      // Only world-upward top faces; skip ramps, tilted beams and vertical
      // instanced litter. Treating an InstancedMesh's untranslated root as one
      // surface produced false pairs between unrelated instance layers.
      if (Math.abs(rotation.x) > 1e-6 || Math.abs(rotation.z) > 1e-6) return;
      const params = geometry.parameters;
      const width = params.width * Math.abs(scale.x);
      const height = params.height * Math.abs(scale.y);
      const depth = params.depth * Math.abs(scale.z);
      if (height > maxHeight) return;
      const yaw = Math.abs(rotation.y) > 1e-6 ? rotation.y : 0;
      const cos = Math.abs(Math.cos(yaw));
      const sin = Math.abs(Math.sin(yaw));
      const sizeX = width * cos + depth * sin;
      const sizeZ = width * sin + depth * cos;
      specs.push({
        name,
        topY: position.y + height / 2,
        minX: position.x - sizeX / 2,
        maxX: position.x + sizeX / 2,
        minZ: position.z - sizeZ / 2,
        maxZ: position.z + sizeZ / 2,
        height,
        material: material ?? null,
        // HF-346: direction-aware polygonOffset exemption inputs (Pass 74).
        polygonOffset,
        polygonOffsetFactor,
        polygonOffsetUnits,
      });
    };
    // Pass 75: audit InstancedMesh per-instance transforms instead of the
    // (usually identity) instanced root, so instanced geometry is visible to
    // the coplanar sweep.
    if (node instanceof THREE.InstancedMesh) {
      const instanceMatrix = new THREE.Matrix4();
      const worldMatrix = new THREE.Matrix4();
      for (let index = 0; index < node.count; index += 1) {
        node.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(node.matrixWorld, instanceMatrix);
        collectMatrix(worldMatrix, `${node.name}[${index}]`);
      }
      return;
    }
    collectMatrix(node.matrixWorld, node.name);
  });
  return specs;
}

/** HF-346: find horizontal overlay pairs whose vertical gap is below threshold and unhandled by polygon offset. */
export function findNearCoplanarPairs(
  specs: readonly HorizontalSurfaceSpec[],
  threshold: number,
): CoplanarPair[] {
  const pairs: CoplanarPair[] = [];
  for (let i = 0; i < specs.length; i += 1) {
    for (let j = i + 1; j < specs.length; j += 1) {
      const a = specs[i];
      const b = specs[j];
      const dy = Math.abs(a.topY - b.topY);
      if (dy >= threshold) continue;

      // HF-346: contract extension: when overlapping decals are legitimately resolved
      // via distinct polygonOffset tiers (or one has polygonOffset enabled over an un-offset base),
      // the GPU rasterizer handles depth resolution without requiring vertical geometry separation.
      //
      // HF-346 direction rule: polygonOffset only resolves a pair when the offset that WINS
      // the depth test belongs to the visually-upper surface. In the WebGPU mapping,
      // polygonOffsetUnits maps to depthBias and MORE NEGATIVE wins; a positive offset pushes
      // a surface BEHIND its pair and can make an upper decal vanish. So a pair is 'handled'
      // only when: (1) no surface uses a positive factor or units, and (2) the surface with
      // the greater topY has the strictly more negative effective bias (factor + units).
      // Equal topY is decided purely by the offset tiers, so distinct non-positive tiers pass.
      const aOffset = Boolean(a.polygonOffset);
      const bOffset = Boolean(b.polygonOffset);
      if (aOffset || bOffset) {
        const positiveOffset = (s: typeof a): boolean =>
          Boolean(s.polygonOffset) &&
          ((s.polygonOffsetFactor ?? 0) > 1e-6 || (s.polygonOffsetUnits ?? 0) > 1e-6);
        const effectiveBias = (s: typeof a): number =>
          s.polygonOffset ? (s.polygonOffsetFactor ?? 0) + (s.polygonOffsetUnits ?? 0) : 0;
        if (!positiveOffset(a) && !positiveOffset(b)) {
          if (a.topY === b.topY) {
            // Same height: the distinct tier ordering alone resolves the draw.
            if (effectiveBias(a) !== effectiveBias(b)) continue;
          } else {
            const upper = a.topY > b.topY ? a : b;
            const lower = upper === a ? b : a;
            // The visually-upper surface must win the depth test (more negative bias).
            if (effectiveBias(upper) < effectiveBias(lower)) continue;
          }
        }
        // Otherwise the pair is NOT handled and falls through to be reported.
      }

      const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
      const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
      if (overlapX > 1e-3 && overlapZ > 1e-3) {
        pairs.push({ a: a.name, b: b.name, topA: a.topY, topB: b.topY, dy, overlapX, overlapZ });
      }
    }
  }
  // Deterministic ordering for test output.
  return pairs.sort((p, q) => (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : 1));
}

/**
 * HF-346: convenience audit object stored on arena roots so tests and runtime
 * diagnostics can agree on the threshold used at build time.
 */
export function arenaHorizontalSurfaceAudit(
  root: THREE.Object3D,
  near: number,
  far: number,
  maxViewDistance: number,
): Readonly<{ threshold: number; pairs: readonly CoplanarPair[]; pass: boolean }> {
  const threshold = computeMinimumSafeVerticalSeparation(near, far, maxViewDistance);
  const specs = collectHorizontalOverlaySpecs(root);
  const pairs = findNearCoplanarPairs(specs, threshold);
  const result = Object.freeze({ threshold, pairs: Object.freeze(pairs), pass: pairs.length === 0 });
  root.userData.horizontalSurfaceSeparationAudit = result;
  return result;
}

/* ------------------------------------------------------------------------- *
 * HF-346 depth pass: plane-level coplanar detection.
 *
 * `collectHorizontalOverlaySpecs` above only sees thin, axis-upright
 * BoxGeometry decals. That instrument reported ZERO pairs on every arena while
 * the owner was still looking at flicker in Skyline Terminal, because the real
 * offenders were neither thin nor decals: two full-size solid boxes whose SIDE
 * faces land on the same plane where they abut at a corner. Nothing in the
 * box/decal sweep can express that.
 *
 * This pass works from triangles instead of authoring shapes, so it is
 * geometry-agnostic (boxes, prisms, cylinders, instanced copies, merged
 * presentation batches). It answers the rasteriser's question: are there two
 * surfaces from DIFFERENT objects that (a) lie on the same plane within the
 * arena's depth resolution, (b) face the same way, so both survive backface
 * culling together, and (c) actually overlap in that plane?
 *
 * Deliberate exclusions, each because it cannot flicker on screen:
 *  - materials with `depthWrite`/`colorWrite` false (Skyline's quality
 *    placeholder colliders are neutralised exactly this way once a
 *    presentation profile is applied) and invisible materials/objects;
 *  - near-transparent materials, which blend rather than fight;
 *  - surfaces separated into different polygonOffset tiers or renderOrder,
 *    which is the authored way to resolve an intentional decal;
 *  - downward-facing surfaces at or below the ground plane, which no camera
 *    inside the playfield ever rasterises. Every prop standing on a floor has
 *    one, and they are the dominant false positive if left in.
 *
 * Patches are bucketed into plane-local grid cells so a merged batch reports
 * where its coplanar region actually is instead of one map-wide bounding box.
 * ------------------------------------------------------------------------- */

/** Plane-local grid cell size; keeps a merged batch's report local. */
const COPLANAR_PATCH_CELL_M = 4;

/** Triangles below this world area are detail trim, not a flickering surface. */
export const DEFAULT_COPLANAR_MINIMUM_TRIANGLE_AREA = 0.05;

/** Overlaps below this are corner slivers under the perceptual floor. */
export const DEFAULT_COPLANAR_MINIMUM_OVERLAP_AREA = 0.25;

export type CoplanarPatch = Readonly<{
  /** Mesh name, plus instance index for InstancedMesh copies. */
  owner: string;
  /** Unit plane normal, outward-facing for this triangle winding. */
  normal: readonly [number, number, number];
  /** Plane constant: normal . point. */
  planeDistance: number;
  /** Extent in the plane's own basis. */
  u0: number; u1: number; v0: number; v1: number;
  /** Summed world area of the triangles that formed this patch. */
  area: number;
  polygonOffsetTier: number;
  renderOrder: number;
}>;

export type CoplanarSurfaceOverlap = Readonly<{
  a: string;
  b: string;
  normal: readonly [number, number, number];
  planeDistanceA: number;
  planeDistanceB: number;
  /** Perpendicular separation of the two planes, in metres. */
  separation: number;
  /** Overlapping area shared by the two patches, in square metres. */
  overlapArea: number;
}>;

export type CoplanarSurfaceAuditOptions = Readonly<{
  minimumTriangleAreaM2?: number;
  minimumOverlapAreaM2?: number;
  /**
   * Owner-name pairs (either order, via `coplanarOverlapKey`) authored to be
   * coplanar and resolved by something this audit cannot see. Each entry must
   * name why at the call site.
   */
  intentional?: ReadonlySet<string>;
}>;

/** Deterministic in-plane basis for a unit normal. */
function planeBasis(nx: number, ny: number, nz: number): readonly [THREE.Vector3, THREE.Vector3] {
  const normal = new THREE.Vector3(nx, ny, nz);
  const helper = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();
  return [u, v];
}

/** A surface that cannot reach the depth buffer cannot z-fight. */
function participatesInDepth(material: THREE.Material | undefined): boolean {
  if (!material || material.visible === false) return false;
  if (material.depthWrite === false) return false;
  if (material.colorWrite === false) return false;
  if (material.transparent && (material.opacity ?? 1) < 0.35) return false;
  return true;
}

/** Downward face at or under the ground plane: never rasterised in-playfield. */
function hiddenUnderTheWorld(normalY: number, planeDistance: number): boolean {
  // Downward faces (normal.y ~ -1) have planeDistance = -y.
  return normalY < -0.9 && -planeDistance <= 0.02;
}

/** HF-346 depth pass: gather per-object planar patches from world triangles. */
export function collectCoplanarSurfacePatches(
  root: THREE.Object3D,
  options: CoplanarSurfaceAuditOptions = {},
): CoplanarPatch[] {
  const minimumTriangleAreaM2 = options.minimumTriangleAreaM2 ?? DEFAULT_COPLANAR_MINIMUM_TRIANGLE_AREA;
  root.updateMatrixWorld(true);
  type MutablePatch = {
    owner: string; nx: number; ny: number; nz: number; planeDistance: number;
    u0: number; u1: number; v0: number; v1: number; area: number;
    polygonOffsetTier: number; renderOrder: number;
  };
  const byKey = new Map<string, MutablePatch>();
  const vertexA = new THREE.Vector3();
  const vertexB = new THREE.Vector3();
  const vertexC = new THREE.Vector3();
  const edgeAB = new THREE.Vector3();
  const edgeAC = new THREE.Vector3();
  const normal = new THREE.Vector3();

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible) return;
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (!parent.visible) return;
    }
    const geometry = node.geometry as THREE.BufferGeometry | undefined;
    const position = geometry?.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!position) return;
    const material = (Array.isArray(node.material) ? node.material[0] : node.material) as THREE.Material | undefined;
    if (!participatesInDepth(material)) return;
    const polygonOffsetTier = material?.polygonOffset
      ? (material.polygonOffsetFactor ?? 0) + (material.polygonOffsetUnits ?? 0)
      : 0;
    const index = geometry?.getIndex() ?? null;
    const triangleCount = Math.floor((index ? index.count : position.count) / 3);
    const label = node.name || node.type;

    const worldMatrices: THREE.Matrix4[] = [];
    if (node instanceof THREE.InstancedMesh) {
      const instanceMatrix = new THREE.Matrix4();
      for (let instance = 0; instance < node.count; instance += 1) {
        node.getMatrixAt(instance, instanceMatrix);
        worldMatrices.push(new THREE.Matrix4().multiplyMatrices(node.matrixWorld, instanceMatrix));
      }
    } else worldMatrices.push(node.matrixWorld);

    for (let copy = 0; copy < worldMatrices.length; copy += 1) {
      const world = worldMatrices[copy]!;
      const owner = worldMatrices.length > 1 ? `${label}[${copy}]` : label;
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const i0 = index ? index.getX(triangle * 3) : triangle * 3;
        const i1 = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
        const i2 = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
        vertexA.fromBufferAttribute(position, i0).applyMatrix4(world);
        vertexB.fromBufferAttribute(position, i1).applyMatrix4(world);
        vertexC.fromBufferAttribute(position, i2).applyMatrix4(world);
        edgeAB.subVectors(vertexB, vertexA);
        edgeAC.subVectors(vertexC, vertexA);
        normal.crossVectors(edgeAB, edgeAC);
        const doubleArea = normal.length();
        if (doubleArea < 1e-9) continue;
        const area = doubleArea / 2;
        if (area < minimumTriangleAreaM2) continue;
        normal.multiplyScalar(1 / doubleArea);
        const planeDistance = normal.dot(vertexA);
        if (hiddenUnderTheWorld(normal.y, planeDistance)) continue;
        const [u, v] = planeBasis(normal.x, normal.y, normal.z);
        const cellU = Math.floor(vertexA.dot(u) / COPLANAR_PATCH_CELL_M);
        const cellV = Math.floor(vertexA.dot(v) / COPLANAR_PATCH_CELL_M);
        const key = `${owner}|${Math.round(normal.x * 200)},${Math.round(normal.y * 200)},${Math.round(normal.z * 200)}`
          + `|${Math.round(planeDistance * 200)}|${cellU},${cellV}`;
        let patch = byKey.get(key);
        if (!patch) {
          patch = {
            owner,
            nx: normal.x, ny: normal.y, nz: normal.z,
            planeDistance,
            u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity,
            area: 0,
            polygonOffsetTier,
            renderOrder: node.renderOrder,
          };
          byKey.set(key, patch);
        }
        for (const point of [vertexA, vertexB, vertexC]) {
          const uu = point.dot(u);
          const vv = point.dot(v);
          if (uu < patch.u0) patch.u0 = uu;
          if (uu > patch.u1) patch.u1 = uu;
          if (vv < patch.v0) patch.v0 = vv;
          if (vv > patch.v1) patch.v1 = vv;
        }
        patch.area += area;
      }
    }
  });

  return [...byKey.values()].map((patch) => Object.freeze({
    owner: patch.owner,
    normal: Object.freeze([patch.nx, patch.ny, patch.nz] as const),
    planeDistance: patch.planeDistance,
    u0: patch.u0, u1: patch.u1, v0: patch.v0, v1: patch.v1,
    area: patch.area,
    polygonOffsetTier: patch.polygonOffsetTier,
    renderOrder: patch.renderOrder,
  }));
}

/** Stable key for allowlisting one authored coplanar pair, order-independent. */
export function coplanarOverlapKey(a: string, b: string): string {
  return a <= b ? `${a}<>${b}` : `${b}<>${a}`;
}

/** HF-346 depth pass: same-facing patches sharing a plane and a footprint. */
export function findCoplanarSurfaceOverlaps(
  patches: readonly CoplanarPatch[],
  threshold: number,
  options: CoplanarSurfaceAuditOptions = {},
): CoplanarSurfaceOverlap[] {
  const minimumOverlapAreaM2 = options.minimumOverlapAreaM2 ?? DEFAULT_COPLANAR_MINIMUM_OVERLAP_AREA;
  const intentional = options.intentional ?? new Set<string>();
  const seen = new Set<string>();
  const overlaps: CoplanarSurfaceOverlap[] = [];
  for (let i = 0; i < patches.length; i += 1) {
    for (let j = i + 1; j < patches.length; j += 1) {
      const a = patches[i]!;
      const b = patches[j]!;
      if (a.owner === b.owner) continue;
      // Opposite-facing surfaces never rasterise together: one is backfacing
      // from every camera position, so a shared plane is a seam, not a fight.
      const facing = a.normal[0] * b.normal[0] + a.normal[1] * b.normal[1] + a.normal[2] * b.normal[2];
      if (facing < 0.9995) continue;
      const separation = Math.abs(a.planeDistance - b.planeDistance);
      if (separation >= threshold) continue;
      // Authored resolution: distinct polygonOffset tiers or draw order.
      if (a.polygonOffsetTier !== b.polygonOffsetTier) continue;
      if (a.renderOrder !== b.renderOrder) continue;
      const overlapU = Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0);
      const overlapV = Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0);
      if (overlapU <= 0 || overlapV <= 0) continue;
      const overlapArea = overlapU * overlapV;
      if (overlapArea < minimumOverlapAreaM2) continue;
      const key = coplanarOverlapKey(a.owner, b.owner);
      if (intentional.has(key) || seen.has(key)) continue;
      seen.add(key);
      overlaps.push(Object.freeze({
        a: a.owner,
        b: b.owner,
        normal: a.normal,
        planeDistanceA: a.planeDistance,
        planeDistanceB: b.planeDistance,
        separation,
        overlapArea: Number(overlapArea.toFixed(3)),
      }));
    }
  }
  return overlaps.sort((left, right) => (
    left.a < right.a ? -1 : left.a > right.a ? 1 : left.b < right.b ? -1 : left.b > right.b ? 1 : 0));
}

/**
 * HF-346 depth pass, arena entry point. Shares
 * `computeMinimumSafeVerticalSeparation`'s depth-precision threshold with the
 * decal sweep so both instruments speak about the same depth buffer.
 */
export function arenaCoplanarSurfaceAudit(
  root: THREE.Object3D,
  near: number,
  far: number,
  maxViewDistance: number,
  options: CoplanarSurfaceAuditOptions = {},
): Readonly<{ threshold: number; overlaps: readonly CoplanarSurfaceOverlap[]; patches: number; pass: boolean }> {
  const threshold = computeMinimumSafeVerticalSeparation(near, far, maxViewDistance);
  const patches = collectCoplanarSurfacePatches(root, options);
  const overlaps = findCoplanarSurfaceOverlaps(patches, threshold, options);
  const result = Object.freeze({
    threshold,
    overlaps: Object.freeze(overlaps),
    patches: patches.length,
    pass: overlaps.length === 0,
  });
  root.userData.coplanarSurfaceDepthAudit = result;
  return result;
}

/** One-line description of an overlap, for actionable test failure output. */
export function describeCoplanarOverlap(overlap: CoplanarSurfaceOverlap): string {
  const [nx, ny, nz] = overlap.normal;
  return `${overlap.a} <> ${overlap.b}`
    + ` facing(${nx.toFixed(2)}, ${ny.toFixed(2)}, ${nz.toFixed(2)})`
    + ` separation=${overlap.separation.toFixed(5)}m`
    + ` overlap=${overlap.overlapArea}m2`
    + ` plane=${overlap.planeDistanceA.toFixed(3)}/${overlap.planeDistanceB.toFixed(3)}`;
}
