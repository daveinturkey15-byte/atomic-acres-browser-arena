import { describe, expect, it } from 'vitest';
import {
  addCameraShakeImpulse,
  CAMERA_SHAKE_REFERENCE_DISTANCE,
  createCameraShakeState,
  integrateCameraShake,
  sampleCameraShake,
} from './camera-shake';

describe('camera shake (HF-352)', () => {
  it('creates initial idle state at rest', () => {
    const state = createCameraShakeState(1_000);
    expect(state.displacement).toBe(0);
    expect(state.velocity).toBe(0);
    expect(state.lastUpdatedMs).toBe(1_000);
    expect(state.seed).toBe(0);

    const sample = sampleCameraShake(state, 1_000);
    expect(sample.intensity).toBe(0);
    expect(sample.offsetX).toBe(0);
    expect(sample.offsetY).toBe(0);
    expect(sample.rollRadians).toBe(0);
  });

  it('adds blast impulse scaled by distance and family weight', () => {
    const initial = createCameraShakeState(1_000);

    // Semtex (weight 1.0) at reference distance (9m)
    const semtexState = addCameraShakeImpulse(initial, {
      distanceUnits: CAMERA_SHAKE_REFERENCE_DISTANCE,
      family: 'semtex',
      sensoryScale: 1,
      now: 1_000,
    });
    expect(semtexState.velocity).toBeGreaterThan(0);

    // Support (weight 1.35) at reference distance has higher impulse
    const supportState = addCameraShakeImpulse(initial, {
      distanceUnits: CAMERA_SHAKE_REFERENCE_DISTANCE,
      family: 'support',
      sensoryScale: 1,
      now: 1_000,
    });
    expect(supportState.velocity).toBeGreaterThan(semtexState.velocity);

    // Crossbow (weight 0.72) at reference distance has lower impulse
    const crossbowState = addCameraShakeImpulse(initial, {
      distanceUnits: CAMERA_SHAKE_REFERENCE_DISTANCE,
      family: 'crossbow',
      sensoryScale: 1,
      now: 1_000,
    });
    expect(crossbowState.velocity).toBeLessThan(semtexState.velocity);
  });

  it('farther blasts produce smaller impulses with clamped falloff', () => {
    const initial = createCameraShakeState(1_000);

    const near = addCameraShakeImpulse(initial, {
      distanceUnits: 3,
      family: 'semtex',
      now: 1_000,
    });

    const far = addCameraShakeImpulse(initial, {
      distanceUnits: 30,
      family: 'semtex',
      now: 1_000,
    });

    expect(near.velocity).toBeGreaterThan(far.velocity);
  });

  it('accessibility sensoryScale scales or disables impulses', () => {
    const initial = createCameraShakeState(1_000);

    const full = addCameraShakeImpulse(initial, {
      distanceUnits: 10,
      family: 'semtex',
      sensoryScale: 1,
      now: 1_000,
    });

    const halved = addCameraShakeImpulse(initial, {
      distanceUnits: 10,
      family: 'semtex',
      sensoryScale: 0.5,
      now: 1_000,
    });

    const disabled = addCameraShakeImpulse(initial, {
      distanceUnits: 10,
      family: 'semtex',
      sensoryScale: 0,
      now: 1_000,
    });

    expect(halved.velocity).toBeCloseTo(full.velocity * 0.5, 3);
    expect(disabled.velocity).toBe(0);
  });

  it('integrates spring physics and decays smoothly to rest across frames', () => {
    let state = createCameraShakeState(1_000);
    state = addCameraShakeImpulse(state, {
      distanceUnits: 5,
      family: 'semtex',
      now: 1_000,
    });

    expect(state.velocity).toBeGreaterThan(0);

    // Integrate forward over small frame steps (~16ms each)
    let now = 1_000;
    for (let i = 0; i < 3; i++) {
      now += 16;
      state = integrateCameraShake(state, now);
    }
    expect(state.displacement).toBeGreaterThan(0);

    // After stepping across 2 seconds (120 frames), spring settles completely to 0
    for (let i = 0; i < 120; i++) {
      now += 16;
      state = integrateCameraShake(state, now);
    }
    expect(state.displacement).toBe(0);
    expect(state.velocity).toBe(0);

    const sample = sampleCameraShake(state, now);
    expect(sample.intensity).toBe(0);
    expect(sample.offsetX).toBe(0);
    expect(sample.offsetY).toBe(0);
    expect(sample.rollRadians).toBe(0);
  });

  it('produces deterministic jitter for the same seed', () => {
    let state1 = createCameraShakeState(1_000);
    state1 = addCameraShakeImpulse(state1, {
      distanceUnits: 5,
      family: 'semtex',
      seed: 42,
      now: 1_000,
    });

    let state2 = createCameraShakeState(1_000);
    state2 = addCameraShakeImpulse(state2, {
      distanceUnits: 5,
      family: 'semtex',
      seed: 42,
      now: 1_000,
    });

    const sample1 = sampleCameraShake(state1, 1_050);
    const sample2 = sampleCameraShake(state2, 1_050);

    expect(sample1.offsetX).toBe(sample2.offsetX);
    expect(sample1.offsetY).toBe(sample2.offsetY);
    expect(sample1.rollRadians).toBe(sample2.rollRadians);
    expect(sample1.intensity).toBe(sample2.intensity);
    expect(sample1.intensity).toBeGreaterThan(0);
  });

  it('handles non-finite inputs gracefully without throwing', () => {
    const state = createCameraShakeState(1_000);
    expect(addCameraShakeImpulse(state, { distanceUnits: 5, family: 'semtex', now: NaN })).toBe(state);
    expect(integrateCameraShake(state, NaN)).toBe(state);
  });
});
