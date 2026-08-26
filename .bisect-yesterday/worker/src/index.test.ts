import { describe, expect, it } from 'vitest';
import worker, {
  admitRateLimit,
  allowedOrigin,
  deleteExpiredMatchDiagnostics,
  leaderboardNameKey,
  serverErrorTrace,
  validateMatchDiagnosticSubmission,
  validateStreakSubmission,
} from './index';
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

const validDiagnostic = {
  schemaVersion: 1,
  idempotencyKey: 'diagnostic:p-0123456789abcdef:host',
  matchId: 'p-0123456789abcdef',
  completedAtEpochMinute: 1_800_000,
  buildId: 'pass64-test-build',
  pass: 'PASS 64',
  backend: 'webgpu',
  arena: 'atomic-acres',
  mode: 'tdm',
  role: 'host',
  durationMs: 90_000,
  events: [{
    sequence: 0, atMs: 100, category: 'damage', admission: 'accepted',
    actor: 'p-1111111111111111', actorKind: 'player', target: 'p-2222222222222222', targetKind: 'player',
    source: 'firearm', healthBefore: 100, healthAfter: 70, damageRequested: 30, damageApplied: 30, wallbang: false,
  }],
  droppedEvents: 0,
  net: {
    rttBucketMs: 30, jitterBucketMs: 5, clockOffsetBucketMs: -10, interpolationDelayBucketMs: 70,
    receiverSequenceGaps: 0, receiverReordered: 0, droppedDamageEvents: 0,
  },
  perf: { sampleCount: 5_400, frameP50BucketMs: 16, frameP95BucketMs: 20, frameP99BucketMs: 33, maximumFrameBucketMs: 100 },
  final: {
    participantCount: 2,
    participants: [
      { participant: 'p-1111111111111111', kind: 'player', team: 0, kills: 10, deaths: 7, damageDealt: 900, damageTaken: 700, finalHealth: 80 },
      { participant: 'p-2222222222222222', kind: 'player', team: 1, kills: 7, deaths: 10, damageDealt: 700, damageTaken: 900, finalHealth: 0 },
    ],
    local: { kills: 10, deaths: 7, shotsFired: 100, hitShots: 40, damageDealt: 900, damageTaken: 700, headshots: 8 },
    fatalRuntimeErrorCategories: [],
  },
};

class DiagnosticDb {
  readonly counts = new Map<string, number>();
  readonly receipts = new Map<string, string>();
  readonly queries: string[] = [];
  inserts = 0;

