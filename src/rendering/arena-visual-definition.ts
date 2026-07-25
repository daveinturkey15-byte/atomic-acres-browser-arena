import * as THREE from 'three';
import type { ArenaMap } from '../map';
import type { ArenaId } from '../map-selection';

export type LightOcclusionPolicy = 'emissive-only' | 'baked' | 'shadowed-local';

export type ArenaPracticalDefinition = Readonly<{
  id: string;
  policy: LightOcclusionPolicy;
  maximumDistance: number;
  castsShadow: boolean;
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
  for (const practical of definition.lighting.practicals) {
    if (practical.policy === 'shadowed-local' && !practical.castsShadow) {
      throw new Error(`${definition.id}/${practical.id} claims shadowed-local without a shadow`);
    }
    if (practical.policy !== 'shadowed-local' && practical.castsShadow) {
      throw new Error(`${definition.id}/${practical.id} allocates a shadow for ${practical.policy}`);
    }
  }
  if (definition.colorPipeline.workingSpace !== 'linear-srgb-hdr' || definition.colorPipeline.output !== 'srgb') {
    throw new Error(`${definition.id} must use the controlled linear HDR to sRGB pipeline`);
  }
}
