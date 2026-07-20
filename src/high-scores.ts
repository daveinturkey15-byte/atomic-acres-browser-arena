export const HIGH_SCORE_STORAGE_KEY = 'atomic-acres:high-scores:v1';
export const HIGH_SCORE_SCHEMA_VERSION = 3;
export const MAX_HIGH_SCORE_ENTRIES = 20;
// Five-minute matches are uncapped, but valid local/peer records remain defensively
// bounded against corrupted storage or hostile payloads. A 100-kill ceiling is well
// above plausible five-minute play while keeping score documents finite.
export const MAX_MATCH_KILLS = 100;

export type HighScoreEntry = {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  bestStreak: number;
  won: boolean;
  recordedAt: number;
};

export type HighScoreDocument = {
  version: typeof HIGH_SCORE_SCHEMA_VERSION;
  entries: HighScoreEntry[];
};

export type ScoreStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function normalizeRequiredPlayerName(value: string): string | null {
  const clean = value
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return /[a-zA-Z0-9]/.test(clean) ? clean : null;
}

export function leaderboardNameKey(value: string): string | null {
  const name = normalizeRequiredPlayerName(value);
  if (!name) return null;
  return [...name.toLocaleLowerCase()].map((character) => {
    if (/[a-z0-9]/.test(character)) return character;
    if (character === ' ') return '_20';
    if (character === '-') return '_2d';
    return '_5f';
  }).join('');
}

export function peerOwnedHighScores(senderName: string, entries: readonly HighScoreEntry[]): HighScoreEntry[] {
  const senderKey = leaderboardNameKey(senderName);
  if (!senderKey) return [];
  return entries.filter((entry) => leaderboardNameKey(entry.name) === senderKey);
}

export function isHighScoreEntry(value: unknown, now = Date.now()): value is HighScoreEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  const normalizedName = typeof entry.name === 'string' ? normalizeRequiredPlayerName(entry.name) : null;
  return typeof entry.id === 'string'
    && /^[a-zA-Z0-9:_-]{1,120}$/.test(entry.id)
    && normalizedName === entry.name
    && Number.isSafeInteger(entry.kills) && Number(entry.kills) >= 0 && Number(entry.kills) <= MAX_MATCH_KILLS
    && Number.isSafeInteger(entry.deaths) && Number(entry.deaths) >= 0 && Number(entry.deaths) <= 200
    && Number.isSafeInteger(entry.bestStreak) && Number(entry.bestStreak) >= 0 && Number(entry.bestStreak) <= MAX_MATCH_KILLS
    && typeof entry.won === 'boolean'
    && Number.isSafeInteger(entry.recordedAt)
    && Number(entry.recordedAt) >= Date.UTC(2026, 0, 1)
    && Number(entry.recordedAt) <= now + 5 * 60_000;
}

export function compareHighScores(a: HighScoreEntry, b: HighScoreEntry): number {
  return b.bestStreak - a.bestStreak
    || b.kills - a.kills
    || a.deaths - b.deaths
    || Number(b.won) - Number(a.won)
    || a.recordedAt - b.recordedAt
    || a.id.localeCompare(b.id);
}

export function mergeHighScores(
  current: readonly HighScoreEntry[],
  incoming: readonly unknown[],
  now = Date.now(),
): HighScoreEntry[] {
  const byPlayer = new Map<string, HighScoreEntry>();
  for (const candidate of [...current, ...incoming]) {
    if (!isHighScoreEntry(candidate, now)) continue;
    const playerKey = leaderboardNameKey(candidate.name);
    if (!playerKey) continue;
    const existing = byPlayer.get(playerKey);
    if (!existing || compareHighScores(candidate, existing) < 0) byPlayer.set(playerKey, { ...candidate });
  }
  return [...byPlayer.values()].sort(compareHighScores).slice(0, MAX_HIGH_SCORE_ENTRIES);
}

export function loadHighScores(storage: ScoreStorage, now = Date.now()): HighScoreEntry[] {
  try {
    const raw = storage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; entries?: unknown[] };
    if ((parsed.version !== 1 && parsed.version !== 2 && parsed.version !== HIGH_SCORE_SCHEMA_VERSION) || !Array.isArray(parsed.entries)) return [];
    const migrated = parsed.entries.map((entry) => {
      if (!isHighScoreEntry(entry, now) || !entry.id.startsWith('global:')) return entry;
      const key = leaderboardNameKey(entry.name);
      return key ? { ...entry, id: `global:${key}` } : entry;
    });
    const merged = mergeHighScores([], migrated, now);
    // Loading is also the migration point for legacy per-match/global rows.
    // Rewrite the compact one-row-per-player document so the duplicate does
    // not return on the next refresh or cross-tab sync.
    saveHighScores(storage, merged);
    return merged;
  } catch {
    return [];
  }
}

export function saveHighScores(storage: ScoreStorage, entries: readonly HighScoreEntry[]): void {
  const document: HighScoreDocument = {
    version: HIGH_SCORE_SCHEMA_VERSION,
    entries: mergeHighScores([], entries),
  };
  storage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(document));
}

export function personalBest(entries: readonly HighScoreEntry[], playerName: string): HighScoreEntry | null {
  const normalized = normalizeRequiredPlayerName(playerName)?.toLocaleLowerCase();
  if (!normalized) return null;
  return entries
    .filter((entry) => entry.name.toLocaleLowerCase() === normalized)
    .sort(compareHighScores)[0] ?? null;
}

export function immediateStreakEntry(
  installId: string,
  playerName: string,
  streak: number,
  kills: number,
  deaths: number,
  recordedAt = Date.now(),
): HighScoreEntry | null {
  const name = normalizeRequiredPlayerName(playerName);
  const safeInstallId = installId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  if (!name || safeInstallId.length < 8 || !Number.isSafeInteger(streak) || streak <= 0 || streak > MAX_MATCH_KILLS) return null;
  const nameKey = leaderboardNameKey(name);
  if (!nameKey) return null;
  return {
    id: `global:${nameKey}`,
    name,
    kills: Math.min(MAX_MATCH_KILLS, Math.max(streak, Math.floor(kills))),
    deaths: Math.min(200, Math.max(0, Math.floor(deaths))),
    bestStreak: streak,
    won: false,
    recordedAt,
  };
}
