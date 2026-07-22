import { normalizeRequiredPlayerName, leaderboardNameKey, type ScoreStorage } from './high-scores';
import { rangeAccuracyPercent } from './gun-range-rules';

export const GUN_RANGE_SCORE_STORAGE_KEY = 'atomic-acres:gun-range-scores:v1';
export const GUN_RANGE_SCORE_SCHEMA_VERSION = 1;
export const MAX_GUN_RANGE_SCORE_ENTRIES = 20;
export const MAX_GUN_RANGE_SCORE = 9_999_999;
export const MAX_GUN_RANGE_HITS = 100_000;
export const MAX_GUN_RANGE_SHOTS = 100_000;

export type GunRangeScoreEntry = {
  id: string;
  name: string;
  score: number;
  hits: number;
  shots: number;
  /** Whole percent 0–100, derived at write time for stable ranking. */
  accuracy: number;
  recordedAt: number;
};

export type GunRangeScoreDocument = {
  version: typeof GUN_RANGE_SCORE_SCHEMA_VERSION;
  entries: GunRangeScoreEntry[];
};

function isSafeCount(value: unknown, max: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max;
}

export function isGunRangeScoreEntry(value: unknown, now = Date.now()): value is GunRangeScoreEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const normalizedName = typeof entry.name === 'string' ? normalizeRequiredPlayerName(entry.name) : null;
  if (!normalizedName || normalizedName !== entry.name) return false;
  if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9:_-]{1,120}$/.test(entry.id)) return false;
  if (!isSafeCount(entry.score, MAX_GUN_RANGE_SCORE)) return false;
  if (!isSafeCount(entry.hits, MAX_GUN_RANGE_HITS)) return false;
  if (!isSafeCount(entry.shots, MAX_GUN_RANGE_SHOTS)) return false;
  if (!isSafeCount(entry.accuracy, 100)) return false;
  if (!Number.isSafeInteger(entry.recordedAt)) return false;
  const recordedAt = Number(entry.recordedAt);
  if (recordedAt < Date.UTC(2026, 0, 1) || recordedAt > now + 5 * 60_000) return false;
  const expectedAccuracy = rangeAccuracyPercent(Number(entry.hits), Number(entry.shots));
  return Number(entry.accuracy) === expectedAccuracy;
}

export function compareGunRangeScores(a: GunRangeScoreEntry, b: GunRangeScoreEntry): number {
  return b.score - a.score
    || b.accuracy - a.accuracy
    || b.hits - a.hits
    || a.shots - b.shots
    || a.recordedAt - b.recordedAt
    || a.id.localeCompare(b.id);
}

export function mergeGunRangeScores(
  current: readonly GunRangeScoreEntry[],
  incoming: readonly unknown[],
  now = Date.now(),
): GunRangeScoreEntry[] {
  const byPlayer = new Map<string, GunRangeScoreEntry>();
  for (const candidate of [...current, ...incoming]) {
    if (!isGunRangeScoreEntry(candidate, now)) continue;
    const playerKey = leaderboardNameKey(candidate.name);
    if (!playerKey) continue;
    const existing = byPlayer.get(playerKey);
    if (!existing || compareGunRangeScores(candidate, existing) < 0) {
      byPlayer.set(playerKey, { ...candidate });
    }
  }
  return [...byPlayer.values()].sort(compareGunRangeScores).slice(0, MAX_GUN_RANGE_SCORE_ENTRIES);
}

export function loadGunRangeScores(storage: ScoreStorage, now = Date.now()): GunRangeScoreEntry[] {
  try {
    const raw = storage.getItem(GUN_RANGE_SCORE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; entries?: unknown[] };
    if (parsed.version !== GUN_RANGE_SCORE_SCHEMA_VERSION || !Array.isArray(parsed.entries)) return [];
    const merged = mergeGunRangeScores([], parsed.entries, now);
    saveGunRangeScores(storage, merged);
    return merged;
  } catch {
    return [];
  }
}

export function saveGunRangeScores(storage: ScoreStorage, entries: readonly GunRangeScoreEntry[]): void {
  const document: GunRangeScoreDocument = {
    version: GUN_RANGE_SCORE_SCHEMA_VERSION,
    entries: mergeGunRangeScores([], entries),
  };
  storage.setItem(GUN_RANGE_SCORE_STORAGE_KEY, JSON.stringify(document));
}

export function personalBestGunRange(
  entries: readonly GunRangeScoreEntry[],
  playerName: string,
): GunRangeScoreEntry | null {
  const key = leaderboardNameKey(playerName);
  if (!key) return null;
  return entries
    .filter((entry) => leaderboardNameKey(entry.name) === key)
    .sort(compareGunRangeScores)[0] ?? null;
}

export function createGunRangeScoreEntry(
  playerName: string,
  score: number,
  hits: number,
  shots: number,
  recordedAt = Date.now(),
  now = Date.now(),
): GunRangeScoreEntry | null {
  const name = normalizeRequiredPlayerName(playerName);
  if (!name) return null;
  if (!isSafeCount(score, MAX_GUN_RANGE_SCORE)) return null;
  if (!isSafeCount(hits, MAX_GUN_RANGE_HITS)) return null;
  if (!isSafeCount(shots, MAX_GUN_RANGE_SHOTS)) return null;
  if (!Number.isSafeInteger(recordedAt) || recordedAt < Date.UTC(2026, 0, 1) || recordedAt > now + 5 * 60_000) {
    return null;
  }
  const nameKey = leaderboardNameKey(name);
  if (!nameKey) return null;
  return {
    id: `range:${nameKey}`,
    name,
    score,
    hits,
    shots,
    accuracy: rangeAccuracyPercent(hits, shots),
    recordedAt,
  };
}
