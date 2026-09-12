/**
 * HF-536 runtime texture bridge for the Nuke Town material families.
 *
 * The forge owns the pixels. This module owns their GPU lifetime and presents
 * three immutable samplers per family to TSL. A bridge is created for one
 * arena build, so unloading that arena can dispose every texture without
 * invalidating a later arena's node graph.
 *
 * Runtime maps are real public PNG assets. Graph construction never waits on
 * them: neutral 1x1 textures are bound immediately and TextureLoader adopts
 * the image into those same texture objects when the async request completes.
 * This keeps the procedural graph visible during loading and avoids a black or
 * white first-frame flash.
 */
import * as THREE from 'three';
import * as TSL from 'three/tsl';
import { NUKETOWN2_IMAGE_TEXTURE_ASSETS, type Nuketown2ImageTextureAsset } from './runtime-texture-assets';

export const NUKETOWN2_TEXTURE_SIZE = 512;
export const NUKETOWN2_TEXTURE_SEED = 536;
export const NUKETOWN2_TEXTURE_SET_SAMPLERS = 3;
/** Baseline measured by the pre-texture sampler census. */
export const NUKETOWN2_BASELINE_SAMPLERS = 1;

export type Nuketown2TextureFamily = 'asphalt' | 'brick' | 'lapSiding' | 'shingle' | 'concrete' | 'timber';

type RuntimeTextureSet = Readonly<{
  family: Nuketown2TextureFamily;
  size: 512;
  seed: number;
  metresPerTile: number;
  mmPerPx: number;
  fractionMostlyZ: number;
  authored: Readonly<Record<string, number>>;
  generateMs: 0;
}>;

export type Nuketown2TextureBridgeOptions = Readonly<{
  /** Explicitly disable all generated maps while retaining procedural graphs. */
  useTextureSet?: boolean;
  /** Runtime v1 ships 512^2 assets. 1024 remains a future authoring option. */
  size?: 512 | 1024;
  seed?: number;
  /** Test and diagnostic override; production receives the measured adapter value. */
  deviceSampledTextureLimit?: number | null;
}>;

