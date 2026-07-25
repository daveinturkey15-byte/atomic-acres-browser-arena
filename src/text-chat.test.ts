import { describe, expect, it } from 'vitest';
import {
  CHAT_HISTORY_LIMIT,
  CHAT_RATE_MAX_MESSAGES,
  CHAT_TEXT_MAX_CHARS,
  admitChatRate,
  appendChatHistory,
  isChatEntry,
  normalizeChatHistory,
  normalizeChatSenderName,
  normalizeChatText,
  type ChatEntry,
} from './text-chat';

function entry(id: number, sentAtHostTimeMs = id): ChatEntry {
  return { id, senderId: 'player-a', senderName: 'PLAYER A', text: `message ${id}`, sentAtHostTimeMs };
}

describe('text chat admission', () => {
  it('normalizes whitespace, control characters, and directional overrides', () => {
    expect(normalizeChatText('  hello\n\tworld\u202eevil  ')).toBe('hello world evil');
    expect(normalizeChatText('\n\t\u202e')).toBeNull();
  });

  it('caps text by Unicode code points instead of UTF-16 code units', () => {
    const normalized = normalizeChatText('\u{1F63A}'.repeat(CHAT_TEXT_MAX_CHARS + 5));
    expect(Array.from(normalized ?? '')).toHaveLength(CHAT_TEXT_MAX_CHARS);
    expect(normalized?.endsWith('\u{1F63A}')).toBe(true);
  });

  it('canonicalizes roster names without accepting blank display identities', () => {
    expect(normalizeChatSenderName('  DAVE\nPLAYER  ')).toBe('DAVE PLAYER');
    expect(normalizeChatSenderName('\u0000')).toBe('PLAYER');
  });

  it('validates authoritative entries', () => {
    expect(isChatEntry(entry(1))).toBe(true);
    expect(isChatEntry({ ...entry(1), text: ' trailing ' })).toBe(false);
    expect(isChatEntry({ ...entry(1), senderName: '\u202eSPOOF' })).toBe(false);
    expect(isChatEntry({ ...entry(1), sentAtHostTimeMs: Number.NaN })).toBe(false);
  });

  it('deduplicates and bounds history in authoritative order', () => {
    let history: ChatEntry[] = [];
    for (let id = 0; id < CHAT_HISTORY_LIMIT + 3; id += 1) history = appendChatHistory(history, entry(id));
    expect(history).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(history[0]?.id).toBe(3);
    expect(appendChatHistory(history, history[0]!)).toEqual(history);

    const normalized = normalizeChatHistory([entry(3, 30), entry(1, 10), entry(1, 10), entry(2, 20)]);
    expect(normalized.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('admits a bounded burst and recovers after the rate window', () => {
    let state: readonly number[] = [];
    for (let index = 0; index < CHAT_RATE_MAX_MESSAGES; index += 1) {
      const result = admitChatRate(state, 1_000 + index);
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(admitChatRate(state, 1_100).accepted).toBe(false);
    expect(admitChatRate(state, 10_000).accepted).toBe(true);
  });
});
