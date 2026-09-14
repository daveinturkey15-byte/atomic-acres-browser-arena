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
 * Ownership, stated because `dispose()` is broader than it looks:
 *   - Everything under `root` belongs to this module. `dispose()` ends with `root.clear()`, so any
 *     child a caller parents *into* `root` is detached too. Park sibling content next to `root`,
 *     not inside it.
 *   - Geometries, materials and material-held textures reached from a loaded payload are disposed.
 *     Nothing is shared with the procedural kit, so there is nothing to double-free — but it does
 *     mean a caller must not retain a material from this subtree past `dispose()`.
 *   - `root` itself is not removed from its parent, because this module did not attach it. The
 *     caller that parented it owns unparenting it.
 *
 * It creates no renderer, no animation loop, no DOM listener, no window global and no light.
 * Interior practicals stay with the lighting lane.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { INTERIOR_ASSETS, getInteriorAsset, selectInteriorAssetPaths } from './catalog';
import { repairInteriorScene } from './fit';

/** Catalog id for a deploy-relative path, or `null` for a path the catalog does not publish. */
function assetIdForPath(path: string): string | null {
  const normalised = path.replace(/^\/+/, '');
  return INTERIOR_ASSETS.find((asset) => asset.path === normalised)?.id ?? null;
}

export {
  INTERIOR_ASSETS,
  INTERIOR_ASSET_DIRECTORY,
  INTERIOR_HERO_ID,
  INTERIOR_PROP_IDS,
  getInteriorAsset,
  interiorSelectionBounds,
  publishedAnchorIdsFor,
  selectInteriorAssetPaths,
  selectInteriorAssets,
} from './catalog';
export type { InteriorAssetBounds, InteriorAssetEntry, InteriorAssetKind } from './catalog';
export {
  ACCEPTED_OVERRUNS,
  SOFA_PLINTH_REPAIR,
  assertInteriorFitPolicy,
  declaredAnchorBox,
  evaluateInteriorFit,
  evaluateInteriorFits,
  fitNudgeFor,
  measureOverrun,
  repairInteriorScene,
  repairedBoundsFor,
} from './fit';
export type { InteriorAnchorId, InteriorFitOverrun, InteriorFitResult } from './fit';

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
 * converts to world space exactly as `house.ts` does: `x = wx(lx) = centreX + frontSign * lx`
 * and `z = lz`.
 *
 * CORRECTION (wave 3). An earlier revision of this comment said the mirrored (yellow) house is
 * reached by `yaw -> PI - yaw`. That rule is `house.ts`'s, and it is right *for an anchor's
 * orientation*, but it is not a transform this group can apply. `frontSign = -1` maps house-local
 * `(x, z)` to `(-x, z)` — a reflection across the X axis. A yaw of PI maps it to `(-x, -z)`, which
 * also flips Z and would put the kitchen run on the wrong side of the house. The mirrored house
 * needs `scale.x = -1`, which is what `interiorHousePlacement` returns and what the `mirrored`
 * option applies. three 0.185.1 flips triangle winding for a negative-determinant world matrix
 * (`WebGLRenderer` `determinantAffine() < 0`), so the `FrontSide` contract below still holds
 * under the reflection. `PI - yaw` remains correct for the anchors themselves.
 */
export const INTERIOR_HERO_PLACEMENT = {
  houseLocalPosition: [0, GROUND_FLOOR_Y, 0] as const,
  yaw: 0,
} as const;

/**
 * The anchor coordinates this set was authored against, copied from `house.ts`. Exported so an
 * integrator can assert that the runtime anchor and the exported geometry still agree instead
 * of discovering a silent drift in a frame. `yaw` is radians about +Y.
 *
 * Defined in `fit.ts` since wave 5, because the fit maths and the loader both need it and the
 * numbers must not diverge. Re-exported here unchanged: the name, shape and values are the ones
 * wave 3 published.
 */
export { INTERIOR_ANCHOR_REFERENCE } from './fit';

