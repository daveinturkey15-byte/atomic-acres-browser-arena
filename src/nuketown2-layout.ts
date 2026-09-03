/**
 * NUKETOWN2 layout constants — the numbers the arena is built from, with NO imports.
 *
 * WHY THIS FILE EXISTS (HF-407, 2026-09-02). The rare-gun runtime switch in
 * `src/railgun-authority.ts` has to know where the rebuild's pickup sites are, and the
 * one thing it must NOT do is transcribe them: the header of that file records what
 * happened the last time a rare-weapon coordinate was hand-written against a layout
 * that later moved (half of all matches put the weapon outside the map). But importing
 * `nuketown2-arena.ts` for them is impossible — that module pulls in three and
 * `additional-maps`, and `protocol.ts` already imports `railgun-authority.ts`, so the
 * edge closes a require cycle that fails at import time (observed: `NUKETOWN2_RARE_GUN_SITES`
 * undefined inside `railgun-authority.ts` under vitest).
 *
 * So the constants the weapon layer needs live here, dependency-free, and BOTH the arena
 * builder and the weapon authority derive from this one source. `nuketown2-arena.ts`
 * re-exports them, so every existing importer is unaffected.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HF-426 (owner, 2026-09-03 07:00 BST): "the nuketown rebuild is not right, its
 * based on an old layout we had here, not the actual layout of black ops 2
 * nuketown". EVERY PROPORTION BELOW WAS RE-DERIVED against
 * `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`, which is measured off the two
 * FIRST-PARTY Treyarch overhead minimaps of Nuketown 2025 rather than off a
 * published area scalar. The single structural correction, and the reason the
 * owner rejected the previous cut, is the ASPECT:
 *
 *   reference   across-street : along-street = 2.36 : 1   (both minimaps agree)
 *   previous    58 m of street by 52 m across   = 0.90 : 1
 *
 * i.e. the old cut made the STREET the long axis and ran the two teams at each
 * other down it. The reference does the opposite: the street is a short
 * cul-de-sac stub, and the map's long axis is the lot-to-lot run — yard, house,
 * road, house, yard. The playable AREA is held at the previous cut's value
 * (3,016 → 3,024 m², +0.3 %) so this is a re-proportioning and not a resize.
 */

/** The ratio base for every number in this file and in the reference schematic. */
export const NUKETOWN2_STREET_LENGTH = 36;

/**
 * The fenced playable rectangle. 36 m ALONG the street by 84 m ACROSS it.
 *
 * 84 / 36 = 2.333, against the 2.360 measured on both first-party minimaps
 * (BO2 `Nuketown_2025_Minimap_BOII.png`: 427 x 181 px = 2.359; BO7
 * `Nuketown_2025_MiniMap_BO7.png`: 944 x 400 px = 2.360) — 1.1 % low, inside
 * the lane's 5 %-of-street-length tolerance.
 *
 * The absolute scale is anchored on the PREVIOUS cut's playable area, not on a
 * published scalar: 36 x 84 = 3,024 m² against 58 x 52 = 3,016 m². The
 * reference gives shape reliably and absolute size unreliably, so shape is what
 * is taken from it.
 */
export const NUKETOWN2_BOUNDS = Object.freeze({ minX: -18, maxX: 18, minZ: -42, maxZ: 42 });

/**
 * Half-width of the carriageway. The reference's road leaves the playable
 * polygon through a tongue DRAWN 0.328 of the street length wide (BO7 minimap
 * 131 of 400 px; BO2 minimap 60 of 181 px = 0.331 - the two agree to 1 %).
 *
 * HF-437 applies the schematic's OWN stroke correction to that drawn width.
 * Section 3 caveat 1 records that the minimaps draw outlines with a thick
 * stroke worth about 0.038 L (vehicle bodies measure 0.105-0.110 L as drawn
 * against the authored 2.6 m = 0.072 L); a drawn BOUNDARY inflates the road
 * by the same stroke on each side. Stroke-corrected carriageway:
 * 0.328 - 0.038 = 0.290 L = 10.44 m, authored 2 x 5.3 = 10.6 m (0.294 L,
 * 0.004 L over the corrected measurement, well inside the lane's 0.05 L
 * tolerance and still under the drawn 0.328).
 */
export const NUKETOWN2_STREET_HALF_WIDTH = 5.3;

