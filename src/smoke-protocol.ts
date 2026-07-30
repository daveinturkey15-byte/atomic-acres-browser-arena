import { stableStringify } from './canonical-state';
import {
  MAX_ACTIVE_SMOKE_VOLUMES,
  MAX_SMOKE_CORRIDORS_PER_VOLUME,
  MAX_SMOKE_SHOT_SEGMENT_METERS,
  SMOKE_AUTHORITY_SCHEMA_VERSION,
  SMOKE_CORRIDOR_LIFETIME_MS,
  SMOKE_COLOUR_PALETTE,
  SMOKE_VOLUME_MIN_LIFETIME_MS,
  SMOKE_VOLUME_LIFETIME_MS,
  type SmokeAuthoritySnapshot,
  type SmokeCorridorSnapshot,
  type SmokeVolumeSnapshot,
} from './smoke-authority';

export const MAX_SMOKE_STATE_MESSAGE_BYTES = 48 * 1024;

export type SmokeStateMessage = Readonly<{
  type: 'smoke-state';
  schemaVersion: typeof SMOKE_AUTHORITY_SCHEMA_VERSION;
  by: string;
  snapshot: SmokeAuthoritySnapshot;
  nonce: number;
}>;

export type SmokeProtocolMessage = SmokeStateMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function boundedInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function canonicalActorId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80 && /^[a-zA-Z0-9_-]+$/.test(value);
}

function canonicalEntityId(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= maximumLength
    && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}

function isVec3(value: unknown): value is Readonly<{ x: number; y: number; z: number }> {
  if (!isRecord(value) || !exactKeys(value, ['x', 'y', 'z'])) return false;
  return finiteNumber(value.x, -4_096, 4_096)
    && finiteNumber(value.y, -4_096, 4_096)
    && finiteNumber(value.z, -4_096, 4_096);
}

function segmentLengthMeters(corridor: SmokeCorridorSnapshot): number {
  return Math.hypot(
    corridor.end.x - corridor.start.x,
    corridor.end.y - corridor.start.y,
    corridor.end.z - corridor.start.z,
  );
}

function isCorridor(value: unknown, volume: SmokeVolumeSnapshot): value is SmokeCorridorSnapshot {
  if (!isRecord(value)
    || !exactKeys(value, [
      'id', 'shotResultId', 'pelletIndex', 'start', 'end', 'radiusM', 'createdAtHostTimeMs', 'expiresAtMs',
    ])
    || !canonicalEntityId(value.id, 256)
    || !String(value.id).startsWith(`${volume.id}:corridor:`)
    || !canonicalEntityId(value.shotResultId, 128)
    || !boundedInteger(value.pelletIndex, 0, 11)
    || !isVec3(value.start) || !isVec3(value.end)
    || !finiteNumber(value.radiusM, 0.1, 1)
    || !finiteNumber(value.createdAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER)
    || !finiteNumber(value.expiresAtMs, 0, Number.MAX_SAFE_INTEGER)
    || Number(value.expiresAtMs) <= Number(value.createdAtHostTimeMs)
    || Number(value.expiresAtMs) - Number(value.createdAtHostTimeMs) > SMOKE_CORRIDOR_LIFETIME_MS
    || segmentLengthMeters(value as unknown as SmokeCorridorSnapshot) <= 0
    || segmentLengthMeters(value as unknown as SmokeCorridorSnapshot) > MAX_SMOKE_SHOT_SEGMENT_METERS) return false;
  return true;
}

function isVolume(value: unknown): value is SmokeVolumeSnapshot {
  if (!isRecord(value)
    || !exactKeys(value, [
      'id', 'ownerId', 'actionNonce', 'colourHex', 'centre', 'radiusM', 'startsAtMs', 'expiresAtMs', 'corridors',
    ])
    || !canonicalEntityId(value.id, 128)
    || !canonicalActorId(value.ownerId)
    || value.id !== `smoke-${value.ownerId}-${value.actionNonce}`
    || !boundedInteger(value.actionNonce, 0, 0xffffffff)
    || !boundedInteger(value.colourHex, 0, 0xffffff)
    || !SMOKE_COLOUR_PALETTE.includes(value.colourHex as typeof SMOKE_COLOUR_PALETTE[number])
    || !isVec3(value.centre)
    || !finiteNumber(value.radiusM, 0.25, 8)
    || !finiteNumber(value.startsAtMs, 0, Number.MAX_SAFE_INTEGER)
    || !finiteNumber(value.expiresAtMs, 0, Number.MAX_SAFE_INTEGER)
    || Number(value.expiresAtMs) <= Number(value.startsAtMs)
    || Number(value.expiresAtMs) - Number(value.startsAtMs) < SMOKE_VOLUME_MIN_LIFETIME_MS
    || Number(value.expiresAtMs) - Number(value.startsAtMs) > SMOKE_VOLUME_LIFETIME_MS
    || !Array.isArray(value.corridors) || value.corridors.length > MAX_SMOKE_CORRIDORS_PER_VOLUME) return false;
  const candidate = value as unknown as SmokeVolumeSnapshot;
  return candidate.corridors.every((corridor) => isCorridor(corridor, candidate))
    && new Set(candidate.corridors.map((corridor) => corridor.id)).size === candidate.corridors.length;
}

export function isSmokeAuthoritySnapshot(value: unknown): value is SmokeAuthoritySnapshot {
  if (!isRecord(value)
    || !exactKeys(value, ['schemaVersion', 'matchEpoch', 'revision', 'hostTimeMs', 'volumes'])
    || value.schemaVersion !== SMOKE_AUTHORITY_SCHEMA_VERSION
    || !boundedInteger(value.matchEpoch, 1, 1_000_000_000)
    || !boundedInteger(value.revision, 0, 1_000_000_000)
    || !finiteNumber(value.hostTimeMs, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.volumes) || value.volumes.length > MAX_ACTIVE_SMOKE_VOLUMES
    || !value.volumes.every(isVolume)) return false;
  const hostTimeMs = Number(value.hostTimeMs);
  const volumes = value.volumes as SmokeVolumeSnapshot[];
  return new Set(volumes.map((volume) => volume.id)).size === volumes.length
    && volumes.every((volume) => volume.startsAtMs <= hostTimeMs && hostTimeMs < volume.expiresAtMs
      && volume.corridors.every((corridor) => (
        corridor.createdAtHostTimeMs <= hostTimeMs && hostTimeMs < corridor.expiresAtMs
      )));
}

function withinWireBudget(value: unknown): boolean {
  try {
    return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_SMOKE_STATE_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

export function isSmokeStateMessage(value: unknown): value is SmokeStateMessage {
  if (!isRecord(value)
    || !exactKeys(value, ['type', 'schemaVersion', 'by', 'snapshot', 'nonce'])
    || value.type !== 'smoke-state'
    || value.schemaVersion !== SMOKE_AUTHORITY_SCHEMA_VERSION
    || !canonicalActorId(value.by)
    || !isSmokeAuthoritySnapshot(value.snapshot)
    || !boundedInteger(value.nonce, 0, 0xffffffff)) return false;
  return withinWireBudget(value);
}

export function isSmokeProtocolMessage(value: unknown): value is SmokeProtocolMessage {
  return isSmokeStateMessage(value);
}
