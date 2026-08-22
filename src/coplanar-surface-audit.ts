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
    const q = new THREE.Quaternion();
    node.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    // Only world-upward top faces; skip ramps/tilted beams.
    if (Math.abs(e.x) > 1e-6 || Math.abs(e.z) > 1e-6) return;
    const params = geometry.parameters;
    if (params.height > maxHeight) return;
    const p = new THREE.Vector3();
    node.getWorldPosition(p);
    const yaw = Math.abs(e.y) > 1e-6 ? e.y : 0;
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const sx = params.width * cos + params.depth * sin;
    const sz = params.width * sin + params.depth * cos;
    const material = Array.isArray(node.material) ? node.material[0] ?? null : node.material;
    // HF-346: inspect polygonOffset configuration on the material.
    const polygonOffset = Boolean(material?.polygonOffset);
    const polygonOffsetFactor = material?.polygonOffset ? (material.polygonOffsetFactor ?? 0) : 0;
    const polygonOffsetUnits = material?.polygonOffset ? (material.polygonOffsetUnits ?? 0) : 0;
    specs.push({
      name: node.name,
      topY: p.y + params.height / 2,
      minX: p.x - sx / 2,
      maxX: p.x + sx / 2,
      minZ: p.z - sz / 2,
      maxZ: p.z + sz / 2,
      height: params.height,
      material: material ?? null,
      polygonOffset,
      polygonOffsetFactor,
      polygonOffsetUnits,
    });
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
