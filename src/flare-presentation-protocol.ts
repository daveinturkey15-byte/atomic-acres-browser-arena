import { stableStringify } from './canonical-state';
import { FLARE_PROJECTILE_EFFECT } from './special-weapon-effects';

export const FLARE_PRESENTATION_SCHEMA_VERSION = 1 as const;
export const MAX_FLARE_PRESENTATION_REPLICAS = FLARE_PROJECTILE_EFFECT.poolCapacity;
export const MAX_FLARE_PRESENTATION_MESSAGE_BYTES = 8 * 1024;

export type FlarePresentationPhase = 'flight' | 'burn';

/**
 * Host-authored presentation state only. Damage, targets and the authority bit
 * are deliberately absent so a decoded replica can never grant gameplay
 * authority to a guest.
 */
export type FlarePresentationReplicaSnapshot = Readonly<{
  ownerId: string;
  ownerTeam: 0 | 1;
  actionNonce: number;
  phase: FlarePresentationPhase;
  position: readonly [number, number, number];
  velocity: readonly [number, number, number] | null;
  remainingMs: number;
}>;

export type FlarePresentationStateMessage = Readonly<{
  type: 'flare-presentation-state';
  schemaVersion: typeof FLARE_PRESENTATION_SCHEMA_VERSION;
  by: string;
  matchEpoch: number;
  weaponGeneration: number;
  snapshotSeq: number;
  sampledAtHostTimeMs: number;
  flares: readonly FlarePresentationReplicaSnapshot[];
  nonce: number;
}>;

export type FlarePresentationProtocolMessage = FlarePresentationStateMessage;

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

function boundedFinite(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isPosition(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every((entry) => boundedFinite(entry, -4_096, 4_096));
}

function isFlightVelocity(value: unknown): value is readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3
    || !value.every((entry) => boundedFinite(entry, -96, 96))) return false;
  const speed = Math.hypot(Number(value[0]), Number(value[1]), Number(value[2]));
  return speed > 0.01 && speed <= 96;
}

export function flarePresentationReplicaKey(
  value: Pick<FlarePresentationReplicaSnapshot, 'ownerId' | 'actionNonce'>,
): string {
  return `${value.ownerId}:${value.actionNonce}`;
}

export function compareFlarePresentationReplicaIdentity(
  left: Pick<FlarePresentationReplicaSnapshot, 'ownerId' | 'actionNonce'>,
  right: Pick<FlarePresentationReplicaSnapshot, 'ownerId' | 'actionNonce'>,
): number {
  if (left.ownerId < right.ownerId) return -1;
  if (left.ownerId > right.ownerId) return 1;
  return left.actionNonce - right.actionNonce;
}

export function isFlarePresentationReplicaSnapshot(value: unknown): value is FlarePresentationReplicaSnapshot {
  if (!isRecord(value)
    || !exactKeys(value, [
      'ownerId', 'ownerTeam', 'actionNonce', 'phase', 'position', 'velocity', 'remainingMs',
    ])
    || !canonicalActorId(value.ownerId)
    || value.ownerTeam !== 0 && value.ownerTeam !== 1
    || !boundedInteger(value.actionNonce, 0)
    || value.phase !== 'flight' && value.phase !== 'burn'
    || !isPosition(value.position)) return false;
  if (value.phase === 'flight') {
    return isFlightVelocity(value.velocity)
      && boundedFinite(value.remainingMs, Number.MIN_VALUE, FLARE_PROJECTILE_EFFECT.maximumFlightMs);
  }
  return value.velocity === null
    && boundedFinite(value.remainingMs, Number.MIN_VALUE, FLARE_PROJECTILE_EFFECT.burnDurationMs);
}

export function canonicalizeFlarePresentationReplicas(
  values: readonly FlarePresentationReplicaSnapshot[],
): readonly FlarePresentationReplicaSnapshot[] | null {
  if (!Array.isArray(values) || values.length > MAX_FLARE_PRESENTATION_REPLICAS
    || !values.every(isFlarePresentationReplicaSnapshot)) return null;
  const keys = new Set(values.map(flarePresentationReplicaKey));
  if (keys.size !== values.length) return null;
  return Object.freeze(values.map((value) => Object.freeze({
    ...value,
    position: Object.freeze([...value.position] as [number, number, number]),
    velocity: value.velocity
      ? Object.freeze([...value.velocity] as [number, number, number])
      : null,
  })).sort(compareFlarePresentationReplicaIdentity));
}

function isCanonicalReplicaSequence(values: readonly FlarePresentationReplicaSnapshot[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (compareFlarePresentationReplicaIdentity(values[index - 1]!, values[index]!) >= 0) return false;
  }
  return true;
}

function withinWireBudget(value: unknown): boolean {
  try {
    return new TextEncoder().encode(stableStringify(value)).byteLength <= MAX_FLARE_PRESENTATION_MESSAGE_BYTES;
  } catch {
    return false;
  }
}

export function isFlarePresentationStateMessage(value: unknown): value is FlarePresentationStateMessage {
  if (!isRecord(value)
    || !exactKeys(value, [
      'type', 'schemaVersion', 'by', 'matchEpoch', 'weaponGeneration', 'snapshotSeq',
      'sampledAtHostTimeMs', 'flares', 'nonce',
    ])
    || value.type !== 'flare-presentation-state'
    || value.schemaVersion !== FLARE_PRESENTATION_SCHEMA_VERSION
    || !canonicalActorId(value.by)
    || !boundedInteger(value.matchEpoch, 1, 999_999_999)
    || !boundedInteger(value.weaponGeneration, 0, 1_000_000_000)
    || !boundedInteger(value.snapshotSeq, 0)
    || !boundedFinite(value.sampledAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.flares)
    || value.flares.length > MAX_FLARE_PRESENTATION_REPLICAS
    || !value.flares.every(isFlarePresentationReplicaSnapshot)
    || !isCanonicalReplicaSequence(value.flares)
    || !boundedInteger(value.nonce, 0)) return false;
  return withinWireBudget(value);
}

export function isFlarePresentationProtocolMessage(value: unknown): value is FlarePresentationProtocolMessage {
  return isFlarePresentationStateMessage(value);
}
