import { PASS65_KILLSTREAK_CATALOG, validateKillstreakLoadout, type KillstreakLoadoutV1, type Pass65KillstreakId } from './killstreak-catalog';
import type { CombatTiming } from './network-fairness';
import { PILOTED_DRONE_TASER_CHARGES } from './killstreak-tuning';
import type {
  CareCaptureAdmissionReason,
  DroneSensorContact,
  KillstreakActivationIntent,
  KillstreakControlIntent,
  KillstreakDamageEvent,
  KillstreakImpactEvent,
  KillstreakPlacementMarkerSnapshot,
  KillstreakRecipientSnapshot,
  KillstreakSupportShotEvent,
} from './killstreak-runtime';
import {
  CARE_TARGET_MARKER_MAX_LIFETIME_MS,
  CARPET_BOMBER_IMPACT_COUNT,
  CARPET_TARGET_MARKER_MAX_LIFETIME_MS,
  CHOPPER_MISSILE_CAPACITY,
  CHOPPER_MISSILE_CADENCE_MS,
  CHOPPER_MISSILE_FLIGHT_MS,
  MAX_RETAINED_CARE_REWARDS,
  MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD,
  MAX_REPLICATED_KILLSTREAK_STREAK,
  MAX_SUPPORT_IMPACT_EVENTS_PER_STEP,
  MAX_SUPPORT_SHOT_EVENTS_PER_STEP,
  SUPPORT_TARGET_CORRIDOR_MAX_HALF_WIDTH_M,
  SUPPORT_TARGET_CORRIDOR_MAX_LENGTH_M,
} from './killstreak-runtime';
import { DRONE_SUPPORT_DEFINITIONS } from './killstreak-support-catalog';
import {
  CARPET_GROUND_FIRE_AUTHORITY_CAPACITY,
  CARPET_GROUND_FIRE_STATE_CHUNK_SIZE,
  CARPET_GROUND_FIRE_STATE_MAX_CHUNKS,
} from './carpet-ground-fire-multiplayer';
import type { CarpetGroundFirePresentationSnapshot } from './flamethrower-stream-system';

export type KillstreakLoadoutIntentMessage = Readonly<{
  type: 'killstreak-loadout-intent';
  by: string;
  matchEpoch: number;
  lifeId: number;
  sequence: number;
  loadout: KillstreakLoadoutV1;
  nonce: number;
}>;

export type KillstreakActivateIntentMessage = KillstreakActivationIntent & Readonly<{
  type: 'killstreak-activate-intent';
  timing?: CombatTiming;
  nonce: number;
}>;

export type KillstreakControlIntentMessage = KillstreakControlIntent & Readonly<{
  type: 'killstreak-control-intent';
  timing?: CombatTiming;
  nonce: number;
}>;

export type KillstreakCareCaptureIntentMessage = Readonly<{
  type: 'killstreak-care-capture-intent';
  by: string;
  matchEpoch: number;
  lifeId: number;
  sequence: number;
  crateId: string;
  holding: boolean;
  timing?: CombatTiming;
  nonce: number;
}>;

export type KillstreakCareCaptureResultReason = CareCaptureAdmissionReason
  | 'released'
  | 'not-capturing';

export type KillstreakCareCaptureResultMessage = Readonly<{
  type: 'killstreak-care-capture-result';
  by: string;
  forPlayerId: string;
  matchEpoch: number;
  lifeId: number;
  sequence: number;
  crateId: string;
  holding: boolean;
  accepted: boolean;
  reason: KillstreakCareCaptureResultReason;
  revision: number;
  nonce: number;
}>;

export type KillstreakStateMessage = Readonly<{
  type: 'killstreak-state';
  by: string;
  forPlayerId: string | null;
  snapshot: KillstreakRecipientSnapshot;
  nonce: number;
}>;

export type KillstreakDamageResultMessage = Readonly<{
  type: 'killstreak-damage-result';
  by: string;
  matchEpoch: number;
  revision: number;
  events: readonly KillstreakDamageEvent[];
  /** Public host-authored gun reports; unlike damage receipts these include admitted misses. */
  shots: readonly KillstreakSupportShotEvent[];
  /** Public host-authored payload choreography, including no-damage impacts. */
  impacts: readonly KillstreakImpactEvent[];
  nonce: number;
}>;

