import { describe, expect, it } from 'vitest';
import {
  BOT_FIRE_RANGE,
  BOT_REACTION_DELAY,
  SOLO_BOT_COUNT,
  botAimJitter,
  botCanFireWhileProtected,
  chooseBotIntent,
  chooseTacticalWaypoint,
  respawnBotState,
  scoreBotSpawn,
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
  it('fires only with line of sight, range and cadence', () => {
    expect(chooseBotIntent(base).fire).toBe(true);
    expect(chooseBotIntent({ ...base, hasLineOfSight: false }).fire).toBe(false);
    expect(chooseBotIntent({ ...base, distanceToPlayer: BOT_FIRE_RANGE + 0.01 }).fire).toBe(false);
    expect(chooseBotIntent({ ...base, lastShotAt: 1_800 }).fire).toBe(false);
  });

  it('uses one deliberately close-to-medium-range solo opponent', () => {
    expect(SOLO_BOT_COUNT).toBe(1);
    expect(BOT_FIRE_RANGE).toBe(22);
    expect(BOT_REACTION_DELAY).toBeGreaterThanOrEqual(600);
    expect(botAimJitter(8)).toBeLessThan(botAimJitter(16));
    expect(botAimJitter(16)).toBeLessThan(botAimJitter(BOT_FIRE_RANGE));
    expect(botAimJitter(BOT_FIRE_RANGE)).toBe(0.1);
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
