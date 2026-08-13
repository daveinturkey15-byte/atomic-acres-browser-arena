import type { StickyAttachmentReceiptMessage } from './protocol';
import type { StickyAttachmentRecord } from './remote-sticky-attachment-authority';
import type { StickyUrgentAlertAudience } from './sticky-victim-feedback';

export const STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY = 256;

export type StickyAttachmentReceiptAdmission = Readonly<
  | {
      accepted: false;
      reason: 'forged-host' | 'wrong-recipient' | 'recipient-not-party' | 'match-epoch-mismatch'
        | 'owner-life-mismatch' | 'target-life-mismatch' | 'duplicate-nonce' | 'duplicate-attachment';
      audience: null;
    }
  | {
      accepted: true;
      reason: 'accepted';
      audience: StickyUrgentAlertAudience;
    }
>;

export type StickyAttachmentOnsetPlan = Readonly<{
  localAudience: StickyUrgentAlertAudience | null;
  remoteRecipients: readonly Readonly<{
    playerId: string;
    audience: StickyUrgentAlertAudience;
  }>[];
}>;

function retainBounded<T>(set: Set<T>, value: T): void {
  set.add(value);
  while (set.size > STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY) {
    set.delete(set.values().next().value!);
  }
}

export function stickyAttachmentAudience(
  ownerId: string,
  targetId: string,
  recipientId: string,
): StickyUrgentAlertAudience | null {
  if (recipientId === targetId) return 'victim';
  if (recipientId === ownerId) return 'attacker';
  return null;
}

/** Exact host-local and remote audiences for one receiver-authored attachment. */
export function planStickyAttachmentOnset(
  attachment: Pick<StickyAttachmentRecord, 'ownerId' | 'targetId'>,
  hostId: string,
): StickyAttachmentOnsetPlan {
  const localAudience = stickyAttachmentAudience(attachment.ownerId, attachment.targetId, hostId);
  const remoteRecipients: Array<Readonly<{ playerId: string; audience: StickyUrgentAlertAudience }>> = [];
  const recipientIds = new Set([attachment.ownerId, attachment.targetId]);
  for (const playerId of recipientIds) {
    if (playerId === hostId) continue;
    const audience = stickyAttachmentAudience(attachment.ownerId, attachment.targetId, playerId);
    if (audience) remoteRecipients.push(Object.freeze({ playerId, audience }));
  }
  return Object.freeze({ localAudience, remoteRecipients: Object.freeze(remoteRecipients) });
}

function attachmentReplayKey(message: StickyAttachmentReceiptMessage): string {
  return JSON.stringify([
    message.matchEpoch,
    message.source,
    message.ownerId,
    message.ownerLifeId,
    message.targetId,
    message.targetLifeId,
    message.actionNonce,
    message.forPlayerId,
  ]);
}

/**
 * Bounded guest-side admission for authoritative onset receipts. Both the
 * transport nonce and immutable attachment identity are retained so a replay
 * cannot be made presentable merely by wrapping it in a fresh nonce.
 */
export class StickyAttachmentReceiptLedger {
  private readonly nonces = new Set<number>();
  private readonly attachments = new Set<string>();

  admit(
    message: StickyAttachmentReceiptMessage,
    context: Readonly<{
      expectedHostId: string | null | undefined;
      expectedRecipientId: string;
      expectedMatchEpoch: number;
      currentOwnerLifeId: number | null;
      currentTargetLifeId: number | null;
    }>,
  ): StickyAttachmentReceiptAdmission {
    if (!context.expectedHostId || message.by !== context.expectedHostId) {
      return Object.freeze({ accepted: false, reason: 'forged-host', audience: null });
    }
    if (message.forPlayerId !== context.expectedRecipientId) {
      return Object.freeze({ accepted: false, reason: 'wrong-recipient', audience: null });
    }
    const audience = stickyAttachmentAudience(message.ownerId, message.targetId, message.forPlayerId);
    if (!audience) return Object.freeze({ accepted: false, reason: 'recipient-not-party', audience: null });
    if (message.matchEpoch !== context.expectedMatchEpoch) {
      return Object.freeze({ accepted: false, reason: 'match-epoch-mismatch', audience: null });
    }
    if (context.currentOwnerLifeId === null || message.ownerLifeId !== context.currentOwnerLifeId) {
      return Object.freeze({ accepted: false, reason: 'owner-life-mismatch', audience: null });
    }
    if (context.currentTargetLifeId === null || message.targetLifeId !== context.currentTargetLifeId) {
      return Object.freeze({ accepted: false, reason: 'target-life-mismatch', audience: null });
    }
    if (this.nonces.has(message.nonce)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-nonce', audience: null });
    }
    retainBounded(this.nonces, message.nonce);
    const key = attachmentReplayKey(message);
    if (this.attachments.has(key)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-attachment', audience: null });
    }
    retainBounded(this.attachments, key);
    return Object.freeze({ accepted: true, reason: 'accepted', audience });
  }

  reset(): void {
    this.nonces.clear();
    this.attachments.clear();
  }

  snapshot(): Readonly<{ nonces: number; attachments: number; bounded: boolean }> {
    return Object.freeze({
      nonces: this.nonces.size,
      attachments: this.attachments.size,
      bounded: this.nonces.size <= STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY
        && this.attachments.size <= STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY,
    });
  }
}
