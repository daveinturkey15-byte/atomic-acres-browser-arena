import { PASS65_KILLSTREAK_CATALOG, validateKillstreakLoadout, type KillstreakLoadoutV1, type Pass65KillstreakId } from './killstreak-catalog';
import type { CombatTiming } from './network-fairness';
import type {
  DroneSensorContact,
  KillstreakActivationIntent,
  KillstreakControlIntent,
  KillstreakDamageEvent,
  KillstreakPlacementMarkerSnapshot,
  KillstreakRecipientSnapshot,
} from './killstreak-runtime';
import {
  CARE_TARGET_MARKER_MAX_LIFETIME_MS,
  CARPET_TARGET_MARKER_MAX_LIFETIME_MS,
  SUPPORT_TARGET_CORRIDOR_MAX_HALF_WIDTH_M,
  SUPPORT_TARGET_CORRIDOR_MAX_LENGTH_M,
} from './killstreak-runtime';
import { DRONE_GUN_PROFILE_ID } from './killstreak-support-catalog';

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
  nonce: number;
}>;

export type KillstreakProtocolMessage = KillstreakLoadoutIntentMessage
  | KillstreakActivateIntentMessage
  | KillstreakControlIntentMessage
  | KillstreakCareCaptureIntentMessage
  | KillstreakStateMessage
  | KillstreakDamageResultMessage;

export type KillstreakStateAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'forged-host' | 'forged-recipient' | 'match-epoch-mismatch' | 'stale-revision' | 'duplicate-nonce';
}>;

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
    'actorId', 'team', 'lifeId', 'streak', 'loadout', 'available', 'adrenalineRemainingMs', 'possession', 'revealedCareRewards',
  ]) || !actorId(value.actorId) || (value.team !== 0 && value.team !== 1)
    || !safeCounter(value.lifeId) || !safeCounter(value.streak, 100_000)
    || !validateKillstreakLoadout(value.loadout).valid
    || !Array.isArray(value.available) || value.available.length > 5 || !value.available.every((id) => ids.has(String(id)))
    || !finite(value.adrenalineRemainingMs, 0, 15_000)
    || !Array.isArray(value.revealedCareRewards) || value.revealedCareRewards.length > 8
    || !value.revealedCareRewards.every((id) => ids.has(String(id)))) return false;
  if (value.possession === null) return true;
  return object(value.possession)
    && exactKeys(value.possession, ['kind', 'entityId'])
    && (value.possession.kind === 'chopper-gunner' || value.possession.kind === 'piloted-drone')
    && hostEntityId(value.possession.entityId);
}

