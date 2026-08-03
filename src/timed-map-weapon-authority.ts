export const TIMED_MAP_WEAPON_IDS = Object.freeze(['flamethrower', 'flare-gun'] as const);
export type TimedMapWeaponId = (typeof TIMED_MAP_WEAPON_IDS)[number];

export type TimedMapWeaponDefinition = Readonly<{
  weaponId: TimedMapWeaponId;
  arenaId: 'rustworks-1v1' | 'skyline-terminal';
  announcement: 'RARE WEAPON SPAWNED';
  spawnPosition: readonly [number, number, number];
  totalShots: number;
}>;

/**
 * These are gameplay positions, not decorative placements. RustRig's pickup is
 * on the accessible upper deck and Terminal's is on the cabin floor at the
 * midpoint of the aircraft aisle.
 */
export const TIMED_MAP_WEAPON_DEFINITIONS: Readonly<Record<TimedMapWeaponId, TimedMapWeaponDefinition>> = Object.freeze({
  flamethrower: Object.freeze({
    weaponId: 'flamethrower',
    arenaId: 'rustworks-1v1',
    announcement: 'RARE WEAPON SPAWNED',
    spawnPosition: Object.freeze([0.4, 8.64, 0.2] as const),
    totalShots: 200,
  }),
  'flare-gun': Object.freeze({
    weaponId: 'flare-gun',
    arenaId: 'skyline-terminal',
    announcement: 'RARE WEAPON SPAWNED',
    spawnPosition: Object.freeze([0, 3.08, 2] as const),
    totalShots: 6,
  }),
});

export type TimedMapWeaponAuthorityState = Readonly<{
  generation: number;
  revision: number;
  weaponId: TimedMapWeaponId;
  arenaId: TimedMapWeaponDefinition['arenaId'];
  status: 'disabled' | 'scheduled' | 'available' | 'held' | 'depleted';
  spawnAtHostTimeMs: number | null;
  pickupPosition: readonly [number, number, number] | null;
  holderId: string | null;
  shotsRemaining: number;
  announcementSent: boolean;
  processedShotIds: readonly string[];
}>;

export type TimedMapWeaponAdvance = Readonly<{
  state: TimedMapWeaponAuthorityState;
  spawned: boolean;
  announcement: TimedMapWeaponDefinition['announcement'] | null;
}>;

export type TimedMapWeaponShotConsumption = Readonly<{
  state: TimedMapWeaponAuthorityState;
  accepted: boolean;
  duplicate: boolean;
  reason: 'accepted' | 'invalid' | 'duplicate' | 'not-holder' | 'empty';
}>;

// Keep the complete two-weapon state comfortably below the 16 KiB protocol
// budget even when every retained identifier is at its admitted maximum.
const PROCESSED_SHOT_LIMIT = 32;
const MAX_PROCESSED_SHOT_ID_LENGTH = 96;

