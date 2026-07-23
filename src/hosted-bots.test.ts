import { describe, expect, it } from 'vitest';
import { hostedBotIds, isHostedBotCount, isHostedBotSnapshot } from './hosted-bots';

describe('hosted lobby bots', () => {
  it('admits only disabled, two, or four host-owned bots', () => {
    expect([0, 2, 4].every(isHostedBotCount)).toBe(true);
    expect([-1, 1, 3, 5, 6, '2'].some(isHostedBotCount)).toBe(false);
    expect(hostedBotIds(0)).toEqual([]);
    expect(hostedBotIds(2)).toEqual(['host-bot-0', 'host-bot-1']);
    expect(hostedBotIds(4)).toEqual(['host-bot-0', 'host-bot-1', 'host-bot-2', 'host-bot-3']);
  });

  it('validates bounded authoritative replicated state', () => {
    const bot = {
      id: 'host-bot-0', name: 'RIVET', team: 1, weapon: 'lmg', x: 1, y: 0, z: 2,
      yaw: 0.4, hp: 70, kills: 2, deaths: 1, alive: true, seq: 9,
    } as const;
    expect(isHostedBotSnapshot(bot)).toBe(true);
    expect(isHostedBotSnapshot({ ...bot, id: 'bot-owned-by-guest' })).toBe(false);
    expect(isHostedBotSnapshot({ ...bot, hp: 0, alive: true })).toBe(false);
  });
});
