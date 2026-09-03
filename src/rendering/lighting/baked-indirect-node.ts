/**
 * HF-418 / Lane AL — the GPU half of baked indirect light.
 *
 * `baked-indirect.ts` owns the bake, the format and the CPU reference sampler.
 * This file turns a baked volume into three 3D textures and one additive TSL
 * term on the existing linear-HDR chain. When the CPU reference and this graph
 * disagree, the CPU reference is right and this is the bug — the same contract
 * `raytraced-light-node.ts` holds against `whitted-tracer.ts`, and for the same
 * reason: a TSL node-build failure is SWALLOWED by three (it logs
 * `THREE.TSL: <error>` and substitutes a bare NodeMaterial), so the only way
 * this stays debuggable is to have something outside the GPU that is known to
 * be right.
 *
 * WHY THREE TEXTURES AND NOT ONE. SH-L1 is four coefficients per channel. An
 * RGBA 3D texture holds exactly four floats per texel, so one texture per
 * COLOUR CHANNEL puts that channel's four bands in .rgba and gets hardware
 * trilinear filtering between probes for free. Three fetches per pixel, total.
 * Packing the twelve floats across three textures the other way round — one
 * texture per BAND — would need the same three fetches and lose the property
 * that a single fetch reconstructs one channel completely.
 *
 * THE COMPOSITE, AND THE ONE APPROXIMATION IN IT.
 * The term added is `albedoProxy * irradiance * gain`, where `albedoProxy` is
 * the shaded scene colour divided by its own luminance. That is the surface's
 * HUE at unit brightness, which is what an albedo would be if this chain had an
 * albedo attachment to read. It does not — adding one is an MRT topology change
 * with a real per-frame cost — and using the shaded colour directly instead is
 * the wrong answer for the exact case this feature exists for: the shadowed
 * side of a room is dark, so `sceneColour * irradiance` would add almost
 * nothing precisely where the fill is needed. Dividing the brightness out first
 * keeps the surface's colour and lets the bake decide the brightness.
 *
 * The consequence to state honestly: a surface whose shaded colour is already
 * saturated receives a saturated fill, even if its true albedo is not that
 * saturated (a white wall lit by a red lamp reads as a red wall to this
 * approximation and gets red fill). At the gains this tier is allowed that is
 * a plausible result rather than a wrong one, and it is bounded either way by
 * the additive ceiling below.
 *
 * COMBAT SAFETY. Additive and hard-clamped, like every other lighting effect
 * here. It can brighten a pixel; it can never darken one. Nothing visible today
 * can be hidden by turning this on. The bake contains no dynamic actor, so it
 * gives no positional intel that PERFORMANCE cannot also give.
 */

import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import {
  Fn,
  clamp,
  float,
  luminance,
  max,
  min,
  nodeObject,
  normalize,
  screenUV,
  step,
  texture3D,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';

import {
  BAKED_INDIRECT_MAXIMUM_ADDITIVE,
  BAKED_INDIRECT_MAXIMUM_GAIN,
  SH_A0,
  SH_A1,
  SH_L1_COEFFICIENTS,
  SH_Y00,
  SH_Y1,
  type BakedIndirectTuning,
  type IrradianceProbeVolume,
} from './baked-indirect';

/**
 * Past this view depth a pixel is sky dome or an additive atmosphere card, not
 * a surface. Those materials carry no meaningful normal, so a probe fetch for
 * them would reconstruct an irradiance for a direction that means nothing and
 * add it to the horizon. Same limit and same reason as the ray-traced layer's
 * geometry gate.
 */
export const BAKED_INDIRECT_GEOMETRY_DEPTH_LIMIT_M = 220;

/** Largest value the albedo proxy may reach on any one channel. */
export const ALBEDO_PROXY_CEILING = 1.6;
/** Luminance floor, so a near-black pixel cannot divide the proxy to infinity. */
export const ALBEDO_PROXY_LUMINANCE_FLOOR = 0.04;

export type BakedIndirectSources = Readonly<{
  sceneColor: Node<'vec4'>;
  sceneNormal: Node<'vec4'>;
  sceneViewZ: Node<'float'>;
  camera: THREE.Camera;
}>;

export type BakedIndirectTextures = Readonly<{
  red: THREE.Data3DTexture;
  green: THREE.Data3DTexture;
  blue: THREE.Data3DTexture;
  dispose(): void;
}>;

/**
 * One RGBA float 3D texture per colour channel, each texel carrying that
 * channel's four SH-L1 bands. Linear filtering on all three axes IS the
 * trilinear probe interpolation — the CPU reference does the same blend by
 * hand, which is what makes the two comparable.
 */
export function allocateBakedIndirectTextures(
  dimensions: readonly [number, number, number],
  label = 'arena',
): BakedIndirectTextures {
  const [nx, ny, nz] = dimensions;
  const probes = nx * ny * nz;
  const channels: THREE.Data3DTexture[] = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const data = new Float32Array(probes * 4);
    const texture = new THREE.Data3DTexture(data, nx, ny, nz);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.FloatType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.name = `baked-indirect-${label}-${'rgb'[channel]}`;
    channels.push(texture);
  }
  return Object.freeze({
    red: channels[0],
    green: channels[1],
    blue: channels[2],
    dispose(): void {
      for (const texture of channels) texture.dispose();
    },
  });
}

