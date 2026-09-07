/**
 * Unit gates for the support-flight airspace.
 *
 * The owner's ask (docs/pass65-sources/codex-owner-feedback-2026-07-29.txt) is
 * "ensure the pilolted drone and drone swarm always spawn in the center of the
 * map in a spread out pattern", carried as HF-131 (P0) with HF-143 and HF-175
 * hanging off the same volume. The shape of that failure is a centre volume
 * that is not the map centre, or that is not admissible against the arena's
 * real colliders, on ONE arena while the others look fine.
 *
 * While the arithmetic lived inline in legacy-main the only way to observe it
 * was to activate a killstreak in a browser - so the drone-deployment suite
 * hand-copied the formula into itself, and there were two of it. Here it is a
 * table, taken from the single module that now owns it.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from '../additional-maps';
import { ARENA_IDS, type ArenaId } from '../arena-identity';
import type { Box2 } from '../collision';
import { GUN_RANGE_TEST_BAY_CONTRACT } from '../gun-range-test-bay';
import {
  PASS65_FLIGHT_NAVIGATION,
  type ArenaFlightNavigationDefinition,
} from '../killstreak-flight-navigation';
import {
  DRONE_SWARM_COUNT,
  planDroneCentreSpawns,
  type KillstreakWorld,
  type SupportVec3,
} from '../killstreak-runtime';
import { DRONE_DEPLOYMENT_POLICY } from '../killstreak-support-catalog';
import { buildArena, type ArenaMap } from '../map';
import {
  createSupportFlightWorld,
  supportFlightCentreHalfExtents,
  supportFlightCentrePortal,
  supportFlightCentreSpawn,
  supportStrikeBoundsAt,
} from './support-flight-world';

/** A plain rectangular arena, so the centre arithmetic has an obvious answer. */
const OPEN_BOUNDS: Box2 = Object.freeze({ minX: -30, maxX: 30, minZ: -40, maxZ: 40 });

function flightWorld(arenaId: ArenaId, bounds: Box2 = OPEN_BOUNDS, solids: readonly Box2[] = []) {
  return createSupportFlightWorld({
    arenaId,
    bounds,
    solids,
    prepareRaycastMeshes: () => [],
  });
}

/**
 * The runtime plans against a whole KillstreakWorld, so the roster half is
 * stubbed empty here - the airspace is the only thing under test.
 */
function killstreakWorld(arenaId: ArenaId, bounds?: Box2, solids?: readonly Box2[]): KillstreakWorld {
  return { ...flightWorld(arenaId, bounds, solids), targets: [] };
}

function minimumPairDistance(positions: readonly SupportVec3[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < positions.length; left += 1) {
    for (let right = left + 1; right < positions.length; right += 1) {
      minimum = Math.min(minimum, Math.hypot(
        positions[left]![0] - positions[right]![0],
        positions[left]![1] - positions[right]![1],
        positions[left]![2] - positions[right]![2],
      ));
    }
  }
  return minimum;
}

