import { describe, expect, it } from 'vitest';
import worker, { admitRateLimit, allowedOrigin, leaderboardNameKey, validateStreakSubmission } from './index';
import { LEADERBOARD_SEASON } from '../../shared/leaderboard-season';

const valid = {
  name: 'Dave',
  streak: 15,
  kills: 18,
  deaths: 2,
  installId: 'install_123456789',
  buildId: 'pass30-local',
  season: LEADERBOARD_SEASON,
  idempotencyKey: 'install_123456789:15',
};

class RateLimitDb {
  readonly counts = new Map<string, number>();
  writes = 0;

  prepare(query: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...next: unknown[]) => { values = next; return statement; },
      first: async () => {
        const compound = `${String(values[0])}:${String(values[1])}`;
        const count = this.counts.get(compound);
        return count === undefined ? null : { count };
      },
      run: async () => {
        if (!query.includes('INSERT INTO rate_limits')) return { meta: { changes: 0 } };
        const compound = `${String(values[0])}:${String(values[1])}`;
        const limit = Number(values[3]);
        const current = this.counts.get(compound) ?? 0;
        if (current >= limit) return { meta: { changes: 0 } };
        this.counts.set(compound, current + 1);
        this.writes += 1;
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  }
}

class LeaderboardDb {
  readonly claims = new Set<string>();
  readonly queries: string[] = [];
  failLeaderboard = false;

  prepare(query: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...next: unknown[]) => { values = next; return statement; },
      first: async () => null,
      run: async () => {
        const normalized = query.replace(/\s+/g, ' ').trim();
        this.queries.push(normalized);
        if (normalized.includes('INSERT INTO rate_limits')) return { meta: { changes: 1 } };
        if (normalized.includes('INSERT INTO streak_claims')) {
          const key = String(values[0]);
          if (this.claims.has(key)) return { meta: { changes: 0 } };
          this.claims.add(key);
          return { meta: { changes: 1 } };
        }
        if (normalized.includes('DELETE FROM streak_claims WHERE idempotency_key')) {
          const removed = this.claims.delete(String(values[0]));
          return { meta: { changes: removed ? 1 : 0 } };
        }
        if (normalized.includes('INSERT INTO leaderboard')) {
          if (this.failLeaderboard) throw new Error('leaderboard write failed');
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  }
}

function streakRequest(): Request {
  return new Request('https://leaderboard.example/v1/streak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4173' },
    body: JSON.stringify(valid),
  });
}

function executionContext(): ExecutionContext {
  return { waitUntil: () => undefined } as unknown as ExecutionContext;
}

