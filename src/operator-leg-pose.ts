/**
 * PASS 95 / HF-509 — leg-pose validity for the crouch and prone stances.
 *
 * Owner, verbatim: "The animations of the bots look pretty strange, especially
 * when they go prone and or crouch, their legs get tangled up".
 *
 * WHAT IS ACTUALLY WRONG, read out of the tree rather than guessed. Four
 * separate mechanisms, all reachable from `operator-model.ts`'s
 * `applyStancePose`:
 *
 *  1. THE CROUCH FOOT TARGETS ARE THE MIXER'S, UNFILTERED. `applyStancePose`
 *     snapshots `footLeft`/`footRight` world positions from whatever clip the
 *     mixer just wrote, drops the hips 0.44 m, then two-bone-IKs the ankles back
 *     onto that snapshot. The standing corpus contains `Run_Left` and
 *     `Run_Right`, whose mid-cycle feet CROSS THE BODY MIDLINE. Plant a crossed
 *     pair on a leg shortened by 0.44 m and the two shins swap sides: the exact
 *     tangle in the report. Nothing in the chain ever asked whether the left
 *     foot was still left of the right one.
 *
 *  2. NO JOINT LIMIT ANYWHERE. `plantCrouchLeg` calls `orientBoneTowardWorld`,
 *     which writes an arbitrary quaternion computed from a direction. There is
 *     no knee-flexion bound, so a foot target closer to the hip than the two
 *     segments can comfortably fold produces a collapsed or inverted knee. The
 *     shared IK helper clamps a target onto the reachable sphere at
 *     `|upper - lower|`, which is anatomically far past a human knee.
 *
 *  3. THE PLANT RUNS THROUGH THE PRONE TRANSITION. `crouch > 0.001` is the only
 *     gate. On a crouch->prone move `crouchBlend` decays from 1 while the pelvis
 *     pivot rotates -1.42 rad, so for the whole transition window the solver is
 *     planting ankles onto WORLD positions captured before an 81-degree body
 *     rotation. The legs are dragged after stale targets while the hips swing up
 *     and back — the transition tangle, and the loudest of the four.
 *
 *  4. PRONE KEEPS THE STANDING LEG CYCLE. Prone applies exactly one offset
 *     (`addLocalPose(chest, -0.025, ...)`) and lays the rig down about the
 *     pelvis. The legs still play a STANDING walk or run, and PASS 94's posture
 *     layer legitimately drives its cadence up to 3.3x for a prone crawl. A
 *     scissoring standing stride rotated 81 degrees is a pair of legs swinging
 *     through each other.
 *
 * TECHNIQUE CHOSEN, and why. The canonical skill store's
 * `game-animation-asset-pipeline` offers Lanes A / A2 / A3, and all three are
 * OFFLINE CLIP BAKERIES — the skill's own runtime-boundary section states both
 * reviewed generators are native C++/GGML binaries with no wasm target and no
 * WebGPU inference path, and the technique register marks row 16's weights
 * licence as not yet cleared for this jurisdiction. None of them may run in a
 * browser frame, so none of them can fix a RUNTIME posing bug. What the same
 * skill does supply for runtime work is its production gate list ("no foot
 * sliding, contact penetration, ... bone drift"), the explicit IK FOOT-LOCK PASS
 * the register names at row 16 as the remedy for a skating retarget, and its
 * multi-view headless capture as the judge. So the technique applied here is
 * PROCEDURAL POSE BLENDING WITH DERIVED JOINT LIMITS plus a CONSTRAINED IK FOOT
 * PLANT: the same two-bone solver already in `ik.ts`, given targets that are
 * first proved to be on the correct side of the body and inside the knee's
 * range, and switched off entirely while the pelvis is rotating.
 *
 * Pure and deterministic: numbers in, numbers out, no THREE, no clocks, so every
 * limit here is testable without a GPU.
 */

/**
 * Rig-derived geometry. NOT tuned by eye — these are read off
 * `AUTHORITATIVE_HIT_PROXIES` in `hit-proxies.ts`, the tree's own measurement of
 * the shipped Quaternius operator's 1.7 m silhouette. Its two leg proxies sit at
 * x = -0.18 and x = +0.18 and are 0.32 m wide.
 */
