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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HANDEDNESS — HF-473 (owner, 2026-09-04 11:15 BST).
 *
 * "when I play Black Ops 2 on Steam the garage is always on the RIGHT of the
 *  house from behind it, whereas here both garages are on the LEFT."
 *
 * R4 (`docs/research/2026-09-04/R4-bo2-nuketown-accuracy.md` §3) had already
 * reached the structural half of this: the reference map is 180-degree
 * ROTATIONALLY symmetric, and so is ours, so both houses necessarily agree with
 * each other about which end their garage is on — but nothing in the arena said
 * WHICH end, and R4 had to leave that OPEN because no source it could open
 * states it. The owner played the reference and settled it.
 *
 * The correction is therefore a MIRROR of the whole authored layout across the
 * street axis, NOT a rotation. A rotation is what the map already has (it is
 * what `pair()` emits) and applying another one changes nothing; only a
 * reflection changes chirality. Because every solid in this arena is
 * axis-aligned, that reflection is exactly `x -> -x`, applied once, at the
 * emitters — see the "TWO FRAMES" note at the top of `nuketown2-arena.ts`.
 *
 *   +1  the AUTHORED frame: the north house's garage is on the +x
 *       (cul-de-sac) end of its house, which reads as garage-on-the-LEFT from
 *       that house's own back yard. This is what shipped through PASS 93 and
 *       what the owner rejected.
 *   -1  the mirror of it: garage-on-the-RIGHT from each house's back yard,
 *       which is what the reference does.
 *
 * CLAIM-STATE: VERIFIED against the owner's own play session on 2026-09-04
 * (HF-473), not against a pixel. FALSIFIER: stand in either back yard in the
 * reference, look at that house, and see the garage on the LEFT — then this is
 * `1` again, and every handed feature follows it in one edit because nothing
 * downstream hard-codes a side. `nuketown2-fidelity.test.ts` proves that:
 * "puts each garage on the RIGHT of its own house, seen from that house's back
 * yard" measures the cross product on the BUILT geometry, and the minimap
 * projection is checked to agree with the world.
 */
export const NUKETOWN2_HANDEDNESS: 1 | -1 = -1;

/** Authored x -> world x. The whole mirror is this one multiplication. */
export function nuketown2HandedX(x: number): number {
  return x * NUKETOWN2_HANDEDNESS;
}

/** Authored [x0, x1] -> world [x0, x1], re-sorted so x0 <= x1 still holds. */
export function nuketown2HandedSpan(x0: number, x1: number): readonly [number, number] {
  const a = x0 * NUKETOWN2_HANDEDNESS;
  const b = x1 * NUKETOWN2_HANDEDNESS;
  return a <= b ? [a, b] as const : [b, a] as const;
}

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

