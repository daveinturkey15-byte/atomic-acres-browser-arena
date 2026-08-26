export type StickyAttachmentSource = 'semtex' | 'explosive-crossbow';

export type StickyAttachmentRecord = Readonly<{
  matchEpoch: number;
  ownerId: string;
  ownerLifeId: number;
  source: StickyAttachmentSource;
  actionNonce: number;
  targetId: string;
  targetLifeId: number;
  attachedAtMs: number;
  expiresAtMs: number;
  detonationOrigin: readonly [number, number, number] | null;
  detonatedAtMs: number | null;
}>;

export type RemoteStickyAttachmentAuthorityState = Readonly<{
  records: Readonly<Record<string, StickyAttachmentRecord>>;
}>;

export type StickyAttachmentMutationResult = Readonly<{
  accepted: boolean;
  reason: 'recorded' | 'sealed' | 'duplicate' | 'invalid' | 'missing' | 'conflict' | 'expired' | 'capacity';
  state: RemoteStickyAttachmentAuthorityState;
}>;

export type StickyAttachmentVerification = Readonly<{
  status: 'verified' | 'pending' | 'rejected';
  reason: 'verified' | 'missing' | 'unsealed' | 'expired' | 'origin-mismatch' | 'invalid';
  attachment: StickyAttachmentRecord | null;
}>;

const MAX_RECORDS = 64;
export const STICKY_DETONATION_ORIGIN_TOLERANCE_M = 1.5;

function recordKey(matchEpoch: number, ownerId: string, ownerLifeId: number, source: StickyAttachmentSource, actionNonce: number): string {
  return JSON.stringify([matchEpoch, ownerId, ownerLifeId, source, actionNonce]);
}

function validIdentity(value: string): boolean {
  return value.length > 0 && value.length <= 80;
}