export const OPERATOR_LEG_LATERAL_OFFSET_M = 0.18;
export const OPERATOR_LEG_WIDTH_M = 0.32;

/** Centre-to-centre lateral separation of the two legs in the bind pose. */
export const OPERATOR_BIND_LEG_SEPARATION_M = OPERATOR_LEG_LATERAL_OFFSET_M * 2;

/**
 * The crossing threshold, derived rather than picked.
 *
 * The bind separation is 0.36 m. A genuine crouch and a genuine prone both bring
 * the legs closer together than bind, so the threshold cannot be "no closer than
 * bind" without rejecting correct poses. What it must reject is a CROSS: the
 * moment one leg's centre passes the other's, plus the band around zero in which
 * two 0.32 m-wide limbs are so far inside each other that no viewer can tell
 * which shin belongs to which hip.
 *
 * One third of the bind separation, 0.12 m, is that band's edge: the leg volumes
 * still overlap 0.20 m laterally (a knees-together crouch, which is correct), but
 * each centre is unambiguously on its own side with 0.12 m to spare. Below it the
 * pose is reported as crossing.
 */
export const MIN_LEG_LATERAL_SEPARATION_M = OPERATOR_BIND_LEG_SEPARATION_M / 3;

/**
 * Maximum knee flexion, in radians, measured as deviation from a straight leg
 * (0 = fully extended, pi = folded flat against itself).
 *
 * 2.44 rad is 140 degrees. A deep human squat reaches roughly 135-150 degrees of
 * knee flexion, so 140 sits inside that band and is comfortably past what this
 * rig's 0.44 m hip drop needs. It constrains only the pathological solves.
 */
export const MAX_KNEE_FLEXION_RADIANS = 2.44;

/** The knee never hyperextends: a straight leg is the other end of the range. */
export const MIN_KNEE_FLEXION_RADIANS = 0;

/**
 * Knee flexion implied by a hip-to-ankle distance, by the law of cosines on the
 * two segment lengths. Returns 0 for a straight leg and grows as the foot comes
 * in toward the hip.
 */
export function kneeFlexionRadians(distance: number, upperLength: number, lowerLength: number): number {
  if (!(upperLength > 0) || !(lowerLength > 0) || !Number.isFinite(distance)) return 0;
  const cosInterior = (upperLength * upperLength + lowerLength * lowerLength - distance * distance)
    / (2 * upperLength * lowerLength);
  const interior = Math.acos(Math.min(1, Math.max(-1, cosInterior)));
  return Math.PI - interior;
}

/**
 * The closest a foot target may sit to its hip before the knee would fold past
 * `maxFlexion`. This is the inverse of `kneeFlexionRadians`.
 */
export function minimumFootDistanceM(
  upperLength: number,
  lowerLength: number,
  maxFlexion = MAX_KNEE_FLEXION_RADIANS,
): number {
  if (!(upperLength > 0) || !(lowerLength > 0)) return 0;
  const interior = Math.PI - Math.min(Math.PI, Math.max(0, maxFlexion));
  const squared = upperLength * upperLength + lowerLength * lowerLength
    - 2 * upperLength * lowerLength * Math.cos(interior);
  return Math.sqrt(Math.max(0, squared));
}

/**
 * Clamps a hip-to-foot target distance into the range the knee can actually
 * reach: no closer than `minimumFootDistanceM`, and no further than the two
 * segments can span (which would silently straighten the leg and then drag the
 * hip after it).
 */
export function clampFootDistanceM(
  distance: number,
  upperLength: number,
  lowerLength: number,
  maxFlexion = MAX_KNEE_FLEXION_RADIANS,
): number {
  const minimum = minimumFootDistanceM(upperLength, lowerLength, maxFlexion);
  const maximum = Math.max(minimum, upperLength + lowerLength - 1e-4);
  if (!Number.isFinite(distance)) return maximum;
  return Math.min(maximum, Math.max(minimum, distance));
}

export type LateralPair = Readonly<{ left: number; right: number }>;

/**
 * Pushes a pair of foot targets apart along the body's lateral axis until they
 * are at least `minSeparation` apart, LEFT foot on the negative side.
 *
 * The mean is preserved, so a stride that is legitimately shifted to one side
 * stays shifted; only the crossing is removed. A fully swapped pair (right foot
 * left of the left foot, which is what a mid-cycle `Run_Left` hands over) is
 * un-swapped by the same arithmetic rather than special-cased, because the
 * correction is symmetric about the mean either way.
 *
 * Convention: +lateral is the body's own right.
 */
