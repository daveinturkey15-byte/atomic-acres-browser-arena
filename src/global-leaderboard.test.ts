import { describe, expect, it, vi } from 'vitest';
import {
  LEADERBOARD_INSTALL_STORAGE_KEY,
  fetchGlobalLeaderboard,
  forgetLeaderboardInstallId,
  leaderboardNetworkEnabled,
  leaderboardInstallId,
  submitGlobalStreak,
} from './global-leaderboard';
import { LEADERBOARD_SEASON } from '../shared/leaderboard-season';
import type { ScoreStorage } from './high-scores';

class MemoryStorage implements ScoreStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('global leaderboard client', () => {
  it('supports an explicit deterministic offline-services route for browser and hardware QA', () => {
    expect(leaderboardNetworkEnabled('?externalServices=off')).toBe(false);
    expect(leaderboardNetworkEnabled('?multiplayerQa=1')).toBe(false);
    expect(leaderboardNetworkEnabled('?release=latest')).toBe(true);
  });

  it('creates and reuses a stable non-secret installation identifier', () => {
    const storage = new MemoryStorage();
    const created = leaderboardInstallId(storage, true, () => 'install_123456789');
    expect(created).toBe('install_123456789');
    expect(storage.getItem(LEADERBOARD_INSTALL_STORAGE_KEY)).toBe(created);
    expect(leaderboardInstallId(storage, true, () => 'different_123456')).toBe(created);
  });

  it('does not create or retain an identifier without explicit sharing consent', () => {
    const storage = new MemoryStorage();
    const randomId = vi.fn(() => 'install_123456789');
    expect(leaderboardInstallId(storage, false, randomId)).toBeNull();
    expect(randomId).not.toHaveBeenCalled();
    expect(storage.getItem(LEADERBOARD_INSTALL_STORAGE_KEY)).toBeNull();
    expect(leaderboardInstallId(storage, true, randomId)).toBe('install_123456789');
    expect(forgetLeaderboardInstallId(storage)).toBe(true);
    expect(storage.getItem(LEADERBOARD_INSTALL_STORAGE_KEY)).toBeNull();
  });

  it('returns an empty global list when no backend endpoint is configured', async () => {
    const fetcher = vi.fn();
    await expect(fetchGlobalLeaderboard('', fetcher)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('loads bounded global entries through the public read endpoint', async () => {
    const entries = [{ id: 'global:abc', name: 'Dave', kills: 9, deaths: 2, bestStreak: 8, won: false, recordedAt: Date.UTC(2026, 6, 18) }];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ season: LEADERBOARD_SEASON, entries }), { status: 200 }));
    await expect(fetchGlobalLeaderboard('https://leaderboard.example', fetcher)).resolves.toEqual(entries);
    expect(fetcher).toHaveBeenCalledWith(`https://leaderboard.example/v1/leaderboard?limit=20&season=${LEADERBOARD_SEASON}`, expect.objectContaining({ method: 'GET' }));
  });

  it('does not revive rows returned by a pre-reset Worker', async () => {
    const legacy = [{ id: 'global:old', name: 'Old', kills: 99, deaths: 0, bestStreak: 99, won: false, recordedAt: Date.UTC(2026, 6, 18) }];
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ entries: legacy }), { status: 200 }));
    await expect(fetchGlobalLeaderboard('https://leaderboard.example', fetcher)).resolves.toEqual([]);
  });

  it('submits a new streak immediately with keepalive and no browser secret', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    const submission = {
      name: 'Dave', streak: 8, kills: 9, deaths: 2,
      installId: 'install_123456789', buildId: 'pass30', idempotencyKey: 'install_123456789:8', season: LEADERBOARD_SEASON,
    } as const;
    await expect(submitGlobalStreak(submission, true, 'https://leaderboard.example', fetcher)).resolves.toBe(true);
    const [, init] = fetcher.mock.calls[0];
    expect(init).toEqual(expect.objectContaining({ method: 'POST', keepalive: true }));
    expect(JSON.parse(String(init?.body))).toEqual(submission);
    expect(String(init?.body)).not.toMatch(/secret|token|password/i);
  });

  it('does not POST a streak when sharing consent is off', async () => {
    const fetcher = vi.fn();
    const submission = {
      name: 'Dave', streak: 8, kills: 9, deaths: 2,
      installId: 'install_123456789', buildId: 'pass65', idempotencyKey: 'install_123456789:8', season: LEADERBOARD_SEASON,
    } as const;
    await expect(submitGlobalStreak(submission, false, 'https://leaderboard.example', fetcher)).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
