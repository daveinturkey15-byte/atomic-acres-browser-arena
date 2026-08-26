import { describe, expect, it } from 'vitest';
import { sweepOrientedBoxAgainstBoxes } from './collision';
import {
  CARPET_BOMBER_COLLISION_ENVELOPE,
  resolveSupportAircraftEnvelopeStep,
  supportAircraftEnvelopeIntersectsBox,
  supportAircraftRootClearance,
  type SupportAircraftCollisionEnvelope,
} from './support-aircraft-collision';

const worldBounds = Object.freeze({
  minX: -30,
  maxX: 30,
  minZ: -30,
  maxZ: 30,
  floorY: 0,
  ceilingY: 25,
});

describe('truthful Carpet Bomber collision envelope', () => {
  it('retains shipped anisotropic bounds without inventing a 17m-tall sphere', () => {
    const envelope: SupportAircraftCollisionEnvelope = {
      ...CARPET_BOMBER_COLLISION_ENVELOPE,
      yaw: 0,
    };
    expect(envelope.halfExtents).toEqual([8.5, 0.826, 5.156]);
    expect(supportAircraftRootClearance(envelope)).toMatchObject({
      negativeY: 0.839,
      positiveY: 0.813,
    });
    expect(supportAircraftEnvelopeIntersectsBox(
      { x: 0, y: 17, z: 0 },
      envelope,
      { minX: -20, maxX: 20, minY: 24.9, maxY: 25.2, minZ: -20, maxZ: 20 },
    )).toBe(false);
  });

  it('detects a rotated collider already overlapping at the start and holds the airframe', () => {
    const envelope: SupportAircraftCollisionEnvelope = {
      halfExtents: [1.2, 0.55, 0.45],
      centreOffset: [0, 0, 0],
      yaw: Math.PI / 7,
    };
    const rotatedSolid = {
      minX: -1.5,
      maxX: 1.5,
      minY: 9.5,
      maxY: 10.5,
      minZ: -0.2,
      maxZ: 0.2,
      rotation: [0, Math.PI / 4, 0] as [number, number, number],
    };
    const root = { x: 0.45, y: 10, z: 0.1 };
    expect(supportAircraftEnvelopeIntersectsBox(root, envelope, rotatedSolid)).toBe(true);
    expect(sweepOrientedBoxAgainstBoxes(root, { x: 0.001, y: 0, z: 0.001 }, [rotatedSolid], {
      halfExtents: { x: 1.2, y: 0.55, z: 0.45 },
      centreOffset: { x: 0, y: 0, z: 0 },
      yaw: envelope.yaw,
    })).toMatchObject({ time: 0 });
    expect(resolveSupportAircraftEnvelopeStep({
      bounds: worldBounds,
      solids: [rotatedSolid],
      from: [root.x, root.y, root.z],
      desired: [root.x + 0.001, root.y, root.z + 0.001],
      envelope,
    })).toEqual({
      position: [root.x, root.y, root.z],
      collided: true,
      recovery: 'hold',
    });
  });

  it('stops the wide airframe before a wall while leaving clear motion direct', () => {
    const envelope: SupportAircraftCollisionEnvelope = {
      ...CARPET_BOMBER_COLLISION_ENVELOPE,
      yaw: 0,
    };
    const wall = { minX: 10, maxX: 10.5, minY: 0, maxY: 25, minZ: -20, maxZ: 20 };
    const blocked = resolveSupportAircraftEnvelopeStep({
      bounds: worldBounds,
      solids: [wall],
      from: [0, 17, 0],
      desired: [8, 17, 0],
      envelope,
    });
    expect(blocked.collided).toBe(true);
    expect(blocked.position[0]).toBeLessThan(1.5);
    expect(supportAircraftEnvelopeIntersectsBox(
      { x: blocked.position[0], y: blocked.position[1], z: blocked.position[2] },
      envelope,
      wall,
    )).toBe(false);
    expect(resolveSupportAircraftEnvelopeStep({
      bounds: worldBounds,
      solids: [wall],
      from: [-10, 17, -25],
      desired: [-8, 17, -24],
      envelope,
    }).recovery).toBe('direct');
  });
});
