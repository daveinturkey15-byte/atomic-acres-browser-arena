export function nextShotDeadline(now: number, shotIntervalMs: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(shotIntervalMs) || shotIntervalMs <= 0) return Number.POSITIVE_INFINITY;
  return now + shotIntervalMs;
}
