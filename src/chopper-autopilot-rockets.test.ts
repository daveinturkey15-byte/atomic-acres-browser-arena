import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { CHOPPER_AUTOPILOT_MISSILE_CADENCE_MS } from './killstreak-tuning';
import {
  CHOPPER_AUTOPILOT_MISSILE_BUDGET,
  CHOPPER_MISSILE_CAPACITY,
  HostKillstreakRuntime,
  type KillstreakWorld,
} from './killstreak-runtime';

/**
 * HF-458 item 1, owner 2026-09-02: "rockets 6 -> 12 total. On autopilot it
 * fires only 6; a human who takes control can use the extra 6... ensure it is
 * also using those rockets."
 *
 * The defect this file pins: before HF-458 the autopilot could not fire a
 * rocket at all. `pendingPlayerMissile` is only ever set by a possessing human,
 * so an unpossessed Chopper carried its whole payload for thirty seconds and
 * landed with it. A Chopper that nobody enters must now spend its half.
 */

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

const HOSTILE = Object.freeze({
  id: 'enemy', kind: 'player' as const, team: 1 as const, lifeId: 4, alive: true,
  position: [4, 1.7, 6] as const,
});

function activate(): Readonly<{ runtime: HostKillstreakRuntime; entityId: string }> {
  const runtime = new HostKillstreakRuntime(7);
  runtime.registerActor('owner', 0, 1, LOADOUT);
  for (let index = 0; index < 8; index += 1) runtime.recordEligibleElimination('owner', 'weapon');
  const activation = runtime.activate({
    by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 1, slot: 4,
    activationId: 'activation-chopper-autopilot', expectedId: 'chopper', anchor: [0, 0, 0],
  }, 1_000, world());
  expect(activation.accepted).toBe(true);
  return { runtime, entityId: activation.entityIds[0]! };
}

/** Steps the host in 100 ms ticks and counts autopilot launches. */
function runAutopilot(
  runtime: HostKillstreakRuntime,
  fromMs: number,
  toMs: number,
  hostileWorld: KillstreakWorld,
): number {
  let launches = 0;
  for (let now = fromMs; now <= toMs; now += 100) {
    const step = runtime.advance(now, hostileWorld);
    launches += step.impactEvents.filter((event) => event.source === 'chopper' && event.phase === 'drop').length;
  }
  return launches;
}

describe('HF-458 Chopper autopilot rockets', () => {
  it('actually launches rockets at a visible hostile while on autopilot', () => {
    const { runtime } = activate();
    const hostileWorld = world([HOSTILE]);
    const launches = runAutopilot(runtime, 1_000, 1_000 + 3 * CHOPPER_AUTOPILOT_MISSILE_CADENCE_MS, hostileWorld);
    expect(launches).toBeGreaterThan(0);
    const snapshot = runtime.snapshotFor('owner', 1_000 + 3 * CHOPPER_AUTOPILOT_MISSILE_CADENCE_MS);
    expect(snapshot.entities[0]!.missileAmmo).toBe(CHOPPER_MISSILE_CAPACITY - launches);
  });

  it('stops at exactly six, leaving the other six for a human who takes the gun', () => {
    const { runtime, entityId } = activate();
    const hostileWorld = world([HOSTILE]);
    // Run the airframe out to its expiry window on autopilot.
    const launches = runAutopilot(runtime, 1_000, 30_500, hostileWorld);
    expect(launches).toBe(CHOPPER_AUTOPILOT_MISSILE_BUDGET);
    const afterAutopilot = runtime.snapshotFor('owner', 30_500).entities[0]!;
    expect(afterAutopilot.missileAmmo).toBe(CHOPPER_MISSILE_CAPACITY - CHOPPER_AUTOPILOT_MISSILE_BUDGET);
    expect(afterAutopilot.missileAmmo).toBe(6);
    expect(entityId).toBe(afterAutopilot.id);
  });

  it('never launches with no visible hostile, and never past the autopilot range', () => {
    const empty = activate();
    expect(runAutopilot(empty.runtime, 1_000, 12_000, world())).toBe(0);
    expect(empty.runtime.snapshotFor('owner', 12_000).entities[0]!.missileAmmo).toBe(CHOPPER_MISSILE_CAPACITY);

    const distant = activate();
    const farWorld = world([{ ...HOSTILE, position: [0, 1.7, 79] }]);
    expect(runAutopilot(distant.runtime, 1_000, 12_000, farWorld)).toBe(0);
  });

  it('hands the remaining payload to a human, who can spend all twelve if they take it first', () => {
    // Autopilot spends its six, then a human possesses and spends the rest.
    const shared = activate();
    const hostileWorld = world([HOSTILE]);
    expect(runAutopilot(shared.runtime, 1_000, 20_000, hostileWorld)).toBe(CHOPPER_AUTOPILOT_MISSILE_BUDGET);
    expect(shared.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: shared.entityId,
      action: 'toggle-chopper-gunner',
    }, 20_100).accepted).toBe(true);
    let now = 20_200;
    let humanLaunches = 0;
    let sequence = 3;
    for (let shot = 0; shot < 10; shot += 1) {
      shared.runtime.control({
        by: 'owner', matchEpoch: 7, lifeId: 1, sequence, entityId: shared.entityId,
        action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
      }, now);
      sequence += 1;
      humanLaunches += shared.runtime.advance(now, hostileWorld).impactEvents
        .filter((event) => event.phase === 'drop').length;
      now += 1_000;
    }
    expect(humanLaunches).toBe(CHOPPER_MISSILE_CAPACITY - CHOPPER_AUTOPILOT_MISSILE_BUDGET);
    expect(shared.runtime.snapshotFor('owner', now).entities[0]!.missileAmmo).toBe(0);

    // Taken on frame one, the same human gets the whole twelve: the budget caps
    // the AUTOPILOT, it is not a second magazine hidden from the pilot.
    const early = activate();
    expect(early.runtime.control({
      by: 'owner', matchEpoch: 7, lifeId: 1, sequence: 2, entityId: early.entityId,
      action: 'toggle-chopper-gunner',
    }, 1_001).accepted).toBe(true);
    let earlyNow = 1_100;
    let earlyLaunches = 0;
    let earlySequence = 3;
    for (let shot = 0; shot < CHOPPER_MISSILE_CAPACITY + 2; shot += 1) {
      early.runtime.control({
        by: 'owner', matchEpoch: 7, lifeId: 1, sequence: earlySequence, entityId: early.entityId,
        action: 'pilot-control', yawQ: 0, pitchQ: -1, missileFire: true,
      }, earlyNow);
      earlySequence += 1;
      earlyLaunches += early.runtime.advance(earlyNow, hostileWorld).impactEvents
        .filter((event) => event.phase === 'drop').length;
      earlyNow += 1_000;
    }
    expect(earlyLaunches).toBe(CHOPPER_MISSILE_CAPACITY);
  });
});
