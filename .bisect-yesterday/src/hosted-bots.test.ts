import { describe, expect, it } from 'vitest';
import {
  hostedBotIds,
  hostedBotReplicationActive,
  hostedBotSnapshotContinuity,
  interpolateHostedBotSnapshot,
  isHostedBotCount,
  isHostedBotSnapshot,
} from './hosted-bots';

describe('hosted lobby bots', () => {
  it('admits only disabled, two, or four host-owned bots', () => {
    expect([0, 2, 4].every(isHostedBotCount)).toBe(true);
    expect([-1, 1, 3, 5, 6, '2'].some(isHostedBotCount)).toBe(false);
    expect(hostedBotIds(0)).toEqual([]);
    expect(hostedBotIds(2)).toEqual(['host-bot-0', 'host-bot-1']);
    expect(hostedBotIds(4)).toEqual(['host-bot-0', 'host-bot-1', 'host-bot-2', 'host-bot-3']);
  });

  it('keeps host-authoritative bot replication active independently of host life', () => {
    expect(hostedBotReplicationActive('host', true, 'active', 2)).toBe(true);
    expect(hostedBotReplicationActive('host', true, 'active', 4)).toBe(true);
    expect(hostedBotReplicationActive('host', true, 'active', 0)).toBe(false);
    expect(hostedBotReplicationActive('client', true, 'active', 2)).toBe(false);
    expect(hostedBotReplicationActive('host', true, 'warmup', 2)).toBe(false);
    expect(hostedBotReplicationActive('host', false, 'active', 2)).toBe(false);
  });

  it('validates bounded authoritative replicated state', () => {
    const bot = {
      id: 'host-bot-0', name: 'RIVET', team: 1, weapon: 'lmg', x: 1, y: 0, z: 2,
      yaw: 0.4, hp: 70, kills: 2, deaths: 1, alive: true, seq: 9,
    } as const;
    expect(isHostedBotSnapshot(bot)).toBe(true);
    expect(isHostedBotSnapshot({ ...bot, weapon: 'mp5' })).toBe(true);
    expect(isHostedBotSnapshot({ ...bot, weapon: 'pistol' })).toBe(true);
    expect(isHostedBotSnapshot({ ...bot, weapon: 'flare-gun' })).toBe(true);
    expect(isHostedBotSnapshot({ ...bot, weapon: 'minigun' })).toBe(false);
    expect(isHostedBotSnapshot({ ...bot, weapon: 'explosive-crossbow' })).toBe(false);
    expect(isHostedBotSnapshot({ ...bot, id: 'bot-owned-by-guest' })).toBe(false);
    expect(isHostedBotSnapshot({ ...bot, hp: 0, alive: true })).toBe(false);
  });

  it('interpolates only presentation pose and treats death/respawn as discontinuities', () => {
    const before = {
      id: 'host-bot-0', name: 'RIVET', team: 1, weapon: 'lmg', x: 0, y: 0, z: 0,
      yaw: Math.PI - 0.1, hp: 100, kills: 1, deaths: 0, alive: true, seq: 10,
    } as const;
    const after = {
      ...before,
      weapon: 'mp5' as const,
      x: 4,
      y: 2,
      z: -2,
      yaw: -Math.PI + 0.1,
      hp: 75,
      kills: 2,
      seq: 11,
    };
    const rendered = interpolateHostedBotSnapshot(before, after, 0.5);
    expect(rendered).toMatchObject({ x: 2, y: 1, z: -1, hp: 75, kills: 2, weapon: 'mp5', seq: 11 });
    expect(Math.abs(Math.abs(rendered.yaw) - Math.PI)).toBeLessThan(1e-9);
    expect(hostedBotSnapshotContinuity(before)).toBe(2);
    expect(hostedBotSnapshotContinuity({ ...after, hp: 0, alive: false, deaths: 1 })).toBe(3);
    expect(hostedBotSnapshotContinuity({ ...after, deaths: 1 })).toBe(4);
  });
});
