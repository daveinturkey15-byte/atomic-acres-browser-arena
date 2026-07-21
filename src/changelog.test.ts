import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  formatChangelogTimestamp,
  lastUpdatedButtonLabel,
  latestChangelogEntry,
} from './changelog';

describe('changelog', () => {
  it('keeps newest entry first with a timestamped label', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    const latest = latestChangelogEntry();
    expect(latest.id).toBe(CHANGELOG[0]?.id);
    expect(formatChangelogTimestamp('2026-07-21T17:41:26+01:00')).toBe('21 JUL 2026 · 17:41');
    expect(lastUpdatedButtonLabel(latest)).toBe(`LAST UPDATED · ${formatChangelogTimestamp(latest.updatedAt)}`);
    expect(lastUpdatedButtonLabel(latest)).toContain('JUL');
  });

  it('requires player-facing highlights on every entry', () => {
    for (const entry of CHANGELOG) {
      expect(entry.pass.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.highlights.length).toBeGreaterThan(0);
      expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/);
    }
  });

  it('keeps entries in reverse chronological order', () => {
    const timestamps = CHANGELOG.map((entry) => Date.parse(entry.updatedAt));
    expect(timestamps.every(Number.isFinite)).toBe(true);
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });
});
