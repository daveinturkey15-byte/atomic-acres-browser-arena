import * as THREE from 'three';
import { StorageInstancedBufferAttribute } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { DroneSensorContact, KillstreakEntitySnapshot, KillstreakImpactEvent, KillstreakPlacementMarkerSnapshot, KillstreakRecipientSnapshot } from './killstreak-runtime';
import { DRONE_GUN_PROFILE_ID, DRONE_PRESENTATION_FAMILY_ID } from './killstreak-support-catalog';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { SUPPORT_WEAPON_FEEDBACK_CONTRACT } from './support-vehicle-presentation-contract';

const MAX_PRESENTED_ENTITIES = 32;
const MAX_IMPACT_FLASHES = 20;
const MAX_BOMB_SHELLS = 20;
const EMBERS_PER_CARPET_IMPACT = 6;
const MAX_EMBER_PARTICLES = MAX_BOMB_SHELLS * EMBERS_PER_CARPET_IMPACT;
const BOMB_SHELL_DROP_DURATION_MS = 420;
const BOMB_SHELL_ALTITUDE = 20;
const EMBER_GRAVITY_MPS2 = 11.25;
const MAX_SENSOR_CONTACTS = 16;
const MAX_PLACEMENT_MARKERS = 8;
export const HUNTER_DRONE_ASSET = './assets/original/models/support/hunter-drone-lod0.glb';
const HUNTER_DRONE_TARGET_MAX_DIMENSION = 1.45;
const HUNTER_DRONE_LOOP_ACTIONS = Object.freeze(['Drone_Propellers_Loop']);
export const SUPPORT_VEHICLE_ASSETS = Object.freeze({
  chopper: Object.freeze([
    './assets/original/models/support/pass65-chopper-gunner-lod0.glb',
    './assets/original/models/support/pass65-chopper-gunner-lod1.glb',
    './assets/original/models/support/pass65-chopper-gunner-lod2.glb',
  ]),
  care: Object.freeze([
    './assets/original/models/support/pass65-care-aircraft-lod0.glb',
    './assets/original/models/support/pass65-care-aircraft-lod1.glb',
    './assets/original/models/support/pass65-care-aircraft-lod2.glb',
  ]),
  carpet: Object.freeze([
    './assets/original/models/support/pass65-carpet-aircraft-lod0.glb',
    './assets/original/models/support/pass65-carpet-aircraft-lod1.glb',
    './assets/original/models/support/pass65-carpet-aircraft-lod2.glb',
  ]),
  crate: Object.freeze([
    './assets/original/models/support/pass65-care-crate-lod0.glb',
    './assets/original/models/support/pass65-care-crate-lod1.glb',
  ]),
} as const);
type SupportVehicleAssetFamily = keyof typeof SUPPORT_VEHICLE_ASSETS;
type SupportAircraftVariant = Extract<SupportVehicleAssetFamily, 'care' | 'carpet'>;
type LoadedSupportVehicleLod = Readonly<{
  scene: THREE.Group;
  animations: readonly THREE.AnimationClip[];
  sourceMaxDimension: number;
  asset: string;
}>;
type SupportVehicleTemplate = Readonly<{ family: SupportVehicleAssetFamily; lods: readonly LoadedSupportVehicleLod[] }>;
const SUPPORT_VEHICLE_LOAD_TIMEOUT_MS = 20_000;
const SUPPORT_VEHICLE_MAX_CONCURRENT_DECODES = 2;
const SUPPORT_VEHICLE_TARGET_DIMENSIONS: Readonly<Record<SupportVehicleAssetFamily, number>> = Object.freeze({
  chopper: 6.2,
  care: 10.2,
  carpet: 10.8,
  crate: 3.2,
});
const SUPPORT_VEHICLE_REQUIRED_NODES: Readonly<Record<SupportVehicleAssetFamily, readonly string[]>> = Object.freeze({
  chopper: Object.freeze([
    'chopper-fuselage', 'chopper-sleek-cockpit-canopy', 'chopper-first-person-cockpit',
    'chopper-cockpit-dashboard-3d', 'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring',
    'chopper-first-person-camera-socket', 'chopper-main-rotor', 'chopper-tail-rotor',
    'chopper-first-person-rotor', 'chopper-player-gun', 'chopper-gun-muzzle-socket',
  ]),
  care: Object.freeze(['care-aircraft-fuselage', 'care-aircraft-main-wing', 'care-aircraft-cargo-socket', 'care-aircraft-forward-socket']),
  carpet: Object.freeze(['carpet-aircraft-fuselage', 'carpet-aircraft-main-wing', 'carpet-aircraft-bomb-socket', 'carpet-aircraft-forward-socket']),
  crate: Object.freeze(['care-package-crate', 'care-package-parachute', 'care-parachute-lines', 'care-crate-landing-socket']),
});
const SUPPORT_VEHICLE_LOOP_ACTIONS: Readonly<Record<SupportVehicleAssetFamily, readonly string[]>> = Object.freeze({
  chopper: Object.freeze(['Chopper_Main_Rotor_Loop', 'Chopper_Tail_Rotor_Loop', 'Chopper_Cockpit_Rotor_Loop', 'Chopper_Quiet_Loop']),
  care: Object.freeze(['Care_Aircraft_Propellers_Loop', 'Care_Aircraft_Quiet_Loop']),
  carpet: Object.freeze(['Carpet_Aircraft_Engine_Loop', 'Carpet_Aircraft_Quiet_Loop']),
  crate: Object.freeze(['Care_Parachute_Sway_Loop', 'Care_Parachute_Lines_Loop']),
});

const supportVehicleTemplates = new Map<SupportVehicleAssetFamily, SupportVehicleTemplate>();
let supportVehicleLoadState: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
let supportVehicleLoadPromise: Promise<void> | null = null;
const supportVehicleLoadFailures = new Map<SupportVehicleAssetFamily, string>();

export const SUPPORT_VEHICLE_TEXTURE_MEMORY_EXPECTATION = Object.freeze({
  authoredTextureCount: 44,
  expectedCanonicalTextureCount: 5,
  decodedBytesPerTexture: 1_398_100,
  expectedActiveTextureBytes: 6_990_500,
  expectedAvoidedTextureBytes: 54_525_900,
});

export type SupportVehicleTextureDedupTelemetry = Readonly<{
  canonicalTextureCount: number;
  reusedTextureCount: number;
  disposedDuplicateTextureCount: number;
  closedDuplicateImageCount: number;
  ineligibleTextureCount: number;
  estimatedActiveTextureBytes: number;
  estimatedAvoidedTextureBytes: number;
}>;

type SupportTextureUse = Readonly<{
  material: THREE.Material;
  property: string;
  texture: THREE.Texture;
}>;

function supportTextureUses(root: THREE.Object3D): readonly SupportTextureUse[] {
  const uses: SupportTextureUse[] = [];
  const visitedMaterials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) {
      if (visitedMaterials.has(entry)) continue;
      visitedMaterials.add(entry);
      const record = entry as unknown as Record<string, unknown>;
      for (const property of Object.keys(record)) {
        const value = record[property];
        if (value instanceof THREE.Texture) uses.push({ material: entry, property, texture: value });
      }
    }
  });
  return uses;
}

function safeTextureMetadataSignature(texture: THREE.Texture): string | null {
  const entries: [string, string | number | boolean | null][] = [];
  for (const [key, value] of Object.entries(texture.userData).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      entries.push([key, value]);
      continue;
    }
    return null;
  }
  return JSON.stringify(entries);
}

function supportTextureSafetyKey(texture: THREE.Texture, semantic: string, contentDigest: string): string | null {
  if (texture.mipmaps.length > 0 || texture.onUpdate !== null) return null;
  const sourceData = texture.source.data as unknown;
  if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) return null;
  const sourceRecord = sourceData as Record<string, unknown>;
  const width = sourceRecord.width;
  const height = sourceRecord.height;
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) return null;
  const metadata = safeTextureMetadataSignature(texture);
  if (metadata === null) return null;
  const textureRecord = texture as unknown as Record<string, unknown>;
  return JSON.stringify({
    contentDigest,
    semantic,
    textureClass: texture.constructor.name,
    colorSpace: texture.colorSpace,
    mapping: texture.mapping,
    channel: texture.channel,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
    magFilter: texture.magFilter,
    minFilter: texture.minFilter,
    anisotropy: texture.anisotropy,
    format: texture.format,
    internalFormat: texture.internalFormat,
    type: texture.type,
    generateMipmaps: texture.generateMipmaps,
    premultiplyAlpha: texture.premultiplyAlpha,
    flipY: texture.flipY,
    unpackAlignment: texture.unpackAlignment,
    compareFunction: textureRecord.compareFunction ?? null,
    offset: texture.offset.toArray(),
    repeat: texture.repeat.toArray(),
    center: texture.center.toArray(),
    rotation: texture.rotation,
    matrixAutoUpdate: texture.matrixAutoUpdate,
    matrix: texture.matrix.elements,
    width,
    height,
    depth: typeof sourceRecord.depth === 'number' ? sourceRecord.depth : 1,
    metadata,
  });
}

function estimatedDecodedTextureBytes(texture: THREE.Texture): number {
  const sourceData = texture.source.data as unknown;
  if (!sourceData || typeof sourceData !== 'object' || Array.isArray(sourceData)) return 0;
  const sourceRecord = sourceData as Record<string, unknown>;
  if (typeof sourceRecord.width !== 'number' || typeof sourceRecord.height !== 'number') return 0;
  let width = Math.max(1, Math.floor(sourceRecord.width));
  let height = Math.max(1, Math.floor(sourceRecord.height));
  let bytes = width * height * 4;
  if (!texture.generateMipmaps) return bytes;
  while (width > 1 || height > 1) {
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
    bytes += width * height * 4;
  }
  return bytes;
}

export class SupportVehicleTextureCanonicalizer {
  private readonly canonicalBySafetyKey = new Map<string, THREE.Texture>();
  private readonly canonicalTextures = new Set<THREE.Texture>();
  private readonly reusedTextures = new WeakSet<THREE.Texture>();
  private readonly ineligibleTextures = new WeakSet<THREE.Texture>();
  private readonly closedSources = new WeakSet<object>();
  private readonly retainedSources = new WeakSet<object>();
  private reusedTextureCount = 0;
  private disposedDuplicateTextureCount = 0;
  private closedDuplicateImageCount = 0;
  private ineligibleTextureCount = 0;
  private estimatedAvoidedTextureBytes = 0;

  canonicalize(root: THREE.Object3D, contentDigests: ReadonlyMap<THREE.Texture, string>): void {
    const uses = supportTextureUses(root);
    const detachedCandidates = new Set<THREE.Texture>();
    for (const use of uses) {
      const materialRecord = use.material as unknown as Record<string, unknown>;
      if (materialRecord[use.property] !== use.texture) continue;
      const digest = contentDigests.get(use.texture);
      const safetyKey = digest ? supportTextureSafetyKey(use.texture, use.property, digest) : null;
      if (safetyKey === null) {
        if (!this.ineligibleTextures.has(use.texture)) {
          this.ineligibleTextures.add(use.texture);
          this.ineligibleTextureCount += 1;
        }
        const sourceData = use.texture.source.data as unknown;
        if (sourceData && typeof sourceData === 'object') this.retainedSources.add(sourceData);
        continue;
      }
      const canonical = this.canonicalBySafetyKey.get(safetyKey);
      if (!canonical) {
        this.canonicalBySafetyKey.set(safetyKey, use.texture);
        this.canonicalTextures.add(use.texture);
        const sourceData = use.texture.source.data as unknown;
        if (sourceData && typeof sourceData === 'object') this.retainedSources.add(sourceData);
        continue;
      }
      if (canonical === use.texture) continue;
      materialRecord[use.property] = canonical;
      detachedCandidates.add(use.texture);
    }

    for (const use of supportTextureUses(root)) {
      const sourceData = use.texture.source.data as unknown;
      if (sourceData && typeof sourceData === 'object') this.retainedSources.add(sourceData);
    }

    for (const duplicate of detachedCandidates) {
      const stillReferenced = uses.some((use) => (
        (use.material as unknown as Record<string, unknown>)[use.property] === duplicate
      ));
      if (stillReferenced || this.canonicalTextures.has(duplicate) || this.reusedTextures.has(duplicate)) continue;
      this.reusedTextures.add(duplicate);
      this.reusedTextureCount += 1;
      this.estimatedAvoidedTextureBytes += estimatedDecodedTextureBytes(duplicate);
      duplicate.dispose();
      this.disposedDuplicateTextureCount += 1;

      const sourceData = duplicate.source.data as unknown;
      if (!sourceData || typeof sourceData !== 'object' || this.closedSources.has(sourceData)) continue;
      const close = (sourceData as Record<string, unknown>).close;
      if (this.retainedSources.has(sourceData) || typeof close !== 'function') continue;
      try {
        close.call(sourceData);
        this.closedSources.add(sourceData);
        duplicate.source.data = null;
        this.closedDuplicateImageCount += 1;
      } catch {
        // A failed ImageBitmap.close() must not turn an otherwise safe load into a fallback.
      }
    }
  }

