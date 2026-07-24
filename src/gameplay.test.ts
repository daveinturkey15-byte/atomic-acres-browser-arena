import { describe, expect, it } from 'vitest';
import {
  BOT_DAMAGE_MULTIPLIER,
  admittedPlayerDamage,
  botScaledDamage,
  HEADSHOT_DAMAGE_MULTIPLIER,
  SNIPER_HEADSHOT_DAMAGE_MULTIPLIER,
  WEAPONS,
  advanceMatch,
  advanceFreeForAllMatch,
  applyRadialDeadzone,
  beginReload,
  cancelReload,
  completeReload,
  computeDamage,
  computeFallDamage,
  computeRecoilImpulse,
  computeSpread,
  grenadeDamage,
  integrateGamepadLookRate,
  integrateHorizontalVelocity,
  isSingleShotLethalFromFullHp,
  meleeStrike,
  mouseSensitivityMultiplier,
  movementProfile,
  nextStance,
  recoverRecoilImpulse,
  reloadProgress,
  sampleSpreadDisk,
  sampleWeaponPellet,
  shotsToDownFromFullHp,
  sprintEligible,
  type MatchState,
} from './gameplay';

describe('solo bot tuning', () => {
  it('deals exactly half the previous Pass 30 bot damage', () => {
    expect(BOT_DAMAGE_MULTIPLIER).toBe(0.25);
    expect(botScaledDamage(computeDamage(WEAPONS.carbine, 10, 'body'))).toBe(7.75);
    expect(botScaledDamage(230)).toBe(57.5);
    expect(admittedPlayerDamage(botScaledDamage(grenadeDamage(15)), 0)).toBe(0.25);
    expect(botScaledDamage(Number.NaN)).toBe(0);
  });
});