export interface StudioInteriorAssetOptions {
  /** Base the asset URL resolves against; defaults to Vite's `BASE_URL`, then '/'. */
  baseUrl?: string;
  /** World position of the house origin this set belongs to. */
  position?: readonly [number, number, number];
  /**
   * Yaw about +Y in radians. This rotates the set; it does NOT mirror it. For the opposite-facing
   * house use `mirrored` (or `interiorHousePlacement`) — see `INTERIOR_HERO_PLACEMENT`.
   */
  headingRadians?: number;
  /**
   * Reflects the set across its local X axis, matching `house.ts` `frontSign = -1`. Applied as
   * `scale.x = -1`, so it composes with `headingRadians` the same way the house does.
   */
  mirrored?: boolean;
  /**
   * Catalog ids to load, validated by `selectInteriorAssets` — this is the checked route, and it
   * refuses a hero/prop mix. Mutually exclusive with `assetPaths`.
   */
  assetIds?: readonly string[];
  /**
   * Raw deploy-base-relative paths, unchecked. Kept for callers that already hold a path; prefer
   * `assetIds`. Defaults to the hero composition alone.
   */
  assetPaths?: readonly string[];
  /**
   * Applies the measured fit corrections in `fit.ts` to each payload as it lands — the `sofa-frame`
   * double-rotation repair and a sub-25 mm nudge of an asset that sits proud of its footprint.
   * Defaults to `true`: the defect is in the shipped bytes and a consumer that forgets to opt in
   * gets the crosswise plinth. Set `false` to load exactly what the file contains.
   *
   * Every repair tests for the defect it fixes first, so this is safe to leave on across a
   * re-export that fixes the geometry in Blender.
   */
  repairFit?: boolean;
}

export interface StudioInteriorAssets {
  root: THREE.Group;
  ready: Promise<void>;
  dispose: () => void;
  /**
   * Corrections actually applied, in the order they were applied. Meaningful once `ready` settles;
   * empty when `repairFit` is `false` or when nothing needed repairing. Exposed so an integrator
   * can log what the loader changed rather than infer it from a frame.
   */
  repairs: readonly string[];
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

/** Resolves any catalog asset's URL against the deployment base, without fetching anything. */
export function resolveInteriorAssetUrl(id: string, baseUrl?: string): string {
  return joinUrl(resolveBaseUrl(baseUrl), getInteriorAsset(id).path);
}

/** The subset of `house.ts`'s config this set needs in order to sit on a house. */
export interface InteriorHouseFrame {
  /** World X of the house centre line, `house.ts` `config.centreX`. */
  centreX: number;
  /** `house.ts` `config.frontSign`: `1` for the teal house, `-1` for the mirrored one. */
  frontSign: 1 | -1;
}

/**
 * Converts a house frame into loader options, so the world transform is derived from the same two
 * numbers `house.ts` uses rather than re-guessed at the call site.
 *
 * `y` is `GROUND_FLOOR_Y` because the GLBs are authored from `y = 0` at floor level, and `z` is 0
 * because house-local Z is world Z unchanged. The mirrored house is a reflection, not a rotation;
 * see `INTERIOR_HERO_PLACEMENT` for why `headingRadians: Math.PI` is the wrong tool.
 */
export function interiorHousePlacement(
  house: InteriorHouseFrame,
): { position: readonly [number, number, number]; headingRadians: number; mirrored: boolean } {
  return {
    position: [house.centreX, GROUND_FLOOR_Y, 0],
    headingRadians: 0,
    mirrored: house.frontSign < 0,
  };
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
  if (options.mirrored === true) root.scale.x = -1;

  const base = resolveBaseUrl(options.baseUrl);
  if (options.assetIds && options.assetPaths) {
    throw new Error('Pass either assetIds or assetPaths, not both.');
  }
  // Selection is validated before the group is handed back, so a hero/prop mix fails at the call
  // site rather than resolving into coincident geometry nobody looks for.
  const paths = options.assetIds
    ? selectInteriorAssetPaths(options.assetIds)
    : options.assetPaths ?? [INTERIOR_HERO_ASSET_PATH];
  const loader = new GLTFLoader();
  const loaded: THREE.Object3D[] = [];
  const repairs: string[] = [];
  const repairFit = options.repairFit !== false;
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
        // Fit corrections run before the payload is attached, so nothing is ever drawn in the
        // defective pose. `assetIdForPath` is null for an unknown raw path: the node-level repair
        // still applies (it tests for the defect itself), the catalog-derived nudge does not.
        if (repairFit) repairs.push(...repairInteriorScene(scene, assetIdForPath(path)));
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

  return { root, ready, dispose, repairs };
}
