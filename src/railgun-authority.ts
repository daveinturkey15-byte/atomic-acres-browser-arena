export const RAILGUN_WEAPON_ID = 'railgun' as const;
export const RAILGUN_ARENA_ID = 'atomic-acres' as const; // Stable arena id; Pass 64 display name is Nuke Town.
// HF-384 (owner, 2026-08-28): the fixed 180 s spawn could be clock-camped - stand on
// the site at 2:59 and the rare weapon is yours every match. The delay is now a
// 150 s base with deterministic +/-30 s jitter derived from the SAME replicated
// randomUnit that picks the site, so host and guests agree without a new message.
// The unit is re-hashed (golden-ratio fract) before use so site and time stay
// uncorrelated - reusing it raw would make each room imply its own spawn time.
export const RAILGUN_SPAWN_DELAY_BASE_MS = 150_000;
export const RAILGUN_SPAWN_DELAY_JITTER_MS = 30_000;
/** Legacy fixed delay, kept for the debug staging path and the protocol fixtures. */
export const RAILGUN_SPAWN_DELAY_MS = RAILGUN_SPAWN_DELAY_BASE_MS + RAILGUN_SPAWN_DELAY_JITTER_MS;

export function railgunSpawnDelayMs(randomUnit: number): number {
  const unit = Number.isFinite(randomUnit) ? Math.min(Math.max(randomUnit, 0), 1) : 0;
  const decorrelated = (unit * 0.618033988749895) % 1;
  return Math.round(RAILGUN_SPAWN_DELAY_BASE_MS + (decorrelated * 2 - 1) * RAILGUN_SPAWN_DELAY_JITTER_MS);
}
export const RAILGUN_DAMAGE = 50;
export const RAILGUN_PENETRATION_MULTIPLIER = 1;
export const RAILGUN_RECHAMBER_MS = 1_500;
export const RAILGUN_TOTAL_ROUNDS = 8;
export const RAILGUN_PROCESSED_SHOT_LIMIT = 64;
export const RAILGUN_STATE_RESYNC_MS = 1_000;
export const RAILGUN_BEAM_LENGTH_M = 180;
/** Six lobby players plus four hosted bots leaves at most nine non-shooter actors. */
export const RAILGUN_MAX_TARGET_OUTCOMES = 9;
export const RAILGUN_TARGET_RADIUS_M = 0.62;
export const RAILGUN_TARGET_HALF_HEIGHT_M = 0.78;

export type RailgunSpawnSite = Readonly<{
  id: 'aqua-front' | 'aqua-rear' | 'coral-front' | 'coral-rear';
  /** World-space pickup position in one of the four authored upper rooms. */
  position: readonly [number, number, number];
}>;

/**
 * HF-384. World-space upper-room centres, derived from the LIVE layout.
 *
 * HOUSE_LAYOUT seats the aqua house at (4, -17.4) facing +1 and the coral house at
 * (-4, 17.4) facing -1. Each house has two upper rooms at local (0, FLOOR_Y, +/-4)
 * with FLOOR_Y 3.48, and worldPosition mirrors Z by `facing` but never X. Pickup
 * height is FLOOR_Y + 0.70 = 4.18 m. The set stays exactly 180-degree symmetric.
 *
 * These were authored against the PRE-PASS-78 street-along-Z layout and never moved
 * when the arena was rebuilt. After the rebuild not one of them was inside a house,
 * and aqua-rear/coral-rear sat at |z| = 32 against ARENA_BOUNDS of |z| <= 30 - outside
 * the map, where no player can stand. Sites are chosen uniformly, so HALF of all
 * matches put the map's rare weapon permanently out of reach. Nothing failed: there is
 * no clamping, no floor projection, and the pickup test is a bare distance check.
 *
 * The lesson is in the test below, not here. A hand-written coordinate cannot know the
 * layout moved; the guard derives the rooms from the same source the arena is built
 * from, so the next rebuild fails loudly instead of silently relocating the weapon.
 */
