import type { Team } from './protocol';
import { isArenaId, type ArenaId } from './arena-identity';
import { isHostedBotCount, type HostedBotCount } from './hosted-bots';
import { isDhv, type Dhv } from './handicap';
import {
  isGunRangeMatchClockSnapshot,
  type GunRangeMatchClockSnapshot,
} from './gun-range-match-clock-authority';
import { GUN_RANGE_ROUND_MS } from './gun-range-rules';
import type { GunRangeTestBayDoorState } from './gun-range-test-bay';
import { isSquadColor, isSquadName, type SquadColor } from './squad-presentation';
import { isSelectableOperatorSkinId } from './operator-skin-catalog'; // HF-360
import { isOperatorStanceId } from './operator-appearance-catalog'; // HF-382 replication

export const ROOM_CAPACITIES = [4, 6] as const;
export type RoomCapacity = typeof ROOM_CAPACITIES[number];
export type MatchMode = 'tdm' | 'ffa' | 'domination';
export type LobbyPhase = 'waiting' | 'countdown' | 'active' | 'ended';
export type MultiplayerArenaId = ArenaId;

export type PrivateMatchConfig = Readonly<{
  arenaId: MultiplayerArenaId;
  mode: MatchMode;
  capacity: RoomCapacity;
  hostedBotCount: HostedBotCount;
  autoBalance: boolean;
  durationMs: number;
  /** HF-377: host-settable kill limit replicated as part of the match
   * contract. `null` keeps the historical uncapped score race. */
  scoreLimit: number | null;
}>;

export type LobbyMember = Readonly<{
  id: string;
  name: string;
  team: Team;
  ready: boolean;
  connected: boolean;
  pingMs: number | null;
  dhv: Dhv;
  /**
   * HF-328: canonical colour-name identity stamped host-side from `team`
   * (AQUA / CORAL) via team-prescription.ts; team remains the authority
   * boundary. Optional and bounded-tolerant so pre-Pass-74 checkpoints and
   * rejoin envelopes still restore — renderers collapse any legacy free-form
   * value back to the canonical pair.
   */
  squadName?: string;
  squadColor?: SquadColor;
  /** HF-360: host-validated operator-skin selection; absent means default. */
  skinId?: string;
  /** HF-382: replicated idle stance for the peer's third-person presentation.
   * Optional and tolerant exactly like skinId, so pre-Pass-81 checkpoints and
   * lobbies still validate; renderers fall back to the catalog default. */
  stanceId?: string;
}>;

export type PlayerScore = Readonly<{
  id: string;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageTaken: number;
  rangeScore?: number;
  rangeHits?: number;
  rangeShots?: number;
}>;

/** HF-347: host-authoritative lifecycle state of one gun-range training dummy.
 * Pose needs no replication (it is a pure function of host time); active,
 * health and the exact host respawn timestamp are the replicated truth. */
export type GunRangeDummySnapshotEntry = Readonly<{
  id: string;
  active: boolean;
  health: number;
  respawnAtHostTimeMs: number;
}>;

export type LobbySnapshot = Readonly<{
  revision: number;
  hostId: string;
  phase: LobbyPhase;
  config: PrivateMatchConfig;
  members: readonly LobbyMember[];
  scores: readonly PlayerScore[];
  snapshotHostTimeMs: number;
  activeAtHostTimeMs: number | null;
  activeAtEpochMs: number | null;
  matchClock: GunRangeMatchClockSnapshot | null;
  testBayDoor: GunRangeTestBayDoorState | null;
  /** HF-347: absent on snapshots from hosts predating the dummy authority;
   * null outside an active gun-range match. Guests reconcile every heartbeat. */
  testDummies?: readonly GunRangeDummySnapshotEntry[] | null;
  /** Owner 2026-08-30: present on active Domination matches; null otherwise.
   * Optional so pre-Domination hosts still validate. */
  domination?: DominationLobbyState | null;
}>;

export const DEFAULT_PRIVATE_MATCH_CONFIG: PrivateMatchConfig = Object.freeze({
  arenaId: 'atomic-acres',
  // FFA is the least surprising lobby default. Team Deathmatch remains an
  // explicit host selection and still owns team balancing/colour semantics.
  mode: 'ffa',
  capacity: 4,
  hostedBotCount: 0,
  autoBalance: true,
  durationMs: 300_000,
  scoreLimit: null,
});

