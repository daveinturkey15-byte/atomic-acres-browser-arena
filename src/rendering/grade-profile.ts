/**
 * HF-362 — filmic grade profile catalog (single source of grading truth).
 *
 * Every tunable of the Pass 74 filmic grading chain lives here as typed,
 * deeply frozen data so the Performance/Quality/Max graphics presets can
 * differ without touching pipeline code. The chain ORDER itself is part of
 * this contract: see GRADE_CHAIN_STAGES. `configureHdrPipeline` in
 * pass64-tsl-scene.ts must build exactly these stages in this order and
 * verifies that at construction time (fail-closed).
 *
 * Combat-safety envelope (competitive FPS, verified by grade-profile.test.ts):
 * - Shadow toe never lifts blacks above ~5% display luminance and never
 *   crushes below the authored floor, so enemies hiding in shade keep
 *   separation from true black.
 * - Midtone contrast is a bounded, low-pivot EXPANDING curve (<= 0.3) with a
 *   Gaussian falloff, so extreme shadows/highlights are left alone.
 * - Split-toning strengths are small fractions of mid-grey tints; they hue,
 *   they do not blind.
 * - Bloom thresholds stay > 1.0 (true HDR emitters only), so no glow washes
 *   out sightlines; grain stays <= ~1/3 of one 8-bit step in linear terms.
 */

export type GradeProfileId = 'performance' | 'quality' | 'max';

/**
 * The one authoritative processing order. Indices matter and are asserted:
 * linear-HDR operations happen strictly before the tone map, display-side
 * shaping strictly after it, and per-frame grain is always last.
 */
export const GRADE_CHAIN_STAGES: readonly string[] = Object.freeze([
  // --- linear HDR side (before any output transform) ---
  'scene-pass-linear-hdr',
  'contact-occlusion-multiply',
  'depth-guarded-bloom-add',
  'asc-cdl-slope-offset-power',
  'subtle-channel-crosstalk',
  'highlight-transfer-shoulder',
  // --- display boundary: ACES tone map + linear->sRGB, applied explicitly ---
  'tone-map-aces-plus-srgb-output',
  // --- display-referred shaping ---
  'display-toe-lift',
  'display-midtone-contrast',
  'display-split-tone',
  'display-vignette-falloff',
  'per-frame-luminance-grain',
]);

/**
 * The linear-HDR half, written out with the OPTIONAL screen-space stages the
 * scene-pass assembler may insert. The three mandatory entries above still
 * appear here in exactly the same relative order; the optional ones only
 * declare the one slot each is allowed to occupy.
 *
 * WHY THESE SLOTS: every optional stage is placed where its input is already
 * correct and where it cannot invalidate a later stage.
 * - Motion blur smears the raw scene colour, so it runs before anything reads
 *   neighbouring pixels for a different purpose.
 * - Screen-space GI adds bounce light before the contact-occlusion multiply,
 *   so GTAO darkens the bounced light exactly as it darkens direct light.
 * - Screen-space reflections are added after occlusion (a reflection is not
 *   occluded by the surface reflecting it) but before bloom, so a wet highlight
 *   can bloom like any other bright pixel.
 * - Godrays composite after bloom deliberately: shafts are already a glow, and
 *   feeding them back through the bloom chain is exactly how a light shaft
 *   turns into a sightline-erasing wash.
 * - Depth of field is last on the linear side because it must see the finished
 *   lighting; blurring before the additive stages would leak sharp light into
 *   the bokeh.
 */
export const LINEAR_SOURCE_STAGE_ORDER: readonly string[] = Object.freeze([
  'scene-pass-linear-hdr',
  'motion-blur-velocity-smear',
  // HF-418 - baked indirect light. It sits with SSGI, immediately BEFORE the
  // contact-occlusion multiply, for the reason the comment above gives for
  // SSGI: bounced light must be darkened by ambient occlusion exactly as
  // direct light is, or a corner that GTAO darkens fills straight back in.
  // Before SSGI rather than after because it is the lower-frequency term and
  // the two are additive, so the order between them is a convention, not a
  // result - it is fixed here so the receipt is stable.
  'baked-indirect-probe-add',
  'ssgi-screen-space-bounce-add',
  'contact-occlusion-multiply',
  'ssr-screen-space-reflection-add',
  // HF-398 — classic recursive ray tracing. It sits immediately after the
  // screen-space reflection add and for exactly the same reason: reflected
  // light is not occluded by the surface reflecting it, and it must still be
  // able to bloom. The two are independent and may run together or alone; the
  // ray-traced layer additionally reaches geometry that is off screen, which is
  // the difference between intersecting real geometry and marching a depth
  // buffer. Nothing here is hardware ray tracing — no browser exposes one.
  'raytraced-reflection-refraction-add',
  'depth-guarded-bloom-add',
  'godrays-volumetric-shaft-add',
  'depth-of-field-bokeh',
]);

