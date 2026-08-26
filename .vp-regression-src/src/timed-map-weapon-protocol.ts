import { stableStringify } from './canonical-state';
import {
  TIMED_MAP_WEAPON_IDS,
  isTimedMapWeaponAuthorityState,
  type TimedMapWeaponAuthorityState,
  type TimedMapWeaponId,
} from './timed-map-weapon-authority';

export const TIMED_MAP_WEAPON_SCHEMA_VERSION = 1 as const;
export const MAX_TIMED_MAP_WEAPON_MESSAGE_BYTES = 16 * 1024;

export type TimedMapWeaponClaimRequestMessage = Readonly<{
  type: 'timed-map-weapon-claim-request';
  schemaVersion: typeof TIMED_MAP_WEAPON_SCHEMA_VERSION;
  by: string;
  weaponId: TimedMapWeaponId;
  generation: number;
  position: readonly [number, number, number];
  nonce: number;
}>;

export type TimedMapWeaponStateMessage = Readonly<{
  type: 'timed-map-weapon-state';
  schemaVersion: typeof TIMED_MAP_WEAPON_SCHEMA_VERSION;
  by: string;
  states: Readonly<Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>>;
  nonce: number;
}>;

export type TimedMapWeaponProtocolMessage = TimedMapWeaponClaimRequestMessage | TimedMapWeaponStateMessage;

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

function boundedInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isPosition(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => (
    Number.isFinite(entry) && Number(entry) >= -4_096 && Number(entry) <= 4_096
  ));
}

function withinWireBudget(value: unknown): boolean {
  try {
    return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_TIMED_MAP_WEAPON_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

export function isTimedMapWeaponClaimRequestMessage(value: unknown): value is TimedMapWeaponClaimRequestMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'weaponId', 'generation', 'position', 'nonce'])
    || value.type !== 'timed-map-weapon-claim-request'
    || value.schemaVersion !== TIMED_MAP_WEAPON_SCHEMA_VERSION
    || !canonicalActorId(value.by)
    || !TIMED_MAP_WEAPON_IDS.includes(value.weaponId as TimedMapWeaponId)
    || !boundedInteger(value.generation, 0, 1_000_000_000)
    || !isPosition(value.position)
    || !boundedInteger(value.nonce, 0)) return false;
  return withinWireBudget(value);
}

export function isTimedMapWeaponStateMessage(value: unknown): value is TimedMapWeaponStateMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'states', 'nonce'])
    || value.type !== 'timed-map-weapon-state'
    || value.schemaVersion !== TIMED_MAP_WEAPON_SCHEMA_VERSION
    || !canonicalActorId(value.by)
    || !isRecord(value.states)
    || !boundedInteger(value.nonce, 0)) return false;
  const states = value.states;
  if (!exactKeys(states, TIMED_MAP_WEAPON_IDS)
    || !TIMED_MAP_WEAPON_IDS.every((weaponId) => {
      const state = states[weaponId];
      return isTimedMapWeaponAuthorityState(state) && state.weaponId === weaponId;
    })) return false;
  return withinWireBudget(value);
}

export function isTimedMapWeaponProtocolMessage(value: unknown): value is TimedMapWeaponProtocolMessage {
  return isTimedMapWeaponClaimRequestMessage(value) || isTimedMapWeaponStateMessage(value);
}
