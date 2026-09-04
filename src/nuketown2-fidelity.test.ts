import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isBlocked } from './collision';
import { deriveGlassDynamicColliders } from './glass-collider-bounds';
import { FALL_DAMAGE_SAFE_SPEED, computeFallDamage, movementProfile } from './gameplay';
import type { ArenaMap } from './map';
import {
  NUKETOWN2_BALCONY,
  NUKETOWN2_BOUNDS,
  NUKETOWN2_BUILDING_FOOTPRINTS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  NUKETOWN2_CENTRAL_TRUCK,
  NUKETOWN2_DOORWAYS,
  NUKETOWN2_HOUSE_STAIR,
  NUKETOWN2_GROUND_DRESSING,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_RARE_GUN_SITES,
  NUKETOWN2_SECTION,
  NUKETOWN2_SPAWN_LAYOUT,
  NUKETOWN2_STAIRWELL,
  NUKETOWN2_STREET_COACH,
  NUKETOWN2_STREET_LENGTH,
  NUKETOWN2_WINDOWS,
  NUKETOWN2_YARD_STAIR,
  buildNuketown2,
} from './nuketown2-arena';
import {
  NUKETOWN2_GROUND_FLOOR_TOP,
  NUKETOWN2_GROUND_STOREY_H,
  NUKETOWN2_HANDEDNESS,
  NUKETOWN2_UPPER_Y0,
  nuketown2HandedSpan,
  nuketown2HandedX as hx,
} from './nuketown2-layout';
import {
  OVERDRIVE_POSITION,
  claimOverdrive,
  createOverdriveState,
  overdrivePositionForArena,
} from './overdrive';
import {
  minimapPlayerViewPoint,
  playerUpRotationRadians,
  playerUpScaleX,
  worldToMinimap,
  worldToTacticalMap,
} from './minimap';
import { CHARACTER_PHYSICS_CONFIG, CharacterPhysics, STANCE_SHAPES } from './physics';
import { shedPlacementsForArena } from './destructible-shed-registry';
import { NUKETOWN_LAWN_KEEPOUT_MARGIN_M, nuketownRebuildLawnRegions } from './nuketown-lawn-field';

/**
 * NUKE TOWN REBUILD fidelity guard (HF-407, re-derived end to end under HF-426).
 *
 * THE AUTHORITY CHANGED, AND THAT IS THE POINT. Every band in the previous
 * version of this file was derived from `docs/NUKETOWN_REBUILD_2026-09-02.md`,
 * which took ONE published area scalar for the reference map and then reused
 * this repository's own 2026-08-29 redesign for the flow. The owner rejected
 * the arena that came out of it ("its based on an old layout we had here, not
 * the actual layout of black ops 2 nuketown", 2026-09-03 07:00 BST). The
 * authority is now `docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md`, which is
 * MEASURED IN PIXELS off the two first-party Treyarch overhead minimaps of
 * Nuketown 2025 and quotes the segmentation it used.
 *
 * THE RULE FOR EVERY NUMBER IN THIS FILE, and it is stricter than last time. A
 * band is either
 *   (a) a REFERENCE RATIO from the schematic, converted at the arena's own
 *       street length and given the lane's 5 %-of-street-length tolerance, or
 *   (b) a CEILING DERIVED FROM (a) - a value that follows arithmetically from a
 *       reference ratio plus a stated estimator margin.
 * Nothing below is "the number the build happens to produce". Where a measured
 * value is quoted it is quoted as EVIDENCE that the build lands inside a band
 * that was derived first, and the derivation is written out beside it.
 */

const PLAYER_RADIUS = 0.44;
/** The CROUCHED capsule, for the "does any route need a crouch" sweep. */
const CROUCH_CAPSULE_M = 2 * (STANCE_SHAPES.crouch.halfHeight + STANCE_SHAPES.crouch.radius);
/** The STANDING capsule, from the physics module rather than from memory. */
const STANDING_CAPSULE_M = 2 * (STANCE_SHAPES.stand.halfHeight + STANCE_SHAPES.stand.radius);
const STANDING_RADIUS_M = STANCE_SHAPES.stand.radius;
/**
 * Walk a STANDING capsule along a waypoint list on the REAL CharacterPhysics
 * against the REAL built colliders, with gravity and NO JUMP. No jump is the
 * point: a route a player has to hop up is not a route a player walks, and the
 * stair, the doors and the landing all have to be walkable standing.
 */
type StandingWalkProbe = {
  trace: Array<{ x: number; y: number; z: number }>;
  frameCount: number;
  maxConsecutiveUngroundedFrames: number;
  slopeAdjustedFrames: number;
  waypointFrames: number[];
  completed: boolean;
};

async function walkStandingDetailed(
  map: ArenaMap,
  startEye: readonly [number, number, number],
  route: ReadonlyArray<readonly [number, number]>,
  frameBudget: number,
): Promise<StandingWalkProbe> {
  const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
  try {
    const dt = 1 / 120;
    physics.teleportEye({ x: startEye[0], y: startEye[1], z: startEye[2] });
    const trace: Array<{ x: number; y: number; z: number }> = [];
    const waypointFrames: number[] = [];
    let vy = 0;
    let frameCount = 0;
    let consecutiveUngroundedFrames = 0;
    let maxConsecutiveUngroundedFrames = 0;
    let slopeAdjustedFrames = 0;
    let completed = true;
    for (const waypoint of route) {
      let reached = false;
      for (let step = 0; step < 1400 && frameCount < frameBudget; step += 1) {
        const eye = physics.eyePosition();
        const dx = waypoint[0] - eye.x;
        const dz = waypoint[1] - eye.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.2) {
          reached = true;
          break;
        }
        const advance = Math.min(distance, 3.6 * dt);
        vy += -24.5 * dt;
        const result = physics.move({ x: (dx / distance) * advance, y: vy * dt, z: (dz / distance) * advance }, dt);
        frameCount += 1;
        if (result.grounded) vy = 0;
        if (result.grounded) consecutiveUngroundedFrames = 0;
        else {
          consecutiveUngroundedFrames += 1;
          maxConsecutiveUngroundedFrames = Math.max(maxConsecutiveUngroundedFrames, consecutiveUngroundedFrames);
        }
        if (result.slopeAdjusted) slopeAdjustedFrames += 1;
      }
      if (!reached) completed = false;
      const eye = physics.eyePosition();
      trace.push({ x: eye.x, y: eye.y, z: eye.z });
      waypointFrames.push(frameCount);
      if (!reached) break;
    }
    return {
      trace,
      frameCount,
      maxConsecutiveUngroundedFrames,
      slopeAdjustedFrames,
      waypointFrames,
      completed,
    };
  } finally {
    physics.dispose();
  }
}

async function walkStanding(
  map: ArenaMap,
  startEye: readonly [number, number, number],
  route: ReadonlyArray<readonly [number, number]>,
): Promise<Array<{ x: number; y: number; z: number }>> {
  return (await walkStandingDetailed(map, startEye, route, 10_000)).trace;
}
/**
 * Eye height for a player standing on the upper floor slab: slab top 3.3 m plus
 * 1.66 m. `isBlocked` excludes a collider only when `eye - 1.65 > collider.maxY`
 * STRICTLY, so 3.3 + 1.65 exactly would still read the floor as an obstruction.
 */
const UPPER_FLOOR_EYE_Y = 4.96;
const sprintSpeed = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded: true }).maxSpeed;
const STAIR_TRAVERSAL_FRAME_BUDGET = 2_400;

const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
const depth = NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ;

/** The ratio base. Schematic §3: every reference dimension is a fraction of it. */
const L = NUKETOWN2_STREET_LENGTH;
/** The lane's stated tolerance: 5 % of street length, in metres. */
const TOL = 0.05 * L;

/**
 * THE REFERENCE ASPECT, and the single structural correction this pass makes.
 * Both first-party minimaps put the playable polygon at 2.36 : 1 with the LONG
 * axis running ACROSS the street:
 *   BO2 `Nuketown_2025_Minimap_BOII.png` — 427 x 181 px = 2.359
 *   BO7 `Nuketown_2025_MiniMap_BO7.png`  — 944 x 400 px = 2.360
 * The previous cut was 58 x 52 = 0.90 : 1 with the long axis ALONG the street.
 */
const REFERENCE_ASPECT = 2.36;

/**
 * The absolute scale is ANCHORED, not published. The previous cut's authored
 * playable rectangle was 58 x 52 = 3,016 m², and that number survives this pass
 * deliberately: the reference's overheads give SHAPE reliably and absolute SIZE
 * not at all, and the previous cut's one published area scalar is exactly what
 * the owner rejected. So the map is re-proportioned at constant area, and this
 * band pins that promise.
 */
const ANCHOR_PLAYSPACE_M2 = 3_016;
const PLAYSPACE_TOLERANCE = 0.05;

/**
 * Longest clear STANDING eye-line over the whole map. TWO-SIDED, and both sides
 * are derived before the build is measured.
 *
 *  - CEILING. The reference's playable polygon is a stepped hexagon, not a
 *    rectangle, and its own minimap draws hatched props along BOTH long
 *    boundaries; no lane on it runs the full diagonal. This arena is a
 *    rectangle, so the props have to do that work alone, and the ceiling is set
 *    at 55 % of the playable diagonal — 0.55 x 91.39 = 50.3 m. That number is a
 *    RATIO decision, not a measurement: at 55 % the worst lane is shorter than
 *    the shorter side of the map (84 m long axis, 36 m short axis: 50.3 m is
 *    1.40 x the short side), which is the property "you cannot see spawn to
 *    spawn down a flank" expressed without reference to any particular prop.
 *  - FLOOR. A map with no long view is a corridor, and the reference's three
 *    lanes each run most of the long axis. 30 m, which is 0.36 of the diagonal.
 *
 * EVIDENCE the build lands inside: 39.4 m, [-17, -39] -> [17, -19]. It was
 * 82.0 m before the yard-fence gaps were taken off-axis from their own
 * rotational partners, 70.0 m before the two flank props were moved onto the
 * perimeter wall's inner face, and 46.0 m ([17, -35] -> [17, 11]) before
 * HF-432 item 2 dressed the FAR flank of each half - `pair()` negates x and z
 * together, so one authored side store gives each team a dressed flank and a
 * bare one, and the bare one carried this lane. All three fixes are written up
 * in `yard()`.
 */
const MAX_STANDING_EYE_LINE_METRES = 50.3;
const MIN_STANDING_EYE_LINE_METRES = 30;

/**
 * Longest clear run ALONG the street centre-line at standing eye height.
 *
 * DERIVED, not measured, and RE-DERIVED under HF-432 item 5 at the same value.
 *
 * The band was originally justified by the truck: it straddled the origin, so a
 * line along z = 0 from the west sample entered the open cargo box and stopped
 * at the bulkhead, 17 + 3.17 + two 0.5 m sample steps = 21.2 m. That derivation
 * is GONE, because the truck now stands 0.076 L south of the centre-line where
 * the reference has it, and the reference's own offsets leave 2.8 m of open
 * carriageway between the truck and the coach - straight down z = 0. Left
 * alone, the road became a 34 m clear lane.
 *
 * The band is re-derived from the body that stops it now: the head car, the
 * arena's own authored counterweight (see `coach()`), parked ACROSS the
 * centre-line at x [2.3, 6.7]. The run from the west sample is 17 + 2.3 =
 * 19.3 m, plus one 0.5 m sample step. Measured: 20.0 m, from x = -17 to x = 3.
 *
 * THE VALUE IS UNCHANGED AT 21.2, deliberately: a band re-derived at a NEW
 * number would not be the same promise, and this one is still "the street is
 * not a shooting gallery". It is the number that moves if the head car is
 * deleted, shortened or pushed off the line - which is now the property that
 * carries it, and which is also why `coach()` says so in its own comment.
 */
const MAX_STREET_CENTRE_RUN_METRES = 21.2;

function clearLine(map: ArenaMap, from: readonly [number, number], to: readonly [number, number], eyeHeight: number): boolean {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const metres = Math.hypot(dx, dz);
  const steps = Math.ceil(metres * 4);
  for (let index = 1; index < steps; index += 1) {
    const t = index / steps;
    const x = from[0] + dx * t;
    const z = from[1] + dz * t;
    for (const bounds of map.colliders) {
      const minY = bounds.minY ?? 0;
      const maxY = bounds.maxY ?? minY + 3;
      if (x > bounds.minX - 0.05 && x < bounds.maxX + 0.05
        && z > bounds.minZ - 0.05 && z < bounds.maxZ + 0.05
        && eyeHeight > minY && eyeHeight < maxY) return false;
    }
  }
  return true;
}

/** Longest unobstructed straight eye-line between perimeter sample points. */
function longestClearEyeLine(map: ArenaMap, eyeHeight: number): {
  metres: number;
  from: [number, number];
  to: [number, number];
} {
  const samples: Array<[number, number]> = [];
  for (let x = NUKETOWN2_BOUNDS.minX + 1; x <= NUKETOWN2_BOUNDS.maxX - 1; x += 2) {
    samples.push([x, NUKETOWN2_BOUNDS.minZ + 1], [x, NUKETOWN2_BOUNDS.maxZ - 1]);
  }
  for (let z = NUKETOWN2_BOUNDS.minZ + 1; z <= NUKETOWN2_BOUNDS.maxZ - 1; z += 2) {
    samples.push([NUKETOWN2_BOUNDS.minX + 1, z], [NUKETOWN2_BOUNDS.maxX - 1, z]);
  }
  let best = { metres: 0, from: [0, 0] as [number, number], to: [0, 0] as [number, number] };
  for (const from of samples) {
    for (const to of samples) {
      const metres = Math.hypot(to[0] - from[0], to[1] - from[1]);
      if (metres <= best.metres) continue;
      if (clearLine(map, from, to, eyeHeight)) best = { metres, from, to };
    }
  }
  return best;
}

/** Every solid box mesh the builder emitted, presentation decals excluded. */
function solidMeshes(map: ArenaMap): THREE.Mesh[] {
  return map.root.children.filter((node): node is THREE.Mesh => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh !== true) return false;
    if (mesh.userData.presentationOnly === true) return false;
    return (mesh.geometry as THREE.BoxGeometry).parameters !== undefined;
  });
}

