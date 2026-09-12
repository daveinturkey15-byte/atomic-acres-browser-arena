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

/** Path of the exported hero truck and box trailer relative to the deployment base. */
export const HERO_TRUCK_ASSET_PATH = 'assets/world-studio/blender/hero-truck.glb';

/**
 * Declared placement from the build brief's coordinate contract: bus at X -3.5, Z 2 and truck at
 * X 3.5, Z -2, ground Y 0, long axis Z. Both exports are local, metre-scale, Y-up assets with
 * their origin centred on the footprint and the tyre contact patch at Y = 0, so placement lives
 * here and not in the mesh. The two face opposite ways, as in the reference images.
 */
export const HERO_BUS_PLACEMENT = { position: [-3.5, 0, 2] as const, headingRadians: 0 };
export const HERO_TRUCK_PLACEMENT = { position: [3.5, 0, -2] as const, headingRadians: Math.PI };

/** Measured on the exported GLBs; see docs/world-studio-blender-assets.md. */
export const HERO_BUS_DIMENSIONS = { width: 2.976, height: 3.197, length: 9.97 } as const;
export const HERO_TRUCK_DIMENSIONS = { width: 2.944, height: 3.942, length: 13.473 } as const;

interface HeroAssetSpec {
  readonly name: string;
  readonly path: string;
  readonly placement: { readonly position: readonly [number, number, number]; readonly headingRadians: number };
}

const HERO_ASSETS: readonly HeroAssetSpec[] = [
  { name: 'world-studio-hero-bus', path: HERO_BUS_ASSET_PATH, placement: HERO_BUS_PLACEMENT },
  { name: 'world-studio-hero-truck', path: HERO_TRUCK_ASSET_PATH, placement: HERO_TRUCK_PLACEMENT },
];

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

  const base = resolveBaseUrl(options.baseUrl);
  let disposed = false;
  const loaded: THREE.Object3D[] = [];

  const loader = new GLTFLoader();
  const ready = Promise.all(
    HERO_ASSETS.map((spec, index) => loader.loadAsync(joinUrl(base, spec.path)).then((gltf) => {
      const scene = gltf.scene;
      if (disposed) {
        // Lost the race with dispose(): release the payload instead of attaching it.
        disposeSubtree(scene);
        return;
      }
      // A single-asset override applies to the first asset only; the rest keep their declared
      // placement, so the caller can nudge one prop without silently stacking the others.
      const position = index === 0 ? options.position ?? spec.placement.position : spec.placement.position;
      const heading = index === 0 ? options.headingRadians ?? spec.placement.headingRadians : spec.placement.headingRadians;
      scene.name = spec.name;
      scene.position.set(position[0], position[1], position[2]);
      scene.rotation.y = heading;
      applyPresentationContract(scene);
      loaded.push(scene);
      root.add(scene);
    })),
  ).then(() => undefined);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const node of loaded) {
      root.remove(node);
      disposeSubtree(node);
    }
    loaded.length = 0;
    root.clear();
  };

  return { root, ready, dispose };
}
