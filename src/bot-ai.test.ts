import { describe, expect, it } from 'vitest';
import { chooseBotIntent, respawnBotState, type BotSense } from './bot-ai';

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
    expect(chooseBotIntent({ ...base, distanceToPlayer: 80 }).fire).toBe(false);
    expect(chooseBotIntent({ ...base, lastShotAt: 1_800 }).fire).toBe(false);
  });

  it('advances at long range, strafes in combat and retreats when crowded', () => {
    expect(chooseBotIntent({ ...base, distanceToPlayer: 40 }).movement).toBe('advance');
    expect(chooseBotIntent(base).movement).toBe('strafe-right');
    expect(chooseBotIntent({ ...base, random: 0.8 }).movement).toBe('strafe-left');
    expect(chooseBotIntent({ ...base, distanceToPlayer: 3 }).movement).toBe('retreat');
  });

  it('keeps dead bots inert', () => {
    expect(chooseBotIntent({ ...base, alive: false })).toEqual({ movement: 'idle', fire: false, changeWaypoint: false });
  });
});

describe('respawnBotState', () => {
  it('resets combat values and grants bounded protection', () => {
    expect(respawnBotState(5_000)).toEqual({ health: 100, alive: true, invulnerableUntil: 6_000, lastShotAt: 0 });
  });
});