export type KillstreakCarpetFireStateMessage = Readonly<{
  type: 'killstreak-carpet-fire-state';
  by: string;
  forPlayerId: string;
  matchEpoch: number;
  snapshotId: number;
  chunkIndex: number;
  chunkCount: number;
  totalFires: number;
  fires: readonly CarpetGroundFirePresentationSnapshot[];
  nonce: number;
}>;

export type KillstreakProtocolMessage = KillstreakLoadoutIntentMessage
  | KillstreakActivateIntentMessage
  | KillstreakControlIntentMessage
  | KillstreakCareCaptureIntentMessage
  | KillstreakCareCaptureResultMessage
  | KillstreakStateMessage
  | KillstreakDamageResultMessage
  | KillstreakCarpetFireStateMessage;

export type KillstreakStateAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'forged-host' | 'forged-recipient' | 'match-epoch-mismatch' | 'stale-revision' | 'duplicate-nonce';
}>;

export type KillstreakCareCaptureResultAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'forged-host' | 'forged-recipient' | 'match-epoch-mismatch' | 'life-mismatch' | 'duplicate-nonce';
}>;

export function admitKillstreakCareCaptureResultMessage(
  message: KillstreakCareCaptureResultMessage,
  context: Readonly<{
    expectedHostId: string | null;
    expectedRecipientId: string;
    expectedMatchEpoch: number;
    expectedLifeId: number;
    seenNonces: ReadonlySet<number>;
  }>,
): KillstreakCareCaptureResultAdmission {
  if (!context.expectedHostId || message.by !== context.expectedHostId) {
    return Object.freeze({ accepted: false, reason: 'forged-host' });
  }
  if (message.forPlayerId !== context.expectedRecipientId) {
    return Object.freeze({ accepted: false, reason: 'forged-recipient' });
  }
  if (message.matchEpoch !== context.expectedMatchEpoch) {
    return Object.freeze({ accepted: false, reason: 'match-epoch-mismatch' });
  }
  if (message.lifeId !== context.expectedLifeId) {
    return Object.freeze({ accepted: false, reason: 'life-mismatch' });
  }
  if (context.seenNonces.has(message.nonce)) {
    return Object.freeze({ accepted: false, reason: 'duplicate-nonce' });
  }
  return Object.freeze({ accepted: true, reason: 'accepted' });
}

/**
 * Transport admission for the recipient-specific authority snapshot. The
 * runtime validates all reward mutations; this guard prevents a peer, replay,
 * or older host snapshot from replacing that canonical projection locally.
 */
export function admitKillstreakStateMessage(
  message: KillstreakStateMessage,
  context: Readonly<{
    expectedHostId: string | null;
    expectedRecipientId: string;
    expectedMatchEpoch: number;
    currentRevision: number;
    seenNonces: ReadonlySet<number>;
  }>,
): KillstreakStateAdmission {
  if (!context.expectedHostId || message.by !== context.expectedHostId) {
    return Object.freeze({ accepted: false, reason: 'forged-host' });
  }
  if (message.forPlayerId !== context.expectedRecipientId) {
    return Object.freeze({ accepted: false, reason: 'forged-recipient' });
  }
  if (message.snapshot.matchEpoch !== context.expectedMatchEpoch) {
    return Object.freeze({ accepted: false, reason: 'match-epoch-mismatch' });
  }
  if (context.seenNonces.has(message.nonce)) {
    return Object.freeze({ accepted: false, reason: 'duplicate-nonce' });
  }
  if (message.snapshot.revision < context.currentRevision) {
    return Object.freeze({ accepted: false, reason: 'stale-revision' });
  }
  return Object.freeze({ accepted: true, reason: 'accepted' });
}

const ids = new Set<string>(PASS65_KILLSTREAK_CATALOG.definitions.map((definition) => definition.id));
const careCaptureResultReasons = new Set<KillstreakCareCaptureResultReason>([
  'accepted', 'identity-mismatch', 'invalid-time', 'reward-capacity', 'crate-unavailable',
  'actor-already-capturing', 'capture-admission-failed', 'released', 'not-capturing',
]);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function actorId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function hostEntityId(value: unknown): value is string {
  return typeof value === 'string' && /^ks-[0-9]+-[a-z-]+-[0-9]+$/.test(value) && value.length <= 80;
}

