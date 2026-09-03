/**
 * NUKETOWN2: Nuke Town Rebuild (PREVIEW) — HF-407, owner 2026-09-02 ~16:10 BST,
 * RE-PROPORTIONED under HF-426, owner 2026-09-03 07:00 BST.
 *
 * "I don't think it's very true in layout or style to the original nuketown map
 *  from black ops 2 ... the layout needs a total rejig and the bus can probably
 *  be made with code instead of blender ... just mirror what it has and the way
 *  the closed/open vehicles work as cover."           (HF-407)
 *
 * "the nuketown rebuild is not right, its based on an old layout we had here,
 *  not the actual layout of black ops 2 nuketown"      (HF-426)
 *
 * WHAT THIS FILE IS. A complete, code-authored replacement layout for the Nuke
 * Town flow, built beside the shipped arena rather than on top of it. The
 * shipped `atomic-acres` is the only `authoring: 'import'` arena in the game —
 * a 7.3 MB Blender bake plus 1,110 lines of hand-written collision in
 * `src/map.ts`. Nothing here imports a mesh, an image, a font or a LUT. Every
 * wall, vehicle, fence and kerb below is a TypeScript box with a collider.
 *
 * THE PROPORTIONS ARE MEASURED OFF THE REFERENCE'S OWN OVERHEADS.
 * `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` is the authority, and it is
 * measured — in pixels, with the segmentation script quoted — off the two
 * first-party Treyarch minimaps of Nuketown 2025. It replaces
 * `docs/NUKETOWN_REBUILD_2026-09-02.md`, which took ONE published area scalar
 * and then reused this repository's own 2026-08-29 redesign for the flow. That
 * is the thing the owner rejected, and it produced one specific, structural
 * error:
 *
 *   THE ASPECT WAS INVERTED. The reference is 2.36 : 1, long axis ACROSS the
 *   street (yard → house → road → house → yard). The old cut was 0.90 : 1 with
 *   the long axis ALONG the street: a 58 m corridor the two teams ran down.
 *   This arena is 36 m of street by 84 m across it. The playable AREA is held
 *   at the old cut's 3,016 m² (now 3,024, +0.3 %), so this is a
 *   re-proportioning, not a resize.
 *
 * THE FOUR THINGS THE PREVIOUS CUTS GOT WRONG, and what changed here:
 *
 *   1. ASPECT AND THE CUL-DE-SAC. Above. The reference's road is a STUB: it
 *      enters the playable polygon through a single tongue in the middle of one
 *      long side and opens into a turning head between the two houses. It is
 *      not a through-street with a cul-de-sac at each end, and there is no 25 m
 *      empty verge at either end because there are no ends.
 *   2. SPAWNS. Both cuts already put spawns in the back yards behind each
 *      house, which is right; they are simply much deeper now, because the
 *      yards are the map's long axis rather than a 7.5 m strip.
 *   3. SYMMETRY. Back-yard spawns on opposite sides of one road can only be
 *      made equal by 180-degree ROTATION, never by mirroring. Every solid in
 *      this file is emitted through `pair()` EXCEPT the two street vehicles,
 *      which the reference itself does not pair — see `truck()` and `bus()`,
 *      and the enumerated exception in `nuketown2-fidelity.test.ts`.
 *   4. VEHICLES, AND WHICH IS OPEN. The previous cut had the school bus as the
 *      enterable body and the truck as a cul-de-sac prop, twice. On the
 *      reference's own minimap the two street bodies are drawn with opposite
 *      fills: the coach is HATCHED (solid) end to end, and the moving truck's
 *      cargo box is drawn hollow with a solid cab. Activision's own map guide
 *      says the same thing in words — the moving truck is an island of cover in
 *      the cul-de-sac with room INSIDE it. So here the TRUCK is the open body
 *      and the coach is closed. That swap is why the 2x-damage core now rides
 *      the truck's cargo-box roof.
 *
 * WHY THE TRUCK IS CENTRED ON THE WORLD ORIGIN. `OVERDRIVE_POSITION` in
 * `src/overdrive.ts` is a single global `{0, 3.75, 0}`, not a per-arena value.
 * Authoring the cargo-box roof at 3.15 m puts the 2x-damage core 0.60 m above
 * it, inside the 1.9 m pickup window, and the owner's "keep the 2x damage" is
 * carried with zero new runtime code and zero risk to the shipped arena. That
 * one decision then FIXES the box's deck height and forces a climb onto its
 * roof; both are derived at `NUKETOWN2_CENTRAL_TRUCK` and `TRUCK_ROOF_STEPS`
 * below. It is also the one place the reference is knowingly not followed: the
 * reference's truck sits about 0.076 of the street length SOUTH of the road
 * centre-line, and this one sits on it.
 *
 * NOTHING IS YAWED. `box()` records a solid as extents-plus-yaw while the
 * collider/visual parity audit compares a collider rectangle against each mesh's
 * world AABB; those agree exactly at zero yaw and diverge badly otherwise (see
 * the header of `src/map3-arena.ts`, where a yawed wall measured 0.11 coverage
 * against its own mesh). A suburban street is an axis-aligned place anyway.
 */
import * as THREE from 'three';
import {
  type Builder,
  batchPresentationOnlyBoxes,
  box,
  spawnRecord,
  standard,
} from './additional-maps';
import type { ArenaMap } from './map';
import {
  NUKETOWN2_FOREST_ENVELOPE,
  buildNuketownForestSurround,
} from './nuketown-forest-surround';
import { buildNuketownRebuildLawnField } from './nuketown-lawn-field';
import {
  NUKETOWN2_BACKDROP_ENVELOPE,
  buildNuketownMountainBackdrop,
} from './nuketown-mountain-backdrop';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_FLOOR_T,
  NUKETOWN2_FRONT_VERGE_DEPTH,
  NUKETOWN2_GROUND_STOREY_H,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_STREET_HALF_WIDTH,
  NUKETOWN2_STREET_LENGTH,
  NUKETOWN2_UPPER_Y0,
} from './nuketown2-layout';

// ---------------------------------------------------------------------------
// Footprint
// ---------------------------------------------------------------------------

/**
 * Footprint, house layout and rare-gun sites are authored in `./nuketown2-layout`,
 * which imports nothing: the weapon authority needs the sites and cannot import this
 * module without closing a require cycle through `protocol.ts`. Re-exported here so
 * every existing importer of this file is unchanged.
 */
export {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_STREET_HALF_WIDTH,
  NUKETOWN2_STREET_LENGTH,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_RARE_GUN_SITES,
} from './nuketown2-layout';

/** The ratio base. Every "0.nnn L" in this file is a fraction of this. */
const L = NUKETOWN2_STREET_LENGTH;

const HOUSE_DEPTH = NUKETOWN2_HOUSE_DEPTH;
/**
 * Width of a house along the street. Reference: the main house block measures
 * 121 px of 400 along the street axis = 0.303 L. 11 / 36 = 0.306.
 */
const HOUSE_WIDTH = 11;
/**
 * Back yard depth, house back wall to the yard fence. The reference's back lot
 * (house back wall to the playable boundary) is 0.503 L on one side and 0.583 L
 * on the other; this arena splits its 19 m of back lot into 13 m of fenced yard
 * plus 6 m of border path, which is 0.528 L of back lot in total.
 */
const YARD_DEPTH = 13;
/**
 * The border lane - the side path outside the back fence that gives the
 * distant views and carries the reference's own fence-hole flank. DERIVED, not
 * authored: it is whatever the fenced rectangle has left after the road, the
 * front verge, the two houses and the two back yards, so the cross-street
 * section can never silently stop adding up to the footprint.
 */
const SIDE_PATH_DEPTH = -NUKETOWN2_BOUNDS.minZ
  - (NUKETOWN2_STREET_HALF_WIDTH + NUKETOWN2_FRONT_VERGE_DEPTH + HOUSE_DEPTH + YARD_DEPTH);

/** Kerb line. */
const KERB_Z = -NUKETOWN2_STREET_HALF_WIDTH;
/** Front face of a house. */
const HOUSE_FRONT_Z = NUKETOWN2_HOUSE_FRONT_Z;             // -10
/** Back face of a house. */
const HOUSE_BACK_Z = HOUSE_FRONT_Z - HOUSE_DEPTH;          // -23
/** Fence line between the back yard and the border path. */
const YARD_FENCE_Z = HOUSE_BACK_Z - YARD_DEPTH;            // -36

/** Storey heights. Ground 3.0, upper 2.9, both slabs 0.3, roof deck at 6.5. */
const GROUND_H = NUKETOWN2_GROUND_STOREY_H;
const FLOOR_T = NUKETOWN2_FLOOR_T;
const UPPER_Y0 = NUKETOWN2_UPPER_Y0;                        // 3.3
const UPPER_H = 2.9;
const ROOF_Y0 = UPPER_Y0 + UPPER_H;                         // 6.2
const ROOF_T = 0.3;

const WALL_T = 0.3;
/** Waist-high cover: breaks a prone or crouched line, and vaultable. */
const LOW_COVER = 0.95;
/** Hard cover: clears the 1.65 m standing eye line. */
const HARD_COVER = 1.9;

/** House extents along the street, north house. The south house is its negation. */
const HOUSE_X0 = NUKETOWN2_HOUSE_LAYOUT[0].x - HOUSE_WIDTH / 2;  // -6.75
const HOUSE_X1 = NUKETOWN2_HOUSE_LAYOUT[0].x + HOUSE_WIDTH / 2;  // 4.25
/**
 * Garage: 5 m of street frontage (reference 50-58 px of 400 = 0.125-0.145 L;
 * 5 / 36 = 0.139 L), attached to one end of its house and SET BACK 6 m from the
 * house front line, which is what the reference draws: the garage wing does not
 * reach the street frontage, it hangs off the rear two thirds of the lot. The
 * 180-degree rotation then puts the two garages at opposite ends, which is
 * where the map's diagonal actually comes from.
 */