function validLifeId(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validActionNonce(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validSource(value: unknown): value is StickyAttachmentSource {
  return value === 'semtex' || value === 'explosive-crossbow';
}

function validPoint(value: readonly [number, number, number]): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function distance(left: readonly [number, number, number], right: readonly [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

export function createRemoteStickyAttachmentAuthorityState(): RemoteStickyAttachmentAuthorityState {
  return Object.freeze({ records: Object.freeze({}) });
}

export function stickyAttachmentRecord(
  state: RemoteStickyAttachmentAuthorityState,
  matchEpoch: number,
  ownerId: string,
  ownerLifeId: number,
  source: StickyAttachmentSource,
  actionNonce: number,
): StickyAttachmentRecord | null {
  return state.records[recordKey(matchEpoch, ownerId, ownerLifeId, source, actionNonce)] ?? null;
}

export function stickyAttachmentRecordForAction(
  state: RemoteStickyAttachmentAuthorityState,
  matchEpoch: number,
  ownerId: string,
  source: StickyAttachmentSource,
  actionNonce: number,
): StickyAttachmentRecord | null {
  const matches = Object.values(state.records).filter((record) => record.matchEpoch === matchEpoch
    && record.ownerId === ownerId && record.source === source && record.actionNonce === actionNonce);
  return matches.length === 1 ? matches[0] : null;
}

export function recordRemoteStickyAttachment(
  state: RemoteStickyAttachmentAuthorityState,
  input: Readonly<{
    matchEpoch: number;
    ownerId: string;
    ownerLifeId: number;
    source: StickyAttachmentSource;
    actionNonce: number;
    targetId: string;
    targetLifeId: number;
    attachedAtMs: number;
    expiresAtMs: number;
  }>,
): StickyAttachmentMutationResult {
  if (!Number.isSafeInteger(input.matchEpoch) || input.matchEpoch < 0
    || !validIdentity(input.ownerId) || !validLifeId(input.ownerLifeId) || !validIdentity(input.targetId)
    || !validSource(input.source) || !validActionNonce(input.actionNonce) || !validLifeId(input.targetLifeId)
    || !Number.isFinite(input.attachedAtMs) || !Number.isFinite(input.expiresAtMs)
    || input.expiresAtMs <= input.attachedAtMs || input.expiresAtMs - input.attachedAtMs > 30_000) {
    return Object.freeze({ accepted: false, reason: 'invalid', state });
  }
  const key = recordKey(input.matchEpoch, input.ownerId, input.ownerLifeId, input.source, input.actionNonce);
  const existing = state.records[key];
  if (existing) {
    const duplicate = existing.targetId === input.targetId
      && existing.targetLifeId === input.targetLifeId
      && existing.attachedAtMs === input.attachedAtMs
      && existing.expiresAtMs === input.expiresAtMs;
    return Object.freeze({ accepted: duplicate, reason: duplicate ? 'duplicate' : 'conflict', state });
  }
  const retained = Object.fromEntries(Object.entries(state.records).filter(([, record]) => record.expiresAtMs >= input.attachedAtMs));
  if (Object.keys(retained).length >= MAX_RECORDS) return Object.freeze({ accepted: false, reason: 'capacity', state });
  const next: StickyAttachmentRecord = Object.freeze({ ...input, detonationOrigin: null, detonatedAtMs: null });
  return Object.freeze({
    accepted: true,
    reason: 'recorded',
    state: Object.freeze({ records: Object.freeze({ ...retained, [key]: next }) }),
  });
}

export function sealRemoteStickyDetonation(
  state: RemoteStickyAttachmentAuthorityState,
  input: Readonly<{
    matchEpoch: number;
    ownerId: string;
    ownerLifeId: number;
    source: StickyAttachmentSource;
    actionNonce: number;
    origin: readonly [number, number, number];
    detonatedAtMs: number;
    currentAttachmentTarget: Readonly<{ id: string; lifeId: number }> | null;
  }>,
): StickyAttachmentMutationResult {
  if (!Number.isSafeInteger(input.matchEpoch) || input.matchEpoch < 0
    || !validIdentity(input.ownerId) || !validLifeId(input.ownerLifeId) || !validSource(input.source)
    || !validActionNonce(input.actionNonce) || !validPoint(input.origin) || !Number.isFinite(input.detonatedAtMs)) {
    return Object.freeze({ accepted: false, reason: 'invalid', state });
  }
  const key = recordKey(input.matchEpoch, input.ownerId, input.ownerLifeId, input.source, input.actionNonce);
  const existing = state.records[key];
  if (!existing) return Object.freeze({ accepted: false, reason: 'missing', state });
  if (!input.currentAttachmentTarget || input.currentAttachmentTarget.id !== existing.targetId
    || input.currentAttachmentTarget.lifeId !== existing.targetLifeId) {
    return Object.freeze({ accepted: false, reason: 'conflict', state });
  }
  if (input.detonatedAtMs < existing.attachedAtMs || input.detonatedAtMs > existing.expiresAtMs) {
    return Object.freeze({ accepted: false, reason: 'expired', state });
  }
  if (existing.detonationOrigin) {
    const duplicate = distance(existing.detonationOrigin, input.origin) <= 0.01
      && existing.detonatedAtMs === input.detonatedAtMs;
    return Object.freeze({ accepted: duplicate, reason: duplicate ? 'duplicate' : 'conflict', state });
  }
  const next: StickyAttachmentRecord = Object.freeze({
    ...existing,
    detonationOrigin: Object.freeze([...input.origin] as [number, number, number]),
    detonatedAtMs: input.detonatedAtMs,
  });
  return Object.freeze({
    accepted: true,
    reason: 'sealed',
    state: Object.freeze({ records: Object.freeze({ ...state.records, [key]: next }) }),
  });
}

export function verifyRemoteStickyAttachment(
  state: RemoteStickyAttachmentAuthorityState,
  input: Readonly<{
    matchEpoch: number;
    ownerId: string;
    ownerLifeId: number;
    source: StickyAttachmentSource;
    actionNonce: number;
    claimedOrigin: readonly [number, number, number];
    now: number;
  }>,
): StickyAttachmentVerification {
  if (!Number.isSafeInteger(input.matchEpoch) || input.matchEpoch < 0
    || !validIdentity(input.ownerId) || !validLifeId(input.ownerLifeId) || !validSource(input.source)
    || !validActionNonce(input.actionNonce) || !validPoint(input.claimedOrigin) || !Number.isFinite(input.now)) {
    return Object.freeze({ status: 'rejected', reason: 'invalid', attachment: null });
  }
  const attachment = stickyAttachmentRecord(state, input.matchEpoch, input.ownerId, input.ownerLifeId, input.source, input.actionNonce);
  if (!attachment) return Object.freeze({ status: 'pending', reason: 'missing', attachment: null });
  if (input.now > attachment.expiresAtMs) return Object.freeze({ status: 'rejected', reason: 'expired', attachment });
  if (!attachment.detonationOrigin || attachment.detonatedAtMs === null) {
    return Object.freeze({ status: 'pending', reason: 'unsealed', attachment });
  }
  if (attachment.detonatedAtMs < attachment.attachedAtMs || attachment.detonatedAtMs > input.now) {
    return Object.freeze({ status: 'rejected', reason: 'invalid', attachment });
  }
  if (distance(attachment.detonationOrigin, input.claimedOrigin) > STICKY_DETONATION_ORIGIN_TOLERANCE_M) {
    return Object.freeze({ status: 'rejected', reason: 'origin-mismatch', attachment });
  }
  return Object.freeze({ status: 'verified', reason: 'verified', attachment });
}

export function pruneRemoteStickyAttachments(
  state: RemoteStickyAttachmentAuthorityState,
  now: number,
): RemoteStickyAttachmentAuthorityState {
  if (!Number.isFinite(now)) return state;
  const records = Object.fromEntries(Object.entries(state.records).filter(([, record]) => record.expiresAtMs >= now));
  if (Object.keys(records).length === Object.keys(state.records).length) return state;
  return Object.freeze({ records: Object.freeze(records) });
}

export function removeRemoteStickyAttachmentsForActor(
  state: RemoteStickyAttachmentAuthorityState,
  actorId: string,
): RemoteStickyAttachmentAuthorityState {
  if (!validIdentity(actorId)) return state;
  const records = Object.fromEntries(Object.entries(state.records)
    .filter(([, record]) => record.ownerId !== actorId && record.targetId !== actorId));
  if (Object.keys(records).length === Object.keys(state.records).length) return state;
  return Object.freeze({ records: Object.freeze(records) });
}
