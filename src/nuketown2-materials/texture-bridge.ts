/**
 * HF-536 generated texture bridge for the Nuke Town material families.
 *
 * The forge owns the pixels. This module owns their GPU lifetime and presents
 * them to TSL as three immutable samplers per family. A bridge is created for
 * one arena build, so unloading that arena can dispose every DataTexture
 * without invalidating a later arena's node graph.
 */
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { generateTextureSet, type TextureFamily, type TextureSet } from '../forge/textures';
import { NUKETOWN2_IMAGE_TEXTURE_ASSETS, type Nuketown2ImageTextureAsset } from './generated-texture-assets';

export const NUKETOWN2_TEXTURE_SIZE = 512;
export const NUKETOWN2_TEXTURE_SEED = 536;
export const NUKETOWN2_TEXTURE_SET_SAMPLERS = 3;
/** Baseline measured by the pre-texture sampler census. */
export const NUKETOWN2_BASELINE_SAMPLERS = 1;

const GENERATED_SET_CACHE = new Map<string, TextureSet>();
let measuredDeviceSamplerLimit: number | null = null;

export type Nuketown2TextureFamily = Extract<TextureFamily, 'asphalt' | 'brick' | 'lapSiding' | 'shingle' | 'concrete'> | 'timber';

export type Nuketown2TextureBridgeOptions = Readonly<{
  /** Explicitly disable all generated maps while retaining procedural graphs. */
  useTextureSet?: boolean;
  /** Texture size is intentionally bounded to the generator's supported sizes. */
  size?: 512 | 1024;
  seed?: number;
  /** Test and diagnostic override; production receives the measured adapter value. */
  deviceSampledTextureLimit?: number | null;
}>;

export type Nuketown2TextureResource = Readonly<{
  family: Nuketown2TextureFamily;
  set: TextureSet;
  albedo: THREE.DataTexture;
  normal: THREE.DataTexture;
  roughness: THREE.DataTexture;
  meanLinear: readonly [number, number, number];
}>;

export type Nuketown2TextureBridge = Readonly<{
  readonly useTextureSet: boolean;
  readonly size: 512 | 1024;
  readonly seed: number;
  readonly deviceSampledTextureLimit: number | null;
  readonly fallbackReason: string | null;
  readonly sourceRoute: 'codex-built-in-image-generation';
  readonly assetFamilies: readonly Nuketown2TextureFamily[];
  resource(family: Nuketown2TextureFamily): Nuketown2TextureResource | null;
  dispose(): void;
}>;

const tsl = TSL as unknown as Record<string, any>;

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function mapTexture(
  data: Uint8ClampedArray,
  size: number,
  format: THREE.PixelFormat,
  colorSpace: THREE.ColorSpace,
  name: string,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, size, size, format, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.flipY = false;
  // One upload at arena-load time. No render-loop code mutates needsUpdate.
  texture.needsUpdate = true;
  return texture;
}