/**
 * Copies a baked volume into already-allocated textures. Separate from the
 * allocation because the runtime path re-uploads on every arena change into the
 * SAME texture objects: swapping a bound texture for one of different
 * dimensions rebuilds the node, which rebuilds the pipeline, inside the
 * arena-transition window. Re-uploading does neither.
 */
export function uploadBakedIndirectVolume(
  textures: BakedIndirectTextures,
  volume: IrradianceProbeVolume,
): void {
  const [nx, ny, nz] = volume.dimensions;
  const probes = nx * ny * nz;
  const targets = [textures.red, textures.green, textures.blue];
  for (let channel = 0; channel < 3; channel += 1) {
    const texture = targets[channel];
    const data = texture.image.data as Float32Array;
    if (data.length !== probes * 4) {
      throw new Error(
        `uploadBakedIndirectVolume: volume is ${nx}x${ny}x${nz} but the texture holds ${data.length / 4} probes.`,
      );
    }
    for (let probe = 0; probe < probes; probe += 1) {
      const source = probe * SH_L1_COEFFICIENTS * 3 + channel * SH_L1_COEFFICIENTS;
      data[probe * 4] = volume.coefficients[source];
      data[probe * 4 + 1] = volume.coefficients[source + 1];
      data[probe * 4 + 2] = volume.coefficients[source + 2];
      data[probe * 4 + 3] = volume.coefficients[source + 3];
    }
    texture.needsUpdate = true;
  }
}

/** Allocation plus one upload. The offline and test path. */
export function buildBakedIndirectTextures(volume: IrradianceProbeVolume): BakedIndirectTextures {
  const textures = allocateBakedIndirectTextures(volume.dimensions, volume.arenaId);
  uploadBakedIndirectVolume(textures, volume);
  return textures;
}

export type BakedIndirectGraph = Readonly<{
  /** Additive linear-HDR bounce light, already clamped. */
  light: Node<'vec3'>;
  /** Pushes a new tuning into the live uniforms. Topology unchanged. */
  applyTuning(next: BakedIndirectTuning): void;
  /**
   * Re-uploads the probe data and re-points the volume transform. The volume's
   * dimensions must match the ones the node was built with; that is the whole
   * reason the runtime grid is fixed.
   */
  setVolume(volume: IrradianceProbeVolume): void;
  /** Call once per presented frame, before submission. */
  beforeRender(): void;
  /** What was actually bound, for the runtime receipt and for tests. */
  receipt(): Readonly<{ dimensions: string; digest: string; occluderShapes: number; gain: number }>;
  dispose(): void;
}>;

/**
 * Publishes what the BOUND volume is, from the code that actually bound it,
 * where a headless browser can read it without a debug hook. The RTX skill's
 * runtime-receipt rule, applied to this layer: an arena whose bake found zero
 * occluder shapes produces a correct, sky-only, invisible volume, and that must
 * be distinguishable from a volume that failed to bind at all.
 */
export function publishBakedIndirectReceipt(
  target: { dataset: Record<string, string | undefined> },
  graph: BakedIndirectGraph | null,
): void {
  if (!graph) {
    target.dataset.bakedIndirect = 'off';
    return;
  }
  const receipt = graph.receipt();
  target.dataset.bakedIndirect =
    `${receipt.dimensions}:${receipt.digest}:${receipt.occluderShapes}:${receipt.gain.toFixed(3)}`;
}

