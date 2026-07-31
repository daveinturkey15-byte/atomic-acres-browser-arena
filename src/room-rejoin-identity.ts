type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RoomRejoinIdentity = Readonly<{
  playerId: string;
  token: string;
}>;

type StoredRoomRejoinIdentity = Readonly<{
  schemaVersion: 1 | 2;
  playerId: string;
  token: string;
  expiresAtEpochMs: number;
  ownerTabId?: string;
}>;

type StoredRoomIdentityLease = Readonly<{
  schemaVersion: 1;
  ownerTabId: string;
  expiresAtEpochMs: number;
}>;

const ACTIVE_LEASE_MS = 10_000;

function roomIdentityKey(roomCode: string): string {
  return `atomic-acres:room-identity:${roomCode}`;
}

function roomIdentityLeaseKey(roomCode: string): string {
  return `atomic-acres:room-identity-owner:${roomCode}`;
}

const LAST_ROOM_KEY = 'atomic-acres:last-room';

/** Remember the most recently joined room so a crashed player can be offered a
    one-click rejoin on reload instead of re-pasting the code. */
export function saveLastRoomCode(roomCode: string, persistentStorage: StorageLike): void {
  try { persistentStorage.setItem(LAST_ROOM_KEY, roomCode); } catch { /* Rejoin affordance is best effort. */ }
}

export function loadLastRoomCode(persistentStorage: StorageLike): string | null {
  try {
    const value = persistentStorage.getItem(LAST_ROOM_KEY);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch { return null; }
}

function validIdentity(value: unknown): value is RoomRejoinIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RoomRejoinIdentity>;
  return typeof candidate.playerId === 'string' && candidate.playerId.length > 0 && candidate.playerId.length <= 80
    && typeof candidate.token === 'string' && candidate.token.length >= 24 && candidate.token.length <= 128;
}

function readTransientIdentity(storage: StorageLike, key: string): RoomRejoinIdentity | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null') as unknown;
    return validIdentity(parsed) ? { playerId: parsed.playerId, token: parsed.token } : null;
  } catch {
    return null;
  }
}

function activeOtherOwner(
  storage: StorageLike,
  roomCode: string,
  ownerTabId: string | undefined,
  nowEpochMs: number,
): boolean {
  try {
    const key = roomIdentityLeaseKey(roomCode);
    const lease = JSON.parse(storage.getItem(key) ?? 'null') as Partial<StoredRoomIdentityLease> | null;
    if (!lease || lease.schemaVersion !== 1 || typeof lease.ownerTabId !== 'string'
      || !Number.isFinite(lease.expiresAtEpochMs) || Number(lease.expiresAtEpochMs) <= nowEpochMs) {
      storage.removeItem(key);
      return false;
    }
    return lease.ownerTabId !== ownerTabId;
  } catch {
    return false;
  }
}

function readPersistentIdentity(
  storage: StorageLike,
  roomCode: string,
  key: string,
  nowEpochMs: number,
  ownerTabId?: string,
): RoomRejoinIdentity | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null') as Partial<StoredRoomRejoinIdentity> | null;
    if (!parsed || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) || !Number.isFinite(parsed.expiresAtEpochMs)
      || Number(parsed.expiresAtEpochMs) <= nowEpochMs || !validIdentity(parsed)) {
      storage.removeItem(key);
      return null;
    }
    // localStorage is shared by every tab on this origin. Do not let a second
    // concurrently open guest clone the first guest's resume credential.
    if (activeOtherOwner(storage, roomCode, ownerTabId, nowEpochMs)) return null;
    return { playerId: parsed.playerId, token: parsed.token };
  } catch {
    return null;
  }
}

/** Restore a same-tab identity first, then the bounded close-tab rejoin credential. */
export function loadRoomRejoinIdentity(
  roomCode: string,
  transientStorage: StorageLike,
  persistentStorage: StorageLike,
  nowEpochMs = Date.now(),
  ownerTabId?: string,
): RoomRejoinIdentity | null {
  const key = roomIdentityKey(roomCode);
  return readTransientIdentity(transientStorage, key)
    ?? readPersistentIdentity(persistentStorage, roomCode, key, nowEpochMs, ownerTabId);
}

/** Persist only for the host's rejoin grace; this is not a permanent player identity. */
export function saveRoomRejoinIdentity(
  roomCode: string,
  identity: RoomRejoinIdentity,
  transientStorage: StorageLike,
  persistentStorage: StorageLike,
  rejoinGraceMs: number,
  nowEpochMs = Date.now(),
  ownerTabId?: string,
): void {
  if (!validIdentity(identity) || !Number.isFinite(rejoinGraceMs) || rejoinGraceMs <= 0) return;
  const key = roomIdentityKey(roomCode);
  const document: StoredRoomRejoinIdentity = {
    schemaVersion: ownerTabId ? 2 : 1,
    ...identity,
    expiresAtEpochMs: nowEpochMs + rejoinGraceMs,
    ...(ownerTabId ? { ownerTabId } : {}),
  };
  const serialized = JSON.stringify(document);
  try { transientStorage.setItem(key, serialized); } catch { /* A persistent recovery copy can still work. */ }
  try { persistentStorage.setItem(key, serialized); } catch { /* Same-tab rejoin remains available. */ }
  if (ownerTabId) {
    const lease: StoredRoomIdentityLease = {
      schemaVersion: 1,
      ownerTabId,
      expiresAtEpochMs: nowEpochMs + ACTIVE_LEASE_MS,
    };
    try { persistentStorage.setItem(roomIdentityLeaseKey(roomCode), JSON.stringify(lease)); } catch { /* Lease isolation is best effort. */ }
  }
}

/** Release only this tab's lease; the bounded credential remains recoverable. */
export function releaseRoomRejoinIdentityLease(
  roomCode: string,
  persistentStorage: StorageLike,
  ownerTabId: string,
): void {
  const key = roomIdentityLeaseKey(roomCode);
  try {
    const lease = JSON.parse(persistentStorage.getItem(key) ?? 'null') as Partial<StoredRoomIdentityLease> | null;
    if (lease?.schemaVersion === 1 && lease.ownerTabId === ownerTabId) persistentStorage.removeItem(key);
  } catch { /* A stale lease expires after ten seconds. */ }
}