describe('headshot damage contract', () => {
  it('keeps the DHV X magnum binary: lethal head, zero body or limb', () => {
    expect(WEAPONS.magnum.rpm).toBe(90);
    expect(computeDamage(WEAPONS.magnum, 10, 'head')).toBe(100);
    expect(computeDamage(WEAPONS.magnum, 10, 'body')).toBe(0);
    expect(computeDamage(WEAPONS.magnum, 10, 'limb')).toBe(0);
  });
  it('uses exactly 1.5× head damage for every firearm', () => {
    expect(HEADSHOT_DAMAGE_MULTIPLIER).toBe(1.5);
    expect(SNIPER_HEADSHOT_DAMAGE_MULTIPLIER).toBe(3);
    for (const weapon of Object.values(WEAPONS).filter((entry) => entry.id !== 'sniper' && entry.id !== 'magnum')) {
      expect(weapon.headMultiplier).toBe(HEADSHOT_DAMAGE_MULTIPLIER);
    }
    expect(WEAPONS.sniper.headMultiplier).toBe(SNIPER_HEADSHOT_DAMAGE_MULTIPLIER);
  });

  it('SMG body is 23 and headshot is 1.5× (35), never a one-shot from full HP', () => {
    expect(computeDamage(WEAPONS.smg, 8, 'body')).toBe(23);
    expect(computeDamage(WEAPONS.smg, 8, 'head')).toBe(35);
    expect(computeDamage(WEAPONS.smg, 8, 'head')).toBeLessThan(100);
    expect(computeDamage(WEAPONS.smg, 8, 'head') / computeDamage(WEAPONS.smg, 8, 'body')).toBeCloseTo(1.5, 1);
    expect(isSingleShotLethalFromFullHp(WEAPONS.smg, 'head')).toBe(false);
    expect(shotsToDownFromFullHp(WEAPONS.smg, 'head')).toBe(3); // 35+35+30
    expect(shotsToDownFromFullHp(WEAPONS.smg, 'body')).toBe(5); // 23*4=92, +23
  });

  it('only sniper head and close scattergun are single-shot lethal without Overdrive', () => {
    expect(isSingleShotLethalFromFullHp(WEAPONS.sniper, 'head')).toBe(true);
    expect(isSingleShotLethalFromFullHp(WEAPONS.sniper, 'body')).toBe(false);
    expect(isSingleShotLethalFromFullHp(WEAPONS.carbine, 'head')).toBe(false);
    expect(isSingleShotLethalFromFullHp(WEAPONS.pistol, 'head')).toBe(false);
    expect(isSingleShotLethalFromFullHp(WEAPONS['machine-pistol'], 'head')).toBe(false);
    // Scattergun multi-pellet at point blank is intentionally lethal.
    expect(isSingleShotLethalFromFullHp(WEAPONS.scattergun, 'body')).toBe(true);
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

  it('applies authored cone spread to single-projectile guns and keeps one shotgun pellet centred', () => {
    for (const weapon of Object.values(WEAPONS)) {
      const principal = sampleWeaponPellet(weapon, 0, weapon.maximumSpread, 1, 0.37);
      if (weapon.pellets === 1) {
        expect(Math.hypot(principal.x, principal.y), weapon.id).toBeGreaterThan(0);
        expect(Math.hypot(principal.x, principal.y), weapon.id).toBeCloseTo(Math.tan(weapon.maximumSpread), 8);
      } else {
        expect(principal, weapon.id).toEqual({ x: 0, y: 0 });
      }
    }
    expect(sampleWeaponPellet(WEAPONS.scattergun, 1, WEAPONS.scattergun.hipSpread, 1, 0.25).y).toBeGreaterThan(0);
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

  it('keeps the service pistol useful without replacing a primary weapon', () => {
    const pistol = WEAPONS.pistol;
    expect(pistol.automatic).toBe(false);
    expect(pistol.mag).toBe(15);
    expect(computeDamage(pistol, 10, 'body')).toBe(36);
    expect(computeDamage(pistol, 10, 'head')).toBe(54);
    expect(pistol.rpm).toBeLessThan(WEAPONS.carbine.rpm);
    expect(pistol.switchSeconds).toBeLessThan(WEAPONS.smg.switchSeconds);
  });

  it('gives the marksman a bounded full-auto G18 sidearm', () => {
    const auto = WEAPONS['machine-pistol'];
    expect(auto.name).toBe('G18 AUTO');
    expect(auto.automatic).toBe(true);
    expect(auto.rpm).toBeGreaterThan(WEAPONS.smg.rpm);
    expect(auto.damage).toBeLessThan(WEAPONS.pistol.damage);
    expect(auto.mag).toBe(20);
    expect(auto.reserve).toBe(80);
    expect(Math.hypot(...Object.values(sampleWeaponPellet(auto, 0, auto.maximumSpread, 1, 0.5)))).toBeGreaterThan(0);
  });

  it('gives the Longline sniper an exact one-headshot two-body-shot lethality contract', () => {
    const sniper = WEAPONS.sniper;
    const body = computeDamage(sniper, 90, 'body');
    const head = computeDamage(sniper, 90, 'head');
    expect(sniper.automatic).toBe(false);
    expect(sniper.mag).toBe(5);
    expect(sniper.reserve).toBe(25);
    expect(body).toBe(67);
    expect(body).toBeLessThan(100);
    expect(body * 2).toBeGreaterThanOrEqual(100);
    expect(head).toBeGreaterThanOrEqual(100);
    expect(head).toBe(Math.round(body * SNIPER_HEADSHOT_DAMAGE_MULTIPLIER));
    expect(sniper.rpm).toBeLessThan(WEAPONS.scattergun.rpm);
    expect(sniper.hipSpread).toBeGreaterThan(WEAPONS.carbine.hipSpread);
    expect(sniper.hipSpread * sniper.adsSpreadMultiplier).toBeLessThan(
      WEAPONS.carbine.hipSpread * WEAPONS.carbine.adsSpreadMultiplier,
    );
  });

  it('applies the owner-approved close-range Model 12 damage increase without changing cadence or pellet count', () => {
    const shotgun = WEAPONS.scattergun;
    expect(shotgun.damage).toBe(17);
    expect(shotgun.minimumDamage).toBe(7);
    expect(shotgun.pellets).toBe(9);
    expect(computeDamage(shotgun, 5, 'body') * shotgun.pellets).toBe(153);
    expect(shotgun.rpm).toBe(82);
  });

  it('builds bounded directional recoil and recovers it toward rest', () => {
    const impulse = computeRecoilImpulse(WEAPONS.carbine, 8, 1);
    expect(impulse.pitch).toBeGreaterThan(WEAPONS.carbine.recoilPitch);
    expect(impulse.yaw).toBeGreaterThan(0);
    const recovered = recoverRecoilImpulse(impulse, WEAPONS.carbine, 0.2);
    expect(recovered.pitch).toBeLessThan(impulse.pitch);
    expect(recovered.yaw).toBeLessThan(impulse.yaw);
  });

  it('reduces recoil in ADS, crouch and prone for every firearm', () => {
    for (const weapon of Object.values(WEAPONS)) {
      const hip = computeRecoilImpulse(weapon, 6, 1, { ads: false, crouched: false });
      const ads = computeRecoilImpulse(weapon, 6, 1, { ads: true, crouched: false });
      const crouchedAds = computeRecoilImpulse(weapon, 6, 1, { ads: true, crouched: true });
      const proneAds = computeRecoilImpulse(weapon, 6, 1, { ads: true, crouched: false, prone: true });
      expect(ads.pitch, weapon.id).toBeLessThan(hip.pitch);
      expect(crouchedAds.pitch, weapon.id).toBeLessThan(ads.pitch);
      expect(proneAds.pitch, weapon.id).toBeLessThan(crouchedAds.pitch);
      expect(Math.abs(proneAds.yaw), weapon.id).toBeLessThan(Math.abs(crouchedAds.yaw));
    }
  });
});

describe('fall damage', () => {
  it('keeps ordinary landings safe and scales severe impacts to lethal damage', () => {
    expect(computeFallDamage(0)).toBe(0);
    expect(computeFallDamage(9.5)).toBe(0);
    expect(computeFallDamage(14)).toBeGreaterThan(0);
    expect(computeFallDamage(18)).toBeGreaterThan(computeFallDamage(14));
    expect(computeFallDamage(22)).toBe(100);
    expect(computeFallDamage(Number.NaN)).toBe(0);
  });
});

describe('reload state', () => {
  it('uses staged reload and transfers only the required available rounds', () => {
    const state = beginReload(WEAPONS.smg, 7, 20, 1_000);
    expect(state?.phase).toBe('eject');
    expect(completeReload(state!, 1_400, 7, 20)).toEqual({ ammo: 7, reserve: 20, completed: false });
    expect(completeReload(state!, state!.endsAt, 7, 20)).toEqual({ ammo: 27, reserve: 0, completed: true });
  });

  it('derives clamped presentation progress from the authoritative reload timeline', () => {
    const state = beginReload(WEAPONS.pistol, 2, 15, 1_000)!;
    expect(reloadProgress(null, 1_000)).toBeNull();
    expect(reloadProgress(state, 900)).toBe(0);
    expect(reloadProgress(state, 1_000)).toBe(0);
    expect(reloadProgress(state, (state.startedAt + state.endsAt) / 2)).toBeCloseTo(0.5, 6);
    expect(reloadProgress(state, state.endsAt + 1_000)).toBe(1);
  });

  it('allows a reload to be cancelled before the magazine is seated', () => {
    const state = beginReload(WEAPONS.carbine, 3, 24, 500)!;
    expect(cancelReload(state, state.seatAt - 1)).toBe(true);
    expect(cancelReload(state, state.seatAt + 1)).toBe(false);
  });
});

describe('equipment and melee', () => {
  it('uses bounded grenade blast falloff', () => {
    expect(grenadeDamage(0)).toBe(230);
    expect(grenadeDamage(8)).toBeGreaterThan(grenadeDamage(14));
    expect(grenadeDamage(16)).toBe(0);
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

  it('keeps Atomic active above 25 kills and ends only at five minutes', () => {
    const rules = { durationMs: 300_000, scoreLimit: null } as const;
    let state: MatchState = { phase: 'warmup', phaseStartedAt: 0, endsAt: 3_000, winner: null };
    state = advanceMatch(state, 3_000, [0, 0], rules);
    expect(state).toMatchObject({ phase: 'active', endsAt: 303_000 });
    state = advanceMatch(state, 302_999, [80, 72], rules);
    expect(state.phase).toBe('active');
    state = advanceMatch(state, 303_000, [80, 72], rules);
    expect(state).toMatchObject({ phase: 'ended', endReason: 'time', winner: 0 });
  });

  it('supports an untimed and uncapped practice session', () => {
    const rules = { durationMs: null, scoreLimit: null } as const;
    let state: MatchState = { phase: 'warmup', phaseStartedAt: 0, endsAt: 3_000, winner: null };
    state = advanceMatch(state, 3_000, [0, 0], rules);
    expect(state.endsAt).toBe(Number.POSITIVE_INFINITY);
    expect(advanceMatch(state, 99_000_000, [999, 0], rules).phase).toBe('active');
  });

  it('ends free-for-all with one player winner or a draw', () => {
    const rules = { durationMs: 60_000, scoreLimit: null } as const;
    let state: MatchState = { phase: 'warmup', phaseStartedAt: 0, endsAt: 3_000, winner: null };
    state = advanceFreeForAllMatch(state, 3_100, [{ id: 'a', kills: 0 }], rules);
    expect(state).toMatchObject({ phase: 'active', phaseStartedAt: 3_000, endsAt: 63_000 });
    const winner = advanceFreeForAllMatch(state, 63_000, [{ id: 'a', kills: 8 }, { id: 'b', kills: 7 }], rules);
    expect(winner).toMatchObject({ phase: 'ended', winner: null, winnerPlayerId: 'a' });
    const draw = advanceFreeForAllMatch(state, 63_000, [{ id: 'a', kills: 8 }, { id: 'b', kills: 8 }], rules);
    expect(draw).toMatchObject({ phase: 'ended', winner: 'draw' });
  });
});
