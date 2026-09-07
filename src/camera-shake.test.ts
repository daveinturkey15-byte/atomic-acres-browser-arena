import { describe, expect, it } from 'vitest';
import {
  CAMERA_SHAKE_DAMPING_RATIO,
  CAMERA_SHAKE_MAX_DISPLACEMENT,
  CAMERA_SHAKE_MAX_SUBSTEP_SECONDS,
  CAMERA_SHAKE_REFERENCE_DISTANCE,
  CAMERA_SHAKE_STIFFNESS,
  addCameraShakeImpulse,
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

/**
 * THE CHOPPER GUNNER EXIT DEFECT, pinned as arithmetic.
 *
 * Owner 2026-08-31: "when u exit it flies you around like crazy then back to ur
 * body". The spring's per-frame integration is suspended for the whole ride
 * (updatePhysics early-returns while possessing) while missile impacts keep
 * adding impulses, so every impulse was integrated once at the old 0.25 s dt
 * ceiling - where semi-implicit Euler on this spring has spectral radius 4.95
 * and amplifies rather than damps.
 *
 * These gates are on the INTEGRATOR, not on the chopper, because anything that
 * produces a long frame gap re-arms the same trap: an alt-tabbed tab, a loading
 * hitch, a dead player awaiting respawn.
 */
describe('camera shake stability across long frame gaps', () => {
  it('stays bounded under one impulse per second, which is the chopper missile cadence', () => {
    let state = createCameraShakeState(0);
    let peak = 0;
    for (let impact = 0; impact < 12; impact += 1) {
      const now = impact * 1_000;
      state = addCameraShakeImpulse(state, { distanceUnits: 6, family: 'support', sensoryScale: 1, now });
      state = integrateCameraShake(state, now);
      peak = Math.max(peak, Math.abs(state.displacement));
    }
    // Before the substep fix this reached tens of thousands of metres and the
    // camera was flung across the map on the frame possession ended.
    expect(peak, 'twelve spaced impulses must not diverge').toBeLessThan(2);
  });

  it('has a stable state-transition matrix at its own step ceiling', () => {
    // The property that actually guarantees the test above, checked directly so
    // a future stiffness or damping change cannot quietly re-cross the line.
    const dt = CAMERA_SHAKE_MAX_SUBSTEP_SECONDS;
    const omega = Math.sqrt(CAMERA_SHAKE_STIFFNESS);
    const a11 = 1 - CAMERA_SHAKE_STIFFNESS * dt * dt;
    const a12 = dt - 2 * CAMERA_SHAKE_DAMPING_RATIO * omega * dt * dt;
    const a21 = -CAMERA_SHAKE_STIFFNESS * dt;
    const a22 = 1 - 2 * CAMERA_SHAKE_DAMPING_RATIO * omega * dt;
    const trace = a11 + a22;
    const determinant = a11 * a22 - a12 * a21;
    const discriminant = trace * trace - 4 * determinant;
    const radius = discriminant >= 0
      ? Math.max(Math.abs((trace + Math.sqrt(discriminant)) / 2), Math.abs((trace - Math.sqrt(discriminant)) / 2))
      : Math.sqrt(determinant);
    expect(radius, 'the integrator must contract at its own maximum step').toBeLessThan(1);
  });

  it('settles rather than growing when a whole second is integrated at once', () => {
    let state = createCameraShakeState(0);
    state = addCameraShakeImpulse(state, { distanceUnits: 4, family: 'support', sensoryScale: 1, now: 0 });
    // The impulse is a VELOCITY kick; displacement starts at rest.
    const kickedVelocity = Math.abs(state.velocity);
    expect(kickedVelocity).toBeGreaterThan(0);
    // One integrate call spanning a full second - the shape of a resumed frame
    // loop after a long suspension.
    state = integrateCameraShake(state, 1_000);
    expect(Math.abs(state.velocity), 'a long gap must bleed energy, never add it')
      .toBeLessThan(kickedVelocity);
    // And the excursion it produced must stay within the effect's own budget
    // rather than launching the camera. At the old 0.25 s ceiling this term is
    // what reached tens of thousands of metres.
    expect(Math.abs(state.displacement)).toBeLessThan(CAMERA_SHAKE_MAX_DISPLACEMENT);
  });
});
