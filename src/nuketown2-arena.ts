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
 * WHERE THE TRUCK STANDS, AND WHAT USED TO PIN IT. The reference's truck sits
 * about 0.076 of the street length SOUTH of the road centre-line, and until
 * HF-432 this one sat ON the centre-line, because `OVERDRIVE_POSITION` in
 * `src/overdrive.ts` was a single global `{0, 3.75, 0}` and the 2x-damage core
 * could only ride a truck standing at the world origin. That was recorded as a
 * knowingly-taken deviation rather than hidden, and HF-432 item 5 removed the
 * cause: the core is per-arena (`overdrivePositionForArena`) and this arena's
 * seat is DERIVED from `NUKETOWN2_CENTRAL_TRUCK`, so the truck is where the
 * reference has it and the core went with it. The shipped Nuke Town's seat is
 * unchanged. The core still FIXES the box's deck and roof heights and forces a
 * climb onto the roof; both are derived at `NUKETOWN2_CENTRAL_TRUCK` (now in
 * `./nuketown2-layout`, so the weapons layer can read it without closing a
 * require cycle through `protocol.ts`) and `TRUCK_ROOF_STEPS` below.
 *
 * TWO FRAMES, AND WHICH EXPORT IS IN WHICH (HF-473, owner 2026-09-04).
 * Every number written in this file is in the AUTHORED frame - the frame the
 * HF-426 re-proportioning was measured in, where the north house's garage is
 * on the +x end of its house. The WORLD is that frame mirrored on x by
 * `NUKETOWN2_HANDEDNESS` (see `./nuketown2-layout` for why, and for the owner
 * observation that settled it). The mirror is applied in exactly four places -
 * `pair()`, `centred()`, `streetVehicle()` and the two stair-ramp `box()`
 * calls - which are the only paths from an authored number to a solid, so a
 * half-mirror is structurally impossible rather than merely tested for.
 *
 *   AUTHORED exports (the gate converts with `nuketown2HandedX`, which is
 *   where the handedness has to be proved anyway): NUKETOWN2_DOORWAYS,
 *   NUKETOWN2_WINDOWS, NUKETOWN2_HOUSE_STAIR, NUKETOWN2_STAIRWELL,
 *   NUKETOWN2_SECTION, NUKETOWN2_BUILDING_FOOTPRINTS,
 *   NUKETOWN2_GROUND_DRESSING, NUKETOWN2_BALCONY, NUKETOWN2_YARD_STAIR,
 *   NUKETOWN2_WINDOW_LEDGE, NUKETOWN2_PORCH_CANOPY, NUKETOWN2_HOUSE_LAYOUT,
 *   NUKETOWN2_CENTRAL_TRUCK, NUKETOWN2_STREET_COACH.
 *   WORLD exports (production code reads them and cannot be asked to convert):
 *   NUKETOWN2_SPAWN_LAYOUT, NUKETOWN2_RARE_GUN_SITES, and every field of the
 *   `ArenaMap` `buildNuketown2()` returns.
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
} from './additional-maps';
import type { ArenaMap } from './map';
import {
  NUKETOWN2_FOREST_ENVELOPE,
  buildNuketownForestSurround,
} from './nuketown-forest-surround';
import { type NuketownGroundDressingPiece, buildNuketownRebuildLawnField } from './nuketown-lawn-field';
import { buildNuketown2Vegetation } from './nuketown2-vegetation';
import {
  createNuketown2GrimeMaterials,
  nuketown2GrimeDecals,
} from './nuketown2-grime-decals';
import {
  createNuketown2YardPropMaterials,
  nuketown2YardPropSolids,
} from './nuketown2-yard-props';
import {
  NUKETOWN2_BACKDROP_ENVELOPE,
  buildNuketownMountainBackdrop,
} from './nuketown-mountain-backdrop';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  NUKETOWN2_CENTRAL_TRUCK,
  NUKETOWN2_CUL_DE_SAC,
  NUKETOWN2_FLOOR_T,
  NUKETOWN2_FRONT_VERGE_DEPTH,
  NUKETOWN2_GROUND_FLOOR_T,
  NUKETOWN2_GROUND_FLOOR_TOP,
  NUKETOWN2_GROUND_STOREY_H,
  NUKETOWN2_HANDEDNESS,
  NUKETOWN2_HOUSE_DEPTH,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_STREET_CARS,
  NUKETOWN2_STREET_COACH,
  NUKETOWN2_STREET_HALF_WIDTH,
  NUKETOWN2_STREET_LENGTH,
  NUKETOWN2_TURNING_HEAD_HALF,
  NUKETOWN2_UPPER_Y0,
  nuketown2HandedSpan,
  nuketown2HandedX,
} from './nuketown2-layout';
// PASS 94 materials lane. The arena no longer names a material family: it
// asks `src/nuketown2-materials` for a ROLE and gets whatever family currently
// answers it. Everything about how a surface is authored - three-scale wear,
// the 10% albedo-visible-wear floor, the combat-readability darkening ceiling
// - lives there, so re-authoring a surface is a change to that directory and
// nothing else. Base colours and the HF-434 polygonOffset tiers are carried
// over verbatim inside the registry.
import { createNuketown2MaterialRegistry } from './nuketown2-materials';
import {
  createNuketown2CeilingLightMaterial,
  createNuketown2DrywallMaterial,
  createNuketown2GarageFloorMaterial,
  createNuketown2GlassMaterial,
  createNuketown2WoodFloorMaterial,
} from './nuketown2-interior-materials';
// PASS 94 lane TECHNIQUES: the pool surface moved to its own module.
import { createNuketown2PoolWaterMaterial } from './nuketown2-pool-water';
import {
  type ForgedVehicle,
  COACH_SPEC,
  SEDAN_SPEC,
  TRUCK_CAB_SPEC,
  buildForgedVehicle,
  buildForgedWheelSet,
  createForgeMaterialSet,
  createForgeSharedMaterials,
  mergeForgedPlacements,
} from './vehicle-forge';
import {
  createNuketown2CarPaintMaterial,
  createNuketown2ChromeMaterial,
  createNuketown2CoachMaterial,
  createNuketown2HeadlightMaterial,
  createNuketown2TaillightMaterial,
  createNuketown2TireMaterial,
  createNuketown2TruckBoxMaterial,
  createNuketown2TruckCabMaterial,
  createNuketown2VehicleGlassMaterial,
} from './nuketown2-vehicle-materials';

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
  NUKETOWN2_APPLIANCE_BLUE,
  NUKETOWN2_BOUNDS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  NUKETOWN2_CENTRAL_TRUCK,
  NUKETOWN2_CUL_DE_SAC,
  NUKETOWN2_STREET_CARS,
  NUKETOWN2_STREET_COACH,
  NUKETOWN2_STREET_HALF_WIDTH,
  NUKETOWN2_STREET_LENGTH,
  NUKETOWN2_TURNING_HEAD_HALF,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_RARE_GUN_SITES,
  NUKETOWN2_HANDEDNESS,
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
const GROUND_FLOOR_T = NUKETOWN2_GROUND_FLOOR_T;
const GROUND_FLOOR_TOP = NUKETOWN2_GROUND_FLOOR_TOP;
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
  /** The smooth ramp rises from the raised slab to the upper slab over 11 authored rise bands. */
  riser: (UPPER_Y0 - GROUND_FLOOR_TOP) / 11,
  /** 0.42 m: over the 0.22 m Rapier autostep minimum width, under the 6.05 m the room has. */
  going: 0.42,
  /** 11 rise bands span the raised ground-floor slab to the upper floor. */
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
const STAIR_MAX_FEET_UNDER_CEILING = GROUND_H - GROUND_FLOOR_TOP - STANDING_CAPSULE_M - AUTOSTEP_M;
const STAIR_FIRST_UNCOVERED_TREAD = Math.floor(STAIR_MAX_FEET_UNDER_CEILING / NUKETOWN2_HOUSE_STAIR.riser);
const STAIRWELL_Z0 = STAIR_FOOT_Z
  + NUKETOWN2_HOUSE_STAIR.going * STAIR_FIRST_UNCOVERED_TREAD
  - STANDING_RADIUS_M - 0.12;

/** Small plan overlap at both ends keeps the capsule from catching a seam. */
const STAIR_RAMP_LANDING_OVERLAP = 0.12;
const STAIR_RAMP_START_Z = STAIR_FOOT_Z - STAIR_RAMP_LANDING_OVERLAP;
const STAIR_LANDING_START_Z = STAIR_HEAD_Z - NUKETOWN2_HOUSE_STAIR.landingDepth;
const STAIR_RAMP_END_Z = STAIR_LANDING_START_Z + STAIR_RAMP_LANDING_OVERLAP;
const STAIR_RAMP_RUN = STAIR_RAMP_END_Z - STAIR_RAMP_START_Z;
const STAIR_RAMP_RISE = UPPER_Y0 - GROUND_FLOOR_TOP;
const STAIR_RAMP_ANGLE = Math.atan2(STAIR_RAMP_RISE, STAIR_RAMP_RUN);
const STAIR_RAMP_THICKNESS = 0.16;

/**
 * HF-435: the derived stair-well geometry, EXPORTED so the fidelity gate can
 * assert headroom over every tread from the numbers the build itself used -
 * the same builder-and-gate-read-one-table rule as NUKETOWN2_DOORWAYS.
 */
export const NUKETOWN2_STAIRWELL = Object.freeze({
  footZ: STAIR_FOOT_Z,
  headZ: STAIR_HEAD_Z,
  wellZ0: STAIRWELL_Z0,
  rampStartZ: STAIR_RAMP_START_Z,
  rampEndZ: STAIR_RAMP_END_Z,
  rampBottomY: GROUND_FLOOR_TOP,
  rampTopY: UPPER_Y0,
  rampRun: STAIR_RAMP_RUN,
  rampRise: STAIR_RAMP_RISE,
  rampAngleRadians: STAIR_RAMP_ANGLE,
  landingOverlap: STAIR_RAMP_LANDING_OVERLAP,
  rampThickness: STAIR_RAMP_THICKNESS,
});

/**
 * DOORWAYS - HF-432 item 4, owner after PASS 90: "Doors are too small
 * shouldn't have to crouch."
 *
 * WHAT WAS ACTUALLY MEASURED, before anything moved, on the built colliders:
 *
 *   house front door        clear height 2.20 m   clear width 1.38 m
 *   house back door         2.20 m                1.58 m
 *   house internal door     3.00 m                1.58 m
 *   house/garage link       2.60 m                1.80 m
 *   garage vehicle door     2.60 m                3.48 m
 *   garage rear door        2.60 m                1.58 m
 *
 * ...and a map-wide sweep of every ground cell at 0.20 m, comparing the
 * STANDING capsule (1.82 m) against the CROUCHED one (1.16 m) at a single
 * radius so only height differences count, found 20 crouch-only cells on the
 * whole arena - all 20 of them under the two verge letterbox heads, which are
 * 0.32 x 0.50 m lids on 0.16 m posts.
 *
 * So NO DOOR ON THIS MAP EVER REQUIRED A CROUCH: the tightest was 2.20 m
 * against a 1.82 m capsule. The owner's report is real, and it is about WIDTH.
 * A 1.38 m opening leaves 0.62 m of free width for a 0.76 m-wide capsule
 * whose controller carries a 0.025 m skin, so the front door caught the
 * shoulder on almost every entry, and catching on a door frame at a run is
 * exactly what "too small, shouldn't have to crouch" feels like.
 *
 * THE BAND, derived rather than picked. Width 1.8 m = the standing capsule's
 * own diameter twice over plus a body's width of slack, which is what makes a
 * doorway a route two players can use rather than a queue. Head 2.4 m = the
 * capsule (1.82) plus the autostep up-cast (0.42) plus 0.16 m, so that a
 * player stepping onto the porch, the kerb or a tread IN a doorway still
 * clears - the same failure mode STAIRWELL_Z0 records. Both are checked, as
 * measurements on the built colliders, in `nuketown2-fidelity.test.ts`, along
 * with a standing capsule that WALKS through every one of them.
 */
const DOOR_WIDTH = 1.8;
const DOOR_HEAD_Y = 2.4;
const HOUSE_CENTRE_X = NUKETOWN2_HOUSE_LAYOUT[0]!.x;
const GARAGE_CENTRE_X = (GARAGE_X0 + GARAGE_X1) / 2;

/**
 * HF-435: EVERY window, ONCE - spans, sill tops and whether it carries a
 * ground-floor glass pane - so the builder and the gate cannot describe
 * different windows. Spans run along x; both houses use them (the south house
 * is `pair()`'s exact 180-degree image).
 *
 * Upper openings: sill top at floor + 0.9 (the reference's sill, S7) and NO
 * head band - the roof deck closes the head, so the opening is 2.0 m tall and
 * a standing capsule that hops the sill can cross and drop outside.
 */
const FRONT_WINDOW_A: [number, number] = [-5.6, -3.6];
const FRONT_WINDOW_B: [number, number] = [1.4, 3.4];
const UPPER_WINDOW: [number, number] = [-2.85, 0.35];
/**
 * HF-477 MOVED THIS WINDOW, and moving it is what let the deck go where the
 * reference has it. It stood at [-5.75, -3.25] - the NON-garage end of the back
 * wall - which is exactly the end `nt2025-street-boii.jpg` puts the rear deck
 * and its exterior stair on, and HF-465 recorded that collision honestly and
 * yielded the deck rather than the shipped window (see NUKETOWN2_BALCONY).
 * FINDINGS Q3 VERIFIES the deck's end on a BO2-2025 frame, so this pass yields
 * the other way: the window takes the exact 180-degree image of its old run
 * about the house's own centre line, [0.75, 3.25], which is the garage end.
 *
 *   mirror about cx = -1.25:  -5.75 -> 3.25,  -3.25 -> 0.75
 *
 * Nothing about the window changes except which end of the same wall it is in,
 * so its sill, its head, its drop-out exit and the HF-435 gate that walks a
 * capsule through it all measure the same opening.
 */
const BACK_UPPER_WINDOW: [number, number] = [0.75, 3.25];
/**
 * THE REAR BALCONY, ITS EXTERIOR FLIGHT, THE FRONT LEDGE AND THE PORCH CANOPY
 * - HF-465, and R4 section 5, which is the highest-value row on that lane's
 * list because it is the owner's own words AND it is stated first-party rather
 * than inferred from pixels.
 *
 * What the reference has, in three parts: an upper-floor rear balcony
 * overlooking the back yard with an EXTERIOR STAIRCASE down to the back lawn
 * (the second of the map's three routes upstairs); a small ledge protruding
 * just under the second-storey window on the street side; and the front window
 * as a real ENTRY, climbed from outside off objects. No source gives a
 * dimension, so every number below is DERIVED from this arena's own figures,
 * and the derivation - not the number - is the contract.
 *
 * The figures it is derived from, all already in this file: house width 11,
 * depth 13, UPPER_Y0 3.3, ROOF_Y0 6.2, HOUSE_BACK_Z -23, wall 0.3; standing
 * capsule 1.82, radius 0.38, autostep 0.42, jump apex 0.82 - so 1.24 m is the
 * most a player takes in one move, which is the ceiling every step of the
 * front climb chain is held under.
 */
const BALCONY_WIDTH = 4.4;             // 0.40 W: two capsules abreast plus a rail either side
const BALCONY_PROJECTION = 2.0;        // 0.18 W: 2.6 capsule diameters, so it is a route and not a Juliet
const BALCONY_SLAB_T = 0.2;            // soffit at 3.1, clear of a standing player below
const BALCONY_RAIL_H = 1.1;            // above LOW_COVER 0.95, under the 1.65 standing eye
const BALCONY_RAIL_T = 0.12;
const BALCONY_POST = 0.16;
/**
 * WHERE ALONG THE HOUSE - AND HF-477 MOVED IT TO THE OTHER END.
 *
 * WHAT IT WAS. HF-465 authored the deck between the upper back window's far
 * edge and the house's GARAGE-end corner, `(BACK_UPPER_WINDOW[1] + HOUSE_X1)/2`
 * = 0.5, and recorded exactly why: R4 section 5.1 wanted the deck at the
 * NON-garage end but the shipped `BACK_UPPER_WINDOW` was already there, and
 * the deck's outboard rail return standing 0.25 m off that window's centre
 * line stopped it being a drop-out exit - which the HF-435 gate caught on the
 * first run. With no image of the reference to appeal to, the NEW body yielded.
 *
 * WHAT SETTLED IT. `docs/references/nuketown-2025/FINDINGS.md` Q3 is VERIFIED
 * on `nt2025-street-boii.jpg`, a BO2-2025 frame: the wooden exterior stair
 * climbs from the back lawn to a railed deck "at the END of the house OPPOSITE
 * the garage, on the back-yard side", over a recessed ground-floor undercroft,
 * with a circular concrete patio at the foot of the flight. The same frame
 * shows the garage wing at the other end. So the deck is on the non-garage end
 * in the reference, and this arena had it on the garage end.
 *
 * THE FIX IS THE ONE HF-465 SAID IT COULD NOT MAKE, made possible by moving
 * the OTHER body: `BACK_UPPER_WINDOW` takes the exact mirror of its own run
 * about the house centre line (see its comment), which vacates the non-garage
 * end, and the deck takes the same construction on the end the window left:
 *
 *   BALCONY_CENTRE_X = (BACK_UPPER_WINDOW[0] + HOUSE_X0) / 2
 *
 * Both bodies keep every dimension they had and both are still emitted through
 * `pair()`; only which end of one wall each occupies changed, so the deck is
 * still clear of the window's opening by 4.4 m, still leaves 1.3 m of deck
 * either side of its doorway, still sits inside the house's own width (span
 * [-5.2, -0.8] against a house of [-6.75, 4.25]) - and now the exterior flight
 * runs off the NON-garage end, which is both R4's original constraint and what
 * the reference frame shows.
 */
const BALCONY_CENTRE_X = (BACK_UPPER_WINDOW[0] + HOUSE_X0) / 2;
const BALCONY_X0 = BALCONY_CENTRE_X - BALCONY_WIDTH / 2;
const BALCONY_Z_OUTBOARD = HOUSE_BACK_Z - BALCONY_PROJECTION;

export const NUKETOWN2_BALCONY = Object.freeze({
  centreX: BALCONY_CENTRE_X,
  width: BALCONY_WIDTH,
  projection: BALCONY_PROJECTION,
  /** Flush with the upper floor, so you walk OUT level rather than step down. */
  deckTop: NUKETOWN2_UPPER_Y0,
  slabThickness: BALCONY_SLAB_T,
  railHeight: BALCONY_RAIL_H,
  railThickness: BALCONY_RAIL_T,
  postSize: BALCONY_POST,
  outboardZ: BALCONY_Z_OUTBOARD,
});

/**
 * THE EXTERIOR FLIGHT, balcony to back lawn. It reuses the interior stair's
 * proven shape - a riser inside the 0.42 autostep, a going over Rapier's 0.22
 * minimum width, and one collision-only rotated slab owning movement while the
 * treads stay presentation - so it is walkable by construction and the
 * existing probe pattern covers it.
 *
 * 11 risers of exactly 0.30 span the 3.30 m to the upper floor. It runs
 * PARALLEL to the back wall, off the deck's NON-GARAGE end, in the 1.4 m of
 * the deck's depth nearest the house (see YARD_STAIR_Z for why that half and
 * not the other). Nothing is ever over it, so STAIR_MAX_FEET_UNDER_CEILING
 * cannot apply and the HF-432 wedging failure cannot recur, and the middle of
 * the yard stays open: a perpendicular flight would drive a 3.3 m ramp 4.2 m
 * into the yard and cut the spawn's own sightlines.
 */
const YARD_STAIR_RISERS = 11;
const YARD_STAIR_GOING = 0.42;
const YARD_STAIR_WIDTH = 1.4;
const YARD_STAIR_RUN = YARD_STAIR_GOING * (YARD_STAIR_RISERS - 1);
const YARD_STAIR_OVERLAP = 0.12;
const YARD_STAIR_TOP_X = BALCONY_X0;
const YARD_STAIR_FOOT_X = BALCONY_X0 - YARD_STAIR_RUN;
const YARD_STAIR_RAMP_RISE = NUKETOWN2_UPPER_Y0;
const YARD_STAIR_RAMP_RUN = YARD_STAIR_RUN + 2 * YARD_STAIR_OVERLAP;
const YARD_STAIR_RAMP_ANGLE = Math.atan2(YARD_STAIR_RAMP_RISE, YARD_STAIR_RAMP_RUN);
const YARD_STAIR_RAMP_T = 0.16;
/**
 * WHICH 1.4 m OF THE DECK'S 2.0 m DEPTH THE FLIGHT OCCUPIES: the half against
 * the house, not the outboard half. Run against the outboard edge the flight
 * lands ON the |z| = 25 spawn line - three of each team's six spawns sit on it
 * - and a player would have spawned under a 1.1 m ramp. Hugging the wall
 * leaves 0.6 m between the flight and that line, more than a standing radius,
 * and the deck's own end face is still the top landing.
 */
const YARD_STAIR_Z = HOUSE_BACK_Z - YARD_STAIR_WIDTH / 2;

export const NUKETOWN2_YARD_STAIR = Object.freeze({
  width: YARD_STAIR_WIDTH,
  riser: NUKETOWN2_UPPER_Y0 / YARD_STAIR_RISERS,
  going: YARD_STAIR_GOING,
  risers: YARD_STAIR_RISERS,
  topX: YARD_STAIR_TOP_X,
  footX: YARD_STAIR_FOOT_X,
  centreZ: YARD_STAIR_Z,
  rampAngleRadians: YARD_STAIR_RAMP_ANGLE,
  rampRise: YARD_STAIR_RAMP_RISE,
  rampRun: YARD_STAIR_RAMP_RUN,
  rampThickness: YARD_STAIR_RAMP_T,
});

/**
 * THE FRONT CLIMB CHAIN - R4 section 5.3. The ledge exists so the front window
 * becomes a TWO-WAY opening, which is what the reference has and what makes
 * the power position contestable instead of a sniper's box.
 *
 * Every step is inside the 1.24 m one-move ceiling AND stands directly over
 * the one below it in plan, which is the half R4's height table does not state
 * and a probe would otherwise fail on:
 *
 *   ground -> verge front hedge 0.95 -> porch canopy 2.15 -> window ledge 3.30
 *          -> upper window sill top 4.20
 *   gaps      0.95              1.20              1.15             0.90
 *
 * The hedge already exists (verge front hedge, top LOW_COVER); the canopy is
 * authored 4.0 m wide so it overlaps the hedge's own x run, and the ledge is
 * authored inside the canopy's footprint.
 */
