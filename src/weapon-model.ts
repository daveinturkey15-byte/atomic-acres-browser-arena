import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { yieldBrowserPreparationFrame } from './browser-preparation-scheduler';
import { cloneMeshGeometriesForOwner } from './gpu-resource-ownership';
import { WEAPON_IDS, type WeaponId } from './protocol';

type WeaponAsset = { scene: THREE.Group; clips: THREE.AnimationClip[] };
type PresentationAssetId = WeaponId | 'field-knife';
type ImportedWeaponRuntime = { mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; weapon: PresentationAssetId };
type CachedWeaponAsset = WeaponAsset & { key: string; variant: Pass65WeaponVariant; refs: number; lastUsed: number };

export type Pass65CrossbowVariant = 'first-person' | 'world' | 'drop';
export type Pass65WeaponVariant = Pass65CrossbowVariant;

export const PASS65_AUTHORED_FIREARM_IDS = Object.freeze([
  'carbine', 'smg', 'lmg', 'scattergun', 'sniper', 'railgun', 'pistol', 'magnum', 'machine-pistol',
  'mini-uzi', 'mp5', 'm4a1', 'ak-47', 'minigun', 'm14-ebr', 'slug-shotgun', 'flashlight-pistol',
  'flamethrower', 'flare-gun',
] as const satisfies readonly WeaponId[]);
export type Pass65AuthoredFirearmId = (typeof PASS65_AUTHORED_FIREARM_IDS)[number];

export const PASS65_WEAPON_CACHE_BUDGET = Object.freeze({
  'first-person': 2,
  // Bots cycle the complete canonical arsenal and every corpse can retain its
  // authored drop. Evicting these small source GLBs guarantees a future main-
  // thread decode hitch; clones still retire independently behind GPU fences.
  world: PASS65_AUTHORED_FIREARM_IDS.length,
  drop: PASS65_AUTHORED_FIREARM_IDS.length,
} satisfies Readonly<Record<Pass65WeaponVariant, number>>);

export const PASS65_RUNTIME_WEAPON_CORPUS_BUDGET = Object.freeze({
  variants: Object.freeze(['world', 'drop'] as const),
  assets: (WEAPON_IDS.length + 1) * 2,
  maximumCompressedBytes: 12 * 1024 * 1024,
  // This retained-corpus budget is incremental over the already-required
  // first-person catalog. A separate all-variant ceiling below still accounts
  // for the one canonical PBR Texture set plus every variant's geometry.
  maximumEstimatedDecodedBytes: 128 * 1024 * 1024,
  maximumAllVariantEstimatedDecodedBytes: 160 * 1024 * 1024,
  yieldEveryAssets: 1,
} as const);

const PASS65_CROSSBOW_URLS: Record<Pass65CrossbowVariant, string> = Object.freeze({
  'first-person': './assets/original/models/weapons/pass65-crossbow/pass65-crossbow-fp-lod0.glb',
  world: './assets/original/models/weapons/pass65-crossbow/pass65-crossbow-world-lod0.glb',
  drop: './assets/original/models/weapons/pass65-crossbow/pass65-crossbow-drop-lod0.glb',
});

export const PASS65_FIELD_KNIFE_URLS: Readonly<Record<Pass65WeaponVariant, string>> = Object.freeze({
  'first-person': './assets/original/models/weapons/pass65-field-knife/pass65-field-knife-fp-lod0.glb',
  world: './assets/original/models/weapons/pass65-field-knife/pass65-field-knife-world-lod0.glb',
  drop: './assets/original/models/weapons/pass65-field-knife/pass65-field-knife-drop-lod0.glb',
});

const familyUrls = (id: Pass65AuthoredFirearmId): Readonly<Record<Pass65WeaponVariant, string>> => Object.freeze({
  'first-person': `./assets/original/models/weapons/pass65-firearms/${id}/${id}-fp-lod0.glb`,
  world: `./assets/original/models/weapons/pass65-firearms/${id}/${id}-world-lod0.glb`,
  drop: `./assets/original/models/weapons/pass65-firearms/${id}/${id}-drop-lod0.glb`,
});

