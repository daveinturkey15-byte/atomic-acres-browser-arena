import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FLASH_AUTHORITY_SCHEMA_VERSION,
  FLASH_MAX_DURATION_MS,
  FlashHostAuthority,
  FlashVictimResultConsumer,
  flashActivationId,
  type FlashResult,
} from './flash-authority';

function resolveOne(
  authority: FlashHostAuthority,
  index: number,
  targetLifeId = 7,
  intensity = 0.8,
  durationMs = 2_400,
): FlashResult {
  const resolution = authority.resolveDetonation({
    matchEpoch: 12,
    activationId: flashActivationId(12, 'host', 100 + index),
    startsAtHostTimeMs: 1_000 + index * 100,
    victims: [{ targetId: 'guest', targetLifeId, intensity, durationMs }],
  });
  expect(resolution).toMatchObject({ accepted: true, reason: 'accepted' });
  return resolution.results[0]!;
}

describe('FlashHostAuthority', () => {
  it('allows only the host to author a bounded victim-life result', () => {
    const replica = new FlashHostAuthority(12, 'replica');
    expect(replica.resolveDetonation({
      matchEpoch: 12,
      activationId: flashActivationId(12, 'guest', 1),
      startsAtHostTimeMs: 1_000,
      victims: [{ targetId: 'host', targetLifeId: 4, intensity: 1, durationMs: 2_800 }],
    })).toMatchObject({ accepted: false, reason: 'not-host', results: [] });
    expect(replica.telemetry()).toMatchObject({ resolvedActivations: 0, rejectedNotHost: 1 });

    const host = new FlashHostAuthority(12, 'host');
    const result = resolveOne(host, 0);
    expect(result).toMatchObject({
      schemaVersion: FLASH_AUTHORITY_SCHEMA_VERSION,
      matchEpoch: 12,
      targetId: 'guest',
      targetLifeId: 7,
      sequence: 1,
      intensityQ: 800,
      startsAtHostTimeMs: 1_000,
      endsAtHostTimeMs: 3_400,
    });
  });

  it('resolves one activation exactly once and sequences each victim life independently', () => {
    const host = new FlashHostAuthority(12, 'host');
    const activationId = flashActivationId(12, 'host', 41);
    const first = host.resolveDetonation({
      matchEpoch: 12,
      activationId,
      startsAtHostTimeMs: 5_000,
      victims: [
        { targetId: 'guest', targetLifeId: 3, intensity: 1, durationMs: FLASH_MAX_DURATION_MS },
        { targetId: 'friend', targetLifeId: 9, intensity: 0.5, durationMs: 1_400 },
      ],
    });
    expect(first.results.map((entry) => entry.sequence)).toEqual([1, 1]);
    expect(host.resolveDetonation({
      matchEpoch: 12,
      activationId,
      startsAtHostTimeMs: 5_001,
      victims: [{ targetId: 'guest', targetLifeId: 3, intensity: 1, durationMs: FLASH_MAX_DURATION_MS }],
    })).toMatchObject({ accepted: false, reason: 'replay', results: [] });
    expect(resolveOne(host, 2, 3).sequence).toBe(2);
    expect(resolveOne(host, 3, 4).sequence).toBe(1);
  });

  it('rejects wrong epochs, duplicate victims, and out-of-contract values without partial results', () => {
    const host = new FlashHostAuthority(12, 'host');
    expect(host.resolveDetonation({
      matchEpoch: 11,
      activationId: flashActivationId(11, 'host', 1),
      startsAtHostTimeMs: 1_000,
      victims: [],
    })).toMatchObject({ accepted: false, reason: 'wrong-epoch' });
    expect(host.resolveDetonation({
      matchEpoch: 12,
      activationId: flashActivationId(12, 'host', 2),
      startsAtHostTimeMs: 1_000,
      victims: [
        { targetId: 'guest', targetLifeId: 1, intensity: 0.8, durationMs: 2_000 },
        { targetId: 'guest', targetLifeId: 1, intensity: 0.2, durationMs: 400 },
      ],
    })).toMatchObject({ accepted: false, reason: 'malformed', results: [] });
    expect(host.resolveDetonation({
      matchEpoch: 12,
      activationId: flashActivationId(12, 'host', 3),
      startsAtHostTimeMs: 1_000,
      victims: [{ targetId: 'guest', targetLifeId: 1, intensity: 1.01, durationMs: 2_000 }],
    })).toMatchObject({ accepted: false, reason: 'malformed', results: [] });
    expect(host.resolveDetonation({
      matchEpoch: 12,
      activationId: `flash:${'a'.repeat(123)}`,
      startsAtHostTimeMs: 1_000,
      victims: [{ targetId: 'guest', targetLifeId: 1, intensity: 1, durationMs: 2_000 }],
    })).toMatchObject({ accepted: false, reason: 'malformed', results: [] });
  });
});

