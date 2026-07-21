import { describe, expect, it, vi } from 'vitest';
import { configureRuntimeRandom } from './runtime-random';
import { isGameMessage, isHostAuthorityMessage, isPlayerSnapshot, isStateTrafficMessage, messageBelongsToPlayer, sanitizeName, type GrenadeThrowMessage, type SupportActivateMessage } from './protocol';

const player = {
  id: 'abc', name: 'Tester', team: 0 as const,
  x: 0, y: 1.7, z: 2, yaw: 0, pitch: 0,
  hp: 100, kills: 2, deaths: 1, primary: 'carbine' as const, weapon: 'carbine' as const, seq: 4,
};

describe('network protocol guards', () => {
  it('accepts a bounded valid player snapshot and known stance', () => {
    expect(isPlayerSnapshot(player)).toBe(true);
    expect(isGameMessage({ type: 'state', player: { ...player, stance: 'prone' } })).toBe(true);
  });

  it('rejects malformed or unbounded messages', () => {
    expect(isGameMessage({ type: 'state', player: { ...player, x: Infinity } })).toBe(false);
    expect(isGameMessage({ type: 'state', player: { ...player, stance: 'burrowed' } })).toBe(false);
    expect(isGameMessage({ type: 'state', player: { ...player, hp: 101 } })).toBe(false);
    expect(isGameMessage({ type: 'state', player: { ...player, hp: -1 } })).toBe(false);
    expect(isGameMessage({ type: 'state', player: { ...player, pitch: 2 } })).toBe(false);
    expect(isGameMessage({ type: 'state', player: { ...player, kills: -1 } })).toBe(false);
    expect(isGameMessage({ type: 'state', player: { ...player, seq: 4.5 } })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 999, nonce: 1 })).toBe(false);
    expect(isGameMessage({ type: 'chat', by: 'a', text: 'unbounded text transport' })).toBe(false);
    expect(isGameMessage({ type: 'ping', by: 'a', team: 0, kind: 'link', position: [0, 1, 0], nonce: 1 })).toBe(false);
    expect(isGameMessage({ type: 'script', body: 'alert(1)' })).toBe(false);
  });

  it('validates shot vectors and known weapon ids', () => {
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 3 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'sniper', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'machine-pistol', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 5 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'laser', origin: [0, 1, 2], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 3 })).toBe(false);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 3 })).toBe(false);
  });

  it('requires action-correlated typed hit authority and earned support metadata', () => {
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 34, kind: 'shot', actionNonce: 3, nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 34, kind: 'shot', nonce: 4 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 100, kind: 'melee', actionNonce: 3, nonce: 5 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', actionNonce: 3, nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', explosiveSource: 'tri-pass', origin: [1, 0, 2], actionNonce: 3, supportNonce: 2, nonce: 6 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', explosiveSource: 'tri-pass', origin: [1, 0, 2], actionNonce: 3, nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', explosiveSource: 'magic', origin: [1, 0, 2], actionNonce: 3, supportNonce: 2, nonce: 6 })).toBe(false);
    const activation: SupportActivateMessage = { type: 'support-activate', by: 'a', source: 'nuke', activationNonce: 7, effectOrigins: [], targetIds: [], nonce: 8 };
    expect(isGameMessage(activation)).toBe(true);
    expect(messageBelongsToPlayer(activation, 'a')).toBe(true);
    const grenadeThrow: GrenadeThrowMessage = { type: 'grenade-throw', by: 'a', origin: [0, 1.7, 0], velocity: [0, 5.2, -13], actionNonce: 9, nonce: 10 };
    expect(isGameMessage(grenadeThrow)).toBe(true);
    expect(messageBelongsToPlayer(grenadeThrow, 'a')).toBe(true);
  });

  it('validates replicated pickup and breakable-window messages', () => {
    const pickup = { type: 'pickup', by: 'abc', dropId: 'death-77', weapon: 'sniper', mode: 'weapon', position: [1, 1.7, 2] as [number, number, number], nonce: 77 } as const;
    const brokenWindow = { type: 'window-break', by: 'abc', windowId: 'aqua-house:ground-window-glass', origin: [1, 1.7, 2] as [number, number, number], nonce: 78 } as const;
    expect(isGameMessage(pickup)).toBe(true);
    expect(isGameMessage({ ...pickup, mode: 'scavenge' })).toBe(true);
    expect(isGameMessage(brokenWindow)).toBe(true);
    expect(isGameMessage({ ...brokenWindow, kind: 'explosive' })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, kind: 'explosive', actionNonce: 55 })).toBe(true);
    expect(isGameMessage({ ...brokenWindow, kind: 'shot', actionNonce: 55 })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, kind: 'magic' })).toBe(false);
    expect(messageBelongsToPlayer(pickup, 'abc')).toBe(true);
    expect(messageBelongsToPlayer(brokenWindow, 'abc')).toBe(true);
    expect(isGameMessage({ ...pickup, dropId: '<script>'.repeat(30) })).toBe(false);
    expect(isGameMessage({ ...pickup, weapon: 'laser' })).toBe(false);
    expect(isGameMessage({ ...pickup, mode: 'duplicate' })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, origin: [Infinity, 1.7, 2] })).toBe(false);
    expect(messageBelongsToPlayer({ ...brokenWindow, by: 'spoof' }, 'abc')).toBe(false);
  });

  it('validates bounded host-authoritative Overdrive claims and state', () => {
    const claim = { type: 'overdrive-claim' as const, by: 'abc', position: [0, 1.7, 0] as [number, number, number], generation: 2, nonce: 90 };
    const state = { type: 'overdrive-state' as const, by: 'host', holderId: 'abc', available: false, generation: 3, activeRemainingMs: 15_000, nextSpawnInMs: 120_000, nonce: 91 };
    expect(isGameMessage(claim)).toBe(true);
    expect(isGameMessage(state)).toBe(true);
    expect(messageBelongsToPlayer(claim, 'abc')).toBe(true);
    expect(isGameMessage({ ...claim, position: [Infinity, 1.7, 0] })).toBe(false);
    expect(isGameMessage({ ...state, activeRemainingMs: 15_001 })).toBe(false);
    expect(isGameMessage({ ...state, nextSpawnInMs: 120_001 })).toBe(false);
  });

  it('admits the machine pistol only as the sniper sidearm in snapshots', () => {
    expect(isPlayerSnapshot({ ...player, primary: 'sniper', weapon: 'machine-pistol' })).toBe(true);
    expect(isPlayerSnapshot({ ...player, primary: 'carbine', weapon: 'machine-pistol' })).toBe(false);
    expect(isPlayerSnapshot({ ...player, primary: 'sniper', weapon: 'pistol' })).toBe(false);
  });

  it('binds persistent-score replication to the established player id and bounded schema', () => {
    const entry = {
      id: 'score:abc:one', name: 'Tester', kills: 12, deaths: 3,
      bestStreak: 8, won: true, recordedAt: Date.now(),
    };
    const score = { type: 'high-score', by: 'abc', entry } as const;
    const sync = { type: 'leaderboard-sync' as const, by: 'abc', entries: [entry] };
    expect(isGameMessage(score)).toBe(true);
    expect(isGameMessage(sync)).toBe(true);
    expect(messageBelongsToPlayer(score, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ ...score, by: 'spoof' }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer(sync, 'abc')).toBe(true);
    expect(isGameMessage({ ...score, entry: { ...entry, kills: 1_000, bestStreak: 1_000 } })).toBe(true);
    expect(isGameMessage({ ...score, entry: { ...entry, kills: 10_000 } })).toBe(false);
    expect(isGameMessage({ ...score, entry: { ...entry, bestStreak: 10_000 } })).toBe(false);
    expect(isGameMessage({ ...sync, entries: Array.from({ length: 21 }, () => entry) })).toBe(false);
  });

  it('binds relayed guest claims to the established player id', () => {
    expect(messageBelongsToPlayer({ type: 'state', player }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'abc', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 1 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'spoof', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], pelletDirections: [[0, 0, -1]], nonce: 1 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'abc', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'spoof', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'ping', by: 'abc', team: 0, kind: 'regroup', position: [0, 1.7, 0], nonce: 8 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'ping', by: 'spoof', team: 0, kind: 'regroup', position: [0, 1.7, 0], nonce: 8 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'death', killer: 'enemy', victim: 'abc', nonce: 2 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'death', killer: 'abc', victim: 'other', nonce: 2 }, 'abc')).toBe(false);
  });

  it('validates bounded lobby control traffic and identifies host authority', () => {
    const join = { type: 'lobby-join' as const, playerId: 'abc', name: 'Tester', requestedTeam: 0 as const, resumeToken: '12345678-1234-1234-1234-123456789abc', nonce: 1 };
    const lobbyState = {
      type: 'lobby-state' as const,
      by: 'host',
      snapshot: {
        revision: 2,
        hostId: 'host',
        phase: 'waiting' as const,
        config: { mode: 'tdm' as const, capacity: 4 as const, autoBalance: true, arenaId: 'atomic-acres' as const, durationMs: 300_000 },
        members: [{ id: 'host', name: 'Host', team: 0 as const, ready: true, connected: true, pingMs: 0 }],
        scores: [{ id: 'host', kills: 0, deaths: 0 }],
        activeAtEpochMs: null,
      },
      nonce: 2,
    };
    expect(isGameMessage(join)).toBe(true);
    expect(messageBelongsToPlayer(join, 'abc')).toBe(true);
    expect(isGameMessage({ ...join, resumeToken: 'short' })).toBe(false);
    expect(isGameMessage(lobbyState)).toBe(true);
    expect(isHostAuthorityMessage(lobbyState)).toBe(true);
    expect(isStateTrafficMessage({ type: 'state', player })).toBe(true);
    expect(isStateTrafficMessage(lobbyState)).toBe(false);
    expect(isGameMessage({ ...lobbyState, snapshot: { ...lobbyState.snapshot, config: { ...lobbyState.snapshot.config, capacity: 5 } } })).toBe(false);
  });
});

describe('callsign sanitizing', () => {
  it('removes markup and trims to 16 characters', () => {
    expect(sanitizeName('<b>Dave</b>_Operator_123')).toBe('bDaveb_Operator_');
  });

  it('creates a safe fallback when nothing remains', () => {
    configureRuntimeRandom('callsign-test');
    const first = sanitizeName('🔥🔥');
    configureRuntimeRandom('callsign-test');
    expect(sanitizeName('🔥🔥')).toBe(first);
    expect(first).toMatch(/^Player[1-9][0-9]{2}$/);
  });
});