  prepare(query: string) {
    let values: unknown[] = [];
    const normalized = query.replace(/\s+/g, ' ').trim();
    const statement = {
      bind: (...next: unknown[]) => { values = next; return statement; },
      first: async () => {
        this.queries.push(normalized);
        if (normalized.includes('SELECT receipt_id FROM match_diagnostics')) {
          const receiptId = this.receipts.get(String(values[0]));
          return receiptId ? { receipt_id: receiptId } : null;
        }
        return null;
      },
      run: async () => {
        this.queries.push(normalized);
        if (normalized.includes('INSERT INTO rate_limits')) {
          const compound = `${String(values[0])}:${String(values[1])}`;
          const current = this.counts.get(compound) ?? 0;
          if (current >= Number(values[3])) return { meta: { changes: 0 } };
          this.counts.set(compound, current + 1);
          return { meta: { changes: 1 } };
        }
        if (normalized.includes('INSERT INTO match_diagnostics')) {
          const idempotencyKey = String(values[1]);
          if (this.receipts.has(idempotencyKey)) return { meta: { changes: 0 } };
          this.receipts.set(idempotencyKey, String(values[0]));
          this.inserts += 1;
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  }
}

function diagnosticRequest(value: unknown = validDiagnostic, contentType = 'text/plain;charset=UTF-8'): Request {
  return new Request('https://leaderboard.example/v1/match-diagnostics', {
    method: 'POST',
    headers: { 'Content-Type': contentType, Origin: 'http://127.0.0.1:4173', 'CF-Connecting-IP': '203.0.113.9' },
    body: JSON.stringify(value),
  });
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
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ error: 'service unavailable' });
    expect(body.incidentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).not.toHaveProperty('stack');
    expect(db.claims.has(valid.idempotencyKey)).toBe(false);
  });

  it('retains a bounded provider-side stack without request or identity fields', () => {
    const error = new Error('database exploded');
    error.stack = `Error: database exploded\n${'at worker-handler (index.ts:1:1)\n'.repeat(300)}`;
    const trace = serverErrorTrace(error, 'incident-test');
    expect(trace).toMatchObject({
      incidentId: 'incident-test',
      name: 'Error',
      message: 'database exploded',
    });
    expect(trace.stack).toContain('worker-handler');
    expect(trace.stack.length).toBe(4_096);
    expect(trace).not.toHaveProperty('request');
    expect(trace).not.toHaveProperty('playerId');
  });

  it('strictly validates the privacy-minimized match envelope', () => {
    expect(validateMatchDiagnosticSubmission(validDiagnostic)).toEqual({ submission: validDiagnostic, error: null });
    expect(validateMatchDiagnosticSubmission({ ...validDiagnostic, callsign: 'Dave' }).error).toBe('invalid envelope shape');
    expect(validateMatchDiagnosticSubmission({
      ...validDiagnostic,
      events: [{ ...validDiagnostic.events[0], actor: 'raw-peer-id' }],
    }).error).toBe('invalid event');
    expect(validateMatchDiagnosticSubmission({
      ...validDiagnostic,
      events: [{ ...validDiagnostic.events[0], sequence: 2 }],
    }).error).toBe('invalid event');
    expect(validateMatchDiagnosticSubmission({
      ...validDiagnostic,
      final: { ...validDiagnostic.final, chat: 'must never be accepted' },
    }).error).toBe('invalid final summary');
  });

  it('stores one server-receipted diagnostic with bounded retention cleanup', async () => {
    const db = new DiagnosticDb();
    const waiting: Promise<unknown>[] = [];
    const context = { waitUntil: (promise: Promise<unknown>) => { waiting.push(promise); } } as ExecutionContext;
    const response = await worker.fetch(diagnosticRequest(), {
      ALLOWED_ORIGINS: '*', DB: db as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt',
    }, context);
    expect(response.status).toBe(201);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ accepted: true, idempotent: false, retentionDays: 30 });
    expect(body.receiptId).toMatch(/^md_[a-f0-9]{32}$/);
    expect(db.inserts).toBe(1);
    expect(db.receipts.get(validDiagnostic.idempotencyKey)).toBe(body.receiptId);
    await Promise.all(waiting);
    expect(db.queries.some((query) => query.includes('DELETE FROM match_diagnostics WHERE expires_at <'))).toBe(true);
  });

  it('returns the original receipt for an idempotent retry without a second write', async () => {
    const db = new DiagnosticDb();
    db.receipts.set(validDiagnostic.idempotencyKey, 'md_existingreceipt0000000000000000');
    const response = await worker.fetch(diagnosticRequest(), {
      ALLOWED_ORIGINS: '*', DB: db as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt',
    }, executionContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, idempotent: true, receiptId: 'md_existingreceipt0000000000000000' });
    expect(db.inserts).toBe(0);
  });

  it('enforces text/plain, body-size and per-IP rate limits', async () => {
    const db = new DiagnosticDb();
    const env = { ALLOWED_ORIGINS: '*', DB: db as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt' };
    expect((await worker.fetch(diagnosticRequest(validDiagnostic, 'application/json'), env, executionContext())).status).toBe(415);
    const oversized = diagnosticRequest(validDiagnostic);
    oversized.headers.set('content-length', '49153');
    expect((await worker.fetch(oversized, env, executionContext())).status).toBe(413);
    for (let index = 0; index < 20; index += 1) {
      const submission = {
        ...validDiagnostic,
        matchId: `p-${index.toString(16).padStart(16, '0')}`,
        idempotencyKey: `diagnostic:p-${index.toString(16).padStart(16, '0')}:host`,
      };
      expect((await worker.fetch(diagnosticRequest(submission), env, executionContext())).status).toBe(201);
    }
    const limited = { ...validDiagnostic, matchId: 'p-ffffffffffffffff', idempotencyKey: 'diagnostic:p-ffffffffffffffff:host' };
    expect((await worker.fetch(diagnosticRequest(limited), env, executionContext())).status).toBe(429);
  });

  it('does not expose stored diagnostics through a public read endpoint', async () => {
    const response = await worker.fetch(new Request('https://leaderboard.example/v1/match-diagnostics', {
      headers: { Origin: 'http://127.0.0.1:4173' },
    }), {
      ALLOWED_ORIGINS: '*', DB: new DiagnosticDb() as unknown as D1Database, RATE_LIMIT_SALT: 'test-salt',
    }, executionContext());
    expect(response.status).toBe(404);
  });

  it('enforces retention independently through the scheduled cleanup path', async () => {
    const db = new DiagnosticDb();
    await deleteExpiredMatchDiagnostics(db as unknown as D1Database, 9_000_000);
    expect(db.queries.some((query) => query.includes('DELETE FROM match_diagnostics WHERE expires_at <'))).toBe(true);
    expect(db.queries.some((query) => query.includes('DELETE FROM rate_limits WHERE updated_at <'))).toBe(true);
  });
});
