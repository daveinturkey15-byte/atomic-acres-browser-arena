import {
  MAX_FLARE_PRESENTATION_REPLICAS,
  compareFlarePresentationReplicaIdentity,
  flarePresentationReplicaKey,
  isFlarePresentationReplicaSnapshot,
  type FlarePresentationReplicaSnapshot,
} from './flare-presentation-protocol';
import {
  FLARE_PROJECTILE_EFFECT,
  advanceFlareProjectileKinematics,
} from './special-weapon-effects';

export const FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION = 1 as const;
export const FLARE_BURN_PULSE_INTERVAL_MS = 500;
export const FLARE_BURN_PULSE_COUNT = FLARE_PROJECTILE_EFFECT.burnDurationMs / FLARE_BURN_PULSE_INTERVAL_MS;
export const MAX_FLARE_SHOOTER_FEEDBACK_CONTEXTS = MAX_FLARE_PRESENTATION_REPLICAS;
export const FLARE_SHOOTER_FEEDBACK_MAX_REMAINING_MS = FLARE_PROJECTILE_EFFECT.maximumFlightMs
  + FLARE_PROJECTILE_EFFECT.burnDurationMs + 1_000;

export type FlareAuthorityContinuationEntity = FlarePresentationReplicaSnapshot & Readonly<{
  nextBurnPulseRemainingMs: number | null;
  burnPulseIndex: number;
}>;

export type FlareAuthorityContinuationCheckpoint = Readonly<{
  schemaVersion: typeof FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION;
  snapshotSeq: number;
  effects: readonly FlareAuthorityContinuationEntity[];
}>;

export type AdvancedFlareAuthorityCheckpoint = Readonly<{
  checkpoint: FlareAuthorityContinuationCheckpoint;
  skippedExpired: number;
  skippedBurnPulses: number;
}>;

/** Whitelisted subset needed to finish a recovered guest-owned flare result. */
export type FlareShooterFeedbackCheckpoint = Readonly<{
  ownerId: string;
  actionNonce: number;
  shotId: string;
  connectionEpoch: string;
  lifeId: number;
  shotSeq: number;
  weaponSequence: number;
  fireTimeMs: number;
  triggerStartedAtMs: number;
  targetViewTimeMs: number;
  origin: readonly [number, number, number];
  direction: readonly [number, number, number];
  pelletDirections: readonly [readonly [number, number, number]];
  receivedAtHostTimeMs: number;
  appliedRewindMs: number;
  remainingMs: number;
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

function boundedInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function boundedFinite(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function canonicalActorId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
    && /^[a-zA-Z0-9_-]+$/.test(value);
}

function isPosition(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3
    && value.every((entry) => boundedFinite(entry, -4_096, 4_096));
}

function isNormalizedDirection(value: unknown): value is readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return false;
  const magnitude = Math.hypot(Number(value[0]), Number(value[1]), Number(value[2]));
  return magnitude >= 0.999 && magnitude <= 1.001;
}

export function isFlareAuthorityContinuationEntity(value: unknown): value is FlareAuthorityContinuationEntity {
  if (!isRecord(value)
    || !exactKeys(value, [
      'ownerId', 'ownerTeam', 'actionNonce', 'phase', 'position', 'velocity', 'remainingMs',
      'nextBurnPulseRemainingMs', 'burnPulseIndex',
    ])) return false;
  const replica = {
    ownerId: value.ownerId,
    ownerTeam: value.ownerTeam,
    actionNonce: value.actionNonce,
    phase: value.phase,
    position: value.position,
    velocity: value.velocity,
    remainingMs: value.remainingMs,
  };
  if (!isFlarePresentationReplicaSnapshot(replica)
    || !boundedInteger(value.burnPulseIndex, 0, FLARE_BURN_PULSE_COUNT)) return false;
  if (replica.phase === 'flight') {
    return value.nextBurnPulseRemainingMs === null && value.burnPulseIndex === 0;
  }
  if (value.burnPulseIndex === FLARE_BURN_PULSE_COUNT) return value.nextBurnPulseRemainingMs === null;
  return Number.isFinite(value.nextBurnPulseRemainingMs)
    && Number(value.nextBurnPulseRemainingMs) >= 0
    && Number(value.nextBurnPulseRemainingMs) <= FLARE_BURN_PULSE_INTERVAL_MS
    && Number(value.nextBurnPulseRemainingMs) <= replica.remainingMs;
}

