import { describe, expect, it } from 'vitest';
import { FLYING_CAT_PATH_DURATION_MS, flyingCatPose } from './gun-range-cat-choreography';

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(...left.map((value, index) => value - (right[index] ?? 0)));
}

describe('Gun Range flying cat choreography', () => {
  it('stays smooth and inside the authored live-fire volume', () => {
    let previous = flyingCatPose(0);
    for (let timeMs = 16; timeMs <= FLYING_CAT_PATH_DURATION_MS; timeMs += 16) {
      const pose = flyingCatPose(timeMs);
      expect([...pose.position, pose.yawRadians, pose.pitchRadians, pose.rollRadians].every(Number.isFinite)).toBe(true);
      expect(pose.position[0]).toBeGreaterThanOrEqual(-11.5);
      expect(pose.position[0]).toBeLessThanOrEqual(10.8);
      expect(pose.position[1]).toBeGreaterThanOrEqual(3.25);
      expect(pose.position[1]).toBeLessThanOrEqual(4.6);
      expect(pose.position[2]).toBeGreaterThanOrEqual(-36.5);
      expect(pose.position[2]).toBeLessThanOrEqual(-9.8);
      expect(Math.abs(pose.rollRadians)).toBeLessThanOrEqual(0.14);
      expect(distance(previous.position, pose.position)).toBeLessThan(0.085);
      const tangentX = pose.position[0] - previous.position[0];
      const tangentZ = pose.position[2] - previous.position[2];
      const tangentLength = Math.max(0.000_001, Math.hypot(tangentX, tangentZ));
      const headForwardX = -Math.sin(pose.yawRadians);
      const headForwardZ = -Math.cos(pose.yawRadians);
      const facingDot = headForwardX * tangentX / tangentLength + headForwardZ * tangentZ / tangentLength;
      expect(facingDot).toBeGreaterThan(0.99);
      expect(-facingDot).toBeLessThan(-0.99); // local +Z trail stays behind the tangent
      previous = pose;
    }
  });

  it('closes without a position or attitude pop', () => {
    const start = flyingCatPose(0);
    const seam = flyingCatPose(FLYING_CAT_PATH_DURATION_MS);
    expect(distance(start.position, seam.position)).toBeLessThan(0.000_001);
    expect(seam.yawRadians).toBeCloseTo(start.yawRadians, 10);
    expect(seam.pitchRadians).toBeCloseTo(start.pitchRadians, 10);
    expect(seam.rollRadians).toBeCloseTo(start.rollRadians, 10);
  });
});
