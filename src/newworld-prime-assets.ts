/**
 * newworld-prime Blender GLB dressing (presentation-only).
 *
 * Attaches twenty-one Blender-built GLBs over the Day-1 blockout massing emitted by
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
 * - bus (3692 tris): atomic-acres-catalog/assets-batch1/bus/out.glb —
 *   LAYOUT_CONTRACT fact 4 (school-bus center spot, box ~11.2 x 2.5 x 2.6 m).
 * - semi (3740 tris): atomic-acres-catalog/assets-batch1/semi/out.glb —
 *   LAYOUT_CONTRACT fact 4 (semi-truck center spot, nose north, authority
 *   box ~13 m already matches — presentation-only, untouched).
 * - fence bay (198 tris, 2.4 m repeat), hedge (200 tris), pad (48 tris):
 *   atomic-acres-catalog/assets-batch1/fences/ — privacy-fence runs, hedge
 *   runs, and all 9 concrete-pad placements from newworld-prime-props.
 * - rusty car (1232 tris): atomic-acres-catalog/assets-batch1/rusty-car/out.glb —
 *   LAYOUT_CONTRACT fact 9 (rusty-car showcase spot at the north entrance,
 *   box ~4.4 x 1.8 x 1.45 m — presentation-only, untouched).
 * - jeep (2180 tris): atomic-acres-catalog/assets-batch1/jeep/out.glb —
 *   south-exit reservation spot (x 13.5, z -21.0, yaw -0.5) — non-solid
 *   dressing, reservation footprint, authority untouched.
 * - clothesline: atomic-acres-catalog/assets-batch1/yard/clothesline.glb —
 *   Fact-8 backyard spots (x -15, z -11) + (x 15, z 12) over the line +
 *   laundry massing — non-solid dressing, authority untouched.
 * - sandbags: atomic-acres-catalog/assets-batch1/yard/sandbags.glb —
 *   south-exit reservation spot (x 0, z 8.5, yaw 0) — non-solid dressing,
 *   reservation footprint, authority untouched.
 * - furniture: atomic-acres-catalog/assets-batch1/yard/furniture.glb —
 *   east back-patio spot (x 13.5, z -7.5) over the umbrella/BBQ massing —
 *   non-solid dressing, authority untouched.
 * - garage (1096 tris): atomic-acres-catalog/assets-batch1/garage/out.glb —
 *   batch-4 brief (garages flank BOTH houses, attached side volumes), dims
 *   3.4 x 3.62 x 5.2 m — non-solid dressing, authority untouched (garage
 *   authority boxes arrive with a later pass if gameplay needs them).
 * - crates + pallet + wall bay (1752 tris total): atomic-acres-catalog/
 *   assets-batch1/crates-walls/ (crate_06/09/12.glb 0.6/0.9/1.2 m,
 *   pallet.glb, wall_bay.glb 2.4 m bay) — batch-4 brief queue items 2+3,
 *   LAYOUT_CONTRACT facts 4/6/9 (loop cover, south-entry choke, perimeter
 *   wall ring) — non-solid dressing, authority untouched.
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
  NEWWORLD_PRIME_CONCRETE_PAD_PLACEMENTS,
  NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES,
  NEWWORLD_PRIME_HEDGE_RUNS,
  NEWWORLD_PRIME_PRIVACY_FENCE_RUNS,
  NEWWORLD_PRIME_JEEP_RESERVATION,
  NEWWORLD_PRIME_SANDBAG_RESERVATION,
  NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT,
  NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT,
  NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT,
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

/** Cache-busting lane for the batch-2 GLB copies. */
const NEWWORLD_PRIME_GLB_VERSION_BATCH2 = 'batch2-20260914';

/** Public asset URLs for the four batch-2 GLB copies. */
export const NEWWORLD_PRIME_BUS_GLB =
  `./assets/newworld-prime/bus.glb?v=${NEWWORLD_PRIME_GLB_VERSION_BATCH2}`;
export const NEWWORLD_PRIME_FENCE_BAY_GLB =
  `./assets/newworld-prime/fence_bay.glb?v=${NEWWORLD_PRIME_GLB_VERSION_BATCH2}`;
export const NEWWORLD_PRIME_HEDGE_GLB =
  `./assets/newworld-prime/hedge.glb?v=${NEWWORLD_PRIME_GLB_VERSION_BATCH2}`;
export const NEWWORLD_PRIME_PAD_GLB =
  `./assets/newworld-prime/pad.glb?v=${NEWWORLD_PRIME_GLB_VERSION_BATCH2}`;
