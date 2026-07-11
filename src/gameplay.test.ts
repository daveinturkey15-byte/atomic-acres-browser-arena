import { describe, expect, it } from 'vitest';
import {
  WEAPONS,
  advanceMatch,
  beginReload,
  cancelReload,
  completeReload,
  computeDamage,
  computeSpread,
  grenadeDamage,
  meleeStrike,
  movementProfile,
  type MatchState,
} from './gameplay';

describe('movementProfile', () => {
  it('orders crouch, ADS, run and sprint speeds coherently', () => {
    const crouch = movementProfile({ crouched: true, ads: false, sprinting: false, grounded: true });
    const ads = movementProfile({ crouched: false, ads: true, sprinting: false, grounded: true });
    const run = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true });
    const sprint = movementProfile({ crouched: false, ads: false, sprinting: true, grounded: true });
    expect(crouch.maxSpeed).toBeLessThan(ads.maxSpeed);
    expect(ads.maxSpeed).toBeLessThan(run.maxSpeed);
    expect(run.maxSpeed).toBeLessThan(sprint.maxSpeed);
    expect(crouch.eyeHeight).toBeLessThan(run.eyeHeight);
  });

  it('reduces air acceleration without changing the requested stance', () => {
    const ground = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: true });
    const air = movementProfile({ crouched: false, ads: false, sprinting: false, grounded: false });
    expect(air.acceleration).toBeLessThan(ground.acceleration);
    expect(air.eyeHeight).toBe(ground.eyeHeight);
  });
});

describe('weapon tuning', () => {
  it('tightens spread in ADS/crouch and widens it while moving or sustaining fire', () => {
    const weapon = WEAPONS.carbine;
    const stillHip = computeSpread(weapon, { ads: false, moving: false, crouched: false, sustainedShots: 0 });
    const ads = computeSpread(weapon, { ads: true, moving: false, crouched: false, sustainedShots: 0 });
    const crouchedAds = computeSpread(weapon, { ads: true, moving: false, crouched: true, sustainedShots: 0 });
    const movingBurst = computeSpread(weapon, { ads: false, moving: true, crouched: false, sustainedShots: 7 });
    expect(ads).toBeLessThan(stillHip);
    expect(crouchedAds).toBeLessThan(ads);
    expect(movingBurst).toBeGreaterThan(stillHip);
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
