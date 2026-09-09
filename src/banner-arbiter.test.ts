/**
 * HF-339 — the #banner overwrite race, pinned.
 *
 * The concrete failure: a rare-weapon announcement lands inside the 900 ms
 * ENGAGE window; unarbitrated, it overwrote ENGAGE and was then hidden by
 * ENGAGE's own timeout — players never read it. The arbiter makes both
 * directions safe and gives fatal banners an absolute hold.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clearBanners,
  createBannerState,
  expireBanner,
  requestBanner,
  type BannerRequest,
} from './banner-arbiter';

const request = (id: number, priority: BannerRequest['priority'], overrides: Partial<BannerRequest> = {}): BannerRequest => ({
  id,
  priority,
  headline: `${priority}-${id}`.toUpperCase(),
  subline: 'sub',
  durationMs: 900,
  ...overrides,
});

describe('HF-339 banner arbiter', () => {
  it('queues an announcement behind ENGAGE and promotes it when ENGAGE expires', () => {
    const engage = requestBanner(createBannerState(), request(1, 'match-flow', { headline: 'ENGAGE' }));
    expect(engage.display).toMatchObject({ kind: 'show', headline: 'ENGAGE' });

    const spawn = requestBanner(engage.state, request(2, 'announcement', { headline: 'RAILGUN ON THE FIELD' }));
    // ENGAGE keeps the screen; the announcement waits instead of overwriting.
    expect(spawn.display.kind).toBe('none');

    const promoted = expireBanner(spawn.state, 1);
    expect(promoted.display).toMatchObject({ kind: 'show', headline: 'RAILGUN ON THE FIELD' });
  });

  it("never lets ENGAGE's expiry hide a banner it does not own", () => {
    const engage = requestBanner(createBannerState(), request(1, 'match-flow'));
    // A second match-flow banner (equal rank) took over.
    const takeover = requestBanner(engage.state, request(2, 'match-flow', { headline: 'OVERTIME' }));
    expect(takeover.display).toMatchObject({ kind: 'show', headline: 'OVERTIME' });
    // The FIRST banner's timer fires late: it owns nothing, so nothing changes.
    const stale = expireBanner(takeover.state, 1);
    expect(stale.display.kind).toBe('none');
    expect(stale.state.active?.headline).toBe('OVERTIME');
  });

  it('a fatal banner is never overwritten and never expires from below', () => {
    const fatal = requestBanner(createBannerState(), request(1, 'fatal', { headline: 'SYSTEM PAUSED', durationMs: null }));
    const engage = requestBanner(fatal.state, request(2, 'match-flow'));
    expect(engage.display.kind).toBe('none');
    const spawn = requestBanner(engage.state, request(3, 'announcement'));
    expect(spawn.display.kind).toBe('none');
    expect(expireBanner(spawn.state, 2).display.kind).toBe('none');
    expect(expireBanner(spawn.state, 3).display.kind).toBe('none');
    expect(spawn.state.active?.headline).toBe('SYSTEM PAUSED');
  });

  it('keeps only the newest highest-rank deferred request', () => {
    const fatal = requestBanner(createBannerState(), request(1, 'fatal', { durationMs: null }));
    const older = requestBanner(fatal.state, request(2, 'announcement', { headline: 'OLD NOTE' }));
    const newer = requestBanner(older.state, request(3, 'match-flow', { headline: 'NEWER FLOW' }));
    expect(newer.state.queued?.headline).toBe('NEWER FLOW');
    // A later, lower-rank request does not displace the queued higher rank.
    const lower = requestBanner(newer.state, request(4, 'announcement'));
    expect(lower.state.queued?.headline).toBe('NEWER FLOW');
  });

  it('expiry with an empty queue hides the banner', () => {
    const engage = requestBanner(createBannerState(), request(1, 'match-flow'));
    expect(expireBanner(engage.state, 1).display.kind).toBe('hide');
  });

  it('clear drops active and queued and hides', () => {
    const engage = requestBanner(createBannerState(), request(1, 'fatal', { durationMs: null }));
    const withQueue = requestBanner(engage.state, request(2, 'announcement'));
    const cleared = clearBanners();
    expect(cleared.display.kind).toBe('hide');
    expect(cleared.state).toEqual(createBannerState());
    expect(withQueue.state.queued).not.toBeNull();
  });
});

describe('HF-339 single-writer wiring', () => {
  it('legacy-main touches #banner only inside the arbiter applier', () => {
    const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const directWrites = main.match(/element<HTMLElement>\('#banner'\)/g) ?? [];
    expect(directWrites).toHaveLength(1);
    expect(main).toMatch(/function applyCentreBannerTransition[\s\S]{0,400}element<HTMLElement>\('#banner'\)/);
  });
});
