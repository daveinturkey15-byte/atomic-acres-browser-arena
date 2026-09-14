/**
 * World-studio Blender interior dressing: a bounded loader for the mid-century interior set
 * authored by lane `interiors-night-20260912`.
 *
 * Presentation only. This module emits no collider, shot surface, spawn or navigation data,
 * and nothing here may be used to derive collision. The root keeps the accepted gameplay
 * authority and decides whether and how to integrate what this returns.
 *
 * Lifecycle contract (matching `src/world-studio/blender-assets/index.ts`, deliberately, so
 * the arena has one shape to reason about):
 *   - `root` is a real `THREE.Group` the caller may parent immediately, before anything loads.
 *   - `ready` resolves only after every requested GLB has loaded and been attached. It rejects
 *     visibly on failure and never resolves on a swallowed error.
 *   - `dispose()` is safe to call repeatedly and while a load is in flight: a payload that
 *     arrives after disposal is released rather than attached, so it cannot outlive teardown.
 *
 * It creates no renderer, no animation loop, no DOM listener, no window global and no light.
 * Interior practicals stay with the lighting lane.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Floor height published by `src/world-studio/architecture/house.ts`. */
export const GROUND_FLOOR_Y = 0.08;

/** Deploy-base-relative path of the hero living/kitchen composition. */
export const INTERIOR_HERO_ASSET_PATH =
  'assets/world-studio/blender/interiors/interior-hero-teal-living-kitchen.glb';

/**
 * House-local placement of the hero set.
 *
 * The Blender source authors every prop directly in the house-local frame that
 * `house.ts` `anchor(id, room, lx, y, lz, yaw, footprint)` publishes, so the composition GLB
 * carries its own internal offsets and drops in at the house origin with no nudge. A caller
 * converts to world space exactly as `house.ts` does: `x = wx(lx)`, `z = lz`, and for the
 * mirrored (yellow) house `yaw -> PI - yaw`.
 */
export const INTERIOR_HERO_PLACEMENT = {
  houseLocalPosition: [0, GROUND_FLOOR_Y, 0] as const,
  yaw: 0,
} as const;

/**
 * The anchor coordinates this set was authored against, copied from `house.ts`. Exported so an
 * integrator can assert that the runtime anchor and the exported geometry still agree instead
 * of discovering a silent drift in a frame. `yaw` is radians about +Y.
 */
export const INTERIOR_ANCHOR_REFERENCE = {
  sofa: { lx: 5.4, lz: -4.4, yaw: -Math.PI / 2, footprint: [2.2, 0.9] },
  'coffee-table': { lx: 3.6, lz: -4.4, yaw: 0, footprint: [1.2, 0.6] },
  'tv-unit': { lx: 1, lz: -4.4, yaw: Math.PI / 2, footprint: [1.6, 0.5] },
  'dining-table': { lx: -3.4, lz: -3.4, yaw: 0, footprint: [1.6, 1] },
  'kitchen-run': { lx: -6.2, lz: 5.2, yaw: Math.PI / 2, footprint: [4.4, 0.65] },
} as const;

export interface StudioInteriorAssetOptions {
  /** Base the asset URL resolves against; defaults to Vite's `BASE_URL`, then '/'. */
  baseUrl?: string;
  /** World position of the house origin this set belongs to. */
  position?: readonly [number, number, number];
  /** Yaw about +Y in radians; `Math.PI` mirrors the set for the opposite-facing house. */
  headingRadians?: number;
  /** Overrides the asset list; defaults to the hero composition alone. */
  assetPaths?: readonly string[];
}

export interface StudioInteriorAssets {
  root: THREE.Group;
  ready: Promise<void>;
  dispose: () => void;
}

function resolveBaseUrl(explicit?: string): string {
  if (typeof explicit === 'string' && explicit.length > 0) return explicit;
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL;
  return typeof base === 'string' && base.length > 0 ? base : '/';
}

function joinUrl(base: string, path: string): string {
  return `${base.endsWith('/') ? base : `${base}/`}${path.replace(/^\/+/, '')}`;
}

/** Resolves the hero interior URL against the deployment base, without fetching anything. */
export function resolveInteriorHeroUrl(baseUrl?: string): string {
  return joinUrl(resolveBaseUrl(baseUrl), INTERIOR_HERO_ASSET_PATH);
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
 * Restores the closed-volume contract the glTF exporter relaxes: an opaque interior volume
 * shades faces the player can never see when it is left double-sided. Transparent surfaces
 * (the television glass) keep their two-sided presentation and stop writing depth.
 */
function applyPresentationContract(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.worldStudioInteriorAsset = true;
    node.userData.presentationOnly = true;
    const mesh = node as Partial<THREE.Mesh>;
    const material = mesh.material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      if (entry.transparent === true || entry.opacity < 1) {
        entry.depthWrite = false;
        continue;
      }
      entry.side = THREE.FrontSide;
      entry.needsUpdate = true;
    }
  });
}

/**
 * Builds the additive interior-dressing group. The returned root is usable immediately; the
 * dressing appears inside it once `ready` resolves.
 */
export function createStudioInteriorAssets(
  options: StudioInteriorAssetOptions = {},
): StudioInteriorAssets {
  const root = new THREE.Group();
  root.name = 'world-studio-interior-assets';
  root.userData.presentationOnly = true;

  const position = options.position ?? [0, 0, 0];
  root.position.set(position[0], position[1], position[2]);
  root.rotation.y = options.headingRadians ?? 0;

  const base = resolveBaseUrl(options.baseUrl);
  const paths = options.assetPaths ?? [INTERIOR_HERO_ASSET_PATH];
  const loader = new GLTFLoader();
  const loaded: THREE.Object3D[] = [];
  let disposed = false;

  const ready = Promise.all(
    paths.map((path) =>
      loader.loadAsync(joinUrl(base, path)).then((gltf) => {
        const scene = gltf.scene;
        if (disposed) {
          // Lost the race with dispose(): release the payload instead of attaching it.
          disposeSubtree(scene);
          return;
        }
        scene.name = `world-studio-${path.split('/').pop()?.replace(/\.glb$/i, '') ?? 'interior'}`;
        applyPresentationContract(scene);
        loaded.push(scene);
        root.add(scene);
      }),
    ),
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
