/**
 * NUKETOWN2: Nuke Town Rebuild (PREVIEW) — HF-407, owner 2026-09-02 ~16:10 BST.
 *
 * "I don't think it's very true in layout or style to the original nuketown map
 *  from black ops 2 ... the layout needs a total rejig and the bus can probably
 *  be made with code instead of blender ... just mirror what it has and the way
 *  the closed/open vehicles work as cover."
 *
 * WHAT THIS FILE IS. A complete, code-authored replacement layout for the Nuke
 * Town flow, built beside the shipped arena rather than on top of it. The
 * shipped `atomic-acres` is the only `authoring: 'import'` arena in the game —
 * a 7.3 MB Blender bake plus 1,110 lines of hand-written collision in
 * `src/map.ts`. Nothing here imports a mesh, an image, a font or a LUT. Every
 * wall, vehicle, fence and kerb below is a TypeScript box with a collider.
 *
 * THE PROPORTIONS ARE MEASURED, NOT FELT. `docs/NUKETOWN_REBUILD_2026-09-02.md`
 * is the reference study this file is built against and it was written first.
 * The single hard published scalar for the reference map is area: 2,972 m²
 * minimum playspace, 4,950 m² whole map, ratio 0.60. This arena's fenced
 * rectangle is 58 x 52 = 3,016 m² (+1.5 %) and the whole authored map including
 * the out-of-bounds verge is 74 x 68 = 5,032 m² (+1.7 %), ratio 0.60. Every
 * other dimension is a ratio derived in that document from published
 * descriptions of the map — two two-storey houses with garages and back-yard
 * spawns either side of a road, upstairs front windows as the power position, a
 * side path along the border, a school bus and a moving truck and two cars in
 * the road — and each derived number is labelled there so a later lane can
 * rescale the map by one constant instead of re-deriving the flow.
 *
 * THE THREE THINGS THE SHIPPED MAP GETS WRONG, and what changed here:
 *
 *   1. SPAWNS. The 2026-08-29 redesign moved both teams to the two ends of the
 *      street ("end-garden spawns"). Published descriptions of the reference are
 *      unambiguous that spawns are in the BACK YARDS BEHIND EACH HOUSE, on
 *      opposite sides of the road. That single change is most of what the owner
 *      is reading as "not true to the layout": end spawns make the street a
 *      corridor you run along, back-yard spawns make it a road you cross.
 *   2. SYMMETRY. Back-yard spawns on opposite sides of one road can only be
 *      made equal by 180-degree ROTATION, never by mirroring. Every solid in
 *      this file is emitted through `pair()`, which writes the body and its
 *      exact rotational partner in one call, so the symmetry the fidelity gate
 *      measures is structural rather than hand-maintained. The only bodies not
 *      written through `pair()` are the ones already centred on the origin, and
 *      they are their own partners.
 *   3. VEHICLES. The shipped map has one bus and calls the job done. The
 *      reference road carries a school bus, a moving truck and a couple of cars,
 *      and it matters which are OPEN (enterable, shoot-through gaps) and which
 *      are CLOSED (solid). Here the bus is open — floor, roof, door gaps and a
 *      window band you can shoot through, so it is a room in the middle of the
 *      road — the two cul-de-sac trucks have open cargo boxes, and the two
 *      driveway cars are solid.
 *
 * WHY TWO TRUCKS WHEN THE REFERENCE HAS ONE. Stated deviation, in the design
 * doc too. One enterable cargo box at one end of the street hands that end's
 * team a cover asset the other team does not have, against the reference's own
 * "each team gets the same options" property and against the symmetry gate. The
 * bus stays single because it is centred on the origin and is therefore its own
 * rotational partner — exactly as the reference has it.
 *
 * WHY THE BUS IS CENTRED ON THE WORLD ORIGIN. `OVERDRIVE_POSITION` in
 * `src/overdrive.ts` is a single global `{0, 3.75, 0}`, not a per-arena value.
 * Authoring the bus roof at 3.15 m puts the 2x-damage core 0.60 m above it,
 * inside the 1.9 m pickup window, and the owner's "keep the 2x damage" is
 * carried with zero new runtime code and zero risk to the shipped arena.
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

// ---------------------------------------------------------------------------
// Footprint
// ---------------------------------------------------------------------------

/**
 * The fenced playable rectangle: 58 m along the street by 52 m across it =
 * 3,016 m², against the reference's published 2,972 m² minimum playspace
 * (+1.5 %). The perimeter wall stands just inside these lines.
 */
export const NUKETOWN2_BOUNDS = Object.freeze({ minX: -29, maxX: 29, minZ: -26, maxZ: 26 });

/** Half-width of the road. 9 m of carriageway: two lanes plus kerbs. */
export const NUKETOWN2_STREET_HALF_WIDTH = 4.5;

