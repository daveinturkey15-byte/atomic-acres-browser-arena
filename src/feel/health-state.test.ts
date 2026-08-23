import { describe, expect, it } from 'vitest';
import {
  BREATH_MAX_HZ,
  BREATH_RESTING_HZ,
  CRITICAL_ENTER_FRACTION,
  CRITICAL_EXIT_FRACTION,
  CRITICAL_MIN_DWELL_SECONDS,
  CRITICAL_VIGNETTE_CEILING,
  HEARTBEAT_MAX_HZ,
  HEARTBEAT_RESTING_HZ,
  RECOVERY_DELAY_SECONDS,
  advanceHealthFeel,
  breathingRateHz,
  createHealthFeelState,
  healthFeelSignals,
  healthRecoveryCurve,
  heartbeatRateHz,
  recordHealthFeelDamage,
  type HealthFeelState,
} from './health-state';

function run(
  state: HealthFeelState,
  seconds: number,
  step: number,
  healthFraction: number,
  alive = true,
): HealthFeelState {
  let current = state;
  const steps = Math.round(seconds / step);
  for (let index = 0; index < steps; index += 1) {
    current = advanceHealthFeel(current, step, healthFraction, alive);
  }
  return current;
}

describe('rates', () => {
  it('are bounded and monotonic in both drives', () => {
    expect(heartbeatRateHz(1, 0, 1)).toBeCloseTo(HEARTBEAT_RESTING_HZ, 10);
    expect(heartbeatRateHz(0, 1, 0)).toBeCloseTo(HEARTBEAT_MAX_HZ, 10);
    expect(breathingRateHz(1, 0, 1)).toBeCloseTo(BREATH_RESTING_HZ, 10);
    expect(breathingRateHz(0, 1, 0)).toBeCloseTo(BREATH_MAX_HZ, 10);
    let previous = 0;
    for (const health of [1, 0.9, 0.7, 0.5, 0.3, 0.1, 0]) {
      const hz = heartbeatRateHz(health, 0, 0);
      expect(hz).toBeGreaterThanOrEqual(previous);
      previous = hz;
    }
    let byPressure = 0;
    for (const pressure of [0, 0.2, 0.5, 0.8, 1]) {
      const hz = heartbeatRateHz(1, pressure, 0);
      expect(hz).toBeGreaterThanOrEqual(byPressure);
      byPressure = hz;
    }
  });

  it('recovery relaxes adrenaline but never clears blood loss', () => {
    // A calm player at 5% health keeps an elevated heart rate.
    expect(heartbeatRateHz(0.05, 0, 1)).toBeGreaterThan(HEARTBEAT_RESTING_HZ * 1.5);
    // A healthy player who was recently hit settles back to near resting.
    expect(heartbeatRateHz(1, 1, 1)).toBeLessThan(heartbeatRateHz(1, 1, 0));
  });
});

