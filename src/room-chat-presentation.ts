export const ROOM_CHAT_IDLE_FADE_MS = 10_000;

export type RoomChatPresentation = Readonly<{
  visible: boolean;
  fadeAfterMs: number | null;
}>;

export function roomChatPresentation(
  nowMs: number,
  available: boolean,
  open: boolean,
  lastActivityAtMs: number | null,
  persistentWhenIdle = false,
): RoomChatPresentation {
  if (!available) return { visible: false, fadeAfterMs: null };
  if (open || persistentWhenIdle) return { visible: true, fadeAfterMs: null };
  if (lastActivityAtMs === null) return { visible: false, fadeAfterMs: null };
  const remainingMs = Math.max(0, ROOM_CHAT_IDLE_FADE_MS - Math.max(0, nowMs - lastActivityAtMs));
  return remainingMs > 0
    ? { visible: true, fadeAfterMs: remainingMs }
    : { visible: false, fadeAfterMs: null };
}
