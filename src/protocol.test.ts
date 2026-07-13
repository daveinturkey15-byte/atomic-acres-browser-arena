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
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 999, nonce: 1 })).toBe(false);
    expect(isGameMessage({ type: 'chat', by: 'a', text: 'x'.repeat(161) })).toBe(false);
    expect(isGameMessage({ type: 'script', body: 'alert(1)' })).toBe(false);
  });

  it('validates shot vectors and known weapon ids', () => {
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1, 2], direction: [0, 0, -1], nonce: 3 })).toBe(true);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'laser', origin: [0, 1, 2], direction: [0, 0, -1], nonce: 3 })).toBe(false);
    expect(isGameMessage({ type: 'shot', by: 'a', weapon: 'smg', origin: [0, 1], direction: [0, 0, -1], nonce: 3 })).toBe(false);
  });

  it('requires typed hit authority and an origin for explosive damage', () => {
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 34, kind: 'shot', nonce: 4 })).toBe(true);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 100, kind: 'melee', nonce: 5 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', nonce: 6 })).toBe(false);
    expect(isGameMessage({ type: 'hit', by: 'a', target: 'b', damage: 80, kind: 'explosive', origin: [1, 0, 2], nonce: 6 })).toBe(true);
  });

  it('binds relayed guest claims to the established player id', () => {
    expect(messageBelongsToPlayer({ type: 'state', player }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'abc', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], nonce: 1 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'shot', by: 'spoof', weapon: 'carbine', origin: [0, 1, 0], direction: [0, 0, -1], nonce: 1 }, 'abc')).toBe(false);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'abc', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(true);
    expect(messageBelongsToPlayer({ type: 'melee', by: 'spoof', origin: [0, 1.7, 0], direction: [0, 0, -1], nonce: 7 }, 'abc')).toBe(false);
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
