/**
 * HF-395 - the viewmodel penetration RATCHET.
 *
 * A pose set measured once is evidence for that run only. Checked in, the same
 * numbers become a floor: every later run is graded against them and a pose
 * that gets worse fails the run. This module is the pure half of that - shape
 * in, verdict out - so it can be tested without a browser
 * (`scripts/qa/viewmodel-penetration-ratchet.test.ts`).
 *
 * Three rules keep it honest:
 *  - there is NO automatic relaxation. Only an explicit `--update-ratchet`
 *    rewrites the file, and only from a run that covers at least as much.
 *  - coverage is part of the contract. A run that drops an arena, a weapon or
 *    a scenario, coarsens the yaw sweep, or GRADES FEWER ROWS in a scenario
 *    than the file recorded, FAILS instead of quietly passing on the poses it
 *    still measures. Row count is coverage: the previous version let a
 *    scenario lose 36 of 36 rows and still pass, because the numbers it graded
 *    were computed over whatever was left.
 *  - a rig that is not DRAWN is not a clean rig. A viewmodel the clip planes
 *    discard entirely reports 0 m penetration and 0 m below the floor - it
 *    grades as perfect - so `worstClippedFraction` is ratcheted alongside the
 *    depths and may not rise. "Fix the clipping by cutting the whole weapon
 *    away" is the one regression the depth numbers structurally cannot see.
 */

export const VIEWMODEL_PENETRATION_RATCHET_CONTRACT = 'viewmodel-penetration-ratchet-v2';

/** Metres a scenario may drift worse before it counts as a regression. */
export const RATCHET_TOLERANCE_METERS = 0.001;

/**
 * How much more of the rig a run may clip away before it counts as a
 * regression. Run-to-run jitter in the pose is a few vertices out of ~15,600;
 * 2 percentage points is well above that and far below any real erasure.
 */
export const RATCHET_CLIPPED_FRACTION_TOLERANCE = 0.02;

/** The checked-in shape, built from an instrument summary. */
export function buildRatchet(summary, coverage) {
  return {
    contract: VIEWMODEL_PENETRATION_RATCHET_CONTRACT,
    arenas: [...coverage.arenas].sort(),
    weapons: [...coverage.weapons].sort(),
    yawSteps: coverage.yawSteps,
    stances: [...coverage.stances],
    scenarios: Object.fromEntries(Object.entries(summary.byScenario).map(([key, value]) => [key, {
      // Rows that were actually posed. Grading numbers without it lets a run
      // that measured 2 rows look identical to one that measured 36.
      gradedRows: value.gradedRows ?? value.rows ?? 0,
      penetrating: value.penetrating,
      worstM: value.worstM,
      belowFloor: value.belowFloor,
      worstBelowFloorM: value.worstBelowFloorM,
      worstClippedFraction: value.worstClippedFraction ?? 0,
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
  for (const [key, allowed] of Object.entries(held.scenarios)) {
    const found = measured.scenarios[key];
    if (!found) { refusals.push(`scenario ${key} was not measured`); continue; }
    // A scenario that posed 36 rows and now poses 4 has not improved, it has
    // stopped looking. This is the rule that replaces the excluded-scenario
    // list: rows drop out individually and visibly, never a whole scenario.
    const heldRows = allowed.gradedRows ?? 0;
    if ((found.gradedRows ?? 0) < heldRows) {
      refusals.push(`scenario ${key} graded ${heldRows} -> ${found.gradedRows ?? 0} rows`);
    }
  }
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
    // THE ERASURE RULE. A rig the planes removed entirely scores zero on every
    // metre above, so without this the ratchet reads "perfect" for a build
    // that deleted the weapon.
    const heldFraction = allowed.worstClippedFraction ?? 0;
    if ((found.worstClippedFraction ?? 0) > heldFraction + RATCHET_CLIPPED_FRACTION_TOLERANCE) {
      regressions.push(`${key} rig clipped away ${heldFraction} -> ${found.worstClippedFraction ?? 0} of its vertices`);
    }
  }
  return regressions;
}