export const RAILGUN_UPPER_ROOM_SPAWN_SITES: readonly RailgunSpawnSite[] = Object.freeze([
  Object.freeze({ id: 'aqua-front', position: [4, 4.18, -13.4] as const }),
  Object.freeze({ id: 'aqua-rear', position: [4, 4.18, -21.4] as const }),
  Object.freeze({ id: 'coral-front', position: [-4, 4.18, 13.4] as const }),
  Object.freeze({ id: 'coral-rear', position: [-4, 4.18, 21.4] as const }),
]);

export type RailgunAuthorityState = Readonly<{
  generation: number;
  /** Monotonic within one match generation; rejects reordered authority snapshots. */
  revision: number;
  status: 'disabled' | 'scheduled' | 'available' | 'held' | 'depleted';
  spawnAtHostTimeMs: number | null;
  spawnSite: RailgunSpawnSite | null;
  pickupPosition: readonly [number, number, number] | null;
  holderId: string | null;
  roundsRemaining: number;
  chamberReadyAtHostTimeMs: number;
  announcementSent: boolean;
  processedShotIds: readonly string[];
}>;

export type RailgunAdvanceResult = Readonly<{
  state: RailgunAuthorityState;
  spawned: boolean;
  announcement: 'RARE WEAPON SPAWNED' | null;
}>;

export type RailgunShotResult = Readonly<{
  state: RailgunAuthorityState;
  accepted: boolean;
  duplicate: boolean;
  reason: 'accepted' | 'not-holder' | 'not-ready' | 'empty' | 'invalid' | 'duplicate';
  damage: number;
  penetrationMultiplier: number;
  adsAfterShot: false;
  rechamberMs: number;
}>;

function validHostTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validPlayerId(value: string): boolean {
  return value.length > 0 && value.length <= 80;
}

function copyPosition(value: readonly [number, number, number]): readonly [number, number, number] {
  return [value[0], value[1], value[2]];
}

export function chooseRailgunUpperRoom(randomUnit: number): RailgunSpawnSite {
  const bounded = Number.isFinite(randomUnit) ? Math.max(0, Math.min(0.999999999999, randomUnit)) : 0;
  return RAILGUN_UPPER_ROOM_SPAWN_SITES[Math.floor(bounded * RAILGUN_UPPER_ROOM_SPAWN_SITES.length)];
}

/** Host-only match initialization. Non-Nuke-Town arenas never schedule the pickup. */
export function createRailgunAuthorityState(
  arenaId: string,
  matchStartedAtHostTimeMs: number,
  randomUnit = Math.random(),
  generation = 1,
): RailgunAuthorityState {
  if (arenaId !== RAILGUN_ARENA_ID || !validHostTime(matchStartedAtHostTimeMs)) {
    return {
      generation,
      revision: 0,
      status: 'disabled',
      spawnAtHostTimeMs: null,
      spawnSite: null,
      pickupPosition: null,
      holderId: null,
      roundsRemaining: RAILGUN_TOTAL_ROUNDS,
      chamberReadyAtHostTimeMs: 0,
      announcementSent: false,
      processedShotIds: [],
    };
  }
  const spawnSite = chooseRailgunUpperRoom(randomUnit);
  return {
    generation,
    revision: 0,
    status: 'scheduled',
    spawnAtHostTimeMs: matchStartedAtHostTimeMs + railgunSpawnDelayMs(randomUnit),
    spawnSite,
    pickupPosition: copyPosition(spawnSite.position),
    holderId: null,
    roundsRemaining: RAILGUN_TOTAL_ROUNDS,
    chamberReadyAtHostTimeMs: 0,
    announcementSent: false,
    processedShotIds: [],
  };
}

/** Advance on the host monotonic clock. The announcement is emitted exactly on the spawn transition. */
export function advanceRailgunAuthority(state: RailgunAuthorityState, now: number): RailgunAdvanceResult {
  if (state.status !== 'scheduled' || state.spawnAtHostTimeMs === null || !validHostTime(now) || now < state.spawnAtHostTimeMs) {
    return { state, spawned: false, announcement: null };
  }
  const announce = !state.announcementSent;
  return {
    state: { ...state, revision: state.revision + 1, status: 'available', announcementSent: true },
    spawned: true,
    announcement: announce ? 'RARE WEAPON SPAWNED' : null,
  };
}

