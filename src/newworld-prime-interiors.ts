/**
 * newworld-prime interiors pilot (owner-authorized 2026-09-14, rework expected).
 *
 * Basic walkable ground-floor outlines for BOTH street houses so the gameplay
 * layout can be validated. No furniture, no stairs, no upper floors, no
 * finishes: plain wall shells with plain-gap cased openings (no doors hung,
 * no trim geometry), plus a floor slab underfoot per house.
 *
 * Floor-plan truth: 18 concept plates at
 * `p-le/work/fresh-world-20260912/references/` (cutaway + eye-level plates rule
 * where the catalog is silent); LAYOUT_CONTRACT facts 2+8 for the shells.
 * - `teal-ground-cutaway.png`: west house ground floor reads living (front,
 *   street side) / kitchen+dining (rear band) / bath + utility (rear corner
 *   wet rooms) / stair along the east edge (stairs OMITTED this pilot).
 * - `yellow-ground-cutaway.png`: east house mirrors the rhythm (living front,
 *   kitchen rear, wet rooms off the rear band, garage side wing out of scope).
 * - `living-room-eye.png`: front door opens porch-to-living; living flows
 *   into the kitchen through an open cased arch (no door leaf).
 * - `bedroom-eye.png`: documents an UPPER bed (out of scope); the ground-floor
 *   bed below is program per the owner brief, positioned by assumption A1.
 *
 * Assumptions (plates are silent here — stated, not hidden):
 * A1. Where plates show no ground-floor bed, use a straight double-loaded
 *     rectangle: front living band + rear band split into kitchen / bed / bath.
 * A2. West teal rhythm mirrored (x-flipped) onto east yellow, rescaled to the
 *     7.8 x 6.4 footprint.
 * A3. Interior partitions run finished-floor (0.45 m = foundation top) to the
 *     ground-storey ceiling (2.7 m); thickness 0.14 m (structural module).
 * A4. Openings are plain 1.0 m gaps (front door keeps the 0.95 m leaf width);
 *     no casing/trim geometry this pilot.
 * A5. Physical ingress is a LATER pass: the full-footprint exterior authority
 *     boxes stay solid, so these rooms are layout-validation geometry whose
 *     reachability is proven on the room graph (see below), not by walking
 *     through the uncut siding. This module appends authority; it never
 *     carves shells.
 * A6. Garage side wings (both plates) are out of scope: house-proper only.
 *
 * Authority model: this module is pure data + world-space derivation. It emits
 * NOTHING itself — the arena assembler emits the meshes (counting against the
 * 1024 assembly lane) and `newworld-prime-authority` appends the wall
 * colliders/shot surfaces (both profiles, `interior-wall` material). Floor
 * slabs are presentation-only underfoot (support comes from the retained
 * full-footprint house solids beneath them).
 *
 * Deterministic: frozen data, no Math.random, no Date.
 */
import {
  NEWWORLD_PRIME_EAST_YELLOW_D_M,
  NEWWORLD_PRIME_EAST_YELLOW_W_M,
  NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M,
  NEWWORLD_PRIME_STOREY_HEIGHT_M,
  NEWWORLD_PRIME_WALL_THICKNESS_MM,
  NEWWORLD_PRIME_WEST_TEAL_D_M,
  NEWWORLD_PRIME_WEST_TEAL_W_M,
  type NewworldPrimeStructurePart,
} from './newworld-prime-structures';

// House ground-centre origins, restated (not imported) so this module never
// cycles back into newworld-prime-arena.ts. Values equal
// NEWWORLD_PRIME_WEST_TEAL_ORIGIN (-13.5, 1.5) and
// NEWWORLD_PRIME_EAST_YELLOW_ORIGIN (13.5, -1.5); both rotation 0.
const WEST_TEAL_ORIGIN = Object.freeze({ x: -13.5, z: 1.5 });
const EAST_YELLOW_ORIGIN = Object.freeze({ x: 13.5, z: -1.5 });

