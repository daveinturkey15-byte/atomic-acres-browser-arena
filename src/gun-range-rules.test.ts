import { describe, expect, it } from 'vitest';
import {
  advanceRangeScore,
  formatRangeAccuracy,
  GUN_RANGE_ROUND_MS,
  hasUnlimitedRangeAmmo,
  isGunRange,
  rangeAccuracyPercent,
  rangeGrenadesAllowed,
  reloadSupply,
  reserveAfterCompletedReload,
  reserveHudValue,
} from './gun-range-rules';
import {
  compareGunRangeScores,
  createGunRangeScoreEntry,
  loadGunRangeScores,
  mergeGunRangeScores,
  personalBestGunRange,
  saveGunRangeScores,
  type GunRangeScoreEntry,
} from './gun-range-leaderboard';

describe('Gun Range practice rules', () => {
  it('provides virtual reload supply without placing Infinity in player state', () => {
    expect(hasUnlimitedRangeAmmo('gun-range')).toBe(true);
    expect(isGunRange('gun-range')).toBe(true);
    expect(reloadSupply('gun-range', 0, 30)).toBe(30);
    expect(reserveAfterCompletedReload('gun-range', 0, 0)).toBe(0);
    expect(reserveHudValue('gun-range', 0)).toBe('∞');
  });

  it('leaves finite ammunition semantics unchanged outside the range', () => {
    expect(hasUnlimitedRangeAmmo('atomic-acres')).toBe(false);
    expect(reloadSupply('atomic-acres', 7, 30)).toBe(7);
    expect(reserveAfterCompletedReload('atomic-acres', 7, 2)).toBe(2);
    expect(reserveHudValue('atomic-acres', 7)).toBe('7');
  });

  it('keeps awarding each destroyed target with no gameplay score cap', () => {
    let score = 0;
    for (let destruction = 0; destruction < 10_000; destruction += 1) score = advanceRangeScore(score, 300);
    expect(score).toBe(3_000_000);
    expect(advanceRangeScore(score, 100)).toBe(3_000_100);
  });

  it('uses a two-minute timed round and bans grenades on the range only', () => {
    expect(GUN_RANGE_ROUND_MS).toBe(120_000);
    expect(rangeGrenadesAllowed('gun-range')).toBe(false);
    expect(rangeGrenadesAllowed('atomic-acres')).toBe(true);
    expect(rangeGrenadesAllowed('rustworks-1v1')).toBe(true);
  });

  it('computes whole-percent accuracy from hits and shots', () => {
    expect(rangeAccuracyPercent(0, 0)).toBe(0);
    expect(rangeAccuracyPercent(5, 10)).toBe(50);
    expect(rangeAccuracyPercent(1, 3)).toBe(33);
    expect(rangeAccuracyPercent(12, 10)).toBe(100);
    expect(formatRangeAccuracy(7, 20)).toBe('35%');
  });
});

describe('Gun Range leaderboard', () => {
  const sample = (overrides: Partial<GunRangeScoreEntry> = {}): GunRangeScoreEntry => ({
    id: 'range:dave',
    name: 'Dave',
    score: 1200,
    hits: 12,
    shots: 20,
    accuracy: 60,
    recordedAt: Date.UTC(2026, 6, 21, 12),
    ...overrides,
  });

  it('ranks by score, then accuracy, then hits', () => {
    const a = sample({ id: 'range:a', name: 'Alpha', score: 900, hits: 9, shots: 10, accuracy: 90 });
    const b = sample({ id: 'range:b', name: 'Bravo', score: 1200, hits: 8, shots: 20, accuracy: 40 });
    const c = sample({ id: 'range:c', name: 'Charlie', score: 1200, hits: 10, shots: 12, accuracy: 83 });
    expect(mergeGunRangeScores([], [a, b, c]).map((entry) => entry.name)).toEqual([
      'Charlie',
      'Bravo',
      'Alpha',
    ]);
    expect(compareGunRangeScores(c, b)).toBeLessThan(0);
  });

  it('keeps one best row per callsign and persists through storage', () => {
    const storage = new Map<string, string>();
    const api = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    };
    const first = createGunRangeScoreEntry('Ellis', 800, 8, 20, Date.UTC(2026, 6, 21, 12))!;
    const better = createGunRangeScoreEntry('Ellis', 1500, 15, 20, Date.UTC(2026, 6, 21, 13))!;
    const worse = createGunRangeScoreEntry('Ellis', 900, 9, 10, Date.UTC(2026, 6, 21, 14))!;
    saveGunRangeScores(api, mergeGunRangeScores([], [first, better, worse]));
    const loaded = loadGunRangeScores(api);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ name: 'Ellis', score: 1500, hits: 15, shots: 20, accuracy: 75 });
    expect(personalBestGunRange(loaded, 'ellis')?.score).toBe(1500);
  });

  it('rejects hostile or inconsistent accuracy payloads', () => {
    expect(isSafeEntry({
      id: 'range:x',
      name: 'X',
      score: 100,
      hits: 5,
      shots: 10,
      accuracy: 99,
      recordedAt: Date.UTC(2026, 6, 21),
    })).toBe(false);
  });
});

function isSafeEntry(value: unknown): boolean {
  return mergeGunRangeScores([], [value]).length === 1;
}