const PORCH_CANOPY_TOP = 2.15;
const PORCH_CANOPY_T = 0.18;
/**
 * HF-477: 4.0 -> 6.6 m, AND THE TWO POSTS ARE GONE.
 *
 * FINDINGS Q3, VERIFIED on `nt2025-sniper-boii.jpg` and corroborated by the
 * house elevation in `nt2025-street-boii.jpg`: the reference's porch reads as
 * "a WIDE CANTILEVERED ROOF PLANE, not the 4.0 m x 1.8 m canopy on two posts
 * R4 specified", and it says in the same paragraph to "build it as a cantilever
 * off the house and keep posts only if the floating-geometry gate needs them."
 * It does not need them: the slab's inboard face is ON the house's front wall
 * plane (`canopyZ = HOUSE_FRONT_Z + projection / 2`), so it is supported
 * geometry, not an orphan - and the gate's own rule is that a body over 0.4 m
 * must be a NAMED structural element, which `porch` already is.
 *
 * 6.6 m is 0.60 of the 11 m house width, which is the proportion the reference
 * elevation reads at (the eave runs most of the frontage and stops short of
 * both corners). It still overlaps the front hedge's plan run [-6.65, -2.75] -
 * the rung the climb chain steps off - and it still contains the window
 * ledge's own footprint, so neither derived chain in this block moves.
 */
const PORCH_CANOPY_WIDTH = 6.6;
const PORCH_CANOPY_PROJECTION = 1.8;
/**
 * The balcony door's clear head. Set by leaving a 0.4 m header under the roof
 * deck rather than by copying DOOR_HEAD_Y: the upper storey is 2.9 m, so a
 * 0.4 m lintel gives 2.5 m of head - comfortably over the map's derived 2.4 m
 * band (capsule 1.82 + autostep up-cast 0.42 + 0.16) that every other opening
 * on this arena is held to.
 */
const BALCONY_DOOR_HEAD_Y = UPPER_H - 0.4;
const WINDOW_LEDGE_TOP = NUKETOWN2_UPPER_Y0;
const WINDOW_LEDGE_T = 0.2;
const WINDOW_LEDGE_PROJECTION = 0.5;

export const NUKETOWN2_PORCH_CANOPY = Object.freeze({
  top: PORCH_CANOPY_TOP,
  thickness: PORCH_CANOPY_T,
  width: PORCH_CANOPY_WIDTH,
  projection: PORCH_CANOPY_PROJECTION,
  centreX: HOUSE_CENTRE_X,
});

export const NUKETOWN2_WINDOW_LEDGE = Object.freeze({
  top: WINDOW_LEDGE_TOP,
  thickness: WINDOW_LEDGE_T,
  projection: WINDOW_LEDGE_PROJECTION,
  /** The upper window's own width plus 0.3 m of nosing either side. */
  width: (UPPER_WINDOW[1] - UPPER_WINDOW[0]) + 0.6,
  centreX: (UPPER_WINDOW[0] + UPPER_WINDOW[1]) / 2,
});


/**
 * Every opening a player walks through, ONCE, so the builder and the gate
 * cannot describe different doors. `span` is the axis the opening's width is
 * measured along, `centre` is its middle on that axis, and `at` is the CENTRE
 * PLANE of the leaf it is cut in - not the room line, because a probe on the
 * room line stands on the wall's outer face and measures nothing.
 */
export const NUKETOWN2_DOORWAYS = Object.freeze([
  Object.freeze({ id: 'house front door', span: 'x' as const, centre: HOUSE_CENTRE_X, at: HOUSE_FRONT_Z - WALL_T / 2, width: DOOR_WIDTH, headY: DOOR_HEAD_Y, floorY: 0 }),
  Object.freeze({ id: 'house back door', span: 'x' as const, centre: HOUSE_CENTRE_X, at: HOUSE_BACK_Z + WALL_T / 2, width: DOOR_WIDTH, headY: DOOR_HEAD_Y, floorY: 0 }),
  Object.freeze({ id: 'house internal door', span: 'x' as const, centre: -2.7, at: HOUSE_MID_Z, width: DOOR_WIDTH, headY: GROUND_H, floorY: 0 }),
  Object.freeze({ id: 'house garage link', span: 'z' as const, centre: -18.7, at: HOUSE_X1 - WALL_T / 2, width: DOOR_WIDTH, headY: GROUND_H - 0.4, floorY: 0 }),
  Object.freeze({ id: 'garage vehicle door', span: 'x' as const, centre: GARAGE_CENTRE_X, at: GARAGE_FRONT_Z - WALL_T / 2, width: 3.5, headY: 2.6, floorY: 0 }),
  Object.freeze({ id: 'garage rear door', span: 'x' as const, centre: GARAGE_CENTRE_X - 0.55, at: GARAGE_BACK_Z + WALL_T / 2, width: DOOR_WIDTH, headY: 2.6, floorY: 0 }),
  // HF-465 / R4 section 5.1: the door onto the rear balcony. The FIRST doorway
  // on this map that is not on the ground floor, which is why every row now
  // carries `floorY` - the gate measures head and shoulder from the floor the
  // door actually stands on, and reading 0 for this one would have measured
  // the ground-floor back door's lintel instead.
  Object.freeze({ id: 'house balcony door', span: 'x' as const, centre: BALCONY_CENTRE_X, at: HOUSE_BACK_Z + WALL_T / 2, width: DOOR_WIDTH, headY: BALCONY_DOOR_HEAD_Y, floorY: NUKETOWN2_UPPER_Y0 }),
]);

/** The [low, high] run a doorway occupies on its own span axis. */
function doorRun(id: string): [number, number] {
  const door = NUKETOWN2_DOORWAYS.find((entry) => entry.id === id)!;
  return [door.centre - door.width / 2, door.centre + door.width / 2];
}

export const NUKETOWN2_WINDOWS = Object.freeze([
  Object.freeze({ id: 'ground front west', pane: true as const, x0: FRONT_WINDOW_A[0], x1: FRONT_WINDOW_A[1], wallZ: HOUSE_FRONT_Z, sillTop: 1.0, headY: 2.1 }),
  Object.freeze({ id: 'ground front east', pane: true as const, x0: FRONT_WINDOW_B[0], x1: FRONT_WINDOW_B[1], wallZ: HOUSE_FRONT_Z, sillTop: 1.0, headY: 2.1 }),
  Object.freeze({ id: 'upper front', pane: false as const, x0: UPPER_WINDOW[0], x1: UPPER_WINDOW[1], wallZ: HOUSE_FRONT_Z, sillTop: NUKETOWN2_UPPER_Y0 + 0.9, headY: ROOF_Y0 }),
  Object.freeze({ id: 'upper back', pane: false as const, x0: BACK_UPPER_WINDOW[0], x1: BACK_UPPER_WINDOW[1], wallZ: HOUSE_BACK_Z, sillTop: NUKETOWN2_UPPER_Y0 + 0.9, headY: ROOF_Y0 }),
]);

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
 * The treads that make the truck roof - and therefore the 2x-damage core - a
 * place a player can actually get to. Measured, not assumed: the jump apex from
 * flat ground is 6.35^2 / (2 x 24.5) = 0.823 m and autostep is 0.42 m, so a
 * rise of about 1.2 m is the most a player can take in one hop. A 3.25 m roof
 * with nothing beside it is unreachable, which is what the first cut of the old
 * bus shipped.
 *
 * Three treads against the CAB's ROAD-SIDE flank, then 0.30 m up onto the cab
 * roof (2.90) and 0.35 m from there onto the cargo-box roof (3.25). Climbing
 * over the cab is both the shortest route and the one that keeps every tread
 * far from the core.
 *
 * HF-432 item 5: the treads are on the truck's NORTH flank, i.e. the middle of
 * the road, not the kerb side. The truck now stands 0.076 L SOUTH of the road
 * centre-line where the reference has it, so treads on its south flank would
 * have handed the south team the shorter climb to the 2x core on a body the
 * reference put there for cover, not for fairness. Climbing from the middle of
 * the carriageway is also the only climb both teams contest.
 *
 * WHY THEY SIT WHERE THEY SIT. Every tread footprint is more than
 * `OVERDRIVE_PICKUP_RADIUS` (1.65 m) from the world origin in plan - the
 * nearest corner is 3.64 m - so climbing half way cannot short-circuit the
 * claim: the core is taken on the box roof or not at all.
 */
const TRUCK_ROOF_STEPS: readonly (readonly [number, number, number])[] = Object.freeze([
  // [tread top, x OFFSET from the cargo box centre, x offset to] - z is
  // derived from the truck's own position, and HF-477 made x an offset for the
  // same reason: the box centre used to be the world origin and is not any
  // more.
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
 * These points are validated candidates, not eyeballed: every one has floor
 * beneath it, an autostep route to the enemy, cover within reach, no enemy
 * spawn in sight, and clears the gate's team separation floor.
 *
 * RE-SOLVED UNDER HF-432 ITEM 3, after the yard cover of item 2. The owner
 * after PASS 90: "the cover and size/shape of the side areas of the map and
 * spawns, needs refinement." Two things were measurably wrong and the shipped
 * spawn gate reported neither, because its bands are floors rather than
 * targets:
 *
 *   EXPOSURE. Four of the ten spawns had a clear standing eye-line 68-71 m
 *   long - a spawn that sees, and is seen from, the far end of an 84 m map.
 *   The gate has no ceiling on that at all.
 *
 *   ONE SPAWN SAW A SPAWN. t0 (12, -30) held a clear line to t1 (6, 32) at
 *   62.3 m. The gate's `minimumVisibleEnemySpawnDistanceM` is 30 m, so a
 *   62.3 m sightline between two spawn points passed it. The lane brief's rule
 *   is stricter and is the right one: NO spawn sees a spawn.
 *
 * The replacement was searched over every cell of the fenced yard that passes
 * the full `spawnPointFailures` constraint set AND clears both destructible
 * sheds by more than 5.5 m, scored on: zero spawn-to-spawn sightlines (hard),
 * at least 24 m of x-spread and 6 m of z-spread so a team is not one
 * grenade-sized knot (hard), 4.5 m minimum spacing (hard), then lowest worst
 * exposure, then shallowest mean depth - because the other half of the owner's
 * complaint is that the spawns sit too FAR back, and the reference's yards are
 * a place you cross, not a place you start a run-up in.
 *
 *   worst clear line from any spawn   71.0 m -> 31.6 m
 *   spawn-to-spawn sightlines               1 -> 0
 *   mean distance from the road       31.5 m -> 26.5 m
 *   points per team                        5 -> 6
 *
 * Team 1 stays the exact 180-degree negation of team 0, in order.
 *
 * PASS 94 INTEGRATION - the table below is NOT either lane's table, and that is
 * the honest outcome rather than a compromise. Two lanes edited this list from
 * the same base and their GATES contradicted each other on the merged head:
 *
 *   - the spawn-distribution lane (HF-456, "bot spawns seem to just spawn in 1
 *     or two places") raised src/spawn-layout-quality.test.ts' floor for this
 *     arena to EIGHT points per team with a SEVEN-metre mean nearest-neighbour,
 *     and reached it by putting the seventh and eighth at |z| = 40;
 *   - this arena's own src/nuketown2-fidelity.test.ts requires every spawn to
 *     stand INSIDE the fenced back yard, |z| < 36. |z| = 40 is the border path -
 *     the flank route, not a spawn room - so the merged head failed that band.
 *
 * Neither number was touched. The six authored points could not absorb the new
 * floor either: their mean nearest-neighbour is 6.26 m, under the 7 m the other
 * lane now pins. So the whole table was RE-SOLVED against the union of both
 * constraint sets by `scripts/qa/solve-nuketown2-spawn-layout.ts`, using this
 * lane's own recorded scoring order - zero spawn-to-spawn sightlines, >= 24 m of
 * x-spread and >= 6 m of z-spread, >= 4.5 m spacing, all hard; then lowest worst
 * exposure; then shallowest mean depth - with `count = 8` and `mean nearest >=
 * 7.5` (half a metre of margin over the 7 m gate) added as further hard
 * constraints. 195 yard cells are admissible; the search is deterministic.
 *
 *   points per team                         6 -> 8
 *   mean nearest-neighbour            6.26 m -> 7.68 m   (gate floor 7)
 *   closest pair                      6.00 m -> 6.08 m   (gate floor 3, brief 4.5)
 *   worst clear line from any spawn   31.6 m -> 33.7 m   (band 18-36)
 *   mean distance from the road       26.5 m -> 28.7 m
 *   spawn-to-spawn sightlines              0 -> 0
 *   all 16 points, measureSpawnLayout: 0 failures, 0 unreachable, 0 without floor
 *
 * THE ONE THING THAT GOT WORSE IS WRITTEN DOWN: worst exposure and mean depth
 * both rose ~2 m. That is arithmetic, not carelessness - eight points at 7 m
 * mean spacing do not fit in a 36 x 13 m yard as close to the house as six do,
 * so the extra points bought by HF-456 are paid for in depth. Both numbers stay
 * inside every band this file's gate enforces.
 *
 * The table is AUTHORED frame; the export below mirrors it through
 * `nuketown2HandedX` (HF-473).
 */
const SPAWN_LAYOUT_AUTHORED: readonly (readonly (readonly [number, number])[])[] = Object.freeze([
  Object.freeze([[16, -24] as const, [6, -24] as const, [-6, -25] as const, [0, -26] as const, [-12, -31] as const, [6, -32] as const, [14, -34] as const, [-2, -34] as const]),
  Object.freeze([[-16, 24] as const, [-6, 24] as const, [6, 25] as const, [0, 26] as const, [12, 31] as const, [-6, 32] as const, [-14, 34] as const, [2, 34] as const]),
]);

/**
 * WORLD frame (HF-473): the authored table above, mirrored on x. Exported in
 * the world frame because `spawnRecord` hands these straight to the runtime -
 * a spawn table left in the authored frame would stand each team in the other
 * half's cover.
 */
export const NUKETOWN2_SPAWN_LAYOUT: readonly (readonly (readonly [number, number])[])[] = Object.freeze(
  SPAWN_LAYOUT_AUTHORED.map((team) => Object.freeze(
    team.map(([x, z]) => Object.freeze([nuketown2HandedX(x), z]) as unknown as readonly [number, number]),
  )),
);

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
    breakableWindows: [],
  };
}

type BoxOptions = Parameters<typeof box>[5] & { presentationOnly?: boolean };

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
   * by COLOUR ALONE. HF-477: the reference's playable houses are
   * terracotta-orange-over-cream and white/cream - not one repeated shell -
   * and the two houses here are
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
  const northOptions = options.breakableWindowId
    ? { ...options, breakableWindowId: `${options.breakableWindowId}:north` }
    : options;
  const southOptions = options.breakableWindowId
    ? { ...options, breakableWindowId: `${options.breakableWindowId}:south` }
    : options;
  // TWO FRAMES (HF-473). `position` is AUTHORED; the world is the authored
  // frame mirrored by NUKETOWN2_HANDEDNESS on x. Applying it here, once, is
  // the whole mirror: a half-mirror is impossible because there is no second
  // path from an authored number to a solid.
  const worldX = nuketown2HandedX(position[0]);
  box(builder, `nuketown2 north ${name}`, [worldX, position[1], position[2]], size, north, northOptions);
  box(builder, `nuketown2 south ${name}`, [-worldX, position[1], -position[2]], size, south, southOptions);
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
  return box(builder, `nuketown2 ${name}`,
    [nuketown2HandedX(position[0]), position[1], position[2]], size, material, options);
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
): THREE.Mesh {
  const mesh = box(builder, `nuketown2 street-vehicle ${name}`,
    [nuketown2HandedX(position[0]), position[1], position[2]], size, material, options);
  if (options.presentationOnly) {
    mesh.userData.presentationOnly = true;
  }
  return mesh;
}

// ---------------------------------------------------------------------------
// Materials — original, authored for this arena
// ---------------------------------------------------------------------------