/** Radius of the open turning head. Half its bounding square, too. */
export const NUKETOWN2_TURNING_HEAD_HALF = 8;

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LOLLIPOP - HF-477, and the biggest structural correction since HF-426's
 * aspect.
 *
 * WHAT SHIPPED THROUGH PASS 93. A through-street the full 36 m of the map with
 * a SQUARE 16 x 16 m turning head CENTRED on it, so the road had two identical
 * blank ends and no cul-de-sac at all. That shape came from
 * `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md` section 3, which is measured
 * off two minimaps and reads the head as an inboard widening.
 *
 * WHAT THE REFERENCE HAS. `docs/references/nuketown-2025/FINDINGS.md` Q4,
 * VERIFIED on `nt2025-aerial-boii.jpg` (BO2-2025): a LOLLIPOP - one CIRCULAR
 * kerbed turning head at one end, and a straight STEM running off the map at
 * the other. The BO2 minimap draws the same circle with a narrower arm off one
 * side. "This is not what we build ... It is one head at one end, with a road
 * leaving at the other."
 *
 * WHICH END IS WHICH, DERIVED AND NOT COPIED. FINDINGS Q4 also fixes the
 * relation between the head and the houses: the ORANGE house's garage wing is
 * at the end of that house AWAY from the third house and the turning head - the
 * STEM side - and by the 180-degree pairing the white house's garage is at the
 * HEAD end. In this file's AUTHORED frame the north house is the orange one
 * (see `nuketown2-arena.ts`' siding block) and its garage hangs off its +x end.
 * Therefore, in the AUTHORED frame:
 *
 *   authored +x = the STEM, running off the map
 *   authored -x = the CUL-DE-SAC, its bulb, its fence and the third house
 *
 * and because the world is the authored frame mirrored on x by
 * NUKETOWN2_HANDEDNESS = -1, the WORLD has the cul-de-sac at +x. Nothing below
 * writes a world number; the mirror is still applied once, at the emitters.
 *
 * THE PROPORTIONS. The bulb is the same 16 m across the schematic already
 * measured, so the head does not change size - only where it is and what shape
 * it draws. The stem keeps NUKETOWN2_STREET_HALF_WIDTH, and that pair is
 * checkable against the aerial: measured on `nt2025-aerial-boii.jpg` the stem
 * carriageway is 425 px against the bulb's 630 px of asphalt = 0.675, and
 * 10.6 / 16 = 0.6625 - 1.9 % low.
 *
 * THE INSET IS AUTHORED, AND FINDINGS OPEN ITEM 5 SAYS WHY IT HAS TO BE. The
 * BO2 minimap shows the circle inboard of the street's extent; the aerial shows
 * it terminating the road; both can be true and the exact inset is unmeasured.
 * Authored at 1.5 m of verge between the bulb's kerb and the map bound, which
 * is the width the perimeter fence and the third house's frontage need and is
 * the smallest inset that is not zero. OPEN.
 */
export const NUKETOWN2_CUL_DE_SAC = Object.freeze({
  /** Authored x of the bulb's centre. */
  centreX: -8.5,
  /** Bulb radius, and half its bounding square. */
  radius: NUKETOWN2_TURNING_HEAD_HALF,
  /** Authored x where the bulb's bounding square ends and the stem begins. */
  mouthX: -8.5 + NUKETOWN2_TURNING_HEAD_HALF,
  /** Authored x where the stem leaves the map. */
  offMapX: NUKETOWN2_BOUNDS.maxX,
  /** Authored x of the closed end's kerb. */
  closedX: -8.5 - NUKETOWN2_TURNING_HEAD_HALF,
});

/**
 * Plan union that owns the carriageway floor. The ground builder cuts these
 * exact rectangles before emitting the real road slabs, so visual geometry and
 * the coplanar-pair instrument share one source of truth.
 *
 * TWO RECTANGLES STILL, AND DELIBERATELY. The bulb is a DISC, but its ground
 * cut is its bounding SQUARE: the four corners between the disc and the square
 * are the reference's own wide concrete kerb apron (clearly visible in
 * `nt2025-aerial-boii.jpg`), which `street()` lays as kerb-height islands over
 * the same asphalt slab. Cutting the disc out band by band instead would
 * multiply the ground tiler's grid - it builds one tile per (x-cut, z-cut) cell
 * - for a boundary no player ever stands on the far side of.
 */
export const NUKETOWN2_CARRIAGEWAY_FOOTPRINTS = Object.freeze([
  Object.freeze({
    id: 'street' as const,
    x0: NUKETOWN2_CUL_DE_SAC.mouthX,
    x1: NUKETOWN2_CUL_DE_SAC.offMapX,
    z0: -NUKETOWN2_STREET_HALF_WIDTH,
    z1: NUKETOWN2_STREET_HALF_WIDTH,
  }),
  Object.freeze({
    id: 'turning-head' as const,
    x0: NUKETOWN2_CUL_DE_SAC.closedX,
    x1: NUKETOWN2_CUL_DE_SAC.mouthX,
    z0: -NUKETOWN2_TURNING_HEAD_HALF,
    z1: NUKETOWN2_TURNING_HEAD_HALF,
  }),
]);

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

/**
 * The ground-floor interior slab is deliberately raised above the outdoor
 * ground plane. Its bottom may sink into the surrounding world floor, but its
 * top is the one authoritative indoor walking surface.
 */
export const NUKETOWN2_GROUND_FLOOR_T = 0.16;
export const NUKETOWN2_GROUND_FLOOR_TOP = NUKETOWN2_GROUND_FLOOR_T / 2;

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
 * Authored-frame poses for the two HF-465 review stations. The offsets are
 * measured from the north house's own layout anchors; the visual definition
 * applies NUKETOWN2_HANDEDNESS exactly once when it emits world X values.
 * Keeping the poses here makes a house/layout change move the review stations
 * with the geometry instead of leaving a mirrored literal behind.
 */
export const NUKETOWN2_REVIEW_CAMERA_ANCHORS = Object.freeze({
  northBalcony: Object.freeze({
    position: [
      NUKETOWN2_HOUSE_LAYOUT[0].x - 8.25,
      1.75,
      NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH - 4.5,
    ] as const,
    target: [
      NUKETOWN2_HOUSE_LAYOUT[0].x - 1.75,
      NUKETOWN2_UPPER_Y0 + 0.1,
      NUKETOWN2_HOUSE_FRONT_Z - NUKETOWN2_HOUSE_DEPTH - 1,
    ] as const,
  }),
  frontPorch: Object.freeze({
    position: [
      NUKETOWN2_HOUSE_LAYOUT[0].x - 6.75,
      1.9,
      NUKETOWN2_HOUSE_FRONT_Z + 5.4,
    ] as const,
    target: [
      NUKETOWN2_HOUSE_LAYOUT[0].x,
      NUKETOWN2_UPPER_Y0 - 0.2,
      NUKETOWN2_HOUSE_FRONT_Z + 0.3,
    ] as const,
  }),
});

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
  // World frame: the authored x is mirrored by NUKETOWN2_HANDEDNESS (HF-473),
  // because railgun-authority.ts spawns the weapon at this exact point and a
  // site left in the authored frame would put it in the far upper room.
  position: Object.freeze([nuketown2HandedX(house.x), UPPER_Y0 + 0.7, house.z + house.facing * 3.9] as const),
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
 *     gives roofY <= 3.95. Authored 3.25, dy 1.10.
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
  /**
   * HF-477 - THE TRUCK MOVED INTO THE BULB, because the bulb moved.
   *
   * Until this pass the cargo box stood at the world origin and `x` did not
   * exist: the turning head was centred on the map, so "in the head" and "at
   * x = 0" were the same statement. With the head at the cul-de-sac end
   * (NUKETOWN2_CUL_DE_SAC) they are not, and the aerial
   * (`nt2025-aerial-boii.jpg`) is unambiguous - the truck stands IN the bulb,
   * nose pointed down the stem.
   *
   * -10.6 is derived, not chosen: the truck is 11.7 m end to end and the bulb
   * is a 16 m disc, so the only free parameter is how far the nose reaches. At
   * -10.6 the front bumper lands at authored x = -2.03 and the disc at the
   * bumper's own |z| = 4.05 reaches -1.60, so the nose stops 0.43 m short of
   * the kerb line instead of parking over it. Everything else about the truck -
   * its 0.325 L length split, its z, its deck and roof heights and the 2x core
   * that rides it - is unchanged, and the core's seat is DERIVED from this
   * field in `src/overdrive.ts` so it cannot be left behind.
   */
  x: -10.6,
  /** 0.0764 L south of the road centre-line; reference 0.076 L. */
  z: 2.75,
  deckY: 0.05,
  roofY: 3.25,
  cabRoofY: 2.9,
  /** Cab centre along the street: the box centre plus box half plus cab half. */
  cabX: -10.6 + 6.5 / 2 + 5.2 / 2,
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
  /**
   * HF-477 FLIPPED THE SIGN, and the magnitude is untouched. The schematic
   * measures the coach 0.178 L from the truck's cargo box ALONG the street but
   * does not say which way, and with a centred turning head there was nothing
   * to decide it, so HF-426 took -x. `nt2025-aerial-boii.jpg` decides it: the
   * coach's cream body sits nearer the STEM than the truck's box does, with
   * its dark nose pointed down it. Authored +x, which is the stem in this
   * frame, and measured from the truck's own centre rather than from the world
   * origin because the truck is no longer at it.
   */
  x: NUKETOWN2_CENTRAL_TRUCK.x + COACH_OFFSET_ALONG,
  z: NUKETOWN2_CENTRAL_TRUCK.z - COACH_OFFSET_ACROSS,
});

