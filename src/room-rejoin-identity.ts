type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RoomRejoinIdentity = Readonly<{
  playerId: string;
  token: string;
}>;

type StoredRoomRejoinIdentity = Readonly<{
  schemaVersion: 1;
  playerId: string;
  token: string;
  expiresAtEpochMs: number;
}>;

function roomIdentityKey(roomCode: string): string {
  return `atomic-acres:room-identity:${roomCode}`;
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

function readPersistentIdentity(storage: StorageLike, key: string, nowEpochMs: number): RoomRejoinIdentity | null {
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? 'null') as Partial<StoredRoomRejoinIdentity> | null;
    if (!parsed || parsed.schemaVersion !== 1 || !Number.isFinite(parsed.expiresAtEpochMs)
      || Number(parsed.expiresAtEpochMs) <= nowEpochMs || !validIdentity(parsed)) {
      storage.removeItem(key);
      return null;
    }
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
): RoomRejoinIdentity | null {
  const key = roomIdentityKey(roomCode);
  return readTransientIdentity(transientStorage, key)
    ?? readPersistentIdentity(persistentStorage, key, nowEpochMs);
}

/** Persist only for the host's rejoin grace; this is not a permanent player identity. */
export function saveRoomRejoinIdentity(
  roomCode: string,
  identity: RoomRejoinIdentity,
  transientStorage: StorageLike,
  persistentStorage: StorageLike,
  rejoinGraceMs: number,
  nowEpochMs = Date.now(),
): void {
  if (!validIdentity(identity) || !Number.isFinite(rejoinGraceMs) || rejoinGraceMs <= 0) return;
  const key = roomIdentityKey(roomCode);
  const document: StoredRoomRejoinIdentity = {
    schemaVersion: 1,
    ...identity,
    expiresAtEpochMs: nowEpochMs + rejoinGraceMs,
  };
  const serialized = JSON.stringify(document);
  try { transientStorage.setItem(key, serialized); } catch { /* A persistent recovery copy can still work. */ }
  try { persistentStorage.setItem(key, serialized); } catch { /* Same-tab rejoin remains available. */ }
}