type Nuketown2Materials = Readonly<{
  ground: THREE.Material;
  lawn: THREE.Material;
  asphalt: THREE.Material;
  kerb: THREE.Material;
  drive: THREE.Material;
  /** HF-434: the driveway/border-path DECALS - polygonOffset tier -1. */
  driveDecal: THREE.Material;
  /** HF-434: the garage floor - drive's paint at the -1 decal tier. */
  garageFloor: THREE.Material;
  /** North house UPPER-storey siding - the reference's TERRACOTTA-ORANGE house. */
  sidingA: THREE.Material;
  /**
   * The CREAM. Both houses' ground storeys and the whole of the south house:
   * the orange house is orange-over-cream and the other one is cream
   * throughout, so one material carries three of the four storey-halves.
   */
  sidingB: THREE.Material;
  /** The south house's pale blue-grey roof glazing. */
  roofGlazing: THREE.Material;
  /** Cooker tops on the ORANGE house's front lawn. */
  applianceRed: THREE.Material;
  /** Cooker tops on the WHITE house's front lawn. */
  applianceBlue: THREE.Material;
  /** Both garage wings - the reference's ORANGE. */
  garageSiding: THREE.Material;
  /** The up-and-over garage door leaf parked in its head. */
  garageDoor: THREE.Material;
  trim: THREE.Material;
  /** HF-434: the road DASHES - polygonOffset tier -2, over the -1 road. */
  trimDecal: THREE.Material;
  roof: THREE.Material;
  interior: THREE.Material;
  /** HF-434: the interior floor - interior's paint at the -1 decal tier. */
  interiorFloor: THREE.Material;
  warmLight: THREE.Material;
  coldLight: THREE.Material;
  fence: THREE.Material;
  block: THREE.Material;
  busShell: THREE.Material;
  busTrim: THREE.Material;
  truckCab: THREE.Material;
  truckBox: THREE.Material;
  carA: THREE.Material;
  /** The dark saloon beside the truck (FINDINGS Q4). */
  carSaloon: THREE.Material;
  /** The green/teal classic out in the stem (FINDINGS Q4). */
  carClassic: THREE.Material;
  carGlass: THREE.Material;
  /** HF-434: the coach window BANDS - polygonOffset tier -1 over the body. */
  coachGlass: THREE.Material;
  /** HF-435: the ground-floor window panes - real glass, visible and pale. */
  windowGlass: THREE.Material;
  rubber: THREE.Material;
  chrome: THREE.Material;
  headlight: THREE.Material;
  taillight: THREE.Material;
  sign: THREE.Material;
  planter: THREE.Material;
  poolWater: THREE.Material;
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
 *   1. HOUSE COLOUR - SUPERSEDED BY HF-477, and the correction is recorded
 *      rather than overwritten because the thing it corrects was itself a
 *      correction. HF-426 read the schematic as "blue, yellow and orange" and
 *      painted the north house blue and the south house yellow. Twenty images
 *      later (`docs/references/nuketown-2025/FINDINGS.md`, Q2, VERIFIED on two
 *      BO2-2025 frames) the pairing is ORANGE and WHITE/CREAM: blue-and-yellow
 *      is the ORIGINAL Nuketown's palette, the same source as the yellow school
 *      bus HF-407 already removed. Only the ORANGE survives, and the garage
 *      wings stay neutral cream as HF-426's C2 said. The values are derived at
 *      `nuketown2Materials()`.
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
  // HF-434 Z-FIGHTING TIER. The measured coplanar set (see
  // scripts/qa/find-coplanar-pairs.ts and docs/evidence/pass92/nuketown2/) is
  // decal-over-solid: the road runs and turning head sit exactly on the ground
  // slab's top face, the dressing decals 0.02 m over it, the dashes 0.03 m
  // over the road - all far inside the ~1 cm depth precision the 0.02 m near
  // plane leaves at 60 m, so they raced the surfaces under them for the same
  // depth samples and flickered all over the map. A polygonOffset tier pins
  // every race deterministically at every range on both backends, the same
  // tiering HF-346 shipped on the Skyline apron: -1 for a decal over a solid,
  // -2 where a decal overlaps another -1 decal (the lawn crosses the turning
  // head, the dashes cross the road). The THREE base materials that also dress
  // SOLID bodies (drive: the porch; trim: the door cases; carGlass: the car
  // cabins) stay clean; the decal-only clones carry the offsets.
  //
  // PASS 94 materials lane: that tier now lives WITH the material, in
  // `src/nuketown2-materials`, instead of being reapplied here by a local
  // helper - a role that is a decal is authored as one, so the tier cannot be
  // dropped by a call site that forgets to wrap it. Every factor and unit
  // value is carried over unchanged; `scripts/qa/find-coplanar-pairs.ts`
  // reports the same 0 FINDINGS / 66 FENCED / 26 BENIGN split it did before.
  const forged = createNuketown2MaterialRegistry();
  const busShell = createNuketown2CoachMaterial();
  const truckCab = createNuketown2TruckCabMaterial();
  const truckBox = createNuketown2TruckBoxMaterial();
  const carA = createNuketown2CarPaintMaterial(0x3d6f80, 'nuketown2-car-aqua');
  // HF-477 - the two road cars the reference actually parks in the street.
  // Both measured off `nt2025-aerial-boii.jpg` and both stated as FAMILIES,
  // like the house colours: the frame is hazy and uncalibrated, so the hue is
  // taken and the chroma is authored at this arena's own car-paint level.
  // Dark blue saloon (measured a desaturated slate around #5a6b74, lifted to
  // the navy the un-hazed body reads as) and green/teal classic (measured
  // around #78807a under the same haze, lifted to the period jade-green the
  // aerial's own colour-coded props sit at). Exact hexes OPEN.
  const carSaloon = createNuketown2CarPaintMaterial(0x27394f, 'nuketown2-car-saloon-navy');
  const carClassic = createNuketown2CarPaintMaterial(0x2f8f77, 'nuketown2-car-classic-jade');
  const carGlass = createNuketown2VehicleGlassMaterial();
  const rubber = createNuketown2TireMaterial();
  const chrome = createNuketown2ChromeMaterial();
  const headlight = createNuketown2HeadlightMaterial();
  const poolWater = createNuketown2PoolWaterMaterial();
  const taillight = createNuketown2TaillightMaterial();
  // decal: the pane is a collider and a ballistic surface.
  const windowGlass = createNuketown2GlassMaterial();
  const interiorFloor = createNuketown2WoodFloorMaterial();
  const garageFloor = createNuketown2GarageFloorMaterial();
  const interior = createNuketown2DrywallMaterial(0xdbd1ba);
  const warmLight = createNuketown2CeilingLightMaterial(true);
  const coldLight = createNuketown2CeilingLightMaterial(false);
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
    // same land. PASS 94: the same 0x515642 key, now carrying dry-scrub straw
    // patches and metre-scale bare ground instead of one flat value.
    ground: forged.ground,
    // grass-turf, the shipped lawn plate. The instanced lawn field grows out of
    // this, and that field's blade green (0x5e9e41) was keyed against it.
    // PASS 94: mower bands and worn desire lines through to bare earth.
    lawn: forged.lawn,
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
    asphalt: forged.asphalt,
    // concrete-poured, fresh at the kerb and weathered on the apron - the
    // shipped map's own tint-the-same-texture idiom (`grass` / `grassDark`).
    kerb: forged.kerb,
    drive: forged.drive,                             // SOLID users: the porch, the garage floor
    driveDecal: forged.driveDecal,
    garageFloor,
    warmLight,
    coldLight,
    // HF-477: the ORANGE house's upper band, and the cream every other house
    // wall wears. The hexes moved to the accuracy lane's measured pair; the
    // wear graph they are dressed with is the materials lane's, so both lanes
    // keep their intent and there is still ONE siding pipeline per house.
    sidingA: forged.sidingA,
    sidingB: forged.sidingB,
    roofGlazing: forged.roofGlazing,
    applianceRed: forged.applianceRed,
    applianceBlue: forged.applianceBlue,
    // The ORANGE wing: siding-coral, unchanged.
    // HITL 5 (HF-491 captures, candidate 4b garage.png): the garage wing read
    // BRIGHT RED because it wore the coral board-course graph that
    // `createNuketown2GarageWallMaterial` authors for an interior wall. HF-426
    // C2 and HF-477 both specify the wing as the same neutral cream as the
    // house's ground storey, so it wears the registry's own cream siding role -
    // no new hex, and one fewer material graph on the cold-compile path.
    garageSiding: forged.sidingB,
    // The shipped map's `chrome`, verbatim - it is what dresses BOTH garage
    // doors there. The opening itself stays a hole (it is a route); this is the
    // door leaf parked in its head, which is what you see from the street.
    garageDoor: forged.garageDoor,
    // `white`, the shipped map's trim: sills, heads, lintels, road dashes.
    trim: forged.trim,                               // SOLID users: sills, heads, lintels
    trimDecal: forged.trimDecal,
    roof: forged.roof,
    // plaster-warm: interior walls, floors, stairs and the ground-room bodies.
    interior,
    interiorFloor,
    // wood-deck: the plank fence, the same timber the shipped map decks with.
    fence: forged.fence,
    block: forged.block,
    busShell,
    busTrim: forged.busTrim,
    truckCab,
    truckBox,
    carA,
    carSaloon,
    carClassic,
    carGlass,
    coachGlass: forged.coachGlass,
    windowGlass,
    rubber,
    chrome,
    headlight,
    poolWater,
    taillight,
    sign: forged.sign,
    // Hedges, the yard crate, the patio table and the alley planter are one
    // material and four of the five uses are garden mass, so it is keyed as
    // clipped hedge against the shipped map's `grassDark` (effective 0x243917).
    planter: forged.planter,
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
  // HF-477: TERRACOTTA-ORANGE OVER CREAM on the north house, cream throughout
  // on the south one. Same wall in the same place; only the paint differs, so
  // the 180-degree partner gate is untouched (it measures size and position,
  // never material - see `pair()`).
  //
  // `sidingUpper` is the pair that CARRIES the identity: FINDINGS Q2 reads the
  // orange off the upper wall band in `nt2025-street-boii.jpg`, and the ground
  // storey under it is cream on BOTH houses in the reference. So the ground
  // storeys are deliberately the same material, and the fidelity gate's
  // distinct-colour assertion moved onto the upper walls with it - which is a
  // stronger claim than the old one, because it now also pins the two-tone.
  const sidingUpper = [m.sidingA, m.sidingB] as const;
  const siding = m.sidingB;
  const zFront = HOUSE_FRONT_Z - WALL_T / 2;      // wall centre, front face on the front line
  const zBack = HOUSE_BACK_Z + WALL_T / 2;
  const zMid = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;   // -16.5
  const cx = NUKETOWN2_HOUSE_LAYOUT[0]!.x;           // -1.25

  // Ground-floor interior slab and roof deck. The slab is independently raised
  // above the outdoor plane; `buildNuketown2()` also removes the outdoor ground
  // tiles and all lawn regions from this plan footprint, so no offset tier is
  // being asked to hide a second surface underneath the room.
  pair(builder, 'house floor', [cx, GROUND_FLOOR_TOP - GROUND_FLOOR_T / 2, zMid],
    [HOUSE_WIDTH, GROUND_FLOOR_T, HOUSE_DEPTH], m.interiorFloor, { cast: false });
  // HF-477: the north house wears the reference's dark solar-panelled roof
  // plane (`nt2025-street-boii.jpg`) and the south house the PALE BLUE-GREY
  // ROOF GLAZING that is its own strongest identifier from above
  // (`nt2025-aerial-boii.jpg`). Colour only, one geometry.
  pair(builder, 'house roof deck', [cx, ROOF_Y0 + ROOF_T / 2, zMid], [HOUSE_WIDTH, ROOF_T, HOUSE_DEPTH],
    [m.roof, m.roofGlazing]);

  // West side wall. SPLIT AT THE STOREY LINE (HF-477) so the north house can be
  // orange over cream: the upper leaf carries `sidingUpper`, the ground leaf
  // the shared cream. The east wall was already split this way for the garage
  // link door, so this is the same construction, not a new one, and both leaves
  // are still emitted through `pair()`.
  pair(builder, 'house wall west', [HOUSE_X0 + WALL_T / 2, GROUND_H / 2, zMid],
    [WALL_T, GROUND_H, HOUSE_DEPTH], siding);
  pair(builder, 'house wall west upper', [HOUSE_X0 + WALL_T / 2, (GROUND_H + ROOF_Y0) / 2, zMid],
    [WALL_T, ROOF_Y0 - GROUND_H, HOUSE_DEPTH], sidingUpper);

  // --- east side wall: the garage link doorway is a REAL hole ---------------
  // The previous cut cut a doorway in the garage's shared wall and left the
  // house's own east wall solid behind it, so the garage's "route into the
  // house" opened onto a wall. Both leaves are cut here, at the same z.
  const LINK_DOOR = doorRun('house garage link');
  [[HOUSE_BACK_Z, LINK_DOOR[0]], [LINK_DOOR[1], HOUSE_FRONT_Z]].forEach((run, index) => {
    pair(builder, `house wall east ${index}`,
      [HOUSE_X1 - WALL_T / 2, GROUND_H / 2, (run[0]! + run[1]!) / 2],
      [WALL_T, GROUND_H, run[1]! - run[0]!], siding);
  });
  pair(builder, 'house wall east lintel',
    [HOUSE_X1 - WALL_T / 2, GROUND_H - 0.2, (LINK_DOOR[0] + LINK_DOOR[1]) / 2],
    [WALL_T, 0.4, LINK_DOOR[1] - LINK_DOOR[0]], m.trim);
  pair(builder, 'house wall east upper', [HOUSE_X1 - WALL_T / 2, (GROUND_H + ROOF_Y0) / 2, zMid],
    [WALL_T, ROOF_Y0 - GROUND_H, HOUSE_DEPTH], sidingUpper);

  // --- front wall, ground floor: two windows and the front door ------------
  // Segments are authored as [x0, x1] runs; the gaps between them ARE the
  // openings, which is the whole point — a window you cannot shoot through is
  // a painting.
  const FRONT_DOOR = doorRun('house front door');
  const groundFrontRuns: [number, number][] = [
    [HOUSE_X0 + WALL_T, FRONT_WINDOW_A[0]],
    [FRONT_WINDOW_A[1], FRONT_DOOR[0]],
    [FRONT_DOOR[1], FRONT_WINDOW_B[0]],
    [FRONT_WINDOW_B[1], HOUSE_X1 - WALL_T],
  ];
  groundFrontRuns.forEach((run, index) => {
    pair(builder, `house front pier ${index}`,
      [(run[0] + run[1]) / 2, GROUND_H / 2, zFront], [run[1] - run[0], GROUND_H, WALL_T], siding);
  });
  // Window sills (0 -> 1.0) and heads (2.1 -> 3.0). Standing eye is 1.65, so the
  // 1.1 m band between them is the shot corridor.
  // HF-435, owner after PASS 91: "putting glass on the windows." The pane is a
  // REAL dynamic collider (intact/cracked panes block movement, breached panes
  // open) and a REAL ballistic surface (ballisticMaterial 'glass' - the
  // shipped arenas' glazing class, entryCost 0.08), so bullets can admit the
  // existing break lifecycle without leaving a static invisible wall behind.
  for (const [index, window] of [FRONT_WINDOW_A, FRONT_WINDOW_B].entries()) {
    const width = window[1] - window[0];
    const wx = (window[0] + window[1]) / 2;
    // HF-467: the sill and head are the solid TRIM boxes under and over the
    // opening, but their names contain "window", so the glass name rule rated
    // them `glass` (0.08 / 0.25) - bullets crossed the window FRAME like air
    // and, worse, they read as glazing to anything that reasons about class.
    // They are painted timber: `wood`.
    pair(builder, `house front window sill ${index}`, [wx, 0.5, zFront], [width, 1.0, WALL_T], m.trim,
      { ballisticMaterial: 'wood' });
    pair(builder, `house front window glass ${index}`, [wx, 1.55, zFront], [width, 1.1, 0.06], m.windowGlass,
      {
        ballisticMaterial: 'glass',
        breakableWindowId: `nuketown2-ground-window-${index}`,
        cast: false,
        solid: false,
        shots: true,
      });
    pair(builder, `house front window head ${index}`, [wx, 2.55, zFront], [width, 0.9, WALL_T], m.trim,
      { ballisticMaterial: 'wood' });
    // HF-440 Cycle 1 Priority 3: facade bays with real recess (projecting sill nosing, lintel trim, jamb reveals)
    pair(builder, `house front window sill nose ${index}`, [wx, 0.96, -9.95], [width + 0.12, 0.08, 0.10], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, `house front window lintel trim ${index}`, [wx, 2.15, -9.96], [width + 0.12, 0.10, 0.08], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, `house front window jamb ${index} 0`, [window[0] + 0.035, 1.625, zFront], [0.07, 1.25, WALL_T + 0.02], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, `house front window jamb ${index} 1`, [window[1] - 0.035, 1.625, zFront], [0.07, 1.25, WALL_T + 0.02], m.trim,
      { solid: false, shots: false, cast: true });
    // Double-hung meeting rail and vertical muntin divider:
    pair(builder, `house front window meeting rail ${index}`, [wx, 1.55, zFront], [width, 0.05, 0.08], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, `house front window mullion ${index}`, [wx, 1.52, zFront], [0.05, 0.98, 0.08], m.trim,
      { solid: false, shots: false, cast: true });
    // Interior window stool ledge and apron trim:
    pair(builder, `house front window stool ${index}`, [wx, 0.99, zFront + WALL_T / 2 + 0.035], [width + 0.10, 0.03, 0.07], m.trim,
      { solid: false, shots: false, cast: false });
    pair(builder, `house front window apron ${index}`, [wx, 0.93, zFront + WALL_T / 2 + 0.015], [width + 0.06, 0.08, 0.03], m.trim,
      { solid: false, shots: false, cast: false });
  }
  pair(builder, 'house front door lintel',
    [(FRONT_DOOR[0] + FRONT_DOOR[1]) / 2, (DOOR_HEAD_Y + GROUND_H) / 2, zFront],
    [FRONT_DOOR[1] - FRONT_DOOR[0], GROUND_H - DOOR_HEAD_Y, WALL_T], m.trim);
  const doorW = FRONT_DOOR[1] - FRONT_DOOR[0];
  const doorCx = (FRONT_DOOR[0] + FRONT_DOOR[1]) / 2;
  pair(builder, 'house front door pediment trim', [doorCx, DOOR_HEAD_Y + 0.08, -9.95], [doorW + 0.16, 0.16, 0.10], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house front door casing 0', [FRONT_DOOR[0] - 0.04, DOOR_HEAD_Y / 2, -9.97], [0.08, DOOR_HEAD_Y, 0.06], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house front door casing 1', [FRONT_DOOR[1] + 0.04, DOOR_HEAD_Y / 2, -9.97], [0.08, DOOR_HEAD_Y, 0.06], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house front string course', [cx, GROUND_H, -9.97], [HOUSE_WIDTH + 0.08, 0.10, 0.06], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house front roof fascia', [cx, ROOF_Y0 + 0.06, -9.95], [HOUSE_WIDTH + 0.16, 0.12, 0.10], m.trim,
    { solid: false, shots: false, cast: true });
  // --- front wall, upper floor: the power window ---------------------------
  const upperFrontRuns: [number, number][] = [
    [HOUSE_X0 + WALL_T, UPPER_WINDOW[0]],
    [UPPER_WINDOW[1], HOUSE_X1 - WALL_T],
  ];
  upperFrontRuns.forEach((run, index) => {
    pair(builder, `house upper front pier ${index}`,
      [(run[0] + run[1]) / 2, UPPER_Y0 + UPPER_H / 2, zFront], [run[1] - run[0], UPPER_H, WALL_T], sidingUpper);
  });
  {
    const width = UPPER_WINDOW[1] - UPPER_WINDOW[0];
    const wx = (UPPER_WINDOW[0] + UPPER_WINDOW[1]) / 2;
    // 0.9 m sill: you can stand at it, and you can crouch behind it. The old
    // 0.9 m head band (top 0.45 m under the roof) is GONE under HF-435: with
    // it, the opening stood 1.1 m tall and no capsule the game ships - standing
    // 1.82, crouched 1.16 - could ever cross the wall plane, so "go out of
    // windows" was impossible no matter how wide the opening was. The opening
    // now runs sill top (UPPER_Y0 + 0.9) to the roof deck's underside at
    // ROOF_Y0: 2.0 m tall, so a standing capsule that hops the 0.9 m sill
    // (apex 0.82 + the 0.42 m autostep up-cast = 1.24) walks out and drops to
    // the verge. The roof deck itself closes the head, exactly like an eave.
    // HF-467: same defect as the ground sills - rated `glass` by its name.
    pair(builder, 'house upper window sill', [wx, UPPER_Y0 + 0.45, zFront], [width, 0.9, WALL_T], m.trim,
      { ballisticMaterial: 'wood' });
    // HF-440 Cycle 1 Priority 3: upper front window projecting sill nosing and jamb reveals
    pair(builder, 'house upper window sill nose', [wx, UPPER_Y0 + 0.86, -9.95], [width + 0.12, 0.08, 0.10], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, 'house upper window jamb 0', [UPPER_WINDOW[0] + 0.035, UPPER_Y0 + 1.35, zFront], [0.07, 2.70, WALL_T + 0.02], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, 'house upper window jamb 1', [UPPER_WINDOW[1] - 0.035, UPPER_Y0 + 1.35, zFront], [0.07, 2.70, WALL_T + 0.02], m.trim,
      { solid: false, shots: false, cast: true });
    // HF-440 Cycle 2: Glazed double-hung upper window with glass pane on upper sash
    pair(builder, 'house upper front window glass',
      [wx, 5.42, zFront], [width - 0.10, 1.44, 0.06], m.windowGlass,
      {
        solid: false,
        shots: true,
        cast: false,
        ballisticMaterial: 'glass',
        breakableWindowId: 'nuketown2-upper-front-window',
      });
    pair(builder, 'house upper front window meeting rail',
      [wx, UPPER_Y0 + 1.40, zFront], [width, 0.06, 0.08], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, 'house upper front window mullion 0',
      [wx - width / 4, 5.39, zFront], [0.05, 1.38, 0.07], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, 'house upper front window mullion 1',
      [wx + width / 4, 5.39, zFront], [0.05, 1.38, 0.07], m.trim,
      { solid: false, shots: false, cast: true });
    pair(builder, 'house upper front window stool',
      [wx, UPPER_Y0 + 0.89, zFront - WALL_T / 2 - 0.035], [width + 0.10, 0.03, 0.07], m.trim,
      { solid: false, shots: false, cast: false });
    pair(builder, 'house upper front window apron',
      [wx, UPPER_Y0 + 0.83, zFront - WALL_T / 2 - 0.015], [width + 0.06, 0.08, 0.03], m.trim,
      { solid: false, shots: false, cast: false });
    pair(builder, 'house upper front subwindow drywall',
      [wx, UPPER_Y0 + 0.40, zFront - WALL_T / 2 - 0.01], [width, 0.80, 0.02], m.interior,
      { solid: false, shots: false, cast: false });
  }
  // --- back wall: back door and one upper window ---------------------------
  const BACK_DOOR = doorRun('house back door');
  const groundBackRuns: [number, number][] = [
    [HOUSE_X0 + WALL_T, BACK_DOOR[0]],
    [BACK_DOOR[1], HOUSE_X1 - WALL_T],
  ];
  groundBackRuns.forEach((run, index) => {
    pair(builder, `house back pier ${index}`,
      [(run[0] + run[1]) / 2, GROUND_H / 2, zBack], [run[1] - run[0], GROUND_H, WALL_T], siding);
  });
  pair(builder, 'house back door lintel',
    [(BACK_DOOR[0] + BACK_DOOR[1]) / 2, (DOOR_HEAD_Y + GROUND_H) / 2, zBack],
    [BACK_DOOR[1] - BACK_DOOR[0], GROUND_H - DOOR_HEAD_Y, WALL_T], m.trim);
  const backDoorW = BACK_DOOR[1] - BACK_DOOR[0];
  const backDoorCx = (BACK_DOOR[0] + BACK_DOOR[1]) / 2;
  pair(builder, 'house back door pediment trim', [backDoorCx, DOOR_HEAD_Y + 0.08, -23.05], [backDoorW + 0.16, 0.16, 0.10], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house back string course', [cx, GROUND_H, -23.03], [HOUSE_WIDTH + 0.08, 0.10, 0.06], m.trim,
    { solid: false, shots: false, cast: true });
  // HF-465: the upper back wall now carries the window AND the balcony door,
  // so it is three piers rather than two. Order matters - the doorway is cut
  // before the deck is built, or the pier runs do not split correctly.
  const BALCONY_DOOR = doorRun('house balcony door');
  // HF-477: the two openings SWAPPED ends, so the pier runs are derived by
  // sweeping the sorted openings rather than written out in a fixed order. A
  // hand-ordered list produces silently negative-width piers the moment either
  // body moves, which is exactly what this pass does to both of them.
  const upperBackRuns: [number, number][] = [];
  let upperBackCursor = HOUSE_X0 + WALL_T;
  for (const opening of [BALCONY_DOOR, BACK_UPPER_WINDOW]
    .map((run) => [run[0], run[1]] as [number, number])
    .sort((first, second) => first[0] - second[0])) {
    upperBackRuns.push([upperBackCursor, opening[0]]);
    upperBackCursor = opening[1];
  }
  upperBackRuns.push([upperBackCursor, HOUSE_X1 - WALL_T]);
  upperBackRuns.forEach((run, index) => {
    pair(builder, `house upper back pier ${index}`,
      [(run[0]! + run[1]!) / 2, UPPER_Y0 + UPPER_H / 2, zBack], [run[1]! - run[0]!, UPPER_H, WALL_T], sidingUpper);
  });
  // The door's head band: the 0.4 m header between its clear head and the
  // roof deck's underside.
  pair(builder, 'house balcony door lintel',
    [(BALCONY_DOOR[0] + BALCONY_DOOR[1]) / 2,
      UPPER_Y0 + (BALCONY_DOOR_HEAD_Y + UPPER_H) / 2, zBack],
    [BALCONY_DOOR[1] - BALCONY_DOOR[0], UPPER_H - BALCONY_DOOR_HEAD_Y, WALL_T], m.trim);
  // HF-435: sill stays at 0.9 m, the old head band goes - same reason as the
  // upper front window: the opening has to be tall enough for a capsule to
  // cross, and the roof deck is the head.
  // HF-467: the back sill escaped the "window" rule and landed on the house
  // rule instead, so the front and back sills of the SAME window family were
  // `glass` and `interior-wall`. Both are timber trim: `wood`.
  pair(builder, 'house upper back sill',
    [(BACK_UPPER_WINDOW[0] + BACK_UPPER_WINDOW[1]) / 2, UPPER_Y0 + 0.45, zBack],
    [BACK_UPPER_WINDOW[1] - BACK_UPPER_WINDOW[0], 0.9, WALL_T], m.trim,
    { ballisticMaterial: 'wood' });
  const backUpperW = BACK_UPPER_WINDOW[1] - BACK_UPPER_WINDOW[0];
  const backUpperWx = (BACK_UPPER_WINDOW[0] + BACK_UPPER_WINDOW[1]) / 2;
  pair(builder, 'house upper back sill nose', [backUpperWx, UPPER_Y0 + 0.86, -23.05], [backUpperW + 0.12, 0.08, 0.10], m.trim,
    { solid: false, shots: false, cast: true });
  // HF-440 Cycle 2: Glazed double-hung upper back window with glass pane on upper sash
  pair(builder, 'house upper back window glass',
    [backUpperWx, 5.42, zBack], [backUpperW - 0.10, 1.44, 0.06], m.windowGlass,
    {
      solid: false,
      shots: true,
      cast: false,
      ballisticMaterial: 'glass',
      breakableWindowId: 'nuketown2-upper-back-window',
    });
  pair(builder, 'house upper back window meeting rail',
    [backUpperWx, UPPER_Y0 + 1.40, zBack], [backUpperW, 0.06, 0.08], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house upper back window mullion 0',
    [backUpperWx - backUpperW / 4, 5.39, zBack], [0.05, 1.38, 0.07], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house upper back window mullion 1',
    [backUpperWx + backUpperW / 4, 5.39, zBack], [0.05, 1.38, 0.07], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house upper back window stool',
    [backUpperWx, UPPER_Y0 + 0.89, zBack + WALL_T / 2 + 0.035], [backUpperW + 0.10, 0.03, 0.07], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper back window apron',
    [backUpperWx, UPPER_Y0 + 0.83, zBack + WALL_T / 2 + 0.015], [backUpperW + 0.06, 0.08, 0.03], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper back subwindow drywall',
    [backUpperWx, UPPER_Y0 + 0.40, zBack + WALL_T / 2 + 0.01], [backUpperW, 0.80, 0.02], m.interior,
    { solid: false, shots: false, cast: false });
  // --- stair: BACK room, hard against the WEST (blind) wall ----------------
  // Presentation treads remain visible, but one smooth rotated cuboid owns
  // movement for the complete flight. The ramp angle is below Rapier's 50°
  // climb ceiling and overlaps the floor/landing at both ends by 0.12 m.
  const STAIR_W = NUKETOWN2_HOUSE_STAIR.width;
  const STAIR_CX = NUKETOWN2_HOUSE_STAIR.x0 + STAIR_W / 2;
  const GOING = NUKETOWN2_HOUSE_STAIR.going;
  const risers = NUKETOWN2_HOUSE_STAIR.risers;
  const rampLength = Math.hypot(STAIR_RAMP_RUN, STAIR_RAMP_RISE);
  const rampCentreY = (GROUND_FLOOR_TOP + UPPER_Y0) / 2
    - Math.cos(STAIR_RAMP_ANGLE) * STAIR_RAMP_THICKNESS / 2;
  const rampMaterial = new THREE.MeshBasicMaterial({ visible: false });
  rampMaterial.name = 'nuketown2-house-stair-collision-authority';
  const rampRotation: [number, number, number] = [-STAIR_RAMP_ANGLE, 0, 0];
  // Same two frames as `pair()`. A reflection in x commutes with a rotation
  // about x, so the ramp's pitch is unchanged by the mirror.
  const rampWorldX = nuketown2HandedX(STAIR_CX);
  const northRamp = box(builder, 'nuketown2 north house stair ramp',
    [rampWorldX, rampCentreY, (STAIR_RAMP_START_Z + STAIR_RAMP_END_Z) / 2],
    [STAIR_W, STAIR_RAMP_THICKNESS, rampLength], rampMaterial,
    { rotation: rampRotation });
  const southRamp = box(builder, 'nuketown2 south house stair ramp',
    [-rampWorldX, rampCentreY, -(STAIR_RAMP_START_Z + STAIR_RAMP_END_Z) / 2],
    [STAIR_W, STAIR_RAMP_THICKNESS, rampLength], rampMaterial,
    { rotation: [STAIR_RAMP_ANGLE, 0, 0] });
  northRamp.userData.collisionOnly = true;
  southRamp.userData.collisionOnly = true;
  // The lightweight `colliders` channel is intentionally axis-aligned for
  // point/doorway queries; retain the exact rotated OBBs in physicsColliders,
  // which is the live CharacterPhysics authority for this collision-only ramp.
  const rampBounds = new Set(builder.physicsColliders.slice(-2));
  builder.colliders = builder.colliders.filter((bounds) => !rampBounds.has(bounds));
  for (let i = 0; i < risers - 1; i += 1) {
    const treadZ = STAIR_FOOT_Z + GOING * (i + 0.5);
    const top = GROUND_FLOOR_TOP
      + ((treadZ - STAIR_RAMP_START_Z) / STAIR_RAMP_RUN) * STAIR_RAMP_RISE;
    const treadThickness = 0.08;
    pair(builder, `house stair ${i}`,
      [STAIR_CX, top - treadThickness / 2, treadZ], [STAIR_W, treadThickness, GOING], m.interior,
      { solid: false, shots: false, cast: true });
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
  const INNER_DOOR = doorRun('house internal door');
  for (const [storey, y0, h] of [['ground', 0, GROUND_H], ['upper', UPPER_Y0, UPPER_H]] as const) {
    // The UPPER leaf stops at the flight's inboard edge: that 1.95 m gap is
    // the head of the stair, so the landing opens straight into the front
    // upper room. The two upper rooms are therefore joined twice - by the
    // landing on the west and by the internal door in the middle - which is
    // the "landing and upper hallway" this pass owes, and it is why the
    // stairwell no longer has to be crossed to use the upper floor.
    // HF-477: the GROUND run now stops at the west wall's INNER face too, for
    // the identical reason HF-434 trimmed the east one (below). The west wall
    // used to be one full-height leaf topping out at 6.2, so its top face
    // could never race the ground partition's; splitting it at the storey line
    // to paint the orange house orange-over-cream drops its ground leaf to
    // exactly GROUND_H, and the coplanar instrument immediately measured the
    // same 0.3 x 0.3 m corner FINDING on the west side. Same trim, same
    // reasoning, and the wall hides it.
    const x0 = storey === 'upper' ? STAIR_X1 : HOUSE_X0 + WALL_T;
    // HF-434: the east run stops at the east wall's INNER face. It used to run
    // to HOUSE_X1, laying the partition's plaster top face exactly coplanar
    // with the east wall's siding top face over the 0.3 x 0.3 m corner - a
    // different-material depth race the coplanar instrument measured as a
    // FINDING. The wall hides the trimmed 0.3 m, so nothing visible moves.
    [[x0, INNER_DOOR[0]], [INNER_DOOR[1], HOUSE_X1 - WALL_T]].forEach((run, index) => {
      if (run[1]! - run[0]! <= 0.05) return;
      // HF-467: the GROUND leaf's name contains "ground", which the earth name
      // rule matched before the plaster rule could - so a ground-floor plaster
      // partition (4.0 / 12.0) was harder to shoot through than brick, while
      // the identical wall one storey up was `interior-wall` (0.42 / 1.05).
      // Rating both leaves explicitly makes the storeys symmetric.
      pair(builder, `house ${storey} partition ${index}`,
        [(run[0]! + run[1]!) / 2, y0 + h / 2, PARTITION_Z], [run[1]! - run[0]!, h, WALL_T], m.interior,
        { ballisticMaterial: 'interior-wall' });
    });
  }

  // ---- HF-465: THE REAR BALCONY --------------------------------------------
  // Owner, PASS 94: the houses are missing their balconies. See
  // NUKETOWN2_BALCONY above for every number's derivation. Built through
  // pair() so both houses get it and the 180-degree partner gate stays green
  // by construction, and named so the floating-geometry gate's existing
  // vocabulary already explains it - deck, rail, lintel, sill, porch - rather
  // than widening that regex to fit a name.
  const bal = NUKETOWN2_BALCONY;
  const balDeckZ = HOUSE_BACK_Z - bal.projection / 2;
  /** The outboard edge of the flight's own 1.4 m strip; see NUKETOWN2_YARD_STAIR. */
  const yardStairOuterZ = NUKETOWN2_YARD_STAIR.centreZ - NUKETOWN2_YARD_STAIR.width / 2;
  pair(builder, 'balcony deck',
    [bal.centreX, bal.deckTop - bal.slabThickness / 2, balDeckZ],
    [bal.width, bal.slabThickness, bal.projection], m.interiorFloor);
  // ONE CENTRAL PIER, lawn to soffit: the honest answer to "is this body
  // floating", and the detail the reference frame shows under a deck over an
  // open undercroft. HF-465 authored TWO posts at the deck's outboard corners;
  // on the non-garage end where FINDINGS Q3 puts the deck those corners land on
  // this team's z = -25 spawn line, so HF-477 cut them to one pier on the
  // deck's centre line, 2.0 m from each spawn.
  //
  // INTEGRATION (candidate 4b) LEFT THIS EXACTLY AS HF-477 AUTHORED IT, and
  // records what it measured rather than tuning it: see the OPEN row in
  // `docs/evidence/pass94/candidate4b/REPORT.md`. This pier grazes spawn
  // (0, -26)'s last sight line over 18 m by 2 cm, and moving it anywhere else
  // along its own deck (scanned at 0.2 m over the full span) does not resolve
  // the pair of bounds - the other half of that conflict is a 63.3 m
  // through-house diagonal from spawn (0, 26) that this pier never touched.
  //
  // INTEGRATION (candidate 4b) CHANGED ONE NUMBER: the pier is `bal.postSize`,
  // the 0.16 m timber post this file already authors for a deck, instead of the
  // 0.24 m literal HF-477 introduced alongside it. At 0.24 m the column grazed
  // spawn (0, -26)'s last sight line over 18 m by TWO CENTIMETRES - inside
  // `clearLine`'s own 0.05 m padding - and the fidelity gate's exposure FLOOR
  // (half the street's length: a spawn you cannot see half a street from is a
  // cupboard) failed at 17.72 m where every other spawn on that team reaches
  // 22-30 m. Deleting the pier was measured and is NOT the fix - it opens a
  // 63 m diagonal at the other end - and scanning its position along the deck
  // at 0.2 m over the full span never satisfied both bounds. The post SIZE is
  // the free variable, and 0.16 m is the size this file already uses.
  pair(builder, 'balcony post 0',
    [bal.centreX, (bal.deckTop - bal.slabThickness) / 2, bal.outboardZ + bal.postSize / 2],
    [bal.postSize, bal.deckTop - bal.slabThickness, bal.postSize], m.trim,
    { ballisticMaterial: 'wood' });
  // Rails, 1.1 m over the deck: over LOW_COVER so they break a crouched line,
  // under the 1.65 m standing eye so a standing player shoots across them.
  // The doorway is in the wall, so no rail crosses it.
  pair(builder, 'balcony rail outboard',
    [bal.centreX, bal.deckTop + bal.railHeight / 2, bal.outboardZ + bal.railThickness / 2],
    [bal.width, bal.railHeight, bal.railThickness], m.trim,
    { ballisticMaterial: 'wood' });
  // The return at the far end runs the deck's whole depth. The one at the
  // flight's end does NOT: authored full, it stood 1.1 m tall across the top
  // of the exterior flight and the no-jump walk probe stalled 0.4 m short of
  // the deck - a staircase arriving at a railing. A deck's stair opening has
  // no rail across it, so this end keeps only the 0.6 m of return the flight
  // does not occupy, which is the newel beside the opening.
  pair(builder, 'balcony rail return far',
    [bal.centreX + (bal.width - bal.railThickness) / 2,
      bal.deckTop + bal.railHeight / 2, balDeckZ],
    [bal.railThickness, bal.railHeight, bal.projection], m.trim,
    { ballisticMaterial: 'wood' });
  const balconyNewelDepth = yardStairOuterZ - bal.outboardZ;
  pair(builder, 'balcony rail newel',
    [bal.centreX - (bal.width - bal.railThickness) / 2,
      bal.deckTop + bal.railHeight / 2, bal.outboardZ + balconyNewelDepth / 2],
    [bal.railThickness, bal.railHeight, balconyNewelDepth], m.trim,
    { ballisticMaterial: 'wood' });
  pair(builder, 'balcony rail cap',
    [bal.centreX, bal.deckTop + bal.railHeight - 0.05, bal.outboardZ + bal.railThickness / 2],
    [bal.width + 0.08, 0.10, bal.railThickness + 0.06], m.trim,
    { solid: false, shots: false, cast: true });
  // ---- HF-477: THE UNDERCROFT UNDER THE DECK -------------------------------
  // FINDINGS Q3, VERIFIED on `nt2025-street-boii.jpg`: the deck sits "over a
  // recessed ground-floor undercroft" - the ground plane under it is PAVED and
  // in shadow, not lawn running up to a pair of posts. The recess itself is
  // already real geometry (the deck's soffit at 3.1 m with the house wall
  // behind it and the two corner posts in front), so what was missing is the
  // floor: this is the paving that makes it read as a sheltered space rather
  // than as a slab hanging over grass. Presentation only, at the same 0.02 m
  // decal rise and the same -1 tier the driveway apron uses, so no collider,
  // shot surface or lawn keep-out moves.
  // It stops 2.7 m short of the deck's garage-end corner because the back
  // door's own step (`yard porch`) already paves that run and is a SOLID
  // 0.2 m body; two aprons over one patch of ground is the z-fight this
  // arena's HF-434 tier exists to avoid, and the honest fix is not to author
  // the second one. Same plane and thickness as the yard's other pads
  // (`yard butt pad`, `yard patio table slab`), which is the pattern here for
  // a hard standing laid on the lawn.
  // Its depth is the deck's projection MINUS 0.04 m, and the 0.04 is not
  // rounding: run to the full projection and its outboard 0.1 m laps under the
  // house's own ground-floor slab, whose top is at the same 0.08 m - which the
  // coplanar instrument measured as a HOUSE-INTERIOR-FINDING on the first
  // build. It now stops 0.02 m short of the back wall plane.
  const undercroftRun: [number, number] = [BALCONY_X0 - 0.2, -2.7];
  pair(builder, 'balcony undercroft paving',
    [(undercroftRun[0] + undercroftRun[1]) / 2, 0.04, balDeckZ - 0.02],
    [undercroftRun[1] - undercroftRun[0], 0.08, bal.projection - 0.04], m.drive,
    { solid: false, shots: false, cast: false });
  // ---- HF-477: THE CIRCULAR PATIO AT THE FOOT OF THE FLIGHT -----------------
  // Same frame, same sentence: "a circular concrete patio sits at the foot of
  // the flight." Everything in this arena is an axis-aligned box (see the file
  // header - a yawed solid measured 0.11 coverage against its own mesh on
  // map3), so the circle is a BANDED APPROXIMATION: seven z-bands whose widths
  // are the chords of a real circle of PATIO_RADIUS, sampled at each band's
  // mid-line. Presentation only and 0.14 m thick like every other apron decal,
  // so a stepped edge costs nothing but a silhouette - and at 0.35 m bands on a
  // 2.45 m radius the step is under a boot width.
  //
  // THE RADIUS IS SET BY WHAT IS ALREADY IN THE YARD, not by taste. The flight
  // lands at x = -9.4 in a 2.8 m slot: the destructible shed's registered
  // footprint ends at x = -11.9 (`shedPlacementFootprint`, quoted in `yard()`)
  // and the water butt and its pad start at x = -9.2 / z = -26.7. 1.9 m clears
  // the shed by 0.6 m, the butt pad by 0.1 m and the house corner by 0.75 m,
  // and still puts the stair foot inside the disc.
  const PATIO_RADIUS = 1.9;
  const PATIO_BANDS = 7;
  const patioCentreX = NUKETOWN2_YARD_STAIR.footX;
  const patioCentreZ = HOUSE_BACK_Z - 0.3;
  for (let index = 0; index < PATIO_BANDS; index += 1) {
    const t0 = -1 + (2 * index) / PATIO_BANDS;
    const t1 = -1 + (2 * (index + 1)) / PATIO_BANDS;
    const mid = (t0 + t1) / 2;
    const chordHalf = PATIO_RADIUS * Math.sqrt(Math.max(0, 1 - mid * mid));
    pair(builder, `balcony stair patio band ${index}`,
      [patioCentreX, 0.04, patioCentreZ + PATIO_RADIUS * mid],
      [chordHalf * 2, 0.08, PATIO_RADIUS * (t1 - t0)], m.drive,
      { solid: false, shots: false, cast: false });
  }

  // ---- the exterior flight, balcony -> back lawn ---------------------------
  // Same construction as the interior stair: presentation treads, and ONE
  // collision-only rotated slab that owns movement for the whole flight.
  const yardStair = NUKETOWN2_YARD_STAIR;
  const yardRampMaterial = new THREE.MeshBasicMaterial({ visible: false });
  yardRampMaterial.name = 'nuketown2-yard-stair-collision-authority';
  const yardRampLength = Math.hypot(yardStair.rampRun, yardStair.rampRise);
  // The slab overlaps the deck and the lawn equally, so the overlaps cancel
  // and its centre is simply the midpoint of the flight.
  const yardRampCentreX = (yardStair.topX + yardStair.footX) / 2;
  const yardRampCentreY = yardStair.rampRise / 2
    - Math.cos(yardStair.rampAngleRadians) * yardStair.rampThickness / 2;
  // The flight runs along x, so its slab is pitched about Z - and unlike the
  // interior ramp's pitch about X, a reflection in x DOES negate a rotation
  // about z (M R_z(t) M = R_z(-t) for M = diag(-1, 1, 1)). Hence the explicit
  // handedness factor: without it the mirrored flight would rise the wrong way
  // and the walk probe below would fail on a ramp that looked correct.
  const yardRampPitch = NUKETOWN2_HANDEDNESS * yardStair.rampAngleRadians;
  const northYardRamp = box(builder, 'nuketown2 north yard stair ramp',
    [nuketown2HandedX(yardRampCentreX), yardRampCentreY, yardStair.centreZ],
    [yardRampLength, yardStair.rampThickness, yardStair.width], yardRampMaterial,
    { rotation: [0, 0, yardRampPitch] });
  const southYardRamp = box(builder, 'nuketown2 south yard stair ramp',
    [-nuketown2HandedX(yardRampCentreX), yardRampCentreY, -yardStair.centreZ],
    [yardRampLength, yardStair.rampThickness, yardStair.width], yardRampMaterial,
    { rotation: [0, 0, -yardRampPitch] });
  northYardRamp.userData.collisionOnly = true;
  southYardRamp.userData.collisionOnly = true;
  // As with the interior ramp: the lightweight axis-aligned `colliders`
  // channel would describe this pitched slab as a solid block, so the exact
  // rotated OBBs are kept in physicsColliders (the live authority) only.
  const yardRampBounds = new Set(builder.physicsColliders.slice(-2));
  builder.colliders = builder.colliders.filter((bounds) => !yardRampBounds.has(bounds));
  for (let i = 0; i < yardStair.risers - 1; i += 1) {
    const treadTop = bal.deckTop - yardStair.riser * (i + 1);
    pair(builder, `yard stair ${i}`,
      [yardStair.topX - yardStair.going * (i + 0.5), treadTop - 0.08 / 2, yardStair.centreZ],
      [yardStair.going, 0.08, yardStair.width], m.trim,
      { solid: false, shots: false, cast: true });
  }

  // ---- HF-465: the front ledge and the porch canopy ------------------------
  // PASS 94 INTEGRATION, and it is the same defect HF-467 was written to kill.
  // These bodies and the balcony above landed in a lane that did not carry the
  // ballistics work, so they reached the merged head unrated and the shared
  // NAME rules decided their material for them. Measured on the merged build,
  // before this block: `porch canopy head` matched nothing and fell through to
  // `reinforced` - the classifier's failure sentinel - which is what reds
  // `gives every registered arena an explicit fallback ceiling that only
  // shrinks`; `porch canopy wing 0/1` matched the JETLINER rule on the word
  // "wing" and were rated as aircraft bodywork; `porch canopy post 0/1` and
  // every balcony rail and post matched "post"/"rail" and were rated
  // structural steel; and `window ledge sill` matched "window" and was rated
  // GLASS, which is the exact misrating HF-467 had just repaired on the house's
  // own window sills. Every one of them is painted timber trim built from
  // `m.trim`, so every one of them is now rated `wood` explicitly. Nothing
  // moved and no threshold changed: the geometry is the lane's, the material
  // is what it was always made of.
  // The two rungs that make the upper front window a two-way opening. Heights
  // and plan overlaps are derived in NUKETOWN2_PORCH_CANOPY /
  // NUKETOWN2_WINDOW_LEDGE; the gate re-derives the chain rather than
  // restating it.
  const canopy = NUKETOWN2_PORCH_CANOPY;
  const canopyZ = HOUSE_FRONT_Z + canopy.projection / 2;
  // TWO WINGS AND A RAISED HEAD BAY, and the split is not decoration.
  // Authored as one 2.15 m slab the canopy's soffit sat at 1.97 m over the
  // front DOOR's own approach - under the 2.24 m (capsule + autostep up-cast)
  // this map holds every opening to - and the new front-chain gate caught it.
  // The bay over the doorway is therefore lifted until its soffit is the
  // door's own head band, which is what a porch gable looks like anyway; the
  // wings stay at 2.15 because they are the rung the climb chain uses.
  const canopyDoor = doorRun('house front door');
  for (const [index, run] of ([
    [canopy.centreX - canopy.width / 2, canopyDoor[0]],
    [canopyDoor[1], canopy.centreX + canopy.width / 2],
  ] as const).entries()) {
    pair(builder, `porch canopy wing ${index}`,
      [(run[0] + run[1]) / 2, canopy.top - canopy.thickness / 2, canopyZ],
      [run[1] - run[0], canopy.thickness, canopy.projection], m.trim,
      { ballisticMaterial: 'wood' });
  }
  pair(builder, 'porch canopy head',
    [(canopyDoor[0] + canopyDoor[1]) / 2, DOOR_HEAD_Y + canopy.thickness / 2, canopyZ],
    [canopyDoor[1] - canopyDoor[0], canopy.thickness, canopy.projection], m.trim,
    { ballisticMaterial: 'wood' });
  // HF-477: NO POSTS. The reference's porch is a cantilevered roof plane
  // (FINDINGS Q3), and the two posts this arena carried were R4's inference,
  // not a measurement. They are removed rather than hidden: the slab's inboard
  // face sits on the house's own front wall plane, so nothing is floating, and
  // the front approach is now clear the way the reference frame shows it.
  // INTEGRATION (candidate 4b) reinstated them as an experiment against the
  // standing-eye-line ceiling and MEASURED THAT THEY CHANGE NEITHER BOUND
  // (63.32 m and 17.72 m both unmoved), so HF-477's cantilever stands.
  const ledge = NUKETOWN2_WINDOW_LEDGE;
  pair(builder, 'window ledge sill',
    [ledge.centreX, ledge.top - ledge.thickness / 2, HOUSE_FRONT_Z + ledge.projection / 2],
    [ledge.width, ledge.thickness, ledge.projection], m.trim,
    { ballisticMaterial: 'wood' });

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
  // --- HF-440 Cycle 2: Interior lighting look & domestic dressing -----------
  // Ceiling light practical fixtures (emissive lenses driven above bloom threshold):
  // Ground front room:
  pair(builder, 'house front ceiling light housing', [-3.2, GROUND_H - 0.04, -13.2], [1.1, 0.06, 0.7], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house front ceiling light lens', [-3.2, GROUND_H - 0.07, -13.2], [0.95, 0.02, 0.55], m.warmLight,
    { solid: false, shots: false, cast: false });
  // Ground back room:
  pair(builder, 'house back ceiling light housing', [-1.25, GROUND_H - 0.04, -19.5], [1.1, 0.06, 0.7], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house back ceiling light lens', [-1.25, GROUND_H - 0.07, -19.5], [0.95, 0.02, 0.55], m.warmLight,
    { solid: false, shots: false, cast: false });
  // Upper front sniper room:
  pair(builder, 'house upper front ceiling light housing', [-1.25, ROOF_Y0 - 0.04, -13.0], [1.1, 0.06, 0.7], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper front ceiling light lens', [-1.25, ROOF_Y0 - 0.07, -13.0], [0.95, 0.02, 0.55], m.warmLight,
    { solid: false, shots: false, cast: false });
  // Upper back room:
  pair(builder, 'house upper back ceiling light housing', [-1.25, ROOF_Y0 - 0.04, -19.5], [1.1, 0.06, 0.7], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper back ceiling light lens', [-1.25, ROOF_Y0 - 0.07, -19.5], [0.95, 0.02, 0.55], m.warmLight,
    { solid: false, shots: false, cast: false });

  // Doorway architrave casings (symmetrical trim on both jambs and head):
  // Ground partition door (door height is 2.4 m):
  pair(builder, 'house ground door casing left', [-2.7 - 0.9 - 0.03, DOOR_HEAD_Y / 2, PARTITION_Z], [0.06, DOOR_HEAD_Y, WALL_T + 0.04], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house ground door casing right', [-2.7 + 0.9 + 0.03, DOOR_HEAD_Y / 2, PARTITION_Z], [0.06, DOOR_HEAD_Y, WALL_T + 0.04], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house ground door casing head', [-2.7, DOOR_HEAD_Y + 0.05, PARTITION_Z], [1.92, 0.10, WALL_T + 0.04], m.trim,
    { solid: false, shots: false, cast: true });
  // Upper partition door (door height is 2.4 m, well below 6.2 ceiling):
  pair(builder, 'house upper door casing left', [-2.7 - 0.9 - 0.03, UPPER_Y0 + DOOR_HEAD_Y / 2, PARTITION_Z], [0.06, DOOR_HEAD_Y, WALL_T + 0.04], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house upper door casing right', [-2.7 + 0.9 + 0.03, UPPER_Y0 + DOOR_HEAD_Y / 2, PARTITION_Z], [0.06, DOOR_HEAD_Y, WALL_T + 0.04], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house upper door casing head', [-2.7, UPPER_Y0 + DOOR_HEAD_Y + 0.05, PARTITION_Z], [1.92, 0.10, WALL_T + 0.04], m.trim,
    { solid: false, shots: false, cast: true });

  // Baseboard trim molding along ground floor partitions and exterior walls:
  const baseW0 = -2.7 - 0.9 - (HOUSE_X0 + WALL_T);
  pair(builder, 'house ground baseboard north west', [(HOUSE_X0 + WALL_T + -3.6) / 2, 0.07, PARTITION_Z - WALL_T / 2 - 0.015], [baseW0, 0.14, 0.03], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house ground baseboard south west', [(HOUSE_X0 + WALL_T + -3.6) / 2, 0.07, PARTITION_Z + WALL_T / 2 + 0.015], [baseW0, 0.14, 0.03], m.trim,
    { solid: false, shots: false, cast: false });
  const baseW1 = HOUSE_X1 - WALL_T - (-1.8);
  pair(builder, 'house ground baseboard north east', [(-1.8 + HOUSE_X1 - WALL_T) / 2, 0.07, PARTITION_Z - WALL_T / 2 - 0.015], [baseW1, 0.14, 0.03], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house ground baseboard south east', [(-1.8 + HOUSE_X1 - WALL_T) / 2, 0.07, PARTITION_Z + WALL_T / 2 + 0.015], [baseW1, 0.14, 0.03], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house ground baseboard west wall', [HOUSE_X0 + WALL_T / 2 + 0.015, 0.07, zMid], [0.03, 0.14, HOUSE_DEPTH - WALL_T * 2], m.trim,
    { solid: false, shots: false, cast: false });
  // HF-440 Cycle 3: Interior drywall lining on ground floor exterior return walls
  // Prevents exterior board siding from showing inside domestic kitchen/living rooms
  pair(builder, 'house ground west wall drywall lining',
    [HOUSE_X0 + WALL_T + 0.01, (GROUND_H - 0.08) / 2, zMid],
    [0.02, GROUND_H - 0.08, HOUSE_DEPTH - WALL_T * 2], m.interior,
    { solid: false, shots: false, cast: false });
  [[HOUSE_BACK_Z, LINK_DOOR[0]], [LINK_DOOR[1], HOUSE_FRONT_Z]].forEach((run, index) => {
    pair(builder, `house ground east wall drywall lining ${index}`,
      [HOUSE_X1 - WALL_T - 0.01, (GROUND_H - 0.08) / 2, (run[0]! + run[1]!) / 2],
      [0.02, GROUND_H - 0.08, run[1]! - run[0]!], m.interior,
      { solid: false, shots: false, cast: false });
  });
  // Interior drywall lining on ground floor front and back walls:
  // Completes 4-wall domestic interior drywall finish for living room and kitchen
  // Starts and ends inboard of the side wall linings (LINING_T = 0.02) to avoid corner overlap
  const LINING_T = 0.02;
  const groundLiningX0 = HOUSE_X0 + WALL_T + LINING_T;
  const groundLiningX1 = HOUSE_X1 - WALL_T - LINING_T;
  const frontLiningRuns: [number, number][] = [
    [groundLiningX0, FRONT_WINDOW_A[0]],
    [FRONT_WINDOW_A[1], FRONT_DOOR[0]],
    [FRONT_DOOR[1], FRONT_WINDOW_B[0]],
    [FRONT_WINDOW_B[1], groundLiningX1],
  ];
  frontLiningRuns.forEach((run, index) => {
    pair(builder, `house ground front wall drywall lining ${index}`,
      [(run[0] + run[1]) / 2, (GROUND_H - 0.08) / 2, zFront - WALL_T / 2 - 0.01],
      [run[1] - run[0], GROUND_H - 0.08, 0.02], m.interior,
      { solid: false, shots: false, cast: false });
  });
  const backLiningRuns: [number, number][] = [
    [groundLiningX0, BACK_DOOR[0]],
    [BACK_DOOR[1], groundLiningX1],
  ];
  backLiningRuns.forEach((run, index) => {
    pair(builder, `house ground back wall drywall lining ${index}`,
      [(run[0] + run[1]) / 2, (GROUND_H - 0.08) / 2, zBack + WALL_T / 2 + 0.01],
      [run[1] - run[0], GROUND_H - 0.08, 0.02], m.interior,
      { solid: false, shots: false, cast: false });
  });
  // Upper floor bedroom interior drywall lining (west and east walls):
  // Runs within the front and back rooms between partition and outer linings to avoid corner overlaps
  const upperFrontZ0 = PARTITION_Z + WALL_T / 2;
  const upperFrontZ1 = HOUSE_FRONT_Z - WALL_T - LINING_T;
  const upperFrontDepth = upperFrontZ1 - upperFrontZ0;
  const upperFrontMidZ = (upperFrontZ0 + upperFrontZ1) / 2;
  const upperBackZ0 = HOUSE_BACK_Z + WALL_T + LINING_T;
  const upperBackZ1 = PARTITION_Z - WALL_T / 2;
  const upperBackDepth = upperBackZ1 - upperBackZ0;
  const upperBackMidZ = (upperBackZ0 + upperBackZ1) / 2;
  const upperH = ROOF_Y0 - UPPER_Y0;
  const upperMidY = (UPPER_Y0 + ROOF_Y0) / 2;

  pair(builder, 'house upper west wall drywall front',
    [HOUSE_X0 + WALL_T + 0.01, upperMidY, upperFrontMidZ],
    [0.02, upperH, upperFrontDepth], m.interior,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper west wall drywall back',
    [HOUSE_X0 + WALL_T + 0.01, upperMidY, upperBackMidZ],
    [0.02, upperH, upperBackDepth], m.interior,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper east wall drywall front',
    [HOUSE_X1 - WALL_T - 0.01, upperMidY, upperFrontMidZ],
    [0.02, upperH, upperFrontDepth], m.interior,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house upper east wall drywall back',
    [HOUSE_X1 - WALL_T - 0.01, upperMidY, upperBackMidZ],
    [0.02, upperH, upperBackDepth], m.interior,
    { solid: false, shots: false, cast: false });
  // HF-440 Cycle 3: Interior partition wall domestic dressing
  // Breaks up massive blank foreground drywall surface with framed artwork, clock & switch
  // Framed vintage wall art on the large foreground partition:
  pair(builder, 'house living art frame', [-5.1, 1.75, PARTITION_Z - WALL_T / 2 - 0.015], [1.20, 0.80, 0.03], m.fence,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house living art canvas', [-5.1, 1.75, PARTITION_Z - WALL_T / 2 - 0.022], [1.06, 0.66, 0.015], m.sign,
    { solid: false, shots: false, cast: false });
  // Mid-century starburst wall clock:
  pair(builder, 'house living wall clock rim', [-3.95, 2.05, PARTITION_Z - WALL_T / 2 - 0.015], [0.32, 0.32, 0.03], m.chrome,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house living wall clock face', [-3.95, 2.05, PARTITION_Z - WALL_T / 2 - 0.022], [0.26, 0.26, 0.015], m.trim,
    { solid: false, shots: false, cast: false });
  // Light switch plate beside the passage architrave:
  pair(builder, 'house living switch plate', [-3.45, 1.25, PARTITION_Z - WALL_T / 2 - 0.01], [0.09, 0.14, 0.015], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house living switch toggle', [-3.45, 1.25, PARTITION_Z - WALL_T / 2 - 0.018], [0.02, 0.04, 0.012], m.chrome,
    { solid: false, shots: false, cast: false });
  // Architectural crown molding along the partition-ceiling joint:
  pair(builder, 'house living crown molding west', [(HOUSE_X0 + -3.6) / 2, 2.93, PARTITION_Z - WALL_T / 2 - 0.02], [baseW0, 0.06, 0.04], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'house living crown molding east', [(-1.8 + HOUSE_X1 - WALL_T) / 2, 2.93, PARTITION_Z - WALL_T / 2 - 0.02], [baseW1, 0.06, 0.04], m.trim,
    { solid: false, shots: false, cast: false });

  // Domestic kitchen & living dressing:
  pair(builder, 'house kitchen counter top', [-4.8, LOW_COVER + 0.02, HOUSE_FRONT_Z - 2.8], [3.28, 0.05, 1.08], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house kitchen upper cabinets', [HOUSE_X0 + 0.55, 2.15, HOUSE_FRONT_Z - 2.8], [0.50, 0.80, 2.4], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house living bench top', [1.5, LOW_COVER + 0.02, HOUSE_BACK_Z + 2.4], [3.08, 0.05, 1.08], m.interiorFloor,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house living shelf', [HOUSE_X1 - WALL_T - 0.3, 1.25, HOUSE_BACK_Z + 3.0], [0.55, 2.10, 1.80], m.trim,
    { solid: false, shots: false, cast: true });

  // Upper floor stairwell guard rail & balustrade:
  pair(builder, 'house stair rail post 0', [STAIR_X1 + 0.04, UPPER_Y0 + 0.50, -16.5], [0.08, 1.00, 0.08], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house stair rail post 1', [STAIR_X1 + 0.04, UPPER_Y0 + 0.50, STAIRWELL_Z0], [0.08, 1.00, 0.08], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house stair rail bar', [STAIR_X1 + 0.04, UPPER_Y0 + 0.92, (-16.5 + STAIRWELL_Z0) / 2], [0.06, 0.08, -16.5 - STAIRWELL_Z0], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'house stair rail mid bar', [STAIR_X1 + 0.04, UPPER_Y0 + 0.48, (-16.5 + STAIRWELL_Z0) / 2], [0.04, 0.04, -16.5 - STAIRWELL_Z0], m.trim,
    { solid: false, shots: false, cast: true });
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

  // The garage has the same independent raised interior slab as the houses.
  pair(builder, 'garage floor', [cx, GROUND_FLOOR_TOP - GROUND_FLOOR_T / 2, zMid],
    [GARAGE_WIDTH, GROUND_FLOOR_T, GARAGE_DEPTH], m.garageFloor, { cast: false });
  pair(builder, 'garage roof', [cx, H + 0.15, zMid], [GARAGE_WIDTH, 0.3, GARAGE_DEPTH], m.roof);
  pair(builder, 'garage wall outboard', [GARAGE_X1 - WALL_T / 2, H / 2, zMid], [WALL_T, H, GARAGE_DEPTH], m.garageSiding);

  // Shared wall with the house, with an internal doorway so the garage is a
  // route into the house rather than a dead-end box. Matches the hole cut in
  // the house's own east wall.
  const LINK_DOOR = doorRun('house garage link');
  [[GARAGE_BACK_Z, LINK_DOOR[0]], [LINK_DOOR[1], GARAGE_FRONT_Z]].forEach((run, index) => {
    pair(builder, `garage link pier ${index}`,
      [GARAGE_X0 + WALL_T / 2, H / 2, (run[0]! + run[1]!) / 2], [WALL_T, H, run[1]! - run[0]!], m.garageSiding);
  });

  // Garage door: a 3.5 m opening onto the driveway apron, headed at 3.0 m.
  const DOOR = doorRun('garage vehicle door');
  [[GARAGE_X0 + WALL_T, DOOR[0]], [DOOR[1], GARAGE_X1 - WALL_T]].forEach((run, index) => {
    pair(builder, `garage front pier ${index}`,
      [(run[0]! + run[1]!) / 2, H / 2, zFront], [run[1]! - run[0]!, H, WALL_T], m.garageSiding);
  });
  // The door LEAF, parked in its head: the shipped map's chrome, and the piece
  // that makes a 3.5 m hole read as a garage rather than as a missing wall.
  pair(builder, 'garage door head', [(DOOR[0] + DOOR[1]) / 2, H - 0.4, zFront], [DOOR[1] - DOOR[0], 0.8, WALL_T], m.garageDoor);

  // Rear door into the back yard.
  const REAR = doorRun('garage rear door');
  [[GARAGE_X0 + WALL_T, REAR[0]], [REAR[1], GARAGE_X1 - WALL_T]].forEach((run, index) => {
    pair(builder, `garage back pier ${index}`,
      [(run[0]! + run[1]!) / 2, H / 2, zBack], [run[1]! - run[0]!, H, WALL_T], m.garageSiding);
  });
  pair(builder, 'garage back head', [(REAR[0] + REAR[1]) / 2, H - 0.4, zBack], [REAR[1] - REAR[0], 0.8, WALL_T], m.trim);

  // Workbench: the one body that makes the garage a position rather than a
  // corridor between three doors. HF-432 item 4 moved it from (7.6, -21.6) -
  // where it lay ACROSS the rear door's own threshold, so a standing capsule
  // walking in from the yard hit it inside the doorway - onto the outboard
  // wall, where a workbench belongs.
  pair(builder, 'garage bench', [8.1, LOW_COVER / 2, GARAGE_BACK_Z + 3.5], [1.4, LOW_COVER, 4.0], m.interior);
  // --- HF-440 Cycle 2: Garage lighting, rafters, door hardware & workshop ---
  // Overhead fluorescent dual-tube light fixture:
  pair(builder, 'garage tube light housing', [cx, H - 0.12, zMid], [0.35, 0.08, 2.4], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'garage tube light tube 0', [cx - 0.08, H - 0.20, zMid], [0.06, 0.06, 2.2], m.coldLight,
    { solid: false, shots: false, cast: false });
  pair(builder, 'garage tube light tube 1', [cx + 0.08, H - 0.20, zMid], [0.06, 0.06, 2.2], m.coldLight,
    { solid: false, shots: false, cast: false });

  // Roll-up garage door tracks and coiled drum:
  pair(builder, 'garage door track left', [DOOR[0] + 0.04, 1.5, zFront + 0.08], [0.08, 3.0, 0.08], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'garage door track right', [DOOR[1] - 0.04, 1.5, zFront + 0.08], [0.08, 3.0, 0.08], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'garage door drum', [cx, H - 0.35, zFront + 0.22], [DOOR[1] - DOOR[0] + 0.2, 0.35, 0.35], m.trim,
    { solid: false, shots: false, cast: true });

  // Exposed ceiling rafters (span inside wall envelope, top below 3.4 m wall):
  for (const rz of [-17.5, -19.5, -21.5]) {
    pair(builder, `garage rafter ${rz}`, [cx, H - 0.12, rz], [GARAGE_WIDTH - WALL_T * 2 - 0.1, 0.16, 0.08], m.trim,
      { solid: false, shots: false, cast: false });
  }

  // Workbench enhancements (wood worktop, lower tool shelf, pegboard, vice):
  pair(builder, 'garage bench top', [8.1, LOW_COVER + 0.02, GARAGE_BACK_Z + 3.5], [1.46, 0.05, 4.06], m.interiorFloor,
    { solid: false, shots: false, cast: true });
  pair(builder, 'garage bench lower shelf', [8.1, 0.20, GARAGE_BACK_Z + 3.5], [1.20, 0.04, 3.80], m.trim,
    { solid: false, shots: false, cast: false });
  pair(builder, 'garage tool pegboard', [GARAGE_X1 - WALL_T / 2 - 0.02, 1.95, GARAGE_BACK_Z + 3.5], [0.04, 1.20, 3.80], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'garage bench vice', [7.6, LOW_COVER + 0.12, GARAGE_BACK_Z + 1.8], [0.22, 0.18, 0.22], m.trim,
    { solid: false, shots: false, cast: true });
}

/**
 * The moving truck, in the cul-de-sac turning head: centred on the world origin
 * ALONG the street, and 0.076 L SOUTH of the road centre-line across it, where
 * the reference has it (HF-432 item 5). OPEN cover in the reference's sense: a
 * deck you can stand on, a roof over you, and one mouth at the -x end you walk
 * in through. The 2x-damage core sits above its cargo-box roof and follows the
 * truck's own `z`.
 *
 * The cab is CLOSED: a solid body, which is what the reference's minimap draws
 * and what makes the truck cover from one side and a room from the other.
 */
function truck(builder: Builder, m: Nuketown2Materials): void {
  const t = NUKETOWN2_CENTRAL_TRUCK;
  const W = t.width;
  const T = 0.15;
  const BOX_WALL_TOP = t.roofY - 0.05;
  const boxHalf = t.boxLength / 2;
  const flank = W / 2 - T / 2;

  // Cab, solid closed cover, on the +x end - which under HF-477 is the end
  // that faces DOWN THE STEM, so the truck is nosed out of the cul-de-sac
  // exactly as `nt2025-aerial-boii.jpg` has it. Every x below is now an offset
  // from `t.x`, the cargo box's own centre; they used to be absolute because
  // that centre was the world origin.
  streetVehicle(builder, 'truck cab', [t.cabX, t.cabRoofY / 2, t.z], [t.cabLength, t.cabRoofY, W], m.truckCab);
  // Cargo box: deck, bulkhead against the cab, two flanks with a walk-through
  // opening each, and a roof. The -x end is OPEN, which is the rear mouth.
  streetVehicle(builder, 'truck deck', [t.x, t.deckY - T / 2, t.z], [t.boxLength, T, W], m.truckBox, { cast: false });
  streetVehicle(builder, 'truck box bulkhead', [t.x + boxHalf - T / 2, (t.deckY + BOX_WALL_TOP) / 2, t.z],
    [T, BOX_WALL_TOP - t.deckY, W], m.truckBox);
  // HF-436, owner after PASS 91: "one of the trucks in the street needs a side
  // entrance so you can go in over the left side, right side, or the end, more
  // similar to the actual Nuketown map." Each flank gets a 1.6 x 1.9 m opening
  // (both over the briefed 1.0 x 1.9 minimum), floored at the deck and
  // headed at deckY + 1.9, so a standing capsule walks in from either side.
  // The rear mouth and the roof deck are untouched, and so are the 2x core
  // seat above the roof and the north-flank climb treads (they stand at
  // x >= 4.6, clear of the opening at x [-0.8, 0.8]).
  const SIDE_OPENING_HALF = 0.8;
  const HEADER_Y = t.deckY + 1.9;
  for (const [index, side] of [-1, 1].entries()) {
    const fz = t.z + side * flank;
    [[-boxHalf, -SIDE_OPENING_HALF], [SIDE_OPENING_HALF, boxHalf - T]].forEach((run, pier) => {
      streetVehicle(builder, `truck box flank ${index} pier ${pier}`,
        [t.x + (run[0] + run[1]) / 2, (t.deckY + BOX_WALL_TOP) / 2, fz],
        [run[1] - run[0], BOX_WALL_TOP - t.deckY, T], m.truckBox);
    });
    streetVehicle(builder, `truck box flank ${index} header`,
      [t.x, (HEADER_Y + BOX_WALL_TOP) / 2, fz],
      [SIDE_OPENING_HALF * 2, BOX_WALL_TOP - HEADER_Y, T], m.truckBox);
  }
  streetVehicle(builder, 'truck box roof', [t.x, t.roofY - T / 2, t.z], [t.boxLength, T, W], m.truckBox);
  // Front chrome bumper, grille, headlights, and cab windshield:
  streetVehicle(builder, 'truck bumper front', [t.cabX + t.cabLength / 2 + 0.12, 0.35, t.z],
    [0.22, 0.30, W + 0.12], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
  streetVehicle(builder, 'truck grille', [t.cabX + t.cabLength / 2 + 0.02, 1.45, t.z],
    [0.06, 0.70, W - 0.7], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
  streetVehicle(builder, 'truck windshield', [t.cabX + t.cabLength / 2 + 0.02, 2.25, t.z],
    [0.06, 0.65, W - 0.4], m.carGlass, { solid: false, shots: false, cast: false, presentationOnly: true });
  for (const side of [-1, 1]) {
    streetVehicle(builder, `truck headlight ${side}`,
      [t.cabX + t.cabLength / 2 + 0.04, 0.95, t.z + side * (W / 2 - 0.35)], [0.06, 0.20, 0.20], m.headlight,
      { solid: false, shots: false, cast: false, presentationOnly: true });
    streetVehicle(builder, `truck taillight ${side}`,
      [t.x - boxHalf - 0.04, 0.85, t.z + side * (W / 2 - 0.25)], [0.06, 0.22, 0.16], m.taillight,
      { solid: false, shots: false, cast: false, presentationOnly: true });
  }
  streetVehicle(builder, 'truck rear step bar', [t.x - boxHalf - 0.10, 0.45, t.z],
    [0.18, 0.14, W - 0.2], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
  // Wheels: keep the exact 3 expected asymmetric meshes plus decorative hubcaps and arches
  for (const [index, x] of [t.x - boxHalf + 1.1, t.x + boxHalf + 1.0, t.cabX + 1.8].entries()) {
    streetVehicle(builder, `truck wheel ${index}`, [x, 0.42, t.z], [0.9, 0.84, W + 0.2], m.rubber,
      { solid: false, shots: false, cast: false });
    for (const side of [-1, 1]) {
      streetVehicle(builder, `truck hubcap ${index} ${side}`, [x, 0.42, t.z + side * (W / 2 + 0.12)],
        [0.38, 0.38, 0.03], m.chrome, { solid: false, shots: false, cast: false, presentationOnly: true });
      streetVehicle(builder, `truck wheel arch ${index} ${side}`, [x, 0.88, t.z + side * (W / 2 + 0.01)],
        [1.06, 0.10, 0.06], m.truckBox, { solid: false, shots: false, cast: true, presentationOnly: true });
    }
  }
  // ROOF ACCESS. See TRUCK_ROOF_STEPS: the 2x-damage core rides this roof, and
  // a roof nothing can climb is a feature that does not exist.
  for (const [index, [top, x0, x1]] of TRUCK_ROOF_STEPS.entries()) {
    streetVehicle(builder, `truck roof step ${index}`, [t.x + (x0 + x1) / 2, top / 2, t.z - (W / 2 + 2.45) / 2],
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
  // Presentation only: no collider, no shot surface, no shadow - the coach's
  // solid body underneath is unchanged, so cover and ballistics do not move.
  for (const [index, side] of [-1, 1].entries()) {
    streetVehicle(builder, `coach waist stripe ${index}`, [c.x, 1.35, c.z + side * c.width / 2],
      [c.length - 0.6, 0.5, 0.08], m.busTrim, { solid: false, shots: false, cast: false });
    streetVehicle(builder, `coach window band ${index}`, [c.x, 2.25, c.z + side * c.width / 2],
      [c.length - 0.6, 0.9, 0.08], m.coachGlass, { solid: false, shots: false, cast: false });
  }
  streetVehicle(builder, 'coach bumper front', [c.x + c.length / 2 + 0.1, 0.35, c.z],
    [0.22, 0.30, c.width + 0.12], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
  streetVehicle(builder, 'coach bumper rear', [c.x - c.length / 2 - 0.1, 0.35, c.z],
    [0.22, 0.30, c.width + 0.12], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
  // Chrome front grille bar & dual headlights/taillights:
  streetVehicle(builder, 'coach front grille', [c.x + c.length / 2 + 0.02, 1.05, c.z],
    [0.06, 0.22, c.width - 0.8], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
  for (const side of [-1, 1]) {
    // Coach rear faces the cul-de-sac's closed end: ruby-red taillights
    streetVehicle(builder, `coach taillight ${side}`,
      [c.x - c.length / 2 - 0.04, 0.95, c.z + side * (c.width / 2 - 0.35)], [0.06, 0.24, 0.18], m.taillight,
      { solid: false, shots: false, cast: false, presentationOnly: true });
    // Coach front faces down the STEM (HF-477): illuminated headlights (y=0.98 clears grille top)
    streetVehicle(builder, `coach headlight ${side}`,
      [c.x + c.length / 2 + 0.04, 0.98, c.z + side * (c.width / 2 - 0.35)], [0.06, 0.20, 0.20], m.headlight,
      { solid: false, shots: false, cast: false, presentationOnly: true });
  }
  // Wheels: keep the exact 2 expected asymmetric meshes plus decorative hubcaps and arches
  for (const [index, x] of [-2.9, 2.9].entries()) {
    streetVehicle(builder, `coach wheel ${index}`, [c.x + x, 0.42, c.z], [1.0, 0.84, c.width + 0.2], m.rubber,
      { solid: false, shots: false, cast: false });
    for (const side of [-1, 1]) {
      streetVehicle(builder, `coach hubcap ${index} ${side}`, [c.x + x, 0.42, c.z + side * (c.width / 2 + 0.12)],
        [0.44, 0.44, 0.03], m.chrome, { solid: false, shots: false, cast: false, presentationOnly: true });
      streetVehicle(builder, `coach wheel arch ${index} ${side}`, [c.x + x, 0.88, c.z + side * (c.width / 2 + 0.01)],
        [1.16, 0.10, 0.06], m.busShell, { solid: false, shots: false, cast: true, presentationOnly: true });
    }
  }
  // ---- HF-477: THE TWO CARS THE REFERENCE HAS IN THE ROAD ------------------
  // WHAT THIS REPLACES. One aqua "head car", authored across the road
  // centre-line at (4.5, -0.8), which existed for two mechanical reasons: to
  // give the south half of the carriageway a street body (the coach's
  // counterweight) and to stop the centre-line becoming a 34 m clear lane.
  // Both reasons survive; the body does not, because
  // `nt2025-aerial-boii.jpg` shows what is actually parked there.
  //
  // FINDINGS Q4, VERIFIED: a DARK SALOON tucked beside the box truck on the
  // WHITE house's side, and a GREEN/TEAL CLASSIC CAR out in the STEM. The
  // saloon inherits the counterweight job (it is on the truck's own z side,
  // which is the south half) and the classic inherits the centre-line job -
  // it is the only body parked across z = 0, so `MAX_STREET_CENTRE_RUN_METRES`
  // moves onto it with its derivation intact. Nothing about either band was
  // relaxed; the body that carries it changed, and the gate says so.
  //
  // The saloon is in the STEM and not in the bulb because the bulb has no room
  // for it: the truck is 11.7 m of a 16 m disc and the 1.25 m of clear road
  // between its cab flank and the mouth's kerb will not hold a 1.9 m car
  // without interpenetrating one of them. The reference has both bodies "nosed
  // down the stem", so parking it in the stem beside the truck's nose is the
  // same statement.
  const streetCar = (
    id: string,
    seat: { x: number; z: number; length: number; width: number },
    paint: THREE.Material,
  ): void => {
    const half = seat.length / 2;
    // HF-467: the body is `vehicle` and the cabin is the WINDSCREEN, which is
    // `glass` - the shatter class - not the bodywork its metalness made it.
    streetVehicle(builder, `${id} body`, [seat.x, 0.72, seat.z], [seat.length, 1.0, seat.width], paint,
      { ballisticMaterial: 'vehicle' });
    streetVehicle(builder, `${id} cabin`, [seat.x - 0.2, 1.55, seat.z], [seat.length / 2, 0.66, seat.width - 0.2], m.carGlass,
      { ballisticMaterial: 'glass' });
    streetVehicle(builder, `${id} bumper front`, [seat.x + half + 0.05, 0.30, seat.z],
      [0.16, 0.22, seat.width + 0.04], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
    streetVehicle(builder, `${id} bumper rear`, [seat.x - half - 0.05, 0.30, seat.z],
      [0.16, 0.22, seat.width + 0.04], m.chrome, { solid: false, shots: false, cast: true, presentationOnly: true });
    streetVehicle(builder, `${id} windshield`, [seat.x + 0.95, 1.48, seat.z],
      [0.25, 0.55, seat.width - 0.24], m.carGlass, { solid: false, shots: false, cast: false, presentationOnly: true });
    streetVehicle(builder, `${id} rear window`, [seat.x - 1.35, 1.48, seat.z],
      [0.25, 0.55, seat.width - 0.24], m.carGlass, { solid: false, shots: false, cast: false, presentationOnly: true });
    for (const side of [-1, 1]) {
      streetVehicle(builder, `${id} headlight ${side}`,
        [seat.x + half + 0.02, 0.68, seat.z + side * (seat.width / 2 - 0.25)], [0.06, 0.16, 0.30], m.headlight,
        { solid: false, shots: false, cast: false, presentationOnly: true });
      streetVehicle(builder, `${id} taillight ${side}`,
        [seat.x - half - 0.02, 0.68, seat.z + side * (seat.width / 2 - 0.25)], [0.06, 0.16, 0.30], m.taillight,
        { solid: false, shots: false, cast: false, presentationOnly: true });
    }
    for (const [index, dx] of [-1.5, 1.5].entries()) {
      for (const [side, dz] of [-1, 1].entries()) {
        streetVehicle(builder, `${id} wheel ${index}${side}`, [seat.x + dx, 0.34, seat.z + dz * (seat.width / 2 - 0.05)],
          [0.68, 0.68, 0.3], m.rubber, { solid: false, shots: false, cast: false });
        streetVehicle(builder, `${id} hubcap ${index}${side}`, [seat.x + dx, 0.34, seat.z + dz * (seat.width / 2 + 0.12)],
          [0.34, 0.34, 0.03], m.chrome, { solid: false, shots: false, cast: false, presentationOnly: true });
        streetVehicle(builder, `${id} wheel arch ${index}${side}`, [seat.x + dx, 0.72, seat.z + dz * (seat.width / 2 + 0.01)],
          [0.88, 0.08, 0.06], paint, { solid: false, shots: false, cast: true, presentationOnly: true });
      }
    }
  };
  streetCar('stem saloon', NUKETOWN2_STREET_CARS.saloon, m.carSaloon);
  streetCar('stem classic', NUKETOWN2_STREET_CARS.classic, m.carClassic);
}

/**
 * One parked car per driveway apron, in front of its own garage door. CLOSED
 * cover in the reference's sense: a solid body you crouch behind and cannot get
 * inside. The long axis runs ACROSS the street, because a car on a driveway
 * points at the road.
 */
function cars(builder: Builder, m: Nuketown2Materials): void {
  // Hoisted constant (vehicle-forge lane): the box and its forged skin must not
  // hold two copies of this coordinate. Its HF-432 item 4 derivation now lives
  // on NUKETOWN2_DRIVEWAY_CAR itself.
  const cx = NUKETOWN2_DRIVEWAY_CAR[0];
  const cz = NUKETOWN2_DRIVEWAY_CAR[1];
  // HF-467: the driveway cars carry no `street-vehicle` name prefix, so BOTH
  // halves fell through to `reinforced` - a hatchback that stops a sniper.
  // Body `vehicle`, windscreen `glass`, matching the head car.
  pair(builder, 'car body', [cx, 0.72, cz], [1.9, 1.0, 4.4], m.carA,
    { ballisticMaterial: 'vehicle' });
  pair(builder, 'car cabin', [cx, 1.55, cz - 0.2], [1.7, 0.66, 2.2], m.carGlass,
    { ballisticMaterial: 'glass' });
  // Driveway sedan bumpers, sloped windows, headlights, taillights, and wheels:
  pair(builder, 'car bumper front', [cx, 0.30, cz + 2.25], [1.94, 0.22, 0.16], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'car bumper rear', [cx, 0.30, cz - 2.25], [1.94, 0.22, 0.16], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'car windshield slope', [cx, 1.48, cz + 0.95], [1.66, 0.55, 0.25], m.carGlass,
    { solid: false, shots: false, cast: false });
  pair(builder, 'car rear window slope', [cx, 1.48, cz - 1.35], [1.66, 0.55, 0.25], m.carGlass,
    { solid: false, shots: false, cast: false });
  for (const side of [-1, 1]) {
    pair(builder, `car headlight ${side}`, [cx + side * 0.70, 0.68, cz + 2.22], [0.30, 0.16, 0.06], m.headlight,
      { solid: false, shots: false, cast: false });
    pair(builder, `car taillight ${side}`, [cx + side * 0.70, 0.68, cz - 2.22], [0.30, 0.16, 0.06], m.taillight,
      { solid: false, shots: false, cast: false });
  }
  for (const [index, dz] of [-1.5, 1.5].entries()) {
    for (const [side, dx] of [-1, 1].entries()) {
      pair(builder, `car wheel ${index}${side}`, [cx + dx * 0.95, 0.34, cz + dz], [0.26, 0.68, 0.68], m.rubber,
        { solid: false, shots: false, cast: false });
      pair(builder, `car hubcap ${index}${side}`, [cx + dx * 1.08, 0.34, cz + dz], [0.03, 0.34, 0.34], m.chrome,
        { solid: false, shots: false, cast: false });
      pair(builder, `car wheel arch ${index}${side}`, [cx + dx * 0.96, 0.72, cz + dz], [0.06, 0.08, 0.88], m.carA,
        { solid: false, shots: false, cast: true });
    }
  }
}

// ---------------------------------------------------------------------------
// Forged street vehicles - PRESENTATION ONLY
// ---------------------------------------------------------------------------

/**
 * The driveway car's plan position, hoisted out of its builder so the forged
 * skin reads the SAME numbers the boxes do. A second copy of a coordinate is
 * how a skin ends up 20 cm off the body it dresses. HF-477's two STREET cars
 * are hoisted the same way, in `NUKETOWN2_STREET_CARS` (nuketown2-layout.ts),
 * because the reference is the authority on where they park.
 */
const NUKETOWN2_DRIVEWAY_CAR: readonly [number, number] = Object.freeze([
  (GARAGE_X0 + GARAGE_X1) / 2 + 0.5,   // 7.25, centred on the door
  // HF-432 item 4: 3.4 m put the body 1.05 m clear of the garage door's own
  // reveal, which is 0.29 m of centring for a 0.76 m capsule - a door you can
  // only leave by shuffling. 4.6 m leaves 2.25 m and the car is still on its
  // own apron (the dressing runs to z = -8) rather than out on the kerb.
  GARAGE_FRONT_Z + 4.6,
]) as readonly [number, number];

/**
 * Every authored box the lofted skins take over the PRESENTATION of, with the
 * exact number of meshes each pattern must match.
 *
 * Not one of them is deleted, moved, resized or unregistered. Each is hidden
 * and withdrawn from the presentation batcher, and every collider, ballistic
 * surface, breakable-window id, 2x-damage core seat and roof-climb tread it
 * owns stays exactly where it was authored - which is why the arena's own
 * fidelity, symmetry, coplanar and parity gates read the same numbers before
 * and after. The counts are the guard: if a future cut adds a lamp or renames
 * a wheel, `nuketown2ForgeAudit` records a mismatch and the gate that reads it
 * fails, rather than the arena quietly drawing a box inside a lofted body.
 */
const NUKETOWN2_FORGE_SUPERSEDED: ReadonlyArray<{ readonly pattern: RegExp; readonly expected: number }> = Object.freeze([
  // The coach is lofted end to end, so its whole box dressing retires.
  Object.freeze({ pattern: /^nuketown2 street-vehicle coach /, expected: 23 }),
  // The truck: CAB ONLY. The cargo box keeps its deck, bulkhead, pierced
  // flanks, roof and climb treads, because those ARE the HF-436 gameplay -
  // three mouths you walk in through - and one lofted skin would seal them.
  // Its taillights and rear step bar are on the box and stay boxes with it.
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck cab$/, expected: 1 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck bumper front$/, expected: 1 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck grille$/, expected: 1 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck windshield$/, expected: 1 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck headlight /, expected: 2 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck wheel \d+$/, expected: 3 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck hubcap /, expected: 6 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle truck wheel arch /, expected: 6 }),
  // HF-477's two street cars, and the two driveway cars. The retired head car's
  // 22 boxes became 22 per car across `stem saloon` and `stem classic`, which
  // the shared `streetCar()` helper emits from one body of code.
  Object.freeze({ pattern: /^nuketown2 street-vehicle stem saloon /, expected: 22 }),
  Object.freeze({ pattern: /^nuketown2 street-vehicle stem classic /, expected: 22 }),
  Object.freeze({ pattern: /^nuketown2 (north|south) car /, expected: 44 }),
]);

export interface Nuketown2ForgeAudit {
  /** Meshes whose presentation the loft took over. */
  readonly retired: number;
  /** Patterns whose match count differed from the authored expectation. */
  readonly mismatches: readonly string[];
  readonly drawCalls: number;
  readonly triangles: number;
  /** Per-vehicle plan centres of the baked skins (HF-473 mirror gate). */
  readonly skins: readonly Readonly<{ name: string; centre: Readonly<{ x: number; z: number }> }>[];
}

function retireSupersededPresentation(builder: Builder): { retired: number; mismatches: string[] } {
  let retired = 0;
  const mismatches: string[] = [];
  for (const { pattern, expected } of NUKETOWN2_FORGE_SUPERSEDED) {
    let count = 0;
    for (const child of builder.root.children) {
      if (!(child instanceof THREE.Mesh) || !pattern.test(child.name)) continue;
      child.visible = false;
      // Withdraw it from the batcher as well. Hiding a batch CANDIDATE is not
      // enough: `batchPresentationOnlyBoxes` folds its geometry into a merged
      // mesh that is itself visible, so the box would go on drawing inside the
      // lofted body it was replaced by.
      child.userData.presentationBatchCandidate = false;
      child.userData.supersededByVehicleForge = true;
      count += 1;
    }
    if (count !== expected) mismatches.push(`${pattern.source}: expected ${expected}, matched ${count}`);
    retired += count;
  }
  return { retired, mismatches };
}

/**
 * Loft the coach, the moving truck's cab and all three cars, and hide the
 * boxes those skins now cover.
 *
 * NOTHING HERE TOUCHES AUTHORITY. Every collider, physics collider and
 * ballistic surface on this street was registered by the `streetVehicle` and
 * `pair` calls above and is untouched; the forged groups register nothing and
 * carry `presentationOnly` on every mesh, so `solidMeshes` in the fidelity
 * gate - which selects parametric BoxGeometry that is NOT presentation-only -
 * cannot see them and the enumerated asymmetric-vehicle list cannot grow.
 *
 * Each spec's envelope is its box's envelope, so the collider/visual parity
 * audit still finds a visible mesh over every collider and no visible mesh
 * without one. The one place the two differ is deliberate and stated in
 * `vehicle-forge/specs.ts`: the sedan's 1.88 m greenhouse is tall for a 4.4 m
 * saloon, and it stays tall because shrinking it would leave collider with no
 * mass under it.
 */
function forgedStreetVehicles(builder: Builder): Nuketown2ForgeAudit {
  const { retired, mismatches } = retireSupersededPresentation(builder);

  // Cream body, red waistline: the reference's coach, and the only saturated
  // body left on the map now the truck is a plain van.
  // PERF (HITL 5, HF-491): one shared set of colourless bucket materials, so
  // every vehicle's tyres/chrome/glass/lamps merge into one draw each below.
  const sharedMaterials = createForgeSharedMaterials();
  const coachMaterials = createForgeMaterialSet(0xe7dec6, 'nuketown2-forge-coach', 0xa8382c, 0.2, sharedMaterials);
  const truckMaterials = createForgeMaterialSet(0xe2dfd6, 'nuketown2-forge-truck-cab', 0xe2dfd6, 0.2, sharedMaterials);
  // Same aqua the box cars carried, and the same 0.20 base roughness, so the
  // ray-traced preset's reflective-proxy admission is unchanged.
  const carMaterials = createForgeMaterialSet(0x3d6f80, 'nuketown2-forge-car', 0x3d6f80, 0.2, sharedMaterials);
  // The reference's two street cars keep the hexes their collider boxes wear
  // (`m.carSaloon` / `m.carClassic`), so skin and body are one colour; they
  // share the same colourless bucket set as every other forged body.
  const saloonMaterials = createForgeMaterialSet(0x27394f, 'nuketown2-forge-car-saloon', 0x27394f, 0.2, sharedMaterials);
  const classicMaterials = createForgeMaterialSet(0x2f8f77, 'nuketown2-forge-car-classic', 0x2f8f77, 0.2, sharedMaterials);

  const c = NUKETOWN2_STREET_COACH;
  const t = NUKETOWN2_CENTRAL_TRUCK;
  const truckNoseX = t.cabX + t.cabLength / 2;
  const placements: Array<{ built: ForgedVehicle; x: number; z: number; yaw: number }> = [];

  placements.push({
    built: buildForgedVehicle(COACH_SPEC, {
      wheelStyle: 'cover',
      headLamps: { x: 0.94, y: 0.98, radius: 0.13 },
      tailLamps: { x: 0.94, y: 0.95, radius: 0.12 },
      bumperY: 0.34,
      // The reference paints its waistline at 1.35 m, and a waistline is LEVEL:
      // ridden by ring index instead it climbs every wheel arch and humps over
      // both wheels. Taken from where the loft's own flank crosses that height,
      // so it follows the body's curvature without following its cut-outs.
      stripe: { y: 1.35, bucket: 'accent', z0: 0.35, z1: 8.75, height: 0.3, proud: 0.012 },
    }, coachMaterials),
    x: c.x + COACH_SPEC.length / 2,
    z: c.z,
    yaw: -Math.PI / 2,
  });

  placements.push({
    built: buildForgedVehicle(TRUCK_CAB_SPEC, {
      wheelStyle: 'steel',
      headLamps: { x: 0.92, y: 0.95, radius: 0.12 },
      bumperY: 0.42,
    }, truckMaterials),
    x: truckNoseX,
    z: t.z,
    yaw: -Math.PI / 2,
  });
  // The cargo box's own axles: dressed, but with no arch to cut them into,
  // because the box above them is authored gameplay geometry that stays boxy.
  placements.push({
    built: buildForgedWheelSet(
      'nuketown2-truck-bogie',
      TRUCK_CAB_SPEC.wheelRadius,
      TRUCK_CAB_SPEC.tyreHalfWidth,
      TRUCK_CAB_SPEC.trackHalfWidth,
      [truckNoseX - (t.boxLength / 2 + 1.0), truckNoseX - (-t.boxLength / 2 + 1.1)],
      'steel',
      truckMaterials,
    ),
    x: truckNoseX,
    z: t.z,
    yaw: -Math.PI / 2,
  });

  const sedanDressing = {
    wheelStyle: 'cover' as const,
    headLamps: { x: 0.66, y: 0.84, radius: 0.115 },
    tailLamps: { x: 0.68, y: 0.86, radius: 0.105 },
    bumperY: 0.46,
  };
  // HF-477's two street cars, each dressed in its OWN paint - the skin is the
  // visible body, so a navy collider under an aqua skin would be the exact
  // "skin and box disagree" defect this audit exists to catch. Both nose to +x,
  // so the vehicle frame's +z maps to world -x, as the retired head car did.
  // The paint costs no pipeline: `createForgePaintMaterial` carries its pigment
  // as a uniform, so all three sets share one compiled graph.
  for (const [seat, materials] of [
    [NUKETOWN2_STREET_CARS.saloon, saloonMaterials],
    [NUKETOWN2_STREET_CARS.classic, classicMaterials],
  ] as const) {
    placements.push({
      built: buildForgedVehicle(SEDAN_SPEC, sedanDressing, materials),
      x: seat.x + SEDAN_SPEC.length / 2,
      z: seat.z,
      yaw: -Math.PI / 2,
    });
  }
  // The two driveway cars point at the road, and the south one is the exact
  // 180-degree partner of the north one - the same involution `pair` applies
  // to their boxes, so the two skins stay as symmetric as the two colliders.
  const [carX, carZ] = NUKETOWN2_DRIVEWAY_CAR;
  placements.push({
    built: buildForgedVehicle(SEDAN_SPEC, sedanDressing, carMaterials),
    x: carX,
    z: carZ + SEDAN_SPEC.length / 2,
    yaw: Math.PI,
  });
  placements.push({
    built: buildForgedVehicle(SEDAN_SPEC, sedanDressing, carMaterials),
    x: -carX,
    z: -(carZ + SEDAN_SPEC.length / 2),
    yaw: 0,
  });

  // PASS 94 integration (HF-473 x HF-462). Every placement above is an
  // AUTHORED coordinate, taken from the same constants the collider boxes
  // use - and those boxes reach the world through `centred`/`streetVehicle`/
  // `pair`, which mirror x. The forged skins did not, because this lane
  // branched before the mirror existed. Left alone, every skin sat on the
  // opposite side of the street from the body it dresses: five vehicles
  // floating over empty road with five invisible boxes across from them, and
  // no collider gate would have said a word, because a skin is presentation.
  // The mirror is applied HERE, once, at the single place an authored vehicle
  // number becomes a world object - the same discipline nuketown2-layout.ts
  // states for solids.
  //
  // PERF (HITL 5, HF-491): the six placements used to be six groups and ~40
  // draws. They are static scenery, so their transforms are baked and every
  // vehicle is folded into one mesh per material (3 paints + accents + 7
  // shared buckets). The audit's drawCalls is the merged mesh count, which is
  // what the fidelity gate counts under the 'vehicle-forge ' prefix.
  //
  // Reflecting x also reflects heading: a body facing (sin y, cos y) faces
  // (-sin y, cos y) after the mirror, which is yaw -> -yaw. Position and
  // heading have to move together or the skins land right and point wrong.
  const merged = mergeForgedPlacements(placements.map(({ built, x, z, yaw }) => ({
    built,
    x: nuketown2HandedX(x),
    z,
    yaw: NUKETOWN2_HANDEDNESS === 1 ? yaw : -yaw,
  })));
  for (const mesh of merged.meshes) builder.root.add(mesh);
  return Object.freeze({
    retired, mismatches: Object.freeze(mismatches), drawCalls: merged.drawCalls, triangles: merged.triangles, skins: merged.skins,
  });
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
const HEAD = NUKETOWN2_CUL_DE_SAC;
export const NUKETOWN2_GROUND_DRESSING: readonly NuketownGroundDressingPiece[] = Object.freeze([
  // Driveway apron: garage door out to the kerb. HF-477 ran it the last 2.7 m
  // to KERB_Z instead of stopping at the old centred head's |z| = 8 edge -
  // there is no head there any more on the stem side, and the SOUTH house's
  // partner apron laps 2.7 m of the bulb's own kerb apron, which is what an
  // apron meeting a cul-de-sac does. Concrete over concrete, tier -1 over the
  // solid road, so nothing races.
  // HF-477 split the two aprons apart. They used to be one paired entry
  // running to |z| = 8, which was both drives' kerb line when the head was
  // centred. It is not any more: on the STEM side the kerb is at |z| = 5.3, and
  // on the CUL-DE-SAC side the bulb reaches |z| = 8 - so one paired rectangle
  // either leaves a 2.7 m lawn gap in front of one garage or paints 13.5 m2 of
  // apron over the other's road, which the ground-cut gate caught immediately.
  // Two entries, each meeting its own kerb exactly.
  Object.freeze({ id: 'street driveway north', material: 'drive' as const, paired: false, x0: GARAGE_X0, x1: GARAGE_X1, z0: GARAGE_FRONT_Z, z1: KERB_Z }),
  Object.freeze({ id: 'street driveway south', material: 'drive' as const, paired: false, x0: -GARAGE_X1, x1: -GARAGE_X0, z0: NUKETOWN2_TURNING_HEAD_HALF, z1: -GARAGE_FRONT_Z }),
  // Back yard lawn: the whole strip between the house back wall and the fence.
  Object.freeze({ id: 'yard lawn', material: 'lawn' as const, x0: NUKETOWN2_BOUNDS.minX, x1: NUKETOWN2_BOUNDS.maxX, z0: YARD_FENCE_Z, z1: HOUSE_BACK_Z }),
  // Border path outside the fence.
  Object.freeze({ id: 'border path', material: 'drive' as const, x0: NUKETOWN2_BOUNDS.minX, x1: NUKETOWN2_BOUNDS.maxX, z0: NUKETOWN2_BOUNDS.minZ, z1: YARD_FENCE_Z }),

  // ---- HF-477: THE FRONT VERGE, TILED PER SIDE ----------------------------
  // The four entries that used to cover this band (`street lawn front`,
  // `street lawn west`, `street lawn east`, `street lawn turning infill`) were
  // written for a road that was a 180-degree pair of itself. The lollipop is
  // not: at the cul-de-sac end the bulb fills the whole 4.7 m verge band, and
  // at the stem end none of it does. `pair()` would put each tile's image
  // where the road is.
  //
  // So the verge is tiled EXPLICITLY, once per z-side, as the band between the
  // house front line and the kerb MINUS the carriageway and MINUS the drive
  // apron. Nine tiles, no overlaps, complete cover - and the two sides are
  // exact z-mirrors of each other, which is the symmetry that actually matters
  // because it is the axis the teams are separated across.
  // ONE tile, both sides, running the full corridor depth: behind the bulb's
  // closed kerb there is no carriageway to tile around, and splitting it at
  // |z| = 5.3 like the stem-side tiles left the strip at |z| < 5.3 bare - which
  // the region gate caught, because the stem's own 180-degree image lands
  // exactly there.
  Object.freeze({ id: 'verge lawn head end', material: 'lawn' as const, paired: false, x0: NUKETOWN2_BOUNDS.minX, x1: HEAD.closedX, z0: HOUSE_FRONT_Z, z1: -HOUSE_FRONT_Z }),
  Object.freeze({ id: 'verge lawn head frontage north', material: 'lawn' as const, paired: false, x0: HEAD.closedX, x1: HEAD.mouthX, z0: HOUSE_FRONT_Z, z1: -NUKETOWN2_TURNING_HEAD_HALF }),
  Object.freeze({ id: 'verge lawn stem north 0', material: 'lawn' as const, paired: false, x0: HEAD.mouthX, x1: GARAGE_X0, z0: HOUSE_FRONT_Z, z1: KERB_Z }),
  Object.freeze({ id: 'verge lawn stem north 1', material: 'lawn' as const, paired: false, x0: GARAGE_X1, x1: NUKETOWN2_BOUNDS.maxX, z0: HOUSE_FRONT_Z, z1: KERB_Z }),
  Object.freeze({ id: 'verge lawn head frontage south 0', material: 'lawn' as const, paired: false, x0: HEAD.closedX, x1: -GARAGE_X1, z0: NUKETOWN2_TURNING_HEAD_HALF, z1: -HOUSE_FRONT_Z }),
  Object.freeze({ id: 'verge lawn head frontage south 1', material: 'lawn' as const, paired: false, x0: -GARAGE_X0, x1: HEAD.mouthX, z0: NUKETOWN2_TURNING_HEAD_HALF, z1: -HOUSE_FRONT_Z }),
  Object.freeze({ id: 'verge lawn stem south', material: 'lawn' as const, paired: false, x0: HEAD.mouthX, x1: NUKETOWN2_BOUNDS.maxX, z0: -KERB_Z, z1: -HOUSE_FRONT_Z }),
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

type Nuketown2PlanRect = Readonly<{ x0: number; x1: number; z0: number; z1: number }>;

function planRectOverlaps(first: Nuketown2PlanRect, second: Nuketown2PlanRect): boolean {
  return Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0) > 1e-4
    && Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0) > 1e-4;
}

/** Structures and the carriageway own exact ground cut-outs. */
function allNuketown2GroundCuts(): readonly Nuketown2PlanRect[] {
  return Object.freeze([
    ...NUKETOWN2_BUILDING_FOOTPRINTS,
    ...NUKETOWN2_BUILDING_FOOTPRINTS.map((footprint) => Object.freeze({
      x0: -footprint.x1,
      x1: -footprint.x0,
      z0: -footprint.z1,
      z1: -footprint.z0,
    })),
    ...NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  ]);
}

/**
 * Build the outdoor ground as a tiled cover with exact structure cut-outs.
 * A single 270 m slab used to continue through every house and garage, where
 * it was coplanar with the old interior slabs. The cuts are deliberately
 * plan-only and use the same exported footprint tables as the structures and
 * carriageway.
 */
function buildNuketown2Ground(builder: Builder, m: Nuketown2Materials): void {
  const cuts = allNuketown2GroundCuts();
  const xCuts = [...new Set([
    NUKETOWN2_BOUNDS.minX,
    NUKETOWN2_BOUNDS.maxX,
    ...cuts.flatMap((cut) => [cut.x0, cut.x1]),
  ])].sort((first, second) => first - second);
  const zCuts = [...new Set([
    NUKETOWN2_BOUNDS.minZ,
    NUKETOWN2_BOUNDS.maxZ,
    ...cuts.flatMap((cut) => [cut.z0, cut.z1]),
  ])].sort((first, second) => first - second);
  let tile = 0;
  for (let x = 0; x < xCuts.length - 1; x += 1) {
    for (let z = 0; z < zCuts.length - 1; z += 1) {
      const x0 = xCuts[x]!;
      const x1 = xCuts[x + 1]!;
      const z0 = zCuts[z]!;
      const z1 = zCuts[z + 1]!;
      const cell = { x0, x1, z0, z1 };
      if (cuts.some((cut) => planRectOverlaps(cell, cut))) continue;
      centred(builder, `ground tile ${tile}`, [(x0 + x1) / 2, -0.7, (z0 + z1) / 2],
        [x1 - x0, 1.4, z1 - z0], m.ground, { cast: false });
      tile += 1;
    }
  }
}

/**
 * The road surface, kerbs, turning head, driveway aprons and lawns.
 *
 * The carriageway is a real solid road, and the outdoor ground is cut out of
 * its footprint. Markings are thin real solids with a 0.04 m air gap above the
 * road; no street surface relies on polygon offsets. Aprons and lawns remain
 * presentation-only dressing outside the carriageway, so they do not create
 * competing movement or shot authority.
 */
function street(builder: Builder, m: Nuketown2Materials): void {
  const road = { solid: true, shots: true, cast: false } as const;
  const head = NUKETOWN2_CUL_DE_SAC;
  // ---- HF-477: THE LOLLIPOP -------------------------------------------------
  // Every body below is emitted through `centred()` - ONCE, with no 180-degree
  // partner - because the reference's road does not have one. See
  // `NUKETOWN2_CUL_DE_SAC` for which end is which and why, and
  // `nuketown2-fidelity.test.ts` for the enumerated exception this creates and
  // the three properties that pay for it. The short version: the carriageway is
  // asymmetric along x (head at one end, stem at the other) and EXACTLY
  // MIRROR-SYMMETRIC across z = 0, which is the axis that separates the two
  // teams - so both teams still get an identical road.
  //
  // The bulb's ASPHALT is its bounding square, not a disc. The circle is drawn
  // by the KERB ISLANDS below, which fill square-minus-disc - and that is what
  // the reference has: `nt2025-aerial-boii.jpg` shows a broad pale concrete
  // kerb apron ringing the asphalt, not a lawn verge meeting it.
  centred(builder, 'carriageway turning head', [head.centreX, -0.06, 0],
    [head.radius * 2, 0.12, head.radius * 2], m.asphalt, { ...road, ballisticMaterial: 'concrete' });
  centred(builder, 'carriageway stem', [(head.mouthX + head.offMapX) / 2, -0.06, 0],
    [head.offMapX - head.mouthX, 0.12, NUKETOWN2_STREET_HALF_WIDTH * 2], m.asphalt,
    { ...road, ballisticMaterial: 'concrete' });

  // THE KERB RING, as a banded approximation of the disc. Everything in this
  // arena is axis-aligned (see the file header: a yawed solid measured 0.11
  // coverage against its own mesh on map3), so the circle is z-banded and each
  // band's chord half-width is sampled at the band's own mid-line.
  //
  // The band edges are NOT uniform: they are pinned at +/- the stem's own half
  // width, because that is where the ring has to open. Inside |z| <= 5.3 the
  // ring is suppressed on the mouth side, so the asphalt runs continuously from
  // the disc through the square's edge and into the stem - which is the flared
  // mouth of a real lollipop. Outside it, both sides carry the ring and it
  // closes round the head.
  //
  // Islands are kerb height (0.24 m, under the 0.42 m autostep, exactly as the
  // straight kerb runs already are), so they read as a kerb and are never a
  // wall. Bands whose island is thinner than 0.15 m are dropped: at the closed
  // end's own mid-line the disc is 0.05 m inside the square, which is a body
  // no player can see and a collider nobody can stand on.
  const HEAD_BAND_EDGES = [-8, -7, -6.2, -5.3, -3.6, -1.8, 0, 1.8, 3.6, 5.3, 6.2, 7, 8] as const;
  const ISLAND_MIN_WIDTH = 0.15;
  let island = 0;
  for (let index = 0; index < HEAD_BAND_EDGES.length - 1; index += 1) {
    const z0 = HEAD_BAND_EDGES[index]!;
    const z1 = HEAD_BAND_EDGES[index + 1]!;
    const mid = (z0 + z1) / 2;
    const chordHalf = head.radius * Math.sqrt(Math.max(0, 1 - (mid / head.radius) ** 2));
    const runs: [number, number][] = [[head.closedX, head.centreX - chordHalf]];
    // The mouth side only closes where the stem is not passing through.
    if (Math.abs(mid) > NUKETOWN2_STREET_HALF_WIDTH) runs.push([head.centreX + chordHalf, head.mouthX]);
    for (const run of runs) {
      if (run[1] - run[0] < ISLAND_MIN_WIDTH) continue;
      centred(builder, `carriageway head kerb island ${island}`,
        [(run[0] + run[1]) / 2, 0.06, (z0 + z1) / 2],
        [run[1] - run[0], 0.24, z1 - z0], m.kerb, { cast: false, ballisticMaterial: 'concrete' });
      island += 1;
    }
  }

  // The stem's own kerbs, one per side, from the bulb's mouth to the map edge.
  // Same 0.24 m lip and the same 0.3 m tread as before; only the run changed,
  // because there is one road leaving the head now instead of two.
  for (const [index, side] of [-1, 1].entries()) {
    centred(builder, `carriageway stem kerb ${index}`,
      [(head.mouthX + head.offMapX) / 2, 0.06, side * (NUKETOWN2_STREET_HALF_WIDTH - 0.15)],
      [head.offMapX - head.mouthX, 0.24, 0.3], m.kerb, { cast: false, ballisticMaterial: 'concrete' });
  }
  // Centre line, down the stem only: a cul-de-sac bulb is not marked.
  for (let i = 0; i < 4; i += 1) {
    // HF-463: the dash is a real 0.04 m solid raised 0.04 m above the road.
    // The separation is geometric, not a polygon-offset tier, and shots use
    // the road surface rather than the marking.
    centred(builder, `carriageway stem dash ${i}`, [head.mouthX + 2.2 + i * 3.4, 0.06, 0],
      [2.0, 0.04, 0.16], m.trimDecal, { solid: true, shots: false, cast: false });
  }
  const decal = { solid: false, shots: false, cast: false } as const;
  for (const piece of NUKETOWN2_GROUND_DRESSING) {
    const position: [number, number, number] = [(piece.x0 + piece.x1) / 2, -0.05, (piece.z0 + piece.z1) / 2];
    // HF-434: lawn IS the -2 decal tier (it crosses the -1 turning head);
    // drive has solid users, so its dressing pieces take the -1 clone.
    const size: [number, number, number] = [piece.x1 - piece.x0, 0.14, piece.z1 - piece.z0];
    const material = piece.material === 'lawn' ? m.lawn : m.driveDecal;
    // HF-477: a piece marked `paired: false` is authored ONCE. The front verge
    // no longer tiles under a 180-degree rotation - the head fills the whole
    // verge at one end of the map and none of it at the other - so those tiles
    // are authored per z-side instead, and `pair()` would put each one's image
    // in the wrong place. Everything else in the table is still an exact
    // rotational pair and still goes through `pair()`.
    if (piece.paired === false) centred(builder, piece.id, position, size, material, decal);
    else pair(builder, piece.id, position, size, material, decal);
  }
}

/**
 * The front verge: what stands between the kerb and each house's front wall.
 * The reference's letterboxes sit out here (they carry the two characters'
 * names), and the driveway is edged rather than open, so crossing the last 4 m
 * to a front door is not a walk across a blank apron.
 */
function verge(builder: Builder, m: Nuketown2Materials): void {
  // ---- HF-477: THE FURNITURE LINE, AND WHY IT IS A LINE ---------------------
  // Every prop here is emitted through `pair()`, so a prop at authored
  // (x, -b) puts its partner at (-x, +b). With the lollipop that is a hard
  // constraint, not a detail: the bulb occupies authored x in
  // [closedX, mouthX] at every |z| <= 8, so ANY paired prop with
  // |z| in [5.3, 8] and x anywhere inside that span lands its own partner in
  // the middle of the cul-de-sac. Six of this function's bodies did exactly
  // that on the first build - the low wall, the hydrant, the street bin, the
  // parcel mailbox, the entry urn and the town sign.
  //
  // The rule that falls out of it is simple, and `nuketown2-fidelity.test.ts`
  // enforces it: a PAIRED verge prop lives at |z| > 8, in the 2 m band between
  // the bulb's own bounding square and the house front line. So the street
  // furniture is authored as ONE LINE at VERGE_FURNITURE_Z with a shared depth
  // budget, which is also how a real verge is dressed - and how the reference
  // dresses its own front lawns (`nt2025-aerial-boii.jpg`: appliance bank, fan
  // plants and chain-and-post edging, all on one band).
  const VERGE_FURNITURE_Z = -8.55;
  const VERGE_FURNITURE_DEPTH = 0.8;
  // Letterbox at the end of each drive: the reference's own kerb prop.
  pair(builder, 'verge mailbox post', [GARAGE_X1 + 0.6, 0.6, VERGE_FURNITURE_Z], [0.16, 1.2, 0.16], m.trim);
  pair(builder, 'verge mailbox', [GARAGE_X1 + 0.6, 1.35, VERGE_FURNITURE_Z], [0.32, 0.3, 0.5], m.sign);
  pair(builder, 'verge mailbox flag', [GARAGE_X1 + 0.78, 1.42, VERGE_FURNITURE_Z], [0.04, 0.18, 0.08], m.busTrim,
    { solid: false, shots: false });
  // ---- HF-491 DECLUTTER, 2026-09-04 -----------------------------------------
  // REMOVED from this line: the second (parcel) mailbox, two wheelie bins and
  // their lids, the public street bin and lid, the fire hydrant (body, cap,
  // nozzles) and the street-name / speed-limit sign post. Eleven paired
  // emitters, 22 bodies, all of them municipal street furniture that NO
  // BO2-2025 reference image contains.
  //
  // The falsifier that removed them is FINDINGS Q4's own native-resolution read
  // of `nt2025-aerial-boii.jpg`: "I looked along both verges at native
  // resolution ... and found kerbs, pavements, the appliance banks, ornamental
  // plants, chain-and-post edging and a manhole cover - NO mailbox posts."
  // That sentence is a census of the reference verge, and every body listed
  // above is absent from it. FINDINGS grades mailboxes OPEN rather than absent,
  // so ONE letterbox is kept at the end of each drive (the pair above, which
  // `nuketown2-fidelity.test.ts` names) and the redundant second one goes.
  //
  // WHY DELETE RATHER THAN HIDE (owner HF-491: "it's busy, cluttered; thin out
  // the clutter, streamline it"). A hidden emitter still costs geometry, a
  // collider, a draw call and a line in the size ratchet. The reference verge
  // reads as open ground with isolated masses; ours read as a continuous run of
  // waist-high furniture, which is what ate the 4.7 m strip either side of the
  // road and made the corridor read narrow at eye level even though its
  // authored width matches the reference (see REPORT.md's corridor table).
  // The drive is edged rather than open, so crossing the last few metres to a
  // front door is not a walk across a blank apron.
  // HF-467: kerb-family edging, `reinforced` by fall-through. `concrete`.
  pair(builder, 'verge drive edge', [GARAGE_X1 + 0.4, 0.15, GARAGE_FRONT_Z + 4.0], [0.3, 0.3, 8.0], m.kerb,
    { cast: false, ballisticMaterial: 'concrete' });
  // Hedge along the front of each house's lawn: crouch cover for the last
  // stride out of the front door, and the FIRST RUNG of the front climb chain
  // (see NUKETOWN2_PORCH_CANOPY). HF-477 pulled it 0.8 m toward the house, to
  // z = HOUSE_FRONT_Z + 0.6, so the furniture line above has the outer half of
  // the band to itself; it is still inside the canopy's plan footprint, which
  // is the property the chain needs, and now more squarely so.
  pair(builder, 'verge front hedge', [-4.7, LOW_COVER / 2, HOUSE_FRONT_Z + 0.6], [3.9, LOW_COVER, 0.9], m.planter);
  // Planter on the outer verge, out past the garage.
  pair(builder, 'verge planter', [13.5, LOW_COVER / 2, VERGE_FURNITURE_Z], [3.6, LOW_COVER, VERGE_FURNITURE_DEPTH], m.planter);
  // HF-437 - THE WIDENED STRIP'S COVER, brought onto the line with everything
  // else. Both are solid and shot-rated by default - movement AND shot
  // authority - which is what made them cover in the first place.
  pair(builder, 'verge low wall', [-6.2, LOW_COVER / 2, VERGE_FURNITURE_Z], [2.2, LOW_COVER, 0.35], m.block);
  // x = -3.6 and not -2.0: the front door's own approach runs out from
  // authored x = -1.25, and at -2.0 this 2.4 m body reached x = -0.8 and stood
  // in it. Both the door walk-through probe and the upper front window's
  // drop-out probe caught it on the first build (the drop landed ON it, 0.95 m
  // up). At -3.6 it clears the walk line by 1.15 m and still butts the hedge.
  pair(builder, 'verge kerb planter', [-3.6, LOW_COVER / 2, VERGE_FURNITURE_Z], [2.4, LOW_COVER, VERGE_FURNITURE_DEPTH], m.planter);

  // HF-477's front-lawn appliance bank is NOT authored here. Both lanes read
  // the same feature out of FINDINGS Q4 - a three-unit cooker bank on each
  // front lawn, RED tops on the orange house's and BLUE on the white house's -
  // and the techniques lane's `nuketown2-yard-props.ts` build is the one that
  // ships: it carries the collider, the HF-467 `structural-metal` rating, the
  // plinth and control panels, its own placement gate against the front-lawn
  // tile, and two authored close-range review stations. Shipping this lane's
  // dressing-only copy as well would put TWO banks on one lawn. The colour
  // placement is the one both lanes and FINDINGS agree on, and the fidelity
  // case below measures it on the built prop.
  // INTEGRATION (HITL 5): the layout lane (04d2ef43) re-authored the bank here
  // against its accuracy-2 base; candidate 4b had already deduplicated it onto
  // the techniques-lane prop, so this merge keeps the single shipped bank and
  // takes the layout lane's deletions below verbatim.
  // HF-491: the entry planter urn + shrub (x = 3.8) and the landscaped front
  // planter + soil (x = -9.0) are REMOVED. With them the furniture line carried
  // a body roughly every 2.5 m of its 36 m; the reference dresses each lawn
  // with ONE appliance bank plus ornamentals, not a continuous parade. What is
  // left on the line is deliberate and each piece has a job: the letterbox
  // (reference kerb prop, OPEN but retained), the drive edge, the front hedge
  // (first rung of the front climb chain), the outer verge planter, the HF-437
  // low wall and kerb planter (the widened strip's COVER - these two are load
  // bearing for the verge-cover gate and are NOT clutter), the colour-coded
  // appliance bank (the map's cheapest chirality anchor) and the town sign.
  // The town sign at the closed end of the cul-de-sac: two posts and a board,
  // the one authored landmark that tells you which end you are looking at -
  // and under HF-477 the two ends are genuinely different, so it finally has
  // something to say.
  for (const [index, dx] of [-1.4, 1.4].entries()) {
    pair(builder, `verge sign post ${index}`, [-16.6 + dx, 1.9, VERGE_FURNITURE_Z], [0.28, 3.8, 0.28], m.trim);
  }
  // HF-467: a hoarding face is sheet, and `thin-metal` is the perforate class
  // the owner named. It carries no perforation AUTHORITY yet - that is the
  // shed's, and extending it to arbitrary panels is deferred (R3 section 9) -
  // but the rating is truthful and every firearm from the scattergun up
  // crosses it.
  pair(builder, 'verge sign board', [-16.6, 4.3, VERGE_FURNITURE_Z], [3.6, 1.8, 0.3], m.sign,
    { ballisticMaterial: 'thin-metal' });
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
  // HF-467: a 0.2 m poured step, `reinforced` by fall-through. `concrete`.
  pair(builder, 'yard porch', [-1.25, 0.1, HOUSE_BACK_Z - 0.9], [2.6, 0.2, 1.8], m.drive,
    { cast: false, ballisticMaterial: 'concrete' });
  // Cover in the deep yard, between the spawn line and the house:
  // HF-467: matched the `cover` name rule and rated `concrete`; it is the
  // same crate as `yard far crate`. Rated `wood` explicitly so the pair is
  // symmetric to shoot at, which this arena's whole fairness contract needs.
  pair(builder, 'yard cover crate', [-8.5, LOW_COVER / 2, HOUSE_BACK_Z - 4.5], [2.4, LOW_COVER, 2.0], m.planter,
    { ballisticMaterial: 'wood' });
  // Tactical crate lid frame & horizontal strapping bands:
  pair(builder, 'yard cover crate lid', [-8.5, LOW_COVER + 0.03, HOUSE_BACK_Z - 4.5], [2.48, 0.06, 2.08], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard cover crate strap', [-8.5, LOW_COVER / 2, HOUSE_BACK_Z - 4.5], [2.44, 0.10, 2.04], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard cover wall', [5.5, HARD_COVER / 2, HOUSE_BACK_Z - 5.5], [7.0, HARD_COVER, 0.35], m.block);
  // Patio dining set with timber table & outdoor umbrella:
  // HF-467: a garden table was `reinforced`. It is furniture: `wood`.
  pair(builder, 'yard patio table', [-14.5, LOW_COVER / 2, -31.5], [2.2, LOW_COVER, 2.2], m.fence,
    { ballisticMaterial: 'wood' });
  pair(builder, 'yard patio table top', [-14.5, LOW_COVER + 0.02, -31.5], [2.28, 0.04, 2.28], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard patio umbrella pole', [-14.5, 1.45, -31.5], [0.08, 1.90, 0.08], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard patio umbrella canopy', [-14.5, 2.38, -31.5], [1.90, 0.28, 1.90], m.trim,
    { solid: false, shots: false, cast: true });
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
  // HF-467: a 6.0 x 2.6 m box called a STORE in a back yard reads as a shed
  // to a player's eye, and it is the map's own hard cover. It had no name
  // rule and no impactSurface rescue (`m.block` metalness 0.01 classifies as
  // `concrete`, which is not one of the four rescued surfaces), so it fell
  // through to `reinforced` - entryCost 1000 against a sniper's 10.90. It was
  // literally unshootable. `concrete` is what it visually is: a rifle wallbang
  // through 2.6 m of it is still out of reach, a rifle through its 0.35 m ends
  // is not, and no weapon meets a 1000-cost wall any more.
  pair(builder, 'yard side store', [-14.6, HARD_COVER / 2, -14.0], [6.0, HARD_COVER, 2.6], m.block,
    { ballisticMaterial: 'concrete' });
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
  // HF-467: the far yard's twin of `yard side store`; same defect, same rating.
  pair(builder, 'yard far store', [14.6, HARD_COVER / 2, -14.0], [6.0, HARD_COVER, 2.6], m.block,
    { ballisticMaterial: 'concrete' });
  // ...and the same asymmetry inside the yard itself: west of x = 0 the yard
  // carried the crate, the water butt, the patio table, the alley planter and
  // the destructible shed; east of x = 9 it carried nothing at all across
  // 9 x 13 m of spawn ground. One waist-high body, in reach of the (12, -30)
  // spawn, which measured the yard's longest walk to cover.
  // HF-467: a crate was `reinforced`. `wood` - and the same rating as its
  // twin `yard cover crate`, which the name rules were sending to `concrete`
  // because the word "cover" appears in it. Two identical props must not
  // resolve to two different materials because of their labels.
  pair(builder, 'yard far crate', [11.5, LOW_COVER / 2, -28.0], [2.6, LOW_COVER, 2.2], m.planter,
    { ballisticMaterial: 'wood' });
  pair(builder, 'yard far crate lid', [11.5, LOW_COVER + 0.03, -28.0], [2.68, 0.06, 2.28], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard far crate strap', [11.5, LOW_COVER / 2, -28.0], [2.64, 0.10, 2.24], m.chrome,
    { solid: false, shots: false, cast: true });
  // THE BORDER PATH. The reference's fence holes lead to a path that curves
  // round to the opposite yard, and this arena's border path is the straight
  // 36 x 6 m version of it - which was authored with NO cover at all, so the
  // flank route was a 36 m corridor with a spawn at each end of the map behind
  // it. Two hard bodies per path, off-axis from each other so the two paths do
  // not line up through the fence gaps.
  // HF-467: both buttresses were `reinforced` fall-throughs. They are cast
  // blocks by design (HARD_COVER, `m.block`), so `concrete` is the honest
  // rating - cover you go around, not cover that eats a sniper round.
  pair(builder, 'path buttress west', [-3.0, HARD_COVER / 2, -40.0], [3.0, HARD_COVER, 2.0], m.block,
    { ballisticMaterial: 'concrete' });
  pair(builder, 'path buttress east', [10.0, HARD_COVER / 2, -40.0], [3.0, HARD_COVER, 2.0], m.block,
    { ballisticMaterial: 'concrete' });
  // Water butt beside the shed placement. x = -8.5 is NOT arbitrary: the shed
  // at (-14, -24.5) with yaw pi/2 occupies x [-16.1, -11.9] and z [-26.3,
  // -22.7] (destructible-shed-registry.ts, shedPlacementFootprint), so the butt
  // stands 2.8 m clear of its east wall instead of inside it. The shed sits
  // that far forward in the yard because the registry gate requires 5.5 m of
  // clearance from every spawn and the spawn line is at |z| = 30-32.
  // HF-467: authored in `m.block` and standing as hard cover, so it is rated
  // with the blocks rather than as the plastic water butt its NAME suggests.
  // Rating follows the authored material and the gameplay role, not the noun.
  pair(builder, 'yard butt', [-8.5, LOW_COVER, -26], [1.2, LOW_COVER * 2, 1.2], m.block,
    { ballisticMaterial: 'concrete' });
  // --- HF-440 Cycle 2: Backyard swimming pool, patio decks & contact skirts --
  // Backyard swimming pool (HF-440 Lane BA: Beer-Lambert water feature):
  pair(builder, 'yard pool coping', [4.8, 0.18, -29.5], [4.4, 0.36, 3.2], m.drive,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard pool water nuketown2-yard-pool-water', [4.8, 0.22, -29.5], [3.8, 0.04, 2.6], m.poolWater,
    { solid: false, shots: false, cast: false });
  pair(builder, 'yard pool ladder rail left', [4.8 - 1.6, 0.45, -29.5 - 0.25], [0.06, 0.55, 0.06], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard pool ladder rail right', [4.8 - 1.6, 0.45, -29.5 + 0.25], [0.06, 0.55, 0.06], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard pool deck chair 0', [4.8 + 0.7, 0.22, -26.8], [0.70, 0.20, 1.60], m.trim,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard pool deck chair 1', [4.8 - 0.7, 0.22, -26.8], [0.70, 0.20, 1.60], m.trim,
    { solid: false, shots: false, cast: true });
  // Domestic patio BBQ grill & cooler accessories (clear of pool deck and footings):
  pair(builder, 'yard patio grill body', [4.8 + 1.8, 0.45, -25.8], [0.55, 0.60, 0.55], m.block,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard patio grill lid', [4.8 + 1.8, 0.82, -25.8], [0.58, 0.14, 0.58], m.chrome,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard patio cooler body', [4.8 + 1.8, 0.20, -24.8], [0.60, 0.35, 0.40], m.carA,
    { solid: false, shots: false, cast: true });
  pair(builder, 'yard patio cooler lid', [4.8 + 1.8, 0.40, -24.8], [0.62, 0.05, 0.42], m.trim,
    { solid: false, shots: false, cast: true });
  // Foundation pads & contact skirts under yard obstacles (prevents grass blade clipping):
  pair(builder, 'yard cover crate pad', [-8.5, 0.04, HOUSE_BACK_Z - 4.5], [2.70, 0.08, 2.30], m.drive,
    { solid: false, shots: false, cast: false });
  pair(builder, 'yard far crate pad', [11.5, 0.04, -28.0], [2.90, 0.08, 2.50], m.drive,
    { solid: false, shots: false, cast: false });
  pair(builder, 'yard cover wall footing', [5.5, 0.04, HOUSE_BACK_Z - 5.5], [7.30, 0.08, 0.55], m.drive,
    { solid: false, shots: false, cast: false });
  pair(builder, 'yard butt pad', [-8.5, 0.04, -26], [1.40, 0.08, 1.40], m.drive,
    { solid: false, shots: false, cast: false });
  pair(builder, 'yard patio table slab', [-14.5, 0.04, -31.5], [2.60, 0.08, 2.60], m.drive,
    { solid: false, shots: false, cast: false });
}

/**
 * HF-477 - THE THIRD HOUSE, BEYOND THE TURNING HEAD.
 *
 * FINDINGS Q4, VERIFIED on `nt2025-aerial-boii.jpg`: past the fence at the head
 * end stands "a dark pitched-roof house with big white window bands, its own
 * driveway and a RED car on it". FINDINGS calls it "the single best chirality
 * landmark the reference actually has", and that is exactly the job it does
 * here: it is the one body on this map that says WHICH END you are looking at
 * from anywhere, without a minimap and without a colour you have to remember.
 *
 * IT IS OUT OF PLAY, DELIBERATELY AND STRUCTURALLY. `NUKETOWN2_BOUNDS` stops at
 * |x| = 18 and the perimeter wall stands just inside that, so there is no
 * authored footprint left inside the map for a third building - the lane brief
 * allows exactly this ("out of play if the bounds require"). Every body below
 * therefore stands ENTIRELY beyond `NUKETOWN2_BOUNDS`, and the fidelity gate
 * asserts that rather than trusting it: a body in this set that ever reaches
 * back inside the fence fails the build. It keeps a simple collider anyway, so
 * a stray round or a chopper cannot pass through a house-shaped hole.
 *
 * It is emitted ONCE, with no 180-degree partner, because the reference has one
 * of it at one end. That is the second enumerated asymmetry this pass creates
 * and `nuketown2-fidelity.test.ts` pays for it with the out-of-bounds property
 * above.
 */
function thirdHouse(builder: Builder, m: Nuketown2Materials): void {
  const head = NUKETOWN2_CUL_DE_SAC;
  // Authored x, beyond the closed end. The near gable stands 1.2 m past the
  // map bound so nothing is ever inside it, and the block is set on the head's
  // own centre line across the street so it closes the vista down the stem.
  const nearX = head.closedX - 2.7;
  const width = 8.4;
  const centreX = nearX - width / 2;
  const depth = 10.5;
  const centreZ = -1.0;
  const eaves = 4.6;
  const ridge = 6.4;
  const solid = { cast: true } as const;
  // Ground block and its dark pitched roof, approximated as two stacked decks
  // because nothing in this arena is yawed (see the file header).
  box(builder, 'nuketown2 beyond-bounds third house block',
    [nuketown2HandedX(centreX), eaves / 2, centreZ], [width, eaves, depth], m.sidingB, solid);
  box(builder, 'nuketown2 beyond-bounds third house eaves',
    [nuketown2HandedX(centreX), eaves + 0.2, centreZ], [width + 0.7, 0.4, depth + 0.7], m.roof, solid);
  box(builder, 'nuketown2 beyond-bounds third house roof',
    [nuketown2HandedX(centreX), (eaves + 0.4 + ridge) / 2, centreZ],
    [width * 0.62, ridge - eaves - 0.4, depth * 0.62], m.roof, solid);
  // The "big white window bands" the reference frame reads at this distance.
  for (const [index, side] of [-1, 1].entries()) {
    box(builder, `nuketown2 beyond-bounds third house window band ${index}`,
      [nuketown2HandedX(nearX + 0.06), 2.9, centreZ + side * depth * 0.22],
      [0.12, 1.5, depth * 0.3], m.windowGlass, { solid: false, shots: false, cast: false });
  }
  // Its own drive, and the RED car standing on it. The drive is a decal at the
  // same 0.02 m rise every apron on this map uses.
  // The drive runs BESIDE the house rather than in front of it: in front is
  // inside the map, and the gate that keeps this whole set out of play caught
  // the first attempt doing exactly that. Beside it is also what the aerial
  // shows - the drive is on the flank nearest the turning head.
  const driveX = nearX - 3.0;
  const driveZ = centreZ + depth / 2 + 2.2;
  box(builder, 'nuketown2 beyond-bounds third house drive',
    [nuketown2HandedX(driveX), -0.05, driveZ], [4.2, 0.14, 3.4], m.driveDecal,
    { solid: false, shots: false, cast: false });
  box(builder, 'nuketown2 beyond-bounds third house car body',
    [nuketown2HandedX(driveX), 0.72, driveZ], [4.4, 1.0, 1.9], m.busTrim, solid);
  // SOLID, like every other car cabin on this map. Authored non-solid it is a
  // walkable visual with nothing under it, which the walkable-surface parity
  // gate reports as a 3.7 m2 fall-through floor - correctly, because the roof
  // of a car you can stand on has to hold you up.
  box(builder, 'nuketown2 beyond-bounds third house car cabin',
    [nuketown2HandedX(driveX - 0.2), 1.55, driveZ], [2.2, 0.66, 1.7], m.carGlass, solid);
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
  pair(builder, 'perimeter wall end', [NUKETOWN2_BOUNDS.minX + 0.25, H / 2, 0], [0.4, H, depth], m.fence);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildNuketown2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Nuketown2 arena');
  const m = nuketown2Materials();

  // Ground runs well past the fence so the horizon is continuous scrub rather
  // than an 84 m slab in a void. The outdoor slab is tiled only where it is
  // not beneath a house or garage footprint; each interior floor is the sole
  // walking/drawing surface in its own plan cut.
  //
  // HF-426 Job 3: 220 -> 270 m. The mountain ring's outer radius is 132 m, and
  // at 220 the slab stopped at 110 - INSIDE the main ridge's own 100..132 band,
  // so the massif would have stood half on the plain and half on nothing. 270
  // puts the plain's edge 3 m past the ridge's outer foot, where the massif
  // itself hides it. This tiled slab is also why the rebuild takes the
  // backdrop's rings WITHOUT its rolling ground skirt: it has ground out there
  // everywhere except the four exact building cuts.
  buildNuketown2Ground(builder, m);
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
  thirdHouse(builder, m);
  truck(builder, m);
  coach(builder, m);
  cars(builder, m);
  // HF-462 / HF-472: lofted vehicle bodies OVER the boxes above, which keep
  // every collider and shot surface they registered. Runs BEFORE the batcher
  // so the superseded boxes can withdraw from it, and its audit is recorded
  // on the root for the gate that reads it.
  builder.root.userData.nuketown2ForgeAudit = forgedStreetVehicles(builder);

  // ---- PASS 94 lane TECHNIQUES: the reference's own hero props ------------
  // Emitted through `pair()` like every other body, and BEFORE the batcher, so
  // the presentation tiers merge into the arena's existing presentation batch
  // and cost no extra draw call. Geometry is an exact rotational pair; the
  // reference's yard identity is carried by the appliance hob COLOUR alone
  // (red north / blue south) - see src/nuketown2-yard-props.ts for why.
  const propMaterials = createNuketown2YardPropMaterials();
  for (const prop of nuketown2YardPropSolids(propMaterials)) {
    pair(builder, prop.name, [...prop.position], [...prop.size], prop.material, prop.options);
  }

  // ---- PASS 94 lane TECHNIQUES: tiered grime -----------------------------
  // Tyre scuff, oil, slab cracking, court paint, stepping stones and wall
  // grime. Every ground piece is OUTSIDE the carriageway and outside both
  // building footprints, where `find-coplanar-pairs.ts` honours a polygon
  // offset - so each is fenced by the -3 tier the module owns rather than
  // hidden from the audit. Carriageway skid marks are OPEN, with the reason,
  // in src/nuketown2-grime-decals.ts.
  const grimeMaterials = createNuketown2GrimeMaterials();
  for (const decal of nuketown2GrimeDecals(grimeMaterials)) {
    pair(builder, decal.name, [...decal.position], [...decal.size], decal.material,
      { solid: false, shots: false, cast: false });
  }

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
    // NUKETOWN2_GROUND_DRESSING is AUTHORED (the gate compares it against the
    // authored building footprints); the lawn field draws in the world, so the
    // mirror is applied here, at the one call site (HF-473).
    dressing: NUKETOWN2_GROUND_DRESSING.map((piece) => {
      const [x0, x1] = nuketown2HandedSpan(piece.x0, piece.x1);
      return { ...piece, x0, x1 };
    }),
    keepOuts: builder.colliders.slice(groundColliderCount),
  });
  builder.root.userData.nuketown2LawnStats = lawn.stats;

  // ---- PASS 94 lane TECHNIQUES: hedges + the avenue ----------------------
  // Presentation only, and admissible for two separate reasons the module's
  // own test pins: every hedge run dresses the footprint of a body already
  // emitted as a collider above, and every avenue tree stands outside the
  // arena rectangle inflated by AVENUE_RECT_MARGIN_M. No collider, cover read,
  // sightline or shot surface moves. Built AFTER the presentation batcher for
  // the same reason the lawn is: LOD/InstancedMesh are not batch candidates.
  const vegetation = buildNuketown2Vegetation(builder.root);
  builder.root.userData.nuketown2VegetationStats = vegetation.stats;

  // legacy-main drives this through `updateArenaArt`, the same one uniform
  // write per frame the shipped map's lawn takes. The sway itself is GPU-side.
  // Both wind consumers ride the ONE existing hook - no new per-frame call
  // site, no new traversal, and no allocation in the closure.
  builder.root.userData.nuketownLawnWind = (seconds: number) => {
    lawn.advanceWind(seconds);
    vegetation.advanceWind(seconds);
  };
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
  const truckWorldX = nuketown2HandedSpan(t.x - t.boxLength / 2, t.cabX + t.cabLength / 2);
  const coachWorldX = nuketown2HandedSpan(c.x - c.length / 2, c.x + c.length / 2);

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
      // Authored x, mirrored to the world frame like every other solid (HF-473).
    ].map(([x, z]) => new THREE.Vector3(nuketown2HandedX(x!), 0, z!)),
    targets: [],
    houses: [],
    breakableWindows: builder.breakableWindows ?? [],
    physicalCover: [
      {
        id: 'nuketown2-central-truck',
        bounds: {
          // The authored x interval, mirrored and re-sorted (HF-473).
          minX: truckWorldX[0], maxX: truckWorldX[1],
          minZ: t.z - t.width / 2, maxZ: t.z + t.width / 2,
          minY: 0, maxY: t.roofY,
        },
        blocksMovement: true,
        blocksShots: true,
      },
      {
        id: 'nuketown2-street-coach',
        bounds: {
          minX: coachWorldX[0], maxX: coachWorldX[1],
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
