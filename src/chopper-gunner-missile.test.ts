import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  CHOPPER_MISSILE_CADENCE_MS,
  CHOPPER_MISSILE_CAPACITY,
  CHOPPER_MISSILE_FLIGHT_MS,
  CHOPPER_MISSILE_SOCKET_LOCAL_M,
  HostKillstreakRuntime,
  chopperMissileLaunchPosition,
  chopperMissileGroundTarget,
  type KillstreakWorld,
} from './killstreak-runtime';

const LOADOUT = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
});

function world(targets: KillstreakWorld['targets'] = []): KillstreakWorld {
  return {
    bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80, floorY: 0, ceilingY: 48 },
    targets,
    groundHeightAt: () => 0,
    hasLineOfSight: () => true,
    isFlightPositionValid: () => true,
  };
}

function setup(enterControl = true): Readonly<{ runtime: HostKillstreakRuntime; entityId: string }> {
  const runtime = new HostKillstreakRuntime(7);
  runtime.registerActor('owner', 0, 1, LOADOUT);
  for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
  const activation = runtime.activate({
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
    activationId: 'activation-chopper-missile', expectedId: 'chopper', anchor: [0, 0, 0],
  }, 1_000, world());
  const entityId = activation.entityIds[0]!;
  if (enterControl) expect(runtime.control({
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId,
    action: 'toggle-chopper-gunner',
  }, 1_001)).toMatchObject({ accepted: true });
  return { runtime, entityId };
}