function safeCounter(value: unknown, maximum = 1_000_000_000): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maximum;
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function vec3(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => finite(entry, -10_000, 10_000));
}

function attitude(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => finite(entry, -Math.PI, Math.PI));
}

function timing(value: unknown): boolean {
  if (value === undefined) return true;
  return object(value)
    && exactKeys(value, ['eventSeq', 'sentAtHostTimeMs'])
    && safeCounter(value.eventSeq)
    && finite(value.sentAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER);
}

function baseIntent(value: Record<string, unknown>): boolean {
  return actorId(value.by)
    && safeCounter(value.matchEpoch)
    && safeCounter(value.lifeId)
    && safeCounter(value.sequence)
    && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
}

function activationId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function isActorSnapshot(value: unknown): boolean {
  if (!object(value) || !exactKeys(value, [
    'actorId', 'team', 'lifeId', 'streak', 'cycleProgress', 'loadout', 'available', 'availableCharges',
    'adrenalineRemainingMs', 'possession', 'revealedCareRewards',
  ]) || !actorId(value.actorId) || (value.team !== 0 && value.team !== 1)
    || !safeCounter(value.lifeId) || !safeCounter(value.streak, MAX_REPLICATED_KILLSTREAK_STREAK)
    || !safeCounter(value.cycleProgress, 99)
    || !validateKillstreakLoadout(value.loadout).valid
    || !Array.isArray(value.available) || value.available.length > 5 || !value.available.every((id) => ids.has(String(id)))
    || !Array.isArray(value.availableCharges) || value.availableCharges.length > 5
    || !finite(value.adrenalineRemainingMs, 0, 15_000)
    || !Array.isArray(value.revealedCareRewards) || value.revealedCareRewards.length > MAX_RETAINED_CARE_REWARDS
    || !value.revealedCareRewards.every((id) => ids.has(String(id)))) return false;
  const loadout = value.loadout as KillstreakLoadoutV1;
  const charges = value.availableCharges as unknown[];
  if (!charges.every((charge) => object(charge)
    && exactKeys(charge, ['id', 'count'])
    && (loadout.slots as readonly string[]).includes(String(charge.id))
    && safeCounter(charge.count, MAX_RETAINED_KILLSTREAK_CHARGES_PER_REWARD)
    && Number(charge.count) > 0)) return false;
  const chargedIds = charges.map((charge) => (charge as { id: Pass65KillstreakId }).id);
  const expectedChargedIds = loadout.slots.filter((id) => chargedIds.includes(id));
  if (new Set(chargedIds).size !== chargedIds.length
    || value.available.length !== chargedIds.length
    || !value.available.every((id, index) => id === chargedIds[index])
    || !chargedIds.every((id, index) => id === expectedChargedIds[index])) return false;
  const finalThreshold = Math.max(...loadout.slots.map((id) => (
    PASS65_KILLSTREAK_CATALOG.definitions.find((definition) => definition.id === id)?.cost ?? 0
  )));
  if (Number(value.cycleProgress) >= finalThreshold) return false;
  if (value.possession === null) return true;
  return object(value.possession)
    && exactKeys(value.possession, ['kind', 'entityId'])
    && (value.possession.kind === 'chopper-gunner' || value.possession.kind === 'piloted-drone')
    && hostEntityId(value.possession.entityId);
}

