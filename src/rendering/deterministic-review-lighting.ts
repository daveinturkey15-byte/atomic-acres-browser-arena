/**
 * deterministic-review-lighting — the sky a REVIEW CAPTURE is allowed to use.
 *
 * WHY THIS EXISTS (measured 2026-09-06, HF-535). `DEFAULT_LIGHTING_TIME_CHOICE`
 * is `'random'`, and on Nuke Town Rebuild `'random'` selects one of three
 * AUTHORED skies from `hash32(matchSeed)`, where `matchSeed` is derived from
 * the match epoch — a wall clock. Nothing in the deterministic review path
 * pinned it. So the SAME bundle, served from the same dist on the same
 * machine, captured `nuketown2-coach-elevation` at
 *
 *     10:30 late-morning sky   ->  4.58% / 7.34% exact-black
 *     14:00 overcast sky       -> 25.74%
 *     17:36 golden hour        -> 26.87%
 *
 * within one hour (7 sessions, `artifacts/blackroad/race/`). Every viewpoint
 * diff and every "the fix relocated the black onto the road" verdict taken
 * against a single stored baseline was reading that dice roll. The review
 * camera already pins position, target, fov, near/far, exposure, the TSL
 * animation time and the TSL seed; the SUN was the one input it left to chance.
 *
 * This module is the rule, kept pure so it is a test rather than a comment.
 * It changes no light: the caller installs the returned choice through the
 * existing local-override variable and the existing
 * `applyLightingConditionUniforms()`, which writes into the frozen light set.
 */
import { DEFAULT_LIGHTING_TIME_CHOICE, type LightingTimeChoice } from './lighting-conditions';

/**
 * The choices whose resolved sky depends on the match seed or on elapsed match
 * time. A capture taken under one of these is not reproducible, so the review
 * path must never resolve through them.
 */
export const NON_DETERMINISTIC_LIGHTING_CHOICES: readonly LightingTimeChoice[] = Object.freeze([
  'random',
  'cycle',
]);

/** The sky a review capture falls back to: the arena's own authored hour. */
export const REVIEW_CAPTURE_LIGHTING_CHOICE: LightingTimeChoice = 'authored';

export function isDeterministicLightingChoice(choice: LightingTimeChoice): boolean {
  return !NON_DETERMINISTIC_LIGHTING_CHOICES.includes(choice);
}

/**
 * What the review path should install as the LOCAL time-of-day override, or
 * `null` for "leave it alone".
 *
 * An operator who has already pinned the sky — `?tod=early`, `?todhour=14`, or
 * the `setLightingTimeChoice` QA hook — keeps their pin: those exist precisely
 * so the three authored skies can each be reviewed, and overriding them would
 * make this module the thing that hides a sky rather than the thing that pins
 * one. Everything else resolves to the arena's authored hour.
 *
 * Inside a hosted lobby the replicated `config.timeOfDay` is the only
 * authority (a local override cannot and must not take one peer off the shared
 * sky), so this returns `null` there and the caller reports rather than pins.
 */
export function reviewCaptureLightingOverride(input: Readonly<{
  /** The live local override (`?tod=` / QA hook), or null. */
  requestedOverride: LightingTimeChoice | null;
  /** The live `?todhour=` pin, or null. */
  fixedHour: number | null;
  /** True whenever a private-lobby snapshot exists, for host AND guest. */
  hosted: boolean;
}>): LightingTimeChoice | null {
  if (input.hosted) return null;
  if (input.fixedHour !== null && Number.isFinite(input.fixedHour)) return null;
  if (input.requestedOverride !== null && isDeterministicLightingChoice(input.requestedOverride)) return null;
  return REVIEW_CAPTURE_LIGHTING_CHOICE;
}

/** What a review capture actually resolved to, read back off the live game. */
export type ReviewLightingObservation = Readonly<{
  cameraId: string;
  choice: LightingTimeChoice;
  fixedHour: number | null;
  hosted: boolean;
}>;

/**
 * Fails closed on the exact defect above: a review station committed under a
 * seed-dependent sky. Hosted matches are exempt because the sky is replicated
 * state there and pinning it locally is the worse defect.
 */
export function assertDeterministicReviewLighting(observation: ReviewLightingObservation): void {
  if (observation.hosted) return;
  if (observation.fixedHour !== null && Number.isFinite(observation.fixedHour)) return;
  if (isDeterministicLightingChoice(observation.choice)) return;
  throw new Error(
    `Deterministic review gate failed closed: review camera ${observation.cameraId} committed under `
    + `time-of-day choice '${observation.choice}', which resolves from the match seed. `
    + `The default is '${DEFAULT_LIGHTING_TIME_CHOICE}', so this station's capture is a dice roll.`,
  );
}
