export const STATE_BROADCAST_INTERVAL_MS = 33;
export const REMOTE_INTERPOLATION_RATE = 24;

export function remoteInterpolationAlpha(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return 1 - Math.exp(-REMOTE_INTERPOLATION_RATE * Math.min(dt, 0.05));
}