export const PASS65_AUTHORED_WEAPON_URLS = Object.freeze(Object.fromEntries(
  PASS65_AUTHORED_FIREARM_IDS.map((id) => [id, familyUrls(id)]),
)) as Readonly<Record<Pass65AuthoredFirearmId, Readonly<Record<Pass65WeaponVariant, string>>>>;

const authoredIdSet = new Set<WeaponId>(PASS65_AUTHORED_FIREARM_IDS);
const cache = new Map<string, CachedWeaponAsset>();
const loading = new Map<string, Promise<void>>();
const pass65CrossbowAssets = new Map<Pass65CrossbowVariant, WeaponAsset>();
const pass65CrossbowLoads = new Map<Pass65CrossbowVariant, Promise<void>>();
const pass65FieldKnifeAssets = new Map<Pass65WeaponVariant, WeaponAsset>();
const pass65FieldKnifeLoads = new Map<Pass65WeaponVariant, Promise<void>>();
let useCounter = 0;
let runtimeCorpusPrewarmPromise: Promise<void> | null = null;
let runtimeCorpusPrewarmProfile: Readonly<{
  requestedAssets: number;
  loadedAssets: number;
  durationMs: number;
  completed: boolean;
  error: string | null;
}> | null = null;

function loader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}

type TextureBinding = Readonly<{
  key: string;
  texture: THREE.Texture;
  assign: (texture: THREE.Texture) => void;
}>;

function textureBindings(asset: WeaponAsset): readonly TextureBinding[] {
  const bindings: TextureBinding[] = [];
  const materials: THREE.Material[] = [];
  const seenMaterials = new Set<THREE.Material>();
  asset.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) {
      if (seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      materials.push(material);
    }
  });
  for (const material of materials) {
    const writable = material as unknown as Record<string, unknown>;
    for (const [property, value] of Object.entries(material).sort(([left], [right]) => left.localeCompare(right))) {
      if (!(value instanceof THREE.Texture)) continue;
      bindings.push(Object.freeze({
        key: `${material.name}:${property}`,
        texture: value,
        assign: (texture: THREE.Texture) => { writable[property] = texture; },
      }));
    }
  }
  return Object.freeze(bindings.sort((left, right) => left.key.localeCompare(right.key)));
}

function textureCompatibility(texture: THREE.Texture): string {
  const image = texture.source.data as { width?: unknown; height?: unknown } | null;
  return [
    Number(image?.width ?? 0), Number(image?.height ?? 0), texture.colorSpace,
    texture.channel, texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter,
    texture.flipY, texture.generateMipmaps,
  ].join(':');
}

function loadedPresentationAsset(id: PresentationAssetId, variant: Pass65WeaponVariant): WeaponAsset | undefined {
  if (id === 'explosive-crossbow') return pass65CrossbowAssets.get(variant);
  if (id === 'field-knife') return pass65FieldKnifeAssets.get(variant);
  return cache.get(cacheKey(id as Pass65AuthoredFirearmId, variant));
}

function allLoadedSourceAssets(): readonly WeaponAsset[] {
  return [
    ...cache.values(),
    ...pass65CrossbowAssets.values(),
    ...pass65FieldKnifeAssets.values(),
  ];
}

function disposeTexturesNoLongerReferenced(candidates: ReadonlySet<THREE.Texture>): void {
  if (candidates.size === 0) return;
  const retained = new Set<THREE.Texture>();
  for (const asset of allLoadedSourceAssets()) {
    for (const binding of textureBindings(asset)) retained.add(binding.texture);
  }
  for (const texture of candidates) if (!retained.has(texture)) texture.dispose();
}

/**
 * The checked-in asset gate proves the embedded image bytes are identical for
 * first-person/world/drop siblings. Share their decoded Texture objects while
 * retaining independent geometry, skeleton and animation ownership.
 */