function isEntitySnapshot(value: unknown): boolean {
  if (!object(value) || !exactKeys(value, [
    'id', 'activationId', 'ownerId', 'team', 'kind', 'mode', 'phase', 'position', 'velocity', 'attitude', 'health', 'expiresInMs',
    'magazine', 'reserveClips', 'gunProfileId', 'gunController', 'captureProgress', 'revealedReward', 'revision',
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
      || (value.mode === 'piloted' ? !safeCounter(value.reserveClips, 1) : value.reserveClips !== null)
      || value.gunProfileId !== DRONE_GUN_PROFILE_ID) return false;
  } else if (value.mode !== null || value.magazine !== null || value.reserveClips !== null || value.gunProfileId !== null) return false;
  const phaseValid = value.kind === 'aircraft' ? value.phase === 'inbound' || value.phase === 'active' || value.phase === 'outbound'
    : value.kind === 'chopper' ? value.phase === 'inbound' || value.phase === 'orbiting' || value.phase === 'outbound'
    : value.kind === 'drone' ? value.phase === 'active' || value.phase === 'reloading'
    : value.phase === 'inbound' || value.phase === 'descending' || value.phase === 'landed' || value.phase === 'capturing';
  if (!phaseValid) return false;
  if (value.kind === 'chopper') {
    if (value.gunController !== 'ai' && value.gunController !== 'owner-player') return false;
  } else if (value.gunController !== null) return false;
  if (value.kind === 'care-crate') {
    if (!(value.captureProgress === null || finite(value.captureProgress, 0, 1))) return false;
  } else if (value.captureProgress !== null) return false;
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
    || value.schemaVersion !== 1 || !safeCounter(value.matchEpoch) || !safeCounter(value.revision)
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
    && exactKeys(value, ['resultId', 'activationId', 'source', 'ownerId', 'targetId', 'targetLifeId', 'targetPosition', 'damage', 'origin', 'atMs'])
    && typeof value.resultId === 'string' && /^ks-result-[0-9]+-[0-9]+$/.test(value.resultId)
    && activationId(value.activationId)
    && ids.has(String(value.source))
    && actorId(value.ownerId) && actorId(value.targetId)
    && safeCounter(value.targetLifeId)
    && vec3(value.targetPosition)
    && finite(value.damage, 0.01, 1_000)
    && vec3(value.origin)
    && finite(value.atMs, 0, Number.MAX_SAFE_INTEGER);
}

export function isKillstreakProtocolMessage(value: unknown): value is KillstreakProtocolMessage {
  if (!object(value) || typeof value.type !== 'string') return false;
  if (value.type === 'killstreak-loadout-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'loadout', 'nonce'])
      && baseIntent(value) && validateKillstreakLoadout(value.loadout).valid;
  }
  if (value.type === 'killstreak-activate-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'slot', 'activationId', 'expectedId', 'nonce'], ['anchor', 'timing'])
      && baseIntent(value)
      && (value.slot === 1 || value.slot === 2 || value.slot === 3 || value.slot === 4 || value.slot === 5)
      && activationId(value.activationId)
      && ids.has(String(value.expectedId))
      && (value.anchor === undefined || vec3(value.anchor))
      && timing(value.timing);
  }
  if (value.type === 'killstreak-control-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'entityId', 'action', 'nonce'], [
      'yawQ', 'pitchQ', 'thrustQ', 'verticalQ', 'fire', 'timing',
    ]) && baseIntent(value) && hostEntityId(value.entityId)
      && (value.action === 'toggle-chopper-gunner' || value.action === 'toggle-piloted-drone' || value.action === 'pilot-control' || value.action === 'exit-piloted-drone')
      && (value.yawQ === undefined || finite(value.yawQ, -Math.PI, Math.PI))
      && (value.pitchQ === undefined || finite(value.pitchQ, -1.2, 1.2))
      && (value.thrustQ === undefined || finite(value.thrustQ, -1, 1))
      && (value.verticalQ === undefined || finite(value.verticalQ, -1, 1))
      && (value.fire === undefined || typeof value.fire === 'boolean')
      && timing(value.timing);
  }
  if (value.type === 'killstreak-care-capture-intent') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'lifeId', 'sequence', 'crateId', 'holding', 'nonce'], ['timing'])
      && baseIntent(value) && hostEntityId(value.crateId) && typeof value.holding === 'boolean' && timing(value.timing);
  }
  if (value.type === 'killstreak-state') {
    return exactKeys(value, ['type', 'by', 'forPlayerId', 'snapshot', 'nonce'])
      && actorId(value.by) && (value.forPlayerId === null || actorId(value.forPlayerId))
      && isRecipientSnapshot(value.snapshot)
      && sensorCapabilityMatchesRecipient(value.snapshot, value.forPlayerId)
      && placementMarkersMatchRecipient(value.snapshot, value.forPlayerId)
      && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
  }
  if (value.type === 'killstreak-damage-result') {
    return exactKeys(value, ['type', 'by', 'matchEpoch', 'revision', 'events', 'nonce'])
      && actorId(value.by) && safeCounter(value.matchEpoch) && safeCounter(value.revision)
      && Array.isArray(value.events) && value.events.length <= 64 && value.events.every(isDamageEvent)
      && new Set(value.events.map((event) => (event as KillstreakDamageEvent).resultId)).size === value.events.length
      && finite(value.nonce, 0, Number.MAX_SAFE_INTEGER);
  }
  return false;
}

export function killstreakMessageBelongsToPlayer(message: KillstreakProtocolMessage, playerId: string): boolean {
  if (!playerId) return false;
  if (message.type === 'killstreak-state') return message.by === playerId || message.forPlayerId === playerId;
  if (message.type === 'killstreak-damage-result') return message.by === playerId || message.events.some((event) => event.ownerId === playerId || event.targetId === playerId);
  return message.by === playerId;
}

export function isKillstreakHostAuthorityMessage(message: KillstreakProtocolMessage): boolean {
  return message.type === 'killstreak-state' || message.type === 'killstreak-damage-result';
}

export function isPass65KillstreakId(value: unknown): value is Pass65KillstreakId {
  return typeof value === 'string' && ids.has(value);
}
