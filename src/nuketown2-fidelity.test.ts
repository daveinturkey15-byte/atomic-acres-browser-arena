import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { isBlocked } from './collision';
import { movementProfile } from './gameplay';
import type { ArenaMap } from './map';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_CENTRAL_BUS,
  NUKETOWN2_HOUSE_LAYOUT,
  NUKETOWN2_RARE_GUN_SITES,
  NUKETOWN2_SECTION,
  NUKETOWN2_SPAWN_LAYOUT,
  NUKETOWN2_STREET_HALF_WIDTH,
  buildNuketown2,
} from './nuketown2-arena';
import { CharacterPhysics } from './physics';
import { shedPlacementsForArena } from './destructible-shed-registry';

/**
 * NUKE TOWN REBUILD fidelity guard (HF-407).
 *
 * Copied in shape from `src/nuketown-fidelity.test.ts` and re-derived in every
 * number, because the shipped map's bands encode the shipped map's history and
 * this arena has none. The authority every band below is derived from is
 * `docs/NUKETOWN_REBUILD_2026-09-02.md`, which was written BEFORE any geometry
 * and records what published sources actually say about the reference map and
 * what this lane derived from them.
 *
 * THE RULE FOR EVERY NUMBER IN THIS FILE. A band is either
 *   (a) a REFERENCE ratio from the design doc, with the tolerance stated, or
 *   (b) a value MEASURED on the arena the builder actually emits, pinned with
 *       a stated margin, and with the reason it is allowed to be that value.
 * No band is a feeling, and no band was chosen after seeing a test go red. The
 * measurements were taken by artifacts/nuketown2-measure.mts on the built
 * collider set and are quoted inline so the next person can re-derive rather
 * than re-guess.
 */

const PLAYER_RADIUS = 0.44;
/**
 * Eye height for a player standing on the upper floor slab: slab top 3.3 m plus
 * 1.66 m. `isBlocked` excludes a collider only when `eye - 1.65 > collider.maxY`
 * STRICTLY, so 3.3 + 1.65 exactly would still read the floor as an obstruction.
 */
const UPPER_FLOOR_EYE_Y = 4.96;
const sprintSpeed = movementProfile({ crouched: false, prone: false, ads: false, sprinting: true, grounded: true }).maxSpeed;
const walkSpeed = movementProfile({ crouched: false, prone: false, ads: false, sprinting: false, grounded: true }).maxSpeed;

const width = NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX;
const depth = NUKETOWN2_BOUNDS.maxZ - NUKETOWN2_BOUNDS.minZ;

/**
 * The reference's one published hard scalar: minimum playspace 2,972 m2,
 * maximum whole map 4,950 m2 (design doc R1). The rebuild's fenced rectangle is
 * 58 x 52 = 3,016 m2. The band below is +/- 5 % of the published playspace,
 * which is tight enough that a metre off any section band fails it.
 */
const REFERENCE_PLAYSPACE_M2 = 2_972;
const PLAYSPACE_TOLERANCE = 0.05;

/**
 * Longest clear STANDING eye-line over the whole map, measured by the estimator
 * below on the built colliders: 63.53 m, [28, -15] -> [-28, 15].
 *
 * That lane passes through the world origin, which is to say through the BUS's
 * own window band, between its mullions - the bus is authored OPEN because the
 * reference's is, and an open bus is see-through at standing eye height by
 * design. So this ceiling is an anti-creep pin on the map's overall openness,
 * not the instrument for "does the bus break the street"; that is measured
 * directly by the street-centre-line test below. 66 m leaves 2.5 m over the
 * measurement for the estimator's 2 m sample step and nothing more: any new
 * body that opens a lane wider than the current worst one fails here.
 */
const MAX_STANDING_EYE_LINE_METRES = 66;

/**
 * Longest clear run ALONG the street centre-line at standing eye height,
 * measured at 0.5 m resolution: 15.0 m, from x = -20.5 to x = -5.5, i.e. the
 * west cul-de-sac up to the bus's west end. This is the reference property the
 * bus exists for, and the number that would move if the bus were removed,
 * shortened, or pushed off centre: without it the run is the full 58 m street.
 * 17 m is the measurement plus two sample steps.
 */
const MAX_STREET_CENTRE_RUN_METRES = 17;

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