function isEntitySnapshot(value: unknown): boolean {
  if (!object(value) || !exactKeys(value, [
    'id', 'activationId', 'ownerId', 'team', 'kind', 'mode', 'phase', 'position', 'velocity', 'attitude', 'health', 'expiresInMs',
    'magazine', 'reserveClips', 'gunProfileId', 'gunController', 'missileAmmo', 'missileCooldownMs',
    'taserCharges', 'captureActorId', 'captureProgress', 'revealedReward', 'revision',
  ]) || !hostEntityId(value.id) || !activationId(value.activationId) || !actorId(value.ownerId)
    || (value.team !== 0 && value.team !== 1)
    || (value.kind !== 'aircraft' && value.kind !== 'chopper' && value.kind !== 'drone' && value.kind !== 'care-crate')
    || !vec3(value.position) || !vec3(value.velocity) || !attitude(value.attitude)
    || !finite(value.health, 0, 800) || !finite(value.expiresInMs, 0, 60_000)
    || typeof value.phase !== 'string' || value.phase.length === 0 || value.phase.length > 24
    || !safeCounter(value.revision)) return false;
  if (value.kind === 'drone') {
    if (value.mode !== 'piloted' && value.mode !== 'swarm') return false;
    if (!safeCounter(value.magazine, 20)
      || (value.mode === 'piloted' ? !safeCounter(value.reserveClips, 3) : value.reserveClips !== null)
      || value.gunProfileId !== DRONE_SUPPORT_DEFINITIONS[value.mode].gunProfileId) return false;
    // HF-458: only the Piloted Drone carries taser charges.
    if (value.mode === 'piloted'
      ? !safeCounter(value.taserCharges, PILOTED_DRONE_TASER_CHARGES)
      : value.taserCharges !== null) return false;
  } else if (value.mode !== null || value.magazine !== null || value.reserveClips !== null
    || value.gunProfileId !== null || value.taserCharges !== null) return false;
  const phaseValid = value.kind === 'aircraft' ? value.phase === 'inbound' || value.phase === 'active' || value.phase === 'outbound'
    : value.kind === 'chopper' ? value.phase === 'inbound' || value.phase === 'orbiting' || value.phase === 'outbound'
    : value.kind === 'drone' ? value.phase === 'active' || value.phase === 'reloading'
    : value.phase === 'inbound' || value.phase === 'descending' || value.phase === 'landed' || value.phase === 'capturing';
  if (!phaseValid) return false;
  if (value.kind === 'chopper') {
    if ((value.gunController !== 'ai' && value.gunController !== 'owner-player')
      || !safeCounter(value.missileAmmo, CHOPPER_MISSILE_CAPACITY)
      || !finite(value.missileCooldownMs, 0, CHOPPER_MISSILE_CADENCE_MS)) return false;
  } else if (value.gunController !== null || value.missileAmmo !== null || value.missileCooldownMs !== null) return false;
  if (value.kind === 'care-crate') {
    const capturing = value.phase === 'capturing';
    if (capturing
      ? !actorId(value.captureActorId) || !finite(value.captureProgress, 0, 1)
      : value.captureActorId !== null || value.captureProgress !== null) return false;
  } else if (value.captureActorId !== null || value.captureProgress !== null) return false;
  return value.revealedReward === null || ids.has(String(value.revealedReward));
}

function isSensorContact(value: unknown): value is DroneSensorContact {
  return object(value)
    && exactKeys(value, ['id', 'kind', 'team', 'lifeId', 'position', 'relation', 'throughWall'])
    && actorId(value.id)
    && (value.kind === 'player' || value.kind === 'bot')
    && (value.team === 0 || value.team === 1)
    && safeCounter(value.lifeId)
    && vec3(value.position)
    && value.relation === 'hostile'
    && value.throughWall === true;
}

function isPlacementMarker(value: unknown): value is KillstreakPlacementMarkerSnapshot {
  if (!object(value) || !exactKeys(value, [
    'id', 'activationId', 'source', 'shape', 'ownerId', 'team', 'audience', 'anchor', 'pathStart', 'pathEnd', 'halfWidthM', 'expiresInMs',
  ]) || typeof value.id !== 'string' || value.id.length > 120 || !activationId(value.activationId)
    || (value.source !== 'care-package' && value.source !== 'carpet-bomber')
    || (value.shape !== 'ground-x' && value.shape !== 'corridor')
    || !actorId(value.ownerId) || (value.team !== 0 && value.team !== 1)
    || (value.audience !== 'all-combatants' && value.audience !== 'owner-only')
    || !vec3(value.anchor)) return false;
  const maximumLifetime = value.source === 'care-package'
    ? CARE_TARGET_MARKER_MAX_LIFETIME_MS
    : CARPET_TARGET_MARKER_MAX_LIFETIME_MS;
  if (!finite(value.expiresInMs, 0, maximumLifetime)) return false;
  if (value.shape === 'ground-x') {
    const expectedId = `${value.activationId}:${value.source === 'care-package' ? 'care-target' : 'carpet-target'}`;
    return value.id === expectedId && value.audience === 'all-combatants'
      && value.pathStart === null && value.pathEnd === null && value.halfWidthM === null;
  }
  if (value.id !== `${value.activationId}:carpet-corridor`
    || value.source !== 'carpet-bomber' || value.audience !== 'owner-only'
    || !vec3(value.pathStart) || !vec3(value.pathEnd)
    || !finite(value.halfWidthM, 0.1, SUPPORT_TARGET_CORRIDOR_MAX_HALF_WIDTH_M)) return false;
  const horizontalLength = Math.hypot(
    value.pathEnd[0] - value.pathStart[0],
    value.pathEnd[2] - value.pathStart[2],
  );
  return horizontalLength >= 1 && horizontalLength <= SUPPORT_TARGET_CORRIDOR_MAX_LENGTH_M;
}

