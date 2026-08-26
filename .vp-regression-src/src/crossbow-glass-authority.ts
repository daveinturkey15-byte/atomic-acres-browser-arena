import type { WeaponFireKind } from './combat/weapon-schema';
import { EXPLOSIVE_BOLT_MAX_LIFE_MS } from './combat/ordnance';
import type { WeaponId } from './protocol';

export type CrossbowGlassPhase = 'impact' | 'explosion';

export type CrossbowGlassMutationAdmission = Readonly<{
  accepted: boolean;
  reason: 'authoritative-simulation' | 'presentation-only-prediction';
}>;

const AUTHORITATIVE_SIMULATION = Object.freeze({
  accepted: true,
  reason: 'authoritative-simulation',
} as const);

const PRESENTATION_ONLY_PREDICTION = Object.freeze({
  accepted: false,
  reason: 'presentation-only-prediction',
} as const);

/** Predicted guest bolts never own durable pane or collider mutation. */
export function admitCrossbowGlassMutation(authority: boolean): CrossbowGlassMutationAdmission {
  return authority ? AUTHORITATIVE_SIMULATION : PRESENTATION_ONLY_PREDICTION;
}

export type RetainableCrossbowGlassAction = Readonly<{
  message: Readonly<{ weapon: WeaponId }>;
  receivedAt: number;
  matchEpoch: number;
}>;

/** Retain only a still-live authoritative crossbow projectile after disconnect. */
export function retainInFlightCrossbowGlassActions<T extends RetainableCrossbowGlassAction>(
  actions: Map<number, T> | undefined,
  expectedMatchEpoch: number,
  nowMs: number,
): number {
  if (!actions || !Number.isFinite(nowMs)) return 0;
  for (const [nonce, action] of actions) {
    const ageMs = nowMs - action.receivedAt;
    if (action.message.weapon !== 'explosive-crossbow'
      || action.matchEpoch !== expectedMatchEpoch
      || !Number.isFinite(ageMs)
      || ageMs < 0
      || ageMs > EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000) actions.delete(nonce);
  }
  return actions.size;
}

export type CanonicalCrossbowGlassAdmissionReason =
  | 'accepted'
  | 'forged-authority'
  | 'forged-impact'
  | 'ineligible-weapon'
  | 'replay'
  | 'stale-action'
  | 'untrusted-guest-mutation'
  | 'wrong-action';

export type CanonicalCrossbowGlassAdmission = Readonly<{
  accepted: boolean;
  reason: CanonicalCrossbowGlassAdmissionReason;
}>;

/**
 * Admits a host-canonical crossbow pane mutation on a guest. Immediate bolt
 * impacts and later blast events are both bound to the exact live shot nonce.
 */
export function admitCanonicalCrossbowGlassBreak(request: Readonly<{
  receiverRole: 'host' | 'client';
  hostAuthorityValid: boolean;
  weapon: WeaponId;
  fireKind: WeaponFireKind;
  phase: CrossbowGlassPhase;
  actionNonce: number;
  actionCurrent: boolean;
  actionWeapon: WeaponId | null;
  actionNonceObserved: number | null;
  eventReplay: boolean;
  panePhaseAlreadyAdmitted: boolean;
  originInsideArena: boolean;
  paneDistanceM: number;
  blastRadiusM: number;
}>): CanonicalCrossbowGlassAdmission {
  const reject = (reason: Exclude<CanonicalCrossbowGlassAdmissionReason, 'accepted'>) => (
    Object.freeze({ accepted: false, reason })
  );
  if (request.receiverRole === 'host') return reject('untrusted-guest-mutation');
  if (!request.hostAuthorityValid) return reject('forged-authority');
  if (request.weapon !== 'explosive-crossbow' || request.fireKind !== 'projectile') {
    return reject('ineligible-weapon');
  }
  if (request.eventReplay || request.panePhaseAlreadyAdmitted) return reject('replay');
  if (!request.actionCurrent) return reject('stale-action');
  if (!Number.isFinite(request.actionNonce)
    || request.actionWeapon !== request.weapon
    || request.actionNonceObserved !== request.actionNonce) return reject('wrong-action');
  const maximumPaneDistanceM = request.phase === 'impact' ? 0.5 : request.blastRadiusM + 0.5;
  if (!request.originInsideArena
    || !Number.isFinite(request.paneDistanceM)
    || request.paneDistanceM < 0
    || !Number.isFinite(request.blastRadiusM)
    || request.blastRadiusM <= 0
    || request.paneDistanceM > maximumPaneDistanceM) return reject('forged-impact');
  return Object.freeze({ accepted: true, reason: 'accepted' });
}