describe('FlashVictimResultConsumer', () => {
  it('admits synchronized remaining host duration once and rejects duplicate, stale-life and reordered results', () => {
    const host = new FlashHostAuthority(12, 'host');
    const first = resolveOne(host, 0);
    const second = resolveOne(host, 1);
    const consumer = new FlashVictimResultConsumer(12, 'guest', 7);
    expect(consumer.admit(first, 1_350)).toMatchObject({
      accepted: true,
      intensity: 0.8,
      remainingDurationMs: 2_050,
    });
    expect(consumer.admit(first, 1_351)).toMatchObject({ accepted: false, reason: 'duplicate' });
    expect(consumer.admit({ ...second, targetLifeId: 6 }, 1_500)).toMatchObject({ accepted: false, reason: 'stale-life' });
    expect(consumer.admit({ ...second, sequence: 3 }, 1_500)).toMatchObject({ accepted: false, reason: 'out-of-order' });
    expect(consumer.admit(second, 1_500)).toMatchObject({ accepted: true, remainingDurationMs: 2_000 });
    expect(consumer.telemetry()).toMatchObject({ lastSequence: 2, accepted: 2 });
  });

  it('consumes an expired sequence without ever restarting its full duration', () => {
    const host = new FlashHostAuthority(12, 'host');
    const result = resolveOne(host, 0, 7, 1, 500);
    const consumer = new FlashVictimResultConsumer(12, 'guest', 7);
    expect(consumer.admit(result, result.endsAtHostTimeMs + 1)).toMatchObject({
      accepted: false,
      reason: 'expired',
      remainingDurationMs: 0,
    });
    expect(consumer.admit(result, result.startsAtHostTimeMs)).toMatchObject({ accepted: false, reason: 'duplicate' });
    expect(consumer.telemetry()).toMatchObject({ lastSequence: 1, accepted: 0 });
  });

  it('resets sequence and replay memory only for an explicit new victim life', () => {
    const host = new FlashHostAuthority(12, 'host');
    const oldLife = resolveOne(host, 0, 7);
    const nextLife = resolveOne(host, 1, 8);
    const consumer = new FlashVictimResultConsumer(12, 'guest', 7);
    expect(consumer.admit(oldLife, 1_100).accepted).toBe(true);
    consumer.reset(12, 'guest', 8);
    expect(consumer.admit(oldLife, 1_100)).toMatchObject({ accepted: false, reason: 'stale-life' });
    expect(consumer.admit(nextLife, 1_200)).toMatchObject({ accepted: true, reason: 'accepted' });
  });

  it('property: ordered results admit once while arbitrary replay copies never extend recovery', () => {
    fc.assert(fc.property(
      fc.array(fc.record({
        intensity: fc.double({ min: 0.02, max: 1, noNaN: true }),
        durationMs: fc.integer({ min: 1, max: FLASH_MAX_DURATION_MS }),
        delayMs: fc.integer({ min: 0, max: 900 }),
        replayCount: fc.integer({ min: 0, max: 3 }),
      }), { minLength: 1, maxLength: 30 }),
      (samples) => {
        const host = new FlashHostAuthority(12, 'host');
        const consumer = new FlashVictimResultConsumer(12, 'guest', 7);
        for (let index = 0; index < samples.length; index += 1) {
          const sample = samples[index]!;
          const result = resolveOne(host, index, 7, sample.intensity, sample.durationMs);
          const now = result.startsAtHostTimeMs + Math.min(sample.delayMs, sample.durationMs - 1);
          const admitted = consumer.admit(result, now);
          expect(admitted.accepted).toBe(true);
          expect(admitted.remainingDurationMs).toBe(result.endsAtHostTimeMs - now);
          for (let replay = 0; replay < sample.replayCount; replay += 1) {
            expect(consumer.admit(result, result.startsAtHostTimeMs)).toMatchObject({
              accepted: false,
              reason: 'duplicate',
              remainingDurationMs: 0,
            });
          }
        }
        expect(consumer.telemetry().accepted).toBe(samples.length);
      },
    ), { numRuns: 100 });
  });
});