function isRecipientSnapshot(value: unknown): value is KillstreakRecipientSnapshot {
  if (!object(value) || !exactKeys(value, ['schemaVersion', 'matchEpoch', 'revision', 'actors', 'entities', 'sensorContacts', 'placementMarkers'])
    || value.schemaVersion !== 3 || !safeCounter(value.matchEpoch) || !safeCounter(value.revision)
    || !Array.isArray(value.actors) || value.actors.length > 6 || !value.actors.every(isActorSnapshot)
    || !Array.isArray(value.entities) || value.entities.length > 32 || !value.entities.every(isEntitySnapshot)
    || !Array.isArray(value.sensorContacts) || value.sensorContacts.length > 16 || !value.sensorContacts.every(isSensorContact)
    || !Array.isArray(value.placementMarkers) || value.placementMarkers.length > 8 || !value.placementMarkers.every(isPlacementMarker)) return false;
  return new Set(value.actors.map((entry) => (entry as { actorId: string }).actorId)).size === value.actors.length
    && new Set(value.entities.map((entry) => (entry as { id: string }).id)).size === value.entities.length
    && new Set(value.sensorContacts.map((entry) => (entry as DroneSensorContact).id)).size === value.sensorContacts.length;
}

function placementMarkersMatchRecipient(snapshot: KillstreakRecipientSnapshot, recipientId: string | null): boolean {
  if (new Set(snapshot.placementMarkers.map((marker) => marker.id)).size !== snapshot.placementMarkers.length) return false;
  const sameVector = (left: readonly number[], right: readonly number[]) => left.every((entry, axis) => entry === right[axis]);
  for (const marker of snapshot.placementMarkers) {
    if (marker.audience === 'owner-only' && recipientId !== marker.ownerId) return false;
    const owner = snapshot.actors.find((actor) => actor.actorId === marker.ownerId);
    if (!owner || owner.team !== marker.team) return false;
    if (marker.shape !== 'corridor') continue;
    const target = snapshot.placementMarkers.find((candidate) => candidate.activationId === marker.activationId
      && candidate.source === 'carpet-bomber' && candidate.shape === 'ground-x');
    if (!target || target.ownerId !== marker.ownerId || target.team !== marker.team
      || target.expiresInMs !== marker.expiresInMs || !sameVector(target.anchor, marker.anchor)) return false;
  }
  for (const target of snapshot.placementMarkers.filter((marker) => marker.source === 'carpet-bomber' && marker.shape === 'ground-x')) {
    const corridors = snapshot.placementMarkers.filter((marker) => marker.activationId === target.activationId && marker.shape === 'corridor');
    if (recipientId === target.ownerId ? corridors.length !== 1 : corridors.length !== 0) return false;
  }
  return true;
}

function sensorCapabilityMatchesRecipient(snapshot: KillstreakRecipientSnapshot, recipientId: string | null): boolean {
  if (snapshot.sensorContacts.length === 0) return true;
  if (!recipientId) return false;
  const actor = snapshot.actors.find((entry) => entry.actorId === recipientId);
  if (actor?.possession?.kind !== 'piloted-drone') return false;
  return snapshot.entities.some((entity) => entity.id === actor.possession?.entityId
    && entity.kind === 'drone' && entity.mode === 'piloted');
}

