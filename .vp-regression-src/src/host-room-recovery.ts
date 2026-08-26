type HostedRoomStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const LAST_HOSTED_ROOM_KEY = 'atomic-acres:last-hosted-room';

export function saveLastHostedRoomCode(roomCode: string, storage: HostedRoomStorage | undefined): boolean {
  const trimmed = roomCode.trim();
  if (!storage || !trimmed) return false;
  try {
    storage.setItem(LAST_HOSTED_ROOM_KEY, trimmed);
    return storage.getItem(LAST_HOSTED_ROOM_KEY) === trimmed;
  } catch {
    return false;
  }
}

export function loadLastHostedRoomCode(storage: HostedRoomStorage | undefined): string | null {
  if (!storage) return null;
  try {
    const stored = storage.getItem(LAST_HOSTED_ROOM_KEY)?.trim() ?? '';
    return stored || null;
  } catch {
    return null;
  }
}

/** A fresh-code reset is unsafe unless the crash-recovery room can be cleared durably. */
export function clearLastHostedRoomCode(storage: HostedRoomStorage | undefined): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(LAST_HOSTED_ROOM_KEY);
    return storage.getItem(LAST_HOSTED_ROOM_KEY) === null;
  } catch {
    return false;
  }
}
