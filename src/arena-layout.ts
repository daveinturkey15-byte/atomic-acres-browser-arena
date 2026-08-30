// Nuke Town layout authority.
//
// Axis convention: X runs ALONG the street, Z runs ACROSS it. The two houses
// sit on opposite kerbs facing each other over the central road. Everything is
// 180-degree rotationally symmetric about the origin so neither team owns a
// better half of the map.
//
// FULL-STEP REDESIGN 2026-08-29 (docs/NUKETOWN_REDESIGN_2026-08-29.md) fixed
// D1: the flow rotated end-to-end with spawns in the two end gardens.
//
// LAYOUT v3, same day, after owner HITL: the redesign kept the houses at the
// map CENTRE (x +/-4), so players spawned in a bare fenced yard and sprinted
// 25 m past nothing - "you didn't adjust its layout or make it more similar
// to the black ops 2 nuketown". The reference's actual anatomy:
//   - each team's HOUSE stands directly in front of its spawn yard (the
//     house, not a fence, is your spawn shield);
//   - the garages flank the contested MID-street near the bus;
//   - the yards are OPEN - per the owner's explicit call this pass removes
//     every hedge, yard fence, spawn fence, divider and mannequin;
//   - the block is bigger: bounds 68x57 -> 74x60.
// Sightline ceilings re-derive from this open geometry by measurement - the
// reference authentically HAS full-length lanes; the houses, garages, bus,
// vans, kerb cars and cover carry the lane-breaking duty alone.
export const ARENA_BOUNDS = Object.freeze({ minX: -37, maxX: 37, minZ: -30, maxZ: 30 });
/** Half width of the drivable asphalt. The kerbs sit immediately outside it.
 * HF-383 completion: widened from 5 to 6.5 m so the mid-street vehicles plus
 * walkable flank channels fit beside the bus, matching the reference map's
 * road-to-bus proportion. */
export const STREET_HALF_WIDTH = 6.5;
/** X where the asphalt ends; beyond it the end aprons are lawn to the boundary. */
export const STREET_END_X = 35;
/** Z of each house's street-facing wall. Derived from the house depth (16.4 m). */
export const HOUSE_FRONT_Z = 9.2;
/** Centre of the single central transit bus, the map's hard cover anchor. */
export const CENTRAL_BUS = Object.freeze({
  x: 0,
  z: 0,
  // v5 (owner 2026-08-30): roof drops 3.8 -> 2.25 so the crate stairway can
  // reach it with three of the proven 0.75 m jump rises. Interior headroom
  // stays 2.13 (street floor to roof slab underside).
  size: Object.freeze([12.6, 2.25, 5.6] as const),
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
  // v3: mid-verge of the longer street, between the vans and each house's
  // front corner.
  Object.freeze({ id: 'north-kerb-car', x: 17, z: -7.3 }),
  Object.freeze({ id: 'south-kerb-car', x: -17, z: 7.3 }),
]);
export const KERB_CAR_SIZE = Object.freeze([4.4, 1.75, 1.8] as const);

// v3: the front-garden hedge system is DELETED - owner HITL 2026-08-29:
// "remove all hedges and fences for now, they are bad".

// v3: the spawn-end fences and garden dividers are DELETED with the rest of
// the fence system (owner HITL). The spawn shield duty moves to the houses
// themselves, which now stand in front of the spawn yards like the
// reference. (The dividers had also shipped INVISIBLE in the Quality
// profile - colliders with procedural-only visuals hidden behind the GLB -
// which is exactly what the owner walked into; the quality-composition
// parity gate added this pass exists so that class cannot ship again.)

/** Street-life props: benches on the verges, paired by rotation. */
export const NEIGHBOURHOOD_BENCH_LAYOUT: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [12, -7.5, 0], [-12, 7.5, Math.PI], [4.5, -7.5, 0], [-4.5, 7.5, Math.PI],
]);

export const HOUSE_LAYOUT = Object.freeze([
  // v3: each team's house stands at ITS OWN end, directly in front of its
  // spawn yard - the reference's defining anatomy (your building is your
  // spawn shield, the fight runs house-to-house through the mid-street).
  // Aqua house west/north kerb, front wall at z = -9.2, facing the street.
  Object.freeze({ team: 0 as const, x: -19, z: -17.4, facing: 1 as const }),
  // Coral house east/south kerb, the exact 180-degree rotation.
  Object.freeze({ team: 1 as const, x: 19, z: 17.4, facing: -1 as const }),
]);