  telemetry(): SupportVehicleTextureDedupTelemetry {
    return Object.freeze({
      canonicalTextureCount: this.canonicalTextures.size,
      reusedTextureCount: this.reusedTextureCount,
      disposedDuplicateTextureCount: this.disposedDuplicateTextureCount,
      closedDuplicateImageCount: this.closedDuplicateImageCount,
      ineligibleTextureCount: this.ineligibleTextureCount,
      estimatedActiveTextureBytes: [...this.canonicalTextures]
        .reduce((total, texture) => total + estimatedDecodedTextureBytes(texture), 0),
      estimatedAvoidedTextureBytes: this.estimatedAvoidedTextureBytes,
    });
  }
}

const supportVehicleTextureCanonicalizer = new SupportVehicleTextureCanonicalizer();

let hunterDroneTemplate: THREE.Group | null = null;
let hunterDroneAnimations: readonly THREE.AnimationClip[] = [];
let hunterDroneSourceMaxDimension = 0;
let hunterDroneLoadState: 'idle' | 'loading' | 'ready' | 'fallback' = 'idle';
let hunterDroneLoadPromise: Promise<void> | null = null;

function markSharedPresentationAsset(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.presentationOnly = true;
    node.userData.authoredSharedAsset = true;
    node.raycast = () => undefined;
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

export function loadHunterDronePresentation(): Promise<void> {
  if (hunterDroneLoadPromise) return hunterDroneLoadPromise;
  hunterDroneLoadState = 'loading';
  hunterDroneLoadPromise = new Promise((resolve) => {
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(HUNTER_DRONE_ASSET, (gltf) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      hunterDroneSourceMaxDimension = Math.max(size.x, size.y, size.z);
      const required = ['drone-body', 'drone-mounted-gun', 'drone-gun-muzzle-socket', 'drone-first-person-camera-socket', 'drone-rotors'];
      hunterDroneLoadState = hunterDroneSourceMaxDimension > 0 && required.every((name) => root.getObjectByName(name))
        ? 'ready'
        : 'fallback';
      if (hunterDroneLoadState === 'ready') {
        hunterDroneTemplate = root;
        hunterDroneAnimations = Object.freeze([...gltf.animations]);
        markSharedPresentationAsset(root);
      }
      resolve();
    }, undefined, (error) => {
      hunterDroneLoadState = 'fallback';
      console.warn('[Arena] Authored Hunter Drone unavailable; retaining bounded fallback.', error);
      resolve();
    });
  });
  return hunterDroneLoadPromise;
}

export function hunterDronePresentationTelemetry(): Readonly<{
  state: typeof hunterDroneLoadState;
  asset: string;
  sourceMaxDimension: number;
  animations: readonly string[];
}> {
  return Object.freeze({
    state: hunterDroneLoadState,
    asset: HUNTER_DRONE_ASSET,
    sourceMaxDimension: hunterDroneSourceMaxDimension,
    animations: Object.freeze(hunterDroneAnimations.map((clip) => clip.name)),
  });
}

type EmbeddedImageDefinition = Readonly<{ name?: string; mimeType?: string; bufferView?: number }>;
type EmbeddedTextureDefinition = Readonly<{
  source?: number;
  extensions?: Readonly<Record<string, Readonly<{ source?: number }>>>;
}>;

function loadedEmbeddedImageIndex(gltf: GLTF, texture: THREE.Texture, textureIndex: number): number | null {
  const textureDef = gltf.parser.json.textures?.[textureIndex] as EmbeddedTextureDefinition | undefined;
  const images = gltf.parser.json.images as readonly EmbeddedImageDefinition[] | undefined;
  if (!textureDef || !images) return null;
  const candidates = [
    textureDef.source,
    textureDef.extensions?.KHR_texture_basisu?.source,
    textureDef.extensions?.EXT_texture_webp?.source,
    textureDef.extensions?.EXT_texture_avif?.source,
  ].filter((value): value is number => typeof value === 'number');
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 1) return uniqueCandidates[0]!;
  const textureMimeType = typeof texture.userData.mimeType === 'string' ? texture.userData.mimeType : null;
  const exactMatches = uniqueCandidates.filter((index) => {
    const image = images[index];
    if (!image) return false;
    const nameMatches = texture.name.length === 0 || image.name === texture.name;
    const mimeMatches = textureMimeType === null || image.mimeType === textureMimeType;
    return nameMatches && mimeMatches;
  });
  return exactMatches.length === 1 ? exactMatches[0]! : null;
}

async function sha256Digest(buffer: ArrayBuffer): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(buffer).slice());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function supportTextureContentDigests(gltf: GLTF): Promise<ReadonlyMap<THREE.Texture, string>> {
  const digests = new Map<THREE.Texture, string>();
  const byBufferView = new Map<number, Promise<string | null>>();
  const textures = new Set(supportTextureUses(gltf.scene).map((use) => use.texture));
  await Promise.all([...textures].map(async (texture) => {
    const textureIndex = gltf.parser.associations.get(texture)?.textures;
    if (textureIndex === undefined) return;
    const imageIndex = loadedEmbeddedImageIndex(gltf, texture, textureIndex);
    const image = imageIndex === null
      ? undefined
      : (gltf.parser.json.images?.[imageIndex] as EmbeddedImageDefinition | undefined);
    if (image?.bufferView === undefined) return;
    let pendingDigest = byBufferView.get(image.bufferView);
    if (!pendingDigest) {
      pendingDigest = gltf.parser.getDependency('bufferView', image.bufferView)
        .then((value: unknown) => value instanceof ArrayBuffer ? sha256Digest(value) : null)
        .catch(() => null);
      byBufferView.set(image.bufferView, pendingDigest);
    }
    const digest = await pendingDigest;
    if (digest) digests.set(texture, digest);
  }));
  return digests;
}

function loadSupportVehicleLod(asset: string): Promise<LoadedSupportVehicleLod> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`${asset}: bounded load exceeded ${SUPPORT_VEHICLE_LOAD_TIMEOUT_MS}ms`));
    }, SUPPORT_VEHICLE_LOAD_TIMEOUT_MS);
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(asset, (gltf) => {
      if (settled) return;
      void (async () => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);
        const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
        const sourceMaxDimension = Math.max(size.x, size.y, size.z);
        if (!(sourceMaxDimension > 0)) throw new Error(`${asset}: authored scene has no measurable geometry`);
        const contentDigests = await supportTextureContentDigests(gltf);
        supportVehicleTextureCanonicalizer.canonicalize(scene, contentDigests);
        markSharedPresentationAsset(scene);
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        resolve(Object.freeze({ scene, animations: Object.freeze([...gltf.animations]), sourceMaxDimension, asset }));
      })().catch((error: unknown) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    }, undefined, (error) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

async function allSettledBounded<T>(
  items: readonly T[],
  maximumConcurrency: number,
  task: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  const results = new Array<PromiseSettledResult<void>>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        await task(items[index]!);
        results[index] = { status: 'fulfilled', value: undefined };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.allSettled(Array.from(
    { length: Math.min(items.length, Math.max(1, maximumConcurrency)) },
    worker,
  ));
  return results;
}

export function loadSupportVehiclePresentations(): Promise<void> {
  if (supportVehicleLoadPromise) return supportVehicleLoadPromise;
  supportVehicleLoadState = 'loading';
  supportVehicleLoadPromise = (async () => {
    const families = Object.keys(SUPPORT_VEHICLE_ASSETS) as SupportVehicleAssetFamily[];
    const results = await allSettledBounded(families, SUPPORT_VEHICLE_MAX_CONCURRENT_DECODES, async (family) => {
      // LODs within a family are sequential, so the global cap is also the
      // exact maximum number of simultaneous Meshopt/GLTF decode jobs.
      const lods: LoadedSupportVehicleLod[] = [];
      for (const asset of SUPPORT_VEHICLE_ASSETS[family]) lods.push(await loadSupportVehicleLod(asset));
      const missing = SUPPORT_VEHICLE_REQUIRED_NODES[family].filter((name) => lods[0]?.scene.getObjectByName(name) === undefined);
      if (missing.length > 0) throw new Error(`${family}: authored LOD0 missing ${missing.join(', ')}`);
      if (new Set(lods.map((lod) => lod.asset)).size !== SUPPORT_VEHICLE_ASSETS[family].length) {
        throw new Error(`${family}: runtime asset set is not exact`);
      }
      supportVehicleTemplates.set(family, Object.freeze({ family, lods: Object.freeze(lods) }));
    });
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') continue;
      const family = families[index]!;
      supportVehicleLoadFailures.set(family, result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
    supportVehicleLoadState = supportVehicleTemplates.size === Object.keys(SUPPORT_VEHICLE_ASSETS).length ? 'ready' : 'fallback';
    if (supportVehicleLoadState === 'fallback') {
      console.warn('[Arena] One or more authored support vehicles are unavailable; explicit non-release fallbacks remain active.', Object.fromEntries(supportVehicleLoadFailures));
    }
  })();
  return supportVehicleLoadPromise;
}

export function supportVehiclePresentationTelemetry(): Readonly<{
  state: typeof supportVehicleLoadState;
  requiredAssets: readonly string[];
  loadedAssets: readonly string[];
  readyFamilies: readonly string[];
  maxConcurrentDecodes: number;
  failures: Readonly<Record<string, string>>;
  textureDedup: SupportVehicleTextureDedupTelemetry;
}> {
  return Object.freeze({
    state: supportVehicleLoadState,
    requiredAssets: Object.freeze(Object.values(SUPPORT_VEHICLE_ASSETS).flat()),
    loadedAssets: Object.freeze([...supportVehicleTemplates.values()].flatMap((template) => template.lods.map((lod) => lod.asset)).sort()),
    readyFamilies: Object.freeze([...supportVehicleTemplates.keys()].sort()),
    maxConcurrentDecodes: SUPPORT_VEHICLE_MAX_CONCURRENT_DECODES,
    failures: Object.freeze(Object.fromEntries(supportVehicleLoadFailures)),
    textureDedup: supportVehicleTextureCanonicalizer.telemetry(),
  });
}

export function supportAircraftPresentationVariant(entityId: string): SupportAircraftVariant | null {
  if (entityId.includes('-care-aircraft-')) return 'care';
  if (entityId.includes('-carpet-aircraft-')) return 'carpet';
  return null;
}

type PresentedEntity = Readonly<{
  root: THREE.Group;
  rotor: THREE.Object3D | null;
  target: THREE.Vector3;
  mixers: readonly THREE.AnimationMixer[];
  authored: boolean;
}>;

type SwarmInstanceBatch = Readonly<{
  root: THREE.InstancedMesh;
  sources: readonly THREE.Object3D[];
  staticLocalMatrices: readonly THREE.Matrix4[] | null;
  ownsGeometry: boolean;
}>;

function activeSwarmAnimationTargetNames(): ReadonlySet<string> {
  const names = new Set<string>();
  for (const clip of hunterDroneAnimations) {
    if (!HUNTER_DRONE_LOOP_ACTIONS.includes(clip.name)) continue;
    for (const track of clip.tracks) {
      const target = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      if (target) names.add(target);
    }
  }
  return names;
}

function animatedSwarmAncestor(
  source: THREE.Object3D,
  root: THREE.Object3D,
  animatedTargetNames: ReadonlySet<string>,
): THREE.Object3D | null {
  let cursor: THREE.Object3D | null = source;
  while (cursor && cursor !== root) {
    if (animatedTargetNames.has(cursor.name)) return cursor;
    cursor = cursor.parent;
  }
  return null;
}

function swarmStaticMergeKey(mesh: THREE.Mesh): string | null {
  if (Array.isArray(mesh.material) || mesh instanceof THREE.SkinnedMesh) return null;
  const attributeSignature = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string => {
    const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
    const gpuType = 'gpuType' in attribute ? attribute.gpuType : null;
    return [array.constructor.name, attribute.itemSize, Number(attribute.normalized), gpuType].join(':');
  };
  const attributes = Object.entries(mesh.geometry.attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, attribute]) => `${name}:${attributeSignature(attribute)}`)
    .join(',');
  const morphAttributes = Object.entries(mesh.geometry.morphAttributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entries]) => `${name}:${entries.map(attributeSignature).join('+')}`)
    .join(',');
  const index = mesh.geometry.index
    ? attributeSignature(mesh.geometry.index)
    : 'non-indexed';
  return [
    mesh.material.uuid,
    index,
    attributes,
    morphAttributes,
    String(mesh.geometry.morphTargetsRelative),
    String(mesh.castShadow),
    String(mesh.receiveShadow),
    String(mesh.renderOrder),
    String(mesh.layers.mask),
  ].join('|');
}

function supportAnimationTargetNames(animations: readonly THREE.AnimationClip[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const clip of animations) {
    for (const track of clip.tracks) {
      const target = THREE.PropertyBinding.parseTrackName(track.name).nodeName;
      if (target) names.add(target);
    }
  }
  return names;
}

