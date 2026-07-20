import { describe, expect, it } from 'vitest';
import {
  BOT_DEATHS_PER_REINFORCEMENT,
  BOT_FIRE_RANGE,
  BOT_GRENADE_COOLDOWN_MS,
  BOT_GRENADE_MAX_RANGE,
  BOT_GRENADE_MIN_RANGE,
  BOT_REACTION_DELAY,
  MAX_SOLO_BOTS,
  SOLO_BOT_COUNT,
  SPAWN_FLIP_SUSTAIN_MS,
  advanceSpawnFlipHysteresis,
  assignBotWeapons,
  botAimJitter,
  botCanFireWhileProtected,
  botWeaponBurstSize,
  botWeaponFireInterval,
  chooseBotIntent,
  chooseTacticalWaypoint,
  createSpawnFlipHysteresis,
  operatorYawToward,
  respawnBotState,
  scoreBotSpawn,
  selectFarthestSpawnCandidate,
  shouldFlipSpawnSide,
  shouldBotThrowGrenade,
  soloBotTargetForDeaths,
  type BotSense,
} from './bot-ai';

const base: BotSense = {
  alive: true,
  distanceToPlayer: 18,
  hasLineOfSight: true,
  health: 100,
  now: 2_000,
  lastShotAt: 0,
  waypointReached: false,
  random: 0.4,
};