function decodeAssetBytes(encoded: string): Uint8ClampedArray {
  const binary = globalThis.atob(encoded);
  const bytes = new Uint8ClampedArray(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function imageTextureSet(
  family: Nuketown2TextureFamily,
  asset: Nuketown2ImageTextureAsset,
  seed: number,
): TextureSet {
  return {
    family: family as TextureFamily,
    size: asset.size,
    seed,
    metresPerTile: asset.metresPerTile,
    mmPerPx: asset.metresPerTile * 1000 / asset.size,
    albedo: decodeAssetBytes(asset.albedo),
    normal: decodeAssetBytes(asset.normal),
    roughness: decodeAssetBytes(asset.roughness),
    heightMm: new Float32Array(asset.size * asset.size),
    fractionMostlyZ: asset.fractionMostlyZ,
    authored: asset.detail,
    generateMs: 0,
  };
}

function cachedSet(family: Nuketown2TextureFamily, size: 512 | 1024, seed: number): TextureSet | null {
  const key = `${family}:${size}:${seed}`;
  const prior = GENERATED_SET_CACHE.get(key);
  if (prior) return prior;
  const assets = NUKETOWN2_IMAGE_TEXTURE_ASSETS as Readonly<Record<string, Nuketown2ImageTextureAsset>>;
  const imageAsset = size === 512 ? assets[family] : undefined;
  if (!imageAsset && family === 'timber') return null;
  const generated = imageAsset
    ? imageTextureSet(family, imageAsset, seed)
    : generateTextureSet(family as TextureFamily, { size, seed });
  GENERATED_SET_CACHE.set(key, generated);
  return generated;
}

function meanLinearAlbedo(set: TextureSet): readonly [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const pixels = set.size * set.size;
  for (let index = 0; index < set.albedo.length; index += 4) {
    r += srgbToLinear(set.albedo[index] / 255);
    g += srgbToLinear(set.albedo[index + 1] / 255);
    b += srgbToLinear(set.albedo[index + 2] / 255);
  }
  return [Math.max(r / pixels, 0.001), Math.max(g / pixels, 0.001), Math.max(b / pixels, 0.001)];
}

function textureSamplerBudgetFits(
  family: Nuketown2TextureFamily,
  deviceLimit: number | null,
): boolean {
  if (deviceLimit === null) return true;
  // Concrete's block branch can bind concrete + brick in one pipeline. The
  // other family graphs bind one generated set. This is a sampler budget,
  // not an arena-wide texture count.
  const extra = family === 'brick' ? NUKETOWN2_TEXTURE_SET_SAMPLERS * 2 : NUKETOWN2_TEXTURE_SET_SAMPLERS;
  return NUKETOWN2_BASELINE_SAMPLERS + extra <= deviceLimit;
}

/** Called by the initialized WebGPU runtime with the adapter's measured limit. */
export function setNuketown2TextureDeviceLimit(limit: number | null | undefined): void {
  measuredDeviceSamplerLimit = typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? limit : null;
}

export function getNuketown2TextureDeviceLimit(): number | null {
  return measuredDeviceSamplerLimit;
}

export function createNuketown2TextureBridge(
  options: Nuketown2TextureBridgeOptions = {},
): Nuketown2TextureBridge {
  const size = options.size ?? NUKETOWN2_TEXTURE_SIZE;
  const seed = options.seed ?? NUKETOWN2_TEXTURE_SEED;
  const deviceSampledTextureLimit = options.deviceSampledTextureLimit === undefined
    ? measuredDeviceSamplerLimit
    : options.deviceSampledTextureLimit;
  const requested = options.useTextureSet !== false;
  const useTextureSet = requested && (
    deviceSampledTextureLimit === null
      || textureSamplerBudgetFits('asphalt', deviceSampledTextureLimit)
  );
  const fallbackReason = requested && !useTextureSet
    ? `device maxSampledTexturesPerShaderStage=${deviceSampledTextureLimit} is below ${NUKETOWN2_BASELINE_SAMPLERS + NUKETOWN2_TEXTURE_SET_SAMPLERS}`
    : options.useTextureSet === false ? 'disabled by useTextureSet=false' : null;
  const resources = new Map<Nuketown2TextureFamily, Nuketown2TextureResource>();
  let disposed = false;

  const resource = (family: Nuketown2TextureFamily): Nuketown2TextureResource | null => {
    if (!useTextureSet || disposed || !textureSamplerBudgetFits(family, deviceSampledTextureLimit)) return null;
    const prior = resources.get(family);
    if (prior) return prior;
    const set = cachedSet(family, size, seed);
    if (!set) return null;
    const albedo = mapTexture(set.albedo, set.size, THREE.RGBAFormat, THREE.SRGBColorSpace, `nuketown2-${family}-albedo`);
    const normal = mapTexture(set.normal, set.size, THREE.RGBAFormat, THREE.NoColorSpace, `nuketown2-${family}-normal`);
    const roughness = mapTexture(set.roughness, set.size, THREE.RedFormat, THREE.NoColorSpace, `nuketown2-${family}-roughness`);
    const created: Nuketown2TextureResource = Object.freeze({
      family,
      set,
      albedo,
      normal,
      roughness,
      meanLinear: meanLinearAlbedo(set),
    });
    resources.set(family, created);
    return created;
  };

  return {
    useTextureSet,
    size,
    seed,
    deviceSampledTextureLimit,
    fallbackReason,
    sourceRoute: 'codex-built-in-image-generation',
    assetFamilies: Object.freeze(Object.keys(NUKETOWN2_IMAGE_TEXTURE_ASSETS) as Nuketown2TextureFamily[]),
    resource,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      for (const entry of resources.values()) {
        entry.albedo.dispose();
        entry.normal.dispose();
        entry.roughness.dispose();
      }
      resources.clear();
    },
  };
}

/**
 * Samples all three generated maps with physical metre tiling. Generator row
 * zero is the tile top, so world-positive V is inverted explicitly here.
 */
export function textureSetSamples(
  bridge: Nuketown2TextureBridge,
  family: Nuketown2TextureFamily,
  worldUv: any,
): { albedo: any; roughness: any; normal: any } | null {
  const resource = bridge.resource(family);
  if (!resource) return null;
  const uv = tsl.vec2(
    worldUv.x.div(tsl.float(resource.set.metresPerTile)),
    worldUv.y.div(tsl.float(resource.set.metresPerTile)).mul(tsl.float(-1)),
  );
  const albedo = tsl.texture(resource.albedo, uv).rgb;
  const normal = tsl.normalMap(
    tsl.texture(resource.normal, uv),
    tsl.vec2(tsl.float(0.72), tsl.float(0.72)),
  );
  const roughness = tsl.texture(resource.roughness, uv).r;
  const [r, g, b] = resource.meanLinear;
  return {
    albedo: albedo.div(tsl.vec3(tsl.float(r), tsl.float(g), tsl.float(b))),
    roughness,
    normal,
  };
}

export function attachNuketown2TextureBridge(
  material: THREE.Material,
  bridge: Nuketown2TextureBridge,
  families: readonly Nuketown2TextureFamily[] = [],
): void {
  material.userData.nuketown2TextureBridge = bridge;
  material.userData.nuketown2TextureBridgeMode = bridge.useTextureSet ? 'generated' : 'procedural-fallback';
  material.userData.nuketown2TextureDeviceLimit = bridge.deviceSampledTextureLimit;
  material.userData.nuketown2TextureSourceRoute = bridge.sourceRoute;
  material.userData.nuketown2TextureSamplerFamilies = [...families];
  material.userData.nuketown2TextureSamplerCount = families.reduce(
    (count, family) => count + (bridge.resource(family) ? NUKETOWN2_TEXTURE_SET_SAMPLERS : 0),
    0,
  );
}
