import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  PILOTED_DRONE_TASER_CHARGES,
  PILOTED_DRONE_TASER_COOLDOWN_MS,
  PILOTED_DRONE_TASER_RANGE_M,
  TASER_STUN_DURATION_MS,
} from './killstreak-tuning';
import { HostKillstreakRuntime, type KillstreakWorld } from './killstreak-runtime';
import { supportForwardFromYawPitch } from './support-forward-axis';

/**
 * HF-458 item 3 in the host runtime: three charges per drone, automatic fire
 * while unpiloted, right-click while piloted, bots included, swarm excluded.
 */

const LOADOUT = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'piloted-drone', 'tri-pass', 'chopper', 'drone-swarm'],
});

function world(targets: KillstreakWorld['targets'] = []): KillstreakWorld {
  return {
    bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60, floorY: 0, ceilingY: 32 },
    targets,
    groundHeightAt: () => 0,
    hasLineOfSight: () => true,
    isFlightPositionValid: () => true,
  };
}

function deployDrone(slot: 2 | 5, expectedId: 'piloted-drone' | 'drone-swarm', kills: number) {
  const runtime = new HostKillstreakRuntime(7);
  runtime.registerActor('owner', 0, 1, LOADOUT);
  for (let index = 0; index < kills; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
  const activation = runtime.activate({
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot,
    activationId: `activation-taser-${expectedId}`, expectedId, anchor: [0, 0, 0],
  }, 1_000, world());
  expect(activation.accepted).toBe(true);
  return { runtime, entityId: activation.entityIds[0]! };
}

function hostileNear(runtime: HostKillstreakRuntime, nowMs: number, distanceM: number, id = 'enemy', kind: 'player' | 'bot' = 'player') {
  const drone = runtime.snapshotFor('owner', nowMs).entities[0]!;
  return {
    id,
    kind,
    team: 1 as const,
    lifeId: 4,
    alive: true,
    position: [drone.position[0] + distanceM, drone.position[1], drone.position[2]] as [number, number, number],
  };
}

describe('HF-458 Piloted Drone taser in the host runtime', () => {
  it('reports three charges on the replicated snapshot, and none for the swarm', () => {
    const piloted = deployDrone(2, 'piloted-drone', 5);
    expect(piloted.runtime.snapshotFor('owner', 1_000).entities[0]!.taserCharges).toBe(PILOTED_DRONE_TASER_CHARGES);
    const swarm = deployDrone(5, 'drone-swarm', 15);
    for (const entity of swarm.runtime.snapshotFor('owner', 1_000).entities) {
      expect(entity.taserCharges).toBeNull();
    }
  });

  it('auto-fires while unpiloted, spends exactly three charges, then stops', () => {
    const { runtime } = deployDrone(2, 'piloted-drone', 5);
    const target = hostileNear(runtime, 1_000, 5);
    const hostileWorld = world([target]);
    const stuns: string[] = [];
    for (let now = 1_000; now <= 1_000 + PILOTED_DRONE_TASER_COOLDOWN_MS * 6; now += 100) {
      for (const event of runtime.advance(now, hostileWorld).taserStunEvents) {
        stuns.push(`${event.targetId}:${event.chargesRemaining}:${event.pilotFired}`);
        expect(event.durationMs).toBe(TASER_STUN_DURATION_MS);
        expect(event.pilotFired).toBe(false);
        expect(event.ownerId).toBe('owner');
        expect(event.targetKind).toBe('player');
      }
    }
    expect(stuns).toEqual(['enemy:2:false', 'enemy:1:false', 'enemy:0:false']);
    expect(runtime.snapshotFor('owner', 20_000).entities[0]!.taserCharges).toBe(0);
  });

  it('holds fire on a hostile beyond the taser range until it has closed the distance', () => {
    const { runtime } = deployDrone(2, 'piloted-drone', 5);
    const far = hostileNear(runtime, 1_000, PILOTED_DRONE_TASER_RANGE_M + 12);
    const farWorld = world([far]);
    // The autonomous drone hunts, so it eventually reaches the hostile. What
    // must never happen is a stun authored from outside the taser range.
    let firstStunAtMs: number | null = null;
    let rangeAtFirstStun = Number.POSITIVE_INFINITY;
    for (let now = 1_000; now <= 12_000; now += 100) {
      const step = runtime.advance(now, farWorld);
      if (step.taserStunEvents.length > 0 && firstStunAtMs === null) {
        firstStunAtMs = now;
        const drone = runtime.snapshotFor('owner', now).entities[0]!;
        rangeAtFirstStun = Math.hypot(
          far.position[0] - drone.position[0],
          far.position[1] - drone.position[1],
          far.position[2] - drone.position[2],
        );
      }
      if (now === 1_000) expect(step.taserStunEvents).toHaveLength(0);
    }
    expect(firstStunAtMs).not.toBeNull();
    expect(rangeAtFirstStun).toBeLessThanOrEqual(PILOTED_DRONE_TASER_RANGE_M);
  });

  it('tasers bots as well as players', () => {
    const { runtime } = deployDrone(2, 'piloted-drone', 5);
    const botWorld = world([hostileNear(runtime, 1_000, 4, 'bot-alpha', 'bot')]);
    const events = [];
    for (let now = 1_000; now <= 3_000; now += 100) events.push(...runtime.advance(now, botWorld).taserStunEvents);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ targetId: 'bot-alpha', targetKind: 'bot', pilotFired: false });
  });

  it('stops auto-firing the moment a human takes the drone, and fires on right-click instead', () => {
    const { runtime, entityId } = deployDrone(2, 'piloted-drone', 5);
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-piloted-drone',
    }, 1_001).accepted).toBe(true);

    // The pilot's aim decides the victim, so place the hostile on the drone's
    // forward axis at yaw/pitch 0 - the pose the possession hands over.
    const drone = runtime.snapshotFor('owner', 1_001).entities[0]!;
    const forward = supportForwardFromYawPitch(0, 0);
    const aimed = {
      id: 'enemy', kind: 'player' as const, team: 1 as const, lifeId: 4, alive: true,
      position: [
        drone.position[0] + forward[0] * 8,
        drone.position[1] + forward[1] * 8,
        drone.position[2] + forward[2] * 8,
      ] as [number, number, number],
    };
    const hostileWorld = world([aimed]);

    // Piloted and NOT right-clicking: no automatic discharge at all.
    let idleStuns = 0;
    for (let now = 1_002; now <= 4_000; now += 100) idleStuns += runtime.advance(now, hostileWorld).taserStunEvents.length;
    expect(idleStuns).toBe(0);
    expect(runtime.snapshotFor('owner', 4_000).entities[0]!.taserCharges).toBe(PILOTED_DRONE_TASER_CHARGES);

    // Right-click fires exactly one.
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: 0, thrustQ: 0, strafeQ: 0, verticalQ: 0, taserFire: true,
    }, 4_100).accepted).toBe(true);
    const fired = runtime.advance(4_100, hostileWorld);
    expect(fired.taserStunEvents).toHaveLength(1);
    expect(fired.taserStunEvents[0]).toMatchObject({
      targetId: 'enemy',
      pilotFired: true,
      chargesRemaining: PILOTED_DRONE_TASER_CHARGES - 1,
      durationMs: TASER_STUN_DURATION_MS,
    });

    // A held right-click inside the cooldown is never queued for later.
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 3, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: 0, taserFire: true,
    }, 4_200).accepted).toBe(true);
    let queued = 0;
    for (let now = 4_200; now < 4_100 + PILOTED_DRONE_TASER_COOLDOWN_MS; now += 100) {
      queued += runtime.advance(now, hostileWorld).taserStunEvents.length;
    }
    expect(queued).toBe(0);
    expect(runtime.snapshotFor('owner', 4_900).entities[0]!.taserCharges).toBe(PILOTED_DRONE_TASER_CHARGES - 1);
  });

  it('refuses a taser request on the Chopper, which has no taser', () => {
    const runtime = new HostKillstreakRuntime(7);
    runtime.registerActor('owner', 0, 1, LOADOUT);
    for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
    const activation = runtime.activate({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
      activationId: 'activation-taser-chopper', expectedId: 'chopper', anchor: [0, 0, 0],
    }, 1_000, world());
    const entityId = activation.entityIds[0]!;
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, entityId, action: 'toggle-chopper-gunner',
    }, 1_001).accepted).toBe(true);
    expect(runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId,
      action: 'pilot-control', yawQ: 0, pitchQ: 0, taserFire: true,
    }, 1_002)).toMatchObject({ accepted: false, reason: 'taser-unavailable' });
  });
});
