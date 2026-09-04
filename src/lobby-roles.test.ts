import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIVATE_MATCH_CONFIG,
  type LobbyMember,
  type LobbyPhase,
  type LobbySnapshot,
  type PlayerScore,
} from './private-match';
import { electHostSuccessor } from './host-migration';
import { isGameMessage, isHostAuthorityMessage, messageBelongsToPlayer } from './protocol';
import {
  authorizeLobbyKick,
  authorizeRoomClose,
  guestShouldHonorKick,
  hostChangedNotice,
  isLobbyKickMessage,
  kickNotice,
  LOBBY_ROLES_SCHEMA_VERSION,
  planLobbyKick,
  lobbySeats,
  promoteRetained,
  resolveSeatRole,
  retainLobbySnapshot,
  seatRoleLabel,
  type LobbyKickMessage,
} from './lobby-roles';

function member(id: string, overrides: Partial<LobbyMember> = {}): LobbyMember {
  return {
    id,
    name: id.toUpperCase(),
    team: 0,
    ready: true,
    connected: true,
    pingMs: 20,
    dhv: 100,
    ...overrides,
  } as LobbyMember;
}

function snapshot(overrides: Partial<LobbySnapshot> = {}): LobbySnapshot {
  return {
    revision: 4,
    hostId: 'alpha',
    phase: 'waiting' as LobbyPhase,
    config: DEFAULT_PRIVATE_MATCH_CONFIG,
    members: [member('alpha'), member('bravo'), member('charlie')],
    scores: [] as readonly PlayerScore[],
    snapshotHostTimeMs: 1_000,
    activeAtHostTimeMs: null,
    activeAtEpochMs: null,
    matchClock: null,
    testBayDoor: null,
    ...overrides,
  } as LobbySnapshot;
}

function kick(overrides: Partial<LobbyKickMessage> = {}): LobbyKickMessage {
  return {
    type: 'lobby-kick',
    schemaVersion: LOBBY_ROLES_SCHEMA_VERSION,
    by: 'alpha',
    targetId: 'bravo',
    reason: 'host-removed',
    nonce: 7,
    ...overrides,
  };
}

describe('HF-504 seat roles', () => {
  it('names the host in every phase, even while the host is still loading', () => {
    for (const phase of ['waiting', 'countdown', 'active', 'ended'] as LobbyPhase[]) {
      expect(resolveSeatRole({ hostId: 'a', memberId: 'a', connected: true, ready: false, phase })).toBe('host');
    }
  });

  it('a connected not-ready guest is a spectator only once the match is running', () => {
    const base = { hostId: 'a', memberId: 'b', connected: true, ready: false };
    expect(resolveSeatRole({ ...base, phase: 'waiting' })).toBe('guest');
    expect(resolveSeatRole({ ...base, phase: 'countdown' })).toBe('spectator');
    expect(resolveSeatRole({ ...base, phase: 'active' })).toBe('spectator');
    expect(resolveSeatRole({ ...base, phase: 'ended' })).toBe('guest');
  });

  it('a ready guest in an active match is a guest, not a spectator', () => {
    expect(resolveSeatRole({ hostId: 'a', memberId: 'b', connected: true, ready: true, phase: 'active' })).toBe('guest');
  });

  it('a disconnected member inside its rejoin grace stays a guest', () => {
    expect(resolveSeatRole({ hostId: 'a', memberId: 'b', connected: false, ready: false, phase: 'active' })).toBe('guest');
  });

  it('projects the whole roster in host-authored order with labels and local flag', () => {
    const seats = lobbySeats(
      snapshot({ phase: 'active', members: [member('alpha'), member('bravo', { ready: false }), member('charlie')] }),
      'charlie',
    );
    expect(seats.map((seat) => [seat.id, seatRoleLabel(seat.role), seat.isLocal])).toEqual([
      ['alpha', 'HOST', false],
      ['bravo', 'SPECTATOR', false],
      ['charlie', 'GUEST', true],
    ]);
  });

  it('falls back to the peer id when a member carries a blank name', () => {
    const seats = lobbySeats(snapshot({ members: [member('alpha'), member('bravo', { name: '   ' })] }), 'alpha');
    expect(seats[1]!.name).toBe('bravo');
  });
});

