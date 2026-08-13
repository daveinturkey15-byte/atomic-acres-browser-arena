import type { StickyAttachmentSource } from './remote-sticky-attachment-authority';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const STICKY_VICTIM_RECEIPT_SCHEMA_VERSION = 2;
export const STICKY_VICTIM_RECEIPT_STORAGE_KEY = 'atomic-acres:sticky-victim-receipts:v2';
export const MAX_STICKY_VICTIM_RECEIPTS = 64;
export const MAX_STICKY_VICTIM_RECEIPT_BYTES = 64 * 1024;
/** Maximum 15-minute match plus the 90-second crash-rejoin reservation. */
export const STICKY_VICTIM_RECEIPT_TTL_MS = 990_000;

export type StickyVictimReceipt = Readonly<{
  matchEpoch: number;
  ownerId: string;
  ownerLifeId: number;
  targetId: string;
  targetLifeId: number;
  source: StickyAttachmentSource;
  actionNonce: number;
  expiresAtEpochMs: number;
}>;

type StickyVictimReceiptEnvelope = Readonly<{
  schemaVersion: typeof STICKY_VICTIM_RECEIPT_SCHEMA_VERSION;
  receipts: readonly StickyVictimReceipt[];
}>;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safeInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function validReceipt(value: unknown): value is StickyVictimReceipt {
  return record(value)
    && exactKeys(value, ['matchEpoch', 'ownerId', 'ownerLifeId', 'targetId', 'targetLifeId', 'source', 'actionNonce', 'expiresAtEpochMs'])
    && safeInteger(value.matchEpoch, 0, 999_999_999)
    && typeof value.ownerId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value.ownerId)
    && safeInteger(value.ownerLifeId, 0, 1_000_000_000)
    && typeof value.targetId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value.targetId)
    && safeInteger(value.targetLifeId, 0, 1_000_000_000)
    && (value.source === 'semtex' || value.source === 'explosive-crossbow')
    && safeInteger(value.actionNonce, 0, Number.MAX_SAFE_INTEGER)
    && safeInteger(value.expiresAtEpochMs, 1, 10_000_000_000_000);
}

function loadEnvelope(storage: StorageLike | undefined): StickyVictimReceiptEnvelope {
  if (!storage) return Object.freeze({ schemaVersion: STICKY_VICTIM_RECEIPT_SCHEMA_VERSION, receipts: Object.freeze([]) });
  try {
    const serialized = storage.getItem(STICKY_VICTIM_RECEIPT_STORAGE_KEY);
    if (!serialized || serialized.length > MAX_STICKY_VICTIM_RECEIPT_BYTES) throw new Error('missing or oversized receipt envelope');
    const value: unknown = JSON.parse(serialized);
    if (!record(value) || !exactKeys(value, ['schemaVersion', 'receipts'])
      || value.schemaVersion !== STICKY_VICTIM_RECEIPT_SCHEMA_VERSION
      || !Array.isArray(value.receipts)
      || value.receipts.length > MAX_STICKY_VICTIM_RECEIPTS
      || !value.receipts.every(validReceipt)) throw new Error('invalid receipt envelope');
    return value as StickyVictimReceiptEnvelope;
  } catch {
    return Object.freeze({ schemaVersion: STICKY_VICTIM_RECEIPT_SCHEMA_VERSION, receipts: Object.freeze([]) });
  }
}

export function stickyVictimReceiptKey(receipt: Omit<StickyVictimReceipt, 'expiresAtEpochMs'>): string {
  return JSON.stringify([
    receipt.matchEpoch,
    receipt.ownerId,
    receipt.ownerLifeId,
    receipt.targetId,
    receipt.targetLifeId,
    receipt.source,
    receipt.actionNonce,
  ]);
}

export function loadStickyVictimReceiptKeys(
  storage: StorageLike | undefined,
  matchEpoch: number,
  targetId: string,
  nowEpochMs = Date.now(),
): ReadonlySet<string> {
  if (!safeInteger(matchEpoch, 0, 999_999_999) || !/^[A-Za-z0-9_-]{1,80}$/.test(targetId)
    || !Number.isFinite(nowEpochMs)) return new Set();
  return new Set(loadEnvelope(storage).receipts
    .filter((receipt) => receipt.expiresAtEpochMs > nowEpochMs
      && receipt.expiresAtEpochMs <= nowEpochMs + STICKY_VICTIM_RECEIPT_TTL_MS
      && receipt.matchEpoch === matchEpoch && receipt.targetId === targetId)
    .map(stickyVictimReceiptKey));
}

export function saveStickyVictimReceipt(
  storage: StorageLike | undefined,
  receipt: StickyVictimReceipt,
  nowEpochMs = Date.now(),
): boolean {
  if (!storage || !validReceipt(receipt) || !Number.isFinite(nowEpochMs)
    || receipt.expiresAtEpochMs <= nowEpochMs
    || receipt.expiresAtEpochMs > nowEpochMs + STICKY_VICTIM_RECEIPT_TTL_MS) return false;
  const key = stickyVictimReceiptKey(receipt);
  const retained = loadEnvelope(storage).receipts.filter((candidate) => (
    candidate.expiresAtEpochMs > nowEpochMs
    && candidate.expiresAtEpochMs <= nowEpochMs + STICKY_VICTIM_RECEIPT_TTL_MS
    && stickyVictimReceiptKey(candidate) !== key
  ));
  const receipts = [...retained, Object.freeze({ ...receipt })].slice(-MAX_STICKY_VICTIM_RECEIPTS);
  try {
    const serialized = JSON.stringify({
      schemaVersion: STICKY_VICTIM_RECEIPT_SCHEMA_VERSION,
      receipts,
    });
    if (serialized.length > MAX_STICKY_VICTIM_RECEIPT_BYTES) return false;
    storage.setItem(STICKY_VICTIM_RECEIPT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
