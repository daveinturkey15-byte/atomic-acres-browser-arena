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
 */

/**
 * The fenced playable rectangle: 58 m along the street by 52 m across it =
 * 3,016 m², against the reference's published 2,972 m² minimum playspace
 * (+1.5 %). The perimeter wall stands just inside these lines.
 */
export const NUKETOWN2_BOUNDS = Object.freeze({ minX: -29, maxX: 29, minZ: -26, maxZ: 26 });

/** Half-width of the road. 9 m of carriageway: two lanes plus kerbs. */
export const NUKETOWN2_STREET_HALF_WIDTH = 4.5;

/** Depth of a house, front wall to back wall. */
export const NUKETOWN2_HOUSE_DEPTH = 10;

/** Front face of a house = the kerb line. */
export const NUKETOWN2_HOUSE_FRONT_Z = -NUKETOWN2_STREET_HALF_WIDTH;

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
 * The 7 m offset along the street between the two house centres is DERIVED:
 * half a house width (HOUSE_WIDTH = 14), which makes each front window look
 * diagonally across the road at the other house's driveway rather than straight
 * into its own mirror image.
 */
export const NUKETOWN2_HOUSE_LAYOUT = Object.freeze([
  Object.freeze({ id: 'north', team: 0 as const, x: -3.5, z: HOUSE_FRONT_Z - HOUSE_DEPTH / 2, facing: 1 as const }),
  Object.freeze({ id: 'south', team: 1 as const, x: 3.5, z: -(HOUSE_FRONT_Z - HOUSE_DEPTH / 2), facing: -1 as const }),
]);

/**
 * The two upper rooms the rare weapon belongs in. Published analyses of the
 * reference all reach the same conclusion about it: the front-facing upstairs
 * window is the strongest position on the map, because it holds the whole
 * central lane.
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
  // 3.0 m toward the street from the house centre, NOT at the centre. The
  // centre is where the internal partition stands (PARTITION_Z is the house
  // mid-line), so the obvious `[house.x, y, house.z]` puts the weapon inside a
  // wall - which `nuketown2-fidelity.test.ts` caught on its first run, and
  // which is the identical failure src/railgun-authority.ts' header records
  // against the shipped map. This lands it in the FRONT upper room, at the
  // window the reference's analyses call its strongest position, 0.7 m above the
  // upper floor slab.
  position: Object.freeze([house.x, UPPER_Y0 + 0.7, house.z + house.facing * 3.0] as const),
})));