/** The linear-side stages the assembler may omit. Everything else is mandatory. */
export const OPTIONAL_LINEAR_SOURCE_STAGES: readonly string[] = Object.freeze([
  'motion-blur-velocity-smear',
  'baked-indirect-probe-add',
  'ssgi-screen-space-bounce-add',
  'ssr-screen-space-reflection-add',
  'raytraced-reflection-refraction-add',
  'godrays-volumetric-shaft-add',
  'depth-of-field-bokeh',
]);

/** First stage of the immutable core; everything before it is the linear region. */
const LINEAR_REGION_BOUNDARY = 'asc-cdl-slope-offset-power';

const MANDATORY_LINEAR_SOURCE_STAGES: readonly string[] = Object.freeze(
  LINEAR_SOURCE_STAGE_ORDER.filter((stage) => !OPTIONAL_LINEAR_SOURCE_STAGES.includes(stage)),
);

/** The part of the frozen chain that is never optional and never re-ordered. */
const CORE_CHAIN_STAGES: readonly string[] = Object.freeze(
  GRADE_CHAIN_STAGES.slice(GRADE_CHAIN_STAGES.indexOf(LINEAR_REGION_BOUNDARY)),
);

/**
 * Optional display-side stages that may follow the frozen core chain, in the
 * one allowed relative order: at most one post anti-aliasing stage, then
 * exactly one contrast-adaptive sharpen owner. Both operate on the finished
 * display-referred image; grain stays inside the core because its amplitude
 * (<= 1/3 of one 8-bit step) sits far below the FXAA/SMAA edge thresholds and
 * the RCAS denoise attenuation, so appending after it cannot amplify it
 * visibly.
 *
 * FSR 1 is listed alongside the standalone sharpen because it *contains* RCAS:
 * its EASU upsample is followed by the same sharpening filter. Running both
 * would sharpen twice, so they are mutually exclusive below.
 */
export const OPTIONAL_POST_DISPLAY_STAGES: readonly string[] = Object.freeze([
  'display-post-antialiasing-fxaa',
  'display-post-antialiasing-smaa',
  'display-cas-sharpen',
  'display-fsr1-easu-rcas-upscale',
]);

const OPTIONAL_ANTIALIASING_STAGES: readonly string[] = Object.freeze([
  'display-post-antialiasing-fxaa',
  'display-post-antialiasing-smaa',
]);

/** Both of these own an RCAS pass. Exactly one of them may be built. */
const OPTIONAL_SHARPEN_STAGES: readonly string[] = Object.freeze([
  'display-cas-sharpen',
  'display-fsr1-easu-rcas-upscale',
]);

export type FrozenFilmicGradeProfile = Readonly<{
  id: GradeProfileId;
  /** Stage 4 — ASC CDL in linear HDR. Slope/offset/power per channel. */
  cdl: Readonly<{
    slope: readonly [number, number, number];
    offset: readonly [number, number, number];
    power: readonly [number, number, number];
  }>;
  /** Stage 5 — fraction of neighbour-channel average mixed in (hue bleed). */
  channelCrosstalkStrength: number;
  /**
   * Stage 6 — highlight transfer shaping on the linear side: desaturate then
   * gently compress the region between shoulderStart and shoulderEnd so ACES
   * receives pre-conditioned highlights instead of raw clipped colour.
   */
  transfer: Readonly<{
    shoulderStart: number;
    shoulderEnd: number;
    shoulderPower: number;
    shoulderDesaturation: number;
  }>;
  /** Stage 2 — measured bloom. Threshold is in linear HDR (> 1 only). */
  bloom: Readonly<{
    threshold: number;
    radiusTexelScale: number;
    intensityScale: number;
  }>;
  /** Stages 8-10 — display-referred shaping. Tints are 0xRRGGBB sRGB. */
  display: Readonly<{
    toeCeiling: number;
    toeFloor: number;
    toeStrength: number;
    midtonePivot: number;
    midtoneWidth: number;
    midtoneContrast: number;
    shadowTint: number;
    highlightTint: number;
    splitToneStrength: number;
    shadowBalance: number;
    highlightBalance: number;
  }>;
  /** Stage 12 — per-frame luminance grain, scaled over the authored 8-bit strength. */
  grain: Readonly<{
    amplitudeScale: number;
    animationHz: number;
    pixelJitterSeed: number;
  }>;
}>;

