import type { MatchState } from './gameplay';

export const GUN_RANGE_MATCH_CLOCK_SCHEMA_VERSION = 1;

export type GunRangeMatchClockSnapshot = Readonly<{
  schemaVersion: typeof GUN_RANGE_MATCH_CLOCK_SCHEMA_VERSION;
  revision: number;
  paused: boolean;
  remainingMs: number;
  sampledAtHostTimeMs: number;
}>;

export type GunRangeClockParticipant = Readonly<{
  id: string;
  admitted: boolean;
  connected: boolean;
  alive: boolean;
  position: Readonly<{ x: number; y: number; z: number }>;
}>;

export type GunRangeMatchClockStep = Readonly<{
  state: GunRangeMatchClockSnapshot;
  transition: 'paused' | 'resumed' | null;
}>;

const MAX_CLOCK_REVISION = 1_000_000_000;

function finiteClockInputs(...values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

export function isGunRangeMatchClockSnapshot(
  value: unknown,
  durationMs?: number,
): value is GunRangeMatchClockSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const exactKeys = ['schemaVersion', 'revision', 'paused', 'remainingMs', 'sampledAtHostTimeMs'];
  const boundedDuration = durationMs === undefined
    || Number.isFinite(durationMs) && durationMs >= 0 && Number(state.remainingMs) <= durationMs;
  return Object.keys(state).length === exactKeys.length
    && exactKeys.every((key) => Object.hasOwn(state, key))
    && state.schemaVersion === GUN_RANGE_MATCH_CLOCK_SCHEMA_VERSION
    && Number.isSafeInteger(state.revision)
    && Number(state.revision) >= 0
    && Number(state.revision) <= MAX_CLOCK_REVISION
    && typeof state.paused === 'boolean'
    && Number.isFinite(state.remainingMs)
    && Number(state.remainingMs) >= 0
    && boundedDuration
    && Number.isFinite(state.sampledAtHostTimeMs)
    && Number(state.sampledAtHostTimeMs) >= 0;
}

export function createGunRangeMatchClockSnapshot(
  durationMs: number,
  sampledAtHostTimeMs: number,
  revision = 0,
): GunRangeMatchClockSnapshot {
  const state = Object.freeze({
    schemaVersion: GUN_RANGE_MATCH_CLOCK_SCHEMA_VERSION,
    revision,
    paused: false,
    remainingMs: durationMs,
    sampledAtHostTimeMs,
  });
  if (!isGunRangeMatchClockSnapshot(state, durationMs)) {
    throw new TypeError('Gun Range match clock requires bounded duration, revision, and host time');
  }
  return state;
}

export function advanceGunRangeMatchClock(
  state: GunRangeMatchClockSnapshot,
  nowHostTimeMs: number,
  pauseRequested: boolean,
  durationMs: number,
): GunRangeMatchClockStep {
  if (!isGunRangeMatchClockSnapshot(state, durationMs)
    || !finiteClockInputs(nowHostTimeMs, durationMs)
    || nowHostTimeMs < state.sampledAtHostTimeMs
    || durationMs < 0) {
    throw new TypeError('Gun Range clock step requires a valid state and monotonic host time');
  }
  const elapsedMs = state.paused ? 0 : nowHostTimeMs - state.sampledAtHostTimeMs;
  const remainingMs = Math.max(0, Math.min(durationMs, state.remainingMs - elapsedMs));
  const transition = pauseRequested === state.paused
    ? null
    : pauseRequested ? 'paused' : 'resumed';
  return Object.freeze({
    state: Object.freeze({
      schemaVersion: GUN_RANGE_MATCH_CLOCK_SCHEMA_VERSION,
      revision: transition === null
        ? state.revision
        : Math.min(MAX_CLOCK_REVISION, state.revision + 1),
      paused: pauseRequested,
      remainingMs,
      sampledAtHostTimeMs: nowHostTimeMs,
    }),
    transition,
  });
}

export function restoreGunRangeMatchClock(
  state: GunRangeMatchClockSnapshot,
  nowHostTimeMs: number,
  downtimeMs: number,
  durationMs: number,
): GunRangeMatchClockSnapshot {
  if (!isGunRangeMatchClockSnapshot(state, durationMs)
    || !finiteClockInputs(nowHostTimeMs, downtimeMs, durationMs)
    || downtimeMs < 0) {
    throw new TypeError('Gun Range clock restore requires a valid checkpoint and non-negative downtime');
  }
  return Object.freeze({
    ...state,
    remainingMs: state.paused
      ? state.remainingMs
      : Math.max(0, state.remainingMs - downtimeMs),
    sampledAtHostTimeMs: nowHostTimeMs,
  });
}

export function gunRangeMatchClockRemainingAt(
  state: GunRangeMatchClockSnapshot,
  nowHostTimeMs: number,
  durationMs: number,
): number {
  return advanceGunRangeMatchClock(state, nowHostTimeMs, state.paused, durationMs).state.remainingMs;
}

export function projectGunRangeMatchClock(
  state: GunRangeMatchClockSnapshot,
  sampleAtLocalMonoMs: number,
  nowLocalMonoMs: number,
  durationMs: number,
): Pick<MatchState, 'phaseStartedAt' | 'endsAt'> {
  if (!isGunRangeMatchClockSnapshot(state, durationMs)
    || !finiteClockInputs(sampleAtLocalMonoMs, nowLocalMonoMs, durationMs)
    || durationMs < 0) {
    throw new TypeError('Gun Range clock projection requires a valid state and local clock mapping');
  }
  const elapsedSinceSampleMs = state.paused ? 0 : Math.max(0, nowLocalMonoMs - sampleAtLocalMonoMs);
  const remainingMs = Math.max(0, Math.min(durationMs, state.remainingMs - elapsedSinceSampleMs));
  const endsAt = nowLocalMonoMs + remainingMs;
  return Object.freeze({ phaseStartedAt: endsAt - durationMs, endsAt });
}

/**
 * A replica may project a few milliseconds ahead of the host. Keep it active
 * at zero until the reliable host lobby revision declares the round ended, so
 * a delayed pause edge can still move the shared clock back above zero.
 */
export function holdGunRangeReplicaAtAuthorityBoundary(
  previous: MatchState,
  advanced: MatchState,
  hostLobbyStillActive: boolean,
): MatchState {
  return hostLobbyStillActive
    && previous.phase === 'active'
    && advanced.phase === 'ended'
    && advanced.endReason === 'time'
    ? { ...previous, endsAt: advanced.endsAt }
    : advanced;
}

export function gunRangeTestBayOccupants(
  participants: readonly GunRangeClockParticipant[],
  bounds: Readonly<{ minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }>,
): readonly string[] {
  if (!finiteClockInputs(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, bounds.minZ, bounds.maxZ)
    || bounds.minX > bounds.maxX || bounds.minY > bounds.maxY || bounds.minZ > bounds.maxZ) {
    throw new TypeError('Gun Range test-bay occupancy requires finite ordered bounds');
  }
  return Object.freeze(participants
    .filter((participant) => participant.admitted && participant.connected && participant.alive
      && finiteClockInputs(participant.position.x, participant.position.y, participant.position.z)
      && participant.position.x >= bounds.minX && participant.position.x <= bounds.maxX
      && participant.position.y >= bounds.minY && participant.position.y <= bounds.maxY
      && participant.position.z >= bounds.minZ && participant.position.z <= bounds.maxZ)
    .map((participant) => participant.id)
    .sort());
}
