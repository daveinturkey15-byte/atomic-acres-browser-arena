import { describe, expect, it } from 'vitest';
import { createRandomStreams, DeterministicRng, seedFromString } from './deterministic-rng';
import { configureRuntimeRandom, gameplayRandom, presentationRandom, protocolRandom, runtimeRandomTelemetry, runtimeSeed } from './runtime-random';

describe('deterministic random streams', () => {
  it('repeats exactly from the same seed', () => {
    const first = new DeterministicRng('pass25a');
    const second = new DeterministicRng('pass25a');
    expect(Array.from({ length: 64 }, () => first.nextUint32())).toEqual(Array.from({ length: 64 }, () => second.nextUint32()));
  });

  it('keeps presentation and protocol sampling from perturbing gameplay', () => {
    const first = createRandomStreams(42);
    const second = createRandomStreams(42);
    for (let index = 0; index < 100; index += 1) {
      first.presentation.next();
      first.protocol.next();
    }
    expect(Array.from({ length: 32 }, () => first.gameplay.next())).toEqual(Array.from({ length: 32 }, () => second.gameplay.next()));
  });

  it('produces bounded values and stable string seeds', () => {
    const rng = new DeterministicRng(seedFromString('Atomic Acres'));
    for (let index = 0; index < 1_000; index += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('exposes a query-seeded runtime seam without cross-stream perturbation', () => {
    expect(runtimeSeed('?seed=frozen-pass25a', undefined)).toBe('frozen-pass25a');
    configureRuntimeRandom('frozen-pass25a');
    const expectedGameplay = gameplayRandom();
    configureRuntimeRandom('frozen-pass25a');
    for (let index = 0; index < 32; index += 1) {
      presentationRandom();
      protocolRandom();
    }
    expect(gameplayRandom()).toBe(expectedGameplay);
    expect(runtimeRandomTelemetry()).toMatchObject({ seed: 'frozen-pass25a', protocolState: expect.any(Number) });
  });
});
