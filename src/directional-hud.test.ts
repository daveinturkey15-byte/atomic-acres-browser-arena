import { describe, expect, it } from 'vitest';
import { sourceScreenAngle } from './directional-hud';

describe('camera-relative directional HUD', () => {
  it('maps forward, right, rear and left sources to CSS clockwise angles', () => {
    const player = { x: 0, z: 0 };
    expect(sourceScreenAngle(player, 0, { x: 0, z: -5 })).toBeCloseTo(0);
    expect(sourceScreenAngle(player, 0, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(sourceScreenAngle(player, 0, { x: 0, z: 5 }))).toBeCloseTo(Math.PI);
    expect(sourceScreenAngle(player, 0, { x: -5, z: 0 })).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps camera-right positive after the player turns around', () => {
    const player = { x: 4, z: 7 };
    // At yaw PI the camera faces +Z and camera-right is world -X.
    expect(sourceScreenAngle(player, Math.PI, { x: -1, z: 7 })).toBeCloseTo(Math.PI / 2);
    expect(sourceScreenAngle(player, Math.PI, { x: 9, z: 7 })).toBeCloseTo(-Math.PI / 2);
  });

  it('fails closed for coincident or non-finite sources', () => {
    expect(sourceScreenAngle({ x: 1, z: 1 }, 0, { x: 1, z: 1 })).toBe(0);
    expect(sourceScreenAngle({ x: 0, z: 0 }, 0, { x: Number.NaN, z: 0 })).toBe(0);
  });
});