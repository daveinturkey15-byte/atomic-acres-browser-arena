import { describe, expect, it } from 'vitest';
import {
  HIT_REACTION_SHAPES,
  MAXIMUM_CONCURRENT_HIT_IMPULSES,
  MAXIMUM_HIT_REACTION_OFFSET_RADIANS,
  MAXIMUM_HIT_REACTION_WEIGHT,
  advanceHitReaction,
  createHitReactionState,
  hitImpulseDurationSeconds,
  hitImpulseEnvelope,
  pushHitImpulse,
  type HitReactionZone,
} from './animation-hit-reaction';

const ZONES: readonly HitReactionZone[] = ['head', 'body', 'limb'];

describe('hitImpulseEnvelope', () => {
  it('starts at zero, peaks at the rise, and is exactly zero once spent', () => {
    for (const zone of ZONES) {
      const shape = HIT_REACTION_SHAPES[zone];
      expect(hitImpulseEnvelope(0, shape), zone).toBe(0);
      expect(hitImpulseEnvelope(shape.riseSeconds, shape), zone).toBeCloseTo(1, 12);
      expect(hitImpulseEnvelope(shape.riseSeconds + shape.decaySeconds, shape), zone).toBe(0);
      expect(hitImpulseEnvelope(99, shape), zone).toBe(0);
    }
  });

  it('rises monotonically and decays monotonically with no discontinuity', () => {
    const shape = HIT_REACTION_SHAPES.body;
    const step = hitImpulseDurationSeconds('body') / 400;
    let previous = 0;
    let age = 0;
    while (age < shape.riseSeconds) {
      const value = hitImpulseEnvelope(age, shape);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(Math.abs(value - previous)).toBeLessThan(0.05);
      previous = value;
      age += step;
    }
    previous = 1;
    age = shape.riseSeconds;
    while (age < shape.riseSeconds + shape.decaySeconds) {
      const value = hitImpulseEnvelope(age, shape);
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      expect(Math.abs(value - previous)).toBeLessThan(0.05);
      previous = value;
      age += step;
    }
  });

  it('scores a head hit above a body hit above a limb hit', () => {
    expect(HIT_REACTION_SHAPES.head.peak).toBeGreaterThan(HIT_REACTION_SHAPES.body.peak);
    expect(HIT_REACTION_SHAPES.body.peak).toBeGreaterThan(HIT_REACTION_SHAPES.limb.peak);
  });
});

