import { describe, expect, it } from 'vitest';
import {
  HIGH_SCORE_STORAGE_KEY,
  immediateStreakEntry,
  isHighScoreEntry,
  loadHighScores,
  mergeHighScores,
  normalizeRequiredPlayerName,
  personalBest,
  saveHighScores,
  type HighScoreEntry,
} from './high-scores';

const now = Date.UTC(2026, 6, 17, 12);
const entry = (overrides: Partial<HighScoreEntry> = {}): HighScoreEntry => ({
  id: 'match:player:1',
  name: 'Dave',
  kills: 12,
  deaths: 3,
  bestStreak: 8,
  won: true,
  recordedAt: now,
  ...overrides,
});

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('persistent high scores', () => {
  it('requires an intentional visible player name instead of inventing one', () => {
    expect(normalizeRequiredPlayerName('  Dave !! ')).toBe('Dave');
    expect(normalizeRequiredPlayerName(' _-- ')).toBeNull();
    expect(normalizeRequiredPlayerName('')).toBeNull();
  });

  it('orders records by streak, kills, deaths and victory without duplicates', () => {
    const scores = mergeHighScores([], [
      entry({ id: 'a', kills: 8, bestStreak: 4, deaths: 2 }),
      entry({ id: 'b', kills: 8, bestStreak: 6, deaths: 5 }),
      entry({ id: 'c', kills: 9, bestStreak: 3, deaths: 7 }),
      entry({ id: 'b', kills: 8, bestStreak: 6, deaths: 5 }),
    ], now);
    expect(scores.map((score) => score.id)).toEqual(['b', 'a', 'c']);
  });

  it('rejects impossible or future peer claims', () => {
    expect(isHighScoreEntry(entry({ kills: 101 }), now)).toBe(false);
    expect(isHighScoreEntry(entry({ bestStreak: 101 }), now)).toBe(false);
    expect(isHighScoreEntry(entry({ recordedAt: now + 6 * 60_000 }), now)).toBe(false);
    expect(isHighScoreEntry(entry({ name: '<script>' }), now)).toBe(false);
  });

  it('survives reloads through a versioned stable-origin storage key', () => {
    const storage = new MemoryStorage();
    saveHighScores(storage, [entry()]);
    expect(storage.getItem(HIGH_SCORE_STORAGE_KEY)).toContain('"version":1');
    expect(loadHighScores(storage, now)).toEqual([entry()]);
  });

  it('finds a case-insensitive personal best', () => {
    const scores = [entry({ id: 'one', name: 'Dave', kills: 8 }), entry({ id: 'two', name: 'dave', kills: 14 })];
    expect(personalBest(scores, 'DAVE')?.id).toBe('two');
  });

  it('creates one stable per-install/name entry as soon as a streak is reached', () => {
    expect(immediateStreakEntry('install_12345678', 'Dave', 8, 9, 2, now)).toEqual({
      id: 'global:dave',
      name: 'Dave',
      kills: 9,
      deaths: 2,
      bestStreak: 8,
      won: false,
      recordedAt: now,
    });
    expect(immediateStreakEntry('bad', 'Dave', 8, 8, 0, now)).toBeNull();
  });
});
