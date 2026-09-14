/**
 * Props-lane retro utility AC unit: box condenser on a concrete pad with a
 * louvered front, top fan grille with blades, side control box and rear copper
 * stub, for beside the Nuketown teal-house chimney
 * (concept codex-clipboard-37cd28a5).
 *
 * Additive loader following src/world-studio/blender-assets/index.ts via the
 * wave-1 garden-set helper in this directory: the returned root is usable
 * immediately, the GLB appears inside it once `ready` resolves, and `dispose`
 * releases every payload including the lost-race-with-dispose path.
 * Presentation-only: no collision authority is claimed here; the arena owner
 * verifies player/shot coverage against the measured footprint below.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface UtilityAcOptions {
  /**
   * Base path the asset URL is resolved against. Defaults to Vite's
   * `import.meta.env.BASE_URL` so a sub-path deployment works, '/' outside Vite.
   */
  baseUrl?: string;
  /** World-space placement override. Metres. */
  position?: readonly [number, number, number];
  /** Rotation about Y in radians. Louvers face -Z; 0 keeps the script yaw. */
  headingRadians?: number;
}

export interface UtilityAc {
  root: THREE.Group;
  ready: Promise<void>;
  dispose: () => void;
}

/** Path of the exported AC unit relative to the deployment base. */
export const UTILITY_AC_ASSET_PATH = 'assets/world-studio/blender/props/utility-ac.glb';

/**
 * Declared placement advice: the unit is centred on its own origin with the
 * pad base at Y = 0, so drop the origin on grade beside the house wall and yaw
 * the louvers toward the yard. Keep 0.3 m service clearance on the control-box
 * (+X) side.
 */
export const UTILITY_AC_PLACEMENT = { position: [0, 0, 0] as const, headingRadians: 0 };

/**
 * Measured on the exported GLB census (Blender 5.1.2, seed 20260912):
 * 40 objects, 5980 triangles, 7 PBR materials. Bounds are true vertex bounds.
 */
export const UTILITY_AC_DIMENSIONS = {
  padHalfExtentX: 0.6,
  padHalfExtentZ: 0.5,
  height: 0.9245,
  cabinetWidth: 0.86,
  cabinetDepth: 0.64,
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
 * Resolves the AC-unit URL against the deployment base. Exported so the
 * base-awareness can be asserted without a network fetch.
 */
export function resolveUtilityAcUrl(baseUrl?: string): string {
  return joinUrl(resolveBaseUrl(baseUrl), UTILITY_AC_ASSET_PATH);
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
 * Builds the additive AC-unit group. Usable immediately; the unit appears
 * inside it once `ready` resolves.
 */
export function createUtilityAc(options: UtilityAcOptions = {}): UtilityAc {
  const root = new THREE.Group();
  root.name = 'world-studio-props-utility-ac';
  root.userData.presentationOnly = true;

  const base = resolveBaseUrl(options.baseUrl);
  let disposed = false;
  const loaded: THREE.Object3D[] = [];

  const loader = new GLTFLoader();
  const ready = loader.loadAsync(joinUrl(base, UTILITY_AC_ASSET_PATH)).then((gltf) => {
    const scene = gltf.scene;
    if (disposed) {
      disposeSubtree(scene);
      return;
    }
    const position = options.position ?? UTILITY_AC_PLACEMENT.position;
    scene.name = 'world-studio-props-utility-ac';
    scene.position.set(position[0], position[1], position[2]);
    scene.rotation.y = options.headingRadians ?? UTILITY_AC_PLACEMENT.headingRadians;
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
