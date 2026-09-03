import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  formatChangelogTimestamp,
  formatChangelogTimestampDetail,
  lastUpdatedButtonLabel,
  latestChangelogEntry,
  pass70ReleaseCopy,
  pass72ReleaseCopy,
  pass73ReleaseCopy,
  PENDING_PRODUCTION_RELEASE,
  resolveProductionReleasedAt,
} from './changelog';

describe('changelog', () => {
  it('keeps the pending Pass 89 candidate first and freezes every published timestamp behind it', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    const latest = latestChangelogEntry();
    expect(latest.id).toBe('pass89');
    expect(latest.id).toBe(CHANGELOG[0]?.id);
    expect(latest.title).toContain('Pass 89');
    expect(latest.summary).toContain('Pass 89');
    // HF-406: Pass 73 stopped being the current entry on 2026-09-02. Its Pages
    // publication receipt is e138853f ("PASS 73 from 506d6142", 2026-08-21T20:27:27Z),
    // so it is history with a real timestamp, not a candidate that never shipped.
    expect(CHANGELOG.find((entry) => entry.id === 'pass83')?.releasedAt).toBe('2026-09-01T21:36:44+01:00');
    expect(CHANGELOG.find((entry) => entry.id === 'pass82')?.releasedAt).toBe('2026-09-01T21:09:05+01:00');
    expect(CHANGELOG.find((entry) => entry.id === 'pass81')?.releasedAt).toBe('2026-08-28T17:49:47+01:00');
    expect(CHANGELOG.find((entry) => entry.id === 'pass73')?.releasedAt).toBe('2026-08-21T20:27:27Z');
    expect(CHANGELOG.find((entry) => entry.id === 'pass72')?.releasedAt).toBe('2026-08-21T00:25:40Z');
    expect(CHANGELOG.find((entry) => entry.id === 'pass70')?.releasedAt).toBe('2026-08-16T19:32:01Z');
    expect(CHANGELOG.find((entry) => entry.id === 'pass69')?.releasedAt).toBe('2026-08-10T21:19:47Z');
    expect(formatChangelogTimestamp('2026-07-22T15:43:16+01:00')).toBe('22 JUL 2026 · 15:43 BST');
    expect(formatChangelogTimestampDetail('2026-07-22T15:43:16+01:00')).toBe(
      '22 JUL 2026 · 15:43 BST · UTC+1 · 15:43:16',
    );
    expect(formatChangelogTimestamp('2026-07-23T22:51:43Z')).toBe('23 JUL 2026 · 23:51 BST');
    expect(formatChangelogTimestampDetail('2026-07-23T22:51:43Z')).toBe(
      '23 JUL 2026 · 23:51 BST · UTC+1 · 23:51:43',
    );
    // HF-406: the badge leads with the pass number the build is stamped with. The old
    // label ('HITL CANDIDATE · NOT LIVE') named no pass at all - that is the surface
    // the owner read as "pass 73 HITL".
    expect(lastUpdatedButtonLabel(latest)).toBe('PASS 89 · RELEASE CANDIDATE');
    expect(latest.highlights.join('\n')).toContain('A new BALANCED graphics profile between ');
    const pass88Highlights = CHANGELOG.find((entry) => entry.id === 'pass88')?.highlights.join('\n') ?? '';
    expect(pass88Highlights).toContain('Switching arenas mid-session no longer f');
    const pass87Highlights = CHANGELOG.find((entry) => entry.id === 'pass87')?.highlights.join('\n') ?? '';
    expect(pass87Highlights).toContain('RAID REBUILD · PREVIEW: a code-authored ');
    const pass86Highlights = CHANGELOG.find((entry) => entry.id === 'pass86')?.highlights.join('\n') ?? '';
    expect(pass86Highlights).toContain('NUKE TOWN REBUILD · PREVIEW');
    const pass85Highlights = CHANGELOG.find((entry) => entry.id === 'pass85')?.highlights.join('\n') ?? '';
    expect(pass85Highlights).toContain('Drop shots work the Black Ops 2 way');
    const pass84Highlights = CHANGELOG.find((entry) => entry.id === 'pass84')?.highlights.join('\n') ?? '';
    expect(pass84Highlights).toContain('pulls back half as far when you brush a wall');
    expect(pass84Highlights).toContain('M14 EBR hits 40 percent harder');
    expect(pass84Highlights).toContain('chopper gunner ride stops flushing prewarmed thermal-reveal records');
    expect(pass84Highlights).toContain('read one source, so the build can no longer name an older pass');
    const pass73 = CHANGELOG.find((entry) => entry.id === 'pass73');
    expect(pass73?.highlights.join('\n')).toContain('sleeves are thicker and extend beyond the lower frame');
    expect(pass73?.highlights.join('\n')).toContain('Railgun and M14 EBR ADS');
    expect(pass73?.highlights.join('\n')).toContain('single exact 40-percent reduction to 37.2 / 24');
    expect(pass73?.highlights.join('\n')).toContain('Quality-to-Performance changes apply live-safe');
    expect(pass73?.highlights.join('\n')).toContain('Installed Firefox');
    const pass82 = CHANGELOG.find((entry) => entry.id === 'pass82');
    expect(pass82?.highlights.join('\n')).toContain('Chrome 8.49 percent frozen to 0');
    const pass83 = CHANGELOG.find((entry) => entry.id === 'pass83');
    expect(pass83?.highlights.join('\n')).toContain('5-4-3-2-1 countdown');
    const pass72 = CHANGELOG.find((entry) => entry.id === 'pass72');
    expect(pass72?.highlights.join('\n')).toContain('base / minimum body-damage values are exactly 37.2 / 24');
    expect(pass72?.highlights.join('\n')).toContain('Multiplayer protocol 18 rejects cached protocol-17 peers');
  });

  it('uses the successful production promotion rather than implementation time', () => {
    const pass64 = CHANGELOG.find((entry) => entry.id === 'pass64');
    const pass63 = CHANGELOG.find((entry) => entry.id === 'pass63');
    const pass62 = CHANGELOG.find((entry) => entry.id === 'pass62');
    const pass60 = CHANGELOG.find((entry) => entry.id === 'pass60');
    const pass59 = CHANGELOG.find((entry) => entry.id === 'pass59');
    const pass58 = CHANGELOG.find((entry) => entry.id === 'pass58');
    const pass57 = CHANGELOG.find((entry) => entry.id === 'pass57');
    const pass56 = CHANGELOG.find((entry) => entry.id === 'pass56');
    const pass55 = CHANGELOG.find((entry) => entry.id === 'pass55');
    const pass51 = CHANGELOG.find((entry) => entry.id === 'pass51');
    const pass49 = CHANGELOG.find((entry) => entry.id === 'pass49');
    // Pass 64's frozen timestamp is its actual Pages publication of pagesSha
    // 8326c956 (failed-regression evidence channel), not implementation time.
    expect(pass64?.releasedAt).toBe('2026-07-25T21:15:25Z');
    expect(pass63?.releasedAt).toBe('2026-07-25T02:50:32Z');
    expect(pass62?.releasedAt).toBe('2026-07-24T16:36:32Z');
    expect(pass60?.releasedAt).toBe('2026-07-23T23:15:05Z');
    expect(pass60?.title).toBe('New Netcode');
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

  it('keeps Pass 73 candidate and timestamped production copy mutually truthful while Pass 72 is frozen', () => {
    expect(pass73ReleaseCopy(PENDING_PRODUCTION_RELEASE)).toMatchObject({
      summary: expect.stringContaining('mechanically gated publication candidate'),
      lineage: expect.stringContaining('publication-first authorization'),
    });
    expect(pass73ReleaseCopy(PENDING_PRODUCTION_RELEASE).lineage).toContain('public owner review follows');
    expect(pass73ReleaseCopy(PENDING_PRODUCTION_RELEASE).summary).not.toContain('owner-review candidate');
    const released73 = pass73ReleaseCopy('2026-08-21T08:00:00Z');
    expect(released73.summary).not.toContain('candidate');
    // HF-406: the released lineage renders in the player-facing panel, so it carries no
    // internal review acronym and no stale "still pending" claim about a shipped pass.
    expect(released73.lineage).toContain('Pass 63 remains the stable WebGL fallback');
    expect(released73.lineage).not.toMatch(/HITL/u);
    expect(pass72ReleaseCopy('2026-08-21T00:25:40Z').lineage).toContain('corrections tracked in Pass 73');
    expect(pass70ReleaseCopy(PENDING_PRODUCTION_RELEASE)).toMatchObject({
      summary: expect.stringContaining('local owner-review candidate'),
      lineage: expect.stringContaining('until this exact candidate is approved'),
    });
    const released = pass70ReleaseCopy('2026-08-11T10:00:00Z');
    expect(released.summary).not.toContain('candidate');
    expect(released.lineage).not.toContain('until this exact candidate is approved');
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

  it('falls back cleanly for malformed timestamps and converts other offsets to UK time', () => {
    expect(formatChangelogTimestamp('not-a-timestamp')).toBe('not-a-timestamp');
    expect(formatChangelogTimestamp('2026-12-01T08:02:03Z')).toBe('1 DEC 2026 · 08:02 GMT');
    expect(formatChangelogTimestampDetail('2026-12-01T08:02:03-05:30')).toBe(
      '1 DEC 2026 · 13:32 GMT · UTC · 13:32:03',
    );
  });
});