/** Owner 2026-08-30: replicated Domination zone truth (host-authoritative). */
export type DominationZoneSnapshotEntry = Readonly<{
  id: 'A' | 'B' | 'C';
  owner: Team | null;
  capturingTeam: Team | null;
  /** 0..1 toward the capturing team's current ownership flip. */
  progress: number;
  contested: boolean;
}>;
export type DominationLobbyState = Readonly<{
  zones: readonly DominationZoneSnapshotEntry[];
  scores: readonly [number, number];
}>;

export function isDominationLobbyState(value: unknown): value is DominationLobbyState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.zones) || state.zones.length !== 3) return false;
  const ids = new Set<string>();
  for (const zone of state.zones as Array<Record<string, unknown>>) {
    if (!zone || typeof zone !== 'object') return false;
    if (zone.id !== 'A' && zone.id !== 'B' && zone.id !== 'C') return false;
    ids.add(zone.id as string);
    if (zone.owner !== null && zone.owner !== 0 && zone.owner !== 1) return false;
    if (zone.capturingTeam !== null && zone.capturingTeam !== 0 && zone.capturingTeam !== 1) return false;
    if (typeof zone.progress !== 'number' || !Number.isFinite(zone.progress) || zone.progress < 0 || zone.progress > 1) return false;
    if (typeof zone.contested !== 'boolean') return false;
  }
  if (ids.size !== 3) return false;
  return Array.isArray(state.scores) && state.scores.length === 2
    && (state.scores as unknown[]).every((score) => typeof score === 'number' && Number.isSafeInteger(score) && score >= 0 && score <= 100_000);
}

export const REJOIN_GRACE_MS = 90_000;
export const MAX_PRIVATE_MATCH_DURATION_MS = 900_000;
// A reclaimed host has a fresh performance-time origin. Preserve the original
// match start as a bounded historical timestamp so guests can reconstruct the
// remaining clock instead of rejecting an otherwise valid recovery envelope.
export const MIN_RECOVERED_HOST_START_TIME_MS = -MAX_PRIVATE_MATCH_DURATION_MS;
export const MAX_HOST_START_FUTURE_LEAD_MS = 10_000;

export function rejoinReservationExpired(disconnectedAtMonoMs: number, nowMonoMs: number): boolean {
  return Number.isFinite(disconnectedAtMonoMs) && Number.isFinite(nowMonoMs)
    && nowMonoMs - disconnectedAtMonoMs >= REJOIN_GRACE_MS;
}
export const LOBBY_START_LEAD_MS = 5_000;
export const CLOCK_PING_INTERVAL_MS = 2_000;
export const MAX_CLOCK_RTT_MS = 5_000;

export function isRoomCapacity(value: unknown): value is RoomCapacity {
  return value === 4 || value === 6;
}

export function isMatchMode(value: unknown): value is MatchMode {
  // Owner 2026-08-30: Domination ships with the Test2 arena.
  return value === 'tdm' || value === 'ffa' || value === 'domination';
}

/** HF-377: the only kill limits a lobby can publish. `null` means uncapped and
 * is rendered as OFF; every other entry is a first-to-N kills target applied
 * identically to TDM squads and FFA leaders through MatchRules.scoreLimit. */
export const LOBBY_KILL_LIMITS: readonly (number | null)[] = Object.freeze([null, 10, 25, 50, 100]);
/** HF-377: the only match durations a lobby can publish, in milliseconds.
 * Bounded by MAX_PRIVATE_MATCH_DURATION_MS below. */
export const LOBBY_TIME_LIMITS_MS: readonly number[] = Object.freeze([120_000, 300_000, 600_000, 900_000]);

export function isLobbyKillLimit(value: unknown): value is number | null {
  return value === null
    || typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 999;
}

export function isLobbyTimeLimitMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
    && value >= 60_000 && value <= MAX_PRIVATE_MATCH_DURATION_MS;
}

export function isPrivateMatchConfig(value: unknown): value is PrivateMatchConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return isArenaId(config.arenaId)
    && isMatchMode(config.mode)
    && isRoomCapacity(config.capacity)
    && isHostedBotCount(config.hostedBotCount)
    && typeof config.autoBalance === 'boolean'
    && isLobbyTimeLimitMs(config.durationMs)
    && isLobbyKillLimit(config.scoreLimit)
    && (config.arenaId !== 'gun-range'
      || config.mode === 'ffa'
        && config.hostedBotCount === 0
        && config.autoBalance === false
        && config.durationMs === GUN_RANGE_ROUND_MS
        && config.scoreLimit === null)
    // Owner 2026-08-30: Domination is authored for Test2's three zones only.
    && (config.mode !== 'domination' || config.arenaId === 'test2');
}

