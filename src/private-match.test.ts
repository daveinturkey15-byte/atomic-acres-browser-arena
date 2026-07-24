import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIVATE_MATCH_CONFIG,
  balanceLobbyTeams,
  canHostStart,
  canGuestModifyHostedBots,
  estimateHostClockOffset,
  freeForAllLeaders,
  isLobbySnapshot,
  latencyQuality,
  playersAreHostile,
  recordPlayerDamage,
  rejoinReservationExpired,
  teamTotals,
  type LobbyMember,
  type LobbySnapshot,
} from './private-match';

const members: LobbyMember[] = [
  { id: 'host', name: 'Host', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 },
  { id: 'b', name: 'Bravo', team: 1, ready: true, connected: true, pingMs: 30, dhv: 8 },
  { id: 'c', name: 'Charlie', team: 1, ready: true, connected: true, pingMs: 45, dhv: 6 },
  { id: 'd', name: 'Delta', team: 1, ready: true, connected: true, pingMs: 60, dhv: 'X' },
];

const snapshot = (changes: Partial<LobbySnapshot> = {}): LobbySnapshot => ({
  revision: 1,
  hostId: 'host',
  phase: 'waiting',
  config: DEFAULT_PRIVATE_MATCH_CONFIG,
  members,
  scores: members.map((member) => ({ id: member.id, kills: 0, deaths: 0, damageDealt: 0, damageTaken: 0 })),
  snapshotHostTimeMs: 500,
  activeAtHostTimeMs: null,
  activeAtEpochMs: null,
  ...changes,
});

describe('private match lobby', () => {
  it('holds an identity through 89.9 seconds and expires it at 90 seconds on monotonic time', () => {
    expect(rejoinReservationExpired(1_000, 90_999)).toBe(false);
    expect(rejoinReservationExpired(1_000, 91_000)).toBe(true);
  });
  it('balances a four-player lobby deterministically into 2v2', () => {
    const balanced = balanceLobbyTeams(members);
    expect(balanced.filter((member) => member.team === 0)).toHaveLength(2);
    expect(balanced.filter((member) => member.team === 1)).toHaveLength(2);
    expect(balanceLobbyTeams(members)).toEqual(balanced);
  });

  it('requires at least two connected and every connected player ready', () => {
    expect(canHostStart(snapshot())).toBe(true);
    expect(canHostStart(snapshot({ members: members.map((member, index) => index === 2 ? { ...member, ready: false } : member) }))).toBe(false);
    expect(canHostStart(snapshot({ members: [members[0]] }))).toBe(false);
    expect(canHostStart(snapshot({ phase: 'active' }))).toBe(false);
  });

  it('treats colours as presentation-only in FFA', () => {
    expect(playersAreHostile('tdm', members[0], { ...members[1], team: 0 })).toBe(false);
    expect(playersAreHostile('ffa', members[0], { ...members[1], team: 0 })).toBe(true);
    expect(playersAreHostile('ffa', members[0], members[0])).toBe(false);
  });

  it('keeps every distinct player hostile in the bot-free Gun Range FFA', () => {
    const range = snapshot({
      config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'gun-range', mode: 'ffa', hostedBotCount: 0, autoBalance: false, durationMs: 120_000 },
    });
    expect(isLobbySnapshot(range)).toBe(true);
    expect(range.config.hostedBotCount).toBe(0);
    expect(playersAreHostile(range.config.mode, { ...members[0], team: 0 }, { ...members[1], team: 0 })).toBe(true);
  });

  it('derives team totals and stable FFA leaders from authoritative scores', () => {
    const balanced = balanceLobbyTeams(members);
    const scores = [
      { id: 'host', kills: 4, deaths: 2, damageDealt: 400, damageTaken: 200 },
      { id: 'b', kills: 5, deaths: 4, damageDealt: 500, damageTaken: 400 },
      { id: 'c', kills: 5, deaths: 3, damageDealt: 500, damageTaken: 300 },
      { id: 'd', kills: 1, deaths: 5, damageDealt: 100, damageTaken: 500 },
    ];
    expect(teamTotals(scores, balanced)).toEqual([9, 6]);
    expect(freeForAllLeaders(scores).map((score) => score.id)).toEqual(['c', 'b', 'host', 'd']);
  });

  it('records bounded authoritative damage for both combatants', () => {
    const scores = new Map(snapshot().scores.map((score) => [score.id, score]));
    const next = recordPlayerDamage(scores, 'host', 'b', 31.4);
    expect(next.get('host')).toMatchObject({ damageDealt: 31, damageTaken: 0 });
    expect(next.get('b')).toMatchObject({ damageDealt: 0, damageTaken: 31 });
    expect(recordPlayerDamage(next, 'host', 'host', 100)).toEqual(next);
  });

  it('estimates midpoint host-clock offset and rejects extreme RTT', () => {
    expect(estimateHostClockOffset(1_000, 1_100, 2_050)).toEqual({ accepted: true, offsetMs: 1_000, rttMs: 100 });
    expect(estimateHostClockOffset(1_000, 7_000, 4_000).accepted).toBe(false);
  });

  it('validates bounded snapshots and capacity', () => {
    expect(isLobbySnapshot(snapshot())).toBe(true);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'rustworks-1v1' } }))).toBe(true);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'skyline-terminal' } }))).toBe(true);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'gun-range', mode: 'ffa', hostedBotCount: 0, autoBalance: false, durationMs: 120_000 } }))).toBe(true);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'gun-range', hostedBotCount: 2 } }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ members: [...members, ...members, members[0]] }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, capacity: 5 as 4 } }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ members: members.map((member) => ({ ...member, pingMs: 6_000 })) }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ members: members.map((member) => ({ ...member, dhv: 9 as 10 })) }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ activeAtHostTimeMs: 1_000 }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ activeAtHostTimeMs: 1_000, activeAtEpochMs: 2_000 }))).toBe(true);
  });

  it('restricts hosted bots to host-owned exact 0, 2, or 4 settings', () => {
    expect(canGuestModifyHostedBots('host')).toBe(true);
    expect(canGuestModifyHostedBots('guest')).toBe(false);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, hostedBotCount: 2 } }))).toBe(true);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, hostedBotCount: 4 } }))).toBe(true);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, hostedBotCount: 1 as 0 } }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, hostedBotCount: 6 as 0 } }))).toBe(false);
  });
  it('classifies lobby latency conservatively', () => {
    expect(latencyQuality(null)).toBe('unknown');
    expect(latencyQuality(70)).toBe('good');
    expect(latencyQuality(120)).toBe('fair');
    expect(latencyQuality(220)).toBe('poor');
  });
});