describe('support-flight centre volume (HF-131, owner: spawn in the center of the map)', () => {
  /**
   * THE HISTORICAL FAILURE SHAPE. Every arena whose highest portal sits on the
   * arena axis must put the centre volume on the map centre - no arena may be
   * the odd one out. Gun Range is the single authored exception and is asserted
   * separately below, with its reason.
   */
  it('centres the spawn volume on the map on every arena but the authored exception', () => {
    for (const arenaId of ARENA_IDS) {
      const definition = PASS65_FLIGHT_NAVIGATION[arenaId];
      const centrePortal = supportFlightCentrePortal(definition);
      if (arenaId === 'gun-range') continue;
      expect(centrePortal?.xQ ?? 0, `${arenaId} centre portal xQ`).toBe(0);
      expect(centrePortal?.zQ ?? 0, `${arenaId} centre portal zQ`).toBe(0);
      const centre = supportFlightCentreSpawn(definition, OPEN_BOUNDS);
      expect(centre[0], `${arenaId} centre x`).toBeCloseTo((OPEN_BOUNDS.minX + OPEN_BOUNDS.maxX) / 2, 8);
      expect(centre[2], `${arenaId} centre z`).toBeCloseTo((OPEN_BOUNDS.minZ + OPEN_BOUNDS.maxZ) / 2, 8);
      expect(centre[1], `${arenaId} centre altitude`).toBeGreaterThan(0);
      expect(centre[1], `${arenaId} centre altitude`).toBeLessThan(definition.ceilingY);
    }
  });

  /**
   * Gun Range's flight portal is deliberately off-centre: the killstreak test
   * bay is a sealed room in the east block, and a map-centre spawn puts support
   * aircraft OUTSIDE the room they are being flown in. Pinned so the exception
   * stays deliberate rather than becoming a second drift.
   */
  it('keeps the Gun Range spawn inside the test bay rather than at the map centre', () => {
    const bay = GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds;
    const map = buildGunRange(new THREE.Scene());
    const centre = supportFlightCentreSpawn(PASS65_FLIGHT_NAVIGATION['gun-range'], map.bounds);
    expect(centre[0]).toBeGreaterThanOrEqual(bay.minX);
    expect(centre[0]).toBeLessThanOrEqual(bay.maxX);
    expect(centre[2]).toBeGreaterThanOrEqual(bay.minZ);
    expect(centre[2]).toBeLessThanOrEqual(bay.maxZ);
    expect(centre[0]).not.toBeCloseTo((map.bounds.minX + map.bounds.maxX) / 2, 1);
  });

  it('picks the highest portal and breaks ties by id, whatever order they are authored in', () => {
    const shuffled: ArenaFlightNavigationDefinition = {
      ...PASS65_FLIGHT_NAVIGATION['atomic-acres'],
      portals: [...PASS65_FLIGHT_NAVIGATION['atomic-acres'].portals].reverse(),
    };
    expect(supportFlightCentrePortal(shuffled)?.id).toBe('central-overflight');

    const tied: ArenaFlightNavigationDefinition = {
      ...PASS65_FLIGHT_NAVIGATION['atomic-acres'],
      portals: [
        { id: 'zulu', xQ: 0.5, zQ: 0, altitudeM: 20 },
        { id: 'alpha', xQ: -0.5, zQ: 0, altitudeM: 20 },
      ],
    };
    expect(supportFlightCentrePortal(tied)?.id).toBe('alpha');
  });

  it('falls back to a bounded fraction of the ceiling on an arena with no portals', () => {
    const definition = PASS65_FLIGHT_NAVIGATION.test1;
    expect(definition.portals).toHaveLength(0);
    const centre = supportFlightCentreSpawn(definition, OPEN_BOUNDS);
    expect(centre[0]).toBeCloseTo(0, 8);
    expect(centre[2]).toBeCloseTo(0, 8);
    expect(centre[1]).toBeCloseTo(definition.ceilingY * 0.45, 8);
  });

  it('caps the spread in absolute metres so a large arena cannot scatter the formation', () => {
    const wide: Box2 = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
    const half = supportFlightCentreHalfExtents(PASS65_FLIGHT_NAVIGATION['atomic-acres'], wide);
    expect(half[0]).toBe(7.5);
    expect(half[2]).toBe(7.5);
    expect(half[1]).toBe(2);

    const tight = supportFlightCentreHalfExtents(PASS65_FLIGHT_NAVIGATION['atomic-acres'], OPEN_BOUNDS);
    expect(tight[0]).toBeCloseTo(60 * 0.12, 8);
    expect(tight[2]).toBeCloseTo(7.5, 8);
  });
});

describe('support-flight world against the real arenas', () => {
  /**
   * The admission this module exists for, now asked of the SHIPPED world rather
   * than of a copy of it re-typed in the test file. A drift in the module is a
   * failure here; previously the copy could stay green while the shipped code
   * moved.
   */
  it('admits the complete centre formation against the real collider/ceiling set', () => {
    const builders: readonly [ArenaId, (scene: THREE.Scene) => ArenaMap][] = [
      ['atomic-acres', buildArena],
      ['rustworks-1v1', buildRustworks1v1],
      ['skyline-terminal', buildSkylineTerminal],
      ['gun-range', buildGunRange],
    ];
    for (const [arenaId, build] of builders) {
      const scene = new THREE.Scene();
      const map = build(scene);
      const world = flightWorld(arenaId, map.bounds, map.colliders);
      const plan = planDroneCentreSpawns({ ...world, targets: [] }, DRONE_SWARM_COUNT, 0x65cafe);
      expect(plan.positions, `${arenaId} centre volume`).toHaveLength(DRONE_SWARM_COUNT);
      expect(
        plan.positions.every((position) => world.isFlightPositionValid(position)),
        `${arenaId} admission`,
      ).toBe(true);
      expect(minimumPairDistance(plan.positions), `${arenaId} separation`)
        .toBeGreaterThanOrEqual(DRONE_DEPLOYMENT_POLICY.minimumSpawnSeparationM - 1e-9);
      scene.clear();
    }
  });

  it('is deterministic: the same arena snapshot plans the same formation twice', () => {
    expect(planDroneCentreSpawns(killstreakWorld('atomic-acres'), DRONE_SWARM_COUNT, 0x65cafe))
      .toEqual(planDroneCentreSpawns(killstreakWorld('atomic-acres'), DRONE_SWARM_COUNT, 0x65cafe));
  });
});

