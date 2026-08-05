import { describe, expect, it } from 'vitest';
import {
  FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
  MAX_FLARE_SHOOTER_FEEDBACK_CONTEXTS,
  advanceFlareAuthorityCheckpointThroughDowntime,
  advanceFlareShooterFeedbackThroughDowntime,
  isFlareAuthorityContinuationCheckpoint,
  isFlareShooterFeedbackCheckpoints,
  type FlareAuthorityContinuationCheckpoint,
  type FlareAuthorityContinuationEntity,
  type FlareShooterFeedbackCheckpoint,
} from './flare-authority-checkpoint';

function flight(ownerId = 'guest-1', actionNonce = 1): FlareAuthorityContinuationEntity {
  return Object.freeze({
    ownerId,
    ownerTeam: 1,
    actionNonce,
    phase: 'flight',
    position: Object.freeze([0, 2, 0] as const),
    velocity: Object.freeze([52, 0, 0] as const),
    remainingMs: 5_500,
    nextBurnPulseRemainingMs: null,
    burnPulseIndex: 0,
  });
}

function burn(ownerId = 'guest-2', actionNonce = 2): FlareAuthorityContinuationEntity {
  return Object.freeze({
    ownerId,
    ownerTeam: 1,
    actionNonce,
    phase: 'burn',
    position: Object.freeze([4, 0, 2] as const),
    velocity: null,
    remainingMs: 4_000,
    nextBurnPulseRemainingMs: 500,
    burnPulseIndex: 0,
  });
}

function authority(
  effects: readonly FlareAuthorityContinuationEntity[] = [flight()],
): FlareAuthorityContinuationCheckpoint {
  return Object.freeze({
    schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
    snapshotSeq: 9,
    effects,
  });
}

function feedback(ownerId = 'guest-1', actionNonce = 1): FlareShooterFeedbackCheckpoint {
  return Object.freeze({
    ownerId,
    actionNonce,
    shotId: `epochabcd:${actionNonce}`,
    connectionEpoch: 'epoch_abcd',
    lifeId: 3,
    shotSeq: actionNonce,
    weaponSequence: 4,
    fireTimeMs: 1_000,
    triggerStartedAtMs: 1_000,
    targetViewTimeMs: 950,
    origin: Object.freeze([0, 2, 0] as const),
    direction: Object.freeze([1, 0, 0] as const),
    pelletDirections: Object.freeze([
      Object.freeze([1, 0, 0] as const),
    ]) as readonly [readonly [number, number, number]],
    receivedAtHostTimeMs: 1_010,
    appliedRewindMs: 60,
    remainingMs: 5_000,
  });
}

describe('flare authority checkpoint', () => {
  it('requires an exact, sorted, unique, twelve-entity-bounded continuation', () => {
    const valid = authority([flight('guest-1', 1), burn('guest-2', 2)]);
    expect(isFlareAuthorityContinuationCheckpoint(valid)).toBe(true);
    expect(isFlareAuthorityContinuationCheckpoint({ ...valid, resumeToken: 'secret' })).toBe(false);
    expect(isFlareAuthorityContinuationCheckpoint(authority([burn('z-owner', 1), flight('a-owner', 1)]))).toBe(false);
    expect(isFlareAuthorityContinuationCheckpoint(authority([flight(), flight()]))).toBe(false);
    expect(isFlareAuthorityContinuationCheckpoint(authority(Array.from(
      { length: 13 },
      (_, index) => flight(`guest-${String(index).padStart(2, '0')}`, index),
    )))).toBe(false);
  });

  it('advances flight only, skips elapsed burn pulses and never retains expired effects', () => {
    const advanced = advanceFlareAuthorityCheckpointThroughDowntime(
      authority([flight('guest-1', 1), burn('guest-2', 2)]),
      1_100,
    )!;
    expect(advanced.skippedExpired).toBe(0);
    expect(advanced.skippedBurnPulses).toBe(2);
    expect(advanced.checkpoint.effects[0]).toMatchObject({
      ownerId: 'guest-1', phase: 'flight', remainingMs: 4_400,
    });
    expect(advanced.checkpoint.effects[0]!.position[0]).toBeCloseTo(57.2, 6);
    expect(advanced.checkpoint.effects[1]).toMatchObject({
      ownerId: 'guest-2', phase: 'burn', remainingMs: 2_900,
      nextBurnPulseRemainingMs: 400, burnPulseIndex: 2,
    });

    const expired = advanceFlareAuthorityCheckpointThroughDowntime(authority([burn()]), 4_000)!;
    expect(expired.checkpoint.effects).toEqual([]);
    expect(expired.skippedExpired).toBe(1);
    expect(expired.skippedBurnPulses).toBe(8);
  });

  it('persists only exact guest-shot feedback paired to an active effect and prunes it with downtime', () => {
    const state = authority([flight('guest-1', 1), flight('guest-2', 2)]);
    const contexts = [feedback('guest-1', 1), feedback('guest-2', 2)];
    expect(isFlareShooterFeedbackCheckpoints(contexts, state)).toBe(true);
    expect(isFlareShooterFeedbackCheckpoints(contexts, {
      ...state, effects: [...state.effects].reverse(),
    })).toBe(false);
    expect(isFlareShooterFeedbackCheckpoints([{ ...contexts[0]!, resumeToken: 'secret' }], state)).toBe(false);
    expect(isFlareShooterFeedbackCheckpoints([feedback('missing-guest', 3)], state)).toBe(false);
    expect(isFlareShooterFeedbackCheckpoints([...contexts].reverse(), state)).toBe(false);
    expect(isFlareShooterFeedbackCheckpoints(Array.from(
      { length: MAX_FLARE_SHOOTER_FEEDBACK_CONTEXTS + 1 },
      (_, index) => feedback(`guest-${String(index).padStart(2, '0')}`, index),
    ), state)).toBe(false);

    const advancedAuthority = advanceFlareAuthorityCheckpointThroughDowntime(state, 1_000)!.checkpoint;
    const advanced = advanceFlareShooterFeedbackThroughDowntime(contexts, advancedAuthority, 1_000)!;
    expect(advanced.map((entry) => entry.remainingMs)).toEqual([4_000, 4_000]);
    expect(Object.isFrozen(advanced)).toBe(true);
    expect(advanceFlareShooterFeedbackThroughDowntime(contexts, advancedAuthority, 5_000)).toEqual([]);
  });
});
