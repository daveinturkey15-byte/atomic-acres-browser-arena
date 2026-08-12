import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange } from './additional-maps';
import { circleIntersectsBox, segmentIntersectsBox, sphereIntersectsBox, sweepSphereAgainstBoxes } from './collision';
import { FLAMETHROWER_GROUND_FIRE_PRESENTATION_RADIUS_M } from './flamethrower-stream-system';
import {
  GUN_RANGE_TEST_BAY_CONTRACT,
  GUN_RANGE_TEST_BAY_STRUCTURE,
  advanceGunRangeTestBayDoor,
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicColliders,
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
