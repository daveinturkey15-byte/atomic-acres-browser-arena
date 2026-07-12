import { describe, expect, it } from 'vitest';
import {
  BOT_DAMAGE_MULTIPLIER,
  WEAPONS,
  advanceMatch,
  applyRadialDeadzone,
  beginReload,
  cancelReload,
  completeReload,
  computeDamage,
  computeRecoilImpulse,
  computeSpread,
  grenadeDamage,
  integrateGamepadLookRate,
  integrateHorizontalVelocity,
  meleeStrike,
  mouseSensitivityMultiplier,
  movementProfile,
  nextStance,
  recoverRecoilImpulse,
  sampleSpreadDisk,
  sprintEligible,
  type MatchState,
} from './gameplay';

describe('solo bot tuning', () => {
  it('deals exactly half the equivalent player weapon damage', () => {
    expect(BOT_DAMAGE_MULTIPLIER).toBe(0.5);
    expect(computeDamage(WEAPONS.carbine, 10, 'body') * BOT_DAMAGE_MULTIPLIER).toBe(15.5);
  });
});

describe('movementProfile', () => {
  it('orders prone, crouch, ADS, run and sprint speeds coherently', () => {
    const prone = movementProfile({ crouched: false, prone: true, ads: false, sprinting: false, grounded: true });
    const crouch = movementProfile({ crouched: true, ads: false, sprinting: false, grounded: true });
    const ads = movementProfile({ crouched: false, ads: true, sprinting: false, grounded: true });
    const run = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true });
    const sprint = movementProfile({ crouched: false, ads: false, sprinting: true, grounded: true });
    expect(prone.maxSpeed).toBeLessThan(crouch.maxSpeed);
    expect(crouch.maxSpeed).toBeLessThan(ads.maxSpeed);
    expect(ads.maxSpeed).toBeLessThan(run.maxSpeed);
    expect(run.maxSpeed).toBeLessThan(sprint.maxSpeed);
    expect(prone.eyeHeight).toBeLessThan(crouch.eyeHeight);
    expect(crouch.eyeHeight).toBeLessThan(run.eyeHeight);
    expect(run.deceleration).toBeGreaterThan(run.acceleration);
  });

  it('reduces air acceleration without changing the requested stance', () => {
    const ground = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true });
    const air = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: false });
    expect(air.acceleration).toBeLessThan(ground.acceleration);
    expect(air.eyeHeight).toBe(ground.eyeHeight);
  });
});

describe('console-style movement integration', () => {
  it('reaches authored run speed and brakes without a hidden friction terminal', () => {
    const profile = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true });
    let velocity = { x: 0, z: 0 };
    for (let step = 0; step < 120; step += 1) {
      velocity = integrateHorizontalVelocity(velocity, { x: 0, z: -1 }, profile, 1 / 120);
    }
    expect(velocity.z).toBeCloseTo(-profile.maxSpeed, 4);
    for (let step = 0; step < 20; step += 1) {
      velocity = integrateHorizontalVelocity(velocity, { x: 0, z: 0 }, profile, 1 / 120);
    }
    expect(Math.abs(velocity.z)).toBeLessThan(0.01);
  });

  it('requires forward intent to sprint and scales mouse input down during ADS', () => {
    expect(sprintEligible(1, 0.4, false, false)).toBe(true);
    expect(sprintEligible(0, 1, false, false)).toBe(false);
    expect(sprintEligible(1, 0, true, false)).toBe(false);
    expect(sprintEligible(1, 0, false, false, true)).toBe(false);
    expect(mouseSensitivityMultiplier(true, false)).toBeLessThan(mouseSensitivityMultiplier(false, false));
  });

  it('reduces stance intents predictably without skipping prone-to-crouch recovery', () => {
    expect(nextStance('stand', 'toggle-crouch')).toBe('crouch');
    expect(nextStance('crouch', 'toggle-crouch')).toBe('stand');
    expect(nextStance('stand', 'toggle-prone')).toBe('prone');
    expect(nextStance('prone', 'toggle-crouch')).toBe('crouch');
    expect(nextStance('prone', 'stand')).toBe('stand');
  });

  it('removes controller stick drift and preserves full-scale radial intent', () => {
    expect(applyRadialDeadzone(0.05, -0.04)).toEqual({ x: 0, y: 0 });
    const full = applyRadialDeadzone(0.6, 0.8);
    expect(Math.hypot(full.x, full.y)).toBeCloseTo(1, 6);
    const diagonal = applyRadialDeadzone(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 6);
    expect(diagonal.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(applyRadialDeadzone(Number.NaN, 0)).toEqual({ x: 0, y: 0 });
    const shaped = applyRadialDeadzone(0.4, 0);
    expect(shaped.x).toBeGreaterThan(0);
    expect(shaped.x).toBeLessThan(0.4);
  });

  it('applies the same acceleration budget to cardinal and diagonal movement', () => {
    const profile = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true });
    const cardinal = integrateHorizontalVelocity({ x: 0, z: 0 }, { x: 0, z: -1 }, profile, 1 / 60);
    const diagonal = integrateHorizontalVelocity({ x: 0, z: 0 }, { x: 1, z: -1 }, profile, 1 / 60);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(Math.hypot(cardinal.x, cardinal.z), 8);
  });

  it('accelerates gamepad look predictably, slows ADS, and releases without a long tail', () => {
    const hip = integrateGamepadLookRate({ yaw: 0, pitch: 0 }, { x: 1, y: -0.5 }, 1 / 60, false, 1);
    const ads = integrateGamepadLookRate({ yaw: 0, pitch: 0 }, { x: 1, y: -0.5 }, 1 / 60, true, 1);
    expect(hip.yaw).toBeGreaterThan(0);
    expect(hip.pitch).toBeLessThan(0);
    expect(Math.abs(ads.yaw)).toBeLessThan(Math.abs(hip.yaw));
    let released = hip;
    for (let frame = 0; frame < 20; frame += 1) {
      released = integrateGamepadLookRate(released, { x: 0, y: 0 }, 1 / 60, false, 1);
    }
    expect(released.yaw).toBe(0);
    expect(released.pitch).toBe(0);
  });

  it('clamps unsafe gamepad sensitivity inputs', () => {
    const normal = integrateGamepadLookRate({ yaw: 0, pitch: 0 }, { x: 1, y: 0 }, 0.05, false, 1.8);
    const excessive = integrateGamepadLookRate({ yaw: 0, pitch: 0 }, { x: 1, y: 0 }, 0.5, false, 99);
    expect(excessive.yaw).toBeCloseTo(normal.yaw, 6);
    expect(Number.isFinite(excessive.yaw)).toBe(true);
  });
});