/** Cache-busting lane for the wave-3 semi GLB copy. */
const NEWWORLD_PRIME_GLB_VERSION_BATCH3 = 'batch3-20260914';

/** Public asset URL for the wave-3 semi GLB copy. */
export const NEWWORLD_PRIME_SEMI_GLB =
  `./assets/newworld-prime/semi.glb?v=${NEWWORLD_PRIME_GLB_VERSION_BATCH3}`;
/** Cache-busting lane for the wave-4 rusty-car GLB copy. */
const NEWWORLD_PRIME_GLB_VERSION_BATCH4 = 'batch4-20260914';

/** Public asset URL for the wave-4 rusty-car GLB copy. */
export const NEWWORLD_PRIME_RUSTY_CAR_GLB =
  `./assets/newworld-prime/rusty-car.glb?v=${NEWWORLD_PRIME_GLB_VERSION_BATCH4}`;
/** Cache-busting lane for the wave-5 jeep GLB copy. */
const NEWWORLD_PRIME_GLB_VERSION_WAVE5 = 'wave5-20260914';

/** Public asset URL for the wave-5 jeep GLB copy. */
export const NEWWORLD_PRIME_JEEP_GLB =
  `./assets/newworld-prime/jeep.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE5}`;
/** Cache-busting lane for the wave-6 yard-set GLB copies. */
const NEWWORLD_PRIME_GLB_VERSION_WAVE6 = 'wave6-20260914';

/** Public asset URLs for the three wave-6 yard-set GLB copies. */
export const NEWWORLD_PRIME_CLOTHESLINE_GLB =
  `./assets/newworld-prime/clothesline.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE6}`;
export const NEWWORLD_PRIME_SANDBAGS_GLB =
  `./assets/newworld-prime/sandbags.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE6}`;
export const NEWWORLD_PRIME_FURNITURE_GLB =
  `./assets/newworld-prime/furniture.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE6}`;

/** Cache-busting lane for the wave-7 garage + crates + wall GLB copies. */
const NEWWORLD_PRIME_GLB_VERSION_WAVE7 = 'wave7-20260914';

/** Public asset URLs for the six wave-7 garage/crates/wall GLB copies. */
export const NEWWORLD_PRIME_GARAGE_GLB =
  `./assets/newworld-prime/garage.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE7}`;
export const NEWWORLD_PRIME_CRATE_06_GLB =
  `./assets/newworld-prime/crate_06.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE7}`;
export const NEWWORLD_PRIME_CRATE_09_GLB =
  `./assets/newworld-prime/crate_09.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE7}`;
export const NEWWORLD_PRIME_CRATE_12_GLB =
  `./assets/newworld-prime/crate_12.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE7}`;
export const NEWWORLD_PRIME_PALLET_GLB =
  `./assets/newworld-prime/pallet.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE7}`;
export const NEWWORLD_PRIME_WALL_BAY_GLB =
  `./assets/newworld-prime/wall_bay.glb?v=${NEWWORLD_PRIME_GLB_VERSION_WAVE7}`;

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
  bus: boolean;
  fences: boolean;
  hedges: boolean;
  pads: boolean;
  semi: boolean;
  rustyCar: boolean;
  jeep: boolean;
  clothesline: boolean;
  sandbags: boolean;
  furniture: boolean;
  garage: boolean;
  crates: boolean;
  walls: boolean;
}>;

export const NEWWORLD_PRIME_GLB_DRESSING_DEFAULT: NewworldPrimeGlbDressingFlags = Object.freeze({
  houses: true,
  sheds: true,
  lamps: true,
  sign: true,
  bus: true,
  fences: true,
  hedges: true,
  pads: true,
  semi: true,
  rustyCar: true,
  jeep: true,
  clothesline: true,
  sandbags: true,
  furniture: true,
  garage: true,
  crates: true,
  walls: true,
});

export type NewworldPrimeGlbAssetId =
  | 'house-west-teal'
  | 'house-east-yellow'
  | 'shed'
  | 'lamp'
  | 'sign'
  | 'bus'
  | 'fence-bay'
  | 'hedge'
  | 'pad'
  | 'semi'
  | 'rusty-car'
  | 'jeep'
  | 'clothesline'
  | 'sandbags'
  | 'furniture'
  | 'garage'
  | 'crate-06'
  | 'crate-09'
  | 'crate-12'
  | 'pallet'
  | 'wall-bay';

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

