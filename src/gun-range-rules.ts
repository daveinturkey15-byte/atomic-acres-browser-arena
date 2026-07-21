import type { ArenaId } from './map-selection';

export const UNLIMITED_AMMO_SYMBOL = '∞';

/** Timed Gun Range round length (2 minutes). */
export const GUN_RANGE_ROUND_MS = 120_000;

export function isGunRange(arenaId: ArenaId): boolean {
  return arenaId === 'gun-range';
}

export function hasUnlimitedRangeAmmo(arenaId: ArenaId): boolean {
  return isGunRange(arenaId);
}

/** Frags are range-safety banned on the Gun Range lane. */
export function rangeGrenadesAllowed(arenaId: ArenaId): boolean {
  return !isGunRange(arenaId);
}

export function reloadSupply(arenaId: ArenaId, currentReserve: number, magazineSize: number): number {
  return hasUnlimitedRangeAmmo(arenaId) ? Math.max(currentReserve, magazineSize) : currentReserve;
}

export function reserveAfterCompletedReload(arenaId: ArenaId, currentReserve: number, completedReserve: number): number {
  return hasUnlimitedRangeAmmo(arenaId) ? currentReserve : completedReserve;
}

export function reserveHudValue(arenaId: ArenaId, reserve: number): string {
  return hasUnlimitedRangeAmmo(arenaId) ? UNLIMITED_AMMO_SYMBOL : String(Math.max(0, Math.floor(reserve)));
}

export function advanceRangeScore(currentScore: number, targetValue: number): number {
  const current = Number.isSafeInteger(currentScore) && currentScore >= 0 ? currentScore : 0;
  const award = Number.isSafeInteger(targetValue) && targetValue > 0 ? targetValue : 0;
  return Math.min(Number.MAX_SAFE_INTEGER, current + award);
}

/** Hits ÷ shots as a 0–100 whole percent. Zero shots → 0%. */
export function rangeAccuracyPercent(hits: number, shots: number): number {
  const safeHits = Number.isFinite(hits) ? Math.max(0, Math.floor(hits)) : 0;
  const safeShots = Number.isFinite(shots) ? Math.max(0, Math.floor(shots)) : 0;
  if (safeShots <= 0) return 0;
  return Math.min(100, Math.round((safeHits / safeShots) * 100));
}

export function formatRangeAccuracy(hits: number, shots: number): string {
  return `${rangeAccuracyPercent(hits, shots)}%`;
}
