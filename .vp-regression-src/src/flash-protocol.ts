import {
  FLASH_AUTHORITY_SCHEMA_VERSION,
  isFlashResult,
  type FlashResult,
} from './flash-authority';

export type FlashResultMessage = Readonly<{
  type: 'flash-result';
  schemaVersion: typeof FLASH_AUTHORITY_SCHEMA_VERSION;
  by: string;
  forPlayerId: string;
  result: FlashResult;
  nonce: number;
}>;

export type FlashProtocolMessage = FlashResultMessage;

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

export function isFlashResultMessage(value: unknown): value is FlashResultMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'forPlayerId', 'result', 'nonce'])
    || value.type !== 'flash-result'
    || value.schemaVersion !== FLASH_AUTHORITY_SCHEMA_VERSION
    || !canonicalActorId(value.by)
    || !canonicalActorId(value.forPlayerId)
    || !isFlashResult(value.result)
    || value.forPlayerId !== value.result.targetId
    || !Number.isSafeInteger(value.nonce) || Number(value.nonce) < 0) return false;
  return true;
}

export function isFlashProtocolMessage(value: unknown): value is FlashProtocolMessage {
  return isFlashResultMessage(value);
}
