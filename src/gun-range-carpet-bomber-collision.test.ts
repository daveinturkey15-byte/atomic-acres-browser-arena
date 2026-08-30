import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange } from './additional-maps';
import {
  circleIntersectsBox,
  segmentIntersectsBox,
  sphereIntersectsBox,
  sweepSphereAgainstBoxes,
  type Box2,
} from './collision';
import { gunRangeTestBayDummyColliders } from './test-bay-dummy-colliders';
import { FLAMETHROWER_GROUND_FIRE_PRESENTATION_RADIUS_M } from './flamethrower-stream-system';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  GUN_RANGE_TEST_BAY_STRUCTURE,
  advanceGunRangeTestBayDoor,
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicColliders,
  gunRangeTestBayDummyPose,
  gunRangeTestBayStructureBounds,
} from './gun-range-test-bay';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  CARPET_BOMBER_BLAST_RADIUS_M,
  CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M,
  CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE,
  CARPET_BOMBER_IMPACT_COUNT,
  CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M,
  CARPET_BOMBER_IMPACT_ORIGIN_MARGIN_M,
  CARPET_BOMBER_SUPPORT_EXPLOSION_MAXIMUM_RADIUS_M,
  CARE_AIRCRAFT_DURATION_MS,
  HostKillstreakRuntime,
  type KillstreakImpactEvent,
  type KillstreakTarget,
  type KillstreakWorld,
  type SupportVec3,
} from './killstreak-runtime';
import {
  CARPET_BOMB_SHELL_PRESENTATION_ALTITUDE_M,
  CARPET_BOMB_SHELL_PRESENTATION_RADIUS_M,
} from './killstreak-presentation';
import {
  CARPET_BOMBER_COLLISION_ENVELOPE,
  resolveSupportAircraftEnvelopeStep,
  supportAircraftEnvelopeIntersectsBox,
  supportAircraftRootClearance,
} from './support-aircraft-collision';
import { SupportPlacementGroundSampler } from './support-placement-ground';

const loadout = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
});

