import { describe, expect, it } from 'vitest';
import {
  HIGH_SCORE_STORAGE_KEY,
  immediateStreakEntry,
  isHighScoreEntry,
  leaderboardNameKey,
  loadHighScores,
  mergeHighScores,
  normalizeRequiredPlayerName,
  peerOwnedHighScores,
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
      entry({ id: 'a', name: 'ALPHA', kills: 8, bestStreak: 4, deaths: 2 }),
      entry({ id: 'b', name: 'BRAVO', kills: 8, bestStreak: 6, deaths: 5 }),
      entry({ id: 'c', name: 'CHARLIE', kills: 9, bestStreak: 3, deaths: 7 }),
      entry({ id: 'b', name: 'BRAVO', kills: 8, bestStreak: 6, deaths: 5 }),
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
    expect(storage.getItem(HIGH_SCORE_STORAGE_KEY)).toContain('"version":3');
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

  it('uses collision-free keys for every accepted callsign separator', () => {
    expect(leaderboardNameKey('A B')).toBe('a_20b');
    expect(leaderboardNameKey('A_B')).toBe('a_5fb');
    expect(leaderboardNameKey('A-B')).toBe('a_2db');
    expect(new Set(['A B', 'A_B', 'A-B'].map((name) => leaderboardNameKey(name))).size).toBe(3);
  });

  it('migrates version-one global ids to the collision-free key without losing records', () => {
    const storage = new MemoryStorage();
    storage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify({
      version: 1,
      entries: [entry({ id: 'global:a_b', name: 'A B' })],
    }));
    expect(loadHighScores(storage, now)[0]?.id).toBe('global:a_20b');
    expect(storage.getItem(HIGH_SCORE_STORAGE_KEY)).toContain('"version":3');
  });

  it('collapses immediate, completed-match, peer and global ids to one best row per callsign', () => {
    const scores = mergeHighScores([], [
      entry({ id: 'global:dave', name: 'Dave', kills: 12, bestStreak: 8, deaths: 4 }),
      entry({ id: 'score:local:one', name: 'dave', kills: 15, bestStreak: 8, deaths: 3 }),
      entry({ id: 'score:peer:two', name: 'DAVE', kills: 11, bestStreak: 9, deaths: 7 }),
      entry({ id: 'global:ellis', name: 'Ellis', kills: 10, bestStreak: 6 }),
    ], now);
    expect(scores).toHaveLength(2);
    expect(scores.filter((score) => score.name.toLowerCase() === 'dave')).toEqual([
      expect.objectContaining({ id: 'score:peer:two', bestStreak: 9 }),
    ]);
  });

  it('accepts only the sender-owned row from peer leaderboard synchronization', () => {
    const own = entry({ id: 'peer-own', name: 'Dave', kills: 8, bestStreak: 5 });
    const forged = entry({ id: 'peer-forged', name: 'Ellis', kills: 100, bestStreak: 100 });
    expect(peerOwnedHighScores('dave', [own, forged])).toEqual([own]);
    expect(peerOwnedHighScores('DAVE', [own, forged])).toEqual([own]);
  });

  it('rewrites existing duplicate version-two storage to one version-three row', () => {
    const storage = new MemoryStorage();
    storage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify({
      version: 2,
      entries: [
        entry({ id: 'global:dave', kills: 10, bestStreak: 6 }),
        entry({ id: 'score:player:later', kills: 14, bestStreak: 8 }),
      ],
    }));
    expect(loadHighScores(storage, now)).toEqual([entry({ id: 'score:player:later', kills: 14, bestStreak: 8 })]);
    const rewritten = JSON.parse(storage.getItem(HIGH_SCORE_STORAGE_KEY)!) as { version: number; entries: HighScoreEntry[] };
    expect(rewritten.version).toBe(3);
    expect(rewritten.entries).toHaveLength(1);
  });
});