/**
 * HF-477 - THE TWO CARS THE REFERENCE PUTS IN THE ROAD, which this arena had
 * as one aqua saloon parked across the road centre-line at a spot chosen to
 * hold a fidelity band down (see `coach()`'s "head car" note).
 *
 * FINDINGS Q4, VERIFIED on `nt2025-aerial-boii.jpg`:
 *   - a DARK SALOON tucked right beside the box truck, on the WHITE house's
 *     side of the road, nosed down the stem with it. That is the truck's own
 *     side here (`NUKETOWN2_CENTRAL_TRUCK.z` is positive and the south house is
 *     the white one), so it goes in the stem beside the truck rather than in
 *     the bulb, where the 11.7 m truck leaves no 4.4 m slot at that z.
 *   - a GREEN/TEAL CLASSIC CAR out in the STEM, and it is the body that now
 *     carries `MAX_STREET_CENTRE_RUN_METRES`: it is the only thing parked
 *     across the road's centre-line, which is exactly the role the head car
 *     used to play, so the band's derivation moves to it intact rather than
 *     being loosened.
 */
export const NUKETOWN2_STREET_CARS = Object.freeze({
  /** The dark saloon, beside the truck, nosed down the stem. */
  saloon: Object.freeze({ x: 2.0, z: 3.2, length: 4.4, width: 1.9 }),
  /** The green classic, out in the stem across the centre-line. */
  classic: Object.freeze({ x: 5.0, z: -0.6, length: 4.4, width: 1.9 }),
});
