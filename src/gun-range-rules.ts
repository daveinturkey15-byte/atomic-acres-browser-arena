import type { ArenaId } from './map-selection';

export const UNLIMITED_AMMO_SYMBOL = '∞';

export function hasUnlimitedRangeAmmo(arenaId: ArenaId): boolean {
  return arenaId === 'gun-range';
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