function batchAuthoredSupportStaticMeshes(
  anchor: THREE.Object3D,
  family: SupportVehicleAssetFamily,
  scope: string,
): Readonly<{ sourceMeshes: number; batches: number }> {
  anchor.updateWorldMatrix(true, true);
  const anchorInverse = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
  const groups = new Map<string, THREE.Mesh[]>();
  anchor.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible || node.userData.staticBatchRendered === true) return;
    let cursor: THREE.Object3D | null = node;
    while (cursor && cursor !== anchor.parent) {
      if (cursor.userData.supportAnimationTarget === true
        || cursor.userData.supportStaticBatchBoundary === true) return;
      cursor = cursor.parent;
    }
    const key = swarmStaticMergeKey(node);
    if (!key) return;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  });

  let sourceMeshes = 0;
  let batches = 0;
  for (const sources of groups.values()) {
    if (sources.length < 2) continue;
    const transformed = sources.map((source) => {
      const localMatrix = new THREE.Matrix4().multiplyMatrices(anchorInverse, source.matrixWorld);
      return source.geometry.clone().applyMatrix4(localMatrix);
    });
    const geometry = mergeGeometries(transformed, false);
    for (const entry of transformed) entry.dispose();
    if (!geometry) continue;
    const representative = sources[0]!;
    const batch = new THREE.Mesh(geometry, representative.material);
    batch.name = `pass65-${family}-${scope}-static-batch-${batches + 1}`;
    batch.userData.presentationOnly = true;
    batch.userData.supportStaticBatchOutput = true;
    batch.userData.sourceMeshes = sources.length;
    batch.castShadow = representative.castShadow;
    batch.receiveShadow = representative.receiveShadow;
    batch.renderOrder = representative.renderOrder;
    batch.layers.mask = representative.layers.mask;
    batch.raycast = () => undefined;
    anchor.add(batch);
    for (const source of sources) {
      source.visible = false;
      source.castShadow = false;
      source.userData.staticBatchRendered = true;
    }
    sourceMeshes += sources.length;
    batches += 1;
  }
  return Object.freeze({ sourceMeshes, batches });
}

function optimizeAuthoredSupportLevel(
  level: THREE.Group,
  family: SupportVehicleAssetFamily,
  animations: readonly THREE.AnimationClip[],
): void {
  for (const targetName of supportAnimationTargetNames(animations)) {
    const target = level.getObjectByName(targetName);
    if (target) target.userData.supportAnimationTarget = true;
  }
  const cockpit = family === 'chopper' ? level.getObjectByName('chopper-first-person-cockpit') : null;
  const cockpitStats = cockpit
    ? batchAuthoredSupportStaticMeshes(cockpit, family, 'cockpit')
    : Object.freeze({ sourceMeshes: 0, batches: 0 });
  if (cockpit) cockpit.userData.supportStaticBatchBoundary = true;
  const exteriorStats = batchAuthoredSupportStaticMeshes(level, family, 'exterior');
  level.userData.supportStaticBatchStats = Object.freeze({
    sourceMeshes: cockpitStats.sourceMeshes + exteriorStats.sourceMeshes,
    batches: cockpitStats.batches + exteriorStats.batches,
  });
}

type PresentedEntityPoolKey = 'chopper' | 'care-aircraft' | 'carpet-aircraft' | 'care-crate' | 'piloted-drone' | 'swarm-drone';

function presentedEntityPoolKey(entity: KillstreakEntitySnapshot): PresentedEntityPoolKey {
  if (entity.kind === 'chopper') return 'chopper';
  if (entity.kind === 'care-crate') return 'care-crate';
  if (entity.kind === 'drone') return entity.mode === 'piloted' ? 'piloted-drone' : 'swarm-drone';
  return supportAircraftPresentationVariant(entity.id) === 'carpet' ? 'carpet-aircraft' : 'care-aircraft';
}

function buildPresentedEntityForPool(key: PresentedEntityPoolKey): PresentedEntity {
  if (key === 'chopper') return buildAuthoredSupportVehicle('chopper') ?? buildProceduralChopperFallback();
  if (key === 'care-aircraft') return buildAuthoredSupportVehicle('care') ?? buildProceduralAircraftFallback('care');
  if (key === 'carpet-aircraft') return buildAuthoredSupportVehicle('carpet') ?? buildProceduralAircraftFallback('carpet');
  if (key === 'care-crate') return buildAuthoredSupportVehicle('crate') ?? buildProceduralCareCrateFallback();
  return buildDrone(key === 'piloted-drone' ? 'piloted' : 'swarm');
}

type PresentedPlacementMarker = {
  root: THREE.Group;
  snapshot: KillstreakPlacementMarkerSnapshot;
  snapshotRevision: number;
  expiresAtMs: number;
};

type PooledImpactFlash = {
  root: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  inactiveName: string;
  active: boolean;
  createdAtMs: number;
  expiresAtMs: number;
  baseRadius: number;
  maximumOpacity: number;
};

type PooledBombShell = {
  root: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial>;
  inactiveName: string;
  impactPosition: THREE.Vector3;
  active: boolean;
  startY: number;
  createdAtMs: number;
  impactAtMs: number;
};

type PooledEmber = {
  root: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  inactiveName: string;
  origin: THREE.Vector3;
  velocity: THREE.Vector3;
  active: boolean;
  radius: number;
  createdAtMs: number;
  expiresAtMs: number;
};

export type KillstreakPlacementMarkerTelemetry = Readonly<{
  id: string;
  activationId: string;
  source: KillstreakPlacementMarkerSnapshot['source'];
  shape: KillstreakPlacementMarkerSnapshot['shape'];
  audience: KillstreakPlacementMarkerSnapshot['audience'];
  ownerId: string;
  anchor: readonly number[];
  pathStart: readonly number[] | null;
  pathEnd: readonly number[] | null;
  halfWidthM: number | null;
  worldPosition: readonly number[];
  worldBounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
  corridorLengthM: number | null;
  meshNames: readonly string[];
  colourHexes: readonly string[];
  depthTest: boolean;
  writesDepth: boolean;
  maximumOpacity: number;
  raycastDisabled: boolean;
  visible: boolean;
}>;

export type KillstreakPresentationTelemetry = Readonly<{
  entities: number;
  impactFlashes: number;
  bombShells: number;
  emberParticles: number;
  sensorContacts: number;
  placementMarkers: number;
  prewarmed: number;
  pooledEntityInstances: number;
  pooledSwarmDrones: number;
  swarmRenderBatches: number;
  swarmRenderedInstances: number;
  prewarmedAuthoredSupportFamilies: readonly string[];
  markerDetails: readonly KillstreakPlacementMarkerTelemetry[];
  bounded: boolean;
}>;

export type KillstreakPresentationRetireRoot = (root: THREE.Object3D) => void;

export type KillstreakPresentationProgress = Readonly<{
  submissionSequence: number;
  completedSequence: number;
}>;

function material(color: number, options: { emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0,
    emissiveIntensity: options.emissive ? 0.55 : 0,
    roughness: 0.45,
    metalness: 0.42,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

function mesh(geometry: THREE.BufferGeometry, colour: number, name: string): THREE.Mesh {
  const result = new THREE.Mesh(geometry, material(colour));
  result.name = name;
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function presentationSocket(name: string, position: readonly [number, number, number]): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  result.userData.presentationOnly = true;
  return result;
}

function isFirstPersonCockpitNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.userData.firstPersonCockpit === true) return true;
    cursor = cursor.parent;
  }
  return false;
}

function isFirstPersonOnlyNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.userData.firstPersonOnly === true) return true;
    cursor = cursor.parent;
  }
  return false;
}

const supportMaterialBaseDepthWrite = new WeakMap<THREE.Material, boolean>();

function setSupportFirstPersonVisibility(root: THREE.Group, possessed: boolean): void {
  root.visible = true;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const cockpitNode = isFirstPersonCockpitNode(root, node);
    const firstPersonOnlyNode = isFirstPersonOnlyNode(root, node);
    const retiredStaticSource = node.userData.staticBatchRendered === true
      && node.userData.supportStaticBatchOutput !== true;
    const overrideActive = node.userData.supportFirstPersonOverrideActive === true;
    if (possessed) {
      if (!overrideActive) node.userData.supportBaseVisible = node.visible;
      node.userData.supportFirstPersonOverrideActive = true;
      node.visible = cockpitNode && !retiredStaticSource;
    } else if (overrideActive) {
      node.visible = node.userData.supportBaseVisible === true && !firstPersonOnlyNode;
      node.userData.supportFirstPersonOverrideActive = false;
    } else if (firstPersonOnlyNode) {
      node.visible = false;
    }
    if (!node.material || !cockpitNode) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) {
      if (!supportMaterialBaseDepthWrite.has(entry)) supportMaterialBaseDepthWrite.set(entry, entry.depthWrite);
      entry.depthWrite = possessed ? false : supportMaterialBaseDepthWrite.get(entry)!;
    }
  });
}

function buildAuthoredSupportVehicle(family: SupportVehicleAssetFamily): PresentedEntity | null {
  const template = supportVehicleTemplates.get(family);
  if (!template) return null;
  const runtimeName = family === 'chopper' ? 'pass65-chopper-gunner'
    : family === 'care' ? 'pass65-care-package-aircraft'
      : family === 'carpet' ? 'pass65-carpet-bomber-aircraft'
        : 'pass65-care-package';
  const root = new THREE.Group();
  root.name = runtimeName;
  root.userData.pass65KillstreakPresentation = true;
  root.userData.presentationSource = 'project-original-blender-glb';
  root.userData.presentationFamily = family;
  root.userData.assetPaths = [...SUPPORT_VEHICLE_ASSETS[family]];
  root.userData.forwardAxis = [0, 0, -1];
  root.userData.authoredSharedAsset = true;
  const lod = new THREE.LOD();
  lod.name = `${runtimeName}-authored-lods`;
  const mixers: THREE.AnimationMixer[] = [];
  for (const [index, source] of template.lods.entries()) {
    const level = source.scene.clone(true);
    level.name = `${runtimeName}-authored-lod${index}`;
    optimizeAuthoredSupportLevel(level, family, source.animations);
    level.scale.setScalar(SUPPORT_VEHICLE_TARGET_DIMENSIONS[family] / Math.max(0.001, source.sourceMaxDimension));
    level.userData.presentationAsset = source.asset;
    const cockpit = level.getObjectByName('chopper-first-person-cockpit');
    if (cockpit) {
      cockpit.userData.firstPersonCockpit = true;
      cockpit.userData.firstPersonOnly = true;
    }
    const firstPersonRotor = level.getObjectByName('chopper-first-person-rotor');
    if (firstPersonRotor) firstPersonRotor.userData.firstPersonOnly = true;
    markSharedPresentationAsset(level);
    lod.addLevel(level, [0, 34, 68][index] ?? index * 34);
    const mixer = new THREE.AnimationMixer(level);
    for (const clipName of SUPPORT_VEHICLE_LOOP_ACTIONS[family]) {
      const clip = source.animations.find((candidate) => candidate.name === clipName);
      if (clip) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    }
    mixers.push(mixer);
  }
  root.add(lod);
  if (family === 'chopper') {
    root.userData.audioSemanticIds = ['chopper-low-loop', 'chopper-gun-report'];
    root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
  }
  if (family === 'crate') {
    root.userData.interactable = true;
    root.userData.interactionPrompt = 'F TO COLLECT KILLSTREAK';
    for (const level of lod.levels) {
      const crate = level.object.getObjectByName('care-package-crate');
      if (!crate) continue;
      crate.userData.interactable = true;
      crate.userData.interactionPrompt = 'F TO COLLECT KILLSTREAK';
    }
  }
  markSharedPresentationAsset(root);
  return Object.freeze({ root, rotor: null, target: new THREE.Vector3(), mixers: Object.freeze(mixers), authored: true });
}