export function separateLegLateralTargets(
  leftLateral: number,
  rightLateral: number,
  minSeparation = MIN_LEG_LATERAL_SEPARATION_M,
): LateralPair {
  const left = Number.isFinite(leftLateral) ? leftLateral : -OPERATOR_LEG_LATERAL_OFFSET_M;
  const right = Number.isFinite(rightLateral) ? rightLateral : OPERATOR_LEG_LATERAL_OFFSET_M;
  if (right - left >= minSeparation) return Object.freeze({ left, right });
  const centre = (left + right) / 2;
  const half = minSeparation / 2;
  return Object.freeze({ left: centre - half, right: centre + half });
}

/**
 * The prone weight at which the world-space foot plant hands over to the
 * bind-pose settle.
 *
 * The plant's targets go stale in proportion to how far the pelvis has rotated,
 * and the pelvis rotation is proportional to the prone blend: at 0.08 of the way
 * into a prone transition the body has turned about 6.5 of its 81 degrees, which
 * is below the 0.12 m crossing threshold's worth of drag. Past it the plant is
 * withdrawn entirely. `legSettleWeight` reaches full strength at exactly this
 * number, so the two corrections hand over rather than leaving a gap or a step.
 */
export const PLANT_HANDOVER_PRONE_WEIGHT = 0.08;

/**
 * How much authority the crouch foot plant has this frame.
 *
 * Zero once the prone blend passes the handover weight. The plant solves against
 * world positions snapshotted before the pelvis pivot rotates; through a
 * crouch<->prone transition those targets end up as much as 81 degrees stale,
 * and dragging the ankles onto them is mechanism 3 above. A crouch that is not
 * becoming prone is unaffected, which is every crouch in the game today.
 */
export function crouchPlantAuthority(crouchBlend: number, proneBlend: number): number {
  const crouch = Number.isFinite(crouchBlend) ? Math.min(1, Math.max(0, crouchBlend)) : 0;
  const prone = Number.isFinite(proneBlend) ? Math.min(1, Math.max(0, proneBlend)) : 0;
  if (prone >= PLANT_HANDOVER_PRONE_WEIGHT) return 0;
  return crouch > 0.001 ? crouch : 0;
}

/**
 * WORST crossing the standing clip corpus is assumed to produce at the ankles,
 * in metres of lateral separation. Negative means crossed.
 *
 * -0.06 m is the value the settle weight below is derived against: a mid-cycle
 * lateral run whose swing ankle has passed 0.06 m beyond the planted one. It is
 * an assumption about the corpus, stated here so the derivation can be checked
 * and re-derived if a clip is ever added that crosses harder.
 */
export const WORST_CLIP_ANKLE_SEPARATION_M = -0.06;

/**
 * The MINIMUM settle-toward-bind weight that clears the crossing threshold, for
 * a given worst-case clip separation. This is the algebra the shipped weight has
 * to beat.
 *
 * The bind pose's legs are straight and parallel at the rig's own 0.36 m hip
 * width, so blending toward it cannot itself cross anything. Blending a clip
 * separation `s` toward bind separation `B` by weight `w` gives
 * `(1 - w) * s + w * B`, and requiring that to clear the threshold `T` gives
 * `w >= (T - s) / (B - s)`. With T = 0.12, B = 0.36, s = -0.06 that is
 * `w >= 0.4286`.
 */
export function proneLegSettleFloor(
  worstClipSeparationM = WORST_CLIP_ANKLE_SEPARATION_M,
  threshold = MIN_LEG_LATERAL_SEPARATION_M,
  bindSeparation = OPERATOR_BIND_LEG_SEPARATION_M,
): number {
  const span = bindSeparation - worstClipSeparationM;
  if (!(span > 0)) return 1;
  return Math.min(1, Math.max(0, (threshold - worstClipSeparationM) / span));
}

/**
 * The shipped weight. Above `proneLegSettleFloor()` by a real margin because the
 * blend is a quaternion slerp on the hip and knee rather than a lateral lerp on
 * the ankles, so the separation it buys is not linear in `w`; the margin is the
 * price of that non-linearity.
 *
 * It is deliberately NOT 1. A fully-settled prone body has no crawl at all, and
 * the remaining quarter of the clip is the drag the crawl reads by.
 */
