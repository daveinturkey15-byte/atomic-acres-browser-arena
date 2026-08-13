import * as THREE from 'three';
import { StorageInstancedBufferAttribute } from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M,
  CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE,
  CHOPPER_MISSILE_FLIGHT_MS,
  type DroneSensorContact,
  type KillstreakEntitySnapshot,
  type KillstreakImpactEvent,
  type KillstreakPlacementMarkerSnapshot,
  type KillstreakRecipientSnapshot,
} from './killstreak-runtime';
import { DRONE_PRESENTATION_FAMILY_ID, DRONE_SUPPORT_DEFINITIONS } from './killstreak-support-catalog';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import { SUPPORT_WEAPON_FEEDBACK_CONTRACT } from './support-vehicle-presentation-contract';
import { yieldBrowserCpuTask, yieldBrowserPreparationFrame } from './browser-preparation-scheduler';
import { GPU_SHARED_GEOMETRY_KEY } from './gpu-resource-ownership';
import { attachPass70DroneSwarmBodyMarks } from './pass70-drone-swarm-logo';

const MAX_PRESENTED_ENTITIES = 32;
const MAX_IMPACT_FLASHES = 20;
const MAX_BOMB_SHELLS = 20;
const EMBERS_PER_CARPET_IMPACT = 6;
const MAX_EMBER_PARTICLES = MAX_BOMB_SHELLS * EMBERS_PER_CARPET_IMPACT;
const BOMB_SHELL_DROP_DURATION_MS = 420;
export const CARPET_BOMB_SHELL_PRESENTATION_ALTITUDE_M = 20;
export const CARPET_BOMB_SHELL_PRESENTATION_RADIUS_M = 0.12;
const EMBER_GRAVITY_MPS2 = 11.25;
const MAX_SENSOR_CONTACTS = 16;
const MAX_PLACEMENT_MARKERS = 8;
const PREWARM_STATE_ROOTS_PER_TASK = 4;
const SUPPORT_STATIC_TRANSFORMS_PER_TASK = 4;
const CARPET_MARKER_UNIT_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
CARPET_MARKER_UNIT_BOX_GEOMETRY.name = 'carpet-marker-shared-unit-box';
CARPET_MARKER_UNIT_BOX_GEOMETRY.userData[GPU_SHARED_GEOMETRY_KEY] = 'carpet-bomber-placement-marker';

async function yieldPresentationPreparation(): Promise<void> {
  // Presentation preparation must continue while the document is hidden.
  // requestAnimationFrame is suspended/throttled in that state, which used to
  // leave deployment preparation waiting indefinitely after a tab switch.
  await yieldBrowserPreparationFrame();
}

async function yieldPresentationCpuTask(): Promise<void> {
  await yieldBrowserCpuTask();
}

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
export type SupportVehicleAssetFamily = keyof typeof SUPPORT_VEHICLE_ASSETS;
type SupportAircraftVariant = Extract<SupportVehicleAssetFamily, 'care' | 'carpet'>;
type LoadedSupportVehicleLod = Readonly<{
  scene: THREE.Group;
  animations: readonly THREE.AnimationClip[];
  sourceMaxDimension: number;
  asset: string;
}>;
type SupportVehicleTemplate = Readonly<{ family: SupportVehicleAssetFamily; lods: readonly LoadedSupportVehicleLod[] }>;
export type SupportAircraftWingVisibility = Readonly<{
  contract: 'visible-rendered-wing-span-v1';
  family: SupportAircraftVariant;
  visibleMeshCount: number;
  span: readonly [number, number, number];
  aircraftSpan: readonly [number, number, number];
  lateralSpanRatio: number;
  passed: boolean;
}>;
export type AuthoredSupportStaticBatchBudget = Readonly<{
  sourceMeshes: number;
  batches: number;
  retiredSourceMeshes: number;
  batchOutputMeshes: number;
  visibleMeshes: number;
  visibleMaterials: number;
  stableVisibleMeshes: number;
  stableVisibleMaterials: number;
  exteriorBatchMeshes: number;
  exteriorBatchMaterials: number;
  visibleBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
  rearTailBatchMeshes: number;
  rearTailBatchBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
}>;
const SUPPORT_VEHICLE_LOAD_TIMEOUT_MS = 20_000;
const SUPPORT_VEHICLE_MAX_CONCURRENT_DECODES = 2;
const SUPPORT_VEHICLE_TARGET_DIMENSIONS: Readonly<Record<SupportVehicleAssetFamily, number>> = Object.freeze({
  // Owner HITL: vehicles read as incomplete slabs because a ~10m aircraft at a
  // 25-60m engagement distance is a sliver on screen. Scaled to read as real
  // craft from the ground; the crate keeps its capture-gameplay footprint.
  chopper: 8.4,
  care: 16,
  carpet: 17,
  crate: 3.2,
});
export const SUPPORT_VEHICLE_LOD_DISTANCES = Object.freeze([0, 95, 190] as const);

export function deriveSupportVehiclePrewarmDistances(
  lodDistances: readonly [number, number, number] = SUPPORT_VEHICLE_LOD_DISTANCES,
  nearFieldDimension = SUPPORT_VEHICLE_TARGET_DIMENSIONS.chopper,
): readonly [number, number, number] {
  const [lod0Start, lod1Start, lod2Start] = lodDistances;
  if (lod0Start !== 0 || !(lod1Start > lod0Start) || !(lod2Start > lod1Start)) {
    throw new Error('Support vehicle LOD distances must be three strictly increasing bands starting at zero');
  }
  const fartherBandWidth = lod2Start - lod1Start;
  const nearFieldDistance = nearFieldDimension * 1.2;
  if (!(nearFieldDistance > lod0Start && nearFieldDistance < lod1Start)) {
    throw new Error('Support vehicle near-field prewarm must remain inside the authored LOD0 band');
  }
  return Object.freeze([
    nearFieldDistance,
    lod1Start + fartherBandWidth * 0.5,
    lod2Start + fartherBandWidth * 0.5,
  ]);
}

export const SUPPORT_VEHICLE_PREWARM_DISTANCES = deriveSupportVehiclePrewarmDistances();
const SUPPORT_VEHICLE_REQUIRED_NODES: Readonly<Record<SupportVehicleAssetFamily, readonly string[]>> = Object.freeze({
  chopper: Object.freeze([
    'chopper-fuselage', 'chopper-rear-fuselage', 'chopper-tail-boom', 'chopper-tail-fin',
    'chopper-sleek-cockpit-canopy', 'chopper-first-person-cockpit',
    'chopper-gunner-sightline', 'chopper-gunner-weapon-view',
    'chopper-cockpit-dashboard-3d', 'chopper-cockpit-display-cyan', 'chopper-cockpit-display-green',
    'chopper-cockpit-hud-glass', 'chopper-cockpit-hud-target-ring',
    'chopper-inner-windscreen-pillar-left-base', 'chopper-inner-windscreen-pillar-left-top',
    'chopper-inner-windscreen-pillar-right-base', 'chopper-inner-windscreen-pillar-right-top',
    'chopper-inner-windscreen-glow-left-base', 'chopper-inner-windscreen-glow-left-top',
    'chopper-inner-windscreen-glow-right-base', 'chopper-inner-windscreen-glow-right-top',
    'chopper-first-person-camera-socket', 'chopper-main-rotor', 'chopper-tail-rotor',
    'chopper-player-gun', 'chopper-gun-muzzle-socket', 'chopper-forward-socket',
    'chopper-muzzle-flash', 'chopper-tracer-action', 'chopper-impact-action',
  ]),
  care: Object.freeze(['care-aircraft-fuselage', 'care-aircraft-main-wing', 'care-aircraft-cargo-socket', 'care-aircraft-forward-socket']),
  carpet: Object.freeze(['carpet-aircraft-fuselage', 'carpet-aircraft-main-wing', 'carpet-aircraft-bomb-socket', 'carpet-aircraft-forward-socket']),
  crate: Object.freeze(['care-package-crate', 'care-package-parachute', 'care-parachute-lines', 'care-crate-landing-socket']),
});
const SUPPORT_VEHICLE_REQUIRED_ACTIONS: Readonly<Record<SupportVehicleAssetFamily, readonly string[]>> = Object.freeze({
  chopper: Object.freeze([
    'Chopper_Main_Rotor_Loop', 'Chopper_Tail_Rotor_Loop', 'Chopper_Gun_Recoil', 'Chopper_Gun_Fire',
    'Chopper_Muzzle_Flash', 'Chopper_Tracer_Pulse', 'Chopper_Impact_Pulse', 'Chopper_Quiet_Loop',
  ]),
  care: Object.freeze([]),
  carpet: Object.freeze([]),
  crate: Object.freeze([]),
});
const SUPPORT_VEHICLE_LOOP_ACTIONS: Readonly<Record<SupportVehicleAssetFamily, readonly string[]>> = Object.freeze({
  chopper: Object.freeze(['Chopper_Main_Rotor_Loop', 'Chopper_Tail_Rotor_Loop', 'Chopper_Quiet_Loop']),
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

const AUTHORED_SUPPORT_SHADOW_MATERIALS = Object.freeze({
  chopper: new Set([
    'MAT_Pass65Chopper_Armor_PBR',
    'MAT_Pass65Chopper_RearTailArmor_PBR',
    'MAT_Pass65Chopper_DarkArmor',
    'MAT_Pass65Chopper_Gunmetal',
    'MAT_Pass65Chopper_RotorBlade',
  ]),
  drone: new Set([
    'MAT_HunterDrone_Armor_PBR',
    'MAT_HunterDrone_DarkArmor',
    'MAT_HunterDrone_Gunmetal',
  ]),
});

export function authoredSupportMaterialCastsShadow(
  family: keyof typeof AUTHORED_SUPPORT_SHADOW_MATERIALS,
  materialName: string,
): boolean {
  return AUTHORED_SUPPORT_SHADOW_MATERIALS[family].has(materialName);
}

function applyAuthoredSupportShadowBudget(
  root: THREE.Object3D,
  family: keyof typeof AUTHORED_SUPPORT_SHADOW_MATERIALS,
): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    // Keep the complete authored model, PBR vocabulary and animation in the
    // colour pass. Shadow maps only need the major opaque silhouette; making
    // every instrument, emissive chip, line and transparent rotor disc a
    // caster multiplied support-streak submissions without a visible benefit.
    node.castShadow = materials.some((entry) => authoredSupportMaterialCastsShadow(family, entry.name));
  });
}

const CHOPPER_DISPLAY_MATERIALS = Object.freeze(new Map<string, Readonly<{
  color: number;
  emissive: number;
}>>([
  ['MAT_Pass65Chopper_CyanDisplay', Object.freeze({ color: 0x02090c, emissive: 0x00465d })],
  ['MAT_Pass65Chopper_GreenDisplay', Object.freeze({ color: 0x020a05, emissive: 0x003b17 })],
]));

const CHOPPER_READABILITY_MATERIALS = Object.freeze(new Map<string, Readonly<{
  emissive: number;
  intensity: number;
  minimumRoughness?: number;
  maximumMetalness?: number;
}>>([
  ['MAT_Pass65Chopper_Armor_PBR', Object.freeze({ emissive: 0x4d8a68, intensity: 0.7 })],
  ['MAT_Pass65Chopper_RearTailArmor_PBR', Object.freeze({
    emissive: 0x6f916d,
    intensity: 0.95,
    minimumRoughness: 0.78,
    maximumMetalness: 0.28,
  })],
  ['MAT_Pass65Chopper_DarkArmor', Object.freeze({ emissive: 0x263f36, intensity: 0.45 })],
  ['MAT_Pass65Chopper_Gunmetal', Object.freeze({ emissive: 0x3f5054, intensity: 0.4 })],
  ['MAT_Pass65Chopper_CockpitFrame', Object.freeze({ emissive: 0x2f6653, intensity: 0.55 })],
  ['MAT_Pass65Chopper_CockpitInterior', Object.freeze({ emissive: 0x28513a, intensity: 0.45 })],
  ['MAT_Pass65Chopper_PanelWear', Object.freeze({ emissive: 0x6b5723, intensity: 0.45 })],
  ['MAT_Pass65Chopper_RescueAccent', Object.freeze({ emissive: 0xa63b0a, intensity: 0.6 })],
  ['MAT_Pass65Chopper_RotorBlade', Object.freeze({ emissive: 0x172424, intensity: 0.3 })],
]));

