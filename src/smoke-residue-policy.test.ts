import { describe, expect, it } from 'vitest';
import { GRENADE_IDS } from './combat/grenade-catalog';
import { smokeBlocksTargetAcquisition, smokeDensityAlongRay } from './combat/ordnance';
import { createBotPerceptionState, resolveBotPerception } from './bot-perception-authority';
import { grenadeSmokeRadiusM } from './grenade-smoke-policy';
import {
  EXPLOSION_RESIDUE_SMOKE_RADIUS_M,
  MAX_ACTIVE_SMOKE_VOLUMES,
  MAX_SMOKE_CORRIDORS_PER_VOLUME,
  SMOKE_AUTHORITY_SCHEMA_VERSION,
  SMOKE_ORIGINAL_RADIUS_M,
  SMOKE_VOLUME_RADIUS_M,
  SmokeAuthority,
  smokeAppearanceFor,
} from './smoke-authority';
import { MAX_SMOKE_STATE_MESSAGE_BYTES, isSmokeStateMessage } from './smoke-protocol';

const observer = { x: -12, y: 1.25, z: 0 };
const target = { x: 12, y: 1.25, z: 0 };
const centre = { x: 0, y: 1.25, z: 0 };
const EPOCH = 7;
const T0 = 100_000;

function area(radiusM: number): number {
  return Math.PI * radiusM * radiusM;
}

