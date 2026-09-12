/**
 * World-studio Blender hero assets: an additive loader for the Blender-authored props.
 *
 * Presentation only. This module emits no collider, shot surface, spawn or navigation data, and
 * nothing here may be used to derive collision - the root retains the accepted gameplay
 * colliders and decides whether and how to integrate what this returns.
 *
 * Lifecycle contract:
 *   - `root` is a real `THREE.Group` the caller may parent immediately, before anything loads.
 *   - `ready` resolves only after the glTF has actually loaded and been attached. It rejects
 *     visibly on failure; it never resolves on a swallowed error and never resolves early.
 *   - `dispose()` is safe to call repeatedly and safe to call while a load is still in flight:
 *     a load that completes after disposal is released instead of attached.
 *
 * It creates no renderer, no animation loop, no global DOM listener and no window global.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface StudioBlenderAssetOptions {
  /**
   * Base path the asset URL is resolved against. Defaults to Vite's `import.meta.env.BASE_URL`
   * so a sub-path deployment works, falling back to '/' outside a Vite bundle (Node QA).
   */
  baseUrl?: string;
  /** Overrides the declared placement below. Metres, world space. */
  position?: readonly [number, number, number];
  /** Rotation about Y in radians. The exported nose points towards +Z at heading 0. */
  headingRadians?: number;
}

export interface StudioBlenderAssets {
  root: THREE.Group;
  ready: Promise<void>;
  dispose: () => void;
}

/** Path of the exported hero bus relative to the deployment base. */
export const HERO_BUS_ASSET_PATH = 'assets/world-studio/blender/hero-bus.glb';

/**
 * Declared placement from the build brief's coordinate contract: bus at X -3.5, Z 2, ground
 * Y 0, long axis Z. The export is a local, metre-scale, Y-up asset with its origin centred on
 * the footprint and the tyre contact patch at Y = 0, so placement lives here, not in the mesh.
 */
export const HERO_BUS_PLACEMENT = { position: [-3.5, 0, 2] as const, headingRadians: 0 };

/** Measured on the exported GLB; see docs/world-studio-blender-assets.md. */
export const HERO_BUS_DIMENSIONS = { width: 2.976, height: 3.197, length: 9.97 } as const;

function resolveBaseUrl(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base : '/';
}

function joinUrl(base: string, path: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

/**
 * Resolves the hero bus URL against the deployment base. Exported so the base-awareness can be
 * asserted without a network fetch: a sub-path Vite deployment must not become a host-absolute
 * assumption.
 */
export function resolveHeroBusUrl(baseUrl?: string): string {
  return joinUrl(resolveBaseUrl(baseUrl), HERO_BUS_ASSET_PATH);
}

function disposeSubtree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as Partial<THREE.Mesh>;
    if (mesh.geometry) geometries.add(mesh.geometry as THREE.BufferGeometry);
    const material = mesh.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      materials.add(entry);
      for (const value of Object.values(entry as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/**
 * Marks every loaded node as presentation-only and restores the closed-volume contract: the
 * exporter writes materials double-sided, which makes an opaque, closed body shade faces the
 * player can never see. Glass keeps its two-sided presentation deliberately.
 */
function applyPresentationContract(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.worldStudioBlenderAsset = true;
    node.userData.presentationOnly = true;
    const mesh = node as Partial<THREE.Mesh>;
    const material = mesh.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      const transparentSurface = entry.transparent === true || entry.opacity < 1;
      if (transparentSurface) {
        entry.depthWrite = false;
        continue;
      }
      entry.side = THREE.FrontSide;
      entry.needsUpdate = true;
    }
  });
}

/**
 * Builds the additive hero-asset group. The returned root is usable immediately; the mesh
 * appears inside it once `ready` resolves.
 */
export function createStudioBlenderAssets(options: StudioBlenderAssetOptions = {}): StudioBlenderAssets {
  const root = new THREE.Group();
  root.name = 'world-studio-blender-assets';
  root.userData.presentationOnly = true;

  const url = joinUrl(resolveBaseUrl(options.baseUrl), HERO_BUS_ASSET_PATH);
  const position = options.position ?? HERO_BUS_PLACEMENT.position;
  const heading = options.headingRadians ?? HERO_BUS_PLACEMENT.headingRadians;

  let disposed = false;
  let loaded: THREE.Object3D | null = null;

  const loader = new GLTFLoader();
  const ready = loader.loadAsync(url).then((gltf) => {
    const scene = gltf.scene;
    if (disposed) {
      // Lost the race with dispose(): release the payload instead of attaching it.
      disposeSubtree(scene);
      return;
    }
    scene.name = 'world-studio-hero-bus';
    scene.position.set(position[0], position[1], position[2]);
    scene.rotation.y = heading;
    applyPresentationContract(scene);
    loaded = scene;
    root.add(scene);
  });

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (loaded) {
      root.remove(loaded);
      disposeSubtree(loaded);
      loaded = null;
    }
    root.clear();
  };

  return { root, ready, dispose };
}