function deduplicatePresentationTextures(id: PresentationAssetId): void {
  const loaded = (['first-person', 'world', 'drop'] as const)
    .map((variant) => ({ variant, asset: loadedPresentationAsset(id, variant) }))
    .filter((entry): entry is { variant: Pass65WeaponVariant; asset: WeaponAsset } => entry.asset !== undefined);
  if (loaded.length < 2) return;
  const canonical = loaded[0]!;
  const canonicalBindings = textureBindings(canonical.asset);
  const retired = new Set<THREE.Texture>();
  for (const sibling of loaded.slice(1)) {
    const siblingBindings = textureBindings(sibling.asset);
    if (siblingBindings.length !== canonicalBindings.length) {
      throw new Error(`Pass 65 ${id} ${sibling.variant} texture binding count differs from ${canonical.variant}`);
    }
    for (const [index, siblingBinding] of siblingBindings.entries()) {
      const canonicalBinding = canonicalBindings[index]!;
      if (siblingBinding.key !== canonicalBinding.key
        || textureCompatibility(siblingBinding.texture) !== textureCompatibility(canonicalBinding.texture)) {
        throw new Error(`Pass 65 ${id} ${sibling.variant} texture binding ${siblingBinding.key} differs from ${canonicalBinding.key}`);
      }
      if (siblingBinding.texture === canonicalBinding.texture) continue;
      retired.add(siblingBinding.texture);
      siblingBinding.assign(canonicalBinding.texture);
    }
  }
  disposeTexturesNoLongerReferenced(retired);
}

export function isPass65AuthoredFirearm(id: WeaponId): id is Pass65AuthoredFirearmId {
  return authoredIdSet.has(id);
}

function cacheKey(id: Pass65AuthoredFirearmId, variant: Pass65WeaponVariant): string {
  return `${variant}:${id}`;
}

function disposeSourceAsset(asset: WeaponAsset): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  asset.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of nodeMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  const retainedTextures = new Set<THREE.Texture>();
  for (const retainedAsset of allLoadedSourceAssets()) {
    if (retainedAsset === asset) continue;
    for (const binding of textureBindings(retainedAsset)) retainedTextures.add(binding.texture);
  }
  textures.forEach((texture) => { if (!retainedTextures.has(texture)) texture.dispose(); });
}

function enforceCacheBudget(variant: Pass65WeaponVariant, protectedKey?: string): void {
  let entries = [...cache.values()].filter((entry) => entry.variant === variant);
  while (entries.length > PASS65_WEAPON_CACHE_BUDGET[variant]) {
    const victim = entries
      .filter((entry) => entry.refs === 0 && entry.key !== protectedKey)
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (!victim) return;
    cache.delete(victim.key);
    disposeSourceAsset(victim);
    entries = entries.filter((entry) => entry !== victim);
  }
}

export function loadPass65WeaponAsset(id: Pass65AuthoredFirearmId, variant: Pass65WeaponVariant): Promise<void> {
  const key = cacheKey(id, variant);
  const existing = cache.get(key);
  if (existing) {
    existing.lastUsed = ++useCounter;
    return Promise.resolve();
  }
  const pending = loading.get(key);
  if (pending) return pending;
  const promise = loader().loadAsync(PASS65_AUTHORED_WEAPON_URLS[id][variant]).then((gltf) => {
    const entry = {
      key,
      variant,
      scene: gltf.scene,
      clips: gltf.animations,
      refs: 0,
      lastUsed: ++useCounter,
    };
    cache.set(key, entry);
    try {
      deduplicatePresentationTextures(id);
    } catch (error) {
      loading.delete(key);
      cache.delete(key);
      disposeSourceAsset(entry);
      throw error;
    }
    loading.delete(key);
    // Do not evict the just-resolved zero-ref source before the awaiting caller
    // can clone it. Active presentations may temporarily overflow a soft
    // budget; the next release immediately reclaims the oldest zero-ref source.
    enforceCacheBudget(variant, key);
  }, (error) => {
    loading.delete(key);
    throw error;
  });
  loading.set(key, promise);
  return promise;
}

