import * as THREE from 'three';
import type { ArenaMap } from '../map';
import type { ArenaId } from '../map-selection';

export type LightOcclusionPolicy = 'emissive-only' | 'baked' | 'shadowed-local';

export type ArenaVector3 = readonly [number, number, number];

export type ArenaInteriorVolumeDefinition = Readonly<{
  id: string;
  minimum: ArenaVector3;
  maximum: ArenaVector3;
}>;

export type ArenaPracticalMotionDefinition = Readonly<{
  intensity?: Readonly<{
    amplitudeRatio: number;
    frequencyHz: number;
    phaseRadians: number;
  }>;
  target?: Readonly<{
    amplitude: ArenaVector3;
    frequencyHz: number;
    phaseRadians: number;
  }>;
}>;

export type ArenaSpotLightDefinition = Readonly<{
  kind: 'spot';
  position: ArenaVector3;
  target: ArenaVector3;
  color: number;
  intensity: number;
  distance: number;
  angle: number;
  penumbra: number;
  decay: number;
  shadowMapSize: number;
  intendedVolume: ArenaInteriorVolumeDefinition;
  motion?: ArenaPracticalMotionDefinition;
}>;

export type ArenaPracticalDefinition = Readonly<{
  id: string;
  policy: LightOcclusionPolicy;
  maximumDistance: number;
  castsShadow: boolean;
  light?: ArenaSpotLightDefinition;
}>;

export type ArenaReviewCamera = Readonly<{
  id: string;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  near: number;
  far: number;
  fixedTimeMs: number;
  seed: number;
  exposure: number;
  hud: 'hidden' | 'visible';
  purpose: 'overview' | 'geometry' | 'light-occlusion' | 'portal';
}>;

export type ArenaVisualBudgets = Readonly<{
  maximumDrawCalls: number;
  maximumTriangles: number;
  maximumTextureBytes: number;
  maximumResidentTextureBytes: number;
  maximumShadowLights: number;
  maximumShadowMapPixels: number;
  maximumPostTextureSamples: number;
  maximumTransientBytes: number;
  cpuFrameP95Ms: number;
  gpuFrameP95Ms: number;
}>;

export type ArenaColorPipelineDefinition = Readonly<{
  id: string;
  workingSpace: 'linear-srgb-hdr';
  toneMap: 'aces-filmic';
  exposure: number;
  grade: Readonly<{ contrast: number; saturation: number; shadowTint: number; highlightTint: number }>;
  grain: Readonly<{ mode: 'ordered-dither'; strength: number; deterministic: true }>;
  output: 'srgb';
}>;

export type ArenaVisualDefinition = Readonly<{
  id: ArenaId;
  displayLabel: string;
  moduleId: string;
  assetDependencies: readonly string[];
  sharedAssetDependencies: readonly string[];
  lighting: Readonly<{
    sunColor: number;
    sunIntensity: number;
    ambientColor: number;
    ambientIntensity: number;
    practicals: readonly ArenaPracticalDefinition[];
  }>;
  fog: Readonly<{ color: number; near: number; far: number }>;
  shadows: Readonly<{ enabled: boolean; mapSize: number; maximumDistance: number; normalBias: number }>;
  atmosphere: Readonly<{ preset: string; mist: number; dust: number; clouds: boolean }>;
  colorPipeline: ArenaColorPipelineDefinition;
  budgets: ArenaVisualBudgets;
  reviewCameras: readonly ArenaReviewCamera[];
  collisionIdentity: Readonly<{
    authoritativeArenaId: ArenaId;
    evidence: string;
    presentationMayMutateAuthority: false;
  }>;
  exceptions: readonly string[];
  load(context: ArenaVisualLoadContext): Promise<LoadedArenaVisual>;
}>;

export type ArenaVisualLoadContext = Readonly<{
  signal: AbortSignal;
  generation: number;
  recordRequest(url: string): void;
}>;

export type LoadedArenaVisual = Readonly<{
  definitionId: ArenaId;
  generation: number;
  root: THREE.Group;
  requestedResources: readonly string[];
  dispose(): void;
}>;

type ArenaBuilder = (scene: THREE.Scene) => ArenaMap;
type ArenaVisualMetadata = Omit<ArenaVisualDefinition, 'load'>;

/** Deliberately stays far below the frequency range that could read as a strobe. */
export const MAX_PRACTICAL_MOTION_FREQUENCY_HZ = 0.5;

export function arenaVolumeContainsPoint(
  volume: ArenaInteriorVolumeDefinition,
  point: ArenaVector3,
): boolean {
  return point.every((value, axis) => value >= volume.minimum[axis] && value <= volume.maximum[axis]);
}