describe('HF-504 host controls: kick only by the host', () => {
  it('allows the sitting host to kick a connected guest', () => {
    expect(authorizeLobbyKick({ role: 'host', snapshot: snapshot(), actorId: 'alpha', targetId: 'bravo' }))
      .toEqual({ ok: true, reason: 'ok' });
  });

  it('refuses a guest that calls it, whatever it claims about itself', () => {
    expect(authorizeLobbyKick({ role: 'client', snapshot: snapshot(), actorId: 'alpha', targetId: 'bravo' }).reason)
      .toBe('not-host');
    expect(authorizeLobbyKick({ role: 'offline', snapshot: snapshot(), actorId: 'bravo', targetId: 'charlie' }).reason)
      .toBe('not-host');
  });

  it('refuses a stale host whose room has already moved on', () => {
    // The room says charlie hosts; this peer still believes it is host.
    expect(authorizeLobbyKick({
      role: 'host',
      snapshot: snapshot({ hostId: 'charlie' }),
      actorId: 'alpha',
      targetId: 'bravo',
    }).reason).toBe('actor-not-host');
  });

  it('refuses kicking the host, an unknown peer, or an already-gone peer', () => {
    expect(authorizeLobbyKick({ role: 'host', snapshot: snapshot(), actorId: 'alpha', targetId: 'alpha' }).reason)
      .toBe('target-is-host');
    expect(authorizeLobbyKick({ role: 'host', snapshot: snapshot(), actorId: 'alpha', targetId: 'delta' }).reason)
      .toBe('unknown-target');
    expect(authorizeLobbyKick({
      role: 'host',
      snapshot: snapshot({ members: [member('alpha'), member('bravo', { connected: false })] }),
      actorId: 'alpha',
      targetId: 'bravo',
    }).reason).toBe('target-already-gone');
  });

  it('gates closing the room on the same two host checks', () => {
    expect(authorizeRoomClose({ role: 'host', actorId: 'alpha', hostId: 'alpha' }).ok).toBe(true);
    expect(authorizeRoomClose({ role: 'client', actorId: 'alpha', hostId: 'alpha' }).reason).toBe('not-host');
    expect(authorizeRoomClose({ role: 'host', actorId: 'alpha', hostId: 'charlie' }).reason).toBe('actor-not-host');
  });
});

