import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  formatChangelogDate,
  lastUpdatedButtonLabel,
  latestChangelogEntry,
} from './changelog';

describe('changelog', () => {
  it('keeps newest entry first with a dated label', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    const latest = latestChangelogEntry();
    expect(latest.id).toBe(CHANGELOG[0]?.id);
    expect(formatChangelogDate('2026-07-21')).toBe('21 JUL 2026');
    expect(lastUpdatedButtonLabel(latest)).toContain('LAST UPDATED');
    expect(lastUpdatedButtonLabel(latest)).toContain('JUL');
  });

  it('requires player-facing highlights on every entry', () => {
    for (const entry of CHANGELOG) {
      expect(entry.pass.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.highlights.length).toBeGreaterThan(0);
      expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
