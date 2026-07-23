import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  formatChangelogTimestamp,
  formatChangelogTimestampDetail,
  lastUpdatedButtonLabel,
  latestChangelogEntry,
  PENDING_PRODUCTION_RELEASE,
  resolveProductionReleasedAt,
} from './changelog';

describe('changelog', () => {
  it('keeps the current public release first with an explicit UK timezone', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    const latest = latestChangelogEntry();
    expect(latest.id).toBe('pass59');
    expect(latest.id).toBe(CHANGELOG[0]?.id);
    expect(formatChangelogTimestamp('2026-07-22T15:43:16+01:00')).toBe('22 JUL 2026 · 15:43 BST');
    expect(formatChangelogTimestampDetail('2026-07-22T15:43:16+01:00')).toBe(
      '22 JUL 2026 · 15:43 BST · UTC+1 · 15:43:16',
    );
    expect(lastUpdatedButtonLabel(latest)).toBe('LAST RELEASE · 23 JUL 2026 · 11:17 BST');
  });

  it('uses the successful production promotion rather than implementation time', () => {
    const pass59 = CHANGELOG.find((entry) => entry.id === 'pass59');
    const pass58 = CHANGELOG.find((entry) => entry.id === 'pass58');
    const pass57 = CHANGELOG.find((entry) => entry.id === 'pass57');
    const pass56 = CHANGELOG.find((entry) => entry.id === 'pass56');
    const pass55 = CHANGELOG.find((entry) => entry.id === 'pass55');
    const pass51 = CHANGELOG.find((entry) => entry.id === 'pass51');
    const pass49 = CHANGELOG.find((entry) => entry.id === 'pass49');
    expect(pass59?.releasedAt).toBe('2026-07-23T11:17:26+01:00');
    expect(pass58?.releasedAt).toBe('2026-07-22T21:25:35+01:00');
    expect(pass57?.releasedAt).toBe('2026-07-22T15:43:16+01:00');
    expect(pass56?.releasedAt).toBe('2026-07-22T15:06:07+01:00');
    expect(pass55?.releasedAt).toBe('2026-07-22T13:14:45+01:00');
    expect(pass51?.releasedAt).toBe('2026-07-21T19:17:57+01:00');
    expect(pass49?.releasedAt).toBe('2026-07-21T17:55:17+01:00');
  });

  it('resolves a pending top-entry timestamp once during the protected production build', () => {
    const releasedAt = '2026-07-23T13:30:00Z';
    expect(resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE, releasedAt)).toBe(releasedAt);
    expect(resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE, '')).toBe(PENDING_PRODUCTION_RELEASE);
    expect(resolveProductionReleasedAt('2026-07-22T21:25:35+01:00', releasedAt))
      .toBe('2026-07-22T21:25:35+01:00');
    expect(() => resolveProductionReleasedAt(PENDING_PRODUCTION_RELEASE, 'not-a-time'))
      .toThrow('Invalid VITE_RELEASED_AT');
  });

  it('requires player-facing areas and highlights on every entry', () => {
    for (const [index, entry] of CHANGELOG.entries()) {
      expect(entry.pass.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.areas.length).toBeGreaterThan(0);
      expect(entry.highlights.length).toBeGreaterThan(0);
      if (index === 0 && entry.releasedAt === PENDING_PRODUCTION_RELEASE) continue;
      expect(entry.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    }
  });

  it('keeps entries in reverse public-release order', () => {
    const timestamps = CHANGELOG
      .filter((entry) => entry.releasedAt !== PENDING_PRODUCTION_RELEASE)
      .map((entry) => Date.parse(entry.releasedAt));
    expect(timestamps.every(Number.isFinite)).toBe(true);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('falls back cleanly for malformed timestamps and non-UK offsets', () => {
    expect(formatChangelogTimestamp('not-a-timestamp')).toBe('not-a-timestamp');
    expect(formatChangelogTimestamp('2026-12-01T08:02:03Z')).toBe('1 DEC 2026 · 08:02 GMT');
    expect(formatChangelogTimestampDetail('2026-12-01T08:02:03-05:30')).toBe(
      '1 DEC 2026 · 08:02 UTC-05:30 · UTC-5:30 · 08:02:03',
    );
  });
});