export const PRONE_LEG_SETTLE_WEIGHT = 0.75;

/**
 * The stance weight at which a pose becomes subject to the no-crossing rule.
 *
 * Below it the operator is substantially STANDING, and a standing lateral run
 * whose ankles cross the midline is the authored clip doing its job — asserting
 * against it would be asserting against the corpus. At and above it the body is
 * folded or laid down, which is where a cross reads as the tangle in the report.
 * The settle ramp below is built to reach full strength exactly here, so the
 * asserted domain and the correction that serves it share one number.
 */
export const STANCE_POSE_VALIDITY_WEIGHT = 0.25;

/** Strictly increasing on [0,1], zero-derivative at both ends. */
function smoothstep01(value: number): number {
  const t = value < 0 ? 0 : value > 1 ? 1 : value;
  return t * t * (3 - 2 * t);
}

/**
 * How far the legs settle toward their BIND pose this frame — the fix for
 * mechanisms 3 and 4.
 *
 * It ramps on the PRONE blend alone and reaches `PRONE_LEG_SETTLE_WEIGHT` at
 * `PLANT_HANDOVER_PRONE_WEIGHT`, which is the exact weight `crouchPlantAuthority`
 * withdraws the plant at. Below the handover the two overlap — the plant is
 * still separating the targets and the settle is already pulling toward bind
 * underneath it — so the correction is continuous across the switch instead of
 * stepping. Smoothstepped, so a stance change does not pop the legs on the frame
 * the transition starts.
 *
 * `crouchBlend` is accepted and deliberately unused: it is what the caller has
 * in hand, and taking it keeps the two functions' signatures identical so a
 * future rule that does need both cannot be wired up half-way.
 */
export function legSettleWeight(_crouchBlend: number, proneBlend: number): number {
  const prone = Number.isFinite(proneBlend) ? Math.min(1, Math.max(0, proneBlend)) : 0;
  if (prone <= 0.001) return 0;
  return PRONE_LEG_SETTLE_WEIGHT * smoothstep01(prone / PLANT_HANDOVER_PRONE_WEIGHT);
}

export type LegPoseSample = Readonly<{
  /** Lateral coordinate of each knee in body space, +right. */
  kneeLeftLateralM: number;
  kneeRightLateralM: number;
  /** Lateral coordinate of each ankle in body space, +right. */
  ankleLeftLateralM: number;
  ankleRightLateralM: number;
  /** Knee flexion in radians, 0 = straight. */
  kneeLeftFlexionRadians: number;
  kneeRightFlexionRadians: number;
}>;

export type LegPoseVerdict = Readonly<{
  kneeSeparationM: number;
  ankleSeparationM: number;
  minimumSeparationM: number;
  crossing: boolean;
  jointLimitsRespected: boolean;
  valid: boolean;
}>;

function withinKneeLimit(flexion: number): boolean {
  return Number.isFinite(flexion)
    && flexion >= MIN_KNEE_FLEXION_RADIANS - 1e-6
    && flexion <= MAX_KNEE_FLEXION_RADIANS + 1e-6;
}

/**
 * The verdict a sampled pose gets. `crossing` is the owner's complaint expressed
 * as a number: lateral separation has fallen through the derived threshold, at
 * the knees or at the ankles.
 */
export function judgeLegPose(
  sample: LegPoseSample,
  threshold = MIN_LEG_LATERAL_SEPARATION_M,
): LegPoseVerdict {
  const kneeSeparationM = sample.kneeRightLateralM - sample.kneeLeftLateralM;
  const ankleSeparationM = sample.ankleRightLateralM - sample.ankleLeftLateralM;
  const minimumSeparationM = Math.min(kneeSeparationM, ankleSeparationM);
  const crossing = !(minimumSeparationM >= threshold);
  const jointLimitsRespected = withinKneeLimit(sample.kneeLeftFlexionRadians)
    && withinKneeLimit(sample.kneeRightFlexionRadians);
  return Object.freeze({
    kneeSeparationM,
    ankleSeparationM,
    minimumSeparationM,
    crossing,
    jointLimitsRespected,
    valid: !crossing && jointLimitsRespected,
  });
}
