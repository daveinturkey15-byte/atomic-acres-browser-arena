import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildGunRange } from './additional-maps';
import { traceBallisticPath } from './ballistics';
import { computeDamage, WEAPONS } from './gameplay';
import {
  admitRemoteBaseDamage,
  deriveAuthoritativeShotOutcomes,
  deriveRemoteShotBaseDamage,
  maximumRemoteExplosiveBaseDamage,
  maximumRemoteShotBaseDamage,
  resolveRemotePoweredDamage,
} from './remote-hit-admission';

describe('remote hit admission', () => {
  it('carries the exact HF-398 M14 envelope (52.1 / 33.6) through offline, legacy-remote and host-canonical derivation', () => {
    const m14 = WEAPONS['m14-ebr'];
    const target = { id: 'target', x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    // HF-398 (2026-09-02): the owner's +40% envelope, re-derived here independently of the catalog.
    const previousEnvelope = { base: 52.1, minimum: 33.6 } as const;
    const independentlyScaledDamage = (distance: number, multiplier: number): number => {
      const falloff = distance <= 38 ? 0 : Math.min(1, (distance - 38) / (100 - 38));
      const previousBase = previousEnvelope.base
        + (previousEnvelope.minimum - previousEnvelope.base) * falloff;
      return Math.max(1, Math.round(previousBase * multiplier * 10) / 10);
    };
    for (const [distance, zone, multiplier] of [
      [0, 'body', 1], [0, 'head', 1.7], [0, 'limb', 0.82],
      [69, 'body', 1], [69, 'head', 1.7], [69, 'limb', 0.82],
      [100, 'body', 1], [100, 'head', 1.7], [100, 'limb', 0.82],
    ] as const) {
      expect(computeDamage(m14, distance, zone)).toBe(independentlyScaledDamage(distance, multiplier));
    }

    // The legacy recipient derives the ray itself before clamping an untrusted
    // claim; neither close body/head nor far body receives a second 0.6 factor.
    expect(deriveRemoteShotBaseDamage('m14-ebr', [0, 1.0, 6], [[0, 0, -1]], target)).toBe(52.1);
    expect(deriveRemoteShotBaseDamage('m14-ebr', [0, 1.58, 6], [[0, 0, -1]], target)).toBe(88.6);
    expect(deriveRemoteShotBaseDamage('m14-ebr', [0, 1.0, 100], [[0, 0, -1]], target)).toBe(33.7);
    expect(deriveRemoteShotBaseDamage('m14-ebr', [0, 1.0, 6], [[0, 0, -1]], target, () => 0.5)).toBe(26);

    // The host shot-request lane uses the multi-target canonical derivation
    // and therefore returns the same exact close-body value and modifiers.
    const host = deriveAuthoritativeShotOutcomes(
      'm14-ebr', [0, 1.0, 6], [[0, 0, -1]], [target],
    ).get(target.id);
    expect(host).toMatchObject({ damage: 52.1, rawDamage: 52.1, pelletHits: 1, hitZone: 'body' }); // HF-398
    expect(maximumRemoteShotBaseDamage('m14-ebr')).toBe(88.6); // HF-398: 52.1 * 1.7 head
    expect(admitRemoteBaseDamage(88.6, maximumRemoteShotBaseDamage('m14-ebr'))).toBe(true);
    expect(admitRemoteBaseDamage(89, maximumRemoteShotBaseDamage('m14-ebr'))).toBe(false);
    expect(resolveRemotePoweredDamage(52.1, 2)).toBe(100); // HF-398: 104.2 raw, capped at the 100 HP ceiling
  });

  it('hits the visible standing skull and rejects the former empty-air crit point', () => {
    const target = { x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    const body = deriveRemoteShotBaseDamage('smg', [0, 1.0, 6], [[0, 0, -1]], target);
    const head = deriveRemoteShotBaseDamage('smg', [0, 1.58, 6], [[0, 0, -1]], target);
    expect(body).toBe(23);
    expect(head).toBe(35);
    expect(deriveRemoteShotBaseDamage('smg', [0, 2.2, 6], [[0, 0, -1]], target)).toBe(0);
    expect(head).toBeLessThan(100);
    expect(resolveRemotePoweredDamage(head, 1)).toBe(35);
    expect(resolveRemotePoweredDamage(head, 2)).toBe(70); // OD×2 preserves the authoritative base hit
  });

  it('admits visual headshots for crouched and prone remote players', () => {
    const crouched = { x: 0, y: 1.16, z: 0, yaw: 0, stance: 'crouch' as const };
    expect(deriveRemoteShotBaseDamage('smg', [0, 1.16, 6], [[0, 0, -1]], crouched)).toBe(35);
    const prone = { x: 0, y: 0.5, z: 0, yaw: 0, stance: 'prone' as const };
    expect(deriveRemoteShotBaseDamage('smg', [0, 0.54, -6], [[0, 0, 1]], prone)).toBe(35);
  });

  it('requires every authored scattergun pellet and derives only intersecting rays', () => {
    const target = { x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    expect(deriveRemoteShotBaseDamage('scattergun', [0, 1.38, 4], [[0, 0, -1]], target)).toBe(0);
    const pellets = Array.from({ length: 9 }, (_, index) => index === 0
      ? [0, 0, -1] as [number, number, number]
      : [1, 0, 0] as [number, number, number]);
    expect(deriveRemoteShotBaseDamage('scattergun', [0, 1.38, 4], pellets, target)).toBeGreaterThan(0);
  });

  it('derives reduced wallbang damage instead of trusting a sender multiplier', () => {
    const target = { x: 0, y: 1.7, z: 0, yaw: 0, stance: 'stand' as const };
    const halfEnergy = deriveRemoteShotBaseDamage(
      'smg',
      [0, 1.38, 6],
      [[0, 0, -1]],
      target,
      () => 0.5,
    );
    expect(halfEnergy).toBe(12);
    expect(deriveRemoteShotBaseDamage('smg', [0, 1.38, 6], [[0, 0, -1]], target, () => true)).toBe(0);
  });

  it('admits multiplayer player damage through the real Gun Range wallbang lanes', () => {
    const map = buildGunRange(new THREE.Scene());
    const origin: [number, number, number] = [-14.7, 1.38, -4];
    const target = { x: -14.7, y: 1.7, z: -12.4, yaw: 0, stance: 'stand' as const };
    const unobstructed = deriveRemoteShotBaseDamage('carbine', origin, [[0, 0, -1]], target);
    const throughWood = deriveRemoteShotBaseDamage('carbine', origin, [[0, 0, -1]], target, (shotOrigin, impact) => {
      const delta = impact.clone().sub(shotOrigin);
      const trace = traceBallisticPath(shotOrigin, delta, delta.length(), WEAPONS.carbine.penetration, map.shotSurfaces);
      return trace.reachedDistance ? trace.damageMultiplier : 0;
    });
    expect(throughWood).toBeGreaterThan(0);
    expect(throughWood).toBeLessThan(unobstructed);
  });

  it('rejects sender-prepowered gun damage and applies Overdrive once at the receiver', () => {
    const maximum = maximumRemoteShotBaseDamage('carbine');
    expect(maximum).toBe(47);
    expect(admitRemoteBaseDamage(100, maximum)).toBe(false);
    expect(admitRemoteBaseDamage(31, maximum)).toBe(true);
    expect(resolveRemotePoweredDamage(31, 2)).toBe(62);
    expect(resolveRemotePoweredDamage(31, 1)).toBe(31);
  });

  it('keeps ordinary grenade damage outside its real radius at zero', () => {
    expect(maximumRemoteExplosiveBaseDamage('grenade', 8.1, 'stand')).toBeGreaterThan(0);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 16.1, 'stand')).toBe(0);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 0, 'stand', 'semtex')).toBe(95);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 0, 'prone', 'semtex')).toBeCloseTo(39.9, 5);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 4.26, 'stand', 'semtex')).toBe(0);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 0, 'stand', 'semtex', true)).toBe(100);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 4.26, 'stand', 'semtex', true)).toBeGreaterThan(0);
    expect(maximumRemoteExplosiveBaseDamage('grenade', 8.51, 'stand', 'semtex', true)).toBe(0);
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