export function buildBakedIndirectLightNode(
  sources: BakedIndirectSources,
  tuning: BakedIndirectTuning,
  dimensions: readonly [number, number, number],
  label = 'arena',
  textures: BakedIndirectTextures = allocateBakedIndirectTextures(dimensions, label),
): BakedIndirectGraph {
  const [nx, ny, nz] = dimensions;
  // Explicit camera uniforms for the same reason the ray-traced node uses them:
  // a full-screen post pass is drawn with a quad camera, so the built-in camera
  // nodes would resolve against that quad rather than the player's view.
  const cameraWorldMatrix = uniform(new THREE.Matrix4());
  const cameraRotation = uniform(new THREE.Matrix3());
  const tanHalfFovY = uniform(0.5);
  const aspectRatio = uniform(16 / 9);

  const volumeOrigin = uniform(new THREE.Vector3(0, 0, 0));
  const volumeSpacing = uniform(new THREE.Vector3(1, 1, 1));
  const volumeDimensions = uniform(new THREE.Vector3(nx, ny, nz));
  const gain = uniform(tuning.enabled ? tuning.composite : 0);
  const maximumAdditive = uniform(BAKED_INDIRECT_MAXIMUM_ADDITIVE);
  let active = tuning;
  let bound: IrradianceProbeVolume | null = null;

  const light = Fn(() => {
    const sceneColour = nodeObject(sources.sceneColor);
    const viewZ = nodeObject(sources.sceneViewZ);
    const viewDepth = viewZ.negate();
    const geometryGate = step(viewDepth, float(BAKED_INDIRECT_GEOMETRY_DEPTH_LIMIT_M))
      .mul(step(float(0.02), viewDepth));

    const ndc = screenUV.mul(2).sub(1);
    const viewPosition = vec3(
      ndc.x.mul(tanHalfFovY).mul(aspectRatio).mul(viewDepth),
      ndc.y.mul(tanHalfFovY).mul(viewDepth),
      viewZ,
    );
    const worldPosition = cameraWorldMatrix.mul(vec4(viewPosition, 1)).xyz;
    const worldNormal = normalize(cameraRotation.mul(normalize(nodeObject(sources.sceneNormal).xyz)));

    // Probe (x,y,z) sits at texel centre (x+0.5)/n. Clamping to the half-texel
    // border rather than to 0..1 is what stops the edge probe being smeared
    // across the outer half-cell of the volume.
    const grid = worldPosition.sub(volumeOrigin).div(volumeSpacing).add(0.5);
    const half = vec3(0.5, 0.5, 0.5).div(volumeDimensions);
    const uvw = clamp(grid.div(volumeDimensions), half, vec3(1, 1, 1).sub(half));

    const evaluate = (sh: Node<'vec4'>): Node<'float'> => max(
      float(0),
      sh.x.mul(SH_A0 * SH_Y00).add(
        worldNormal.y.mul(sh.y).add(worldNormal.z.mul(sh.z)).add(worldNormal.x.mul(sh.w)).mul(SH_A1 * SH_Y1),
      ).div(Math.PI),
    );
    const irradiance = vec3(
      evaluate(nodeObject(texture3D(textures.red, uvw) as unknown as Node<'vec4'>)),
      evaluate(nodeObject(texture3D(textures.green, uvw) as unknown as Node<'vec4'>)),
      evaluate(nodeObject(texture3D(textures.blue, uvw) as unknown as Node<'vec4'>)),
    );

    // The albedo proxy: the surface's hue at unit brightness. See the file
    // header for why the shaded colour is not used directly.
    const brightness = max(luminance(sceneColour.rgb), float(ALBEDO_PROXY_LUMINANCE_FLOOR));
    const albedoProxy = clamp(sceneColour.rgb.div(brightness), 0, ALBEDO_PROXY_CEILING);

    // Clamped last, per channel, so no bake value and no gain edit can push a
    // wash across a sightline. This is a clamp, not advice.
    return min(albedoProxy.mul(irradiance).mul(gain).mul(geometryGate), vec3(1, 1, 1).mul(maximumAdditive));
  })();

  return Object.freeze({
    light: light as unknown as Node<'vec3'>,
    applyTuning(next: BakedIndirectTuning): void {
      active = next;
      // Clamped HERE, not only in the resolver. The resolver is the normal
      // route and it clamps; this setter is the one that writes the live
      // uniform, and a value that reaches a live uniform unclamped is not
      // "clamped, not assumed" whatever the route upstream promises.
      gain.value = next.enabled ? Math.min(next.composite, BAKED_INDIRECT_MAXIMUM_GAIN) : 0;
    },
    setVolume(volume: IrradianceProbeVolume): void {
      const [vx, vy, vz] = volume.dimensions;
      if (vx !== nx || vy !== ny || vz !== nz) {
        throw new Error(
          `setVolume: node is bound to ${nx}x${ny}x${nz}, volume is ${vx}x${vy}x${vz}.`,
        );
      }
      uploadBakedIndirectVolume(textures, volume);
      volumeOrigin.value.set(volume.originM[0], volume.originM[1], volume.originM[2]);
      volumeSpacing.value.set(volume.spacingM[0], volume.spacingM[1], volume.spacingM[2]);
      bound = volume;
    },
    beforeRender(): void {
      const camera = sources.camera as THREE.PerspectiveCamera;
      camera.updateMatrixWorld();
      cameraWorldMatrix.value.copy(camera.matrixWorld);
      cameraRotation.value.setFromMatrix4(camera.matrixWorld);
      if (typeof camera.fov === 'number' && typeof camera.aspect === 'number') {
        tanHalfFovY.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
        aspectRatio.value = camera.aspect;
      }
      gain.value = active.enabled ? active.composite : 0;
    },
    receipt() {
      return Object.freeze({
        dimensions: `${nx}x${ny}x${nz}`,
        digest: bound?.digest ?? 'unbound',
        occluderShapes: bound?.bake.occluderShapes ?? -1,
        gain: gain.value,
      });
    },
    dispose(): void {
      textures.dispose();
    },
  });
}