// v3: each garage attaches to the INBOARD end of its house, so the two
// garages flank the contested mid-street the way the reference's carports
// face its central drives.
export const GARAGE_LAYOUT = Object.freeze([
  Object.freeze({ x: -5.1, z: -12.5 }),
  Object.freeze({ x: 5.1, z: 12.5 }),
]);
export const GARAGE_SIZE = Object.freeze([7.2, 3.3, 6.6] as const);

// v3: yard fences, rear-yard closures and the tall garden-cover class are
// all DELETED (owner HITL: "remove all hedges and fences for now").

export const COVER_LAYOUT: ReadonlyArray<readonly [number, number, number, number]> = Object.freeze([
  // v3 re-seat for the house-per-end anatomy: two street crates between the
  // vans and the garages, two rear-verge stacks, two flank stacks breaking
  // the long verge lanes at the house front corners.
  // v5 (owner 2026-08-30): the street pair becomes a two-step STAIRWAY onto
  // the bus roof - a 0.75 m low crate and a 1.5 m tall crate flanking each
  // bus end (ground -> low -> tall -> 2.25 roof, every rise the proven jump).
  // Tall pair sits at |z| 1.6 (not 1.3): at 1.3 its corner clipped the
  // parked vans' standable cover cells by 0.11 m (HF-383 traversal gate).
  [-10.1, -1.3, 1.7, 2.2], [10.1, 1.3, 1.7, 2.2],
  [-8.1, -1.6, 1.7, 2.2], [8.1, 1.6, 1.7, 2.2],
  [-9, -26, 3, 2.2], [9, 26, 3, 2.2], [27, -13, 2.8, 4.4], [-27, 13, 2.8, 4.4],
]);

/** Owner 2026-08-29/30: the street crates are JUMP-MOUNTABLE platforms
 * (jump apex measures 0.82 m at 6.35 m/s vs 24.5 gravity). v5 makes them a
 * stairway: the outer pair is one rise, the inner pair two rises, the bus
 * roof the third. */
export const STREET_CRATE_HEIGHT = 0.75;
export const STREET_CRATE_TALL_HEIGHT = 1.5;
/** |x| of the outer (low) and inner (tall) stair crates in COVER_LAYOUT. */
export const STREET_CRATE_LOW_X = 10.1;
export const STREET_CRATE_TALL_X = 8.1;

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
  // Back row 1.5 m off the boundary fence face (the HF-343 muzzle fan probes
  // a +/-1 rad arc; a 1.0 m gap failed it at every back spawn).
  0: Object.freeze([
    [-35.5, -20], [-35.5, -12], [-35.5, -4], [-35.5, 4], [-35.5, 12], [-35.5, 20],
    [-33.5, -16], [-33.5, -8], [-33.5, 0], [-33.5, 8], [-33.5, 16],
    [-34.5, 23],
  ] as const),
  1: Object.freeze([
    [35.5, 20], [35.5, 12], [35.5, 4], [35.5, -4], [35.5, -12], [35.5, -20],
    [33.5, 16], [33.5, 8], [33.5, 0], [33.5, -8], [33.5, -16],
    [34.5, -23],
  ] as const),
});

/** Bot patrol anchors along the redesigned street-axis flow: the two street
 * mouths, the verge lanes beside each house, and the mid-street crossings.
 * 180-degree symmetric by pairing. */
export const PATROL_LAYOUT: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-26, 0], [26, 0], [-5, 5.2], [5, -5.2],
  [0, 7.5], [0, -7.5], [-20, -7.5], [20, 7.5],
]);

export const NEIGHBOURHOOD_BIN_POSITIONS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  // v3.1: the +/-23 pair sat in the moved houses' door/window route volumes
  // (route-clearance audit); re-seated to the garage-corner verge.
  [-12.5, -8.4], [12.5, 8.4], [1.2, -6.5], [-1.2, 6.5], [-30.5, -26], [30.5, 26],
]);

export const NEIGHBOURHOOD_BENCH_COLLIDER_SIZE = Object.freeze([2.5, 1.34, 0.72] as const);
export const NEIGHBOURHOOD_BIN_COLLIDER_SIZE = Object.freeze([0.78, 1.08, 0.72] as const);
