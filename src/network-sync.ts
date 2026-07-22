export const STATE_BROADCAST_INTERVAL_MS = 50;
export const REMOTE_INTERPOLATION_RATE = 24;

export function stateBroadcastIntervalMs(pingMs: number | null): number {
  if (pingMs === null || !Number.isFinite(pingMs) || pingMs <= 140) return STATE_BROADCAST_INTERVAL_MS;
  if (pingMs <= 240) return 66;
  return 100;
}

export function remoteInterpolationAlpha(dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return 1 - Math.exp(-REMOTE_INTERPOLATION_RATE * Math.min(dt, 0.05));
}
