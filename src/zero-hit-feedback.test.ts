import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ZERO_HIT_MAX_ROWS,
  ZERO_HIT_MIN_INTERVAL_MS,
  ZERO_HIT_VISIBLE_MS,
  planZeroHitRow,
  presentZeroDamageHit,
  shouldPresentZeroHit,
} from './zero-hit-feedback';

describe('HF-386 zero-damage world-hit feedback', () => {
  it('coalesces same-instant shotgun pellets and autocannon cadence behind one throttle', () => {
    expect(shouldPresentZeroHit(Number.NEGATIVE_INFINITY, 1_000, 0)).toBe(true);
    // Inside the window: refused.
    expect(shouldPresentZeroHit(1_000, 1_000 + ZERO_HIT_MIN_INTERVAL_MS - 1, 0)).toBe(false);
    // At the window boundary: admitted.
    expect(shouldPresentZeroHit(1_000, 1_000 + ZERO_HIT_MIN_INTERVAL_MS, 0)).toBe(true);
    // Budget: never more rows than the cap even past the throttle.
    expect(shouldPresentZeroHit(Number.NEGATIVE_INFINITY, 5_000, ZERO_HIT_MAX_ROWS)).toBe(false);
    expect(shouldPresentZeroHit(Number.NEGATIVE_INFINITY, 5_000, ZERO_HIT_MAX_ROWS - 1)).toBe(true);
  });

  it('spreads concurrent rows across bounded lanes', () => {
    const lanes = [0, 1, 2, 3, 7].map((existing) => planZeroHitRow(existing).lane);
    for (const lane of lanes) {
      expect(lane).toBeGreaterThanOrEqual(-1);
      expect(lane).toBeLessThanOrEqual(ZERO_HIT_MAX_ROWS - 2);
    }
  });

  it('is unmistakably distinct from the real hitmarker by construction', () => {
    // No crossed glyph anywhere in this module's vocabulary: the hitmarker is
    // an ×; this cue is a hollow ring plus an explicit zero label.
    const source = readFileSync(new URL('./zero-hit-feedback.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('×');
    expect(source).not.toContain('#hitmarker');
    expect(planZeroHitRow(0).label).toContain('NO DAMAGE');
    expect(planZeroHitRow(0).label).toContain('0');
    // The glyph is a hollow circle (picture of nothing), styled only here.
    expect(planZeroHitRow(0).glyphClass).toBe('zero-hit-glyph');
    // Soft fade only: the injected animation never scales, unlike the
    // hitmarker's scale punch, and it honours reduced motion.
    expect(source).toContain('@keyframes zeroHitFade');
    expect(source.match(/scale\(/g) ?? []).toHaveLength(0);
    expect(source).toContain("html[data-reduced-motion='true']");
  });

  it('refuses to render without a live HUD instead of creating one', () => {
    // Node environment: no `document` at all. The module must bail cleanly.
    expect(presentZeroDamageHit(1_000)).toBe(false);
  });

  it('stays presentation-only: visible lifetime is short and bounded', () => {
    expect(ZERO_HIT_VISIBLE_MS).toBeLessThanOrEqual(1_000);
    expect(ZERO_HIT_MAX_ROWS).toBeLessThanOrEqual(3);
  });

  it('is wired at every shooter world-impact site in the live shot path', () => {
    const mainSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    expect(mainSource).toContain("from './zero-hit-feedback'");
    // Ordinary weapons: once per trigger pull that damaged nobody but struck
    // world geometry (after the pellet loop).
    expect(mainSource.match(/presentZeroDamageHit\(now\)/g)?.length).toBeGreaterThanOrEqual(2);
    // Chopper gunner possession fires its own cue on the authoritative ray's
    // world impact.
    expect(mainSource).toContain('presentZeroDamageHit(now);');
  });

  it('never claims NO DAMAGE while confirmed target damage is still being presented', () => {
    // The possessed chopper gunner resolves damage asynchronously on the host,
    // so a world-hit round cannot know its own outcome synchronously. But while
    // showGunnerTargetConfirm is still presenting a CONFIRMED damage event
    // (gunnerTargetConfirmUntil extends 650 ms past the last confirm and is
    // re-armed by every successive hit), an interleaved floor-hit round must
    // stay silent: announcing "0 NO DAMAGE" over visible damage numbers is the
    // exact contradiction HF-386 exists to remove.
    const mainSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
    const guardPattern = /if \(now >= gunnerTargetConfirmUntil\) \{\s+presentZeroDamageHit\(now\);\s+\}/;
    const match = mainSource.match(guardPattern);
    expect(match).not.toBeNull();
    // The guarded call must be the CHOPPER possession site: inside the
    // presentation-trace block, after the impact audio, before the cadence
    // reset.
    const traceStart = mainSource.indexOf('const chopperTrace = traceWeaponPath');
    const cadenceReset = mainSource.indexOf('nextLocalSupportGunReportAt = now + (possession.kind');
    expect(traceStart).toBeGreaterThan(-1);
    expect(cadenceReset).toBeGreaterThan(traceStart);
    expect(mainSource.indexOf(match![0])).toBeGreaterThan(traceStart);
    expect(mainSource.indexOf(match![0])).toBeLessThan(cadenceReset);
  });
});
