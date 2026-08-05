import type { HitZone } from './gameplay';
import type { WeaponId } from './protocol';

export const THIRD_PERSON_WEAPON_SCALE: Readonly<Record<WeaponId, number>> = Object.freeze({
  carbine: 0.47,
  lmg: 0.41,
  sniper: 0.45,
  railgun: 0.43,
  smg: 0.51,
  scattergun: 0.46,
  pistol: 0.54,
  magnum: 0.54,
  'machine-pistol': 0.54,
  'mini-uzi': 0.52,
  mp5: 0.51,
  m4a1: 0.47,
  'ak-47': 0.46,
  minigun: 0.4,
  'm14-ebr': 0.45,
  'slug-shotgun': 0.46,
  'flashlight-pistol': 0.54,
  'explosive-crossbow': 0.5,
  flamethrower: 0.42,
  'flare-gun': 0.54,
});

export type DamageNumberPresentation = Readonly<{
  amount: number;
  overkill: number;
  critical: boolean;
  label: string;
  durationMs: number;
}>;

export function damageNumberPresentation(
  damage: number,
  zone: HitZone,
  healthBefore?: number,
): DamageNumberPresentation | null {
  if (!Number.isFinite(damage) || damage <= 0) return null;
  const amount = Math.max(1, Math.min(9_999, Math.round(damage)));
  const boundedHealth = Number.isFinite(healthBefore)
    ? Math.max(0, Math.min(9_999, Math.round(healthBefore!)))
    : amount;
  const overkill = Math.max(0, amount - boundedHealth);
  const critical = zone === 'head';
  return {
    amount,
    overkill,
    critical,
    label: `${critical ? 'CRIT ' : ''}${amount}${overkill > 0 ? ` · +${overkill} OVERKILL` : ''}`,
    durationMs: critical ? 1_250 : 1_100,
  };
}

export type RoundStatInput = Readonly<{
  kills: number;
  deaths: number;
  shotsFired: number;
  hitShots: number;
  damageDealt: number;
  headshots: number;
}>;

export type RoundStatSummary = Readonly<{
  kills: number;
  deaths: number;
  kd: string;
  accuracy: string;
  damageDealt: number;
  headshots: number;
}>;

function boundedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function roundStatSummary(input: RoundStatInput): RoundStatSummary {
  const kills = boundedCount(input.kills);
  const deaths = boundedCount(input.deaths);
  const shotsFired = boundedCount(input.shotsFired);
  const hitShots = Math.min(shotsFired, boundedCount(input.hitShots));
  return {
    kills,
    deaths,
    kd: (kills / Math.max(1, deaths)).toFixed(2),
    accuracy: `${shotsFired === 0 ? 0 : Math.round((hitShots / shotsFired) * 1_000) / 10}%`,
    damageDealt: boundedCount(input.damageDealt),
    headshots: boundedCount(input.headshots),
  };
}
