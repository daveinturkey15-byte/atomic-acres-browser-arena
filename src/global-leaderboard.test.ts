import { describe, expect, it, vi } from 'vitest';
import {
  LEADERBOARD_INSTALL_STORAGE_KEY,
  fetchGlobalLeaderboard,
  leaderboardInstallId,
  submitGlobalStreak,
} from './global-leaderboard';
import type { ScoreStorage } from './high-scores';

class MemoryStorage implements ScoreStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('global leaderboard client', () => {
  it('creates and reuses a stable non-secret installation identifier', () => {
    const storage = new MemoryStorage();
    const created = leaderboardInstallId(storage, () => 'install_123456789');
    expect(created).toBe('install_123456789');
    expect(storage.getItem(LEADERBOARD_INSTALL_STORAGE_KEY)).toBe(created);
    expect(leaderboardInstallId(storage, () => 'different_123456')).toBe(created);
  });

  it('returns an empty global list when no backend endpoint is configured', async () => {
    const fetcher = vi.fn();
    await expect(fetchGlobalLeaderboard('', fetcher)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('loads bounded global entries through the public read endpoint', async () => {
    const entries = [{ id: 'global:abc', name: 'Dave', kills: 9, deaths: 2, bestStreak: 8, won: false, recordedAt: Date.UTC(2026, 6, 18) }];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ entries }), { status: 200 }));
    await expect(fetchGlobalLeaderboard('https://leaderboard.example', fetcher)).resolves.toEqual(entries);
    expect(fetcher).toHaveBeenCalledWith('https://leaderboard.example/v1/leaderboard?limit=20', expect.objectContaining({ method: 'GET' }));
  });

  it('submits a new streak immediately with keepalive and no browser secret', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ accepted: true }), { status: 200 }));
    const submission = {
      name: 'Dave', streak: 8, kills: 9, deaths: 2,
      installId: 'install_123456789', buildId: 'pass30', idempotencyKey: 'install_123456789:8',
    };
    await expect(submitGlobalStreak(submission, 'https://leaderboard.example', fetcher)).resolves.toBe(true);
    const [, init] = fetcher.mock.calls[0];
    expect(init).toEqual(expect.objectContaining({ method: 'POST', keepalive: true }));
    expect(JSON.parse(String(init?.body))).toEqual(submission);
    expect(String(init?.body)).not.toMatch(/secret|token|password/i);
  });
});