const GARAGE_WIDTH = 5;
const GARAGE_X0 = HOUSE_X1;                                       // 4.25
const GARAGE_X1 = GARAGE_X0 + GARAGE_WIDTH;                       // 9.25
/** Set-back of the garage front from the house front. Reference 67 px of 400 = 0.168 L. */
const GARAGE_SETBACK = 6;
const GARAGE_FRONT_Z = HOUSE_FRONT_Z - GARAGE_SETBACK;            // -16
const GARAGE_BACK_Z = HOUSE_BACK_Z;                               // -23, flush with the house
const GARAGE_DEPTH = GARAGE_FRONT_Z - GARAGE_BACK_Z;              // 7

/**
 * Height of the STANDING player capsule, from `STANCE_SHAPES.stand` in
 * `src/physics.ts`: 2 x (halfHeight 0.53 + radius 0.38). Authored here rather
 * than imported because this module is the arena and `physics.ts` pulls in the
 * Rapier adapter; `nuketown2-fidelity.test.ts` imports STANCE_SHAPES and
 * asserts this number against it, so it cannot drift.
 */
const STANDING_CAPSULE_M = 1.82;
/** Plan radius of that capsule, same source. */
const STANDING_RADIUS_M = 0.38;
/** `CHARACTER_PHYSICS_CONFIG.autostepHeight`, same source, same reason. */
const AUTOSTEP_M = 0.42;

/**
 * THE STAIR - HF-432 item 1, owner after PASS 90: "still some issues with
 * where stairs are".
 *
 * WHAT THE REFERENCE DOES AND DOES NOT DECIDE, checked rather than assumed.
 * Both first-party minimaps were re-fetched on 2026-09-03 to read the stair
 * footprint the lane brief expected to find drawn on them:
 *   S3 BO7 `Nuketown_2025_MiniMap_BO7.png`  HTTP 200, 2,761,702 bytes, served
 *      image/webp, 4096 x 4096 - an OVAL-CROPPED, rotated, red-tinted
 *      presentation. The two house fills resolve as grey blocks with NO
 *      interior linework inside either of them.
 *   S2 BO2 `Nuketown_2025_Minimap_BOII.png` HTTP 200, 46,120 bytes, served
 *      image/webp - the same oval crop, 253 x 498 px of playable art.
 * NEITHER DRAWS A STAIR. So the stair's position is DERIVED, and the
 * derivation - not a pixel - is the contract:
 *
 *   1. NOT the party wall. The east wall is the one the garage shares, and it
 *      carries the garage link door; the garage only overlaps 7 m of the
 *      house's 13 m depth, so a 5.1 m flight on that wall leaves no run of
 *      wall long enough for a 1.8 m door. The flight stands against the WEST
 *      wall, which is blind.
 *   2. IN THE BACK ROOM, climbing toward the street, landing at the internal
 *      partition. The previous cut ran it out of the FRONT room and put a
 *      6.05 x 1.95 m hole through the upper FRONT room - the room Activision's
 *      own guide calls the map's biggest power position and the room this
 *      arena stands its rare-gun site in. That room now has a complete floor.
 *      It also ran the flight THROUGH the ground-floor partition: treads 9 and
 *      10 interpenetrated it.
 *   3. ENTERED HEAD ON. 0.95 m of ground floor stands behind the bottom tread,
 *      so a player walks onto the flight facing up it instead of stepping onto
 *      its flank - which only tread 0 (0.30 m, inside the 0.42 m autostep) is
 *      low enough to allow.
 *   4. THE WELL OPENS ONLY WHERE IT MUST, and where it must is not where the
 *      arithmetic first said - see STAIRWELL_Z0, which is the one number in
 *      this arena that a probe corrected rather than confirmed.
 *
 * The LANDING is a 0.90 m tread at the top, against the partition, and the
 * upper leaf of that partition stops at the flight's inboard edge, so the head
 * of the stair opens straight into the front upper room: a landing and an
 * upper hallway, not a hole to hop out of.
 */
export const NUKETOWN2_HOUSE_STAIR = Object.freeze({
  /** Outboard edge: the inside face of the west wall. */
  x0: HOUSE_X0 + WALL_T,
  width: 1.65,
  riser: 0.3,
  /** 0.42 m: over the 0.22 m Rapier autostep minimum width, under the 6.05 m the room has. */
  going: 0.42,
  /** 11 x 0.30 = 3.30 = NUKETOWN2_UPPER_Y0, so the top tread IS the upper floor. */
  risers: 11,
  landingDepth: 0.9,
});

/** Inboard edge of the flight. */
const STAIR_X1 = NUKETOWN2_HOUSE_STAIR.x0 + NUKETOWN2_HOUSE_STAIR.width;
/** House mid-line: where the internal partition stands on both storeys. */
const HOUSE_MID_Z = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;
/** Front edge of the landing, flush with the partition's back face. */
const STAIR_HEAD_Z = HOUSE_MID_Z - WALL_T / 2;
/** Bottom of the flight. */
const STAIR_FOOT_Z = STAIR_HEAD_Z
  - NUKETOWN2_HOUSE_STAIR.landingDepth
  - NUKETOWN2_HOUSE_STAIR.going * (NUKETOWN2_HOUSE_STAIR.risers - 1);
/**
 * Where the upper floor stops and the stairwell opens - MEASURED, and not the
 * obvious thing.
 *
 * The obvious rule is "the slab may cover a tread as long as the standing
 * capsule fits under it", feet + STANDING_CAPSULE_M <= GROUND_H, which allows
 * feet up to 1.18 m. That rule is WRONG and the traversal probe in
 * `nuketown2-fidelity.test.ts` caught it on the first run: Rapier's autostep
 * casts the capsule UP by `autostepHeight` BEFORE it casts forward, so taking
 * a step under a ceiling needs
 *
 *     feet + STANDING_CAPSULE_M + AUTOSTEP_M <= GROUND_H
 *
 * i.e. 0.76 m of feet in a 3.0 m storey. Authored the obvious way the flight
 * stalled with the player wedged on tread 2's nosing at 0.76 m, grounded and
 * blocked, for as long as the probe walked it: a staircase that looks right,
 * measures right and cannot be climbed. Only treads 0 and 1 may keep a ceiling
 * and the well opens a capsule radius (plus 0.12 m, five times the
 * controller's own 0.025 m skin) before tread 2's near edge.
 */
const STAIR_MAX_FEET_UNDER_CEILING = GROUND_H - STANDING_CAPSULE_M - AUTOSTEP_M;
const STAIR_FIRST_UNCOVERED_TREAD = Math.floor(STAIR_MAX_FEET_UNDER_CEILING / NUKETOWN2_HOUSE_STAIR.riser);
const STAIRWELL_Z0 = STAIR_FOOT_Z
  + NUKETOWN2_HOUSE_STAIR.going * STAIR_FIRST_UNCOVERED_TREAD
  - STANDING_RADIUS_M - 0.12;

/** Radius of the cul-de-sac turning head at the middle of the road. */
const TURNING_HEAD_HALF = 8;

/**
 * The authored section, in metres. Every number here is the one the build
 * itself uses, and the along-street offset is READ BACK from the house layout
 * rather than restated, so the section can never describe a map that is not the
 * one `buildNuketown2()` emits. `nuketown2-fidelity.test.ts` measures the built
 * colliders against this and against the reference ratios in the schematic.
 */
export const NUKETOWN2_SECTION = Object.freeze({
  streetHalfWidth: NUKETOWN2_STREET_HALF_WIDTH,
  frontVergeDepth: NUKETOWN2_FRONT_VERGE_DEPTH,
  houseDepth: HOUSE_DEPTH,
  houseWidth: HOUSE_WIDTH,
  yardDepth: YARD_DEPTH,
  sidePathDepth: SIDE_PATH_DEPTH,
  garageWidth: GARAGE_WIDTH,
  garageDepth: GARAGE_DEPTH,
  garageSetback: GARAGE_SETBACK,
  streetLength: L,
  houseOffsetAlongStreet: NUKETOWN2_HOUSE_LAYOUT[1]!.x - NUKETOWN2_HOUSE_LAYOUT[0]!.x,
});

/**
 * The moving truck, centred on the world origin: the reference's "island of
 * cover in the otherwise open cul-de-sac", and the OPEN body of the two.
 *
 * SIZE IS MEASURED. On the BO7 minimap the truck is 130 px of a 400 px street
 * axis = 0.325 L end to end, split into a hollow-drawn cargo box (72 px,
 * 0.180 L) and a solid-drawn cab (58 px, 0.145 L). Here: 6.5 m box + 5.2 m cab
 * = 11.7 m = 0.325 L exactly.
 *
 * `deckY` AND `roofY` ARE BOTH SET BY THE 2x-DAMAGE CORE, not by taste, and the
 * two constraints pull in opposite directions. `OVERDRIVE_POSITION` is a single
 * global {0, 3.75, 0} and `claimOverdrive` is a pure height-and-radius rule, so
 * with a standing eye height of 1.70 m:
 *   - a player STANDING ON THE ROOF must claim: |roofY + 1.70 - 3.75| <= 1.90
 *     gives roofY <= 3.95. Authored 3.15, dy 1.10.
 *   - a player STANDING IN THE CARGO BOX must NOT claim, because a core you can
 *     take from inside cover is not a contested position at all - and because
 *     `src/overdrive.ts`' own v6 comment says that window was tightened from 2.4
 *     precisely so an interior cannot claim through the roof slab. That needs
 *     3.75 - (deckY + 1.70) > 1.90, i.e. deckY < 0.15. Authored 0.05, dy 2.00.
 * The margin is 0.10 m and `nuketown2-fidelity.test.ts` calls `claimOverdrive`
 * to prove it rather than restating the arithmetic.
 */
export const NUKETOWN2_CENTRAL_TRUCK = Object.freeze({
  boxLength: 6.5,
  cabLength: 5.2,
  width: 2.6,
  deckY: 0.05,
  roofY: 3.15,
  cabRoofY: 2.9,
  /** Cab centre along the street: box half plus cab half. */
  cabX: 6.5 / 2 + 5.2 / 2,
});