export function claimRailgun(
  state: RailgunAuthorityState,
  playerId: string,
  generation: number,
): { accepted: boolean; state: RailgunAuthorityState } {
  if (state.status !== 'available' || state.generation !== generation || !validPlayerId(playerId) || state.roundsRemaining <= 0) {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: { ...state, revision: state.revision + 1, status: 'held', holderId: playerId, pickupPosition: null },
  };
}

/**
 * Re-arms the canonical railgun only from the secure Gun Range test bay. This
 * is host/offline authority, never a peer claim, and deliberately resets the
 * finite eight-round training magazine without weakening normal match rules.
 */
export function grantTrainingRailgun(
  state: RailgunAuthorityState,
  playerId: string,
  context: Readonly<{
    arenaId: 'gun-range';
    stationKind: 'secure-test-bay';
    authorityRole: 'offline' | 'host';
  }>,
): { accepted: boolean; state: RailgunAuthorityState } {
  if (!validPlayerId(playerId) || context.arenaId !== 'gun-range'
    || context.stationKind !== 'secure-test-bay'
    || context.authorityRole !== 'offline' && context.authorityRole !== 'host') {
    return { accepted: false, state };
  }
  return {
    accepted: true,
    state: {
      ...state,
      revision: state.revision + 1,
      status: 'held',
      spawnAtHostTimeMs: null,
      spawnSite: null,
      pickupPosition: null,
      holderId: playerId,
      roundsRemaining: RAILGUN_TOTAL_ROUNDS,
      chamberReadyAtHostTimeMs: 0,
      announcementSent: true,
      processedShotIds: [],
    },
  };
}

export function advanceRailgunChamber(state: RailgunAuthorityState, now: number): RailgunAuthorityState {
  if (state.status !== 'held' || state.roundsRemaining <= 0 || state.chamberReadyAtHostTimeMs <= 0 || !validHostTime(now)) return state;
  return now >= state.chamberReadyAtHostTimeMs ? { ...state, revision: state.revision + 1, chamberReadyAtHostTimeMs: 0 } : state;
}

export function fireRailgun(
  state: RailgunAuthorityState,
  playerId: string,
  shotId: string,
  now: number,
): RailgunShotResult {
  const base = {
    state,
    accepted: false,
    duplicate: false,
    damage: 0,
    penetrationMultiplier: 0,
    adsAfterShot: false as const,
    rechamberMs: 0,
  };
  if (state.processedShotIds.includes(shotId)) return { ...base, duplicate: true, reason: 'duplicate' };
  if (!validPlayerId(playerId) || shotId.length < 8 || shotId.length > 128 || !validHostTime(now)) {
    return { ...base, reason: 'invalid' };
  }
  if (state.status !== 'held' || state.holderId !== playerId) return { ...base, reason: 'not-holder' };
  if (state.roundsRemaining <= 0) return { ...base, reason: 'empty' };
  if (state.chamberReadyAtHostTimeMs > now) return { ...base, reason: 'not-ready' };

  const roundsRemaining = state.roundsRemaining - 1;
  const nextProcessed = [...state.processedShotIds, shotId].slice(-RAILGUN_PROCESSED_SHOT_LIMIT);
  const nextState: RailgunAuthorityState = {
    ...state,
    revision: state.revision + 1,
    status: roundsRemaining === 0 ? 'depleted' : 'held',
    roundsRemaining,
    chamberReadyAtHostTimeMs: roundsRemaining === 0 ? 0 : now + RAILGUN_RECHAMBER_MS,
    processedShotIds: nextProcessed,
  };
  return {
    state: nextState,
    accepted: true,
    duplicate: false,
    reason: 'accepted',
    damage: RAILGUN_DAMAGE,
    penetrationMultiplier: RAILGUN_PENETRATION_MULTIPLIER,
    adsAfterShot: false,
    rechamberMs: roundsRemaining === 0 ? 0 : RAILGUN_RECHAMBER_MS,
  };
}

