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

/**
 * Fail-closed order receipt check. `configureHdrPipeline` records the stages
 * it builds and must call this before publishing the pipeline; a mismatch is
 * a construction error, never a silent re-order.
 */
export function assertGradeChainOrder(actualStages: readonly string[]): void {
  if (actualStages.length !== GRADE_CHAIN_STAGES.length) {
    throw new Error(
      `HF-362 filmic chain stage count mismatch: expected ${GRADE_CHAIN_STAGES.length}, built ${actualStages.length} (${actualStages.join(' -> ')})`,
    );
  }
  for (let index = 0; index < GRADE_CHAIN_STAGES.length; index += 1) {
    if (actualStages[index] !== GRADE_CHAIN_STAGES[index]) {
      throw new Error(
        `HF-362 filmic chain order violation at stage ${index}: expected '${GRADE_CHAIN_STAGES[index]}', built '${actualStages[index]}' (${actualStages.join(' -> ')})`,
      );
    }
  }
}
