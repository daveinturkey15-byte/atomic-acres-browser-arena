import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HF-370 / Pass 79 anti-regression pin: src/ui/hud-impact-response.ts spent
 * its whole life imported by nothing but its own unit test while the owner
 * reported "the HUD shakes" — failure mode 1 in GAUNTLET-SPEC.md. This file
 * pins the LIVE call sites in legacy-main.ts so the wiring cannot silently
 * regress to test-only reachability again.
 */
const mainSource = readFileSync(join(import.meta.dirname, '..', 'legacy-main.ts'), 'utf8');
const cssSource = readFileSync(join(import.meta.dirname, '..', 'style.css'), 'utf8');

describe('hud-impact-response live wiring', () => {
  it('is imported and integrated once per frame into updateSensoryFeedback', () => {
    expect(mainSource).toContain("from './ui/hud-impact-response'");
    expect(mainSource).toContain('advanceHudImpact(hudRoot, hudImpactState, now)');
    // The integration must run before the 30 Hz sensory presentation gate,
    // otherwise the stiff bullet spring visibly steps.
    expect(mainSource.indexOf('advanceHudImpact(hudRoot')).toBeLessThan(
      mainSource.indexOf('lastSensoryPresentationAt <'),
    );
  });

  it('is fed by the damage-taken site', () => {
    const damageSite = mainSource.slice(
      mainSource.indexOf("source: 'damage-taken'"),
      mainSource.indexOf("source: 'damage-taken'") + 1_600,
    );
    expect(damageSite).toContain("kind: cause.kind === 'grenade' || cause.kind === 'killstreak' ? 'explosion' : 'bullet'");
    expect(damageSite).toContain('pushHudImpact(hudImpactState');
    expect(damageSite).toContain('bearingRadians: sourceScreenAngle(');
  });

  it('is fed by the grenade explosion site with distance falloff', () => {
    const anchor = mainSource.indexOf("? 'far-explosion' : 'near-explosion'");
    expect(anchor).toBeGreaterThanOrEqual(0);
    const blastSite = mainSource.slice(anchor, anchor + 900);
    expect(blastSite).toContain("kind: 'explosion'");
    expect(blastSite).toContain('pushHudImpact(hudImpactState');
  });

  it('has a CSS consumer for every property the module writes', () => {
    for (const variable of [
      '--hud-impact-x',
      '--hud-impact-y',
      '--hud-impact-roll',
      '--hud-impact-chroma',
      '--hud-impact-flash',
    ]) {
      // Written by writeHudImpactProperties AND consumed by a var() reference.
      expect(cssSource.includes(`var(${variable}`)).toBe(true);
    }
  });
});