/** Finished ground-floor level = foundation stem-wall top. */
export const NEWWORLD_PRIME_INTERIOR_FLOOR_Y_M = NEWWORLD_PRIME_FOUNDATION_ABOVE_GRADE_M;
/** Partition head = ground-storey ceiling (no upper floor this pilot). */
export const NEWWORLD_PRIME_INTERIOR_WALL_HEAD_Y_M = NEWWORLD_PRIME_STOREY_HEIGHT_M;
/** Partition thickness matches the structural module. */
export const NEWWORLD_PRIME_INTERIOR_WALL_T_M = NEWWORLD_PRIME_WALL_THICKNESS_MM / 1000;
/** Plain-gap cased opening width (front door keeps the 0.95 m leaf). */
export const NEWWORLD_PRIME_INTERIOR_OPENING_W_M = 1.0;
/** Front-door leaf width, restated from the structural module (constraint floor). */
export const NEWWORLD_PRIME_INTERIOR_FRONT_DOOR_W_M = 0.95;

export type NewworldPrimeInteriorHouse = 'west-teal' | 'east-yellow';
export type NewworldPrimeInteriorRoomKind = 'living' | 'kitchen' | 'bed' | 'bath';

/** One ground-floor room: house-local plan rect (origin at house centre). */
export type NewworldPrimeInteriorRoom = Readonly<{
  id: string;
  house: NewworldPrimeInteriorHouse;
  kind: NewworldPrimeInteriorRoomKind;
  /** House-local rect [minX, minZ, maxX, maxZ], metres. */
  rect: readonly [number, number, number, number];
}>;

/** One doorway/opening: a plain gap connecting two nodes of the room graph. */
export type NewworldPrimeInteriorOpening = Readonly<{
  id: string;
  house: NewworldPrimeInteriorHouse;
  /** Clear width in metres (>= 0.95 by contract). */
  widthM: number;
  /** Graph edge: 'porch' is the outside node at the front door. */
  connects: readonly [string, string];
  /** House-local centre of the gap, metres. */
  localCentre: readonly [number, number];
}>;

/** One interior partition run (gap-free box; openings are splits between runs). */
type InteriorWallRun = Readonly<{
  id: string;
  /** House-local centre [x, z], metres. */
  centre: readonly [number, number];
  /** Full extents [sizeX, sizeZ], metres. */
  size: readonly [number, number];
}>;

type HousePlan = Readonly<{
  house: NewworldPrimeInteriorHouse;
  widthM: number;
  depthM: number;
  rooms: readonly NewworldPrimeInteriorRoom[];
  walls: readonly InteriorWallRun[];
  openings: readonly NewworldPrimeInteriorOpening[];
}>;

// West teal 7.2 x 6.0. Interior extent insets 0.14 (exterior wall thickness):
// x +/-3.46, z +/-2.86. Cross partition at z=-0.2 (faces -0.27/-0.13);
// rear dividers at x=-1.05 (kitchen|bed) and x=+1.20 (bed|bath).
const WEST_TEAL_PLAN: HousePlan = Object.freeze({
  house: 'west-teal',
  widthM: NEWWORLD_PRIME_WEST_TEAL_W_M,
  depthM: NEWWORLD_PRIME_WEST_TEAL_D_M,
  rooms: Object.freeze([
    { id: 'west-teal-living', house: 'west-teal', kind: 'living', rect: [-3.46, -0.13, 3.46, 2.86] },
    { id: 'west-teal-kitchen', house: 'west-teal', kind: 'kitchen', rect: [-3.46, -2.86, -1.12, -0.27] },
    { id: 'west-teal-bed', house: 'west-teal', kind: 'bed', rect: [-0.98, -2.86, 1.13, -0.27] },
    { id: 'west-teal-bath', house: 'west-teal', kind: 'bath', rect: [1.27, -2.86, 3.46, -0.27] },
  ] as const),
  walls: Object.freeze([
    { id: 'west-teal-cross-0', centre: [-3.03, -0.2], size: [0.86, 0.14] },
    { id: 'west-teal-cross-1', centre: [-1.05, -0.2], size: [1.1, 0.14] },
    { id: 'west-teal-cross-2', centre: [1.1, -0.2], size: [1.2, 0.14] },
    { id: 'west-teal-cross-3', centre: [3.08, -0.2], size: [0.76, 0.14] },
    { id: 'west-teal-divider-kitchen-bed', centre: [-1.05, -1.565], size: [0.14, 2.59] },
    { id: 'west-teal-divider-bed-bath', centre: [1.2, -1.565], size: [0.14, 2.59] },
  ] as const),
  openings: Object.freeze([
    { id: 'west-teal-front-door', house: 'west-teal', widthM: 0.95, connects: ['porch', 'west-teal-living'], localCentre: [0, 3.0] },
    { id: 'west-teal-opening-living-kitchen', house: 'west-teal', widthM: 1.0, connects: ['west-teal-living', 'west-teal-kitchen'], localCentre: [-2.1, -0.2] },
    { id: 'west-teal-opening-living-bed', house: 'west-teal', widthM: 1.0, connects: ['west-teal-living', 'west-teal-bed'], localCentre: [0, -0.2] },
    { id: 'west-teal-opening-living-bath', house: 'west-teal', widthM: 1.0, connects: ['west-teal-living', 'west-teal-bath'], localCentre: [2.2, -0.2] },
  ] as const),
});

