import { describe, expect, it } from 'vitest';
import {
  boxColliderProbe,
  EYE_CLEARANCE_MAX_PUSH_M,
  EYE_CLEARANCE_RADIUS_M,
  resolveEyeClearance,
} from './camera-eye-clearance';
import type { Box2 } from './collision';

const wall: Box2 = { minX: 1, maxX: 2, minZ: -4, maxZ: 4, minY: 0, maxY: 3 };

describe('camera eye clearance (owner: no clipping near walls or prone)', () => {
  it('leaves a clear seat untouched', () => {
    const seat = resolveEyeClearance({ x: 0, y: 1.6, z: 0 }, boxColliderProbe([wall]));
    expect(seat).toMatchObject({ x: 0, y: 1.6, z: 0, pushedM: 0 });
  });

  it('pushes the eye off a hugged wall to the full clearance radius', () => {
    // Eye 0.04 m from the wall face - the exact class the sweep measures
    // (d = 0.028-0.142). RED without the resolve: the seat stays at 0.96.
    const seat = resolveEyeClearance({ x: 0.96, y: 1.6, z: 0 }, boxColliderProbe([wall]));
    expect(1 - seat.x).toBeGreaterThanOrEqual(EYE_CLEARANCE_RADIUS_M - 1e-6);
    expect(seat.y).toBe(1.6);
    expect(seat.z).toBe(0);
    expect(seat.pushedM).toBeCloseTo(EYE_CLEARANCE_RADIUS_M - 0.04, 5);
  });

  it('resolves a rotated ramp-flank collider (the deferred atomic class)', () => {
    const ramp: Box2 = {
      minX: -0.6, maxX: 0.6, minZ: -1.4, maxZ: 1.4, minY: 0, maxY: 2.2,
      rotation: [0, 0.5, 0.35],
    };
    const seat = resolveEyeClearance({ x: 0.62, y: 1.3, z: 0 }, boxColliderProbe([ramp]));
    expect(seat.pushedM).toBeGreaterThan(0);
    // Re-probing the resolved seat finds nothing inside the radius.
    const settled = resolveEyeClearance(seat, boxColliderProbe([ramp]));
    expect(settled.pushedM).toBeLessThan(0.02);
  });

  it('pushes down from a sloped surface overhead (prone under a ramp belly)', () => {
    const belly: Box2 = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: 0.5, maxY: 1.2 };
    const seat = resolveEyeClearance({ x: 0, y: 0.43, z: 0 }, boxColliderProbe([belly]));
    expect(seat.y).toBeLessThanOrEqual(0.5 - EYE_CLEARANCE_RADIUS_M + 1e-6);
  });

  it('depenetrates a shallow intrusion through the nearest face', () => {
    // The runtime class: a ramp-flank shot slab protruding past its movement
    // collider, with the eye 0.06 m inside the volume. Entry probes all read
    // 0 and cancel; the exit fan must push out through the nearest face.
    const slab: Box2 = { minX: -0.5, maxX: 0.06, minZ: -3, maxZ: 3, minY: 0, maxY: 3 };
    const seat = resolveEyeClearance({ x: 0, y: 1.6, z: 0 }, boxColliderProbe([slab]));
    expect(seat.x).toBeGreaterThanOrEqual(0.06 + EYE_CLEARANCE_RADIUS_M - 1e-6);
    const settled = resolveEyeClearance(seat, boxColliderProbe([slab]));
    expect(settled.pushedM).toBe(0);
  });

  it('leaves an eye DEEP inside an enterable volume alone', () => {
    const hall: Box2 = { minX: -3, maxX: 3, minZ: -3, maxZ: 3, minY: 0, maxY: 3 };
    const seat = resolveEyeClearance({ x: 0, y: 1.6, z: 0 }, boxColliderProbe([hall]));
    expect(seat.pushedM).toBe(0);
  });

  it('caps the total push so a squeeze can never teleport the view', () => {
    const squeezeLeft: Box2 = { minX: -1.05, maxX: -0.05, minZ: -4, maxZ: 4, minY: 0, maxY: 3 };
    const squeezeRight: Box2 = { minX: 0.05, maxX: 1.05, minZ: -4, maxZ: 4, minY: 0, maxY: 3 };
    const seat = resolveEyeClearance({ x: 0, y: 1.6, z: 0 }, boxColliderProbe([squeezeLeft, squeezeRight]));
    expect(seat.pushedM).toBeLessThanOrEqual(EYE_CLEARANCE_MAX_PUSH_M + 1e-6);
  });
});
