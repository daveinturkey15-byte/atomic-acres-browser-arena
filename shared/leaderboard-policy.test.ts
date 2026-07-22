import { describe, expect, it } from 'vitest';
import {
  MAX_MATCH_DEATHS,
  MAX_MATCH_KILLS,
  isValidDeathCount,
  isValidKillCount,
  isValidKillsForStreak,
  isValidRecordedAt,
  isValidStreakCount,
  isValidSubmittedStreak,
  parseImmediateStreakScalars,
} from './leaderboard-policy';

const now = Date.UTC(2026, 6, 21, 12);

describe('shared leaderboard policy', () => {
  it('documents the Pass 40 kill/streak ceiling above 100', () => {
    expect(MAX_MATCH_KILLS).toBe(9_999);
    expect(MAX_MATCH_DEATHS).toBe(200);
    expect(MAX_MATCH_KILLS).toBeGreaterThan(100);
  });

  it('accepts legitimate long-session values including 1000', () => {
    expect(isValidKillCount(1_000)).toBe(true);
    expect(isValidStreakCount(1_000)).toBe(true);
    expect(isValidSubmittedStreak(1_000)).toBe(true);
    expect(isValidKillsForStreak(1_050, 1_000)).toBe(true);
    expect(isValidDeathCount(12)).toBe(true);
    expect(isValidRecordedAt(now, now)).toBe(true);
    expect(parseImmediateStreakScalars(1_000, 1_050, 12, now, now)).toEqual({
      streak: 1_000,
      kills: 1_050,
      deaths: 12,
      recordedAt: now,
    });
  });

  it('rejects hostile non-finite, fractional, inverted and over-ceiling scalars', () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, 8.5, -1, 10_000]) {
      expect(isValidKillCount(bad), `kills:${String(bad)}`).toBe(false);
      expect(isValidStreakCount(bad), `streak:${String(bad)}`).toBe(false);
    }
    expect(isValidSubmittedStreak(0)).toBe(false);
    expect(isValidKillsForStreak(7, 8)).toBe(false);
    expect(isValidDeathCount(201)).toBe(false);
    expect(isValidDeathCount(-1)).toBe(false);
    expect(isValidDeathCount(1.5)).toBe(false);
    expect(isValidRecordedAt(now + 6 * 60_000, now)).toBe(false);
    expect(isValidRecordedAt(Date.UTC(2025, 0, 1), now)).toBe(false);
    expect(parseImmediateStreakScalars(8, Number.POSITIVE_INFINITY, 0, now, now)).toBeNull();
    expect(parseImmediateStreakScalars(8, 7.2, 0, now, now)).toBeNull();
    expect(parseImmediateStreakScalars(8, 7, 0, now, now)).toBeNull();
    expect(parseImmediateStreakScalars(8, 8, Number.NaN, now, now)).toBeNull();
    expect(parseImmediateStreakScalars(10_000, 10_000, 0, now, now)).toBeNull();
  });
});