describe('Gun Range Carpet Bomber collision parity', () => {
  for (const doorMode of ['closed', 'open'] as const) {
    it(`keeps the truthful airframe and every payload inside the exact room solids with the door ${doorMode}`, () => {
      const map = buildGunRange(new THREE.Scene());
      const closed = createGunRangeTestBayDoorState(0);
      const doorState = doorMode === 'closed'
        ? closed
        : advanceGunRangeTestBayDoor(
            advanceGunRangeTestBayDoor(closed, 0, GUN_RANGE_TEST_BAY_CONTRACT.door.trigger).state,
            GUN_RANGE_TEST_BAY_CONTRACT.door.openDurationMs,
            GUN_RANGE_TEST_BAY_CONTRACT.door.trigger,
          ).state;
      const doorSolids = gunRangeTestBayDoorDynamicColliders(doorState).map((entry) => entry.bounds);
      const solids = Object.freeze([...map.colliders, ...doorSolids]);
      const flightBounds = Object.freeze({
        minX: map.bounds.minX,
        maxX: map.bounds.maxX,
        minZ: map.bounds.minZ,
        maxZ: map.bounds.maxZ,
        floorY: 0,
        ceilingY: 18,
      });
      const ground = new SupportPlacementGroundSampler({
        bounds: map.bounds,
        ceilingY: flightBounds.ceilingY,
        colliders: solids,
        prepareRaycastMeshes: () => [],
      });
      const bay = GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds;
      const targets: KillstreakTarget[] = [
        { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [52.1, 1.7, 12] },
      ];
      const roomLineOfSight = (from: readonly [number, number, number], to: readonly [number, number, number]) => (
        !solids.some((solid) => segmentIntersectsBox(
          { x: from[0], y: from[1], z: from[2] },
          { x: to[0], y: to[1], z: to[2] },
          solid,
        ))
      );
      const world: KillstreakWorld = {
        bounds: flightBounds,
        targets,
        groundHeightAt: (x, z) => ground.heightAt(x, z),
        hasLineOfSight: roomLineOfSight,
        supportStrikeBoundsAt: () => bay,
        resolveFlightEnvelopePosition: (from, desired, envelope) => resolveSupportAircraftEnvelopeStep({
          bounds: flightBounds,
          solids,
          from,
          desired,
          envelope,
        }).position,
      };
      const runtime = new HostKillstreakRuntime(70);
      runtime.registerActor('owner', 0, 1, loadout);
      expect(runtime.grantTrainingReward('owner', 1, 'carpet-bomber', {
        arenaId: 'gun-range',
        stationKind: 'secure-test-bay',
        authorityRole: 'host',
      })).toEqual({ accepted: true, reason: 'accepted' });
      const activation = runtime.activate({
        by: 'owner',
        matchEpoch: 70,
        lifeId: 1,
        sequence: 1,
        slot: 1,
        activationId: `gun-range-carpet-${doorMode}`,
        expectedId: 'carpet-bomber',
        anchor: [52.1, 0, 12],
        facing: [1, 0, 0],
      }, 1_000, world);
      expect(activation).toMatchObject({ accepted: true, activatedId: 'carpet-bomber' });
      const aircraftId = activation.entityIds[0]!;
      const impacts: KillstreakImpactEvent[] = [];
      const aircraftPositions: readonly number[][] = [];
      let doorImpact: KillstreakImpactEvent | null = null;
      for (let elapsed = 0; elapsed < CARE_AIRCRAFT_DURATION_MS; elapsed += 50) {
        const now = 1_000 + elapsed;
        const step = runtime.advance(now, world);
        impacts.push(...step.impactEvents);
        if (!doorImpact) {
          doorImpact = step.impactEvents.find((event) => event.phase === 'drop'
            && event.position[2] > 8.3 && event.position[2] < 15.7) ?? null;
        }
        const aircraft = runtime.snapshotFor('owner', now).entities.find((entity) => entity.id === aircraftId);
        expect(aircraft, `${doorMode} door aircraft missing at ${elapsed}ms`).toBeDefined();
        const envelope = { ...CARPET_BOMBER_COLLISION_ENVELOPE, yaw: aircraft!.attitude[1] };
        const root = { x: aircraft!.position[0], y: aircraft!.position[1], z: aircraft!.position[2] };
        expect(
          solids.some((solid) => supportAircraftEnvelopeIntersectsBox(root, envelope, solid)),
          `${doorMode} door collider overlap at ${elapsed}ms: ${JSON.stringify(aircraft!.position)}`,
        ).toBe(false);
        expect(aircraft!.position[1]).toBeGreaterThan(16);
        expect(aircraft!.position[1]).toBeLessThan(18);
        (aircraftPositions as number[][]).push([...aircraft!.position]);
      }
      const drops = impacts.filter((impact) => impact.phase === 'drop');
      const detonations = impacts.filter((impact) => impact.phase === 'impact');
      expect(drops).toHaveLength(CARPET_BOMBER_IMPACT_COUNT);
      expect(detonations).toHaveLength(CARPET_BOMBER_IMPACT_COUNT);
      expect(doorImpact, `${doorMode} door route exposes no doorway adversary`).not.toBeNull();
      const maximumImpactPresentationRadius = Math.max(
        CARPET_BOMBER_IMPACT_FLASH_BASE_RADIUS_M * CARPET_BOMBER_IMPACT_FLASH_MAXIMUM_SCALE,
        CARPET_BOMBER_SUPPORT_EXPLOSION_MAXIMUM_RADIUS_M,
      );
      expect(CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M)
        .toBeCloseTo(maximumImpactPresentationRadius + CARPET_BOMBER_IMPACT_ORIGIN_MARGIN_M, 8);
      expect(CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M).toBeGreaterThan(CARPET_BOMBER_BLAST_RADIUS_M);
      expect(CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M).toBeGreaterThan(CARPET_BOMB_SHELL_PRESENTATION_RADIUS_M);
      expect(CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M)
        .toBeGreaterThan(FLAMETHROWER_GROUND_FIRE_PRESENTATION_RADIUS_M);
      expect(bay.maxX - bay.minX - CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M * 2).toBeGreaterThan(38);
      expect(bay.maxZ - bay.minZ - CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M * 2).toBeGreaterThan(54);
      const structureSolids = GUN_RANGE_TEST_BAY_STRUCTURE.map(gunRangeTestBayStructureBounds);
      const enclosingWallsAndDoor = [
        ...GUN_RANGE_TEST_BAY_STRUCTURE
          .filter((entry) => entry.material === 'wall' || entry.material === 'door-frame')
          .map(gunRangeTestBayStructureBounds),
        ...doorSolids,
      ];
      for (const event of impacts) {
        expect(event.position[0]).toBeGreaterThanOrEqual(bay.minX + CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M);
        expect(event.position[0]).toBeLessThanOrEqual(bay.maxX - CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M);
        expect(event.position[2]).toBeGreaterThanOrEqual(bay.minZ + CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M);
        expect(event.position[2]).toBeLessThanOrEqual(bay.maxZ - CARPET_BOMBER_IMPACT_ORIGIN_CLEARANCE_M);
        expect(event.position[1]).toBe(0);
        const shellStart = {
          x: event.position[0],
          y: event.position[1] + CARPET_BOMB_SHELL_PRESENTATION_ALTITUDE_M,
          z: event.position[2],
        };
        expect(shellStart.y).toBeLessThan(bay.maxY);
        // Ignore only the canonical floor at the exact destination; walls,
        // roof and the current closed/open door must not intersect the shell.
        const shellEnd = { x: event.position[0], y: event.position[1] + 0.35, z: event.position[2] };
        const shellObstructions = solids.filter((solid) => (solid.maxY ?? 8) > shellEnd.y);
        expect(sweepSphereAgainstBoxes(shellStart, {
          x: shellEnd.x - shellStart.x,
          y: shellEnd.y - shellStart.y,
          z: shellEnd.z - shellStart.z,
        }, shellObstructions, CARPET_BOMB_SHELL_PRESENTATION_RADIUS_M),
        `${doorMode} door shell ${event.ordinal} intersects an active room solid`).toBeNull();
        expect(enclosingWallsAndDoor.some((solid) => circleIntersectsBox(
          event.position[0],
          event.position[2],
          maximumImpactPresentationRadius,
          solid,
        )), `${doorMode} door impact ${event.ordinal} presentation interpenetrates a wall`).toBe(false);
        expect(structureSolids.some((solid) => (solid.minY ?? 0) > 5 && sphereIntersectsBox(
          { x: event.position[0], y: event.position[1] + 0.35, z: event.position[2] },
          maximumImpactPresentationRadius,
          solid,
        )), `${doorMode} door impact ${event.ordinal} presentation interpenetrates a roof`).toBe(false);
      }
      expect(ground.heightAt(75, 6)).toBe(0);
      expect(solids.some((solid) => (solid.minY ?? 0) >= bay.maxY)).toBe(true);
      const routeYaw = -Math.PI / 2;
      const routeClearance = supportAircraftRootClearance({ ...CARPET_BOMBER_COLLISION_ENVELOPE, yaw: routeYaw });
      expect(aircraftPositions[0]![0] - routeClearance.negativeX).toBeGreaterThan(bay.minX);
      expect(aircraftPositions.at(-1)![0] + routeClearance.positiveX).toBeLessThan(bay.maxX);
      for (let index = 1; index < aircraftPositions.length; index += 1) {
        const previous = aircraftPositions[index - 1]!;
        const current = aircraftPositions[index]!;
        expect(current[0]).toBeGreaterThanOrEqual(previous[0]);
        expect(Math.hypot(current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]))
          .toBeLessThan(0.75);
      }
      const doorwayTarget: KillstreakTarget = {
        id: `across-${doorMode}-door`,
        kind: 'player',
        team: 1,
        lifeId: 1,
        alive: true,
        position: [50.8, 1.15, doorImpact!.position[2]],
      };
      // The safe blast inset intentionally keeps the full authoritative blast
      // inside the room, while its exact sightline still sees the current
      // static + dynamic door collider set.
      expect(Math.hypot(
        doorwayTarget.position[0] - doorImpact!.position[0],
        doorwayTarget.position[2] - doorImpact!.position[2],
      )).toBeGreaterThan(CARPET_BOMBER_BLAST_RADIUS_M);
      expect(roomLineOfSight(
        [doorImpact!.position[0], doorImpact!.position[1] + 0.08, doorImpact!.position[2]],
        doorwayTarget.position,
      )).toBe(doorMode === 'open');
      const napalmOrigin = [52.75, 0, 12] as const;
      const napalmTarget: KillstreakTarget = {
        ...doorwayTarget,
        id: `napalm-${doorMode}-door`,
        position: [51.05, 1.15, 12],
      };
      const groundLevelWallsAndDoor = enclosingWallsAndDoor.filter((solid) => (
        (solid.minY ?? 0) < FLAMETHROWER_GROUND_FIRE_PRESENTATION_RADIUS_M
        && (solid.maxY ?? 8) > 0
      ));
      expect(groundLevelWallsAndDoor.some((solid) => circleIntersectsBox(
        napalmOrigin[0],
        napalmOrigin[2],
        FLAMETHROWER_GROUND_FIRE_PRESENTATION_RADIUS_M,
        solid,
      )), `${doorMode} door napalm presentation interpenetrates a room solid`).toBe(false);
      const napalmDoorVictim = runtime.carpetGroundFireDamageEvents({
        activationId: activation.activationId!,
        ownerId: 'owner',
        point: napalmOrigin,
        radiusM: 1.8,
        damage: 5,
        atMs: 8_000,
      }, [napalmTarget], (from, to) => roomLineOfSight(
        [from[0], from[1] + 0.08, from[2]],
        [to[0], to[1], to[2]],
      ));
      expect(napalmDoorVictim.some((event) => event.targetId === napalmTarget.id)).toBe(doorMode === 'open');
      // Collision work is support-only: it cannot move/eject actors or alter
      // the authored room/door collider authority while the salvo advances.
      expect(world.targets[0]!.position).toEqual([52.1, 1.7, 12]);
      expect(map.colliders).toHaveLength(solids.length - doorSolids.length);
      expect(gunRangeTestBayDoorDynamicColliders(doorState).map((entry) => entry.bounds)).toEqual(doorSolids);
    });
  }
});

