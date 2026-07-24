export const CHAT_TEXT_MAX_CHARS = 240;
export const CHAT_SENDER_NAME_MAX_CHARS = 16;
export const CHAT_HISTORY_LIMIT = 32;
export const CHAT_RATE_WINDOW_MS = 4_000;
export const CHAT_RATE_MAX_MESSAGES = 4;

export type ChatEntry = Readonly<{
  id: number;
  senderId: string;
  senderName: string;
  text: string;
  sentAtHostTimeMs: number;
}>;

export type ChatRateState = readonly number[];

const CONTROL_AND_DIRECTIONAL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

function truncateCodePoints(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('');
}

export function normalizeChatText(value: string): string | null {
  const normalized = truncateCodePoints(
    value
      .normalize('NFKC')
      .replace(CONTROL_AND_DIRECTIONAL_CHARACTERS, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
    CHAT_TEXT_MAX_CHARS,
  );
  return normalized || null;
}

export function isCanonicalChatText(value: unknown): value is string {
  return typeof value === 'string' && normalizeChatText(value) === value;
}

export function normalizeChatSenderName(value: string): string {
  const normalized = truncateCodePoints(
    value
      .normalize('NFKC')
      .replace(CONTROL_AND_DIRECTIONAL_CHARACTERS, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
    CHAT_SENDER_NAME_MAX_CHARS,
  );
  return normalized || 'PLAYER';
}

export function isChatEntry(value: unknown): value is ChatEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return Number.isSafeInteger(entry.id) && Number(entry.id) >= 0
    && typeof entry.senderId === 'string' && entry.senderId.length > 0 && entry.senderId.length <= 80
    && typeof entry.senderName === 'string' && normalizeChatSenderName(entry.senderName) === entry.senderName
    && isCanonicalChatText(entry.text)
    && Number.isFinite(entry.sentAtHostTimeMs) && Number(entry.sentAtHostTimeMs) >= 0;
}

export function appendChatHistory(history: readonly ChatEntry[], entry: ChatEntry): ChatEntry[] {
  if (history.some((candidate) => candidate.id === entry.id)) return [...history];
  return [...history, entry].slice(-CHAT_HISTORY_LIMIT);
}

export function normalizeChatHistory(value: readonly ChatEntry[]): ChatEntry[] {
  const unique = new Map<number, ChatEntry>();
  for (const entry of value) {
    if (isChatEntry(entry)) unique.set(entry.id, entry);
  }
  return [...unique.values()]
    .sort((a, b) => a.sentAtHostTimeMs - b.sentAtHostTimeMs || a.id - b.id)
    .slice(-CHAT_HISTORY_LIMIT);
}

export function admitChatRate(state: ChatRateState, nowMs: number): Readonly<{
  accepted: boolean;
  state: ChatRateState;
}> {
  const recent = state.filter((sentAt) => Number.isFinite(sentAt) && sentAt > nowMs - CHAT_RATE_WINDOW_MS && sentAt <= nowMs);
  if (recent.length >= CHAT_RATE_MAX_MESSAGES) return { accepted: false, state: recent };
  return { accepted: true, state: [...recent, nowMs] };
}
