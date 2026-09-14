/**
 * src/map3/technique-lab/gallery/blender-viewer.ts — loads ONE GLB into the
 * host's existing scene with generation-guarded race protection and full
 * disposal (geometry, materials, every texture slot, each exactly once).
 * GLTFLoader is the installed three 0.185.1 addon; the loader is injectable so
 * CPU tests can exercise the lifecycle without a GPU or network.
 *
 * Lifecycle contract:
 * - Every `load()` advances the generation; a load that resolves after a newer
 *   load, a public `clear()` or `dispose()` never attaches, frees its resources
 *   exactly once and resolves null.
 * - Public `clear()` both releases the active model AND invalidates any pending
 *   load. The internal `release()` only frees the active model and is what a
 *   successful load uses to replace its predecessor.
 * - `LoadedModel.dispose()` is idempotent, so a consumer disposing the model
 *   before the viewer releases it cannot double-free.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface LoadedModel {
  root: THREE.Object3D;
  /** Frees geometry, materials and textures once; later calls are no-ops. */
  dispose(): void;
}

export interface ModelLoaderLike {
  loadAsync(url: string): Promise<{ scene: THREE.Object3D }>;
}

export interface BlenderViewerHandle {
  /** Resolves to the model when this request is still current, null when superseded or cleared. */
  load(assetUrl: string, resolveUrl?: (url: string) => string): Promise<LoadedModel | null>;
  current(): LoadedModel | null;
  /** Releases the active model and invalidates every pending load. */
  clear(): void;
  /** Terminal: clears, then refuses further loads. Idempotent. */
  dispose(): void;
}

/**
 * Frees every geometry, material and texture reachable from `root` exactly
 * once, even when several meshes share a geometry/material or several material
 * slots (map, emissiveMap, …) share one texture.
 */
export function disposeObject(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else if (mat) materials.add(mat);
  });
  for (const material of materials) {
    for (const value of Object.values(material as unknown as Record<string, unknown>)) {
      if (value && typeof value === 'object' && (value as THREE.Texture).isTexture) {
        textures.add(value as THREE.Texture);
      }
    }
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

function onceDisposable(root: THREE.Object3D): LoadedModel {
  let freed = false;
  return {
    root,
    dispose: () => {
      if (freed) return;
      freed = true;
      disposeObject(root);
    },
  };
}

export function createBlenderViewer(
  scene: THREE.Scene,
  loader: ModelLoaderLike = new GLTFLoader(),
): BlenderViewerHandle {
  let generation = 0;
  let active: LoadedModel | null = null;
  let disposed = false;

  /** Internal: detach and free the active model. Does NOT touch the generation. */
  const release = (): void => {
    if (!active) return;
    const model = active;
    active = null;
    scene.remove(model.root);
    model.dispose();
  };

  /** Public: invalidate pending loads, then release whatever is attached. */
  const clear = (): void => {
    generation += 1;
    release();
  };

  return {
    async load(assetUrl, resolveUrl = (u) => u) {
      if (disposed) return null;
      const gen = ++generation;
      const gltf = await loader.loadAsync(resolveUrl(assetUrl));
      const model = onceDisposable(gltf.scene);
      if (disposed || gen !== generation) {
        // Superseded, cleared or disposed while in flight: never attach, free once.
        model.dispose();
        return null;
      }
      release();
      scene.add(model.root);
      active = model;
      return active;
    },
    current: () => active,
    clear,
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
    },
  };
}
