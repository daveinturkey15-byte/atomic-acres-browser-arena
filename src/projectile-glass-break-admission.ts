import type { WeaponFireKind } from './combat/weapon-schema';
import type { WeaponId } from './protocol';

export type ProjectileGlassBreakAdmissionReason =
  | 'accepted'
  | 'forged-authority'
  | 'forged-impact'
  | 'ineligible-weapon'
  | 'replay'
  | 'stale-action'
  | 'untrusted-guest-mutation'
  | 'wrong-action';

export type ProjectileGlassBreakAdmission = Readonly<{
  accepted: boolean;
  reason: ProjectileGlassBreakAdmissionReason;
}>;

export function admitProjectileGlassBreak(request: Readonly<{
  receiverRole: 'host' | 'client';
  hostAuthorityValid: boolean;
  weapon: WeaponId;
  fireKind: WeaponFireKind;
  actionNonce: number;
  actionCurrent: boolean;
  actionWeapon: WeaponId | null;
  actionNonceObserved: number | null;
  eventReplay: boolean;
  paneAlreadyAdmittedForAction: boolean;
  originInsideArena: boolean;
  paneDistanceM: number;
  maximumPaneDistanceM: number;
}>): ProjectileGlassBreakAdmission {
  const reject = (reason: Exclude<ProjectileGlassBreakAdmissionReason, 'accepted'>) => (
    Object.freeze({ accepted: false, reason })
  );
  if (request.receiverRole === 'host') return reject('untrusted-guest-mutation');
  if (!request.hostAuthorityValid) return reject('forged-authority');
  if (request.fireKind !== 'projectile') return reject('ineligible-weapon');
  if (request.eventReplay || request.paneAlreadyAdmittedForAction) return reject('replay');
  if (!request.actionCurrent) return reject('stale-action');
  if (!Number.isFinite(request.actionNonce)
    || request.actionWeapon !== request.weapon
    || request.actionNonceObserved !== request.actionNonce) return reject('wrong-action');
  if (!request.originInsideArena
    || !Number.isFinite(request.paneDistanceM)
    || !Number.isFinite(request.maximumPaneDistanceM)
    || request.maximumPaneDistanceM < 0
    || request.paneDistanceM < 0
    || request.paneDistanceM > request.maximumPaneDistanceM) return reject('forged-impact');
  return Object.freeze({ accepted: true, reason: 'accepted' });
}
