import { describe, expect, it } from 'vitest';
import {
  AIM_PITCH_DISTRIBUTION,
  AIM_PITCH_LIMITS,
  DEFAULT_ADDITIVE_POSE_PROFILE,
  MAXIMUM_LEAN_RADIANS,
  advanceAdditivePose,
  clampAimPitch,
  createAdditivePoseState,
  distributeAimPitch,
  smoothTowards,
  wrapAngleRadians,
  type AdditivePoseInput,
} from './animation-additive-pose';

const still: AdditivePoseInput = Object.freeze({
  deltaSeconds: 1 / 90,
  desiredAimPitchRadians: 0,
  yawErrorRadians: 0,
  strafeMps: 0,
  groundSpeedMps: 0,
});

describe('aim pitch distribution', () => {
  it('splits the whole authored chain and nothing else', () => {
    const roles = Object.keys(AIM_PITCH_DISTRIBUTION).sort();
    expect(roles).toEqual(['chest', 'head', 'neck', 'spine']);
    const total = Object.values(AIM_PITCH_DISTRIBUTION).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('sums the per-joint offsets to exactly the requested pitch', () => {
    for (const pitch of [-0.7, -0.31, 0, 0.12, 0.55]) {
      const joints = distributeAimPitch(pitch);
      const total = joints.spine + joints.chest + joints.neck + joints.head;
      expect(total, `${pitch}`).toBeCloseTo(pitch, 12);
    }
  });

  it('sums to the CLAMPED pitch when the request is out of range', () => {
    const up = distributeAimPitch(4);
    expect(up.spine + up.chest + up.neck + up.head).toBeCloseTo(AIM_PITCH_LIMITS.maximumUpRadians, 12);
    const down = distributeAimPitch(-4);
    expect(down.spine + down.chest + down.neck + down.head).toBeCloseTo(-AIM_PITCH_LIMITS.maximumDownRadians, 12);
  });

  it('never asks a single joint to carry the whole bend', () => {
    const joints = distributeAimPitch(AIM_PITCH_LIMITS.maximumUpRadians);
    for (const value of Object.values(joints)) {
      expect(Math.abs(value)).toBeLessThan(AIM_PITCH_LIMITS.maximumUpRadians);
    }
  });

  it('degrades to a flat chain when the distribution is unusable', () => {
    expect(distributeAimPitch(0.4, { spine: 0, chest: 0, neck: 0, head: 0 }))
      .toEqual({ spine: 0, chest: 0, neck: 0, head: 0 });
  });
});

describe('clampAimPitch', () => {
  it('is asymmetric, matching how a body actually folds', () => {
    expect(AIM_PITCH_LIMITS.maximumDownRadians).toBeGreaterThan(AIM_PITCH_LIMITS.maximumUpRadians);
    expect(clampAimPitch(9)).toBe(AIM_PITCH_LIMITS.maximumUpRadians);
    expect(clampAimPitch(-9)).toBe(-AIM_PITCH_LIMITS.maximumDownRadians);
    expect(clampAimPitch(0.2)).toBe(0.2);
  });

  it('treats any non-finite pitch as level rather than as a limit', () => {
    // Infinity means "no aim data", not "aim as high as possible" - saturating
    // to the limit would snap a rig upright the first frame a NaN reaches it.
    expect(clampAimPitch(Number.NaN)).toBe(0);
    expect(clampAimPitch(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampAimPitch(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('wrapAngleRadians', () => {
  it('returns the shortest signed angle', () => {
    expect(wrapAngleRadians(0)).toBeCloseTo(0, 12);
    expect(wrapAngleRadians(Math.PI * 2 + 0.3)).toBeCloseTo(0.3, 12);
    expect(wrapAngleRadians(-Math.PI * 2 - 0.3)).toBeCloseTo(-0.3, 12);
    expect(Math.abs(wrapAngleRadians(Math.PI * 3))).toBeCloseTo(Math.PI, 12);
  });
});

describe('smoothTowards', () => {
  it('approaches without ever overshooting', () => {
    let value = 0;
    for (let frame = 0; frame < 400; frame += 1) {
      const next = smoothTowards(value, 1, 1 / 30, 6);
      expect(next).toBeGreaterThanOrEqual(value);
      expect(next).toBeLessThanOrEqual(1);
      value = next;
    }
    expect(value).toBeCloseTo(1, 6);
  });

  it('lands in the same place at wildly different frame rates', () => {
    const converge = (steps: number): number => {
      let value = 0;
      for (let frame = 0; frame < steps; frame += 1) value = smoothTowards(value, 1, 1 / steps, 6);
      return value;
    };
    expect(converge(24)).toBeCloseTo(converge(240), 3);
  });

  it('holds still when there is no time or no response', () => {
    expect(smoothTowards(0.4, 1, 0, 6)).toBe(0.4);
    expect(smoothTowards(0.4, 1, 0.1, 0)).toBe(0.4);
  });
});

describe('advanceAdditivePose', () => {
  it('converges the aim onto the requested pitch and stays clamped throughout', () => {
    const state = createAdditivePoseState();
    let previous = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      const output = advanceAdditivePose(state, { ...still, desiredAimPitchRadians: 0.5 });
      expect(output.aimPitchRadians).toBeGreaterThanOrEqual(previous - 1e-12);
      expect(output.aimPitchRadians).toBeLessThanOrEqual(AIM_PITCH_LIMITS.maximumUpRadians);
      previous = output.aimPitchRadians;
    }
    expect(previous).toBeCloseTo(0.5, 4);
  });

  it('refuses to exceed the anatomical limit no matter what is asked for', () => {
    const state = createAdditivePoseState();
    let output = advanceAdditivePose(state, { ...still, desiredAimPitchRadians: 40 });
    for (let frame = 0; frame < 300; frame += 1) {
      output = advanceAdditivePose(state, { ...still, desiredAimPitchRadians: 40 });
    }
    expect(output.aimPitchRadians).toBeLessThanOrEqual(AIM_PITCH_LIMITS.maximumUpRadians);
    const joints = output.aimJointRadians;
    expect(joints.spine + joints.chest + joints.neck + joints.head)
      .toBeCloseTo(output.aimPitchRadians, 12);
  });

  it('leans into a strafe and returns to upright, inside the global ceiling', () => {
    const state = createAdditivePoseState();
    let output = advanceAdditivePose(state, { ...still, strafeMps: 6, groundSpeedMps: 6 });
    for (let frame = 0; frame < 200; frame += 1) {
      output = advanceAdditivePose(state, { ...still, strafeMps: 6, groundSpeedMps: 6 });
    }
    expect(output.leanRollRadians).toBeGreaterThan(0);
    expect(Math.abs(output.leanRollRadians)).toBeLessThanOrEqual(MAXIMUM_LEAN_RADIANS);
    expect(Math.abs(output.leanRollRadians))
      .toBeLessThanOrEqual(DEFAULT_ADDITIVE_POSE_PROFILE.maximumLeanRadians + 1e-12);

    for (let frame = 0; frame < 400; frame += 1) output = advanceAdditivePose(state, still);
    expect(output.leanRollRadians).toBeCloseTo(0, 4);
  });
});

describe('turn in place', () => {
  it('enters on a large stationary yaw error and leaves only under the exit angle', () => {
    const state = createAdditivePoseState();
    let yawError = 1.6;
    let output = advanceAdditivePose(state, { ...still, yawErrorRadians: yawError });
    expect(output.turning).toBe(1);

    let entered = 0;
    for (let frame = 0; frame < 400 && output.turning !== 0; frame += 1) {
      yawError -= output.bodyYawDeltaRadians;
      output = advanceAdditivePose(state, { ...still, yawErrorRadians: yawError });
      entered += 1;
    }
    expect(entered).toBeGreaterThan(1);
    expect(Math.abs(yawError)).toBeLessThanOrEqual(DEFAULT_ADDITIVE_POSE_PROFILE.turnExitRadians + 1e-6);
  });

  it('does not flicker at the entry threshold', () => {
    const state = createAdditivePoseState();
    const justUnder = DEFAULT_ADDITIVE_POSE_PROFILE.turnEnterRadians - 0.01;
    for (let frame = 0; frame < 50; frame += 1) {
      expect(advanceAdditivePose(state, { ...still, yawErrorRadians: justUnder }).turning).toBe(0);
    }
  });

  it('never turns in place while moving', () => {
    const state = createAdditivePoseState();
    const output = advanceAdditivePose(state, { ...still, yawErrorRadians: 2.9, groundSpeedMps: 5 });
    expect(output.turning).toBe(0);
    // A moving body still steers, just faster and without the pivot state.
    expect(output.bodyYawDeltaRadians).toBeGreaterThan(0);
  });

  it('rate limits the body yaw and reports the residual', () => {
    const state = createAdditivePoseState();
    const deltaSeconds = 1 / 60;
    const output = advanceAdditivePose(state, { ...still, deltaSeconds, yawErrorRadians: 3 });
    const ceiling = DEFAULT_ADDITIVE_POSE_PROFILE.turnRateRadiansPerSecond * deltaSeconds;
    expect(Math.abs(output.bodyYawDeltaRadians)).toBeLessThanOrEqual(ceiling + 1e-12);
    expect(output.residualYawErrorRadians).toBeCloseTo(3 - output.bodyYawDeltaRadians, 12);
  });

  it('turns the short way round', () => {
    const state = createAdditivePoseState();
    expect(advanceAdditivePose(state, { ...still, yawErrorRadians: -1.6 }).bodyYawDeltaRadians).toBeLessThan(0);
  });
});

describe('breathing', () => {
  it('keeps a bounded phase and a bounded offset', () => {
    const state = createAdditivePoseState(0.37);
    let output = advanceAdditivePose(state, still);
    for (let frame = 0; frame < 2_000; frame += 1) {
      output = advanceAdditivePose(state, still);
      expect(output.breathPhase).toBeGreaterThanOrEqual(0);
      expect(output.breathPhase).toBeLessThan(1);
      expect(Math.abs(output.breathOffsetRadians))
        .toBeLessThanOrEqual(DEFAULT_ADDITIVE_POSE_PROFILE.breathAmplitudeRadians + 1e-12);
    }
  });

  it('starts two operators at different points in the cycle', () => {
    const first = advanceAdditivePose(createAdditivePoseState(0.1), still);
    const second = advanceAdditivePose(createAdditivePoseState(0.6), still);
    expect(first.breathOffsetRadians).not.toBeCloseTo(second.breathOffsetRadians, 6);
  });
});

describe('determinism', () => {
  it('reproduces the whole pose stream from the same inputs', () => {
    const script: readonly AdditivePoseInput[] = Array.from({ length: 64 }, (_unused, index) => ({
      deltaSeconds: 0.004 + (index % 7) * 0.003,
      desiredAimPitchRadians: Math.sin(index * 0.31) * 0.9,
      yawErrorRadians: Math.cos(index * 0.17) * 2.4,
      strafeMps: Math.sin(index * 0.11) * 5,
      groundSpeedMps: Math.abs(Math.sin(index * 0.23)) * 7,
    }));
    const run = (): unknown[] => {
      const state = createAdditivePoseState(0.42);
      return script.map((input) => advanceAdditivePose(state, input));
    };
    expect(run()).toEqual(run());
  });
});