export function loadPass65CrossbowAssets(variant: Pass65CrossbowVariant = 'first-person'): Promise<void> {
  if (pass65CrossbowAssets.has(variant)) return Promise.resolve();
  const pending = pass65CrossbowLoads.get(variant);
  if (pending) return pending;
  const promise = loader().loadAsync(PASS65_CROSSBOW_URLS[variant]).then((gltf) => {
    const asset = { scene: gltf.scene, clips: gltf.animations };
    pass65CrossbowAssets.set(variant, asset);
    try {
      deduplicatePresentationTextures('explosive-crossbow');
    } catch (error) {
      pass65CrossbowLoads.delete(variant);
      pass65CrossbowAssets.delete(variant);
      disposeSourceAsset(asset);
      throw error;
    }
    pass65CrossbowLoads.delete(variant);
  }, (error) => {
    pass65CrossbowLoads.delete(variant);
    throw error;
  });
  pass65CrossbowLoads.set(variant, promise);
  return promise;
}

export function loadPass65FieldKnifeAsset(variant: Pass65WeaponVariant): Promise<void> {
  if (pass65FieldKnifeAssets.has(variant)) return Promise.resolve();
  const pending = pass65FieldKnifeLoads.get(variant);
  if (pending) return pending;
  const promise = loader().loadAsync(PASS65_FIELD_KNIFE_URLS[variant]).then((gltf) => {
    const asset = { scene: gltf.scene, clips: gltf.animations };
    pass65FieldKnifeAssets.set(variant, asset);
    try {
      deduplicatePresentationTextures('field-knife');
    } catch (error) {
      pass65FieldKnifeLoads.delete(variant);
      pass65FieldKnifeAssets.delete(variant);
      disposeSourceAsset(asset);
      throw error;
    }
    pass65FieldKnifeLoads.delete(variant);
  }, (error) => {
    pass65FieldKnifeLoads.delete(variant);
    throw error;
  });
  pass65FieldKnifeLoads.set(variant, promise);
  return promise;
}

export function loadPass65WeaponPresentation(id: WeaponId, variant: Pass65WeaponVariant): Promise<void> {
  return id === 'explosive-crossbow'
    ? loadPass65CrossbowAssets(variant)
    : loadPass65WeaponAsset(id as Pass65AuthoredFirearmId, variant);
}

function runtimeCorpusReady(): boolean {
  return PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.variants.every((variant) => (
    WEAPON_IDS.every((id) => id === 'explosive-crossbow'
      ? pass65CrossbowAssets.has(variant)
      : cache.has(cacheKey(id as Pass65AuthoredFirearmId, variant)))
    && pass65FieldKnifeAssets.has(variant)
  ));
}

async function defaultRuntimeCorpusYield(): Promise<void> {
  await yieldBrowserPreparationFrame();
}

/**
 * Sequentially decodes the complete third-person/drop corpus while the menu
 * video owns presentation. Retaining these 38 small sources prevents bot
 * arsenal cycling and corpse drops from scheduling GLTF parse work in combat.
 */
