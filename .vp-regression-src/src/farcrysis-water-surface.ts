/**
 * farcrysis-water-surface.ts — HF-394 reflective + refractive sea surface.
 *
 * OWNER ROW. "Farcrysis: water needs to look better"; the audit recorded that
 * the arena's sea had NO reflection and NO refraction — flat MeshStandardMaterial
 * tint planes with scrolled ripple normal maps only.
 *
 * WHAT THIS ADDS (WebGPU/TSL route only):
 *   1. REFLECTION — analytic sky reflection, no render targets: the reflected
 *      view vector R = reflect(I, N) picks a warm-zenith/deep-teal gradient by
 *      R.y (the proven in-repo recipe from the golden-hour water polish pass),
 *      weighted by a Schlick Fresnel curve over the ripple-perturbed world
 *      normal. Grazing angles read as sky; looking down reads as water.
 *   2. REFRACTION GRADING — per-vertex baked water-column depth
 *      (`swellDepthFactor`, the SAME pure CPU function the additive swell layer
 *      uses) drives both the shallow→deep body-colour mix (absorption) and a
 *      shallow→deep opacity ramp, so sand shows clearly through ankle-deep
 *      water and the sea goes opaque teal offshore.
 *
 * HONEST SCOPE NOTE: this is NOT screen-space refraction — there is no render
 * target and no scene-colour UV distortion. Bottom distortion still comes from
 * the scrolling ripple normal maps; what is new is depth-graded transmission
 * plus real Fresnel sky reflection.
 *
 * AUTHORITY SAFETY:
 *   - Presentation only. No OCEAN_BANDS change, no ocean-spectrum change, no
 *     buoyancy/swim sampling change: `swellDepthFactor` is display-side maths
 *     that already shipped with the HF-394 swell layer and touches no networked
 *     state.
 *   - Bloom-threshold contract (HF-362): every authored term is bounded —
 *     palette colours are <= 1 by construction and both mixes are convex
 *     combinations scaled by SEA_REFLECTION_STRENGTH <= 1, so colorNode <= 1
 *     linear, below the lowest grade threshold 1.08.
 *
 * BACKEND GATE (HF-374 discipline): the TSL material is built ONLY when the
 * runtime has declared the WebGPU backend
 * (`document.documentElement.dataset.renderBackend === 'webgpu'` — the same
 * signal vegetation's `_applyTslFoliage` and the grass field gate on). The
 * WebGL2 compat route and every non-browser/test environment keep today's
 * plain MeshStandardMaterial byte-for-byte via `compatOpacity`.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  clamp,
  color,
  float,
  mix,
  positionWorld,
  pow,
  reflect,
  saturate,
  transformedNormalWorld,
} from 'three/tsl';

import { swellDepthFactor } from './farcrysis-water-fx';

/** Per-vertex baked water-column depth factor (0 = ashore, 1 = deep). */
export const FARCRYSIS_WATER_DEPTH_ATTRIBUTE = 'aWaterDepth';

/**
 * Sky-reflection palette, from the in-repo golden-hour water polish recipe:
 * deep teal straight down, warm zenith at grazing incidence. Both <= 1.
 */
const SKY_TEAL = 0x0b4a5a;
const SKY_WARM_ZENITH = 0xffb469;

/** Water Schlick F0 (dielectric). */
const FRESNEL_F0 = 0.02;
/**
 * Ceiling on how much of the surface colour the sky term may take over.
 * Pinned by test to stay <= 1 so the bloom contract above cannot regress.
 */
export const SEA_REFLECTION_STRENGTH = 0.85;

export type FarcrysisSeaSurfaceParams = Readonly<{
  /** Deep-water body colour seen looking straight down (absorption end). */
  baseColor: number;
  /** Water colour over ankle-deep sand (refraction absorption start). */
  shallowColor: number;
  roughness: number;
  metalness: number;
  /** Opacity where the water column is at/below the calm-shore depth. */
  opacityShallow: number;
  /** Opacity once the column reaches full depth. */
  opacityDeep: number;
  /**
   * Opacity on the WebGL2 compat route and in tests — set this to the value
   * the surface shipped with so the compat look is byte-identical.
   */
  compatOpacity: number;
  normalMap?: THREE.Texture | null;
  normalScale?: number;
}>;

