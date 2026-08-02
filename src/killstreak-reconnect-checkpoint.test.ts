import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import {
  HostKillstreakRuntime,
  isKillstreakRuntimeCheckpoint,
  type KillstreakActivationIntent,
  type KillstreakWorld,
} from './killstreak-runtime';

const LOADOUT = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['adrenaline', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
});

const WORLD: KillstreakWorld = {
  bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40, floorY: 0, ceilingY: 40 },
  targets: [],
  hasLineOfSight: () => true,
  isFlightPositionValid: () => true,
};

function earnCycles(runtime: HostKillstreakRuntime, actorId: string, cycles: number): void {
  for (let index = 0; index < cycles * 15; index += 1) {
    runtime.recordEligibleElimination(actorId, 'weapon');
  }
}

function activation(
  by: string,
  lifeId: number,
  sequence: number,
  activationId: string,
): KillstreakActivationIntent {
  return {
    by,
    matchEpoch: 42,
    lifeId,
    sequence,
    slot: 1,
    activationId,
    expectedId: 'adrenaline',
    anchor: [0, 0, 0],
  };
}

describe('killstreak reconnect checkpoint', () => {
  it('exposes only the host-owned actor life used to adopt a replacement transport', () => {
    const runtime = new HostKillstreakRuntime(42);
    runtime.registerActor('guest-1', 1, 7, LOADOUT);
    expect(runtime.actorLifeId('guest-1')).toBe(7);
    expect(runtime.actorLifeId('missing')).toBeNull();
    runtime.recordActorDeath('guest-1', 8);
    expect(runtime.actorLifeId('guest-1')).toBe(8);
  });

  it('restores two same-life ladder cycles, charges, counters and replay identity without minting grants', () => {
    const runtime = new HostKillstreakRuntime(42);
    runtime.registerActor('host-1', 0, 9, LOADOUT);
    runtime.registerActor('guest-1', 1, 4, LOADOUT);
    earnCycles(runtime, 'host-1', 2);
    earnCycles(runtime, 'guest-1', 2);

    expect(runtime.activate(activation('host-1', 9, 3, 'activation-host-before-crash'), 1_000, WORLD)).toMatchObject({ accepted: true });
    expect(runtime.activate(activation('guest-1', 4, 7, 'activation-guest-before-crash'), 1_000, WORLD)).toMatchObject({ accepted: true });
    const checkpoint = runtime.checkpoint(1_100);
    expect(checkpoint).not.toBeNull();
    expect(isKillstreakRuntimeCheckpoint(checkpoint)).toBe(true);
    expect(JSON.stringify(checkpoint)).not.toMatch(/resumeToken|possession|trainingReward/i);

    const restored = new HostKillstreakRuntime(42);
    expect(restored.restoreCheckpoint(checkpoint, 5_000, 5_000)).toBe(true);
    const snapshot = restored.snapshotFor('host-1', 5_000);
    expect(snapshot.actors).toEqual([
      expect.objectContaining({
        actorId: 'guest-1', lifeId: 4, streak: 30, cycleProgress: 0,
        availableCharges: [
          { id: 'adrenaline', count: 1 }, { id: 'yardhawk', count: 2 },
          { id: 'tri-pass', count: 2 }, { id: 'chopper', count: 2 }, { id: 'nuke', count: 2 },
        ],
      }),
      expect.objectContaining({
        actorId: 'host-1', lifeId: 9, streak: 30, cycleProgress: 0,
        adrenalineRemainingMs: 9_900,
        availableCharges: [
          { id: 'adrenaline', count: 1 }, { id: 'yardhawk', count: 2 },
          { id: 'tri-pass', count: 2 }, { id: 'chopper', count: 2 }, { id: 'nuke', count: 2 },
        ],
      }),
    ]);

    // The host sequence domain resumes exactly where the checkpoint stopped.
    expect(restored.activate(activation('host-1', 9, 1, 'activation-host-new-id'), 5_001, WORLD)).toMatchObject({
      accepted: false,
      reason: 'replayed-sequence',
    });

    // A replacement guest transport receives a fresh sequence domain, while
    // the epoch-wide request ID remains replay protected across the crash.
    restored.recordActorDisconnect('guest-1');
    expect(restored.activate(activation('guest-1', 4, 1, 'activation-guest-before-crash'), 5_002, WORLD)).toMatchObject({
      accepted: false,
      reason: 'duplicate-activation-id',
    });
    expect(restored.activate(activation('guest-1', 4, 1, 'activation-guest-after-rejoin'), 5_003, WORLD)).toMatchObject({
      accepted: true,
    });
    expect(restored.snapshotFor('guest-1', 5_003).actors.find((actor) => actor.actorId === 'guest-1')?.availableCharges[0]).toEqual({
      id: 'yardhawk',
      count: 2,
    });
    expect(restored.restoreCheckpoint(checkpoint, 5_004)).toBe(false);
  });

  it('fails closed on epoch mismatch, unknown fields and forged ladder state', () => {
    const runtime = new HostKillstreakRuntime(42);
    runtime.registerActor('host-1', 0, 9, LOADOUT);
    earnCycles(runtime, 'host-1', 1);
    const checkpoint = runtime.checkpoint(1_000)!;

    expect(new HostKillstreakRuntime(43).restoreCheckpoint(checkpoint, 2_000)).toBe(false);
    expect(isKillstreakRuntimeCheckpoint({ ...checkpoint, extra: true })).toBe(false);
    expect(isKillstreakRuntimeCheckpoint({
      ...checkpoint,
      actors: [{ ...checkpoint.actors[0], cycleProgress: 14, earned: [] }],
    })).toBe(false);
    expect(isKillstreakRuntimeCheckpoint({
      ...checkpoint,
      actors: [{
        ...checkpoint.actors[0],
        availableCharges: [{ id: 'adrenaline', count: 256 }],
      }],
    })).toBe(false);
  });
});
