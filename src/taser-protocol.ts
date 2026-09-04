import {
  TASER_AUTHORITY_SCHEMA_VERSION,
  isTaserStunResult,
  type TaserStunResult,
} from './taser-stun';

/**
 * HF-458: the taser's single wire message, byte-shaped like `flash-result`.
 * The host authors it, `isHostAuthorityMessage` in `src/protocol.ts` drops it
 * on a guest connection, and the victim client replays it through
 * `TaserVictimResultConsumer`.
 */
export type TaserStunMessage = Readonly<{
  type: 'taser-stun';
  schemaVersion: typeof TASER_AUTHORITY_SCHEMA_VERSION;
  by: string;
  forPlayerId: string;
  result: TaserStunResult;
  nonce: number;
}>;

export type TaserProtocolMessage = TaserStunMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function canonicalActorId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
    && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function isTaserStunMessage(value: unknown): value is TaserStunMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'forPlayerId', 'result', 'nonce'])
    || value.type !== 'taser-stun'
    || value.schemaVersion !== TASER_AUTHORITY_SCHEMA_VERSION
    || !canonicalActorId(value.by)
    || !canonicalActorId(value.forPlayerId)
    || !isTaserStunResult(value.result)
    || value.forPlayerId !== value.result.targetId
    || !Number.isSafeInteger(value.nonce) || Number(value.nonce) < 0) return false;
  return true;
}

export function isTaserProtocolMessage(value: unknown): value is TaserProtocolMessage {
  return isTaserStunMessage(value);
}
