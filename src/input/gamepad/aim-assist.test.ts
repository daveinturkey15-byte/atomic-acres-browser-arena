import { describe, expect, it } from 'vitest';
import {
  AIM_ASSIST_PROFILES,
  ADS_ZONE_SCALE,
  angularDistanceDeg,
  applyTriggerSnap,
  bearingTo,
  evaluateAimAssist,
  smoothstep,
  type AimAssistInput,
} from './aim-assist';

const eye = { x: 0, y: 1.6, z: 0 };
const DEG = Math.PI / 180;

/** A target `distance` metres straight ahead (yaw 0 looks down -Z) rotated `yawOffsetDeg` to the left. */
function targetAt(distance: number, yawOffsetDeg: number, heightOffset = 0) {
  const yaw = yawOffsetDeg * DEG;
  return { point: { x: -Math.sin(yaw) * distance, y: eye.y + heightOffset, z: -Math.cos(yaw) * distance }, id: `t-${yawOffsetDeg}` };
}

function input(overrides: Partial<AimAssistInput>): AimAssistInput {
  return {
    tier: 'pad',
    eye,
    yaw: 0,
    pitch: 0,
    ads: false,
    velocity: { x: 0, z: 0 },
    dt: 1 / 60,
    targets: [targetAt(10, 0)],
    ...overrides,
  };
}

describe('aim assist geometry', () => {
  it('measures bearings in the game camera convention (yaw 0 = -Z, positive yaw turns left)', () => {
    const ahead = bearingTo(eye, { x: 0, y: 1.6, z: -10 });
    expect(ahead.yaw).toBeCloseTo(0, 10);
    expect(ahead.pitch).toBeCloseTo(0, 10);
    expect(ahead.distance).toBeCloseTo(10, 10);
    const left = bearingTo(eye, targetAt(10, 30).point);
    expect(left.yaw).toBeCloseTo(30 * DEG, 10);
    const above = bearingTo(eye, { x: 0, y: 1.6 + 10, z: -10 });
    expect(above.pitch).toBeCloseTo(45 * DEG, 10);
    expect(angularDistanceDeg(0, 0, left)).toBeCloseTo(30, 6);
    expect(angularDistanceDeg(30 * DEG, 0, left)).toBeCloseTo(0, 6);
  });

  it('smoothstep is clamped and monotonic', () => {
    expect(smoothstep(1, 5, 0)).toBe(0);
    expect(smoothstep(1, 5, 5)).toBe(1);
    expect(smoothstep(1, 5, 3)).toBeCloseTo(0.5, 10);
    expect(smoothstep(2, 2, 1)).toBe(0);
    expect(smoothstep(2, 2, 3)).toBe(1);
  });
});