// East yellow 7.8 x 6.4, mirrored rhythm (A2): bath west, bed middle, kitchen
// east. Interior extent x +/-3.76, z +/-3.06; cross partition at z=-0.2;
// rear dividers at x=-1.50 (bath|bed) and x=+1.50 (bed|kitchen).
const EAST_YELLOW_PLAN: HousePlan = Object.freeze({
  house: 'east-yellow',
  widthM: NEWWORLD_PRIME_EAST_YELLOW_W_M,
  depthM: NEWWORLD_PRIME_EAST_YELLOW_D_M,
  rooms: Object.freeze([
    { id: 'east-yellow-living', house: 'east-yellow', kind: 'living', rect: [-3.76, -0.13, 3.76, 3.06] },
    { id: 'east-yellow-bath', house: 'east-yellow', kind: 'bath', rect: [-3.76, -3.06, -1.57, -0.27] },
    { id: 'east-yellow-bed', house: 'east-yellow', kind: 'bed', rect: [-1.43, -3.06, 1.43, -0.27] },
    { id: 'east-yellow-kitchen', house: 'east-yellow', kind: 'kitchen', rect: [1.57, -3.06, 3.76, -0.27] },
  ] as const),
  walls: Object.freeze([
    { id: 'east-yellow-cross-0', centre: [-3.33, -0.2], size: [0.86, 0.14] },
    { id: 'east-yellow-cross-1', centre: [-1.2, -0.2], size: [1.4, 0.14] },
    { id: 'east-yellow-cross-2', centre: [1.2, -0.2], size: [1.4, 0.14] },
    { id: 'east-yellow-cross-3', centre: [3.33, -0.2], size: [0.86, 0.14] },
    { id: 'east-yellow-divider-bath-bed', centre: [-1.5, -1.665], size: [0.14, 2.79] },
    { id: 'east-yellow-divider-bed-kitchen', centre: [1.5, -1.665], size: [0.14, 2.79] },
  ] as const),
  openings: Object.freeze([
    { id: 'east-yellow-front-door', house: 'east-yellow', widthM: 0.95, connects: ['porch', 'east-yellow-living'], localCentre: [0, 3.2] },
    { id: 'east-yellow-opening-living-bath', house: 'east-yellow', widthM: 1.0, connects: ['east-yellow-living', 'east-yellow-bath'], localCentre: [-2.4, -0.2] },
    { id: 'east-yellow-opening-living-bed', house: 'east-yellow', widthM: 1.0, connects: ['east-yellow-living', 'east-yellow-bed'], localCentre: [0, -0.2] },
    { id: 'east-yellow-opening-living-kitchen', house: 'east-yellow', widthM: 1.0, connects: ['east-yellow-living', 'east-yellow-kitchen'], localCentre: [2.4, -0.2] },
  ] as const),
});

const PLANS: Readonly<Record<NewworldPrimeInteriorHouse, HousePlan>> = Object.freeze({
  'west-teal': WEST_TEAL_PLAN,
  'east-yellow': EAST_YELLOW_PLAN,
});

const ORIGINS: Readonly<Record<NewworldPrimeInteriorHouse, { x: number; z: number }>> = Object.freeze({
  'west-teal': WEST_TEAL_ORIGIN,
  'east-yellow': EAST_YELLOW_ORIGIN,
});

/** Both house plans (west first, then east). */
export function newworldPrimeInteriorPlans(): readonly HousePlan[] {
  return [PLANS['west-teal'], PLANS['east-yellow']];
}

