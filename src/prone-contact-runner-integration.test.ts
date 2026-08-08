import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync(new URL('../scripts/qa/run-pass66-prone-contact-matrix.mjs', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/pass66-prone-contact-matrix.spec.ts', import.meta.url), 'utf8');

describe('prone contact native matrix runner contract', () => {
  it('isolates each render profile without weakening workers, retries, or aggregate cells', () => {
    expect(runner).toContain("const profiles = ['performance', 'blender', 'compat'];");
    expect(runner).toContain("const phases = ['solo', 'multiplayer'];");
    expect(runner).toContain("const arenas = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];");
    expect(runner).toContain("PASS66_PRONE_CONTACT_PROFILE: profile");
    expect(runner).toContain("PASS66_PRONE_CONTACT_PHASE: phase");
    expect(runner).toContain("PASS66_PRONE_CONTACT_ARENA: arena");
    expect(runner).toContain("'--workers=1'");
    expect(runner).toContain("'--retries=0'");
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
    expect(runner).toContain("QA_REQUIRE_OWNED_FRESH_PREVIEW: '1'");
    expect(runner).toContain("const expectedSolo = phase === 'solo' ? 1 : 0");
    expect(runner).toContain("const expectedMultiplayer = phase === 'multiplayer' ? 1 : 0");
    expect(runner).toContain("solo.length !== 12 || multiplayer.length !== 12");
    expect(runner).toContain("one fresh installed-Edge process per render profile, phase, and arena cell");
    expect(spec).toContain("PASS66_PRONE_CONTACT_PROFILE");
    expect(spec).toContain("PASS66_PRONE_CONTACT_PHASE");
    expect(spec).toContain("PASS66_PRONE_CONTACT_ARENA");
    expect(spec).toContain("'single-render-profile-phase-and-arena'");
  });
});
