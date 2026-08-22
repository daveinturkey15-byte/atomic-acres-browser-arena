/**
 * farcrysis-tsl-foliage.ts — HF-359/HF-363 typed TSL foliage shading helpers.
 *
 * Replaces the previous onBeforeCompile GLSL injection (forbidden by the repo
 * contract: no ShaderMaterial / RawShaderMaterial / onBeforeCompile) with
 * three/webgpu MeshStandardNodeMaterial node graphs:
 *
 *   1. WIND (HF-359): per-instance phase-offset sway driven entirely in
 *      positionLocal/positionWorld nodes. Each instance gets a stable hash of
 *      its instanceIndex as a phase offset so fronds never pulse in unison.
 *      One shared uTime uniform per material family; animateVegetationWind()
 *      advances it — the per-frame driver stays bound to the terrain mesh.
 *
 *   2. CANOPY TRANSMITTANCE (HF-359, highest value): analytic dappled-light
 *      term in colorNode. Instead of pushing thousands of leaf cards into the
 *      sun's shadow map, foliage receives an animated multi-octave sine field
 *      over world position that approximates sunlight filtering through a
 *      moving canopy. Cheaper than shadow-mapped foliage and it is the
 *      signature jungle look. Ground-level scatter layers get a stronger,
 *      slower dapple; canopy leaves get a subtle one.
 *
 * Presentation only — never adds colliders, never changes sightlines.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  color,
  float,
  fract,
  instanceIndex,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

/** Shared per-material wind uniforms registered for frame updates. */
interface WindUniforms {
  time: { value: number };
}

const _windUniforms: WindUniforms[] = [];

/**
 * HF-363: number of live registered wind uniforms (test/diagnostic hook).
 */
export function tslWindUniformCount(): number {
  return _windUniforms.length;
}

/**
 * HF-363: drop every registered wind uniform.
 *
 * Safety net for arena teardown paths that dispose foliage materials without
 * per-material cleanup; tslAdvanceWind must never keep writing uniforms that
 * belong to a disposed arena.
 */
export function tslResetWindUniforms(): void {
  _windUniforms.length = 0;
}

/** Advance every TSL wind uniform. Call once per frame (terrain-mesh driver). */
export function tslAdvanceWind(time: number): void {
  for (let i = 0; i < _windUniforms.length; i++) _windUniforms[i].time.value = time;
}

/** Stable pseudo-random per-instance scalar in [0,1) from the instance index. */
function instanceHash(scale: number) {
  // fract(sin(idx*12.9898 + phase)*43758.5453) — classic stable hash.
  const idx = float(instanceIndex);
  return fract(sin(idx.mul(12.9898).add(scale * 7.13)).mul(43758.5453));
}

export interface FoliageOptions {
  /** Base albedo. */
  color: number;
  roughness?: number;
  metalness?: number;
  /**
   * Dappled-transmittance strength: 0 = none, 1 = strong ground dapple.
   * Canopy leaves ~0.25, undergrowth ~0.55, ground litter ~0.8.
   */
  dapple?: number;
  /** Height above local origin where sway reaches full amplitude (metres). */
  swayHeight?: number;
  /** Max lateral sway amplitude (metres). */
  swayAmount?: number;
  /** Per-material sway speed multiplier. */
  swaySpeed?: number;
  /** Double-sided card geometry (leaf cards, grass blades). */
  doubleSided?: boolean;
}

/**
 * Build a wind-swaying, canopy-dappled MeshStandardNodeMaterial.
 *
 * Wind is applied in the POSITION node (vertex stage), dapple in the COLOR
 * node (fragment stage) — both fully GPU-side, zero CPU per-frame cost beyond
 * advancing one uniform per material family.
 */
export function makeTslFoliageMaterial(opts: FoliageOptions): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    color: opts.color,
    roughness: opts.roughness ?? 0.88,
    metalness: opts.metalness ?? 0.03,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });

  const baseColor = color(opts.color);

  // ---- CANOPY TRANSMITTANCE (HF-359) -------------------------------------
  // Three decorrelated travelling sine octaves over world XZ produce a soft
  // dapple field that reads as sun through moving canopy. Strength scales
  // with opts.dapple; height above ground modulates it slightly so trunks
  // stay grounded-looking while high foliage shimmers more.
  const dappleStrength = opts.dapple ?? 0;
  if (dappleStrength > 0) {
    const wx = positionWorld.x;
    const wz = positionWorld.z;
    const wy = positionWorld.y;

    const o1 = sin(wx.mul(0.9).add(wz.mul(0.6)));
    const o2 = sin(wx.mul(-0.42).add(wz.mul(1.15)).mul(1.7));
    const o3 = sin(wx.mul(2.1).sub(wz.mul(1.7)).mul(0.61));
    // Normalised field roughly in [-1,1] → [0,1].
    const field = o1.add(o2.mul(0.7)).add(o3.mul(0.5)).div(2.2).mul(0.5).add(0.5);

    // Height bias: higher geometry catches slightly more broken light.
    const hBias = smoothstep(0.5, 6.0, wy.sub(1.0));
    const strength = float(dappleStrength).mul(hBias.mul(0.35).add(0.65));

    // Sunlit vs filtered-shadow tint (golden-hour warm light / cool green shade).
    const baseV = vec3(baseColor as unknown as Node<'vec3'>);
    const lit = baseV.mul(vec3(1.18, 1.1, 0.92));
    const shade = baseV.mul(vec3(0.52, 0.66, 0.58));
    mat.colorNode = mix(shade, lit, field.mul(strength));
  }

  // ---- PER-INSTANCE PHASE-OFFSET WIND (HF-359) ---------------------------
  if ((opts.swayAmount ?? 0) > 0) {
    const t = uniform(0);
    // HF-363: register the uniform against this material and remove it
    // automatically when the material is disposed, so disposed arenas stop
    // receiving per-frame wind writes (legacy-main's disposeRetiredArena /
    // disposeArenaPresentationRoot dispose every foliage material).
    const entry: WindUniforms = { time: t };
    _windUniforms.push(entry);
    mat.addEventListener('dispose', () => {
      const idx = _windUniforms.indexOf(entry);
      if (idx !== -1) _windUniforms.splice(idx, 1);
    });

    const amount = float(opts.swayAmount ?? 0.06);
    const speed = opts.swaySpeed ?? 1.0;
    const h = positionLocal.y.div(opts.swayHeight ?? 3.0).clamp(0, 1);
    const phase = instanceHash(1).mul(Math.PI * 2);
    const phase2 = instanceHash(2).mul(Math.PI * 2);

    // Two decorrelated waves → organic non-repeating motion per instance.
    const w1 = sin(t.mul(speed * 1.6).add(phase).add(positionLocal.x.mul(0.8)));
    const w2 = sin(t.mul(speed * 1.05).add(phase2).add(positionLocal.z.mul(1.1))).mul(0.6);
    const gust = float(1).add(sin(t.mul(0.37).add(phase)).mul(0.35)); // slow global gust

    const swayX = w1.add(w2).mul(amount).mul(h).mul(gust);
    const swayZ = w2.add(w1.mul(0.5)).mul(amount).mul(h).mul(gust);
    mat.positionNode = positionLocal.add(vec3(swayX, float(0), swayZ));
  }

  return mat;
}
