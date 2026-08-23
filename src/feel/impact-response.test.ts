import { describe, expect, it } from 'vitest';
import {
  FEEL_CHANNEL_CEILINGS,
  FEEL_MAX_TRACKED_DIRECTIONS,
  FEEL_SILENCE_EPSILON,
  IMPACT_SOURCE_KINDS,
  addImpactResponse,
  createImpactResponseState,
  decayImpactResponse,
  impactResponseEnvelope,
  impactResponseIdle,
  normalizeBearing,
  saturatingAdd,
  type DamageImpactEvent,
  type ImpactResponseState,
} from './impact-response';

const hit = (overrides: Partial<DamageImpactEvent> = {}): DamageImpactEvent => ({
  amount: 34,
  bearingRadians: 0.8,
  source: 'bullet',
  healthFraction: 0.7,
  ...overrides,
});

const channels = (state: ImpactResponseState) => [
  state.edgeImpact, state.chromatic, state.desaturation, state.audioLowPass,
];

function withEvent(state: ImpactResponseState, event: DamageImpactEvent): ImpactResponseState {
  const envelope = impactResponseEnvelope(event);
  expect(envelope).not.toBeNull();
  return addImpactResponse(state, envelope!);
}

describe('impact envelope', () => {
  it('rejects non-events instead of emitting a zero envelope', () => {
    expect(impactResponseEnvelope(hit({ amount: 0 }))).toBeNull();
    expect(impactResponseEnvelope(hit({ amount: -5 }))).toBeNull();
    expect(impactResponseEnvelope(hit({ amount: Number.NaN }))).toBeNull();
  });

  it('produces finite, in-range channels for every source kind', () => {
    for (const source of IMPACT_SOURCE_KINDS) {
      const envelope = impactResponseEnvelope(hit({ source, amount: 500, healthFraction: 0 }));
      expect(envelope).not.toBeNull();
      expect(envelope!.edgeImpact).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.edgeImpact);
      expect(envelope!.chromatic).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.chromatic);
      expect(envelope!.desaturation).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.desaturation);
      expect(envelope!.audioLowPass).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.audioLowPass);
      expect(envelope!.shakeStrength).toBeGreaterThan(0);
      expect(envelope!.shakeStrength).toBeLessThanOrEqual(1);
      expect(Number.isFinite(envelope!.durationSeconds)).toBe(true);
      expect(envelope!.durationSeconds).toBeGreaterThan(0);
    }
  });

  it('suppresses the direction arrow for a fall, which has no attacker', () => {
    const fall = impactResponseEnvelope(hit({ source: 'fall', bearingRadians: 2.1 }))!;
    expect(fall.directionalCertain).toBe(false);
    expect(fall.directionalIntensity).toBe(0);
    expect(fall.directionalBearingRadians).toBe(0);
    const bullet = impactResponseEnvelope(hit({ bearingRadians: 2.1 }))!;
    expect(bullet.directionalCertain).toBe(true);
    expect(bullet.directionalIntensity).toBeGreaterThan(0);
  });

  it('an explosion beyond the near radius uses the far preset', () => {
    const near = impactResponseEnvelope(hit({ source: 'explosion', distanceUnits: 4 }))!;
    const far = impactResponseEnvelope(hit({ source: 'explosion', distanceUnits: 40 }))!;
    expect(near.shakeSource).toBe('near-explosion');
    expect(far.shakeSource).toBe('far-explosion');
  });

  it('hurts more at low health and is monotonic in damage', () => {
    const healthy = impactResponseEnvelope(hit({ healthFraction: 1 }))!;
    const dying = impactResponseEnvelope(hit({ healthFraction: 0.05 }))!;
    expect(dying.edgeImpact).toBeGreaterThan(healthy.edgeImpact);
    let previous = 0;
    for (const amount of [1, 5, 12, 25, 45, 120]) {
      const envelope = impactResponseEnvelope(hit({ amount }))!;
      expect(envelope.edgeImpact).toBeGreaterThanOrEqual(previous);
      previous = envelope.edgeImpact;
    }
  });

  it('duration is a consequence of amplitude under a fixed decay rate', () => {
    const small = impactResponseEnvelope(hit({ amount: 4 }))!;
    const large = impactResponseEnvelope(hit({ amount: 90 }))!;
    expect(large.durationSeconds).toBeGreaterThan(small.durationSeconds);
  });
});

