import { describe, expect, it } from 'vitest';
import { PILOTED_DRONE_VIEW_CONTRACT, applyPilotedDronePointerDelta } from './killstreak-drone-input';

describe('piloted drone first-person input contract', () => {
  it('uses a true first-person optic camera and conventional non-inverted pointer look', () => {
    expect(PILOTED_DRONE_VIEW_CONTRACT).toMatchObject({
      cameraMode: 'first-person-optic',
      inputPreset: 'fps-non-inverted',
      hidesPossessedDroneBody: true,
    });
    expect(applyPilotedDronePointerDelta({ yaw: 0, pitch: 0, deltaX: 20, deltaY: -10, radiansPerPixel: 0.002 }))
      .toEqual({ yaw: 0.04, pitch: 0.02 });
    expect(applyPilotedDronePointerDelta({ yaw: 0, pitch: 0, deltaX: 0, deltaY: 10, radiansPerPixel: 0.002 }).pitch)
      .toBeLessThan(0);
  });

  it('wraps yaw and clamps pitch at the host protocol envelope', () => {
    const pose = applyPilotedDronePointerDelta({
      yaw: Math.PI,
      pitch: 1,
      deltaX: 1_000,
      deltaY: -1_000,
      radiansPerPixel: 0.05,
    });
    expect(pose.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(pose.yaw).toBeLessThanOrEqual(Math.PI);
    expect(pose.pitch).toBe(1.2);
  });
});