export async function prewarmPass65RuntimeWeaponCorpus(
  yieldToBrowser: () => Promise<void> = defaultRuntimeCorpusYield,
): Promise<void> {
  if (runtimeCorpusReady()) {
    if (!runtimeCorpusPrewarmProfile) {
      runtimeCorpusPrewarmProfile = Object.freeze({
        requestedAssets: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
        loadedAssets: 0,
        durationMs: 0,
        completed: true,
        error: null,
      });
    }
    return;
  }
  if (runtimeCorpusPrewarmPromise) return runtimeCorpusPrewarmPromise;
  const startedAt = performance.now();
  let loadedAssets = 0;
  const operation = (async () => {
    for (const variant of PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.variants) {
      for (const id of WEAPON_IDS) {
        await loadPass65WeaponPresentation(id, variant);
        loadedAssets += 1;
        if (loadedAssets % PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.yieldEveryAssets === 0) {
          await yieldToBrowser();
        }
      }
      await loadPass65FieldKnifeAsset(variant);
      loadedAssets += 1;
      if (loadedAssets % PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.yieldEveryAssets === 0) {
        await yieldToBrowser();
      }
    }
    runtimeCorpusPrewarmProfile = Object.freeze({
      requestedAssets: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
      loadedAssets,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      completed: true,
      error: null,
    });
  })().catch((error: unknown) => {
    runtimeCorpusPrewarmProfile = Object.freeze({
      requestedAssets: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET.assets,
      loadedAssets,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      completed: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }).finally(() => {
    if (runtimeCorpusPrewarmPromise === operation) runtimeCorpusPrewarmPromise = null;
  });
  runtimeCorpusPrewarmPromise = operation;
  return operation;
}

function flattenMaterial(material: THREE.Material): THREE.Material {
  const source = material as THREE.MeshStandardMaterial;
  // Reduced-render mode must not read as a missing asset: preserve the full
  // authored PBR response (colour, normal, roughness, metalness, emissive
  // maps). The performance win in this mode comes from batched draw calls and
  // disabled shadow casting, not from degrading the most-seen surface in the
  // game to a flat unlit colour.
  return new THREE.MeshStandardMaterial({
    color: source.color?.clone() ?? new THREE.Color(0x303944),
    map: source.map ?? null,
    normalMap: source.normalMap ?? null,
    roughnessMap: source.roughnessMap ?? null,
    metalnessMap: source.metalnessMap ?? null,
    emissive: source.emissive?.clone() ?? new THREE.Color(0x000000),
    emissiveMap: source.emissiveMap ?? null,
    emissiveIntensity: source.emissiveIntensity ?? 1,
    roughness: source.roughness ?? 0.5,
    metalness: source.metalness ?? 0.5,
    transparent: false,
    opacity: 1,
    alphaTest: source.alphaTest,
    side: source.side,
    depthWrite: true,
  });
}

function instantiateWeaponAsset(
  id: PresentationAssetId,
  variant: Pass65WeaponVariant,
  asset: WeaponAsset,
  source: string,
  flattenMaterials: boolean,
  managed?: CachedWeaponAsset,
): THREE.Group {
  const root = new THREE.Group();
  root.name = `${id}-pass65-${variant}-model`;
  const visual = cloneSkeleton(asset.scene) as THREE.Group;
  visual.name = `${id}-pass65-${variant}-visual`;
  visual.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = !flattenMaterials;
    node.receiveShadow = !flattenMaterials;
    const prepare = (material: THREE.Material) => {
      const result = flattenMaterials ? flattenMaterial(material) : material.clone();
      result.transparent = false;
      result.opacity = 1;
      result.depthWrite = true;
      return result;
    };
    node.material = Array.isArray(node.material) ? node.material.map(prepare) : prepare(node.material);
    node.userData.presentationOnly = true;
  });
  cloneMeshGeometriesForOwner(visual, `pass65-${id}-${variant}`);
  root.add(visual);
  const identityNodes: THREE.Object3D[] = [];
  visual.traverse((node) => {
    if (node.userData.asset_id === `pass65-weapon-${id}`) identityNodes.push(node);
  });
  const identity = identityNodes[0]?.userData;
  const mixer = new THREE.AnimationMixer(visual);
  const actions = new Map(asset.clips.map((clip) => [clip.name, mixer.clipAction(clip)]));
  root.userData.importedWeaponRuntime = { mixer, actions, weapon: id } satisfies ImportedWeaponRuntime;
  root.userData.importedWeaponSource = source;
  root.userData.firstPersonSource = variant === 'first-person' ? 'project-original-blender-pass65-firearm' : undefined;
  root.userData.projectOriginalWeapon = true;
  root.userData.deliveryVariant = variant;
  root.userData.runtimeForwardAxis = '-Z';
  root.userData.weaponModelId = String(identity?.design_id ?? `pass65-${id}-project-original-v1`);
  root.userData.weaponFinishId = `${id}-project-original-pbr-v1`;
  root.userData.weaponDisplayName = identity?.display_name ?? id;
  root.userData.silhouetteFamily = identity?.silhouette_family ?? null;
  root.userData.pass65ManagedCacheKey = managed?.key;
  root.userData.pass65ManagedCacheReleased = false;
  if (managed) {
    managed.refs += 1;
    managed.lastUsed = ++useCounter;
  }
  return root;
}