function buildProceduralChopperFallback(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-chopper-gunner';
  root.userData.pass65KillstreakPresentation = true;
  const fuselage = mesh(new THREE.CapsuleGeometry(0.72, 2.1, 6, 12), 0x18262b, 'chopper-fuselage');
  fuselage.rotation.x = Math.PI / 2;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.67, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    material(0x316b77, { emissive: 0x0a2932, transparent: true, opacity: 0.82 }),
  );
  canopy.name = 'chopper-sleek-cockpit-canopy';
  canopy.position.set(0, 0.2, -0.98);
  canopy.scale.set(0.88, 0.78, 1.1);
  const glareshield = mesh(new THREE.BoxGeometry(0.76, 0.09, 0.43), 0x071012, 'chopper-cockpit-glareshield');
  glareshield.position.set(0, 0.04, -0.92);
  const tail = mesh(new THREE.BoxGeometry(0.18, 0.18, 2.25), 0x263a3f, 'chopper-tail-boom');
  tail.position.z = 1.95;
  const fin = mesh(new THREE.BoxGeometry(0.08, 0.75, 0.55), 0xe0b94f, 'chopper-tail-fin');
  fin.position.set(0, 0.35, 3.03);
  const gun = mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.95, 10), 0x0b1012, 'chopper-player-gun');
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -0.58, -0.72);
  const gunMuzzle = presentationSocket('chopper-gun-muzzle-socket', [0, -0.58, -1.24]);
  const cameraSocket = presentationSocket('chopper-first-person-camera-socket', [0, 0.18, -1.22]);
  const cockpit = new THREE.Group();
  cockpit.name = 'chopper-first-person-cockpit';
  cockpit.userData.firstPersonCockpit = true;
  cockpit.userData.firstPersonOnly = true;
  cockpit.position.copy(cameraSocket.position);
  const dashboard = mesh(new THREE.BoxGeometry(0.82, 0.13, 0.16), 0x071215, 'chopper-cockpit-dashboard-3d');
  dashboard.position.set(0, -0.165, -0.35);
  dashboard.rotation.x = -0.16;
  const cockpitRailLeft = mesh(new THREE.BoxGeometry(0.035, 0.48, 0.035), 0x2a555e, 'chopper-cockpit-rail-left');
  cockpitRailLeft.position.set(-0.47, 0.02, -0.27);
  cockpitRailLeft.rotation.z = -0.18;
  const cockpitRailRight = cockpitRailLeft.clone();
  cockpitRailRight.name = 'chopper-cockpit-rail-right';
  cockpitRailRight.position.x = 0.47;
  cockpitRailRight.rotation.z = 0.18;
  const displayMaterial = (colour: number) => new THREE.MeshStandardMaterial({
    color: colour,
    emissive: colour,
    emissiveIntensity: 2.2,
    roughness: 0.28,
    metalness: 0.18,
    toneMapped: false,
  });
  const cyanDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.012), displayMaterial(0x41ddff));
  cyanDisplay.name = 'chopper-cockpit-display-cyan';
  cyanDisplay.position.set(-0.19, -0.125, -0.44);
  const greenDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.012), displayMaterial(0x5dff9b));
  greenDisplay.name = 'chopper-cockpit-display-green';
  greenDisplay.position.set(0.19, -0.125, -0.44);
  const hudGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.58, 0.30, 0.012),
    material(0x3bd9e8, { emissive: 0x0c6872, transparent: true, opacity: 0.22 }),
  );
  hudGlass.name = 'chopper-cockpit-hud-glass';
  hudGlass.position.set(0, 0.02, -0.56);
  const hudTargetRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.08, 0.006, 6, 20),
    new THREE.MeshBasicMaterial({ color: 0x65ff9b, toneMapped: false }),
  );
  hudTargetRing.name = 'chopper-cockpit-hud-target-ring';
  hudTargetRing.position.set(0, 0.02, -0.57);
  const firstPersonRotor = new THREE.Group();
  firstPersonRotor.name = 'chopper-first-person-rotor';
  firstPersonRotor.userData.firstPersonOnly = true;
  // Keep the translucent tips forward of the near plane throughout rotation;
  // they remain visible overhead without ever sweeping through the camera.
  firstPersonRotor.position.set(0, 0.44, -1.35);
  const rotorBlurMaterial = new THREE.MeshBasicMaterial({
    color: 0x7ddde3,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    toneMapped: false,
  });
  const firstBladeA = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.012, 0.035), rotorBlurMaterial);
  firstBladeA.name = 'chopper-first-person-rotor-blade-a';
  const firstBladeB = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 2.2), rotorBlurMaterial.clone());
  firstBladeB.name = 'chopper-first-person-rotor-blade-b';
  firstPersonRotor.add(firstBladeA, firstBladeB);
  cockpit.add(dashboard, cockpitRailLeft, cockpitRailRight, cyanDisplay, greenDisplay, hudGlass, hudTargetRing, firstPersonRotor);
  const rotor = new THREE.Group();
  rotor.name = 'chopper-main-rotor';
  rotor.position.y = 0.85;
  const hub = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.18, 8), 0xa9bbb5, 'chopper-rotor-hub');
  const bladeA = mesh(new THREE.BoxGeometry(5.6, 0.035, 0.13), 0x121a1d, 'chopper-rotor-blade-a');
  const bladeB = mesh(new THREE.BoxGeometry(0.13, 0.035, 5.6), 0x121a1d, 'chopper-rotor-blade-b');
  rotor.add(hub, bladeA, bladeB);
  const tailRotor = new THREE.Group();
  tailRotor.name = 'chopper-tail-rotor';
  tailRotor.position.set(0.12, 0.42, 3.05);
  tailRotor.rotation.z = Math.PI / 2;
  tailRotor.add(
    mesh(new THREE.BoxGeometry(0.8, 0.025, 0.07), 0x121a1d, 'chopper-tail-rotor-blade-a'),
    mesh(new THREE.BoxGeometry(0.07, 0.025, 0.8), 0x121a1d, 'chopper-tail-rotor-blade-b'),
  );
  const skids = [-1, 1].map((side) => {
    const skid = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.15, 6), 0x778580, `chopper-skid-${side}`);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(side * 0.58, -0.67, 0.15);
    return skid;
  });
  root.add(fuselage, canopy, glareshield, tail, fin, gun, gunMuzzle, cameraSocket, cockpit, rotor, tailRotor, ...skids);
  root.userData.forwardAxis = [0, 0, -1];
  root.userData.audioSemanticIds = ['chopper-low-loop', 'chopper-gun-report'];
  root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
  root.userData.presentationSource = 'procedural-non-release-fallback';
  root.scale.setScalar(0.82);
  return Object.freeze({ root, rotor, target: new THREE.Vector3(), mixers: Object.freeze([]), authored: false });
}

function buildProceduralAircraftFallback(variant: SupportAircraftVariant = 'care'): PresentedEntity {
  const root = new THREE.Group();
  root.name = variant === 'care' ? 'pass65-care-package-aircraft' : 'pass65-carpet-bomber-aircraft';
  root.userData.pass65KillstreakPresentation = true;
  root.userData.presentationSource = 'procedural-non-release-fallback';
  root.userData.presentationFamily = variant;
  const fuselage = mesh(new THREE.CapsuleGeometry(0.52, 3.6, 6, 12), 0x34464a, 'care-aircraft-fuselage');
  fuselage.rotation.x = Math.PI / 2;
  const nose = mesh(new THREE.SphereGeometry(0.49, 12, 8), 0x64787a, 'care-aircraft-nose');
  nose.scale.set(0.86, 0.74, 1.18);
  nose.position.z = -2.05;
  const wing = mesh(new THREE.BoxGeometry(5.8, 0.11, 1.05), 0x26383c, 'care-aircraft-main-wing');
  wing.position.z = 0.1;
  const tailWing = mesh(new THREE.BoxGeometry(2.2, 0.08, 0.52), 0x26383c, 'care-aircraft-tail-wing');
  tailWing.position.z = 2.05;
  const tailFin = mesh(new THREE.BoxGeometry(0.1, 0.82, 0.72), 0xd5b84d, 'care-aircraft-tail-fin');
  tailFin.position.set(0, 0.42, 2.15);
  const cargoLight = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0x7fe6e0, 'care-aircraft-cargo-light');
  cargoLight.position.set(0, -0.45, -0.15);
  const cargoSocket = presentationSocket('care-aircraft-cargo-socket', [0, -0.48, -0.12]);
  const forwardSocket = presentationSocket('care-aircraft-forward-socket', [0, 0, -2.6]);
  root.add(fuselage, nose, wing, tailWing, tailFin, cargoLight, cargoSocket, forwardSocket);
  root.userData.forwardAxis = [0, 0, -1];
  root.scale.setScalar(0.9);
  return Object.freeze({ root, rotor: null, target: new THREE.Vector3(), mixers: Object.freeze([]), authored: false });
}

function buildDrone(mode: 'piloted' | 'swarm' | null): PresentedEntity {
  if (hunterDroneTemplate && hunterDroneLoadState === 'ready') {
    const root = hunterDroneTemplate.clone(true);
    root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
    root.scale.setScalar(HUNTER_DRONE_TARGET_MAX_DIMENSION / Math.max(0.001, hunterDroneSourceMaxDimension));
    root.userData.pass65KillstreakPresentation = true;
    root.userData.authoredHunterDrone = true;
    root.userData.presentationFamilyId = DRONE_PRESENTATION_FAMILY_ID;
    root.userData.gunProfileId = DRONE_GUN_PROFILE_ID;
    root.userData.forwardAxis = [0, 0, -1];
    root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
    markSharedPresentationAsset(root);
    const mixer = new THREE.AnimationMixer(root);
    for (const clipName of HUNTER_DRONE_LOOP_ACTIONS) {
      const clip = hunterDroneAnimations.find((candidate) => candidate.name === clipName);
      if (clip) mixer.clipAction(clip).play();
    }
    return Object.freeze({ root, rotor: null, target: new THREE.Vector3(), mixers: Object.freeze([mixer]), authored: true });
  }
  const root = new THREE.Group();
  root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
  root.userData.pass65KillstreakPresentation = true;
  root.userData.presentationFamilyId = DRONE_PRESENTATION_FAMILY_ID;
  root.userData.gunProfileId = DRONE_GUN_PROFILE_ID;
  root.userData.forwardAxis = [0, 0, -1];
  root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
  // Standalone and swarm drones deliberately share the same machine family;
  // control mode changes no geometry, gun profile, socket, or forward axis.
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.42, 5, 12), 0x28383d, 'drone-body');
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.18, 0.82, 1);
  const eye = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0xff5f4b, 'drone-optic');
  eye.position.set(0, 0.035, -0.43);
  const gun = new THREE.Group();
  gun.name = 'drone-mounted-gun';
  gun.position.set(0, -0.19, -0.12);
  const gunReceiver = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), 0x11191c, 'drone-gun-receiver');
  const gunBarrel = mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.42, 10), 0x090d0f, 'drone-gun-barrel');
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.z = -0.3;
  gun.add(gunReceiver, gunBarrel);
  const muzzleSocket = presentationSocket('drone-gun-muzzle-socket', [0, -0.19, -0.56]);
  const cameraSocket = presentationSocket('drone-first-person-camera-socket', [0, 0.035, -0.34]);
  const rotor = new THREE.Group();
  rotor.name = 'drone-rotors';
  for (const x of [-0.42, 0.42]) for (const z of [-0.34, 0.34]) {
    const arm = mesh(new THREE.BoxGeometry(0.5, 0.035, 0.04), 0x172126, 'drone-arm');
    arm.position.set(x * 0.55, 0, z * 0.55);
    arm.rotation.y = Math.atan2(z, x);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.014, 12), material(0x0d1417, { transparent: true, opacity: 0.72 }));
    disc.name = 'drone-rotor-disc';
    disc.position.set(x, 0.08, z);
    rotor.add(arm, disc);
  }
  root.add(body, eye, gun, muzzleSocket, cameraSocket, rotor);
  root.userData.presentationSource = 'procedural-non-release-fallback';
  return Object.freeze({ root, rotor, target: new THREE.Vector3(), mixers: Object.freeze([]), authored: false });
}

function buildProceduralCareCrateFallback(): PresentedEntity {
  const root = new THREE.Group();
  root.name = 'pass65-care-package';
  root.userData.pass65KillstreakPresentation = true;
  root.userData.interactable = true;
  root.userData.interactionPrompt = 'F TO COLLECT KILLSTREAK';
  root.userData.presentationSource = 'procedural-non-release-fallback';
  const crate = mesh(new THREE.BoxGeometry(1.05, 0.75, 1.05), 0x4e604d, 'care-package-crate');
  crate.userData.interactable = true;
  crate.userData.interactionPrompt = 'F TO COLLECT KILLSTREAK';
  const straps = mesh(new THREE.BoxGeometry(1.1, 0.79, 0.12), 0xe0b94f, 'care-package-straps');
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.45, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), material(0xd7dad0, { transparent: true, opacity: 0.82 }));
  canopy.name = 'care-package-parachute';
  canopy.position.y = 2.4;
  canopy.scale.y = 0.45;
  root.add(crate, straps, canopy);
  return Object.freeze({ root, rotor: canopy, target: new THREE.Vector3(), mixers: Object.freeze([]), authored: false });
}

function createPresentedEntity(entity: KillstreakEntitySnapshot): PresentedEntity {
  if (entity.kind === 'aircraft') {
    const variant = supportAircraftPresentationVariant(entity.id);
    return variant ? buildAuthoredSupportVehicle(variant) ?? buildProceduralAircraftFallback(variant) : buildProceduralAircraftFallback();
  }
  if (entity.kind === 'chopper') return buildAuthoredSupportVehicle('chopper') ?? buildProceduralChopperFallback();
  if (entity.kind === 'drone') return buildDrone(entity.mode);
  return buildAuthoredSupportVehicle('crate') ?? buildProceduralCareCrateFallback();
}