function assertFiniteVector(value: ArenaVector3, label: string): void {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new Error(`${label} must contain three finite coordinates`);
  }
}

function validateSpotLightDefinition(
  definition: ArenaVisualDefinition,
  practical: ArenaPracticalDefinition,
  light: ArenaSpotLightDefinition,
): void {
  const label = `${definition.id}/${practical.id}`;
  assertFiniteVector(light.position, `${label} position`);
  assertFiniteVector(light.target, `${label} target`);
  assertFiniteVector(light.intendedVolume.minimum, `${label} volume minimum`);
  assertFiniteVector(light.intendedVolume.maximum, `${label} volume maximum`);
  if (light.intendedVolume.minimum.some((minimum, axis) => minimum >= light.intendedVolume.maximum[axis])) {
    throw new Error(`${label} intended volume must have positive extent on every axis`);
  }
  if (!arenaVolumeContainsPoint(light.intendedVolume, light.position)) {
    throw new Error(`${label} position escapes intended volume ${light.intendedVolume.id}`);
  }
  if (!arenaVolumeContainsPoint(light.intendedVolume, light.target)) {
    throw new Error(`${label} target escapes intended volume ${light.intendedVolume.id}`);
  }
  if (!Number.isFinite(light.intensity) || light.intensity <= 0) throw new Error(`${label} intensity must be positive and finite`);
  if (!Number.isFinite(light.distance) || light.distance <= 0 || light.distance > practical.maximumDistance) {
    throw new Error(`${label} distance must be positive and no greater than its practical policy`);
  }
  if (!Number.isFinite(light.angle) || light.angle <= 0 || light.angle >= Math.PI / 2) {
    throw new Error(`${label} spot angle must be between zero and PI/2`);
  }
  if (!Number.isFinite(light.penumbra) || light.penumbra < 0 || light.penumbra > 1) {
    throw new Error(`${label} penumbra must be between zero and one`);
  }
  if (!Number.isFinite(light.decay) || light.decay < 0) throw new Error(`${label} decay must be finite and non-negative`);
  if (!Number.isSafeInteger(light.shadowMapSize) || light.shadowMapSize < 64 || (light.shadowMapSize & (light.shadowMapSize - 1)) !== 0) {
    throw new Error(`${label} shadow map size must be a power of two at least 64`);
  }
  const motion = light.motion;
  if (!motion) return;
  if (!motion.intensity && !motion.target) throw new Error(`${label} motion must animate at least one channel`);
  if (motion.intensity) {
    const { amplitudeRatio, frequencyHz, phaseRadians } = motion.intensity;
    if (!Number.isFinite(amplitudeRatio) || amplitudeRatio <= 0 || amplitudeRatio > 0.2) {
      throw new Error(`${label} intensity motion amplitude must be in (0, 0.2]`);
    }
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz > MAX_PRACTICAL_MOTION_FREQUENCY_HZ) {
      throw new Error(`${label} intensity motion exceeds the non-strobe frequency bound`);
    }
    if (!Number.isFinite(phaseRadians)) throw new Error(`${label} intensity phase must be finite`);
  }
  if (motion.target) {
    const { amplitude, frequencyHz, phaseRadians } = motion.target;
    assertFiniteVector(amplitude, `${label} target motion amplitude`);
    if (amplitude.every((component) => component === 0)) throw new Error(`${label} target motion must have non-zero travel`);
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0 || frequencyHz > MAX_PRACTICAL_MOTION_FREQUENCY_HZ) {
      throw new Error(`${label} target motion exceeds the non-strobe frequency bound`);
    }
    if (!Number.isFinite(phaseRadians)) throw new Error(`${label} target phase must be finite`);
    const minimumTarget = light.target.map((component, axis) => component - Math.abs(amplitude[axis])) as unknown as ArenaVector3;
    const maximumTarget = light.target.map((component, axis) => component + Math.abs(amplitude[axis])) as unknown as ArenaVector3;
    if (!arenaVolumeContainsPoint(light.intendedVolume, minimumTarget)
      || !arenaVolumeContainsPoint(light.intendedVolume, maximumTarget)) {
      throw new Error(`${label} animated target escapes intended volume ${light.intendedVolume.id}`);
    }
  }
}

function abortError(): DOMException {
  return new DOMException('Arena visual load aborted', 'AbortError');
}

