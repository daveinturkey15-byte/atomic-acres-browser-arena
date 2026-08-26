import type { WeaponId } from './protocol';

export type FlamethrowerResidualAction = Readonly<{
  ownerId: string;
  actionNonce: number;
  weapon: WeaponId;
  matchEpoch: number;
  receivedAtMs: number;
}>;

export type FlamethrowerResidualRemoteAuthority = Readonly<{
  accepted: boolean;
  route: 'hosted-bot-result' | 'human-canonical-hit' | null;
  weapon: 'flamethrower' | null;
  reason:
    | 'accepted-hosted-bot'
    | 'accepted-human-action'
    | 'invalid-owner'
    | 'missing-action'
    | 'owner-mismatch'
    | 'action-mismatch'
    | 'weapon-mismatch'
    | 'epoch-mismatch'
    | 'action-not-current';
}>;

/**
 * Selects the sole host-authored result lane for a Flamethrower ground-fire
 * pulse. Hosted bots reconcile through BotDamage; human fire must retain the
 * exact Flamethrower action in the current match epoch for the whole residual
 * lifetime. No current-weapon fallback is admitted.
 */
export function resolveFlamethrowerResidualRemoteAuthority(input: Readonly<{
  ownerId: string;
  actionNonce: number;
  ownerKind: 'hosted-bot' | 'human';
  currentMatchEpoch: number;
  nowMs: number;
  actionLifetimeMs: number;
  retainedAction: FlamethrowerResidualAction | null;
}>): FlamethrowerResidualRemoteAuthority {
  if (!input.ownerId || !Number.isSafeInteger(input.actionNonce)) return rejected('invalid-owner');
  if (input.ownerKind === 'hosted-bot') {
    return Object.freeze({
      accepted: true,
      route: 'hosted-bot-result',
      weapon: 'flamethrower',
      reason: 'accepted-hosted-bot',
    });
  }
  const action = input.retainedAction;
  if (!action) return rejected('missing-action');
  if (action.ownerId !== input.ownerId) return rejected('owner-mismatch');
  if (action.actionNonce !== input.actionNonce) return rejected('action-mismatch');
  if (action.weapon !== 'flamethrower') return rejected('weapon-mismatch');
  if (action.matchEpoch !== input.currentMatchEpoch) return rejected('epoch-mismatch');
  const ageMs = input.nowMs - action.receivedAtMs;
  if (!Number.isFinite(ageMs) || !Number.isFinite(input.actionLifetimeMs)
    || input.actionLifetimeMs <= 0 || ageMs < 0 || ageMs > input.actionLifetimeMs) {
    return rejected('action-not-current');
  }
  return Object.freeze({
    accepted: true,
    route: 'human-canonical-hit',
    weapon: 'flamethrower',
    reason: 'accepted-human-action',
  });
}

function rejected(reason: Exclude<FlamethrowerResidualRemoteAuthority['reason'],
  'accepted-hosted-bot' | 'accepted-human-action'>): FlamethrowerResidualRemoteAuthority {
  return Object.freeze({ accepted: false, route: null, weapon: null, reason });
}