/**
 * Repeats one dressing instance per fence bay along each privacy-fence run's
 * local +X, mirroring the blockout emit (emitPropPart over
 * newworldPrimePrivacyFenceRunParts): world = run origin + yaw-rotated
 * (bay * bayLength, 0). Deterministic: contract run order, bay index order.
 */
function fenceBaySpots(): readonly DressingSpot[] {
  const spots: DressingSpot[] = [];
  for (const run of NEWWORLD_PRIME_PRIVACY_FENCE_RUNS) {
    const c = Math.cos(run.rotationY);
    const s = Math.sin(run.rotationY);
    for (let bay = 0; bay < run.bays; bay += 1) {
      const lx = bay * NEWWORLD_PRIME_FENCE_BAY_LENGTH_METRES;
      spots.push({
        x: run.x + lx * c,
        z: run.z - lx * s,
        rotationY: run.rotationY,
      });
    }
  }
  return spots;
}

/**
 * One dressing instance per hedge blob along each hedge run's local +X,
 * mirroring the blockout emit (blobs spaced 1.10 m in newworldPrimeHedgeRowParts).
 * Per-blob height/yaw jitter is intentionally not mirrored: the GLB dresses
 * every blob at the run yaw so the plan stays deterministic and countable.
 */
const NEWWORLD_PRIME_HEDGE_BLOB_SPACING_METRES = 1.1;

function hedgeSpots(): readonly DressingSpot[] {
  const spots: DressingSpot[] = [];
  for (const run of NEWWORLD_PRIME_HEDGE_RUNS) {
    const c = Math.cos(run.rotationY);
    const s = Math.sin(run.rotationY);
    for (let index = 0; index < run.blobs; index += 1) {
      const lx = index * NEWWORLD_PRIME_HEDGE_BLOB_SPACING_METRES;
      spots.push({
        x: run.x + lx * c,
        z: run.z - lx * s,
        rotationY: run.rotationY,
      });
    }
  }
  return spots;
}

/**
 * Perimeter wall ring (batch-4 brief queue item 3, LAYOUT_CONTRACT fact 9):
 * 2.4 m concrete bays enclose the playable block as a rectangle
 * (half-extents X 22 m, Z 28 m — clear of both houses, both attached
 * garages, both sheds, and all yard massing), with a ~6.4 m gap centred on
 * x = 0 in the north and south runs for the road entry/exit stubs.
 * Bays centre on each run so the plan stays deterministic and countable:
 * 16 + 16 on north/south (18 centred minus 2 skipped in the road gap),
 * 23 + 23 on east/west — 78 instances total.
 */
const NEWWORLD_PRIME_WALL_RING_HALF_X_METRES = 22;
const NEWWORLD_PRIME_WALL_RING_HALF_Z_METRES = 28;
const NEWWORLD_PRIME_WALL_BAY_LENGTH_METRES = 2.4;
const NEWWORLD_PRIME_WALL_RING_ROAD_GAP_HALF_METRES = 3.2;

