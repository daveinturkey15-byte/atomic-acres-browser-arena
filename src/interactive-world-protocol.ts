import { stableStringify } from './canonical-state';
import type { ShedArenaId } from './destructible-world';
import {
  isInteractiveWorldStateEnvelope,
  type InteractiveWorldStateEnvelope,
} from './interactive-world-runtime';

export const INTERACTIVE_WORLD_SCHEMA_VERSION = 1;
export const MAX_INTERACTIVE_WORLD_MESSAGE_BYTES = 64 * 1024;

export type ShedInteractionIntentMessage = Readonly<{
  type: 'shed-interact-request';
  schemaVersion: typeof INTERACTIVE_WORLD_SCHEMA_VERSION;
  by: string;
  arenaId: ShedArenaId;
  placementId: string;
  matchEpoch: number;
  lifeId: number;
  actionSequence: number;
  nonce: number;
}>;

export type InteractiveWorldSnapshotMessage = Readonly<{
  type: 'interactive-world-snapshot';
  schemaVersion: typeof INTERACTIVE_WORLD_SCHEMA_VERSION;
  by: string;
  envelope: InteractiveWorldStateEnvelope;
  nonce: number;
}>;

export type InteractiveWorldProtocolMessage = ShedInteractionIntentMessage | InteractiveWorldSnapshotMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function canonicalId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function boundedInteger(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

function withinWireBudget(value: unknown): boolean {
  try {
    return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_INTERACTIVE_WORLD_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

export function isShedInteractionIntentMessage(value: unknown): value is ShedInteractionIntentMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'arenaId', 'placementId', 'matchEpoch', 'lifeId', 'actionSequence', 'nonce'])
    || value.type !== 'shed-interact-request'
    || value.schemaVersion !== INTERACTIVE_WORLD_SCHEMA_VERSION
    || !canonicalId(value.by)
    || !['atomic-acres', 'skyline-terminal', 'rustworks-1v1'].includes(String(value.arenaId))
    || !canonicalId(value.placementId)
    || !boundedInteger(value.matchEpoch, 1)
    || !boundedInteger(value.lifeId, 1)
    || !boundedInteger(value.actionSequence, 1)
    || !boundedInteger(value.nonce, 0, 0xffffffff)) return false;
  return withinWireBudget(value);
}

export function isInteractiveWorldSnapshotMessage(value: unknown): value is InteractiveWorldSnapshotMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'envelope', 'nonce'])
    || value.type !== 'interactive-world-snapshot'
    || value.schemaVersion !== INTERACTIVE_WORLD_SCHEMA_VERSION
    || !canonicalId(value.by)
    || !isInteractiveWorldStateEnvelope(value.envelope)
    || !boundedInteger(value.nonce, 0, 0xffffffff)) return false;
  return withinWireBudget(value);
}

export function isInteractiveWorldProtocolMessage(value: unknown): value is InteractiveWorldProtocolMessage {
  return isShedInteractionIntentMessage(value) || isInteractiveWorldSnapshotMessage(value);
}
