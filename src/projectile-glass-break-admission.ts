import type { WeaponFireKind } from './combat/weapon-schema';
import { EXPLOSIVE_BOLT_MAX_LIFE_MS } from './combat/ordnance';
import {
  isBotWeaponPresentationMessage,
  type BotFlareLaunchPresentationMessage,
} from './bot-weapon-presentation';
import type { WeaponId } from './protocol';
import { FLARE_PROJECTILE_EFFECT } from './special-weapon-effects';

export const HOSTED_BOT_PROJECTILE_GLASS_ACTION_CAPACITY = 128;
export const HOSTED_BOT_PROJECTILE_GLASS_ACTION_LIFETIME_MS = FLARE_PROJECTILE_EFFECT.maximumFlightMs + 1_000;

export type HostedBotProjectileGlassLaunchReason =
  | 'accepted'
  | 'malformed'
  | 'wrong-host'
  | 'wrong-match-epoch'
  | 'replay';

export type HostedBotProjectileGlassLaunchAdmission = Readonly<{
  accepted: boolean;
  reason: HostedBotProjectileGlassLaunchReason;
}>;

export type HostedBotProjectileGlassAction = Readonly<{
  botId: string;
  matchEpoch: number;
  weapon: 'flare-gun';
  actionNonce: number;
  receivedAtMs: number;
  paneIds: Set<string>;
}>;

function hostedBotProjectileGlassActionKey(matchEpoch: number, botId: string, actionNonce: number): string {
  return `${matchEpoch}:${botId}:${actionNonce}`;
}

/**
 * Retains only host-authenticated bot flare launches long enough for their
 * later canonical pane impact. Bot pose/state may arrive on a separate lane,
 * so action identity cannot depend on a human RemotePlayer entry.
 */
export class HostedBotProjectileGlassActionLedger {
  private readonly actions = new Map<string, HostedBotProjectileGlassAction>();
  private readonly order: string[] = [];

  constructor(
    private readonly capacity = HOSTED_BOT_PROJECTILE_GLASS_ACTION_CAPACITY,
    private readonly lifetimeMs = HOSTED_BOT_PROJECTILE_GLASS_ACTION_LIFETIME_MS,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Hosted bot projectile glass capacity must be positive');
    if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) throw new Error('Hosted bot projectile glass lifetime must be positive');
  }

  recordHostLaunch(
    value: unknown,
    expected: Readonly<{ hostId: string | null; matchEpoch: number }>,
    nowMs: number,
  ): HostedBotProjectileGlassLaunchAdmission {
    const reject = (reason: Exclude<HostedBotProjectileGlassLaunchReason, 'accepted'>) => (
      Object.freeze({ accepted: false, reason })
    );
    if (!Number.isFinite(nowMs) || !isBotWeaponPresentationMessage(value)
      || value.presentation !== 'signal-flare-launch') return reject('malformed');
    const message: BotFlareLaunchPresentationMessage = value;
    if (!expected.hostId || message.by !== expected.hostId) return reject('wrong-host');
    if (message.matchEpoch !== expected.matchEpoch) return reject('wrong-match-epoch');
    this.prune(expected.matchEpoch, nowMs);
    const key = hostedBotProjectileGlassActionKey(message.matchEpoch, message.botId, message.actionNonce);
    if (this.actions.has(key)) return reject('replay');
    this.actions.set(key, {
      botId: message.botId,
      matchEpoch: message.matchEpoch,
      weapon: message.weapon,
      actionNonce: message.actionNonce,
      receivedAtMs: nowMs,
      paneIds: new Set(),
    });
    this.order.push(key);
    while (this.actions.size > this.capacity) this.deleteOldest();
    return Object.freeze({ accepted: true, reason: 'accepted' });
  }

  current(
    botId: string,
    actionNonce: number,
    matchEpoch: number,
    nowMs: number,
  ): HostedBotProjectileGlassAction | undefined {
    this.prune(matchEpoch, nowMs);
    return this.actions.get(hostedBotProjectileGlassActionKey(matchEpoch, botId, actionNonce));
  }

  clear(): void {
    this.actions.clear();
    this.order.length = 0;
  }

  size(): number {
    return this.actions.size;
  }

  private prune(matchEpoch: number, nowMs: number): void {
    for (const [key, action] of this.actions) {
      const ageMs = nowMs - action.receivedAtMs;
      if (action.matchEpoch !== matchEpoch || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > this.lifetimeMs) {
        this.actions.delete(key);
      }
    }
    while (this.order.length > 0 && !this.actions.has(this.order[0])) this.order.shift();
  }

  private deleteOldest(): void {
    while (this.order.length > 0) {
      const key = this.order.shift()!;
      if (this.actions.delete(key)) return;
    }
  }
}

export type ProjectileGlassWeaponId = 'explosive-crossbow' | 'flare-gun';

export function projectileGlassActionLifetimeMs(weapon: WeaponId): number | null {
  if (weapon === 'explosive-crossbow') return EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000;
  if (weapon === 'flare-gun') {
    return FLARE_PROJECTILE_EFFECT.maximumFlightMs + FLARE_PROJECTILE_EFFECT.burnDurationMs + 1_000;
  }
  return null;
}

export function isProjectileGlassWeapon(weapon: WeaponId): weapon is ProjectileGlassWeaponId {
  return projectileGlassActionLifetimeMs(weapon) !== null;
}

export type RetainableProjectileGlassAction = Readonly<{
  message: Readonly<{ weapon: WeaponId }>;
  receivedAt: number;
  matchEpoch: number;
}>;

/**
 * A host-authoritative projectile can outlive its shooter's transport. Retain
 * only the exact projectile identities that can still reach glass; ordinary
 * shots and stale/cross-epoch identities are discarded immediately.
 */
export function retainInFlightProjectileGlassActions<T extends RetainableProjectileGlassAction>(
  actions: Map<number, T> | undefined,
  expectedMatchEpoch: number,
  nowMs: number,
): number {
  if (!actions || !Number.isFinite(nowMs)) return 0;
  for (const [actionNonce, action] of actions) {
    const lifetimeMs = projectileGlassActionLifetimeMs(action.message.weapon);
    const ageMs = nowMs - action.receivedAt;
    if (lifetimeMs === null
      || action.matchEpoch !== expectedMatchEpoch
      || !Number.isFinite(ageMs)
      || ageMs < 0
      || ageMs > lifetimeMs) actions.delete(actionNonce);
  }
  return actions.size;
}

export type ProjectileSimulationGlassMutationAdmission = Readonly<{
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

/**
 * Projectile replicas may predict flight, impact presentation and audio, but
 * only the authoritative simulation owns durable pane/collider mutation. A
 * guest receives that mutation later through admitProjectileGlassBreak.
 */
export function admitProjectileSimulationGlassMutation(
  projectileAuthority: boolean,
): ProjectileSimulationGlassMutationAdmission {
  return projectileAuthority ? AUTHORITATIVE_SIMULATION : PRESENTATION_ONLY_PREDICTION;
}

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
