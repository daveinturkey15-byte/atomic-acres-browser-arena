import { stableStringify } from './canonical-state';
import { FLAMETHROWER_EFFECT } from './special-weapon-effects';

export const BOT_WEAPON_PRESENTATION_SCHEMA_VERSION = 1 as const;
export const BOT_WEAPON_PRESENTATION_REPLAY_CAPACITY = 128;
export const MAX_BOT_WEAPON_PRESENTATION_MESSAGE_BYTES = 2 * 1024;

type BotWeaponPresentationEnvelope = Readonly<{
  type: 'bot-weapon-presentation';
  schemaVersion: typeof BOT_WEAPON_PRESENTATION_SCHEMA_VERSION;
  by: string;
  matchEpoch: number;
  botId: string;
  actionNonce: number;
  nonce: number;
}>;

/** Presentation-only flame segment. It deliberately carries no target or damage. */
export type BotFlamethrowerStreamPresentationMessage = BotWeaponPresentationEnvelope & Readonly<{
  weapon: 'flamethrower';
  presentation: 'flamethrower-stream';
  origin: readonly [number, number, number];
  end: readonly [number, number, number];
}>;

/** Presentation-only launch cue. The flare replica remains owned by host state. */
export type BotFlareLaunchPresentationMessage = BotWeaponPresentationEnvelope & Readonly<{
  weapon: 'flare-gun';
  presentation: 'signal-flare-launch';
  origin: readonly [number, number, number];
}>;

export type BotWeaponPresentationMessage =
  | BotFlamethrowerStreamPresentationMessage
  | BotFlareLaunchPresentationMessage;

export type BotWeaponPresentationAdmissionReason =
  | 'accepted'
  | 'malformed'
  | 'wrong-host'
  | 'wrong-match-epoch'
  | 'duplicate-action';

export type BotWeaponPresentationAdmission = Readonly<{
  accepted: boolean;
  reason: BotWeaponPresentationAdmissionReason;
  message: BotWeaponPresentationMessage | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function canonicalActorId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
    && /^[a-zA-Z0-9_-]+$/.test(value);
}

function boundedInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isPosition(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every((entry) => Number.isFinite(entry) && Number(entry) >= -4_096 && Number(entry) <= 4_096);
}

function withinWireBudget(value: unknown): boolean {
  try {
    return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_BOT_WEAPON_PRESENTATION_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

function hasValidEnvelope(value: Record<string, unknown>): boolean {
  return value.type === 'bot-weapon-presentation'
    && value.schemaVersion === BOT_WEAPON_PRESENTATION_SCHEMA_VERSION
    && canonicalActorId(value.by)
    && boundedInteger(value.matchEpoch, 1, 999_999_999)
    && typeof value.botId === 'string' && /^host-bot-[0-3]$/.test(value.botId)
    && boundedInteger(value.actionNonce, 0)
    && boundedInteger(value.nonce, 0);
}

export function isBotWeaponPresentationMessage(value: unknown): value is BotWeaponPresentationMessage {
  if (!isRecord(value) || !hasValidEnvelope(value) || !isPosition(value.origin)) return false;
  if (value.presentation === 'flamethrower-stream') {
    if (!exactKeys(value, [
      'type', 'schemaVersion', 'by', 'matchEpoch', 'botId', 'weapon', 'presentation',
      'origin', 'end', 'actionNonce', 'nonce',
    ]) || value.weapon !== 'flamethrower' || !isPosition(value.end)) return false;
    const distance = Math.hypot(
      Number(value.end[0]) - Number(value.origin[0]),
      Number(value.end[1]) - Number(value.origin[1]),
      Number(value.end[2]) - Number(value.origin[2]),
    );
    if (!Number.isFinite(distance) || distance > FLAMETHROWER_EFFECT.rangeM + 0.05) return false;
  } else if (value.presentation === 'signal-flare-launch') {
    if (!exactKeys(value, [
      'type', 'schemaVersion', 'by', 'matchEpoch', 'botId', 'weapon', 'presentation',
      'origin', 'actionNonce', 'nonce',
    ]) || value.weapon !== 'flare-gun') return false;
  } else {
    return false;
  }
  return withinWireBudget(value);
}

export function botWeaponPresentationReplayKey(
  message: Pick<BotWeaponPresentationMessage, 'matchEpoch' | 'botId' | 'actionNonce'>,
): string {
  return `${message.matchEpoch}:${message.botId}:${message.actionNonce}`;
}

/**
 * Bounded action-level replay guard. A retransmit with a fresh envelope nonce
 * still cannot replay the same bot trigger's sound or particles.
 */
export class BotWeaponPresentationReplayGuard {
  private readonly admitted = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly capacity = BOT_WEAPON_PRESENTATION_REPLAY_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Bot presentation replay capacity must be positive');
  }

  admit(
    value: unknown,
    expected: Readonly<{ hostId: string | null; matchEpoch: number }>,
  ): BotWeaponPresentationAdmission {
    if (!isBotWeaponPresentationMessage(value)) return Object.freeze({ accepted: false, reason: 'malformed', message: null });
    if (!expected.hostId || value.by !== expected.hostId) {
      return Object.freeze({ accepted: false, reason: 'wrong-host', message: null });
    }
    if (value.matchEpoch !== expected.matchEpoch) {
      return Object.freeze({ accepted: false, reason: 'wrong-match-epoch', message: null });
    }
    const key = botWeaponPresentationReplayKey(value);
    if (this.admitted.has(key)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-action', message: null });
    }
    this.admitted.add(key);
    this.order.push(key);
    while (this.order.length > this.capacity) {
      this.admitted.delete(this.order.shift()!);
    }
    return Object.freeze({ accepted: true, reason: 'accepted', message: value });
  }

  clear(): void {
    this.admitted.clear();
    this.order.length = 0;
  }

  size(): number {
    return this.admitted.size;
  }
}