const PERFORMANCE_PROFILE: FrozenFilmicGradeProfile = Object.freeze({
  id: 'performance',
  // Neutral, brightest-safe: no offset (black point untouched), faint cool
  // gain on blue so the shared palette reads without any contrast risk.
  cdl: Object.freeze({
    slope: Object.freeze([1.0, 1.0, 1.02] as const),
    offset: Object.freeze([0.0, 0.0, 0.0] as const),
    power: Object.freeze([1.0, 1.0, 1.0] as const),
  }),
  channelCrosstalkStrength: 0.04,
  transfer: Object.freeze({
    shoulderStart: 0.95,
    shoulderEnd: 6.0,
    shoulderPower: 1.06,
    shoulderDesaturation: 0.05,
  }),
  bloom: Object.freeze({
    threshold: 1.15,
    radiusTexelScale: 0.24,
    intensityScale: 0.85,
  }),
  display: Object.freeze({
    toeCeiling: 0.3,
    toeFloor: 0.035,
    toeStrength: 0.1,
    midtonePivot: 0.42,
    midtoneWidth: 0.16,
    midtoneContrast: 0.16,
    shadowTint: 0x274356,
    highlightTint: 0xffd5a2,
    splitToneStrength: 0.35,
    shadowBalance: 0.5,
    highlightBalance: 0.55,
  }),
  grain: Object.freeze({
    amplitudeScale: 0.8,
    animationHz: 24,
    pixelJitterSeed: 9_117,
  }),
});

const QUALITY_PROFILE: FrozenFilmicGradeProfile = Object.freeze({
  id: 'quality',
  // Gentle teal-shadow / warm-highlight bias purely through slope/power;
  // offsets stay <= 0.003 so the black point barely moves.
  cdl: Object.freeze({
    slope: Object.freeze([1.015, 1.0, 0.98] as const),
    offset: Object.freeze([-0.0005, 0.0, 0.003] as const),
    power: Object.freeze([0.995, 1.0, 1.01] as const),
  }),
  channelCrosstalkStrength: 0.06,
  transfer: Object.freeze({
    shoulderStart: 0.9,
    shoulderEnd: 6.0,
    shoulderPower: 1.08,
    shoulderDesaturation: 0.07,
  }),
  bloom: Object.freeze({
    threshold: 1.1,
    radiusTexelScale: 0.32,
    intensityScale: 1.0,
  }),
  display: Object.freeze({
    toeCeiling: 0.3,
    toeFloor: 0.035,
    toeStrength: 0.14,
    midtonePivot: 0.42,
    midtoneWidth: 0.16,
    midtoneContrast: 0.2,
    shadowTint: 0x274356,
    highlightTint: 0xffd5a2,
    splitToneStrength: 0.45,
    shadowBalance: 0.48,
    highlightBalance: 0.56,
  }),
  grain: Object.freeze({
    amplitudeScale: 1.0,
    animationHz: 24,
    pixelJitterSeed: 9_117,
  }),
});

const MAX_PROFILE: FrozenFilmicGradeProfile = Object.freeze({
  id: 'max',
  // Strongest character while keeping every combat-safety bound: offsets
  // still >= -0.001, midtone contrast still <= 0.3, bloom still > 1.0.
  cdl: Object.freeze({
    slope: Object.freeze([1.02, 1.0, 0.975] as const),
    offset: Object.freeze([-0.001, 0.0005, 0.004] as const),
    power: Object.freeze([0.99, 1.0, 1.015] as const),
  }),
  channelCrosstalkStrength: 0.09,
  transfer: Object.freeze({
    shoulderStart: 0.85,
    shoulderEnd: 6.0,
    shoulderPower: 1.1,
    shoulderDesaturation: 0.09,
  }),
  bloom: Object.freeze({
    threshold: 1.08,
    radiusTexelScale: 0.4,
    intensityScale: 1.15,
  }),
  display: Object.freeze({
    toeCeiling: 0.3,
    toeFloor: 0.035,
    toeStrength: 0.18,
    midtonePivot: 0.42,
    midtoneWidth: 0.16,
    midtoneContrast: 0.24,
    shadowTint: 0x274356,
    highlightTint: 0xffd5a2,
    splitToneStrength: 0.55,
    shadowBalance: 0.45,
    highlightBalance: 0.58,
  }),
  grain: Object.freeze({
    amplitudeScale: 1.2,
    animationHz: 24,
    pixelJitterSeed: 9_117,
  }),
});