describe('decay', () => {
  it('is monotonically decreasing and reaches exactly zero (nothing latches)', () => {
    let state = withEvent(createImpactResponseState(), hit({ source: 'explosion', amount: 90 }));
    let previous = channels(state);
    expect(state.directions.length).toBe(1);
    for (let step = 0; step < 200; step += 1) {
      state = decayImpactResponse(state, 0.05);
      const current = channels(state);
      for (let index = 0; index < current.length; index += 1) {
        expect(current[index]).toBeLessThanOrEqual(previous[index]);
      }
      previous = current;
    }
    expect(state.edgeImpact).toBe(0);
    expect(state.chromatic).toBe(0);
    expect(state.desaturation).toBe(0);
    expect(state.audioLowPass).toBe(0);
    expect(state.directions).toEqual([]);
    expect(impactResponseIdle(state)).toBe(true);
  });

  it('direction intensity decays monotonically and the pulse is dropped, not pinned', () => {
    let state = withEvent(createImpactResponseState(), hit());
    let previous = state.directions[0].intensity;
    for (let step = 0; step < 140; step += 1) {
      state = decayImpactResponse(state, 0.05);
      const pulse = state.directions[0];
      if (!pulse) break;
      expect(pulse.intensity).toBeLessThan(previous);
      expect(pulse.intensity).toBeGreaterThanOrEqual(FEEL_SILENCE_EPSILON);
      previous = pulse.intensity;
    }
    expect(state.directions.length).toBe(0);
  });

  it('is frame-rate independent: one big step equals many small ones', () => {
    const seeded = withEvent(createImpactResponseState(), hit({ source: 'explosion', amount: 70 }));
    const single = decayImpactResponse(seeded, 0.6);
    let many = seeded;
    for (let step = 0; step < 10; step += 1) many = decayImpactResponse(many, 0.06);
    // Exponential decay is exactly composable, so the only difference allowed
    // here is floating-point rounding. This tolerance is deliberately brutal.
    expect(many.edgeImpact).toBeCloseTo(single.edgeImpact, 12);
    expect(many.chromatic).toBeCloseTo(single.chromatic, 12);
    expect(many.desaturation).toBeCloseTo(single.desaturation, 12);
    expect(many.audioLowPass).toBeCloseTo(single.audioLowPass, 12);
    expect(many.directions[0].intensity).toBeCloseTo(single.directions[0].intensity, 12);
  });

  it('is frame-rate independent across an uneven partition too', () => {
    const seeded = withEvent(createImpactResponseState(), hit({ amount: 55 }));
    const single = decayImpactResponse(seeded, 0.37);
    let many = seeded;
    for (const step of [0.003, 0.017, 0.1, 0.05, 0.05, 0.05, 0.007, 0.093]) {
      many = decayImpactResponse(many, step);
    }
    expect(many.edgeImpact).toBeCloseTo(single.edgeImpact, 12);
    expect(many.audioLowPass).toBeCloseTo(single.audioLowPass, 12);
  });

  it('ignores non-advancing time rather than corrupting the state', () => {
    const seeded = withEvent(createImpactResponseState(), hit());
    expect(decayImpactResponse(seeded, 0)).toBe(seeded);
    expect(decayImpactResponse(seeded, -1)).toBe(seeded);
    expect(decayImpactResponse(seeded, Number.NaN)).toBe(seeded);
  });
});