describe('Pass 70 host-authoritative Chopper Gunner missiles', () => {
  it('launches from alternating authored hardpoints under a banked host pose', () => {
    const position = [13, 18, -7] as const;
    const attitude = [0.31, -0.22, 0.47] as const;
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...attitude, 'YXZ'));
    const independentlyProjected = (local: readonly [number, number, number]) => new THREE.Vector3(...local)
      .applyQuaternion(quaternion)
      .add(new THREE.Vector3(...position))
      .toArray();
    const left = chopperMissileLaunchPosition(position, attitude, 0);
    const right = chopperMissileLaunchPosition(position, attitude, 1);
    expect(left).toEqual(independentlyProjected(CHOPPER_MISSILE_SOCKET_LOCAL_M.left));
    expect(right).toEqual(independentlyProjected(CHOPPER_MISSILE_SOCKET_LOCAL_M.right));
    expect(chopperMissileLaunchPosition(position, attitude, 2)).toEqual(left);
    expect(left).not.toEqual(right);
  });

  it('admits only possessed edge requests, owns six rounds, and never queues cooldown clicks', () => {
    const outside = setup(false);
    expect(outside.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId: outside.entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
    }, 1_010)).toMatchObject({ accepted: false, reason: 'not-gun-controller' });
    expect(outside.runtime.snapshotFor('owner', 1_010).entities[0]).toMatchObject({
      missileAmmo: CHOPPER_MISSILE_CAPACITY,
      missileCooldownMs: 0,
    });

    const { runtime, entityId } = setup();
    let sequence = 2;
    let now = 1_100;
    for (let ordinal = 0; ordinal < CHOPPER_MISSILE_CAPACITY; ordinal += 1) {
      expect(runtime.control({
        by: 'owner', matchEpoch: 7, lifeId: 1, sequence, entityId,
        action: 'pilot-control', yawQ: 0.2, pitchQ: -1, missileFire: true,
      }, now).accepted).toBe(true);
      sequence += 1;
      const launch = runtime.advance(now, world());
      expect(launch.impactEvents).toContainEqual(expect.objectContaining({
        source: 'chopper', ordinal, phase: 'drop', atMs: now, impactAtMs: now + CHOPPER_MISSILE_FLIGHT_MS,
      }));
      expect(runtime.snapshotFor('owner', now).entities[0]).toMatchObject({
        missileAmmo: CHOPPER_MISSILE_CAPACITY - ordinal - 1,
        missileCooldownMs: CHOPPER_MISSILE_CADENCE_MS,
      });

      if (ordinal === 0) {
        expect(runtime.control({
          by: 'owner', matchEpoch: 7, lifeId: 1, sequence, entityId,
          action: 'pilot-control', yawQ: 0.2, pitchQ: -1, missileFire: true,
        }, now + 500).accepted).toBe(true);
        sequence += 1;
        const cooldown = runtime.advance(now + 500, world());
        expect(cooldown.impactEvents.filter((event) => event.phase === 'drop')).toEqual([]);
        expect(runtime.snapshotFor('owner', now + 500).entities[0].missileAmmo).toBe(5);
      }
      now += CHOPPER_MISSILE_CADENCE_MS;
    }

    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
    }, now).accepted).toBe(true);
    expect(runtime.advance(now, world()).impactEvents.filter((event) => event.phase === 'drop')).toEqual([]);
    expect(runtime.snapshotFor('owner', now).entities[0].missileAmmo).toBe(0);
  });

  it('derives the target from the host ray and emits replicated impact plus damage receipts', () => {
    const { runtime, entityId } = setup();
    const before = runtime.snapshotFor('owner', 1_100).entities[0]!;
    const targetPoint = chopperMissileGroundTarget(before.position, before.attitude, 0, -1.2, world());
    const impactWorld = world([{
      id: 'enemy', kind: 'player', team: 1, lifeId: 4, alive: true,
      position: [targetPoint[0], targetPoint[1] + 1.1, targetPoint[2]],
    }]);
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -1.2, missileFire: true,
    }, 1_100).accepted).toBe(true);
    const launch = runtime.advance(1_100, impactWorld);
    expect(launch.impactEvents).toEqual([expect.objectContaining({
      source: 'chopper', ordinal: 0, phase: 'drop', position: targetPoint,
    })]);
    const launchEvent = launch.impactEvents[0]!;
    expect(launchEvent.launchPosition).toEqual(chopperMissileLaunchPosition(before.position, before.attitude, 0));
    expect(launchEvent.launchPosition).not.toEqual(targetPoint);
    const impact = runtime.advance(1_100 + CHOPPER_MISSILE_FLIGHT_MS, impactWorld);
    expect(impact.impactEvents).toEqual([expect.objectContaining({
      source: 'chopper', ordinal: 0, phase: 'impact', position: targetPoint,
      launchPosition: launchEvent.launchPosition,
    })]);
    expect(impact.damageEvents).toEqual([expect.objectContaining({
      source: 'chopper', ownerId: 'owner', targetId: 'enemy', targetLifeId: 4,
    })]);
  });

  it('clears a pending RMB request on exit, death, and match teardown', () => {
    const exit = setup();
    expect(exit.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: exit.entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
    }, 1_100).accepted).toBe(true);
    expect(exit.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId: exit.entityId,
      action: 'toggle-chopper-gunner',
    }, 1_101).accepted).toBe(true);
    expect(exit.runtime.advance(1_102, world()).impactEvents).toEqual([]);
    expect(exit.runtime.snapshotFor('owner', 1_102).entities[0].missileAmmo).toBe(CHOPPER_MISSILE_CAPACITY);

    const death = setup();
    death.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: death.entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
    }, 1_100);
    death.runtime.recordActorDeath('owner', 2);
    expect(death.runtime.advance(1_101, world()).impactEvents).toEqual([]);
    expect(death.runtime.snapshotFor('owner', 1_101).actors[0].possession).toBeNull();

    const rematch = setup();
    rematch.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: rematch.entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
    }, 1_100);
    expect(rematch.runtime.endMatch()).toContain(rematch.entityId);
    expect(rematch.runtime.advance(2_000, world())).toEqual({
      damageEvents: [], impactEvents: [], expiredEntityIds: [],
    });
  });
});