export type Nuketown2TextureResource = Readonly<{
  family: Nuketown2TextureFamily;
  set: RuntimeTextureSet;
  albedo: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
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
const runtimeSets = new Map<string, RuntimeTextureSet>();
let measuredDeviceSamplerLimit: number | null = null;

function hasBrowserImageLoader(): boolean {
  return typeof document !== 'undefined' && typeof Image !== 'undefined';
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * (value ** (1 / 2.4)) - 0.055;
}

function placeholderTexture(name: string, pixel: readonly [number, number, number, number], colorSpace: THREE.ColorSpace): THREE.Texture {
  // Keep this a regular Texture. DataTexture's upload path permanently
  // expects image.data, so adopting an HTMLImageElement into one would make
  // the post-load swap fail on both WebGL2 and WebGPU. A one-pixel canvas gives
  // the browser backend a valid neutral source while the image request runs;
  // Node tests use a shape-compatible image because no browser exists there.
  const image = hasBrowserImageLoader()
    ? (() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3] / 255})`;
        context.fillRect(0, 0, 1, 1);
      }
      return canvas;
    })()
    : { width: 1, height: 1 };
  const texture = new THREE.Texture(image);
  texture.name = name;
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function adoptLoadedImage(target: THREE.Texture, loaded: THREE.Texture, colorSpace: THREE.ColorSpace): void {
  target.image = loaded.image;
  target.mipmaps = loaded.mipmaps;
  target.format = loaded.format;
  target.type = loaded.type;
  target.colorSpace = colorSpace;
  target.wrapS = THREE.RepeatWrapping;
  target.wrapT = THREE.RepeatWrapping;
  target.magFilter = THREE.LinearFilter;
  target.minFilter = THREE.LinearMipmapLinearFilter;
  target.generateMipmaps = true;
  target.anisotropy = 8;
  // The forge's row zero is v=1 and the graph explicitly inverts world V.
  target.flipY = false;
  target.needsUpdate = true;
}

function loadInto(loader: THREE.TextureLoader, target: THREE.Texture, url: string, colorSpace: THREE.ColorSpace, isDisposed: () => boolean): void {
  if (!hasBrowserImageLoader()) return;
  loader.load(
    url,
    (loaded) => {
      if (isDisposed()) {
        loaded.dispose();
        return;
      }
      adoptLoadedImage(target, loaded, colorSpace);
      // The loader wrapper has handed its image to the bridge-owned texture.
      loaded.dispose();
    },
    undefined,
    () => {
      // A failed request keeps the neutral placeholder and therefore the
      // procedural graph. The caller may still inspect the request failure.
    },
  );
}

function runtimeSet(family: Nuketown2TextureFamily, asset: Nuketown2ImageTextureAsset, seed: number): RuntimeTextureSet {
  const key = `${family}:${seed}`;
  const prior = runtimeSets.get(key);
  if (prior) return prior;
  const created: RuntimeTextureSet = Object.freeze({
    family,
    size: asset.size,
    seed,
    metresPerTile: asset.metresPerTile,
    mmPerPx: asset.metresPerTile * 1000 / asset.size,
    fractionMostlyZ: asset.fractionMostlyZ,
    authored: asset.detail,
    generateMs: 0,
  });
  runtimeSets.set(key, created);
  return created;
}

function textureSamplerBudgetFits(family: Nuketown2TextureFamily, deviceLimit: number | null): boolean {
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

export function createNuketown2TextureBridge(options: Nuketown2TextureBridgeOptions = {}): Nuketown2TextureBridge {
  const size = options.size ?? NUKETOWN2_TEXTURE_SIZE;
  const seed = options.seed ?? NUKETOWN2_TEXTURE_SEED;
  const deviceSampledTextureLimit = options.deviceSampledTextureLimit === undefined
    ? measuredDeviceSamplerLimit
    : options.deviceSampledTextureLimit;
  const requested = options.useTextureSet !== false;
  const useTextureSet = requested && size === 512 && (
    deviceSampledTextureLimit === null || textureSamplerBudgetFits('asphalt', deviceSampledTextureLimit)
  );
  const fallbackReason = requested && size !== 512
    ? 'runtime v1 assets are 512^2; procedural graph retained for 1024^2'
    : requested && !useTextureSet
      ? `device maxSampledTexturesPerShaderStage=${deviceSampledTextureLimit} is below ${NUKETOWN2_BASELINE_SAMPLERS + NUKETOWN2_TEXTURE_SET_SAMPLERS}`
      : options.useTextureSet === false ? 'disabled by useTextureSet=false' : null;
  const resources = new Map<Nuketown2TextureFamily, Nuketown2TextureResource>();
  const loader = hasBrowserImageLoader() ? new THREE.TextureLoader() : null;
  let disposed = false;

  const resource = (family: Nuketown2TextureFamily): Nuketown2TextureResource | null => {
    if (!useTextureSet || disposed || !textureSamplerBudgetFits(family, deviceSampledTextureLimit)) return null;
    const prior = resources.get(family);
    if (prior) return prior;
    const asset = (NUKETOWN2_IMAGE_TEXTURE_ASSETS as Readonly<Record<string, Nuketown2ImageTextureAsset>>)[family];
    if (!asset) return null;
    const set = runtimeSet(family, asset, seed);
    const meanLinear = [asset.meanLinear[0], asset.meanLinear[1], asset.meanLinear[2]] as [number, number, number];
    // The graph normalises albedo by the measured linear mean. Use that same
    // mean for the placeholder so the pre-load frame has the authored value,
    // rather than flashing white while the real PNG is still in flight.
    const albedoPlaceholder: [number, number, number, number] = [
      Math.round(Math.max(0, Math.min(1, linearToSrgb(meanLinear[0]))) * 255),
      Math.round(Math.max(0, Math.min(1, linearToSrgb(meanLinear[1]))) * 255),
      Math.round(Math.max(0, Math.min(1, linearToSrgb(meanLinear[2]))) * 255),
      255,
    ];
    const albedo = placeholderTexture(`nuketown2-${family}-albedo`, albedoPlaceholder, THREE.SRGBColorSpace);
    const normal = placeholderTexture(`nuketown2-${family}-normal`, [128, 128, 255, 255], THREE.NoColorSpace);
    const orm = placeholderTexture(`nuketown2-${family}-orm`, [255, 128, 0, 255], THREE.NoColorSpace);
    const created: Nuketown2TextureResource = Object.freeze({
      family,
      set,
      albedo,
      normal,
      orm,
      meanLinear,
    });
    resources.set(family, created);
    if (loader) {
      loadInto(loader, albedo, asset.urls.albedo, THREE.SRGBColorSpace, () => disposed);
      loadInto(loader, normal, asset.urls.normal, THREE.NoColorSpace, () => disposed);
      loadInto(loader, orm, asset.urls.orm, THREE.NoColorSpace, () => disposed);
    }
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
        entry.orm.dispose();
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
  // ORM convention: red=AO, green=roughness, blue=metalness. Metalness is
  // authored by the family graph, so only the roughness channel is sampled.
  const roughness = tsl.texture(resource.orm, uv).g;
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
  material.userData.nuketown2TextureBridgeMode = bridge.useTextureSet ? 'runtime-asset' : 'procedural-fallback';
  material.userData.nuketown2TextureDeviceLimit = bridge.deviceSampledTextureLimit;
  material.userData.nuketown2TextureSourceRoute = bridge.sourceRoute;
  material.userData.nuketown2TextureSamplerFamilies = [...families];
  material.userData.nuketown2TextureSamplerCount = families.reduce(
    (count, family) => count + (bridge.resource(family) ? NUKETOWN2_TEXTURE_SET_SAMPLERS : 0),
    0,
  );
}
