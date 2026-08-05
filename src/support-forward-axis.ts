export const SUPPORT_FORWARD_AXIS = Object.freeze([0, 0, -1] as const);

export type SupportDirection = readonly [number, number, number];

/** Three.js cameras and authored support assets face local negative Z. */
export function supportForwardFromYawPitch(yaw: number, pitch: number): SupportDirection {
  const cosinePitch = Math.cos(pitch);
  return Object.freeze([
    -Math.sin(yaw) * cosinePitch,
    Math.sin(pitch),
    -Math.cos(yaw) * cosinePitch,
  ] as const);
}

export function supportYawForDirection(deltaX: number, deltaZ: number, fallbackYaw = 0): number {
  if (Math.hypot(deltaX, deltaZ) < 1e-8) return fallbackYaw;
  return Math.atan2(-deltaX, -deltaZ);
}