const CHOPPER_REAR_TAIL_SEMANTIC_NODES = Object.freeze([
  'chopper-rear-fuselage',
  'chopper-tail-boom',
] as const);
const CHOPPER_REAR_TAIL_MATERIAL_NAME = 'MAT_Pass65Chopper_RearTailArmor_PBR';

function isolateAuthoredChopperRearTailArmor(root: THREE.Object3D): void {
  const clones = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  for (const semanticName of CHOPPER_REAR_TAIL_SEMANTIC_NODES) {
    root.getObjectByName(semanticName)?.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const sourceMaterials = Array.isArray(node.material) ? node.material : [node.material];
      let changed = false;
      const materials = sourceMaterials.map((entry) => {
        if (!(entry instanceof THREE.MeshStandardMaterial)
          || entry.name !== 'MAT_Pass65Chopper_Armor_PBR') return entry;
        let clone = clones.get(entry);
        if (!clone) {
          clone = entry.clone();
          clone.name = CHOPPER_REAR_TAIL_MATERIAL_NAME;
          clone.userData = { ...entry.userData };
          clones.set(entry, clone);
        }
        changed = true;
        return clone;
      });
      if (!changed) return;
      node.material = Array.isArray(node.material) ? materials : materials[0]!;
    });
  }
}

/**
 * The authored Chopper is deliberately dark military hardware, but its first
 * runtime pass collapsed into an unlit silhouette and the three cockpit MFD
 * backplates read as opaque cyan/green placeholders. Keep the textured PBR
 * response and physical instrument geometry, while adding a small bounded
 * self-fill and turning only the named MFD backplates into dark glass.
 */
export function applyAuthoredChopperReadability(root: THREE.Object3D): void {
  // The rear cabin and tail are one continuous authored volume, but their
  // shared high-metalness armor collapses into black test-bay walls while the
  // separately materialled canopy and rotor tips remain visible. Isolate only
  // those named semantic subtrees so their retained PBR textures can receive a
  // bounded fill without flattening or brightening the complete airframe.
  isolateAuthoredChopperRearTailArmor(root);
  const visited = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) {
      if (visited.has(entry) || !(entry instanceof THREE.MeshStandardMaterial)) continue;
      visited.add(entry);
      if (entry.userData.pass70ChopperReadabilityApplied === true) continue;
      const display = CHOPPER_DISPLAY_MATERIALS.get(entry.name);
      if (display) {
        entry.color.setHex(display.color);
        entry.emissive.setHex(display.emissive);
        entry.emissiveIntensity = 0.34;
        entry.transparent = true;
        entry.opacity = 0.38;
        entry.depthWrite = false;
        entry.roughness = Math.max(entry.roughness, 0.38);
        entry.metalness = Math.min(entry.metalness, 0.22);
        entry.userData.pass70ChopperReadabilityApplied = true;
        entry.needsUpdate = true;
        continue;
      }
      const readability = CHOPPER_READABILITY_MATERIALS.get(entry.name);
      if (!readability) continue;
      // The Armor emissive texture is an intentionally black authoring mask.
      // Retaining it multiplies the bounded fill back to zero in WebGPU.
      if (entry.name === 'MAT_Pass65Chopper_Armor_PBR'
        || entry.name === CHOPPER_REAR_TAIL_MATERIAL_NAME) entry.emissiveMap = null;
      entry.emissive.setHex(readability.emissive);
      entry.emissiveIntensity = readability.intensity;
      if (readability.minimumRoughness !== undefined) {
        entry.roughness = Math.max(entry.roughness, readability.minimumRoughness);
      }
      if (readability.maximumMetalness !== undefined) {
        entry.metalness = Math.min(entry.metalness, readability.maximumMetalness);
      }
      entry.userData.pass70ChopperReadabilityApplied = true;
      entry.needsUpdate = true;
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
        applyAuthoredSupportShadowBudget(root, 'drone');
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

function loadSupportVehicleLod(
  asset: string,
  family: SupportVehicleAssetFamily,
): Promise<LoadedSupportVehicleLod> {
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
        if (family === 'chopper') applyAuthoredChopperReadability(scene);
        markSharedPresentationAsset(scene);
        // Static batching is template work, not instance work. Build it once
        // while this LOD is entering the retained cache; all later support-pool
        // instances clone the already optimized hierarchy and share its GPU
        // resources instead of repeating geometry transforms and merges.
        await optimizeAuthoredSupportLevel(scene, family, gltf.animations);
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
      for (const asset of SUPPORT_VEHICLE_ASSETS[family]) {
        lods.push(await loadSupportVehicleLod(asset, family));
        await yieldPresentationPreparation();
      }
      for (const [lodIndex, lod] of lods.entries()) {
        const missing = SUPPORT_VEHICLE_REQUIRED_NODES[family].filter((name) => lod.scene.getObjectByName(name) === undefined);
        if (missing.length > 0) throw new Error(`${family} LOD${lodIndex}: authored nodes missing ${missing.join(', ')}`);
        const missingActions = SUPPORT_VEHICLE_REQUIRED_ACTIONS[family].filter((name) => (
          lod.animations.some((clip) => clip.name === name) !== true
        ));
        if (missingActions.length > 0) throw new Error(`${family} LOD${lodIndex}: authored actions missing ${missingActions.join(', ')}`);
        if (family === 'care' || family === 'carpet') {
          const wing = supportAircraftWingVisibility(lod.scene, family);
          lod.scene.userData.aircraftWingVisibility = wing;
          if (!wing.passed) {
            throw new Error(`${family} LOD${lodIndex}: no visible rendered main-wing span (${JSON.stringify(wing)})`);
          }
        }
      }
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
      throw new Error(`Authored support-vehicle release contract failed: ${JSON.stringify(Object.fromEntries(supportVehicleLoadFailures))}`);
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
  aircraftWings: Readonly<Record<string, readonly SupportAircraftWingVisibility[]>>;
  staticBatches: Readonly<Record<string, readonly AuthoredSupportStaticBatchBudget[]>>;
}> {
  return Object.freeze({
    state: supportVehicleLoadState,
    requiredAssets: Object.freeze(Object.values(SUPPORT_VEHICLE_ASSETS).flat()),
    loadedAssets: Object.freeze([...supportVehicleTemplates.values()].flatMap((template) => template.lods.map((lod) => lod.asset)).sort()),
    readyFamilies: Object.freeze([...supportVehicleTemplates.keys()].sort()),
    maxConcurrentDecodes: SUPPORT_VEHICLE_MAX_CONCURRENT_DECODES,
    failures: Object.freeze(Object.fromEntries(supportVehicleLoadFailures)),
    textureDedup: supportVehicleTextureCanonicalizer.telemetry(),
    aircraftWings: Object.freeze(Object.fromEntries(
      [...supportVehicleTemplates.entries()]
        .filter(([family]) => family === 'care' || family === 'carpet')
        .map(([family, template]) => [family, Object.freeze(template.lods.map((lod) => (
          lod.scene.userData.aircraftWingVisibility as SupportAircraftWingVisibility
        )))])
    )),
    staticBatches: Object.freeze(Object.fromEntries(
      [...supportVehicleTemplates.entries()].map(([family, template]) => [
        family,
        Object.freeze(template.lods.map((lod) => authoredSupportStaticBatchBudget(lod.scene))),
      ]),
    )),
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
  attitudeTarget: THREE.Quaternion;
  attitudeEuler: THREE.Euler;
  mixers: readonly THREE.AnimationMixer[];
  oneShotActions: ReadonlyMap<string, readonly THREE.AnimationAction[]>;
  authored: boolean;
  cameraSocket: THREE.Object3D | null;
  cockpit: THREE.Object3D | null;
}>;

function presentedEntity(
  root: THREE.Group,
  rotor: THREE.Object3D | null,
  mixers: readonly THREE.AnimationMixer[],
  authored: boolean,
  oneShotActions: ReadonlyMap<string, readonly THREE.AnimationAction[]> = new Map(),
): PresentedEntity {
  return Object.freeze({
    root,
    rotor,
    target: new THREE.Vector3(),
    attitudeTarget: new THREE.Quaternion(),
    attitudeEuler: new THREE.Euler(0, 0, 0, 'YXZ'),
    mixers: Object.freeze([...mixers]),
    oneShotActions,
    authored,
    cameraSocket: root.getObjectByName('drone-first-person-camera-socket')
      ?? root.getObjectByName('chopper-first-person-camera-socket')
      ?? null,
    cockpit: root.getObjectByName('chopper-first-person-cockpit') ?? null,
  });
}

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
  if (Array.isArray(mesh.material)
    || mesh instanceof THREE.SkinnedMesh
    || !authoredSupportStaticGeometryCanBatch(mesh.geometry)) return null;
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

const SUPPORT_STATIC_TRANSFORM_ATTRIBUTES = Object.freeze(['position', 'normal', 'tangent'] as const);

export function authoredSupportStaticGeometryCanBatch(geometry: THREE.BufferGeometry): boolean {
  // Three transforms only direct geometry attributes in applyMatrix4(); morph
  // targets need different absolute/relative semantics and are not present in
  // the authored support corpus. Leave any future morph-bearing primitive in
  // its source hierarchy rather than silently baking an invalid static batch.
  return !Object.values(geometry.morphAttributes).some((entries) => entries.length > 0);
}

function float32TransformAttribute(
  source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): THREE.Float32BufferAttribute {
  const values = new Float32Array(source.count * source.itemSize);
  for (let index = 0; index < source.count; index += 1) {
    const offset = index * source.itemSize;
    if (source.itemSize > 0) values[offset] = source.getX(index);
    if (source.itemSize > 1) values[offset + 1] = source.getY(index);
    if (source.itemSize > 2) values[offset + 2] = source.getZ(index);
    if (source.itemSize > 3) values[offset + 3] = source.getW(index);
  }
  const result = new THREE.Float32BufferAttribute(values, source.itemSize, false);
  result.name = source.name;
  result.setUsage(source instanceof THREE.InterleavedBufferAttribute ? source.data.usage : source.usage);
  return result;
}

function dequantizeSupportStaticTransformAttributes(geometry: THREE.BufferGeometry): void {
  for (const name of SUPPORT_STATIC_TRANSFORM_ATTRIBUTES) {
    const attribute = geometry.getAttribute(name);
    if (attribute && (attribute.normalized || !(attribute.array instanceof Float32Array))) {
      geometry.setAttribute(name, float32TransformAttribute(attribute));
    }
  }
}

/**
 * Clone one authored static primitive into its batch anchor without writing
 * transformed values back through glTF's normalized integer quantization.
 *
 * Meshopt/KHR_mesh_quantization delivers support POSITION as normalized
 * Int16. BufferGeometry.applyMatrix4() uses attribute setters, so applying a
 * node translation directly to that integer clone clamps/wraps coordinates
 * outside [-1, 1] and collapses the complete aircraft around the origin.
 * Only transform-bearing attributes are expanded; UVs, colours, indices,
 * groups and metadata retain their compact authored representation.
 */
export function cloneAuthoredSupportStaticGeometryForTransform(
  source: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
): THREE.BufferGeometry {
  if (!authoredSupportStaticGeometryCanBatch(source)) {
    throw new Error('Authored support static batching rejects morph-target geometry');
  }
  const transformed = source.clone();
  dequantizeSupportStaticTransformAttributes(transformed);
  transformed.applyMatrix4(matrix);
  transformed.computeBoundingBox();
  transformed.computeBoundingSphere();
  return transformed;
}

async function batchAuthoredSupportStaticMeshes(
  anchor: THREE.Object3D,
  family: SupportVehicleAssetFamily,
  scope: string,
  allowAnimatedAnchor = false,
): Promise<Readonly<{ sourceMeshes: number; batches: number }>> {
  anchor.updateWorldMatrix(true, true);
  const anchorInverse = new THREE.Matrix4().copy(anchor.matrixWorld).invert();
  const groups = new Map<string, THREE.Mesh[]>();
  anchor.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.visible || node.userData.staticBatchRendered === true) return;
    let cursor: THREE.Object3D | null = node;
    while (cursor && cursor !== anchor.parent) {
      if (cursor.userData.supportAnimationTarget === true
        && !(allowAnimatedAnchor && cursor === anchor)
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
    const transformed: THREE.BufferGeometry[] = [];
    for (const [index, source] of sources.entries()) {
      const localMatrix = new THREE.Matrix4().multiplyMatrices(anchorInverse, source.matrixWorld);
      transformed.push(cloneAuthoredSupportStaticGeometryForTransform(source.geometry, localMatrix));
      if ((index + 1) % SUPPORT_STATIC_TRANSFORMS_PER_TASK === 0) await yieldPresentationCpuTask();
    }
    const geometry = mergeGeometries(transformed, false);
    for (const entry of transformed) entry.dispose();
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const representative = sources[0]!;
    const batch = new THREE.Mesh(geometry, representative.material);
    batch.name = `pass65-${family}-${scope}-static-batch-${batches + 1}`;
    batch.userData.presentationOnly = true;
    batch.userData.supportStaticBatchOutput = true;
    batch.userData.supportStaticBatchScope = scope;
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
    await yieldPresentationCpuTask();
  }
  return Object.freeze({ sourceMeshes, batches });
}

function visibleThroughAncestor(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor) {
    if (!cursor.visible) return false;
    if (cursor === root) return true;
    cursor = cursor.parent;
  }
  return false;
}

export function supportAircraftWingVisibility(
  root: THREE.Object3D,
  family: SupportAircraftVariant,
): SupportAircraftWingVisibility {
  const wing = root.getObjectByName(`${family}-aircraft-main-wing`);
  const bounds = new THREE.Box3();
  const aircraftBounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let visibleMeshCount = 0;
  root.updateWorldMatrix(true, true);
  wing?.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !visibleThroughAncestor(wing, node)) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox || node.geometry.boundingBox.isEmpty()) return;
    meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    bounds.union(meshBounds);
    visibleMeshCount += 1;
  });
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !visibleThroughAncestor(root, node)) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox || node.geometry.boundingBox.isEmpty()) return;
    meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    aircraftBounds.union(meshBounds);
  });
  const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
  const aircraftSize = aircraftBounds.isEmpty() ? new THREE.Vector3() : aircraftBounds.getSize(new THREE.Vector3());
  const span = Object.freeze(size.toArray() as [number, number, number]);
  const aircraftSpan = Object.freeze(aircraftSize.toArray() as [number, number, number]);
  const lateralSpanRatio = size.x / Math.max(0.01, aircraftSize.x);
  return Object.freeze({
    contract: 'visible-rendered-wing-span-v1',
    family,
    visibleMeshCount,
    span,
    aircraftSpan,
    lateralSpanRatio,
    passed: visibleMeshCount > 0 && lateralSpanRatio >= 0.65 && size.x > Math.max(0.01, size.z) * 0.8,
  });
}

