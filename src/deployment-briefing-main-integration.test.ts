import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from './arena-identity';
import { deploymentBriefingCopy } from './ui/deployment-briefing-surface';

/**
 * HF-372 wiring pin (HF-536 S1 salvage, 2026-09-06).
 *
 * `src/arena-deployment-briefing.ts` and `src/ui/deployment-briefing-surface.ts`
 * were written for this complaint, deleted unwired by `ccfeec86`, restored by
 * this branch, and are only worth anything while `legacy-main.ts` actually calls
 * them. Their own unit tests stay green with the modules orphaned — that is
 * exactly how the fix was lost the first time — so this file reads the shipping
 * source and fails if the call site goes away or the generic sentence returns.
 *
 * Same technique as `src/radar-fire-reveal-main-integration.test.ts`.
 */
const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('HF-372: the deployment console shows per-arena copy, not one sentence', () => {
  it('has retired the generic loading sentence from the executable source', () => {
    // The exact line the owner saw on all six maps. Other `Preparing …` loader
    // lines are legitimate progress copy and are deliberately left alone.
    expect(source).not.toContain('`Preparing ${selectedArena.displayName} authoritative arena state…`');
    expect(source).not.toContain('authoritative arena state…`');
  });

  it('writes the briefing into the three console elements when the arena is chosen', () => {
    const prepare = block('function prepareDeploymentTransition(): void {', '\nfunction applyMenuLifecycle(');
    expect(prepare).toContain('applyDeploymentBriefing(');
    expect(prepare).toContain(
      '{ kicker: deploymentTransitionKicker, title: deploymentTransitionTitle, status: deploymentTransitionStatus },',
    );
    expect(prepare).toContain('selectedArena.id,');
    expect(prepare).toContain('selectedArena.displayName,');
    // The release identity the console shipped before the briefing existed is
    // carried into the kicker rather than replaced by it.
    expect(prepare).toContain('`${PASS66_RELEASE_IDENTITY.pass} // DEPLOYMENT STREAM`');
    expect(source).toContain("import { applyDeploymentBriefing } from './ui/deployment-briefing-surface';");
  });

  it('is written once per deployment, not per frame', () => {
    // One call site, inside the one-shot preparation function - never in
    // updateDeploymentLoadingProgress, setStatus or any render loop.
    expect(source.match(/applyDeploymentBriefing\(/g)).toHaveLength(1);
    expect(source.match(/prepareDeploymentTransition\(\);/g)).toHaveLength(1);
    const progress = block('function updateDeploymentLoadingProgress(', '\nfunction setBootstrapStage(');
    expect(progress).not.toContain('applyDeploymentBriefing');
    expect(progress).not.toContain('deploymentTransitionStatus');
  });

  it('does not fight the loader: the briefing runs before the lifecycle turns deploying', () => {
    // The ordering the wiring relies on, asserted rather than described. If a
    // future edit moves the prepare call after match-start, setStatus's
    // deploying branch owns the status line first and the briefing never shows.
    expect(source).toContain("prepareDeploymentTransition();\n  applyMenuLifecycle({ type: 'match-start' });");
    // setStatus is still the ONLY other writer of the status element, and still
    // gated on the deploying surface.
    const setStatus = block('function setStatus(text: string', '\n/**');
    expect(setStatus).toContain("if (menuLifecycle.surface === 'deploying') {");
    expect(setStatus).toContain('deploymentTransitionStatus.textContent = text;');
    expect(source.match(/deploymentTransitionStatus/g)).toHaveLength(3);
    // The kicker has exactly one writer - the briefing - so the per-arena
    // identity survives every loader status line for the whole stream.
    expect(source.match(/deploymentTransitionKicker/g)).toHaveLength(2);
  });

  it('reaches real per-arena copy for every selectable arena, including the two HF-372 named', () => {
    const kicker = 'PASS 66 // DEPLOYMENT STREAM';
    const statuses = new Set(ARENA_IDS.map((id) => deploymentBriefingCopy(id, id, kicker).status));
    expect(statuses.size).toBe(ARENA_IDS.length);
    for (const id of ['farcrysis', 'high-seas'] as const) {
      expect(deploymentBriefingCopy(id, id, kicker).status).not.toMatch(/authoritative arena state/i);
    }
  });
});