/** Project-original Pass 65 crossbow. Embedded Blender sockets remain the sole socket authority. */
export function createPass65CrossbowModel(
  flattenMaterials: boolean,
  variant: Pass65CrossbowVariant,
): THREE.Group | null {
  const asset = pass65CrossbowAssets.get(variant);
  if (!asset) return null;
  const root = instantiateWeaponAsset(
    'explosive-crossbow', variant, asset, PASS65_CROSSBOW_URLS[variant], flattenMaterials,
  );
  root.scale.setScalar(0.68);
  root.userData.firstPersonSource = variant === 'first-person' ? 'project-original-blender-pass65-crossbow' : undefined;
  root.userData.opticMagnification = 1.5;
  return root;
}

export function createPass65WeaponModel(
  id: Pass65AuthoredFirearmId,
  flattenMaterials: boolean,
  variant: Pass65WeaponVariant,
): THREE.Group | null {
  const entry = cache.get(cacheKey(id, variant));
  if (!entry) return null;
  return instantiateWeaponAsset(id, variant, entry, PASS65_AUTHORED_WEAPON_URLS[id][variant], flattenMaterials, entry);
}

export function createPass65FieldKnifeModel(
  flattenMaterials: boolean,
  variant: Pass65WeaponVariant,
): THREE.Group | null {
  const asset = pass65FieldKnifeAssets.get(variant);
  if (!asset) return null;
  const root = instantiateWeaponAsset('field-knife', variant, asset, PASS65_FIELD_KNIFE_URLS[variant], flattenMaterials);
  root.scale.setScalar(0.22);
  root.userData.authoredPhysicalLengthM = 0.49;
  root.userData.firstPersonSource = variant === 'first-person' ? 'project-original-blender-pass65-field-knife' : undefined;
  root.userData.projectOriginalMeleeWeapon = true;
  return root;
}

/** Compatibility name retained for existing world presentation callers. */
export function createImportedWeaponModel(id: WeaponId, flattenMaterials: boolean): THREE.Group | null {
  if (id === 'explosive-crossbow') return createPass65CrossbowModel(flattenMaterials, 'world');
  return createPass65WeaponModel(id as Pass65AuthoredFirearmId, flattenMaterials, 'world');
}

export function releasePass65WeaponModel(root: THREE.Object3D): void {
  if (root.userData.pass65ManagedCacheReleased === true) return;
  const key = root.userData.pass65ManagedCacheKey;
  if (typeof key !== 'string') return;
  root.userData.pass65ManagedCacheReleased = true;
  const entry = cache.get(key);
  if (entry) {
    entry.refs = Math.max(0, entry.refs - 1);
    entry.lastUsed = ++useCounter;
    enforceCacheBudget(entry.variant);
  }
}

export function capturePass65PresentationGeneration(root: THREE.Object3D): number {
  return Number(root.userData.pass65PresentationGeneration ?? 0);
}

export function isPass65PresentationGenerationCurrent(root: THREE.Object3D, generation: number): boolean {
  return root.userData.pass65PresentationRetired !== true
    && capturePass65PresentationGeneration(root) === generation;
}

/**
 * Invalidate every asynchronous presentation continuation captured below a
 * root before that tree is detached. Cache refs are deliberately not released
 * here: WebGPU may still have submitted work which references the clone.
 */
export function invalidatePass65PresentationTree(root: THREE.Object3D): number {
  let invalidated = 0;
  root.traverse((node) => {
    node.userData.pass65PresentationRetired = true;
    node.userData.pass65PresentationGeneration = capturePass65PresentationGeneration(node) + 1;
    invalidated += 1;
  });
  return invalidated;
}

/** Release managed source-cache refs only after the caller's GPU fence. */
export function releasePass65WeaponModelsIn(root: THREE.Object3D): number {
  let released = 0;
  root.traverse((node) => {
    if (typeof node.userData.pass65ManagedCacheKey !== 'string'
      || node.userData.pass65ManagedCacheReleased === true) return;
    releasePass65WeaponModel(node);
    released += 1;
  });
  return released;
}

