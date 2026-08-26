import { describe, expect, it } from 'vitest';
import {
  compareGunRangeScores,
  createGunRangeScoreEntry,
  isGunRangeScoreEntry,
  loadGunRangeScores,
  mergeGunRangeScores,
  personalBestGunRange,
  saveGunRangeScores,
  type GunRangeScoreEntry,
} from './gun-range-leaderboard';

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

describe('gun-range-leaderboard module', () => {
  it('builds consistent accuracy at write time', () => {
    const entry = createGunRangeScoreEntry('Ranger', 2_400, 18, 30, Date.UTC(2026, 6, 21, 15));
    expect(entry).toMatchObject({
      name: 'Ranger',
      score: 2400,
      hits: 18,
      shots: 30,
      accuracy: 60,
      id: 'range:ranger',
    });
    expect(isGunRangeScoreEntry(entry)).toBe(true);
  });

  it('prefers higher score then accuracy then hits for the same player', () => {
    const low = createGunRangeScoreEntry('Dave', 500, 10, 10, Date.UTC(2026, 6, 21, 10))!;
    const high = createGunRangeScoreEntry('Dave', 900, 9, 20, Date.UTC(2026, 6, 21, 11))!;
    const merged = mergeGunRangeScores([], [low, high]);
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBe(900);
    expect(compareGunRangeScores(high, low)).toBeLessThan(0);
  });

  it('round-trips storage and personal best lookup', () => {
    const storage = memoryStorage();
    const a = createGunRangeScoreEntry('Alpha', 1000, 10, 20, Date.UTC(2026, 6, 21, 12))!;
    const b = createGunRangeScoreEntry('Bravo', 1800, 20, 25, Date.UTC(2026, 6, 21, 12))!;
    saveGunRangeScores(storage, [a, b]);
    const loaded = loadGunRangeScores(storage);
    expect(loaded.map((entry: GunRangeScoreEntry) => entry.name)).toEqual(['Bravo', 'Alpha']);
    expect(personalBestGunRange(loaded, 'alpha')?.score).toBe(1000);
  });
});
