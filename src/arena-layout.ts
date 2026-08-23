// Nuke Town layout authority.
//
// Axis convention (Pass 78 fidelity rebuild): X runs ALONG the street, Z runs
// ACROSS it. The two houses sit on opposite kerbs facing each other over the
// central road, which is the single geometric fact that gives the reference
// map its character. Everything below is 180-degree rotationally symmetric
// about the origin so neither team owns a better half of the map.
//
// Before this pass the arena was 68 x 86 m with the two houses 58.8 m apart at
// opposite ends of an 88 m straight road that ran underneath both of them. The
// footprint is now 62 x 60 m with 16.0 m of open road between the two house
// fronts and one bus as the central hard cover.
export const ARENA_BOUNDS = Object.freeze({ minX: -31, maxX: 31, minZ: -30, maxZ: 30 });

/** Half width of the drivable asphalt. The kerbs sit immediately outside it. */
export const STREET_HALF_WIDTH = 5;
/** Z of each house's street-facing wall. Derived from the house depth (16.4 m). */
export const HOUSE_FRONT_Z = 9.2;
/** Centre of the single central transit bus, the map's hard cover anchor. */
export const CENTRAL_BUS = Object.freeze({
  x: 0,
  z: 0,
  size: Object.freeze([12.6, 3.8, 5.6] as const),
  /** Length of the authored bus body the collider wraps. */
  assetLength: 12.4,
});

/**
 * Two parked delivery vans, one in the road on each side of the bus. The Pass
 * 78 rebuild left 65 m standing eye-lines running corner to corner through the
 * yards and across the open road beyond each end of the bus; these break both
 * diagonal crossings while keeping every down-street half shorter than the
 * reference map's. 180-degree symmetric by construction.
 */
export const PARKED_VAN_LAYOUT = Object.freeze([
  Object.freeze({ id: 'east-parked-van', x: 16, z: 0 }),
  Object.freeze({ id: 'west-parked-van', x: -16, z: 0 }),
]);
/** [length along the street, height, width]. Height clears the 1.65 m eye-line. */
export const PARKED_VAN_SIZE = Object.freeze([4.6, 2.3, 1.9] as const);

/**
 * Front-garden hedge rows closing the street flanks. The reference map's
 * houses plus their garden hedges do most of its sightline blocking; without
 * these, shallow corner-to-corner rays thread the empty verges beside each
 * house (60 m+ measured). Segments stop short of the house facades at
 * |x| = 12/12.5 and the perimeter at |x| = 26. 180-degree symmetric.
 */
export const FRONT_HEDGE_LAYOUT = Object.freeze([
  // North-west long run: stops 1 m short of the aqua house's west corner.
  Object.freeze({ x: -15.5, z: -8.9, length: 21 }),
  // North-east short run: starts at the aqua house's east corner.
  Object.freeze({ x: 19, z: -8.9, length: 14 }),
  // South-west short run (180-degree twin of north-east).
  Object.freeze({ x: -19, z: 8.9, length: 14 }),
  // South-east long run (180-degree twin of north-west).
  Object.freeze({ x: 15.5, z: 8.9, length: 21 }),
]);
/** Hedge cross-section; height clears the 1.65 m standing eye-line. */
export const FRONT_HEDGE_SIZE = Object.freeze({ height: 2.05, depth: 1.4 } as const);

/**
 * Perpendicular hedge wings running from the front-garden hedge line into the
 * street canyon beside each house's outboard corner. With the central bus they
 * partition every horizontal canyon lane: south flank rays meet the north-east
 * fin, central rays meet the bus, north flank rays meet the south-west fin.
 */
export const FRONT_HEDGE_FIN_LAYOUT = Object.freeze([
  Object.freeze({ x: 11, z: -5.7 }),
  Object.freeze({ x: -11, z: 5.7 }),
]);
/** [width along the street, height, depth into the canyon]. */
export const FRONT_HEDGE_FIN_SIZE = Object.freeze([1.4, 2.05, 6.4] as const);

/**
 * Rear-boundary hedge runs splitting the back-yard strips behind each house.
 * Without them a standing ray runs 58 m along the back fence inside one
 * team's half. Sits against the perimeter fence, clear of every spawn point.
 */