/**
 * Kerb line to house front - THE STRIP THE OWNER CALLED TOO NARROW ("the
 * areas on the side of the main street need to be a bit wider", PASS 91).
 *
 * The reference ratio, stated: the two house front walls stand 0.553 of the
 * street length apart (BO7 minimap: 221 px of 400), so each front wall is
 * 0.2765 L = 9.95 m off the road centre-line; subtract the stroke-corrected
 * carriageway half (0.290 L / 2 = 0.145 L) and the strip is 0.131 L.
 * At L = 36: 9.95 - 5.3 = 4.65 m of strip, authored 4.7 m = 0.131 L - up from
 * 4.1 m (+15 %), while the centre-line-to-house-front total stays 10.0 m
 * (0.278 L, deviation 0.0013 L from the measured 0.2765), so the houses and
 * the measured frontage band do not move. The extra 0.6 m carries the new
 * verge cover (low wall and kerb-side planter, HF-437).
 */
export const NUKETOWN2_FRONT_VERGE_DEPTH = 4.7;

/** Depth of a house, front wall to back wall. 0.361 L against the reference's 0.363. */
export const NUKETOWN2_HOUSE_DEPTH = 13;

/** Front face of a house. NOT the kerb line — there is a verge between them. */
export const NUKETOWN2_HOUSE_FRONT_Z = -(NUKETOWN2_STREET_HALF_WIDTH + NUKETOWN2_FRONT_VERGE_DEPTH);

/** Storey heights. Ground 3.0, both slabs 0.3, so the upper floor slab tops at 3.3. */
export const NUKETOWN2_GROUND_STOREY_H = 3.0;
export const NUKETOWN2_FLOOR_T = 0.3;
export const NUKETOWN2_UPPER_Y0 = NUKETOWN2_GROUND_STOREY_H + NUKETOWN2_FLOOR_T;

const HOUSE_DEPTH = NUKETOWN2_HOUSE_DEPTH;
const HOUSE_FRONT_Z = NUKETOWN2_HOUSE_FRONT_Z;
const UPPER_Y0 = NUKETOWN2_UPPER_Y0;

/**
 * The two houses, as the arena actually builds them. `facing: 1` means the front
 * wall looks toward +z (the road); the south house is the exact 180-degree image.
 *
 * The 2.5 m offset along the street between the two house centres is MEASURED,
 * not derived from house width: on the BO7 minimap the two house blocks are
 * offset along the street axis by 26 px of 400 = 0.065 L = 2.34 m, and this
 * arena rounds that to 2.5 m (0.069 L). The old cut used half a house width
 * (7 m, 0.121 of its own street length) on the theory that each front window
 * should look diagonally at the other house's driveway; the reference does not
 * do that — the houses very nearly face each other, and the diagonal comes from
 * the GARAGES being on opposite ends under the 180-degree rotation.
 */
export const NUKETOWN2_HOUSE_LAYOUT = Object.freeze([
  Object.freeze({ id: 'north', team: 0 as const, x: -1.25, z: HOUSE_FRONT_Z - HOUSE_DEPTH / 2, facing: 1 as const }),
  Object.freeze({ id: 'south', team: 1 as const, x: 1.25, z: -(HOUSE_FRONT_Z - HOUSE_DEPTH / 2), facing: -1 as const }),
]);

/**
 * The two upper rooms the rare weapon belongs in. Published descriptions of the
 * reference all reach the same conclusion about it: the front-facing upstairs
 * window is the strongest position on the map, because it holds the whole
 * central lane. (Activision's own Nuketown 2025 guide page says the front-facing
 * windows on both homes are the biggest power positions on the map.)
 *
 * These are EXPORTED and DERIVED from `NUKETOWN2_HOUSE_LAYOUT` rather than
 * hand-written, because the shipped map's equivalent list was hand-written
 * against a layout that later moved, and for a while half of all matches put
 * the rare weapon outside the map where no player could stand
 * (`src/railgun-authority.ts` header). The runtime gate that decides WHICH
 * arena spawns the weapon lives in that same file, which is weapons code and
 * outside this lane's ownership, so the switch is not flipped here — the sites
 * exist and are correct the day it is.
 */
export const NUKETOWN2_RARE_GUN_SITES = Object.freeze(NUKETOWN2_HOUSE_LAYOUT.map((house) => Object.freeze({
  id: `${house.id}-upper` as const,
  // 3.9 m toward the street from the house centre, NOT at the centre. The
  // centre is where the internal partition stands (PARTITION_Z is the house
  // mid-line), so the obvious `[house.x, y, house.z]` puts the weapon inside a
  // wall - which `nuketown2-fidelity.test.ts` caught on its first run, and
  // which is the identical failure src/railgun-authority.ts' header records
  // against the shipped map. This lands it in the FRONT upper room, at the
  // window the reference's analyses call its strongest position, 0.7 m above the
  // upper floor slab. 3.9 m of the 6.5 m half-depth, so it is at the window
  // rather than in the middle of the room.
  position: Object.freeze([house.x, UPPER_Y0 + 0.7, house.z + house.facing * 3.9] as const),
})));

