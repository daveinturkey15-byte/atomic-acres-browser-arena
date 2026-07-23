import { describe, expect, it } from 'vitest';
import { createHumanMatchReport } from './match-report';

describe('human-readable match report', () => {
  it('exports clear, bounded match statistics separately from technical events', () => {
    const exported = createHumanMatchReport({
      build: 'PASS 60', arena: 'Atomic Acres', mode: 'solo', result: 'VICTORY', durationMs: 123_456,
      kills: 12, deaths: 3, shotsFired: 80, hitShots: 42, damageDealt: 980, damageTaken: 210,
      headshots: 7, bestKillstreak: 6, completedAt: '2026-07-23T13:00:00.000Z',
    });
    expect(exported.filename).toContain('match-summary');
    expect(JSON.parse(exported.json)).toMatchObject({
      reportType: 'human-readable-match-summary',
      match: { arena: 'Atomic Acres', durationSeconds: 123.5 },
      stats: { kills: 12, deaths: 3, killDeathRatio: 4, accuracyPercent: 52.5, shotsHit: 42 },
    });
  });
});