function wallBaySpots(): readonly DressingSpot[] {
  const spots: DressingSpot[] = [];
  const hx = NEWWORLD_PRIME_WALL_RING_HALF_X_METRES;
  const hz = NEWWORLD_PRIME_WALL_RING_HALF_Z_METRES;
  const bay = NEWWORLD_PRIME_WALL_BAY_LENGTH_METRES;
  const gap = NEWWORLD_PRIME_WALL_RING_ROAD_GAP_HALF_METRES;
  const northCount = Math.floor((hx * 2) / bay);
  const northOffset = (hx * 2 - northCount * bay) / 2;
  for (const z of [hz, -hz]) {
    for (let index = 0; index < northCount; index += 1) {
      const x = -hx + northOffset + bay / 2 + index * bay;
      if (Math.abs(x) < gap) continue;
      spots.push({ x, z, rotationY: 0 });
    }
  }
  const sideCount = Math.floor((hz * 2) / bay);
  const sideOffset = (hz * 2 - sideCount * bay) / 2;
  for (const x of [hx, -hx]) {
    for (let index = 0; index < sideCount; index += 1) {
      const z = -hz + sideOffset + bay / 2 + index * bay;
      spots.push({ x, z, rotationY: Math.PI / 2 });
    }
  }
  return spots;
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
  if (flags.bus) {
    plans.push({
      asset: 'bus',
      url: NEWWORLD_PRIME_BUS_GLB,
      spots: placementSpots([NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT]),
      // emitPropPart names bus blockout meshes
      // `newworld-prime-<placement.id>-<part.id>`.
      coversBlockout: (meshName: string) => meshName.includes(NEWWORLD_PRIME_SCHOOL_BUS_PLACEMENT.id),
    });
  }
  if (flags.semi) {
    plans.push({
      asset: 'semi',
      url: NEWWORLD_PRIME_SEMI_GLB,
      spots: placementSpots([NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT]),
      // emitPropPart names semi blockout meshes
      // `newworld-prime-<placement.id>-<part.id>`.
      coversBlockout: (meshName: string) => meshName.includes(NEWWORLD_PRIME_SEMI_TRUCK_PLACEMENT.id),
    });
  }
  if (flags.rustyCar) {
    plans.push({
      asset: 'rusty-car',
      url: NEWWORLD_PRIME_RUSTY_CAR_GLB,
      spots: placementSpots([NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT]),
      // emitPropSet names rusty-car blockout meshes
      // `newworld-prime-<placement.id>-<part.id>`.
      coversBlockout: (meshName: string) => meshName.includes(NEWWORLD_PRIME_RUSTY_CAR_PLACEMENT.id),
    });
  }
  if (flags.jeep) {
    plans.push({
      asset: 'jeep',
      url: NEWWORLD_PRIME_JEEP_GLB,
      spots: [{
        x: NEWWORLD_PRIME_JEEP_RESERVATION.x,
        z: NEWWORLD_PRIME_JEEP_RESERVATION.z,
        rotationY: NEWWORLD_PRIME_JEEP_RESERVATION.rotationY,
      }],
      // South-exit reservation: no blockout meshes carry the reservation id
      // yet, so nothing hides until the reservation is built — the GLB is
      // pure addition and any load failure leaves the arena unchanged.
      coversBlockout: (meshName: string) => meshName.includes(NEWWORLD_PRIME_JEEP_RESERVATION.id),
    });
  }
  if (flags.clothesline) {
    plans.push({
      asset: 'clothesline',
      url: NEWWORLD_PRIME_CLOTHESLINE_GLB,
      // Fact 8 backyards — northwest (x -15, z -11) + southeast (x 15, z 12),
      // mirroring buildClotheslines: the line runs along local X, yaw 0.
      spots: [
        { x: -15, z: -11, rotationY: 0 },
        { x: 15, z: 12, rotationY: 0 },
      ],
      // Blockout names backyard massing `newworld-prime-clothesline-*` and
      // `newworld-prime-laundry-*`; both hide once the GLB lands, and any
      // load failure leaves them visible.
      coversBlockout: (meshName: string) =>
        meshName.includes('newworld-prime-clothesline') || meshName.includes('newworld-prime-laundry'),
    });
  }
  if (flags.sandbags) {
    plans.push({
      asset: 'sandbags',
      url: NEWWORLD_PRIME_SANDBAGS_GLB,
      spots: [{
        x: NEWWORLD_PRIME_SANDBAG_RESERVATION.x,
        z: NEWWORLD_PRIME_SANDBAG_RESERVATION.z,
        rotationY: NEWWORLD_PRIME_SANDBAG_RESERVATION.rotationY,
      }],
      // South-exit reservation: no blockout meshes carry the reservation id
      // yet, so nothing hides until the reservation is built — the GLB is
      // pure addition and any load failure leaves the arena unchanged.
      coversBlockout: (meshName: string) => meshName.includes(NEWWORLD_PRIME_SANDBAG_RESERVATION.id),
    });
  }
  if (flags.furniture) {
    plans.push({
      asset: 'furniture',
      url: NEWWORLD_PRIME_FURNITURE_GLB,
      // East back patio over the umbrella/BBQ massing (Fact 2 dressing).
      spots: [{ x: 13.5, z: -7.5, rotationY: 0 }],
      // Blockout names patio massing `newworld-prime-umbrella-*` and
      // `newworld-prime-bbq`; both hide once the GLB lands, and any load
      // failure leaves them visible.
      coversBlockout: (meshName: string) =>
        meshName.includes('newworld-prime-umbrella') || meshName.includes('newworld-prime-bbq'),
    });
  }
  if (flags.fences) {
    plans.push({
      asset: 'fence-bay',
      url: NEWWORLD_PRIME_FENCE_BAY_GLB,
      spots: fenceBaySpots(),
      coversBlockout: (meshName: string) => NEWWORLD_PRIME_PRIVACY_FENCE_RUNS.some((run) => meshName.includes(run.id)),
    });
  }
  if (flags.hedges) {
    plans.push({
      asset: 'hedge',
      url: NEWWORLD_PRIME_HEDGE_GLB,
      spots: hedgeSpots(),
      coversBlockout: (meshName: string) => NEWWORLD_PRIME_HEDGE_RUNS.some((run) => meshName.includes(run.id)),
    });
  }
  if (flags.pads) {
    plans.push({
      asset: 'pad',
      url: NEWWORLD_PRIME_PAD_GLB,
      spots: placementSpots(NEWWORLD_PRIME_CONCRETE_PAD_PLACEMENTS),
      coversBlockout: (meshName: string) => NEWWORLD_PRIME_CONCRETE_PAD_PLACEMENTS.some((p) => meshName.includes(p.id)),
    });
  }
  if (flags.garage) {
    plans.push({
      asset: 'garage',
      url: NEWWORLD_PRIME_GARAGE_GLB,
      // Batch-4 brief: attached side volumes flanking BOTH houses. Each
      // garage mirrors its house origin, offset outward by half the house
      // width plus half the garage width (west 7.2 m house + 3.4 m garage
      // -> -18.8; east 7.8 m house + 3.4 m garage -> 19.1), z-kept on the
      // house centreline and clear of the sedan driveways (z 7 / patio).
      // As-authored yaw preserved on both sides for a symmetric read.
      spots: [
        {
          x: NEWWORLD_PRIME_WEST_TEAL_ORIGIN.xMetres - (7.2 / 2 + 3.4 / 2),
          z: NEWWORLD_PRIME_WEST_TEAL_ORIGIN.zMetres,
          rotationY: 0,
        },
        {
          x: NEWWORLD_PRIME_EAST_YELLOW_ORIGIN.xMetres + (7.8 / 2 + 3.4 / 2),
          z: NEWWORLD_PRIME_EAST_YELLOW_ORIGIN.zMetres,
          rotationY: 0,
        },
      ],
      // Pure addition this wave: no garage blockout exists yet, so nothing
      // hides and any load failure leaves the arena unchanged. Authority
      // boxes for garages arrive with a later pass if gameplay needs them.
      coversBlockout: () => false,
    });
  }
  if (flags.crates) {
    plans.push({
      asset: 'crate-12',
      url: NEWWORLD_PRIME_CRATE_12_GLB,
      // South-entry choke pair (fact 6): flanks the exit-stub road
      // (4 m asphalt at x 0) at z -18, clear of the loop south cross (z -13).
      spots: [
        { x: -2.4, z: -18, rotationY: 0.2 },
        { x: 2.4, z: -18, rotationY: -0.15 },
      ],
      // Pure addition: crate clusters are new cover massing with no
      // blockout counterpart — load failure leaves the arena unchanged.
      coversBlockout: () => false,
    });
    plans.push({
      asset: 'crate-09',
      url: NEWWORLD_PRIME_CRATE_09_GLB,
      // Choke back-centre behind the crate-12 pair plus the loop-island
      // pair (fact 4): south-centre inside the loop, clear of the bus/semi
      // centre pair, the sandbag reservation (0, 8.5), and both lamps.
      spots: [
        { x: 0, z: -19.6, rotationY: 0.05 },
        { x: -3.5, z: -7, rotationY: 0.3 },
        { x: 3.5, z: -7, rotationY: -0.25 },
      ],
      coversBlockout: () => false,
    });
    plans.push({
      asset: 'crate-06',
      url: NEWWORLD_PRIME_CRATE_06_GLB,
      // Yard singles: northwest yard off the clothesline run (-15, -11)
      // and southeast yard off (15, 12) — clear of both sheds and lines.
      spots: [
        { x: -16.8, z: -8.8, rotationY: 0.4 },
        { x: 13.4, z: 9.6, rotationY: -0.35 },
      ],
      coversBlockout: () => false,
    });
    plans.push({
      asset: 'pallet',
      url: NEWWORLD_PRIME_PALLET_GLB,
      // Choke-flank pair staging pallets beside the south-entry barricade,
      // clear of the 4 m road and the loop south cross.
      spots: [
        { x: -5.2, z: -18.5, rotationY: 0.1 },
        { x: 5.2, z: -18.5, rotationY: -0.1 },
      ],
      coversBlockout: () => false,
    });
  }
  if (flags.walls) {
    plans.push({
      asset: 'wall-bay',
      url: NEWWORLD_PRIME_WALL_BAY_GLB,
      spots: wallBaySpots(),
      // Pure addition: the perimeter ring has no blockout counterpart —
      // load failure leaves the arena unchanged.
      coversBlockout: () => false,
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
