import type { StickyAttachmentReceiptMessage } from './protocol';
import type { StickyAttachmentRecord } from './remote-sticky-attachment-authority';
import type { StickyUrgentAlertAudience } from './sticky-victim-feedback';
import { STATE_BROADCAST_INTERVAL_MS } from './network-sync';

export const STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY = 256;
export const STICKY_ATTACHMENT_PENDING_CAPACITY = 64;
export const STICKY_ATTACHMENT_PENDING_STATE_WINDOWS = 40;
export const STICKY_ATTACHMENT_PENDING_TTL_MS = STATE_BROADCAST_INTERVAL_MS
  * STICKY_ATTACHMENT_PENDING_STATE_WINDOWS;

export type StickyAttachmentReceiptAdmission = Readonly<
  | {
      accepted: false;
      reason: 'forged-host' | 'wrong-recipient' | 'recipient-not-party' | 'match-epoch-mismatch'
        | 'owner-life-mismatch' | 'target-life-mismatch' | 'duplicate-nonce' | 'duplicate-attachment'
        | 'pending-continuity';
      audience: null;
    }
  | {
      accepted: true;
      reason: 'accepted';
      audience: StickyUrgentAlertAudience;
    }
>;

export type StickyAttachmentReceiptReady = Readonly<{
  message: StickyAttachmentReceiptMessage;
  audience: StickyUrgentAlertAudience;
}>;

type PendingStickyAttachmentReceipt = Readonly<{
  message: StickyAttachmentReceiptMessage;
  audience: StickyUrgentAlertAudience;
  expiresAtMs: number;
}>;

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
  ]);
}

type StickyAttachmentReceiptIdentityContext = Readonly<{
  expectedHostId: string | null | undefined;
  expectedRecipientId: string;
  expectedMatchEpoch: number;
}>;

type StickyAttachmentReceiptAdmissionContext = StickyAttachmentReceiptIdentityContext & Readonly<{
  currentOwnerLifeId: number | null;
  currentTargetLifeId: number | null;
}>;

type StickyAttachmentReceiptRetryContext = StickyAttachmentReceiptIdentityContext & Readonly<{
  currentLifeId: (actorId: string) => number | null;
}>;

function identityFailure(
  message: StickyAttachmentReceiptMessage,
  context: StickyAttachmentReceiptIdentityContext,
): Exclude<StickyAttachmentReceiptAdmission['reason'], 'accepted' | 'owner-life-mismatch' | 'target-life-mismatch'
  | 'duplicate-nonce' | 'duplicate-attachment' | 'pending-continuity'> | null {
  if (!context.expectedHostId || message.by !== context.expectedHostId) return 'forged-host';
  if (message.forPlayerId !== context.expectedRecipientId) return 'wrong-recipient';
  if (!stickyAttachmentAudience(message.ownerId, message.targetId, message.forPlayerId)) return 'recipient-not-party';
  if (message.matchEpoch !== context.expectedMatchEpoch) return 'match-epoch-mismatch';
  return null;
}

function continuityState(
  message: StickyAttachmentReceiptMessage,
  currentOwnerLifeId: number | null,
  currentTargetLifeId: number | null,
): 'current' | 'pending' | 'stale-owner' | 'stale-target' {
  if (currentOwnerLifeId !== null && currentOwnerLifeId > message.ownerLifeId) return 'stale-owner';
  if (currentTargetLifeId !== null && currentTargetLifeId > message.targetLifeId) return 'stale-target';
  if (currentOwnerLifeId === message.ownerLifeId && currentTargetLifeId === message.targetLifeId) return 'current';
  return 'pending';
}

/**
 * Bounded guest-side admission for authoritative onset receipts. Both the
 * transport nonce and immutable attachment identity are retained so a replay
 * cannot be made presentable merely by wrapping it in a fresh nonce.
 */
export class StickyAttachmentReceiptLedger {
  private readonly nonces = new Set<number>();
  private readonly attachments = new Set<string>();
  private readonly pending = new Map<string, PendingStickyAttachmentReceipt>();
  private readonly pendingNonces = new Map<number, string>();

  private spend(message: StickyAttachmentReceiptMessage): void {
    retainBounded(this.nonces, message.nonce);
    retainBounded(this.attachments, attachmentReplayKey(message));
  }

  private removePending(key: string, spend: boolean): PendingStickyAttachmentReceipt | null {
    const entry = this.pending.get(key) ?? null;
    if (!entry) return null;
    this.pending.delete(key);
    this.pendingNonces.delete(entry.message.nonce);
    if (spend) this.spend(entry.message);
    return entry;
  }

  private expirePending(nowMs: number): void {
    for (const [key, entry] of this.pending) {
      if (entry.expiresAtMs > nowMs) continue;
      this.removePending(key, true);
    }
  }