function validGeneration(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validHostTime(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validPlayerId(value: string): boolean {
  return value.length > 0 && value.length <= 80;
}

function copyPosition(position: readonly [number, number, number]): readonly [number, number, number] {
  return Object.freeze([position[0], position[1], position[2]] as const);
}

function disabledState(weaponId: TimedMapWeaponId, generation: number): TimedMapWeaponAuthorityState {
  const definition = TIMED_MAP_WEAPON_DEFINITIONS[weaponId];
  return Object.freeze({
    generation,
    revision: 0,
    weaponId,
    arenaId: definition.arenaId,
    status: 'disabled',
    spawnAtHostTimeMs: null,
    pickupPosition: null,
    holderId: null,
    shotsRemaining: definition.totalShots,
    announcementSent: false,
    processedShotIds: Object.freeze([]),
  });
}

/** Host-only initialization. The pickup transition is exactly match midpoint. */
export function createTimedMapWeaponAuthority(
  weaponId: TimedMapWeaponId,
  arenaId: string,
  matchActiveAtHostTimeMs: number,
  matchEndsAtHostTimeMs: number,
  generation = 1,
): TimedMapWeaponAuthorityState {
  const definition = TIMED_MAP_WEAPON_DEFINITIONS[weaponId];
  if (!validGeneration(generation)
    || arenaId !== definition.arenaId
    || !validHostTime(matchActiveAtHostTimeMs)
    || !validHostTime(matchEndsAtHostTimeMs)
    || matchEndsAtHostTimeMs <= matchActiveAtHostTimeMs) {
    return disabledState(weaponId, validGeneration(generation) ? generation : 0);
  }
  return Object.freeze({
    generation,
    revision: 0,
    weaponId,
    arenaId: definition.arenaId,
    status: 'scheduled',
    spawnAtHostTimeMs: matchActiveAtHostTimeMs
      + (matchEndsAtHostTimeMs - matchActiveAtHostTimeMs) / 2,
    pickupPosition: copyPosition(definition.spawnPosition),
    holderId: null,
    shotsRemaining: definition.totalShots,
    announcementSent: false,
    processedShotIds: Object.freeze([]),
  });
}

export function advanceTimedMapWeaponAuthority(
  state: TimedMapWeaponAuthorityState,
  now: number,
): TimedMapWeaponAdvance {
  if (state.status !== 'scheduled' || state.spawnAtHostTimeMs === null
    || !validHostTime(now) || now < state.spawnAtHostTimeMs) {
    return Object.freeze({ state, spawned: false, announcement: null });
  }
  const announce = !state.announcementSent;
  const next = Object.freeze({
    ...state,
    revision: state.revision + 1,
    status: 'available' as const,
    announcementSent: true,
  });
  return Object.freeze({
    state: next,
    spawned: true,
    announcement: announce ? TIMED_MAP_WEAPON_DEFINITIONS[state.weaponId].announcement : null,
  });
}

export function claimTimedMapWeapon(
  state: TimedMapWeaponAuthorityState,
  playerId: string,
  generation: number,
): Readonly<{ accepted: boolean; state: TimedMapWeaponAuthorityState }> {
  if (state.status !== 'available' || state.generation !== generation
    || !validPlayerId(playerId) || state.shotsRemaining <= 0) {
    return Object.freeze({ accepted: false, state });
  }
  return Object.freeze({
    accepted: true,
    state: Object.freeze({
      ...state,
      revision: state.revision + 1,
      status: 'held' as const,
      pickupPosition: null,
      holderId: playerId,
    }),
  });
}

/** Secure Gun Range station grant; never valid from a normal map or guest. */
export function grantTrainingTimedMapWeapon(
  state: TimedMapWeaponAuthorityState,
  playerId: string,
  context: Readonly<{
    arenaId: 'gun-range';
    stationKind: 'secure-test-bay';
    authorityRole: 'offline' | 'host';
  }>,
): Readonly<{ accepted: boolean; state: TimedMapWeaponAuthorityState }> {
  if (!validPlayerId(playerId) || context.arenaId !== 'gun-range'
    || context.stationKind !== 'secure-test-bay'
    || context.authorityRole !== 'offline' && context.authorityRole !== 'host') {
    return Object.freeze({ accepted: false, state });
  }
  const definition = TIMED_MAP_WEAPON_DEFINITIONS[state.weaponId];
  return Object.freeze({
    accepted: true,
    state: Object.freeze({
      ...state,
      revision: state.revision + 1,
      status: 'held' as const,
      spawnAtHostTimeMs: null,
      pickupPosition: null,
      holderId: playerId,
      shotsRemaining: definition.totalShots,
      announcementSent: true,
      processedShotIds: Object.freeze([]),
    }),
  });
}

/**
 * Host-owned finite-ammunition seal for the two timed pickups. A duplicate
 * client request cannot consume a second round, and a non-holder cannot fire.
 */
export function consumeTimedMapWeaponShot(
  state: TimedMapWeaponAuthorityState,
  playerId: string,
  shotId: string,
): TimedMapWeaponShotConsumption {
  const base = { state, accepted: false, duplicate: false } as const;
  if (!validPlayerId(playerId) || shotId.length < 8 || shotId.length > MAX_PROCESSED_SHOT_ID_LENGTH) {
    return Object.freeze({ ...base, reason: 'invalid' as const });
  }
  if (state.processedShotIds.includes(shotId)) {
    return Object.freeze({ ...base, duplicate: true, reason: 'duplicate' as const });
  }
  if (state.holderId !== playerId || state.status !== 'held' && state.status !== 'depleted') {
    return Object.freeze({ ...base, reason: 'not-holder' as const });
  }
  if (state.shotsRemaining <= 0) return Object.freeze({ ...base, reason: 'empty' as const });
  const shotsRemaining = state.shotsRemaining - 1;
  return Object.freeze({
    accepted: true,
    duplicate: false,
    reason: 'accepted' as const,
    state: Object.freeze({
      ...state,
      revision: state.revision + 1,
      status: shotsRemaining === 0 ? 'depleted' as const : 'held' as const,
      shotsRemaining,
      processedShotIds: Object.freeze([...state.processedShotIds, shotId].slice(-PROCESSED_SHOT_LIMIT)),
    }),
  });
}

export function dropTimedMapWeapon(
  state: TimedMapWeaponAuthorityState,
  playerId: string,
  position: readonly [number, number, number],
): Readonly<{ dropped: boolean; state: TimedMapWeaponAuthorityState }> {
  if (state.holderId !== playerId || state.status !== 'held' && state.status !== 'depleted'
    || position.length !== 3 || !position.every(Number.isFinite)) {
    return Object.freeze({ dropped: false, state });
  }
  if (state.status === 'depleted' || state.shotsRemaining <= 0) {
    return Object.freeze({
      dropped: true,
      state: Object.freeze({
        ...state,
        revision: state.revision + 1,
        status: 'depleted' as const,
        pickupPosition: null,
        holderId: null,
        shotsRemaining: 0,
      }),
    });
  }
  return Object.freeze({
    dropped: true,
    state: Object.freeze({
      ...state,
      revision: state.revision + 1,
      status: 'available' as const,
      pickupPosition: copyPosition(position),
      holderId: null,
    }),
  });
}

export function isStaleTimedMapWeaponAuthority(
  current: TimedMapWeaponAuthorityState,
  incoming: TimedMapWeaponAuthorityState,
): boolean {
  return current.weaponId !== incoming.weaponId
    || incoming.generation < current.generation
    || incoming.generation === current.generation && incoming.revision < current.revision;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

/** Strict decoder used by the multiplayer protocol; unknown fields fail closed. */
export function isTimedMapWeaponAuthorityState(value: unknown): value is TimedMapWeaponAuthorityState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (!exactKeys(state, [
    'generation', 'revision', 'weaponId', 'arenaId', 'status', 'spawnAtHostTimeMs',
    'pickupPosition', 'holderId', 'shotsRemaining', 'announcementSent', 'processedShotIds',
  ])) return false;
  if (!TIMED_MAP_WEAPON_IDS.includes(state.weaponId as TimedMapWeaponId)) return false;
  const definition = TIMED_MAP_WEAPON_DEFINITIONS[state.weaponId as TimedMapWeaponId];
  const pickupPosition = state.pickupPosition;
  const processedShotIds = state.processedShotIds;
  return state.arenaId === definition.arenaId
    && validGeneration(Number(state.generation))
    && Number.isSafeInteger(state.revision) && Number(state.revision) >= 0
    && ['disabled', 'scheduled', 'available', 'held', 'depleted'].includes(String(state.status))
    && (state.spawnAtHostTimeMs === null || validHostTime(Number(state.spawnAtHostTimeMs)))
    && (pickupPosition === null || Array.isArray(pickupPosition)
      && pickupPosition.length === 3 && pickupPosition.every(Number.isFinite))
    && (state.holderId === null || typeof state.holderId === 'string' && validPlayerId(state.holderId))
    && Number.isSafeInteger(state.shotsRemaining) && Number(state.shotsRemaining) >= 0
    && Number(state.shotsRemaining) <= definition.totalShots
    && typeof state.announcementSent === 'boolean'
    && Array.isArray(processedShotIds) && processedShotIds.length <= PROCESSED_SHOT_LIMIT
    && processedShotIds.every((shotId) => typeof shotId === 'string' && shotId.length >= 8 && shotId.length <= MAX_PROCESSED_SHOT_ID_LENGTH)
    && new Set(processedShotIds).size === processedShotIds.length
    && (state.status !== 'scheduled' || state.spawnAtHostTimeMs !== null && pickupPosition !== null && state.holderId === null)
    && (state.status !== 'available' || pickupPosition !== null && state.holderId === null && Number(state.shotsRemaining) > 0)
    && (state.status !== 'held' || pickupPosition === null && typeof state.holderId === 'string' && Number(state.shotsRemaining) > 0)
    && (state.status !== 'depleted' || pickupPosition === null && Number(state.shotsRemaining) === 0)
    && (state.status !== 'disabled' || state.spawnAtHostTimeMs === null && pickupPosition === null && state.holderId === null);
}