export function isFlareAuthorityContinuationCheckpoint(value: unknown): value is FlareAuthorityContinuationCheckpoint {
  if (!isRecord(value)
    || !exactKeys(value, ['schemaVersion', 'snapshotSeq', 'effects'])
    || value.schemaVersion !== FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION
    || !boundedInteger(value.snapshotSeq, 0)
    || !Array.isArray(value.effects)
    || value.effects.length > MAX_FLARE_PRESENTATION_REPLICAS
    || !value.effects.every(isFlareAuthorityContinuationEntity)) return false;
  for (let index = 1; index < value.effects.length; index += 1) {
    if (compareFlarePresentationReplicaIdentity(value.effects[index - 1]!, value.effects[index]!) >= 0) return false;
  }
  return true;
}

export function isFlareShooterFeedbackCheckpoint(value: unknown): value is FlareShooterFeedbackCheckpoint {
  if (!isRecord(value)
    || !exactKeys(value, [
      'ownerId', 'actionNonce', 'shotId', 'connectionEpoch', 'lifeId', 'shotSeq', 'weaponSequence',
      'fireTimeMs', 'triggerStartedAtMs', 'targetViewTimeMs', 'origin', 'direction', 'pelletDirections',
      'receivedAtHostTimeMs', 'appliedRewindMs', 'remainingMs',
    ])
    || !canonicalActorId(value.ownerId)
    || !boundedInteger(value.actionNonce, 0)
    || typeof value.shotId !== 'string' || value.shotId.length < 8 || value.shotId.length > 128
    || !/^[a-zA-Z0-9:_-]+$/.test(value.shotId)
    || typeof value.connectionEpoch !== 'string' || value.connectionEpoch.length < 8 || value.connectionEpoch.length > 128
    || !/^[a-zA-Z0-9_-]+$/.test(value.connectionEpoch)
    || !boundedInteger(value.lifeId, 0, 1_000_000_000)
    || !boundedInteger(value.shotSeq, 0, 1_000_000_000)
    || !boundedInteger(value.weaponSequence, 0, 1_000_000_000)
    || !boundedFinite(value.fireTimeMs, 0, Number.MAX_SAFE_INTEGER)
    || !boundedFinite(value.triggerStartedAtMs, 0, Number.MAX_SAFE_INTEGER)
    || Number(value.triggerStartedAtMs) > Number(value.fireTimeMs)
    || Number(value.fireTimeMs) - Number(value.triggerStartedAtMs) > 10_000
    || !boundedFinite(value.targetViewTimeMs, 0, Number.MAX_SAFE_INTEGER)
    || Number(value.targetViewTimeMs) > Number(value.fireTimeMs)
    || !isPosition(value.origin)
    || !isNormalizedDirection(value.direction)
    || !Array.isArray(value.pelletDirections) || value.pelletDirections.length !== 1
    || !isNormalizedDirection(value.pelletDirections[0])
    || !boundedFinite(value.receivedAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER)
    || !boundedFinite(value.appliedRewindMs, 0, 1_000)
    || !boundedFinite(value.remainingMs, Number.MIN_VALUE, FLARE_SHOOTER_FEEDBACK_MAX_REMAINING_MS)) return false;
  const direction = value.direction as readonly [number, number, number];
  const pelletDirection = value.pelletDirections[0] as readonly [number, number, number];
  return direction.every((entry, index) => Math.abs(entry - pelletDirection[index]!) <= 1e-6);
}

export function isFlareShooterFeedbackCheckpoints(
  value: unknown,
  authority: FlareAuthorityContinuationCheckpoint,
): value is readonly FlareShooterFeedbackCheckpoint[] {
  if (!isFlareAuthorityContinuationCheckpoint(authority)
    || !Array.isArray(value) || value.length > MAX_FLARE_SHOOTER_FEEDBACK_CONTEXTS
    || !value.every(isFlareShooterFeedbackCheckpoint)) return false;
  const authorityKeys = new Set(authority.effects.map(flarePresentationReplicaKey));
  for (let index = 0; index < value.length; index += 1) {
    const context = value[index]!;
    if (!authorityKeys.has(flarePresentationReplicaKey(context))) return false;
    if (index > 0 && compareFlarePresentationReplicaIdentity(value[index - 1]!, context) >= 0) return false;
  }
  return true;
}

export function advanceFlareShooterFeedbackThroughDowntime(
  value: readonly FlareShooterFeedbackCheckpoint[],
  authority: FlareAuthorityContinuationCheckpoint,
  downtimeMs: number,
): readonly FlareShooterFeedbackCheckpoint[] | null {
  if (!isFlareAuthorityContinuationCheckpoint(authority)
    || !Array.isArray(value) || value.length > MAX_FLARE_SHOOTER_FEEDBACK_CONTEXTS
    || !value.every(isFlareShooterFeedbackCheckpoint)
    || !Number.isFinite(downtimeMs) || downtimeMs < 0) return null;
  for (let index = 1; index < value.length; index += 1) {
    if (compareFlarePresentationReplicaIdentity(value[index - 1]!, value[index]!) >= 0) return null;
  }
  const activeKeys = new Set(authority.effects.map(flarePresentationReplicaKey));
  return Object.freeze(value
    .filter((context) => context.remainingMs > downtimeMs && activeKeys.has(flarePresentationReplicaKey(context)))
    .map((context) => Object.freeze({ ...context, remainingMs: context.remainingMs - downtimeMs })));
}