export function dropRailgun(
  state: RailgunAuthorityState,
  playerId: string,
  position: readonly [number, number, number],
): { dropped: boolean; state: RailgunAuthorityState } {
  if (state.status !== 'held' || state.holderId !== playerId || state.roundsRemaining <= 0
    || position.length !== 3 || !position.every(Number.isFinite)) return { dropped: false, state };
  return {
    dropped: true,
    state: {
      ...state,
      revision: state.revision + 1,
      status: 'available',
      holderId: null,
      pickupPosition: copyPosition(position),
    },
  };
}

/** Railgun ammunition is a match-lifetime resource: no pickup, reload or range rule may replenish it. */
export function replenishRailgunAmmo(state: RailgunAuthorityState): { replenished: false; state: RailgunAuthorityState } {
  return { replenished: false, state };
}

export function isStaleRailgunAuthorityState(
  current: RailgunAuthorityState,
  incoming: RailgunAuthorityState,
): boolean {
  return incoming.generation < current.generation
    || incoming.generation === current.generation && incoming.revision < current.revision;
}

export function railgunStateResyncDue(lastSentAt: number, now: number): boolean {
  return validHostTime(now) && (!Number.isFinite(lastSentAt) || now - lastSentAt >= RAILGUN_STATE_RESYNC_MS);
}

export function railgunThermalTargetEligible(
  observer: Readonly<{ id: string; team: 0 | 1 }>,
  target: Readonly<{ id: string; team: 0 | 1; alive: boolean; kind: 'player' | 'bot' }>,
  mode: 'tdm' | 'ffa',
): boolean {
  if (!target.alive || observer.id === target.id) return false;
  return mode === 'ffa' || observer.team !== target.team;
}

export type RailgunClaimRequestMessage = Readonly<{
  type: 'railgun-claim-request';
  protocolVersion: number;
  by: string;
  generation: number;
  position: readonly [number, number, number];
  nonce: number;
}>;

export type RailgunShotRequestMessage = Readonly<{
  type: 'railgun-shot-request';
  protocolVersion: number;
  by: string;
  generation: number;
  shotId: string;
  origin: readonly [number, number, number];
  direction: readonly [number, number, number];
  fireTimeMs: number;
  nonce: number;
}>;

export type RailgunStateMessage = Readonly<{
  type: 'railgun-state';
  protocolVersion: number;
  by: string;
  state: RailgunAuthorityState;
  nonce: number;
}>;

export type RailgunShotOutcome = Readonly<{
  target: string;
  damageRequested: typeof RAILGUN_DAMAGE;
  damageApplied: number;
  resultingHealth: number;
  died: boolean;
  distanceMeters: number;
}>;

export type RailgunTargetCandidate = Readonly<{
  target: string;
  position: readonly [number, number, number];
  alive: boolean;
  hostile: boolean;
}>;

export type RailgunTargetAdmission = Readonly<{
  target: string;
  distanceMeters: number;
}>;

export type RailgunTargetAdmissionResult = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'invalid-ray' | 'invalid-candidate' | 'duplicate-candidate' | 'candidate-cap';
  targets: readonly RailgunTargetAdmission[];
}>;

/**
 * Host-only geometric oracle for the map-spanning shot. The caller supplies
 * current-life hostility; this function owns ray admission and deterministic
 * near-to-far ordering. Invalid or over-cap actor sets fail closed.
 */
