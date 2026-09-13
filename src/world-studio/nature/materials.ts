/**
 * materials.ts — one material factory for the nature lane.
 *
 * Every surface here is a MeshStandardNodeMaterial from `three/webgpu` with a
 * small TSL graph (wind on the vertex stage, wetness/snow on the fragment
 * stage) driven by FOUR shared uniforms owned by the lane. The WebGL2
 * compatibility route (documentElement.dataset.renderBackend === 'webgl2',
 * the same gate the grass field uses) gets plain MeshStandardMaterial with
 * the same maps and no wind — honest fallback, no ShaderMaterial anywhere.
 *
 * Root owns lighting and the environment map; nothing here creates lights.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  attribute,
  float,
  fract,
  instanceIndex,
  mix,
  normalLocal,
  normalWorld,
  positionLocal,
  sin,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec3,
} = TSL as unknown as Record<string, any>;

/** A TSL uniform node: `.value` is the CPU handle, the rest is the node graph API. */
export type UniformNode = { value: number } & Record<string, any>;

export type NatureUniforms = Readonly<{
  time: UniformNode;
  /** 0 calm .. ~1.5 gale; scales every wind displacement. */
  wind: UniformNode;
  /** 0 dry .. 1 soaked; darkens albedo and drops roughness. */
  wetness: UniformNode;
  /** 0 none .. 1 full cover on upward-facing surfaces. */
  snow: UniformNode;
}>;

export function createNatureUniforms(): NatureUniforms {
  return Object.freeze({
    time: uniform(0) as UniformNode,
    wind: uniform(0.35) as UniformNode,
    wetness: uniform(0) as UniformNode,
    snow: uniform(0) as UniformNode,
  });
}

export function webgl2CompatRoute(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset.renderBackend === 'webgl2';
}

export type SurfaceMaterialOptions = Readonly<{
  name: string;
  map?: THREE.Texture | null;
  color?: number;
  roughness?: number;
  metalness?: number;
  /** Alpha-cut foliage cards. */
  alphaTest?: number;
  side?: THREE.Side;
  /** Multiply by the geometry 'color' attribute. */
  vertexColors?: boolean;
  /**
   * Wind: displaces vertices by `windWeight` attribute (0 pinned .. 1 free)
   * in the vertex stage. Requires that attribute on every geometry using it.
   */
  wind?: Readonly<{ amplitudeM: number; frequency: number }> | null;
  /** Snow settles on up-facing surfaces; 0 disables (e.g. water). */
  snowResponse?: number;
  /** Wetness darkening strength 0..1. */
  wetResponse?: number;
  /** Optional emissive floor so dark foliage never goes black under fog. */
  emissive?: number;
  emissiveIntensity?: number;
  /**
   * Foliage cards: shade with the geometry's authored normal on BOTH faces.
   * Three's `normalView` negates the normal on back faces of a DoubleSide
   * material (src/nodes/accessors/Normal.js, negateOnBackSide), which turns a
   * cloud of crossed cards into a light/dark checkerboard. Card authors set
   * a canopy-radial normal instead and this flag stops the flip.
   */
  foliageNormals?: boolean;
}>;

function instanceHash(salt: number) {
  const idx = float(instanceIndex);
  return fract(sin(idx.mul(12.9898).add(salt * 7.13)).mul(43758.5453));
}

/**
 * Build one lit surface. The node graph reads the shared uniforms so a
 * single `update()` moves every material in the lane without touching them.
 */
export function createSurfaceMaterial(opts: SurfaceMaterialOptions, u: NatureUniforms): THREE.Material {
  const roughness = opts.roughness ?? 0.85;
  const metalness = opts.metalness ?? 0;
  const base: THREE.MeshStandardMaterialParameters = {
    color: opts.color ?? 0xffffff,
    roughness,
    metalness,
    side: opts.side ?? THREE.FrontSide,
    vertexColors: opts.vertexColors ?? false,
    map: opts.map ?? null,
    alphaTest: opts.alphaTest ?? 0,
    transparent: false,
  };
  if (opts.emissive !== undefined) {
    base.emissive = new THREE.Color(opts.emissive);
    base.emissiveIntensity = opts.emissiveIntensity ?? 0.1;
  }
  if (webgl2CompatRoute()) {
    const plain = new THREE.MeshStandardMaterial(base);
    plain.name = opts.name;
    return plain;
  }

  const mat = new MeshStandardNodeMaterial(base);
  mat.name = opts.name;
  mat.type = 'MeshStandardMaterial';

  // ---- vertex: wind ------------------------------------------------------
  if (opts.wind) {
    const weight = attribute('windWeight', 'float');
    const phase = instanceHash(3).mul(Math.PI * 2);
    const gust = sin(u.time.mul(opts.wind.frequency).add(phase));
    const flutter = sin(u.time.mul(opts.wind.frequency * 3.1).add(phase.mul(1.7))).mul(0.35);
    const amount = gust.add(flutter).mul(u.wind).mul(weight).mul(opts.wind.amplitudeM);
    // Lean with the prevailing wind (+X, -Z) plus a little cross flutter.
    const sway = vec3(amount.mul(0.8), amount.mul(-0.18), amount.mul(-0.55));
    mat.positionNode = positionLocal.add(sway);
  }

  if (opts.foliageNormals) {
    mat.normalNode = transformNormalToView(normalLocal);
  }

  // ---- fragment: albedo, wetness, snow -------------------------------------
  let albedo = opts.map ? texture(opts.map, uv()) : null;
  let col = albedo ? albedo.rgb : vec3(1, 1, 1);
  if (opts.color !== undefined) {
    const c = new THREE.Color(opts.color);
    col = col.mul(vec3(c.r, c.g, c.b));
  }
  const wetResponse = opts.wetResponse ?? 0.35;
  if (wetResponse > 0) {
    const wet = u.wetness.clamp(0, 1);
    col = col.mul(float(1).sub(wet.mul(wetResponse)));
  }
  const snowResponse = opts.snowResponse ?? 1;
  if (snowResponse > 0) {
    const up = normalWorld.y.abs();
    const cover = u.snow.clamp(0, 1).mul(smoothstep(0.25, 0.85, up)).mul(snowResponse);
    col = mix(col, vec3(0.88, 0.9, 0.95), cover);
  }
  mat.colorNode = col;
  if (albedo && (opts.alphaTest ?? 0) > 0) {
    mat.opacityNode = albedo.a;
    mat.alphaTestNode = float(opts.alphaTest);
  }
  const wetRough = float(roughness).sub(u.wetness.clamp(0, 1).mul(roughness * 0.55));
  const snowRough = mix(wetRough, float(0.92), u.snow.clamp(0, 1).mul(normalWorld.y.abs()).mul(snowResponse));
  mat.roughnessNode = snowRough;
  return mat;
}
