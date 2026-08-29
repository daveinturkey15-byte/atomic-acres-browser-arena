// Nuke Town layout authority.
//
// Axis convention: X runs ALONG the street, Z runs ACROSS it. The two houses
// sit on opposite kerbs facing each other over the central road. Everything is
// 180-degree rotationally symmetric about the origin so neither team owns a
// better half of the map.
//
// FULL-STEP REDESIGN, 2026-08-29 (docs/NUKETOWN_REDESIGN_2026-08-29.md).
// The owner asked on 2026-08-24 for "the full step ... the same layout as
// Black Ops 2 Nuketown", and artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md
// diagnosed why every prior pass failed to deliver it: divergence D1 - the
// FLOW was rotated 90 degrees from the reference. Teams spawned in full-width
// strips on the two SIDES of the street, so combat crossed the road; in the
// reference, teams spawn in fenced garden yards at the two ENDS and fight
// DOWN the street through three parallel lanes (the vehicle-choked road and
// one house each side). Houses, garages, bus and mid-street vehicles already
// matched (D6/D2); the spawn topology never did.
//
// What this redesign changes, and only this:
//   - Spawns move to two END gardens behind spawn fences at x = -/+27.5,
//     each fence with two door gaps and a central low trail mouth (D1, D5).
//   - The street lengthens: bounds 62x63 -> 68x57. Growth is along X where
//     the reference's length lives; the across-street depth gives back what
//     the sideways design had borrowed (D8). Perimeter lap 28.7 s sprint,
//     inside the fidelity gate's own 25-30 s reference band.
//   - The hedge maze goes (D3): the canyon planter fins, corner hedge blocks
//     and side-verge cross-runs existed to break ACROSS-street sightlines
//     that no longer exist. The reference's own furniture - bus, mid-street
//     vans, front-garden hedges, the houses - carries the lane-breaking duty
//     for the new ALONG-street flow, and the reference authentically HAS
//     long lanes; the sightline suite re-derives its ceilings from this
//     geometry with that rationale recorded in the tests.
// What deliberately does NOT move: houses, garages, bus, mid-street vans,
// authored large-cover anchors, benches, front-garden hedge system (outer
// ends follow the new bounds), yard fences, overdrive core, railgun rooms.
export const ARENA_BOUNDS = Object.freeze({ minX: -34, maxX: 34, minZ: -28.5, maxZ: 28.5 });
/** Half width of the drivable asphalt. The kerbs sit immediately outside it.
 * HF-383 completion: widened from 5 to 6.5 m so the mid-street vehicles plus
 * walkable flank channels fit beside the bus, matching the reference map's
 * road-to-bus proportion. */
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
 * Two delivery vans staged IN THE MIDDLE OF THE STREET as a staggered pair,
 * one flush against each end of the central bus and offset toward opposite
 * kerbs diagonally - the reference map's bus-plus-two-vehicles midfield.
 * Each van is flush to the bus end on its inner face (no seam to enter) and
 * leaves a >= 1.4 m walk-through lane on its outer face, so it plays as hard
 * cover on the crossing routes without walling the road. Height clears the
 * crouched eye-line. 180-degree symmetric by pairing.
 */
export const PARKED_VAN_LAYOUT = Object.freeze([
  Object.freeze({ id: 'east-parked-van', x: 8.6, z: -1.5 }),
  Object.freeze({ id: 'west-parked-van', x: -8.6, z: 1.5 }),
]);
/** [length along the street, height, width]. Height clears the 1.65 m eye-line. */
export const PARKED_VAN_SIZE = Object.freeze([4.6, 2.3, 1.9] as const);

/**
 * REDESIGN: kerb-parked driveway cars, one per house, on the verge between the
 * front hedge and the kerb - the reference's own break for the long sidewalk
 * lanes (its yards park a car on each drive). Lower than the vans: crouch
 * cover, but they kill the standing verge eye-line at |x| = 22. 180-degree
 * symmetric by pairing.
 */
export const KERB_CAR_LAYOUT = Object.freeze([
  // x = 15: mid-verge between the house frontage (x <= 14) and the bench at
  // x = 19. The first seat (x = 22) parked the car through the destructible
  // shed's plot at (22, -5) - the registry gate caught the overlap.
  Object.freeze({ id: 'north-kerb-car', x: 15, z: -7.3 }),
  Object.freeze({ id: 'south-kerb-car', x: -15, z: 7.3 }),
]);
export const KERB_CAR_SIZE = Object.freeze([4.4, 1.75, 1.8] as const);

