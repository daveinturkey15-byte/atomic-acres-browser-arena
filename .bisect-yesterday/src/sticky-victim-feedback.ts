import type { HitMessage } from './protocol';
import type { StickyAttachmentSource } from './remote-sticky-attachment-authority';

export type StickyVictimFeedback = Readonly<{
  label: 'STUCK';
  source: StickyAttachmentSource;
  targetId: string;
  targetLifeId: number;
  actionNonce: number;
  resultNonce: number;
}>;

export const STICKY_VICTIM_URGENT_ALERT_DURATION_MS = 500;
export const STICKY_VICTIM_URGENT_ALERT_MAX_ACTIONS = 128;

export type StickyVictimUrgentAlert = Readonly<{
  label: 'STUCK';
  source: StickyAttachmentSource;
  targetId: string;
  targetLifeId: number;
  actionNonce: number;
  admittedAtMs: number;
  expiresAtMs: number;
}>;

/** Current-life, recipient-local duplicate suppression for the urgent HUD lane. */
export class StickyVictimUrgentAlertController {
  private lifeId: number | null = null;
  private readonly admittedActions = new Set<string>();

  reset(targetLifeId: number | null = null): void {
    if (targetLifeId !== null && (!Number.isSafeInteger(targetLifeId) || targetLifeId < 0)) {
      throw new TypeError('Sticky urgent alert life must be a non-negative safe integer');
    }
    this.lifeId = targetLifeId;
    this.admittedActions.clear();
  }

  admit(input: Readonly<{
    source: StickyAttachmentSource;
    targetId: string;
    targetLifeId: number;
    actionNonce: number;
    nowMs: number;
  }>): StickyVictimUrgentAlert | null {
    if (input.source !== 'semtex' && input.source !== 'explosive-crossbow'
      || typeof input.targetId !== 'string' || input.targetId.length < 1 || input.targetId.length > 80
      || !Number.isSafeInteger(input.targetLifeId) || input.targetLifeId < 0
      || !Number.isSafeInteger(input.actionNonce) || input.actionNonce < 0
      || !Number.isFinite(input.nowMs) || input.nowMs < 0) return null;
    if (this.lifeId === null) this.lifeId = input.targetLifeId;
    if (input.targetLifeId !== this.lifeId) return null;
    const key = `${input.source}\u0000${input.targetId}\u0000${input.targetLifeId}\u0000${input.actionNonce}`;
    if (this.admittedActions.has(key)) return null;
    this.admittedActions.add(key);
    while (this.admittedActions.size > STICKY_VICTIM_URGENT_ALERT_MAX_ACTIONS) {
      this.admittedActions.delete(this.admittedActions.values().next().value!);
    }
    return Object.freeze({
      label: 'STUCK',
      ...input,
      admittedAtMs: input.nowMs,
      expiresAtMs: input.nowMs + STICKY_VICTIM_URGENT_ALERT_DURATION_MS,
    });
  }
}

/**
 * Project victim UI only from the host's already-admitted canonical result.
 * Callers must run nonce admission first so transport duplicates remain silent.
 */
export function projectStickyVictimFeedback(
  message: Pick<HitMessage, 'target' | 'kind' | 'explosiveSource' | 'stuck' | 'hostAuthority' | 'actionNonce' | 'nonce'>,
  expectedTargetId: string,
  expectedTargetLifeId: number,
): StickyVictimFeedback | null {
  if (message.target !== expectedTargetId
    || message.kind !== 'explosive'
    || message.stuck !== true
    || message.explosiveSource !== 'grenade' && message.explosiveSource !== 'explosive-crossbow') return null;
  const authority = message.hostAuthority;
  const attachment = authority?.stickyAttachment;
  if (!authority || !attachment
    || authority.targetLifeId !== expectedTargetLifeId
    || attachment.targetId !== expectedTargetId
    || attachment.targetLifeId !== expectedTargetLifeId) return null;
  return Object.freeze({
    label: 'STUCK',
    source: message.explosiveSource === 'grenade' ? 'semtex' : 'explosive-crossbow',
    targetId: expectedTargetId,
    targetLifeId: expectedTargetLifeId,
    actionNonce: message.actionNonce,
    resultNonce: message.nonce,
  });
}
