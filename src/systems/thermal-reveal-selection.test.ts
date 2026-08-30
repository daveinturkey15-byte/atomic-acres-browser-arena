/**
 * Unit gates for the shared through-wall reveal selection.
 *
 * The owner's report was "see through walls is still there and good on piloted
 * drone but gone on chopper gunner and rail gun". The shape of that failure is
 * ONE optic returning a different (or empty) reveal set than another from the
 * same roster. While the decision lived inline in legacy-main the only way to
 * observe it was to fly all three; here it is a table.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { THERMAL_GHOST_MAX_TARGETS } from '../thermal-ghost-presentation';
import {
  deriveThermalRevealMode,
  selectThermalRevealPrewarmTargets,
  selectThermalRevealTargets,
  thermalRevealActive,
  thermalRevealRelation,
  type ThermalRevealActivation,
  type ThermalRevealCandidate,
  type ThermalRevealObserver,
} from './thermal-reveal-selection';

const OBSERVER: ThermalRevealObserver = Object.freeze({ id: 'me', team: 0 });

const NO_OPTIC: ThermalRevealActivation = Object.freeze({
  dmrThermalActive: false,
  railgunRevealActive: false,
  chopperThermal: false,
});

function optic(active: Partial<ThermalRevealActivation>): ThermalRevealActivation {
  return { ...NO_OPTIC, ...active };
}

function candidate(
  id: string,
  team: 0 | 1,
  overrides: Partial<ThermalRevealCandidate> = {},
): ThermalRevealCandidate {
  return {
    id,
    team,
    kind: 'bot',
    alive: true,
    root: new THREE.Object3D(),
    lifeId: 0,
    continuityId: 0,
    ...overrides,
  };
}

/** Two enemies and one ally: enough to separate "empty" from "wrong". */
function roster(): ThermalRevealCandidate[] {
  return [
    candidate('enemy-a', 1, { kind: 'player' }),
    candidate('ally-a', 0, { kind: 'player' }),
    candidate('enemy-b', 1),
  ];
}

describe('through-wall reveal target selection (owner 2026-08-30)', () => {
  it('reveals nothing while no optic is active', () => {
    expect(thermalRevealActive(NO_OPTIC)).toBe(false);
    expect(selectThermalRevealTargets(NO_OPTIC, OBSERVER, 'tdm', roster())).toEqual([]);
  });

  /**
   * THE HISTORICAL FAILURE SHAPE. The reveal must not depend on WHICH optic
   * asked for it. A per-optic difference here is precisely "good on the drone,
   * gone on chopper gunner and rail gun".
   */
  it('gives every optic the same reveal from the same roster', () => {
    const candidates = roster();
    const dmr = selectThermalRevealTargets(optic({ dmrThermalActive: true }), OBSERVER, 'tdm', candidates);
    const chopper = selectThermalRevealTargets(optic({ chopperThermal: true }), OBSERVER, 'tdm', candidates);
    const railgun = selectThermalRevealTargets(optic({ railgunRevealActive: true }), OBSERVER, 'tdm', candidates);

    expect(dmr.map((target) => target.id)).toEqual(['enemy-a', 'ally-a', 'enemy-b']);
    expect(chopper.map((target) => target.id)).toEqual(dmr.map((target) => target.id));
    // The railgun narrows to its OWN authority policy - enemies only. That is
    // the one authored difference, and it must still be a non-empty reveal.
    expect(railgun.map((target) => target.id)).toEqual(['enemy-a', 'enemy-b']);
    expect(railgun.length).toBeGreaterThan(0);
  });

  /**
   * The railgun predicate is scoped to the railgun. When it runs alongside a
   * DMR or chopper reveal it must not shrink theirs - the inline version
   * guarded on exactly this and it is easy to lose in a move.
   */
  it('does not let the railgun policy narrow a concurrent DMR or chopper reveal', () => {
    const candidates = roster();
    for (const concurrent of ['dmrThermalActive', 'chopperThermal'] as const) {
      const targets = selectThermalRevealTargets(
        optic({ railgunRevealActive: true, [concurrent]: true }),
        OBSERVER,
        'tdm',
        candidates,
      );
      expect(targets.map((target) => target.id)).toEqual(['enemy-a', 'ally-a', 'enemy-b']);
    }
  });

  it('never reveals the observer to itself through the railgun', () => {
    const candidates = [candidate('me', 0, { kind: 'player' }), ...roster()];
    const targets = selectThermalRevealTargets(
      optic({ railgunRevealActive: true }),
      OBSERVER,
      'ffa',
      candidates,
    );
    expect(targets.map((target) => target.id)).not.toContain('me');
  });

  it('drops dead actors and carries life/continuity for stale-pose rejection', () => {
    const candidates = [
      candidate('down', 1, { alive: false }),
      candidate('up', 1, { lifeId: 4, continuityId: 9 }),
    ];
    const targets = selectThermalRevealTargets(optic({ dmrThermalActive: true }), OBSERVER, 'tdm', candidates);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ id: 'up', lifeId: 4, continuityId: 9 });
  });

  it('keeps the first record for a duplicated id, so a re-listed actor gets one slot', () => {
    const first = new THREE.Object3D();
    const second = new THREE.Object3D();
    const targets = selectThermalRevealTargets(optic({ dmrThermalActive: true }), OBSERVER, 'tdm', [
      candidate('twin', 1, { root: first }),
      candidate('twin', 1, { root: second }),
    ]);
    expect(targets).toHaveLength(1);
    expect(targets[0].root).toBe(first);
  });

  it('preserves candidate order, because the presentation layer caps the set', () => {
    const candidates = Array.from(
      { length: THERMAL_GHOST_MAX_TARGETS + 4 },
      (_unused, index) => candidate(`enemy-${index}`, 1),
    );
    const targets = selectThermalRevealTargets(optic({ dmrThermalActive: true }), OBSERVER, 'tdm', candidates);
    expect(targets.map((target) => target.id)).toEqual(candidates.map((entry) => entry.id));
  });
});