function planFootprint(mesh: THREE.Mesh): { x0: number; x1: number; z0: number; z1: number } {
  const p = (mesh.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
  return {
    x0: mesh.position.x - p.width / 2,
    x1: mesh.position.x + p.width / 2,
    z0: mesh.position.z - p.depth / 2,
    z1: mesh.position.z + p.depth / 2,
  };
}

/**
 * HF-473. `nuketown2-arena.ts` exports its geometry-description tables in the
 * AUTHORED frame - the frame its own builder writes in - and the world is that
 * frame mirrored on x by `NUKETOWN2_HANDEDNESS`. This gate is where the two
 * meet, so the conversion lives here, once, and every probe below uses it.
 */
/** The authored x centre of the house's internal door, read, never re-typed. */
const INTERNAL_DOOR_CENTRE_X = NUKETOWN2_DOORWAYS
  .find((door) => door.id === 'house internal door')!.centre;
const WORLD_BUILDING_FOOTPRINTS = NUKETOWN2_BUILDING_FOOTPRINTS.map((footprint) => {
  const [x0, x1] = nuketown2HandedSpan(footprint.x0, footprint.x1);
  return { ...footprint, x0, x1 };
});
const WORLD_GROUND_DRESSING = NUKETOWN2_GROUND_DRESSING.map((piece) => {
  const [x0, x1] = nuketown2HandedSpan(piece.x0, piece.x1);
  return { ...piece, x0, x1 };
});
/** An authored window's x span, in the world. */
const worldWindowSpan = (win: { x0: number; x1: number }): readonly [number, number] =>
  nuketown2HandedSpan(win.x0, win.x1);

describe('Nuke Town Rebuild fidelity', () => {
  it('has the reference SHAPE, at the previous cut\'s area: 36 m of street by 84 m across it', () => {
    // (1) Area is the anchor, and it is held.
    const playspace = width * depth;
    expect(playspace).toBeGreaterThan(ANCHOR_PLAYSPACE_M2 * (1 - PLAYSPACE_TOLERANCE));
    expect(playspace).toBeLessThan(ANCHOR_PLAYSPACE_M2 * (1 + PLAYSPACE_TOLERANCE));

    // (2) Shape is the reference's, and this is THE assertion the previous cut
    // could not have passed: its long axis was the street (58 along, 52 across,
    // 0.90 : 1). On both first-party minimaps the long axis runs ACROSS the
    // road - yard, house, road, house, yard - at 2.36 : 1.
    expect(depth, 'the long axis runs ACROSS the street, not along it').toBeGreaterThan(width);
    const aspect = depth / width;
    expect(aspect).toBeGreaterThan(REFERENCE_ASPECT * 0.95);
    expect(aspect).toBeLessThan(REFERENCE_ASPECT * 1.05);

    // (3) The street's own length is the ratio base the schematic is written in,
    // and it must BE the short axis rather than merely be called it.
    expect(NUKETOWN2_STREET_LENGTH).toBe(width);

    // (4) Diagonal and perimeter follow from (1) and (2) with no further
    // freedom: sides sqrt(A / r) and sqrt(A * r) for A = 3,016 and r = 2.36 are
    // 35.75 and 84.38 m, so the diagonal is 91.64 m and the lap 240.3 m.
    const referenceShort = Math.sqrt(ANCHOR_PLAYSPACE_M2 / REFERENCE_ASPECT);
    const referenceLong = Math.sqrt(ANCHOR_PLAYSPACE_M2 * REFERENCE_ASPECT);
    expect(Math.hypot(width, depth)).toBeCloseTo(Math.hypot(referenceShort, referenceLong), 0);
    expect(2 * (width + depth)).toBeCloseTo(2 * (referenceShort + referenceLong), -0.5);
  });

  it('adds up: the cross-street section is exactly the fenced depth, at the reference\'s own ratios', () => {
    // Half the section, road centre-line outward: carriageway half-width, front
    // verge, house, back yard, border path. If this stops summing, one of those
    // bands has been silently eaten and the arena is no longer the map the
    // footprint band above claims it is.
    const half = NUKETOWN2_SECTION.streetHalfWidth
      + NUKETOWN2_SECTION.frontVergeDepth
      + NUKETOWN2_SECTION.houseDepth
      + NUKETOWN2_SECTION.yardDepth
      + NUKETOWN2_SECTION.sidePathDepth;
    expect(half * 2).toBeCloseTo(depth, 10);

    // Every band below is a MEASURED reference ratio (schematic §3) converted at
    // this arena's street length, with the lane's 5 %-of-L tolerance.
    // Front wall to road centre-line: the two house fronts stand 0.553 L apart
    // (BO7 minimap, 221 px of 400), so each is 0.2765 L off the centre-line.
    expect(NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth)
      .toBeCloseTo(0.2765 * L, 0);
    expect(Math.abs((NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth) - 0.2765 * L))
      .toBeLessThan(TOL);
    // Carriageway width = the width of the tongue the road leaves the polygon
    // through: DRAWN 0.328 L (BO7 131 px of 400; BO2 60 px of 181 = 0.331).
    // HF-437 re-derived: the schematic's own stroke correction (section 3
    // caveat 1 - drawn outlines are ~0.038 L too fat) brings the road to
    // 0.290 L, authored 2 x 5.3 = 10.6 m = 0.294 L, so the kerb-side strips
    // widen to 0.131 L each (4.7 m) while the house fronts keep the measured
    // 0.2765 L offset. The drawn band still holds; the corrected band pins it.
    expect(Math.abs(NUKETOWN2_SECTION.streetHalfWidth * 2 - 0.328 * L)).toBeLessThan(TOL);
    expect(Math.abs(NUKETOWN2_SECTION.streetHalfWidth * 2 - 0.294 * L), 'stroke-corrected carriageway')
      .toBeLessThan(0.01 * L);
    // House depth 0.363 L (145 px), frontage 0.303 L (121 px).
    expect(Math.abs(NUKETOWN2_SECTION.houseDepth - 0.363 * L)).toBeLessThan(TOL);
    expect(Math.abs(NUKETOWN2_SECTION.houseWidth - 0.303 * L)).toBeLessThan(TOL);
    // Garage frontage 0.125-0.145 L (50-58 px), depth-setback 0.168 L (67 px).
    expect(Math.abs(NUKETOWN2_SECTION.garageWidth - 0.135 * L)).toBeLessThan(TOL);
    expect(Math.abs(NUKETOWN2_SECTION.garageSetback - 0.168 * L)).toBeLessThan(TOL);
    // Back lot, house back wall to the playable boundary: 0.503 L on one side
    // of the reference and 0.583 L on the other, so 0.543 L is the midpoint.
    expect(Math.abs((NUKETOWN2_SECTION.yardDepth + NUKETOWN2_SECTION.sidePathDepth) - 0.543 * L))
      .toBeLessThan(TOL);
    // THE OFFSET THE PREVIOUS CUT INVENTED. It set the along-street offset
    // between the two house centres to half a house width (7 m of its own 58 m
    // street, 0.121 L) on the theory that each front window should look
    // diagonally at the other house's driveway. The reference offsets them by
    // 26 px of 400 = 0.065 L; the houses very nearly face each other and the
    // diagonal comes from the GARAGES being at opposite ends.
    expect(Math.abs(NUKETOWN2_SECTION.houseOffsetAlongStreet - 0.065 * L)).toBeLessThan(TOL);
    expect(NUKETOWN2_SECTION.houseOffsetAlongStreet)
      .toBeLessThan(NUKETOWN2_SECTION.houseWidth / 2);

    // Every band has to be genuinely playable, not a millimetre of bookkeeping.
    expect(NUKETOWN2_SECTION.sidePathDepth).toBeGreaterThanOrEqual(3.5);
    expect(NUKETOWN2_SECTION.yardDepth).toBeGreaterThanOrEqual(6);
    expect(NUKETOWN2_SECTION.houseDepth).toBeGreaterThanOrEqual(9);
  });

  it('stays small where the reference is small: the road is crossed in two and a half seconds', () => {
    // THE BAND THAT MATTERS ON THIS MAP IS THE CROSSING, NOT THE DIAGONAL, and
    // that is the whole point of the re-proportioning. The previous cut pinned a
    // corner-to-corner diagonal, which on a map whose long axis was the street
    // rewarded exactly the shape the owner rejected. On the reference the two
    // front doors are 0.553 L apart and you cross that in one sprint; the long
    // axis is a spawn-to-spawn distance nobody runs in a straight line.
    const crossing = 2 * (NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth);
    expect(Math.abs(crossing - 0.553 * L)).toBeLessThan(TOL);
    expect(crossing / sprintSpeed).toBeLessThan(2.6);
    expect(crossing / sprintSpeed).toBeGreaterThan(1.9);
  });

  it('puts the moving truck in the cul-de-sac and shortens the street with it', () => {
    const map = buildNuketown2(new THREE.Scene());
    const truck = map.physicalCover.find((cover) => cover.id === 'nuketown2-central-truck');
    expect(truck, 'exactly one moving truck owns the turning head').toBeDefined();
    expect(map.physicalCover.filter((cover) => cover.id.includes('truck'))).toHaveLength(1);
    // The cargo box is centred on the world origin ALONG the street, which is
    // load-bearing: the core's x is the box's own centre.
    // HF-473: the authored interval, put through the same mirror the truck's
    // own bodies go through. Asserted as the mirrored interval rather than as
    // a re-typed number, so the two cannot drift apart.
    const truckSpan = nuketown2HandedSpan(
      -NUKETOWN2_CENTRAL_TRUCK.boxLength / 2,
      NUKETOWN2_CENTRAL_TRUCK.cabX + NUKETOWN2_CENTRAL_TRUCK.cabLength / 2,
    );
    expect(truck!.bounds.minX).toBeCloseTo(truckSpan[0], 10);
    expect(truck!.bounds.maxX).toBeCloseTo(truckSpan[1], 10);
    // The cargo box's own centre is still the world origin along the street,
    // which is what lets the 2x core ride it: mirroring x cannot move x = 0.
    expect(hx(0), 'the cargo box centre is a fixed point of the mirror').toBeCloseTo(0, 12);
    // HF-432 item 5: the truck stands where the REFERENCE has it, 0.076 L
    // south of the road centre-line, and the 2x core follows it because
    // OVERDRIVE_POSITION is per-arena now. HF-426 had to centre it on the
    // world origin and recorded the difference as a deviation (schematic 5.5).
    expect((truck!.bounds.minZ + truck!.bounds.maxZ) / 2).toBeCloseTo(NUKETOWN2_CENTRAL_TRUCK.z, 10);
    expect(Math.abs(NUKETOWN2_CENTRAL_TRUCK.z - 0.076 * L)).toBeLessThan(TOL);
    expect(NUKETOWN2_CENTRAL_TRUCK.z / L, 'truck offset across the street').toBeCloseTo(0.076, 3);
    // ...and it is still ON the carriageway.
    expect(truck!.bounds.maxZ).toBeLessThan(NUKETOWN2_SECTION.streetHalfWidth);
    expect(truck!.blocksShots).toBe(true);
    expect(truck!.blocksMovement).toBe(true);
    // Schematic §3: the truck is 0.325 L end to end, split 0.180 L of hollow
    // cargo box and 0.145 L of solid cab.
    const total = NUKETOWN2_CENTRAL_TRUCK.boxLength + NUKETOWN2_CENTRAL_TRUCK.cabLength;
    expect(Math.abs(total - 0.325 * L)).toBeLessThan(TOL);
    expect(Math.abs(NUKETOWN2_CENTRAL_TRUCK.boxLength - 0.180 * L)).toBeLessThan(TOL);
    expect(Math.abs(NUKETOWN2_CENTRAL_TRUCK.cabLength - 0.145 * L)).toBeLessThan(TOL);
    // The 2x-damage core floats 0.60 m over the box roof, inside the pickup
    // window, and the box deck is LOW so the interior cannot claim through it.
    expect(NUKETOWN2_CENTRAL_TRUCK.roofY).toBeCloseTo(3.25, 10);
    expect(NUKETOWN2_CENTRAL_TRUCK.deckY).toBeCloseTo(0.05, 10);

    // The property, measured rather than assumed: no clear standing run along
    // the street centre-line longer than the derived band. Without the truck
    // this is the whole 36 m street.
    let longestRun = 0;
    for (let ax = NUKETOWN2_BOUNDS.minX + 1; ax <= NUKETOWN2_BOUNDS.maxX - 1; ax += 0.5) {
      for (let bx = ax + 0.5; bx <= NUKETOWN2_BOUNDS.maxX - 1; bx += 0.5) {
        if (bx - ax <= longestRun) continue;
        if (clearLine(map, [ax, 0], [bx, 0], 1.65)) longestRun = bx - ax;
      }
    }
    expect(longestRun).toBeGreaterThan(8);
    expect(longestRun, 'clear run along the street centre-line').toBeLessThanOrEqual(MAX_STREET_CENTRE_RUN_METRES);
  });

  it('gets the OPEN and CLOSED vehicles the right way round: truck open, coach closed, cars solid', async () => {
    const map = buildNuketown2(new THREE.Scene());
    const meshNames = map.root.children.map((node) => node.name);

    // THE CORRECTION. The previous two cuts made the BUS the enterable body.
    // On the reference's own minimap the coach is drawn hatched end to end and
    // the moving truck's cargo box is drawn hollow with a solid cab, and
    // Activision's map guide says the truck is an island of cover in the
    // cul-de-sac with room INSIDE it. So: truck open, coach closed.
    for (const part of ['truck deck', 'truck box roof', 'truck box bulkhead', 'truck cab']) {
      expect(meshNames.some((name) => name.includes(part)), part).toBe(true);
    }
    // ...and each flank opening is a NAMED hole: two piers and a header per
    // flank, so a future full-width flank restores the sealed box and fails
    // here (HF-436).
    for (const part of ['truck box flank 0 pier 0', 'truck box flank 0 header', 'truck box flank 1 pier 1']) {
      expect(meshNames.some((name) => name.includes(part)), part).toBe(true);
    }
    // The truck's interior is a real room: a standing eye at the origin, on the
    // deck, is under a roof and inside the walls, and it is NOT blocked.
    expect(isBlocked({ x: 0, y: 1.7, z: NUKETOWN2_CENTRAL_TRUCK.z }, map.colliders, PLAYER_RADIUS), 'truck cargo box interior').toBe(false);
    // HF-436: the room is enterable from THREE mouths - the -x rear end and a
    // 1.6 x 1.9 m opening in EACH flank. Each mouth is clear just outside it
    // AND in the wall plane at standing eye height.
    const t = NUKETOWN2_CENTRAL_TRUCK;
    const mouths: Array<{ id: string; x: number; z: number; plane: { x: number; z: number } }> = [
      // HF-473: every x below is AUTHORED and put through the handedness
      // mirror, exactly as `streetVehicle()` does when it emits the body.
      { id: 'rear end', x: hx(-t.boxLength / 2 - 0.6), z: t.z, plane: { x: hx(-t.boxLength / 2 + 0.075), z: t.z } },
      { id: 'left flank', x: hx(0), z: t.z - t.width / 2 - 0.6, plane: { x: hx(0), z: t.z - (t.width / 2 - 0.075) } },
      { id: 'right flank', x: hx(0), z: t.z + t.width / 2 + 0.6, plane: { x: hx(0), z: t.z + (t.width / 2 - 0.075) } },
    ];
    for (const mouth of mouths) {
      expect(isBlocked({ x: mouth.x, y: 1.7, z: mouth.z }, map.colliders, PLAYER_RADIUS), `truck ${mouth.id} mouth outside`).toBe(false);
      expect(isBlocked({ x: mouth.plane.x, y: 1.7, z: mouth.plane.z }, map.colliders, PLAYER_RADIUS), `truck ${mouth.id} opening clear`).toBe(false);
    }
    // ...and a standing player WALKS in through the left mouth and out the
    // right one, on the real physics, no jump.
    const through = await walkStanding(map, [hx(0), 1.7, t.z - t.width / 2 - 1.8], [[hx(0), t.z + t.width / 2 + 1.8]]);
    expect(Math.abs(through[0]!.z - (t.z + t.width / 2 + 1.8)), `side-to-side walk ended at ${JSON.stringify(through[0])}`).toBeLessThan(0.45);

    // REVIEW ADDITION (Opus, PASS 92). The walk above proves the openings work
    // TODAY; these are the DERIVED numbers behind it, MEASURED on the built
    // bodies, so a later flank edit that narrows or lowers a mouth fails here
    // with the number instead of only stalling a probe. Clear height is the
    // deck top to the header's underside, clear width is the gap between the
    // two piers, and the step up from the road onto the deck must be inside
    // the controller's own autostep.
    const worldBox = (needle: string): THREE.Box3 => {
      const mesh = map.root.children.find((node) => node.name.endsWith(needle)) as THREE.Mesh | undefined;
      expect(mesh, `truck body "${needle}"`).toBeDefined();
      return new THREE.Box3().setFromObject(mesh!);
    };
    for (const flank of [0, 1]) {
      const header = worldBox(`truck box flank ${flank} header`);
      const pierLow = worldBox(`truck box flank ${flank} pier 0`);
      const pierHigh = worldBox(`truck box flank ${flank} pier 1`);
      expect(header.min.y - t.deckY, `flank ${flank} opening clear height`).toBeGreaterThanOrEqual(STANDING_CAPSULE_M);
      // The mirror swaps which authored pier ends up at the lower world x, so
      // the gap is measured between the two bodies rather than assumed from
      // the authored names (HF-473).
      const gap = Math.max(pierHigh.min.x - pierLow.max.x, pierLow.min.x - pierHigh.max.x);
      expect(gap, `flank ${flank} opening clear width`)
        .toBeGreaterThanOrEqual(2 * STANDING_RADIUS_M);
    }
    expect(t.deckY, 'step from the road onto the cargo deck, against the autostep')
      .toBeLessThanOrEqual(CHARACTER_PHYSICS_CONFIG.autostepHeight);

    // The coach is CLOSED: one solid body, no floor and no roof mesh to stand
    // between, and a standing eye at its centre IS blocked.
    expect(meshNames.some((name) => name.includes('coach body'))).toBe(true);
    expect(meshNames.some((name) => name.includes('coach floor'))).toBe(false);
    expect(meshNames.some((name) => name.includes('coach deck'))).toBe(false);
    expect(isBlocked({ x: hx(NUKETOWN2_STREET_COACH.x), y: 1.7, z: NUKETOWN2_STREET_COACH.z }, map.colliders, PLAYER_RADIUS),
      'the coach must be solid, not a room').toBe(true);
    const coach = map.physicalCover.find((cover) => cover.id === 'nuketown2-street-coach');
    expect(coach, 'exactly one coach').toBeDefined();
    expect(map.physicalCover.filter((cover) => cover.id.includes('coach'))).toHaveLength(1);

    // Coach size and placement, schematic §3: 0.253 L long, and offset from the
    // truck's cargo box by 0.178 L along the street and 0.150 L across it.
    //
    // HF-432 item 5: those two offsets are now EXACT. HF-426 authored 5.0 and
    // 4.0 m and recorded the 0.039 L difference, because with the truck pinned
    // to the world origin the measured pair put the coach's flank over the
    // kerb. With the truck 0.076 L south where the reference has it, that
    // reason is gone.
    expect(Math.abs(NUKETOWN2_STREET_COACH.length - 0.253 * L)).toBeLessThan(TOL);
    expect(NUKETOWN2_STREET_COACH.offsetAlong / L, 'coach offset along the street').toBeCloseTo(0.178, 3);
    expect(NUKETOWN2_STREET_COACH.offsetAcross / L, 'coach offset across the street').toBeCloseTo(0.150, 3);
    // ...and the offsets are what the placement is actually built from, so the
    // two can never describe different things.
    expect(Math.abs(NUKETOWN2_STREET_COACH.x)).toBeCloseTo(NUKETOWN2_STREET_COACH.offsetAlong, 10);
    expect(NUKETOWN2_CENTRAL_TRUCK.z - NUKETOWN2_STREET_COACH.z).toBeCloseTo(NUKETOWN2_STREET_COACH.offsetAcross, 10);
    // Both street bodies stay on the carriageway, on OPPOSITE sides of the
    // road centre-line - which is what the reference draws and what HF-426
    // could not do with the truck sitting on it.
    expect(NUKETOWN2_STREET_COACH.z - NUKETOWN2_STREET_COACH.width / 2)
      .toBeGreaterThan(-NUKETOWN2_SECTION.streetHalfWidth);
    expect(Math.sign(NUKETOWN2_STREET_COACH.z)).toBe(-Math.sign(NUKETOWN2_CENTRAL_TRUCK.z));

    // Every declared vehicle body is real cover in both authorities. A body the
    // player can see and shoot but walk through is the failure this pins.
    for (const cover of map.physicalCover) {
      expect(cover.blocksMovement, cover.id).toBe(true);
      expect(cover.blocksShots, cover.id).toBe(true);
    }
    // The cars are CLOSED: solid, and not declared as enterable cover volumes.
    expect(map.physicalCover.some((cover) => cover.id.includes('car'))).toBe(false);
    expect(meshNames.some((name) => name.includes('car body'))).toBe(true);
  }, 60_000);

  /**
   * PASS 94 INTEGRATION GATE (HF-462 x HF-473), and it exists because the merge
   * of two green lanes produced something neither of them could fail.
   *
   * The vehicle-forge lane branched before the handedness mirror and placed its
   * forged skins at raw AUTHORED coordinates. The collider boxes those skins
   * dress reach the world through `centred`/`streetVehicle`/`pair`, every one of
   * which multiplies x by NUKETOWN2_HANDEDNESS. On the merged head, before this
   * was fixed, all five skins stood on the opposite side of the street from
   * their bodies: five vehicles floating over open road, five invisible boxes
   * facing them, and not one existing gate with anything to say - because a skin
   * is presentation, and every collider, parity and spawn gate looks only at the
   * boxes. This is the falsifier that class of defect did not have.
   */
  it('lands every forged vehicle skin on the collider body it dresses, mirrored with it', () => {
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);
    const planCentre = (object: THREE.Object3D): { x: number; z: number } => {
      const box = new THREE.Box3().setFromObject(object);
      return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
    };
    // Only the OUTERMOST forged group per vehicle: the forge names its own
    // sub-parts with the same prefix (grooves, lamps, wheel sets), and a
    // sub-part is offset from its body by design.
    const skins: THREE.Object3D[] = [];
    map.root.traverse((node) => {
      if (!node.name.startsWith('vehicle-forge ')) return;
      if (node.parent?.name.startsWith('vehicle-forge ') === true) return;
      skins.push(node);
    });
    // Coach, truck cab, truck bogie and three sedans (head car + both driveways).
    expect(skins.length, 'forged street-vehicle skins').toBeGreaterThanOrEqual(6);
    const bodies = map.raycastMeshes
      .filter((mesh) => /(car body|coach body|truck cab)$/u.test(mesh.name))
      .map((mesh) => ({ name: mesh.name, ...planCentre(mesh) }));
    expect(bodies.length, 'solid vehicle bodies to dress').toBeGreaterThanOrEqual(4);
    for (const skin of skins) {
      const centre = planCentre(skin);
      // The bogie dresses the cargo box's axles, which are behind the cab; it is
      // held to the truck's own centre line instead of to a body centre.
      if (skin.name.endsWith('truck-bogie')) {
        const deck = map.raycastMeshes.find((mesh) => mesh.name.endsWith('truck deck'));
        expect(deck, 'the truck deck the bogie runs under').toBeDefined();
        expect(Math.abs(centre.z - planCentre(deck!).z), `${skin.name} is off the truck centre line`)
          .toBeLessThan(0.35);
        continue;
      }
      const nearest = bodies
        .map((body) => ({ body, metres: Math.hypot(body.x - centre.x, body.z - centre.z) }))
        .sort((left, right) => left.metres - right.metres)[0]!;
      expect(
        nearest.metres,
        `${skin.name} at (${centre.x.toFixed(2)}, ${centre.z.toFixed(2)}) dresses no collider body `
          + `(nearest is ${nearest.body.name} at ${nearest.metres.toFixed(2)} m). A skin placed in the `
          + 'AUTHORED frame while its box is placed in the WORLD frame lands exactly one mirror away.',
      ).toBeLessThan(0.35);
    }
    // ...and the mirror is asserted directly as well, so a future handedness
    // flip cannot leave a coincidentally-passing pair behind. The head car is
    // authored at x = 4.5 (HF-432 item 5); its BOX must stand at hx(4.5), and
    // the skin on top of it.
    const headCarBox = map.raycastMeshes.find((mesh) => mesh.name.endsWith('head car body'));
    expect(headCarBox, 'the head car body').toBeDefined();
    expect(planCentre(headCarBox!).x, 'head car body follows the handedness flag').toBeCloseTo(hx(4.5), 6);
    const headCarSkin = skins
      .map((skin) => ({ skin, centre: planCentre(skin) }))
      .filter(({ skin }) => skin.name.endsWith('sedan'))
      .sort((left, right) => Math.abs(left.centre.z) - Math.abs(right.centre.z))[0]!;
    expect(headCarSkin.centre.x, 'the head car skin rides its own box').toBeCloseTo(hx(4.5), 6);
  });


  // -------------------------------------------------------------------------
  // HF-473 - HANDEDNESS. Owner, 2026-09-04, having played the reference on
  // Steam: "the garage is always on the RIGHT of the house from behind it,
  // whereas here both garages are on the LEFT."
  //
  // R4 (docs/research/2026-09-04/R4-bo2-nuketown-accuracy.md section 3) had
  // already shown that the reference and this arena agree about the RELATION -
  // the map is 180-degree rotationally symmetric, so both houses necessarily
  // agree with each other - and that nothing in the arena said WHICH end, so
  // the question could only be settled by looking at the reference. It has
  // been. The correction is a MIRROR, not another rotation: the arena already
  // has a rotation, and applying a second one changes nothing.
  //
  // These two cases are the gate that stops it silently coming back, and they
  // measure BUILT WORLD GEOMETRY rather than the constants that produced it.
  // -------------------------------------------------------------------------

  /** World-space plan centre of the first mesh whose name ends with `suffix`. */
  const worldPlanCentre = (map: ArenaMap, suffix: string): { x: number; z: number } => {
    map.root.updateMatrixWorld(true);
    let found: THREE.Mesh | undefined;
    map.root.traverse((node) => {
      if (found === undefined && node instanceof THREE.Mesh && node.name.endsWith(suffix)) found = node;
    });
    expect(found, `mesh "${suffix}"`).toBeDefined();
    const box = new THREE.Box3().setFromObject(found!);
    return { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
  };

  /**
   * Camera-right in this engine's convention. `src/minimap.ts` states it in
   * two places (`playerFacingGeometry`, `playerRelativeMinimapOffset`): yaw 0
   * looks down -z and its right is +x, i.e. right = forward x up. Written as
   * the cross product rather than as a rotation so it cannot pick up a sign by
   * accident.
   */
  const rightOf = (forward: { x: number; z: number }): { x: number; z: number } => ({
    x: -forward.z,
    z: forward.x,
  });
  /** The yaw a player holds to look along `forward`, per the same convention. */
  const yawFacing = (forward: { x: number; z: number }): number => Math.atan2(-forward.x, -forward.z);

  it('puts each garage on the RIGHT of its own house, seen from that house own back-yard spawn', () => {
    // The falsifier for HF-473, stated as arithmetic: stand on a real spawn,
    // look at your own house, and the garage wing must be on your right. The
    // cross product sign is the whole claim; nothing here reads a literal x.
    const map = buildNuketown2(new THREE.Scene());
    expect(rightOf({ x: 0, z: -1 }), 'yaw 0 looks down -z and its right is +x')
      .toEqual({ x: 1, z: 0 });

    for (const [team, house] of NUKETOWN2_HOUSE_LAYOUT.entries()) {
      const half = team === 0 ? 'north' : 'south';
      const houseCentre = worldPlanCentre(map, `${half} house roof deck`);
      const garageCentre = worldPlanCentre(map, `${half} garage roof`);
      // The two are the built bodies, so this also proves the wing is attached
      // to an END of its house rather than to its middle.
      expect(Math.abs(garageCentre.x - houseCentre.x), `${half} garage is a wing on an end`)
        .toBeGreaterThan(NUKETOWN2_SECTION.houseWidth / 2);
      expect(Math.sign(houseCentre.z), `${half} house is on its own side of the street`)
        .toBe(Math.sign(house.z));

      const spawns = NUKETOWN2_SPAWN_LAYOUT[team]!;
      expect(spawns.length, `${half} spawn count`).toBeGreaterThanOrEqual(6);
      for (const [x, z] of spawns) {
        const forward = { x: houseCentre.x - x, z: houseCentre.z - z };
        // Every spawn really is BEHIND its house: looking at the house from it
        // means looking toward the street.
        expect(Math.sign(forward.z), `spawn (${x}, ${z}) stands behind its house`).toBe(house.facing);
        const right = rightOf(forward);
        const toGarage = { x: garageCentre.x - x, z: garageCentre.z - z };
        const side = toGarage.x * right.x + toGarage.z * right.z;
        expect(side, `garage is on the RIGHT from ${half} spawn (${x}, ${z})`).toBeGreaterThan(0);
      }
    }
  });

  it('agrees with NUKETOWN2_HANDEDNESS on every handed feature, and the minimap agrees with the world', () => {
    const map = buildNuketown2(new THREE.Scene());
    const houseCentre = worldPlanCentre(map, 'north house roof deck');
    const garageCentre = worldPlanCentre(map, 'north garage roof');
    const garageSide = Math.sign(garageCentre.x - houseCentre.x);

    // The flag and the built world are the same statement. Authored, the wing
    // hangs off the +x end of the north house, so the world side IS the flag.
    expect(garageSide, 'the built garage side is NUKETOWN2_HANDEDNESS').toBe(NUKETOWN2_HANDEDNESS);

    // THE HALF-MIRROR GATE. Every other handed body has to be on the side the
    // garage is on, or on the opposite side, and which of the two is fixed by
    // what the feature IS - not by a number anyone can edit independently.
    const onGarageSide = [
      'north garage bench',            // the wing own workbench
      'north verge mailbox',           // the letterbox at the end of THAT drive
      'north verge drive edge',        // the kerb edging of the drive
      'north car body',                // the car parked on the apron
    ];
    for (const suffix of onGarageSide) {
      const centre = worldPlanCentre(map, suffix);
      expect(Math.sign(centre.x - houseCentre.x), `${suffix} is on the garage side`).toBe(garageSide);
    }
    // ...and the stair, which stands against the BLIND wall precisely because
    // the garage is on the other one (see NUKETOWN2_HOUSE_STAIR).
    const stairCentre = worldPlanCentre(map, 'north house stair landing');
    expect(Math.sign(stairCentre.x - houseCentre.x), 'the flight is on the blind wall')
      .toBe(-garageSide);
    // The driveway apron decal is authored in the same table the lawn field
    // reads, so it is checked from that table rather than from a mesh name.
    const drive = WORLD_GROUND_DRESSING.find((piece) => piece.id === 'street driveway')!;
    expect(Math.sign((drive.x0 + drive.x1) / 2 - houseCentre.x), 'the driveway apron follows the garage')
      .toBe(garageSide);

    // THE MINIMAP. Atomic Acres shipped a back-to-front minimap once (owner,
    // HF-473: "the top-right minimap was back-to-front months ago"), so a
    // handedness fix in the world that the map contradicts is half a fix.
    //
    // `worldToMinimap` alone is a LEFT-handed pixel space (+x right AND +z up,
    // which is a view from BELOW). Both consumers correct it - the player-up
    // HUD with playerUpScaleX() = -1, the static Tri-Pass board with
    // width - x - and this asserts both corrections, on the same three world
    // points the case above used.
    expect(playerUpScaleX(), 'the player-up map reflects the raw pixel space').toBe(-1);
    const bounds = map.bounds;
    const W = 220;
    const H = 220;
    const spawn = NUKETOWN2_SPAWN_LAYOUT[0]![0]!;
    const forward = { x: houseCentre.x - spawn[0], z: houseCentre.z - spawn[1] };
    const [playerX, playerY] = worldToMinimap(spawn[0], spawn[1], bounds, W, H);
    const view = {
      width: W,
      height: H,
      playerX,
      playerY,
      rotation: playerUpRotationRadians(yawFacing(forward)),
      scaleX: playerUpScaleX(),
    };
    const onScreen = (x: number, z: number): [number, number] => {
      const [px, py] = worldToMinimap(x, z, bounds, W, H);
      return minimapPlayerViewPoint(px, py, view);
    };
    // The house is dead ahead, so it is ABOVE the player on a player-up map...
    const eye = onScreen(spawn[0], spawn[1]);
    const house = onScreen(houseCentre.x, houseCentre.z);
    expect(house[1], 'the house is ahead, so up-screen').toBeLessThan(eye[1]);
    // ...and the garage, which the case above proved is to the RIGHT in the
    // world, must read RIGHT on the map.
    //
    // MEASURED AS A SIGN, NOT AS A HALF-SCREEN, AND THAT IS DELIBERATE. This
    // minimap paints a 36 x 84 m arena into a SQUARE canvas (the HUD CSS says
    // so in as many words), so `worldToMinimap` scales x by 6.1 px/m and z by
    // 2.6 px/m. A non-uniform scale composed with the player-up rotation is
    // not a similarity, so BEARINGS are stretched: the garage sits 12 degrees
    // right of the player's forward in the world and lands a few pixels LEFT
    // of the centre line on the map. What such a scale cannot do is change
    // chirality - its determinant, with the scaleX = -1 reflection, is
    // positive - so the SIGN of the screen-space cross product is exactly the
    // sign of the world-space one, and that equality is the claim HF-473
    // actually makes. The bearing stretch is a real, separate defect and it is
    // reported OPEN rather than asserted here, because asserting it would
    // freeze it in place.
    const garage = onScreen(garageCentre.x, garageCentre.z);
    // Screen y runs DOWN, so `ahead x right` is positive when the second point
    // is to the right of the first.
    const screenCross = (house[0] - eye[0]) * (garage[1] - eye[1])
      - (house[1] - eye[1]) * (garage[0] - eye[0]);
    const toGarage = { x: garageCentre.x - spawn[0], z: garageCentre.z - spawn[1] };
    const worldCross = forward.x * toGarage.z - forward.z * toGarage.x;
    expect(Math.sign(worldCross), 'the garage is RIGHT in the world').toBe(1);
    expect(Math.sign(screenCross), 'the minimap agrees with the world about which side')
      .toBe(Math.sign(worldCross));

    // The static board is a bird eye view, so with +z drawn UP, +x must be
    // drawn LEFT; the pair (+x right, +z up) is only reachable by looking up
    // from underneath, which is exactly the defect the owner remembers.
    const [originX, originY] = worldToTacticalMap(0, 0, bounds, W, H);
    const [eastX] = worldToTacticalMap(10, 0, bounds, W, H);
    const [, northY] = worldToTacticalMap(0, 10, bounds, W, H);
    expect(eastX, 'the tactical board draws +x to the left of the origin').toBeLessThan(originX);
    expect(northY, 'the tactical board draws +z above the origin').toBeLessThan(originY);
  });

  it('builds two two-storey houses facing each other over the road, each with a garage it opens into', () => {
    const map = buildNuketown2(new THREE.Scene());
    expect(map.houseTelemetry.houses).toBe(2);
    expect(map.houseTelemetry.groundRooms).toBe(4);
    expect(map.houseTelemetry.upperRooms).toBe(4);
    expect(map.houseTelemetry.doors).toBe(4);
    expect(map.houseTelemetry.windows).toBe(8);
    expect(map.houseTelemetry.ramps).toBe(2);
    const [north, south] = NUKETOWN2_HOUSE_LAYOUT;
    expect(north!.facing).toBe(1);
    expect(south!.facing).toBe(-1);
    const frontLine = NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth;
    expect(north!.z).toBeLessThan(-frontLine);
    expect(south!.z).toBeGreaterThan(frontLine);
    // The garages are real rooms, one per house, at opposite ends under the
    // rotation, and SET BACK from the street frontage the way the reference
    // draws them rather than opening straight onto the kerb.
    const names = map.root.children.map((node) => node.name);
    expect(names.filter((name) => name.includes('garage floor'))).toHaveLength(2);
    expect(names.some((name) => name.includes('garage door head'))).toBe(true);
    expect(NUKETOWN2_SECTION.garageSetback).toBeGreaterThan(0);

    // THE DOORWAY THAT WAS A WALL. The previous cut cut a link door in the
    // garage's shared leaf and left the house's own east wall solid behind it,
    // so the garage's "route into the house" opened onto siding. Both leaves are
    // cut now, and this probe stands in the doorway itself: house-side, garage
    // side, and the threshold between them.
    for (const x of [3.6, 4.35, 5.1]) {
      expect(isBlocked({ x, y: NUKETOWN2_GROUND_FLOOR_TOP + 1.7, z: -18.7 }, map.colliders, PLAYER_RADIUS), `garage link doorway at x=${x}`).toBe(false);
    }
  });

  it('pins distinct blue and yellow house siding and excludes debug marker cubes', () => {
    const map = buildNuketown2(new THREE.Scene());
    const north = map.root.getObjectByName('nuketown2 north house wall west') as THREE.Mesh | undefined;
    const south = map.root.getObjectByName('nuketown2 south house wall west') as THREE.Mesh | undefined;
    expect(north, 'north house siding mesh').toBeDefined();
    expect(south, 'south house siding mesh').toBeDefined();

    const colourOf = (mesh: THREE.Mesh): THREE.Color => {
      const material = mesh.material as THREE.Material & { color?: THREE.Color };
      if (!material.color) throw new Error(`${mesh.name}: siding material has no base colour`);
      return material.color;
    };
    const northColour = colourOf(north!);
    const southColour = colourOf(south!);
    expect(northColour.getHex(), 'north house keeps the blue base').toBe(0x46809f);
    expect(southColour.getHex(), 'south house keeps the yellow base').toBe(0xf4be36);
    expect(northColour.equals(southColour), 'house siding bases must differ').toBe(false);
    const rgbDistance = Math.hypot(
      northColour.r - southColour.r,
      northColour.g - southColour.g,
      northColour.b - southColour.b,
    );
    expect(rgbDistance, 'house siding colour margin').toBeGreaterThan(0.45);

    const forbidden = new Set<string>();
    map.root.traverse((node) => {
      if (/(?:^|[-_ ])(?:debug|marker)(?:$|[-_ ])/i.test(node.name)) forbidden.add(node.name);
      const material = node instanceof THREE.Mesh
        ? node.material as THREE.Material & { color?: THREE.Color }
        : undefined;
      const hex = material?.color?.getHex();
      if (hex === 0xff00ff) forbidden.add(`${node.name}:magenta`);
      if (hex === 0x9d6bff) forbidden.add(`${node.name}:purple-marker`);
    });
    expect([...forbidden], 'Nuke Town must not ship QA marker cubes').toEqual([]);
  });

  it('raises every interior slab and cuts outdoor ground and lawn from structures and carriageway', () => {
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);
    const overlap = (first: { x0: number; x1: number; z0: number; z1: number },
      second: { x0: number; x1: number; z0: number; z1: number }): number => (
      Math.max(0, Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0))
      * Math.max(0, Math.min(first.z1, second.z1) - Math.max(first.z0, second.z0))
    );
    // HF-473: NUKETOWN2_BUILDING_FOOTPRINTS is an AUTHORED table (the ground
    // builder cuts with it before `centred()` mirrors the tiles), so it is put
    // through the same mirror here before being compared against built,
    // world-frame geometry.
    const footprints = [
      ...WORLD_BUILDING_FOOTPRINTS,
      ...WORLD_BUILDING_FOOTPRINTS.map((footprint) => ({
        x0: -footprint.x1,
        x1: -footprint.x0,
        z0: -footprint.z1,
        z1: -footprint.z0,
      })),
      ...NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
    ];
    const floors = map.root.children.filter((node): node is THREE.Mesh => (
      node instanceof THREE.Mesh && (node.name.endsWith('house floor') || node.name.endsWith('garage floor'))
    ));
    expect(floors, 'two house floors and two garage floors').toHaveLength(4);
    for (const floor of floors) {
      const floorBox = new THREE.Box3().setFromObject(floor);
      expect(floorBox.max.y, `${floor.name} top`).toBeGreaterThanOrEqual(0.05);
      expect(floorBox.max.y, `${floor.name} uses the raised floor datum`)
        .toBeCloseTo(NUKETOWN2_GROUND_FLOOR_TOP, 6);
    }
    const lowerInteriorEdges = map.root.children.filter((node): node is THREE.Mesh => (
      node instanceof THREE.Mesh
      && (node.name.includes('ground partition') || node.name.includes('ground baseboard'))
    ));
    expect(lowerInteriorEdges.length, 'ground partition and skirting are present').toBeGreaterThan(0);
    for (const edge of lowerInteriorEdges) {
      const edgeBox = new THREE.Box3().setFromObject(edge);
      expect(edgeBox.min.y, `${edge.name} has no gap above the floor`).toBeLessThanOrEqual(NUKETOWN2_GROUND_FLOOR_TOP);
      expect(edgeBox.max.y, `${edge.name} reaches the raised floor`).toBeGreaterThanOrEqual(NUKETOWN2_GROUND_FLOOR_TOP);
    }

    const dressingIds = new Set(NUKETOWN2_GROUND_DRESSING.map((piece) => piece.id));
    const outdoorBoxes = map.root.children.filter((node): node is THREE.Mesh => (
      node instanceof THREE.Mesh
      && (node.name.includes('ground tile') || [...dressingIds].some((id) => node.name.includes(id)))
    ));
    expect(outdoorBoxes.length, 'ground tiles and authored dressing remain auditable').toBeGreaterThan(0);
    for (const outdoor of outdoorBoxes) {
      const plan = planFootprint(outdoor);
      for (const footprint of footprints) {
        expect(overlap(plan, footprint), `${outdoor.name} inside ${JSON.stringify(footprint)}`).toBe(0);
      }
    }

    // The instanced field has no BoxGeometry to inspect, so audit its canonical
    // lawn regions directly from the same dressing table the builder consumes.
    for (const region of nuketownRebuildLawnRegions(WORLD_GROUND_DRESSING)) {
      for (const footprint of footprints) {
        expect(overlap({ x0: region.minX, x1: region.maxX, z0: region.minZ, z1: region.maxZ }, footprint),
          `lawn region inside ${JSON.stringify(footprint)}`).toBe(0);
      }
    }
  });

  it('keeps every instanced grass root outside the collider-driven cover keep-outs', () => {
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);
    const lawnMeshes: THREE.InstancedMesh[] = [];
    map.root.traverse((node) => {
      if (node instanceof THREE.InstancedMesh && node.name.startsWith('nuketown2-lawn-region-')) lawnMeshes.push(node);
    });
    expect(lawnMeshes.length, 'Nuke Town lawn regions').toBeGreaterThan(0);

    // Ground tiles are the only builder colliders with the exact [-1.4, 0]
    // floor slab band. The lawn builder receives every collider after that
    // ground prefix, so this reconstructs its actual keep-out input rather
    // than maintaining a second cover table in the test.
    const keepOuts = map.colliders.filter((bounds) => !(
      Math.abs((bounds.minY ?? 0) + 1.4) < 1e-9
      && Math.abs((bounds.maxY ?? 0)) < 1e-9
    ));
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    for (const mesh of lawnMeshes) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        position.setFromMatrixPosition(matrix);
        mesh.localToWorld(position);
        const overlap = keepOuts.find((bounds) => (
          position.x > bounds.minX - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
          && position.x < bounds.maxX + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
          && position.z > bounds.minZ - NUKETOWN_LAWN_KEEPOUT_MARGIN_M
          && position.z < bounds.maxZ + NUKETOWN_LAWN_KEEPOUT_MARGIN_M
        ));
        expect(overlap, `${mesh.name}[${index}] grass root clips a solid`).toBeUndefined();
      }
    }
  });

  it('walks a STANDING player up each stair, onto the landing and into both upper rooms', async () => {
    // HF-432 item 1. The owner after PASS 90: "still some issues with where
    // stairs are". The stair now stands against the WEST (blind) wall of the
    // BACK room and lands at the internal partition - see NUKETOWN2_HOUSE_STAIR
    // for why, including what the two first-party minimaps do and do not draw.
    //
    // This probe is the whole claim: a STANDING capsule, on the real
    // CharacterPhysics against the real built colliders, with gravity and NO
    // JUMP, walks in off the back-room floor, up the flight, onto the landing,
    // through the head of the stair into the FRONT upper room, and back
    // through the internal door into the BACK upper room.
    const map = buildNuketown2(new THREE.Scene());
    const stair = NUKETOWN2_HOUSE_STAIR;
    const cx = stair.x0 + stair.width / 2;
    const rampMeshes = map.root.children.filter((node): node is THREE.Mesh => node.name.includes('house stair ramp'));
    expect(rampMeshes, 'one collision-only ramp per house flight').toHaveLength(2);
    for (const ramp of rampMeshes) {
      expect(ramp.userData.collisionOnly, `${ramp.name} collision-only registration`).toBe(true);
      expect(ramp.visible, `${ramp.name} remains in the parity scene graph`).toBe(true);
      expect((ramp.material as THREE.Material).visible, `${ramp.name} is not rendered`).toBe(false);
    }

    // The authored flight has to be walkable BY THE ENGINE'S OWN NUMBERS, not
    // by eye: the riser inside autostep, the going wider than the autostep
    // minimum width, and the capsule the arena assumes equal to the real one.
    expect(STANDING_CAPSULE_M).toBeCloseTo(1.82, 10);
    expect(STANDING_RADIUS_M).toBeCloseTo(0.38, 10);
    expect(stair.riser).toBeLessThan(CHARACTER_PHYSICS_CONFIG.autostepHeight);
    expect(stair.going).toBeGreaterThan(CHARACTER_PHYSICS_CONFIG.autostepMinimumWidth);
    expect(stair.riser * stair.risers).toBeCloseTo(NUKETOWN2_UPPER_Y0 - NUKETOWN2_GROUND_FLOOR_TOP, 10);

    for (const house of NUKETOWN2_HOUSE_LAYOUT) {
      const s = house.facing;   // north house +1, south house is its exact negation
      // HF-473: `cx` and every offset below are AUTHORED (the flight is
      // against the house's blind wall and climbs inboard); `hx` puts them in
      // the world, and `s` then takes the 180-degree partner, exactly as
      // `pair()` does.
      const at = (x: number, z: number) => [s * hx(x), s * z] as const;
      const upProbe = await walkStandingDetailed(map, [s * hx(cx + 2.6), 1.7, s * -21.0], [
        at(cx + 2.6, -22.2),    // along the back wall, behind the flight
        at(cx, -22.2),          // square on to the bottom tread
        at(cx, -17.0),          // up the flight and onto the landing
        at(cx, -13.0),          // through the head of the stair into the FRONT upper room
        at(INTERNAL_DOOR_CENTRE_X, -13.0),   // across to the internal door
        at(INTERNAL_DOOR_CENTRE_X, -19.5),   // and back into the BACK upper room
      ], STAIR_TRAVERSAL_FRAME_BUDGET);
      const trace = upProbe.trace;
      expect(upProbe.completed, `${house.id} up stair completed within the frame budget`).toBe(true);
      expect(upProbe.frameCount, `${house.id} up stair frame budget`).toBeLessThanOrEqual(STAIR_TRAVERSAL_FRAME_BUDGET);
      expect(upProbe.maxConsecutiveUngroundedFrames, `${house.id} up stair ground contact`).toBeLessThanOrEqual(1);
      expect(upProbe.slopeAdjustedFrames, `${house.id} up stair used the smooth ramp`).toBeGreaterThan(0);
      const label = (index: number) => `${house.id} waypoint ${index} at ${JSON.stringify(trace[index])}`;
      // Still on the ground floor for the approach.
      expect(trace[1]!.y, label(1)).toBeLessThan(2.0);
      // On the landing: feet on the 3.3 m slab, so the eye is 1.70 m above it.
      expect(trace[2]!.y, label(2)).toBeGreaterThan(NUKETOWN2_UPPER_Y0 + 1.6);
      // In the FRONT upper room - past the partition, on the street side.
      expect(trace[3]!.y, label(3)).toBeGreaterThan(NUKETOWN2_UPPER_Y0 + 1.6);
      expect(Math.sign(trace[3]!.z - house.z), label(3)).toBe(house.facing);
      // ...and back through the internal door into the BACK upper room.
      expect(trace[5]!.y, label(5)).toBeGreaterThan(NUKETOWN2_UPPER_Y0 + 1.6);
      expect(Math.sign(trace[5]!.z - house.z), label(5)).toBe(-house.facing);
      expect(Math.hypot(trace[5]!.x - s * hx(INTERNAL_DOOR_CENTRE_X), trace[5]!.z - s * -19.5), label(5))
        .toBeLessThan(0.8);

      // HF-435: ...and DOWN again. The owner: "being able to walk up and down
      // stairs". The up-route above proves the climb; this one starts in the
      // FRONT upper room, takes the landing, and descends the whole flight
      // walking (no jump), ending on the back-room ground floor.
      const downProbe = await walkStandingDetailed(map, [s * hx(cx), NUKETOWN2_UPPER_Y0 + 1.7, s * -13.5], [
        at(cx, -14.8),          // out of the front upper room toward the landing
        at(cx, -17.0),          // onto the landing, turned down the flight
        at(cx, -21.5),          // down the smooth flight
        at(cx + 2.4, -22.3),    // off the bottom tread into the BACK room
      ], STAIR_TRAVERSAL_FRAME_BUDGET);
      const down = downProbe.trace;
      expect(downProbe.completed, `${house.id} down stair completed within the frame budget`).toBe(true);
      expect(downProbe.frameCount, `${house.id} down stair frame budget`).toBeLessThanOrEqual(STAIR_TRAVERSAL_FRAME_BUDGET);
      expect(downProbe.maxConsecutiveUngroundedFrames, `${house.id} down stair ground contact`).toBeLessThanOrEqual(1);
      expect(downProbe.slopeAdjustedFrames, `${house.id} down stair used the smooth ramp`).toBeGreaterThan(0);
      if (process.env.NUKETOWN2_STAIR_PROBE_REPORT === '1') {
        console.log(`STAIR-PROBE ${house.id} up=${JSON.stringify({ frames: upProbe.frameCount, maxUngrounded: upProbe.maxConsecutiveUngroundedFrames, slopeAdjusted: upProbe.slopeAdjustedFrames, waypoints: upProbe.waypointFrames })} down=${JSON.stringify({ frames: downProbe.frameCount, maxUngrounded: downProbe.maxConsecutiveUngroundedFrames, slopeAdjusted: downProbe.slopeAdjustedFrames, waypoints: downProbe.waypointFrames })}`);
      }
      const downLabel = (index: number) => `${house.id} down waypoint ${index} at ${JSON.stringify(down[index])}`;
      // REVIEW TIGHTENING (Opus, PASS 92). The original pair of assertions only
      // said "ended up low", which a capsule that fell through a hole in the
      // upper floor at waypoint 0 also satisfies. Waypoints 0 and 1 are now
      // asserted at STANDING UPPER-FLOOR height, so the probe proves the walker
      // crossed the upper storey and reached the landing on its feet before it
      // descended, and the descent is asserted MONOTONE so a single drop
      // cannot be read as a flight.
      expect(down[0]!.y, downLabel(0)).toBeGreaterThan(NUKETOWN2_UPPER_Y0 + 1.6);
      expect(down[1]!.y, downLabel(1)).toBeGreaterThan(NUKETOWN2_UPPER_Y0 + 1.6);
      // Waypoint 2 stands on the bottom treads (feet 0.3-0.6 m), well below
      // the landing; waypoint 3 is the back-room ground floor itself.
      expect(down[2]!.y, downLabel(2)).toBeLessThan(4.0);
      expect(down[3]!.y, downLabel(3)).toBeLessThan(2.0);
      expect(down[1]!.y, `${downLabel(1)} above ${downLabel(2)}`).toBeGreaterThan(down[2]!.y);
      expect(down[2]!.y, `${downLabel(2)} above ${downLabel(3)}`).toBeGreaterThan(down[3]!.y);
    }

    // HF-435: the derived numbers, not the vibes - tread rise inside the
    // autostep (asserted above), headroom over EVERY tread at least the
    // standing capsule, and a landing at least a capsule diameter deep, all
    // computed from the same NUKETOWN2_STAIRWELL numbers the build used.
    const well = NUKETOWN2_STAIRWELL;
    expect(well.rampBottomY, 'ramp bottom meets the raised floor').toBe(NUKETOWN2_GROUND_FLOOR_TOP);
    expect(well.rampTopY, 'ramp top meets the upper landing').toBe(NUKETOWN2_UPPER_Y0);
    expect(well.landingOverlap, 'ramp bottom/top landing overlap').toBeGreaterThan(0);
    expect(well.rampAngleRadians, 'ramp stays below the controller slope ceiling')
      .toBeLessThan(CHARACTER_PHYSICS_CONFIG.maximumSlopeClimbDegrees * Math.PI / 180);
    const deckUnderside = NUKETOWN2_WINDOWS.find((entry) => entry.id === 'upper front')!.headY;
    for (let i = 0; i < NUKETOWN2_HOUSE_STAIR.risers - 1; i += 1) {
      const top = NUKETOWN2_GROUND_FLOOR_TOP + NUKETOWN2_HOUSE_STAIR.riser * (i + 1);
      const centreZ = well.footZ + NUKETOWN2_HOUSE_STAIR.going * (i + 0.5);
      const ceiling = centreZ < well.wellZ0 ? NUKETOWN2_GROUND_STOREY_H : deckUnderside;
      // REVIEW TIGHTENING (Opus, PASS 92). The rule this arena DERIVED is
      // `feet + capsule + autostep <= ceiling` (see STAIR_MAX_FEET_UNDER_CEILING
      // in nuketown2-arena.ts): Rapier casts the capsule UP by autostepHeight
      // BEFORE it casts forward, so a ceiling that merely clears the capsule
      // still wedges the walker on a tread nosing - the exact failure the
      // arena header records the probe catching. Asserting only the capsule
      // let a future 2.0 m ceiling over a tread pass a gate the geometry
      // cannot actually satisfy.
      expect(ceiling - top, `tread ${i} headroom (capsule + autostep up-cast)`)
        .toBeGreaterThanOrEqual(STANDING_CAPSULE_M + CHARACTER_PHYSICS_CONFIG.autostepHeight);
    }
    expect(NUKETOWN2_HOUSE_STAIR.landingDepth, 'landing depth vs capsule diameter')
      .toBeGreaterThanOrEqual(2 * STANDING_RADIUS_M);
  }, 120_000);

  it('puts glass in the ground windows and makes both upstairs windows exits', async () => {
    // HF-435, owner after PASS 91: "go out of windows and putting glass on the
    // windows."
    //
    // GROUND floor: the pane is a real dynamic collider (a shoulder does not
    // cross an intact pane) and a real glass ballistic surface (a bullet pays
    // the glass entry cost and crosses). UPSTAIRS: no collider across the opening, sill at or below
    // 1.1 m over the floor, and a standing capsule that hops the sill crosses
    // the wall plane and DROPS outside - probed on the real physics.
    const map = buildNuketown2(new THREE.Scene());
    const names = map.root.children.map((node) => node.name);
    const glassColliders = deriveGlassDynamicColliders(map.breakableWindows);
    expect(map.breakableWindows, 'ground and upper panes register with glass authority').toHaveLength(8);
    expect(glassColliders, 'all intact ground and upper panes derive movement colliders').toHaveLength(8);

    for (const [index, win] of NUKETOWN2_WINDOWS.entries()) {
      const width = win.x1 - win.x0;
      expect(width, `${win.id} opening width`).toBeGreaterThanOrEqual(1.0);
      const worldSpan = worldWindowSpan(win);
      const wx = (worldSpan[0] + worldSpan[1]) / 2;
      if (win.pane) {
        // The pane: present, a dynamic movement collider spanning sill to head,
        // and glass for gunfire - in BOTH houses (the partner is the exact
        // 180-degree image). The pane is deliberately absent from static
        // colliders so the shared breakable-window lifecycle can open it.
        const paneName = `house front window glass ${index}`;
        expect(names.filter((name) => name.endsWith(paneName)), paneName).toHaveLength(2);
        expect(map.breakableWindows.filter((pane) => pane.id.includes(`nuketown2-ground-window-${index}`)),
          `${win.id} panes register with glass authority`).toHaveLength(2);
        const collider = glassColliders.find((entry) => (
          entry.id.includes(`nuketown2-ground-window-${index}`)
          && Math.abs(entry.bounds.maxX - entry.bounds.minX - width) < 0.01
          && Math.abs((entry.bounds.minY ?? 0) - win.sillTop) < 0.01
          && Math.abs((entry.bounds.maxY ?? 0) - win.headY) < 0.01
        ))?.bounds;
        expect(collider, `${win.id} dynamic pane movement collider`).toBeDefined();
        expect(map.colliders.some((bounds) => (
          Math.abs((bounds.maxX - bounds.minX) - width) < 0.01
          && Math.abs((bounds.minY ?? 0) - win.sillTop) < 0.01
          && Math.abs((bounds.maxY ?? 0) - win.headY) < 0.01
        )), `${win.id} pane must not return as a static invisible wall`).toBe(false);
        const surface = map.shotSurfaces.find((entry) => entry.id.includes(paneName));
        expect(surface, `${win.id} pane ballistic surface`).toBeDefined();
        expect(surface!.material, `${win.id} pane ballistic class`).toBe('glass');
        // NOT walk-through, in both houses.
        for (const sign of [1, -1] as const) {
          expect(isBlocked({ x: sign * wx, y: 1.7, z: sign * win.wallZ }, [...map.colliders, ...glassColliders.map((entry) => entry.bounds)], PLAYER_RADIUS),
            `${win.id} pane blocks a standing capsule`).toBe(true);
        }
      } else {
        // Upstairs: the lower drop-out remains an opening, while the authored
        // upper sash is a breakable glass surface. Its dynamic collider is
        // intentionally separate from static map colliders, so the existing
        // drop-out route remains available after the pane breaks.
        expect(win.sillTop - NUKETOWN2_UPPER_Y0, `${win.id} sill height over the floor`)
          .toBeLessThanOrEqual(1.1);
        const windowKey = win.id === 'upper front' ? 'upper-front' : 'upper-back';
        expect(map.breakableWindows.filter((pane) => pane.id.includes(`nuketown2-${windowKey}-window`)),
          `${win.id} panes register with glass authority`).toHaveLength(2);
        expect(glassColliders.filter((entry) => entry.id.includes(`nuketown2-${windowKey}-window`)),
          `${win.id} intact panes derive movement colliders`).toHaveLength(2);
        const surface = map.shotSurfaces.find((entry) => entry.id.includes(`house ${windowKey.replace('-', ' ')} window glass`));
        expect(surface, `${win.id} pane ballistic surface`).toBeDefined();
        expect(surface!.material, `${win.id} pane ballistic class`).toBe('glass');
        // No STATIC collider returns across the drop-out opening. The active
        // dynamic glass collider is consumed only by the shared live authority.
        expect(isBlocked({ x: wx, y: win.sillTop + 1.7, z: win.wallZ }, map.colliders, PLAYER_RADIUS),
          `${win.id} opening is clear`).toBe(false);
      }
    }

    // THE EXIT PROBE. Both houses, both upstairs windows: hop the sill,
    // cross the wall plane, drop, and land standing OUTSIDE on the ground.
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      const dt = 1 / 120;
      for (const house of NUKETOWN2_HOUSE_LAYOUT) {
        const s = house.facing;   // north +1, south is its exact negation
        for (const win of NUKETOWN2_WINDOWS.filter((entry) => !entry.pane)) {
          const span = worldWindowSpan(win);
          const wx = s * (span[0] + span[1]) / 2;
          const wallZ = s * win.wallZ;
          // OUTWARD is the direction off the wall away from the room: +s for
          // the front wall (toward the road), -s for the back wall (into the
          // yard). The probe starts 2.5 m INSIDE, crosses the plane over the
          // sill, and drops 2.6 m outside.
          const outward = win.id === 'upper front' ? s : -s;
          const start = { x: wx, y: NUKETOWN2_UPPER_Y0 + 1.7, z: wallZ - outward * 2.5 };
          const route = [
            { x: wx, z: wallZ },                    // the wall plane, over the sill
            { x: wx, z: wallZ + outward * 2.6 },    // out into the open air
          ];
          physics.teleportEye(start);
          let vy = 0;
          for (const waypoint of route) {
            for (let step = 0; step < 900; step += 1) {
              const eye = physics.eyePosition();
              const dx = waypoint.x - eye.x;
              const dz = waypoint.z - eye.z;
              const distance = Math.hypot(dx, dz);
              if (distance < 0.15) break;
              const advance = Math.min(distance, 4.2 * dt);
              vy += -24.5 * dt;
              const result = physics.move({
                x: distance > 1e-4 ? (dx / distance) * advance : 0,
                y: vy * dt,
                z: distance > 1e-4 ? (dz / distance) * advance : 0,
              }, dt);
              if (result.grounded) vy = 6.35;
              else if (result.blockedY && vy > 0) vy = 0;
            }
          }
          for (let step = 0; step < 400; step += 1) {
            vy += -24.5 * dt;
            if (physics.move({ x: 0, y: vy * dt, z: 0 }, dt).grounded) break;
          }
          const end = physics.eyePosition();
          const label = `${house.id} ${win.id} exit ended at ${JSON.stringify(end)}`;
          // A window drop is nearly straight down under its own eave: the
          // capsule must be GROUNDED (eye 1.7 m, i.e. fell the 4.2 m from the
          // sill - impossible anywhere inside the house, whose floor is at
          // 3.3) and at least a foot outside the wall plane.
          expect((end.z - wallZ) * outward, `${label} - clear of the wall`).toBeGreaterThan(0.2);
          expect(end.y, `${label} - landed outside`).toBeLessThan(1.9);
        }
      }
    } finally {
      physics.dispose();
    }
  }, 120_000);

  it('gives every door a standing player walks through: 2.4 m of head, 1.8 m of shoulder', async () => {
    // HF-432 item 4. The owner after PASS 90: "Doors are too small shouldn't
    // have to crouch."
    //
    // The owner's words and the measurement do not agree, and the measurement
    // wins: NO door on this map ever required a crouch - the tightest was
    // 2.20 m of head against a 1.82 m capsule. The fault was WIDTH. A 1.38 m
    // opening leaves 0.62 m of free width for a 0.76 m capsule, which catches
    // a shoulder on every entry at a run. The before table is in
    // NUKETOWN2_DOORWAYS; the sweep that proves the crouch half is the test
    // below this one.
    const map = buildNuketown2(new THREE.Scene());

    // HF-465: every probe below measures from the doorway's OWN floor. The
    // rear-balcony door is the first opening on this map that is not on the
    // ground floor, and measured from 0 it would have reported the
    // ground-floor back door's lintel instead of its own head.
    /** Lowest solid overhead at (x, z); 0 if anything stands at floor level. */
    const clearHeight = (x: number, z: number, floorY: number): number => {
      let lowest = Number.POSITIVE_INFINITY;
      for (const bounds of map.colliders) {
        const minY = bounds.minY ?? 0;
        const maxY = bounds.maxY ?? minY + 3;
        if (x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ) continue;
        if (maxY <= floorY + 0.25) continue;        // floor slabs, kerbs, ground decals
        if (minY < floorY + 0.25) return 0;         // a solid, not an opening
        if (minY < lowest) lowest = minY;
      }
      return lowest - floorY;
    };
    /** Free width of the opening at chest height, along its own span axis. */
    const clearWidth = (x: number, z: number, span: 'x' | 'z', floorY: number): number => {
      const chest = floorY + 1.0;
      const solid = (px: number, pz: number) => map.colliders.some((bounds) => {
        const minY = bounds.minY ?? 0;
        const maxY = bounds.maxY ?? minY + 3;
        return px > bounds.minX && px < bounds.maxX && pz > bounds.minZ && pz < bounds.maxZ
          && minY < chest && maxY > chest;
      });
      let low = 0;
      let high = 0;
      for (let d = 0; d < 4; d += 0.01) { if (solid(span === 'x' ? x - d : x, span === 'x' ? z : z - d)) break; low = d; }
      for (let d = 0; d < 4; d += 0.01) { if (solid(span === 'x' ? x + d : x, span === 'x' ? z : z + d)) break; high = d; }
      return low + high;
    };

    // THE HEAD BAND, DERIVED: the standing capsule, plus the autostep up-cast
    // the controller performs BEFORE it moves forward (so a player stepping
    // onto a porch, a kerb or a tread inside a doorway still clears - the same
    // failure STAIRWELL_Z0 records), plus 0.16 m.
    const HEAD_FLOOR = STANDING_CAPSULE_M + CHARACTER_PHYSICS_CONFIG.autostepHeight + 0.16;
    expect(HEAD_FLOOR).toBeCloseTo(2.4, 10);
    // ...and it clears the lane's own stated floor of 2.1 m.
    expect(HEAD_FLOOR).toBeGreaterThanOrEqual(2.1);

    for (const door of NUKETOWN2_DOORWAYS) {
      for (const sign of [1, -1] as const) {          // the door AND its 180-degree partner
        // HF-473: whichever of `centre`/`at` is the x quantity is AUTHORED.
        const x = sign * hx(door.span === 'x' ? door.centre : door.at);
        const z = sign * (door.span === 'x' ? door.at : door.centre);
        const label = `${door.id}${sign === 1 ? '' : ' (partner)'}`;
        expect(clearHeight(x, z, door.floorY), `${label} head`).toBeCloseTo(door.headY, 6);
        expect(clearHeight(x, z, door.floorY), `${label} head`).toBeGreaterThanOrEqual(HEAD_FLOOR);
        expect(clearWidth(x, z, door.span, door.floorY), `${label} width`).toBeGreaterThanOrEqual(door.width - 0.03);
        // Two capsule widths plus a body of slack: a door two players use.
        expect(door.width, `${label} authored width`).toBeGreaterThanOrEqual(4 * STANDING_RADIUS_M + 0.2);
      }
      // ...and a STANDING capsule actually WALKS through it, on the real
      // physics, with gravity and no jump. A door that measures right and
      // catches on the frame is exactly the defect being fixed.
      const through: [number, number] = door.span === 'x' ? [0, 1] : [1, 0];
      const centreX = hx(door.span === 'x' ? door.centre : door.at);
      const centreZ = door.span === 'x' ? door.at : door.centre;
      const near: [number, number] = [centreX - through[0] * 1.6, centreZ - through[1] * 1.6];
      const far: [number, number] = [centreX + through[0] * 1.6, centreZ + through[1] * 1.6];
      const trace = await walkStanding(map, [near[0], door.floorY + 1.7, near[1]], [far]);
      expect(
        Math.hypot(trace[0]!.x - far[0], trace[0]!.z - far[1]),
        `${door.id} walk-through ended at ${JSON.stringify(trace[0])}`,
      ).toBeLessThan(0.45);
    }
  }, 120_000);

  it('needs a crouch nowhere on the ground except under the two letterbox lids', () => {
    // The other half of "shouldn't have to crouch", swept rather than argued.
    // Every ground cell at 0.25 m is tested with the STANDING capsule height
    // and with the CROUCHED one AT THE SAME RADIUS, so only genuine height
    // blockages count and the 0.02 m radius difference between the two stances
    // cannot manufacture findings. A cell the crouch fits and the stand does
    // not is a place this map makes a player duck.
    const map = buildNuketown2(new THREE.Scene());
    const blocked = (x: number, z: number, floorY: number, height: number): boolean => {
      const y0 = floorY + 0.06;
      const y1 = floorY + height;
      for (const bounds of map.colliders) {
        const minY = bounds.minY ?? 0;
        const maxY = bounds.maxY ?? minY + 3;
        if (maxY <= y0 || minY >= y1) continue;
        const dx = Math.max(bounds.minX - x, 0, x - bounds.maxX);
        const dz = Math.max(bounds.minZ - z, 0, z - bounds.maxZ);
        if (dx * dx + dz * dz < STANDING_RADIUS_M * STANDING_RADIUS_M) return true;
      }
      return false;
    };
    const floorAt = (x: number, z: number): number => {
      let top = 0;
      for (const bounds of map.colliders) {
        const maxY = bounds.maxY ?? (bounds.minY ?? 0) + 3;
        if (maxY > 0.5 || x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ) continue;
        if (maxY > top) top = maxY;
      }
      return top;
    };
    // The two letterboxes: a 0.32 x 0.50 m lid on a 0.16 m post, authored in
    // `verge()` at (GARAGE_X1 + 0.6, KERB_Z - 1.2) and its rotational partner.
    // They are the ONE thing on this map you may duck under.
    const letterbox: [number, number] = [9.85, -7.1];
    const offenders: Array<[number, number]> = [];
    for (let x = NUKETOWN2_BOUNDS.minX + 0.5; x <= NUKETOWN2_BOUNDS.maxX - 0.5; x += 0.25) {
      for (let z = NUKETOWN2_BOUNDS.minZ + 0.5; z <= NUKETOWN2_BOUNDS.maxZ - 0.5; z += 0.25) {
        const floorY = floorAt(x, z);
        if (floorY > 0.45) continue;                                   // ground routes only
        if (blocked(x, z, floorY, CROUCH_CAPSULE_M)) continue;         // the crouch cannot pass either
        if (!blocked(x, z, floorY, STANDING_CAPSULE_M)) continue;      // standing passes: fine
        offenders.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
      }
    }
    for (const [x, z] of offenders) {
      const nearest = Math.min(
        Math.hypot(x - letterbox[0], z - letterbox[1]),
        Math.hypot(x + letterbox[0], z + letterbox[1]),
      );
      expect(nearest, `crouch-only ground cell at (${x}, ${z})`).toBeLessThan(1.0);
    }
    // ...and the two lids account for a handful of cells, never a route.
    expect(offenders.length, `crouch-only ground cells: ${JSON.stringify(offenders)}`).toBeLessThanOrEqual(24);
  }, 120_000);

  it('keeps the power position real: the upper front window is an opening, and the rare gun lives there', () => {
    const map = buildNuketown2(new THREE.Scene());
    // Activision's own Nuketown 2025 guide calls the front-facing windows of
    // both homes the biggest power positions on the map, and they only are that
    // if they are holes rather than paintings. Stand at each upper window seat
    // and look across the road: the seat must be unobstructed at eye height.
    // `isBlocked` models the point as an EYE with 1.65 m of body hanging below
    // it, so an upper-floor seat is probed at slab + 1.66 = 4.96 m.
    for (const house of NUKETOWN2_HOUSE_LAYOUT) {
      const seat = { x: house.x, y: UPPER_FLOOR_EYE_Y, z: house.z + house.facing * 3.9 };
      expect(isBlocked(seat, map.colliders, PLAYER_RADIUS), `${house.id} upper window seat`).toBe(false);
    }
    // The rare-gun sites are DERIVED from the house layout, never hand-written:
    // the shipped map's equivalent list outlived a layout move and put the
    // weapon outside the map (src/railgun-authority.ts header). This arena has
    // just moved every house, so that is not a hypothetical.
    expect(NUKETOWN2_RARE_GUN_SITES).toHaveLength(2);
    for (const [index, site] of NUKETOWN2_RARE_GUN_SITES.entries()) {
      const house = NUKETOWN2_HOUSE_LAYOUT[index]!;
      // The site is a WORLD export (railgun-authority reads it directly);
      // NUKETOWN2_HOUSE_LAYOUT is AUTHORED. HF-473.
      expect(site.position[0]).toBeCloseTo(hx(house.x), 10);
      // In the FRONT upper room, toward the street: the house mid-line is where
      // the internal partition stands.
      expect(Math.sign(site.position[2] - house.z)).toBe(house.facing);
      expect(Math.abs(site.position[2] - house.z)).toBeLessThan(NUKETOWN2_SECTION.houseDepth / 2);
      // Above the upper floor slab and inside the building, not on the roof.
      expect(site.position[1]).toBeGreaterThan(3.3);
      expect(site.position[1]).toBeLessThan(6.2);
      // A player can actually stand where the weapon is.
      expect(isBlocked({ x: site.position[0], y: UPPER_FLOOR_EYE_Y, z: site.position[2] }, map.colliders, PLAYER_RADIUS),
        `${site.id} must stand in open floor`).toBe(false);
      // And every site is inside the map. The band is the fenced rectangle less
      // the player radius; the failure it guards is the one in the header above.
      expect(site.position[0]).toBeGreaterThan(NUKETOWN2_BOUNDS.minX + PLAYER_RADIUS);
      expect(site.position[0]).toBeLessThan(NUKETOWN2_BOUNDS.maxX - PLAYER_RADIUS);
      expect(site.position[2]).toBeGreaterThan(NUKETOWN2_BOUNDS.minZ + PLAYER_RADIUS);
      expect(site.position[2]).toBeLessThan(NUKETOWN2_BOUNDS.maxZ - PLAYER_RADIUS);
    }
  });

  it('spawns both teams in their own back yard, on solid ground, out of each other sight', () => {
    const map = buildNuketown2(new THREE.Scene());
    for (const team of [0, 1] as const) {
      for (const spawn of map.spawns[team]) {
        const label = `t${team} (${spawn.x}, ${spawn.z})`;
        expect(spawn.x, label).toBeGreaterThan(NUKETOWN2_BOUNDS.minX + PLAYER_RADIUS);
        expect(spawn.x, label).toBeLessThan(NUKETOWN2_BOUNDS.maxX - PLAYER_RADIUS);
        expect(spawn.z, label).toBeGreaterThan(NUKETOWN2_BOUNDS.minZ + PLAYER_RADIUS);
        expect(spawn.z, label).toBeLessThan(NUKETOWN2_BOUNDS.maxZ - PLAYER_RADIUS);
        // ONE probe, at standing eye height, and that is not a shortcut.
        // `isBlocked` treats the point as an eye with 1.65 m of body below it,
        // so y = 1.7 sweeps the whole standing capsule from 0.05 m up - knees,
        // waist and head in one call. Probing at 0.6 or 1.2 as the shipped
        // map's test does would sweep from BELOW the floor, and this arena
        // (unlike the shipped one) carries a real solid ground slab, so those
        // heights report every point on the map as blocked.
        expect(isBlocked({ x: spawn.x, y: 1.7, z: spawn.z }, map.colliders, PLAYER_RADIUS), label).toBe(false);
      }
    }
    // Teams own the two SIDES of the road, behind their own house. The house
    // back walls sit at |z| = 23, so every spawn being past them is "behind your
    // own house" measured rather than asserted.
    const backWall = NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth + NUKETOWN2_SECTION.houseDepth;
    expect(NUKETOWN2_SPAWN_LAYOUT[0]!.every(([, z]) => z < -backWall)).toBe(true);
    expect(NUKETOWN2_SPAWN_LAYOUT[1]!.every(([, z]) => z > backWall)).toBe(true);
    // ...and inside the FENCED yard, not out on the border path, which is the
    // flank route rather than a spawn room.
    const fence = backWall + NUKETOWN2_SECTION.yardDepth;
    expect(NUKETOWN2_SPAWN_LAYOUT[0]!.every(([, z]) => z > -fence)).toBe(true);
    // Team 1's table is the exact 180-degree negation of team 0's, in order.
    for (const [index, [x, z]] of NUKETOWN2_SPAWN_LAYOUT[0]!.entries()) {
      const [px, pz] = NUKETOWN2_SPAWN_LAYOUT[1]![index]!;
      expect(px).toBeCloseTo(-x, 10);
      expect(pz).toBeCloseTo(-z, 10);
    }
    // DERIVED CEILING on spawn-to-centre distance. A back-yard spawn is by
    // definition between the house back wall (|z| = 23) and the yard fence
    // (|z| = 36), inside |x| <= 18, so the furthest one that can exist is the
    // far corner of the yard: hypot(18, 36) = 40.25 m. Anything past that is
    // not in a back yard any more, and this band says so in metres rather than
    // trusting the |z| bands above to notice.
    const furthestLegalYardCorner = Math.hypot(width / 2, fence);
    for (const team of [0, 1] as const) {
      for (const [x, z] of NUKETOWN2_SPAWN_LAYOUT[team]!) {
        expect(Math.hypot(x, z), `spawn (${x}, ${z}) to centre`).toBeLessThan(furthestLegalYardCorner);
        expect(Math.hypot(x, z), `spawn (${x}, ${z}) to centre`).toBeGreaterThan(backWall);
      }
    }

    // ---- HF-432 item 3: the two properties the shipped spawn gate has not --
    // Its bands are FLOORS, not targets: `minimumVisibleEnemySpawnDistanceM`
    // is 30 m, so a 62.3 m clear line between two spawns - which is what this
    // arena shipped in PASS 90 - passes it, and nothing at all caps how far a
    // spawn can see. The owner's "spawns ... needs refinement" is exactly
    // those two holes.
    //
    // (a) NO SPAWN SEES A SPAWN. Not "no spawn sees a near one": none at all.
    for (const team of [0, 1] as const) {
      for (const [x, z] of NUKETOWN2_SPAWN_LAYOUT[team]!) {
        for (const [ex, ez] of NUKETOWN2_SPAWN_LAYOUT[1 - team]!) {
          expect(clearLine(map, [x, z], [ex, ez], 1.65), `spawn (${x}, ${z}) sees enemy spawn (${ex}, ${ez})`).toBe(false);
        }
      }
    }
    // (b) A CEILING ON SPAWN EXPOSURE, derived rather than measured. The
    // street's own length L is the longest thing on this map anyone is meant
    // to shoot down, so no spawn may hold a clear standing line longer than
    // it. The floor is half of that: a spawn you cannot see half a street from
    // is a cupboard, not a spawn. Evidence: 31.6 m worst and 22.4 m best,
    // against 71.0 m worst before this pass.
    const perimeterSamples: Array<[number, number]> = [];
    for (let x = NUKETOWN2_BOUNDS.minX + 1; x <= NUKETOWN2_BOUNDS.maxX - 1; x += 2) {
      perimeterSamples.push([x, NUKETOWN2_BOUNDS.minZ + 1], [x, NUKETOWN2_BOUNDS.maxZ - 1]);
    }
    for (let z = NUKETOWN2_BOUNDS.minZ + 1; z <= NUKETOWN2_BOUNDS.maxZ - 1; z += 2) {
      perimeterSamples.push([NUKETOWN2_BOUNDS.minX + 1, z], [NUKETOWN2_BOUNDS.maxX - 1, z]);
    }
    for (const team of [0, 1] as const) {
      for (const [x, z] of NUKETOWN2_SPAWN_LAYOUT[team]!) {
        let longest = 0;
        for (const sample of perimeterSamples) {
          const metres = Math.hypot(sample[0] - x, sample[1] - z);
          if (metres > longest && clearLine(map, [x, z], sample, 1.65)) longest = metres;
        }
        expect(longest, `spawn (${x}, ${z}) exposure`).toBeLessThanOrEqual(L);
        expect(longest, `spawn (${x}, ${z}) exposure`).toBeGreaterThanOrEqual(0.5 * L);
      }
    }
  });

  it('carries the owner two kept features that live outside the arena file', () => {
    // "still keeping things like the 2x damage, the rare gun spawn, the sheds".
    // The sheds are a registry row, so the arena alone cannot prove them.
    const sheds = shedPlacementsForArena('nuketown2');
    expect(sheds).toHaveLength(2);
    // One per back yard, on opposite sides, and a rotational pair.
    expect(Math.sign(sheds[0]!.position.z)).toBe(-Math.sign(sheds[1]!.position.z));
    expect(sheds[1]!.position.x).toBeCloseTo(-sheds[0]!.position.x, 10);
    expect(sheds[1]!.position.z).toBeCloseTo(-sheds[0]!.position.z, 10);
    // And they are in the yards this arena actually has now. The previous
    // placements were at x = +/-24 on a map that is now 36 m wide: they would
    // have stood outside the fence, which is the exact class of failure
    // src/railgun-authority.ts' header records against the shipped map.
    const backWall = NUKETOWN2_SECTION.streetHalfWidth + NUKETOWN2_SECTION.frontVergeDepth + NUKETOWN2_SECTION.houseDepth;
    for (const shed of sheds) {
      expect(Math.abs(shed.position.x)).toBeLessThan(width / 2 - 2.5);
      expect(Math.abs(shed.position.z)).toBeGreaterThan(backWall);
      expect(Math.abs(shed.position.z)).toBeLessThan(backWall + NUKETOWN2_SECTION.yardDepth);
    }
  });

  it('gives both teams the same map: every solid has a 180-degree partner except the enumerated street vehicles', () => {
    const map = buildNuketown2(new THREE.Scene());
    // THE EXCEPTION IS ENUMERATED, NOT FILTERED, and the difference matters.
    // The previous cut added `.filter((mesh) => !mesh.name.startsWith('truck'))`
    // to this test - a name filter, which silently excuses any future body that
    // happens to be called truck-something and which had removed the test's own
    // stated "NO lane-identity escape hatch" property. Here the asymmetric set
    // is compared for EXACT EQUALITY against a written-out list, so adding an
    // asymmetric body, moving one, or deleting one all fail until the list is
    // updated deliberately.
    //
    // Why there is an exception at all: the lane brief says "180-degree symmetry
    // only where the reference is symmetric (it is not exactly - record where
    // not)". The reference's houses, garages, driveways, yards, fences and
    // sheds ARE an exact rotational pair. Its street vehicles are not: there is
    // one coach and one moving truck, they are different objects, and no
    // rotation maps one onto the other.
    const EXPECTED_ASYMMETRIC = [
      'nuketown2 street-vehicle coach body',
      'nuketown2 street-vehicle coach roof cap',
      'nuketown2 street-vehicle coach wheel 0',
      'nuketown2 street-vehicle coach wheel 1',
      // HF-426 JOB 3, 2026-09-03 - DELIBERATE ADDITION, with the reason.
      // The one-flank `coach window band` became four flank decals: a red
      // WAIST STRIPE and a glazing BAND on each side. Why the list grows: the
      // coach is now cream (the reference's cream/red streamlined body,
      // schematic 5.2) and is the only saturated body left on the map now the
      // truck is a plain box van, so it has to read as a coach from BOTH
      // halves - a cream box banded down one side only reads as a crate to
      // whichever team cannot see that side. All four are presentation decals
      // (solid: false, shots: false, cast: false) on the coach's own solid
      // body, so no cover, collider or ballistic surface moved; the exception's
      // plan-area cap and the per-half cover floors below both still measure
      // the same solids they did before.
      'nuketown2 street-vehicle coach waist stripe 0',
      'nuketown2 street-vehicle coach waist stripe 1',
      'nuketown2 street-vehicle coach window band 0',
      'nuketown2 street-vehicle coach window band 1',
      'nuketown2 street-vehicle head car body',
      'nuketown2 street-vehicle head car cabin',
      'nuketown2 street-vehicle head car wheel 00',
      'nuketown2 street-vehicle head car wheel 01',
      'nuketown2 street-vehicle head car wheel 10',
      'nuketown2 street-vehicle head car wheel 11',
      // HF-432 ITEM 5 - DELIBERATE ADDITION, with the reason. The truck moved
      // 0.076 L SOUTH of the road centre-line, where the reference has it, so
      // the four parts that used to be their own 180-degree partners across
      // z = 0 (the two cargo-box flanks, the box roof and the deck) no longer
      // are. Nothing was added to the arena and nothing changed name: the same
      // bodies stopped being self-symmetric because the body they belong to is
      // no longer on the axis. The exception's plan-area cap and both per-half
      // cover floors below are measured on this larger set and still hold -
      // 127.0 m2 of 181.4, and the four halves at 73.1 / 53.9 / 64.5 / 62.5 m2
      // against a 20 m2 floor, which is BETTER balanced than the 89.3 m2 the
      // centred truck produced.
      'nuketown2 street-vehicle truck box bulkhead',
      // HF-436 - DELIBERATE ADDITION, with the reason. Each cargo-box flank
      // became two full-height piers and a header, cutting a 1.6 x 1.9 m
      // walk-through opening so the box is enterable from the left side, the
      // right side AND the rear end (the owner's "more similar to the actual
      // Nuketown map"). Six named bodies replace the two sealed flanks; the
      // deck, roof, bulkhead, cab and roof-climb treads are untouched, and so
      // is the 2x core seat above the roof. The two new headers top out at the
      // roof plane - a same-material construction contact the coplanar
      // instrument classes benign (identical fragments cannot visibly fight).
      'nuketown2 street-vehicle truck box flank 0 header',
      'nuketown2 street-vehicle truck box flank 0 pier 0',
      'nuketown2 street-vehicle truck box flank 0 pier 1',
      'nuketown2 street-vehicle truck box flank 1 header',
      'nuketown2 street-vehicle truck box flank 1 pier 0',
      'nuketown2 street-vehicle truck box flank 1 pier 1',
      'nuketown2 street-vehicle truck box roof',
      'nuketown2 street-vehicle truck cab',
      'nuketown2 street-vehicle truck deck',
      'nuketown2 street-vehicle truck roof step 0',
      'nuketown2 street-vehicle truck roof step 1',
      'nuketown2 street-vehicle truck roof step 2',
      'nuketown2 street-vehicle truck wheel 0',
      'nuketown2 street-vehicle truck wheel 1',
      'nuketown2 street-vehicle truck wheel 2',
    ];

    const solids = solidMeshes(map);
    expect(solids.length).toBeGreaterThan(120);
    const size = (mesh: THREE.Mesh) => {
      const p = (mesh.geometry as THREE.BoxGeometry).parameters as { width: number; height: number; depth: number };
      return `${p.width}x${p.height}x${p.depth}`;
    };
    const at = (x: number, y: number, z: number) => (
      `${(x === 0 ? 0 : x).toFixed(3)}|${y.toFixed(3)}|${(z === 0 ? 0 : z).toFixed(3)}`
    );
    const present = new Set(solids.map((mesh) => `${size(mesh)}|${at(mesh.position.x, mesh.position.y, mesh.position.z)}`));
    const asymmetric = solids
      .filter((mesh) => !present.has(`${size(mesh)}|${at(-mesh.position.x, mesh.position.y, -mesh.position.z)}`));
    expect(asymmetric.map((mesh) => mesh.name).sort()).toEqual([...EXPECTED_ASYMMETRIC].sort());
    // Every one of them is a street vehicle by NAME as well as by list, so the
    // list cannot be grown with a wall by renaming it.
    for (const mesh of asymmetric) {
      expect(mesh.name.startsWith('nuketown2 street-vehicle '), mesh.name).toBe(true);
    }

    // AND THE EXCEPTION IS PAID FOR. Two properties the old exact-symmetry test
    // got for free and a name filter would have thrown away:
    //
    // (a) The exception cannot GROW into structure. Total plan area of every
    //     asymmetric body is capped at 6 % of the playspace - 181 m² on 3,024.
    //     Measured 89.3 m², 2.95 %. One house footprint alone is 143 m², so no
    //     building can ever join this list without failing here.
    let asymArea = 0;
    const half = { xNeg: 0, xPos: 0, zNeg: 0, zPos: 0 };
    for (const mesh of asymmetric) {
      const f = planFootprint(mesh);
      asymArea += (f.x1 - f.x0) * (f.z1 - f.z0);
      half.xNeg += Math.max(0, Math.min(f.x1, 0) - f.x0) * (f.z1 - f.z0);
      half.xPos += Math.max(0, f.x1 - Math.max(f.x0, 0)) * (f.z1 - f.z0);
      half.zNeg += Math.max(0, Math.min(f.z1, 0) - f.z0) * (f.x1 - f.x0);
      half.zPos += Math.max(0, f.z1 - Math.max(f.z0, 0)) * (f.x1 - f.x0);
    }
    expect(asymArea).toBeLessThan(0.06 * width * depth);

    // (b) Neither team's HALF may be bare. The teams are separated across z, so
    //     the z halves are the ones that decide who owns the turning head: each
    //     must carry at least 20 m² of street-vehicle plan area, which is one
    //     substantial body (the coach alone is 23.7 m², the head car plus the
    //     truck's own south-side treads and half its box make the other half).
    //     This is the assertion the coach's counterweight exists to satisfy -
    //     see `coach()` - and it fails if the head car is deleted.
    expect(half.zNeg, 'north half street-vehicle cover').toBeGreaterThan(20);
    expect(half.zPos, 'south half street-vehicle cover').toBeGreaterThan(20);
    expect(half.xNeg, 'west half street-vehicle cover').toBeGreaterThan(20);
    expect(half.xPos, 'east half street-vehicle cover').toBeGreaterThan(20);
  });

  it('leaves no floating solid geometry over the playable yards', () => {
    const map = buildNuketown2(new THREE.Scene());
    // A body whose underside is above 0.4 m is either a named structural
    // element (a roof, a floor slab, a lintel, a stair tread) or a named part
    // of a vehicle body sitting on its wheels. Anything else floating over a
    // yard is an orphan slab the player can neither see the support of nor
    // reach, which is the class this test exists to catch.
    const structural = /roof|floor|upper|stair|lintel|head|sill|rail|cant|deck|end|wheel|sign|window|door|porch|butt|pier|partition|mailbox|bulkhead|cap|cabin/i;
    const vehicle = /bus|coach|truck|car/i;
    const floating = map.colliders.filter((bounds) => (
      (bounds.minY ?? 0) > 0.4
      && bounds.minX > NUKETOWN2_BOUNDS.minX && bounds.maxX < NUKETOWN2_BOUNDS.maxX
      && bounds.minZ > NUKETOWN2_BOUNDS.minZ && bounds.maxZ < NUKETOWN2_BOUNDS.maxZ
    ));
    for (const bounds of floating) {
      const owner = map.root.children.find((node) => (
        Math.abs(node.position.x - (bounds.minX + bounds.maxX) / 2) < 1e-6
        && Math.abs(node.position.z - (bounds.minZ + bounds.maxZ) / 2) < 1e-6
        && Math.abs(node.position.y - ((bounds.minY ?? 0) + (bounds.maxY ?? 0)) / 2) < 1e-6
      ));
      expect(owner, `floating collider at ${JSON.stringify(bounds)}`).toBeDefined();
      const explained = structural.test(owner!.name) || vehicle.test(owner!.name);
      expect(explained, `floating collider ${owner!.name}`).toBe(true);
    }
  });

  it('keeps every standing eye-line inside the derived ceiling, and still has a lane', () => {
    const map = buildNuketown2(new THREE.Scene());
    const longest = longestClearEyeLine(map, 1.65);
    const label = `clear lane ${JSON.stringify(longest.from)} -> ${JSON.stringify(longest.to)}`;
    expect(longest.metres, label).toBeLessThanOrEqual(MAX_STANDING_EYE_LINE_METRES);
    expect(longest.metres, label).toBeGreaterThanOrEqual(MIN_STANDING_EYE_LINE_METRES);
    // And stated as the ratio it was derived as, so the ceiling scales with the
    // map instead of becoming a stale absolute.
    expect(longest.metres / Math.hypot(width, depth)).toBeLessThanOrEqual(0.55);
  });

  it('gives the 2x-damage core to the truck roof and to nobody else', () => {
    // THE OWNER'S FIRST KEPT FEATURE, measured against the REAL rule rather than
    // against the geometry the rule is supposed to imply. An early cut asserted
    // only "roofY is fixed and the body is centred" and shipped a core that could
    // be taken from INSIDE the vehicle - which is exactly the case
    // src/overdrive.ts' v6 height-window tightening exists to prevent.
    const EYE = 1.7; // movementProfile(standing).eyeHeight
    const t = NUKETOWN2_CENTRAL_TRUCK;
    // HF-432 item 5: the core's seat is the ARENA's now, and it is DERIVED
    // from the truck rather than transcribed - so a truck that moves again
    // cannot leave the core behind, which is the failure
    // src/railgun-authority.ts' header records against the shipped map.
    const SEAT = overdrivePositionForArena('nuketown2');
    expect(SEAT.x).toBeCloseTo(0, 10);
    expect(SEAT.z).toBeCloseTo(t.z, 10);
    expect(SEAT.y).toBeCloseTo(t.roofY + t.coreHeightOverRoof, 10);
    // THE SHIPPED MAP'S SEAT IS UNTOUCHED, byte for byte, which is the
    // condition the orchestrator attached to this weapons change.
    expect(OVERDRIVE_POSITION).toEqual({ x: 0, y: 3.75, z: 0 });
    expect(overdrivePositionForArena('atomic-acres')).toBe(OVERDRIVE_POSITION);
    expect(overdrivePositionForArena('some-arena-with-no-core')).toBe(OVERDRIVE_POSITION);

    const claimFrom = (feetY: number, x: number, z: number): boolean => (
      claimOverdrive(createOverdriveState(0, SEAT), 'probe', { x, y: feetY + EYE, z }, true, 10_000_000).claimed
    );
    // Standing on the cargo-box roof, at the core: CLAIMED. dy 1.10.
    expect(claimFrom(t.roofY, 0, t.z), 'box roof').toBe(true);
    // Standing on the deck directly beneath it: REJECTED. dy 2.00.
    expect(claimFrom(t.deckY, 0, t.z), 'cargo box interior').toBe(false);
    // Standing on the road beside the truck: REJECTED. dy 2.05.
    expect(claimFrom(0, 1.2, t.z + 3.0), 'road').toBe(false);
    // Standing on the CAB roof: REJECTED by radius. The cab roof is a real
    // walkable surface on the climb route, and it is 0.25 m below the box roof,
    // so height alone would admit it.
    expect(claimFrom(t.cabRoofY, hx(t.cabX), t.z), 'cab roof').toBe(false);
    // Standing on any roof-access tread: REJECTED - not by height (the top tread
    // is well inside the height window) but by RADIUS, because every tread
    // footprint is more than 1.65 m from the core in plan. Climbing half way
    // must not be a way to take the core out of a covered position.
    const treadZ = t.z - (t.width / 2 + 2.45) / 2;
    for (const [top, x0, x1] of [[0.80, 7.0, 8.2], [1.75, 5.8, 7.0], [2.60, 4.6, 5.8]] as const) {
      for (const x of [hx(x0), hx(x1), hx((x0 + x1) / 2)]) {
        for (const z of [treadZ - 0.55, treadZ, treadZ + 0.55]) {
          expect(claimFrom(top, x, z), `tread top ${top} at (${x}, ${z})`).toBe(false);
        }
      }
    }
  });

  it('lets a player actually climb onto the truck roof', async () => {
    // The other half of the same defect: a core on a roof nobody can reach is
    // not a feature. Simulated on the REAL CharacterPhysics against the REAL
    // built colliders - jump apex from flat ground is 6.35^2 / (2 x 24.5) =
    // 0.82 m and autostep is 0.42 m, so a 3.25 m roof with nothing beside it is
    // unreachable.
    const map = buildNuketown2(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
    try {
      const dt = 1 / 120;
      // Approach the treads from the road, climb them, step onto the cab roof,
      // then onto the cargo-box roof and walk to the core.
      const t = NUKETOWN2_CENTRAL_TRUCK;
      // The treads are on the truck's NORTH flank - the middle of the road -
      // so the climb is contested rather than handed to whichever team the
      // truck's 0.076 L offset put it nearer.
      const treadZ = t.z - (t.width / 2 + 2.45) / 2;
      // Authored x, mirrored (HF-473) - the treads themselves are emitted
      // through `pair()` and moved with the map.
      const route: Array<[number, number]> = [
        [hx(7.6), treadZ], [hx(6.4), treadZ], [hx(5.2), treadZ], [hx(t.cabX), t.z], [hx(0), t.z],
      ];
      physics.teleportEye({ x: hx(9.6), y: 1.9, z: treadZ });
      let vy = 0;
      for (const waypoint of route) {
        for (let step = 0; step < 420; step += 1) {
          const eye = physics.eyePosition();
          const dx = waypoint[0] - eye.x;
          const dz = waypoint[1] - eye.z;
          const distance = Math.hypot(dx, dz);
          const advance = Math.min(distance, 4.2 * dt);
          vy += -24.5 * dt;
          const result = physics.move({
            x: distance > 1e-4 ? (dx / distance) * advance : 0,
            y: vy * dt,
            z: distance > 1e-4 ? (dz / distance) * advance : 0,
          }, dt);
          if (result.grounded) vy = 6.35;
          else if (result.blockedY && vy > 0) vy = 0;
        }
      }
      const end = physics.eyePosition();
      // Standing (or mid-hop) on the roof over the core, not on the road.
      expect(Math.hypot(end.x, end.z - NUKETOWN2_CENTRAL_TRUCK.z), 'reached the core in plan').toBeLessThan(1.2);
      expect(end.y, 'eye height on the truck roof').toBeGreaterThan(NUKETOWN2_CENTRAL_TRUCK.roofY + 1.5);
    } finally {
      physics.dispose();
    }
  }, 60_000);


  // -------------------------------------------------------------------------
  // HF-465 - THE REAR BALCONY, ITS EXTERIOR FLIGHT AND THE FRONT CLIMB CHAIN.
  // R4 section 5: the reference's house has a rear balcony with a staircase
  // down to the back lawn (the second of its three routes upstairs), a ledge
  // under the second-storey window, and a front window that is an ENTRY. Ours
  // had none of the three; grep for balcony or ledge returned nothing.
  // -------------------------------------------------------------------------

  it('gives every house a SECOND way upstairs: yard, exterior flight, balcony, door', async () => {
    // The claim, walked rather than measured: a STANDING capsule on the real
    // CharacterPhysics, gravity on and NO JUMP, starts on the back lawn at the
    // foot of the exterior flight, climbs it, crosses the deck and walks in
    // through the balcony door into the upper back room. The interior stair
    // probe above is route one; this is route two.
    const map = buildNuketown2(new THREE.Scene());
    const bal = NUKETOWN2_BALCONY;
    const flight = NUKETOWN2_YARD_STAIR;

    // The flight is walkable BY THE ENGINE'S OWN NUMBERS before it is walked,
    // exactly as the interior stair is.
    expect(flight.riser).toBeLessThan(CHARACTER_PHYSICS_CONFIG.autostepHeight);
    expect(flight.going).toBeGreaterThan(CHARACTER_PHYSICS_CONFIG.autostepMinimumWidth);
    expect(flight.riser * flight.risers, 'the flight spans exactly the upper floor')
      .toBeCloseTo(NUKETOWN2_UPPER_Y0, 10);
    expect(flight.width, 'the flight is wider than a standing capsule')
      .toBeGreaterThan(2 * STANDING_RADIUS_M);
    expect(flight.rampAngleRadians, 'the flight stays below the controller slope ceiling')
      .toBeLessThan(CHARACTER_PHYSICS_CONFIG.maximumSlopeClimbDegrees * Math.PI / 180);
    // Nothing is over it, so STAIR_MAX_FEET_UNDER_CEILING - the rule the
    // interior flight had to be re-derived against - cannot bite here.
    for (let i = 0; i < flight.risers; i += 1) {
      const x = hx(flight.topX - flight.going * (i + 0.5));
      const feet = bal.deckTop - flight.riser * (i + 1);
      const ceiling = map.colliders.reduce((lowest, bounds) => {
        const minY = bounds.minY ?? 0;
        if (x <= bounds.minX || x >= bounds.maxX) return lowest;
        if (flight.centreZ <= bounds.minZ || flight.centreZ >= bounds.maxZ) return lowest;
        if (minY < feet + 0.05) return lowest;
        return Math.min(lowest, minY);
      }, Number.POSITIVE_INFINITY);
      expect(ceiling - feet, `exterior tread ${i} headroom`)
        .toBeGreaterThanOrEqual(STANDING_CAPSULE_M + CHARACTER_PHYSICS_CONFIG.autostepHeight);
    }

    const ramps = map.root.children.filter((node): node is THREE.Mesh => node.name.includes('yard stair ramp'));
    expect(ramps, 'one collision-only ramp per exterior flight').toHaveLength(2);
    for (const ramp of ramps) {
      expect(ramp.userData.collisionOnly, `${ramp.name} collision-only registration`).toBe(true);
      expect((ramp.material as THREE.Material).visible, `${ramp.name} is not rendered`).toBe(false);
    }

    // The back wall's own z, read from the doorway table rather than re-typed.
    const backWallZ = NUKETOWN2_DOORWAYS.find((door) => door.id === 'house balcony door')!.at;
    for (const house of NUKETOWN2_HOUSE_LAYOUT) {
      const s = house.facing;
      const at = (x: number, z: number) => [s * hx(x), s * z] as const;
      const probe = await walkStandingDetailed(map,
        [s * hx(flight.footX - 1.4), 1.7, s * flight.centreZ], [
          at(flight.footX, flight.centreZ),          // onto the bottom of the flight
          at(flight.topX + 0.5, flight.centreZ),     // up it and onto the deck
          at(bal.centreX, backWallZ - 0.85),         // across the deck, square on to the door
          at(bal.centreX, backWallZ + 1.6),          // through it, into the upper back room
        ], STAIR_TRAVERSAL_FRAME_BUDGET);
      expect(probe.completed, `${house.id} exterior flight completed within the frame budget`).toBe(true);
      expect(probe.maxConsecutiveUngroundedFrames, `${house.id} exterior flight ground contact`)
        .toBeLessThanOrEqual(1);
      expect(probe.slopeAdjustedFrames, `${house.id} exterior flight used the smooth ramp`)
        .toBeGreaterThan(0);
      const onDeck = probe.trace[1]!;
      expect(onDeck.y, `${house.id} reached the deck`).toBeGreaterThan(bal.deckTop + 1.6);
      const inside = probe.trace[3]!;
      expect(inside.y, `${house.id} stood in the upper back room`).toBeGreaterThan(NUKETOWN2_UPPER_Y0 + 1.6);
      // ...and it really is the BACK upper room, on the yard side of the
      // house's own mid-line.
      expect(Math.sign(inside.z - house.z), `${house.id} ended in the BACK upper room`).toBe(-house.facing);
    }
  }, 180_000);

  it('makes the balcony cover you shoot over and a drop that costs something', () => {
    // R4 section 5.1 and 5.4. The rail is a COVER CLASS decision and the vault
    // off it is a GAMEPLAY CONTRACT, so both are asserted against the arena's
    // own numbers and the shipped fall-damage curve rather than restated.
    const bal = NUKETOWN2_BALCONY;
    // Above the map's waist-high cover class, so it breaks a crouched line...
    expect(bal.railHeight, 'the rail is at least waist-high cover').toBeGreaterThan(0.95);
    // ...and under the standing eye `isBlocked` itself models (1.65 m of body
    // beneath the eye), so a standing player shoots across it.
    expect(bal.railHeight, 'a standing player shoots over the rail').toBeLessThan(1.65);
    // The soffit clears a standing player walking under the deck - the back
    // door's own approach runs beneath it.
    expect(bal.deckTop - bal.slabThickness, 'deck soffit over the back-door approach')
      .toBeGreaterThan(STANDING_CAPSULE_M + CHARACTER_PHYSICS_CONFIG.autostepHeight);
    // A deck you can turn on and pass someone on, not a Juliet balcony.
    expect(bal.projection, 'deck depth against the standing capsule')
      .toBeGreaterThan(2 * (2 * STANDING_RADIUS_M));

    // DROP-OUT SEMANTICS. The free-fall height that costs nothing is
    // v^2 / 2g from the shipped safe speed and the shipped gravity; the vault
    // is higher than that, so it costs - and the cost comes from
    // `computeFallDamage`, called, not restated.
    const g = Math.abs(CHARACTER_PHYSICS_CONFIG.gravity);
    const freeHeight = (FALL_DAMAGE_SAFE_SPEED * FALL_DAMAGE_SAFE_SPEED) / (2 * g);
    expect(freeHeight, 'the no-damage fall height, derived').toBeCloseTo(2.05, 2);
    expect(bal.deckTop, 'the rail vault is a real drop').toBeGreaterThan(freeHeight);
    const vaultDamage = computeFallDamage(Math.sqrt(2 * g * bal.deckTop));
    expect(vaultDamage, 'vaulting the rail costs something').toBeGreaterThan(0);
    expect(vaultDamage, 'vaulting the rail is a fast exit, not a punishment').toBeLessThan(10);
    // The exterior flight is the FREE route off the same deck.
    expect(computeFallDamage(0), 'walking the flight down is free').toBe(0);
  });

  it('makes the front window a two-way opening: every climb in the chain is inside one move', () => {
    // R4 section 5.3. The ledge exists so the upper front window - the
    // position Activision's own guide calls the map's biggest - is contestable
    // from outside instead of being a sniper's box.
    //
    // TWO THINGS ARE ASSERTED, and R4's table only states the first: each step
    // is inside what a player takes in ONE move, AND each step stands directly
    // over the one below it in plan. A chain of correct heights that do not
    // overlap is a jump puzzle, not a route.
    const map = buildNuketown2(new THREE.Scene());
    map.root.updateMatrixWorld(true);
    const worldBox = (suffix: string): THREE.Box3 => {
      let found: THREE.Mesh | undefined;
      map.root.traverse((node) => {
        if (found === undefined && node instanceof THREE.Mesh && node.name.endsWith(suffix)) found = node;
      });
      expect(found, `body "${suffix}"`).toBeDefined();
      return new THREE.Box3().setFromObject(found!);
    };

    const jump = movementProfile({ crouched: false, prone: false, ads: false, sprinting: false, grounded: true }).jumpVelocity;
    const g = Math.abs(CHARACTER_PHYSICS_CONFIG.gravity);
    const oneMove = (jump * jump) / (2 * g) + CHARACTER_PHYSICS_CONFIG.autostepHeight;
    expect(oneMove, 'apex plus autostep, derived from the shipped profile').toBeGreaterThan(1.2);

    const hedge = worldBox('north verge front hedge');
    // The chain climbs a WING; the bay over the doorway is deliberately higher
    // (see the porch canopy comment in nuketown2-arena.ts).
    const canopy = worldBox('north porch canopy wing 0');
    const canopyHead = worldBox('north porch canopy head');
    const ledge = worldBox('north window ledge sill');
    const sillTop = NUKETOWN2_WINDOWS.find((win) => win.id === 'upper front')!.sillTop;

    const rungs: Array<{ id: string; top: number; box: THREE.Box3 | null }> = [
      { id: 'ground', top: 0, box: null },
      { id: 'verge front hedge', top: hedge.max.y, box: hedge },
      { id: 'porch canopy', top: canopy.max.y, box: canopy },
      { id: 'window ledge sill', top: ledge.max.y, box: ledge },
      { id: 'upper front window sill', top: sillTop, box: null },
    ];
    for (let i = 1; i < rungs.length; i += 1) {
      const step = rungs[i]!.top - rungs[i - 1]!.top;
      expect(step, `${rungs[i - 1]!.id} -> ${rungs[i]!.id} rise`).toBeGreaterThan(0);
      expect(step, `${rungs[i - 1]!.id} -> ${rungs[i]!.id} is inside one move`)
        .toBeLessThanOrEqual(oneMove);
    }
    // ...and the plan overlap that makes it a route rather than a leap.
    const overlaps = (a: THREE.Box3, b: THREE.Box3): boolean => (
      Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.2
      && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 0.2
    );
    expect(overlaps(hedge, canopy), 'the canopy overhangs the hedge').toBe(true);
    expect(overlaps(canopy, ledge), 'the ledge stands over the canopy').toBe(true);
    // The ledge is under the window it serves, and against the same wall.
    const upperWindow = NUKETOWN2_WINDOWS.find((win) => win.id === 'upper front')!;
    const [wx0, wx1] = nuketown2HandedSpan(upperWindow.x0, upperWindow.x1);
    expect(ledge.min.x, 'the ledge runs past the window jamb').toBeLessThanOrEqual(wx0);
    expect(ledge.max.x, 'the ledge runs past the far window jamb').toBeGreaterThanOrEqual(wx1);
    expect(ledge.max.y, 'the ledge sits under the sill, not across the opening')
      .toBeLessThanOrEqual(upperWindow.sillTop);

    // THE CANOPY IS NOT A CEILING OVER THE FRONT DOOR'S APPROACH. It projects
    // over the porch, so a standing player walking out has to clear it with
    // the autostep up-cast the controller performs before it moves.
    const frontDoor = NUKETOWN2_DOORWAYS.find((door) => door.id === 'house front door')!;
    const doorCentreX = hx(frontDoor.centre);
    expect(doorCentreX, 'the head bay covers the doorway').toBeGreaterThan(canopyHead.min.x);
    expect(doorCentreX, 'the head bay covers the doorway').toBeLessThan(canopyHead.max.x);
    expect(canopyHead.min.y, 'the canopy soffit over the front door approach')
      .toBeGreaterThanOrEqual(STANDING_CAPSULE_M + CHARACTER_PHYSICS_CONFIG.autostepHeight);
    // ...and no wing overhangs that approach at the lower height.
    for (const wing of [worldBox('north porch canopy wing 0'), worldBox('north porch canopy wing 1')]) {
      expect(doorCentreX > wing.min.x && doorCentreX < wing.max.x,
        'a 2.15 m wing must not cross the front door approach').toBe(false);
    }
  });

  it('keeps the ground dressing out of the buildings', () => {
    // The gate NOTHING else can be: asphalt, aprons and lawns are
    // presentation-only decals, so no collider or collider/visual parity gate
    // ever looks at them. An early cut ran the front lawn from x = -4 and laid
    // 38.4 m2 of green lawn inside each house's front room, 20 mm proud of the
    // interior floor, with every gate in the repository green.
    const overlap = (a: { x0: number; x1: number; z0: number; z1: number },
      b: { x0: number; x1: number; z0: number; z1: number }): number => (
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0))
      * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0))
    );
    for (const piece of NUKETOWN2_GROUND_DRESSING) {
      // Both the authored piece and the 180-degree partner `pair()` writes.
      const placements = [
        { x0: piece.x0, x1: piece.x1, z0: piece.z0, z1: piece.z1 },
        { x0: -piece.x1, x1: -piece.x0, z0: -piece.z1, z1: -piece.z0 },
      ];
      for (const building of NUKETOWN2_BUILDING_FOOTPRINTS) {
        const footprints = [
          { x0: building.x0, x1: building.x1, z0: building.z0, z1: building.z1 },
          { x0: -building.x1, x1: -building.x0, z0: -building.z1, z1: -building.z0 },
        ];
        for (const placement of placements) {
          for (const footprint of footprints) {
            expect(overlap(placement, footprint), `${piece.id} inside ${building.id}`).toBe(0);
          }
        }
      }
    }
  });

  it('cannot be escaped: sprinting hard at every boundary stays inside the fence', async () => {
    const map = buildNuketown2(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      const runs: Array<{ from: [number, number]; direction: [number, number] }> = [
        { from: [0, -30], direction: [0, -1] },
        { from: [0, 30], direction: [0, 1] },
        { from: [-14, 0], direction: [-1, 0] },
        { from: [14, 0], direction: [1, 0] },
        { from: [-15, -28], direction: [-1, -1] },
        { from: [15, 28], direction: [1, 1] },
        { from: [15, -28], direction: [1, -1] },
        { from: [-15, 28], direction: [-1, 1] },
      ];
      for (const run of runs) {
        physics.teleportEye({ x: run.from[0], y: 1.7, z: run.from[1] });
        const length = Math.hypot(run.direction[0], run.direction[1]);
        for (let step = 0; step < 900; step += 1) {
          physics.move({
            x: (run.direction[0] / length) * 0.08,
            y: -0.004,
            z: (run.direction[1] / length) * 0.08,
          }, 1 / 120);
        }
        const end = physics.eyePosition();
        const label = `from ${run.from} toward ${run.direction}`;
        expect(end.x, label).toBeGreaterThanOrEqual(NUKETOWN2_BOUNDS.minX - 0.5);
        expect(end.x, label).toBeLessThanOrEqual(NUKETOWN2_BOUNDS.maxX + 0.5);
        expect(end.z, label).toBeGreaterThanOrEqual(NUKETOWN2_BOUNDS.minZ - 0.5);
        expect(end.z, label).toBeLessThanOrEqual(NUKETOWN2_BOUNDS.maxZ + 0.5);
        expect(end.y, label).toBeGreaterThan(0);
      }
    } finally {
      physics.dispose();
    }
  }, 60_000);
  it('dresses the street vehicles with lofted skins WITHOUT moving any authority', () => {
    // HF-462 / HF-472. `forgedStreetVehicles` adds a presentation-only group
    // per vehicle and hides the authored boxes those skins cover. Everything
    // that decides where a player can walk and what a bullet hits is still the
    // boxes: this asserts it, rather than trusting the diff.
    const scene = new THREE.Scene();
    const map = buildNuketown2(scene);
    const audit = map.root.userData.nuketown2ForgeAudit as {
      retired: number; mismatches: readonly string[]; drawCalls: number; triangles: number;
    };
    // A rename, a new lamp or a deleted wheel changes a match count, and the
    // arena would silently draw a box INSIDE a lofted body. The audit records
    // it; this is the gate that reads the record.
    expect(audit.mismatches, 'superseded-box pattern drift').toEqual([]);
    expect(audit.retired).toBe(110);
    expect(audit.drawCalls).toBeGreaterThan(0);

    const superseded: THREE.Mesh[] = [];
    map.root.traverse((node) => {
      if (node instanceof THREE.Mesh && node.userData.supersededByVehicleForge === true) superseded.push(node);
    });
    expect(superseded.length).toBe(audit.retired);
    for (const mesh of superseded) {
      // Hidden, and withdrawn from the batcher - a hidden batch CANDIDATE is
      // still merged into a visible batch and goes on drawing.
      expect(mesh.visible, mesh.name).toBe(false);
      expect(mesh.userData.presentationBatchCandidate, mesh.name).toBe(false);
      expect(mesh.userData.staticBatchRendered, mesh.name).toBeUndefined();
    }
    // The solid ones among them still own their colliders and shot surfaces.
    const solidSuperseded = superseded.filter((mesh) => typeof mesh.userData.ballisticSurfaceId === 'string');
    expect(solidSuperseded.length, 'retired solids keep their shot surfaces').toBeGreaterThanOrEqual(9);

    // Not one forged mesh is a parametric box or claims a shot surface, so
    // neither the enumerated asymmetric set above nor the ballistic roster can
    // grow by adding art.
    let forged = 0;
    map.root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.name.startsWith('vehicle-forge ')) return;
      forged += 1;
      expect(node.userData.presentationOnly, node.name).toBe(true);
      expect((node.geometry as THREE.BoxGeometry).parameters, node.name).toBeUndefined();
      expect(node.userData.ballisticSurfaceId, node.name).toBeUndefined();
    });
    expect(forged).toBe(audit.drawCalls);
  });
});
