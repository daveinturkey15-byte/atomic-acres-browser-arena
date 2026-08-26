import { describe, expect, it } from 'vitest';
import { AUTHORITATIVE_HIT_PROXIES, hitProxyRootTransform, hitProxyZoneCentre } from './hit-proxies';

describe('authoritative player and bot hit proxies', () => {
  it('centres the standing head volume on the shipped operator skull, not empty air above it', () => {
    const head = AUTHORITATIVE_HIT_PROXIES.find((proxy) => proxy.zone === 'head');
    expect(head).toBeDefined();
    expect(head?.position[1]).toBeCloseTo(1.58, 2);
    expect((head?.position[1] ?? 0) + (head?.size[1] ?? 0) / 2).toBeLessThanOrEqual(1.77);
    expect((head?.position[1] ?? 0) - (head?.size[1] ?? 0) / 2).toBeGreaterThanOrEqual(1.39);
  });

  it('uses one finite stance transform for local bots, rendered players, and remote admission', () => {
    expect(hitProxyRootTransform('stand')).toEqual({ position: [0, 0, 0], rotationX: 0 });
    expect(hitProxyRootTransform('crouch')).toEqual({ position: [0, -0.42, 0], rotationX: 0 });
    const prone = hitProxyRootTransform('prone');
    expect(prone.position.every(Number.isFinite)).toBe(true);
    expect(prone.position[1]).toBeCloseTo(0.304, 2);
    expect(prone.position[2]).toBeCloseTo(0.83, 2);
    expect(prone.rotationX).toBeCloseTo(-1.42, 2);
  });

  it('keeps the head centre on the visible silhouette in every stance', () => {
    expect(hitProxyZoneCentre('head', 'stand')).toEqual([0, 1.58, 0]);
    expect(hitProxyZoneCentre('head', 'crouch')[1]).toBeCloseTo(1.16, 2);
    const proneHead = hitProxyZoneCentre('head', 'prone');
    expect(proneHead[1]).toBeCloseTo(0.54, 2);
    expect(proneHead[2]).toBeCloseTo(-0.73, 2);
  });
});
