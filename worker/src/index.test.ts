import { describe, expect, it } from 'vitest';
import worker, { allowedOrigin, validateStreakSubmission } from './index';

const valid = {
  name: 'Dave',
  streak: 15,
  kills: 18,
  deaths: 2,
  installId: 'install_123456789',
  buildId: 'pass30-local',
  idempotencyKey: 'install_123456789:15',
};

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
    expect(validateStreakSubmission({ ...valid, streak: 101 }).error).toBe('invalid streak');
    expect(validateStreakSubmission({ ...valid, kills: 14 }).error).toBe('invalid kills');
    expect(validateStreakSubmission({ ...valid, deaths: -1 }).error).toBe('invalid deaths');
  });

  it('rejects weak install, build and idempotency identifiers', () => {
    expect(validateStreakSubmission({ ...valid, installId: 'short' }).error).toBe('invalid installId');
    expect(validateStreakSubmission({ ...valid, buildId: 'x' }).error).toBe('invalid buildId');
    expect(validateStreakSubmission({ ...valid, idempotencyKey: 'tiny' }).error).toBe('invalid idempotencyKey');
  });
});