export function isLobbyMember(value: unknown): value is LobbyMember {
  if (!value || typeof value !== 'object') return false;
  const member = value as Record<string, unknown>;
  return typeof member.id === 'string' && member.id.length > 0 && member.id.length <= 80
    && typeof member.name === 'string' && member.name.length > 0 && member.name.length <= 20
    && (member.team === 0 || member.team === 1)
    && typeof member.ready === 'boolean'
    && typeof member.connected === 'boolean'
    && isDhv(member.dhv)
    && (member.squadName === undefined || isSquadName(member.squadName))
    && (member.squadColor === undefined || isSquadColor(member.squadColor))
    && (member.skinId === undefined || isSelectableOperatorSkinId(member.skinId))
    && (member.stanceId === undefined || isOperatorStanceId(member.stanceId))
    && (member.pingMs === null || Number.isFinite(member.pingMs) && Number(member.pingMs) >= 0 && Number(member.pingMs) <= MAX_CLOCK_RTT_MS);
}

export function isPlayerScore(value: unknown): value is PlayerScore {
  if (!value || typeof value !== 'object') return false;
  const score = value as Record<string, unknown>;
  return typeof score.id === 'string' && score.id.length > 0 && score.id.length <= 80
    && Number.isSafeInteger(score.kills) && Number(score.kills) >= 0 && Number(score.kills) <= 500
    && Number.isSafeInteger(score.deaths) && Number(score.deaths) >= 0 && Number(score.deaths) <= 500
    && Number.isSafeInteger(score.damageDealt) && Number(score.damageDealt) >= 0 && Number(score.damageDealt) <= 1_000_000
    && Number.isSafeInteger(score.damageTaken) && Number(score.damageTaken) >= 0 && Number(score.damageTaken) <= 1_000_000
    && (score.rangeScore === undefined || Number.isSafeInteger(score.rangeScore) && Number(score.rangeScore) >= 0 && Number(score.rangeScore) <= 10_000_000)
    && (score.rangeHits === undefined || Number.isSafeInteger(score.rangeHits) && Number(score.rangeHits) >= 0 && Number(score.rangeHits) <= 100_000)
    && (score.rangeShots === undefined || Number.isSafeInteger(score.rangeShots) && Number(score.rangeShots) >= 0 && Number(score.rangeShots) <= 100_000);
}

function isGunRangeDummySnapshotEntry(value: unknown): value is GunRangeDummySnapshotEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const keys = ['id', 'active', 'health', 'respawnAtHostTimeMs'];
  return Object.keys(entry).length === keys.length
    && keys.every((key) => Object.hasOwn(entry, key))
    && typeof entry.id === 'string' && entry.id.startsWith('test-dummy-') && entry.id.length <= 80
    && typeof entry.active === 'boolean'
    && Number.isFinite(entry.health) && Number(entry.health) >= 0 && Number(entry.health) <= 500
    && Number.isFinite(entry.respawnAtHostTimeMs) && Number(entry.respawnAtHostTimeMs) >= 0
    && (entry.active === false || Number(entry.health) > 0);
}

function isLobbyTestBayDoorState(value: unknown): value is GunRangeTestBayDoorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  const keys = ['phase', 'openness', 'updatedAtMs', 'thumpSequence'];
  return Object.keys(state).length === keys.length
    && keys.every((key) => Object.hasOwn(state, key))
    && (state.phase === 'closed' || state.phase === 'opening' || state.phase === 'open' || state.phase === 'closing')
    && Number.isFinite(state.openness) && Number(state.openness) >= 0 && Number(state.openness) <= 1
    && Number.isFinite(state.updatedAtMs) && Number(state.updatedAtMs) >= 0
    && Number.isSafeInteger(state.thumpSequence) && Number(state.thumpSequence) >= 0
    && Number(state.thumpSequence) <= 1_000_000_000
    && (state.phase !== 'closed' || state.openness === 0)
    && (state.phase !== 'open' || state.openness === 1);
}

