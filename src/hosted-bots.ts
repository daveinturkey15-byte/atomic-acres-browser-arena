import type { PrimaryWeaponId, Team } from './protocol';

export const HOSTED_BOT_COUNTS = [0, 2, 4] as const;
export type HostedBotCount = typeof HOSTED_BOT_COUNTS[number];

export type HostedBotSnapshot = Readonly<{
  id: string;
  name: string;
  team: Team;
  weapon: PrimaryWeaponId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  kills: number;
  deaths: number;
  alive: boolean;
  seq: number;
}>;

export function isHostedBotCount(value: unknown): value is HostedBotCount {
  return value === 0 || value === 2 || value === 4;
}

export function hostedBotIds(count: HostedBotCount): string[] {
  return Array.from({ length: count }, (_, index) => `host-bot-${index}`);
}

export function isHostedBotSnapshot(value: unknown): value is HostedBotSnapshot {
  if (!value || typeof value !== 'object') return false;
  const bot = value as Record<string, unknown>;
  return typeof bot.id === 'string' && /^host-bot-[0-3]$/.test(bot.id)
    && typeof bot.name === 'string' && bot.name.length >= 1 && bot.name.length <= 20
    && (bot.team === 0 || bot.team === 1)
    && (bot.weapon === 'carbine' || bot.weapon === 'smg' || bot.weapon === 'lmg'
      || bot.weapon === 'scattergun' || bot.weapon === 'sniper')
    && ['x', 'y', 'z', 'yaw', 'hp'].every((key) => Number.isFinite(bot[key]))
    && Number(bot.hp) >= 0 && Number(bot.hp) <= 100
    && ['kills', 'deaths', 'seq'].every((key) => Number.isSafeInteger(bot[key]) && Number(bot[key]) >= 0)
    && typeof bot.alive === 'boolean'
    && bot.alive === (Number(bot.hp) > 0);
}
