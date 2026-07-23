import { describe, expect, it } from 'vitest';
import { createHumanMatchReport } from './match-report';

describe('human-readable match report', () => {
  it('exports clear, bounded match statistics separately from technical events', () => {
    const exported = createHumanMatchReport({
      build: 'PASS 60', arena: 'Atomic Acres', mode: 'solo', result: 'VICTORY', durationMs: 123_456,
      kills: 12, deaths: 3, shotsFired: 80, hitShots: 42, damageDealt: 980, damageTaken: 210,
      headshots: 7, bestKillstreak: 6, completedAt: '2026-07-23T13:00:00.000Z',
      participants: [
        { name: 'ACRES MOD', kind: 'player', kills: 12, deaths: 3, damageDealt: 980, damageTaken: 210, shots: 80, hits: 42 },
        { name: 'Flying Black Cat', kind: 'solo-bot', kills: 0, deaths: 1, damageDealt: 0, damageTaken: 100, score: 500 },
      ],
      damageTimeline: [{
        elapsedMs: 83_450, timestamp: '2026-07-23T12:59:23.450Z', from: 'ACRES MOD', fromKind: 'player',
        to: 'Flying Black Cat', toKind: 'flying-target', damage: 100, healthBefore: 100, healthAfter: 0,
        source: 'sniper', hitZone: 'head', critical: true, wallbang: true, penetrationMultiplier: 0.72,
      }],
    });
    expect(exported.filename).toContain('match-summary');
    const report = JSON.parse(exported.json);
    expect(report).toMatchObject({
      reportType: 'human-readable-match-summary',
      match: { arena: 'Atomic Acres', durationSeconds: 123.5 },
      stats: { kills: 12, deaths: 3, killDeathRatio: 4, accuracyPercent: 52.5, shotsHit: 42 },
      damageTimeline: [{ at: '01:23.4', from: 'ACRES MOD', to: 'Flying Black Cat', health: '100 -> 0 HP', critical: true, wallbang: true }],
    });
    expect(report.participants[0]).toMatchObject({ name: 'ACRES MOD', accuracyPercent: 52.5 });
  });
});
