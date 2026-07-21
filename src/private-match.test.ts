import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIVATE_MATCH_CONFIG,
  balanceLobbyTeams,
  canHostStart,
  estimateHostClockOffset,
  freeForAllLeaders,
  isLobbySnapshot,
  latencyQuality,
  localPerformanceAtHostEpoch,
  playersAreHostile,
  teamTotals,
  type LobbyMember,
  type LobbySnapshot,
} from './private-match';

const members: LobbyMember[] = [
  { id: 'host', name: 'Host', team: 0, ready: true, connected: true, pingMs: 0 },
  { id: 'b', name: 'Bravo', team: 1, ready: true, connected: true, pingMs: 30 },
  { id: 'c', name: 'Charlie', team: 1, ready: true, connected: true, pingMs: 45 },
  { id: 'd', name: 'Delta', team: 1, ready: true, connected: true, pingMs: 60 },
];

const snapshot = (changes: Partial<LobbySnapshot> = {}): LobbySnapshot => ({
  revision: 1,
  hostId: 'host',
  phase: 'waiting',
  config: DEFAULT_PRIVATE_MATCH_CONFIG,
  members,
  scores: members.map((member) => ({ id: member.id, kills: 0, deaths: 0 })),
  activeAtEpochMs: null,
  ...changes,
});

describe('private match lobby', () => {
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

  it('derives team totals and stable FFA leaders from authoritative scores', () => {
    const balanced = balanceLobbyTeams(members);
    const scores = [
      { id: 'host', kills: 4, deaths: 2 },
      { id: 'b', kills: 5, deaths: 4 },
      { id: 'c', kills: 5, deaths: 3 },
      { id: 'd', kills: 1, deaths: 5 },
    ];
    expect(teamTotals(scores, balanced)).toEqual([9, 6]);
    expect(freeForAllLeaders(scores).map((score) => score.id)).toEqual(['c', 'b', 'host', 'd']);
  });

  it('estimates midpoint host-clock offset and rejects extreme RTT', () => {
    expect(estimateHostClockOffset(1_000, 1_100, 2_050)).toEqual({ accepted: true, offsetMs: 1_000, rttMs: 100 });
    expect(estimateHostClockOffset(1_000, 7_000, 4_000).accepted).toBe(false);
    expect(localPerformanceAtHostEpoch(10_000, 1_000, 8_000, 500)).toBe(1_500);
  });

  it('validates bounded snapshots and capacity', () => {
    expect(isLobbySnapshot(snapshot())).toBe(true);
    expect(isLobbySnapshot(snapshot({ members: [...members, ...members, members[0]] }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ config: { ...DEFAULT_PRIVATE_MATCH_CONFIG, capacity: 5 as 4 } }))).toBe(false);
    expect(isLobbySnapshot(snapshot({ members: members.map((member) => ({ ...member, pingMs: 6_000 })) }))).toBe(false);
  });

  it('classifies lobby latency conservatively', () => {
    expect(latencyQuality(null)).toBe('unknown');
    expect(latencyQuality(70)).toBe('good');
    expect(latencyQuality(120)).toBe('fair');
    expect(latencyQuality(220)).toBe('poor');
  });
});
