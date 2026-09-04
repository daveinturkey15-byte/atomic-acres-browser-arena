/**
 * RAID2: "Raid Rebuild" — the HF-408 layout rethink, code-authored.
 *
 * Owner, 2026-09-02 ~16:10 BST: "raid just feels like loads of walls, need to
 * ensure the layout and artstyle is more similar to the original."
 *
 * WHAT THIS FILE IS, AND WHAT IT IS NOT.
 *
 * It is a NEW arena beside the shipped Raid (`test2`), not an edit of it, so
 * the live map is never broken mid-pass. The shipped Raid keeps its id, its
 * spawns, its fidelity test and its place in the menu; this one ships as
 * `RAID REBUILD - PREVIEW` and the owner decides whether it replaces the other.
 *
 * It is a LAYOUT pass. The art is a clean, readable first pass in original
 * procedural MeshStandardMaterials; the art lane comes after.
 *
 * WHY A REBUILD AT ALL - THE MEASUREMENT.
 *
 * The shipped Raid is itself a careful rebuild against a measured reference
 * study (docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md). So before any geometry was
 * drawn, the owner's sentence was turned into an instrument:
 * scripts/qa/raid2-layout-metrics.ts rasterises an arena's AUTHORITATIVE
 * colliders onto a 0.5 m grid and casts 16 rays at the 1.70 m standing eye from
 * every accessible cell. Measured on base 49f5ff6b:
 *
 *   arena             box m2  fill%  wall/100m2  meanOpen  axisMed  >=45m%  roofed%  clusters
 *   test2 (Raid)        7600   67.1        13.0      9.97    17.10    10.6     36.7        59
 *   atomic-acres        4440   85.6        16.8     13.84    26.55    33.5     13.0        33
 *   skyline-terminal    4900   87.1        14.9     19.75    33.30    88.9     30.8        20
 *   rustworks-1v1       3132   89.8        11.4     12.16    19.35    38.6      5.9        25
 *
 * Raid is the LARGEST playable arena in the game and has the SHORTEST
 * sightlines of every real combat arena in it. It is not carrying more wall
 * than the others - 13.0 m2 of blocking footprint per 100 m2 of floor is
 * mid-table. It carries the wall in the wrong SHAPE: 59 separate eye-blocking
 * clusters averaging 11.0 m2, against Nuke Town's 33 masses averaging 17.2 m2
 * on a map 42% smaller, plus 36.7% of its accessible ground under a roof.
 *
 * So the fix is not to delete cover. Deleting cover would make a worse map and
 * the numbers say the cover is not the problem. The fix is CONSOLIDATION:
 *
 *   1. The mansion is THREE BIG ROOMS around one open-to-sky courtyard, with
 *      exactly two interior partitions in the whole building. The shipped map's
 *      corridor spine and covered walks are what produced 36.7% roofed ground.
 *   2. The laundry block and the gallery are ATTACHED to the house, so the
 *      centre of the map is one architectural mass instead of three, and the
 *      drive lane is flanked by building rather than fenced by partitions.
 *   3. The pool lane's east end is a COLONNADE (three piers, 4 m gaps) instead
 *      of a wall, so the map's defining long line ends in something you can
 *      shoot through.
 *   4. The footprint outline is five rectangles instead of twelve. Every jog in
 *      an outline is a corner a player sticks in and boundary mass that
 *      fragments the map's wall.
 *
 * The plan, the reference study it derives from and the reason behind every
 * gate band live in docs/raid-rebuild/SPATIAL_PLAN.md.
 *
 * TWO CONSTRAINTS INHERITED FROM THE SHIPPED MAP'S OWN SCARS.
 *
 * - BOTS DO NOT CLIMB. Raid authors no vertical navigation, and a bot collides
 *   against everything in its 1.7 m span, so a continuous 0.70 m kerb is a wall
 *   to a bot even though a player hops it. That is exactly why HF-402 found the
 *   shipped map's garage unreachable and had to move team 1's spawns into the
 *   house. Every zone in this map therefore has at least one AUTOSTEP route in
 *   (rise <= 0.42 m): the garage kerb is 0.40 m and gapped, the sport court is
 *   one 0.35 m riser, the pool has 0.27 m steps.
 * - THE COVER RULE. Ground cover is either mountable (top <= 0.75 m against a
 *   measured 0.82 m jump apex) or hard (>= 1.9 m, clearing the 1.70 m standing
 *   eye). Nothing sits in the 0.9-1.8 m dead band, where a piece hides a
 *   crouched player from nobody and cannot be climbed. The 1.05 m balcony rail
 *   on a +3.40 m floor is the one exception and it is the same exception, for
 *   the same reason, the shipped map documents: on an upper floor the crouch
 *   eye sits at 1.16 m, so the rail hides the body and clears the eye.
 *
 * FAIRNESS INVOLUTION: the X MIRROR (x, z) -> (-x, z), the same involution the
 * shipped Raid settled on and for the same measured reason (the reference's
 * objective anchors are x-mirrors of one another, not 180-degree images). Team
 * 0 holds -x, team 1 holds +x, and every spawn point has a partner within 2 m
 * of its mirror. The two flanks differ in KIND - a pool terrace and a motor
 * drive - so a rotation would demand they be equal, which they are not.
 */
import * as THREE from 'three';
import {
  type Builder,
  batchPresentationOnlyBoxes,
  box,
  emptyTelemetry,
  spawnRecord,
  standard,
} from './additional-maps';
import type { ArenaMap } from './map';

/**
 * 100 x 76 m, deliberately IDENTICAL to the shipped Raid's bounds.
 *
 * The owner's complaint is walls, not size, and the size is the one part of the
 * 2026-08-31 study that was derived rather than guessed: the reference's long
 * axis measures 85-92 m off four independent architectural anchors, our sprint
 * is 1.20x the reference engine's derived sprint, and 100 m is the conservative
 * bottom of the corrected 102-110 m band. 100/76 = 1.316 reproduces the
 * measured 1.311 aspect to 0.4%. Re-deriving it would only move it.
 */
export const RAID2_BOUNDS = Object.freeze({ minX: -50, maxX: 50, minZ: -38, maxZ: 38 });

/**
 * Domination anchors. A on the west end, C its x-mirror on the garage drive, B
 * pulled OFF-CENTRE into the drive lane - the same deliberate offset the
 * shipped map documents, and for the same reason: with A and C on the long axis
 * and B committed to one flank, the losing team's spawn stays anchored behind
 * its own end instead of flipping through the middle. Moving B into the
 * courtyard is the obvious improvement and it would break spawn stability.
 */
export const RAID2_DOMINATION_ZONES = Object.freeze([
  Object.freeze({ id: 'A' as const, centre: Object.freeze([-34, 0, -4] as const) }),
  Object.freeze({ id: 'B' as const, centre: Object.freeze([0, 0, 14] as const) }),
  Object.freeze({ id: 'C' as const, centre: Object.freeze([34, 0, -4] as const) }),
]);

