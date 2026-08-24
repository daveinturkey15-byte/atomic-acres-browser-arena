// Nuke Town layout authority.
//
// Axis convention (Pass 78 fidelity rebuild): X runs ALONG the street, Z runs
// ACROSS it. The two houses sit on opposite kerbs facing each other over the
// central road, which is the single geometric fact that gives the reference
// map its character. Everything below is 180-degree rotationally symmetric
// about the origin so neither team owns a better half of the map.
//
// Pass 79 / HF-383 ("remove all the bulky items that are in the way of stuff",
// completed): the footprint stays at the gated 62 x 60 m - the fidelity guards
// pin the reference map's smallness (sub-10 s diagonal sprint, sub-4000 m^2
// area). The owner's "clustered" read traced to a harder defect: the mid-street
// vehicle/hedge arrangement left flank gaps narrower than a player capsule, so
// the real character controller could not cross the street at all - measured
// ground connectivity split the map into two diagonal halves. The completion
// pass widens the carriageway to 13 m (verge, not footprint), seats each van
// flush against its kerb so the bus-flank channel stays walkable (~1.8 m
// clear), and stands the planter wings deeper against the hedge line so none
// of them completes a seal against the bus or a van.
export const ARENA_BOUNDS = Object.freeze({ minX: -31, maxX: 31, minZ: -30, maxZ: 30 });

/** Half width of the drivable asphalt. The kerbs sit immediately outside it.
 * HF-383 completion: widened from 5 to 6.5 m so a kerb-side vehicle plus two
 * walkable flank channels fit beside the bus, matching the reference map's
 * road-to-bus proportion. Consumes verge, not footprint: ARENA_BOUNDS, the
 * sub-10 s diagonal gate and the sub-4000 m^2 area gate are untouched. */
export const STREET_HALF_WIDTH = 6.5;
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
 * Two parked delivery vans staged midfield as a staggered kerb-side pair, one
 * hugging each kerb diagonally opposite the other beside the bus ends - the
 * reference map's one-bus-two-vehicles midfield. HF-383 completion seats each
 * van FLUSH against its kerb so the channel between the van's street face and
 * the bus flank stays a genuine walkable lane (~1.8 m clear): measured with
 * the real character controller, the previous seating left gaps narrower than
 * a player capsule on both flanks, which walled the street into two halves
 * that ground movement could not cross at all. 180-degree symmetric.
 */
export const PARKED_VAN_LAYOUT = Object.freeze([
  Object.freeze({ id: 'east-parked-van', x: 7.2, z: -5.55 }),
  Object.freeze({ id: 'west-parked-van', x: -7.2, z: 5.55 }),
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
 * Perpendicular planter pillars flanking the street canyon, two per side.
 *
 * HF-383 completion design, measured rather than assumed: each pillar spans
 * from the front-garden hedge line right up to the bus face plane (3.7 m),
 * so every shallow corner-to-corner standing eye-line that threads the
 * widened street meets one. Because each pillar is an ISLAND (clear 1.8 m
 * verge-side gap to the hedge line, and x-gaps to the vans and the bus),
 * ground movement flows around it and nothing seals: the previous Pass 78/79
 * stagings either chained pillar-van-bus into a continuous wall (splitting
 * the map's ground movement into two disconnected halves - measured with the
 * real character controller) or stopped short of the bus and reopened
 * 58-60 m killing lanes.
 */
export const FRONT_HEDGE_FIN_LAYOUT = Object.freeze([
  Object.freeze({ x: 4, z: -5.5 }),
  Object.freeze({ x: 13, z: -5.5 }),
  Object.freeze({ x: -4, z: 5.5 }),
  Object.freeze({ x: -13, z: 5.5 }),
]);
/** [width along the street, height, depth across the canyon]. Each pillar
 * spans the FULL flank from hedge line to bus face plane so both the street
 * channel and the kerb-side verge lane die against it. */
export const FRONT_HEDGE_FIN_SIZE = Object.freeze([1.4, 2.05, 5.4] as const);

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
 * Back-corner hedge blocks seating each rear corner of the map: one face on
 * the perimeter fence, reaching into the yard far enough to break the
 * back-fence corridor ray that otherwise runs the full 57 m map width behind
 * each house. Positioned clear of every spawn (nearest authored spawn keeps
 * 1.0 m to a block face), bin, bench and patrol point, and short enough of
 * the yard that no pocket is sealed off from its own half: each block stands
 * alone, so both back-yard strips stay enterable around it.
 *
 * HF-383 audit: removal was tested and rejected - without them the back-fence
 * corridor lanes at |z| = 25..27 reopen at 60 m and the authored spawns sit
 * exactly where a forward-shifted boundary hedge would have to stand to
 * replace them. They are against the back fences, out of the play corridors
 * the owner flagged, so they stay.
 */
export const CORNER_HEDGE_LAYOUT = Object.freeze([
  Object.freeze({ x: -21.5, z: -25.7 }),
  Object.freeze({ x: 21.5, z: -25.7 }),
  Object.freeze({ x: 21.5, z: 25.7 }),
  Object.freeze({ x: -21.5, z: 25.7 }),
]);
/** [width along the street, height, depth out of the fence]. */
export const CORNER_HEDGE_SIZE = Object.freeze([5, 2.05, 5.2] as const);

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


// Street-life props: the (±17,∓7.5) bench pair fouled the crossing planter
// walls at x=±16 (HF-383) and moves to x=±19; the rest keep their spots.
export const NEIGHBOURHOOD_BENCH_LAYOUT: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [19, -7.5, 0], [-19, 7.5, Math.PI], [6.5, -7.5, 0], [-6.5, 7.5, Math.PI],
]);

export const HOUSE_LAYOUT = Object.freeze([
  // Aqua house on the north kerb, front wall at z = -9.2, facing the street.
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
  // HF-383: the former (±12,∓6.5) garden-mouth cover pairs are superseded by
  // the planter pillars at x=±4/x=±13, which own the mouth-cover duty and
  // could not be given a foul-free neighbouring slot inside the gated
  // footprint. Rotational pairing preserved (both removed).
  [-20, -2, 2.4, 3.6], [20, 2, 2.4, 3.6],
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
  // (±11,∓6.5) HF-383: moved out of the x=±13 pillar footprint.
  [-20, -8.4], [20, 8.4], [11, -6.5], [-11, 6.5], [-29, -21], [29, 21],
]);

export const NEIGHBOURHOOD_BENCH_COLLIDER_SIZE = Object.freeze([2.5, 1.34, 0.72] as const);
export const NEIGHBOURHOOD_BIN_COLLIDER_SIZE = Object.freeze([0.78, 1.08, 0.72] as const);