/** Depth of a house, front wall to back wall. */
const HOUSE_DEPTH = 10;
/** Width of a house along the street. 16 x 10 = 160 m², 5.3 % of the playspace. */
const HOUSE_WIDTH = 16;
/** Back yard depth: enough for a spawn line, the shed and a fence gate. */
const YARD_DEPTH = 7.5;
/**
 * The border lane - the reference's "side paths along the north border" that
 * give the distant views. DERIVED, not authored: it is whatever the fenced
 * rectangle has left after the street, the two houses and the two back yards,
 * so the cross-street section can never silently stop adding up to the
 * footprint the design doc measured against the reference.
 */
const SIDE_PATH_DEPTH = -NUKETOWN2_BOUNDS.minZ
  - (NUKETOWN2_STREET_HALF_WIDTH + HOUSE_DEPTH + YARD_DEPTH);

/** Front face of a house = the kerb line. */
const HOUSE_FRONT_Z = -NUKETOWN2_STREET_HALF_WIDTH;
/** Back face of a house. */
const HOUSE_BACK_Z = HOUSE_FRONT_Z - HOUSE_DEPTH;          // -14.5
/** Fence line between the back yard and the border path. */
const YARD_FENCE_Z = HOUSE_BACK_Z - YARD_DEPTH;            // -22

/** Storey heights. Ground 3.0, upper 2.9, both slabs 0.3, roof deck at 6.5. */
const GROUND_H = 3.0;
const FLOOR_T = 0.3;
const UPPER_Y0 = GROUND_H + FLOOR_T;                        // 3.3
const UPPER_H = 2.9;
const ROOF_Y0 = UPPER_Y0 + UPPER_H;                         // 6.2
const ROOF_T = 0.3;

const WALL_T = 0.3;
/** Waist-high cover: breaks a prone or crouched line, and vaultable. */
const LOW_COVER = 0.95;
/** Hard cover: clears the 1.65 m standing eye line. */
const HARD_COVER = 1.9;

/**
 * The two houses, as the arena actually builds them. `facing: 1` means the front
 * wall looks toward +z (the road); the south house is the exact 180-degree image.
 *
 * The 8 m offset along the street between the two house centres is DERIVED (see
 * the design doc §2.3): it is the smallest offset that makes each front window
 * look diagonally across the road at the other house's driveway rather than
 * straight into its own mirror image, which is what makes the place read as a
 * street instead of a pair of facing boxes.
 */
export const NUKETOWN2_HOUSE_LAYOUT = Object.freeze([
  Object.freeze({ id: 'north', team: 0 as const, x: -4, z: HOUSE_FRONT_Z - HOUSE_DEPTH / 2, facing: 1 as const }),
  Object.freeze({ id: 'south', team: 1 as const, x: 4, z: -(HOUSE_FRONT_Z - HOUSE_DEPTH / 2), facing: -1 as const }),
]);

/** House extents along the street, north house. The south house is its negation. */
const HOUSE_X0 = NUKETOWN2_HOUSE_LAYOUT[0].x - HOUSE_WIDTH / 2;  // -12
const HOUSE_X1 = NUKETOWN2_HOUSE_LAYOUT[0].x + HOUSE_WIDTH / 2;  // 4
/** Garage: 8 m wide, attached to the outboard end of its house, same depth. */
const GARAGE_WIDTH = 8;
const GARAGE_X1 = HOUSE_X0;                                       // -12
const GARAGE_X0 = GARAGE_X1 - GARAGE_WIDTH;                       // -20

/**
 * The authored section, in metres. Every number here is the one the build
 * itself uses, and the along-street offset is READ BACK from the house layout
 * rather than restated, so the section can never describe a map that is not the
 * one `buildNuketown2()` emits. `nuketown2-fidelity.test.ts` measures the built
 * colliders against this and against the reference ratios in the design doc.
 */
export const NUKETOWN2_SECTION = Object.freeze({
  streetHalfWidth: NUKETOWN2_STREET_HALF_WIDTH,
  houseDepth: HOUSE_DEPTH,
  houseWidth: HOUSE_WIDTH,
  yardDepth: YARD_DEPTH,
  sidePathDepth: SIDE_PATH_DEPTH,
  garageWidth: GARAGE_WIDTH,
  houseOffsetAlongStreet: NUKETOWN2_HOUSE_LAYOUT[1]!.x - NUKETOWN2_HOUSE_LAYOUT[0]!.x,
});

/**
 * The central bus, as authored. Length is the load-bearing number: 11 m of
 * solid body across the middle of a 58 m street is what stops the road being one
 * lane end to end, and it is why the sightline band in the fidelity test is
 * what it is.
 */
export const NUKETOWN2_CENTRAL_BUS = Object.freeze({
  length: 11,
  width: 2.5,
  floorY: 0.85,
  roofY: 3.15,
});

