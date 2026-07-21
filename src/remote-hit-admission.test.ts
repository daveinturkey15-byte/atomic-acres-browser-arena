import { describe, expect, it } from 'vitest';
import {
  admitRemoteBaseDamage,
  deriveRemoteShotBaseDamage,
  maximumRemoteExplosiveBaseDamage,
  maximumRemoteShotBaseDamage,
  resolveRemotePoweredDamage,
} from './remote-hit-admission';

describe('remote hit admission', () => {
  it('derives range and hit-zone damage from the admitted ray', () => {
    const target = { x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    const head = deriveRemoteShotBaseDamage('carbine', [0, 2.18, 6], [[0, 0, -1]], target);
    const body = deriveRemoteShotBaseDamage('carbine', [0, 1.38, 6], [[0, 0, -1]], target);
    expect(head).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(0);
    expect(deriveRemoteShotBaseDamage('carbine', [0, 1.38, 6], [[1, 0, 0]], target)).toBe(0);
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
    expect(maximum).toBeCloseTo(46.5);
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
