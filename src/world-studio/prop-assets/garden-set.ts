/**
 * Props-lane garden set: table, four chairs and red parasol for the Nuketown
 * yellow-backyard deck (concept codex-clipboard-b6a7a535).
 *
 * Additive loader following src/world-studio/blender-assets/index.ts: the returned
 * root is usable immediately, the GLB appears inside it once `ready` resolves,
 * and `dispose` releases every payload including the lost-race-with-dispose path.
 * Presentation-only: no collision authority is claimed here; the arena owner
 * verifies player/shot coverage against the measured footprint below.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface GardenSetOptions {
  /**
   * Base path the asset URL is resolved against. Defaults to Vite's
   * `import.meta.env.BASE_URL` so a sub-path deployment works, '/' outside Vite.
   */
  baseUrl?: string;
  /** World-space placement override. Metres. */
  position?: readonly [number, number, number];
  /** Rotation about Y in radians. Chairs ring the origin; 0 keeps script yaw. */
  headingRadians?: number;
}

export interface GardenSet {
  root: THREE.Group;
  ready: Promise<void>;
  dispose: () => void;
}

/** Path of the exported garden set relative to the deployment base. */
export const GARDEN_SET_ASSET_PATH = 'assets/world-studio/blender/props/garden-set.glb';

/**
 * Declared placement advice for the yellow-house deck: the set is centred on its
 * own origin with ground contact at Y = 0, so drop the origin on the deck boards
 * and yaw it so one chair faces the sliding door. Keep a 0.35 m walkway outside
 * the footprint radius for player circulation.
 */
export const GARDEN_SET_PLACEMENT = { position: [0, 0, 0] as const, headingRadians: 0 };

/**
 * Measured on the exported GLB census (Blender 5.1.2, seed 20260912):
 * 61 objects, 8148 triangles, 3 PBR materials. Footprint is the true vertex
 * bound, not a bbox-corner overestimate.
 */
export const GARDEN_SET_DIMENSIONS = {
  footprintHalfExtent: 1.446,
  height: 2.405,
  tableTopRadius: 0.55,
  tableTopHeight: 0.735,
  canopyRadius: 1.32,
} as const;

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
 * Resolves the garden-set URL against the deployment base. Exported so the
 * base-awareness can be asserted without a network fetch.
 */
export function resolveGardenSetUrl(baseUrl?: string): string {
  return joinUrl(resolveBaseUrl(baseUrl), GARDEN_SET_ASSET_PATH);
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
 * Marks every loaded node presentation-only and restores the closed-volume contract:
 * opaque faces stay single-sided; transparent surfaces keep depth-write off.
 */
function applyPresentationContract(root: THREE.Object3D): void {
  root.traverse((node) => {
    node.userData.worldStudioPropsAsset = true;
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
 * Builds the additive garden-set group. Usable immediately; the set appears
 * inside it once `ready` resolves.
 */
export function createGardenSet(options: GardenSetOptions = {}): GardenSet {
  const root = new THREE.Group();
  root.name = 'world-studio-props-garden-set';
  root.userData.presentationOnly = true;

  const base = resolveBaseUrl(options.baseUrl);
  let disposed = false;
  const loaded: THREE.Object3D[] = [];

  const loader = new GLTFLoader();
  const ready = loader.loadAsync(joinUrl(base, GARDEN_SET_ASSET_PATH)).then((gltf) => {
    const scene = gltf.scene;
    if (disposed) {
      disposeSubtree(scene);
      return;
    }
    const position = options.position ?? GARDEN_SET_PLACEMENT.position;
    scene.name = 'world-studio-props-garden-set';
    scene.position.set(position[0], position[1], position[2]);
    scene.rotation.y = options.headingRadians ?? GARDEN_SET_PLACEMENT.headingRadians;
    applyPresentationContract(scene);
    loaded.push(scene);
    root.add(scene);
  }).then(() => undefined);

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