describe('chooseBotIntent', () => {
  it('assigns a seeded random mixed weapon cycle with no avoidable duplicates', () => {
    const samples = [0.1, 0.8, 0.35, 0.65, 0.2, 0.9, 0.45, 0.75];
    const run = () => {
      let index = 0;
      return assignBotWeapons(6, () => samples[index++ % samples.length]);
    };
    const first = run();
    expect(first).toEqual(run());
    expect(new Set(first.slice(0, 4)).size).toBe(4);
    expect(first.every((weapon, index) => index === 0 || weapon !== first[index - 1])).toBe(true);
    expect(first).toEqual(expect.arrayContaining(['carbine', 'smg', 'scattergun', 'sniper']));
  });

  it('uses weapon-specific burst and fire cadence', () => {
    expect(botWeaponBurstSize('scattergun', 0)).toBe(1);
    expect(botWeaponBurstSize('sniper', 1)).toBe(1);
    expect(botWeaponBurstSize('smg', 1)).toBe(5);
    expect(botWeaponFireInterval('smg', true)).toBeLessThan(botWeaponFireInterval('carbine', true));
    expect(botWeaponFireInterval('sniper', false)).toBeGreaterThan(botWeaponFireInterval('scattergun', false));
  });

  it('admits only one reacted in-range bot grenade and enforces its cooldown', () => {
    const ready = {
      alive: true,
      hasLineOfSight: true,
      reacted: true,
      distanceToPlayer: 12,
      now: 20_000,
      nextGrenadeAt: 10_000,
      botGrenadeActive: false,
      activeBotGrenades: 0,
      random: 0.1,
    };
    expect(shouldBotThrowGrenade(ready)).toBe(true);
    expect(shouldBotThrowGrenade({ ...ready, botGrenadeActive: true })).toBe(false);
    expect(shouldBotThrowGrenade({ ...ready, activeBotGrenades: 1 })).toBe(false);
    expect(shouldBotThrowGrenade({ ...ready, nextGrenadeAt: ready.now + BOT_GRENADE_COOLDOWN_MS })).toBe(false);
    expect(shouldBotThrowGrenade({ ...ready, distanceToPlayer: BOT_GRENADE_MIN_RANGE - 0.01 })).toBe(false);
    expect(shouldBotThrowGrenade({ ...ready, distanceToPlayer: BOT_GRENADE_MAX_RANGE + 0.01 })).toBe(false);
    expect(shouldBotThrowGrenade({ ...ready, random: 0.9 })).toBe(false);
  });

  it('fires only with line of sight, range and cadence', () => {
    expect(chooseBotIntent(base).fire).toBe(true);
    expect(chooseBotIntent({ ...base, hasLineOfSight: false }).fire).toBe(false);
    expect(chooseBotIntent({ ...base, distanceToPlayer: BOT_FIRE_RANGE + 0.01 }).fire).toBe(false);
    expect(chooseBotIntent({ ...base, lastShotAt: 1_800 }).fire).toBe(false);
  });

  it('uses two deliberately low-damage close-to-medium-range solo opponents', () => {
    expect(SOLO_BOT_COUNT).toBe(2);
    expect(BOT_FIRE_RANGE).toBe(22);
    expect(BOT_REACTION_DELAY).toBeGreaterThanOrEqual(600);
    expect(botAimJitter(8)).toBeLessThan(botAimJitter(16));
    expect(botAimJitter(16)).toBeLessThan(botAimJitter(BOT_FIRE_RANGE));
    expect(botAimJitter(BOT_FIRE_RANGE)).toBe(0.1);
  });

  it('adds fifth-death reinforcements but caps an uncapped match at six rivals', () => {
    expect(BOT_DEATHS_PER_REINFORCEMENT).toBe(5);
    expect(soloBotTargetForDeaths(0)).toBe(2);
    expect(soloBotTargetForDeaths(4)).toBe(2);
    expect(soloBotTargetForDeaths(5)).toBe(3);
    expect(soloBotTargetForDeaths(9)).toBe(3);
    expect(soloBotTargetForDeaths(10)).toBe(4);
    expect(soloBotTargetForDeaths(20)).toBe(6);
    expect(MAX_SOLO_BOTS).toBe(6);
    expect(soloBotTargetForDeaths(100)).toBe(6);
    expect(soloBotTargetForDeaths(Number.NaN)).toBe(2);
  });

  it('honours reaction delay and accelerates follow-up shots inside a burst', () => {
    const reacting = { ...base, lineOfSightSince: 1_900, reactionDelay: 260, lastShotAt: 0 };
    expect(chooseBotIntent(reacting).fire).toBe(false);
    expect(chooseBotIntent({ ...reacting, now: 2_300 }).fire).toBe(true);
    expect(chooseBotIntent({ ...reacting, now: 2_100, lineOfSightSince: 1_000, lastShotAt: 1_940, burstShotsRemaining: 2 }).fire).toBe(true);
  });

  it('advances at long range, strafes in combat and retreats when crowded', () => {
    expect(chooseBotIntent({ ...base, distanceToPlayer: 40 }).movement).toBe('advance');
    expect(chooseBotIntent({ ...base, distanceToPlayer: 22 }).movement).toBe('advance');
    expect(chooseBotIntent(base).movement).toBe('strafe-right');
    expect(chooseBotIntent({ ...base, random: 0.8 }).movement).toBe('strafe-left');
    expect(chooseBotIntent({ ...base, distanceToPlayer: 3 }).movement).toBe('retreat');
    expect(chooseBotIntent({ ...base, health: 25, distanceToPlayer: 14 }).movement).toBe('retreat');
  });

  it('keeps dead bots inert', () => {
    expect(chooseBotIntent({ ...base, alive: false })).toEqual({ movement: 'idle', fire: false, changeWaypoint: false });
  });
});