/**
 * THE MOVING TRUCK - size, and the one thing HF-426 knowingly got wrong.
 *
 * SIZE IS MEASURED (schematic 3). On the BO7 minimap the truck is 130 px of a
 * 400 px street axis = 0.325 L end to end, split into a hollow-drawn cargo box
 * (72 px, 0.180 L) and a solid-drawn cab (58 px, 0.145 L). Here: 6.5 m box +
 * 5.2 m cab = 11.7 m = 0.325 L exactly.
 *
 * `z` IS THE HF-432 ITEM 5 CORRECTION. The reference puts the truck 0.076 L
 * SOUTH of the road centre-line and HF-426 put it ON the centre-line, with the
 * deviation recorded in schematic 5.5 for one stated reason: `OVERDRIVE_POSITION`
 * in `src/overdrive.ts` was a single global {0, 3.75, 0}, so the 2x-damage core
 * could only sit over a truck standing at the world origin, and moving it was
 * weapons code outside that lane. The orchestrator authorised the weapons
 * change for this pass, so the truck goes where the reference has it and the
 * core goes with it: 0.076 L x 36 = 2.74 m, authored 2.75 (0.0764 L, deviation
 * 0.0004 L). `overdrivePositionForArena('nuketown2')` reads this field, so the
 * core cannot be left behind if the truck moves again.
 *
 * `deckY` AND `roofY` ARE BOTH SET BY THE CORE, not by taste, and the two
 * constraints pull in opposite directions. `claimOverdrive` is a pure
 * height-and-radius rule over the arena's own core position, so with a
 * standing eye height of 1.70 m:
 *   - a player STANDING ON THE ROOF must claim: |roofY + 1.70 - coreY| <= 1.90
 *     gives roofY <= 3.95. Authored 3.15, dy 1.10.
 *   - a player STANDING IN THE CARGO BOX must NOT claim, because a core you can
 *     take from inside cover is not a contested position at all - and because
 *     `src/overdrive.ts`' own v6 comment says that window was tightened from 2.4
 *     precisely so an interior cannot claim through the roof slab. That needs
 *     coreY - (deckY + 1.70) > 1.90, i.e. deckY < 0.15. Authored 0.05, dy 2.00.
 * The margin is 0.10 m and `nuketown2-fidelity.test.ts` calls `claimOverdrive`
 * to prove it rather than restating the arithmetic.
 */
export const NUKETOWN2_CENTRAL_TRUCK = Object.freeze({
  boxLength: 6.5,
  cabLength: 5.2,
  width: 2.6,
  /** 0.0764 L south of the road centre-line; reference 0.076 L. */
  z: 2.75,
  deckY: 0.05,
  roofY: 3.15,
  cabRoofY: 2.9,
  /** Cab centre along the street: box half plus cab half. */
  cabX: 6.5 / 2 + 5.2 / 2,
  /** Height of the 2x-damage core over the cargo-box roof. */
  coreHeightOverRoof: 0.6,
});

/**
 * THE RETRO COACH, parked across the turning head from the truck. CLOSED
 * cover: the reference's minimap draws it hatched end to end, and the
 * first-party preview still shows a sealed streamlined body, not a school bus
 * you walk through. It is a solid 3.3 m body and that is the whole of its job.
 *
 * WHERE IT SITS IS AN OFFSET FROM THE TRUCK, because that is how the schematic
 * measures it: the coach centre is 0.178 L along the street and 0.150 L across
 * it from the truck's cargo box. HF-426 authored 5.0 and 4.0 m (0.139 / 0.111 L)
 * and pulled both in, because with the truck sitting on the centre-line rather
 * than 0.076 L south of it the measured pair put the coach's flank over the
 * kerb. With the truck where the reference has it (see above) that reason is
 * gone and the measured offsets are authored exactly: 6.4 m = 0.1778 L against
 * 0.178, and 5.4 m = 0.1500 L against 0.150.
 */
const COACH_OFFSET_ALONG = 6.4;
const COACH_OFFSET_ACROSS = 5.4;
export const NUKETOWN2_STREET_COACH = Object.freeze({
  length: 9.1,
  width: 2.6,
  height: 3.3,
  offsetAlong: COACH_OFFSET_ALONG,
  offsetAcross: COACH_OFFSET_ACROSS,
  x: -COACH_OFFSET_ALONG,
  z: NUKETOWN2_CENTRAL_TRUCK.z - COACH_OFFSET_ACROSS,
});