export function admitRailgunTargets(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  candidates: readonly RailgunTargetCandidate[],
): RailgunTargetAdmissionResult {
  if (!isVector3(origin) || !isVector3(direction)) {
    return Object.freeze({ accepted: false, reason: 'invalid-ray', targets: Object.freeze([]) });
  }
  const magnitude = Math.hypot(direction[0], direction[1], direction[2]);
  if (magnitude < 0.96 || magnitude > 1.04) {
    return Object.freeze({ accepted: false, reason: 'invalid-ray', targets: Object.freeze([]) });
  }
  if (candidates.length > RAILGUN_MAX_TARGET_OUTCOMES) {
    return Object.freeze({ accepted: false, reason: 'candidate-cap', targets: Object.freeze([]) });
  }
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!validPlayerId(candidate.target) || !isVector3(candidate.position)
      || typeof candidate.alive !== 'boolean' || typeof candidate.hostile !== 'boolean') {
      return Object.freeze({ accepted: false, reason: 'invalid-candidate', targets: Object.freeze([]) });
    }
    if (ids.has(candidate.target)) {
      return Object.freeze({ accepted: false, reason: 'duplicate-candidate', targets: Object.freeze([]) });
    }
    ids.add(candidate.target);
  }
  const normalized = [direction[0] / magnitude, direction[1] / magnitude, direction[2] / magnitude] as const;
  const radiusSquared = RAILGUN_TARGET_RADIUS_M * RAILGUN_TARGET_RADIUS_M;
  const targets = candidates.flatMap((candidate): RailgunTargetAdmission[] => {
    if (!candidate.alive || !candidate.hostile) return [];
    const deltaX = candidate.position[0] - origin[0];
    const deltaY = candidate.position[1] - origin[1];
    const deltaZ = candidate.position[2] - origin[2];
    const distanceMeters = deltaX * normalized[0] + deltaY * normalized[1] + deltaZ * normalized[2];
    if (distanceMeters < 0.1 || distanceMeters > RAILGUN_BEAM_LENGTH_M) return [];
    const closestX = origin[0] + normalized[0] * distanceMeters;
    const closestY = origin[1] + normalized[1] * distanceMeters;
    const closestZ = origin[2] + normalized[2] * distanceMeters;
    const verticalExcess = Math.max(0, Math.abs(candidate.position[1] - closestY) - RAILGUN_TARGET_HALF_HEIGHT_M);
    const offRaySquared = (candidate.position[0] - closestX) ** 2
      + verticalExcess ** 2
      + (candidate.position[2] - closestZ) ** 2;
    return offRaySquared <= radiusSquared ? [{ target: candidate.target, distanceMeters }] : [];
  }).sort((left, right) => left.distanceMeters - right.distanceMeters || left.target.localeCompare(right.target));
  return Object.freeze({
    accepted: true,
    reason: 'accepted',
    targets: Object.freeze(targets.map((target) => Object.freeze(target))),
  });
}

export type RailgunBeamAuthority = Readonly<{
  generation: number;
  shotId: string;
  start: readonly [number, number, number];
  end: readonly [number, number, number];
}>;

export function createRailgunBeamAuthority(
  generation: number,
  shotId: string,
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
): RailgunBeamAuthority {
  const magnitude = Math.hypot(direction[0], direction[1], direction[2]);
  if (!Number.isSafeInteger(generation) || generation < 0
    || shotId.length < 8 || shotId.length > 128
    || !isVector3(origin) || !isVector3(direction)
    || magnitude < 0.96 || magnitude > 1.04) throw new Error('invalid authoritative railgun beam');
  const normalized = [direction[0] / magnitude, direction[1] / magnitude, direction[2] / magnitude] as const;
  return Object.freeze({
    generation,
    shotId,
    start: Object.freeze([...origin]) as unknown as readonly [number, number, number],
    end: Object.freeze([
      origin[0] + normalized[0] * RAILGUN_BEAM_LENGTH_M,
      origin[1] + normalized[1] * RAILGUN_BEAM_LENGTH_M,
      origin[2] + normalized[2] * RAILGUN_BEAM_LENGTH_M,
    ]) as unknown as readonly [number, number, number],
  });
}

export function isRailgunBeamAuthority(value: unknown): value is RailgunBeamAuthority {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const beam = value as Partial<RailgunBeamAuthority>;
  if (Object.keys(value).some((key) => key !== 'generation' && key !== 'shotId' && key !== 'start' && key !== 'end')
    || !Number.isSafeInteger(beam.generation) || Number(beam.generation) < 0
    || typeof beam.shotId !== 'string' || beam.shotId.length < 8 || beam.shotId.length > 128
    || !isVector3(beam.start) || !isVector3(beam.end)) return false;
  const length = Math.hypot(
    beam.end[0] - beam.start[0],
    beam.end[1] - beam.start[1],
    beam.end[2] - beam.start[2],
  );
  return Math.abs(length - RAILGUN_BEAM_LENGTH_M) <= 1e-4;
}