export const REAR_HEDGE_LAYOUT = Object.freeze([
  Object.freeze({ x: -3, z: -29.1 }),
  Object.freeze({ x: 3, z: 29.1 }),
]);
/** [length along the street, height, depth]. */
export const REAR_HEDGE_SIZE = Object.freeze([46, 2.05, 1.6] as const);

/**
 * Side-verge cross-runs: short hedge walls spanning the whole verge between
 * the front-garden hedge rows and the perimeter fences. A barrier parallel to
 * the fence cannot block a ray running parallel to it, so these cross the
 * verge instead, splitting each 58 m north-south verge ray into segments of
 * about 18 m. Clear of every spawn, bench, bin and lamp.
 */
export const SIDE_HEDGE_LAYOUT = Object.freeze([
  Object.freeze({ x: -28.5, z: -17 }),
  Object.freeze({ x: -28.5, z: 17 }),
  Object.freeze({ x: 28.5, z: 17 }),
  Object.freeze({ x: 28.5, z: -17 }),
]);
/** [width across the verge, height, depth along the fence]. */
export const SIDE_HEDGE_SIZE = Object.freeze([5.6, 2.05, 1.6] as const);


// Street-life props nudged out of the hedge-fin footprints (was (10,-7.5)/(-10,7.5)).
export const NEIGHBOURHOOD_BENCH_LAYOUT: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [-17, -7.5, 0], [17, 7.5, Math.PI], [6.5, -7.5, 0], [-6.5, 7.5, Math.PI],
]);

export const HOUSE_LAYOUT = Object.freeze([
  // Aqua house on the north kerb, front wall at z = -8, facing the street.
  Object.freeze({ team: 0 as const, x: 4, z: -17.4, facing: 1 as const }),
  // Coral house on the south kerb, mirrored across the road.
  Object.freeze({ team: 1 as const, x: -4, z: 17.4, facing: -1 as const }),
]);

// Each garage is attached to the outboard end of its house with its door flush
// to the same building line, instead of sitting alone in a far corner.
export const GARAGE_LAYOUT = Object.freeze([
  Object.freeze({ x: 17.7, z: -12.5 }),
  Object.freeze({ x: -17.7, z: 12.5 }),
]);
export const GARAGE_SIZE = Object.freeze([7.2, 3.3, 6.6] as const);

// Waist-high yard fencing. Two side runs and two front-garden rails, paired by
// 180-degree rotation. Low enough to shoot over, solid enough to break a lane.
export const YARD_FENCE_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Object.freeze([
  [22, -18, 0.25, 14], [-22, 18, 0.25, 14],
  [-11, -20, 0.25, 12], [11, 20, 0.25, 12],
]);
export const YARD_FENCE_HEIGHT = 1.05;

export const COVER_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Object.freeze([
  [-12, -6.5, 3.6, 2], [12, 6.5, 3.6, 2], [-20, -2, 2.4, 3.6], [20, 2, 2.4, 3.6],
  [-8, -22, 3, 2.2], [8, 22, 3, 2.2], [24, -13, 2.8, 4.4], [-24, 13, 2.8, 4.4],
]);

// Team 1 is the exact 180-degree rotation of team 0. Every spawn sits in its
// own team's yard, behind or beside that team's house, never across the road.
export const SPAWN_LAYOUT = Object.freeze({
  0: Object.freeze([
    [-2, -27], [3, -27], [8, -27], [13, -27],
    [-12, -26], [-17, -24], [-21, -20], [-24, -16],
    [18, -25], [25, -25], [28, -13], [27, -10],
  ] as const),
  1: Object.freeze([
    [2, 27], [-3, 27], [-8, 27], [-13, 27],
    [12, 26], [17, 24], [21, 20], [24, 16],
    [-18, 25], [-25, 25], [-28, 13], [-27, 10],
  ] as const),
});

export const PATROL_LAYOUT: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-15, -12], [15, 12], [-6, -6], [6, 6],
  [-19, -7], [19, 7], [-24, -20], [24, 20],
]);

export const NEIGHBOURHOOD_BIN_POSITIONS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-20, -8.4], [20, 8.4], [13, -6.5], [-13, 6.5], [-29, -21], [29, 21],
]);

export const NEIGHBOURHOOD_BENCH_COLLIDER_SIZE = Object.freeze([2.5, 1.34, 0.72] as const);
export const NEIGHBOURHOOD_BIN_COLLIDER_SIZE = Object.freeze([0.78, 1.08, 0.72] as const);
