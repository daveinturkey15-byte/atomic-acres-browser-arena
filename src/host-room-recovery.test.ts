import { describe, expect, it } from 'vitest';
import {
  LAST_HOSTED_ROOM_KEY,
  clearLastHostedRoomCode,
  loadLastHostedRoomCode,
  saveLastHostedRoomCode,
} from './host-room-recovery';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('hosted-room crash recovery', () => {
  it('synchronously removes and verifies the old room before a fresh-code reset', () => {
    const storage = new MemoryStorage();
    expect(saveLastHostedRoomCode('  old-room  ', storage)).toBe(true);
    expect(loadLastHostedRoomCode(storage)).toBe('old-room');

    expect(clearLastHostedRoomCode(storage)).toBe(true);
    expect(loadLastHostedRoomCode(storage)).toBeNull();
    expect(storage.values.has(LAST_HOSTED_ROOM_KEY)).toBe(false);
  });

  it('fails closed when storage is absent, throws, or retains the invalidated code', () => {
    expect(clearLastHostedRoomCode(undefined)).toBe(false);
    expect(clearLastHostedRoomCode({
      getItem: () => 'old-room',
      setItem: () => undefined,
      removeItem: () => undefined,
    })).toBe(false);
    expect(clearLastHostedRoomCode({
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => undefined,
      removeItem: () => { throw new Error('storage denied'); },
    })).toBe(false);
  });

  it('rejects blank room codes and storage failures without retaining junk', () => {
    const storage = new MemoryStorage();
    expect(saveLastHostedRoomCode('   ', storage)).toBe(false);
    expect(loadLastHostedRoomCode(storage)).toBeNull();
    expect(saveLastHostedRoomCode('room-next', undefined)).toBe(false);
  });
});
