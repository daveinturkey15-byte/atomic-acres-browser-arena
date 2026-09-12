/**
 * HF-395 - the ratchet must be impossible to launder.
 *
 * The whole value of a checked-in floor is that a later run cannot pass by
 * measuring less. These are the ways that could happen, each pinned.
 */
import { describe, expect, it } from 'vitest';
import {
  buildRatchet,
  gradeAgainstRatchet,
  RATCHET_CLIPPED_FRACTION_TOLERANCE,
  RATCHET_TOLERANCE_METERS,
  updateRefusals,
  VIEWMODEL_PENETRATION_RATCHET_CONTRACT,
} from '../scripts/qa/viewmodel-penetration-ratchet.mjs';

const COVERAGE = {
  arenas: ['test2', 'atomic-acres'],
  weapons: ['m4a1', 'carbine'],
  yawSteps: 12,
  stances: ['stand', 'crouch', 'prone'],
};

type Scenario = {
  gradedRows?: number;
  penetrating: number;
  worstM: number;
  belowFloor: number;
  worstBelowFloorM: number;
  worstClippedFraction?: number;
};

/** A scenario block as the instrument writes it, with the defaults filled in. */
const scenario = (partial: Scenario) => ({
  gradedRows: 36,
  worstClippedFraction: 0.1,
  ...partial,
});

const summaryWith = (scenarios: Record<string, Scenario>) => ({
  byScenario: Object.fromEntries(Object.entries(scenarios).map(([key, value]) => [key, scenario(value)])),
});

const GREEN = summaryWith({
  'atomic-acres/garage-door': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
  'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
});

describe('the viewmodel penetration ratchet', () => {
  it('records the coverage it was measured with, sorted, under a named contract', () => {
    const ratchet = buildRatchet(GREEN, COVERAGE);
    expect(ratchet.contract).toBe(VIEWMODEL_PENETRATION_RATCHET_CONTRACT);
    expect(ratchet.arenas).toEqual(['atomic-acres', 'test2']);
    expect(ratchet.weapons).toEqual(['carbine', 'm4a1']);
    expect(ratchet.yawSteps).toBe(12);
  });

  it('holds when every scenario is at or better than the record', () => {
    const held = buildRatchet(GREEN, COVERAGE);
    const better = buildRatchet(summaryWith({
      'atomic-acres/garage-door': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
      'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    expect(gradeAgainstRatchet(held, better)).toEqual([]);
  });

  it('fails a scenario that gets deeper, or lower, or more often', () => {
    const held = buildRatchet(GREEN, COVERAGE);
    const worse = buildRatchet(summaryWith({
      'atomic-acres/garage-door': { penetrating: 1, worstM: 0.02, belowFloor: 0, worstBelowFloorM: 0 },
      'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 3, worstBelowFloorM: 0.4 },
    }), COVERAGE);
    const regressions = gradeAgainstRatchet(held, worse);
    expect(regressions).toHaveLength(4);
    expect(regressions.join('\n')).toContain('garage-door penetration 0 -> 0.02 m');
    expect(regressions.join('\n')).toContain('open-ground-down below floor 0 -> 0.4 m');
  });

  it('tolerates sub-millimetre drift, which is quantization, not a defect', () => {
    const held = buildRatchet(summaryWith({
      a: { penetrating: 0, worstM: 0.05, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    const drifted = buildRatchet(summaryWith({
      a: { penetrating: 0, worstM: 0.05 + RATCHET_TOLERANCE_METERS, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    expect(gradeAgainstRatchet(held, drifted)).toEqual([]);
  });

  it('FAILS a run that simply stopped measuring the scenario that was failing', () => {
    const held = buildRatchet(GREEN, COVERAGE);
    const narrowed = buildRatchet(summaryWith({
      'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    expect(gradeAgainstRatchet(held, narrowed)).toEqual(['scenario atomic-acres/garage-door was not measured']);
  });

  it('FAILS a run that dropped a weapon, an arena, or coarsened the yaw sweep', () => {
    const held = buildRatchet(GREEN, COVERAGE);
    const thin = buildRatchet(GREEN, { ...COVERAGE, weapons: ['carbine'], arenas: ['atomic-acres'], yawSteps: 4 });
    expect(gradeAgainstRatchet(held, thin).sort()).toEqual([
      'arena test2 was not measured',
      'weapon m4a1 was not measured',
      'yaw sweep coarsened 12 -> 4',
    ]);
  });

  it('refuses to REWRITE itself from a run that covers less, however green that run is', () => {
    const held = buildRatchet(GREEN, COVERAGE);
    const thin = buildRatchet(GREEN, { ...COVERAGE, weapons: ['carbine'] });
    expect(updateRefusals(held, thin)).toEqual(['weapon m4a1 was not measured']);
    // A first run, with no file yet, is allowed to write one.
    expect(updateRefusals(null, thin)).toEqual([]);
  });

  // REVIEW REPAIR (HF-395, 2026-09-02). The two blind spots the review found.

  it('FAILS a run whose rig was clipped away, which every metre above scores as perfect', () => {
    // A viewmodel the clip planes discard entirely has no visible vertex inside
    // a solid and none below the floor: penetration 0, below floor 0. Without
    // this rule "delete the weapon" is the highest-scoring possible change.
    const held = buildRatchet(GREEN, COVERAGE);
    const erased = buildRatchet(summaryWith({
      'atomic-acres/garage-door': {
        penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0, worstClippedFraction: 1,
      },
      'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    expect(gradeAgainstRatchet(held, erased))
      .toEqual(['atomic-acres/garage-door rig clipped away 0.1 -> 1 of its vertices']);
  });

  it('tolerates a couple of points of clipped-fraction jitter but not a slide', () => {
    const held = buildRatchet(GREEN, COVERAGE);
    const jitter = buildRatchet(summaryWith({
      'atomic-acres/garage-door': {
        penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0,
        worstClippedFraction: 0.1 + RATCHET_CLIPPED_FRACTION_TOLERANCE,
      },
      'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    expect(gradeAgainstRatchet(held, jitter)).toEqual([]);
  });

  it('FAILS a run that kept the scenario but stopped posing most of its rows', () => {
    // THE HOLE THE EXCLUSION LIST LEFT. A scenario whose player never landed
    // reported whatever the two rows that did land said, and passed. Row count
    // is coverage, and coverage is part of the contract.
    const held = buildRatchet(GREEN, COVERAGE);
    const thinned = buildRatchet(summaryWith({
      'atomic-acres/garage-door': { gradedRows: 2, penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
      'atomic-acres/open-ground-down': { penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0 },
    }), COVERAGE);
    expect(gradeAgainstRatchet(held, thinned))
      .toEqual(['scenario atomic-acres/garage-door graded 36 -> 2 rows']);
    // And it may not rewrite the file from that run either.
    expect(updateRefusals(held, thinned))
      .toEqual(['scenario atomic-acres/garage-door graded 36 -> 2 rows']);
  });

  it('records the graded row count and the clipped fraction it was measured with', () => {
    const ratchet = buildRatchet(GREEN, COVERAGE);
    expect(ratchet.scenarios['atomic-acres/garage-door']).toEqual({
      gradedRows: 36, penetrating: 0, worstM: 0, belowFloor: 0, worstBelowFloorM: 0, worstClippedFraction: 0.1,
    });
  });
});
