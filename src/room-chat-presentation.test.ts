import { describe, expect, it } from 'vitest';
import { ROOM_CHAT_IDLE_FADE_MS, roomChatPresentation } from './room-chat-presentation';

describe('room chat presentation', () => {
  it('stays visible while open regardless of idle age', () => {
    expect(roomChatPresentation(ROOM_CHAT_IDLE_FADE_MS * 2, true, true, 0)).toEqual({
      visible: true,
      fadeAfterMs: null,
    });
  });

  it('fades exactly ten seconds after the latest activity', () => {
    expect(roomChatPresentation(9_999, true, false, 0)).toEqual({ visible: true, fadeAfterMs: 1 });
    expect(roomChatPresentation(10_000, true, false, 0)).toEqual({ visible: false, fadeAfterMs: null });
  });

  it('does not show without room availability or a recorded activity', () => {
    expect(roomChatPresentation(0, false, true, 0)).toEqual({ visible: false, fadeAfterMs: null });
    expect(roomChatPresentation(0, true, false, null)).toEqual({ visible: false, fadeAfterMs: null });
  });

  it('keeps the lobby affordance visible while still respecting availability', () => {
    expect(roomChatPresentation(60_000, true, false, null, true)).toEqual({
      visible: true,
      fadeAfterMs: null,
    });
    expect(roomChatPresentation(60_000, false, false, 0, true)).toEqual({
      visible: false,
      fadeAfterMs: null,
    });
  });
});
