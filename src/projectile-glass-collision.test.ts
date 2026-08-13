import { describe, expect, it } from 'vitest';
import { sweepSphereAgainstBoxes, type Box2 } from './collision';
import { resolveIdentifiedGlassSweepImpact, type ProjectileGlassRayHit } from './projectile-glass-collision';

const start = Object.freeze({ x: 0, y: 0, z: 0 });
const radiusM = 0.16;

function resolve(
  delta: Readonly<{ x: number; y: number; z: number }>,
  colliders: readonly Box2[],
  glassColliders: ReadonlyMap<Box2, string>,
  glassRayHit: ProjectileGlassRayHit | null,
) {
  const worldHit = sweepSphereAgainstBoxes(start, delta, colliders, radiusM);
  return {
    worldHit,
    collision: resolveIdentifiedGlassSweepImpact(
      worldHit,
      glassRayHit,
      worldHit ? glassColliders.get(worldHit.box) ?? null : null,
    ),
  };
}

describe('identified projectile glass collision', () => {
  it('does not misattribute a pane behind unrelated grazing cover', () => {
    const delta = Object.freeze({ x: 10, y: 0, z: 0.2 });
    const grazingCover: Box2 = Object.freeze({
      minX: 3,
      maxX: 5,
      minY: -1,
      maxY: 1,
      minZ: 0.25,
      maxZ: 0.5,
    });
    const pane: Box2 = Object.freeze({
      minX: 6,
      maxX: 6.02,
      minY: -1,
      maxY: 1,
      minZ: -1,
      maxZ: 1,
    });
    const glassRayHit = Object.freeze({ time: 0.6, windowId: 'skyline-pane' });
    const { worldHit, collision } = resolve(
      delta,
      [pane, grazingCover],
      new Map([[pane, glassRayHit.windowId]]),
      glassRayHit,
    );

    expect(worldHit?.box).toBe(grazingCover);
    expect(worldHit?.normal).toEqual({ x: 0, y: 0, z: -1 });
    expect(glassRayHit.time).toBeLessThan(
      worldHit!.time + radiusM / Math.abs(delta.z),
    );
    expect(collision).toBe(worldHit!.time);
  });

  it('keeps opaque cover authoritative over a farther pane', () => {
    const delta = Object.freeze({ x: 10, y: 0, z: 0 });
    const cover: Box2 = Object.freeze({
      minX: 3,
      maxX: 3.2,
      minY: -1,
      maxY: 1,
      minZ: -1,
      maxZ: 1,
    });
    const pane: Box2 = Object.freeze({
      minX: 6,
      maxX: 6.02,
      minY: -1,
      maxY: 1,
      minZ: -1,
      maxZ: 1,
    });
    const glassRayHit = Object.freeze({ time: 0.6, windowId: 'covered-pane' });
    const { worldHit, collision } = resolve(
      delta,
      [cover, pane],
      new Map([[pane, glassRayHit.windowId]]),
      glassRayHit,
    );

    expect(worldHit?.box).toBe(cover);
    expect(collision).toBe(worldHit!.time);
  });

  it('attributes the real Skyline-style axial surface lead to the exact pane', () => {
    const delta = Object.freeze({ x: 0, y: 0.5792513444732934, z: -5.154385083549701 });
    const pane: Box2 = Object.freeze({
      minX: -1,
      maxX: 1,
      minY: -1,
      maxY: 2,
      minZ: -3.02,
      maxZ: -3,
    });
    const glassRayHit = Object.freeze({
      time: 3 / Math.abs(delta.z),
      windowId: 'skyline-pane',
    });
    const { worldHit, collision } = resolve(
      delta,
      [pane],
      new Map([[pane, glassRayHit.windowId]]),
      glassRayHit,
    );

    expect(worldHit?.box).toBe(pane);
    expect(worldHit?.time).toBeCloseTo((3 - radiusM) / Math.abs(delta.z), 12);
    expect(glassRayHit.time - worldHit!.time).toBeCloseTo(
      radiusM / Math.abs(delta.z),
      12,
    );
    expect(collision).toEqual({
      fraction: worldHit!.time,
      breakableWindowId: glassRayHit.windowId,
    });
  });
});