function materialsOf(node: THREE.Object3D): THREE.Material[] {
  const material = (node as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

const TEXTURE_PROPERTIES = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'lightMap', 'envMap',
] as const;

export function createIdempotentRootDisposer(root: THREE.Group): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    root.traverse((node) => {
      const geometry = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geometry) geometries.add(geometry);
      for (const material of materialsOf(node)) {
        materials.add(material);
        const record = material as THREE.Material & Record<string, unknown>;
        for (const property of TEXTURE_PROPERTIES) {
          const texture = record[property];
          if (texture instanceof THREE.Texture) textures.add(texture);
        }
      }
      if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
        node.shadow.map?.dispose();
      }
    });
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    root.clear();
  };
}

export function createProceduralArenaVisualDefinition(
  metadata: ArenaVisualMetadata,
  build: ArenaBuilder,
): ArenaVisualDefinition {
  const definition: ArenaVisualDefinition = Object.freeze({
    ...metadata,
    async load(context: ArenaVisualLoadContext): Promise<LoadedArenaVisual> {
      if (context.signal.aborted) throw abortError();
      const scratchScene = new THREE.Scene();
      const map = build(scratchScene);
      scratchScene.remove(map.root);
      map.root.userData.arenaVisualDefinitionId = metadata.id;
      map.root.userData.arenaVisualGeneration = context.generation;
      if (context.signal.aborted) {
        createIdempotentRootDisposer(map.root)();
        throw abortError();
      }
      const requestedResources: string[] = [];
      const recordRequest = (url: string): void => {
        requestedResources.push(url);
        context.recordRequest(url);
      };
      // Procedural roots make no network requests. Quality assets listed by
      // the definition must use this recorder when their load moves here.
      void recordRequest;
      return Object.freeze({
        definitionId: metadata.id,
        generation: context.generation,
        root: map.root,
        requestedResources,
        dispose: createIdempotentRootDisposer(map.root),
      });
    },
  });
  validateArenaVisualDefinition(definition);
  return definition;
}

export function validateArenaVisualDefinition(definition: ArenaVisualDefinition): void {
  if (definition.id !== definition.collisionIdentity.authoritativeArenaId) {
    throw new Error(`${definition.id} visual identity does not match collision authority`);
  }
  if (definition.collisionIdentity.presentationMayMutateAuthority !== false) {
    throw new Error(`${definition.id} presentation may not mutate gameplay authority`);
  }
  if (definition.reviewCameras.length < 3) throw new Error(`${definition.id} needs at least three deterministic review cameras`);
  const cameraIds = new Set(definition.reviewCameras.map((camera) => camera.id));
  if (cameraIds.size !== definition.reviewCameras.length) throw new Error(`${definition.id} has duplicate review camera IDs`);
  if (!definition.reviewCameras.some((camera) => camera.purpose === 'light-occlusion')) {
    throw new Error(`${definition.id} lacks a light-occlusion review camera`);
  }
  const practicalIds = new Set<string>();
  let canonicalShadowPixels = 0;
  let canonicalShadowLightCount = 0;
  for (const practical of definition.lighting.practicals) {
    if (practicalIds.has(practical.id)) throw new Error(`${definition.id} has duplicate practical ID ${practical.id}`);
    practicalIds.add(practical.id);
    if (practical.policy === 'shadowed-local' && !practical.castsShadow) {
      throw new Error(`${definition.id}/${practical.id} claims shadowed-local without a shadow`);
    }
    if (practical.policy !== 'shadowed-local' && practical.castsShadow) {
      throw new Error(`${definition.id}/${practical.id} allocates a shadow for ${practical.policy}`);
    }
    if (practical.light && practical.policy !== 'shadowed-local') {
      throw new Error(`${definition.id}/${practical.id} defines a runtime light without shadowed-local policy`);
    }
    if (practical.light) {
      validateSpotLightDefinition(definition, practical, practical.light);
      canonicalShadowPixels += practical.light.shadowMapSize ** 2;
      canonicalShadowLightCount += 1;
    }
  }
  const shadowedPracticalCount = definition.lighting.practicals.filter((practical) => practical.castsShadow).length;
  if (canonicalShadowLightCount > 0 && canonicalShadowLightCount !== shadowedPracticalCount) {
    throw new Error(`${definition.id} may not mix canonical and legacy shadowed practicals`);
  }
  if (shadowedPracticalCount > definition.budgets.maximumShadowLights) {
    throw new Error(`${definition.id} practicals exceed the shadow-light budget`);
  }
  if (canonicalShadowPixels > definition.budgets.maximumShadowMapPixels) {
    throw new Error(`${definition.id} practicals exceed the shadow-map pixel budget`);
  }
  if (definition.colorPipeline.workingSpace !== 'linear-srgb-hdr' || definition.colorPipeline.output !== 'srgb') {
    throw new Error(`${definition.id} must use the controlled linear HDR to sRGB pipeline`);
  }
}