function advanceFlight(
  effect: FlareAuthorityContinuationEntity,
  elapsedMs: number,
): Pick<FlarePresentationReplicaSnapshot, 'position' | 'velocity'> | null {
  let state = {
    position: effect.position,
    velocity: effect.velocity!,
    ageMs: 0,
  };
  let remainingMs = elapsedMs;
  while (remainingMs > 0) {
    const stepMs = Math.min(50, remainingMs);
    state = advanceFlareProjectileKinematics(state, stepMs / 1_000);
    remainingMs -= stepMs;
  }
  const candidate = {
    ownerId: effect.ownerId,
    ownerTeam: effect.ownerTeam,
    actionNonce: effect.actionNonce,
    phase: effect.phase,
    position: state.position,
    velocity: state.velocity,
    remainingMs: Math.max(Number.MIN_VALUE, effect.remainingMs - elapsedMs),
  };
  if (!isFlarePresentationReplicaSnapshot(candidate)) return null;
  return Object.freeze({ position: state.position, velocity: state.velocity });
}

/**
 * Advances a saved authority snapshot through host downtime without executing
 * collision or damage callbacks. Expired effects and elapsed burn pulses are
 * discarded rather than replayed against newly rejoined players.
 */
export function advanceFlareAuthorityCheckpointThroughDowntime(
  value: FlareAuthorityContinuationCheckpoint,
  downtimeMs: number,
): AdvancedFlareAuthorityCheckpoint | null {
  if (!isFlareAuthorityContinuationCheckpoint(value)
    || !Number.isFinite(downtimeMs) || downtimeMs < 0) return null;
  const restored: FlareAuthorityContinuationEntity[] = [];
  let skippedExpired = 0;
  let skippedBurnPulses = 0;
  for (const effect of value.effects) {
    const elapsedWithinEffectMs = Math.min(downtimeMs, effect.remainingMs);
    let burnPulseIndex = effect.burnPulseIndex;
    let nextBurnPulseRemainingMs = effect.nextBurnPulseRemainingMs;
    if (effect.phase === 'burn' && elapsedWithinEffectMs > 0 && nextBurnPulseRemainingMs !== null
      && elapsedWithinEffectMs >= nextBurnPulseRemainingMs) {
      const skipped = Math.min(
        FLARE_BURN_PULSE_COUNT - burnPulseIndex,
        1 + Math.floor((elapsedWithinEffectMs - nextBurnPulseRemainingMs) / FLARE_BURN_PULSE_INTERVAL_MS),
      );
      burnPulseIndex += skipped;
      skippedBurnPulses += skipped;
      nextBurnPulseRemainingMs = burnPulseIndex >= FLARE_BURN_PULSE_COUNT
        ? null
        : nextBurnPulseRemainingMs + skipped * FLARE_BURN_PULSE_INTERVAL_MS - elapsedWithinEffectMs;
    } else if (effect.phase === 'burn' && nextBurnPulseRemainingMs !== null) {
      nextBurnPulseRemainingMs -= elapsedWithinEffectMs;
    }
    const remainingMs = effect.remainingMs - downtimeMs;
    if (remainingMs <= 0) {
      skippedExpired += 1;
      continue;
    }
    let position = effect.position;
    let velocity = effect.velocity;
    if (effect.phase === 'flight') {
      const advanced = advanceFlight(effect, downtimeMs);
      if (!advanced) {
        skippedExpired += 1;
        continue;
      }
      position = advanced.position;
      velocity = advanced.velocity;
    }
    restored.push(Object.freeze({
      ...effect,
      position: Object.freeze([...position] as [number, number, number]),
      velocity: velocity ? Object.freeze([...velocity] as [number, number, number]) : null,
      remainingMs,
      nextBurnPulseRemainingMs,
      burnPulseIndex,
    }));
  }
  const effects = Object.freeze([...restored].sort(compareFlarePresentationReplicaIdentity));
  const checkpoint = Object.freeze({
    schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
    snapshotSeq: value.snapshotSeq,
    effects,
  });
  return isFlareAuthorityContinuationCheckpoint(checkpoint)
    ? Object.freeze({ checkpoint, skippedExpired, skippedBurnPulses })
    : null;
}