function isDamageEvent(value: unknown): value is KillstreakDamageEvent {
  return object(value)
    && exactKeys(value, [
      'resultId', 'activationId', 'source', 'ownerId', 'targetId', 'targetLifeId',
      'targetPosition', 'damage', 'origin', 'endpoint', 'tracerOrigin', 'atMs',
    ])
    && typeof value.resultId === 'string' && /^ks-result-[0-9]+-[0-9]+$/.test(value.resultId)
    && activationId(value.activationId)
    && ids.has(String(value.source))
    && actorId(value.ownerId) && actorId(value.targetId)
    && safeCounter(value.targetLifeId)
    && vec3(value.targetPosition)
    && finite(value.damage, 0.01, 1_000)
    && vec3(value.origin)
    && vec3(value.endpoint)
    && vec3(value.tracerOrigin)
    && finite(value.atMs, 0, Number.MAX_SAFE_INTEGER);
}

function supportShotEntityMatchesSource(event: KillstreakSupportShotEvent): boolean {
  if (event.source === 'chopper') return /^ks-[0-9]+-chopper-[0-9]+$/.test(event.entityId);
  if (event.source === 'piloted-drone') return /^ks-[0-9]+-pilot-drone-[0-9]+$/.test(event.entityId);
  return /^ks-[0-9]+-swarm-drone-[0-9]+$/.test(event.entityId);
}

function isSupportShotEvent(value: unknown): value is KillstreakSupportShotEvent {
  if (!object(value)
    || !exactKeys(value, ['activationId', 'entityId', 'source', 'ownerId', 'ownerTeam', 'ordinal', 'atMs'])
    || !activationId(value.activationId)
    || !hostEntityId(value.entityId)
    || (value.source !== 'chopper' && value.source !== 'piloted-drone' && value.source !== 'drone-swarm')
    || !actorId(value.ownerId)
    || (value.ownerTeam !== 0 && value.ownerTeam !== 1)
    || !safeCounter(value.ordinal)
    || !finite(value.atMs, 0, Number.MAX_SAFE_INTEGER)) return false;
  return supportShotEntityMatchesSource(value as KillstreakSupportShotEvent);
}

export function isImpactEvent(value: unknown): value is KillstreakImpactEvent {
  if (!object(value)) return false;
  // HF-335: launchPosition is an OPTIONAL fail-open presentation field. Older
  // peers legitimately omit it; present peers must carry a finite vec3 when it
  // is present. Existing required-key validation bounds are unchanged.
  if (!exactKeys(value, ['activationId', 'source', 'ordinal', 'phase', 'position', 'impactAtMs', 'atMs'], ['launchPosition'])
    || !activationId(value.activationId)
    || (value.source !== 'carpet-bomber' && value.source !== 'chopper')
    || typeof value.ordinal !== 'number' || !Number.isSafeInteger(value.ordinal) || value.ordinal < 0
    || value.ordinal >= (value.source === 'chopper' ? CHOPPER_MISSILE_CAPACITY : CARPET_BOMBER_IMPACT_COUNT)
    || (value.phase !== 'drop' && value.phase !== 'impact')
    || !vec3(value.position)
    || (value.launchPosition !== undefined && !vec3(value.launchPosition))
    || !finite(value.impactAtMs, 0, Number.MAX_SAFE_INTEGER)
    || !finite(value.atMs, 0, Number.MAX_SAFE_INTEGER)) return false;
  if (value.source === 'chopper') return value.phase === 'drop'
    ? value.impactAtMs - value.atMs === CHOPPER_MISSILE_FLIGHT_MS
    : value.atMs === value.impactAtMs;
  return value.phase === 'drop' ? value.atMs <= value.impactAtMs : value.atMs >= value.impactAtMs;
}

function isCarpetGroundFirePresentationSnapshot(value: unknown): value is CarpetGroundFirePresentationSnapshot {
  return object(value)
    && exactKeys(value, ['activationId', 'impactOrdinal', 'position', 'expiresAtHostTimeMs'])
    && activationId(value.activationId)
    && typeof value.impactOrdinal === 'number'
    && Number.isSafeInteger(value.impactOrdinal)
    && value.impactOrdinal >= 0
    && value.impactOrdinal < CARPET_BOMBER_IMPACT_COUNT
    && vec3(value.position)
    && finite(value.expiresAtHostTimeMs, 0, Number.MAX_SAFE_INTEGER);
}