/** Host-authored result. Clients never infer railgun damage from their own raycast. */
export type RailgunShotResultMessage = Readonly<{
  type: 'railgun-shot-result';
  protocolVersion: number;
  by: string;
  forPlayerId: string;
  generation: number;
  shotId: string;
  status: 'accepted-hit' | 'accepted-miss' | 'rejected';
  reason: RailgunShotResult['reason'];
  outcomes: readonly RailgunShotOutcome[];
  beam: RailgunBeamAuthority | null;
  nonce: number;
}>;

function isVector3(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

const RAILGUN_AUTHORITY_STATE_KEYS = Object.freeze([
  'generation',
  'revision',
  'status',
  'spawnAtHostTimeMs',
  'spawnSite',
  'pickupPosition',
  'holderId',
  'roundsRemaining',
  'chamberReadyAtHostTimeMs',
  'announcementSent',
  'processedShotIds',
]);
const RAILGUN_SPAWN_SITE_KEYS = Object.freeze(['id', 'position']);
const RAILGUN_CLAIM_REQUEST_KEYS = Object.freeze([
  'type', 'protocolVersion', 'by', 'generation', 'position', 'nonce',
]);
const RAILGUN_SHOT_REQUEST_KEYS = Object.freeze([
  'type', 'protocolVersion', 'by', 'generation', 'shotId', 'origin', 'direction', 'fireTimeMs', 'nonce',
]);
const RAILGUN_STATE_MESSAGE_KEYS = Object.freeze([
  'type', 'protocolVersion', 'by', 'state', 'nonce',
]);
const RAILGUN_SHOT_RESULT_KEYS = Object.freeze([
  'type', 'protocolVersion', 'by', 'forPlayerId', 'generation', 'shotId', 'status', 'reason', 'outcomes', 'beam', 'nonce',
]);

export function isRailgunAuthorityState(value: unknown): value is RailgunAuthorityState {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !hasExactKeys(value, RAILGUN_AUTHORITY_STATE_KEYS)) return false;
  const state = value as Partial<RailgunAuthorityState>;
  return Number.isSafeInteger(state.generation) && Number(state.generation) >= 0
    && Number.isSafeInteger(state.revision) && Number(state.revision) >= 0
    && (state.status === 'disabled' || state.status === 'scheduled' || state.status === 'available' || state.status === 'held' || state.status === 'depleted')
    && (state.spawnAtHostTimeMs === null || validHostTime(Number(state.spawnAtHostTimeMs)))
    && (state.spawnSite === null || typeof state.spawnSite === 'object' && !Array.isArray(state.spawnSite)
      && hasExactKeys(state.spawnSite, RAILGUN_SPAWN_SITE_KEYS)
      && RAILGUN_UPPER_ROOM_SPAWN_SITES.some((site) => site.id === state.spawnSite?.id
        && isVector3(state.spawnSite.position) && site.position.every((valueAtAxis, axis) => valueAtAxis === state.spawnSite?.position[axis])))
    && (state.pickupPosition === null || isVector3(state.pickupPosition))
    && (state.holderId === null || typeof state.holderId === 'string' && validPlayerId(state.holderId))
    && Number.isSafeInteger(state.roundsRemaining) && Number(state.roundsRemaining) >= 0 && Number(state.roundsRemaining) <= RAILGUN_TOTAL_ROUNDS
    && validHostTime(Number(state.chamberReadyAtHostTimeMs))
    && typeof state.announcementSent === 'boolean'
    && Array.isArray(state.processedShotIds) && state.processedShotIds.length <= RAILGUN_PROCESSED_SHOT_LIMIT
    && state.processedShotIds.every((id) => typeof id === 'string' && id.length >= 8 && id.length <= 128)
    && new Set(state.processedShotIds).size === state.processedShotIds.length;
}