describe('advanceHitReaction', () => {
  it('is silent until something hits', () => {
    const state = createHitReactionState();
    const output = advanceHitReaction(state, 1 / 60);
    expect(output.clipWeight).toBe(0);
    expect(output.activeImpulses).toBe(0);
  });

  it('returns to exactly zero, unlike a clamped one-shot', () => {
    const state = createHitReactionState();
    pushHitImpulse(state, { zone: 'head', severity: 1, incomingYawRadians: 0 });
    let output = advanceHitReaction(state, 0);
    let peak = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      output = advanceHitReaction(state, 1 / 120);
      peak = Math.max(peak, output.clipWeight);
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(output.clipWeight).toBe(0);
    expect(output.activeImpulses).toBe(0);
    expect(output.pitchOffsetRadians).toBe(0);
    expect(output.rollOffsetRadians).toBe(0);
  });

  it('never reaches full weight, so locomotion stays visible underneath', () => {
    const state = createHitReactionState();
    for (let index = 0; index < MAXIMUM_CONCURRENT_HIT_IMPULSES * 3; index += 1) {
      pushHitImpulse(state, { zone: 'head', severity: 1, incomingYawRadians: 0 });
    }
    let worst = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      worst = Math.max(worst, advanceHitReaction(state, 1 / 240).clipWeight);
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_WEIGHT);
    expect(MAXIMUM_HIT_REACTION_WEIGHT).toBeLessThan(1);
  });

  it('bounds how many impulses can ever be live at once', () => {
    const state = createHitReactionState();
    for (let index = 0; index < 40; index += 1) {
      pushHitImpulse(state, { zone: 'body', severity: 1, incomingYawRadians: 0 });
    }
    expect(state.impulses.length).toBe(MAXIMUM_CONCURRENT_HIT_IMPULSES);
    expect(advanceHitReaction(state, 1 / 240).activeImpulses).toBeLessThanOrEqual(MAXIMUM_CONCURRENT_HIT_IMPULSES);
  });

  it('deflects away from the shot, and clamps how far', () => {
    const front = createHitReactionState();
    pushHitImpulse(front, { zone: 'head', severity: 1, incomingYawRadians: 0 });
    let frontOutput = advanceHitReaction(front, 0);
    for (let frame = 0; frame < 6; frame += 1) frontOutput = advanceHitReaction(front, HIT_REACTION_SHAPES.head.riseSeconds / 6);
    // Hit from dead ahead throws the torso backwards.
    expect(frontOutput.pitchOffsetRadians).toBeLessThan(0);
    expect(Math.abs(frontOutput.pitchOffsetRadians)).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_OFFSET_RADIANS);

    const right = createHitReactionState();
    pushHitImpulse(right, { zone: 'head', severity: 1, incomingYawRadians: Math.PI / 2 });
    let rightOutput = advanceHitReaction(right, 0);
    for (let frame = 0; frame < 6; frame += 1) rightOutput = advanceHitReaction(right, HIT_REACTION_SHAPES.head.riseSeconds / 6);
    expect(rightOutput.rollOffsetRadians).toBeLessThan(0);
    expect(Math.abs(rightOutput.rollOffsetRadians)).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_OFFSET_RADIANS);
  });

  it('keeps the offsets inside the ceiling under a full salvo from every angle', () => {
    const state = createHitReactionState();
    for (let index = 0; index < MAXIMUM_CONCURRENT_HIT_IMPULSES; index += 1) {
      pushHitImpulse(state, { zone: 'head', severity: 1, incomingYawRadians: index * 0.4 });
    }
    for (let frame = 0; frame < 120; frame += 1) {
      const output = advanceHitReaction(state, 1 / 240);
      expect(Math.abs(output.pitchOffsetRadians)).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_OFFSET_RADIANS);
      expect(Math.abs(output.rollOffsetRadians)).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_OFFSET_RADIANS);
    }
  });

  it('scales with the per-skin absorption gain', () => {
    const sample = (gain: number): number => {
      const state = createHitReactionState();
      pushHitImpulse(state, { zone: 'body', severity: 1, incomingYawRadians: 0 });
      let output = advanceHitReaction(state, 0, gain);
      for (let frame = 0; frame < 6; frame += 1) {
        output = advanceHitReaction(state, HIT_REACTION_SHAPES.body.riseSeconds / 6, gain);
      }
      return output.clipWeight;
    };
    expect(sample(0.6)).toBeLessThan(sample(1));
    expect(sample(1)).toBeLessThan(sample(1.25));
    expect(sample(0)).toBe(0);
  });

  it('alternates the authored hit clips on a counter, not a coin flip', () => {
    const observed: boolean[] = [];
    const state = createHitReactionState();
    for (let hit = 0; hit < 4; hit += 1) {
      pushHitImpulse(state, { zone: 'body', severity: 1, incomingYawRadians: 0 });
      observed.push(advanceHitReaction(state, 0.02).alternate);
      // Let the impulse expire so the next hit is the dominant one.
      for (let frame = 0; frame < 60; frame += 1) advanceHitReaction(state, 1 / 60);
    }
    expect(observed).toEqual([false, true, false, true]);
  });

  it('picks the same clip on every peer for the same shot sequence', () => {
    const play = (): boolean[] => {
      const state = createHitReactionState();
      const seen: boolean[] = [];
      for (let hit = 0; hit < 5; hit += 1) {
        pushHitImpulse(state, { zone: 'limb', severity: 0.8, incomingYawRadians: hit });
        seen.push(advanceHitReaction(state, 0.03).alternate);
        for (let frame = 0; frame < 40; frame += 1) advanceHitReaction(state, 1 / 60);
      }
      return seen;
    };
    expect(play()).toEqual(play());
  });

  it('clamps a hostile severity instead of amplifying it', () => {
    const state = createHitReactionState();
    pushHitImpulse(state, { zone: 'head', severity: 40, incomingYawRadians: 0 });
    pushHitImpulse(state, { zone: 'head', severity: Number.NaN, incomingYawRadians: Number.NaN });
    for (let frame = 0; frame < 60; frame += 1) {
      const output = advanceHitReaction(state, 1 / 120);
      expect(output.clipWeight).toBeLessThanOrEqual(MAXIMUM_HIT_REACTION_WEIGHT);
      expect(Number.isFinite(output.pitchOffsetRadians)).toBe(true);
    }
  });

  it('reproduces the whole reaction stream from the same inputs', () => {
    const run = (): unknown[] => {
      const state = createHitReactionState();
      const outputs: unknown[] = [];
      for (let frame = 0; frame < 90; frame += 1) {
        if (frame % 13 === 0) {
          pushHitImpulse(state, { zone: ZONES[frame % 3]!, severity: 0.4 + (frame % 5) * 0.1, incomingYawRadians: frame * 0.21 });
        }
        outputs.push(advanceHitReaction(state, 1 / 90, 0.85));
      }
      return outputs;
    };
    expect(run()).toEqual(run());
  });
});
