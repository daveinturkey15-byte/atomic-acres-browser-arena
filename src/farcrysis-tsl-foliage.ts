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
 * HF-374 — WHY THE GRAPHS ARE SHARED AND BUCKETED.
 *
 * The WebGPU backend compiles one shader program and one render pipeline per
 * DISTINCT NODE GRAPH, and three identifies a graph by node-object identity:
 * `NodeMaterial.customProgramCacheKey()` hashes each `*Node` property through
 * `Node.getCacheKey()`, whose `customCacheKey()` is the node's instance id. Two
 * structurally identical graphs built from two separate calls therefore never
 * share a pipeline — only graphs built from the SAME node objects do.
 *
 * This module used to bake every per-layer number (base colour, dapple
 * strength, sway amplitude/height/speed) into the graph as a literal node, and
 * `swayHeight` came from each mesh's own bounding box, so effectively every
 * foliage layer produced a unique graph: 86 unique programs for one arena. The
 * arena-admission coverage draw (`withArenaFrustumCullingDisabled` + forced
 * full-scene submission + a 12 s queue fence) then had to realise all of them
 * in a single GPU submission, which never completed — farcrysis could not boot
 * on the WebGPU route while WebGL2 was fine, because `_applyTslFoliage` is
 * skipped entirely on WebGL2. That is HF-374.
 *
 * So the graphs are now:
 *   - built once per QUANTISED bucket and shared by every material in it. The
 *     buckets are the three families the dapple table already authors by hand
 *     (ground scatter / undergrowth / canopy) and three sway sizes (blade /
 *     shrub / frond). The eye cannot read a 5 % difference in frond amplitude;
 *     the GPU pays a whole pipeline for it.
 *   - colour-free: the base colour comes from `materialColor`, a module-level
 *     TSL singleton that reads each material's OWN `color` uniform, so every
 *     layer keeps its authored hue (and its per-instance colour variation)
 *     without splitting the graph.
 *
 * Presentation only — never adds colliders, never changes sightlines.
 */

import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  float,
  fract,
  instanceIndex,
  materialColor,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';

/**
 * Hard ceiling on distinct foliage node graphs. Every graph past this point is
 * another WGSL program and another pipeline the arena-admission coverage draw
 * has to realise inside one GPU submission — the HF-374 failure mode. Kept as
 * an exported constant so the regression tests assert the same number the
 * bucket ladders below actually produce.
 */
export const TSL_FOLIAGE_MAX_DISTINCT_GRAPHS = 16;

/** Dapple families, matching the hand-authored groups in the dapple table. */
const DAPPLE_BUCKETS = [0.28, 0.5, 0.78] as const;
/** Sway sizes: grass blade, shrub/fern, palm frond. Metres. */
const SWAY_HEIGHT_BUCKETS = [0.8, 2.5, 8] as const;
/** Sway speed multipliers. Production only uses 1; the API still allows more. */
const SWAY_SPEED_BUCKETS = [1] as const;

function bucket(value: number, ladder: readonly number[]): number {
  let best = ladder[0]!;
  let bestDistance = Math.abs(value - best);
  for (let i = 1; i < ladder.length; i++) {
    const distance = Math.abs(value - ladder[i]!);
    if (distance < bestDistance) { best = ladder[i]!; bestDistance = distance; }
  }
  return best;
}

/** Shared per-bucket wind uniform, reference counted by live materials. */
interface WindUniforms {
  time: { value: number };
  /** Number of undisposed materials still driven by this uniform. */
  users: number;
}

const _windUniforms: WindUniforms[] = [];

/**
 * HF-363: number of live registered wind uniforms (test/diagnostic hook).
 *
 * HF-374: this is now one entry per live sway BUCKET, not per material, so it
 * is bounded by the ladders above however many foliage layers an arena builds.
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
  _graphCache.clear();
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

/** One shared, reusable node graph for a quantised foliage bucket. */
interface FoliageGraph {
  colorNode: Node<'vec3'> | null;
  positionNode: Node<'vec3'> | null;
  wind: WindUniforms | null;
}

const _graphCache = new Map<string, FoliageGraph>();

/**
 * Amplitude is derived from the BUCKETED height, not the caller's exact height,
 * so "big fronds move more than blades" survives quantisation while the graph
 * stays shared. Mirrors the caller's own `min(0.09, 0.02 + height * 0.02)`.
 */
function swayAmountForHeight(height: number): number {
  return Math.min(0.09, 0.02 + height * 0.02);
}

