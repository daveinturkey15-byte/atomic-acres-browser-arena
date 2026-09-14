/**
 * newworld-prime Blender GLB dressing (presentation-only).
 *
 * Attaches five Blender-built GLBs over the Day-1 blockout massing emitted by
 * buildNewworldPrime (src/newworld-prime-arena.ts). Authority
 * (colliders, ballistic surfaces, spawns, nav) is untouched — the authority
 * boxes already match these dims by construction, and every dressed mesh is
 * flagged presentation-only with raycast disabled, mirroring the blockout
 * emit conventions.
 *
 * Swap model: blockout boxes stay in the tree as fallback. A GLB instance
 * hides only its own blockout meshes, and only after it loads. Any load
 * failure (or a disabled flag) leaves the blockout visible, so the arena
 * never loses readable massing.
 *
 * Intended call site (orchestrator-owned, async — buildNewworldPrime itself
 * stays synchronous): after `buildNewworldPrime(scene)`, call
 * `await attachNewworldPrimeAssets(map.root)` and keep the returned status
 * for telemetry. Toggle back with setNewworldPrimeGlbDressingVisible for
 * owner comparison until the swap is approved.
 *
 * Source assets (read in place from the catalog — never copied into the repo
 * except the GLBs below):
 * - shed (1000 tris, re-import pass): atomic-acres-catalog/assets-batch1/shed/
 *   manifest.json — LAYOUT_CONTRACT fact 8 (NW teal shed, white/teal),
 *   dims 3.6 x 2.5 x 4.2 m.
 * - lamp (366 tris) + sign (168 tris): atomic-acres-catalog/assets-batch1/
 *   lamp-sign/manifest.json — LAYOUT_CONTRACT fact 5 (street lamps) and
 *   fact 9 (welcome sign; board blank, welcome text arrives later as decal).
 * - house-east-yellow (1542 tris): atomic-acres-catalog/assets-batch1/
 *   house-east-yellow/manifest.json — LAYOUT_CONTRACT fact 2 (EAST yellow
 *   siding, stone chimney, back patio red umbrella + BBQ), 7.8 x 6.4 m,
 *   2 x 2.7 m storeys, ridge ~7.9 m.
 * - house-west-teal (3064 tris): atomic-acres-catalog/assets-batch1/
 *   house-west-teal/manifest.json — LAYOUT_CONTRACT fact 2 (WEST teal
 *   siding, white trim, chimney, porch with railing), 7.2 x 6.0 m.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { retryLoad } from './retry-load';
import {
  NEWWORLD_PRIME_EAST_YELLOW_ORIGIN,
  NEWWORLD_PRIME_WEST_TEAL_ORIGIN,
} from './newworld-prime-arena';
import {
  NEWWORLD_PRIME_SHED_PLACEMENTS,
  NEWWORLD_PRIME_STREET_LAMP_PLACEMENTS,
  NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT,
  type NewworldPrimePropPlacement,
} from './newworld-prime-props';

/** Cache-busting lane for the batch-1 GLB copies (mirrors blender-environment.ts). */
const NEWWORLD_PRIME_GLB_VERSION = 'batch1-20260914';

/** Public asset URLs for the five batch-1 GLB copies. */
export const NEWWORLD_PRIME_HOUSE_WEST_GLB =
  `./assets/newworld-prime/house-west-teal.glb?v=${NEWWORLD_PRIME_GLB_VERSION}`;
export const NEWWORLD_PRIME_HOUSE_EAST_GLB =
  `./assets/newworld-prime/house-east-yellow.glb?v=${NEWWORLD_PRIME_GLB_VERSION}`;
export const NEWWORLD_PRIME_SHED_GLB =
  `./assets/newworld-prime/shed.glb?v=${NEWWORLD_PRIME_GLB_VERSION}`;
export const NEWWORLD_PRIME_LAMP_GLB =
  `./assets/newworld-prime/lamp.glb?v=${NEWWORLD_PRIME_GLB_VERSION}`;
export const NEWWORLD_PRIME_SIGN_GLB =
  `./assets/newworld-prime/sign.glb?v=${NEWWORLD_PRIME_GLB_VERSION}`;

/**
 * Fallback flags for the GLB/blockout swap. Every group defaults ON (new
 * meshes dress the arena); any group set false keeps its blockout massing
 * visible and skips its GLB load. This is the flag the owner flips until
 * the swap is approved.
 */