/**
 * Front-garden hedge rows closing the street flanks. The reference map's
 * houses plus their garden hedges do most of its verge sightline blocking.
 * Inner ends keep their exact facade seams (|x| = 5 and 12); outer ends
 * follow the redesigned bounds out to |x| = 29, one metre short of the end
 * gardens' fences so the verge door lanes stay walkable. 180-degree symmetric.
 */
export const FRONT_HEDGE_LAYOUT = Object.freeze([
  // North-west long run: stops 1 m short of the aqua house's west corner.
  Object.freeze({ x: -17, z: -8.9, length: 24 }),
  // North-east short run: starts at the aqua house's east corner.
  Object.freeze({ x: 20.5, z: -8.9, length: 17 }),
  // South-west short run (180-degree twin of north-east).
  Object.freeze({ x: -20.5, z: 8.9, length: 17 }),
  // South-east long run (180-degree twin of north-west).
  Object.freeze({ x: 17, z: 8.9, length: 24 }),
]);
/** Hedge cross-section; height clears the 1.65 m standing eye-line. */
export const FRONT_HEDGE_SIZE = Object.freeze({ height: 2.05, depth: 1.4 } as const);

/**
 * Spawn-end fences: the redesign's replacement for the rear hedges, rotated
 * onto the street ends where the reference keeps its spawn yards. Each fence
 * is four solid runs leaving three openings a defender must actually watch:
 * two door gaps (2.4 m at z = -/+10.5) and a central low trail mouth (1.8 m
 * at z = 0) - the reference's under-fence side trail, ours by function.
 * Segments are expressed per fence; the east fence is the exact 180-degree
 * rotation of the west. Height clears the standing eye-line so spawn yards
 * are not long-range shooting galleries.
 */
export const SPAWN_END_FENCE_X = 27.5;
/**
 * DECLUTTER 2026-08-29: each end garden is sectioned like the reference's
 * back yards - two short divider fences per garden run inward from the
 * boundary, leaving a 1.5 m gate at the inner end. They kill the 55 m
 * intra-yard eye-line the deleted reclamation tank used to break, and they
 * are the reference's own furniture rather than campus hardware.
 * [x of the run centre, z, length along X]; height matches the spawn fence.
 */
export const SPAWN_GARDEN_DIVIDER_LAYOUT: ReadonlyArray<readonly [x: number, z: number, length: number]> = Object.freeze([
  // z +/-13.5 sits clear of the fence door gaps (centred +/-10.5) and the
  // spawn rows; length 4 leaves a 2.0 m inner gate (1.24 m at capsule
  // margins). The first seat at z +/-10.2 with a 1.5 m gate flood-measured
  // as SEALED outer sections: gate 0.74 m at margins, and the divider's own
  // margin band overlap-killed the fence door slice.
  [-32, -13.5, 4], [-32, 13.5, 4],
  [32, 13.5, 4], [32, -13.5, 4],
]);
export const SPAWN_GARDEN_DIVIDER_SIZE = Object.freeze({ depth: 0.25, height: 2.2 } as const);

export const SPAWN_END_FENCE_SIZE = Object.freeze({ depth: 1.0, height: 2.2 } as const);
export const SPAWN_END_FENCE_SEGMENTS: ReadonlyArray<readonly [zCentre: number, zLength: number]> = Object.freeze([
  [-17.85, 12.3],  // z -24.0 .. -11.7
  [-5.1, 8.4],     // z  -9.3 ..  -0.9
  [5.1, 8.4],      // z   0.9 ..   9.3
  [17.85, 12.3],   // z  11.7 ..  24.0
]);

/** Street-life props: benches on the verges, paired by rotation. */
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

// Waist-high yard fencing, paired by 180-degree rotation. Low enough to shoot
// over, solid enough to break a lane. REDESIGN 2026-08-29: the (+/-22) side
// runs are deleted - they divided front from rear for the old ACROSS-street
// flow and, after the cultivation cluster re-seated 4.5 m east, one bisected
// the greenhouse interior. The per-house (-/+11) rear dividers, the rear yard
// closures and the spawn-end fences carry the yard structure now.
export const YARD_FENCE_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Object.freeze([
  [-11, -20, 0.25, 12], [11, 20, 0.25, 12],
]);
export const YARD_FENCE_HEIGHT = 1.05;