  private queue(
    message: StickyAttachmentReceiptMessage,
    audience: StickyUrgentAlertAudience,
    nowMs: number,
  ): void {
    while (this.pending.size >= STICKY_ATTACHMENT_PENDING_CAPACITY) {
      const oldest = this.pending.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.removePending(oldest, true);
    }
    const key = attachmentReplayKey(message);
    this.pending.set(key, Object.freeze({
      message: Object.freeze({ ...message }),
      audience,
      expiresAtMs: nowMs + STICKY_ATTACHMENT_PENDING_TTL_MS,
    }));
    this.pendingNonces.set(message.nonce, key);
  }

  admit(
    message: StickyAttachmentReceiptMessage,
    context: StickyAttachmentReceiptAdmissionContext,
    nowMs = performance.now(),
  ): StickyAttachmentReceiptAdmission {
    this.expirePending(nowMs);
    const failure = identityFailure(message, context);
    if (failure) return Object.freeze({ accepted: false, reason: failure, audience: null });
    const audience = stickyAttachmentAudience(message.ownerId, message.targetId, message.forPlayerId);
    if (!audience) return Object.freeze({ accepted: false, reason: 'recipient-not-party', audience: null });
    if (this.nonces.has(message.nonce)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-nonce', audience: null });
    }
    const key = attachmentReplayKey(message);
    if (this.attachments.has(key)) {
      retainBounded(this.nonces, message.nonce);
      return Object.freeze({ accepted: false, reason: 'duplicate-attachment', audience: null });
    }
    if (this.pendingNonces.has(message.nonce)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-nonce', audience: null });
    }
    if (this.pending.has(key)) {
      retainBounded(this.nonces, message.nonce);
      return Object.freeze({ accepted: false, reason: 'duplicate-attachment', audience: null });
    }
    const continuity = continuityState(message, context.currentOwnerLifeId, context.currentTargetLifeId);
    if (continuity === 'stale-owner') {
      this.spend(message);
      return Object.freeze({ accepted: false, reason: 'owner-life-mismatch', audience: null });
    }
    if (continuity === 'stale-target') {
      this.spend(message);
      return Object.freeze({ accepted: false, reason: 'target-life-mismatch', audience: null });
    }
    if (continuity === 'pending') {
      this.queue(message, audience, nowMs);
      return Object.freeze({ accepted: false, reason: 'pending-continuity', audience: null });
    }
    this.spend(message);
    return Object.freeze({ accepted: true, reason: 'accepted', audience });
  }

  retryPending(
    context: StickyAttachmentReceiptRetryContext,
    nowMs = performance.now(),
  ): readonly StickyAttachmentReceiptReady[] {
    this.expirePending(nowMs);
    const ready: StickyAttachmentReceiptReady[] = [];
    for (const [key, entry] of [...this.pending]) {
      if (identityFailure(entry.message, context)) {
        this.removePending(key, true);
        continue;
      }
      const continuity = continuityState(
        entry.message,
        context.currentLifeId(entry.message.ownerId),
        context.currentLifeId(entry.message.targetId),
      );
      if (continuity === 'pending') continue;
      if (continuity !== 'current') {
        this.removePending(key, true);
        continue;
      }
      // Keep the canonical identity pending until the caller has actually
      // presented it; retry and presentation are intentionally two-phase.
      ready.push(Object.freeze({ message: entry.message, audience: entry.audience }));
    }
    return Object.freeze(ready);
  }

  finalizePending(message: StickyAttachmentReceiptMessage): boolean {
    const key = attachmentReplayKey(message);
    const pending = this.pending.get(key);
    if (!pending || pending.message.nonce !== message.nonce) return false;
    this.removePending(key, true);
    return true;
  }

  discardPendingForActor(actorId: string): void {
    for (const [key, entry] of [...this.pending]) {
      if (entry.message.ownerId === actorId || entry.message.targetId === actorId) this.removePending(key, true);
    }
  }

  discardPendingBeforeActorLife(actorId: string, currentLifeId: number): void {
    for (const [key, entry] of [...this.pending]) {
      const actorLifeIds = [
        ...(entry.message.ownerId === actorId ? [entry.message.ownerLifeId] : []),
        ...(entry.message.targetId === actorId ? [entry.message.targetLifeId] : []),
      ];
      if (actorLifeIds.some((lifeId) => lifeId < currentLifeId)) this.removePending(key, true);
    }
  }

  discardPending(): void {
    for (const key of [...this.pending.keys()]) this.removePending(key, true);
  }

  reset(): void {
    this.nonces.clear();
    this.attachments.clear();
    this.pending.clear();
    this.pendingNonces.clear();
  }

  snapshot(): Readonly<{
    nonces: number;
    attachments: number;
    pending: number;
    nextPendingExpiryAtMs: number | null;
    bounded: boolean;
  }> {
    const nextPendingExpiryAtMs = this.pending.values().next().value?.expiresAtMs ?? null;
    return Object.freeze({
      nonces: this.nonces.size,
      attachments: this.attachments.size,
      pending: this.pending.size,
      nextPendingExpiryAtMs,
      bounded: this.nonces.size <= STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY
        && this.attachments.size <= STICKY_ATTACHMENT_RECEIPT_REPLAY_CAPACITY
        && this.pending.size <= STICKY_ATTACHMENT_PENDING_CAPACITY,
    });
  }
}
