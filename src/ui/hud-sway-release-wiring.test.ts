import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Anti-regression pin for the twelfth "built but never wired" defect.
 *
 * `releaseHudSway` writes the neutral HUD pose and its own doc comment names
 * the four states it exists for — reduced motion, pause, death, possession
 * handover. It shipped with NO production caller: its only importer was its
 * own unit test. So `applyHudSway` ran unconditionally every frame and the
 * last live frame's lean stayed frozen on the HUD through all four states,
 * most visibly on death.
 *
 * This pins the live gate so the wiring cannot regress to test-only
 * reachability again. It is a source-level contract on purpose: the defect
 * class here is "the export is never reached from the frame loop", which a
 * unit test of the function itself cannot detect by construction.
 */
const mainSource = readFileSync(join(import.meta.dirname, '..', 'legacy-main.ts'), 'utf8');

describe('hud-sway release live wiring', () => {
  it('imports releaseHudSway into the frame loop module', () => {
    expect(mainSource).toContain('releaseHudSway');
    expect(mainSource).toMatch(/import \{[^}]*releaseHudSway[^}]*\} from '\.\/ui\/pass77-hud-sway'/);
  });

  it('gates the per-frame sway on all four stop-dead states', () => {
    const anchor = mainSource.indexOf('const hudSwayLive =');
    expect(anchor, 'hudSwayLive gate').toBeGreaterThanOrEqual(0);
    const gate = mainSource.slice(anchor, anchor + 400);
    expect(gate, 'reduced motion').toContain('!accessibilityRuntime.reducedMotion');
    expect(gate, 'menu/pause surface').toContain("menuLifecycle.surface === 'hidden'");
    expect(gate, 'death').toContain('player.hp > 0');
    expect(gate, 'possession handover').toContain('!localKillstreakActorSnapshot()?.possession');
  });

  it('releases exactly once per stop instead of every frame', () => {
    const anchor = mainSource.indexOf('const hudSwayLive =');
    const block = mainSource.slice(anchor, anchor + 1_200);
    // The apply path is now inside the live branch...
    expect(block).toContain('if (hudSwayLive) {');
    expect(block).toContain('hudSway = applyHudSway(hudMotionTargets, hudSway, {');
    // ...and the release path is latched, so a paused HUD is not rewriting
    // four custom properties on every frame it is not moving.
    expect(block).toContain('} else if (!hudSwayReleased) {');
    expect(block).toContain('releaseHudSway(hudMotionTargets)');
    expect(block).toContain('hudSwayReleased = true;');
    expect(block).toContain('hudSwayReleased = false;');
    // Resuming must not snap: the state is re-seeded at the current look
    // angles rather than resuming from the pre-pause residual.
    expect(block).toContain('createHudSwayState(player.yaw, player.pitch)');
  });

  it('leaves releaseHudSway reachable from production, not only from its test', () => {
    // The exact failure signature of this defect class: the only importer of
    // the symbol was `src/ui/pass77-hud-sway.test.ts`.
    const productionCalls = mainSource.match(/releaseHudSway\(/g) ?? [];
    expect(productionCalls.length).toBeGreaterThan(0);
  });
});
