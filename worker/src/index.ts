export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  RATE_LIMIT_SALT: string;
}

export type StreakSubmission = Readonly<{
  name: string;
  streak: number;
  kills: number;
  deaths: number;
  installId: string;
  buildId: string;
  idempotencyKey: string;
}>;

const MAX_BODY_BYTES = 2_048;
const MAX_STREAK = 100;
const RATE_WINDOW_MS = 10 * 60_000;
const IP_RATE_LIMIT = 90;
const INSTALL_RATE_LIMIT = 30;
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,15}$/;
const INSTALL_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const BUILD_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9:_-]{10,120}$/;

function json(body: unknown, status: number, origin: string | null, env: Env): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'no-store' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && allowedOrigin(origin, env.ALLOWED_ORIGINS)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Vary', 'Origin');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

export function allowedOrigin(origin: string, configured: string): boolean {
  if (!origin) return false;
  const allowed = configured.split(',').map((value) => value.trim()).filter(Boolean);
  if (allowed.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function normalizedName(value: string): string {
  return value.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

export function validateStreakSubmission(value: unknown): { submission: StreakSubmission | null; error: string | null } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { submission: null, error: 'body must be an object' };
  const item = value as Record<string, unknown>;
  const expectedKeys = ['buildId', 'deaths', 'idempotencyKey', 'installId', 'kills', 'name', 'streak'];
  if (Object.keys(item).sort().join(',') !== expectedKeys.sort().join(',')) return { submission: null, error: 'unexpected fields' };
  if (typeof item.name !== 'string' || normalizedName(item.name) !== item.name || !NAME_PATTERN.test(item.name)) return { submission: null, error: 'invalid name' };
  if (!Number.isSafeInteger(item.streak) || Number(item.streak) < 1 || Number(item.streak) > MAX_STREAK) return { submission: null, error: 'invalid streak' };
  if (!Number.isSafeInteger(item.kills) || Number(item.kills) < Number(item.streak) || Number(item.kills) > MAX_STREAK) return { submission: null, error: 'invalid kills' };
  if (!Number.isSafeInteger(item.deaths) || Number(item.deaths) < 0 || Number(item.deaths) > 200) return { submission: null, error: 'invalid deaths' };
  if (typeof item.installId !== 'string' || !INSTALL_PATTERN.test(item.installId)) return { submission: null, error: 'invalid installId' };
  if (typeof item.buildId !== 'string' || !BUILD_PATTERN.test(item.buildId)) return { submission: null, error: 'invalid buildId' };
  if (typeof item.idempotencyKey !== 'string' || !IDEMPOTENCY_PATTERN.test(item.idempotencyKey)) return { submission: null, error: 'invalid idempotencyKey' };
  return { submission: item as unknown as StreakSubmission, error: null };
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function admitRateLimit(db: D1Database, key: string, limit: number, now: number): Promise<boolean> {
  const bucket = Math.floor(now / RATE_WINDOW_MS);
  const result = await db.prepare(`
    INSERT INTO rate_limits (key, bucket, count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(key, bucket) DO UPDATE SET
      count = count + 1,
      updated_at = excluded.updated_at
    WHERE count < ?
  `).bind(key, bucket, now, limit).run();
  return result.meta.changes === 1;
}

export function leaderboardNameKey(name: string): string {
  return [...normalizedName(name).toLocaleLowerCase()].map((character) => {
    if (/[a-z0-9]/.test(character)) return character;
    if (character === ' ') return '_20';
    if (character === '-') return '_2d';
    return '_5f';
  }).join('');
}

async function listLeaderboard(request: Request, env: Env, origin: string | null): Promise<Response> {
  const limitValue = Number(new URL(request.url).searchParams.get('limit') ?? 20);
  const limit = Number.isSafeInteger(limitValue) ? Math.max(1, Math.min(20, limitValue)) : 20;
  const rows = await env.DB.prepare(`
    SELECT name_key, name, best_streak, kills, deaths, updated_at
    FROM leaderboard
    ORDER BY best_streak DESC, kills DESC, deaths ASC, updated_at ASC, name_key ASC
    LIMIT ?
  `).bind(limit).all<{
    name_key: string;
    name: string;
    best_streak: number;
    kills: number;
    deaths: number;
    updated_at: number;
  }>();
  const entries = (rows.results ?? []).map((row) => ({
    id: `global:${row.name_key}`,
    name: row.name,
    kills: row.kills,
    deaths: row.deaths,
    bestStreak: row.best_streak,
    won: false,
    recordedAt: row.updated_at,
  }));
  const response = json({ entries }, 200, origin, env);
  response.headers.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
  return response;
}

async function submitStreak(request: Request, env: Env, origin: string, context: ExecutionContext): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413, origin, env);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'content type must be application/json' }, 415, origin, env);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413, origin, env);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return json({ error: 'invalid JSON' }, 400, origin, env); }
  const validated = validateStreakSubmission(parsed);
  if (!validated.submission) return json({ error: validated.error }, 400, origin, env);
  const submission = validated.submission;
  const now = Date.now();
  const connectingIp = request.headers.get('CF-Connecting-IP') ?? 'local';
  const [ipHash, installHash] = await Promise.all([
    digest(`${env.RATE_LIMIT_SALT}:ip:${connectingIp}`),
    digest(`${env.RATE_LIMIT_SALT}:install:${submission.installId}`),
  ]);
  const [ipAllowed, installAllowed] = await Promise.all([
    admitRateLimit(env.DB, `ip:${ipHash}`, IP_RATE_LIMIT, now),
    admitRateLimit(env.DB, `install:${installHash}`, INSTALL_RATE_LIMIT, now),
  ]);
  if (!ipAllowed || !installAllowed) return json({ error: 'rate limit exceeded' }, 429, origin, env);
  const existingClaim = await env.DB.prepare('SELECT idempotency_key FROM streak_claims WHERE idempotency_key = ?')
    .bind(submission.idempotencyKey).first<{ idempotency_key: string }>();
  if (existingClaim) return json({ accepted: true, updated: false, idempotent: true }, 200, origin, env);
  const nameKey = leaderboardNameKey(submission.name);
  const result = await env.DB.prepare(`
    INSERT INTO leaderboard (name_key, name, best_streak, kills, deaths, updated_at, build_id, install_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name_key) DO UPDATE SET
      name = excluded.name,
      best_streak = excluded.best_streak,
      kills = excluded.kills,
      deaths = excluded.deaths,
      updated_at = excluded.updated_at,
      build_id = excluded.build_id,
      install_hash = excluded.install_hash
    WHERE excluded.best_streak > leaderboard.best_streak
       OR (excluded.best_streak = leaderboard.best_streak AND excluded.kills > leaderboard.kills)
       OR (excluded.best_streak = leaderboard.best_streak AND excluded.kills = leaderboard.kills AND excluded.deaths < leaderboard.deaths)
  `).bind(nameKey, submission.name, submission.streak, submission.kills, submission.deaths, now, submission.buildId, installHash).run();
  await env.DB.prepare('INSERT INTO streak_claims (idempotency_key, received_at) VALUES (?, ?)')
    .bind(submission.idempotencyKey, now).run();
  context.waitUntil(Promise.all([
    env.DB.prepare('DELETE FROM streak_claims WHERE received_at < ?').bind(now - 7 * 24 * 60 * 60_000).run(),
    env.DB.prepare('DELETE FROM rate_limits WHERE updated_at < ?').bind(now - 2 * 60 * 60_000).run(),
  ]).then(() => undefined));
  return json({ accepted: true, updated: (result.meta.changes ?? 0) > 0, idempotent: false }, 200, origin, env);
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('origin');
    if (request.method === 'OPTIONS') {
      if (!origin || !allowedOrigin(origin, env.ALLOWED_ORIGINS)) return json({ error: 'origin denied' }, 403, null, env);
      return json({ ok: true }, 204, origin, env);
    }
    if (!origin || !allowedOrigin(origin, env.ALLOWED_ORIGINS)) return json({ error: 'origin denied' }, 403, null, env);
    const path = new URL(request.url).pathname;
    try {
      if (request.method === 'GET' && path === '/v1/leaderboard') return await listLeaderboard(request, env, origin);
      if (request.method === 'POST' && path === '/v1/streak') return await submitStreak(request, env, origin, context);
      return json({ error: 'not found' }, 404, origin, env);
    } catch (error) {
      console.error('Leaderboard request failed', error instanceof Error ? error.message : String(error));
      return json({ error: 'service unavailable' }, 503, origin, env);
    }
  },
} satisfies ExportedHandler<Env>;