describe('Nuke Town Rebuild fidelity', () => {
  it('matches the reference footprint: 58 x 52 m of playspace, and the published 0.60 play-to-map ratio', () => {
    const playspace = width * depth;
    expect(playspace).toBeGreaterThan(REFERENCE_PLAYSPACE_M2 * (1 - PLAYSPACE_TOLERANCE));
    expect(playspace).toBeLessThan(REFERENCE_PLAYSPACE_M2 * (1 + PLAYSPACE_TOLERANCE));

    // Design doc 2.2: the whole authored map is the playable rectangle plus an
    // 8 m out-of-bounds verge on every side, and the reference's published
    // playspace : whole-map ratio is 0.60. Deriving the verge from the same
    // numbers the arena uses means the ratio cannot drift without the
    // footprint drifting.
    const wholeMap = (width + 16) * (depth + 16);
    expect(playspace / wholeMap).toBeCloseTo(0.6, 2);
    expect(wholeMap).toBeGreaterThan(4_950 * (1 - PLAYSPACE_TOLERANCE));
    expect(wholeMap).toBeLessThan(4_950 * (1 + PLAYSPACE_TOLERANCE));
  });

  it('adds up: the cross-street section is exactly the fenced depth, with every reference band present', () => {
    // Design doc 2.2. Half the section, road centre-line outward: street
    // half-width + house + back yard + border path. If this stops summing, one
    // of those bands has been silently eaten and the arena is no longer the map
    // the footprint band above claims it is.
    const half = NUKETOWN2_SECTION.streetHalfWidth
      + NUKETOWN2_SECTION.houseDepth
      + NUKETOWN2_SECTION.yardDepth
      + NUKETOWN2_SECTION.sidePathDepth;
    expect(half * 2).toBeCloseTo(depth, 10);
    // Every band has to be genuinely playable, not a millimetre of bookkeeping.
    expect(NUKETOWN2_SECTION.sidePathDepth).toBeGreaterThanOrEqual(3.5);
    expect(NUKETOWN2_SECTION.yardDepth).toBeGreaterThanOrEqual(6);
    expect(NUKETOWN2_SECTION.houseDepth).toBeGreaterThanOrEqual(9);
    // Design doc 2.3: the houses are offset along the street by half a house
    // width, which is what makes each front window look at the OTHER house's
    // driveway instead of into its own mirror image.
    expect(NUKETOWN2_SECTION.houseOffsetAlongStreet).toBeCloseTo(NUKETOWN2_SECTION.houseWidth / 2, 10);
  });

  it('stays small: the map is crossed in about nine seconds at real sprint speed', () => {
    // MEASURED on the built bounds: diagonal 77.90 m, 8.95 s sprint,
    // 12.67 s walk, 25.29 s perimeter lap. The reference is described as one of
    // the smallest maps in the series (design doc R12), and the shipped Nuke
    // Town crosses in 10.95 s - so this arena being FASTER to cross is the
    // point, not an accident. The bands are two-sided: creeping back out to the
    // shipped map's size fails, and shrinking into a corridor fails too.
    const diagonal = Math.hypot(width, depth);
    expect(diagonal / sprintSpeed).toBeGreaterThan(8.5);
    expect(diagonal / sprintSpeed).toBeLessThan(9.4);
    expect(diagonal / walkSpeed).toBeLessThan(13.2);
    const lap = (2 * (width + depth)) / sprintSpeed;
    expect(lap).toBeGreaterThan(24);
    expect(lap).toBeLessThan(27);
  });

  it('puts the bus in the middle of the road and shortens the street with it', () => {
    const map = buildNuketown2(new THREE.Scene());
    const bus = map.physicalCover.find((cover) => cover.id === 'nuketown2-central-bus');
    expect(bus, 'exactly one central bus owns the middle of the road').toBeDefined();
    expect(map.physicalCover.filter((cover) => cover.id.includes('bus'))).toHaveLength(1);
    // Centred on the world origin, which is load-bearing: the global
    // OVERDRIVE_POSITION {0, 3.75, 0} has to land on this roof.
    expect((bus!.bounds.minX + bus!.bounds.maxX) / 2).toBeCloseTo(0, 10);
    expect((bus!.bounds.minZ + bus!.bounds.maxZ) / 2).toBeCloseTo(0, 10);
    expect(bus!.bounds.minZ).toBeGreaterThan(-NUKETOWN2_STREET_HALF_WIDTH);
    expect(bus!.bounds.maxZ).toBeLessThan(NUKETOWN2_STREET_HALF_WIDTH);
    expect(bus!.blocksShots).toBe(true);
    expect(bus!.blocksMovement).toBe(true);
    // Design doc 2.6: an 11 m body is what actually breaks a 58 m street.
    expect(NUKETOWN2_CENTRAL_BUS.length).toBeGreaterThanOrEqual(10);
    // The 2x-damage core floats 0.60 m over the roof, inside the pickup window.
    expect(NUKETOWN2_CENTRAL_BUS.roofY).toBeCloseTo(3.15, 10);

    // The property, measured rather than assumed: no clear standing run along
    // the street centre-line longer than the band. Without the bus this is the
    // whole 58 m street.
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

  it('treats the vehicles the way the reference does: the bus and the trucks are cover, the cars are solid', () => {
    const map = buildNuketown2(new THREE.Scene());
    // Design doc 2.5 / R9: a bus, a truck in each cul-de-sac, and two cars.
    const truckIds = map.physicalCover.filter((cover) => cover.id.includes('truck')).map((cover) => cover.id);
    expect(truckIds).toHaveLength(2);
    // One truck at each END of the street, not two at the same end.
    const trucks = map.physicalCover.filter((cover) => truckIds.includes(cover.id));
    const centresX = trucks.map((truck) => (truck.bounds.minX + truck.bounds.maxX) / 2);
    expect(Math.min(...centresX)).toBeLessThan(-15);
    expect(Math.max(...centresX)).toBeGreaterThan(15);
    // Every declared vehicle body is real cover in both authorities. A body the
    // player can see and shoot but walk through is the failure this pins.
    for (const cover of map.physicalCover) {
      expect(cover.blocksMovement, cover.id).toBe(true);
      expect(cover.blocksShots, cover.id).toBe(true);
    }
    // The bus is OPEN: its floor is standable and its roof is over your head,
    // so the interior is a room. Both are solid bodies in the built set.
    const meshNames = map.root.children.map((node) => node.name);
    expect(meshNames.some((name) => name.includes('bus floor'))).toBe(true);
    expect(meshNames.some((name) => name.includes('bus roof'))).toBe(true);
    // The cars are CLOSED: solid, and not declared as enterable cover volumes.
    expect(map.physicalCover.some((cover) => cover.id.includes('car'))).toBe(false);
    expect(meshNames.some((name) => name.includes('car body'))).toBe(true);
  });

  it('builds two two-storey houses facing each other over the road, each with a garage', () => {
    const map = buildNuketown2(new THREE.Scene());
    // Design doc R3/R4/R6: two houses, two ground rooms and two upper rooms
    // each, a front and a back door each, and windows that are real openings.
    expect(map.houseTelemetry.houses).toBe(2);
    expect(map.houseTelemetry.groundRooms).toBe(4);
    expect(map.houseTelemetry.upperRooms).toBe(4);
    expect(map.houseTelemetry.doors).toBe(4);
    expect(map.houseTelemetry.windows).toBe(8);
    expect(map.houseTelemetry.ramps).toBe(2);
    const [north, south] = NUKETOWN2_HOUSE_LAYOUT;
    expect(north!.facing).toBe(1);
    expect(south!.facing).toBe(-1);
    expect(north!.z).toBeLessThan(-NUKETOWN2_STREET_HALF_WIDTH);
    expect(south!.z).toBeGreaterThan(NUKETOWN2_STREET_HALF_WIDTH);
    // The garages are real rooms, one per house, on the outboard ends.
    const names = map.root.children.map((node) => node.name);
    expect(names.filter((name) => name.includes('garage floor'))).toHaveLength(2);
    expect(names.some((name) => name.includes('garage door head'))).toBe(true);
  });

  it('keeps the power position real: the upper front window is an opening, and the rare gun lives there', () => {
    const map = buildNuketown2(new THREE.Scene());
    // Design doc R5: the upstairs front window is the biggest power position on
    // the reference map, and it is only one if it is a hole rather than a
    // painting. Stand at each upper window seat and look across the road: the
    // seat must be unobstructed at eye height.
    // `isBlocked` models the point as an EYE with 1.65 m of body hanging below
    // it, so an upper-floor seat is probed at slab + 1.66 = 4.96 m: any lower
    // and the capsule reaches through the floor the player is standing on and
    // every interior position reads as blocked.
    for (const house of NUKETOWN2_HOUSE_LAYOUT) {
      const seat = { x: house.x, y: UPPER_FLOOR_EYE_Y, z: house.z + house.facing * 3.9 };
      expect(isBlocked(seat, map.colliders, PLAYER_RADIUS), `${house.id} upper window seat`).toBe(false);
    }
    // The rare-gun sites are DERIVED from the house layout, never hand-written:
    // the shipped map's equivalent list outlived a layout move and put the
    // weapon outside the map (src/railgun-authority.ts header).
    expect(NUKETOWN2_RARE_GUN_SITES).toHaveLength(2);
    for (const [index, site] of NUKETOWN2_RARE_GUN_SITES.entries()) {
      const house = NUKETOWN2_HOUSE_LAYOUT[index]!;
      expect(site.position[0]).toBeCloseTo(house.x, 10);
      // In the FRONT upper room, toward the street: the house mid-line is where
      // the internal partition stands, and this assertion is the one that
      // caught the first cut of these sites sitting inside that wall.
      expect(Math.sign(site.position[2] - house.z)).toBe(house.facing);
      // Above the upper floor slab and inside the building, not on the roof.
      expect(site.position[1]).toBeGreaterThan(3.3);
      expect(site.position[1]).toBeLessThan(6.2);
      // A player can actually stand where the weapon is. This is the whole
      // point of deriving the sites instead of hand-writing them.
      expect(isBlocked({ x: site.position[0], y: UPPER_FLOOR_EYE_Y, z: site.position[2] }, map.colliders, PLAYER_RADIUS),
        `${site.id} must stand in open floor`).toBe(false);
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
    // THE SINGLE BIGGEST FLOW CORRECTION IN THIS ARENA (design doc R8). Teams
    // own the two SIDES of the road, behind their own house, not the two ENDS
    // of the street. End spawns make the street a corridor you run along;
    // back-yard spawns make it a road you cross. The house back walls sit at
    // |z| = 14.5, so every spawn being past them is "behind your own house"
    // measured rather than asserted.
    expect(NUKETOWN2_SPAWN_LAYOUT[0]!.every(([, z]) => z < -14.5)).toBe(true);
    expect(NUKETOWN2_SPAWN_LAYOUT[1]!.every(([, z]) => z > 14.5)).toBe(true);
    // Team 1's table is the exact 180-degree negation of team 0's, in order.
    for (const [index, [x, z]] of NUKETOWN2_SPAWN_LAYOUT[0]!.entries()) {
      const [px, pz] = NUKETOWN2_SPAWN_LAYOUT[1]![index]!;
      expect(px).toBeCloseTo(-x, 10);
      expect(pz).toBeCloseTo(-z, 10);
    }
    // Every spawn is a short sprint from the contested centre, which is what
    // makes the reference relentless rather than a walk simulator. MEASURED
    // worst case 2.71 s.
    for (const team of [0, 1] as const) {
      for (const [x, z] of NUKETOWN2_SPAWN_LAYOUT[team]!) {
        expect(Math.hypot(x, z) / sprintSpeed, `spawn (${x}, ${z}) to centre`).toBeLessThan(3.2);
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
  });

  it('gives both teams the same map: every solid body has an exact 180-degree partner', () => {
    const map = buildNuketown2(new THREE.Scene());
    // This arena has no mirrored house generator and nothing is yawed, so the
    // symmetry claim can be exact rather than allowanced: every solid mesh must
    // have a partner of the same size at the negated position. Unlike the
    // shipped map's version of this test there is NO lane-identity escape
    // hatch, because there is nothing on this map that earns one.
    const solids = map.root.children.filter((node): node is THREE.Mesh => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh !== true) return false;
      if (mesh.userData.presentationOnly === true) return false;
      return (mesh.geometry as THREE.BoxGeometry).parameters !== undefined;
    });
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
      .filter((mesh) => !present.has(`${size(mesh)}|${at(-mesh.position.x, mesh.position.y, -mesh.position.z)}`))
      .map((mesh) => `${mesh.name} @(${mesh.position.x}, ${mesh.position.z})`);
    expect(asymmetric).toEqual([]);
  });

  it('leaves no floating solid geometry over the playable yards', () => {
    const map = buildNuketown2(new THREE.Scene());
    // A body whose underside is above 0.4 m is either a named structural
    // element (a roof, a floor slab, a lintel, a stair tread) or a named part
    // of a vehicle body sitting on its wheels. Anything else floating over a
    // yard is an orphan slab the player can neither see the support of nor
    // reach, which is the class this test exists to catch.
    const structural = /roof|floor|upper|stair|lintel|head|sill|rail|cant|deck|end|wheel|sign|window|door|porch|butt|pier|partition/i;
    const vehicle = /bus|truck|car/i;
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

  it('keeps every standing eye-line inside the measured ceiling', () => {
    const map = buildNuketown2(new THREE.Scene());
    const longest = longestClearEyeLine(map, 1.65);
    expect(
      longest.metres,
      `clear lane ${JSON.stringify(longest.from)} -> ${JSON.stringify(longest.to)}`,
    ).toBeLessThanOrEqual(MAX_STANDING_EYE_LINE_METRES);
  });

  it('cannot be escaped: sprinting hard at every boundary stays inside the fence', async () => {
    const map = buildNuketown2(new THREE.Scene());
    const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds);
    try {
      const runs: Array<{ from: [number, number]; direction: [number, number] }> = [
        { from: [0, -18], direction: [0, -1] },
        { from: [0, 18], direction: [0, 1] },
        { from: [-20, 0], direction: [-1, 0] },
        { from: [20, 0], direction: [1, 0] },
        { from: [-20, -18], direction: [-1, -1] },
        { from: [20, 18], direction: [1, 1] },
        { from: [20, -18], direction: [1, -1] },
        { from: [-20, 18], direction: [-1, 1] },
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
});
