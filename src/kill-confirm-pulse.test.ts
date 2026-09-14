import { describe, expect, it } from 'vitest';
import {
  createKillConfirmPulseState,
  KILL_CONFIRM_PULSE_ATTACK_MS,
  KILL_CONFIRM_PULSE_DECAY_MS,
  sampleKillConfirmPulse,
  triggerKillConfirmPulse,
} from './kill-confirm-pulse';

describe('kill-confirm pulse (HF-352)', () => {
  it('creates initial inactive state with default or clamped sensory scale', () => {
    const state = createKillConfirmPulseState();
    expect(state.active).toBe(false);
    expect(state.startedAtMs).toBeNull();
    expect(state.sensoryScale).toBe(1);

    const clamped = createKillConfirmPulseState(-0.5);
    expect(clamped.sensoryScale).toBe(0);

    const sample = sampleKillConfirmPulse(state, 1_000);
    expect(sample.presentation.active).toBe(false);
    expect(sample.presentation.opacity).toBe(0);
    expect(sample.presentation.scale).toBe(0);
  });

  it('triggers pulse on elimination with valid timestamp', () => {
    let state = createKillConfirmPulseState(1);
    state = triggerKillConfirmPulse(state, 1_000);
    expect(state.active).toBe(true);
    expect(state.startedAtMs).toBe(1_000);
  });

  it('does not trigger pulse when sensoryScale is 0 or now is non-finite', () => {
    const disabledState = createKillConfirmPulseState(0);
    const triggered = triggerKillConfirmPulse(disabledState, 1_000);
    expect(triggered.active).toBe(false);

    const normalState = createKillConfirmPulseState(1);
    const nanTriggered = triggerKillConfirmPulse(normalState, NaN);
    expect(nanTriggered.active).toBe(false);
  });

  it('samples attack phase ramping to peak', () => {
    let state = createKillConfirmPulseState(1);
    state = triggerKillConfirmPulse(state, 1_000);

    // At start (now = 1000), attack phase is 0
    const startSample = sampleKillConfirmPulse(state, 1_000);
    expect(startSample.presentation.active).toBe(true);
    expect(startSample.presentation.opacity).toBe(0);

    // Mid attack (now = 1020)
    const midSample = sampleKillConfirmPulse(state, 1_000 + KILL_CONFIRM_PULSE_ATTACK_MS / 2);
    expect(midSample.presentation.active).toBe(true);
    expect(midSample.presentation.opacity).toBeGreaterThan(0);
    expect(midSample.presentation.opacity).toBeLessThanOrEqual(1);

    // Peak of attack (now = 1040)
    const peakSample = sampleKillConfirmPulse(state, 1_000 + KILL_CONFIRM_PULSE_ATTACK_MS);
    expect(peakSample.presentation.active).toBe(true);
    expect(peakSample.presentation.opacity).toBe(1);
    expect(peakSample.presentation.scale).toBe(1);
  });

  it('samples decay phase and settles to inactive after window', () => {
    let state = createKillConfirmPulseState(1);
    state = triggerKillConfirmPulse(state, 1_000);

    // In decay phase (now = 1100)
    const decaySample = sampleKillConfirmPulse(state, 1_100);
    expect(decaySample.presentation.active).toBe(true);
    expect(decaySample.presentation.opacity).toBeLessThan(1);
    expect(decaySample.presentation.opacity).toBeGreaterThan(0);

    // Past total window (attack + decay = 40 + 320 = 360ms)
    const settledSample = sampleKillConfirmPulse(state, 1_000 + KILL_CONFIRM_PULSE_ATTACK_MS + KILL_CONFIRM_PULSE_DECAY_MS + 10);
    expect(settledSample.state.active).toBe(false);
    expect(settledSample.state.startedAtMs).toBeNull();
    expect(settledSample.presentation.active).toBe(false);
    expect(settledSample.presentation.opacity).toBe(0);
    expect(settledSample.presentation.scale).toBe(0);
  });

  it('respects sensoryScale reducing peak opacity', () => {
    let state = createKillConfirmPulseState(0.35);
    state = triggerKillConfirmPulse(state, 1_000);

    const peakSample = sampleKillConfirmPulse(state, 1_000 + KILL_CONFIRM_PULSE_ATTACK_MS);
    expect(peakSample.presentation.active).toBe(true);
    expect(peakSample.presentation.opacity).toBeCloseTo(0.35, 2);
  });
});