/** Dispose one cloned presentation instance without invalidating shared source textures. */
export function disposePass65WeaponModel(root: THREE.Object3D): void {
  releasePass65WeaponModel(root);
  runtime(root)?.mixer.stopAllAction();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function sourceAssetsForVariant(variant: Pass65WeaponVariant): readonly WeaponAsset[] {
  const assets: WeaponAsset[] = [...cache.values()].filter((entry) => entry.variant === variant);
  const crossbow = pass65CrossbowAssets.get(variant);
  const knife = pass65FieldKnifeAssets.get(variant);
  if (crossbow) assets.push(crossbow);
  if (knife) assets.push(knife);
  return assets;
}

function sourceAssetResidency(
  assets: readonly WeaponAsset[],
  baselineAssets: readonly WeaponAsset[] = [],
) {
  const arrays = new Set<ArrayBufferLike>();
  const baselineTextures = new Set<THREE.Texture>();
  const textures = new Set<THREE.Texture>();
  let geometryBytes = 0;
  let textureBytesEstimate = 0;
  for (const asset of baselineAssets) asset.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const attributes = [node.geometry.index, ...Object.values(node.geometry.attributes)];
    for (const attribute of attributes) {
      if (!attribute) continue;
      const array = attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.data.array
        : attribute.array;
      arrays.add(array.buffer);
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) baselineTextures.add(value);
    }
  });
  for (const asset of assets) asset.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const attributes = [node.geometry.index, ...Object.values(node.geometry.attributes)];
    for (const attribute of attributes) {
      if (!attribute) continue;
      const array = attribute instanceof THREE.InterleavedBufferAttribute
        ? attribute.data.array
        : attribute.array;
      if (arrays.has(array.buffer)) continue;
      arrays.add(array.buffer);
      geometryBytes += array.byteLength;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture && !baselineTextures.has(value)) textures.add(value);
      }
    }
  });
  for (const texture of textures) {
    const image = texture.source.data as { width?: unknown; height?: unknown } | null;
    const width = Number(image?.width ?? 0);
    const height = Number(image?.height ?? 0);
    if (width > 0 && height > 0) textureBytesEstimate += Math.ceil(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
  }
  return Object.freeze({
    assets: assets.length,
    geometryBytes,
    textureBytesEstimate,
    estimatedDecodedBytes: geometryBytes + textureBytesEstimate,
  });
}

export function pass65WeaponCacheTelemetry(): Readonly<{
  budgets: typeof PASS65_WEAPON_CACHE_BUDGET;
  loading: number;
  entries: readonly Readonly<{ key: string; variant: Pass65WeaponVariant; refs: number; lastUsed: number }>[];
  resident: Readonly<Record<Pass65WeaponVariant, ReturnType<typeof sourceAssetResidency>>>;
  runtimeCorpus: Readonly<{
    policy: typeof PASS65_RUNTIME_WEAPON_CORPUS_BUDGET;
    ready: boolean;
    prewarming: boolean;
    profile: typeof runtimeCorpusPrewarmProfile;
    residency: ReturnType<typeof sourceAssetResidency>;
    allVariantsResidency: ReturnType<typeof sourceAssetResidency>;
  }>;
}> {
  const firstPersonAssets = sourceAssetsForVariant('first-person');
  const worldAssets = sourceAssetsForVariant('world');
  const dropAssets = sourceAssetsForVariant('drop');
  return Object.freeze({
    budgets: PASS65_WEAPON_CACHE_BUDGET,
    loading: loading.size,
    entries: Object.freeze([...cache.values()].map(({ key, variant, refs, lastUsed }) => Object.freeze({ key, variant, refs, lastUsed }))),
    resident: Object.freeze({
      'first-person': sourceAssetResidency(firstPersonAssets),
      world: sourceAssetResidency(worldAssets),
      drop: sourceAssetResidency(dropAssets),
    }),
    runtimeCorpus: Object.freeze({
      policy: PASS65_RUNTIME_WEAPON_CORPUS_BUDGET,
      ready: runtimeCorpusReady(),
      prewarming: runtimeCorpusPrewarmPromise !== null,
      profile: runtimeCorpusPrewarmProfile,
      residency: sourceAssetResidency([...worldAssets, ...dropAssets], firstPersonAssets),
      allVariantsResidency: sourceAssetResidency([...firstPersonAssets, ...worldAssets, ...dropAssets]),
    }),
  });
}

