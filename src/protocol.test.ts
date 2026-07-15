import { describe, expect, it, vi } from 'vitest';
import { isGameMessage, isPlayerSnapshot, messageBelongsToPlayer, sanitizeName } from './protocol';

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
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1, 2], direction: [0, 0, -1], nonce: 3 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'sniper', origin: [0, 1, 2], direction: [0, 0, -1], nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'machine-pistol', origin: [0, 1, 2], direction: [0, 0, -1], nonce: 5 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'laser', origin: [0, 1, 2], direction: [0, 0, -1], nonce: 3 })).toBe(false);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1], direction: [0, 0, -1], nonce: 3 })).toBe(false);
  });

  it('requires typed hit authority and an origin for explosive damage', () => {
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 34, kind: 'shot', nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 100, kind: 'melee', nonce: 5 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', origin: [1, 0, 2], nonce: 6 })).toBe(true);
  });

  it('validates replicated pickup and breakable-window messages', () => {
    const pickup = { type: 'pickup', by: 'abc', dropId: 'death-77', weapon: 'sniper', mode: 'weapon', position: [1, 1.7, 2] as [number, number, number], nonce: 77 } as const;
    const brokenWindow = { type: 'window-break', by: 'abc', windowId: 'aqua-house:ground-window-glass', origin: [1, 1.7, 2] as [number, number, number], nonce: 78 } as const;
    expect(isGameMessage(pickup)).toBe(true);
    expect(isGameMessage({ ...pickup, mode: 'scavenge' })).toBe(true);
    expect(isGameMessage(brokenWindow)).toBe(true);
    expect(messageBelongsToPlayer(pickup, 'abc')).toBe(true);
    expect(messageBelongsToPlayer(brokenWindow, 'abc')).toBe(true);
    expect(isGameMessage({ ...pickup, dropId: '<script>'.repeat(30) })).toBe(false);
    expect(isGameMessage({ ...pickup, weapon: 'laser' })).toBe(false);
    expect(isGameMessage({ ...pickup, mode: 'duplicate' })).toBe(false);
    expect(isGameMessage({ ...brokenWindow, origin: [Infinity, 1.7, 2] })).toBe(false);
    expect(messageBelongsToPlayer({ ...brokenWindow, by: 'spoof' }, 'abc')).toBe(false);
  });

  it('admits the machine pistol only as the sniper sidearm in snapshots', () => {
    expect(isPlayerSnapshot({ ...player, primary: 'sniper', weapon: 'machine-pistol' })).toBe(true);
    expect(isPlayerSnapshot({ ...player, primary: 'carbine', weapon: 'machine-pistol' })).toBe(false);
    expect(isPlayerSnapshot({ ...player, primary: 'sniper', weapon: 'pistol' })).toBe(false);
  });

  it('binds relayed guest claims to the established player id', () => {
    expect(messageBelongsToPlayer({ type: 'state', player }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'abc', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], nonce: 1 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'spoof', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], nonce: 1 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'abc', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'spoof', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'ping', by: 'abc', team: 0, kind: 'regroup', position: [0, 1.7, 0], nonce: 8 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'ping', by: 'spoof', team: 0, kind: 'regroup', position: [0, 1.7, 0], nonce: 8 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'death', killer: 'enemy', victim: 'abc', nonce: 2 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'death', killer: 'abc', victim: 'other', nonce: 2 }, 'abc')).toBe(false);
  });
});

describe('callsign sanitizing', () => {
  it('removes markup and trims to 16 characters', () => {
    expect(sanitizeName('<b>Dave</b>_Operator_123')).toBe('bDaveb_Operator_');
  });

  it('creates a safe fallback when nothing remains', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(sanitizeName('🔥🔥')).toBe('Player100');
    vi.restoreAllMocks();
  });
});
