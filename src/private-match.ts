import type { Team } from './protocol';
import type { ArenaId } from './map-selection';
import { isHostedBotCount, type HostedBotCount } from './hosted-bots';

export const ROOM_CAPACITIES = [4, 6] as const;
export type RoomCapacity = typeof ROOM_CAPACITIES[number];
export type MatchMode = 'tdm' | 'ffa';
export type LobbyPhase = 'waiting' | 'countdown' | 'active' | 'ended';
export type MultiplayerArenaId = ArenaId;

export type PrivateMatchConfig = Readonly<{
  arenaId: MultiplayerArenaId;
  mode: MatchMode;
  capacity: RoomCapacity;
  hostedBotCount: HostedBotCount;
  autoBalance: boolean;
  durationMs: number;
}>;

export type LobbyMember = Readonly<{
  id: string;
  name: string;
  team: Team;
  ready: boolean;
  connected: boolean;
  pingMs: number | null;
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

export type LobbySnapshot = Readonly<{
  revision: number;
  hostId: string;
  phase: LobbyPhase;
  config: PrivateMatchConfig;
  members: readonly LobbyMember[];
  scores: readonly PlayerScore[];
  activeAtEpochMs: number | null;
}>;

export const DEFAULT_PRIVATE_MATCH_CONFIG: PrivateMatchConfig = Object.freeze({
  arenaId: 'atomic-acres',
  mode: 'tdm',
  capacity: 4,
  hostedBotCount: 0,
  autoBalance: true,
  durationMs: 300_000,
});

export const REJOIN_GRACE_MS = 30_000;
export const LOBBY_START_LEAD_MS = 3_500;
export const CLOCK_PING_INTERVAL_MS = 2_000;
export const MAX_CLOCK_RTT_MS = 5_000;

export function isRoomCapacity(value: unknown): value is RoomCapacity {
  return value === 4 || value === 6;
}

export function isMatchMode(value: unknown): value is MatchMode {
  return value === 'tdm' || value === 'ffa';
}

export function isPrivateMatchConfig(value: unknown): value is PrivateMatchConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return (config.arenaId === 'atomic-acres' || config.arenaId === 'rustworks-1v1' || config.arenaId === 'gun-range' || config.arenaId === 'skyline-terminal')
    && isMatchMode(config.mode)
    && isRoomCapacity(config.capacity)
    && isHostedBotCount(config.hostedBotCount)
    && typeof config.autoBalance === 'boolean'
    && Number.isSafeInteger(config.durationMs)
    && Number(config.durationMs) >= 60_000
    && Number(config.durationMs) <= 900_000
    && (config.arenaId !== 'gun-range' || config.mode === 'ffa' && config.hostedBotCount === 0 && config.autoBalance === false);
}

export function isLobbyMember(value: unknown): value is LobbyMember {
  if (!value || typeof value !== 'object') return false;
  const member = value as Record<string, unknown>;
  return typeof member.id === 'string' && member.id.length > 0 && member.id.length <= 80
    && typeof member.name === 'string' && member.name.length > 0 && member.name.length <= 20
    && (member.team === 0 || member.team === 1)
    && typeof member.ready === 'boolean'
    && typeof member.connected === 'boolean'
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
  return snapshot.activeAtEpochMs === null
    || Number.isFinite(snapshot.activeAtEpochMs) && Number(snapshot.activeAtEpochMs) >= 0 && Number(snapshot.activeAtEpochMs) <= 10_000_000_000_000;
}

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

export function canHostStart(snapshot: LobbySnapshot): boolean {
  const connected = snapshot.members.filter((member) => member.connected);
  return snapshot.phase === 'waiting'
    && connected.length >= 2
    && connected.length <= snapshot.config.capacity
    && connected.every((member) => member.ready);
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

export function localPerformanceAtHostEpoch(
  hostEpochMs: number,
  hostOffsetMs: number,
  localEpochMs: number,
  localPerformanceMs: number,
): number {
  if (![hostEpochMs, hostOffsetMs, localEpochMs, localPerformanceMs].every(Number.isFinite)) return localPerformanceMs;
  const estimatedHostNow = localEpochMs + hostOffsetMs;
  return localPerformanceMs + hostEpochMs - estimatedHostNow;
}

export function latencyQuality(pingMs: number | null): 'unknown' | 'good' | 'fair' | 'poor' {
  if (pingMs === null || !Number.isFinite(pingMs)) return 'unknown';
  if (pingMs <= 70) return 'good';
  if (pingMs <= 140) return 'fair';
  return 'poor';
}