/**
 * HF-403 — "carpet bomber doesnt seem to do dmg in killstreak testing area",
 * "piloted drone and chopper gunner seem a bit buggy in the killstreak area".
 *
 * HF-318 made every active training dummy a solid world box, and the test bay
 * publishes each dummy as a killstreak target at its own collider's geometric
 * centre. Every support line-of-sight query to a dummy therefore terminated
 * 0.36 m deep inside the dummy's own solid and reported "blocked", so carpet
 * bomber, piloted drone and chopper gunner all went inert against dummies
 * while working everywhere else. Dummies are the only combatants that are also
 * world solids, which is why only the test bay was affected.
 *
 * The repair is in the LOS predicate, not the solid set: a solid that CONTAINS
 * an endpoint is not cover for that endpoint.
 */
describe('HF-403 a dummy is not its own cover', () => {
  const LOS_PADDING_M = 0.02;
  const LOS_INTERIOR_MARGIN_M = 0.05;
  const DUMMY_POSE_AT_MS = 0;
  const map = buildGunRange(new THREE.Scene());
  const dummyIds: readonly string[] = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition) => definition.id);
  const dummySolids = gunRangeTestBayDummyColliders(dummyIds, DUMMY_POSE_AT_MS).map((entry) => entry.bounds);
  const solids = Object.freeze([...map.colliders, ...dummySolids]);
  // Exactly how legacy-main publishes a dummy: the arena root sits at the
  // dummy's feet and the target rides 1.05 m up, which is also the vertical
  // centre of the 0..2.10 m collider HF-318 derives from that same pose.
  const dummyTargets: KillstreakTarget[] = GUN_RANGE_TEST_BAY_CONTRACT.dummies.map((definition) => {
    const pose = gunRangeTestBayDummyPose(definition, DUMMY_POSE_AT_MS);
    return {
      id: definition.id,
      kind: 'bot',
      team: 1,
      lifeId: 1,
      alive: true,
      position: [pose.position.x, pose.position.y + 1.05, pose.position.z],
    };
  });

  // The shipped predicate, mirrored. The source pin at the end of this suite
  // keeps the mirror and legacy-main in step.
  const enclosesPoint = (box: Box2, point: { x: number; y: number; z: number }): boolean => {
    const margin = LOS_INTERIOR_MARGIN_M;
    const minY = (box.minY ?? 0) + margin;
    const maxY = (box.maxY ?? 8) - margin;
    if (box.maxX - box.minX <= margin * 2 || box.maxZ - box.minZ <= margin * 2 || maxY <= minY) return false;
    return sphereIntersectsBox(point, 1e-4, {
      minX: box.minX + margin,
      maxX: box.maxX - margin,
      minY,
      maxY,
      minZ: box.minZ + margin,
      maxZ: box.maxZ - margin,
      rotation: box.rotation,
    });
  };
  const naiveLineOfSight = (from: SupportVec3, to: SupportVec3): boolean => !solids.some((solid) => segmentIntersectsBox(
    { x: from[0], y: from[1], z: from[2] },
    { x: to[0], y: to[1], z: to[2] },
    solid,
    LOS_PADDING_M,
  ));
  const endpointAwareLineOfSight = (from: SupportVec3, to: SupportVec3): boolean => {
    const start = { x: from[0], y: from[1], z: from[2] };
    const end = { x: to[0], y: to[1], z: to[2] };
    return !solids.some((solid) => segmentIntersectsBox(start, end, solid, LOS_PADDING_M)
      && !enclosesPoint(solid, start)
      && !enclosesPoint(solid, end));
  };

  it('reproduces the defect: every dummy occludes itself from a blast at its own feet', () => {
    for (const dummy of dummyTargets) {
      // Exactly the origin lift applySupportBlastDamage uses for a ground impact.
      const blastVisibilityOrigin: SupportVec3 = [dummy.position[0], 0.08, dummy.position[2]];
      expect(
        naiveLineOfSight(blastVisibilityOrigin, dummy.position),
        `${dummy.id} was expected to occlude itself under the old predicate`,
      ).toBe(false);
      expect(endpointAwareLineOfSight(blastVisibilityOrigin, dummy.position)).toBe(true);
    }
  });

  it('still lets a real wall block two points that are both outside it', () => {
    const wall = GUN_RANGE_TEST_BAY_STRUCTURE
      .filter((entry) => entry.material === 'wall')
      .map(gunRangeTestBayStructureBounds)
      .find((bounds) => bounds.maxX - bounds.minX < 4)!;
    const midZ = (wall.minZ + wall.maxZ) / 2;
    const midY = ((wall.minY ?? 0) + (wall.maxY ?? 8)) / 2;
    const left: SupportVec3 = [wall.minX - 3, midY, midZ];
    const right: SupportVec3 = [wall.maxX + 3, midY, midZ];
    expect(naiveLineOfSight(left, right)).toBe(false);
    expect(endpointAwareLineOfSight(left, right)).toBe(false);
  });

  it('does not discount a solid an endpoint is merely standing on', () => {
    // Zero penetration depth is not containment: a roof still blocks line of
    // sight for whoever is standing on top of it.
    const roof = solids.find((solid) => (solid.minY ?? 0) > 5 && solid.maxX - solid.minX > 8)!;
    const onTop: SupportVec3 = [(roof.minX + roof.maxX) / 2, roof.maxY ?? 8, (roof.minZ + roof.maxZ) / 2];
    const below: SupportVec3 = [onTop[0], (roof.minY ?? 0) - 1, onTop[2]];
    expect(naiveLineOfSight(onTop, below)).toBe(false);
    expect(endpointAwareLineOfSight(onTop, below)).toBe(false);
  });

  it('damages a dummy with a real Carpet Bomber salvo that the old predicate zeroed', () => {
    const bay = GUN_RANGE_TEST_BAY_CONTRACT.bay.bounds;
    const flightBounds = Object.freeze({
      minX: map.bounds.minX,
      maxX: map.bounds.maxX,
      minZ: map.bounds.minZ,
      maxZ: map.bounds.maxZ,
      floorY: 0,
      ceilingY: 18,
    });
    const ground = new SupportPlacementGroundSampler({
      bounds: map.bounds,
      ceilingY: flightBounds.ceilingY,
      colliders: solids,
      prepareRaycastMeshes: () => [],
    });
    const runSalvo = (hasLineOfSight: NonNullable<KillstreakWorld['hasLineOfSight']>): ReadonlySet<string> => {
      const world: KillstreakWorld = {
        bounds: flightBounds,
        targets: [
          { id: 'owner', kind: 'player', team: 0, lifeId: 1, alive: true, position: [53, 1.7, 30] },
          ...dummyTargets,
        ],
        groundHeightAt: (x, z) => ground.heightAt(x, z),
        hasLineOfSight,
        supportStrikeBoundsAt: () => bay,
        resolveFlightEnvelopePosition: (from, desired, envelope) => resolveSupportAircraftEnvelopeStep({
          bounds: flightBounds,
          solids,
          from,
          desired,
          envelope,
        }).position,
      };
      const runtime = new HostKillstreakRuntime(70);
      runtime.registerActor('owner', 0, 1, loadout);
      expect(runtime.grantTrainingReward('owner', 1, 'carpet-bomber', {
        arenaId: 'gun-range',
        stationKind: 'secure-test-bay',
        authorityRole: 'host',
      })).toEqual({ accepted: true, reason: 'accepted' });
      expect(runtime.activate({
        by: 'owner',
        matchEpoch: 70,
        lifeId: 1,
        sequence: 1,
        slot: 1,
        activationId: 'gun-range-dummy-blast',
        expectedId: 'carpet-bomber',
        // The salvo weaves +/-5.2 m about the anchor line, and the four dummy
        // lanes sit 10 m apart at z = -16/-6/4/14, so an anchor on z = -1 puts
        // the weave's troughs directly down the bravo lane.
        anchor: [52.1, 0, -1],
        facing: [1, 0, 0],
      }, 1_000, world)).toMatchObject({ accepted: true, activatedId: 'carpet-bomber' });
      const damaged = new Set<string>();
      for (let elapsed = 0; elapsed < CARE_AIRCRAFT_DURATION_MS; elapsed += 50) {
        for (const event of runtime.advance(1_000 + elapsed, world).damageEvents) damaged.add(event.targetId);
      }
      return damaged;
    };
    // The defect, end to end: not one dummy in the bay could be damaged.
    expect([...runSalvo(naiveLineOfSight)].filter((id) => dummyIds.includes(id))).toEqual([]);
    expect([...runSalvo(endpointAwareLineOfSight)].filter((id) => dummyIds.includes(id)).length)
      .toBeGreaterThan(0);
  });

  it('is the predicate legacy-main actually ships', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(main).toContain(`const KILLSTREAK_LINE_OF_SIGHT_PADDING_M = ${LOS_PADDING_M};`);
    expect(main).toContain(`const KILLSTREAK_LINE_OF_SIGHT_INTERIOR_MARGIN_M = ${LOS_INTERIOR_MARGIN_M};`);
    expect(main).toContain('function killstreakSolidEnclosesPoint(box: Box2, point: { x: number; y: number; z: number }): boolean {');
    expect(main).toContain('return !solids.some((box) => segmentIntersectsBox(start, end, box, KILLSTREAK_LINE_OF_SIGHT_PADDING_M)\n'
      + '    && !killstreakSolidEnclosesPoint(box, start)\n'
      + '    && !killstreakSolidEnclosesPoint(box, end));');
  });
});