function runtime(root: THREE.Object3D): ImportedWeaponRuntime | null {
  const direct = root.userData.importedWeaponRuntime as ImportedWeaponRuntime | undefined;
  if (direct) return direct;
  let nested: ImportedWeaponRuntime | null = null;
  root.traverse((node) => {
    if (!nested && node !== root && node.userData.importedWeaponRuntime) {
      nested = node.userData.importedWeaponRuntime as ImportedWeaponRuntime;
    }
  });
  return nested;
}

function playMatching(root: THREE.Object3D, fragment: string): void {
  const state = runtime(root);
  if (!state) return;
  const exact = state.actions.get(fragment);
  const action = exact ?? [...state.actions.entries()].find(([name]) => name.toLowerCase().includes(fragment.toLowerCase()))?.[1];
  action?.reset().setLoop(THREE.LoopOnce, 1).play();
}

export function updateImportedWeapon(root: THREE.Object3D, dt: number): void {
  runtime(root)?.mixer.update(Math.min(0.05, Math.max(0, dt)));
}

/** Clears retained firearm/knife actions without advancing presentation time. */
export function resetImportedWeaponAnimations(root: THREE.Object3D): void {
  const state = runtime(root);
  if (!state) return;
  state.mixer.stopAllAction();
  for (const action of state.actions.values()) action.stop();
  state.mixer.setTime(0);
}

export function fireImportedWeapon(root: THREE.Object3D): void {
  playMatching(root, 'fire');
}

export function reloadImportedWeapon(root: THREE.Object3D): void {
  playMatching(root, 'reload');
}

export function meleeImportedWeapon(root: THREE.Object3D): void {
  playMatching(root, 'melee');
}

export function importedWeaponTelemetry(root: THREE.Object3D | undefined): {
  source: string;
  weapon: PresentationAssetId;
  clips: number;
  meshes: number;
  renderPrimitives: number;
  triangles: number;
  detailMeshes: number;
  socketContractReady: boolean;
  muzzleForwardDot: number | null;
  sightForwardDot: number | null;
} | null {
  if (!root) return null;
  const state = runtime(root);
  if (!state) return null;
  let meshes = 0;
  let renderPrimitives = 0;
  let triangles = 0;
  const socketCounts = new Map<string, number>();
  const contractNames = ['muzzle-socket', 'eject-socket', 'grip-socket-r', 'support-socket-l', 'reload-socket-l', 'rear-sight-socket', 'front-sight-socket'];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      meshes += 1;
      const geometry = node.geometry;
      const groups = geometry.groups.length;
      renderPrimitives += Math.max(1, groups || (Array.isArray(node.material) ? node.material.length : 1));
      const elementCount = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
      triangles += Math.round(elementCount / 3);
    }
    if (contractNames.includes(node.name)) socketCounts.set(node.name, (socketCounts.get(node.name) ?? 0) + 1);
  });
  const socketContractReady = contractNames.every((name) => socketCounts.get(name) === 1);
  root.updateMatrixWorld(true);
  const localDirection = (fromName: string, toName: string): number | null => {
    const from = root.getObjectByName(fromName);
    const to = root.getObjectByName(toName);
    if (!from || !to) return null;
    const fromLocal = root.worldToLocal(from.getWorldPosition(new THREE.Vector3()));
    const toLocal = root.worldToLocal(to.getWorldPosition(new THREE.Vector3()));
    const direction = toLocal.sub(fromLocal);
    if (direction.lengthSq() < 1e-8) return null;
    return direction.normalize().dot(new THREE.Vector3(0, 0, -1));
  };
  return {
    source: String(root.userData.importedWeaponSource),
    weapon: state.weapon,
    clips: state.actions.size,
    meshes,
    renderPrimitives,
    triangles,
    detailMeshes: 0,
    socketContractReady,
    muzzleForwardDot: localDirection('grip-socket-r', 'muzzle-socket'),
    sightForwardDot: localDirection('rear-sight-socket', 'front-sight-socket'),
  };
}
