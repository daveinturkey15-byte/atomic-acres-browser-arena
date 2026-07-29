import { describe, expect, it } from 'vitest';
import { smokeDensityAlongRay } from './combat/ordnance';
import {
  admitBotFlash,
  createBotPerceptionState,
  resolveBotPerception,
} from './bot-perception-authority';

describe('bot perception authority', () => {
  it('queries semantic smoke density and forbids precise tracking or fire through blocking smoke', () => {
    const observer = { x: 0, y: 1.4, z: 0 };
    const target = { x: 10, y: 1.4, z: 0 };
    const volumes = [{ id: 'smoke-a', centre: { x: 5, y: 1.4, z: 0 }, radiusM: 2, startsAtMs: 0, expiresAtMs: 20_000 }];
    const density = smokeDensityAlongRay(observer, target, volumes, 1_000);
    expect(density).toBe(1);
    const projection = resolveBotPerception(createBotPerceptionState(3, 'bot-a', 1), {
      hostTimeMs: 1_000, targetId: 'player-a', solidLineOfSight: true, smokeDensity: density,
    });
    expect(projection).toMatchObject({
      canSeeTarget: false, canFire: false, preciseTracking: false, reason: 'blocking-smoke',
    });
    expect(projection.state.targetLockId).toBeNull();
  });

  it('uses admitted shot corridors as semantic visibility rather than particle appearance', () => {
    const observer = { x: 0, y: 1, z: 0 };
    const target = { x: 10, y: 1, z: 0 };
    const volume = {
      id: 'smoke-a', centre: { x: 5, y: 1, z: 0 }, radiusM: 2, startsAtMs: 0, expiresAtMs: 20_000,
      corridors: [{ start: observer, end: target, radiusM: 0.42, expiresAtMs: 1_400 }],
    };
    expect(smokeDensityAlongRay(observer, target, [volume], 1_000)).toBe(0);
    expect(smokeDensityAlongRay(observer, target, [volume], 1_401)).toBe(1);
  });

  it('accepts only host-owned, facing, unobstructed flash and breaks target lock through bounded recovery', () => {
    const locked = resolveBotPerception(createBotPerceptionState(8, 'bot-b', 4), {
      hostTimeMs: 100, targetId: 'guest', solidLineOfSight: true, smokeDensity: 0,
    }).state;
    const request = {
      matchEpoch: 8, targetLifeId: 4, resultId: 'flash:8:p1:5:bot-b', hostTimeMs: 200,
      durationMs: 2_800, intensity: 1, facingDot: 0.8, hasLineOfSight: true,
    };
    expect(admitBotFlash(locked, { ...request, isHost: false }).reason).toBe('not-host');
    expect(admitBotFlash(locked, { ...request, isHost: true, facingDot: -0.2 }).reason).toBe('not-exposed');
    expect(admitBotFlash(locked, { ...request, isHost: true, hasLineOfSight: false }).reason).toBe('not-exposed');
    const flashed = admitBotFlash(locked, { ...request, isHost: true });
    expect(flashed.accepted).toBe(true);
    expect(flashed.state.targetLockId).toBeNull();
    expect(flashed.state.blindUntilHostTimeMs).toBe(3_000);
    expect(resolveBotPerception(flashed.state, {
      hostTimeMs: 2_999, targetId: 'guest', solidLineOfSight: true, smokeDensity: 0,
    })).toMatchObject({ canSeeTarget: false, canFire: false, reason: 'flash-blind' });
    expect(resolveBotPerception(flashed.state, {
      hostTimeMs: 3_100, targetId: 'guest', solidLineOfSight: true, smokeDensity: 0,
    })).toMatchObject({ canSeeTarget: true, canFire: false, reason: 'flash-recovery' });
    expect(resolveBotPerception(flashed.state, {
      hostTimeMs: 3_451, targetId: 'guest', solidLineOfSight: true, smokeDensity: 0,
    })).toMatchObject({ canSeeTarget: true, canFire: true, reason: 'clear' });
  });

  it('rejects replay, stale life and wrong epoch for two-peer authority parity', () => {
    const state = createBotPerceptionState(5, 'host-bot-1', 2);
    const request = {
      isHost: true, matchEpoch: 5, targetLifeId: 2, resultId: 'flash:5:guest:9:host-bot-1',
      hostTimeMs: 500, durationMs: 1_000, intensity: 0.8, facingDot: 0.7, hasLineOfSight: true,
    };
    const accepted = admitBotFlash(state, request);
    expect(admitBotFlash(accepted.state, request).reason).toBe('replay');
    expect(admitBotFlash(state, { ...request, targetLifeId: 1 }).reason).toBe('stale-life');
    expect(admitBotFlash(state, { ...request, matchEpoch: 4 }).reason).toBe('wrong-epoch');
    expect(structuredClone(accepted.state)).toEqual(accepted.state);
  });
});