describe('tiered aim assist', () => {
  it('gives the mouse tier nothing regardless of targets', () => {
    const result = evaluateAimAssist(input({ tier: 'mouse' }));
    expect(result).toMatchObject({ tier: 'mouse', lookRateScale: 1, frictionYawRadPerSec: 0, nearestAngleDeg: null });
  });

  it('orders the tiers: touch strongest, pad medium, mouse none', () => {
    expect(AIM_ASSIST_PROFILES.touch.minLookScale).toBeLessThan(AIM_ASSIST_PROFILES.pad.minLookScale);
    expect(AIM_ASSIST_PROFILES.pad.minLookScale).toBeLessThan(AIM_ASSIST_PROFILES.mouse.minLookScale);
    expect(AIM_ASSIST_PROFILES.touch.slowdownOuterDeg).toBeGreaterThan(AIM_ASSIST_PROFILES.pad.slowdownOuterDeg);
    expect(AIM_ASSIST_PROFILES.touch.frictionGain).toBeGreaterThan(AIM_ASSIST_PROFILES.pad.frictionGain);
    expect(AIM_ASSIST_PROFILES.pad.snapConeDeg).toBe(0);
    expect(AIM_ASSIST_PROFILES.touch.snapConeDeg).toBeGreaterThan(0);
    const onTarget = { targets: [targetAt(10, 0)] };
    const touch = evaluateAimAssist(input({ tier: 'touch', ...onTarget })).lookRateScale;
    const pad = evaluateAimAssist(input({ tier: 'pad', ...onTarget })).lookRateScale;
    expect(touch).toBe(AIM_ASSIST_PROFILES.touch.minLookScale);
    expect(pad).toBe(AIM_ASSIST_PROFILES.pad.minLookScale);
    expect(touch).toBeLessThan(pad);
  });

  it('slows fully inside the inner zone, blends across the band, and releases past the outer edge', () => {
    const profile = AIM_ASSIST_PROFILES.pad;
    const inside = evaluateAimAssist(input({ targets: [targetAt(10, profile.slowdownInnerDeg * 0.5)] }));
    expect(inside.lookRateScale).toBeCloseTo(profile.minLookScale, 10);
    expect(inside.nearestAngleDeg).toBeCloseTo(profile.slowdownInnerDeg * 0.5, 4);
    const mid = evaluateAimAssist(input({ targets: [targetAt(10, (profile.slowdownInnerDeg + profile.slowdownOuterDeg) / 2)] }));
    expect(mid.lookRateScale).toBeCloseTo(profile.minLookScale + (1 - profile.minLookScale) * 0.5, 6);
    const outside = evaluateAimAssist(input({ targets: [targetAt(10, profile.slowdownOuterDeg + 1)] }));
    expect(outside.lookRateScale).toBe(1);
    expect(outside.nearestAngleDeg).toBeGreaterThan(profile.slowdownOuterDeg);
  });

  it('ignores targets beyond range and picks the nearest by angle', () => {
    const far = evaluateAimAssist(input({ targets: [targetAt(AIM_ASSIST_PROFILES.pad.maxRangeM + 5, 0)] }));
    expect(far.lookRateScale).toBe(1);
    expect(far.nearestTargetId).toBeNull();
    const two = evaluateAimAssist(input({ targets: [targetAt(10, 20), targetAt(12, 1)] }));
    expect(two.nearestTargetId).toBe('t-1');
    const none = evaluateAimAssist(input({ targets: [] }));
    expect(none.lookRateScale).toBe(1);
  });

  it('shrinks the zone while aiming down sights', () => {
    const profile = AIM_ASSIST_PROFILES.pad;
    const angle = profile.slowdownOuterDeg * ADS_ZONE_SCALE + 0.2;
    const hip = evaluateAimAssist(input({ targets: [targetAt(10, angle)] }));
    const ads = evaluateAimAssist(input({ ads: true, targets: [targetAt(10, angle)] }));
    expect(hip.lookRateScale).toBeLessThan(1);
    expect(ads.lookRateScale).toBe(1);
  });

  it('adds strafe friction toward the target only while strafing, capped and faded across the zone', () => {
    const still = evaluateAimAssist(input({ velocity: { x: 0, z: 0 } }));
    expect(still.frictionYawRadPerSec).toBe(0);
    expect(still.strafing).toBe(false);
    // Strafing right (+X) makes a target ahead drift left in view; keeping it
    // centred needs yaw to increase (positive) in this convention.
    const strafingRight = evaluateAimAssist(input({ velocity: { x: 3, z: 0 } }));
    expect(strafingRight.strafing).toBe(true);
    expect(strafingRight.frictionYawRadPerSec).toBeGreaterThan(0);
    // Required rate at 10 m and 3 m/s is 0.3 rad/s; gain 0.35 → 0.105 rad/s.
    expect(strafingRight.frictionYawRadPerSec).toBeCloseTo(0.35 * 0.3, 2);
    const strafingLeft = evaluateAimAssist(input({ velocity: { x: -3, z: 0 } }));
    expect(strafingLeft.frictionYawRadPerSec).toBeCloseTo(-strafingRight.frictionYawRadPerSec, 6);
    // Capped at the profile maximum when very close and fast.
    const capped = evaluateAimAssist(input({ velocity: { x: 12, z: 0 }, targets: [targetAt(1.5, 0)] }));
    expect(capped.frictionYawRadPerSec).toBeCloseTo(AIM_ASSIST_PROFILES.pad.frictionMaxRadPerSec, 6);
    // Fades to zero past the outer edge.
    const outside = evaluateAimAssist(input({ velocity: { x: 3, z: 0 }, targets: [targetAt(10, 7)] }));
    expect(outside.frictionYawRadPerSec).toBe(0);
    // Touch friction is stronger than pad friction for the same situation.
    const touch = evaluateAimAssist(input({ tier: 'touch', velocity: { x: 3, z: 0 } }));
    expect(Math.abs(touch.frictionYawRadPerSec)).toBeGreaterThan(Math.abs(strafingRight.frictionYawRadPerSec));
  });

  it('is deterministic and guards non-finite input', () => {
    const a = evaluateAimAssist(input({ velocity: { x: 2, z: 1 }, targets: [targetAt(9, 2)] }));
    const b = evaluateAimAssist(input({ velocity: { x: 2, z: 1 }, targets: [targetAt(9, 2)] }));
    expect(a).toEqual(b);
    const bad = evaluateAimAssist(input({ yaw: Number.NaN }));
    expect(bad.lookRateScale).toBe(1);
    expect(bad.frictionYawRadPerSec).toBe(0);
  });
});

