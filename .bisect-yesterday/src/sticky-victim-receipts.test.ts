import { describe, expect, it } from 'vitest';
import {
  STICKY_VICTIM_RECEIPT_TTL_MS,
  STICKY_VICTIM_RECEIPT_STORAGE_KEY,
  loadStickyVictimReceiptKeys,
  saveStickyVictimReceipt,
  stickyVictimReceiptKey,
  type StickyVictimReceipt,
} from './sticky-victim-receipts';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const receipt: StickyVictimReceipt = {
  matchEpoch: 42,
  ownerId: 'host-1',
  targetId: 'guest-1',
  targetLifeId: 4,
  source: 'semtex',
  actionNonce: 81,
  expiresAtEpochMs: 100_000,
};

describe('sticky victim reconnect receipts', () => {
  it('retains a bounded non-secret semantic action key across a document reload', () => {
    const storage = new MemoryStorage();
    expect(saveStickyVictimReceipt(storage, receipt, 10_000)).toBe(true);
    const restored = loadStickyVictimReceiptKeys(storage, 42, 'guest-1', 20_000);
    expect(restored.has(stickyVictimReceiptKey(receipt))).toBe(true);
    expect(storage.values.get(STICKY_VICTIM_RECEIPT_STORAGE_KEY)).not.toMatch(/token|credential|name/i);
  });

  it('isolates epochs, victims and expiry and fails closed on malformed storage', () => {
    const storage = new MemoryStorage();
    expect(saveStickyVictimReceipt(storage, receipt, 10_000)).toBe(true);
    expect(loadStickyVictimReceiptKeys(storage, 43, 'guest-1', 20_000).size).toBe(0);
    expect(loadStickyVictimReceiptKeys(storage, 42, 'other-guest', 20_000).size).toBe(0);
    expect(loadStickyVictimReceiptKeys(storage, 42, 'guest-1', 100_000).size).toBe(0);
    storage.values.set(STICKY_VICTIM_RECEIPT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      receipts: [{ ...receipt, expiresAtEpochMs: 20_000 + STICKY_VICTIM_RECEIPT_TTL_MS + 1 }],
    }));
    expect(loadStickyVictimReceiptKeys(storage, 42, 'guest-1', 20_000).size).toBe(0);
    storage.values.set(STICKY_VICTIM_RECEIPT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, receipts: [{ ...receipt, extra: true }] }));
    expect(loadStickyVictimReceiptKeys(storage, 42, 'guest-1', 20_000).size).toBe(0);
  });

  it('refuses to persist evidence beyond the bounded crash-rejoin lifetime', () => {
    const storage = new MemoryStorage();
    expect(saveStickyVictimReceipt(storage, {
      ...receipt,
      expiresAtEpochMs: 10_000 + STICKY_VICTIM_RECEIPT_TTL_MS + 1,
    }, 10_000)).toBe(false);
    expect(storage.values.has(STICKY_VICTIM_RECEIPT_STORAGE_KEY)).toBe(false);
  });
});