describe('tactical bot scoring', () => {
  it('flips spawn sides only when the authored opposite side is materially safer', () => {
    expect(shouldFlipSpawnSide(
      { minimumVisibleThreats: 2, safestNearestThreatDistanceSq: 64 },
      { minimumVisibleThreats: 0, safestNearestThreatDistanceSq: 625 },
    )).toBe(true);
    expect(shouldFlipSpawnSide(
      { minimumVisibleThreats: 0, safestNearestThreatDistanceSq: 900 },
      { minimumVisibleThreats: 0, safestNearestThreatDistanceSq: 1_600 },
    )).toBe(false);
  });

  it('requires sustained pressure and resets hysteresis when pressure clears', () => {
    const started = advanceSpawnFlipHysteresis(createSpawnFlipHysteresis(), true, 1_000);
    expect(started.flip).toBe(false);
    const early = advanceSpawnFlipHysteresis(started.state, true, 1_000 + SPAWN_FLIP_SUSTAIN_MS - 1);
    expect(early.flip).toBe(false);
    expect(advanceSpawnFlipHysteresis(early.state, true, 1_000 + SPAWN_FLIP_SUSTAIN_MS).flip).toBe(true);
    expect(advanceSpawnFlipHysteresis(early.state, false, 3_000).state.pressuredSince).toBeNull();
  });

  it('orients the operator negative-Z forward axis toward movement and fire targets', () => {
    expect(operatorYawToward({ x: 0, z: 0 }, { x: 0, z: -5 })).toBeCloseTo(0);
    expect(operatorYawToward({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(operatorYawToward({ x: 0, z: 0 }, { x: 0, z: 5 }))).toBeCloseTo(Math.PI);
  });

  it('chooses only from the least-exposed farthest pool and avoids the last spawn', () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      index,
      nearestPlayerDistanceSq: index * 100,
      visibleThreats: index % 2,
    }));
    expect(selectFarthestSpawnCandidate(candidates, 0)).toBe(10);
    expect(selectFarthestSpawnCandidate(candidates, 0.5)).toBe(8);
    expect(selectFarthestSpawnCandidate(candidates, 0.999999)).toBe(6);
    expect(selectFarthestSpawnCandidate(candidates, 0, 3, 10)).toBe(8);
    expect(selectFarthestSpawnCandidate([], 0.5)).toBe(-1);
  });

  it('rejects a much farther exposed spawn when covered choices exist', () => {
    const candidates = [
      { index: 0, nearestPlayerDistanceSq: 400, visibleThreats: 0 },
      { index: 1, nearestPlayerDistanceSq: 999_999, visibleThreats: 1 },
      { index: 2, nearestPlayerDistanceSq: 225, visibleThreats: 0 },
    ];
    expect(selectFarthestSpawnCandidate(candidates, 0)).toBe(0);
    expect(selectFarthestSpawnCandidate(candidates, 0.999999)).toBe(2);
  });

  it('keeps full authored variety before any opponent contests the arena', () => {
    const uncontested = Array.from({ length: 10 }, (_, index) => ({
      index,
      nearestPlayerDistanceSq: Number.POSITIVE_INFINITY,
      visibleThreats: 0,
    }));
    expect(selectFarthestSpawnCandidate(uncontested, 0)).toBe(0);
    expect(selectFarthestSpawnCandidate(uncontested, 0.999999)).toBe(9);
  });

  it('prefers distance and cover while strongly rejecting occupied spawns', () => {
    const safe = scoreBotSpawn({ nearestThreatDistanceSq: 500, visibleThreats: 0, occupied: false, preferred: false });
    const exposed = scoreBotSpawn({ nearestThreatDistanceSq: 600, visibleThreats: 1, occupied: false, preferred: true });
    const occupied = scoreBotSpawn({ nearestThreatDistanceSq: 2_000, visibleThreats: 0, occupied: true, preferred: true });
    expect(safe).toBeGreaterThan(exposed);
    expect(safe).toBeGreaterThan(occupied);
    const extremelyFarExposed = scoreBotSpawn({ nearestThreatDistanceSq: 999_999_999, visibleThreats: 1, occupied: false, preferred: true });
    expect(safe).toBeGreaterThan(extremelyFarExposed);
  });

  it('chooses a nearby reacquisition point in the intended engagement band', () => {
    const choice = chooseTacticalWaypoint([
      { index: 0, distanceFromBot: 2, distanceFromPlayer: 31, seesPlayer: false },
      { index: 1, distanceFromBot: 7, distanceFromPlayer: 14, seesPlayer: true },
      { index: 2, distanceFromBot: 19, distanceFromPlayer: 13, seesPlayer: true },
    ], 0, 3);
    expect(choice).toBe(1);
    expect(chooseTacticalWaypoint([], 4, 0)).toBe(4);
  });
});

describe('respawnBotState', () => {
  it('resets combat values and grants bounded protection', () => {
    expect(respawnBotState(5_000)).toEqual({ health: 100, alive: true, invulnerableUntil: 6_000, lastShotAt: 0 });
  });

  it('prevents a respawned bot from firing while its protection is active', () => {
    expect(botCanFireWhileProtected(true, 5_999, 6_000)).toBe(false);
    expect(botCanFireWhileProtected(true, 6_000, 6_000)).toBe(true);
    expect(botCanFireWhileProtected(false, 7_000, 6_000)).toBe(false);
  });
});