function webgpuTslRoute(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement?.dataset.renderBackend === 'webgpu'
  );
}

/**
 * Build one sea-surface material. On the WebGPU route this is a typed TSL
 * MeshStandardNodeMaterial (ONE distinct program per call — two calls total in
 * the arena, well inside the HF-374 pipeline budget); everywhere else it is
 * today's plain MeshStandardMaterial unchanged.
 */
export function createFarcrysisSeaSurfaceMaterial(
  params: FarcrysisSeaSurfaceParams,
): THREE.Material {
  const normalScale = params.normalScale ?? 0.45;
  const normalOptions = params.normalMap
    ? {
        normalMap: params.normalMap,
        normalScale: new THREE.Vector2(normalScale, normalScale),
      }
    : {};

  if (!webgpuTslRoute()) {
    return new THREE.MeshStandardMaterial({
      color: params.baseColor,
      roughness: params.roughness,
      metalness: params.metalness,
      transparent: true,
      opacity: params.compatOpacity,
      ...normalOptions,
    });
  }

  const mat = new MeshStandardNodeMaterial({
    color: params.baseColor,
    roughness: params.roughness,
    metalness: params.metalness,
    transparent: true,
    opacity: 1,
    ...normalOptions,
  });
  // pass74-arena-boot-smoke idiom (same as makeTslGrassMaterial): keep
  // WebGLRenderer able to resolve ShaderLib if this material ever reaches the
  // compat renderer despite the gate. WebGPURenderer still evaluates the node
  // graph via isNodeMaterial.
  mat.type = 'MeshStandardMaterial';

  // Baked per-vertex water-column depth (interpolated across each quad).
  const depth = attribute<'float'>(FARCRYSIS_WATER_DEPTH_ATTRIBUTE, 'float');

  // Ripple-perturbed world normal drives both the Fresnel curve and the
  // reflection ray, so sky picks up the same shimmer as the specular sun.
  const surfaceNormal = transformedNormalWorld.normalize();
  const incident = positionWorld.sub(cameraPosition).normalize();
  const cosTheta = saturate(incident.negate().dot(surfaceNormal));
  const fresnel = float(FRESNEL_F0).add(
    float(1 - FRESNEL_F0).mul(pow(cosTheta.oneMinus(), 5)),
  );

  // Analytic sky by reflected-ray elevation (no render targets): deep teal
  // looking up through the ray, warm zenith at grazing incidence.
  const reflected = reflect(incident, surfaceNormal);
  const skyGradient = mix(
    color(SKY_TEAL),
    color(SKY_WARM_ZENITH),
    clamp(reflected.y.mul(0.55).add(0.5), 0, 1),
  );

  // Depth-graded absorption (refraction body colour) + sky reflection.
  const waterBody = mix(color(params.shallowColor), color(params.baseColor), depth);
  mat.colorNode = mix(waterBody, skyGradient, fresnel.mul(SEA_REFLECTION_STRENGTH));

  // Depth-graded transmission: sand shows through shallows, sea goes opaque.
  mat.opacityNode = mix(float(params.opacityShallow), float(params.opacityDeep), depth);

  return mat;
}

/**
 * Bake per-vertex water-column depth factors into `geometry` using the live
 * CPU authority (`swellDepthFactor`). Call AFTER any geometry-level rotateX
 * bake; pass preRotated=false for geometries whose plane rotation lives on
 * the MESH (rotation.x = -PI/2), where world z maps to -local y.
 */
export function bakeFarcrysisWaterDepth(
  geometry: THREE.BufferGeometry,
  preRotated: boolean,
): void {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const depths = new Float32Array(posAttr.count);
  for (let i = 0; i < posAttr.count; i += 1) {
    const wx = posAttr.getX(i);
    const wz = preRotated ? posAttr.getZ(i) : -posAttr.getY(i);
    depths[i] = swellDepthFactor(wx, wz);
  }
  geometry.setAttribute(FARCRYSIS_WATER_DEPTH_ATTRIBUTE, new THREE.BufferAttribute(depths, 1));
}