export async function optimizeAuthoredSupportLevel(
  level: THREE.Group,
  family: SupportVehicleAssetFamily,
  animations: readonly THREE.AnimationClip[],
): Promise<void> {
  if (level.userData.supportStaticBatchOptimized === true) return;
  const animatedTargets: THREE.Object3D[] = [];
  for (const targetName of supportAnimationTargetNames(animations)) {
    const target = level.getObjectByName(targetName);
    if (!target) continue;
    target.userData.supportAnimationTarget = true;
    animatedTargets.push(target);
  }
  const animatedStats: Readonly<{ sourceMeshes: number; batches: number }>[] = [];
  for (const [index, target] of animatedTargets.entries()) {
    animatedStats.push(await batchAuthoredSupportStaticMeshes(target, family, `animated-${index + 1}`, true));
    await yieldPresentationCpuTask();
  }
  const cockpit = family === 'chopper' ? level.getObjectByName('chopper-first-person-cockpit') : null;
  const gunnerSightline = family === 'chopper' ? level.getObjectByName('chopper-gunner-sightline') : null;
  if (gunnerSightline) {
    gunnerSightline.userData.supportStaticBatchBoundary = true;
    gunnerSightline.userData.gunnerSightline = true;
    gunnerSightline.userData.firstPersonOnly = true;
  }
  const gunnerWeaponView = family === 'chopper' ? level.getObjectByName('chopper-gunner-weapon-view') : null;
  if (gunnerWeaponView) gunnerWeaponView.userData.supportStaticBatchBoundary = true;
  const gunnerWeaponStats = gunnerWeaponView
    ? await batchAuthoredSupportStaticMeshes(gunnerWeaponView, family, 'gunner-weapon')
    : Object.freeze({ sourceMeshes: 0, batches: 0 });
  await yieldPresentationCpuTask();
  const gunnerSightlineStats = gunnerSightline
    ? await batchAuthoredSupportStaticMeshes(gunnerSightline, family, 'gunner-sightline')
    : Object.freeze({ sourceMeshes: 0, batches: 0 });
  await yieldPresentationCpuTask();
  const cockpitStats = cockpit
    ? await batchAuthoredSupportStaticMeshes(cockpit, family, 'cockpit')
    : Object.freeze({ sourceMeshes: 0, batches: 0 });
  if (cockpit) cockpit.userData.supportStaticBatchBoundary = true;
  await yieldPresentationCpuTask();
  const aircraftFamily = family === 'care' || family === 'carpet' ? family : null;
  const mainWing = aircraftFamily ? level.getObjectByName(`${aircraftFamily}-aircraft-main-wing`) : null;
  // Keep the small bounded wing subtree authored and visible. Merging its
  // already-scaled left/right panels collapsed their evaluated span in the
  // retained template; the semantic node survived but the in-game craft read
  // as a fuselage-only slab. One aircraft is active at a time, so preserving
  // these few drawables is the correct quality/performance tradeoff.
  const wingStats = Object.freeze({ sourceMeshes: 0, batches: 0 });
  if (mainWing) mainWing.userData.supportStaticBatchBoundary = true;
  await yieldPresentationCpuTask();
  const exteriorStats = await batchAuthoredSupportStaticMeshes(level, family, 'exterior');
  level.userData.supportStaticBatchStats = Object.freeze({
    sourceMeshes: gunnerWeaponStats.sourceMeshes + gunnerSightlineStats.sourceMeshes + cockpitStats.sourceMeshes
      + wingStats.sourceMeshes + exteriorStats.sourceMeshes
      + animatedStats.reduce((total, stats) => total + stats.sourceMeshes, 0),
    batches: gunnerWeaponStats.batches + gunnerSightlineStats.batches + cockpitStats.batches
      + wingStats.batches + exteriorStats.batches
      + animatedStats.reduce((total, stats) => total + stats.batches, 0),
    animatedTargets: animatedTargets.length,
    wingBatches: wingStats.batches,
  });
  if (aircraftFamily) level.userData.aircraftWingVisibility = supportAircraftWingVisibility(level, aircraftFamily);
  level.userData.supportStaticBatchOptimized = true;
  await yieldPresentationCpuTask();
}

type PresentedEntityPoolKey = 'chopper' | 'care-aircraft' | 'carpet-aircraft' | 'care-crate' | 'piloted-drone' | 'swarm-drone';

function presentedEntityPoolKey(entity: KillstreakEntitySnapshot): PresentedEntityPoolKey {
  if (entity.kind === 'chopper') return 'chopper';
  if (entity.kind === 'care-crate') return 'care-crate';
  if (entity.kind === 'drone') return entity.mode === 'piloted' ? 'piloted-drone' : 'swarm-drone';
  return supportAircraftPresentationVariant(entity.id) === 'carpet' ? 'carpet-aircraft' : 'care-aircraft';
}

function buildPresentedEntityForPool(key: PresentedEntityPoolKey): PresentedEntity {
  const requiredAuthored = (family: SupportVehicleAssetFamily, fallback: () => PresentedEntity): PresentedEntity => {
    const authored = buildAuthoredSupportVehicle(family);
    if (authored) return authored;
    if (typeof document !== 'undefined' && supportVehicleLoadState === 'ready') {
      throw new Error(`${family}: authored support presentation disappeared after the release load barrier`);
    }
    return fallback();
  };
  if (key === 'chopper') return requiredAuthored('chopper', buildProceduralChopperFallback);
  if (key === 'care-aircraft') return requiredAuthored('care', () => buildProceduralAircraftFallback('care'));
  if (key === 'carpet-aircraft') return requiredAuthored('carpet', () => buildProceduralAircraftFallback('carpet'));
  if (key === 'care-crate') return requiredAuthored('crate', buildProceduralCareCrateFallback);
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
  launchPosition: THREE.Vector3;
  active: boolean;
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

export type KillstreakCarpetWorkflowTelemetry = Readonly<{
  impactFlashes: number;
  bombShells: number;
  emberParticles: number;
  markers: readonly Readonly<Pick<KillstreakPlacementMarkerTelemetry,
    'id' | 'source' | 'shape' | 'audience' | 'corridorLengthM' | 'colourHexes'
    | 'depthTest' | 'writesDepth' | 'raycastDisabled' | 'visible'>>[];
}>;

type FirstPersonCockpitAlignmentTelemetry = Readonly<{
  cameraWorldPosition: readonly number[];
  cameraPivotWorldPosition: readonly number[];
  cockpitWorldPosition: readonly number[];
  parentName: string;
  parentWorldScale: readonly number[];
  pivotErrorM: number;
  dashboardCameraSpacePosition: readonly number[] | null;
  hudCameraSpacePosition: readonly number[] | null;
  weaponCameraSpacePosition: readonly number[] | null;
}>;

export type KillstreakPresentationTelemetry = Readonly<{
  entities: number;
  impactFlashes: number;
  bombShells: number;
  emberParticles: number;
  sensorContacts: number;
  sensorProxyMeshes: 0;
  sensorPresentation: 'shared-exact-animated-thermal-operator';
  placementMarkers: number;
  prewarmed: number;
  pooledEntityInstances: number;
  pooledSwarmDrones: number;
  swarmRenderBatches: number;
  swarmRenderedInstances: number;
  swarmVisibleRenderBatches: number;
  swarmMinimumRenderedInstances: number;
  swarmMaximumRenderedInstances: number;
  prewarmedAuthoredSupportFamilies: readonly string[];
  entityDetails: readonly Readonly<{
    entityId: string;
    rootName: string;
    poolKey: string;
    presentationSource: string;
    worldPosition: readonly number[];
    visible: boolean;
    visibleMeshCount: number;
    visibleBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
    stableAirframeMeshCount: number;
    stableAirframeBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
    drawableStableAirframeMeshCount: number;
    drawableStableAirframeBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
    stableAirframeDrawRejections: Readonly<{
      hierarchy: number;
      layer: number;
      material: number;
      frustum: number;
    }>;
    activeLodIndex: number | null;
    activeLodName: string | null;
    activeLodAsset: string | null;
    activeAircraftWing: SupportAircraftWingVisibility | null;
  }>[];
  chopperWeaponActionsPresented: number;
  chopperImpactActionsPresented: number;
  activeChopperActionNames: readonly string[];
  pooledChopperActionNames: readonly string[];
  lastChopperWeaponActions: readonly string[];
  chopperActionPlayback: readonly Readonly<{
    entityId: string;
    name: string;
    lodRootName: string;
    visible: boolean;
    running: boolean;
    timeSeconds: number;
    clipDurationSeconds: number;
    effectiveWeight: number;
  }>[];
  firstPersonSightline: Readonly<{
    entityId: string;
    presentationSource: string;
    visibleMeshNames: readonly string[];
    visibleOutsideSightline: readonly string[];
    visibleOutsideCockpit: readonly string[];
    dashboardVisible: boolean;
    displaysVisible: boolean;
    hudVisible: boolean;
    centreSightlineClear: boolean;
    weaponVisible: boolean;
    overlayLayerExclusive: boolean;
    alignment: FirstPersonCockpitAlignmentTelemetry | null;
  }> | null;
  markerDetails: readonly KillstreakPlacementMarkerTelemetry[];
  bounded: boolean;
}>;

export type KillstreakPresentationRetireRoot = (root: THREE.Object3D) => void;

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

function isGunnerSightlineNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.userData.gunnerSightline === true) return true;
    cursor = cursor.parent;
  }
  return false;
}

function isGunnerWeaponViewNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.name === 'chopper-gunner-weapon-view'
      || cursor.userData.gunnerWeaponPresentation === true) return true;
    cursor = cursor.parent;
  }
  return false;
}

function isGunnerCockpitNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (cursor.name === 'chopper-first-person-cockpit'
      || cursor.userData.firstPersonCockpit === true) return true;
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

const SUPPORT_STABLE_AIRFRAME_EXCLUDED_SUBTREES = Object.freeze(new Set([
  'chopper-first-person-cockpit',
  'chopper-gunner-sightline',
  'chopper-gunner-weapon-view',
  'chopper-muzzle-flash',
  'chopper-tracer-action',
  'chopper-impact-action',
]));