export type NewworldPrimeGlbDressingFlags = Readonly<{
  houses: boolean;
  sheds: boolean;
  lamps: boolean;
  sign: boolean;
}>;

export const NEWWORLD_PRIME_GLB_DRESSING_DEFAULT: NewworldPrimeGlbDressingFlags = Object.freeze({
  houses: true,
  sheds: true,
  lamps: true,
  sign: true,
});

export type NewworldPrimeGlbAssetId =
  | 'house-west-teal'
  | 'house-east-yellow'
  | 'shed'
  | 'lamp'
  | 'sign';

/** Per-asset outcome: blockout stays visible whenever error is non-null. */
export type NewworldPrimeGlbAttachment = Readonly<{
  asset: NewworldPrimeGlbAssetId;
  url: string;
  instances: number;
  blockoutHidden: number;
  triangleCount: number;
  error: string | null;
}>;

type DressingSpot = Readonly<{ x: number; z: number; rotationY: number }>;

type DressingPlan = Readonly<{
  asset: NewworldPrimeGlbAssetId;
  url: string;
  /** Arena-space placements: plan position plus yaw radians. */
  spots: readonly DressingSpot[];
  /** Blockout mesh-name predicate for the fallback this asset covers. */
  coversBlockout: (meshName: string) => boolean;
}>;

function placementSpots(placements: readonly NewworldPrimePropPlacement[]): readonly DressingSpot[] {
  return placements.map((placement) => ({
    x: placement.x,
    z: placement.z,
    rotationY: placement.rotationY,
  }));
}

function dressingPlan(flags: NewworldPrimeGlbDressingFlags): readonly DressingPlan[] {
  const plans: DressingPlan[] = [];
  if (flags.houses) {
    plans.push({
      asset: 'house-west-teal',
      url: NEWWORLD_PRIME_HOUSE_WEST_GLB,
      spots: [{
        x: NEWWORLD_PRIME_WEST_TEAL_ORIGIN.xMetres,
        z: NEWWORLD_PRIME_WEST_TEAL_ORIGIN.zMetres,
        rotationY: ((NEWWORLD_PRIME_WEST_TEAL_ORIGIN.rotationYDeg ?? 0) * Math.PI) / 180,
      }],
      // emitStructurePart names blockout meshes `newworld-prime-<part.id>`;
      // west parts carry the `newworld-west-teal` prefix.
      coversBlockout: (meshName: string) => meshName.startsWith('newworld-prime-newworld-west-teal'),
    });
    plans.push({
      asset: 'house-east-yellow',
      url: NEWWORLD_PRIME_HOUSE_EAST_GLB,
      spots: [{
        x: NEWWORLD_PRIME_EAST_YELLOW_ORIGIN.xMetres,
        z: NEWWORLD_PRIME_EAST_YELLOW_ORIGIN.zMetres,
        rotationY: ((NEWWORLD_PRIME_EAST_YELLOW_ORIGIN.rotationYDeg ?? 0) * Math.PI) / 180,
      }],
      coversBlockout: (meshName: string) => meshName.startsWith('newworld-prime-newworld-east-yellow'),
    });
  }
  if (flags.sheds) {
    plans.push({
      asset: 'shed',
      url: NEWWORLD_PRIME_SHED_GLB,
      spots: placementSpots(NEWWORLD_PRIME_SHED_PLACEMENTS),
      coversBlockout: (meshName: string) => NEWWORLD_PRIME_SHED_PLACEMENTS.some((p) => meshName.includes(p.id)),
    });
  }
  if (flags.lamps) {
    plans.push({
      asset: 'lamp',
      url: NEWWORLD_PRIME_LAMP_GLB,
      spots: placementSpots(NEWWORLD_PRIME_STREET_LAMP_PLACEMENTS),
      coversBlockout: (meshName: string) => NEWWORLD_PRIME_STREET_LAMP_PLACEMENTS.some((p) => meshName.includes(p.id)),
    });
  }
  if (flags.sign) {
    plans.push({
      asset: 'sign',
      url: NEWWORLD_PRIME_SIGN_GLB,
      spots: placementSpots([NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT]),
      coversBlockout: (meshName: string) => meshName.includes(NEWWORLD_PRIME_WELCOME_SIGN_PLACEMENT.id),
    });
  }
  return plans;
}