export function isRailgunProtocolMessage(value: unknown, protocolVersion: number): value is RailgunClaimRequestMessage | RailgunShotRequestMessage | RailgunStateMessage | RailgunShotResultMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message.protocolVersion !== protocolVersion || typeof message.by !== 'string' || !validPlayerId(message.by)
    || !Number.isSafeInteger(message.nonce) || Number(message.nonce) < 0) return false;
  if (message.type === 'railgun-claim-request') {
    return hasExactKeys(message, RAILGUN_CLAIM_REQUEST_KEYS)
      && Number.isSafeInteger(message.generation) && Number(message.generation) >= 0 && isVector3(message.position);
  }
  if (message.type === 'railgun-shot-request') {
    return hasExactKeys(message, RAILGUN_SHOT_REQUEST_KEYS)
      && Number.isSafeInteger(message.generation) && Number(message.generation) >= 0
      && typeof message.shotId === 'string' && message.shotId.length >= 8 && message.shotId.length <= 128
      && isVector3(message.origin) && isVector3(message.direction)
      && validHostTime(Number(message.fireTimeMs));
  }
  if (message.type === 'railgun-shot-result') {
    const outcomes = message.outcomes;
    const reasons = new Set<RailgunShotResult['reason']>(['accepted', 'not-holder', 'not-ready', 'empty', 'invalid', 'duplicate']);
    const accepted = message.status === 'accepted-hit' || message.status === 'accepted-miss';
    const beam = message.beam;
    return hasExactKeys(message, RAILGUN_SHOT_RESULT_KEYS)
      && typeof message.forPlayerId === 'string' && validPlayerId(message.forPlayerId)
      && Number.isSafeInteger(message.generation) && Number(message.generation) >= 0
      && typeof message.shotId === 'string' && message.shotId.length >= 8 && message.shotId.length <= 128
      && (message.status === 'accepted-hit' || message.status === 'accepted-miss' || message.status === 'rejected')
      && reasons.has(message.reason as RailgunShotResult['reason'])
      && (accepted
        ? message.reason === 'accepted' && isRailgunBeamAuthority(beam)
          && beam.generation === message.generation && beam.shotId === message.shotId
        : message.reason !== 'accepted' && beam === null)
      && Array.isArray(outcomes) && outcomes.length <= RAILGUN_MAX_TARGET_OUTCOMES
      && (message.status === 'accepted-hit' ? outcomes.length >= 1 : outcomes.length === 0)
      && new Set(outcomes.map((outcome) => outcome && typeof outcome === 'object'
        ? (outcome as Partial<RailgunShotOutcome>).target : null)).size === outcomes.length
      && outcomes.every((outcome) => {
        if (!outcome || typeof outcome !== 'object') return false;
        const candidate = outcome as Partial<RailgunShotOutcome>;
        return Object.keys(outcome).length === 6
          && Object.keys(outcome).every((key) => key === 'target' || key === 'damageRequested' || key === 'damageApplied'
            || key === 'resultingHealth' || key === 'died' || key === 'distanceMeters')
          && typeof candidate.target === 'string' && validPlayerId(candidate.target)
          && candidate.target !== message.forPlayerId
          && candidate.damageRequested === RAILGUN_DAMAGE
          && Number.isFinite(candidate.damageApplied) && Number(candidate.damageApplied) > 0
          && Number(candidate.damageApplied) <= RAILGUN_DAMAGE
          && Number.isFinite(candidate.resultingHealth) && Number(candidate.resultingHealth) >= 0 && Number(candidate.resultingHealth) <= 100
          && typeof candidate.died === 'boolean' && candidate.died === (candidate.resultingHealth === 0)
          && Number.isFinite(candidate.distanceMeters) && Number(candidate.distanceMeters) >= 0.1
          && Number(candidate.distanceMeters) <= RAILGUN_BEAM_LENGTH_M;
      })
      && outcomes.every((outcome, index) => {
        if (index === 0) return true;
        const previous = outcomes[index - 1] as RailgunShotOutcome;
        const current = outcome as RailgunShotOutcome;
        return current.distanceMeters > previous.distanceMeters
          || current.distanceMeters === previous.distanceMeters && current.target.localeCompare(previous.target) > 0;
      });
  }
  return message.type === 'railgun-state'
    && hasExactKeys(message, RAILGUN_STATE_MESSAGE_KEYS)
    && isRailgunAuthorityState(message.state);
}