describe('weapon tuning', () => {
  it('tightens spread in ADS/crouch and widens it while moving or sustaining fire', () => {
    const weapon = WEAPONS.carbine;
    const stillHip = computeSpread(weapon, { ads: false, moving: false, crouched: false, sustainedShots: 0 });
    const ads = computeSpread(weapon, { ads: true, moving: false, crouched: false, sustainedShots: 0 });
    const crouchedAds = computeSpread(weapon, { ads: true, moving: false, crouched: true, sustainedShots: 0 });
    const proneAds = computeSpread(weapon, { ads: true, moving: false, crouched: false, prone: true, sustainedShots: 0 });
    const movingBurst = computeSpread(weapon, { ads: false, moving: true, crouched: false, sustainedShots: 7 });
    expect(ads).toBeLessThan(stillHip);
    expect(crouchedAds).toBeLessThan(ads);
    expect(proneAds).toBeLessThan(ads);
    expect(movingBurst).toBeGreaterThan(stillHip);
  });

  it('samples spread inside a circular cone with deterministic radial scaling', () => {
    expect(sampleSpreadDisk(0.05, 0, 0)).toEqual({ x: 0, y: 0 });
    const edge = sampleSpreadDisk(0.05, 1, 0.25);
    expect(Math.hypot(edge.x, edge.y)).toBeCloseTo(Math.tan(0.05), 8);
    expect(Math.abs(edge.x)).toBeLessThan(1e-8);
    expect(edge.y).toBeGreaterThan(0);
  });

  it('applies range falloff and head/body multipliers with a non-zero floor', () => {
    const weapon = WEAPONS.carbine;
    const closeBody = computeDamage(weapon, 5, 'body');
    const closeHead = computeDamage(weapon, 5, 'head');
    const farBody = computeDamage(weapon, 90, 'body');
    expect(closeHead).toBeGreaterThan(closeBody);
    expect(farBody).toBeLessThan(closeBody);
    expect(farBody).toBeGreaterThanOrEqual(weapon.minimumDamage);
  });

  it('builds bounded directional recoil and recovers it toward rest', () => {
    const impulse = computeRecoilImpulse(WEAPONS.carbine, 8, 1);
    expect(impulse.pitch).toBeGreaterThan(WEAPONS.carbine.recoilPitch);
    expect(impulse.yaw).toBeGreaterThan(0);
    const recovered = recoverRecoilImpulse(impulse, WEAPONS.carbine, 0.2);
    expect(recovered.pitch).toBeLessThan(impulse.pitch);
    expect(recovered.yaw).toBeLessThan(impulse.yaw);
  });
});

describe('reload state', () => {
  it('uses staged reload and transfers only the required available rounds', () => {
    const state = beginReload(WEAPONS.smg, 7, 20, 1_000);
    expect(state?.phase).toBe('eject');
    expect(completeReload(state!, 1_400, 7, 20)).toEqual({ ammo: 7, reserve: 20, completed: false });
    expect(completeReload(state!, state!.endsAt, 7, 20)).toEqual({ ammo: 27, reserve: 0, completed: true });
  });

  it('allows a reload to be cancelled before the magazine is seated', () => {
    const state = beginReload(WEAPONS.carbine, 3, 24, 500)!;
    expect(cancelReload(state, state.seatAt - 1)).toBe(true);
    expect(cancelReload(state, state.seatAt + 1)).toBe(false);
  });
});

describe('equipment and melee', () => {
  it('uses bounded grenade blast falloff', () => {
    expect(grenadeDamage(0)).toBe(115);
    expect(grenadeDamage(4)).toBeGreaterThan(grenadeDamage(7));
    expect(grenadeDamage(9)).toBe(0);
  });

  it('requires melee range and cooldown', () => {
    expect(meleeStrike(1.4, 1_000, 0)).toEqual({ hit: true, damage: 100 });
    expect(meleeStrike(2.5, 1_000, 0).hit).toBe(false);
    expect(meleeStrike(1.4, 1_100, 1_000).hit).toBe(false);
  });
});

describe('match flow', () => {
  it('transitions warmup -> active -> ended and supports rematch reset', () => {
    let state: MatchState = { phase: 'warmup', phaseStartedAt: 0, endsAt: 3_000, winner: null };
    state = advanceMatch(state, 3_000, [0, 0]);
    expect(state.phase).toBe('active');
    state = advanceMatch(state, state.endsAt, [12, 9]);
    expect(state).toMatchObject({ phase: 'ended', winner: 0 });
    state = advanceMatch({ ...state, rematchRequested: true }, state.phaseStartedAt + 1, [12, 9]);
    expect(state).toMatchObject({ phase: 'warmup', winner: null });
  });
});