export function emptyPlayerScore(id: string): PlayerScore {
  return { id, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0 };
}

export function recordPlayerDamage(
  scores: ReadonlyMap<string, PlayerScore>,
  attackerId: string,
  victimId: string,
  damage: number,
): Map<string, PlayerScore> {
  const next = new Map(scores);
  if (attackerId === victimId || !Number.isFinite(damage) || damage <= 0) return next;
  const admittedDamage = Math.max(1, Math.round(damage));
  const attacker = next.get(attackerId) ?? emptyPlayerScore(attackerId);
  const victim = next.get(victimId) ?? emptyPlayerScore(victimId);
  next.set(attackerId, { ...attacker, damageDealt: Math.min(1_000_000, attacker.damageDealt + admittedDamage) });
  next.set(victimId, { ...victim, damageTaken: Math.min(1_000_000, victim.damageTaken + admittedDamage) });
  return next;
}

export function isLobbySnapshot(value: unknown): value is LobbySnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  if (!Number.isSafeInteger(snapshot.revision) || Number(snapshot.revision) < 0) return false;
  if (typeof snapshot.hostId !== 'string' || snapshot.hostId.length < 1 || snapshot.hostId.length > 80) return false;
  if (snapshot.phase !== 'waiting' && snapshot.phase !== 'countdown' && snapshot.phase !== 'active' && snapshot.phase !== 'ended') return false;
  if (!isPrivateMatchConfig(snapshot.config)) return false;
  if (!Array.isArray(snapshot.members) || snapshot.members.length < 1 || snapshot.members.length > 6 || !snapshot.members.every(isLobbyMember)) return false;
  if (new Set(snapshot.members.map((member) => member.id)).size !== snapshot.members.length) return false;
  if (!snapshot.members.some((member) => member.id === snapshot.hostId)) return false;
  if (!Array.isArray(snapshot.scores) || snapshot.scores.length > 10 || !snapshot.scores.every(isPlayerScore)) return false;
  if (new Set(snapshot.scores.map((score) => score.id)).size !== snapshot.scores.length) return false;
  if (!Number.isFinite(snapshot.snapshotHostTimeMs) || Number(snapshot.snapshotHostTimeMs) < 0) return false;
  const validHostStart = snapshot.activeAtHostTimeMs === null
    || Number.isFinite(snapshot.activeAtHostTimeMs)
      && Number(snapshot.activeAtHostTimeMs) >= MIN_RECOVERED_HOST_START_TIME_MS
      && Number(snapshot.activeAtHostTimeMs) <= Number(snapshot.snapshotHostTimeMs) + MAX_HOST_START_FUTURE_LEAD_MS;
  const validEpochStart = snapshot.activeAtEpochMs === null
    || Number.isFinite(snapshot.activeAtEpochMs) && Number(snapshot.activeAtEpochMs) >= 0 && Number(snapshot.activeAtEpochMs) <= 10_000_000_000_000;
  const activeGunRange = snapshot.config.arenaId === 'gun-range' && snapshot.phase === 'active';
  const validMatchClock = activeGunRange
    ? isGunRangeMatchClockSnapshot(snapshot.matchClock, snapshot.config.durationMs)
      && snapshot.matchClock.sampledAtHostTimeMs <= Number(snapshot.snapshotHostTimeMs)
    : snapshot.matchClock === null;
  const validTestBayDoor = activeGunRange
    ? isLobbyTestBayDoorState(snapshot.testBayDoor)
      && snapshot.testBayDoor.updatedAtMs <= Number(snapshot.snapshotHostTimeMs)
    : snapshot.testBayDoor === null;
  // HF-347: tolerate absence (older host), require well-formed entries when
  // present, and reject dummy state outside an active gun-range match.
  const validTestDummies = snapshot.testDummies === undefined
    || (activeGunRange
      ? Array.isArray(snapshot.testDummies)
        && snapshot.testDummies.length <= 16
        && snapshot.testDummies.every(isGunRangeDummySnapshotEntry)
        && new Set((snapshot.testDummies as GunRangeDummySnapshotEntry[]).map((entry) => entry.id)).size === snapshot.testDummies.length
      : snapshot.testDummies === null);
  // Owner 2026-08-30: Domination truth rides the lobby heartbeat. Tolerate
  // absence (older host); require well-formed state on active Domination.
  const activeDomination = snapshot.config.mode === 'domination' && snapshot.phase === 'active';
  const validDomination = snapshot.domination === undefined
    || (activeDomination ? isDominationLobbyState(snapshot.domination) : snapshot.domination === null);
  return validHostStart && validEpochStart
    && (snapshot.activeAtHostTimeMs === null) === (snapshot.activeAtEpochMs === null)
    && validMatchClock
    && validTestDummies
    && validTestBayDoor
    && validDomination;
}

