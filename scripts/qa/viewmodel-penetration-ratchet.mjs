/**
 * HF-395 - the viewmodel penetration RATCHET.
 *
 * A pose set measured once is evidence for that run only. Checked in, the same
 * numbers become a floor: every later run is graded against them and a pose
 * that gets worse fails the run. This module is the pure half of that - shape
 * in, verdict out - so it can be tested without a browser
 * (`scripts/qa/viewmodel-penetration-ratchet.test.ts`).
 *
 * Two rules keep it honest:
 *  - there is NO automatic relaxation. Only an explicit `--update-ratchet`
 *    rewrites the file, and only from a run that covers at least as much.
 *  - coverage is part of the contract. A run that drops an arena, a weapon or
 *    a scenario, or coarsens the yaw sweep, FAILS instead of quietly passing
 *    on the poses it still measures.
 */

export const VIEWMODEL_PENETRATION_RATCHET_CONTRACT = 'viewmodel-penetration-ratchet-v1';

/** Metres a scenario may drift worse before it counts as a regression. */
export const RATCHET_TOLERANCE_METERS = 0.001;

/** The checked-in shape, built from an instrument summary. */
export function buildRatchet(summary, coverage) {
  return {
    contract: VIEWMODEL_PENETRATION_RATCHET_CONTRACT,
    arenas: [...coverage.arenas].sort(),
    weapons: [...coverage.weapons].sort(),
    yawSteps: coverage.yawSteps,
    stances: [...coverage.stances],
    scenarios: Object.fromEntries(Object.entries(summary.byScenario).map(([key, value]) => [key, {
      penetrating: value.penetrating,
      worstM: value.worstM,
      belowFloor: value.belowFloor,
      worstBelowFloorM: value.worstBelowFloorM,
    }])),
  };
}

/**
 * Why a run may NOT overwrite the ratchet: it covers less than the file does.
 * Returns an empty array when the update is allowed.
 */
export function updateRefusals(held, measured) {
  if (!held) return [];
  const refusals = [];
  for (const arena of held.arenas) if (!measured.arenas.includes(arena)) refusals.push(`arena ${arena} was not measured`);
  for (const weapon of held.weapons) if (!measured.weapons.includes(weapon)) refusals.push(`weapon ${weapon} was not measured`);
  for (const key of Object.keys(held.scenarios)) if (!(key in measured.scenarios)) refusals.push(`scenario ${key} was not measured`);
  if (measured.yawSteps < held.yawSteps) refusals.push(`yaw sweep coarsened ${held.yawSteps} -> ${measured.yawSteps}`);
  return refusals;
}

/** Every way this run is worse than the ratchet. Empty means the ratchet held. */
export function gradeAgainstRatchet(held, measured) {
  const regressions = updateRefusals(held, measured);
  for (const [key, allowed] of Object.entries(held.scenarios)) {
    const found = measured.scenarios[key];
    if (!found) continue; // already reported as missing coverage above
    if (found.worstM > allowed.worstM + RATCHET_TOLERANCE_METERS) {
      regressions.push(`${key} penetration ${allowed.worstM} -> ${found.worstM} m`);
    }
    if (found.worstBelowFloorM > allowed.worstBelowFloorM + RATCHET_TOLERANCE_METERS) {
      regressions.push(`${key} below floor ${allowed.worstBelowFloorM} -> ${found.worstBelowFloorM} m`);
    }
    if (found.penetrating > allowed.penetrating) {
      regressions.push(`${key} penetrating poses ${allowed.penetrating} -> ${found.penetrating}`);
    }
    if (found.belowFloor > allowed.belowFloor) {
      regressions.push(`${key} below-floor poses ${allowed.belowFloor} -> ${found.belowFloor}`);
    }
  }
  return regressions;
}
