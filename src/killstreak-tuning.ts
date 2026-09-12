/**
 * HF-458 killstreak balance (owner feedback 2026-09-02,
 * `docs/PASS84_OWNER_FEEDBACK_2026-09-02.md`).
 *
 * Every number the owner asked to move lives here as a named constant next to
 * the value it replaced, so the change is reviewable as a diff of intent
 * rather than a diff of magic numbers, and so a test can pin the RATIO the
 * owner actually stated ("+25% fire rate", "-25% damage") instead of pinning a
 * derived decimal that nobody can trace back to a request.
 *
 * This module is deliberately a leaf: it imports nothing. `killstreak-support-
 * catalog.ts` and `killstreak-runtime.ts` both consume it, so any import back
 * into either would be a cycle.
 *
 * Owner's three items, verbatim intent:
 *   1. Chopper Gunner - 6 rockets -> 12 total; autopilot may spend only 6 of
 *      them, and the AI must actually use them; machine-gun damage -25%.
 *   2. Drone Swarm - fire rate +25%, movement speed +15%.
 *   3. Piloted Drone - movement speed +15%, fire rate +25%, plus a 3-charge
 *      right-click electric taser that stuns for ~1 s.
 */

/** Exact decimal rounding so `3 * 1.15` reads as 3.45 rather than 3.4499999999999997. */
function roundToMilli(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/** A cadence in ms is the RECIPROCAL of a fire rate: +25% rate is x0.8 cadence. */
export function cadenceForFireRateMultiplier(baselineCadenceMs: number, fireRateMultiplier: number): number {
  if (!(baselineCadenceMs > 0) || !(fireRateMultiplier > 0)) throw new Error('cadence tuning requires positive inputs');
  return roundToMilli(baselineCadenceMs / fireRateMultiplier);
}

/** A speed in m/s scales directly with its multiplier. */
export function speedForMultiplier(baselineSpeedMps: number, speedMultiplier: number): number {
  if (!(baselineSpeedMps >= 0) || !(speedMultiplier > 0)) throw new Error('speed tuning requires positive inputs');
  return roundToMilli(baselineSpeedMps * speedMultiplier);
}

// ---------------------------------------------------------------------------
// 1. Chopper Gunner
// ---------------------------------------------------------------------------

/** Pre-HF-458 payload. Retained so the ratio in the test is traceable. */
export const CHOPPER_MISSILE_CAPACITY_BEFORE = 6;
/** Owner: "rockets 6 -> 12 total". */
export const CHOPPER_MISSILE_CAPACITY_AFTER = 12;

/**
 * Owner: "on autopilot it fires only 6; a human who takes control can use the
 * extra 6". This is a budget on AI-FIRED missiles, not a second magazine: the
 * airframe carries 12, the autopilot may spend at most this many of them, and
 * whatever the autopilot has not spent stays available to a human gunner. A
 * player who possesses the chopper immediately therefore gets all 12.
 */
export const CHOPPER_AUTOPILOT_MISSILE_BUDGET = CHOPPER_MISSILE_CAPACITY_BEFORE;

/**
 * The autopilot only launches at a target it can actually see, and never
 * further out than the possessed launcher's own reach. Slower than the
 * possessed cadence on purpose: an AI that empties six rockets in six seconds
 * is not a support streak, it is a nuke with rotors.
 */
export const CHOPPER_AUTOPILOT_MISSILE_CADENCE_MS = 2_600;
/** Autopilot missiles need a real target; this is the ground-target reach. */
export const CHOPPER_AUTOPILOT_MISSILE_RANGE_M = 90;
/** No autopilot launch before the airframe is on station (inbound phase). */
export const CHOPPER_AUTOPILOT_MISSILE_ARM_DELAY_MS = 2_000;

/** Owner: "machine-gun damage -25%". */
export const CHOPPER_GUN_DAMAGE_MULTIPLIER = 0.75;
/** Pass 66.1 autocannon numbers this multiplier is applied to. */
export const CHOPPER_GUN_DAMAGE_BEFORE = 34;
export const CHOPPER_GUN_MINIMUM_DAMAGE_BEFORE = 22;
/** The HF-458 result. Kept named so HF-509's halving is a readable ratio, not a new literal. */
export const CHOPPER_GUN_DAMAGE_HF458 = roundToMilli(CHOPPER_GUN_DAMAGE_BEFORE * CHOPPER_GUN_DAMAGE_MULTIPLIER);
export const CHOPPER_GUN_MINIMUM_DAMAGE_HF458 = roundToMilli(
  CHOPPER_GUN_MINIMUM_DAMAGE_BEFORE * CHOPPER_GUN_DAMAGE_MULTIPLIER,
);

/**
 * HF-509 (owner 2026-09-05): "half the damage of the helicopter's machine gun,
 * the chopper gunner. Keep everything else the same."
 *
 * This is a second, independent halving stacked on HF-458's -25%, expressed as
 * its own ratio so the request stays traceable: the owner asked to halve what
 * is IN THE GAME TODAY (25.5 / 16.5), not to re-derive from the Pass 66.1
 * baseline. Cadence, range, falloff start, splash, penetration and the missile
 * payload are deliberately untouched - only these two numbers move.
 */
export const CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER = 0.5;
export const CHOPPER_GUN_DAMAGE_AFTER = roundToMilli(
  CHOPPER_GUN_DAMAGE_HF458 * CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
);
export const CHOPPER_GUN_MINIMUM_DAMAGE_AFTER = roundToMilli(
  CHOPPER_GUN_MINIMUM_DAMAGE_HF458 * CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
);
/** Total scaling from the Pass 66.1 (v2) autocannon: 0.75 x 0.5. */
export const CHOPPER_GUN_DAMAGE_MULTIPLIER_FROM_V2 = roundToMilli(
  CHOPPER_GUN_DAMAGE_MULTIPLIER * CHOPPER_GUN_DAMAGE_HALVING_MULTIPLIER,
);

// ---------------------------------------------------------------------------
// 2. Drone Swarm
// ---------------------------------------------------------------------------

/** Owner: swarm "fire rate +25%". */
export const DRONE_SWARM_FIRE_RATE_MULTIPLIER = 1.25;
/** Owner: swarm "movement speed +15%". */
export const DRONE_SWARM_SPEED_MULTIPLIER = 1.15;

// ---------------------------------------------------------------------------
// 3. Piloted Drone
// ---------------------------------------------------------------------------

/** Owner: piloted drone "fire rate +25%". */
export const PILOTED_DRONE_FIRE_RATE_MULTIPLIER = 1.25;
/** Owner: piloted drone "movement speed +15%". */
export const PILOTED_DRONE_SPEED_MULTIPLIER = 1.15;

/**
 * Owner: "3 taser charges per drone". Charges belong to the DRONE, not to the
 * pilot, so an AI drone that spends two before a player takes it over hands
 * over one - the same accounting the missile budget uses.
 */
export const PILOTED_DRONE_TASER_CHARGES = 3;
/** Owner: stunned player "cannot move for ~1 s". */
export const TASER_STUN_DURATION_MS = 1_000;
/** Absolute wire bound; a longer stun than this is a malformed result. */
export const TASER_STUN_MAX_DURATION_MS = 2_000;
/** Between shots, so the three charges cannot be dumped in one frame. */
export const PILOTED_DRONE_TASER_COOLDOWN_MS = 1_500;
/**
 * Deliberately shorter than the drone's 45 m gun range: the taser is a
 * close-quarters denial tool, not a sniping stun.
 */
export const PILOTED_DRONE_TASER_RANGE_M = 22;

/**
 * Presentation contract for the taser. Kept here (not in the presentation
 * module) so the "clearly tasered, not flashbanged" requirement is one
 * reviewable record rather than a colour buried in a stylesheet.
 *
 * Owner: "electric-blue crackle/vignette plus a short camera jitter, not the
 * white flash". The flashbang overlay is `#ordnance-flash`, full-screen white,
 * up to 2.8 s; this is `#taser-shock`, an electric-blue EDGE vignette with a
 * crackle pulse, ~1 s, plus camera jitter the flashbang never applies.
 */
export const TASER_PRESENTATION = Object.freeze({
  overlayElementId: 'taser-shock',
  /** Distinct from the flashbang's white; a cold electric arc. */
  arcColorCss: '#5ad8ff',
  /** The screen centre stays readable - a stun is not a blind. */
  style: 'edge-vignette-with-arc-crackle',
  crackleHz: 18,
  /** Peak camera jitter amplitude in metres; the flashbang applies none. */
  cameraJitterAmplitudeM: 0.045,
  cameraJitterHz: 26,
} as const);