describe('global leaderboard worker policy', () => {
  it('allows only configured production origins plus bounded localhost QA origins', () => {
    expect(allowedOrigin('https://daveinturkey15-byte.github.io', 'https://daveinturkey15-byte.github.io')).toBe(true);
    expect(allowedOrigin('http://127.0.0.1:4173', 'https://daveinturkey15-byte.github.io')).toBe(true);
    expect(allowedOrigin('https://evil.example', 'https://daveinturkey15-byte.github.io')).toBe(false);
    expect(allowedOrigin('not a URL', 'https://daveinturkey15-byte.github.io')).toBe(false);
  });

  it('answers an allowed CORS preflight with a bodyless 204 response', async () => {
    const response = await worker.fetch(
      new Request('https://leaderboard.example/v1/streak', {
        method: 'OPTIONS',
        headers: { Origin: 'http://127.0.0.1:4173' },
      }),
      {
        ALLOWED_ORIGINS: 'https://daveinturkey15-byte.github.io',
        DB: {} as D1Database,
        RATE_LIMIT_SALT: 'test-salt',
      },
      {} as ExecutionContext,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:4173');
  });

  it('accepts a strict bounded immediate streak claim', () => {
    expect(validateStreakSubmission(valid)).toEqual({ submission: valid, error: null });
  });

  it('rejects spoofing fields, malformed names and impossible score relationships', () => {
    expect(validateStreakSubmission({ ...valid, admin: true }).error).toBe('unexpected fields');
    expect(validateStreakSubmission({ ...valid, name: '<script>' }).error).toBe('invalid name');
    expect(validateStreakSubmission({ ...valid, streak: 1_000, kills: 1_050, idempotencyKey: 'install_123456789:1000' })).toEqual({
      submission: { ...valid, streak: 1_000, kills: 1_050, idempotencyKey: 'install_123456789:1000' },
      error: null,
    });
    expect(validateStreakSubmission({ ...valid, streak: 10_000, kills: 10_000 }).error).toBe('invalid streak');
    expect(validateStreakSubmission({ ...valid, kills: 14 }).error).toBe('invalid kills');
    expect(validateStreakSubmission({ ...valid, deaths: -1 }).error).toBe('invalid deaths');
    expect(validateStreakSubmission({ ...valid, kills: Number.POSITIVE_INFINITY }).error).toBe('invalid kills');
    expect(validateStreakSubmission({ ...valid, kills: 18.5 }).error).toBe('invalid kills');
    expect(validateStreakSubmission({ ...valid, streak: Number.NaN }).error).toBe('invalid streak');
    expect(validateStreakSubmission({ ...valid, deaths: 0.25 }).error).toBe('invalid deaths');
  });

  it('rejects weak install, build and idempotency identifiers', () => {
    expect(validateStreakSubmission({ ...valid, installId: 'short' }).error).toBe('invalid installId');
    expect(validateStreakSubmission({ ...valid, buildId: 'x' }).error).toBe('invalid buildId');
    expect(validateStreakSubmission({ ...valid, idempotencyKey: 'tiny' }).error).toBe('invalid idempotencyKey');
  });

  it('keeps accepted callsigns collision-free in D1 identity keys', () => {
    expect(leaderboardNameKey('A B')).toBe('a_20b');
    expect(leaderboardNameKey('A_B')).toBe('a_5fb');
    expect(leaderboardNameKey('A-B')).toBe('a_2db');
  });

  it('stops D1 counter writes once a fixed-window rate bucket is saturated', async () => {
    const db = new RateLimitDb();
    const d1 = db as unknown as D1Database;
    expect(await admitRateLimit(d1, 'install:test', 2, 1_000)).toBe(true);
    expect(await admitRateLimit(d1, 'install:test', 2, 1_001)).toBe(true);
    expect(await admitRateLimit(d1, 'install:test', 2, 1_002)).toBe(false);
    expect(await admitRateLimit(d1, 'install:test', 2, 1_003)).toBe(false);
    expect(db.writes).toBe(2);
    expect(await admitRateLimit(d1, 'install:test', 2, 10 * 60_000 + 1_000)).toBe(true);
    expect(db.writes).toBe(3);
  });

  it('claims an idempotency key before writing the leaderboard', async () => {
    const db = new LeaderboardDb();
    const response = await worker.fetch(streakRequest(), {
      ALLOWED_ORIGINS: '*', DB: db as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt',
    }, executionContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, updated: true, idempotent: false });
    const claimIndex = db.queries.findIndex((query) => query.includes('INSERT INTO streak_claims'));
    const leaderboardIndex = db.queries.findIndex((query) => query.includes('INSERT INTO leaderboard'));
    expect(claimIndex).toBeGreaterThanOrEqual(0);
    expect(claimIndex).toBeLessThan(leaderboardIndex);
  });

  it('returns duplicate success without replaying the leaderboard write', async () => {
    const db = new LeaderboardDb();
    db.claims.add(valid.idempotencyKey);
    const response = await worker.fetch(streakRequest(), {
      ALLOWED_ORIGINS: '*', DB: db as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt',
    }, executionContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, updated: false, idempotent: true });
    expect(db.queries.some((query) => query.includes('INSERT INTO leaderboard'))).toBe(false);
  });

  it('rolls back the claim when the leaderboard write fails', async () => {
    const db = new LeaderboardDb();
    db.failLeaderboard = true;
    const response = await worker.fetch(streakRequest(), {
      ALLOWED_ORIGINS: '*', DB: db as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt',
    }, executionContext());
    expect(response.status).toBe(503);
    expect(db.claims.has(valid.idempotencyKey)).toBe(false);
  });
});