/**
 * The footprint, as x-slices with a z extent each: `[x0, x1, minZ, maxZ]`.
 * FIVE rectangles, down from the shipped map's twelve (see the header). The
 * boundary wall is generated from this table, so the outline and the wall can
 * never drift apart.
 */
const RAID2_BLOB: ReadonlyArray<readonly [number, number, number, number]> = [
  [-50, -36, -20, 6],   // west spawn apron
  [-36, -20, -36, 16],  // sport court and laundry flank
  [-20, 16, -38, 38],   // the map's full-depth middle
  [16, 34, -36, 32],    // pool wing and gallery flank
  [34, 50, -16, 12],    // east garage wing
];

/**
 * The four upper rooms, as the reachability gate measures them.
 *
 * This table exists so the gate and the CLI cannot drift from each other, and
 * so "the reference's four upper rooms" is a claim with an address rather than
 * prose. It is the ONLY place the rooms are enumerated; band 12 counts first-
 * floor area and cannot tell a room from a slab.
 */
export const RAID2_UPPER_ROOMS = Object.freeze([
  Object.freeze({ id: 'U1', label: 'pool wing bedroom — the declared power position', x0: 18, x1: 32, z0: -34, z1: -21 }),
  Object.freeze({ id: 'U2', label: 'upper landing over C1', x0: -26, x1: -10.4, z0: -20, z1: -11 }),
  Object.freeze({ id: 'U3', label: 'laundry upper floor', x0: -25.2, x1: -10, z0: -4, z1: 9 }),
  Object.freeze({ id: 'U3B', label: 'team-0 drive balcony', x0: -24, x1: -12, z0: 9, z1: 10.6 }),
  Object.freeze({ id: 'U4', label: 'gallery upper floor', x0: 14, x1: 30, z0: -4, z1: 8 }),
  Object.freeze({ id: 'U4B', label: 'team-1 drive balcony', x0: 16, x1: 26, z0: 8, z1: 9.6 }),
]);

/** First-floor height. Four upper rooms sit here and nothing else is standable above. */
const UPPER_FLOOR_Y = 3.4;
/**
 * Floor slab thickness, so every soffit lands at 3.16 m: 3.16 m of clear height
 * under any upper room against a 1.70 m standing eye means no interior, stair
 * underside or colonnade can produce an eye-clearance hazard by geometry alone.
 */
const UPPER_SLAB = 0.24;
const UPPER_SOFFIT = UPPER_FLOOR_Y - UPPER_SLAB;
/** Single-storey wall height, and the height of any wall carrying a floor above. */
const WALL_TOP = UPPER_FLOOR_Y;
/**
 * Coplanar-surface clearance (HF-434 instrument, pass 96 all-arenas sweep).
 * Two solids whose TOP faces sit within 0.03 m and overlap in plan race for
 * the same depth samples. Where a pier, post or wall top lands flush with the
 * deck or slab it meets, the supported member now stops this far short - past
 * the instrument's 0.03 m window and buried inside the other solid, the same
 * resolution the farcrysis art tower's rails already use where they lap.
 */
const COPLANAR_CLEARANCE = 0.04;
/** Wall thickness. One number, so walls meet exactly at every corner. */
const WALL_T = 0.8;
/** Upper-room walls: hard cover measured from the +3.40 floor, not from grade. */
const UPPER_WALL_TOP = UPPER_FLOOR_Y + 1.9;
/** Balcony rail. The documented dead-band exception; see the header. */
const RAIL_TOP = UPPER_FLOOR_Y + 1.05;
/** Hard ground cover: clears the 1.70 m standing eye. */
const HARD_COVER = 1.9;
/** Mountable cover: under the measured 0.82 m jump apex. */
const MOUNT = 0.7;
/** Autostep-legal rise (CHARACTER_PHYSICS_CONFIG.autostepHeight = 0.42 m). */
export const STEP = 0.35;
/** Canonical stair module: 9 risers of 0.3778 m under the 0.42 m autostep, 0.45 m treads. */
export const STAIR_RISERS = 9;
const STAIR_TREAD = 0.45;
export const STAIR_RUN = STAIR_RISERS * STAIR_TREAD;

/** Sunken surfaces. Both are reached on the autostep, so neither is a trap. */
const COURT_Y = -0.35;
const POOL_FLOOR_Y = -0.55;

type Raid2Materials = Readonly<{
  travertine: THREE.MeshStandardMaterial;
  stucco: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  court: THREE.MeshStandardMaterial;
  poolTile: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  planting: THREE.MeshStandardMaterial;
  hillside: THREE.MeshStandardMaterial;
}>;

/**
 * Original procedural surfaces for this arena. A warm, high-value estate
 * palette: bleached travertine paving against sun-warmed stucco, with the
 * court's blue-green and the pool's teal as the only two saturated notes on the
 * map, one at each end of the long lane. Readability first - every vertical
 * surface a player shoots at sits well above the paving in value so a silhouette
 * reads against it at range.
 */
export const RAID2_PALETTE = Object.freeze({
  /** The floor everything else is read against. */
  travertine: 0x9a8f7d,
  /** Walls. */
  stucco: 0xc4b6a2,
  /** Hard cover: piers, kerbs, plinths, counter runs, stair treads, rails. */
  stone: 0xa8a496,
  /** Mountable furniture and the pergola piers. */
  timber: 0x8f6f4e,
  court: 0x386b63,
  poolTile: 0x2f5f74,
  water: 0x2e9cb0,
  glass: 0xbfd8de,
  planting: 0x4a6540,
  /** Presentation-only skirt OUTSIDE the boundary. Deliberately the darkest. */
  hillside: 0x79805f,
});

/**
 * Rec.709 relative luminance of a packed sRGB triple, 0..1. The readability
 * gate (fidelity test 22) is written against this and nothing else, so "reads
 * as black" stops being a matter of opinion.
 */