export function isKillstreakProtocolMessage(value: unknown): value is KillstreakProtocolMessage {
  if (!object(value) || typeof value.type !== 'string') return false;
  if (value.type === 'killstreak-loadout-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'loadout', 'nonce'])
      && baseIntent(value) && validateKillstreakLoadout(value.loadout).valid;
  }
  if (value.type === 'killstreak-activate-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'slot', 'activationId', 'expectedId', 'nonce'], ['anchor', 'facing', 'timing'])
      && baseIntent(value)
      && (value.slot === 1 || value.slot === 2 || value.slot === 3 || value.slot === 4 || value.slot === 5)
      && activationId(value.activationId)
      && ids.has(String(value.expectedId))
      && (value.anchor === undefined || vec3(value.anchor))
      && (value.facing === undefined || vec3(value.facing))
      && timing(value.timing);
  }
  if (value.type === 'killstreak-control-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'entityId', 'action', 'nonce'], [
      'yawQ', 'pitchQ', 'thrustQ', 'strafeQ', 'verticalQ', 'fire', 'missileFire', 'taserFire', 'timing',
    ]) && baseIntent(value) && hostEntityId(value.entityId)
      && (value.action === 'toggle-chopper-gunner' || value.action === 'toggle-piloted-drone' || value.action === 'pilot-control' || value.action === 'exit-piloted-drone')
      && (value.yawQ === undefined || finite(value.yawQ, -Math.PI, Math.PI))
      && (value.pitchQ === undefined || finite(value.pitchQ, -1.2, 1.2))
      && (value.thrustQ === undefined || finite(value.thrustQ, -1, 1))
      && (value.strafeQ === undefined || finite(value.strafeQ, -1, 1))
      && (value.verticalQ === undefined || finite(value.verticalQ, -1, 1))
      && (value.fire === undefined || typeof value.fire === 'boolean')
      && (value.missileFire === undefined || (value.action === 'pilot-control' && typeof value.missileFire === 'boolean'))
      // HF-458: right-click taser, admitted on the same pilot-control action.
      && (value.taserFire === undefined || (value.action === 'pilot-control' && typeof value.taserFire === 'boolean'))
      && timing(value.timing);
  }
  if (value.type === 'killstreak-care-capture-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'crateId', 'holding', 'nonce'], ['timing'])
      && baseIntent(value) && hostEntityId(value.crateId) && typeof value.holding === 'boolean' && timing(value.timing);
  }
  if (value.type === 'killstreak-care-capture-result') {
    if (!exactKeys(value, [
      'type', 'by', 'forPlayerId', 'matchEpoch', 'lifeId', 'sequence', 'crateId', 'holding',
      'accepted', 'reason', 'revision', 'nonce',
    ]) || !actorId(value.by) || !actorId(value.forPlayerId)
      || !safeCounter(value.matchEpoch) || !safeCounter(value.lifeId) || !safeCounter(value.sequence)
      || !hostEntityId(value.crateId) || typeof value.holding !== 'boolean' || typeof value.accepted !== 'boolean'
      || !careCaptureResultReasons.has(value.reason as KillstreakCareCaptureResultReason)
      || !safeCounter(value.revision) || !finite(value.nonce, 0, Number.MAX_SAFE_INTEGER)) return false;
    if (value.accepted) return value.holding ? value.reason === 'accepted' : value.reason === 'released';
    return value.reason !== 'accepted' && value.reason !== 'released';
  }
  if (value.type === 'killstreak-state') {
    return exactKeys(value, ['type', 'by', 'forPlayerId', 'snapshot', 'nonce'])
      && actorId(value.by) && (value.forPlayerId === null || actorId(value.forPlayerId))
      && isRecipientSnapshot(value.snapshot)
      && sensorCapabilityMatchesRecipient(value.snapshot, value.forPlayerId)
      && placementMarkersMatchRecipient(value.snapshot, value.forPlayerId)
      && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
  }
  if (value.type === 'killstreak-carpet-fire-state') {
    if (!exactKeys(value, [
      'type', 'by', 'forPlayerId', 'matchEpoch', 'snapshotId', 'chunkIndex', 'chunkCount',
      'totalFires', 'fires', 'nonce',
    ])
      || !actorId(value.by) || !actorId(value.forPlayerId)
      || !safeCounter(value.matchEpoch) || !safeCounter(value.snapshotId)
      || !safeCounter(value.chunkIndex) || !safeCounter(value.chunkCount)
      || !safeCounter(value.totalFires)
      || value.chunkCount < 1 || value.chunkCount > CARPET_GROUND_FIRE_STATE_MAX_CHUNKS
      || value.chunkIndex >= value.chunkCount
      || value.totalFires > CARPET_GROUND_FIRE_AUTHORITY_CAPACITY
      || value.chunkCount !== Math.max(1, Math.ceil(value.totalFires / CARPET_GROUND_FIRE_STATE_CHUNK_SIZE))
      || !Array.isArray(value.fires)
      || value.fires.length !== Math.min(
        CARPET_GROUND_FIRE_STATE_CHUNK_SIZE,
        Math.max(0, value.totalFires - value.chunkIndex * CARPET_GROUND_FIRE_STATE_CHUNK_SIZE),
      )
      || !value.fires.every(isCarpetGroundFirePresentationSnapshot)
      || new Set(value.fires.map((fire) => {
        const snapshot = fire as CarpetGroundFirePresentationSnapshot;
        return `${snapshot.activationId}:${snapshot.impactOrdinal}`;
      })).size !== value.fires.length) return false;
    return finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
  }
  if (value.type === 'killstreak-damage-result') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'revision', 'events', 'shots', 'impacts', 'nonce'])
      && actorId(value.by) && safeCounter(value.matchEpoch) && safeCounter(value.revision)
      && Array.isArray(value.events) && value.events.length <= 64 && value.events.every(isDamageEvent)
      && new Set(value.events.map((event) => (event as KillstreakDamageEvent).resultId)).size === value.events.length
      && Array.isArray(value.shots) && value.shots.length <= MAX_SUPPORT_SHOT_EVENTS_PER_STEP && value.shots.every(isSupportShotEvent)
      && value.shots.every((shot) => {
        const event = shot as KillstreakSupportShotEvent;
        return event.entityId.startsWith(`ks-${Number(value.matchEpoch)}-`)
          && event.activationId.startsWith(`ks-activation-${Number(value.matchEpoch)}-`);
      })
      && new Set(value.shots.map((shot) => {
        const event = shot as KillstreakSupportShotEvent;
        return `${event.entityId}:${event.ordinal}`;
      })).size === value.shots.length
      && Array.isArray(value.impacts) && value.impacts.length <= MAX_SUPPORT_IMPACT_EVENTS_PER_STEP && value.impacts.every(isImpactEvent)
      && new Set(value.impacts.map((impact) => {
        const event = impact as KillstreakImpactEvent;
        return `${event.activationId}:${event.ordinal}:${event.phase}`;
      })).size === value.impacts.length
      && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
  }
  return false;
}

export function killstreakMessageBelongsToPlayer(message: KillstreakProtocolMessage, playerId: string): boolean {
  if (!playerId) return false;
  if (message.type === 'killstreak-care-capture-result') return message.by === playerId || message.forPlayerId === playerId;
  if (message.type === 'killstreak-state') return message.by === playerId || message.forPlayerId === playerId;
  if (message.type === 'killstreak-carpet-fire-state') return message.by === playerId || message.forPlayerId === playerId;
  if (message.type === 'killstreak-damage-result') return message.shots.length > 0
    || message.impacts.length > 0
    || message.by === playerId
    || message.events.some((event) => event.ownerId === playerId || event.targetId === playerId);
  return message.by === playerId;
}

export function isKillstreakHostAuthorityMessage(message: KillstreakProtocolMessage): boolean {
  return message.type === 'killstreak-care-capture-result'
    || message.type === 'killstreak-state'
    || message.type === 'killstreak-carpet-fire-state'
    || message.type === 'killstreak-damage-result';
}

export function isPass65KillstreakId(value: unknown): value is Pass65KillstreakId {
  return typeof value === 'string' && ids.has(value);
}