/** Every ground-floor room, both houses (4 + 4). */
export function newworldPrimeInteriorRooms(): readonly NewworldPrimeInteriorRoom[] {
  return Object.freeze([...WEST_TEAL_PLAN.rooms, ...EAST_YELLOW_PLAN.rooms]);
}

/** Every doorway/opening, both houses (4 + 4, front doors included). */
export function newworldPrimeInteriorOpenings(): readonly NewworldPrimeInteriorOpening[] {
  return Object.freeze([...WEST_TEAL_PLAN.openings, ...EAST_YELLOW_PLAN.openings]);
}

/**
 * Room-graph reachability: BFS from the living room (the front door lands
 * porch-to-living, so living-reachable == front-door-reachable). Returns the
 * reachable room ids. The contract is every room of the house is in the set
 * (no sealed pockets); the focused test pins it.
 */
export function newworldPrimeInteriorRoomsReachableFromFrontDoor(
  house: NewworldPrimeInteriorHouse,
): readonly string[] {
  const plan = PLANS[house];
  const living = plan.rooms.find((room) => room.kind === 'living')!;
  const adjacency = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  };
  for (const opening of plan.openings) link(opening.connects[0]!, opening.connects[1]!);
  const seen = new Set<string>([living.id]);
  const queue: string[] = [living.id];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const next of adjacency.get(current) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  // 'porch' is the outside node, not a room: report rooms only.
  return Object.freeze(plan.rooms.map((room) => room.id).filter((id) => seen.has(id)));
}

/** World-space presentation parts for the arena assembler (floors + walls). */
export function newworldPrimeInteriorParts(): readonly NewworldPrimeStructurePart[] {
  const parts: NewworldPrimeStructurePart[] = [];
  const wallHeight = NEWWORLD_PRIME_INTERIOR_WALL_HEAD_Y_M - NEWWORLD_PRIME_INTERIOR_FLOOR_Y_M;
  const wallCy = (NEWWORLD_PRIME_INTERIOR_WALL_HEAD_Y_M + NEWWORLD_PRIME_INTERIOR_FLOOR_Y_M) / 2;
  for (const plan of newworldPrimeInteriorPlans()) {
    const origin = ORIGINS[plan.house];
    const prefix = plan.house === 'west-teal' ? 'west-teal-interior' : 'east-yellow-interior';
    parts.push({
      id: `${prefix}-floor-slab`,
      role: 'interior-floor-slab',
      offsetMetres: [origin.x, NEWWORLD_PRIME_INTERIOR_FLOOR_Y_M / 2, origin.z],
      sizeMetres: [
        plan.widthM - 0.3,
        NEWWORLD_PRIME_INTERIOR_FLOOR_Y_M,
        plan.depthM - 0.3,
      ],
      material: 'newworld-concrete',
    });
    for (const wall of plan.walls) {
      parts.push({
        id: wall.id,
        role: 'interior-partition',
        offsetMetres: [origin.x + wall.centre[0], wallCy, origin.z + wall.centre[1]],
        sizeMetres: [wall.size[0], wallHeight, wall.size[1]],
        material: 'newworld-trim-white',
      });
    }
  }
  return Object.freeze(parts);
}

/** Authority box for one interior partition (arena space, both profiles). */
export type NewworldPrimeInteriorWallSolid = Readonly<{
  id: string;
  house: NewworldPrimeInteriorHouse;
  x: number;
  z: number;
  sizeX: number;
  sizeZ: number;
  minY: number;
  maxY: number;
}>;

/** World-space wall solids for `newworld-prime-authority` to append. */
export function newworldPrimeInteriorWallSolids(): readonly NewworldPrimeInteriorWallSolid[] {
  const solids: NewworldPrimeInteriorWallSolid[] = [];
  for (const plan of newworldPrimeInteriorPlans()) {
    const origin = ORIGINS[plan.house];
    for (const wall of plan.walls) {
      solids.push(Object.freeze({
        id: `newworld-prime-interior-${wall.id}`,
        house: plan.house,
        x: origin.x + wall.centre[0],
        z: origin.z + wall.centre[1],
        sizeX: wall.size[0],
        sizeZ: wall.size[1],
        minY: NEWWORLD_PRIME_INTERIOR_FLOOR_Y_M,
        maxY: NEWWORLD_PRIME_INTERIOR_WALL_HEAD_Y_M,
      }));
    }
  }
  return Object.freeze(solids);
}
