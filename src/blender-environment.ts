import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ArenaMap } from './map';
import { ARENA_ROUTE_IDENTITIES } from './world-identity';

export const BLENDER_ARENA_ASSET = './assets/original/models/atomic-acres-blender-arena.glb';

export type BlenderArenaTelemetry = {
  status: 'idle' | 'loading' | 'ready' | 'fallback';
  asset: string;
  meshCount: number;
  materialCount: number;
  texturedMaterials: number;
  pbrMaterials: number;
  textureCount: number;
  triangleCount: number;
  semanticWindows: number;
  boundWindows: number;
  routeLandmarks: number;
  worldIdentityPass: boolean;
  proceduralWorldHidden: boolean;
  error: string | null;
};

const telemetry: BlenderArenaTelemetry = {
  status: 'idle',
  asset: BLENDER_ARENA_ASSET,
  meshCount: 0,
  materialCount: 0,
  texturedMaterials: 0,
  pbrMaterials: 0,
  textureCount: 0,
  triangleCount: 0,
  semanticWindows: 0,
  boundWindows: 0,
  routeLandmarks: 0,
  worldIdentityPass: false,
  proceduralWorldHidden: false,
  error: null,
};

export function blenderArenaTelemetry(): BlenderArenaTelemetry {
  return { ...telemetry };
}

export function markBlenderArenaFallback(error: unknown): void {
  telemetry.status = 'fallback';
  telemetry.error = error instanceof Error ? error.message : String(error);
  telemetry.proceduralWorldHidden = false;
}

export async function loadBlenderArena(
  scene: THREE.Scene,
  arena: ArenaMap,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ root: THREE.Group; loadedModels: number }> {
  telemetry.status = 'loading';
  telemetry.error = null;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(BLENDER_ARENA_ASSET, (event) => {
    onProgress?.(event.loaded, event.total || event.loaded || 1);
  });
  const root = gltf.scene;
  root.name = 'Atomic Acres Blender Render arena';
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const texturedMaterials = new Set<THREE.Material>();
  const pbrMaterials = new Set<THREE.Material>();
  const windows = new Map<string, THREE.Mesh>();
  const routeLandmarks = new Set<string>();
  let meshCount = 0;
  let triangleCount = 0;
  root.traverse((node) => {
    node.userData.blenderAuthoredEnvironment = true;
    const routeId = typeof node.userData.atomic_route_id === 'string' ? node.userData.atomic_route_id : null;
    if (node.userData.atomic_semantic === 'route-landmark' && routeId) routeLandmarks.add(routeId);
    if (!(node instanceof THREE.Mesh)) return;
    node.userData.blocksShots = false;
    meshCount += 1;
    node.castShadow = node.material instanceof THREE.MeshStandardMaterial && !node.material.transparent;
    node.receiveShadow = true;
    const geometry = node.geometry;
    triangleCount += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
    const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
    nodeMaterials.forEach((material) => {
      materials.add(material);
      if (material instanceof THREE.MeshStandardMaterial && material.map) {
        texturedMaterials.add(material);
        textures.add(material.map);
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.normalMap) textures.add(material.normalMap);
        if (material.roughnessMap) textures.add(material.roughnessMap);
        if (material.normalMap && material.roughnessMap) pbrMaterials.add(material);
      }
    });
    const windowId = typeof node.userData.atomic_window_id === 'string' ? node.userData.atomic_window_id : null;
    if (windowId) {
      node.userData.breakableWindowId = windowId;
      node.userData.dynamic = true;
      windows.set(windowId, node);
    }
  });

  const missing = arena.breakableWindows.filter((pane) => !windows.has(pane.id));
  if (missing.length > 0) {
    throw new Error(`Blender arena is missing semantic windows: ${missing.map((pane) => pane.id).join(', ')}`);
  }
  const missingRoutes = ARENA_ROUTE_IDENTITIES.filter((route) => !routeLandmarks.has(route.id));
  if (missingRoutes.length > 0) {
    throw new Error(`Blender arena is missing route landmarks: ${missingRoutes.map((route) => route.id).join(', ')}`);
  }

  // Retain the original visual meshes underneath as invisible presentation and
  // authoritative ray targets. Raycast/collision authority never comes from GLB art.
  const proceduralWorld = scene.getObjectByName('Atomic Acres arena');
  if (!proceduralWorld) throw new Error('Authoritative procedural arena root is unavailable');
  for (const pane of arena.breakableWindows) {
    const authored = windows.get(pane.id)!;
    authored.visible = !pane.broken;
    pane.mesh = authored;
  }
  proceduralWorld.visible = false;
  scene.add(root);

  telemetry.status = 'ready';
  telemetry.meshCount = meshCount;
  telemetry.materialCount = materials.size;
  telemetry.texturedMaterials = texturedMaterials.size;
  telemetry.pbrMaterials = pbrMaterials.size;
  telemetry.textureCount = textures.size;
  telemetry.triangleCount = Math.round(triangleCount);
  telemetry.semanticWindows = windows.size;
  telemetry.boundWindows = arena.breakableWindows.length;
  telemetry.routeLandmarks = routeLandmarks.size;
  telemetry.worldIdentityPass = routeLandmarks.size === ARENA_ROUTE_IDENTITIES.length;
  telemetry.proceduralWorldHidden = true;
  onProgress?.(1, 1);
  return { root, loadedModels: 1 };
}