/**
 * The two upper rooms the rare weapon belongs in — the reference's "upstairs
 * window is the biggest power position on the map".
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
  // window the reference calls the biggest power position, 0.7 m above the
  // upper floor slab.
  position: Object.freeze([house.x, UPPER_Y0 + 0.7, house.z + house.facing * 3.0] as const),
})));

/**
 * Spawn table. Both teams stand in their own BACK YARD behind their own house,
 * which is the reference's arrangement and the single biggest flow correction in
 * this arena. Team 1's points are the exact 180-degree negation of team 0's, so
 * neither team owns a better half by construction.
 *
 * These points are the spawn solver's own validated candidates
 * (`npx tsx scripts/qa/solve-spawn-layouts.ts --arenas nuketown2 --all`), not
 * eyeballed: every one has floor beneath it, an autostep route to the enemy,
 * cover within reach, no enemy spawn in sight, and clears the gate's team
 * separation floor.
 */
export const NUKETOWN2_SPAWN_LAYOUT: readonly (readonly (readonly [number, number])[])[] = Object.freeze([
  Object.freeze([[-14, -19] as const, [-7, -20] as const, [0, -19] as const, [7, -20] as const, [14, -19] as const]),
  Object.freeze([[14, 19] as const, [7, 20] as const, [0, 19] as const, [-7, 20] as const, [-14, 19] as const]),
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
  material: THREE.Material,
  options: BoxOptions = {},
): void {
  box(builder, `nuketown2 north ${name}`, position, size, material, options);
  box(builder, `nuketown2 south ${name}`, [-position[0], position[1], -position[2]], size, material, options);
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

// ---------------------------------------------------------------------------
// Materials — original, authored for this arena
// ---------------------------------------------------------------------------

type Nuketown2Materials = Readonly<{
  ground: THREE.MeshStandardMaterial;
  lawn: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  drive: THREE.MeshStandardMaterial;
  sidingA: THREE.MeshStandardMaterial;
  sidingB: THREE.MeshStandardMaterial;
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
 * Our own palette, not the reference's. The owner's words: "we can then make our
 * own artstyle". A test-town built for one purpose and never lived in: bleached
 * board siding in two values so the two houses read apart at a glance while
 * staying the same building, a cool grey road, and exactly two saturated bodies
 * on the whole map — the bus and the truck box — so the eye goes to the road,
 * which is where the fight is.
 */
function nuketown2Materials(): Nuketown2Materials {
  return Object.freeze({
    ground: standard(0x6d6a52, 1, 0),
    lawn: standard(0x5f6b41, 0.98, 0),
    asphalt: standard(0x3c3d40, 0.95, 0.02),
    kerb: standard(0x8d8a80, 0.9, 0.02),
    drive: standard(0x6f6d66, 0.93, 0.02),
    sidingA: standard(0xc8bda2, 0.88, 0.02),
    sidingB: standard(0x9fae9c, 0.88, 0.02),
    trim: standard(0xe4ded0, 0.8, 0.03),
    roof: standard(0x54514c, 0.92, 0.03),
    interior: standard(0xb0a894, 0.9, 0.01),
    fence: standard(0x8a7a62, 0.9, 0.02),
    block: standard(0x9a958a, 0.94, 0.01),
    busShell: standard(0xd8a52b, 0.62, 0.16),
    busTrim: standard(0x2f2f31, 0.7, 0.2),
    truckCab: standard(0xa33327, 0.55, 0.24),
    truckBox: standard(0xcfc7b4, 0.72, 0.1),
    // The two parked cars are the only POLISHED surfaces on the map, and that
    // is deliberate rather than decorative: the ray-traced preset's proxy
    // extraction admits a surface at roughness <= 0.22 with a footprint over
    // 6 m2, and with everything else here authored matte (board siding, dry
    // asphalt, painted vehicle panels) the arena first measured ZERO reflective
    // meshes - the tracer had nothing to reflect at all. Car paint really is
    // ~0.2 rough and genuinely metallic, and a 4.4 x 1.9 m body clears the
    // footprint floor where the 2.2 x 1.7 m glass house does not, so the honest
    // fix was to author the paint correctly rather than to gloss a road.
    carA: standard(0x3f6f86, 0.2, 0.62),
    carGlass: standard(0x24333c, 0.14, 0.5),
    rubber: standard(0x191a1c, 0.96, 0.02),
    sign: standard(0xd9d2bd, 0.78, 0.06),
    planter: standard(0x4a4034, 0.96, 0.01),
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
 * house is a route and not a room, a stair to the upper floor, and the front
 * upper window as a real opening in the wall rather than a decal — the reference
 * calls that window the biggest power position on the map, and it only is one if
 * you can actually shoot through it.
 */
function house(builder: Builder, m: Nuketown2Materials): void {
  const siding = m.sidingA;
  const zFront = HOUSE_FRONT_Z - WALL_T / 2;      // wall centre, front face on the kerb line
  const zBack = HOUSE_BACK_Z + WALL_T / 2;
  const zMid = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;

  // Ground slab and roof deck.
  pair(builder, 'house floor', [-4, -0.1, zMid], [HOUSE_WIDTH, 0.2, HOUSE_DEPTH], m.interior, { cast: false });
  pair(builder, 'house roof deck', [-4, ROOF_Y0 + ROOF_T / 2, zMid], [HOUSE_WIDTH, ROOF_T, HOUSE_DEPTH], m.roof);

  // Side walls, full height both storeys.
  for (const x of [HOUSE_X0 + WALL_T / 2, HOUSE_X1 - WALL_T / 2]) {
    const side = x < -4 ? 'west' : 'east';
    pair(builder, `house wall ${side}`, [x, (ROOF_Y0) / 2, zMid], [WALL_T, ROOF_Y0, HOUSE_DEPTH], siding);
  }

  // --- front wall, ground floor: two windows and the front door ------------
  // Segments are authored as [x0, x1] runs; the gaps between them ARE the
  // openings, which is the whole point — a window you cannot shoot through is
  // a painting.
  const FRONT_DOOR: [number, number] = [-4.8, -3.2];
  const FRONT_WINDOW_A: [number, number] = [-9.5, -7.5];
  const FRONT_WINDOW_B: [number, number] = [-0.5, 1.5];
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
    const cx = (window[0] + window[1]) / 2;
    pair(builder, `house front window sill ${index}`, [cx, 0.5, zFront], [width, 1.0, WALL_T], m.trim);
    pair(builder, `house front window head ${index}`, [cx, 2.55, zFront], [width, 0.9, WALL_T], m.trim);
  }
  pair(builder, 'house front door lintel',
    [(FRONT_DOOR[0] + FRONT_DOOR[1]) / 2, 2.6, zFront], [FRONT_DOOR[1] - FRONT_DOOR[0], 0.8, WALL_T], m.trim);

  // --- front wall, upper floor: the power window ---------------------------
  const UPPER_WINDOW: [number, number] = [-5.6, -2.4];
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
    const cx = (UPPER_WINDOW[0] + UPPER_WINDOW[1]) / 2;
    // 0.9 m sill: you can stand at it, and you can crouch behind it.
    pair(builder, 'house upper window sill', [cx, UPPER_Y0 + 0.45, zFront], [width, 0.9, WALL_T], m.trim);
    pair(builder, 'house upper window head', [cx, UPPER_Y0 + UPPER_H - 0.45, zFront], [width, 0.9, WALL_T], m.trim);
  }

  // --- back wall: back door and one upper window ---------------------------
  const BACK_DOOR: [number, number] = [-1.6, 0];
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
  const BACK_UPPER_WINDOW: [number, number] = [-9, -6.5];
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

  // --- stair, hard against the east wall -----------------------------------
  // 11 risers of 0.30 m. Autostep is 0.42 m, so this walks; it is not a jump
  // puzzle and it is not a ramp the bots cannot read.
  const STAIR_X0 = 1.6;
  const STAIR_X1 = HOUSE_X1 - WALL_T;               // 3.7
  const STAIR_W = STAIR_X1 - STAIR_X0;
  const STAIR_CX = (STAIR_X0 + STAIR_X1) / 2;
  const RISER = 0.3;
  const GOING = 0.55;
  const STAIR_TOP_Z = HOUSE_FRONT_Z - 1.0;          // first step just inside the front room
  const risers = Math.round(UPPER_Y0 / RISER);      // 11
  for (let i = 0; i < risers; i += 1) {
    const top = RISER * (i + 1);
    pair(builder, `house stair ${i}`,
      [STAIR_CX, top / 2, STAIR_TOP_Z - GOING * (i + 0.5)], [STAIR_W, top, GOING], m.interior);
  }

  // --- upper floor slab, with the stairwell left open ----------------------
  pair(builder, 'house upper floor west',
    [(HOUSE_X0 + STAIR_X0) / 2, GROUND_H + FLOOR_T / 2, zMid],
    [STAIR_X0 - HOUSE_X0, FLOOR_T, HOUSE_DEPTH], m.interior);
  const wellZ0 = STAIR_TOP_Z - GOING * risers;      // deep end of the stair run
  const wellZ1 = STAIR_TOP_Z;
  pair(builder, 'house upper floor east front',
    [(STAIR_X0 + HOUSE_X1) / 2, GROUND_H + FLOOR_T / 2, (wellZ1 + HOUSE_FRONT_Z) / 2],
    [HOUSE_X1 - STAIR_X0, FLOOR_T, HOUSE_FRONT_Z - wellZ1], m.interior);
  pair(builder, 'house upper floor east back',
    [(STAIR_X0 + HOUSE_X1) / 2, GROUND_H + FLOOR_T / 2, (HOUSE_BACK_Z + wellZ0) / 2],
    [HOUSE_X1 - STAIR_X0, FLOOR_T, wellZ0 - HOUSE_BACK_Z], m.interior);

  // --- internal partitions, both storeys, one doorway each -----------------
  const PARTITION_Z = zMid;
  const INNER_DOOR: [number, number] = [-8, -6.4];
  for (const [storey, y0, h] of [['ground', 0, GROUND_H], ['upper', UPPER_Y0, UPPER_H]] as const) {
    const x1 = storey === 'upper' ? STAIR_X0 : HOUSE_X1;
    [[HOUSE_X0, INNER_DOOR[0]], [INNER_DOOR[1], x1]].forEach((run, index) => {
      if (run[1]! - run[0]! <= 0.05) return;
      pair(builder, `house ${storey} partition ${index}`,
        [(run[0]! + run[1]!) / 2, y0 + h / 2, PARTITION_Z], [run[1]! - run[0]!, h, WALL_T], m.interior);
    });
  }

  // One waist-high body per ground room, so a room is a fight and not a box.
  pair(builder, 'house front room counter', [-9.4, LOW_COVER / 2, HOUSE_FRONT_Z - 2.4], [3.2, LOW_COVER, 1.0], m.interior);
  pair(builder, 'house back room bench', [0.4, LOW_COVER / 2, HOUSE_BACK_Z + 2.2], [3.0, LOW_COVER, 1.0], m.interior);
  pair(builder, 'house upper crate', [-9.6, UPPER_Y0 + FLOOR_T / 2 + LOW_COVER / 2, zMid - 2.6],
    [1.4, LOW_COVER, 1.4], m.interior);
}

/**
 * The garage: attached to the outboard end of its house, one storey, an open
 * door onto the cul-de-sac and a rear door into the back yard. The reference
 * calls it "a more secluded area with views on the Cul De Sac and the rear
 * Yard", and those two openings are exactly that sentence as geometry.
 */
function garage(builder: Builder, m: Nuketown2Materials): void {
  const H = 3.4;
  const zFront = HOUSE_FRONT_Z - WALL_T / 2;
  const zBack = HOUSE_BACK_Z + WALL_T / 2;
  const zMid = (HOUSE_FRONT_Z + HOUSE_BACK_Z) / 2;
  const cx = (GARAGE_X0 + GARAGE_X1) / 2;

  pair(builder, 'garage floor', [cx, -0.1, zMid], [GARAGE_WIDTH, 0.2, HOUSE_DEPTH], m.drive, { cast: false });
  pair(builder, 'garage roof', [cx, H + 0.15, zMid], [GARAGE_WIDTH, 0.3, HOUSE_DEPTH], m.roof);
  pair(builder, 'garage wall outboard', [GARAGE_X0 + WALL_T / 2, H / 2, zMid], [WALL_T, H, HOUSE_DEPTH], m.sidingB);

  // Shared wall with the house, with an internal doorway so the garage is a
  // route into the house rather than a dead-end box.
  const LINK_DOOR: [number, number] = [-11.5, -9.9];
  [[HOUSE_BACK_Z, LINK_DOOR[0]], [LINK_DOOR[1], HOUSE_FRONT_Z]].forEach((run, index) => {
    pair(builder, `garage link pier ${index}`,
      [GARAGE_X1 - WALL_T / 2, H / 2, (run[0]! + run[1]!) / 2], [WALL_T, H, run[1]! - run[0]!], m.sidingB);
  });

  // Garage door: a 5 m opening onto the road, headed at 2.6 m.
  const DOOR: [number, number] = [-18.5, -13.5];
  [[GARAGE_X0, DOOR[0]], [DOOR[1], GARAGE_X1]].forEach((run, index) => {
    pair(builder, `garage front pier ${index}`,
      [(run[0]! + run[1]!) / 2, H / 2, zFront], [run[1]! - run[0]!, H, WALL_T], m.sidingB);
  });
  pair(builder, 'garage door head', [(DOOR[0] + DOOR[1]) / 2, H - 0.4, zFront], [DOOR[1] - DOOR[0], 0.8, WALL_T], m.trim);

  // Rear door into the back yard.
  const REAR: [number, number] = [-19, -17.4];
  [[GARAGE_X0, REAR[0]], [REAR[1], GARAGE_X1]].forEach((run, index) => {
    pair(builder, `garage back pier ${index}`,
      [(run[0]! + run[1]!) / 2, H / 2, zBack], [run[1]! - run[0]!, H, WALL_T], m.sidingB);
  });
  pair(builder, 'garage back head', [(REAR[0] + REAR[1]) / 2, H - 0.4, zBack], [REAR[1] - REAR[0], 0.8, WALL_T], m.trim);

  // Workbench: the one body that makes the garage a position rather than a
  // corridor between two doors.
  pair(builder, 'garage bench', [-15.5, LOW_COVER / 2, HOUSE_BACK_Z + 1.4], [4.0, LOW_COVER, 0.9], m.interior);
}

/**
 * The school bus, centred on the world origin. OPEN cover in the reference's
 * sense: it has a floor you can stand on, a roof over you, two door gaps a
 * player fits through and a 0.9 m window band that shots and eyes pass through.
 * The 2x-damage core sits above its roof.
 *
 * Only the +z flank and the +x end are authored; `pair()` writes the -z flank
 * and the -x end as their rotational partners, so the two doors are diagonally
 * opposite, which is what stops one side of the road owning the bus.
 */
function bus(builder: Builder, m: Nuketown2Materials): void {
  const L = NUKETOWN2_CENTRAL_BUS.length;
  const W = NUKETOWN2_CENTRAL_BUS.width;
  const floorY = NUKETOWN2_CENTRAL_BUS.floorY;
  const roofY = NUKETOWN2_CENTRAL_BUS.roofY;
  const flankZ = W / 2 - 0.1;
  const T = 0.2;

  centred(builder, 'bus floor', [0, floorY - T / 2, 0], [L, T, W], m.busTrim, { cast: false });
  centred(builder, 'bus roof', [0, roofY - T / 2, 0], [L, T, W], m.busShell);

  // End caps, as a rotational pair.
  pair(builder, 'bus end', [L / 2 - T / 2, (floorY + roofY) / 2, 0], [T, roofY - floorY, W], m.busShell);

  // Flank: lower panel with one door gap, then the open window band, then the
  // cant rail. Authored once for the +z flank.
  const DOOR: [number, number] = [2.4, 3.8];
  const SILL_TOP = 1.6;
  const HEAD_BOTTOM = 2.5;
  [[-L / 2, DOOR[0]], [DOOR[1], L / 2]].forEach((run, index) => {
    pair(builder, `bus flank lower ${index}`,
      [(run[0]! + run[1]!) / 2, (floorY + SILL_TOP) / 2, flankZ], [run[1]! - run[0]!, SILL_TOP - floorY, T], m.busShell);
  });
  pair(builder, 'bus cant rail', [0, (HEAD_BOTTOM + roofY) / 2, flankZ], [L, roofY - HEAD_BOTTOM, T], m.busShell);
  // Two window mullions, so the band reads as windows and not as a slot.
  for (const [index, x] of [-3.4, 0.6].entries()) {
    pair(builder, `bus mullion ${index}`, [x, (SILL_TOP + HEAD_BOTTOM) / 2, flankZ],
      [0.18, HEAD_BOTTOM - SILL_TOP, T], m.busTrim);
  }
  // Wheels: presentation only, under the body where nothing walks.
  for (const [index, x] of [-3.9, 3.3].entries()) {
    pair(builder, `bus wheel ${index}`, [x, 0.42, flankZ - 0.15], [1.0, 0.84, 0.4], m.rubber,
      { solid: false, shots: false, cast: false });
  }
}

/**
 * A moving truck in each cul-de-sac. The cab is CLOSED cover; the cargo box is
 * OPEN at the rear, so it is a one-room hide with a single mouth facing the
 * middle of the map. Authored once at the west end; the east truck is its
 * rotational partner and its mouth therefore faces the other way, toward the
 * centre, which is the property that matters.
 */
function truck(builder: Builder, m: Nuketown2Materials): void {
  const cx = -24;
  const cz = -1.2;
  const W = 2.4;
  const T = 0.15;
  // Cab, solid.
  pair(builder, 'truck cab', [cx - 2.5, 1.75, cz], [2.4, 2.3, W], m.truckCab);
  // Deck and cargo box: front wall, two flanks, roof; the rear (+x) is open.
  pair(builder, 'truck deck', [cx + 1.2, 0.85, cz], [5.0, 0.2, W], m.truckBox, { cast: false });
  pair(builder, 'truck box front', [cx - 1.225, 2.0, cz], [T, 2.1, W], m.truckBox);
  for (const [index, side] of [-1, 1].entries()) {
    pair(builder, `truck box flank ${index}`, [cx + 1.2, 2.0, cz + side * (W / 2 - T / 2)],
      [5.0, 2.1, T], m.truckBox);
  }
  pair(builder, 'truck box roof', [cx + 1.2, 3.125, cz], [5.0, 0.15, W], m.truckBox);
  for (const [index, x] of [cx - 2.6, cx + 0.4, cx + 2.6].entries()) {
    pair(builder, `truck wheel ${index}`, [x, 0.42, cz], [0.9, 0.84, W + 0.2], m.rubber,
      { solid: false, shots: false, cast: false });
  }
}

/**
 * One parked car per driveway. CLOSED cover in the reference's sense: a solid
 * body at 1.45 m, which breaks a standing sightline only if you crouch behind
 * it, and which you cannot get inside.
 */
function cars(builder: Builder, m: Nuketown2Materials): void {
  const cx = -16;
  const cz = -3.0;
  pair(builder, 'car body', [cx, 0.72, cz], [4.4, 1.0, 1.9], m.carA);
  pair(builder, 'car cabin', [cx - 0.2, 1.55, cz], [2.2, 0.66, 1.7], m.carGlass);
  for (const [index, dx] of [-1.5, 1.5].entries()) {
    for (const [side, dz] of [-1, 1].entries()) {
      pair(builder, `car wheel ${index}${side}`, [cx + dx, 0.34, cz + dz * 0.9], [0.68, 0.68, 0.3], m.rubber,
        { solid: false, shots: false, cast: false });
    }
  }
}

/**
 * The road surface, kerbs, driveway aprons and lawns. Presentation-weight
 * geometry with a real collider under it, so nothing here is a ghost.
 */
function street(builder: Builder, m: Nuketown2Materials): void {
  const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
  // GROUND DRESSING IS PRESENTATION-ONLY, and that is a decision with a
  // measurement behind it. Asphalt, aprons and lawns are 20 mm proud of the
  // solid 200 x 200 m ground slab, purely so they do not z-fight it; they are
  // decals, and AGENTS.md allows exactly that ("tiny grass, decals ... may
  // remain non-solid"). Left solid they add a collider spanning y [-0.12,
  // 0.02] over the whole yard, which is enough to make the destructible-shed
  // registry's off-static-collision check report a shed standing on the lawn
  // as a shed standing INSIDE something. Movement and shot authority are
  // unchanged: the ground slab underneath is solid and shot-rated, and the
  // collider/visual parity audit still measures 0 walk-through meshes.
  const decal = { solid: false, shots: false, cast: false } as const;
  centred(builder, 'street asphalt', [0, -0.06, 0], [width, 0.12, NUKETOWN2_STREET_HALF_WIDTH * 2],
    m.asphalt, decal);
  // Kerb: a 0.12 m lip, under the 0.42 m autostep, so it reads without ever
  // being a wall.
  pair(builder, 'street kerb', [0, 0.06, -NUKETOWN2_STREET_HALF_WIDTH + 0.15], [width, 0.24, 0.3],
    m.kerb, { cast: false });
  // Centre line, as two dash runs; presentation only.
  for (let i = 0; i < 7; i += 1) {
    pair(builder, `street dash ${i}`, [1.5 + i * 4, 0.01, 0], [2.2, 0.04, 0.16], m.trim,
      { solid: false, shots: false, cast: false });
  }
  // Driveway apron in front of each garage.
  pair(builder, 'street driveway', [-16, -0.05, HOUSE_FRONT_Z + 1.2], [7.0, 0.14, 2.4], m.drive, decal);
  // Front lawn either side of the driveway; the front garden of the house.
  pair(builder, 'street lawn front', [8, -0.05, HOUSE_FRONT_Z - 2.4], [24, 0.14, 4.8], m.lawn, decal);
  // Back yard lawn.
  pair(builder, 'yard lawn', [0, -0.05, (HOUSE_BACK_Z + YARD_FENCE_Z) / 2],
    [width, 0.14, YARD_DEPTH], m.lawn, decal);
}

/**
 * The verge that faces each house across the street — the reference's front
 * lawn and cul-de-sac approach. Without furniture it is a 25 m open run, which
 * is the single longest lane on the map; the block wall breaks it into three
 * and the planters give the breaks something to fight over.
 */
function verge(builder: Builder, m: Nuketown2Materials): void {
  const z = HOUSE_FRONT_Z - 4.0;
  pair(builder, 'verge wall inner', [10, HARD_COVER / 2, z], [10, HARD_COVER, 0.35], m.block);
  pair(builder, 'verge wall outer', [23, HARD_COVER / 2, z], [8, HARD_COVER, 0.35], m.block);
  pair(builder, 'verge planter', [17, LOW_COVER / 2, HOUSE_FRONT_Z - 8.0], [4.0, LOW_COVER, 2.2], m.planter);
  pair(builder, 'verge planter far', [26, LOW_COVER / 2, HOUSE_FRONT_Z - 2.0], [3.0, LOW_COVER, 2.2], m.planter);
  // KERB-SIDE HEDGE. The reference's kerbs carry props, and without this the
  // driveway apron is a 9 m open shoulder you cross with nothing to break
  // stride behind.
  //
  // What it is NOT: a fix for the map's longest lane. Measured on the built
  // colliders (perimeter ring, 1.65 m eye) the longest clear standing lane is
  // 63.53 m, [28, -15] -> [-28, 15], and adding this hedge did not move it by
  // a centimetre. That lane passes through the ORIGIN - through the bus's own
  // window band, between its mullions - because the bus is authored OPEN and
  // an open bus is see-through at standing eye height by design. That is the
  // reference's property, not a defect, and the honest instrument for it is the
  // fidelity test's street-centre-line measurement (15 m, the bus doing its
  // job) rather than a corner-to-corner diagonal that happens to line up with
  // two panes of glass. Recorded here so nobody spends an afternoon "fixing"
  // a number by walling in a vehicle the owner asked to be enterable.
  pair(builder, 'verge kerb hedge', [-9.5, HARD_COVER / 2, HOUSE_FRONT_Z + 1.1], [9.0, HARD_COVER, 1.1], m.planter);
  // Bin store beside the garage, at the closed end of the road.
  pair(builder, 'verge bin store', [-24, HARD_COVER / 2, HOUSE_FRONT_Z - 5.5], [5.0, HARD_COVER, 0.4], m.block);
  // The town sign at the far end of each verge: two posts and a board, the one
  // authored landmark that tells you which end you are looking at.
  for (const [index, dx] of [-1.4, 1.4].entries()) {
    pair(builder, `verge sign post ${index}`, [26.5 + dx * 0, 1.9, HOUSE_FRONT_Z - 11.5 + dx],
      [0.28, 3.8, 0.28], m.trim);
  }
  pair(builder, 'verge sign board', [26.5, 4.3, HOUSE_FRONT_Z - 11.5], [0.3, 1.8, 3.6], m.sign);
}

/**
 * Back yard: the spawn side. Fence line to the border path with three ways
 * through it, a porch step off the back door, and low cover so a spawn is not
 * a shooting gallery.
 */
function yard(builder: Builder, m: Nuketown2Materials): void {
  const fz = YARD_FENCE_Z + 0.125;
  // Two fence runs; the gaps at x < -24, x in [-10, 2] and x > 18 are the ways
  // onto the border path.
  pair(builder, 'yard fence run 0', [-17, HARD_COVER / 2, fz], [14, HARD_COVER, 0.25], m.fence);
  pair(builder, 'yard fence run 1', [10, HARD_COVER / 2, fz], [16, HARD_COVER, 0.25], m.fence);
  // Porch step under the back door, so leaving the house is a walk not a drop.
  pair(builder, 'yard porch', [-0.8, 0.1, HOUSE_BACK_Z - 0.9], [2.6, 0.2, 1.8], m.drive, { cast: false });
  pair(builder, 'yard cover crate', [-8.5, LOW_COVER / 2, HOUSE_BACK_Z - 3.2], [2.4, LOW_COVER, 2.0], m.planter);
  pair(builder, 'yard cover wall', [7, HARD_COVER / 2, HOUSE_BACK_Z - 2.6], [6.0, HARD_COVER, 0.35], m.block);
  // Water butt beside the shed placement, so the shed corner has a partner.
  // x = -20.5 is NOT arbitrary: the shed at (-24, -18.5) with yaw pi/2 occupies
  // x [-26.1, -21.9] (destructible-shed-registry.ts, shedPlacementFootprint),
  // so the butt stands 0.8 m clear of its wall instead of inside it.
  pair(builder, 'yard butt', [-20.5, LOW_COVER, HOUSE_BACK_Z - 4.5], [1.2, LOW_COVER * 2, 1.2], m.block);
}

/** The perimeter: a 3.2 m wall on all four sides, just inside the bounds. */
function perimeter(builder: Builder, m: Nuketown2Materials): void {
  const H = 3.2;
  const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
  const depth = NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ;
  pair(builder, 'perimeter wall long', [0, H / 2, NUKETOWN2_BOUNDS.minZ + 0.2], [width, H, 0.4], m.block);
  pair(builder, 'perimeter wall end', [NUKETOWN2_BOUNDS.minX + 0.2, H / 2, 0], [0.4, H, depth], m.block);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export function buildNuketown2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Nuketown2 arena');
  const m = nuketown2Materials();

  // Ground runs well past the fence so the horizon is continuous scrub rather
  // than a 58 m slab in a void. One draw call either way.
  centred(builder, 'ground', [0, -0.7, 0], [200, 1.4, 200], m.ground, { cast: false });

  street(builder, m);
  house(builder, m);
  garage(builder, m);
  verge(builder, m);
  yard(builder, m);
  perimeter(builder, m);
  bus(builder, m);
  truck(builder, m);
  cars(builder, m);

  batchPresentationOnlyBoxes(builder.root, 'nuketown2-presentation');

  const busHalfL = NUKETOWN2_CENTRAL_BUS.length / 2;
  const busHalfW = NUKETOWN2_CENTRAL_BUS.width / 2;

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
    // route — but every ground position that decides a round is here: the two
    // garages, the two back yards, the two cul-de-sacs, the bus and the two
    // verge walls.
    patrolPoints: [
      [0, 0], [-8, 0], [8, 0],
      [-16, -9.5], [16, 9.5],
      [-4, -9.5], [4, 9.5],
      [-14, -18.5], [14, 18.5],
      [-24, 0], [24, 0],
      [12, -8.5], [-12, 8.5],
      [-20, -24], [20, 24],
    ].map(([x, z]) => new THREE.Vector3(x, 0, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    // Vehicle-scale bodies, declared so the arena can state which cover in the
    // road is which without a consumer having to re-derive it from mesh names.
    physicalCover: [
      {
        id: 'nuketown2-central-bus',
        bounds: {
          minX: -busHalfL, maxX: busHalfL, minZ: -busHalfW, maxZ: busHalfW,
          minY: 0, maxY: NUKETOWN2_CENTRAL_BUS.roofY,
        },
        blocksMovement: true,
        blocksShots: true,
      },
      ...[-1, 1].map((side) => ({
        id: `nuketown2-cul-de-sac-truck-${side < 0 ? 'west' : 'east'}`,
        bounds: {
          minX: side < 0 ? -27.7 : 20.3, maxX: side < 0 ? -20.3 : 27.7,
          minZ: side < 0 ? -2.4 : 0, maxZ: side < 0 ? 0 : 2.4,
          minY: 0, maxY: 3.2,
        },
        blocksMovement: true as const,
        blocksShots: true as const,
      })),
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