describe('recovery curve', () => {
  it('holds tension, then eases monotonically to one', () => {
    expect(healthRecoveryCurve(0)).toBe(0);
    expect(healthRecoveryCurve(RECOVERY_DELAY_SECONDS)).toBe(0);
    let previous = 0;
    for (let seconds = 0; seconds <= 12; seconds += 0.25) {
      const value = healthRecoveryCurve(seconds);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(healthRecoveryCurve(20)).toBe(1);
    expect(healthRecoveryCurve(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('critical hysteresis', () => {
  it('does not flicker while health oscillates across the enter threshold', () => {
    let state = createHealthFeelState(1);
    const transitions: boolean[] = [];
    for (let index = 0; index < 400; index += 1) {
      const health = index % 2 === 0
        ? CRITICAL_ENTER_FRACTION - 0.01
        : CRITICAL_ENTER_FRACTION + 0.05;
      const next = advanceHealthFeel(state, 1 / 60, health);
      if (next.critical !== state.critical) transitions.push(next.critical);
      state = next;
    }
    // One entry, and never an exit: the band between enter and exit holds.
    expect(transitions).toEqual([true]);
    expect(state.critical).toBe(true);
  });

  it('does not flicker while health oscillates across the exit threshold', () => {
    let state = advanceHealthFeel(createHealthFeelState(1), 1 / 60, 0.1);
    expect(state.critical).toBe(true);
    state = run(state, 2, 1 / 60, 0.1);
    const transitions: boolean[] = [];
    for (let index = 0; index < 400; index += 1) {
      const health = index % 2 === 0
        ? CRITICAL_EXIT_FRACTION + 0.01
        : CRITICAL_EXIT_FRACTION - 0.02;
      const next = advanceHealthFeel(state, 1 / 60, health);
      if (next.critical !== state.critical) transitions.push(next.critical);
      state = next;
    }
    // Exits once and cannot re-enter, because re-entry needs <= 30%.
    expect(transitions).toEqual([false]);
  });

  it('refuses to clear before the minimum dwell even at full health', () => {
    let state = advanceHealthFeel(createHealthFeelState(1), 1 / 60, 0.05);
    expect(state.critical).toBe(true);
    state = advanceHealthFeel(state, CRITICAL_MIN_DWELL_SECONDS * 0.5, 1);
    expect(state.critical).toBe(true);
    state = advanceHealthFeel(state, CRITICAL_MIN_DWELL_SECONDS, 1);
    expect(state.critical).toBe(false);
  });

  it('enters immediately: safety information is never dwell-gated', () => {
    const state = advanceHealthFeel(createHealthFeelState(1), 1 / 240, CRITICAL_ENTER_FRACTION);
    expect(state.critical).toBe(true);
  });

  it('the smoothed level ramps rather than stepping, so nothing can strobe', () => {
    let state = advanceHealthFeel(createHealthFeelState(1), 1 / 60, 0.1);
    expect(state.criticalLevel).toBeGreaterThan(0);
    expect(state.criticalLevel).toBeLessThan(0.2);
    let previous = state.criticalLevel;
    for (let index = 0; index < 300; index += 1) {
      state = advanceHealthFeel(state, 1 / 60, 0.1);
      expect(state.criticalLevel).toBeGreaterThanOrEqual(previous);
      previous = state.criticalLevel;
    }
    expect(state.criticalLevel).toBe(1);
    expect(healthFeelSignals(state).vignette).toBeCloseTo(CRITICAL_VIGNETTE_CEILING, 10);
  });
});

describe('frame-rate independence', () => {
  it('levels agree exactly and phases agree to well under a millisecond of beat', () => {
    const seeded = recordHealthFeelDamage(createHealthFeelState(0.45), 0.4, 0.45);
    const single = advanceHealthFeel(seeded, 0.6, 0.45);
    const many = run(seeded, 0.6, 0.06, 0.45);
    expect(many.damagePressure).toBeCloseTo(single.damagePressure, 12);
    expect(many.secondsSinceDamage).toBeCloseTo(single.secondsSinceDamage, 12);
    expect(many.criticalLevel).toBeCloseTo(single.criticalLevel, 12);
    expect(many.heartbeatPhase).toBeCloseTo(single.heartbeatPhase, 5);
    expect(many.breathPhase).toBeCloseTo(single.breathPhase, 5);
  });

  it('holds across a 1 vs 60 step comparison at a realistic frame time', () => {
    const seeded = recordHealthFeelDamage(createHealthFeelState(0.2), 0.6, 0.2);
    const single = advanceHealthFeel(seeded, 1, 0.2);
    const many = run(seeded, 1, 1 / 60, 0.2);
    expect(many.damagePressure).toBeCloseTo(single.damagePressure, 12);
    expect(many.heartbeatPhase).toBeCloseTo(single.heartbeatPhase, 5);
    expect(many.criticalLevel).toBeCloseTo(single.criticalLevel, 12);
  });
});

describe('signals', () => {
  it('a healthy, unhurt player produces silence', () => {
    const signals = healthFeelSignals(run(createHealthFeelState(1), 5, 1 / 60, 1));
    expect(signals.heartbeatGain).toBe(0);
    expect(signals.breathGain).toBe(0);
    expect(signals.criticalLevel).toBe(0);
    expect(signals.vignette).toBe(0);
    expect(signals.recovery).toBe(1);
  });

  it('a dead player has no heartbeat, no breath and no critical state', () => {
    let state = recordHealthFeelDamage(createHealthFeelState(0.1), 0.9, 0);
    state = advanceHealthFeel(state, 1 / 60, 0, false);
    const signals = healthFeelSignals(state);
    expect(signals.heartbeatGain).toBe(0);
    expect(signals.breathGain).toBe(0);
    expect(signals.critical).toBe(false);
    expect(signals.distress).toBe(0);
  });

  it('every emitted signal is a finite 0..1 value (except the two rates)', () => {
    let state = recordHealthFeelDamage(createHealthFeelState(0.15), 0.5, 0.15);
    for (let index = 0; index < 600; index += 1) {
      state = advanceHealthFeel(state, 1 / 60, 0.15);
      const signals = healthFeelSignals(state);
      for (const [key, value] of Object.entries(signals)) {
        if (typeof value !== 'number') continue;
        expect(Number.isFinite(value), key).toBe(true);
        if (key === 'heartbeatHz' || key === 'breathHz') continue;
        expect(value, key).toBeGreaterThanOrEqual(0);
        expect(value, key).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for an identical input sequence', () => {
    const script = () => {
      let state = createHealthFeelState(1);
      for (let index = 0; index < 90; index += 1) {
        if (index % 20 === 0) state = recordHealthFeelDamage(state, 0.18, 1 - index / 100);
        state = advanceHealthFeel(state, 1 / 60, 1 - index / 100);
      }
      return { state, signals: healthFeelSignals(state) };
    };
    expect(script()).toEqual(script());
  });
});