export function raid2PaletteLuminance(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function raid2Materials(): Raid2Materials {
  return Object.freeze({
    travertine: standard(RAID2_PALETTE.travertine, 0.93, 0.02),
    stucco: standard(RAID2_PALETTE.stucco, 0.88, 0.02),
    // 0xa8a496, not the 0x7b7466 this arena shipped with. That value measured
    // 0.457 relative luminance against the paving's 0.565, i.e. the arena's
    // COVER was darker than the floor it stands on, in direct contradiction of
    // the readability rule stated four lines above. Under this grade (gain
    // [0.92, 0.86, 1.0] pulls the frame down and green carries 72% of
    // luminance) the shaded faces of the courtyard piers, the fountain kerb and
    // the drive island read as silhouettes rather than as cover - visible in
    // docs/evidence/pass85/lane-aq/judgeset/raid2-courtyard.png at the first
    // capture. A pale cool limestone at 0.642 sits above the paving and stays
    // separated from the warm stucco by hue rather than by value.
    stone: standard(RAID2_PALETTE.stone, 0.9, 0.02),
    // Likewise lifted from 0x6d4f36 (0.328). Timber is furniture and the two
    // pergola piers; it stays the darkest family on the map on purpose, but
    // 0.490 is a wood and 0.328 was a hole in the frame.
    timber: standard(RAID2_PALETTE.timber, 0.86, 0.02),
    court: standard(RAID2_PALETTE.court, 0.95, 0.02),
    poolTile: standard(RAID2_PALETTE.poolTile, 0.6, 0.04),
    water: new THREE.MeshStandardMaterial({
      color: RAID2_PALETTE.water, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: RAID2_PALETTE.glass, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4,
    }),
    // Lifted with the rest of the family (0x3d5535 -> 0x4a6540, 0.304 ->
    // 0.363): the drive planters are HARD COVER at 1.9 m, so they are a
    // shooting backdrop, not dressing.
    planting: standard(RAID2_PALETTE.planting, 0.97, 0.01),
    // The skirt beyond the boundary read as a flat black slab in the overview
    // frame: 0x5d6247 measures 0.372 against paving 0.565, and it is the one
    // surface with no wall bouncing light back into it. 0x79805f measures 0.486,
    // still clearly BELOW the estate so it never competes with the playfield,
    // but ground rather than void.
    hillside: standard(RAID2_PALETTE.hillside, 0.98, 0),
  });
}

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

type RectOptions = Parameters<typeof box>[5];

export function buildRaid2(scene: THREE.Scene): ArenaMap {
  const builder = makeBuilder(scene, 'Raid Rebuild arena');
  const m = raid2Materials();

  /**
   * Every mass in this arena is authored as an EXTENT, not a centre and a size.
   * The plan is a table of extents, walls have to meet exactly, and a stairwell
   * has to line up with a tread to the centimetre; centre/size arithmetic done
   * by hand is where seams come from.
   */
  const rect = (
    name: string,
    x0: number, x1: number,
    y0: number, y1: number,
    z0: number, z1: number,
    material: THREE.Material,
    options: RectOptions = {},
  ): THREE.Mesh => box(
    builder, name,
    [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    [x1 - x0, y1 - y0, z1 - z0],
    material, options,
  );

  /**
   * A wall running along X at a fixed z band, split around its door mouths.
   * Mouths are given as [x0, x1] pairs in ascending order; the wall is emitted
   * as the complement, so a mouth is a real opening in the collision authority
   * and not a visual notch over a solid box.
   */
  const wallAlongX = (
    name: string,
    x0: number, x1: number,
    z0: number, z1: number,
    top: number,
    mouths: ReadonlyArray<readonly [number, number]>,
    material: THREE.Material = m.stucco,
    foot = 0,
  ): void => {
    let cursor = x0;
    let index = 0;
    for (const [mouthStart, mouthEnd] of mouths) {
      if (mouthStart > cursor) rect(`${name} ${index}`, cursor, mouthStart, foot, top, z0, z1, material);
      cursor = Math.max(cursor, mouthEnd);
      index += 1;
    }
    if (cursor < x1) rect(`${name} ${index}`, cursor, x1, foot, top, z0, z1, material);
  };

  /** The same, running along Z at a fixed x band. */
  const wallAlongZ = (
    name: string,
    x0: number, x1: number,
    z0: number, z1: number,
    top: number,
    mouths: ReadonlyArray<readonly [number, number]>,
    material: THREE.Material = m.stucco,
    foot = 0,
  ): void => {
    let cursor = z0;
    let index = 0;
    for (const [mouthStart, mouthEnd] of mouths) {
      if (mouthStart > cursor) rect(`${name} ${index}`, x0, x1, foot, top, cursor, mouthStart, material);
      cursor = Math.max(cursor, mouthEnd);
      index += 1;
    }
    if (cursor < z1) rect(`${name} ${index}`, x0, x1, foot, top, cursor, z1, material);
  };

  /**
   * One canonical stair run inside the given footprint, climbing to
   * UPPER_FLOOR_Y along `direction`. Nine risers under the autostep means the
   * player WALKS up with no jump and no timing, and a bot paths it without
   * needing a vertical navigation node the arena does not author.
   */
  const stairRun = (
    name: string,
    x0: number, x1: number,
    z0: number, z1: number,
    direction: 'x+' | 'x-' | 'z+' | 'z-',
    material: THREE.Material = m.stone,
  ): void => {
    for (let step = 0; step < STAIR_RISERS; step += 1) {
      const top = (UPPER_FLOOR_Y * (step + 1)) / STAIR_RISERS;
      const near = step * STAIR_TREAD;
      const far = (step + 1) * STAIR_TREAD;
      if (direction === 'x+') rect(`${name} riser ${step}`, x0 + near, x0 + far, -0.2, top, z0, z1, material);
      else if (direction === 'x-') rect(`${name} riser ${step}`, x1 - far, x1 - near, -0.2, top, z0, z1, material);
      else if (direction === 'z+') rect(`${name} riser ${step}`, x0, x1, -0.2, top, z0 + near, z0 + far, material);
      else rect(`${name} riser ${step}`, x0, x1, -0.2, top, z1 - far, z1 - near, material);
    }
  };

  /** A first-floor slab, with its soffit at 3.16 m. Overhead mass, never a wall. */
  const floorSlab = (name: string, x0: number, x1: number, z0: number, z1: number): void => {
    rect(name, x0, x1, UPPER_SOFFIT, UPPER_FLOOR_Y, z0, z1, m.stucco, { cast: false });
  };

  /** A flat roof over a single-storey block. Not reachable, by design. */
  const roofSlab = (name: string, x0: number, x1: number, z0: number, z1: number): void => {
    rect(name, x0, x1, UPPER_SOFFIT, WALL_TOP, z0, z1, m.stone, { cast: false });
  };

  // =========================================================================
  // GROUND AND BOUNDARY
  // =========================================================================

  // Paving follows the blob exactly, so there is no rectangle of "nothing" a
  // spawn solver can call walkable (the defect HF-402 found on the shipped map).
  for (const [x0, x1, z0, z1] of RAID2_BLOB) {
    rect(`raid2 paving ${x0}`, x0, x1, -1, 0, z0, z1, m.travertine, { cast: false });
  }
  // Hillside apron beyond the boundary, so the rim reads as a drop rather than
  // as the edge of a slab. Presentation only; the boundary wall is the authority.
  rect('raid2 hillside skirt', -70, 70, -2.1, -1.6, -58, 58, m.hillside, { cast: false, solid: false, shots: false });

  // Boundary generated FROM the blob. Segments on the drive's far side (z >= 24)
  // are 1.9 m parapets: the estate is cut into a hillside and its south rim has
  // to read as a drop, not as a fourth wall. 1.9 m is still hard cover and is
  // far above the 0.82 m jump apex, so nothing leaves the map over it.
  const BOUNDARY_FOOT = -2;
  const boundaryTop = (z: number): number => (z >= 24 ? HARD_COVER : WALL_TOP);
  for (let index = 0; index < RAID2_BLOB.length; index += 1) {
    const [x0, x1, minZ, maxZ] = RAID2_BLOB[index]!;
    rect(`raid2 boundary north ${index}`, x0, x1, BOUNDARY_FOOT, boundaryTop(minZ), minZ - WALL_T, minZ, m.stucco);
    rect(`raid2 boundary south ${index}`, x0, x1, BOUNDARY_FOOT, boundaryTop(maxZ), maxZ, maxZ + WALL_T, m.stucco);
    const previous = RAID2_BLOB[index - 1];
    if (!previous) {
      rect(`raid2 boundary west cap`, x0 - WALL_T, x0, BOUNDARY_FOOT, WALL_TOP, minZ - WALL_T, maxZ + WALL_T, m.stucco);
      continue;
    }
    // Jogs: wherever the outline steps in or out, cap across the step so the
    // wall IS the outline and the two can never disagree.
    const [, , prevMinZ, prevMaxZ] = previous;
    if (prevMinZ !== minZ) {
      rect(`raid2 boundary jog north ${index}`, x0 - WALL_T, x0,
        BOUNDARY_FOOT, boundaryTop(Math.min(prevMinZ, minZ)),
        Math.min(prevMinZ, minZ) - WALL_T, Math.max(prevMinZ, minZ), m.stucco);
    }
    if (prevMaxZ !== maxZ) {
      rect(`raid2 boundary jog south ${index}`, x0 - WALL_T, x0,
        BOUNDARY_FOOT, boundaryTop(Math.min(prevMaxZ, maxZ)),
        Math.min(prevMaxZ, maxZ), Math.max(prevMaxZ, maxZ) + WALL_T, m.stucco);
    }
  }
  {
    const last = RAID2_BLOB[RAID2_BLOB.length - 1]!;
    rect('raid2 boundary east cap', last[1], last[1] + WALL_T, BOUNDARY_FOOT, WALL_TOP,
      last[2] - WALL_T, last[3] + WALL_T, m.stucco);
  }

  // =========================================================================
  // NORTH LANE - the pool terrace. The map's ONE long lane (52 m), and the one
  // place nothing may be added. Everything here is at the lane's EDGES.
  // =========================================================================

  // N1 sport court, sunk 0.35 m on a single riser walked in and out on the
  // autostep. Deliberately BARE: this is the "cross it and pray" pocket, and
  // filling it to be fair would remove the tension the flanks charge for.
  rect('raid2 court floor', -34, -20, -1.35, COURT_Y, -34, -23, m.court, { cast: false });
  rect('raid2 court kerb north', -33, -27, COURT_Y, COURT_Y + MOUNT, -33.6, -33, m.stone);
  rect('raid2 court kerb south', -27, -21, COURT_Y, COURT_Y + MOUNT, -23.6, -23, m.stone);
  // The court's only hard cover, outside its south-west corner and standing on
  // grade so its mass actually breaks the west approach's diagonal.
  // Footed against the west boundary rather than standing free in the flank:
  // the same line is broken and the map carries one fewer wall mass.
  rect('raid2 court equipment store', -36.4, -33.4, 0, HARD_COVER, -22.6, -20.2, m.stucco);

  // N5 hot tub pavilion. Sited at z -35..-30.5 rather than mid-lane on purpose:
  // it breaks the 70 m band that would otherwise run along the north strip
  // WITHOUT touching the lane line at z ~ -28.
  wallAlongX('raid2 pavilion north', -20, -15, -35, -34.2, WALL_TOP - COPLANAR_CLEARANCE, []);
  wallAlongZ('raid2 pavilion west', -20, -19.2, -35, -30.5, WALL_TOP - COPLANAR_CLEARANCE, []);
  wallAlongZ('raid2 pavilion east', -15.8, -15, -35, -30.5, WALL_TOP - COPLANAR_CLEARANCE, []);
  // One 2 m mouth, facing the pool.
  wallAlongX('raid2 pavilion south', -20, -15, -31.3, -30.5, WALL_TOP - COPLANAR_CLEARANCE, [[-18.5, -16.5]]);
  roofSlab('raid2 pavilion roof', -20, -15, -35, -30.5);

  // N3 pool. A solid basin slab with a presentation water sheet over it; the
  // coping is a 0.30 m walk-up so nobody is ever trapped in the water.
  rect('raid2 pool basin', -14, 14, -1.55, POOL_FLOOR_Y, -33, -25, m.poolTile, { cast: false });
  rect('raid2 pool water', -13.6, 13.6, POOL_FLOOR_Y, -0.12, -32.6, -25.4, m.water,
    { cast: false, solid: false, shots: false });
  for (const [x0, x1, z0, z1] of [
    [-14, 14, -33.4, -33], [-14, 14, -25, -24.6], [-14.4, -14, -33, -25], [14, 14.4, -33, -25],
  ] as const) {
    rect(`raid2 pool coping ${x0} ${z0}`, x0, x1, POOL_FLOOR_Y, 0.3, z0, z1, m.stone, { cast: false });
  }
  // Two entry step pairs, SW and NE, each riser under the autostep so the basin
  // is a route and not a pit.
  rect('raid2 pool step sw lower', -12.6, -9.6, -0.28, -0.28 + 0.28 + COPLANAR_CLEARANCE, -26.4, -25.2, m.stone, { cast: false });
  rect('raid2 pool step ne lower', 9.6, 12.6, -0.28, -0.28 + 0.28 + COPLANAR_CLEARANCE, -32.8, -31.6, m.stone, { cast: false });

  // Pool bar block at the water's north-east shoulder. Second breaker for the
  // north strip; single storey, no roof access.
  // ONE mouth, in the east wall, so every segment of the bar stays joined to
  // every other: a block with mouths in two faces is two wall masses, and this
  // rebuild is counting masses.
  wallAlongZ('raid2 pool bar west', 4, 4.8, -36, -32, WALL_TOP - COPLANAR_CLEARANCE, []);
  wallAlongZ('raid2 pool bar east', 9.2, 10, -36, -32, WALL_TOP - COPLANAR_CLEARANCE, [[-36, -33.2]]);
  wallAlongX('raid2 pool bar south', 4, 10, -32.8, -32, WALL_TOP - COPLANAR_CLEARANCE, []);
  roofSlab('raid2 pool bar roof', 4, 10, -36, -32);

  // N4 pool deck: the walk between the water and the house. Two pergola piers
  // and a planter run, sited against the house face at z ~ -21 so the lane line
  // at z ~ -28 stays unbroken.
  // Footed AGAINST the house's north face rather than free in the deck: they
  // break exactly the same lines and cost the map two fewer wall masses.
  for (const x of [-2, 8]) {
    rect(`raid2 pergola pier ${x}`, x - 0.6, x + 0.6, 0, WALL_TOP - COPLANAR_CLEARANCE, -21.2, -19.9, m.timber);
  }
  rect('raid2 deck planter run', -12, -4, 0, MOUNT, -22.4, -21.4, m.planting);
  rect('raid2 deck planter run east', 12, 17, 0, MOUNT, -22.4, -21.4, m.planting);

  // N7 pool wing, two storeys, closing the lane's east end. Its SOUTH half is a
  // COLONNADE, not a wall: three piers on 4 m gaps, so the map's defining line
  // ends in something you can shoot through and flank behind.
  wallAlongX('raid2 wing north', 18, 32, -34, -33.2, WALL_TOP, []);
  wallAlongZ('raid2 wing west', 18, 18.8, -34, -28, WALL_TOP, [[-32, -29]]);
  wallAlongZ('raid2 wing east', 31.2, 32, -34, -28, WALL_TOP, []);
  wallAlongX('raid2 wing spine', 18, 32, -28.8, -28, WALL_TOP, [[22, 27]]);
  for (const x of [19.6, 25, 30.4]) {
    rect(`raid2 wing colonnade pier ${x}`, x - 0.7, x + 0.7, 0, WALL_TOP - COPLANAR_CLEARANCE, -24.7, -23.3, m.stone);
  }
  // NO GLAZED RETURN HERE, and the reason is measured rather than aesthetic.
  //
  // This wall carried `raid2 wing glazing` - a shots:true / solid:false pane at
  // z -33.2..-32.9, i.e. standing 0.3 m PROUD of the inner face of the solid
  // wall behind it, in the room. Eye-clearance stage 2 (the live sweep against
  // the arena's own shot surfaces) found THIRTEEN violations on raid2 and every
  // single one of them was this pane: a wall-hug eye seat at z -32.75 traces
  // 0.15 m to its front face, exactly the "visual geometry protruding past its
  // collider" habitat HF-387 exists to catch, and stage 3 confirmed the runtime
  // camera resolve could not push out of any of them.
  //
  // It could not be moved flush either: the wall is solid at x 18.8..31.2, so a
  // pane inside its thickness renders nothing, and cutting a real window would
  // need a 1.1 m sill collider - squarely in the 0.9-1.8 m dead band this arena
  // forbids (fidelity test 13). It was also not doing the job its comment
  // claimed: it sat on the NORTH wall's inner face while the pool lane it was
  // meant to be seen from is to the WEST, so nothing outside the wing could
  // ever see it. Removed. raid2 now measures ZERO eye-clearance violations.
  /**
   * THE STAIRWELL IS A HOLE, AND A HOLE HAS TO BE AUTHORED AS THE COMPLEMENT.
   *
   * This slab shipped as ONE rectangle x 18..32, z -34..-21 with the stair
   * underneath it. A 0.24 m slab whose soffit sits at 3.16 m leaves 0.138 m of
   * headroom over the top tread against a 1.82 m standing and a 1.16 m crouch
   * capsule, so U1 - the arena's own declared power position - was sealed: an
   * autostep-connected flood fill from all twelve spawns reached 0 of its 608
   * standable cells. The 2D ground-level fidelity instrument structurally
   * cannot see that, which is why `scripts/qa/raid2-reachability.ts` now exists
   * and gates it (fidelity tests 19-21).
   *
   * So the slab is emitted as four pieces around the stair's footprint. The
   * `head` piece closes the slab over the wing's north wall; the hole itself is
   * exactly x 19.2..20.8, z -33.4..-29.35, the stair's own extent.
   */
  floorSlab('raid2 wing floor west', 18, 19.2, -34, -21);
  floorSlab('raid2 wing floor head', 19.2, 20.8, -34, -33.4);
  floorSlab('raid2 wing floor landing', 19.2, 20.8, -29.35, -21);
  floorSlab('raid2 wing floor east', 20.8, 32, -34, -21);
  stairRun('raid2 wing stair', 19.2, 20.8, -33.4, -29.35, 'z+');
  // U1 upper bedroom - the map's power position. Window slots west (over the
  // pool lane) and south (over the deck); solid north and east so it cannot
  // see into the west apron down the full lane.
  rect('raid2 u1 wall north', 18, 32, UPPER_FLOOR_Y, UPPER_WALL_TOP, -34, -33.2, m.stucco);
  rect('raid2 u1 wall east', 31.2, 32, UPPER_FLOOR_Y, UPPER_WALL_TOP, -34, -21, m.stucco);
  wallAlongZ('raid2 u1 wall west', 18, 18.8, -34, -21, UPPER_WALL_TOP, [[-30, -26]], m.stucco, UPPER_FLOOR_Y);
  wallAlongX('raid2 u1 wall south', 18, 32, -21.8, -21, UPPER_WALL_TOP, [[22, 26]], m.stucco, UPPER_FLOOR_Y);
  // The stairwell rail guards the hole's OPEN (east) edge. It shipped lying
  // across the stair's top tread at z -29.35..-29.05, i.e. a 1.05 m barrier
  // squarely in the exit - a second, independent seal on the same room, and one
  // no jump apex (0.82 m) clears either.
  rect('raid2 u1 rail', 20.8, 21.1, UPPER_FLOOR_Y, RAIL_TOP, -33.4, -29.35, m.stone);

  // =========================================================================
  // CENTRE LANE - the house. ONE mass, x -26..30, z -20..-4, and exactly TWO
  // interior partitions in the whole building.
  // =========================================================================

  const H_X0 = -26; const H_X1 = 30; const H_Z0 = -20; const H_Z1 = -4;

  // North face onto the pool deck, south face onto the drive. NO north mouth is
  // aligned with a south mouth, so no single line ever sees two lanes at once.
  wallAlongX('raid2 house north', H_X0, H_X1, H_Z0, H_Z0 + WALL_T, WALL_TOP, [[-23, -19], [-2, 2], [19, 23]]);
  wallAlongX('raid2 house south', H_X0, H_X1, H_Z1 - WALL_T, H_Z1, WALL_TOP, [[-17, -13], [6, 10], [23, 27]]);
  wallAlongZ('raid2 house west', H_X0, H_X0 + WALL_T, H_Z0, H_Z1, WALL_TOP, [[-15.2, -13.2], [-10, -5.5]]);
  wallAlongZ('raid2 house east', H_X1 - WALL_T, H_X1, H_Z0, H_Z1, WALL_TOP, [[-19.2, -15.5], [-13, -10.5]]);
  // THE MOUTH SCHEME, and it is the whole reason this house plays open while
  // the shipped one does not.
  //
  // Each partition carries TWO openings, so every depth of the building has a
  // way through and no room is a sealed box: the shipped Raid's interior reads
  // 15 m along the map's long axis precisely because its rooms only connect at
  // one z. But the two partitions' openings are INTERLEAVED, never aligned:
  //
  //   partition west  open at z -18..-15.5  and  -13..-10.5
  //   partition east  open at z -15.5..-13  and   -9..-6.5
  //
  // so no x-line ever crosses both. The longest interior line is therefore
  // room-plus-courtyard (36.8 m through C1+C2, 39.6 m through C2+C3) and never
  // the whole 54 m building - achieved with ARCHITECTURE rather than by parking
  // hard cover in the middle of two rooms to break a line the plan should not
  // have created in the first place. The house's own west and east doors are
  // likewise offset from every partition opening, so nobody outside the
  // building sees past the first partition they meet, which is what keeps the
  // pool lane and the drive lane out of the same frame.
  wallAlongZ('raid2 house partition west', -11.2, -10.4, H_Z0, H_Z1, WALL_TOP, [[-18, -15.5], [-13, -10.5]]);
  wallAlongZ('raid2 house partition east', 11.6, 12.4, H_Z0, H_Z1, WALL_TOP, [[-15.5, -13], [-10.3, -5.2]]);

  // C1 living room, roofed. Its hearth block is the west end-stop of the spine.
  // C1's overhead mass over its SOUTH half only. The north half's overhead mass
  // is U2's floor, and this slab used to be emitted over the whole room at the
  // same y as that floor - two exactly coincident colliders over z -20..-11,
  // one of which was invisible in every audit that counts distinct boxes.
  floorSlab('raid2 c1 roof', H_X0, -10.4, -11, H_Z1);
  // Footed against C1's north wall and clear of both partition bands, so it is
  // cover to fight behind and not a second wall across the room.
  rect('raid2 c1 hearth block', -22, -19, 0, HARD_COVER, H_Z0, -17.8, m.stone);
  rect('raid2 c1 sofa run', -24.4, -22.4, 0, MOUNT, -8.4, -5.4, m.timber);
  stairRun('raid2 c1 stair', -25.2, -23.6, -19.2, -15.15, 'z+');

  // C2 courtyard - the heart, and OPEN TO SKY. 22 x 14 m with four mouths and
  // four colonnade piers on a grid; the only other thing in it is a 0.70 m
  // fountain kerb you mount to see over the piers' bases.
  for (const [px, pz] of [[-6, -16], [7, -16], [-6, -8], [7, -8]] as const) {
    rect(`raid2 courtyard pier ${px} ${pz}`, px - 0.6, px + 0.6, 0, WALL_TOP, pz - 0.6, pz + 0.6, m.stone);
  }
  rect('raid2 courtyard fountain kerb', -1.4, 2.6, 0, MOUNT, -13.4, -9.4, m.stone);
  // The fountain sheet is a SHOT SURFACE (a bullet stops in water) and it fills
  // its kerb with 0.3 m of margin instead of sitting in the middle of it. Both
  // are deliberate and both are measured: at 2.4 x 2.4 m and shots:false it was
  // batched away as presentation dressing and fell under the RAY TRACED
  // extractor's 6 m2 footprint floor, so this arena's mirror budget rested
  // entirely on one pane that turned out to be an eye-clearance defect. At
  // 3.4 x 3.4 m with its own shot surface it is a real reflector - which is
  // what a fountain in an open-to-sky courtyard should be - and this arena no
  // longer has a single point of failure in its reflective coverage.
  rect('raid2 courtyard fountain basin', -1.1, 2.3, MOUNT - 0.3, MOUNT - 0.05, -13.1, -9.7, m.water,
    { cast: false, solid: false, shots: true });

  // C3 kitchen / office, roofed. Its counter run is the east end-stop of the
  // spine and its office window is the lane change onto the pool deck.
  floorSlab('raid2 c3 roof', 12.4, H_X1, H_Z0, H_Z1);
  rect('raid2 c3 counter run', 25.6, H_X1 - WALL_T, 0, HARD_COVER, -15.5, -13, m.stone);
  rect('raid2 c3 island', 22.4, 25.4, 0, MOUNT, -8.6, -6.6, m.timber);
  // The office window: a 0.70 m sill in from the pool deck, a drop out. One-way
  // in feel, and it turns a north-lane push into a centre push without using a
  // courtyard mouth.
  rect('raid2 c3 window sill', 24, 27, 0, MOUNT, H_Z0, H_Z0 + WALL_T, m.stone);
  rect('raid2 c3 window head', 24, 27, 2.4, WALL_TOP, H_Z0, H_Z0 + WALL_T, m.stucco);
  rect('raid2 c3 window glazing', 24, 27, MOUNT, 2.4, H_Z0 + 0.25, H_Z0 + 0.55, m.glass,
    { solid: false, shots: true });

  // U2, the upper landing over C1's north half. Reached by the C1 stair; looks
  // onto the pool deck through two window slots and down into the courtyard.
  // Same complement rule as the wing: the C1 stair's footprint
  // (x -25.2..-23.6, z -19.2..-15.15) is a HOLE, carried north to the house
  // wall so the opening reads as a stairwell rather than a slot. Emitted as one
  // rectangle this floor sealed U2 exactly as the wing's sealed U1.
  floorSlab('raid2 u2 floor west', H_X0, -25.2, H_Z0, -11);
  floorSlab('raid2 u2 floor landing', -25.2, -23.6, -15.15, -11);
  floorSlab('raid2 u2 floor east', -23.6, -10.4, H_Z0, -11);
  // The stairwell's open (east) edge, guarded the way U1's now is.
  rect('raid2 u2 rail stairwell', -23.6, -23.3, UPPER_FLOOR_Y, RAIL_TOP, H_Z0, -15.15, m.stone);
  wallAlongX('raid2 u2 wall north', H_X0, -10.4, H_Z0, H_Z0 + WALL_T, UPPER_WALL_TOP, [[-22, -19], [-16, -13]], m.stucco, UPPER_FLOOR_Y);
  rect('raid2 u2 wall west', H_X0, H_X0 + WALL_T, UPPER_FLOOR_Y, UPPER_WALL_TOP, H_Z0, -11, m.stucco);
  rect('raid2 u2 rail south', H_X0 + WALL_T, -10.4, UPPER_FLOOR_Y, RAIL_TOP, -11.3, -11, m.stone);
  rect('raid2 u2 rail east', -11.2, -10.4, UPPER_FLOOR_Y, RAIL_TOP, H_Z0, -11, m.stone);

  // =========================================================================
  // SOUTH LANE - the circular drive. The laundry block and the gallery are
  // ATTACHED to the house's south face, so the map's centre is ONE mass.
  // =========================================================================

  // S1 laundry block, x -26..-10, z -4..+9, sharing the house's south wall.
  wallAlongZ('raid2 laundry west', -26, -25.2, H_Z1, 9, WALL_TOP, [[1, 7]]);
  wallAlongZ('raid2 laundry east', -10.8, -10, H_Z1, 9, WALL_TOP, [[-3.5, 0]]);
  wallAlongX('raid2 laundry south', -26, -10, 8.2, 9, WALL_TOP, [[-20, -16]]);
  floorSlab('raid2 laundry floor south', -26, -10, H_Z1, 5.2);
  floorSlab('raid2 laundry floor west', -26, -14.85, 5.2, 7.2);
  floorSlab('raid2 laundry floor north', -26, -10, 7.2, 9);
  // Shifted 0.45 m (one tread) WEST of where it shipped. Its bottom riser used
  // to sit at x -10.8..-10.35, entirely inside the solid segment of
  // `raid2 laundry east` (x -10.8..-10, y 0..3.4): the slab hole was carved
  // correctly and the stair's FOOT was walled off, so U3 and the team-0 drive
  // balcony were sealed. One tread west puts the foot clear of the wall and
  // leaves the laundry's mouth scheme - and therefore every sightline
  // invariant in this file - untouched. The landing edge now meets the top
  // tread exactly (both at x -14.85) instead of leaving a 0.15 m slot.
  stairRun('raid2 laundry stair', -14.85, -10.8, 5.4, 7, 'x-');
  rect('raid2 laundry bench', -22.6, -20.6, 0, MOUNT, -2.4, 0.6, m.timber);
  // U3, over the laundry, with the balcony that watches the drive from the
  // team-0 side. Its rail is the documented dead-band exception.
  wallAlongZ('raid2 u3 wall west', -26, -25.2, H_Z1, 9, UPPER_WALL_TOP, [], m.stucco, UPPER_FLOOR_Y);
  rect('raid2 u3 wall east', -10.8, -10, UPPER_FLOOR_Y, UPPER_WALL_TOP, H_Z1, 9, m.stucco);
  rect('raid2 u3 wall north', -26, -10, UPPER_FLOOR_Y, UPPER_WALL_TOP, H_Z1, H_Z1 + WALL_T, m.stucco);
  rect('raid2 u3 balcony floor', -24, -12, UPPER_SOFFIT, UPPER_FLOOR_Y, 9, 10.6, m.stucco, { cast: false });
  rect('raid2 u3 balcony rail', -24, -12, UPPER_FLOOR_Y, RAIL_TOP, 10.3, 10.6, m.stone);
  rect('raid2 u3 balcony rail west', -24, -23.7, UPPER_FLOOR_Y, RAIL_TOP, 9, 10.6, m.stone);
  rect('raid2 u3 balcony rail east', -12.3, -12, UPPER_FLOOR_Y, RAIL_TOP, 9, 10.6, m.stone);
  // The laundry's south face is a wall at grade, so U3's balcony has to be
  // reached from inside: the stair lands beside its door mouth.

  // S4 gallery, x +14..+30, z -4..+8, likewise sharing the house's south wall.
  wallAlongZ('raid2 gallery west', 14, 14.8, H_Z1, 8, WALL_TOP, [[-3.5, 0]]);
  wallAlongZ('raid2 gallery east', 27.2, H_X1, H_Z1, 8, WALL_TOP, [[1, 7]]);
  wallAlongX('raid2 gallery south', 14, H_X1, 7.2, 8, WALL_TOP, [[19, 23]]);
  floorSlab('raid2 gallery floor south', 14, H_X1, H_Z1, 5.2);
  floorSlab('raid2 gallery floor west', 14, 15.2, 5.2, 7.2);
  // 19.25, not 19.4: the landing edge meets the gallery stair's top tread
  // exactly. The 0.15 m slot it used to leave is smaller than the 0.38 m capsule
  // radius so nobody fell through it, but a floor with a slot in it is a defect
  // whether or not it is currently exploitable.
  floorSlab('raid2 gallery floor east', 19.25, H_X1, 5.2, 7.2);
  floorSlab('raid2 gallery floor north', 14, H_X1, 7.2, 8);
  stairRun('raid2 gallery stair', 15.2, 19.25, 5.4, 7, 'x+');
  // The display hall's one hard-cover sculpture, on the centre line so the room
  // is a fight and not a shooting gallery.
  rect('raid2 gallery sculpture', 14.8, 17.2, 0, HARD_COVER, 1, 3.4, m.stone);
  // U4, over the gallery, the drive lane's team-1 balcony. Counters U3; each is
  // counterable from the other and from the island's blind arc.
  rect('raid2 u4 wall east', 27.2, H_X1, UPPER_FLOOR_Y, UPPER_WALL_TOP, H_Z1, 8, m.stucco);
  rect('raid2 u4 wall west', 14, 14.8, UPPER_FLOOR_Y, UPPER_WALL_TOP, H_Z1, 8, m.stucco);
  rect('raid2 u4 wall north', 14, H_X1, UPPER_FLOOR_Y, UPPER_WALL_TOP, H_Z1, H_Z1 + WALL_T, m.stucco);
  rect('raid2 u4 balcony floor', 16, 26, UPPER_SOFFIT, UPPER_FLOOR_Y, 8, 9.6, m.stucco, { cast: false });
  rect('raid2 u4 balcony rail', 16, 26, UPPER_FLOOR_Y, RAIL_TOP, 9.3, 9.6, m.stone);
  rect('raid2 u4 balcony rail west', 16, 16.3, UPPER_FLOOR_Y, RAIL_TOP, 8, 9.6, m.stone);
  rect('raid2 u4 balcony rail east', 25.7, 26, UPPER_FLOOR_Y, RAIL_TOP, 8, 9.6, m.stone);

  // The two service blocks that break the z ~ +11 band. Each OVERLAPS the block
  // beside it, so it joins that architectural mass instead of becoming a
  // free-standing partition - the whole point of this rebuild.
  // Authored as SOLID outbuildings, not as rooms. They exist to break the
  // z ~ +11 band; giving each an interior would add two roofs, two more wall
  // masses and two rooms nobody fights in.
  rect('raid2 service west block', -34, -25.2, 0, WALL_TOP, 8, 14, m.stucco);
  rect('raid2 carport block', 27.2, 36, 0, WALL_TOP, 7, 13, m.stucco);

  // S2/S3 the circular drive and its island. FIVE discrete pieces, never a
  // solid block: the island must be circumnavigable or the drive lane becomes a
  // pure crossfire with nowhere to break the line.
  rect('raid2 drive island kerb', -7, 3, 0, 0.3, 10, 20, m.stone, { cast: false });
  rect('raid2 drive fountain plinth', -2, 2, 0, HARD_COVER - COPLANAR_CLEARANCE, 12, 16, m.stone);
  // The four planters ABUT the plinth, so the island is one mass you walk
  // around rather than five obstacles you thread between. Circumnavigable is
  // the property that matters and it is unchanged; five separate pieces in the
  // middle of a lane is exactly the fragmentation this rebuild is undoing.
  for (const [px, pz] of [[-3.6, 12.8], [3.6, 12.8], [-3.6, 15.2], [3.6, 15.2]] as const) {
    rect(`raid2 drive planter ${px} ${pz}`, px - 1.7, px + 1.7, 0, HARD_COVER, pz - 1.0, pz + 1.0, m.planting);
  }
  // S5 drive approach: open paving with two mountable kerb runs, falling away to
  // the 1.9 m hillside parapet the boundary generator already placed.
  rect('raid2 drive kerb west', -18, -12, 0, MOUNT, 21, 21.8, m.stone);
  rect('raid2 drive kerb east', 8, 14, 0, MOUNT, 21, 21.8, m.stone);
  rect('raid2 drive planting west', -19, -15, 0, MOUNT, 27, 30, m.planting);
  rect('raid2 drive planting east', 11, 15, 0, MOUNT, 27, 30, m.planting);

  // =========================================================================
  // THE TWO ENDS
  // =========================================================================

  // E1 west spawn apron. Open ground with mountable garden walls, and ONE hard
  // screen run with a 4 m gap so the apron has a screened mouth instead of a
  // clean look straight into it from the house's west face.
  rect('raid2 apron garden wall north', -46, -40, 0, MOUNT, -6.6, -6, m.stone);
  rect('raid2 apron garden wall south', -46, -40, 0, MOUNT, 0.6, 1.2, m.stone);
  rect('raid2 apron planter', -49, -46.4, 0, MOUNT, -3.4, 0.4, m.planting);
  // A single run with the gap at its south end, not a run with a hole in the
  // middle: same screening, one wall mass instead of two.
  wallAlongZ('raid2 apron screen', -34, -33.2, -11, -3, HARD_COVER, [[-7, -3]]);

  // E2 east garage. Three bay piers on 6 m centres - the shipped map used 4 m
  // centres and that is what made a covered garage read as a wall - plus a
  // 0.40 m kerb line in three runs with gaps. HF-402's lesson: a continuous
  // 0.70 m kerb makes the whole wing unreachable to a bot, which is exactly why
  // the shipped Raid could not spawn team 1 in its own garage.
  wallAlongX('raid2 garage north', 38, 50, -16, -15.2, WALL_TOP, []);
  wallAlongX('raid2 garage south', 38, 50, 11.2, 12, WALL_TOP, []);
  wallAlongZ('raid2 garage back', 49.2, 50, -16, 12, WALL_TOP, []);
  floorSlab('raid2 garage roof', 40, 50, -10, 6);
  for (const z of [-9, -1, 7]) {
    rect(`raid2 garage bay pier ${z}`, 33.4, 34.6, 0, WALL_TOP - COPLANAR_CLEARANCE, z - 0.6, z + 0.6, m.stone);
  }
  for (const [z0, z1] of [[-13, -6], [-3, 4], [7, 10]] as const) {
    rect(`raid2 garage kerb ${z0}`, 36.2, 37, 0, 0.4, z0, z1, m.stone, { cast: false });
  }
  rect('raid2 garage workbench', 46, 48.4, 0, MOUNT, -6, -2, m.timber);
  rect('raid2 garage crate stack', 46.8, 49.2, 0, HARD_COVER, 4, 6.4, m.timber);

  batchPresentationOnlyBoxes(builder.root, 'raid2-presentation');

  // Spawn tables. Re-solved with scripts/qa/solve-spawn-layouts.ts under the
  // HF-402 constraint set (src/spawn-layout-constraints.ts): floor under every
  // point, an autostep-only route to the enemy table, hard cover within reach,
  // a standoff floor so no point opens with a wall filling the screen, an open
  // arc, and no enemy spawn in sight. Unlike the shipped Raid these ARE close
  // to an x mirror, because this build gave the garage an autostep route in.
  //
  // MEASURED, not authored by eye (artifacts/raid2/spawnspread.ts, re-run after
  // every geometry change in this lane). Two defects the eye missed and the
  // instrument did not:
  //
  //  1. The first table put (-46, -2) 0.40 m from the apron planter against a
  //     0.44 m spawn radius, so that point and its mirror both measured
  //     standable=false - 4 cm inside geometry.
  //  2. The second table passed every per-point check and still failed
  //     src/spawn-layout-quality.test.ts: it spanned 15.0 m of a 100 m map
  //     against an 18% floor, i.e. six points blobbed in one corner of the
  //     apron. The apron ALONE cannot seat six mirrored points at 4.5 m spacing
  //     with the required spread (searched exhaustively: 92 legal apron
  //     candidates, no passing 6-set), so team 0's spawn ZONE reaches out of
  //     the apron into the south half of the west flank, which is how a spawn
  //     region is meant to work anyway.
  //
  // The table below is the highest cross-team separation found among sets that
  // spread 19-30 m: span 20.0 m (20% of the long axis), cross-team minimum 64 m,
  // ZERO spawn-to-spawn sightlines, 12/12 points legal, envelope/floor/reachable
  // all 100%.
  // PASS 94 integration (HF-456 x the item-16 mirror contract). The
  // spawn-distribution lane raised this arena to eight points per team and
  // authored the two new ones FREELY - team 0 at [-34, -33] and [-48, -18],
  // team 1 at [30, 30] and [31, 16]. Raid is an X MIRROR by contract
  // (src/raid2-fidelity.test.ts item 16: the two flanks differ in KIND, a pool
  // terrace against a motor drive, so a 180-degree rotation would demand they be
  // equal and they are not), and every team-0 point needs a team-1 partner
  // within 2 m of its x mirror. Those four points had no partners at all, and
  // the exact mirrors of team 0's two were not legal ground: [34, -33] is inside
  // geometry and [48, -18] has no floor under it.
  //
  // Re-solved by scripts/qa/solve-raid2-mirrored-spawns.ts over the cells where
  // BOTH halves of the pair pass the full constraint set, with cross-team
  // separation held at the existing 64 m (no new pair inboard of |x| = 32), the
  // mean nearest-neighbour held over the lane's own 7 m floor, and item 18's
  // ZERO enemy-LOS pairs at any range - which is stricter than the shared
  // `enemy-spawn-in-sight` failure and is what rules most candidates out. Of 51
  // mirrorable cells the pair below is the widest-spread fully legal one:
  //
  //   points per team               6 -> 8
  //   mean nearest-neighbour             7.65 m  (gate floor 7)
  //   spread                     0.200 -> 0.200  (gate floor 0.18)
  //   cross-team separation              64 m, unchanged
  //   enemy line-of-sight pairs          0
  //   measureSpawnLayout: 16 points, 0 failures, 0 unreachable, 0 without floor
  const team0: [number, number][] = [
    [-32, -16], [-38, -10], [-41, -2], [-48, 2], [-33, 2], [-39, 4], [-48, -14], [-32, -5],
  ];
  /** The exact x mirror of `team0`, which is what item 16 measures. */
  const team1: [number, number][] = [
    [32, -16], [38, -10], [41, -2], [48, 2], [33, 2], [39, 4], [48, -14], [32, -5],
  ];

  return {
    id: 'raid2',
    label: 'Raid Rebuild',
    root: builder.root,
    colliders: builder.colliders,
    physicsColliders: builder.physicsColliders,
    raycastMeshes: builder.raycastMeshes,
    shotSurfaces: builder.shotSurfaces,
    spawns: spawnRecord(team0, team1),
    // Ten at grade and four on the +3.40 m floors. Bots that never go upstairs
    // simply do not defend a map whose power positions are all upstairs.
    patrolPoints: ([
      [-43, 0, -4], [-27, 0, -28], [0, 0, -28], [24, 0, -25],
      [-18, 0, -12], [5, 0, -12], [21, 0, -12],
      [-18, 0, 4], [0, 0, 18], [22, 0, 3], [43, 0, -2],
      [25, UPPER_FLOOR_Y, -26], [-18, UPPER_FLOOR_Y, -15],
      [-18, UPPER_FLOOR_Y, 5], [22, UPPER_FLOOR_Y, 3],
    ] as const).map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { ...RAID2_BOUNDS },
    houseTelemetry: emptyTelemetry(),
    // Lowest standable surface is the pool basin at -0.55 m.
    physicsSafetyFloorY: -1.2,
  };
}
