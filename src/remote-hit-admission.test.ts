import { describe, expect, it } from 'vitest';
import {
  admitRemoteBaseDamage,
  deriveRemoteShotBaseDamage,
  maximumRemoteExplosiveBaseDamage,
  maximumRemoteShotBaseDamage,
  resolveRemotePoweredDamage,
} from './remote-hit-admission';

describe('remote hit admission', () => {
  it('derives SMG head as 35 (1.5× body) and never one-shots from full HP without OD', () => {
    const target = { x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    const body = deriveRemoteShotBaseDamage('smg', [0, 1.38, 6], [[0, 0, -1]], target);
    const head = deriveRemoteShotBaseDamage('smg', [0, 2.2, 6], [[0, 0, -1]], target);
    expect(body).toBe(23);
    expect(head).toBe(35);
    expect(head).toBeLessThan(100);
    expect(resolveRemotePoweredDamage(head, 1)).toBe(35);
    expect(resolveRemotePoweredDamage(head, 4)).toBe(100); // OD×4 can finish
  });

  it('requires every authored scattergun pellet and derives only intersecting rays', () => {
    const target = { x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    expect(deriveRemoteShotBaseDamage('scattergun', [0, 1.38, 4], [[0, 0, -1]], target)).toBe(0);
    const pellets = Array.from({ length: 9 }, (_, index) => index === 0
      ? [0, 0, -1] as [number, number, number]
      : [1, 0, 0] as [number, number, number]);
    expect(deriveRemoteShotBaseDamage('scattergun', [0, 1.38, 4], pellets, target)).toBeGreaterThan(0);
  });

  it('rejects sender-prepowered gun damage and applies Overdrive once at the receiver', () => {
    const maximum = maximumRemoteShotBaseDamage('carbine');
    expect(maximum).toBe(47);
    expect(admitRemoteBaseDamage(100, maximum)).toBe(false);
    expect(admitRemoteBaseDamage(31, maximum)).toBe(true);
    expect(resolveRemotePoweredDamage(31, 4)).toBe(100);
    expect(resolveRemotePoweredDamage(31, 1)).toBe(31);
  });

  it('keeps ordinary grenade damage outside its real radius at zero', () => {
    expect(maximumRemoteExplosiveBaseDamage('grenade', 8.1, 'stand')).toBeGreaterThan(0);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 16.1, 'stand')).toBe(0);
    expect(maximumRemoteExplosiveBaseDamage('tri-pass', 12, 'stand')).toBeGreaterThan(0);
  });

  it('uses source-specific bounded support damage', () => {
    expect(maximumRemoteExplosiveBaseDamage('hunter-swarm', 0.5, 'prone')).toBe(18);
    expect(maximumRemoteExplosiveBaseDamage('hunter-swarm', 0.5, 'stand')).toBe(100);
    expect(maximumRemoteExplosiveBaseDamage('nuke', 80, 'stand')).toBe(100);
  });

  it('never accepts non-finite or non-positive claimed damage', () => {
    expect(admitRemoteBaseDamage(Number.NaN, 100)).toBe(false);
    expect(admitRemoteBaseDamage(0, 100)).toBe(false);
    expect(admitRemoteBaseDamage(101, 100)).toBe(false);
  });
});