/** Deeply frozen catalog — mutate nothing at runtime. */
export const GRADE_PROFILES: Readonly<Record<GradeProfileId, FrozenFilmicGradeProfile>> =
  Object.freeze({
    performance: PERFORMANCE_PROFILE,
    quality: QUALITY_PROFILE,
    max: MAX_PROFILE,
  });

export const DEFAULT_GRADE_PROFILE_ID: GradeProfileId = 'quality';

/** Fail-closed lookup: an unknown profile id is a construction error. */
export function resolveGradeProfile(
  profileId: GradeProfileId | undefined = DEFAULT_GRADE_PROFILE_ID,
): FrozenFilmicGradeProfile {
  if (profileId === undefined) return GRADE_PROFILES[DEFAULT_GRADE_PROFILE_ID];
  const profile = GRADE_PROFILES[profileId];
  if (!profile) {
    throw new Error(`HF-362 unknown filmic grade profile: ${String(profileId)}`);
  }
  return profile;
}

/** Rejects a stage list that repeats an entry or wanders out of a fixed order. */
function assertOrderedSubsequence(
  region: string,
  built: readonly string[],
  allowed: readonly string[],
  actualStages: readonly string[],
): void {
  let cursor = 0;
  for (const stage of built) {
    const allowedIndex = allowed.indexOf(stage, cursor);
    if (allowedIndex === -1) {
      throw new Error(
        `HF-362 filmic chain ${region} stage violation: '${stage}' is not allowed here, or repeats/precedes an already-built stage (${actualStages.join(' -> ')})`,
      );
    }
    cursor = allowedIndex + 1;
  }
}

/**
 * Fail-closed order receipt check. `configureHdrPipeline` records the stages
 * it builds and must call this before publishing the pipeline; a mismatch is
 * a construction error, never a silent re-order.
 *
 * Three regions, checked separately because they have different contracts:
 * 1. the linear region, where the mandatory stages keep their fixed relative
 *    order and the enumerated optional screen-space stages may appear only in
 *    their declared slots;
 * 2. the core, from the ASC CDL to the grain, which is byte-for-byte frozen;
 * 3. the trailing display stages, an ordered subsequence with at most one post
 *    AA owner and at most one RCAS owner.
 */
export function assertGradeChainOrder(actualStages: readonly string[]): void {
  const boundary = actualStages.indexOf(LINEAR_REGION_BOUNDARY);
  if (boundary === -1) {
    throw new Error(
      `HF-362 filmic chain is missing its linear/display boundary stage '${LINEAR_REGION_BOUNDARY}' (${actualStages.join(' -> ') || '(none)'})`,
    );
  }
  const linear = actualStages.slice(0, boundary);
  assertOrderedSubsequence('linear', linear, LINEAR_SOURCE_STAGE_ORDER, actualStages);
  for (const required of MANDATORY_LINEAR_SOURCE_STAGES) {
    if (!linear.includes(required)) {
      throw new Error(
        `HF-362 filmic chain is missing mandatory linear stage '${required}' (${actualStages.join(' -> ')})`,
      );
    }
  }
  const core = actualStages.slice(boundary, boundary + CORE_CHAIN_STAGES.length);
  for (let index = 0; index < CORE_CHAIN_STAGES.length; index += 1) {
    if (core[index] !== CORE_CHAIN_STAGES[index]) {
      throw new Error(
        `HF-362 filmic chain order violation at core stage ${index}: expected '${CORE_CHAIN_STAGES[index]}', built '${core[index] ?? '(none)'}' (${actualStages.join(' -> ')})`,
      );
    }
  }
  const trailing = actualStages.slice(boundary + CORE_CHAIN_STAGES.length);
  assertOrderedSubsequence('trailing', trailing, OPTIONAL_POST_DISPLAY_STAGES, actualStages);
  if (trailing.filter((stage) => OPTIONAL_ANTIALIASING_STAGES.includes(stage)).length > 1) {
    throw new Error(
      `HF-362 filmic chain trailing stage violation: at most one post anti-aliasing stage is allowed (${actualStages.join(' -> ')})`,
    );
  }
  // FSR 1 ends in RCAS. Letting the standalone sharpen run as well would apply
  // the same filter twice on the same image, which is a ringing/shimmer source
  // on exactly the high-contrast edges a player is trying to read.
  if (trailing.filter((stage) => OPTIONAL_SHARPEN_STAGES.includes(stage)).length > 1) {
    throw new Error(
      `HF-362 filmic chain trailing stage violation: at most one RCAS sharpen owner is allowed (${actualStages.join(' -> ')})`,
    );
  }
}
