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
}>): PilotedDroneLook {
  const sensitivity = clamp(input.radiansPerPixel, 0.0001, 0.05);
  const yaw = input.yaw + (Number.isFinite(input.deltaX) ? input.deltaX : 0) * sensitivity;
  const pitch = input.pitch - (Number.isFinite(input.deltaY) ? input.deltaY : 0) * sensitivity;
  return Object.freeze({
    yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
    pitch: clamp(pitch, -PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians, PILOTED_DRONE_VIEW_CONTRACT.maximumPitchRadians),
  });
}