function isStableAirframeReviewNode(root: THREE.Object3D, node: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = node;
  while (cursor && cursor !== root) {
    if (SUPPORT_STABLE_AIRFRAME_EXCLUDED_SUBTREES.has(cursor.name)
      || cursor.userData.firstPersonOnly === true
      || cursor.userData.gunnerSightline === true
      || cursor.userData.gunnerWeaponPresentation === true) return false;
    cursor = cursor.parent;
  }
  return true;
}

export function authoredSupportStaticBatchBudget(root: THREE.Object3D): AuthoredSupportStaticBatchBudget {
  root.updateWorldMatrix(true, true);
  const stats = root.userData.supportStaticBatchStats as Readonly<{
    sourceMeshes?: number;
    batches?: number;
  }> | undefined;
  const visibleMaterials = new Set<THREE.Material>();
  const stableVisibleMaterials = new Set<THREE.Material>();
  const exteriorBatchMaterials = new Set<THREE.Material>();
  const visibleBounds = new THREE.Box3();
  const rearTailBatchBounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let retiredSourceMeshes = 0;
  let batchOutputMeshes = 0;
  let visibleMeshes = 0;
  let stableVisibleMeshes = 0;
  let exteriorBatchMeshes = 0;
  let rearTailBatchMeshes = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const retired = node.userData.staticBatchRendered === true
      && node.userData.supportStaticBatchOutput !== true;
    if (retired) retiredSourceMeshes += 1;
    if (node.userData.supportStaticBatchOutput === true) batchOutputMeshes += 1;
    if (!visibleThroughAncestor(root, node)) return;
    node.geometry.computeBoundingBox();
    if (node.geometry.boundingBox && !node.geometry.boundingBox.isEmpty()) {
      meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
      visibleBounds.union(meshBounds);
    }
    visibleMeshes += 1;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) visibleMaterials.add(material);
    if (node.userData.supportStaticBatchOutput === true
      && node.userData.supportStaticBatchScope === 'exterior') {
      exteriorBatchMeshes += 1;
      for (const material of materials) exteriorBatchMaterials.add(material);
    }
    if (isStableAirframeReviewNode(root, node)) {
      stableVisibleMeshes += 1;
      for (const material of materials) stableVisibleMaterials.add(material);
    }
    if (materials.some((material) => material.name === CHOPPER_REAR_TAIL_MATERIAL_NAME)) {
      rearTailBatchMeshes += 1;
      if (node.geometry.boundingBox && !node.geometry.boundingBox.isEmpty()) rearTailBatchBounds.union(meshBounds);
    }
  });
  const frozenBounds = (bounds: THREE.Box3): Readonly<{ min: readonly number[]; max: readonly number[] }> | null => (
    bounds.isEmpty() ? null : Object.freeze({
      min: Object.freeze(bounds.min.toArray()),
      max: Object.freeze(bounds.max.toArray()),
    })
  );
  return Object.freeze({
    sourceMeshes: Number(stats?.sourceMeshes ?? 0),
    batches: Number(stats?.batches ?? 0),
    retiredSourceMeshes,
    batchOutputMeshes,
    visibleMeshes,
    visibleMaterials: visibleMaterials.size,
    stableVisibleMeshes,
    stableVisibleMaterials: stableVisibleMaterials.size,
    exteriorBatchMeshes,
    exteriorBatchMaterials: exteriorBatchMaterials.size,
    visibleBounds: frozenBounds(visibleBounds),
    rearTailBatchMeshes,
    rearTailBatchBounds: frozenBounds(rearTailBatchBounds),
  });
}

export function supportVehicleStableAirframeBounds(
  root: THREE.Object3D,
  camera?: THREE.Camera,
  submittedScene?: THREE.Scene,
): Readonly<{
  meshCount: number;
  bounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
  drawableMeshCount: number;
  drawableBounds: Readonly<{ min: readonly number[]; max: readonly number[] }> | null;
  drawRejections: Readonly<{ hierarchy: number; layer: number; material: number; frustum: number }>;
}> {
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3();
  const drawableBounds = new THREE.Box3();
  const meshBounds = new THREE.Box3();
  let meshCount = 0;
  let drawableMeshCount = 0;
  let hierarchyRejections = 0;
  let layerRejections = 0;
  let materialRejections = 0;
  let frustumRejections = 0;
  let frustum: THREE.Frustum | null = null;
  if (camera) {
    camera.updateWorldMatrix(true, false);
    frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      camera.coordinateSystem,
    );
  }
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)
      || !visibleThroughAncestor(root, node)
      || !isStableAirframeReviewNode(root, node)) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox || node.geometry.boundingBox.isEmpty()) return;
    meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    bounds.union(meshBounds);
    meshCount += 1;
    let hierarchyVisible = root.parent !== null;
    let terminalAncestor: THREE.Object3D = root;
    let ancestor: THREE.Object3D | null = root.parent;
    while (hierarchyVisible && ancestor) {
      hierarchyVisible = ancestor.visible;
      terminalAncestor = ancestor;
      ancestor = ancestor.parent;
    }
    hierarchyVisible &&= terminalAncestor instanceof THREE.Scene
      && (submittedScene === undefined || terminalAncestor === submittedScene);
    if (!hierarchyVisible) {
      hierarchyRejections += 1;
      return;
    }
    if (camera && !camera.layers.test(node.layers)) {
      layerRejections += 1;
      return;
    }
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((entry) => entry.visible && entry.colorWrite && entry.opacity > 0)) {
      materialRejections += 1;
      return;
    }
    if (frustum && node.frustumCulled && !frustum.intersectsObject(node)) {
      frustumRejections += 1;
      return;
    }
    drawableBounds.union(meshBounds);
    drawableMeshCount += 1;
  });
  return Object.freeze({
    meshCount,
    bounds: bounds.isEmpty() ? null : Object.freeze({
      min: Object.freeze(bounds.min.toArray()),
      max: Object.freeze(bounds.max.toArray()),
    }),
    drawableMeshCount,
    drawableBounds: drawableBounds.isEmpty() ? null : Object.freeze({
      min: Object.freeze(drawableBounds.min.toArray()),
      max: Object.freeze(drawableBounds.max.toArray()),
    }),
    drawRejections: Object.freeze({
      hierarchy: hierarchyRejections,
      layer: layerRejections,
      material: materialRejections,
      frustum: frustumRejections,
    }),
  });
}

const supportMaterialBaseDepthWrite = new WeakMap<THREE.Material, boolean>();
const SUPPORT_WORLD_RENDER_LAYER = 0;
const SUPPORT_FIRST_PERSON_RENDER_LAYER = 2;

function setSupportFirstPersonVisibility(root: THREE.Group, possessed: boolean): void {
  root.visible = true;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const gunnerSightlineNode = isGunnerSightlineNode(root, node);
    const gunnerWeaponViewNode = isGunnerWeaponViewNode(root, node);
    const gunnerSightBlocker = gunnerSightlineNode && !gunnerWeaponViewNode;
    const gunnerCockpitNode = isGunnerCockpitNode(root, node);
    const firstPersonOnlyNode = isFirstPersonOnlyNode(root, node);
    const retiredStaticSource = node.userData.staticBatchRendered === true
      && node.userData.supportStaticBatchOutput !== true;
    const overrideActive = node.userData.supportFirstPersonOverrideActive === true;
    if (possessed) {
      if (!overrideActive) {
        node.userData.supportBaseVisible = node.visible;
        node.userData.supportBaseLayerMask = node.layers.mask;
      }
      node.userData.supportFirstPersonOverrideActive = true;
      // The DOM reticle and authoritative camera ray already own the exact
      // centre. Retire the GLB combiner-glass/reticle subtree during
      // possession while retaining the off-centre gun receiver and authored
      // lower cockpit; two overlapping HUD lanes created the opaque block.
      node.visible = gunnerCockpitNode && !gunnerSightBlocker && !retiredStaticSource;
      if (gunnerCockpitNode) {
        // The complete cockpit is a first-person viewmodel. Keep optional
        // effects layers, but remove the ordinary world layer so both renderer
        // backends use the established isolated viewmodel vocabulary.
        node.layers.mask = (node.layers.mask & ~(1 << SUPPORT_WORLD_RENDER_LAYER))
          | (1 << SUPPORT_FIRST_PERSON_RENDER_LAYER);
      }
    } else if (overrideActive) {
      node.visible = node.userData.supportBaseVisible === true && !firstPersonOnlyNode;
      if (typeof node.userData.supportBaseLayerMask === 'number') {
        node.layers.mask = node.userData.supportBaseLayerMask;
      }
      node.userData.supportFirstPersonOverrideActive = false;
    } else if (firstPersonOnlyNode) {
      node.visible = false;
    }
    if (!node.material || !gunnerCockpitNode) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const entry of materials) {
      // Only transparent cockpit glass opts out of depth writes. The retained
      // gun is opaque and depth-correct; it must never inherit the retired HUD
      // subtree's overlay semantics and become see-through.
      if (!entry.transparent && entry.opacity >= 1) continue;
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
  const oneShotActions = new Map<string, THREE.AnimationAction[]>();
  for (const [index, source] of template.lods.entries()) {
    const level = source.scene.clone(true);
    level.name = `${runtimeName}-authored-lod${index}`;
    level.scale.setScalar(SUPPORT_VEHICLE_TARGET_DIMENSIONS[family] / Math.max(0.001, source.sourceMaxDimension));
    level.userData.presentationAsset = source.asset;
    const cockpit = level.getObjectByName('chopper-first-person-cockpit');
    if (cockpit) {
      cockpit.userData.firstPersonCockpit = true;
      cockpit.userData.firstPersonOnly = true;
    }
    const gunnerSightline = level.getObjectByName('chopper-gunner-sightline');
    if (gunnerSightline) {
      gunnerSightline.userData.gunnerSightline = true;
      gunnerSightline.userData.firstPersonOnly = true;
    }
    markSharedPresentationAsset(level);
    if (family === 'chopper') applyAuthoredSupportShadowBudget(level, 'chopper');
    // Support vehicles operate 18-30m above the arena, so the old 34m/68m
    // switches meant players almost never saw LOD0's full detailing - the
    // authored craft read as low-poly slabs. One or two active vehicles can
    // afford LOD0 at every practical gameplay distance.
    lod.addLevel(level, SUPPORT_VEHICLE_LOD_DISTANCES[index] ?? index * SUPPORT_VEHICLE_LOD_DISTANCES[1]);
    const mixer = new THREE.AnimationMixer(level);
    for (const clipName of SUPPORT_VEHICLE_LOOP_ACTIONS[family]) {
      const clip = source.animations.find((candidate) => candidate.name === clipName);
      if (clip) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
    }
    if (family === 'chopper') {
      for (const clipName of [
        'Chopper_Gun_Recoil',
        'Chopper_Gun_Fire',
        'Chopper_Muzzle_Flash',
        'Chopper_Tracer_Pulse',
        'Chopper_Impact_Pulse',
      ]) {
        const clip = source.animations.find((candidate) => candidate.name === clipName);
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
        const actions = oneShotActions.get(clipName) ?? [];
        actions.push(action);
        oneShotActions.set(clipName, actions);
      }
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
  return presentedEntity(root, null, mixers, true, oneShotActions);
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
  const rearFuselage = mesh(new THREE.CapsuleGeometry(0.66, 1.35, 6, 12), 0x1d3034, 'chopper-rear-fuselage');
  rearFuselage.rotation.x = Math.PI / 2;
  rearFuselage.position.z = 1.18;
  const tail = mesh(new THREE.BoxGeometry(0.18, 0.18, 2.25), 0x263a3f, 'chopper-tail-boom');
  tail.position.z = 1.95;
  const fin = mesh(new THREE.BoxGeometry(0.08, 0.75, 0.55), 0xe0b94f, 'chopper-tail-fin');
  fin.position.set(0, 0.35, 3.03);
  const belly = mesh(new THREE.BoxGeometry(1.12, 0.34, 2.15), 0x101b1f, 'chopper-armoured-belly');
  belly.position.set(0, -0.38, 0.08);
  const noseArmour = mesh(new THREE.BoxGeometry(0.94, 0.48, 0.72), 0x24383d, 'chopper-armoured-nose');
  noseArmour.position.set(0, -0.12, -1.52);
  noseArmour.rotation.x = -0.12;
  const stabilizer = mesh(new THREE.BoxGeometry(1.42, 0.06, 0.38), 0x263a3f, 'chopper-tail-stabilizer');
  stabilizer.position.set(0, 0.08, 2.62);
  const stubWings = [-1, 1].map((side) => {
    const wing = mesh(new THREE.BoxGeometry(1.02, 0.10, 0.48), 0x1c2d32, `chopper-stub-wing-${side}`);
    wing.position.set(side * 0.96, -0.13, 0.05);
    wing.rotation.z = side * -0.08;
    return wing;
  });
  const enginePods = [-1, 1].map((side) => {
    const pod = mesh(new THREE.CylinderGeometry(0.24, 0.29, 1.18, 12), 0x273b40, `chopper-engine-pod-${side}`);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 0.64, 0.28, 0.36);
    return pod;
  });
  const rocketPods = [-1, 1].map((side) => {
    const pod = mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.92, 12), 0x11191c, `chopper-rocket-pod-${side}`);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(side * 1.14, -0.28, -0.05);
    return pod;
  });
  const gun = mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.95, 10), 0x0b1012, 'chopper-player-gun');
  gun.rotation.x = Math.PI / 2;
  gun.position.set(0, -0.58, -0.72);
  const gunMuzzle = presentationSocket('chopper-gun-muzzle-socket', [0, -0.58, -1.24]);
  const forwardSocket = presentationSocket('chopper-forward-socket', [0, 0, -1.9]);
  const noseSensor = presentationSocket('chopper-nose-sensor', [0, -0.28, -1.72]);
  const muzzleFlashAction = presentationSocket('chopper-muzzle-flash', [0, -0.58, -1.24]);
  const tracerAction = presentationSocket('chopper-tracer-action', [0, -0.58, -1.24]);
  const impactAction = presentationSocket('chopper-impact-action', [0, -0.58, -1.24]);
  const cameraSocket = presentationSocket('chopper-first-person-camera-socket', [0, 0.18, -1.22]);
  const cockpit = new THREE.Group();
  cockpit.name = 'chopper-first-person-cockpit';
  cockpit.userData.firstPersonCockpit = true;
  cockpit.userData.firstPersonOnly = true;
  cockpit.position.copy(cameraSocket.position);
  const gunnerSightline = new THREE.Group();
  gunnerSightline.name = 'chopper-gunner-sightline';
  gunnerSightline.userData.gunnerSightline = true;
  gunnerSightline.userData.firstPersonOnly = true;
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
  const proceduralCockpitEndpoints = [
    presentationSocket('chopper-inner-windscreen-pillar-left-base', [-0.47, -0.22, -0.27]),
    presentationSocket('chopper-inner-windscreen-pillar-left-top', [-0.47, 0.26, -0.27]),
    presentationSocket('chopper-inner-windscreen-pillar-right-base', [0.47, -0.22, -0.27]),
    presentationSocket('chopper-inner-windscreen-pillar-right-top', [0.47, 0.26, -0.27]),
    presentationSocket('chopper-inner-windscreen-glow-left-base', [-0.47, -0.22, -0.285]),
    presentationSocket('chopper-inner-windscreen-glow-left-top', [-0.47, 0.26, -0.285]),
    presentationSocket('chopper-inner-windscreen-glow-right-base', [0.47, -0.22, -0.285]),
    presentationSocket('chopper-inner-windscreen-glow-right-top', [0.47, 0.26, -0.285]),
  ];
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
  const hudReticle = mesh(new THREE.BoxGeometry(0.18, 0.008, 0.008), 0x65ff9b, 'chopper-cockpit-hud-reticle');
  hudReticle.position.set(0, 0.02, -0.58);
  const gunnerWeaponView = new THREE.Group();
  gunnerWeaponView.name = 'chopper-gunner-weapon-view';
  gunnerWeaponView.userData.gunnerWeaponPresentation = true;
  const gunnerViewReceiver = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.34), 0x0b1012, 'chopper-gunner-view-receiver');
  gunnerViewReceiver.position.set(0.31, -0.19, -0.34);
  gunnerViewReceiver.rotation.x = -0.10;
  const gunnerViewBarrel = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.48, 8), 0x657478, 'chopper-gunner-view-barrel');
  gunnerViewBarrel.rotation.x = Math.PI / 2;
  gunnerViewBarrel.position.set(0.31, -0.16, -0.61);
  gunnerWeaponView.add(gunnerViewReceiver, gunnerViewBarrel);
  gunnerSightline.add(hudGlass, hudTargetRing, hudReticle, gunnerWeaponView);
  cockpit.add(
    dashboard, cockpitRailLeft, cockpitRailRight, ...proceduralCockpitEndpoints,
    cyanDisplay, greenDisplay, gunnerSightline,
  );
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
  root.add(
    fuselage, rearFuselage, canopy, glareshield, belly, noseArmour, tail, fin, stabilizer,
    ...stubWings, ...enginePods, ...rocketPods,
    gun, gunMuzzle, forwardSocket, noseSensor, muzzleFlashAction, tracerAction, impactAction,
    cameraSocket, cockpit, rotor, tailRotor, ...skids,
  );
  root.userData.forwardAxis = [0, 0, -1];
  root.userData.audioSemanticIds = ['chopper-low-loop', 'chopper-gun-report'];
  root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
  root.userData.presentationSource = 'procedural-non-release-fallback';
  root.scale.setScalar(0.82);
  return presentedEntity(root, rotor, [], false);
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
  return presentedEntity(root, null, [], false);
}