function buildDroneSensorSilhouette(index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `piloted-drone-hostile-sensor-${index + 1}`;
  root.userData.presentationOnly = true;
  const sensorMaterial = new THREE.MeshBasicMaterial({
    name: 'piloted-drone-hostile-through-wall',
    color: 0xff674f,
    transparent: true,
    opacity: 0.62,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const part = (name: string, geometry: THREE.BufferGeometry, position: readonly [number, number, number]) => {
    const result = new THREE.Mesh(geometry, sensorMaterial);
    result.name = name;
    result.position.set(...position);
    result.renderOrder = 90;
    root.add(result);
  };
  part('drone-sensor-head', new THREE.SphereGeometry(0.2, 9, 6), [0, 0.68, 0]);
  part('drone-sensor-torso', new THREE.CapsuleGeometry(0.27, 0.48, 3, 8), [0, 0.18, 0]);
  part('drone-sensor-leg-left', new THREE.CapsuleGeometry(0.1, 0.56, 2, 6), [-0.14, -0.51, 0]);
  part('drone-sensor-leg-right', new THREE.CapsuleGeometry(0.1, 0.56, 2, 6), [0.14, -0.51, 0]);
  root.visible = false;
  return root;
}

const disabledPlacementMarkerRaycast: THREE.Object3D['raycast'] = () => undefined;

function placementMarkerMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xff253f,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function buildPlacementMarker(marker: KillstreakPlacementMarkerSnapshot): THREE.Group {
  const root = new THREE.Group();
  root.name = `support-placement-${marker.shape}`;
  root.userData.presentationOnly = true;
  root.userData.markerId = marker.id;
  root.userData.activationId = marker.activationId;
  root.userData.source = marker.source;
  root.userData.audience = marker.audience;
  root.userData.presentationPolicy = 'depth-tested-nonblocking-world-telegraph';
  root.raycast = disabledPlacementMarkerRaycast;
  if (marker.shape === 'ground-x') {
    root.position.fromArray(marker.anchor);
    root.position.y += 0.055;
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.035, 0.34), placementMarkerMaterial(0.88));
      bar.name = 'support-target-x-bar';
      bar.rotation.y = angle;
      bar.renderOrder = 18;
      bar.raycast = disabledPlacementMarkerRaycast;
      root.add(bar);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.68, 48), placementMarkerMaterial(0.58));
    ring.name = 'support-target-x-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 18;
    ring.raycast = disabledPlacementMarkerRaycast;
    root.add(ring);
  } else if (marker.pathStart && marker.pathEnd) {
    const start = new THREE.Vector3(...marker.pathStart);
    const end = new THREE.Vector3(...marker.pathEnd);
    const delta = end.clone().sub(start);
    const length = Math.max(0.1, Math.hypot(delta.x, delta.z));
    root.position.copy(start).lerp(end, 0.5);
    root.position.y = marker.anchor[1] + 0.065;
    root.rotation.y = -Math.atan2(delta.z, delta.x);
    const corridorWidthM = Math.max(0.2, (marker.halfWidthM ?? 0.1) * 2);
    root.userData.halfWidthM = marker.halfWidthM;
    const corridor = new THREE.Mesh(new THREE.BoxGeometry(length, 0.025, corridorWidthM), placementMarkerMaterial(0.1));
    corridor.name = 'carpet-bomber-flight-corridor';
    corridor.renderOrder = 17;
    corridor.raycast = disabledPlacementMarkerRaycast;
    const centre = new THREE.Mesh(new THREE.BoxGeometry(length, 0.045, 0.18), placementMarkerMaterial(0.84));
    centre.name = 'carpet-bomber-flight-centreline';
    centre.renderOrder = 18;
    centre.raycast = disabledPlacementMarkerRaycast;
    const railWidth = Math.min(0.2, corridorWidthM * 0.08);
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, railWidth), placementMarkerMaterial(0.66));
    leftRail.name = 'carpet-bomber-flight-corridor-left-edge';
    leftRail.position.z = -(corridorWidthM - railWidth) * 0.5;
    leftRail.renderOrder = 18;
    leftRail.raycast = disabledPlacementMarkerRaycast;
    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.04, railWidth), placementMarkerMaterial(0.66));
    rightRail.name = 'carpet-bomber-flight-corridor-right-edge';
    rightRail.position.z = (corridorWidthM - railWidth) * 0.5;
    rightRail.renderOrder = 18;
    rightRail.raycast = disabledPlacementMarkerRaycast;
    root.add(corridor, centre, leftRail, rightRail);
  }
  return root;
}

function disposeRoot(root: THREE.Object3D): void {
  root.removeFromParent();
  if (root.userData.authoredSharedAsset === true) return;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) entry.dispose();
  });
}

function hashString(seed: number, value: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function impactSeed(impact: KillstreakImpactEvent): number {
  let seed = hashString(0x811c9dc5, impact.activationId);
  seed = hashString(seed, impact.source);
  seed ^= impact.ordinal >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d);
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b);
  return (seed ^ (seed >>> 16)) >>> 0;
}

function deterministicUnit(seed: number, lane: number): number {
  let value = (seed + Math.imul(lane + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function createPooledImpactFlash(index: number): PooledImpactFlash {
  const inactiveName = `pass65-impact-flash-pool-${index + 1}`;
  const root = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffb14c,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  root.name = inactiveName;
  root.visible = false;
  root.userData.presentationOnly = true;
  root.userData.poolSlot = index;
  return { root, inactiveName, active: false, createdAtMs: 0, expiresAtMs: 0, baseRadius: 0, maximumOpacity: 0 };
}

function createPooledBombShell(index: number): PooledBombShell {
  const inactiveName = `pass65-bomb-shell-pool-${index + 1}`;
  const root = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.45, 8),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.4, depthWrite: true }),
  );
  root.name = inactiveName;
  root.visible = false;
  root.castShadow = true;
  root.rotation.x = Math.PI / 2;
  root.userData.presentationOnly = true;
  root.userData.poolSlot = index;
  return {
    root,
    inactiveName,
    impactPosition: new THREE.Vector3(),
    active: false,
    startY: 0,
    createdAtMs: 0,
    impactAtMs: 0,
  };
}

