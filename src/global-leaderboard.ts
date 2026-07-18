import type { HighScoreEntry, ScoreStorage } from './high-scores';

export const LEADERBOARD_INSTALL_STORAGE_KEY = 'atomic-acres:leaderboard-install:v1';
export const GLOBAL_LEADERBOARD_ENDPOINT = (import.meta.env.VITE_GLOBAL_LEADERBOARD_URL ?? '').trim().replace(/\/$/, '');
export const GLOBAL_LEADERBOARD_TIMEOUT_MS = 4_000;

export type GlobalStreakSubmission = Readonly<{
  name: string;
  streak: number;
  kills: number;
  deaths: number;
  installId: string;
  buildId: string;
  idempotencyKey: string;
}>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function leaderboardInstallId(
  storage: ScoreStorage,
  randomId: () => string = () => globalThis.crypto.randomUUID(),
): string {
  try {
    const current = storage.getItem(LEADERBOARD_INSTALL_STORAGE_KEY);
    if (current && /^[a-zA-Z0-9_-]{8,80}$/.test(current)) return current;
    const created = randomId().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (created.length < 8) throw new Error('Generated leaderboard installation ID is too short');
    storage.setItem(LEADERBOARD_INSTALL_STORAGE_KEY, created);
    return created;
  } catch {
    return `volatile_${randomId().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)}`;
  }
}

function requestSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => globalThis.clearTimeout(timer) };
}

export async function fetchGlobalLeaderboard(
  endpoint = GLOBAL_LEADERBOARD_ENDPOINT,
  fetcher: FetchLike = fetch,
  timeoutMs = GLOBAL_LEADERBOARD_TIMEOUT_MS,
): Promise<HighScoreEntry[]> {
  if (!endpoint) return [];
  const { signal, cancel } = requestSignal(timeoutMs);
  try {
    const response = await fetcher(`${endpoint}/v1/leaderboard?limit=20`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) throw new Error(`Global leaderboard HTTP ${response.status}`);
    const body = await response.json() as { entries?: unknown };
    return Array.isArray(body.entries) ? body.entries as HighScoreEntry[] : [];
  } finally {
    cancel();
  }
}

export async function submitGlobalStreak(
  submission: GlobalStreakSubmission,
  endpoint = GLOBAL_LEADERBOARD_ENDPOINT,
  fetcher: FetchLike = fetch,
  timeoutMs = GLOBAL_LEADERBOARD_TIMEOUT_MS,
): Promise<boolean> {
  if (!endpoint) return false;
  const { signal, cancel } = requestSignal(timeoutMs);
  try {
    const response = await fetcher(`${endpoint}/v1/streak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(submission),
      signal,
      keepalive: true,
    });
    if (!response.ok) throw new Error(`Global streak submission HTTP ${response.status}`);
    const body = await response.json() as { accepted?: unknown };
    return body.accepted === true;
  } finally {
    cancel();
  }
}