describe('caps', () => {
  it('saturatingAdd never reaches past the ceiling and stays monotonic', () => {
    let value = 0;
    for (let step = 0; step < 200; step += 1) {
      const next = saturatingAdd(value, 0.5, 0.62);
      expect(next).toBeGreaterThanOrEqual(value);
      expect(next).toBeLessThanOrEqual(0.62);
      value = next;
    }
  });

  it('damage spam converges on the ceilings instead of summing past them', () => {
    let state = createImpactResponseState();
    for (let index = 0; index < 25; index += 1) {
      state = withEvent(state, hit({ source: 'explosion', amount: 400, healthFraction: 0 }));
      state = decayImpactResponse(state, 1 / 120);
      expect(state.edgeImpact).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.edgeImpact);
      expect(state.chromatic).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.chromatic);
      expect(state.desaturation).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.desaturation);
      expect(state.audioLowPass).toBeLessThanOrEqual(FEEL_CHANNEL_CEILINGS.audioLowPass);
    }
  });

  it('never tracks more than FEEL_MAX_TRACKED_DIRECTIONS distinct bearings', () => {
    let state = createImpactResponseState();
    // Eight bearings a full 45 degrees apart: every one is genuinely distinct
    // (well outside FEEL_DIRECTION_MERGE_RADIANS), so this exercises the cap
    // rather than the merge.
    for (let index = 0; index < 8; index += 1) {
      state = withEvent(state, hit({ bearingRadians: (index / 8) * Math.PI * 2 - Math.PI }));
    }
    expect(state.directions.length).toBe(FEEL_MAX_TRACKED_DIRECTIONS);
    expect(state.directions.every((pulse) => pulse.intensity <= 1)).toBe(true);
  });

  it('a circling attacker drags one arrow instead of spawning a ring of them', () => {
    let state = createImpactResponseState();
    // Steps smaller than the merge window: this is one attacker moving, and
    // showing eighteen arrows for it would be worse information, not more.
    for (let index = 0; index < 18; index += 1) {
      state = withEvent(state, hit({ amount: 10, bearingRadians: index * 0.2 - Math.PI }));
    }
    expect(state.directions.length).toBe(1);
  });

  it('reinforces one indicator for a burst from the same bearing', () => {
    let state = createImpactResponseState();
    for (let index = 0; index < 6; index += 1) {
      state = withEvent(state, hit({ amount: 12, bearingRadians: 1.2 + index * 0.01 }));
    }
    expect(state.directions.length).toBe(1);
    expect(state.directions[0].intensity).toBeGreaterThan(0.5);
    expect(state.directions[0].bearingRadians).toBeCloseTo(1.22, 1);
  });
});

describe('determinism', () => {
  it('identical input sequences produce identical state', () => {
    const run = () => {
      let state = createImpactResponseState();
      for (const [amount, bearing, source] of [
        [30, 0.4, 'bullet'], [80, -2.2, 'explosion'], [9, 1.9, 'fire'], [25, 0, 'fall'],
      ] as const) {
        state = withEvent(state, hit({ amount, bearingRadians: bearing, source }));
        state = decayImpactResponse(state, 0.031);
      }
      return state;
    };
    expect(run()).toEqual(run());
  });

  it('normalizeBearing wraps into [-PI, PI) and never emits NaN', () => {
    // Same convention as normalizeAngle in src/sensory-feedback.ts: behind is -PI.
    expect(normalizeBearing(Math.PI * 3)).toBeCloseTo(-Math.PI, 10);
    expect(normalizeBearing(-Math.PI * 3)).toBeCloseTo(-Math.PI, 10);
    expect(normalizeBearing(0.4)).toBeCloseTo(0.4, 12);
    expect(normalizeBearing(0.4 + Math.PI * 2)).toBeCloseTo(0.4, 10);
    expect(normalizeBearing(Number.NaN)).toBe(0);
    expect(normalizeBearing(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