function buildDrone(mode: 'piloted' | 'swarm' | null): PresentedEntity {
  if (hunterDroneTemplate && hunterDroneLoadState === 'ready') {
    const root = hunterDroneTemplate.clone(true);
    root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
    root.scale.setScalar(HUNTER_DRONE_TARGET_MAX_DIMENSION / Math.max(0.001, hunterDroneSourceMaxDimension));
    root.userData.pass65KillstreakPresentation = true;
    root.userData.authoredHunterDrone = true;
    root.userData.presentationFamilyId = DRONE_PRESENTATION_FAMILY_ID;
    root.userData.gunProfileId = DRONE_SUPPORT_DEFINITIONS[mode ?? 'swarm'].gunProfileId;
    root.userData.forwardAxis = [0, 0, -1];
    root.userData.weaponFeedback = [...SUPPORT_WEAPON_FEEDBACK_CONTRACT];
    markSharedPresentationAsset(root);
    applyAuthoredSupportShadowBudget(root, 'drone');
    const mixer = new THREE.AnimationMixer(root);
    for (const clipName of HUNTER_DRONE_LOOP_ACTIONS) {
      const clip = hunterDroneAnimations.find((candidate) => candidate.name === clipName);
      if (clip) mixer.clipAction(clip).play();
    }
    if (mode === 'swarm') attachPass70DroneSwarmBodyMarks(root);
    return presentedEntity(root, null, [mixer], true);
  }
  const root = new THREE.Group();
  root.name = mode === 'piloted' ? 'pass65-piloted-drone' : 'pass65-swarm-drone';
  root.userData.pass65KillstreakPresentation = true;
  root.userData.presentationFamilyId = DRONE_PRESENTATION_FAMILY_ID;
  root.userData.gunProfileId = DRONE_SUPPORT_DEFINITIONS[mode ?? 'swarm'].gunProfileId;
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
  if (mode === 'swarm') attachPass70DroneSwarmBodyMarks(root);
  root.userData.presentationSource = 'procedural-non-release-fallback';
  return presentedEntity(root, rotor, [], false);
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
  return presentedEntity(root, canopy, [], false);
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
    const corridor = new THREE.Mesh(CARPET_MARKER_UNIT_BOX_GEOMETRY, placementMarkerMaterial(0.1));
    corridor.name = 'carpet-bomber-flight-corridor';
    corridor.scale.set(length, 0.025, corridorWidthM);
    corridor.renderOrder = 17;
    corridor.raycast = disabledPlacementMarkerRaycast;
    const centre = new THREE.Mesh(CARPET_MARKER_UNIT_BOX_GEOMETRY, placementMarkerMaterial(0.84));
    centre.name = 'carpet-bomber-flight-centreline';
    centre.scale.set(length, 0.045, 0.18);
    centre.renderOrder = 18;
    centre.raycast = disabledPlacementMarkerRaycast;
    const railWidth = Math.min(0.2, corridorWidthM * 0.08);
    const leftRail = new THREE.Mesh(CARPET_MARKER_UNIT_BOX_GEOMETRY, placementMarkerMaterial(0.66));
    leftRail.name = 'carpet-bomber-flight-corridor-left-edge';
    leftRail.scale.set(length, 0.04, railWidth);
    leftRail.position.z = -(corridorWidthM - railWidth) * 0.5;
    leftRail.renderOrder = 18;
    leftRail.raycast = disabledPlacementMarkerRaycast;
    const rightRail = new THREE.Mesh(CARPET_MARKER_UNIT_BOX_GEOMETRY, placementMarkerMaterial(0.66));
    rightRail.name = 'carpet-bomber-flight-corridor-right-edge';
    rightRail.scale.set(length, 0.04, railWidth);
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
    if (typeof node.geometry.userData[GPU_SHARED_GEOMETRY_KEY] !== 'string') node.geometry.dispose();
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
    launchPosition: new THREE.Vector3(),
    active: false,
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
  private readonly liveEntityIds = new Set<string>();
  private readonly activeSwarmEntries: PresentedEntity[] = [];
  private readonly swarmInverseRootMatrix = new THREE.Matrix4();
  private readonly swarmInstanceMatrix = new THREE.Matrix4();
  private readonly swarmSourceWorldMatrix = new THREE.Matrix4();
  private readonly firstPersonAnchorScratch = new THREE.Vector3();
  private readonly firstPersonForwardScratch = new THREE.Vector3();
  private readonly firstPersonSocketQuaternionScratch = new THREE.Quaternion();
  private readonly firstPersonRootQuaternionScratch = new THREE.Quaternion();
  private readonly firstPersonCockpitCameraPivot = new WeakMap<THREE.Object3D, THREE.Vector3>();
  private readonly firstPersonCockpitSocketWorldScratch = new THREE.Vector3();
  private readonly firstPersonCockpitDesiredParentScratch = new THREE.Vector3();
  private readonly firstPersonCockpitPivotOffsetScratch = new THREE.Vector3();
  private visibleSensorContacts = 0;
  private chopperWeaponActionsPresented = 0;
  private chopperImpactActionsPresented = 0;
  private lastChopperWeaponActions: readonly string[] = Object.freeze([]);
  private firstPersonEntityId: string | null = null;
  private firstPersonCockpitAlignment: FirstPersonCockpitAlignmentTelemetry | null = null;
  private disposed = false;
  private readonly placementMarkers = new Map<string, PresentedPlacementMarker>();
  private readonly locallyExpiredMarkerRevisions = new Map<string, number>();
  private readonly placementMarkerSnapshotIds = new Set<string>();
  private readonly livePlacementMarkerIds = new Set<string>();
  private gpuPrewarmGeneration = -1;
  private gpuPrewarmPromise: Promise<void> | null = null;
  private gpuPrewarmActive = false;
  private disposalFinalized = false;

  constructor(
    private readonly submittedScene: THREE.Scene,
    private readonly retireRoot: KillstreakPresentationRetireRoot = disposeRoot,
    private readonly useStorageSwarmMatrices = false,
  ) {
    this.root.name = 'pass65-killstreak-presentations';
    this.root.userData.presentationOnly = true;
    this.submittedScene.add(this.root);
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
  }

  private static readonly PREWARMED_CAPACITIES: readonly [PresentedEntityPoolKey, number][] = Object.freeze([
    ['chopper', 1],
    ['care-aircraft', 1],
    ['carpet-aircraft', 1],
    ['piloted-drone', 1],
    ['swarm-drone', 24],
    ['care-crate', 1],
  ]);

  private installPrewarmedPoolEntry(key: PresentedEntityPoolKey, index: number): PresentedEntity {
    const entry = buildPresentedEntityForPool(key);
    entry.root.userData.poolActiveName = entry.root.name;
    entry.root.userData.presentationPoolKey = key;
    entry.root.userData.presentationPoolIndex = index;
    entry.root.userData.presentationPoolInUse = false;
    entry.root.name = `prewarmed-${key}-${index + 1}`;
    entry.root.visible = false;
    this.prewarmed.push(entry);
    this.root.add(entry.root);
    return entry;
  }

  private finalizePrewarmedVocabulary(): void {
    for (const entry of this.prewarmed) entry.root.userData.prewarmed = true;
    this.installSwarmInstancing();
  }

  private installPrewarmedVocabulary(): void {
    for (const [key, capacity] of KillstreakPresentation.PREWARMED_CAPACITIES) {
      const pool: PresentedEntity[] = [];
      for (let index = 0; index < capacity; index += 1) {
        pool.push(this.installPrewarmedPoolEntry(key, index));
      }
      this.entityPools.set(key, pool);
    }
    this.finalizePrewarmedVocabulary();
  }

  private async installPrewarmedVocabularyBatched(): Promise<void> {
    for (const [key, capacity] of KillstreakPresentation.PREWARMED_CAPACITIES) {
      const pool: PresentedEntity[] = [];
      for (let index = 0; index < capacity; index += 1) {
        pool.push(this.installPrewarmedPoolEntry(key, index));
        await yieldPresentationCpuTask();
      }
      this.entityPools.set(key, pool);
    }
    await yieldPresentationPreparation();
    for (const entry of this.prewarmed) entry.root.userData.prewarmed = true;
    await this.installSwarmInstancingBatched();
  }

  private *installSwarmInstancingSteps(): Generator<void, void, void> {
    const pool = this.entityPools.get('swarm-drone') ?? [];
    const animatedTargetNames = new Set(activeSwarmAnimationTargetNames());
    // Procedural non-release fallback drones rotate this authored group
    // directly rather than through an AnimationClip.
    for (const entry of pool) {
      if (!entry.authored && entry.rotor?.name) animatedTargetNames.add(entry.rotor.name);
    }
    const sourceMeshes: THREE.Mesh[][] = [];
    for (const entry of pool) {
      const meshes: THREE.Mesh[] = [];
      entry.root.traverse((node) => {
        if (node instanceof THREE.Mesh && !(node instanceof THREE.InstancedMesh)) meshes.push(node);
      });
      sourceMeshes.push(meshes);
      yield;
    }
    const primitiveCount = sourceMeshes[0]?.length ?? 0;
    if (primitiveCount === 0 || sourceMeshes.some((meshes) => meshes.length !== primitiveCount)) return;
    for (const entry of pool) {
      entry.root.updateWorldMatrix(true, true);
      yield;
    }

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
      instanced.castShadow = representative.castShadow;
      instanced.receiveShadow = representative.receiveShadow;
      instanced.renderOrder = representative.renderOrder;
      instanced.frustumCulled = false;
      instanced.raycast = () => undefined;
      // The authored matrices move every frame. On the owner's r185 WebGPU path,
      // DynamicDrawUsage avoids a repeatable first-live-update stall; the exact
      // isolated A/B is retained by the endurance gate.
      instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
      yield;
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
        return cloneAuthoredSupportStaticGeometryForTransform(source.geometry, localMatrix);
      });
      const merged = mergeGeometries(transformed, false);
      for (const geometry of transformed) geometry.dispose();
      if (!merged) return false;
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
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
      yield;
    }
    for (const group of dynamicGroups.values()) {
      const anchors = pool.map((entry) => entry.root.getObjectByName(group.targetName)).filter((entry): entry is THREE.Object3D => Boolean(entry));
      if (!mergeBatch(group.primitiveIndices, anchors)) individualIndices.push(...group.primitiveIndices);
      yield;
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
      yield;
    }
    for (const meshes of sourceMeshes) {
      for (const source of meshes) {
        source.visible = false;
        source.castShadow = false;
        source.userData.swarmInstanceSource = true;
      }
      yield;
    }
  }

  private installSwarmInstancing(): void {
    for (const _ of this.installSwarmInstancingSteps()) {
      // The constructor's procedural/headless fallback remains synchronous.
    }
  }

  private async installSwarmInstancingBatched(): Promise<void> {
    for (const _ of this.installSwarmInstancingSteps()) await yieldPresentationPreparation();
  }

  private disposeSwarmInstancing(): void {
    for (const batch of this.swarmInstanceBatches) {
      this.disposeSwarmInstanceBatch(batch);
    }
    this.swarmInstanceBatches.length = 0;
  }

  private disposeSwarmInstanceBatch(batch: SwarmInstanceBatch): void {
    batch.root.removeFromParent();
    batch.root.dispose();
    if (batch.ownsGeometry) batch.root.geometry.dispose();
  }

  private async disposeSwarmInstancingBatched(): Promise<void> {
    for (const batch of this.swarmInstanceBatches) {
      this.disposeSwarmInstanceBatch(batch);
      await yieldPresentationPreparation();
    }
    this.swarmInstanceBatches.length = 0;
  }

  private syncSwarmInstancing(): void {
    if (this.swarmInstanceBatches.length === 0) return;
    const active = this.activeSwarmEntries;
    active.length = 0;
    for (const entry of this.entities.values()) {
      if (entry.root.userData.presentationPoolKey === 'swarm-drone') active.push(entry);
    }
    this.root.updateWorldMatrix(true, false);
    const inverseRoot = this.swarmInverseRootMatrix.copy(this.root.matrixWorld).invert();
    const instanceMatrix = this.swarmInstanceMatrix;
    const sourceWorldMatrix = this.swarmSourceWorldMatrix;
    for (const entry of active) entry.root.updateWorldMatrix(true, false);
    for (const batch of this.swarmInstanceBatches) {
      for (let instanceIndex = 0; instanceIndex < active.length; instanceIndex += 1) {
        const entry = active[instanceIndex]!;
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
      batch.root.count = active.length;
      batch.root.visible = active.length > 0;
      batch.root.instanceMatrix.needsUpdate = true;
    }
  }

  async prewarmAuthoredAssets(): Promise<void> {
    if (this.disposed) throw new Error('Cannot rebuild a disposed killstreak presentation pool');
    if (this.gpuPrewarmPromise) throw new Error('Cannot rebuild killstreak presentation assets during GPU prewarm');
    if (this.entities.size > 0) return;
    this.gpuPrewarmGeneration = -1;
    await this.disposeSwarmInstancingBatched();
    for (const entry of this.prewarmed) {
      this.retireRoot(entry.root);
      await yieldPresentationPreparation();
    }
    this.prewarmed.length = 0;
    this.entityPools.clear();
    await this.installPrewarmedVocabularyBatched();
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
    // share geometry and materials. Submit every bounded instance before any
    // of them can enter a live frame. Keep the complete vocabulary in one
    // bounded submission: compileAndRender already owns a queue fence and a
    // complete TSL/HDR frame, so splitting these roots repeated that full frame
    // and its fence for each arbitrary pair without reducing the amount of
    // support geometry that had to be compiled.
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
    const overlayRoots: THREE.Object3D[] = [...stagedMarkerRoots];
    const stagedBatches = [[...entityRoots, ...effectRoots, ...overlayRoots]].filter((batch) => batch.length > 0);
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
    const possessedLayerMasks = new Map<THREE.Mesh, number>();
    const chopperRoot = this.entityPools.get('chopper')?.[0]?.root ?? null;
    const rootVisible = this.root.visible;
    const rootFrustumCulled = this.root.frustumCulled;
    this.root.visible = true;
    this.root.frustumCulled = false;

    for (const [stagedRootIndex, stagedRoot] of stagedRoots.entries()) {
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
      if (typeof document !== 'undefined'
        && (stagedRootIndex + 1) % PREWARM_STATE_ROOTS_PER_TASK === 0
        && stagedRootIndex + 1 < stagedRoots.length) {
        await yieldPresentationCpuTask();
      }
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
      // A zero-count compile creates shader objects but skips the instanced
      // draw and storage upload. Submit the exact bounded formation while the
      // deployment surface is opaque so first live activation is allocation-free.
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
        if (typeof document !== 'undefined' && batchIndex + 1 < stagedBatches.length) {
          await yieldPresentationPreparation();
        }
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
      // LOD render objects are cached per concrete Object3D. The previous
      // 24/50/88m passes all selected LOD0 after the authored thresholds moved
      // to 0/95/190m, so the first close production-scale view and both farther
      // visibility graphs remained cold. Rehearse one near-field LOD0 frame at
      // the evidence scale, then one frame inside each derived farther band.
      // The shipped camera ends at 180m, below LOD2's 190m threshold; widen it
      // only for these hidden fenced submissions and restore it before the
      // possessed-cockpit pass.
      const projectionCamera = camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
        ? camera
        : null;
      const originalPrewarmFar = projectionCamera?.far ?? null;
      const requiredPrewarmFar = SUPPORT_VEHICLE_PREWARM_DISTANCES[2]
        + Math.max(...Object.values(SUPPORT_VEHICLE_TARGET_DIMENSIONS));
      if (projectionCamera && projectionCamera.far < requiredPrewarmFar) {
        projectionCamera.far = requiredPrewarmFar;
        projectionCamera.updateProjectionMatrix();
      }
      try {
        for (const [passIndex, distance] of SUPPORT_VEHICLE_PREWARM_DISTANCES.entries()) {
          stageBatchInView(liveActivationRoots, distance, 2.5);
          for (const entry of liveActivationEntries) {
            for (const mixer of entry.mixers) mixer.setTime(0.35 + passIndex * 0.4);
          }
          camera.updateWorldMatrix(true, false);
          this.root.updateWorldMatrix(true, false);
          for (const liveRoot of liveActivationRoots) {
            // stageBatchInView mutates the pooled roots after the previous
            // forced frame. Refresh their descendants before selecting LOD;
            // otherwise node.update(camera) reads the prior pass's matrix and
            // rehearses every band one submission late.
            liveRoot.updateWorldMatrix(false, true);
            liveRoot.traverse((node) => {
              if (node instanceof THREE.LOD) node.update(camera);
            });
          }
          await runtime.compileAndRender(this.root, camera, parentScene);
        }
      } finally {
        if (projectionCamera && originalPrewarmFar !== null && projectionCamera.far !== originalPrewarmFar) {
          projectionCamera.far = originalPrewarmFar;
          projectionCamera.updateProjectionMatrix();
        }
      }
      for (const liveRoot of liveActivationRoots) liveRoot.visible = false;
      if (chopperRoot) {
        chopperRoot.visible = true;
        chopperRoot.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const gunnerSightlineNode = isGunnerSightlineNode(chopperRoot, node);
          const gunnerCockpitNode = isGunnerCockpitNode(chopperRoot, node);
          const retiredStaticSource = node.userData.staticBatchRendered === true
            && node.userData.supportStaticBatchOutput !== true;
          node.visible = gunnerCockpitNode && !retiredStaticSource;
          if (!gunnerCockpitNode) return;
          possessedLayerMasks.set(node, node.layers.mask);
          node.layers.mask = (node.layers.mask & ~(1 << SUPPORT_WORLD_RENDER_LAYER))
            | (1 << SUPPORT_FIRST_PERSON_RENDER_LAYER);
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const entry of materials) {
            if (!gunnerSightlineNode && !entry.transparent && entry.opacity >= 1) continue;
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
      for (const [node, layerMask] of possessedLayerMasks) node.layers.mask = layerMask;
      for (const [lod, autoUpdate] of lodStates) lod.autoUpdate = autoUpdate;
      for (const [stagedRootIndex, stagedRoot] of stagedRoots.entries()) {
        stagedRoot.traverse((node) => {
          node.visible = !originallyHiddenNodes.has(node);
          node.frustumCulled = !originallyUnculledNodes.has(node);
        });
        if (typeof document !== 'undefined'
          && (stagedRootIndex + 1) % PREWARM_STATE_ROOTS_PER_TASK === 0
          && stagedRootIndex + 1 < stagedRoots.length) {
          await yieldPresentationCpuTask();
        }
      }
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
    presented.attitudeTarget.identity();
    presented.attitudeEuler.set(0, 0, 0, 'YXZ');
    delete presented.root.userData.supportSnapshotPhase;
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
    shell.root.rotation.set(Math.PI / 2, 0, 0);
    shell.root.scale.setScalar(1);
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
  ): void {
    const admittedCount = Math.min(snapshot.entities.length, MAX_PRESENTED_ENTITIES);
    const liveIds = this.liveEntityIds;
    liveIds.clear();
    for (let index = 0; index < admittedCount; index += 1) liveIds.add(snapshot.entities[index]!.id);
    for (const [id, presented] of this.entities) {
      if (liveIds.has(id)) continue;
      if (id === this.firstPersonEntityId) setSupportFirstPersonVisibility(presented.root, false);
      this.releasePresentedEntity(presented);
      this.entities.delete(id);
    }
    for (let index = 0; index < admittedCount; index += 1) {
      const entity = snapshot.entities[index]!;
      let presented = this.entities.get(entity.id);
      const firstProjection = presented === undefined;
      if (!presented) {
        presented = this.acquirePresentedEntity(entity);
        this.entities.set(entity.id, presented);
        if (presented.root.parent !== this.root) this.root.add(presented.root);
        if (presented.root.userData.presentationPoolKey !== 'swarm-drone') {
          setSupportFirstPersonVisibility(presented.root, entity.id === this.firstPersonEntityId);
        }
      }
      presented.target.fromArray(entity.position);
      presented.attitudeEuler.set(entity.attitude[0], entity.attitude[1], entity.attitude[2], 'YXZ');
      presented.attitudeTarget.setFromEuler(presented.attitudeEuler);
      const possessed = entity.id === this.firstPersonEntityId;
      const phaseReset = !firstProjection && presented.root.userData.supportSnapshotPhase !== entity.phase;
      const teleported = !firstProjection && presented.root.position.distanceToSquared(presented.target) > 64;
      if (firstProjection || phaseReset || teleported || possessed) {
        // Possessed entities are refreshed at frame cadence while possessed
        // (see refreshLocalKillstreakSnapshot), so an exact snap is already
        // smooth at high refresh rates and the camera/HUD ray never lags the
        // authoritative pose. Only remote observers lerp between snapshots.
        presented.root.position.copy(presented.target);
        // Preserve the canonical authored YXZ components on deterministic
        // snaps; assigning the equivalent quaternion can re-express the Euler
        // triplet near a gimbal boundary even though orientation is unchanged.
        presented.root.rotation.copy(presented.attitudeEuler);
      } else {
        // Sparse-snapshot presentation smoothing keeps remote support craft
        // from stepping at the 20 Hz recipient-snapshot cadence.
        const blend = 0.38;
        presented.root.position.lerp(presented.target, blend);
        presented.root.quaternion.slerp(presented.attitudeTarget, blend);
      }
      presented.root.userData.supportSnapshotPhase = entity.phase;
      for (const mixer of presented.mixers) mixer.setTime(nowMs / 1_000);
      if (!presented.authored) {
        if (presented.rotor) presented.rotor.rotation.y += entity.kind === 'chopper' ? 0.72 : 1.1;
        const tailRotor = presented.root.getObjectByName('chopper-tail-rotor');
        if (tailRotor) tailRotor.rotation.x += 1.35;
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
    this.syncSwarmInstancing();
    this.syncSensorContacts(snapshot.sensorContacts);
    this.syncPlacementMarkers(snapshot.placementMarkers, snapshot.revision, nowMs);
    for (const flash of this.impactFlashPool) {
      if (!flash.active) continue;
      const lifetimeMs = flash.expiresAtMs - flash.createdAtMs;
      const remaining = THREE.MathUtils.clamp((flash.expiresAtMs - nowMs) / lifetimeMs, 0, 1);
      flash.root.scale.setScalar(flash.baseRadius * (
        1 + (1 - remaining) * (CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE - 1)
      ));
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
      shell.root.position.lerpVectors(shell.launchPosition, shell.impactPosition, progress);
      if (progress >= 1) this.deactivateBombShell(shell);
    }
  }

  private syncSensorContacts(contacts: readonly DroneSensorContact[]): void {
    this.visibleSensorContacts = Math.min(contacts.length, MAX_SENSOR_CONTACTS);
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
    if (markers.length === 0) {
      for (const presented of this.placementMarkers.values()) this.retireRoot(presented.root);
      this.placementMarkers.clear();
      this.locallyExpiredMarkerRevisions.clear();
      return;
    }
    const markerIds = this.placementMarkerSnapshotIds;
    markerIds.clear();
    for (const marker of markers) markerIds.add(marker.id);
    for (const [id, expiredRevision] of this.locallyExpiredMarkerRevisions) {
      if (!markerIds.has(id) || snapshotRevision > expiredRevision) this.locallyExpiredMarkerRevisions.delete(id);
    }
    const liveIds = this.livePlacementMarkerIds;
    liveIds.clear();
    let admittedCount = 0;
    for (const marker of markers) {
      if (marker.expiresInMs <= 0 || this.locallyExpiredMarkerRevisions.get(marker.id) === snapshotRevision) continue;
      liveIds.add(marker.id);
      admittedCount += 1;
      if (admittedCount >= MAX_PLACEMENT_MARKERS) break;
    }
    for (const [id, presented] of this.placementMarkers) {
      if (liveIds.has(id)) continue;
      this.retireRoot(presented.root);
      this.placementMarkers.delete(id);
    }
    admittedCount = 0;
    for (const marker of markers) {
      if (marker.expiresInMs <= 0 || this.locallyExpiredMarkerRevisions.get(marker.id) === snapshotRevision) continue;
      const existing = this.placementMarkers.get(marker.id);
      if (existing) {
        existing.snapshot = marker;
        if (existing.snapshotRevision !== snapshotRevision) {
          existing.snapshotRevision = snapshotRevision;
          existing.expiresAtMs = nowMs + marker.expiresInMs;
        }
        admittedCount += 1;
        if (admittedCount >= MAX_PLACEMENT_MARKERS) break;
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
      admittedCount += 1;
      if (admittedCount >= MAX_PLACEMENT_MARKERS) break;
    }
  }

  presentImpacts(impacts: readonly KillstreakImpactEvent[], nowMs: number): void {
    for (const impact of impacts) {
      const isCarpet = impact.source === 'carpet-bomber';
      const isChopperMissile = impact.source === 'chopper';
      if ((isCarpet || isChopperMissile) && impact.phase === 'drop') {
        const shell = firstInactive(this.bombShellPool);
        if (!shell) continue;
        shell.active = true;
        shell.createdAtMs = nowMs;
        const authoredDropDurationMs = THREE.MathUtils.clamp(
          impact.impactAtMs - impact.atMs,
          1,
          isChopperMissile ? CHOPPER_MISSILE_FLIGHT_MS : BOMB_SHELL_DROP_DURATION_MS,
        );
        shell.impactAtMs = nowMs + authoredDropDurationMs;
        shell.impactPosition.set(impact.position[0], impact.position[1] + 0.35, impact.position[2]);
        if (isChopperMissile && impact.launchPosition) shell.launchPosition.fromArray(impact.launchPosition);
        else shell.launchPosition.set(
          impact.position[0],
          impact.position[1] + CARPET_BOMB_SHELL_PRESENTATION_ALTITUDE_M,
          impact.position[2],
        );
        shell.root.name = isChopperMissile ? 'pass70-chopper-missile-shell' : 'pass65-carpet-bomb-shell';
        shell.root.rotation.x = isChopperMissile ? 0 : Math.PI / 2;
        shell.root.scale.set(
          isChopperMissile ? 1.6 : 1,
          isChopperMissile ? 3.5 : 1,
          isChopperMissile ? 1.6 : 1,
        );
        shell.root.material.color.setHex(isChopperMissile ? 0xb09a58 : 0x2a2a2a);
        shell.root.position.copy(shell.launchPosition);
        if (isChopperMissile) {
          shell.root.lookAt(shell.impactPosition);
          shell.root.rotateX(Math.PI / 2);
        }
        shell.root.visible = true;
        continue;
      }
      if (impact.phase !== 'impact') continue;
      const flash = firstInactive(this.impactFlashPool);
      if (!flash) break;
      flash.active = true;
      flash.createdAtMs = nowMs;
      flash.expiresAtMs = nowMs + (isCarpet ? 600 : 420);
      flash.baseRadius = isCarpet ? CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M : 0.55;
      flash.maximumOpacity = isCarpet ? 0.9 : 0.8;
      flash.root.name = isCarpet ? 'pass65-carpet-impact-flash-large' : 'pass70-chopper-missile-impact-flash';
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

  private playChopperActions(entityId: string, names: readonly string[]): readonly string[] {
    const presented = this.entities.get(entityId);
    if (!presented || presented.oneShotActions.size === 0) return Object.freeze([]);
    const played: string[] = [];
    for (const name of names) {
      const actions = presented.oneShotActions.get(name) ?? [];
      if (actions.length === 0) continue;
      for (const action of actions) {
        const mixerTime = action.getMixer().time;
        action.reset().startAt(mixerTime).play();
      }
      played.push(name);
    }
    return Object.freeze(played);
  }

  presentChopperWeaponAction(entityId: string): boolean {
    const played = this.playChopperActions(entityId, [
      'Chopper_Gun_Recoil',
      'Chopper_Gun_Fire',
      'Chopper_Muzzle_Flash',
      'Chopper_Tracer_Pulse',
    ]);
    if (played.length === 0) return false;
    this.chopperWeaponActionsPresented += 1;
    this.lastChopperWeaponActions = played;
    return true;
  }

  presentChopperImpactAction(entityId: string): boolean {
    if (this.playChopperActions(entityId, ['Chopper_Impact_Pulse']).length === 0) return false;
    this.chopperImpactActionsPresented += 1;
    return true;
  }

  activeChopperTransientActionNames(): readonly string[] {
    const transientNames = new Set([
      'Chopper_Muzzle_Flash',
      'Chopper_Tracer_Pulse',
      'Chopper_Impact_Pulse',
    ]);
    return Object.freeze([...new Set([...this.entities.values()].flatMap((entry) => (
      [...entry.oneShotActions.entries()]
        .filter(([name, actions]) => transientNames.has(name) && actions.some((action) => action.isRunning()))
        .map(([name]) => name)
    )))].sort());
  }

  setFirstPersonEntity(id: string | null): void {
    if (id === this.firstPersonEntityId) return;
    this.firstPersonEntityId = id;
    this.firstPersonCockpitAlignment = null;
    const presented = id ? this.entities.get(id) : null;
    if (presented) {
      // A possessed support view must use the current immutable snapshot pose;
      // sparse-snapshot presentation smoothing cannot move the camera/HUD ray.
      presented.root.position.copy(presented.target);
      presented.root.quaternion.copy(presented.attitudeTarget);
    }
    this.applyFirstPersonVisibility();
  }

  firstPersonCameraAnchor(id: string): THREE.Vector3 | null {
    const presented = this.entities.get(id);
    const root = presented?.root;
    const socket = presented?.cameraSocket;
    if (!root) return null;
    if (!socket) return null;
    root.updateMatrixWorld(true);
    const anchor = socket.getWorldPosition(this.firstPersonAnchorScratch);
    const forward = this.firstPersonForwardScratch.set(0, 0, -1)
      .applyQuaternion(socket.getWorldQuaternion(this.firstPersonSocketQuaternionScratch));
    return anchor.addScaledVector(forward, 0.08);
  }

  alignFirstPersonCockpit(
    id: string,
    cameraWorldPosition: THREE.Vector3,
    cameraWorldQuaternion: THREE.Quaternion,
  ): void {
    const presented = this.entities.get(id);
    const cockpit = presented?.cockpit;
    const socket = presented?.cameraSocket;
    const parent = cockpit?.parent;
    if (!cockpit || !socket || !parent) return;
    parent.updateWorldMatrix(true, false);
    socket.updateWorldMatrix(true, false);
    cockpit.updateWorldMatrix(true, false);
    let authoredCameraPivot = this.firstPersonCockpitCameraPivot.get(cockpit);
    if (!authoredCameraPivot) {
      authoredCameraPivot = cockpit.worldToLocal(
        socket.getWorldPosition(this.firstPersonCockpitSocketWorldScratch),
      ).clone();
      this.firstPersonCockpitCameraPivot.set(cockpit, authoredCameraPivot);
    }
    const inverseParent = parent.getWorldQuaternion(this.firstPersonRootQuaternionScratch).invert();
    cockpit.quaternion.copy(inverseParent.multiply(cameraWorldQuaternion));
    const desiredParentPosition = parent.worldToLocal(
      this.firstPersonCockpitDesiredParentScratch.copy(cameraWorldPosition),
    );
    const pivotOffset = this.firstPersonCockpitPivotOffsetScratch.copy(authoredCameraPivot)
      .multiply(cockpit.scale)
      .applyQuaternion(cockpit.quaternion);
    cockpit.position.copy(desiredParentPosition).sub(pivotOffset);
    cockpit.updateMatrixWorld(true);
    if (this.firstPersonCockpitAlignment) return;
    const cameraPivotWorldPosition = cockpit.localToWorld(authoredCameraPivot.clone());
    const inverseCameraQuaternion = cameraWorldQuaternion.clone().invert();
    const cameraSpacePosition = (name: string): readonly number[] | null => {
      const node = cockpit.getObjectByName(name);
      if (!node) return null;
      return Object.freeze(node.getWorldPosition(new THREE.Vector3())
        .sub(cameraWorldPosition)
        .applyQuaternion(inverseCameraQuaternion)
        .toArray());
    };
    this.firstPersonCockpitAlignment = Object.freeze({
      cameraWorldPosition: Object.freeze(cameraWorldPosition.toArray()),
      cameraPivotWorldPosition: Object.freeze(cameraPivotWorldPosition.toArray()),
      cockpitWorldPosition: Object.freeze(cockpit.getWorldPosition(new THREE.Vector3()).toArray()),
      parentName: parent.name,
      parentWorldScale: Object.freeze(parent.getWorldScale(new THREE.Vector3()).toArray()),
      pivotErrorM: cameraPivotWorldPosition.distanceTo(cameraWorldPosition),
      dashboardCameraSpacePosition: cameraSpacePosition('chopper-cockpit-dashboard-3d'),
      hudCameraSpacePosition: cameraSpacePosition('chopper-cockpit-hud-glass'),
      weaponCameraSpacePosition: cameraSpacePosition('chopper-gunner-weapon-view'),
    });
  }

  carpetWorkflowTelemetry(): KillstreakCarpetWorkflowTelemetry {
    const markers = [...this.placementMarkers.values()]
      .filter(({ snapshot }) => snapshot.source === 'carpet-bomber')
      .sort((left, right) => left.snapshot.id.localeCompare(right.snapshot.id))
      .map(({ root, snapshot }) => {
        const meshes = root.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
        const materials = meshes.flatMap((mesh) => (
          Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        ));
        return Object.freeze({
          id: snapshot.id,
          source: snapshot.source,
          shape: snapshot.shape,
          audience: snapshot.audience,
          corridorLengthM: snapshot.pathStart && snapshot.pathEnd
            ? Math.hypot(
              snapshot.pathEnd[0] - snapshot.pathStart[0],
              snapshot.pathEnd[2] - snapshot.pathStart[2],
            )
            : null,
          colourHexes: Object.freeze([...new Set(materials.flatMap((entry) => (
            'color' in entry && entry.color instanceof THREE.Color ? [`#${entry.color.getHexString()}`] : []
          )))].sort()),
          depthTest: materials.every((entry) => entry.depthTest),
          writesDepth: materials.some((entry) => entry.depthWrite),
          raycastDisabled: root.raycast === disabledPlacementMarkerRaycast
            && meshes.every((mesh) => mesh.raycast === disabledPlacementMarkerRaycast),
          visible: root.visible && root.parent !== null,
        });
      });
    return Object.freeze({
      impactFlashes: countActive(this.impactFlashPool),
      bombShells: countActive(this.bombShellPool),
      emberParticles: countActive(this.emberPool),
      markers: Object.freeze(markers),
    });
  }

  telemetry(camera?: THREE.Camera): KillstreakPresentationTelemetry {
    const effectivelyVisible = (node: THREE.Object3D, root: THREE.Object3D): boolean => {
      let cursor: THREE.Object3D | null = node;
      while (cursor) {
        if (!cursor.visible) return false;
        if (cursor === root) return true;
        cursor = cursor.parent;
      }
      return false;
    };
    const activeChopperActionNames = Object.freeze([...new Set(
      [...this.entities.values()].flatMap((entry) => [...entry.oneShotActions.keys()]),
    )].sort());
    const pooledChopperActionNames = Object.freeze([...new Set(
      (this.entityPools.get('chopper') ?? []).flatMap((entry) => [...entry.oneShotActions.keys()]),
    )].sort());
    const chopperActionPlayback = Object.freeze([...this.entities.entries()].flatMap(([entityId, entry]) => (
      [...entry.oneShotActions.entries()].flatMap(([name, actions]) => actions.map((action) => {
        const mixerRoot = action.getMixer().getRoot();
        const lodRoot = mixerRoot instanceof THREE.Object3D ? mixerRoot : null;
        return Object.freeze({
          entityId,
          name,
          lodRootName: lodRoot?.name ?? 'animation-object-group',
          visible: lodRoot ? effectivelyVisible(lodRoot, entry.root) : false,
          running: action.isRunning(),
          timeSeconds: Number(action.time.toFixed(4)),
          clipDurationSeconds: Number(action.getClip().duration.toFixed(4)),
          effectiveWeight: Number(action.getEffectiveWeight().toFixed(4)),
        });
      }))
    )).sort((left, right) => `${left.entityId}:${left.name}:${left.lodRootName}`
      .localeCompare(`${right.entityId}:${right.name}:${right.lodRootName}`)));
    const entityDetails = Object.freeze([...this.entities.entries()].map(([entityId, entry]) => {
      entry.root.updateWorldMatrix(true, true);
      const stableAirframe = supportVehicleStableAirframeBounds(entry.root, camera, this.submittedScene);
      const bounds = new THREE.Box3();
      const meshBounds = new THREE.Box3();
      let visibleMeshCount = 0;
      let activeLodIndex: number | null = null;
      let activeLodName: string | null = null;
      let activeLodAsset: string | null = null;
      let activeAircraftWing: SupportAircraftWingVisibility | null = null;
      const authoredLod = entry.root.children.find((child): child is THREE.LOD => child instanceof THREE.LOD);
      if (authoredLod) {
        const currentLevel = authoredLod.getCurrentLevel();
        if (currentLevel >= 0 && authoredLod.levels[currentLevel]?.object.visible === true) {
          const activeLevel = authoredLod.levels[currentLevel]!.object;
          activeLodIndex = currentLevel;
          activeLodName = activeLevel.name;
          activeLodAsset = typeof activeLevel.userData.presentationAsset === 'string'
            ? activeLevel.userData.presentationAsset
            : null;
          activeAircraftWing = (activeLevel.userData.aircraftWingVisibility as SupportAircraftWingVisibility | undefined) ?? null;
        }
      }
      entry.root.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || !effectivelyVisible(node, entry.root)) return;
        node.geometry.computeBoundingBox();
        if (!node.geometry.boundingBox || node.geometry.boundingBox.isEmpty()) return;
        meshBounds.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
        bounds.union(meshBounds);
        visibleMeshCount += 1;
      });
      return Object.freeze({
        entityId,
        rootName: entry.root.name,
        poolKey: String(entry.root.userData.presentationPoolKey ?? 'unpooled'),
        presentationSource: String(entry.root.userData.presentationSource ?? 'unknown'),
        worldPosition: Object.freeze(entry.root.getWorldPosition(new THREE.Vector3()).toArray()),
        visible: entry.root.visible,
        visibleMeshCount,
        visibleBounds: bounds.isEmpty() ? null : Object.freeze({
          min: Object.freeze(bounds.min.toArray()),
          max: Object.freeze(bounds.max.toArray()),
        }),
        stableAirframeMeshCount: stableAirframe.meshCount,
        stableAirframeBounds: stableAirframe.bounds,
        drawableStableAirframeMeshCount: stableAirframe.drawableMeshCount,
        drawableStableAirframeBounds: stableAirframe.drawableBounds,
        stableAirframeDrawRejections: stableAirframe.drawRejections,
        activeLodIndex,
        activeLodName,
        activeLodAsset,
        activeAircraftWing,
      });
    }).sort((left, right) => left.entityId.localeCompare(right.entityId)));
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
    const visibleSwarmBatches = this.swarmInstanceBatches.filter((batch) => batch.root.visible && batch.root.count > 0);
    const visibleSwarmCounts = visibleSwarmBatches.map((batch) => batch.root.count);
    const firstPersonRoot = this.firstPersonEntityId ? this.entities.get(this.firstPersonEntityId)?.root ?? null : null;
    const firstPersonSightline = firstPersonRoot && this.firstPersonEntityId
      && firstPersonRoot.getObjectByName('chopper-gunner-sightline')
      ? (() => {
          const visibleMeshNames: string[] = [];
          const visibleOutsideSightline: string[] = [];
          const visibleOutsideCockpit: string[] = [];
          let overlayLayerExclusive = true;
          firstPersonRoot.traverse((node) => {
            if (!(node instanceof THREE.Mesh) || !effectivelyVisible(node, firstPersonRoot)) return;
            visibleMeshNames.push(node.name);
            if (!isGunnerSightlineNode(firstPersonRoot, node)) visibleOutsideSightline.push(node.name);
            if (!isGunnerCockpitNode(firstPersonRoot, node)) visibleOutsideCockpit.push(node.name);
            overlayLayerExclusive &&= (node.layers.mask & (1 << SUPPORT_FIRST_PERSON_RENDER_LAYER)) !== 0
              && (node.layers.mask & (1 << SUPPORT_WORLD_RENDER_LAYER)) === 0;
          });
          const subtreeHasVisibleMesh = (name: string): boolean => {
            const subtree = firstPersonRoot.getObjectByName(name);
            let visible = false;
            subtree?.traverse((node) => {
              if (node instanceof THREE.Mesh && effectivelyVisible(node, firstPersonRoot)) visible = true;
            });
            return visible;
          };
          return Object.freeze({
            entityId: this.firstPersonEntityId!,
            presentationSource: String(firstPersonRoot.userData.presentationSource ?? 'unknown'),
            visibleMeshNames: Object.freeze(visibleMeshNames.sort()),
            visibleOutsideSightline: Object.freeze(visibleOutsideSightline.sort()),
            visibleOutsideCockpit: Object.freeze(visibleOutsideCockpit.sort()),
            dashboardVisible: subtreeHasVisibleMesh('chopper-cockpit-dashboard-3d'),
            displaysVisible: subtreeHasVisibleMesh('chopper-cockpit-display-cyan')
              && subtreeHasVisibleMesh('chopper-cockpit-display-green'),
            hudVisible: subtreeHasVisibleMesh('chopper-cockpit-hud-glass')
              && subtreeHasVisibleMesh('chopper-cockpit-hud-target-ring'),
            centreSightlineClear: !subtreeHasVisibleMesh('chopper-cockpit-hud-glass')
              && !subtreeHasVisibleMesh('chopper-cockpit-hud-target-ring'),
            weaponVisible: subtreeHasVisibleMesh('chopper-gunner-weapon-view'),
            overlayLayerExclusive,
            alignment: this.firstPersonCockpitAlignment,
          });
        })()
      : null;
    return Object.freeze({
      entities: this.entities.size,
      impactFlashes,
      bombShells,
      emberParticles,
      sensorContacts: this.visibleSensorContacts,
      sensorProxyMeshes: 0,
      sensorPresentation: 'shared-exact-animated-thermal-operator',
      placementMarkers: this.placementMarkers.size,
      prewarmed: this.entityPools.size,
      pooledEntityInstances: this.prewarmed.length,
      pooledSwarmDrones: this.entityPools.get('swarm-drone')?.length ?? 0,
      swarmRenderBatches: this.swarmInstanceBatches.length,
      swarmRenderedInstances: this.swarmInstanceBatches[0]?.root.count ?? 0,
      swarmVisibleRenderBatches: visibleSwarmBatches.length,
      swarmMinimumRenderedInstances: visibleSwarmCounts.length > 0 ? Math.min(...visibleSwarmCounts) : 0,
      swarmMaximumRenderedInstances: visibleSwarmCounts.length > 0 ? Math.max(...visibleSwarmCounts) : 0,
      prewarmedAuthoredSupportFamilies: Object.freeze([...new Set(this.prewarmed
        .filter((entry) => entry.root.userData.presentationSource === 'project-original-blender-glb')
        .map((entry) => String(entry.root.userData.presentationFamily)))].sort()),
      entityDetails,
      chopperWeaponActionsPresented: this.chopperWeaponActionsPresented,
      chopperImpactActionsPresented: this.chopperImpactActionsPresented,
      activeChopperActionNames,
      pooledChopperActionNames,
      lastChopperWeaponActions: this.lastChopperWeaponActions,
      chopperActionPlayback,
      firstPersonSightline,
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
    // flight. Preserve the staged exact-count submission until prewarm settles.
    if (this.gpuPrewarmActive) return;
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
    this.chopperWeaponActionsPresented = 0;
    this.chopperImpactActionsPresented = 0;
    this.lastChopperWeaponActions = Object.freeze([]);
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
    this.retireRoot(this.impactFlashPoolRoot);
    this.retireRoot(this.bombShellPoolRoot);
    this.retireRoot(this.emberPoolRoot);
    this.root.removeFromParent();
  }
}