/**
 * REDESIGN D3-completion: rear-yard closures. The reference fences each back
 * yard per house; without these, a standing lane runs the full 60 m rear strip
 * end to end (measured 57-60 m the moment the old rear hedges left). One
 * closure at each house's inner rear corner and one past each garage, spanning
 * house rear wall to the boundary. Full standing height; 180-degree symmetric.
 */
export const REAR_YARD_CLOSURE_LAYOUT: ReadonlyArray<readonly [x: number, z: number]> = Object.freeze([
  [-6.5, -27], [21.6, -27],
  [6.5, 27], [-21.6, 27],
]);
export const REAR_YARD_CLOSURE_SIZE = Object.freeze([1.0, 2.05, 3.4] as const);

export const COVER_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Object.freeze([
  [-20, -2, 2.4, 3.6], [20, 2, 2.4, 3.6],
  [-8, -22, 3, 2.2], [8, 22, 3, 2.2], [24, -13, 2.8, 4.4], [-24, 13, 2.8, 4.4],
]);

/**
 * REDESIGN: spawn-garden clutter, two blocks per end yard, breaking the 55 m
 * boundary lane inside each garden the way the reference's yard props do.
 * A SEPARATE layout because these must be STANDING-EYE TALL: ordinary cover
 * is 1.6 m and the 1.65 m eye simply sees over it - measured, the boundary
 * lane read 55 m straight through two 1.6 m blocks before this class existed.
 * 180-degree symmetric by pairing.
 */
export const GARDEN_COVER_LAYOUT: ReadonlyArray<readonly [x: number, z: number, width: number, depth: number]> = Object.freeze([
  [-32.5, -6.5, 2.2, 1.6], [32.5, 6.5, 2.2, 1.6],
  [-32.5, 16, 2.2, 1.6], [32.5, -16, 2.2, 1.6],
]);
export const GARDEN_COVER_HEIGHT = 2.05;

/**
 * REDESIGN D1: spawns live in the two END gardens, behind the spawn fences,
 * looking down the street - the reference's defining flow. Team 0 owns the
 * WEST garden (x <= -28.2), team 1 the exact 180-degree rotation in the east.
 * Back row against the boundary, mid row behind the fence line, one forward
 * corner spawn per team. Every point verified against the built colliders by
 * the spawn-safety suite; the frozen world-identity spawn pin is re-pinned
 * once for this redesign with docs/NUKETOWN_REDESIGN_2026-08-29.md as the
 * recorded reason.
 */
export const SPAWN_LAYOUT = Object.freeze({
  0: Object.freeze([
    [-32.5, -20], [-32.5, -12], [-32.5, -4], [-32.5, 4], [-32.5, 12], [-32.5, 20],
    [-30, -16], [-30.5, -5], [-30, 0], [-30, 8], [-30, 16],
    [-31, -23],
  ] as const),
  1: Object.freeze([
    [32.5, 20], [32.5, 12], [32.5, 4], [32.5, -4], [32.5, -12], [32.5, -20],
    [30, 16], [30.5, 5], [30, 0], [30, -8], [30, -16],
    [31, 23],
  ] as const),
});

/** Bot patrol anchors along the redesigned street-axis flow: the two street
 * mouths, the verge lanes beside each house, and the mid-street crossings.
 * 180-degree symmetric by pairing. */
export const PATROL_LAYOUT: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-22, 0], [22, 0], [-9, 5.2], [9, -5.2],
  [0, 7.5], [0, -7.5], [-16, -7.5], [16, 7.5],
]);

export const NEIGHBOURHOOD_BIN_POSITIONS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-20, -8.4], [20, 8.4], [11, -6.5], [-11, 6.5], [-24, -19], [24, 19],
]);

export const NEIGHBOURHOOD_BENCH_COLLIDER_SIZE = Object.freeze([2.5, 1.34, 0.72] as const);
export const NEIGHBOURHOOD_BIN_COLLIDER_SIZE = Object.freeze([0.78, 1.08, 0.72] as const);
