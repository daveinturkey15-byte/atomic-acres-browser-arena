export const HIGH_SCORE_STORAGE_KEY = 'atomic-acres:high-scores:v1';
export const HIGH_SCORE_SCHEMA_VERSION = 1;
export const MAX_HIGH_SCORE_ENTRIES = 20;
// Team score ends at 25, but one explosive resolution can admit several
// eliminations before the next match-state tick. Preserve that legitimate
// overshoot while still bounding hostile peer payloads.
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
  const byId = new Map<string, HighScoreEntry>();
  for (const candidate of [...current, ...incoming]) {
    if (!isHighScoreEntry(candidate, now)) continue;
    const existing = byId.get(candidate.id);
    if (!existing || compareHighScores(candidate, existing) < 0) byId.set(candidate.id, { ...candidate });
  }
  return [...byId.values()].sort(compareHighScores).slice(0, MAX_HIGH_SCORE_ENTRIES);
}

export function loadHighScores(storage: ScoreStorage, now = Date.now()): HighScoreEntry[] {
  try {
    const raw = storage.getItem(HIGH_SCORE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<HighScoreDocument>;
    if (parsed.version !== HIGH_SCORE_SCHEMA_VERSION || !Array.isArray(parsed.entries)) return [];
    return mergeHighScores([], parsed.entries, now);
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
  const nameKey = name.toLocaleLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 24);
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
