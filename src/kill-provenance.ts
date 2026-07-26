import type { HitMessage, WeaponId } from './protocol';
import type { Pass65KillstreakId } from './killstreak-catalog';

export type KillCause =
  | Readonly<{ kind: 'gun'; weapon: WeaponId }>
  | Readonly<{ kind: 'grenade' }>
  | Readonly<{ kind: 'melee' }>
  | Readonly<{ kind: 'environment' }>
  | Readonly<{ kind: 'killstreak'; effect: Pass65KillstreakId }>;

export function killCauseFromHit(message: Pick<HitMessage, 'kind' | 'explosiveSource'>, weapon: WeaponId): KillCause {
  if (message.kind === 'shot') return { kind: 'gun', weapon };
  if (message.kind === 'melee') return { kind: 'melee' };
  if (message.explosiveSource === 'grenade') return { kind: 'grenade' };
  if (message.explosiveSource === 'explosive-crossbow') return { kind: 'gun', weapon: 'explosive-crossbow' };
  if (message.explosiveSource) return { kind: 'killstreak', effect: message.explosiveSource };
  return { kind: 'environment' };
}

export function isKillstreakEligible(cause: KillCause): boolean {
  return cause.kind === 'gun';
}