describe('trigger micro-snap', () => {
  it('only the touch tier snaps, by at most snapMaxDeg, inside the cone', () => {
    const base = { eye, yaw: 0, pitch: 0, targets: [targetAt(10, 1.5)] };
    const pad = applyTriggerSnap({ ...base, tier: 'pad' });
    expect(pad).toMatchObject({ yaw: 0, pitch: 0, snappedDeg: 0, targetId: null });
    const mouse = applyTriggerSnap({ ...base, tier: 'mouse' });
    expect(mouse.snappedDeg).toBe(0);
    const touch = applyTriggerSnap({ ...base, tier: 'touch' });
    expect(touch.snappedDeg).toBeCloseTo(AIM_ASSIST_PROFILES.touch.snapMaxDeg, 6);
    expect(touch.yaw).toBeCloseTo(AIM_ASSIST_PROFILES.touch.snapMaxDeg * DEG, 6);
    expect(touch.targetId).toBe('t-1.5');
    // Inside the maximum the view lands exactly on the target.
    const close = applyTriggerSnap({ ...base, tier: 'touch', targets: [targetAt(10, 0.5)] });
    expect(close.yaw).toBeCloseTo(0.5 * DEG, 6);
    // Outside the cone nothing moves.
    const outside = applyTriggerSnap({ ...base, tier: 'touch', targets: [targetAt(10, 3)] });
    expect(outside.snappedDeg).toBe(0);
    expect(outside.yaw).toBe(0);
  });
});

// PASS 84 skeptic finding 2026-09-02: the assist had no line-of-sight test, so
// a hostile behind a wall inside the cone still slowed the look rate and dragged
// yaw — the game appearing to pull at nothing.
describe('line of sight', () => {
  it('skips an occluded nearest target and assists the nearest VISIBLE one instead', () => {
    const near = targetAt(10, 1);
    const far = targetAt(10, 4);
    const blind = evaluateAimAssist(input({ targets: [near, far], isVisible: () => false }));
    expect(blind.lookRateScale, 'every target occluded means no assist at all').toBe(1);
    expect(blind.nearestTargetId).toBeNull();
    expect(blind.nearestAngleDeg).toBeNull();

    const partial = evaluateAimAssist(input({ targets: [near, far], isVisible: (t) => t.id !== near.id }));
    expect(partial.nearestTargetId).toBe(far.id);
    expect(partial.nearestAngleDeg).toBeCloseTo(4, 6);
    const open = evaluateAimAssist(input({ targets: [near, far] }));
    expect(open.nearestTargetId, 'no predicate keeps the previous behaviour').toBe(near.id);
    expect(partial.lookRateScale, 'the visible target is farther out, so it slows less')
      .toBeGreaterThan(open.lookRateScale);
  });

  it('pays for the occlusion test only on candidates that improve on the best visible so far', () => {
    const asked: string[] = [];
    // Ordered nearest-first: only the first is ever an improvement.
    const targets = [targetAt(10, 1), targetAt(10, 2), targetAt(10, 3), targetAt(10, 4)];
    evaluateAimAssist(input({ targets, isVisible: (t) => { asked.push(t.id!); return true; } }));
    expect(asked).toEqual(['t-1']);
    // Ordered farthest-first: every one improves, so every one is tested.
    asked.length = 0;
    evaluateAimAssist(input({ targets: [...targets].reverse(), isVisible: (t) => { asked.push(t.id!); return true; } }));
    expect(asked).toEqual(['t-4', 't-3', 't-2', 't-1']);
    // Out-of-range candidates never reach the predicate.
    asked.length = 0;
    evaluateAimAssist(input({
      targets: [targetAt(200, 0.5), targetAt(10, 2)],
      isVisible: (t) => { asked.push(t.id!); return true; },
    }));
    expect(asked).toEqual(['t-2']);
  });

  it('the touch trigger micro-snap honours the same predicate', () => {
    const base = { eye, yaw: 0, pitch: 0, tier: 'touch' as const, targets: [targetAt(10, 1.5)] };
    expect(applyTriggerSnap({ ...base, isVisible: () => false })).toMatchObject({ snappedDeg: 0, targetId: null, yaw: 0 });
    expect(applyTriggerSnap({ ...base, isVisible: () => true }).targetId).toBe('t-1.5');
  });

  it('returns an independent reading each call despite the shared scratch record', () => {
    const a = evaluateAimAssist(input({ targets: [targetAt(10, 1)] }));
    const b = evaluateAimAssist(input({ targets: [targetAt(10, 4)] }));
    expect(a.nearestAngleDeg).toBeCloseTo(1, 6);
    expect(b.nearestAngleDeg).toBeCloseTo(4, 6);
    expect(a.nearestTargetId).toBe('t-1');
    expect(a.lookRateScale).toBeLessThan(b.lookRateScale);
  });
});