/**
 * Presentation-only dressing for one dressed instance. Materials stay
 * exactly as authored in the GLB — only scene flags match the blockout
 * emit conventions (no shadow casting, no shot/collision role, no raycast).
 */
function markDressingInstance(group: THREE.Group, asset: NewworldPrimeGlbAssetId): number {
  let triangles = 0;
  group.traverse((node) => {
    node.userData.newworldPrimeGlbDressing = asset;
    if (!(node instanceof THREE.Mesh)) return;
    node.userData.presentationOnly = true;
    node.userData.blocksShots = false;
    node.userData.solid = false;
    node.userData.shots = false;
    node.castShadow = false;
    node.receiveShadow = true;
    node.raycast = () => undefined;
    const geometry = node.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    triangles += geometry.index ? geometry.index.count / 3 : (position?.count ?? 0) / 3;
  });
  return Math.round(triangles);
}

/** Hides this asset's blockout fallback meshes; tags them for the toggle. */
function hideCoveredBlockout(root: THREE.Group, asset: NewworldPrimeGlbAssetId, plan: DressingPlan): number {
  let hidden = 0;
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.userData.newworldPrimeGlbDressing === asset) return;
    if (!plan.coversBlockout(node.name)) return;
    if (!node.visible) return;
    node.visible = false;
    node.userData.newworldPrimeGlbCoveredBy = asset;
    hidden += 1;
  });
  return hidden;
}

/**
 * Attaches the batch-1 GLB dressing to a built newworld-prime blockout root.
 * Deterministic: placements iterate in contract order, no randomness.
 * Never throws for asset failures — the blockout fallback stays visible and
 * the failure is reported on that asset's status entry.
 */
export async function attachNewworldPrimeAssets(
  root: THREE.Group,
  flags: Partial<NewworldPrimeGlbDressingFlags> = {},
): Promise<readonly NewworldPrimeGlbAttachment[]> {
  const resolved: NewworldPrimeGlbDressingFlags = {
    ...NEWWORLD_PRIME_GLB_DRESSING_DEFAULT,
    ...flags,
  };
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const dressed = root.userData.newworldPrimeGlbDressed as Record<string, boolean> | undefined;
  const dressedSet: Record<string, boolean> = { ...(dressed ?? {}) };
  const results: NewworldPrimeGlbAttachment[] = [];
  for (const plan of dressingPlan(resolved)) {
    if (dressedSet[plan.asset]) continue;
    try {
      const gltf = await retryLoad(
        `newworld-prime ${plan.asset} glb`,
        () => loader.loadAsync(plan.url),
      );
      let triangles = 0;
      let instances = 0;
      for (const spot of plan.spots) {
        const instance = instances === 0 ? gltf.scene : gltf.scene.clone(true);
        instance.name = `newworld-prime-glb-${plan.asset}`;
        instance.position.set(spot.x, 0, spot.z);
        if (spot.rotationY !== 0) instance.rotation.y = spot.rotationY;
        triangles += markDressingInstance(instance, plan.asset);
        root.add(instance);
        instances += 1;
      }
      const blockoutHidden = hideCoveredBlockout(root, plan.asset, plan);
      dressedSet[plan.asset] = true;
      results.push({
        asset: plan.asset, url: plan.url, instances, blockoutHidden, triangleCount: triangles, error: null,
      });
    } catch (error) {
      results.push({
        asset: plan.asset,
        url: plan.url,
        instances: 0,
        blockoutHidden: 0,
        triangleCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  root.userData.newworldPrimeGlbDressed = dressedSet;
  return results;
}

/**
 * Owner comparison toggle: false restores every GLB-covered blockout mesh
 * and hides the dressing; true re-applies the swap. Blockout meshes never
 * covered by a loaded GLB are untouched.
 */
export function setNewworldPrimeGlbDressingVisible(root: THREE.Group, visible: boolean): void {
  root.traverse((node) => {
    if (node.userData.newworldPrimeGlbDressing !== undefined) {
      node.visible = visible;
    } else if (node.userData.newworldPrimeGlbCoveredBy !== undefined && node instanceof THREE.Mesh) {
      node.visible = !visible;
    }
  });
}
