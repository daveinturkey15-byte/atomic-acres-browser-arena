/**
 * Dependency-free leaderboard bounds shared by the browser client and the
 * Cloudflare Worker. Import this module from both sides so kill/streak/death
 * ceilings and hostile-input rejection stay exactly aligned.
 */

/** Shared defensive ceiling for kills and best-streak claims (Pass 40). */
export const MAX_MATCH_KILLS = 9_999;

/** Shared defensive ceiling for deaths on a single recorded row. */
export const MAX_MATCH_DEATHS = 200;

/** Earliest accepted recordedAt (UTC ms). Rejects pre-product epoch garbage. */
export const MIN_RECORDED_AT_MS = Date.UTC(2026, 0, 1);

/** Allow a small future skew for clock drift without accepting far-future claims. */
export const MAX_RECORDED_AT_SKEW_MS = 5 * 60_000;

export function isSafeNonNegativeInteger(value: unknown, maxInclusive: number): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 0
    && Number(value) <= maxInclusive;
}

export function isSafePositiveInteger(value: unknown, maxInclusive: number): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= 1
    && Number(value) <= maxInclusive;
}

export function isValidKillCount(value: unknown): value is number {
  return isSafeNonNegativeInteger(value, MAX_MATCH_KILLS);
}

export function isValidDeathCount(value: unknown): value is number {
  return isSafeNonNegativeInteger(value, MAX_MATCH_DEATHS);
}

export function isValidStreakCount(value: unknown): value is number {
  return isSafeNonNegativeInteger(value, MAX_MATCH_KILLS);
}

/** Immediate global streak submissions require a positive streak. */
export function isValidSubmittedStreak(value: unknown): value is number {
  return isSafePositiveInteger(value, MAX_MATCH_KILLS);
}

/**
 * Kills must be a safe integer in range and cannot be below the claimed streak
 * (a streak is a contiguous subset of kills).
 */
export function isValidKillsForStreak(kills: unknown, streak: unknown): kills is number {
  return isValidKillCount(kills)
    && isValidStreakCount(streak)
    && Number(kills) >= Number(streak);
}

export function isValidRecordedAt(value: unknown, now = Date.now()): value is number {
  return Number.isSafeInteger(value)
    && Number(value) >= MIN_RECORDED_AT_MS
    && Number(value) <= now + MAX_RECORDED_AT_SKEW_MS;
}

export type ImmediateStreakScalars = Readonly<{
  streak: number;
  kills: number;
  deaths: number;
  recordedAt: number;
}>;

/**
 * Strict scalar validation for immediate streak rows. Rejects Infinity, NaN,
 * fractions, negatives, over-ceiling values, kills < streak, and bad timestamps.
 * Callers must still validate name/install identity separately.
 */
export function parseImmediateStreakScalars(
  streak: unknown,
  kills: unknown,
  deaths: unknown,
  recordedAt: unknown,
  now = Date.now(),
): ImmediateStreakScalars | null {
  if (!isValidSubmittedStreak(streak)) return null;
  if (!isValidKillsForStreak(kills, streak)) return null;
  if (!isValidDeathCount(deaths)) return null;
  if (!isValidRecordedAt(recordedAt, now)) return null;
  return {
    streak: Number(streak),
    kills: Number(kills),
    deaths: Number(deaths),
    recordedAt: Number(recordedAt),
  };
}
