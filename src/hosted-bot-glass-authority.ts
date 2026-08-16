import { botWeaponFireAdapter } from './bot-arsenal';
import type { WeaponId } from './protocol';
import { weaponGlassBreakPolicy } from './weapon-glass-break-policy';

export const HOSTED_BOT_BALLISTIC_GLASS_ACTION_CAPACITY = 128;
export const HOSTED_BOT_BALLISTIC_GLASS_ACTION_LIFETIME_MS = 10_000;

export type HostedBotBallisticGlassAdmissionReason =
  | 'accepted'
  | 'forged-authority'
  | 'forged-impact'
  | 'ineligible-weapon'
  | 'malformed'
  | 'replay'
  | 'stale-bot'
  | 'untrusted-mutation'
  | 'wrong-action';

export type HostedBotBallisticGlassAdmission = Readonly<{
  accepted: boolean;
  reason: HostedBotBallisticGlassAdmissionReason;
}>;

type RetainedAction = {
  readonly matchEpoch: number;
  readonly botId: string;
  readonly weapon: WeaponId;
  readonly actionNonce: number;
  readonly receivedAtMs: number;
  readonly paneIds: Set<string>;
};

function actionKey(matchEpoch: number, botId: string, actionNonce: number): string {
  return `${matchEpoch}:${botId}:${actionNonce}`;
}

/**
 * Hosted-bot glass mutations arrive only as host-canonical window events.
 * This bounded receiver ledger admits one pane per exact ballistic action and
 * independently resolves both bot eligibility and the shared glass catalog.
 */
export class HostedBotBallisticGlassActionLedger {
  private readonly actions = new Map<string, RetainedAction>();
  private readonly order: string[] = [];

  constructor(
    private readonly capacity = HOSTED_BOT_BALLISTIC_GLASS_ACTION_CAPACITY,
    private readonly lifetimeMs = HOSTED_BOT_BALLISTIC_GLASS_ACTION_LIFETIME_MS,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new TypeError('Hosted-bot glass capacity must be positive');
    if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) throw new TypeError('Hosted-bot glass lifetime must be positive');
  }

  admit(request: Readonly<{
    receiverRole: 'offline' | 'host' | 'client';
    hostAuthorityValid: boolean;
    matchEpoch: number;
    botId: string;
    botAdmitted: boolean;
    weapon: WeaponId;
    actionNonce: number;
    eventReplay: boolean;
    paneId: string;
    originInsideArena: boolean;
    paneDistanceM: number;
    maximumPaneDistanceM: number;
    nowMs: number;
  }>): HostedBotBallisticGlassAdmission {
    const reject = (reason: Exclude<HostedBotBallisticGlassAdmissionReason, 'accepted'>) => (
      Object.freeze({ accepted: false, reason })
    );
    if (request.receiverRole !== 'client') return reject('untrusted-mutation');
    if (!request.hostAuthorityValid) return reject('forged-authority');
    if (!request.botAdmitted || !/^host-bot-[0-3]$/.test(request.botId)) return reject('stale-bot');
    if (!Number.isSafeInteger(request.matchEpoch) || request.matchEpoch < 1
      || !Number.isSafeInteger(request.actionNonce) || request.actionNonce < 0
      || request.paneId.length < 1 || request.paneId.length > 128
      || !Number.isFinite(request.nowMs)) return reject('malformed');
    try {
      if (botWeaponFireAdapter(request.weapon) !== 'ballistic-ray'
        || weaponGlassBreakPolicy(request.weapon).timing !== 'impact') return reject('ineligible-weapon');
    } catch {
      return reject('ineligible-weapon');
    }
    if (request.eventReplay) return reject('replay');
    if (!request.originInsideArena
      || !Number.isFinite(request.paneDistanceM) || request.paneDistanceM < 0
      || !Number.isFinite(request.maximumPaneDistanceM) || request.maximumPaneDistanceM < 0
      || request.paneDistanceM > request.maximumPaneDistanceM) return reject('forged-impact');

    this.prune(request.matchEpoch, request.nowMs);
    const key = actionKey(request.matchEpoch, request.botId, request.actionNonce);
    let action = this.actions.get(key);
    if (action && action.weapon !== request.weapon) return reject('wrong-action');
    if (action?.paneIds.has(request.paneId)) return reject('replay');
    if (!action) {
      action = {
        matchEpoch: request.matchEpoch,
        botId: request.botId,
        weapon: request.weapon,
        actionNonce: request.actionNonce,
        receivedAtMs: request.nowMs,
        paneIds: new Set(),
      };
      this.actions.set(key, action);
      this.order.push(key);
      while (this.actions.size > this.capacity) this.deleteOldest();
    }
    action.paneIds.add(request.paneId);
    return Object.freeze({ accepted: true, reason: 'accepted' });
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
    while (this.order.length > 0 && !this.actions.has(this.order[0]!)) this.order.shift();
  }

  private deleteOldest(): void {
    while (this.order.length > 0) {
      const key = this.order.shift()!;
      if (this.actions.delete(key)) return;
    }
  }
}