describe('support-flight predicates', () => {
  it('rejects positions outside the arena margin or inside a solid', () => {
    const solid: Box2 = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 0, maxY: 6 };
    const world = flightWorld('atomic-acres', OPEN_BOUNDS, [solid]);
    expect(world.isFlightPositionValid([0, 3, 20])).toBe(true);
    expect(world.isFlightPositionValid([0, 3, 0])).toBe(false); // inside the solid
    expect(world.isFlightPositionValid([OPEN_BOUNDS.maxX - 0.2, 3, 20])).toBe(false); // inside the margin
  });

  it('slides an aircraft off a solid instead of admitting the blocked step', () => {
    const wall: Box2 = { minX: -4, maxX: 4, minZ: 1, maxZ: 3, minY: 0, maxY: 30 };
    const world = flightWorld('atomic-acres', OPEN_BOUNDS, [wall]);
    const resolved = world.resolveFlightPosition([0, 10, -6], [0, 10, 6], 0.6);
    expect(world.isFlightPositionValid(resolved)).toBe(true);
    expect(resolved[2]).toBeLessThan(wall.minZ);
  });

  it('bounds a Gun Range strike admitted inside the test bay by the room, not the map', () => {
    const bay = GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds;
    const inside: SupportVec3 = [(bay.minX + bay.maxX) / 2, 1, (bay.minZ + bay.maxZ) / 2];
    expect(supportStrikeBoundsAt('gun-range', OPEN_BOUNDS, inside)).toBe(bay);
    // Same anchor on any other arena, and any anchor outside the bay, is the map.
    expect(supportStrikeBoundsAt('atomic-acres', OPEN_BOUNDS, inside)).toBe(OPEN_BOUNDS);
    expect(supportStrikeBoundsAt('gun-range', OPEN_BOUNDS, [bay.maxX + 5, 1, inside[2]])).toBe(OPEN_BOUNDS);
  });

  /**
   * The scene walk is the expensive half. It must not run for a world nobody
   * samples ground from, and it must run at most once for one that does - the
   * activation-hitch contract the legacy comment recorded.
   */
  it('defers the raycast-mesh walk until ground is sampled, then does it once', () => {
    let walks = 0;
    const world = createSupportFlightWorld({
      arenaId: 'atomic-acres',
      bounds: OPEN_BOUNDS,
      solids: [],
      prepareRaycastMeshes: () => {
        walks += 1;
        return [];
      },
    });
    world.isFlightPositionValid([0, 5, 0]);
    world.resolveFlightPosition([0, 5, 0], [1, 5, 1], 0.5);
    expect(walks).toBe(0);
    world.groundHeightAt(0, 0);
    world.groundHeightAt(3, -4);
    world.groundHeightAt(-6, 2);
    expect(walks).toBe(1);
  });
});

/**
 * FIXED 2026-08-31, and pinned so it cannot silently come back.
 *
 * The extraction found this and deliberately preserved it (a move is not the
 * place to change behaviour), pinning the divergence as a characterisation
 * test. It is now fixed: the published runtime bounds floor was a literal 0
 * regardless of the arena's authored flight floor, while resolveFlightPosition
 * has always clamped to that authored floor. Every arena authors 0 EXCEPT
 * high-seas, whose deck sits at 3.2 m - so on that one map every consumer of
 * `world.bounds.floorY` (spawn altitudes, carpet corridors, hover clamps, the
 * centre volume) was computing against the sea, 3.2 m below the floor the mover
 * would actually allow.
 */
describe('the published bounds floor matches the authored flight floor', () => {
  it('publishes the yacht deck, not the sea, on high-seas', () => {
    const definition = PASS65_FLIGHT_NAVIGATION['high-seas'];
    // Guard the premise: if high-seas ever stops authoring a raised floor, this
    // test would pass for the wrong reason and prove nothing.
    expect(definition.floorY).toBe(3.2);
    const world = flightWorld('high-seas');
    expect(world.bounds.floorY).toBe(definition.floorY);
    expect(world.bounds.ceilingY).toBe(definition.ceilingY);
  });

  it('has the mover and the published floor agree, which was the actual defect', () => {
    const world = flightWorld('high-seas');
    const radius = 0.6;
    // Dive at the deck: the mover clamps to floorY + radius, and that result
    // must sit on the floor the bounds advertise. Before the fix the mover
    // stopped at 3.8 while the bounds claimed the floor was 0.
    const [, y] = world.resolveFlightPosition([0, 10, 0], [0, 0, 0], radius);
    expect(y).toBeCloseTo(world.bounds.floorY + radius, 8);
  });

  it('agrees with the authored floor on every arena, not just the awkward one', () => {
    for (const arenaId of ARENA_IDS) {
      expect(PASS65_FLIGHT_NAVIGATION[arenaId].floorY, `${arenaId} floor`)
        .toBe(flightWorld(arenaId).bounds.floorY);
    }
  });
});