describe('smoke residue footprint HF563/564', () => {
  it('pins original radius and exact area ratios', () => {
    const originalArea = Math.PI * 4.2 ** 2;
    expect(SMOKE_ORIGINAL_RADIUS_M).toBe(4.2);
    expect(SMOKE_VOLUME_RADIUS_M).toBe(4.2 * Math.sqrt(3));
    expect(EXPLOSION_RESIDUE_SMOKE_RADIUS_M).toBe(4.2 / Math.sqrt(2));
    expect(area(SMOKE_VOLUME_RADIUS_M) / originalArea).toBeCloseTo(3, 12);
    expect(area(EXPLOSION_RESIDUE_SMOKE_RADIUS_M) / originalArea).toBeCloseTo(0.5, 12);
    expect(SMOKE_VOLUME_RADIUS_M).not.toBeCloseTo(4.2 * 3, 12);
    expect(SMOKE_VOLUME_RADIUS_M).toBeLessThanOrEqual(8);
    expect(EXPLOSION_RESIDUE_SMOKE_RADIUS_M).toBeLessThanOrEqual(8);
  });

  it('covers every shipped grenade id without generic fallback', () => {
    expect([...GRENADE_IDS].sort()).toEqual(['flash', 'frag', 'semtex', 'smoke']);
    for (const id of GRENADE_IDS) {
      if (id === 'smoke') expect(grenadeSmokeRadiusM(id)).toBe(SMOKE_VOLUME_RADIUS_M);
      else if (id === 'frag' || id === 'semtex') expect(grenadeSmokeRadiusM(id)).toBe(EXPLOSION_RESIDUE_SMOKE_RADIUS_M);
      else expect(grenadeSmokeRadiusM(id)).toBeNull();
    }
    expect(grenadeSmokeRadiusM('flash')).toBeNull();
  });

  it('host registers policy radii, replica and epoch and radius cap refuse', () => {
    const host = new SmokeAuthority(EPOCH, 'host');
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'owner-a', actionNonce: 1, centre, startsAtHostTimeMs: T0, radiusM: grenadeSmokeRadiusM('smoke') ?? 0 })).toBe(true);
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'owner-b', actionNonce: 2, centre, startsAtHostTimeMs: T0, radiusM: grenadeSmokeRadiusM('frag') ?? 0 })).toBe(true);
    const replica = new SmokeAuthority(EPOCH, 'replica');
    expect(replica.registerVolume({ matchEpoch: EPOCH, ownerId: 'owner-a', actionNonce: 1, centre, startsAtHostTimeMs: T0, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(false);
    expect(host.registerVolume({ matchEpoch: EPOCH + 1, ownerId: 'owner-c', actionNonce: 3, centre, startsAtHostTimeMs: T0, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(false);
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'owner-c', actionNonce: 3, centre, startsAtHostTimeMs: T0, radiusM: 8.01 })).toBe(false);
    expect(host.snapshot(T0).volumes).toHaveLength(2);
  });

  it('duplicate owner nonce adds nothing, two owners same nonce stay distinct', () => {
    const host = new SmokeAuthority(EPOCH, 'host');
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'dup', actionNonce: 9, centre, startsAtHostTimeMs: T0, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(true);
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'dup', actionNonce: 9, centre, startsAtHostTimeMs: T0 + 10, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(false);
    expect(host.snapshot(T0 + 10).volumes).toHaveLength(1);
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'other', actionNonce: 9, centre, startsAtHostTimeMs: T0 + 10, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(true);
    expect(host.snapshot(T0 + 10).volumes).toHaveLength(2);
  });

  it('lifetimes stay deterministic in 5-10s band with stable colour, expiry and reset clear', () => {
    const first = smokeAppearanceFor(EPOCH, 'owner-a', 11);
    const second = smokeAppearanceFor(EPOCH, 'owner-a', 11);
    expect(second).toEqual(first);
    expect(first.lifetimeMs).toBeGreaterThanOrEqual(5000);
    expect(first.lifetimeMs).toBeLessThanOrEqual(10000);
    const host = new SmokeAuthority(EPOCH, 'host');
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'owner-a', actionNonce: 11, centre, startsAtHostTimeMs: T0 })).toBe(true);
    const expiresAt = T0 + first.lifetimeMs;
    expect(host.snapshot(expiresAt - 1).volumes).toHaveLength(1);
    expect(host.snapshot(expiresAt).volumes).toHaveLength(0);
    host.reset(EPOCH + 1, 'host');
    expect(host.snapshot(T0).volumes).toHaveLength(0);
  });

  it('main cloud blocks, corridor opens at same host time, 900ms expiry restores, bot cannot fire', () => {
    const host = new SmokeAuthority(EPOCH, 'host');
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'smoker', actionNonce: 20, centre, startsAtHostTimeMs: T0, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(true);
    const volumes = host.snapshot(T0 + 5).volumes;
    expect(smokeBlocksTargetAcquisition(observer, target, volumes, T0 + 5)).toBe(true);
    expect(smokeDensityAlongRay(observer, target, volumes, T0 + 5)).toBeGreaterThanOrEqual(0.55);
    const bot = createBotPerceptionState(EPOCH, 'bot-1', 1);
    const blocked = resolveBotPerception(bot, { hostTimeMs: T0 + 5, targetId: 'tgt', solidLineOfSight: true,
      smokeDensity: smokeDensityAlongRay(observer, target, volumes, T0 + 5) });
    expect(blocked.canFire).toBe(false);
    expect(blocked.canSeeTarget).toBe(false);
    expect(host.admitShot({ matchEpoch: EPOCH, shotResultId: 's:1', resolvedAtHostTimeMs: T0 + 10, segments: [{ pelletIndex: 0, start: observer, end: target }] }).accepted).toBe(true);
    const opened = host.snapshot(T0 + 10).volumes;
    expect(smokeBlocksTargetAcquisition(observer, target, opened, T0 + 10)).toBe(false);
    expect(host.snapshot(T0 + 10 + 900).volumes[0]?.corridors ?? []).toHaveLength(0);
    expect(smokeBlocksTargetAcquisition(observer, target, host.snapshot(T0 + 10 + 900).volumes, T0 + 10 + 900)).toBe(true);
  });

  it('main plus residual wire round-trips and late join matches semantically', () => {
    const host = new SmokeAuthority(EPOCH, 'host');
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'smoker', actionNonce: 30, centre, startsAtHostTimeMs: T0, radiusM: grenadeSmokeRadiusM('smoke') ?? 0 })).toBe(true);
    expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: 'fragger', actionNonce: 31, centre, startsAtHostTimeMs: T0, radiusM: grenadeSmokeRadiusM('frag') ?? 0 })).toBe(true);
    expect(SMOKE_AUTHORITY_SCHEMA_VERSION).toBe(2);
    const wire: unknown = JSON.parse(JSON.stringify({ type: 'smoke-state', schemaVersion: SMOKE_AUTHORITY_SCHEMA_VERSION, by: 'host', snapshot: host.snapshot(T0 + 5), nonce: 1 }));
    expect(isSmokeStateMessage(wire)).toBe(true);
    if (!isSmokeStateMessage(wire)) throw new Error('invalid smoke wire');
    expect(wire.snapshot.volumes).toHaveLength(2);
    const late = new SmokeAuthority(EPOCH, 'replica');
    expect(late.applyAuthoritativeSnapshot(wire.snapshot)).toBe(true);
    expect(late.snapshot(T0 + 5)).toEqual(host.snapshot(T0 + 5));
    expect(smokeBlocksTargetAcquisition(observer, target, late.snapshot(T0 + 5).volumes, T0 + 5)).toBe(smokeBlocksTargetAcquisition(observer, target, host.snapshot(T0 + 5).volumes, T0 + 5));
    expect(new TextEncoder().encode(JSON.stringify(wire)).length).toBeLessThanOrEqual(MAX_SMOKE_STATE_MESSAGE_BYTES);
    expect(MAX_SMOKE_STATE_MESSAGE_BYTES).toBe(48 * 1024);
  });

  it('caps twelve volumes eight corridors and wire bytes hold', () => {
    const host = new SmokeAuthority(EPOCH, 'host');
    for (let i = 0; i < MAX_ACTIVE_SMOKE_VOLUMES + 1; i += 1) {
      expect(host.registerVolume({ matchEpoch: EPOCH, ownerId: `cap-${i}`, actionNonce: i, centre: { x: i, y: 1.25, z: 0 }, startsAtHostTimeMs: T0 + i, radiusM: SMOKE_VOLUME_RADIUS_M })).toBe(true);
    }
    expect(host.snapshot(T0 + MAX_ACTIVE_SMOKE_VOLUMES).volumes).toHaveLength(MAX_ACTIVE_SMOKE_VOLUMES);
    expect(MAX_SMOKE_CORRIDORS_PER_VOLUME).toBe(8);
    for (let p = 0; p < MAX_SMOKE_CORRIDORS_PER_VOLUME + 1; p += 1) {
      expect(host.admitShot({ matchEpoch: EPOCH, shotResultId: `cap-shot:${p}`, resolvedAtHostTimeMs: T0 + MAX_ACTIVE_SMOKE_VOLUMES, segments: [{ pelletIndex: 0, start: observer, end: target }] }).accepted).toBe(true);
    }
    for (const volume of host.snapshot(T0 + MAX_ACTIVE_SMOKE_VOLUMES).volumes) expect(volume.corridors).toHaveLength(MAX_SMOKE_CORRIDORS_PER_VOLUME);
    const full: unknown = JSON.parse(JSON.stringify({ type: 'smoke-state', schemaVersion: SMOKE_AUTHORITY_SCHEMA_VERSION, by: 'host', snapshot: host.snapshot(T0 + MAX_ACTIVE_SMOKE_VOLUMES), nonce: 2 }));
    if (!isSmokeStateMessage(full)) throw new Error('invalid cap wire');
    expect(new TextEncoder().encode(JSON.stringify(full)).length).toBeLessThanOrEqual(MAX_SMOKE_STATE_MESSAGE_BYTES);
  });
});