/**
 * Deterministic host-first / stable-id / alternate-fill assignment.
 * HF-328: wrapped by team-prescription.ts `prescribeTeams`, the prescription
 * authority that also stamps canonical squad identities; new host-side call
 * sites should go through that module rather than calling this directly.
 */
export function balanceLobbyTeams(members: readonly LobbyMember[]): LobbyMember[] {
  const connected = members.filter((member) => member.connected)
    .sort((a, b) => Number(b.id === members[0]?.id) - Number(a.id === members[0]?.id) || a.id.localeCompare(b.id));
  const assigned = new Map<string, Team>();
  let aqua = 0;
  let coral = 0;
  for (const member of connected) {
    const team: Team = aqua <= coral ? 0 : 1;
    assigned.set(member.id, team);
    if (team === 0) aqua += 1;
    else coral += 1;
  }
  return members.map((member) => ({ ...member, team: assigned.get(member.id) ?? member.team }));
}

// HF-323: hold the start while any guest admission is in-flight or transport connection is pending
export function canHostStart(snapshot: LobbySnapshot, hasPendingGuests = false): boolean {
  const connected = snapshot.members.filter((member) => member.connected);
  return !hasPendingGuests
    && snapshot.phase === 'waiting'
    && connected.length >= 1
    && connected.length <= snapshot.config.capacity
    && connected.every((member) => member.ready);
}

export function canHostCommitStart(snapshot: LobbySnapshot, hasPendingGuests = false): boolean {
  const connected = snapshot.members.filter((member) => member.connected);
  return !hasPendingGuests
    && snapshot.phase === 'waiting'
    && connected.length >= 1
    && connected.length <= snapshot.config.capacity
    && connected.some((member) => member.id === snapshot.hostId)
    && connected.every((member) => member.id === snapshot.hostId || member.ready);
}

export function canGuestModifyHostedBots(role: 'host' | 'guest'): boolean {
  return role === 'host';
}

export function playersAreHostile(
  mode: MatchMode,
  first: Pick<LobbyMember, 'id' | 'team'>,
  second: Pick<LobbyMember, 'id' | 'team'>,
): boolean {
  if (first.id === second.id) return false;
  return mode === 'ffa' || first.team !== second.team;
}

export function teamTotals(scores: readonly PlayerScore[], members: readonly LobbyMember[]): [number, number] {
  const teams = new Map(members.map((member) => [member.id, member.team]));
  let aqua = 0;
  let coral = 0;
  for (const score of scores) {
    if (teams.get(score.id) === 0) aqua += score.kills;
    else if (teams.get(score.id) === 1) coral += score.kills;
  }
  return [aqua, coral];
}

export function freeForAllLeaders(scores: readonly PlayerScore[]): PlayerScore[] {
  return [...scores].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id));
}

export function estimateHostClockOffset(
  clientSentAtEpochMs: number,
  clientReceivedAtEpochMs: number,
  hostEpochMs: number,
): { accepted: boolean; offsetMs: number; rttMs: number } {
  const rttMs = clientReceivedAtEpochMs - clientSentAtEpochMs;
  if (![clientSentAtEpochMs, clientReceivedAtEpochMs, hostEpochMs].every(Number.isFinite)
    || rttMs < 0 || rttMs > MAX_CLOCK_RTT_MS) {
    return { accepted: false, offsetMs: 0, rttMs: Math.max(0, Number.isFinite(rttMs) ? rttMs : 0) };
  }
  return {
    accepted: true,
    offsetMs: hostEpochMs - (clientSentAtEpochMs + clientReceivedAtEpochMs) / 2,
    rttMs,
  };
}

export function latencyQuality(pingMs: number | null): 'unknown' | 'good' | 'fair' | 'poor' {
  if (pingMs === null || !Number.isFinite(pingMs)) return 'unknown';
  if (pingMs <= 70) return 'good';
  if (pingMs <= 140) return 'fair';
  return 'poor';
}