/**
 * The retro coach parked across the turning head from the truck. CLOSED cover:
 * the reference's minimap draws it hatched end to end, and the first-party
 * preview still of the map shows a sealed streamlined body, not a school bus
 * you walk through. It is a solid 3.3 m body and that is the whole of its job.
 *
 * WHERE IT SITS is measured as an OFFSET FROM THE TRUCK, because the truck's
 * own position is pinned by the core rather than by the reference. On the
 * minimap the coach centre is 0.178 L along the street and 0.150 L across it
 * from the truck's cargo box. Here 5.0 m (0.139 L) and 4.0 m (0.111 L): both
 * inside the lane's 5 %-of-street-length tolerance, and pulled in because the
 * measured pair would put the coach's flank over the kerb.
 */
export const NUKETOWN2_STREET_COACH = Object.freeze({
  length: 9.1,
  width: 2.6,
  height: 3.3,
  x: -5,
  z: -4,
});

/**
 * The treads that make the truck roof - and therefore the 2x-damage core - a
 * place a player can actually get to. Measured, not assumed: the jump apex from
 * flat ground is 6.35^2 / (2 x 24.5) = 0.823 m and autostep is 0.42 m, so a
 * rise of about 1.2 m is the most a player can take in one hop. A 3.15 m roof
 * with nothing beside it is unreachable, which is what the first cut of the old
 * bus shipped.
 *
 * Three treads against the CAB's +z flank, then 0.30 m up onto the cab roof
 * (2.90) and 0.25 m from there onto the cargo-box roof (3.15). Climbing over
 * the cab is both the shortest route and the one that keeps every tread far
 * from the core.
 *
 * WHY THEY SIT WHERE THEY SIT. Every tread footprint is more than
 * `OVERDRIVE_PICKUP_RADIUS` (1.65 m) from the world origin in plan - the
 * nearest corner is 3.64 m - so climbing half way cannot short-circuit the
 * claim: the core is taken on the box roof or not at all.
 */
const TRUCK_ROOF_STEPS: readonly (readonly [number, number, number])[] = Object.freeze([
  // [tread top, x from, x to]
  Object.freeze([0.80, 7.0, 8.2] as const),
  Object.freeze([1.75, 5.8, 7.0] as const),
  Object.freeze([2.60, 4.6, 5.8] as const),
]);

/**
 * Spawn table. Both teams stand in their own BACK YARD behind their own house,
 * which is the reference's arrangement. Team 1's points are the exact
 * 180-degree negation of team 0's, so neither team owns a better half by
 * construction.
 *
 * These points are the spawn solver's own validated candidates
 * (`npx tsx scripts/qa/solve-spawn-layouts.ts --arenas nuketown2 --all`), not
 * eyeballed: every one has floor beneath it, an autostep route to the enemy,
 * cover within reach, no enemy spawn in sight, and clears the gate's team
 * separation floor.
 */
export const NUKETOWN2_SPAWN_LAYOUT: readonly (readonly (readonly [number, number])[])[] = Object.freeze([
  Object.freeze([[-12, -30] as const, [-6, -32] as const, [0, -30] as const, [6, -32] as const, [12, -30] as const]),
  Object.freeze([[12, 30] as const, [6, 32] as const, [0, 30] as const, [-6, 32] as const, [-12, 30] as const]),
]);

// ---------------------------------------------------------------------------
// Builder plumbing
// ---------------------------------------------------------------------------

function makeBuilder(scene: THREE.Scene, name: string): Builder {
  const root = new THREE.Group();
  root.name = name;
  scene.add(root);
  return {
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    ballisticSurfaceSequence: 0,
  };
}

type BoxOptions = Parameters<typeof box>[5];

/**
 * Emit a body AND its exact 180-degree partner, `(x, z) -> (-x, -z)`.
 *
 * This is the fairness involution, made structural. Nothing in this arena is
 * yawed, so the rotation of an axis-aligned box is the same box at the negated
 * position — which means the partner is exact, not approximate, and the
 * symmetry gate can never drift away from the geometry because there is only
 * one authoring call.
 */
function pair(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  /**
   * One material for both halves, or `[north, south]` for the two that differ
   * by COLOUR ALONE. HF-426 Job 3: the reference's playable houses are blue,
   * yellow and orange - not one repeated shell - and the two houses here are
   * the map's primary landmark, so a player who breaks into an upper room can
   * tell whose room it is from the siding. Geometry stays identical, which is
   * what the fidelity gate's 180-degree partner test measures (size + position,
   * never material), so this cannot make the two halves unequal to play.
   */
  material: THREE.Material | readonly [THREE.Material, THREE.Material],
  options: BoxOptions = {},
): void {
  const single = (material as { isMaterial?: boolean }).isMaterial === true;
  const north = single ? material as THREE.Material : (material as readonly THREE.Material[])[0]!;
  const south = single ? material as THREE.Material : (material as readonly THREE.Material[])[1]!;
  box(builder, `nuketown2 north ${name}`, position, size, north, options);
  box(builder, `nuketown2 south ${name}`, [-position[0], position[1], -position[2]], size, south, options);
}

/** A body already centred on the origin axis it would be rotated about. */
function centred(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: BoxOptions = {},
): THREE.Mesh {
  return box(builder, `nuketown2 ${name}`, position, size, material, options);
}

/**
 * A street vehicle body: authored ONCE, with no rotational partner, because the
 * reference's own street vehicles are not a rotational pair. Every mesh emitted
 * through this helper is named `nuketown2 street-vehicle ...` and the fidelity
 * gate asserts that the arena's asymmetric set is EXACTLY this set - not a
 * name filter that would let a wall slip through, an enumerated list that has
 * to be updated deliberately.
 */
function streetVehicle(
  builder: Builder,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  material: THREE.Material,
  options: BoxOptions = {},
): void {
  box(builder, `nuketown2 street-vehicle ${name}`, position, size, material, options);
}

// ---------------------------------------------------------------------------
// Materials — original, authored for this arena
// ---------------------------------------------------------------------------

type Nuketown2Materials = Readonly<{
  ground: THREE.MeshStandardMaterial;
  lawn: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  drive: THREE.MeshStandardMaterial;
  /** North house board siding - the reference's BLUE house. */
  sidingA: THREE.MeshStandardMaterial;
  /** South house board siding - the reference's YELLOW house. */
  sidingB: THREE.MeshStandardMaterial;
  /** Both garage wings - the reference's ORANGE. */
  garageSiding: THREE.MeshStandardMaterial;
  /** The up-and-over garage door leaf parked in its head. */
  garageDoor: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  fence: THREE.MeshStandardMaterial;
  block: THREE.MeshStandardMaterial;
  busShell: THREE.MeshStandardMaterial;
  busTrim: THREE.MeshStandardMaterial;
  truckCab: THREE.MeshStandardMaterial;
  truckBox: THREE.MeshStandardMaterial;
  carA: THREE.MeshStandardMaterial;
  carGlass: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  sign: THREE.MeshStandardMaterial;
  planter: THREE.MeshStandardMaterial;
}>;

/**
 * HF-426 JOB 3 - THE APPROVED LOOK, PORTED. Owner 2026-09-03: "then layer in
 * all the visual styles we had aimed for and approved in our older layout".
 * The approved look is the SHIPPED Nuke Town's (`atomic-acres`), so every
 * albedo below is the shipped map's OWN, MEASURED - not eyeballed and not
 * invented. The shipped map dresses itself with PBR texture sets it streams
 * from `public/assets/original/textures/`; this arena imports nothing (see the
 * file header), so each entry here carries that texture set's mean albedo at
 * the same authored roughness/metalness, sampled 2026-09-03 on a 4-px stride:
 *
 *   siding-aqua      0x448684    plaster-warm   0xdbd1ba    grass-turf   0x496438
 *   siding-coral     0xac5644    brick-warm     0x9b5c43    wood-deck    0x673b24
 *   roof-shingles    0x444c4d    asphalt-aged   0x252a2c    concrete     0xa9a697
 *
 * ...plus the shipped map's own flat-authored materials, taken verbatim:
 * `white` 0xf0e4c9/0.68, `mustard` 0xd9a43b, `chrome` 0xaebdc1/0.18/0.76,
 * and art-kit's `MAT.rubber` 0x202628/0.9 and `MAT.cream` 0xe7dbc1/0.68.
 *
 * WHERE THE REFERENCE OVERRIDES THE SHIPPED MAP, AND WHY. Three places, all
 * recorded in `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`:
 *
 *   1. HOUSE COLOUR (5.3). The reference's playable-area houses are BLUE,
 *      YELLOW and ORANGE - the previous cut's green+yellow are the ORIGINAL
 *      Nuketown's colours, which is the same mistake as the yellow school bus.
 *      So the trio is the shipped map's own three house/accent hues
 *      re-pointed: its `siding-aqua` value and roughness rotated to blue for
 *      the north house, its `mustard` for the south house, its `siding-coral`
 *      for both garage wings. Same family, the reference's trio.
 *   2. THE COACH IS CREAM AND RED (5.2), not the shipped coach's amber. It
 *      keeps the shipped coach's PAINT SPEC (roughness 0.48, metalness 0.25 -
 *      `buildRetroCoach` in art-kit.ts) so it reads as the same class of
 *      object under the same key.
 *   3. THE TRUCK IS A PLAIN BOX VAN (2), so it carries no saturated panel at
 *      all. That leaves the coach's red waistline as the ONE saturated body on
 *      the map, standing in the turning head, which is where the fight is.
 *
 * ONE THING IS DELIBERATELY NOT PORTED: `carA`'s roughness stays at 0.20.
 * The ray-traced preset admits a reflective proxy at roughness <= 0.22 over
 * 6 m2, and the parked cars are the only surfaces on this map that clear both;
 * the shipped map's own `chrome` comment records the same rule being broken by
 * one hundredth and costing the flagship map its reflections. `garageDoor`
 * (0.18) is that same shipped chrome and adds two more.
 */
