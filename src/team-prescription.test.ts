import { describe, expect, it } from 'vitest';
import type { LobbyMember } from './private-match';
import {
  applyTeamSwap,
  canonicalSquadIdentity,
  prescribeTeams,
  prescribedTeamForJoin,
  rebalanceOnRosterChange,
  teamSwapRefusal,
  withPrescribedIdentity,
} from './team-prescription';

// HF-328 (Pass 74 owner requirement): TDM teams are prescribed, not picked;
// squad identity is the canonical AQUA/CORAL colour-name pair; swap-after is
// allowed only through the host-checked SWAP SIDES request.

const member = (id: string, team: 0 | 1, changes: Partial<LobbyMember> = {}): LobbyMember => ({
  id, name: id.toUpperCase(), team, ready: true, connected: true, pingMs: 20, dhv: 10, ...changes,
});

describe('team prescription (HF-328)', () => {
  it('prescribes the same deterministic balanced assignment for the same roster', () => {
    const roster = [member('host', 0), member('b', 1), member('c', 1), member('d', 1)];
    const prescribed = prescribeTeams(roster);
    expect(prescribed.filter((entry) => entry.team === 0)).toHaveLength(2);
    expect(prescribed.filter((entry) => entry.team === 1)).toHaveLength(2);
    expect(prescribeTeams(roster)).toEqual(prescribed);
    // Host-first stability: the host (members[0]) anchors AQUA.
    expect(prescribed.find((entry) => entry.id === 'host')?.team).toBe(0);
  });

  it('keeps the connected-team size difference at most one for odd rosters', () => {
    const roster = [member('host', 0), member('b', 0), member('c', 0), member('d', 0), member('e', 0)];
    const prescribed = prescribeTeams(roster);
    const aqua = prescribed.filter((entry) => entry.connected && entry.team === 0).length;
    const coral = prescribed.filter((entry) => entry.connected && entry.team === 1).length;
    expect(Math.abs(aqua - coral)).toBeLessThanOrEqual(1);
  });

  it('stamps the canonical colour-name identity and overwrites free-form values', () => {
    const roster = [
      member('host', 0, { squadName: 'North Wing', squadColor: '#123456' }),
      member('b', 1),
    ];
    for (const entry of prescribeTeams(roster)) {
      const identity = canonicalSquadIdentity(entry.team);
      expect(entry.squadName).toBe(identity.name);
      expect(entry.squadColor).toBe(identity.color);
    }
    expect(canonicalSquadIdentity(0)).toEqual({ name: 'AQUA', color: '#55e6ff' });
    expect(canonicalSquadIdentity(1)).toEqual({ name: 'CORAL', color: '#ff6b73' });
  });

  it('returns the same member object when the identity is already canonical', () => {
    const canonical = member('host', 1, { squadName: 'CORAL', squadColor: '#ff6b73' });
    expect(withPrescribedIdentity(canonical)).toBe(canonical);
    expect(withPrescribedIdentity(member('b', 0)).squadName).toBe('AQUA');
  });

  it('leaves disconnected members on their team without counting them', () => {
    const roster = [
      member('host', 0),
      member('b', 1),
      member('gone', 1, { connected: false }),
      member('c', 1),
    ];
    const prescribed = prescribeTeams(roster);
    expect(prescribed.find((entry) => entry.id === 'gone')?.team).toBe(1);
    const aqua = prescribed.filter((entry) => entry.connected && entry.team === 0).length;
    const coral = prescribed.filter((entry) => entry.connected && entry.team === 1).length;
    expect(Math.abs(aqua - coral)).toBeLessThanOrEqual(1);
  });

  it('prescribes joiners onto the smaller connected team with ties going to AQUA', () => {
    expect(prescribedTeamForJoin([member('host', 0), member('b', 1)])).toBe(0);
    expect(prescribedTeamForJoin([member('host', 0), member('b', 0), member('c', 1)])).toBe(1);
    expect(prescribedTeamForJoin([member('host', 1), member('gone', 0, { connected: false })])).toBe(0);
    expect(prescribedTeamForJoin([])).toBe(0);
  });

  it('refuses swaps outside a waiting TDM lobby and for invalid members', () => {
    const roster = [member('host', 0), member('b', 1), member('c', 0), member('d', 1), member('e', 0)];
    expect(teamSwapRefusal(roster, 'e', 1, 'waiting', 'ffa')).toBe('not-tdm');
    expect(teamSwapRefusal(roster, 'e', 1, 'countdown', 'tdm')).toBe('not-waiting');
    expect(teamSwapRefusal(roster, 'e', 1, 'active', 'tdm')).toBe('not-waiting');
    expect(teamSwapRefusal(roster, 'ghost', 1, 'waiting', 'tdm')).toBe('unknown-member');
    expect(teamSwapRefusal([...roster, member('off', 0, { connected: false })], 'off', 1, 'waiting', 'tdm')).toBe('not-connected');
    expect(teamSwapRefusal(roster, 'e', 0, 'waiting', 'tdm')).toBe('no-change');
  });

  it('accepts only swaps that keep connected teams within one player', () => {
    // Odd roster 3v2: a larger-team member may swap, a smaller-team member may not.
    const odd = [member('host', 0), member('b', 1), member('c', 0), member('d', 1), member('e', 0)];
    expect(teamSwapRefusal(odd, 'e', 1, 'waiting', 'tdm')).toBeNull();
    expect(teamSwapRefusal(odd, 'b', 0, 'waiting', 'tdm')).toBe('imbalance');
    // Even roster 2v2: a lone swap would create 3v1 and is refused.
    const even = [member('host', 0), member('b', 1), member('c', 0), member('d', 1)];
    expect(teamSwapRefusal(even, 'c', 1, 'waiting', 'tdm')).toBe('imbalance');
    const refused = applyTeamSwap(even, 'c', 1, 'waiting', 'tdm');
    expect(refused).toEqual({ accepted: false, reason: 'imbalance' });
  });

  it('applies an accepted swap to exactly one member, resetting only their readiness', () => {
    const roster = [member('host', 0), member('b', 1), member('c', 0), member('d', 1), member('e', 0)];
    const result = applyTeamSwap(roster, 'e', 1, 'waiting', 'tdm');
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const swapped = result.members.find((entry) => entry.id === 'e')!;
    expect(swapped.team).toBe(1);
    expect(swapped.ready).toBe(false);
    expect(swapped.squadName).toBe('CORAL');
    expect(swapped.squadColor).toBe('#ff6b73');
    for (const entry of result.members.filter((candidate) => candidate.id !== 'e')) {
      const before = roster.find((candidate) => candidate.id === entry.id)!;
      expect(entry.team).toBe(before.team);
      expect(entry.ready).toBe(before.ready);
    }
  });

  it('preserves a prior legal swap across a later join', () => {
    // "b" swapped onto AQUA earlier (legal 3v2). A joiner is prescribed onto
    // CORAL and the roster-change rebalance leaves every prior team alone.
    const afterSwap = [member('host', 0), member('b', 0), member('c', 1), member('d', 1), member('e', 0)];
    const joinTeam = prescribedTeamForJoin(afterSwap);
    expect(joinTeam).toBe(1);
    const withJoiner = [...afterSwap, member('f', joinTeam)];
    const rebalanced = rebalanceOnRosterChange(withJoiner);
    for (const entry of rebalanced) {
      expect(entry.team).toBe(withJoiner.find((candidate) => candidate.id === entry.id)!.team);
    }
  });

  it('rebalances minimally after a leave, moving the lowest-priority larger-team member', () => {
    // A CORAL leave from 3v2 leaves 3v1: exactly one AQUA member (last stable
    // id, never the host) moves across; everyone else keeps team and readiness.
    const afterLeave = [member('host', 0), member('b', 1), member('c', 0), member('e', 0)];
    const rebalanced = rebalanceOnRosterChange(afterLeave);
    const moved = rebalanced.find((entry) => entry.id === 'e')!;
    expect(moved.team).toBe(1);
    expect(moved.ready).toBe(false);
    expect(moved.squadName).toBe('CORAL');
    expect(rebalanced.find((entry) => entry.id === 'host')?.team).toBe(0);
    expect(rebalanced.find((entry) => entry.id === 'c')?.team).toBe(0);
    expect(rebalanced.find((entry) => entry.id === 'c')?.ready).toBe(true);
    expect(rebalanced.find((entry) => entry.id === 'b')?.team).toBe(1);
  });

  it('keeps an already-legal roster untouched apart from canonical identity stamping', () => {
    const legal = [member('host', 0), member('b', 1, { squadName: 'Free Name', squadColor: '#abcdef' })];
    const rebalanced = rebalanceOnRosterChange(legal);
    expect(rebalanced.map((entry) => entry.team)).toEqual([0, 1]);
    expect(rebalanced.map((entry) => entry.ready)).toEqual([true, true]);
    expect(rebalanced.find((entry) => entry.id === 'b')?.squadName).toBe('CORAL');
  });
});