describe('HF-504 kick on the wire', () => {
  it('only the host can mint a kick, and what it mints is a legal message', () => {
    const plan = planLobbyKick({
      role: 'host', snapshot: snapshot(), actorId: 'alpha', targetId: 'bravo',
      reason: 'host-removed', nonce: 12,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(isGameMessage(plan.message)).toBe(true);
    expect(isHostAuthorityMessage(plan.message)).toBe(true);
    expect(plan.message).toMatchObject({ by: 'alpha', targetId: 'bravo', nonce: 12 });
  });

  it('mints nothing for a guest, a stale host, a missing room or an absent target', () => {
    const base = {
      snapshot: snapshot(), actorId: 'bravo', targetId: 'charlie',
      reason: 'host-removed' as const, nonce: 3,
    };
    // A guest that calls the mint anyway gets a refusal, never a message.
    expect(planLobbyKick({ ...base, role: 'client' })).toEqual({ ok: false, reason: 'not-host' });
    // Role says host, but the room's hostId is somebody else: a superseded host.
    expect(planLobbyKick({ ...base, role: 'host' })).toEqual({ ok: false, reason: 'actor-not-host' });
    expect(planLobbyKick({
      ...base, role: 'host', actorId: 'alpha', snapshot: null,
    })).toEqual({ ok: false, reason: 'no-lobby' });
    expect(planLobbyKick({
      ...base, role: 'host', actorId: 'alpha', targetId: 'delta',
    })).toEqual({ ok: false, reason: 'unknown-target' });
  });

  it('is a legal game message, host-authored, and signed by its author', () => {
    const message = kick();
    expect(isGameMessage(message)).toBe(true);
    expect(isHostAuthorityMessage(message)).toBe(true);
    expect(messageBelongsToPlayer(message, 'alpha')).toBe(true);
    expect(messageBelongsToPlayer(message, 'bravo')).toBe(false);
  });

  it('refuses malformed, self-addressed and wrong-version envelopes', () => {
    expect(isLobbyKickMessage(kick({ targetId: 'alpha' }))).toBe(false);
    expect(isLobbyKickMessage({ ...kick(), schemaVersion: 99 })).toBe(false);
    expect(isLobbyKickMessage({ ...kick(), reason: 'because' })).toBe(false);
    expect(isLobbyKickMessage({ ...kick(), nonce: -1 })).toBe(false);
    expect(isLobbyKickMessage({ ...kick(), by: '' })).toBe(false);
    expect(isLobbyKickMessage(null)).toBe(false);
  });

  it('a guest honours only a kick from its current host that names it', () => {
    expect(guestShouldHonorKick(kick(), { currentHostId: 'alpha', localPlayerId: 'bravo' })).toBe(true);
    // Forged by a peer.
    expect(guestShouldHonorKick(kick({ by: 'charlie' }), { currentHostId: 'alpha', localPlayerId: 'bravo' })).toBe(false);
    // Authored by a host this guest has already superseded.
    expect(guestShouldHonorKick(kick(), { currentHostId: 'charlie', localPlayerId: 'bravo' })).toBe(false);
    // Addressed to somebody else.
    expect(guestShouldHonorKick(kick(), { currentHostId: 'alpha', localPlayerId: 'charlie' })).toBe(false);
  });

  it('names the reason to the removed player', () => {
    expect(kickNotice('host-removed')).toContain('removed you');
    expect(kickNotice('room-closed')).toContain('closed the room');
  });
});

describe('HF-504 rolling snapshot copy and handoff', () => {
  it('keeps the newest revision and never walks backwards on a replay', () => {
    let retained = retainLobbySnapshot(null, snapshot({ revision: 4 }), 1_000);
    expect(retained?.snapshot.revision).toBe(4);
    retained = retainLobbySnapshot(retained, snapshot({ revision: 7 }), 2_000);
    expect(retained?.snapshot.revision).toBe(7);
    // A replayed older snapshot, and a re-send of the one already held.
    retained = retainLobbySnapshot(retained, snapshot({ revision: 5 }), 3_000);
    expect(retained?.snapshot.revision).toBe(7);
    retained = retainLobbySnapshot(retained, snapshot({ revision: 7 }), 4_000);
    expect(retained?.receivedAtEpochMs).toBe(2_000);
  });

  it('refuses an out-of-bounds revision rather than adopting it', () => {
    const held = retainLobbySnapshot(null, snapshot({ revision: 4 }), 1_000);
    expect(retainLobbySnapshot(held, snapshot({ revision: 1.5 }), 2_000)?.snapshot.revision).toBe(4);
    expect(retainLobbySnapshot(held, snapshot({ revision: -1 }), 2_000)?.snapshot.revision).toBe(4);
  });

  it('the handoff restores every peer, their scores and their loadout-bearing rows', () => {
    const scores: PlayerScore[] = [
      { id: 'alpha', kills: 5, deaths: 1, damageDealt: 500, damageTaken: 100 },
      { id: 'bravo', kills: 3, deaths: 2, damageDealt: 300, damageTaken: 250 },
      { id: 'charlie', kills: 1, deaths: 4, damageDealt: 120, damageTaken: 400 },
    ];
    const live = snapshot({
      revision: 11,
      phase: 'active',
      scores,
      activeAtHostTimeMs: 900,
      activeAtEpochMs: 1_700_000_000_000,
      members: [
        member('alpha', { skinId: 'ranger' }),
        member('bravo', { team: 1, skinId: 'diver', stanceId: 'ready' }),
        member('charlie', { dhv: 'X' }),
      ],
    });
    const retained = retainLobbySnapshot(null, live, 5_000);
    const promoted = promoteRetained(retained, 'bravo');
    expect(promoted.promoted).toBe(true);
    if (!promoted.promoted) return;
    expect(promoted.snapshot.hostId).toBe('bravo');
    expect(promoted.snapshot.revision).toBe(12);
    expect(promoted.snapshot.phase).toBe('active');
    expect(promoted.snapshot.scores).toEqual(scores);
    // Everybody is re-registered; only the departed host's connection flips.
    expect(promoted.snapshot.members.map((entry) => [entry.id, entry.connected])).toEqual([
      ['alpha', false], ['bravo', true], ['charlie', true],
    ]);
    // Per-peer loadout/appearance identity survives the handoff untouched.
    expect(promoted.snapshot.members[1]).toMatchObject({ team: 1, skinId: 'diver', stanceId: 'ready' });
    expect(promoted.snapshot.members[2]).toMatchObject({ dhv: 'X' });
    // The match clocks are the same instant, so the match continues.
    expect(promoted.snapshot.activeAtEpochMs).toBe(live.activeAtEpochMs);
    expect(promoted.snapshot.activeAtHostTimeMs).toBe(live.activeAtHostTimeMs);
  });

  it('refuses to promote nothing, the sitting host, a stranger or a dropped peer', () => {
    const retained = retainLobbySnapshot(null, snapshot({
      members: [member('alpha'), member('bravo'), member('charlie', { connected: false })],
    }), 1_000);
    expect(promoteRetained(null, 'bravo')).toEqual({ promoted: false, reason: 'no-retained-snapshot' });
    expect(promoteRetained(retained, 'alpha')).toEqual({ promoted: false, reason: 'successor-is-host' });
    expect(promoteRetained(retained, 'delta')).toEqual({ promoted: false, reason: 'successor-not-in-roster' });
    expect(promoteRetained(retained, 'charlie')).toEqual({ promoted: false, reason: 'successor-disconnected' });
  });

  it('the election is deterministic across peers and agrees with the handoff', () => {
    const live = snapshot({
      members: [member('delta'), member('bravo'), member('charlie')],
      hostId: 'delta',
    });
    const roster = {
      revision: live.revision,
      hostId: live.hostId,
      members: live.members.map((entry) => ({ id: entry.id, connected: entry.connected })),
    };
    // Every peer computes the same answer from the same host-authored roster,
    // in any local ordering: lowest id among connected guests.
    const shuffled = { ...roster, members: [...roster.members].reverse() };
    const first = electHostSuccessor(roster);
    const second = electHostSuccessor(shuffled);
    expect(first).toMatchObject({ decided: true, successorId: 'bravo' });
    expect(second).toMatchObject({ decided: true, successorId: 'bravo' });
    const promoted = promoteRetained(retainLobbySnapshot(null, live, 1), 'bravo');
    expect(promoted.promoted && promoted.snapshot.hostId).toBe('bravo');
  });

  it('a guest cannot forge a migration: a promotion claim is host-authority traffic', () => {
    // The election says bravo. charlie may not simply assert it hosts: the
    // promotion claim is host-authority traffic (network.ts drops it on a guest
    // connection) and the handoff refuses a successor the roster did not elect.
    const live = snapshot({ hostId: 'alpha' });
    const roster = {
      revision: live.revision,
      hostId: live.hostId,
      members: live.members.map((entry) => ({ id: entry.id, connected: entry.connected })),
    };
    const elected = electHostSuccessor(roster);
    expect(elected).toMatchObject({ decided: true, successorId: 'bravo' });
    // A forged kick from the non-elected peer is not honoured by anybody.
    expect(guestShouldHonorKick(kick({ by: 'charlie', targetId: 'bravo' }), {
      currentHostId: 'alpha', localPlayerId: 'bravo',
    })).toBe(false);
    // And a peer that is not host cannot authorize a kick at all.
    expect(authorizeLobbyKick({ role: 'client', snapshot: live, actorId: 'charlie', targetId: 'bravo' }).reason)
      .toBe('not-host');
  });
});

describe('HF-504 host-changed notice', () => {
  it('is null when the host did not change', () => {
    expect(hostChangedNotice({ previousHostId: 'a', newHostId: 'a', localPlayerId: 'b', members: [] })).toBeNull();
  });

  it('tells the successor it is hosting and the followers who is', () => {
    const members = [member('alpha'), member('bravo', { name: 'JIGGLES' })];
    expect(hostChangedNotice({ previousHostId: 'alpha', newHostId: 'bravo', localPlayerId: 'bravo', members }))
      .toContain('you are hosting now');
    const follower = hostChangedNotice({ previousHostId: 'alpha', newHostId: 'bravo', localPlayerId: 'charlie', members });
    expect(follower).toContain('JIGGLES is hosting now');
    expect(follower).toContain('match continues');
  });

  it('falls back to the peer id when the successor is not in the roster copy', () => {
    expect(hostChangedNotice({ previousHostId: 'alpha', newHostId: 'zulu', localPlayerId: 'charlie', members: [] }))
      .toContain('zulu is hosting now');
  });
});