function createPooledEmber(index: number): PooledEmber {
  const inactiveName = `pass65-ember-pool-${index + 1}`;
  const root = new THREE.Mesh(
    new THREE.SphereGeometry(1, 5, 4),
    new THREE.MeshBasicMaterial({
      color: 0xff5c1a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  root.name = inactiveName;
  root.visible = false;
  root.userData.presentationOnly = true;
  root.userData.poolSlot = index;
  return {
    root,
    inactiveName,
    origin: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    active: false,
    radius: 0,
    createdAtMs: 0,
    expiresAtMs: 0,
  };
}

function countActive(pool: readonly { active: boolean }[]): number {
  let count = 0;
  for (const entry of pool) if (entry.active) count += 1;
  return count;
}

function firstInactive<T extends { active: boolean }>(pool: readonly T[]): T | null {
  for (const entry of pool) if (!entry.active) return entry;
  return null;
}

export class KillstreakPresentation {
  readonly root = new THREE.Group();
  private readonly entities = new Map<string, PresentedEntity>();
  private readonly impactFlashPoolRoot = new THREE.Group();
  private readonly bombShellPoolRoot = new THREE.Group();
  private readonly emberPoolRoot = new THREE.Group();
  private readonly impactFlashPool = Array.from({ length: MAX_IMPACT_FLASHES }, (_, index) => createPooledImpactFlash(index));
  private readonly bombShellPool = Array.from({ length: MAX_BOMB_SHELLS }, (_, index) => createPooledBombShell(index));
  private readonly emberPool = Array.from({ length: MAX_EMBER_PARTICLES }, (_, index) => createPooledEmber(index));
  private readonly prewarmed: PresentedEntity[] = [];
  private readonly entityPools = new Map<PresentedEntityPoolKey, PresentedEntity[]>();
  private readonly swarmInstanceBatches: SwarmInstanceBatch[] = [];
  private readonly sensorRoot = new THREE.Group();
  private readonly sensorSilhouettes: THREE.Group[];
  private visibleSensorContacts = 0;
  private firstPersonEntityId: string | null = null;
  private disposed = false;
  private readonly placementMarkers = new Map<string, PresentedPlacementMarker>();
  private readonly locallyExpiredMarkerRevisions = new Map<string, number>();
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;
  private gpuPrewarmActive = false;
  private swarmOverlapAdmission: {
    key: string;
    admittedInstances: number;
    admittedBatches: number;
    requiredCompletionSequence: number;
  } | null = null;
  private disposalFinalized = false;

  constructor(
    scene: THREE.Scene,
    private readonly retireRoot: KillstreakPresentationRetireRoot = disposeRoot,
    private readonly useStorageSwarmMatrices = false,
  ) {
    this.root.name = 'pass65-killstreak-presentations';
    this.root.userData.presentationOnly = true;
    scene.add(this.root);
    this.impactFlashPoolRoot.name = 'pass65-impact-flash-pool';
    this.bombShellPoolRoot.name = 'pass65-bomb-shell-pool';
    this.emberPoolRoot.name = 'pass65-ember-pool';
    for (const poolRoot of [this.impactFlashPoolRoot, this.bombShellPoolRoot, this.emberPoolRoot]) {
      poolRoot.userData.presentationOnly = true;
      this.root.add(poolRoot);
    }
    this.impactFlashPoolRoot.add(...this.impactFlashPool.map((entry) => entry.root));
    this.bombShellPoolRoot.add(...this.bombShellPool.map((entry) => entry.root));
    this.emberPoolRoot.add(...this.emberPool.map((entry) => entry.root));
    // Prewarm the complete 24-drone swarm outside combat. The reported freeze
    // occurred when one snapshot synchronously cloned every drone on the
    // activation frame; pooled roots make that path allocation-free.
    this.installPrewarmedVocabulary();
    this.sensorRoot.name = 'piloted-drone-through-wall-sensor';
    this.sensorRoot.userData.presentationOnly = true;
    this.sensorSilhouettes = Array.from({ length: MAX_SENSOR_CONTACTS }, (_, index) => buildDroneSensorSilhouette(index));
    this.sensorRoot.add(...this.sensorSilhouettes);
    this.root.add(this.sensorRoot);
  }

  private installPrewarmedVocabulary(): void {
    const capacities: readonly [PresentedEntityPoolKey, number][] = [
      ['chopper', 1],
      ['care-aircraft', 1],
      ['carpet-aircraft', 1],
      ['piloted-drone', 1],
      ['swarm-drone', 24],
      ['care-crate', 1],
    ];
    for (const [key, capacity] of capacities) {
      const pool: PresentedEntity[] = [];
      for (let index = 0; index < capacity; index += 1) {
        const entry = buildPresentedEntityForPool(key);
        entry.root.userData.poolActiveName = entry.root.name;
        entry.root.userData.presentationPoolKey = key;
        entry.root.userData.presentationPoolIndex = index;
        entry.root.userData.presentationPoolInUse = false;
        entry.root.name = `prewarmed-${key}-${index + 1}`;
        entry.root.visible = false;
        pool.push(entry);
        this.prewarmed.push(entry);
        this.root.add(entry.root);
      }
      this.entityPools.set(key, pool);
    }
    for (const entry of this.prewarmed) {
      entry.root.userData.prewarmed = true;
    }
    this.installSwarmInstancing();
  }

  private installSwarmInstancing(): void {
    const pool = this.entityPools.get('swarm-drone') ?? [];
    const animatedTargetNames = new Set(activeSwarmAnimationTargetNames());
    // Procedural non-release fallback drones rotate this authored group
    // directly rather than through an AnimationClip.
    for (const entry of pool) {
      if (!entry.authored && entry.rotor?.name) animatedTargetNames.add(entry.rotor.name);
    }
    const sourceMeshes = pool.map((entry) => {
      const meshes: THREE.Mesh[] = [];
      entry.root.traverse((node) => {
        if (node instanceof THREE.Mesh && !(node instanceof THREE.InstancedMesh)) meshes.push(node);
      });
      return meshes;
    });
    const primitiveCount = sourceMeshes[0]?.length ?? 0;
    if (primitiveCount === 0 || sourceMeshes.some((meshes) => meshes.length !== primitiveCount)) return;
    for (const entry of pool) entry.root.updateWorldMatrix(true, true);

    const initialMatrix = new THREE.Matrix4();
    const addBatch = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material | THREE.Material[],
      sources: readonly THREE.Object3D[],
      staticLocalMatrices: readonly THREE.Matrix4[] | null,
      ownsGeometry: boolean,
      representative: THREE.Mesh,
    ): void => {
      const instanced = new THREE.InstancedMesh(geometry, material, pool.length);
      if (this.useStorageSwarmMatrices) {
        // Small InstancedMesh sets default to a per-draw uniform array in
        // Three r185. A live 24-drone swarm updates thirteen such arrays every
        // frame. The isolated first-activation benchmark implicated that path;
        // WebGPU storage attributes keep the same bounded CPU update contract
        // without its per-draw uniform churn. WebGL retains Three's ordinary
        // InstancedBufferAttribute path.
        instanced.instanceMatrix = new StorageInstancedBufferAttribute(pool.length, 16);
      }
      instanced.name = `pass65-swarm-instanced-batch-${this.swarmInstanceBatches.length + 1}`;
      instanced.userData.presentationOnly = true;
      instanced.userData.swarmInstancedPresentation = true;
      // These small airborne drones never touch a readable receiver shadow and
      // should not sample the arena's seven-light shadow rig 24 times per batch.
      // Keeping their authored PBR material while removing irrelevant shadow
      // work preserves silhouette/lighting and stabilizes legal support overlap.
      instanced.castShadow = false;
      instanced.receiveShadow = false;
      instanced.userData.airborneShadowPolicy = 'unshadowed-small-support-lod';
      instanced.renderOrder = representative.renderOrder;
      instanced.frustumCulled = false;
      instanced.raycast = () => undefined;
      // Storage attributes are version-gated. DynamicDrawUsage would make
      // Three upload the matrix storage again for every render/shadow pass.
      if (!this.useStorageSwarmMatrices) instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let index = 0; index < pool.length; index += 1) {
        initialMatrix.makeTranslation((index % 6 - 2.5) * 2.4, Math.floor(index / 6) * 1.8, 0);
        instanced.setMatrixAt(index, initialMatrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
      instanced.count = pool.length;
      instanced.visible = false;
      this.root.add(instanced);
      this.swarmInstanceBatches.push(Object.freeze({
        root: instanced,
        sources: Object.freeze(sources),
        staticLocalMatrices: staticLocalMatrices ? Object.freeze(staticLocalMatrices) : null,
        ownsGeometry,
      }));
    };

    const staticGroups = new Map<string, number[]>();
    const dynamicGroups = new Map<string, Readonly<{ targetName: string; primitiveIndices: number[] }>>();
    const individualIndices: number[] = [];
    for (let primitiveIndex = 0; primitiveIndex < primitiveCount; primitiveIndex += 1) {
      const sources = sourceMeshes.map((meshes) => meshes[primitiveIndex]!);
      const animatedAncestors = sources.map((source, index) => (
        animatedSwarmAncestor(source, pool[index]!.root, animatedTargetNames)
      ));
      const targetName = animatedAncestors[0]?.name ?? null;
      const mergeKey = swarmStaticMergeKey(sources[0]!);
      if (targetName && mergeKey && animatedAncestors.every((ancestor) => ancestor?.name === targetName)) {
        const key = `${targetName}|${mergeKey}`;
        const group = dynamicGroups.get(key) ?? { targetName, primitiveIndices: [] };
        group.primitiveIndices.push(primitiveIndex);
        dynamicGroups.set(key, group);
      } else if (animatedAncestors.some(Boolean) || !mergeKey) {
        individualIndices.push(primitiveIndex);
      } else {
        const indices = staticGroups.get(mergeKey) ?? [];
        indices.push(primitiveIndex);
        staticGroups.set(mergeKey, indices);
      }
    }

    const mergeBatch = (
      primitiveIndices: readonly number[],
      anchors: readonly THREE.Object3D[],
    ): boolean => {
      if (primitiveIndices.length < 2 || anchors.length !== pool.length) return false;
      const representative = sourceMeshes[0]![primitiveIndices[0]!]!;
      const anchorInverse = new THREE.Matrix4().copy(anchors[0]!.matrixWorld).invert();
      const transformed = primitiveIndices.map((primitiveIndex) => {
        const source = sourceMeshes[0]![primitiveIndex]!;
        const localMatrix = new THREE.Matrix4().multiplyMatrices(anchorInverse, source.matrixWorld);
        return source.geometry.clone().applyMatrix4(localMatrix);
      });
      const merged = mergeGeometries(transformed, false);
      for (const geometry of transformed) geometry.dispose();
      if (!merged) return false;
      addBatch(
        merged,
        representative.material,
        anchors,
        anchors[0] === pool[0]!.root ? pool.map(() => new THREE.Matrix4()) : null,
        true,
        representative,
      );
      return true;
    };

    const rootAnchors = pool.map((entry) => entry.root);
    for (const primitiveIndices of staticGroups.values()) {
      if (!mergeBatch(primitiveIndices, rootAnchors)) individualIndices.push(...primitiveIndices);
    }
    for (const group of dynamicGroups.values()) {
      const anchors = pool.map((entry) => entry.root.getObjectByName(group.targetName)).filter((entry): entry is THREE.Object3D => Boolean(entry));
      if (!mergeBatch(group.primitiveIndices, anchors)) individualIndices.push(...group.primitiveIndices);
    }

    for (const primitiveIndex of individualIndices) {
      const sources = sourceMeshes.map((meshes) => meshes[primitiveIndex]!);
      const representative = sources[0]!;
      const staticLocalMatrices = sources.some((source, index) => (
        animatedSwarmAncestor(source, pool[index]!.root, animatedTargetNames)
      ))
        ? null
        : sources.map((source, index) => (
          new THREE.Matrix4().copy(pool[index]!.root.matrixWorld).invert().multiply(source.matrixWorld)
        ));
      addBatch(
        representative.geometry,
        representative.material,
        sources,
        staticLocalMatrices,
        false,
        representative,
      );
    }
    for (const meshes of sourceMeshes) {
      for (const source of meshes) {
        source.visible = false;
        source.castShadow = false;
        source.userData.swarmInstanceSource = true;
      }
    }
  }

  private disposeSwarmInstancing(): void {
    for (const batch of this.swarmInstanceBatches) {
      batch.root.removeFromParent();
      batch.root.dispose();
      if (batch.ownsGeometry) batch.root.geometry.dispose();
    }
    this.swarmInstanceBatches.length = 0;
  }

  private syncSwarmInstancing(
    maximumVisibleInstances = Number.POSITIVE_INFINITY,
    maximumVisibleBatches = Number.POSITIVE_INFINITY,
  ): void {
    if (this.swarmInstanceBatches.length === 0) return;
    const active = [...this.entities.values()].filter((entry) => (
      entry.root.userData.presentationPoolKey === 'swarm-drone'
    )).slice(0, maximumVisibleInstances);
    this.root.updateWorldMatrix(true, false);
    const inverseRoot = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const instanceMatrix = new THREE.Matrix4();
    const sourceWorldMatrix = new THREE.Matrix4();
    for (const entry of active) entry.root.updateWorldMatrix(true, false);
    for (const [batchIndex, batch] of this.swarmInstanceBatches.entries()) {
      for (const [instanceIndex, entry] of active.entries()) {
        const poolIndex = Number(entry.root.userData.presentationPoolIndex);
        const source = Number.isInteger(poolIndex) ? batch.sources[poolIndex] : undefined;
        if (!source) continue;
        const staticLocalMatrix = batch.staticLocalMatrices?.[poolIndex];
        if (staticLocalMatrix) {
          sourceWorldMatrix.multiplyMatrices(entry.root.matrixWorld, staticLocalMatrix);
        } else {
          source.updateWorldMatrix(true, false);
          sourceWorldMatrix.copy(source.matrixWorld);
        }
        instanceMatrix.multiplyMatrices(inverseRoot, sourceWorldMatrix);
        batch.root.setMatrixAt(instanceIndex, instanceMatrix);
      }
      const batchAdmitted = batchIndex < maximumVisibleBatches;
      batch.root.count = batchAdmitted ? active.length : 0;
      batch.root.visible = batchAdmitted && active.length > 0;
      batch.root.instanceMatrix.needsUpdate = true;
    }
  }

  prewarmAuthoredAssets(): void {
    if (this.disposed) throw new Error('Cannot rebuild a disposed killstreak presentation pool');
    if (this.gpuPrewarmPromise) throw new Error('Cannot rebuild killstreak presentation assets during GPU prewarm');
    if (this.entities.size > 0) return;
    this.gpuPrewarmGeneration = -1;
    this.disposeSwarmInstancing();
    for (const entry of this.prewarmed) this.retireRoot(entry.root);
    this.prewarmed.length = 0;
    this.entityPools.clear();
    this.installPrewarmedVocabulary();
  }

  /**
   * Uploads and compiles every bounded pooled presentation family while the
   * deployment surface still owns the screen. CPU allocation alone is not a
   * WebGPU prewarm: invisible Object3D trees are skipped by Three's compiler
   * and otherwise initialize on the first live support activation.
   */
  async prewarm(runtime: PresentationPrewarmRuntime, camera: THREE.Camera, sceneGeneration = 0): Promise<void> {
    if (this.disposed) throw new Error('Cannot prewarm a disposed killstreak presentation');
    if (this.gpuPrewarmGeneration === sceneGeneration) return;
    if (this.gpuPrewarmPromise) return this.gpuPrewarmPromise;
    this.gpuPrewarmActive = true;
    const operation = this.performGpuPrewarm(runtime, camera, sceneGeneration);
    this.gpuPrewarmPromise = operation;
    try {
      await operation;
    } finally {
      if (this.gpuPrewarmPromise === operation) this.gpuPrewarmPromise = null;
      this.gpuPrewarmActive = false;
    }
  }

  private async performGpuPrewarm(
    runtime: PresentationPrewarmRuntime,
    camera: THREE.Camera,
    sceneGeneration: number,
  ): Promise<void> {
    const parentScene = this.root.parent;
    if (!(parentScene instanceof THREE.Scene)) {
      throw new Error('Killstreak presentation must be attached to one scene before prewarm');
    }

    const markerVocabulary: readonly KillstreakPlacementMarkerSnapshot[] = [
      {
        id: 'prewarm-care-package-ground-x', activationId: 'prewarm-care-package', source: 'care-package',
        shape: 'ground-x', ownerId: 'prewarm', team: 0, audience: 'all-combatants', anchor: [0, 0, 0],
        pathStart: null, pathEnd: null, halfWidthM: null, expiresInMs: 1,
      },
      {
        id: 'prewarm-carpet-bomber-corridor', activationId: 'prewarm-carpet-bomber', source: 'carpet-bomber',
        shape: 'corridor', ownerId: 'prewarm', team: 0, audience: 'owner-only', anchor: [0, 0, 0],
        pathStart: [-8, 0, 0], pathEnd: [8, 0, 0], halfWidthM: 2.5, expiresInMs: 1,
      },
    ];
    const stagedMarkerRoots = markerVocabulary.map((marker) => {
      const markerRoot = buildPlacementMarker(marker);
      markerRoot.name = `prewarmed-${markerRoot.name}`;
      this.root.add(markerRoot);
      return markerRoot;
    });

    // Three r185 owns per-Object3D render bindings even when authored clones
    // share geometry and materials. Submit every bounded instance, including
    // all 24 swarm drones, before any of them can enter a live frame. Families
    // are split across fenced batches so one hidden warm-up frame cannot become
    // a giant GPU spike of its own.
    const entityRoots = [
      ...[...this.entityPools.entries()].flatMap(([key, pool]) => (
        key === 'swarm-drone' ? [] : pool.map((entry) => entry.root)
      )),
      ...this.swarmInstanceBatches.map((batch) => batch.root),
    ];
    const effectRoots: THREE.Object3D[] = [
      ...this.impactFlashPool.map((entry) => entry.root),
      ...this.bombShellPool.map((entry) => entry.root),
      ...this.emberPool.map((entry) => entry.root),
    ];
    const overlayRoots: THREE.Object3D[] = [...this.sensorSilhouettes, ...stagedMarkerRoots];
    const stagedBatches = [entityRoots, effectRoots, overlayRoots].filter((batch) => batch.length > 0);
    const stagedRoots = stagedBatches.flat();
    const liveActivationEntries = [
      ...(this.entityPools.get('chopper') ?? []).slice(0, 1),
      ...(this.entityPools.get('swarm-drone') ?? []),
    ];
    const liveActivationRoots = [
      ...liveActivationEntries.filter((entry) => entry.root.userData.presentationPoolKey === 'chopper').map((entry) => entry.root),
      ...this.swarmInstanceBatches.map((batch) => batch.root),
    ];
    const swarmBatchStates = new Map(this.swarmInstanceBatches.map((batch) => [batch.root, Object.freeze({
      count: batch.root.count,
      matrices: new Float32Array(batch.root.instanceMatrix.array),
    })] as const));
    const originallyHiddenNodes = new Set<THREE.Object3D>();
    const originallyUnculledNodes = new Set<THREE.Object3D>();
    const stagedRootPositions = new Map<THREE.Object3D, THREE.Vector3>();
    const animatedNodeTransforms = new Map<THREE.Object3D, Readonly<{
      position: THREE.Vector3;
      quaternion: THREE.Quaternion;
      scale: THREE.Vector3;
    }>>();
    const lodStates = new Map<THREE.LOD, boolean>();
    const possessedMaterialDepthWrite = new Map<THREE.Material, boolean>();
    const chopperRoot = this.entityPools.get('chopper')?.[0]?.root ?? null;
    const rootVisible = this.root.visible;
    const rootFrustumCulled = this.root.frustumCulled;
    this.root.visible = true;
    this.root.frustumCulled = false;

    for (const stagedRoot of stagedRoots) {
      stagedRootPositions.set(stagedRoot, stagedRoot.position.clone());
      stagedRoot.traverse((node) => {
        const nextVisible = node.userData.staticBatchRendered !== true;
        if (!node.visible) originallyHiddenNodes.add(node);
        if (!node.frustumCulled) originallyUnculledNodes.add(node);
        if (node.userData.supportAnimationTarget === true && !animatedNodeTransforms.has(node)) {
          animatedNodeTransforms.set(node, Object.freeze({
            position: node.position.clone(),
            quaternion: node.quaternion.clone(),
            scale: node.scale.clone(),
          }));
        }
        if (node instanceof THREE.LOD && !lodStates.has(node)) {
          lodStates.set(node, node.autoUpdate);
          node.autoUpdate = false;
        }
        // A retired static source can never re-enter a live presentation; its
        // merged batch is the render authority. Uploading both representations
        // wastes GPU memory and can provoke a post-prewarm driver/GC pause on
        // the first real chopper plus swarm activation.
        node.visible = nextVisible;
        node.frustumCulled = false;
      });
      // Preserve the pool entry's exact authored/gameplay scale. A near-zero
      // transform compiles the shader graph, but it does not exercise the
      // first real support frame's raster, texture and shadow workload on
      // WebGPU. The deployment surface is still opaque while this fenced
      // submission runs, so an exact-scale draw is both invisible to the
      // player and representative of live activation.
      stagedRoot.visible = false;
    }

    camera.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const stageBatchInView = (batch: readonly THREE.Object3D[], distance: number, spacing: number): void => {
      const columns = Math.max(1, Math.ceil(Math.sqrt(batch.length)));
      const rows = Math.max(1, Math.ceil(batch.length / columns));
      for (let index = 0; index < batch.length; index += 1) {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const target = cameraPosition.clone()
          .addScaledVector(forward, distance)
          .addScaledVector(right, (column - (columns - 1) / 2) * spacing)
          .addScaledVector(up, ((rows - 1) / 2 - row) * spacing);
        batch[index]!.position.copy(this.root.worldToLocal(target));
      }
    };

    try {
      // clear() normally makes every inactive swarm batch count=0. A zero-count
      // compile creates shader objects but Three skips the actual instanced draw,
      // leaving the first live 24-drone activation to allocate its backend state.
      // Submit the exact bounded count while the deployment surface is opaque.
      const prewarmInstanceMatrix = new THREE.Matrix4();
      for (const batch of this.swarmInstanceBatches) {
        for (let index = 0; index < 24; index += 1) {
          prewarmInstanceMatrix.makeTranslation((index % 6 - 2.5) * 2.4, Math.floor(index / 6) * 1.8, 0);
          batch.root.setMatrixAt(index, prewarmInstanceMatrix);
        }
        batch.root.count = 24;
        batch.root.instanceMatrix.needsUpdate = true;
      }
      for (let batchIndex = 0; batchIndex < stagedBatches.length; batchIndex += 1) {
        const batch = stagedBatches[batchIndex]!;
        stageBatchInView(batch, 30 + batchIndex * 4, batchIndex === 0 ? 2.5 : 0.9);
        for (const stagedRoot of batch) stagedRoot.visible = true;
        await runtime.compileAndRender(this.root, camera, parentScene);
        for (const stagedRoot of batch) stagedRoot.visible = false;
      }
      // The all-visible vocabulary pass above compiles every LOD and material,
      // but it intentionally disables frustum culling and LOD selection. Three
      // r185 also creates WebGPU render objects and node/bind-group state for
      // the exact live visibility graph. Rehearse the heaviest legal overlap
      // (one chopper plus all 24 swarm drones) with normal culling, LOD updates
      // and animation state while the deployment surface still hides it.
      for (const liveRoot of liveActivationRoots) {
        liveRoot.traverse((node) => {
          node.visible = !originallyHiddenNodes.has(node);
          node.frustumCulled = !originallyUnculledNodes.has(node);
          if (node instanceof THREE.LOD) node.autoUpdate = lodStates.get(node) ?? node.autoUpdate;
        });
        liveRoot.visible = true;
      }
      stageBatchInView(liveActivationRoots, 30, 2.5);
      for (const entry of liveActivationEntries) {
        for (const mixer of entry.mixers) mixer.setTime(0.5);
      }
      camera.updateWorldMatrix(true, false);
      this.root.updateWorldMatrix(true, false);
      for (const liveRoot of liveActivationRoots) {
        liveRoot.traverse((node) => {
          if (node instanceof THREE.LOD) node.update(camera);
        });
      }
      await runtime.compileAndRender(this.root, camera, parentScene);
      for (const liveRoot of liveActivationRoots) liveRoot.visible = false;
      if (chopperRoot) {
        chopperRoot.visible = true;
        chopperRoot.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const cockpitNode = isFirstPersonCockpitNode(chopperRoot, node);
          node.visible = cockpitNode;
          if (!cockpitNode) return;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const entry of materials) {
            if (!possessedMaterialDepthWrite.has(entry)) possessedMaterialDepthWrite.set(entry, entry.depthWrite);
            entry.depthWrite = false;
          }
        });
        await runtime.compileAndRender(this.root, camera, parentScene);
        chopperRoot.visible = false;
      }
      if (!this.disposed) this.gpuPrewarmGeneration = sceneGeneration;
    } finally {
      for (const [batch, state] of swarmBatchStates) {
        batch.instanceMatrix.array.set(state.matrices);
        batch.count = state.count;
        batch.instanceMatrix.needsUpdate = true;
      }
      for (const [material, depthWrite] of possessedMaterialDepthWrite) material.depthWrite = depthWrite;
      for (const [lod, autoUpdate] of lodStates) lod.autoUpdate = autoUpdate;
      for (const stagedRoot of stagedRoots) stagedRoot.traverse((node) => {
        node.visible = !originallyHiddenNodes.has(node);
        node.frustumCulled = !originallyUnculledNodes.has(node);
      });
      for (const [node, transform] of animatedNodeTransforms) {
        node.position.copy(transform.position);
        node.quaternion.copy(transform.quaternion);
        node.scale.copy(transform.scale);
      }
      for (const [stagedRoot, position] of stagedRootPositions) stagedRoot.position.copy(position);
      this.root.visible = rootVisible;
      this.root.frustumCulled = rootFrustumCulled;
      for (const markerRoot of stagedMarkerRoots) this.retireRoot(markerRoot);
    }
  }

  private acquirePresentedEntity(entity: KillstreakEntitySnapshot): PresentedEntity {
    const key = presentedEntityPoolKey(entity);
    const presented = this.entityPools.get(key)?.find((entry) => entry.root.userData.presentationPoolInUse !== true);
    if (!presented) return createPresentedEntity(entity);
    presented.root.userData.presentationPoolInUse = true;
    presented.root.name = String(presented.root.userData.poolActiveName ?? presented.root.name);
    // Swarm source trees drive the animated instance matrices but must never
    // enter renderer traversal themselves. Their 24 authored hierarchies are
    // represented by the bounded InstancedMesh batches above.
    presented.root.visible = key !== 'swarm-drone';
    return presented;
  }

  private releasePresentedEntity(presented: PresentedEntity): void {
    const key = presented.root.userData.presentationPoolKey;
    if (typeof key !== 'string') {
      this.retireRoot(presented.root);
      return;
    }
    setSupportFirstPersonVisibility(presented.root, false);
    presented.root.userData.presentationPoolInUse = false;
    presented.root.name = `prewarmed-${key}`;
    presented.root.visible = false;
    presented.target.set(0, 0, 0);
  }

  private applyFirstPersonVisibility(): void {
    for (const [entityId, presented] of this.entities) {
      if (presented.root.userData.presentationPoolKey === 'swarm-drone') continue;
      if (entityId !== this.firstPersonEntityId) setSupportFirstPersonVisibility(presented.root, false);
    }
    if (!this.firstPersonEntityId) return;
    const possessed = this.entities.get(this.firstPersonEntityId);
    if (possessed) setSupportFirstPersonVisibility(possessed.root, true);
  }

  private deactivateImpactFlash(flash: PooledImpactFlash): void {
    flash.active = false;
    flash.root.visible = false;
    flash.root.name = flash.inactiveName;
    flash.root.material.opacity = 0;
    flash.root.scale.setScalar(1);
  }

  private deactivateBombShell(shell: PooledBombShell): void {
    shell.active = false;
    shell.root.visible = false;
    shell.root.name = shell.inactiveName;
  }

  private deactivateEmber(ember: PooledEmber): void {
    ember.active = false;
    ember.root.visible = false;
    ember.root.name = ember.inactiveName;
    ember.root.material.opacity = 0;
    ember.root.scale.setScalar(1);
  }

  sync(
    snapshot: KillstreakRecipientSnapshot,
    nowMs: number,
    presentationProgress: KillstreakPresentationProgress | null = null,
  ): void {
    const bounded = snapshot.entities.slice(0, MAX_PRESENTED_ENTITIES);
    const liveChoppers = bounded.filter((entity) => entity.kind === 'chopper' && entity.expiresInMs > 0);
    const liveSwarm = bounded.filter((entity) => entity.kind === 'drone' && entity.mode === 'swarm' && entity.expiresInMs > 0);
    let maximumVisibleSwarm = liveSwarm.length;
    let maximumVisibleSwarmBatches = Number.POSITIVE_INFINITY;
    const progressIsUsable = presentationProgress !== null
      && Number.isSafeInteger(presentationProgress.submissionSequence)
      && Number.isSafeInteger(presentationProgress.completedSequence)
      && presentationProgress.submissionSequence >= 0
      && presentationProgress.completedSequence >= 0;
    if (liveChoppers.length > 0 && liveSwarm.length > 0 && progressIsUsable) {
      const key = [...liveChoppers, ...liveSwarm]
        .map((entity) => entity.activationId)
        .filter((activationId, index, values) => values.indexOf(activationId) === index)
        .sort()
        .join('|');
      if (!this.swarmOverlapAdmission || this.swarmOverlapAdmission.key !== key) {
        // The exact full chopper+24-drone visibility edge intermittently stalls
        // Chrome's WebGPU compositor even though each family is smooth alone and
        // the combined pipeline is prewarmed. Keep authority immediate, but
        // admit pooled drone sources and their render batches only after each
        // preceding presentation frontier completes. The complete formation is
        // visible well before its 500ms fire gate.
        this.swarmOverlapAdmission = {
          key,
          admittedInstances: 0,
          admittedBatches: 0,
          requiredCompletionSequence: presentationProgress.submissionSequence + 1,
        };
      } else if (
        (this.swarmOverlapAdmission.admittedInstances < liveSwarm.length
          || this.swarmOverlapAdmission.admittedBatches < this.swarmInstanceBatches.length)
        && presentationProgress.completedSequence >= this.swarmOverlapAdmission.requiredCompletionSequence
      ) {
        this.swarmOverlapAdmission.admittedInstances = Math.min(
          liveSwarm.length,
          this.swarmOverlapAdmission.admittedInstances + 4,
        );
        this.swarmOverlapAdmission.admittedBatches = Math.min(
          this.swarmInstanceBatches.length,
          this.swarmOverlapAdmission.admittedBatches + 2,
        );
        this.swarmOverlapAdmission.requiredCompletionSequence = presentationProgress.submissionSequence + 1;
      }
      maximumVisibleSwarm = Math.min(liveSwarm.length, this.swarmOverlapAdmission.admittedInstances);
      maximumVisibleSwarmBatches = this.swarmOverlapAdmission.admittedBatches;
    } else {
      this.swarmOverlapAdmission = null;
    }
    const admittedSwarmIds = new Set(liveSwarm.slice(0, maximumVisibleSwarm).map((entity) => entity.id));
    const admitted = bounded.filter((entity) => (
      entity.kind !== 'drone' || entity.mode !== 'swarm' || admittedSwarmIds.has(entity.id)
    ));
    const liveIds = new Set(admitted.map((entity) => entity.id));
    for (const [id, presented] of this.entities) {
      if (liveIds.has(id)) continue;
      if (id === this.firstPersonEntityId) setSupportFirstPersonVisibility(presented.root, false);
      this.releasePresentedEntity(presented);
      this.entities.delete(id);
    }
    for (const entity of admitted) {
      let presented = this.entities.get(entity.id);
      if (!presented) {
        presented = this.acquirePresentedEntity(entity);
        this.entities.set(entity.id, presented);
        if (presented.root.parent !== this.root) this.root.add(presented.root);
        presented.root.position.fromArray(entity.position);
      }
      presented.target.fromArray(entity.position);
      presented.root.position.lerp(presented.target, 0.38);
      presented.root.rotation.set(entity.attitude[0], entity.attitude[1], entity.attitude[2], 'YXZ');
      for (const mixer of presented.mixers) mixer.setTime(nowMs / 1_000);
      if (!presented.authored) {
        if (presented.rotor) presented.rotor.rotation.y += entity.kind === 'chopper' ? 0.72 : 1.1;
        const tailRotor = presented.root.getObjectByName('chopper-tail-rotor');
        if (tailRotor) tailRotor.rotation.x += 1.35;
        const firstPersonRotor = presented.root.getObjectByName('chopper-first-person-rotor');
        if (firstPersonRotor) firstPersonRotor.rotation.y += 0.92;
      }
      if (entity.kind === 'care-crate') {
        const parachuteVisible = entity.phase === 'inbound' || entity.phase === 'descending';
        presented.root.traverse((node) => {
          if (node.name === 'care-package-parachute' || node.name === 'care-parachute-lines') {
            node.visible = parachuteVisible;
          }
        });
      }
      presented.root.userData.health = entity.health;
      presented.root.userData.phase = entity.phase;
      presented.root.userData.gunController = entity.gunController;
    }
    this.syncSwarmInstancing(maximumVisibleSwarm, maximumVisibleSwarmBatches);
    this.applyFirstPersonVisibility();
    this.syncSensorContacts(snapshot.sensorContacts);
    this.syncPlacementMarkers(snapshot.placementMarkers, snapshot.revision, nowMs);
    for (const flash of this.impactFlashPool) {
      if (!flash.active) continue;
      const lifetimeMs = flash.expiresAtMs - flash.createdAtMs;
      const remaining = THREE.MathUtils.clamp((flash.expiresAtMs - nowMs) / lifetimeMs, 0, 1);
      flash.root.scale.setScalar(flash.baseRadius * (1 + (1 - remaining) * 2.8));
      flash.root.material.opacity = remaining * flash.maximumOpacity;
      if (remaining > 0) continue;
      this.deactivateImpactFlash(flash);
    }
    for (const ember of this.emberPool) {
      if (!ember.active) continue;
      const elapsed = Math.max(0, nowMs - ember.createdAtMs);
      const lifetime = ember.expiresAtMs - ember.createdAtMs;
      const remaining = THREE.MathUtils.clamp(1 - elapsed / lifetime, 0, 1);
      const elapsedSeconds = elapsed / 1_000;
      ember.root.scale.setScalar(ember.radius * (0.2 + remaining * 0.85));
      ember.root.material.opacity = remaining * 0.85;
      ember.root.position.copy(ember.origin).addScaledVector(ember.velocity, elapsedSeconds);
      ember.root.position.y -= 0.5 * EMBER_GRAVITY_MPS2 * elapsedSeconds * elapsedSeconds;
      if (remaining > 0) continue;
      this.deactivateEmber(ember);
    }
    for (const shell of this.bombShellPool) {
      if (!shell.active) continue;
      const dropDurationMs = Math.max(1, shell.impactAtMs - shell.createdAtMs);
      const progress = THREE.MathUtils.clamp((nowMs - shell.createdAtMs) / dropDurationMs, 0, 1);
      shell.root.position.y = THREE.MathUtils.lerp(shell.startY, shell.impactPosition.y, progress);
      if (progress >= 1) this.deactivateBombShell(shell);
    }
  }

  private syncSensorContacts(contacts: readonly DroneSensorContact[]): void {
    const admitted = contacts.slice(0, MAX_SENSOR_CONTACTS);
    this.visibleSensorContacts = admitted.length;
    for (const [index, silhouette] of this.sensorSilhouettes.entries()) {
      const contact = admitted[index];
      silhouette.visible = contact !== undefined;
      if (!contact) continue;
      silhouette.position.fromArray(contact.position);
      silhouette.userData.contactId = contact.id;
      silhouette.userData.contactLifeId = contact.lifeId;
      silhouette.userData.relation = contact.relation;
      silhouette.userData.throughWall = contact.throughWall;
    }
  }

  private syncPlacementMarkers(
    markers: readonly KillstreakPlacementMarkerSnapshot[],
    snapshotRevision: number,
    nowMs: number,
  ): void {
    for (const [id, presented] of this.placementMarkers) {
      if (nowMs < presented.expiresAtMs) continue;
      this.retireRoot(presented.root);
      this.placementMarkers.delete(id);
      this.locallyExpiredMarkerRevisions.set(id, presented.snapshotRevision);
    }
    const markerIds = new Set(markers.map((marker) => marker.id));
    for (const [id, expiredRevision] of this.locallyExpiredMarkerRevisions) {
      if (!markerIds.has(id) || snapshotRevision > expiredRevision) this.locallyExpiredMarkerRevisions.delete(id);
    }
    const admitted = markers
      .filter((marker) => marker.expiresInMs > 0 && this.locallyExpiredMarkerRevisions.get(marker.id) !== snapshotRevision)
      .slice(0, MAX_PLACEMENT_MARKERS);
    const liveIds = new Set(admitted.map((marker) => marker.id));
    for (const [id, presented] of this.placementMarkers) {
      if (liveIds.has(id)) continue;
      this.retireRoot(presented.root);
      this.placementMarkers.delete(id);
    }
    for (const marker of admitted) {
      const existing = this.placementMarkers.get(marker.id);
      if (existing) {
        existing.snapshot = marker;
        if (existing.snapshotRevision !== snapshotRevision) {
          existing.snapshotRevision = snapshotRevision;
          existing.expiresAtMs = nowMs + marker.expiresInMs;
        }
        continue;
      }
      const root = buildPlacementMarker(marker);
      this.placementMarkers.set(marker.id, {
        root,
        snapshot: marker,
        snapshotRevision,
        expiresAtMs: nowMs + marker.expiresInMs,
      });
      this.root.add(root);
    }
  }

  presentImpacts(impacts: readonly KillstreakImpactEvent[], nowMs: number): void {
    for (const impact of impacts) {
      const isCarpet = impact.source === 'carpet-bomber';
      if (isCarpet && impact.phase === 'drop') {
        const shell = firstInactive(this.bombShellPool);
        if (!shell) continue;
        shell.active = true;
        shell.createdAtMs = nowMs;
        const authoredDropDurationMs = THREE.MathUtils.clamp(
          impact.impactAtMs - impact.atMs,
          1,
          BOMB_SHELL_DROP_DURATION_MS,
        );
        shell.impactAtMs = nowMs + authoredDropDurationMs;
        shell.startY = impact.position[1] + BOMB_SHELL_ALTITUDE;
        shell.impactPosition.set(impact.position[0], impact.position[1] + 0.35, impact.position[2]);
        shell.root.name = 'pass65-carpet-bomb-shell';
        shell.root.position.set(impact.position[0], shell.startY, impact.position[2]);
        shell.root.visible = true;
        continue;
      }
      if (impact.phase !== 'impact') continue;
      const flash = firstInactive(this.impactFlashPool);
      if (!flash) break;
      flash.active = true;
      flash.createdAtMs = nowMs;
      flash.expiresAtMs = nowMs + (isCarpet ? 600 : 420);
      flash.baseRadius = isCarpet ? 1.2 : 0.55;
      flash.maximumOpacity = isCarpet ? 0.9 : 0.8;
      flash.root.name = isCarpet ? 'pass65-carpet-impact-flash-large' : 'pass65-carpet-impact-flash';
      flash.root.position.set(impact.position[0], impact.position[1] + 0.35, impact.position[2]);
      flash.root.scale.setScalar(flash.baseRadius);
      flash.root.material.color.setHex(isCarpet ? 0xff6a1a : 0xffb14c);
      flash.root.material.opacity = flash.maximumOpacity;
      flash.root.visible = true;

      if (isCarpet) {
        const seed = impactSeed(impact);
        for (let particle = 0; particle < EMBERS_PER_CARPET_IMPACT; particle += 1) {
          const ember = firstInactive(this.emberPool);
          if (!ember) break;
          const lane = particle * 5;
          const spreadX = (deterministicUnit(seed, lane) - 0.5) * 2.5;
          const spreadZ = (deterministicUnit(seed, lane + 1) - 0.5) * 2.5;
          const spreadY = deterministicUnit(seed, lane + 2) * 1.2;
          ember.active = true;
          ember.radius = 0.08 + deterministicUnit(seed, lane + 3) * 0.14;
          ember.createdAtMs = nowMs;
          ember.expiresAtMs = nowMs + 700;
          ember.origin.set(
            impact.position[0] + spreadX,
            impact.position[1] + 0.35 + spreadY,
            impact.position[2] + spreadZ,
          );
          ember.velocity.set(spreadX * 3, 3 + deterministicUnit(seed, lane + 4) * 4, spreadZ * 3);
          ember.root.name = 'pass65-carpet-ember';
          ember.root.position.copy(ember.origin);
          ember.root.scale.setScalar(ember.radius * 1.05);
          ember.root.material.color.setHex(particle < 3 ? 0xff5c1a : 0x4a4a4a);
          ember.root.material.opacity = 0.85;
          ember.root.visible = true;
        }
      }
    }
  }

  entityRoot(id: string): THREE.Group | null {
    return this.entities.get(id)?.root ?? null;
  }

  setFirstPersonEntity(id: string | null): void {
    this.firstPersonEntityId = id;
    this.applyFirstPersonVisibility();
  }

  firstPersonCameraAnchor(id: string): THREE.Vector3 | null {
    const root = this.entities.get(id)?.root;
    if (!root) return null;
    const socket = root.getObjectByName('drone-first-person-camera-socket')
      ?? root.getObjectByName('chopper-first-person-camera-socket');
    if (!socket) return null;
    root.updateMatrixWorld(true);
    const anchor = socket.getWorldPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(socket.getWorldQuaternion(new THREE.Quaternion()));
    return anchor.addScaledVector(forward, 0.08);
  }

  alignFirstPersonCockpit(id: string, cameraWorldQuaternion: THREE.Quaternion): void {
    const root = this.entities.get(id)?.root;
    const cockpit = root?.getObjectByName('chopper-first-person-cockpit');
    if (!root || !cockpit) return;
    root.updateWorldMatrix(true, false);
    const inverseParent = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    cockpit.quaternion.copy(inverseParent.multiply(cameraWorldQuaternion));
  }

  telemetry(): KillstreakPresentationTelemetry {
    const markerDetails = [...this.placementMarkers.values()]
      .sort((left, right) => left.snapshot.id.localeCompare(right.snapshot.id))
      .map(({ root, snapshot }): KillstreakPlacementMarkerTelemetry => {
        root.updateWorldMatrix(true, true);
        const worldPosition = root.getWorldPosition(new THREE.Vector3()).toArray();
        const worldBounds = new THREE.Box3().setFromObject(root);
        const meshNames: string[] = [];
        const colourHexes = new Set<string>();
        let depthTest = true;
        let writesDepth = false;
        let maximumOpacity = 0;
        let raycastDisabled = true;
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          meshNames.push(node.name);
          raycastDisabled &&= node.raycast === disabledPlacementMarkerRaycast;
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const entry of materials) {
            if ('color' in entry && entry.color instanceof THREE.Color) colourHexes.add(`#${entry.color.getHexString()}`);
            depthTest &&= entry.depthTest;
            writesDepth ||= entry.depthWrite;
            maximumOpacity = Math.max(maximumOpacity, entry.opacity);
          }
        });
        const corridorLengthM = snapshot.pathStart && snapshot.pathEnd
          ? Math.hypot(snapshot.pathEnd[0] - snapshot.pathStart[0], snapshot.pathEnd[2] - snapshot.pathStart[2])
          : null;
        return Object.freeze({
          id: snapshot.id,
          activationId: snapshot.activationId,
          source: snapshot.source,
          shape: snapshot.shape,
          audience: snapshot.audience,
          ownerId: snapshot.ownerId,
          anchor: Object.freeze([...snapshot.anchor]),
          pathStart: snapshot.pathStart ? Object.freeze([...snapshot.pathStart]) : null,
          pathEnd: snapshot.pathEnd ? Object.freeze([...snapshot.pathEnd]) : null,
          halfWidthM: snapshot.halfWidthM,
          worldPosition: Object.freeze(worldPosition),
          worldBounds: Object.freeze({
            min: Object.freeze(worldBounds.min.toArray()),
            max: Object.freeze(worldBounds.max.toArray()),
          }),
          corridorLengthM,
          meshNames: Object.freeze(meshNames.sort()),
          colourHexes: Object.freeze([...colourHexes].sort()),
          depthTest,
          writesDepth,
          maximumOpacity,
          raycastDisabled,
          visible: root.visible && root.parent !== null,
        });
      });
    const impactFlashes = countActive(this.impactFlashPool);
    const bombShells = countActive(this.bombShellPool);
    const emberParticles = countActive(this.emberPool);
    return Object.freeze({
      entities: this.entities.size,
      impactFlashes,
      bombShells,
      emberParticles,
      sensorContacts: this.visibleSensorContacts,
      placementMarkers: this.placementMarkers.size,
      prewarmed: this.entityPools.size,
      pooledEntityInstances: this.prewarmed.length,
      pooledSwarmDrones: this.entityPools.get('swarm-drone')?.length ?? 0,
      swarmRenderBatches: this.swarmInstanceBatches.length,
      swarmRenderedInstances: this.swarmInstanceBatches[0]?.root.count ?? 0,
      prewarmedAuthoredSupportFamilies: Object.freeze([...new Set(this.prewarmed
        .filter((entry) => entry.root.userData.presentationSource === 'project-original-blender-glb')
        .map((entry) => String(entry.root.userData.presentationFamily)))].sort()),
      markerDetails: Object.freeze(markerDetails),
      bounded: this.entities.size <= MAX_PRESENTED_ENTITIES
        && impactFlashes <= MAX_IMPACT_FLASHES
        && bombShells <= MAX_BOMB_SHELLS
        && emberParticles <= MAX_EMBER_PARTICLES
        && this.visibleSensorContacts <= MAX_SENSOR_CONTACTS
        && this.placementMarkers.size <= MAX_PLACEMENT_MARKERS,
    });
  }

  clear(): void {
    // The match bootstrap loop can call clear() while the async GPU fence is in
    // flight. Preserve the staged exact-count submission until prewarm settles;
    // no live presentation state exists behind the opaque deployment surface.
    if (this.gpuPrewarmActive) return;
    this.swarmOverlapAdmission = null;
    this.setFirstPersonEntity(null);
    for (const presented of this.entities.values()) this.releasePresentedEntity(presented);
    this.entities.clear();
    for (const batch of this.swarmInstanceBatches) {
      batch.root.count = 0;
      batch.root.visible = false;
      batch.root.instanceMatrix.needsUpdate = true;
    }
    for (const flash of this.impactFlashPool) if (flash.active) this.deactivateImpactFlash(flash);
    for (const shell of this.bombShellPool) if (shell.active) this.deactivateBombShell(shell);
    for (const ember of this.emberPool) if (ember.active) this.deactivateEmber(ember);
    this.visibleSensorContacts = 0;
    for (const silhouette of this.sensorSilhouettes) silhouette.visible = false;
    for (const presented of this.placementMarkers.values()) this.retireRoot(presented.root);
    this.placementMarkers.clear();
    this.locallyExpiredMarkerRevisions.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pendingPrewarm = this.gpuPrewarmPromise;
    if (pendingPrewarm) {
      void pendingPrewarm.catch(() => undefined).finally(() => this.finalizeDispose());
      return;
    }
    this.finalizeDispose();
  }

  private finalizeDispose(): void {
    if (this.disposalFinalized) return;
    this.disposalFinalized = true;
    this.clear();
    this.disposeSwarmInstancing();
    for (const entry of this.prewarmed) this.retireRoot(entry.root);
    this.prewarmed.length = 0;
    this.retireRoot(this.sensorRoot);
    this.retireRoot(this.impactFlashPoolRoot);
    this.retireRoot(this.bombShellPoolRoot);
    this.retireRoot(this.emberPoolRoot);
    this.root.removeFromParent();
  }
}