describe('reveal relation and mode derivation', () => {
  it('treats solo and domination as team play, and passes ffa/tdm through', () => {
    expect(deriveThermalRevealMode('solo', 'ffa')).toBe('tdm');
    expect(deriveThermalRevealMode('host', 'domination')).toBe('tdm');
    expect(deriveThermalRevealMode('host', 'ffa')).toBe('ffa');
    expect(deriveThermalRevealMode('client', 'tdm')).toBe('tdm');
  });

  it('has no allies in ffa', () => {
    expect(thermalRevealRelation('tdm', 0, 0)).toBe('friendly');
    expect(thermalRevealRelation('tdm', 0, 1)).toBe('hostile');
    expect(thermalRevealRelation('ffa', 0, 0)).toBe('hostile');
  });

  it('tints an ally friendly and an enemy hostile in team play', () => {
    const targets = selectThermalRevealTargets(optic({ dmrThermalActive: true }), OBSERVER, 'tdm', roster());
    expect(targets.map((target) => target.relation)).toEqual(['hostile', 'friendly', 'hostile']);
  });
});

describe('admission prewarm selection', () => {
  it('submits every live actor with no eligibility filter', () => {
    // Prewarm deliberately ignores the railgun policy: compiling a program the
    // player turns out not to see costs nothing, skipping it costs a hitch.
    const targets = selectThermalRevealPrewarmTargets(OBSERVER, 'tdm', roster(), []);
    expect(targets.map((target) => target.id)).toEqual(['enemy-a', 'ally-a', 'enemy-b']);
  });

  it('fills remaining slots from the retained corpse corpus, capped', () => {
    const corpses = Array.from({ length: THERMAL_GHOST_MAX_TARGETS + 5 }, () => ({
      team: 1 as const,
      root: new THREE.Object3D(),
    }));
    const targets = selectThermalRevealPrewarmTargets(OBSERVER, 'tdm', roster(), corpses);
    expect(targets).toHaveLength(THERMAL_GHOST_MAX_TARGETS);
    expect(targets[3].id).toBe('thermal-prewarm-corpse-0');
    expect(targets.at(-1)?.id).toBe(`thermal-prewarm-corpse-${THERMAL_GHOST_MAX_TARGETS - 4}`);
  });

  it('still submits both programs from an empty lobby', () => {
    const targets = selectThermalRevealPrewarmTargets(OBSERVER, 'tdm', [], [
      { team: 0, root: new THREE.Object3D() },
      { team: 1, root: new THREE.Object3D() },
    ]);
    expect(targets.map((target) => target.relation)).toEqual(['friendly', 'hostile']);
  });
});

/**
 * RE-PIN, 2026-08-30. src/pass70-weapon-contact-scope-integration.test.ts
 * pinned "M14, Railgun and Chopper all route through one exact-model renderer"
 * as the literal legacy-main line `if (!dmrThermalActive && !railgunRevealActive
 * && !chopperThermal)`. That pinned the code's LOCATION, not the invariant, so
 * moving the selection into this module reads as a break even though the
 * routing is identical. The invariant is re-stated here against the module
 * that now owns it, and strengthened: legacy-main must not grow a per-optic
 * selection loop again, which is the exact shape of the owner's complaint.
 * Nothing is relaxed.
 */
describe('source shape: one gate and one selection for three optics (re-pinned 2026-08-30)', () => {
  const MODULE = readFileSync(new URL('./thermal-reveal-selection.ts', import.meta.url), 'utf8');
  const RUNTIME = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');

  it('gates the shared reveal on all three optics in one expression', () => {
    expect(MODULE).toContain(
      'activation.dmrThermalActive || activation.railgunRevealActive || activation.chopperThermal',
    );
  });

  it('keeps legacy-main routing all three optics through that gate and one selector', () => {
    expect(RUNTIME).toContain(
      "const chopperThermal = localKillstreakActorSnapshot()?.possession?.kind === 'chopper-gunner';",
    );
    expect(RUNTIME).toContain('const railgunRevealActive = railgunScopeState.revealActive;');
    expect(RUNTIME).toContain('if (!thermalRevealActive(activation))');
    expect(RUNTIME).toContain(
      'railgunPresentation.syncExactOperatorReveal(railgunRevealActive, thermalGhostPresentation.telemetry())',
    );
    // Exactly one live selection call. A second one is a second policy.
    expect(RUNTIME.split('selectThermalRevealTargets(')).toHaveLength(2);
    // The inline relation derivation must not come back alongside it.
    expect(RUNTIME).not.toContain("'friendly' as const : 'hostile' as const");
  });

  it('cannot reach back into the module it was extracted from', () => {
    expect(MODULE).not.toMatch(/from\s+'\.\.\/legacy-main'/u);
    expect(MODULE).not.toContain('document.');
    expect(MODULE).not.toContain('THREE.');
  });
});
