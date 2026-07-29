import { describe, expect, it } from 'vitest';
import { supportForwardFromYawPitch } from './support-forward-axis';
import {
  PILOTED_DRONE_VIEW_CONTRACT,
  applyPilotedDronePointerDelta,
  applyPilotedDroneScreenLookDelta,
  pilotedDroneControlAxes,
} from './killstreak-drone-input';

describe('piloted drone first-person input contract', () => {
  it('uses a true first-person optic camera and conventional non-inverted pointer look', () => {
    expect(PILOTED_DRONE_VIEW_CONTRACT).toMatchObject({
      cameraMode: 'first-person-optic',
      inputPreset: 'fps-non-inverted',
      hidesPossessedDroneBody: true,
    });
    const upRight = applyPilotedDronePointerDelta({ yaw: 0, pitch: 0, deltaX: 20, deltaY: -10, radiansPerPixel: 0.002 });
    expect(upRight).toEqual({ yaw: -0.04, pitch: 0.02 });
    const forward = supportForwardFromYawPitch(upRight.yaw, upRight.pitch);
    expect(forward[0]).toBeGreaterThan(0);
    expect(forward[1]).toBeGreaterThan(0);
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

  it('maps every keyboard and standard-gamepad travel direction without inversion', () => {
    expect(pilotedDroneControlAxes({
      keyboardForward: true, keyboardBackward: false, keyboardRight: true, keyboardLeft: false,
      keyboardAscend: true, keyboardDescend: false, gamepadMoveX: 0, gamepadMoveY: 0, gamepadVertical: 0,
    })).toEqual({ thrust: 1, strafe: 1, vertical: 1 });
    expect(pilotedDroneControlAxes({
      keyboardForward: false, keyboardBackward: true, keyboardRight: false, keyboardLeft: true,
      keyboardAscend: false, keyboardDescend: true, gamepadMoveX: 0, gamepadMoveY: 0, gamepadVertical: 0,
    })).toEqual({ thrust: -1, strafe: -1, vertical: -1 });
    expect(pilotedDroneControlAxes({
      keyboardForward: false, keyboardBackward: false, keyboardRight: false, keyboardLeft: false,
      keyboardAscend: false, keyboardDescend: false, gamepadMoveX: 0.75, gamepadMoveY: -0.5, gamepadVertical: 1,
    })).toEqual({ thrust: 0.5, strafe: 0.75, vertical: 1 });
    expect(pilotedDroneControlAxes({
      keyboardForward: false, keyboardBackward: false, keyboardRight: false, keyboardLeft: false,
      keyboardAscend: false, keyboardDescend: false, gamepadMoveX: -0.75, gamepadMoveY: 0.5, gamepadVertical: -1,
    })).toEqual({ thrust: -0.5, strafe: -0.75, vertical: -1 });
  });

  it('uses the same non-inverted look signs for a standard-gamepad right stick', () => {
    const pose = applyPilotedDroneScreenLookDelta({
      yaw: 0,
      pitch: 0,
      horizontalLookDelta: 0.25,
      verticalLookDelta: -0.15,
    });
    const forward = supportForwardFromYawPitch(pose.yaw, pose.pitch);
    expect(forward[0]).toBeGreaterThan(0);
    expect(forward[1]).toBeGreaterThan(0);
  });
});