function foliageGraph(dapple: number, swayHeight: number, swaySpeed: number, sway: boolean): FoliageGraph {
  const key = `${dapple}|${sway ? swayHeight : 'none'}|${sway ? swaySpeed : 'none'}`;
  const cached = _graphCache.get(key);
  if (cached) return cached;

  // ---- CANOPY TRANSMITTANCE (HF-359) -------------------------------------
  // Three decorrelated travelling sine octaves over world XZ produce a soft
  // dapple field that reads as sun through moving canopy. Strength scales
  // with the dapple bucket; height above ground modulates it slightly so
  // trunks stay grounded-looking while high foliage shimmers more.
  let colorNode: Node<'vec3'> | null = null;
  if (dapple > 0) {
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
    const strength = float(dapple).mul(hBias.mul(0.35).add(0.65));

    // HF-374: the base colour is read from the material's own `color` uniform
    // through the shared `materialColor` singleton instead of being baked in
    // as a per-layer constant node. Every layer keeps its authored hue and its
    // per-instance colour variation, and the graph stays identical.
    const baseV = vec3(materialColor as unknown as Node<'vec3'>);
    // Sunlit vs filtered-shadow tint (golden-hour warm light / cool green shade).
    const lit = baseV.mul(vec3(1.18, 1.1, 0.92));
    const shade = baseV.mul(vec3(0.52, 0.66, 0.58));
    colorNode = mix(shade, lit, field.mul(strength)) as unknown as Node<'vec3'>;
  }

  // ---- PER-INSTANCE PHASE-OFFSET WIND (HF-359) ---------------------------
  let positionNode: Node<'vec3'> | null = null;
  let wind: WindUniforms | null = null;
  if (sway) {
    const t = uniform(0);
    wind = { time: t, users: 0 };
    _windUniforms.push(wind);

    const amount = float(swayAmountForHeight(swayHeight));
    const h = positionLocal.y.div(swayHeight).clamp(0, 1);
    const phase = instanceHash(1).mul(Math.PI * 2);
    const phase2 = instanceHash(2).mul(Math.PI * 2);

    // Two decorrelated waves → organic non-repeating motion per instance.
    const w1 = sin(t.mul(swaySpeed * 1.6).add(phase).add(positionLocal.x.mul(0.8)));
    const w2 = sin(t.mul(swaySpeed * 1.05).add(phase2).add(positionLocal.z.mul(1.1))).mul(0.6);
    const gust = float(1).add(sin(t.mul(0.37).add(phase)).mul(0.35)); // slow global gust

    const swayX = w1.add(w2).mul(amount).mul(h).mul(gust);
    const swayZ = w2.add(w1.mul(0.5)).mul(amount).mul(h).mul(gust);
    positionNode = positionLocal.add(vec3(swayX, float(0), swayZ)) as unknown as Node<'vec3'>;
  }

  const graph: FoliageGraph = { colorNode, positionNode, wind };
  _graphCache.set(key, graph);
  return graph;
}

/**
 * Build a wind-swaying, canopy-dappled MeshStandardNodeMaterial.
 *
 * Wind is applied in the POSITION node (vertex stage), dapple in the COLOR
 * node (fragment stage) — both fully GPU-side, zero CPU per-frame cost beyond
 * advancing one uniform per bucket.
 */
export function makeTslFoliageMaterial(opts: FoliageOptions): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({
    color: opts.color,
    roughness: opts.roughness ?? 0.88,
    metalness: opts.metalness ?? 0.03,
    side: opts.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  // pass74-arena-boot-smoke: WebGLRenderer queries shaderIDs[material.type] during
  // WebGLProgram construction. MeshStandardNodeMaterial's default type is unmapped,
  // causing parameters.vertexShader to be undefined and resolveIncludes(undefined) to throw.
  // Setting type to MeshStandardMaterial ensures WebGL2 compiles ShaderLib.physical while
  // WebGPURenderer continues evaluating TSL positionNode/colorNode via isNodeMaterial.
  mat.type = 'MeshStandardMaterial';

  const sway = (opts.swayAmount ?? 0) > 0;
  const graph = foliageGraph(
    (opts.dapple ?? 0) > 0 ? bucket(opts.dapple ?? 0, DAPPLE_BUCKETS) : 0,
    bucket(opts.swayHeight ?? 3.0, SWAY_HEIGHT_BUCKETS),
    bucket(opts.swaySpeed ?? 1.0, SWAY_SPEED_BUCKETS),
    sway,
  );

  if (graph.colorNode) mat.colorNode = graph.colorNode;
  if (graph.positionNode) mat.positionNode = graph.positionNode;

  const wind = graph.wind;
  if (wind) {
    // HF-363: release the shared uniform when the LAST material driven by it is
    // disposed, so a retired arena stops receiving per-frame wind writes
    // (legacy-main's disposeRetiredArena / disposeArenaPresentationRoot dispose
    // every foliage material). Reference counted because the uniform is now
    // shared by every layer in the same bucket.
    wind.users += 1;
    let released = false;
    mat.addEventListener('dispose', () => {
      if (released) return;
      released = true;
      wind.users -= 1;
      if (wind.users > 0) return;
      const index = _windUniforms.indexOf(wind);
      if (index !== -1) _windUniforms.splice(index, 1);
      for (const [key, entry] of _graphCache) if (entry.wind === wind) _graphCache.delete(key);
    });
  }

  return mat;
}
