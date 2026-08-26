import { supportForwardFromYawPitch, type SupportDirection } from './support-forward-axis';

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0))
);

export const PILOTED_DRONE_VIEW_CONTRACT = Object.freeze({
  cameraMode: 'first-person-optic',
  inputPreset: 'fps-non-inverted',
  maximumPitchRadians: 1.2,
  cameraForwardOffsetM: 0.31,
  cameraVerticalOffsetM: 0.035,
  hidesPossessedDroneBody: true,
} as const);

export type PilotedDroneLook = Readonly<{ yaw: number; pitch: number }>;

export type PilotedDroneControlAxes = Readonly<{
  thrust: number;
  strafe: number;
  vertical: number;
}>;

export type PilotedDroneWorldVelocity = SupportDirection;

/**
 * Converts browser/gamepad screen-space look deltas to Three.js camera yaw and
 * pitch. Positive screen X means look right and positive screen Y means look
 * down, while Three.js local -Z uses negative yaw for a right turn and positive
 * pitch for an upward turn.
 */
export function applyPilotedDroneScreenLookDelta(input: Readonly<{
  yaw: number;
  pitch: number;
  horizontalLookDelta: number;
  verticalLookDelta: number;
}>): PilotedDroneLook {
  const horizontal = Number.isFinite(input.horizontalLookDelta) ? input.horizontalLookDelta : 0;
  const vertical = Number.isFinite(input.verticalLookDelta) ? input.verticalLookDelta : 0;
  const yaw = input.yaw - horizontal;
  const pitch = input.pitch - vertical;
  return Object.freeze({
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
    pitch: clamp(pitch, -PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians, PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians),
  });
}

/**
 * Browser pointer Y grows downward; world pitch grows upward. Negating deltaY
 * gives conventional FPS look (mouse up looks up) and prevents the previously
 * perceived inverted drone control.
 */
export function applyPilotedDronePointerDelta(input: Readonly<{
  yaw: number;
  pitch: number;
  deltaX: number;
  deltaY: number;
  radiansPerPixel: number;
  verticalRadiansPerPixel?: number;
}>): PilotedDroneLook {
  const horizontalSensitivity = clamp(input.radiansPerPixel, 0.0001, 0.05);
  const verticalSensitivity = clamp(input.verticalRadiansPerPixel ?? input.radiansPerPixel, 0.0001, 0.05);
  return applyPilotedDroneScreenLookDelta({
    yaw: input.yaw,
    pitch: input.pitch,
    horizontalLookDelta: (Number.isFinite(input.deltaX) ? input.deltaX : 0) * horizontalSensitivity,
    verticalLookDelta: (Number.isFinite(input.deltaY) ? input.deltaY : 0) * verticalSensitivity,
  });
}

/** One signed FPS convention for keyboard and standard-gamepad translation. */
export function pilotedDroneControlAxes(input: Readonly<{
  keyboardForward: boolean;
  keyboardBackward: boolean;
  keyboardRight: boolean;
  keyboardLeft: boolean;
  keyboardAscend: boolean;
  keyboardDescend: boolean;
  gamepadMoveX: number;
  gamepadMoveY: number;
  gamepadVertical: number;
}>): PilotedDroneControlAxes {
  const gamepadX = clamp(input.gamepadMoveX, -1, 1);
  const gamepadY = clamp(input.gamepadMoveY, -1, 1);
  const gamepadVertical = clamp(input.gamepadVertical, -1, 1);
  return Object.freeze({
    thrust: clamp(Number(input.keyboardForward) - Number(input.keyboardBackward) - gamepadY, -1, 1),
    strafe: clamp(Number(input.keyboardRight) - Number(input.keyboardLeft) + gamepadX, -1, 1),
    vertical: clamp(Number(input.keyboardAscend) - Number(input.keyboardDescend) + gamepadVertical, -1, 1),
  });
}

/**
 * Projects the signed input axes into the shared -Z-forward world convention
 * and caps diagonal/combined travel at the standalone manual speed.
 */
export function pilotedDroneWorldVelocity(input: Readonly<{
  yaw: number;
  pitch: number;
  axes: PilotedDroneControlAxes;
  maximumSpeedMps: number;
}>): PilotedDroneWorldVelocity {
  const yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
  const pitch = clamp(input.pitch, -PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians, PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians);
  const maximumSpeedMps = clamp(input.maximumSpeedMps, 0, 100);
  const forward = supportForwardFromYawPitch(yaw, pitch);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  let x = forward[0] * clamp(input.axes.thrust, -1, 1) + rightX * clamp(input.axes.strafe, -1, 1);
  let y = forward[1] * clamp(input.axes.thrust, -1, 1) + clamp(input.axes.vertical, -1, 1);
  let z = forward[2] * clamp(input.axes.thrust, -1, 1) + rightZ * clamp(input.axes.strafe, -1, 1);
  const magnitude = Math.hypot(x, y, z);
  if (magnitude > 1) {
    x /= magnitude;
    y /= magnitude;
    z /= magnitude;
  }
  const canonical = (component: number): number => {
    const scaled = component * maximumSpeedMps;
    return Math.abs(scaled) < Number.EPSILON ? 0 : scaled;
  };
  return Object.freeze([canonical(x), canonical(y), canonical(z)] as const);
}
