import { describe, expect, it } from 'vitest';
import { loadRoomRejoinIdentity, saveRoomRejoinIdentity } from './room-rejoin-identity';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const identity = { playerId: 'player-1', token: '12345678-1234-1234-1234-123456789abc' } as const;

describe('bounded room rejoin identity', () => {
  it('survives a closed tab through persistent browser storage during the host grace window', () => {
    const firstTab = new MemoryStorage();
    const reopenedTab = new MemoryStorage();
    const persistent = new MemoryStorage();
    saveRoomRejoinIdentity('room-a', identity, firstTab, persistent, 90_000, 1_000);
    expect(loadRoomRejoinIdentity('room-a', reopenedTab, persistent, 90_999)).toEqual(identity);
  });

  it('expires the persistent credential at the same bounded rejoin deadline', () => {
    const firstTab = new MemoryStorage();
    const reopenedTab = new MemoryStorage();
    const persistent = new MemoryStorage();
    saveRoomRejoinIdentity('room-a', identity, firstTab, persistent, 90_000, 1_000);
    expect(loadRoomRejoinIdentity('room-a', reopenedTab, persistent, 91_000)).toBeNull();
    expect(persistent.values.size).toBe(0);
  });

  it('keeps room credentials isolated and rejects malformed durable state', () => {
    const transient = new MemoryStorage();
    const persistent = new MemoryStorage();
    saveRoomRejoinIdentity('room-a', identity, transient, persistent, 90_000, 1_000);
    expect(loadRoomRejoinIdentity('room-b', new MemoryStorage(), persistent, 2_000)).toBeNull();
    persistent.setItem('atomic-acres:room-identity:room-b', '{"token":"short"}');
    expect(loadRoomRejoinIdentity('room-b', new MemoryStorage(), persistent, 2_000)).toBeNull();
  });
});