function nuketown2Materials(): Nuketown2Materials {
  return Object.freeze({
    // Beyond the fence. Keyed to the mountain backdrop's own foothill foot
    // colour (0x2f3a2c, nuketown-mountain-backdrop.ts) lifted toward the lawn,
    // so the 220 m slab reads as the same scrubland the forest ring stands on
    // rather than as a different planet starting at the fence.
    // Measured on the first Job 3 capture: at 0x3f4a30 the 270 m plain outside
    // the fence came back as a near-black field that swallowed the forest's own
    // trunks and made the map look like a lit island in a void. Keyed instead
    // between the shipped backdrop skirt's two authored ground colours - damp
    // forest floor 0x4c5340 and dry scrub 0x5d6047 - which is the ground this
    // slab is standing in for, so the plain and the tree line now read as the
    // same land.
    ground: standard(0x515642, 1, 0),
    // grass-turf, the shipped lawn plate. The instanced lawn field grows out of
    // this, and that field's blade green (0x5e9e41) was keyed against it.
    lawn: standard(0x496438, 1, 0),
    // asphalt-aged's mean is 0x252a2c, and that is the value a TEXTURED road
    // wants: the shipped map's road carries a normal map and an aggregate
    // pattern, so half its pixels catch a highlight and the mean is what is
    // left after those highlights are averaged back in. This arena's road is a
    // flat box with no normal and no breakup, and at 0x252a2c under a low sun
    // it rendered as a HOLE - measured on the first Job 3 capture, the
    // carriageway and both aprons came back at essentially 0 in every channel
    // in the street-centre and into-sun frames, with the kerb line floating on
    // black. Lifted to the value that puts an unlit, unbroken box at the
    // rendered luminance the shipped map's textured road actually reaches.
    asphalt: standard(0x41464a, 0.98, 0.02),
    // concrete-poured, fresh at the kerb and weathered on the apron - the
    // shipped map's own tint-the-same-texture idiom (`grass` / `grassDark`).
    kerb: standard(0xa9a697, 0.94, 0.02),
    drive: standard(0x8b8879, 0.94, 0.02),
    // The BLUE house: siding-aqua's luminance (119.8) and roughness (0.76)
    // with the hue carried to the reference's blue (measured 117.9).
    sidingA: standard(0x46809f, 0.76, 0),
    // The YELLOW house: the shipped map's `mustard` hex, at siding roughness
    // rather than its painted-metal 0.58/0.18 - this is board, not panel.
    sidingB: standard(0xd9a43b, 0.76, 0),
    // The ORANGE wing: siding-coral, unchanged.
    garageSiding: standard(0xac5644, 0.76, 0),
    // The shipped map's `chrome`, verbatim - it is what dresses BOTH garage
    // doors there. The opening itself stays a hole (it is a route); this is the
    // door leaf parked in its head, which is what you see from the street.
    garageDoor: standard(0xaebdc1, 0.18, 0.76),
    // `white`, the shipped map's trim: sills, heads, lintels, road dashes.
    trim: standard(0xf0e4c9, 0.68, 0.03),
    roof: standard(0x444c4d, 0.86, 0.03),
    // plaster-warm: interior walls, floors, stairs and the ground-room bodies.
    interior: standard(0xdbd1ba, 0.92, 0.01),
    // wood-deck: the plank fence, the same timber the shipped map decks with.
    fence: standard(0x673b24, 0.92, 0.02),
    block: standard(0x9d9a8c, 0.94, 0.01),
    // THE COACH. Cream body (art-kit `MAT.cream`) at the shipped coach's own
    // paint spec, with a red waistline - the reference's cream/red streamlined
    // body - as the one saturated thing on the map.
    busShell: standard(0xe7dbc1, 0.48, 0.25),
    busTrim: standard(0xa8382c, 0.48, 0.25),
    // THE MOVING TRUCK: a plain box van. Painted cab, matte panel box, no
    // livery, because the reference's is a hire truck and because the eye is
    // meant to go to the coach beside it.
    truckCab: standard(0xdedac9, 0.55, 0.24),
    truckBox: standard(0xd3cdbb, 0.78, 0.06),
    // The two parked cars are the only POLISHED surfaces on the map, and that
    // is deliberate rather than decorative: the ray-traced preset's proxy
    // extraction admits a surface at roughness <= 0.22 with a footprint over
    // 6 m2, and with everything else here authored matte (board siding, dry
    // asphalt, painted vehicle panels) the arena first measured ZERO reflective
    // meshes - the tracer had nothing to reflect at all. Car paint really is
    // ~0.2 rough and genuinely metallic, and a 4.4 x 1.9 m body clears the
    // footprint floor where the 2.2 x 1.7 m glass house does not, so the honest
    // fix was to author the paint correctly rather than to gloss a road.
    // Job 3 re-keys the HUE into the shipped map's own aqua family and leaves
    // the two numbers the preset classifies on exactly where they were.
    carA: standard(0x3d6f80, 0.2, 0.62),
    carGlass: standard(0x2b3d47, 0.14, 0.5),
    // art-kit `MAT.rubber`, verbatim.
    rubber: standard(0x202628, 0.9, 0.02),
    sign: standard(0xdbd1ba, 0.78, 0.06),
    // Hedges, the yard crate, the patio table and the alley planter are one
    // material and four of the five uses are garden mass, so it is keyed as
    // clipped hedge against the shipped map's `grassDark` (effective 0x243917).
    planter: standard(0x415a33, 0.96, 0.01),
  });
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

/**
 * One house, authored once for the north side; `pair()` writes the south house
 * as its exact rotational partner.
 *
 * The plan is the reference's, described rather than copied: two ground rooms
 * split by an internal wall with a doorway, a front door and a back door so the
 * house is a route and not a room, a stair to the upper floor, a linking
 * doorway into its own garage, and the front upper window as a real opening in
 * the wall rather than a decal. Activision's own guide calls the front-facing
 * windows of both homes the biggest power positions on the map, and they only
 * are that if you can actually shoot through them.
 */
function house(builder: Builder, m: Nuketown2Materials): void {
  // HF-426 Job 3: blue north, yellow south. Same wall in the same place; only
  // the paint differs, so the 180-degree partner gate is untouched.
  const siding = [m.sidingA, m.sidingB] as const;
  const zFront = HOUSE_FRONT_Z - WALL_T / 2;      // wall centre, front face on the front line
  const zBack = HOUSE_BACK_Z + WALL_T / 2;
  const zMid = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;   // -16.5
  const cx = NUKETOWN2_HOUSE_LAYOUT[0]!.x;           // -1.25

  // Ground slab and roof deck.
  pair(builder, 'house floor', [cx, -0.1, zMid], [HOUSE_WIDTH, 0.2, HOUSE_DEPTH], m.interior, { cast: false });
  pair(builder, 'house roof deck', [cx, ROOF_Y0 + ROOF_T / 2, zMid], [HOUSE_WIDTH, ROOF_T, HOUSE_DEPTH], m.roof);

  // West side wall, full height both storeys.
  pair(builder, 'house wall west', [HOUSE_X0 + WALL_T / 2, ROOF_Y0 / 2, zMid],
    [WALL_T, ROOF_Y0, HOUSE_DEPTH], siding);

  // --- east side wall: the garage link doorway is a REAL hole ---------------
  // The previous cut cut a doorway in the garage's shared wall and left the
  // house's own east wall solid behind it, so the garage's "route into the
  // house" opened onto a wall. Both leaves are cut here, at the same z.
  const LINK_DOOR: [number, number] = [-19.5, -17.9];
  [[HOUSE_BACK_Z, LINK_DOOR[0]], [LINK_DOOR[1], HOUSE_FRONT_Z]].forEach((run, index) => {
    pair(builder, `house wall east ${index}`,
      [HOUSE_X1 - WALL_T / 2, GROUND_H / 2, (run[0]! + run[1]!) / 2],
      [WALL_T, GROUND_H, run[1]! - run[0]!], siding);
  });
  pair(builder, 'house wall east lintel',
    [HOUSE_X1 - WALL_T / 2, GROUND_H - 0.2, (LINK_DOOR[0] + LINK_DOOR[1]) / 2],
    [WALL_T, 0.4, LINK_DOOR[1] - LINK_DOOR[0]], m.trim);
  pair(builder, 'house wall east upper', [HOUSE_X1 - WALL_T / 2, (GROUND_H + ROOF_Y0) / 2, zMid],
    [WALL_T, ROOF_Y0 - GROUND_H, HOUSE_DEPTH], siding);

  // --- front wall, ground floor: two windows and the front door ------------
  // Segments are authored as [x0, x1] runs; the gaps between them ARE the
  // openings, which is the whole point — a window you cannot shoot through is
  // a painting.
  const FRONT_DOOR: [number, number] = [-1.95, -0.55];
  const FRONT_WINDOW_A: [number, number] = [-5.6, -3.6];
  const FRONT_WINDOW_B: [number, number] = [1.4, 3.4];
  const groundFrontRuns: [number, number][] = [
    [HOUSE_X0, FRONT_WINDOW_A[0]],
    [FRONT_WINDOW_A[1], FRONT_DOOR[0]],
    [FRONT_DOOR[1], FRONT_WINDOW_B[0]],
    [FRONT_WINDOW_B[1], HOUSE_X1],
  ];
  groundFrontRuns.forEach((run, index) => {
    pair(builder, `house front pier ${index}`,
      [(run[0] + run[1]) / 2, GROUND_H / 2, zFront], [run[1] - run[0], GROUND_H, WALL_T], siding);
  });
  // Window sills (0 -> 1.0) and heads (2.1 -> 3.0). Standing eye is 1.65, so the
  // 1.1 m band between them is the shot corridor.
  for (const [index, window] of [FRONT_WINDOW_A, FRONT_WINDOW_B].entries()) {
    const width = window[1] - window[0];
    const wx = (window[0] + window[1]) / 2;
    pair(builder, `house front window sill ${index}`, [wx, 0.5, zFront], [width, 1.0, WALL_T], m.trim);
    pair(builder, `house front window head ${index}`, [wx, 2.55, zFront], [width, 0.9, WALL_T], m.trim);
  }
  pair(builder, 'house front door lintel',
    [(FRONT_DOOR[0] + FRONT_DOOR[1]) / 2, 2.6, zFront], [FRONT_DOOR[1] - FRONT_DOOR[0], 0.8, WALL_T], m.trim);

  // --- front wall, upper floor: the power window ---------------------------
  const UPPER_WINDOW: [number, number] = [-2.85, 0.35];
  const upperFrontRuns: [number, number][] = [
    [HOUSE_X0, UPPER_WINDOW[0]],
    [UPPER_WINDOW[1], HOUSE_X1],
  ];
  upperFrontRuns.forEach((run, index) => {
    pair(builder, `house upper front pier ${index}`,
      [(run[0] + run[1]) / 2, UPPER_Y0 + UPPER_H / 2, zFront], [run[1] - run[0], UPPER_H, WALL_T], siding);
  });
  {
    const width = UPPER_WINDOW[1] - UPPER_WINDOW[0];
    const wx = (UPPER_WINDOW[0] + UPPER_WINDOW[1]) / 2;
    // 0.9 m sill: you can stand at it, and you can crouch behind it.
    pair(builder, 'house upper window sill', [wx, UPPER_Y0 + 0.45, zFront], [width, 0.9, WALL_T], m.trim);
    pair(builder, 'house upper window head', [wx, UPPER_Y0 + UPPER_H - 0.45, zFront], [width, 0.9, WALL_T], m.trim);
  }

  // --- back wall: back door and one upper window ---------------------------
  const BACK_DOOR: [number, number] = [-2.05, -0.45];
  const groundBackRuns: [number, number][] = [
    [HOUSE_X0, BACK_DOOR[0]],
    [BACK_DOOR[1], HOUSE_X1],
  ];
  groundBackRuns.forEach((run, index) => {
    pair(builder, `house back pier ${index}`,
      [(run[0] + run[1]) / 2, GROUND_H / 2, zBack], [run[1] - run[0], GROUND_H, WALL_T], siding);
  });
  pair(builder, 'house back door lintel',
    [(BACK_DOOR[0] + BACK_DOOR[1]) / 2, 2.6, zBack], [BACK_DOOR[1] - BACK_DOOR[0], 0.8, WALL_T], m.trim);
  const BACK_UPPER_WINDOW: [number, number] = [-5.75, -3.25];
  [[HOUSE_X0, BACK_UPPER_WINDOW[0]], [BACK_UPPER_WINDOW[1], HOUSE_X1]].forEach((run, index) => {
    pair(builder, `house upper back pier ${index}`,
      [(run[0]! + run[1]!) / 2, UPPER_Y0 + UPPER_H / 2, zBack], [run[1]! - run[0]!, UPPER_H, WALL_T], siding);
  });
  pair(builder, 'house upper back sill',
    [(BACK_UPPER_WINDOW[0] + BACK_UPPER_WINDOW[1]) / 2, UPPER_Y0 + 0.45, zBack],
    [BACK_UPPER_WINDOW[1] - BACK_UPPER_WINDOW[0], 0.9, WALL_T], m.trim);
  pair(builder, 'house upper back head',
    [(BACK_UPPER_WINDOW[0] + BACK_UPPER_WINDOW[1]) / 2, UPPER_Y0 + UPPER_H - 0.45, zBack],
    [BACK_UPPER_WINDOW[1] - BACK_UPPER_WINDOW[0], 0.9, WALL_T], m.trim);

  // --- stair: BACK room, hard against the WEST (blind) wall ----------------
  // Ten 0.30 m risers and a 0.90 m landing, climbing toward the street. The
  // riser is inside the 0.42 m autostep and the going is over the 0.22 m
  // Rapier autostep minimum width, so this WALKS: it is not a jump puzzle and
  // it is not a ramp the bots cannot read. Where it stands, and why it is not
  // where the previous cut put it, is derived at NUKETOWN2_HOUSE_STAIR.
  const STAIR_W = NUKETOWN2_HOUSE_STAIR.width;
  const STAIR_CX = NUKETOWN2_HOUSE_STAIR.x0 + STAIR_W / 2;
  const RISER = NUKETOWN2_HOUSE_STAIR.riser;
  const GOING = NUKETOWN2_HOUSE_STAIR.going;
  const risers = NUKETOWN2_HOUSE_STAIR.risers;
  for (let i = 0; i < risers - 1; i += 1) {
    const top = RISER * (i + 1);
    pair(builder, `house stair ${i}`,
      [STAIR_CX, top / 2, STAIR_FOOT_Z + GOING * (i + 0.5)], [STAIR_W, top, GOING], m.interior);
  }
  // The landing. Its top IS the upper floor slab's top, so a player walks off
  // it rather than stepping up onto the floor, and it is deep enough to turn
  // on rather than being a nosing you arrive at mid-stride.
  pair(builder, 'house stair landing',
    [STAIR_CX, UPPER_Y0 / 2, STAIR_HEAD_Z - NUKETOWN2_HOUSE_STAIR.landingDepth / 2],
    [STAIR_W, UPPER_Y0, NUKETOWN2_HOUSE_STAIR.landingDepth], m.interior);

  // --- upper floor slab, with the stairwell left open ----------------------
  // East of the flight the slab is continuous over the whole house. The west
  // strip carries the well, which runs from the back wall to the landing and
  // nowhere else: 4.34 x 1.95 m in the BACK room, against the previous cut's
  // 6.05 x 1.95 m under the front window.
  pair(builder, 'house upper floor east',
    [(STAIR_X1 + HOUSE_X1) / 2, GROUND_H + FLOOR_T / 2, zMid],
    [HOUSE_X1 - STAIR_X1, FLOOR_T, HOUSE_DEPTH], m.interior);
  pair(builder, 'house upper floor west back',
    [(HOUSE_X0 + STAIR_X1) / 2, GROUND_H + FLOOR_T / 2, (HOUSE_BACK_Z + STAIRWELL_Z0) / 2],
    [STAIR_X1 - HOUSE_X0, FLOOR_T, STAIRWELL_Z0 - HOUSE_BACK_Z], m.interior);
  pair(builder, 'house upper floor west front',
    [(HOUSE_X0 + STAIR_X1) / 2, GROUND_H + FLOOR_T / 2, (STAIR_HEAD_Z + HOUSE_FRONT_Z) / 2],
    [STAIR_X1 - HOUSE_X0, FLOOR_T, HOUSE_FRONT_Z - STAIR_HEAD_Z], m.interior);

  // --- internal partitions, both storeys, one doorway each -----------------
  const PARTITION_Z = zMid;
  const INNER_DOOR: [number, number] = [-3.5, -1.9];
  for (const [storey, y0, h] of [['ground', 0, GROUND_H], ['upper', UPPER_Y0, UPPER_H]] as const) {
    // The UPPER leaf stops at the flight's inboard edge: that 1.95 m gap is
    // the head of the stair, so the landing opens straight into the front
    // upper room. The two upper rooms are therefore joined twice - by the
    // landing on the west and by the internal door in the middle - which is
    // the "landing and upper hallway" this pass owes, and it is why the
    // stairwell no longer has to be crossed to use the upper floor.
    const x0 = storey === 'upper' ? STAIR_X1 : HOUSE_X0;
    [[x0, INNER_DOOR[0]], [INNER_DOOR[1], HOUSE_X1]].forEach((run, index) => {
      if (run[1]! - run[0]! <= 0.05) return;
      pair(builder, `house ${storey} partition ${index}`,
        [(run[0]! + run[1]!) / 2, y0 + h / 2, PARTITION_Z], [run[1]! - run[0]!, h, WALL_T], m.interior);
    });
  }

  // One waist-high body per ground room, so a room is a fight and not a box.
  pair(builder, 'house front room counter', [-4.8, LOW_COVER / 2, HOUSE_FRONT_Z - 2.8], [3.2, LOW_COVER, 1.0], m.interior);
  pair(builder, 'house back room bench', [1.5, LOW_COVER / 2, HOUSE_BACK_Z + 2.4], [3.0, LOW_COVER, 1.0], m.interior);
  // The upper crate lives in the BACK upper room, deliberately clear of the
  // front window seat that both the rare-gun site and the fidelity gate stand
  // on.
  // HF-432 item 1: this stood at UPPER_Y0 + FLOOR_T / 2 + LOW_COVER / 2, which
  // put its underside at 3.45 on a slab whose top is 3.30 - a crate floating
  // 0.15 m in the air, which the forging review forbids. UPPER_Y0 IS the slab
  // top (GROUND_H + FLOOR_T), so the crate sits on it.
  // Moved east of the flight (HF-432 item 1): at x = -4.5 it spanned
  // x [-5.2, -3.8] and the stairwell now opens over x [-6.75, -4.80], so 0.4 m
  // of it hung over the void.
  pair(builder, 'house upper crate', [-0.5, UPPER_Y0 + LOW_COVER / 2, zMid - 3.0],
    [1.4, LOW_COVER, 1.4], m.interior);
}

/**
 * The garage: a rear-set wing on one end of its house, one storey, a vehicle
 * door onto its own driveway and a rear door into the back yard, plus the
 * internal link into the house. The reference draws the garage as a wing that
 * stops 0.168 of the street length short of the house's street frontage, so the
 * driveway in front of it is a real 6 m apron rather than a dropped kerb.
 */
function garage(builder: Builder, m: Nuketown2Materials): void {
  const H = 3.4;
  const zFront = GARAGE_FRONT_Z - WALL_T / 2;
  const zBack = GARAGE_BACK_Z + WALL_T / 2;
  const zMid = (GARAGE_FRONT_Z + GARAGE_BACK_Z) / 2;
  const cx = (GARAGE_X0 + GARAGE_X1) / 2;

  pair(builder, 'garage floor', [cx, -0.1, zMid], [GARAGE_WIDTH, 0.2, GARAGE_DEPTH], m.drive, { cast: false });
  pair(builder, 'garage roof', [cx, H + 0.15, zMid], [GARAGE_WIDTH, 0.3, GARAGE_DEPTH], m.roof);
  pair(builder, 'garage wall outboard', [GARAGE_X1 - WALL_T / 2, H / 2, zMid], [WALL_T, H, GARAGE_DEPTH], m.garageSiding);

  // Shared wall with the house, with an internal doorway so the garage is a
  // route into the house rather than a dead-end box. Matches the hole cut in
  // the house's own east wall.
  const LINK_DOOR: [number, number] = [-19.5, -17.9];
  [[GARAGE_BACK_Z, LINK_DOOR[0]], [LINK_DOOR[1], GARAGE_FRONT_Z]].forEach((run, index) => {
    pair(builder, `garage link pier ${index}`,
      [GARAGE_X0 + WALL_T / 2, H / 2, (run[0]! + run[1]!) / 2], [WALL_T, H, run[1]! - run[0]!], m.garageSiding);
  });

  // Garage door: a 3.5 m opening onto the driveway apron, headed at 3.0 m.
  const DOOR: [number, number] = [5.0, 8.5];
  [[GARAGE_X0, DOOR[0]], [DOOR[1], GARAGE_X1]].forEach((run, index) => {
    pair(builder, `garage front pier ${index}`,
      [(run[0]! + run[1]!) / 2, H / 2, zFront], [run[1]! - run[0]!, H, WALL_T], m.garageSiding);
  });
  // The door LEAF, parked in its head: the shipped map's chrome, and the piece
  // that makes a 3.5 m hole read as a garage rather than as a missing wall.
  pair(builder, 'garage door head', [(DOOR[0] + DOOR[1]) / 2, H - 0.4, zFront], [DOOR[1] - DOOR[0], 0.8, WALL_T], m.garageDoor);

  // Rear door into the back yard.
  const REAR: [number, number] = [5.4, 7.0];
  [[GARAGE_X0, REAR[0]], [REAR[1], GARAGE_X1]].forEach((run, index) => {
    pair(builder, `garage back pier ${index}`,
      [(run[0]! + run[1]!) / 2, H / 2, zBack], [run[1]! - run[0]!, H, WALL_T], m.garageSiding);
  });
  pair(builder, 'garage back head', [(REAR[0] + REAR[1]) / 2, H - 0.4, zBack], [REAR[1] - REAR[0], 0.8, WALL_T], m.trim);

  // Workbench: the one body that makes the garage a position rather than a
  // corridor between three doors.
  pair(builder, 'garage bench', [7.6, LOW_COVER / 2, GARAGE_BACK_Z + 1.4], [2.8, LOW_COVER, 0.9], m.interior);
}

/**
 * The moving truck, centred on the world origin in the cul-de-sac turning head.
 * OPEN cover in the reference's sense: a deck you can stand on, a roof over
 * you, and one mouth at the -x end you walk in through. The 2x-damage core
 * sits above its cargo-box roof.
 *
 * The cab is CLOSED: a solid body, which is what the reference's minimap draws
 * and what makes the truck cover from one side and a room from the other.
 */
function truck(builder: Builder, m: Nuketown2Materials): void {
  const t = NUKETOWN2_CENTRAL_TRUCK;
  const W = t.width;
  const T = 0.15;
  const boxHalf = t.boxLength / 2;
  const flank = W / 2 - T / 2;

  // Cab, solid closed cover, on the +x end.
  streetVehicle(builder, 'truck cab', [t.cabX, t.cabRoofY / 2, 0], [t.cabLength, t.cabRoofY, W], m.truckCab);
  // Cargo box: deck, bulkhead against the cab, two flanks and a roof. The -x
  // end is OPEN, which is the mouth.
  streetVehicle(builder, 'truck deck', [0, t.deckY - T / 2, 0], [t.boxLength, T, W], m.truckBox, { cast: false });
  streetVehicle(builder, 'truck box bulkhead', [boxHalf - T / 2, (t.deckY + t.roofY) / 2, 0],
    [T, t.roofY - t.deckY, W], m.truckBox);
  for (const [index, side] of [-1, 1].entries()) {
    streetVehicle(builder, `truck box flank ${index}`, [0, (t.deckY + t.roofY) / 2, side * flank],
      [t.boxLength, t.roofY - t.deckY, T], m.truckBox);
  }
  streetVehicle(builder, 'truck box roof', [0, t.roofY - T / 2, 0], [t.boxLength, T, W], m.truckBox);
  for (const [index, x] of [-boxHalf + 1.1, boxHalf + 1.0, t.cabX + 1.8].entries()) {
    streetVehicle(builder, `truck wheel ${index}`, [x, 0.42, 0], [0.9, 0.84, W + 0.2], m.rubber,
      { solid: false, shots: false, cast: false });
  }

  // ROOF ACCESS. See TRUCK_ROOF_STEPS: the 2x-damage core rides this roof, and
  // a roof nothing can climb is a feature that does not exist.
  for (const [index, [top, x0, x1]] of TRUCK_ROOF_STEPS.entries()) {
    streetVehicle(builder, `truck roof step ${index}`, [(x0 + x1) / 2, top / 2, (W / 2 + 2.45) / 2],
      [x1 - x0, top, 2.45 - W / 2], m.block);
  }
}

/**
 * The retro coach across the turning head. CLOSED: one solid body, a roof cap
 * and a window band that is trim rather than a hole, because on the reference's
 * minimap this vehicle is hatched end to end and its first-party preview still
 * shows a sealed streamlined body.
 */
function coach(builder: Builder, m: Nuketown2Materials): void {
  const c = NUKETOWN2_STREET_COACH;
  const bodyH = c.height - 0.2;
  streetVehicle(builder, 'coach body', [c.x, bodyH / 2, c.z], [c.length, bodyH, c.width], m.busShell);
  streetVehicle(builder, 'coach roof cap', [c.x, c.height - 0.1, c.z], [c.length - 0.4, 0.2, c.width - 0.2], m.busShell);
  // HF-426 Job 3 - THE COACH IS THE MAP'S LANDMARK, so it is dressed on both
  // flanks rather than one. A cream box with a single band down one side reads
  // as a crate from the half of the map that cannot see that side; the
  // reference's coach is a cream body with a RED WAISTLINE and a continuous
  // window band, and it is the only saturated body left on this map now the
  // truck is a plain van. Four decals replace the one previous band; all four
  // are named `nuketown2 street-vehicle ...` and all four are added to the
  // enumerated asymmetric list in nuketown2-fidelity.test.ts with this reason.
  // Presentation only: no collider, no shot surface, no shadow - the coach's
  // solid body underneath is unchanged, so cover and ballistics do not move.
  for (const [index, side] of [-1, 1].entries()) {
    streetVehicle(builder, `coach waist stripe ${index}`, [c.x, 1.35, c.z + side * c.width / 2],
      [c.length - 0.6, 0.5, 0.08], m.busTrim, { solid: false, shots: false, cast: false });
    streetVehicle(builder, `coach window band ${index}`, [c.x, 2.25, c.z + side * c.width / 2],
      [c.length - 1.6, 0.8, 0.08], m.carGlass, { solid: false, shots: false, cast: false });
  }
  for (const [index, x] of [-2.9, 2.9].entries()) {
    streetVehicle(builder, `coach wheel ${index}`, [c.x + x, 0.42, c.z], [1.0, 0.84, c.width + 0.2], m.rubber,
      { solid: false, shots: false, cast: false });
  }

  // THE HEAD CAR, and why it exists. The reference's aerial of the turning head
  // shows the truck, the coach AND a couple of civilian cars standing in it, so
  // this body is the reference's own. It is authored here rather than in
  // `cars()` because it earns its place as the COACH'S COUNTERWEIGHT: the coach
  // is 9.1 x 2.6 m of hard cover entirely on the north half of the road, and
  // the truck sits on the centre-line rather than south of it (the 2x core
  // pins it there), so without this the south half of the carriageway carries
  // no street body at all and the north team owns the head. Solid, waist-high,
  // parked against the south kerb.
  streetVehicle(builder, 'head car body', [4.5, 0.72, 4.6], [4.4, 1.0, 1.9], m.carA);
  streetVehicle(builder, 'head car cabin', [4.3, 1.55, 4.6], [2.2, 0.66, 1.7], m.carGlass);
  for (const [index, dx] of [-1.5, 1.5].entries()) {
    for (const [side, dz] of [-1, 1].entries()) {
      streetVehicle(builder, `head car wheel ${index}${side}`, [4.5 + dx, 0.34, 4.6 + dz * 0.9],
        [0.68, 0.68, 0.3], m.rubber, { solid: false, shots: false, cast: false });
    }
  }
}

/**
 * One parked car per driveway apron, in front of its own garage door. CLOSED
 * cover in the reference's sense: a solid body you crouch behind and cannot get
 * inside. The long axis runs ACROSS the street, because a car on a driveway
 * points at the road.
 */
function cars(builder: Builder, m: Nuketown2Materials): void {
  const cx = (GARAGE_X0 + GARAGE_X1) / 2 + 0.5;   // 7.25, centred on the door
  const cz = GARAGE_FRONT_Z + 3.4;                // 3.4 m out onto the apron
  pair(builder, 'car body', [cx, 0.72, cz], [1.9, 1.0, 4.4], m.carA);
  pair(builder, 'car cabin', [cx, 1.55, cz - 0.2], [1.7, 0.66, 2.2], m.carGlass);
  for (const [index, dz] of [-1.5, 1.5].entries()) {
    for (const [side, dx] of [-1, 1].entries()) {
      pair(builder, `car wheel ${index}${side}`, [cx + dx * 0.9, 0.34, cz + dz], [0.3, 0.68, 0.68], m.rubber,
        { solid: false, shots: false, cast: false });
    }
  }
}

/**
 * The paired ground-dressing rectangles, in plan. EXPORTED so the fidelity gate
 * can check them against the building footprints, because nothing else can:
 * these pieces are presentation-only, `batchPresentationOnlyBoxes` merges them
 * into one mesh, and no collider or parity gate ever looks at a decal.
 *
 * That blind spot is not hypothetical. An early cut ran the front lawn from
 * x = -4, which laid 38.4 m2 of green lawn INSIDE each house's front room, 20 mm
 * proud of the interior floor, and every gate in the repository stayed green.
 */
export const NUKETOWN2_GROUND_DRESSING = Object.freeze([
  // Driveway apron: garage door out to the turning head.
  Object.freeze({ id: 'street driveway', material: 'drive' as const, x0: GARAGE_X0, x1: GARAGE_X1, z0: GARAGE_FRONT_Z, z1: -TURNING_HEAD_HALF }),
  // Front lawn: the strip between the house front and the turning head.
  Object.freeze({ id: 'street lawn front', material: 'lawn' as const, x0: HOUSE_X0, x1: HOUSE_X1, z0: HOUSE_FRONT_Z, z1: -TURNING_HEAD_HALF }),
  // The verge either side of the head, running out to the map edge.
  Object.freeze({ id: 'street lawn west', material: 'lawn' as const, x0: NUKETOWN2_BOUNDS.minX, x1: HOUSE_X0, z0: HOUSE_FRONT_Z, z1: KERB_Z }),
  Object.freeze({ id: 'street lawn east', material: 'lawn' as const, x0: GARAGE_X1, x1: NUKETOWN2_BOUNDS.maxX, z0: HOUSE_FRONT_Z, z1: KERB_Z }),
  // Back yard lawn: the whole strip between the house back wall and the fence.
  Object.freeze({ id: 'yard lawn', material: 'lawn' as const, x0: NUKETOWN2_BOUNDS.minX, x1: NUKETOWN2_BOUNDS.maxX, z0: YARD_FENCE_Z, z1: HOUSE_BACK_Z }),
  // Border path outside the fence.
  Object.freeze({ id: 'border path', material: 'drive' as const, x0: NUKETOWN2_BOUNDS.minX, x1: NUKETOWN2_BOUNDS.maxX, z0: NUKETOWN2_BOUNDS.minZ, z1: YARD_FENCE_Z }),
]);

/**
 * The building footprints in plan, EXPORTED for the same reason: the gate that
 * checks ground dressing needs something to check it against, and re-typing
 * these numbers in the test is how the shipped map's rare-gun sites came to
 * describe a house that had moved.
 */
export const NUKETOWN2_BUILDING_FOOTPRINTS = Object.freeze([
  Object.freeze({ id: 'house', x0: HOUSE_X0, x1: HOUSE_X1, z0: HOUSE_BACK_Z, z1: HOUSE_FRONT_Z }),
  Object.freeze({ id: 'garage', x0: GARAGE_X0, x1: GARAGE_X1, z0: GARAGE_BACK_Z, z1: GARAGE_FRONT_Z }),
]);

/**
 * The road surface, kerbs, turning head, driveway aprons and lawns.
 *
 * GROUND DRESSING IS PRESENTATION-ONLY, and that is a decision with a
 * measurement behind it. Asphalt, aprons and lawns are 20 mm proud of the solid
 * 200 x 200 m ground slab, purely so they do not z-fight it; they are decals,
 * and AGENTS.md allows exactly that ("tiny grass, decals ... may remain
 * non-solid"). Left solid they add a collider spanning y [-0.12, 0.02] over the
 * whole yard, which is enough to make the destructible-shed registry's
 * off-static-collision check report a shed standing on the lawn as a shed
 * standing INSIDE something. Movement and shot authority are unchanged: the
 * ground slab underneath is solid and shot-rated, and the collider/visual
 * parity audit still measures 0 walk-through meshes.
 */
function street(builder: Builder, m: Nuketown2Materials): void {
  const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
  const decal = { solid: false, shots: false, cast: false } as const;
  centred(builder, 'street asphalt', [0, -0.06, 0], [width, 0.12, NUKETOWN2_STREET_HALF_WIDTH * 2],
    m.asphalt, decal);
  // The cul-de-sac turning head: the reference's road does not run through, it
  // opens out. 16 m across, which is 0.44 L against the 0.45 L the minimap's
  // head measures.
  centred(builder, 'street turning head', [0, -0.055, 0], [TURNING_HEAD_HALF * 2, 0.12, TURNING_HEAD_HALF * 2],
    m.asphalt, decal);
  // Kerb: a 0.12 m lip, under the 0.42 m autostep, so it reads without ever
  // being a wall. Two runs per side, because the turning head interrupts it.
  for (const [index, span] of [[NUKETOWN2_BOUNDS.minX, -TURNING_HEAD_HALF], [TURNING_HEAD_HALF, NUKETOWN2_BOUNDS.maxX]].entries()) {
    pair(builder, `street kerb ${index}`, [(span[0]! + span[1]!) / 2, 0.06, KERB_Z + 0.15],
      [span[1]! - span[0]!, 0.24, 0.3], m.kerb, { cast: false });
  }
  // Centre line, as dash runs on the approach either side of the head.
  for (let i = 0; i < 3; i += 1) {
    pair(builder, `street dash ${i}`, [-(TURNING_HEAD_HALF + 1.6 + i * 3.2), 0.01, 0], [2.0, 0.04, 0.16], m.trim, decal);
  }
  for (const piece of NUKETOWN2_GROUND_DRESSING) {
    pair(builder, piece.id, [(piece.x0 + piece.x1) / 2, -0.05, (piece.z0 + piece.z1) / 2],
      [piece.x1 - piece.x0, 0.14, piece.z1 - piece.z0], m[piece.material], decal);
  }
}

/**
 * The front verge: what stands between the kerb and each house's front wall.
 * The reference's letterboxes sit out here (they carry the two characters'
 * names), and the driveway is edged rather than open, so crossing the last 4 m
 * to a front door is not a walk across a blank apron.
 */
function verge(builder: Builder, m: Nuketown2Materials): void {
  // Letterbox at the end of each drive: the reference's own kerb prop.
  pair(builder, 'verge mailbox post', [GARAGE_X1 + 0.6, 0.6, KERB_Z - 1.2], [0.16, 1.2, 0.16], m.trim);
  pair(builder, 'verge mailbox', [GARAGE_X1 + 0.6, 1.35, KERB_Z - 1.2], [0.32, 0.3, 0.5], m.sign);
  // Driveway edging, on the OUTBOARD side of the apron: low, so it reads from
  // above and never stops a stride. Outboard, because x = GARAGE_X0 - 0.4 puts
  // it inside the house's own east wall run.
  pair(builder, 'verge drive edge', [GARAGE_X1 + 0.4, 0.15, GARAGE_FRONT_Z + 4.0], [0.3, 0.3, 8.0], m.kerb, { cast: false });
  // Hedge along the front of each house's lawn: crouch cover for the last
  // stride out of the front door. LOW_COVER rather than HARD_COVER, and stopped
  // 0.85 m short of the front door reveal, so it never becomes a wall across
  // either the doorway or the two ground-floor windows above it.
  pair(builder, 'verge front hedge', [-4.7, LOW_COVER / 2, HOUSE_FRONT_Z + 1.4], [3.9, LOW_COVER, 0.9], m.planter);
  // Planter on the outer verge, out past the garage.
  pair(builder, 'verge planter', [13.5, LOW_COVER / 2, KERB_Z - 2.2], [3.6, LOW_COVER, 2.0], m.planter);
  // The town sign at the far end of each verge: two posts and a board, the one
  // authored landmark that tells you which end you are looking at.
  for (const [index, dx] of [-1.4, 1.4].entries()) {
    pair(builder, `verge sign post ${index}`, [-14.0 + dx, 1.9, KERB_Z - 2.6], [0.28, 3.8, 0.28], m.trim);
  }
  pair(builder, 'verge sign board', [-14.0, 4.3, KERB_Z - 2.6], [3.6, 1.8, 0.3], m.sign);
}

/**
 * Back yard: the spawn side. A fence line to the border path with the
 * reference's own gaps in it, a porch step off the back door, and low cover so
 * a spawn is not a shooting gallery.
 *
 * THE GAPS ARE THE REFERENCE'S. Activision's guide says the RC-XD fits through
 * holes in the fence on either side of the map, and that they lead to a path
 * that curves round to the opposite yard - which is exactly what the border
 * path outside this fence is. Three runs, so there are two gaps.
 *
 * THE GAPS ARE DELIBERATELY OFF-AXIS FROM THEIR OWN ROTATIONAL PARTNERS.
 * `pair()` negates x, so a gap at (a, b) on the north fence puts its partner at
 * (-b, -a) on the south one. Authored symmetric about x = 0 the two pairs of
 * gaps LINE UP, and the arena measured an 82.0 m clear standing lane running
 * the whole 84 m depth of the map through both of them at x = -10: a
 * spawn-to-spawn sniper lane, straight through two fences that were supposed to
 * be the flank. These four spans are chosen so that no x is in a north gap AND
 * a south gap at once - north gaps (-12.5, -9.5) and (4.5, 7.5), south gaps
 * (9.5, 12.5) and (-7.5, -4.5) - so every straight line from one border path to
 * the other has to cross a fence.
 */
function yard(builder: Builder, m: Nuketown2Materials): void {
  const fz = YARD_FENCE_Z + 0.125;
  const runs: [number, number][] = [[-18, -12.5], [-9.5, 4.5], [7.5, 18]];
  runs.forEach((run, index) => {
    pair(builder, `yard fence run ${index}`, [(run[0] + run[1]) / 2, HARD_COVER / 2, fz],
      [run[1] - run[0], HARD_COVER, 0.25], m.fence);
  });
  // Porch step under the back door, so leaving the house is a walk not a drop.
  pair(builder, 'yard porch', [-1.25, 0.1, HOUSE_BACK_Z - 0.9], [2.6, 0.2, 1.8], m.drive, { cast: false });
  // Cover in the deep yard, between the spawn line and the house.
  pair(builder, 'yard cover crate', [-8.5, LOW_COVER / 2, HOUSE_BACK_Z - 4.5], [2.4, LOW_COVER, 2.0], m.planter);
  pair(builder, 'yard cover wall', [5.5, HARD_COVER / 2, HOUSE_BACK_Z - 5.5], [7.0, HARD_COVER, 0.35], m.block);
  pair(builder, 'yard patio table', [-14.5, LOW_COVER / 2, -31.5], [2.2, LOW_COVER, 2.2], m.planter);
  // SIDE-ALLEY BODIES. The reference's outer lots are not empty: its own
  // minimap draws hatched props along both long boundaries, and they are what
  // stops the flank lane being a spawn-to-spawn sniper alley. Without these two
  // the arena measured a 76.2 m clear standing lane up the west alley, on a map
  // whose whole diagonal is 91.4 m. The store sits in the FRONT half of the
  // alley beside the house and the planter in the deep yard, so the flank is
  // broken twice on the way through rather than once.
  // Both run from the perimeter wall's inner face (x = -17.6) inward, because
  // a prop that stops short of the wall just moves the lane to the wall: with
  // the store at x [-15.5, -10.5] the worst lane became a 70.0 m run straight
  // up x = -17. The reference draws its own flank props ON the boundary line.
  pair(builder, 'yard side store', [-14.6, HARD_COVER / 2, -14.0], [6.0, HARD_COVER, 2.6], m.block);
  pair(builder, 'yard alley planter', [-15.6, HARD_COVER / 2, -33.0], [4.0, HARD_COVER, 2.0], m.planter);
  // HF-432 item 2 - THE OTHER FLANK. `pair()` negates x AND z, so the store
  // above and its partner both land on the WEST flank of one half and the EAST
  // flank of the other: every team had one dressed flank and one bare one, and
  // the bare one measured 114 m2 of empty ground beside the house carrying the
  // map's worst standing lane (46.0 m up x = 17, from the border path to the
  // far verge). The reference draws hatched props along BOTH long boundaries
  // (schematic 5.4 and the yard note above), so both get one. Authored on the
  // perimeter wall's inner face for the reason the west store already records:
  // a prop that stops short of the wall just moves the lane to the wall.
  pair(builder, 'yard far store', [14.6, HARD_COVER / 2, -14.0], [6.0, HARD_COVER, 2.6], m.block);
  // ...and the same asymmetry inside the yard itself: west of x = 0 the yard
  // carried the crate, the water butt, the patio table, the alley planter and
  // the destructible shed; east of x = 9 it carried nothing at all across
  // 9 x 13 m of spawn ground. One waist-high body, in reach of the (12, -30)
  // spawn, which measured the yard's longest walk to cover.
  pair(builder, 'yard far crate', [11.5, LOW_COVER / 2, -28.0], [2.6, LOW_COVER, 2.2], m.planter);
  // THE BORDER PATH. The reference's fence holes lead to a path that curves
  // round to the opposite yard, and this arena's border path is the straight
  // 36 x 6 m version of it - which was authored with NO cover at all, so the
  // flank route was a 36 m corridor with a spawn at each end of the map behind
  // it. Two hard bodies per path, off-axis from each other so the two paths do
  // not line up through the fence gaps.
  pair(builder, 'path buttress west', [-3.0, HARD_COVER / 2, -40.0], [3.0, HARD_COVER, 2.0], m.block);
  pair(builder, 'path buttress east', [10.0, HARD_COVER / 2, -40.0], [3.0, HARD_COVER, 2.0], m.block);
  // Water butt beside the shed placement. x = -8.5 is NOT arbitrary: the shed
  // at (-14, -24.5) with yaw pi/2 occupies x [-16.1, -11.9] and z [-26.3,
  // -22.7] (destructible-shed-registry.ts, shedPlacementFootprint), so the butt
  // stands 2.8 m clear of its east wall instead of inside it. The shed sits
  // that far forward in the yard because the registry gate requires 5.5 m of
  // clearance from every spawn and the spawn line is at |z| = 30-32.
  pair(builder, 'yard butt', [-8.5, LOW_COVER, -26], [1.2, LOW_COVER * 2, 1.2], m.block);
}

/** The perimeter: a 3.2 m wall on all four sides, just inside the bounds. */
function perimeter(builder: Builder, m: Nuketown2Materials): void {
  const H = 3.2;
  const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
  const depth = NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ;
  // HF-426 Job 3: TIMBER, not block. The shipped map closes its lots with a
  // plank fence and this arena closed them with a 3.2 m concrete compound wall,
  // which is what the first Job 3 yard captures actually show - a pale slab
  // running the whole length of both yards, the largest single surface in
  // either frame and the wrong material in a suburb. Same wall, same cover,
  // same collider; only the paint moved.
  pair(builder, 'perimeter wall long', [0, H / 2, NUKETOWN2_BOUNDS.minZ + 0.2], [width, H, 0.4], m.fence);
  pair(builder, 'perimeter wall end', [NUKETOWN2_BOUNDS.minX + 0.2, H / 2, 0], [0.4, H, depth], m.fence);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildNuketown2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Nuketown2 arena');
  const m = nuketown2Materials();

  // Ground runs well past the fence so the horizon is continuous scrub rather
  // than an 84 m slab in a void. One draw call either way.
  //
  // HF-426 Job 3: 220 -> 270 m. The mountain ring's outer radius is 132 m, and
  // at 220 the slab stopped at 110 - INSIDE the main ridge's own 100..132 band,
  // so the massif would have stood half on the plain and half on nothing. 270
  // puts the plain's edge 3 m past the ridge's outer foot, where the massif
  // itself hides it. This slab is also why the rebuild takes the backdrop's
  // rings WITHOUT its rolling ground skirt: it already has ground out there.
  centred(builder, 'ground', [0, -0.7, 0], [270, 1.4, 270], m.ground, { cast: false });
  // Everything after this index is a real solid on the map. The ground slab is
  // a 220 x 220 m collider - the world floor - and any keep-out set that
  // includes it rejects the entire arena, which is exactly what a first cut of
  // the lawn field did (8 regions, 0 blades, no error anywhere).
  const groundColliderCount = builder.colliders.length;

  street(builder, m);
  house(builder, m);
  garage(builder, m);
  verge(builder, m);
  yard(builder, m);
  perimeter(builder, m);
  truck(builder, m);
  coach(builder, m);
  cars(builder, m);

  batchPresentationOnlyBoxes(builder.root, 'nuketown2-presentation');

  // ---- HF-426 JOB 3: the shipped map's LAWN, on this map's own rectangles --
  // Built HERE, after every prop, because `builder.colliders` is the keep-out
  // truth and it is complete exactly now. The shipped map's lawn has to carry
  // a hand-mirrored prop table plus a containment test to stop that table
  // drifting from map.ts; this one cannot drift, because it reads the colliders
  // the arena just emitted. Added AFTER the presentation batcher on purpose -
  // the field is InstancedMesh, which that batcher does not take, and a Group
  // is not a candidate for it either.
  const lawn = buildNuketownRebuildLawnField(builder.root, {
    dressing: NUKETOWN2_GROUND_DRESSING,
    keepOuts: builder.colliders.slice(groundColliderCount),
  });
  builder.root.userData.nuketown2LawnStats = lawn.stats;
  // legacy-main drives this through `updateArenaArt`, the same one uniform
  // write per frame the shipped map's lawn takes. The sway itself is GPU-side.
  builder.root.userData.nuketownLawnWind = (seconds: number) => lawn.advanceWind(seconds);
  // Owner 2026-08-30 breakable grass: gunfire and blasts flatten blades.
  builder.root.userData.nuketownLawnCrush = (x: number, z: number, radiusM: number) => lawn.crushAt(x, z, radiusM);

  // ---- ...and the FOREST RING and MOUNTAIN RING behind it -----------------
  // The same two modules the shipped map uses, re-fitted to this footprint
  // through their own envelopes (see NUKETOWN2_FOREST_ENVELOPE and
  // NUKETOWN2_BACKDROP_ENVELOPE). Art-only by construction on both counts: no
  // candidate is planted inside the bounds inflated by 3.2 m, and no ridge
  // vertex comes closer than 66 m to the origin against a 45.7 m map corner.
  // Dropping the shipped envelopes on this map unchanged would have put the
  // forest's inner radius (36.5 m) INSIDE the map along z and the foothill
  // feet 18 m off the long fence while leaving 46 m of bare plain on the short
  // one - a backdrop that is a wall on one axis and absent on the other.
  const forest = buildNuketownForestSurround(builder.root, NUKETOWN2_FOREST_ENVELOPE);
  const backdrop = buildNuketownMountainBackdrop(builder.root, NUKETOWN2_BACKDROP_ENVELOPE);
  builder.root.userData.nuketown2ForestStats = forest.stats;
  builder.root.userData.nuketown2BackdropStats = backdrop.stats;

  const t = NUKETOWN2_CENTRAL_TRUCK;
  const c = NUKETOWN2_STREET_COACH;

  return {
    id: 'nuketown2',
    label: 'Nuke Town Rebuild',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(
      NUKETOWN2_SPAWN_LAYOUT[0]!.map(([x, z]) => [x, z] as [number, number]),
      NUKETOWN2_SPAWN_LAYOUT[1]!.map(([x, z]) => [x, z] as [number, number]),
    ),
    // Patrol: both upper rooms are deliberately absent — bots use the ground
    // route — but every ground position that decides a round is here: the
    // turning head, both front verges, both houses, both garages, both back
    // yards and both border paths.
    patrolPoints: [
      [0, 0], [-10, 0], [10, 0],
      [-1.25, -16.5], [1.25, 16.5],
      [6.75, -19.5], [-6.75, 19.5],
      [-8, -12], [8, 12],
      [-10, -30], [10, 30],
      [10, -30], [-10, 30],
      [0, -39], [0, 39],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [
      {
        id: 'nuketown2-central-truck',
        bounds: {
          minX: -t.boxLength / 2, maxX: t.cabX + t.cabLength / 2,
          minZ: -t.width / 2, maxZ: t.width / 2,
          minY: 0, maxY: t.roofY,
        },
        blocksMovement: true,
        blocksShots: true,
      },
      {
        id: 'nuketown2-street-coach',
        bounds: {
          minX: c.x - c.length / 2, maxX: c.x + c.length / 2,
          minZ: c.z - c.width / 2, maxZ: c.z + c.width / 2,
          minY: 0, maxY: c.height,
        },
        blocksMovement: true as const,
        blocksShots: true as const,
      },
    ],
    bounds: { ...NUKETOWN2_BOUNDS },
    physicsSafetyFloorY: -0.35,
    // Measured on the plan above: two houses, two ground rooms and two upper
    // rooms each, a front and a back door each, two ground windows plus a front
    // and a back upper window each, one stair each.
    houseTelemetry: {
      houses: 2,
      groundRooms: 4,
      upperRooms: 4,
      doors: 4,
      windows: 8,
      ramps: 2,
      wallMaterialVariants: 4,
      pbrMaterialFamilies: 5,
    },
  };
}
