/**
 * HF-362 — the production filmic grade chain.
 *
 * `grade-profile.ts` owns the *data* (frozen ASC CDL / transfer / display /
 * bloom / grain tunables plus the authoritative `GRADE_CHAIN_STAGES` order).
 * This module owns the *graph*: it turns that data into typed TSL nodes and
 * installs them on the live `RenderPipeline`, so the profile actually reaches
 * the screen instead of sitting in an unimported catalog.
 *
 * ORDER IS THE CONTRACT (see GRADE_CHAIN_STAGES):
 *   linear HDR:  scene pass -> contact occlusion -> depth-guarded bloom
 *                -> ASC CDL -> channel crosstalk -> highlight transfer
 *   display xf:  ACES tone map + linear->sRGB, applied EXPLICITLY here
 *   display:     toe lift -> midtone contrast -> split tone -> vignette
 *                -> per-frame luminance grain
 *
 * The first three stages are produced upstream by the scene-pass assembler and
 * arrive as one linear-HDR node; every stage after them is built here. The
 * receipt is checked with `assertGradeChainOrder` at construction time, so a
 * re-order is a fail-closed construction error rather than a silent look
 * change.
 *
 * WHY THE TONE MAP IS EXPLICIT: `RenderPipeline.outputColorTransform` defaults
 * to `true`, which appends `renderOutput(...)` AFTER whatever `outputNode`
 * holds. That makes it structurally impossible to run a display-referred
 * operation, because everything the app can express lands on the linear side.
 * Installing this chain flips that flag to `false` and calls `renderOutput()`
 * at stage 7, which is the only way display-referred toe / midtone contrast /
 * split tone / grain can exist at all.
 *
 * COMBAT SAFETY (competitive FPS — verified in filmic-grade-chain.test.ts):
 * - The toe is a pure LIFT: it adds a shadow-only offset and can never reduce
 *   a pixel, so nothing hiding in shade gets darker than it renders today.
 * - The midtone curve is provably strictly monotonic with local slope bounded
 *   to [1 - 0.4463k, 1 + k] (k <= 0.3), so shadow separation is never crushed;
 *   worst case it is compressed ~11%, best case expanded 24%.
 * - Split toning is exactly luminance preserving: it is renormalized back to
 *   the incoming Rec.709 luma, so it can only move hue, never visibility.
 * - Grain is achromatic and hard-clamped to <= 1/3 of one 8-bit step, and is
 *   applied display-referred so it is uniform across the tonal range. The linear-
 *   side ordered dither that piled into shadows was removed in HF-363.
 * - Bloom thresholds come from the profile and are asserted > 1.0, so only
 *   true HDR emitters glow and no bright wall washes out a sightline.
 */

import * as THREE from 'three';
import type { Node } from 'three/webgpu';
import {
  dot,
  exp,
  float,
  fract,
  max,
  min,
  mix,
  nodeObject,
  pow,
  renderOutput,
  screenSize,
  screenUV,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { sharpen } from 'three/addons/tsl/display/SharpenNode.js';
import { rtt } from 'three/tsl';
import { fsr1 } from 'three/addons/tsl/display/FSR1Node.js';
import {
  assertGradeChainOrder,
  DEFAULT_GRADE_PROFILE_ID,
  GRADE_CHAIN_STAGES,
  resolveGradeProfile,
  type FrozenFilmicGradeProfile,
  type GradeProfileId,
} from './grade-profile';
import {
  composeArtDirectedProfile,
  composeArtDirectedVignette,
  type ArenaArtDirection,
} from './art-direction';

/**
 * Stages produced by the scene-pass assembler before this chain takes over.
 * They arrive as the single linear-HDR node handed to `buildFilmicGradeChain`.
 */
export const LINEAR_SOURCE_STAGES: readonly string[] = Object.freeze([
  'scene-pass-linear-hdr',
  'contact-occlusion-multiply',
  'depth-guarded-bloom-add',
]);

/** Stages this module builds, in the order it builds them. */
export const FILMIC_GRADE_CHAIN_STAGES: readonly string[] = Object.freeze([
  'asc-cdl-slope-offset-power',
  'subtle-channel-crosstalk',
  'highlight-transfer-shoulder',
  'tone-map-aces-plus-srgb-output',
  'display-toe-lift',
  'display-midtone-contrast',
  'display-split-tone',
  'display-vignette-falloff',
  'per-frame-luminance-grain',
]);

/**
 * Display-side post anti-aliasing. FXAA and SMAA both expect the finished
 * display-referred (tone-mapped, sRGB-encoded) image, which is exactly what
 * the chain's final stage emits — so they are appended AFTER the frozen core
 * chain as optional trailing stages, followed only by the RCAS sharpen
 * (AMD's canonical order: reconstruct edges first, sharpen last).
 */
export type PostAntiAliasingMode = 'off' | 'fxaa' | 'smaa';

/**
 * HF-364 — spatial upscaling owner. FSR 1 is AMD's published EASU (edge
 * adaptive upsample) plus RCAS (contrast-adaptive sharpen) pair; it is spatial
 * and shader-only, so it is neither DLSS nor frame generation and is never
 * described as either.
 *
 * `sceneResolutionScale` is the fraction of the drawing buffer the whole graded
 * image is rendered at before EASU reconstructs it. Zero or one means off; the
 * scene-pass assembler renders at the same fraction, which is where the frame
 * time is actually saved.
 */
export type SpatialUpscalingRequest = Readonly<{ enabled: boolean; sceneResolutionScale: number }>;

export const SPATIAL_UPSCALING_OFF: SpatialUpscalingRequest = Object.freeze({
  enabled: false,
  sceneResolutionScale: 1,
});

/**
 * Maps the player's 0..1 sharpness onto the RCAS parameter, whose convention
 * is inverted and stop-based: 0 = maximum sharpening, 2 = none. Zero UI
 * sharpness bypasses the stage entirely rather than building an idle pass.
 */
export function rcasSharpnessFor(uiSharpness: number): number {
  const bounded = Number.isFinite(uiSharpness) ? Math.min(1, Math.max(0, uiSharpness)) : 0;
  return (1 - bounded) * 2;
}

/** Rec.709 luma weights. They sum to 1, which several invariants rely on. */
export const REC709_LUMA: readonly [number, number, number] = Object.freeze([0.2126, 0.7152, 0.0722]);

/**
 * Hard ceiling on split-tone weight. `splitToneStrength` (<= 0.55) is a
 * fraction of this, so the strongest profile hues by ~10% of the way toward a
 * mean-normalised tint direction — and even that is luma-renormalised away.
 */
export const SPLIT_TONE_MAXIMUM_WEIGHT = 0.18;

/**
 * Hard ceiling on grain amplitude, expressed in 8-bit display steps. One third
 * of a step is the documented combat-safety bound; the clamp is not advisory.
 */
export const GRAIN_MAXIMUM_8BIT_STEPS = 1 / 3;

/** Arena-authored grain strength in 8-bit steps (see arenas/shared.ts). */
export const DEFAULT_AUTHORED_GRAIN_8BIT = 0.72;

/** Vignette falloff shaping, matched to the legacy linear-side vignette. */
const VIGNETTE_INNER = 0.12;
const VIGNETTE_OUTER = 0.5;
const VIGNETTE_GAIN = 0.42;

/**
 * Converts an 0xRRGGBB sRGB tint to a mean-normalised direction vector, i.e.
 * a pure hue with neutral average gain. Multiplying by `mix(1, direction, w)`
 * therefore tints without a systematic brightness change even before the
 * luma renormalisation that follows it.
 */
export function srgbTintDirection(hex: number): readonly [number, number, number] {
  const red = ((hex >> 16) & 0xff) / 255;
  const green = ((hex >> 8) & 0xff) / 255;
  const blue = (hex & 0xff) / 255;
  const mean = (red + green + blue) / 3;
  if (!(mean > 0)) return Object.freeze([1, 1, 1] as const);
  return Object.freeze([red / mean, green / mean, blue / mean] as const);
}

/**
 * Grain amplitude (half of the peak-to-peak swing) in display units, clamped
 * to the combat-safety ceiling. `strength8Bit` is the arena-authored strength
 * in 8-bit steps; `amplitudeScale` is the per-profile multiplier.
 */
export function grainAmplitudeFor(profile: FrozenFilmicGradeProfile, strength8Bit: number): number {
  const requested = Math.max(0, strength8Bit) * Math.max(0, profile.grain.amplitudeScale) / 2;
  return Math.min(requested, GRAIN_MAXIMUM_8BIT_STEPS) / 255;
}

/**
 * Quantised grain seed. The pattern advances at the profile's `animationHz`
 * rather than per presented frame: at 240 Hz a per-frame reseed reads as a
 * shimmering screen-door artifact, which is a target-acquisition hazard.
 */
export function grainSeedFor(profile: FrozenFilmicGradeProfile, timeMs: number): number {
  if (!Number.isFinite(timeMs)) return 0;
  const step = Math.floor((timeMs / 1_000) * profile.grain.animationHz);
  return (step * profile.grain.pixelJitterSeed) % 65_536;
}

/** Maps a graphics preset id onto a grade profile id. Fail-closed on unknowns. */
export function gradeProfileIdForGraphicsPreset(
  preset: 'performance' | 'high' | 'max' | 'custom' | 'raytraced' | string,
): GradeProfileId {
  if (preset === 'performance') return 'performance';
  if (preset === 'high') return 'quality';
  if (preset === 'max') return 'max';
  // HF-397 sits between Quality and Max in the preset ladder and carries the richest
  // (max) filmic grade; the grade adds tunable uniforms only, never new pipelines.
  //
  // The id is 'raytraced'. It was written here as 'rtx' by a lane that landed hours
  // before the preset itself, and GraphicsPreset never had an 'rtx' member - so this
  // branch was unreachable and RAY TRACED silently fell through to the DEFAULT grade,
  // rendering with QUALITY's look. The owner-facing LABEL is deliberately "RAY TRACED"
  // and not "RTX": no browser exposes a hardware ray-tracing pipeline or RT cores, so
  // "RTX" would be a claim the build cannot back.
  if (preset === 'raytraced') return 'max';
  return DEFAULT_GRADE_PROFILE_ID;
}

// ---------------------------------------------------------------------------
// CPU reference implementation.
//
// This is the authoritative description of the maths the TSL graph below
// mirrors stage for stage. It exists so the combat-safety envelope can be
// proven numerically in unit tests without a GPU, and so QA baselines can
// reproduce the grade off-line.
// ---------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

function lumaOf(rgb: Rgb): number {
  return rgb[0] * REC709_LUMA[0] + rgb[1] * REC709_LUMA[1] + rgb[2] * REC709_LUMA[2];
}

/** Stage 4 — ASC CDL: `(in * slope + offset) ^ power`, clamped at the floor. */
export function applyAscCdl(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  const { slope, offset, power } = profile.cdl;
  return Object.freeze([0, 1, 2].map((index) => {
    const base = Math.max(rgb[index] * slope[index] + offset[index], 0);
    return Math.pow(base, power[index]);
  }) as unknown as Rgb);
}

/**
 * Stage 5 — subtle channel crosstalk. Each channel is mixed toward the average
 * of its two neighbours. The neighbour-average vector has the same channel sum
 * as the input, so this is energy preserving: it bleeds hue, it does not dim.
 */
export function applyChannelCrosstalk(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  const strength = profile.channelCrosstalkStrength;
  const neighbour: Rgb = [
    (rgb[1] + rgb[2]) / 2,
    (rgb[0] + rgb[2]) / 2,
    (rgb[0] + rgb[1]) / 2,
  ];
  return Object.freeze([0, 1, 2].map(
    (index) => rgb[index] * (1 - strength) + neighbour[index] * strength,
  ) as unknown as Rgb);
}

/**
 * Stage 6 — highlight transfer shoulder, still in linear HDR. Desaturates and
 * gently compresses only the band between `shoulderStart` and `shoulderEnd`;
 * the map is identity below the start and a pure translation above the end, so
 * no combat-relevant shadow or midtone value is touched at all.
 */
export function applyHighlightTransfer(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  const { shoulderStart, shoulderEnd, shoulderPower, shoulderDesaturation } = profile.transfer;
  const luminance = lumaOf(rgb);
  const range = Math.max(shoulderEnd - shoulderStart, 1e-4);
  const blend = smoothstepScalar(shoulderStart, shoulderEnd, luminance);
  const desaturation = blend * shoulderDesaturation;
  const desaturated: Rgb = [
    rgb[0] * (1 - desaturation) + luminance * desaturation,
    rgb[1] * (1 - desaturation) + luminance * desaturation,
    rgb[2] * (1 - desaturation) + luminance * desaturation,
  ];
  const normalized = clampScalar((luminance - shoulderStart) / range, 0, 1);
  const overflow = Math.max(luminance - shoulderEnd, 0);
  const target = Math.min(luminance, shoulderStart) + range * Math.pow(normalized, shoulderPower) + overflow;
  const scale = target / Math.max(luminance, 1e-5);
  return Object.freeze([desaturated[0] * scale, desaturated[1] * scale, desaturated[2] * scale] as const);
}

/**
 * Stage 8 — display toe. Adds a shadow-weighted constant lift. Because it only
 * ever adds, the toe cannot crush anything; because the lift is bounded by
 * `toeFloor * toeStrength` (<= 0.0063 display) it cannot fog the image either.
 */
export function applyDisplayToe(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  const { toeCeiling, toeFloor, toeStrength } = profile.display;
  const mask = 1 - smoothstepScalar(0, toeCeiling, lumaOf(rgb));
  const lift = toeFloor * toeStrength * mask;
  return Object.freeze([rgb[0] + lift, rgb[1] + lift, rgb[2] + lift] as const);
}

/**
 * Stage 9 — midtone contrast. A Gaussian-windowed expansion around a low
 * pivot. Local slope is `1 + k*g*(1 - d^2/w^2)` with `d = luma - pivot`, whose
 * minimum over all d is `1 - 0.4463k`; for k <= 0.3 that stays above 0.86, so
 * the curve is strictly increasing and never destroys shadow separation.
 */
export function applyMidtoneContrast(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  const { midtonePivot, midtoneWidth, midtoneContrast } = profile.display;
  const width = Math.max(midtoneWidth, 1e-4);
  const delta = lumaOf(rgb) - midtonePivot;
  const gaussian = Math.exp(-(delta * delta) / (2 * width * width));
  const factor = 1 + midtoneContrast * gaussian;
  return Object.freeze([0, 1, 2].map(
    (index) => Math.max((rgb[index] - midtonePivot) * factor + midtonePivot, 0),
  ) as unknown as Rgb);
}

/**
 * Stage 10 — split tone. Tints shadows and highlights toward mean-normalised
 * hue directions, then renormalises back onto the incoming Rec.709 luma, so
 * the operation is exactly luminance preserving.
 */
export function applySplitTone(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  const display = profile.display;
  const shadowDirection = srgbTintDirection(display.shadowTint);
  const highlightDirection = srgbTintDirection(display.highlightTint);
  const luminance = lumaOf(rgb);
  const shadowMask = 1 - smoothstepScalar(0, display.shadowBalance, luminance);
  const highlightMask = smoothstepScalar(display.highlightBalance, 1, luminance);
  const shadowWeight = shadowMask * display.splitToneStrength * SPLIT_TONE_MAXIMUM_WEIGHT;
  const highlightWeight = highlightMask * display.splitToneStrength * SPLIT_TONE_MAXIMUM_WEIGHT;
  const tinted = [0, 1, 2].map((index) => rgb[index]
    * (1 + (shadowDirection[index] - 1) * shadowWeight)
    * (1 + (highlightDirection[index] - 1) * highlightWeight)) as unknown as Rgb;
  const scale = luminance / Math.max(lumaOf(tinted), 1e-5);
  return Object.freeze([tinted[0] * scale, tinted[1] * scale, tinted[2] * scale] as const);
}

/**
 * Every linear-side stage, in order, ending just before the tone map. Callers
 * that want the display-referred half apply the tone map of their choice and
 * then feed the result to `evaluateDisplayReferenceStages`.
 */
export function evaluateLinearReferenceStages(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  return applyHighlightTransfer(applyChannelCrosstalk(applyAscCdl(rgb, profile), profile), profile);
}

/** Every display-referred stage, in order, excluding vignette and grain. */
export function evaluateDisplayReferenceStages(rgb: Rgb, profile: FrozenFilmicGradeProfile): Rgb {
  return applySplitTone(applyMidtoneContrast(applyDisplayToe(rgb, profile), profile), profile);
}

function smoothstepScalar(edge0: number, edge1: number, value: number): number {
  const t = clampScalar((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampScalar(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

// ---------------------------------------------------------------------------
// TSL graph
// ---------------------------------------------------------------------------

export function createFilmicGradeUniforms() {
  return Object.freeze({
    cdlSlope: uniform(new THREE.Vector3(1, 1, 1)),
    cdlOffset: uniform(new THREE.Vector3(0, 0, 0)),
    cdlPower: uniform(new THREE.Vector3(1, 1, 1)),
    channelCrosstalk: uniform(0),
    shoulderStart: uniform(1),
    shoulderEnd: uniform(6),
    shoulderPower: uniform(1),
    shoulderDesaturation: uniform(0),
    toeCeiling: uniform(0.3),
    toeFloor: uniform(0),
    toeStrength: uniform(0),
    midtonePivot: uniform(0.42),
    midtoneWidth: uniform(0.16),
    midtoneContrast: uniform(0),
    shadowTintDirection: uniform(new THREE.Vector3(1, 1, 1)),
    highlightTintDirection: uniform(new THREE.Vector3(1, 1, 1)),
    splitToneStrength: uniform(0),
    shadowBalance: uniform(0.5),
    highlightBalance: uniform(0.5),
    vignetteStrength: uniform(0),
    grainAmplitude: uniform(0),
    grainSeed: uniform(0),
  });
}

/** Live uniform set backing one installed chain. */
export type FilmicGradeUniforms = ReturnType<typeof createFilmicGradeUniforms>;

/**
 * Pushes one frozen profile into the live uniforms. Every combat-safety bound
 * that can be enforced numerically is enforced here rather than trusted.
 */
export function applyGradeProfileToUniforms(
  uniforms: FilmicGradeUniforms,
  profile: FrozenFilmicGradeProfile,
  grainStrength8Bit = DEFAULT_AUTHORED_GRAIN_8BIT,
): void {
  uniforms.cdlSlope.value.set(profile.cdl.slope[0], profile.cdl.slope[1], profile.cdl.slope[2]);
  uniforms.cdlOffset.value.set(profile.cdl.offset[0], profile.cdl.offset[1], profile.cdl.offset[2]);
  uniforms.cdlPower.value.set(profile.cdl.power[0], profile.cdl.power[1], profile.cdl.power[2]);
  uniforms.channelCrosstalk.value = profile.channelCrosstalkStrength;
  uniforms.shoulderStart.value = profile.transfer.shoulderStart;
  uniforms.shoulderEnd.value = profile.transfer.shoulderEnd;
  uniforms.shoulderPower.value = profile.transfer.shoulderPower;
  uniforms.shoulderDesaturation.value = profile.transfer.shoulderDesaturation;
  uniforms.toeCeiling.value = profile.display.toeCeiling;
  uniforms.toeFloor.value = profile.display.toeFloor;
  uniforms.toeStrength.value = profile.display.toeStrength;
  uniforms.midtonePivot.value = profile.display.midtonePivot;
  uniforms.midtoneWidth.value = profile.display.midtoneWidth;
  uniforms.midtoneContrast.value = profile.display.midtoneContrast;
  const shadowDirection = srgbTintDirection(profile.display.shadowTint);
  const highlightDirection = srgbTintDirection(profile.display.highlightTint);
  uniforms.shadowTintDirection.value.set(shadowDirection[0], shadowDirection[1], shadowDirection[2]);
  uniforms.highlightTintDirection.value.set(highlightDirection[0], highlightDirection[1], highlightDirection[2]);
  uniforms.splitToneStrength.value = profile.display.splitToneStrength;
  uniforms.shadowBalance.value = profile.display.shadowBalance;
  uniforms.highlightBalance.value = profile.display.highlightBalance;
  uniforms.grainAmplitude.value = grainAmplitudeFor(profile, grainStrength8Bit);
}

export type FilmicGradeChainBuild = Readonly<{
  /** vec4, display-referred, ready to be the pipeline's `outputNode`. */
  outputNode: Node<'vec4'>;
  /** Full receipt: upstream linear stages plus every stage built here. */
  stages: readonly string[];
}>;

/**
 * Builds the ordered chain on top of one linear-HDR vec4 node.
 *
 * `linearHdrColor` must be the scene pass after contact occlusion and the
 * depth-guarded bloom add and before ANY output transform. The pipeline that
 * consumes the result must have `outputColorTransform === false`, because
 * stage 7 applies `renderOutput()` itself.
 */
export function buildFilmicGradeChain(
  linearHdrColor: Node<'vec4'>,
  uniforms: FilmicGradeUniforms,
  upstreamStages: readonly string[] = LINEAR_SOURCE_STAGES,
): FilmicGradeChainBuild {
  const source = nodeObject(linearHdrColor);
  const luma = vec3(REC709_LUMA[0], REC709_LUMA[1], REC709_LUMA[2]);
  const stages: string[] = [...upstreamStages];

  // --- stage 4: ASC CDL slope / offset / power, linear HDR -----------------
  const cdlBase = max(source.rgb.mul(uniforms.cdlSlope).add(uniforms.cdlOffset), float(0));
  const cdl = pow(cdlBase, uniforms.cdlPower);
  stages.push('asc-cdl-slope-offset-power');

  // --- stage 5: subtle channel crosstalk (energy preserving) ---------------
  const neighbourAverage = vec3(
    cdl.g.add(cdl.b),
    cdl.r.add(cdl.b),
    cdl.r.add(cdl.g),
  ).mul(0.5);
  const crossed = mix(cdl, neighbourAverage, uniforms.channelCrosstalk);
  stages.push('subtle-channel-crosstalk');

  // --- stage 6: highlight transfer shoulder, still linear ------------------
  const linearLuma = dot(crossed, luma);
  const shoulderBlend = smoothstep(uniforms.shoulderStart, uniforms.shoulderEnd, linearLuma);
  const desaturated = mix(crossed, vec3(linearLuma), shoulderBlend.mul(uniforms.shoulderDesaturation));
  const shoulderRange = max(uniforms.shoulderEnd.sub(uniforms.shoulderStart), float(1e-4));
  const shoulderNormalized = linearLuma.sub(uniforms.shoulderStart).div(shoulderRange).clamp(0, 1);
  const shoulderOverflow = max(linearLuma.sub(uniforms.shoulderEnd), float(0));
  const shoulderTarget = min(linearLuma, uniforms.shoulderStart)
    .add(shoulderRange.mul(pow(shoulderNormalized, uniforms.shoulderPower)))
    .add(shoulderOverflow);
  const transferred = desaturated.mul(shoulderTarget.div(max(linearLuma, float(1e-5))));
  stages.push('highlight-transfer-shoulder');

  // --- stage 7: THE DISPLAY BOUNDARY --------------------------------------
  // Tone mapping is LAST of the HDR operations, applied here explicitly.
  // `renderOutput` with null arguments reads the renderer's live tone-mapping
  // mode, exposure and output color space from the pipeline context, so the
  // ACES/AgX/Neutral setting and exposure slider keep working unchanged.
  const display = renderOutput(vec4(transferred, source.a));
  stages.push('tone-map-aces-plus-srgb-output');

  // --- stage 8: display toe lift (adds only, never subtracts) -------------
  const displayLuma = dot(display.rgb, luma);
  const toeMask = smoothstep(float(0), uniforms.toeCeiling, displayLuma).oneMinus();
  const toed = display.rgb.add(uniforms.toeFloor.mul(uniforms.toeStrength).mul(toeMask));
  stages.push('display-toe-lift');

  // --- stage 9: display midtone contrast (Gaussian window) ----------------
  const toedLuma = dot(toed, luma);
  const midtoneDelta = toedLuma.sub(uniforms.midtonePivot);
  const midtoneWidth = max(uniforms.midtoneWidth, float(1e-4));
  const gaussian = exp(midtoneDelta.mul(midtoneDelta).div(midtoneWidth.mul(midtoneWidth).mul(2)).negate());
  const contrastFactor = float(1).add(uniforms.midtoneContrast.mul(gaussian));
  const contrasted = max(
    toed.sub(uniforms.midtonePivot).mul(contrastFactor).add(uniforms.midtonePivot),
    float(0),
  );
  stages.push('display-midtone-contrast');

  // --- stage 10: display split tone (exactly luminance preserving) --------
  const splitLuma = dot(contrasted, luma);
  const shadowMask = smoothstep(float(0), uniforms.shadowBalance, splitLuma).oneMinus();
  const highlightMask = smoothstep(uniforms.highlightBalance, float(1), splitLuma);
  const shadowWeight = shadowMask.mul(uniforms.splitToneStrength).mul(SPLIT_TONE_MAXIMUM_WEIGHT);
  const highlightWeight = highlightMask.mul(uniforms.splitToneStrength).mul(SPLIT_TONE_MAXIMUM_WEIGHT);
  const tinted = contrasted
    .mul(mix(vec3(1, 1, 1), uniforms.shadowTintDirection, shadowWeight))
    .mul(mix(vec3(1, 1, 1), uniforms.highlightTintDirection, highlightWeight));
  const splitToned = tinted.mul(splitLuma.div(max(dot(tinted, luma), float(1e-5))));
  stages.push('display-split-tone');

  // --- stage 11: display vignette falloff ---------------------------------
  // THE one vignette owner. The legacy linear-side vignette in the scene-pass
  // assembler was retired (its stage held the setting while this one idled at
  // zero); stacking two vignettes would darken exactly the screen periphery
  // enemies enter from, so the graphics runtime now drives only this uniform
  // via setDisplayVignetteStrength.
  const vignetteOffset = screenUV.sub(0.5);
  const vignetteFalloff = smoothstep(float(VIGNETTE_INNER), float(VIGNETTE_OUTER), dot(vignetteOffset, vignetteOffset))
    .mul(uniforms.vignetteStrength)
    .mul(VIGNETTE_GAIN);
  const vignetted = splitToned.mul(float(1).sub(vignetteFalloff));
  stages.push('display-vignette-falloff');

  // --- stage 12: per-frame luminance grain (achromatic, clamped) ----------
  const grainCoordinate = screenUV.mul(screenSize).add(uniforms.grainSeed);
  const grainHash = fract(sin(dot(grainCoordinate, vec2(12.9898, 78.233))).mul(43758.5453));
  const grained = max(vignetted.add(grainHash.sub(0.5).mul(2).mul(uniforms.grainAmplitude)), float(0));
  stages.push('per-frame-luminance-grain');

  assertGradeChainOrder(stages);
  return Object.freeze({
    outputNode: vec4(grained, display.a),
    stages: Object.freeze(stages),
  });
}

// ---------------------------------------------------------------------------
// Bloom
// ---------------------------------------------------------------------------

/** The subset of `BloomNode` this module tunes. */
export type TunableBloomNode = {
  threshold: { value: number };
  radius: { value: number };
  strength: { value: number };
};

export function isTunableBloomNode(candidate: unknown): candidate is TunableBloomNode {
  const node = candidate as Partial<Record<string, { value?: unknown }>> | null;
  if (!node || typeof node !== 'object') return false;
  if (!('_textureNodeBlur0' in node)) return false;
  return typeof node.threshold?.value === 'number'
    && typeof node.radius?.value === 'number'
    && typeof node.strength?.value === 'number';
}

/**
 * Applies the profile's measured bloom. `baseStrength` is the strength the
 * graphics settings asked for; the profile only scales it.
 *
 * Fail-closed on the combat-safety rule that matters here: a bloom threshold
 * at or below 1.0 makes ordinary in-gamut surfaces glow, which is exactly how
 * a sightline gets washed out. Only true HDR emitters may bloom.
 */
export function tuneBloomForProfile(
  bloom: TunableBloomNode,
  profile: FrozenFilmicGradeProfile,
  baseStrength: number,
): void {
  if (!(profile.bloom.threshold > 1)) {
    throw new Error(
      `HF-362 bloom threshold must exceed 1.0 linear for profile '${profile.id}'; got ${profile.bloom.threshold}`,
    );
  }
  bloom.threshold.value = profile.bloom.threshold;
  bloom.radius.value = profile.bloom.radiusTexelScale;
  bloom.strength.value = Math.max(0, baseStrength) * profile.bloom.intensityScale;
}

type TraversableNode = { getChildren?: () => Iterable<unknown> };

/**
 * Collects every bloom node reachable from a node graph root.
 *
 * Deliberately iterative with an explicit visited set rather than
 * `Node.traverse`: post-processing graphs are diamonds (the scene colour feeds
 * several branches) and the built-in recursive walk re-expands every shared
 * subtree, which is exponential in the number of diamonds.
 */
export function collectTunableBloomNodes(root: unknown): TunableBloomNode[] {
  const found: TunableBloomNode[] = [];
  if (!root || typeof root !== 'object') return found;
  const visited = new Set<unknown>();
  const pending: unknown[] = [root];
  try {
    while (pending.length > 0) {
      const node = pending.pop();
      if (!node || typeof node !== 'object' || visited.has(node)) continue;
      visited.add(node);
      if (isTunableBloomNode(node)) found.push(node);
      const children = (node as TraversableNode).getChildren;
      if (typeof children !== 'function') continue;
      for (const child of children.call(node)) pending.push(child);
    }
  } catch {
    // A partially built graph is not a reason to fail the frame; the chain
    // itself is unaffected and the next rebuild retries.
    return found;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Pipeline installation
// ---------------------------------------------------------------------------

/** The `RenderPipeline` surface this module needs. */
export type GradedRenderPipeline = {
  outputNode: unknown;
  outputColorTransform: boolean;
  needsUpdate: boolean;
};

export type FilmicGradeChainHandle = Readonly<{
  profileId(): GradeProfileId;
  stages(): readonly string[];
  uniforms: FilmicGradeUniforms;
  /** Number of bloom nodes discovered and retuned on the last rebuild. */
  tunedBloomNodes(): number;
  setProfile(profileId: GradeProfileId): void;
  /**
   * Lane L — selects the arena's art direction. The direction is COMPOSED
   * over whichever grade profile is active (and stays composed across
   * setProfile calls), so the same place identity ships on every render
   * profile. Passing null restores the bare profile.
   */
  setArenaArtDirection(direction: ArenaArtDirection | null): void;
  arenaArtDirection(): ArenaArtDirection | null;
  setGrainStrength8Bit(strength8Bit: number): void;
  /**
   * The PLAYER'S vignette setting. The applied uniform additionally carries
   * the arena's authored vignette character and is capped at
   * DISPLAY_VIGNETTE_MAXIMUM (see art-direction.ts).
   */
  setDisplayVignetteStrength(strength: number): void;
  /** Selects the optional display-side post AA stage; 'off' removes it. */
  setPostAntiAliasing(mode: PostAntiAliasingMode): void;
  postAntiAliasing(): PostAntiAliasingMode;
  /** Player sharpness 0..1; zero removes the RCAS stage entirely. */
  setSharpness(uiSharpness: number): void;
  sharpness(): number;
  /** Selects the FSR 1 upscale stage; disabled restores the standalone sharpen. */
  setSpatialUpscaling(request: SpatialUpscalingRequest): void;
  spatialUpscaling(): SpatialUpscalingRequest;
  /**
   * Replaces the linear-side stage receipt the scene-pass assembler is
   * producing. Must be pushed before the assembler publishes its outputNode,
   * otherwise the first receipt describes a graph that is not on screen.
   */
  setLinearSourceStages(stages: readonly string[]): void;
  /** Call immediately before submitting a frame. */
  beforeRender(timeMs: number): void;
  dispose(): void;
}>;

const INSTALL_MARKER = '__hf362FilmicGradeChain';

/**
 * Returns the chain handle installed on a pipeline, or null. Lane L: the
 * Pass 64 scene assembler uses this to hand the chain the current arena's
 * art direction without owning (or accidentally creating) an installation —
 * unit tests build scene systems on bare pipeline stubs where no chain
 * exists, and that must stay a no-op.
 */
export function installedFilmicGradeChain(pipeline: unknown): FilmicGradeChainHandle | null {
  if (!pipeline || typeof pipeline !== 'object') return null;
  return (pipeline as { [INSTALL_MARKER]?: FilmicGradeChainHandle })[INSTALL_MARKER] ?? null;
}

/**
 * Installs the chain on a live `RenderPipeline`.
 *
 * The pipeline's `outputNode` is replaced by an accessor so that whichever
 * module assembles the scene pass keeps publishing a plain linear-HDR node and
 * this chain re-wraps it automatically. That keeps a single assembly — the
 * scene-pass owner still owns the scene pass, contact occlusion and bloom —
 * while the grade and the output transform live in one audited place.
 */
export function installFilmicGradeChain(
  pipeline: GradedRenderPipeline,
  options: Readonly<{
    profileId?: GradeProfileId;
    grainStrength8Bit?: number;
    upstreamStages?: readonly string[];
    postAntiAliasing?: PostAntiAliasingMode;
    /** Player sharpness 0..1; zero (the default) builds no RCAS stage. */
    sharpness?: number;
    spatialUpscaling?: SpatialUpscalingRequest;
  }> = {},
): FilmicGradeChainHandle {
  const marked = pipeline as GradedRenderPipeline & { [INSTALL_MARKER]?: FilmicGradeChainHandle };
  const existing = marked[INSTALL_MARKER];
  if (existing) {
    if (options.profileId) existing.setProfile(options.profileId);
    if (options.upstreamStages !== undefined) existing.setLinearSourceStages(options.upstreamStages);
    if (options.postAntiAliasing !== undefined) existing.setPostAntiAliasing(options.postAntiAliasing);
    if (options.sharpness !== undefined) existing.setSharpness(options.sharpness);
    if (options.spatialUpscaling !== undefined) existing.setSpatialUpscaling(options.spatialUpscaling);
    return existing;
  }

  const uniforms = createFilmicGradeUniforms();
  let upstreamStages = options.upstreamStages ?? LINEAR_SOURCE_STAGES;
  let grainStrength8Bit = options.grainStrength8Bit ?? DEFAULT_AUTHORED_GRAIN_8BIT;
  let baseProfile = resolveGradeProfile(options.profileId ?? DEFAULT_GRADE_PROFILE_ID);
  // Lane L — the arena's art direction, composed over the base profile. The
  // composed result is what every uniform, bloom retune and grain seed reads,
  // so the place identity survives profile switches unchanged.
  let artDirection: ArenaArtDirection | null = null;
  let profile = baseProfile;
  // The raw player setting; the applied uniform composes the arena character.
  let vignetteSetting = 0;
  const applyComposedProfile = (): void => {
    profile = artDirection === null ? baseProfile : composeArtDirectedProfile(baseProfile, artDirection);
    applyGradeProfileToUniforms(uniforms, profile, grainStrength8Bit);
    uniforms.vignetteStrength.value = composeArtDirectedVignette(vignetteSetting, artDirection);
  };
  applyComposedProfile();

  let linearSource: Node<'vec4'> | null = (pipeline.outputNode ?? null) as Node<'vec4'> | null;
  let gradedNode: Node<'vec4'> | null = null;
  let stages: readonly string[] = GRADE_CHAIN_STAGES;
  let bloomNodes: TunableBloomNode[] = [];
  let postAntiAliasingMode: PostAntiAliasingMode = options.postAntiAliasing ?? 'off';
  let uiSharpness = Number.isFinite(options.sharpness) ? Math.min(1, Math.max(0, options.sharpness!)) : 0;
  let upscaling: SpatialUpscalingRequest = options.spatialUpscaling ?? SPATIAL_UPSCALING_OFF;
  const sharpnessUniform = uniform(rcasSharpnessFor(uiSharpness));
  // FXAA/SMAA/RCAS are TempNodes owning render targets; retire the previous
  // set on every rebuild so pipeline republishes cannot leak GPU targets.
  let trailingDisposables: Array<{ dispose?: () => void }> = [];
  const bloomBaseStrength = new WeakMap<TunableBloomNode, number>();
  let lastWrittenStrength = new WeakMap<TunableBloomNode, number>();

  const retuneBloom = (): void => {
    for (const bloom of bloomNodes) {
      // Detect an external write (the settings path resets strength on every
      // graphics change) and treat the new value as the requested base.
      const written = lastWrittenStrength.get(bloom);
      if (written === undefined || bloom.strength.value !== written) {
        bloomBaseStrength.set(bloom, bloom.strength.value);
      }
      tuneBloomForProfile(bloom, profile, bloomBaseStrength.get(bloom) ?? bloom.strength.value);
      lastWrittenStrength.set(bloom, bloom.strength.value);
    }
  };

  const disposeTrailingNodes = (): void => {
    for (const node of trailingDisposables) node.dispose?.();
    trailingDisposables = [];
  };

  const rebuild = (): void => {
    disposeTrailingNodes();
    if (linearSource === null) {
      gradedNode = null;
      return;
    }
    const build = buildFilmicGradeChain(linearSource, uniforms, upstreamStages);
    const builtStages = [...build.stages];
    let output: Node<'vec4'> = build.outputNode;
    // Optional trailing display stages. Order is the AMD-canonical one — post
    // AA reconstructs edges on the finished display image, RCAS sharpens last.
    if (postAntiAliasingMode === 'fxaa') {
      const aaNode = fxaa(output);
      trailingDisposables.push(aaNode as unknown as { dispose?: () => void });
      output = aaNode as unknown as Node<'vec4'>;
      builtStages.push('display-post-antialiasing-fxaa');
    } else if (postAntiAliasingMode === 'smaa') {
      const aaNode = smaa(output);
      trailingDisposables.push(aaNode as unknown as { dispose?: () => void });
      output = aaNode as unknown as Node<'vec4'>;
      builtStages.push('display-post-antialiasing-smaa');
    }
    const upscaleActive = upscaling.enabled && upscaling.sceneResolutionScale > 0 && upscaling.sceneResolutionScale < 1;
    if (upscaleActive) {
      // FSR 1 must consume a LOW-RESOLUTION image or EASU has nothing to
      // reconstruct. Materialising the finished display-referred chain into an
      // RTT at the scene's own resolution scale is what makes this a real
      // upscale rather than a 1:1 edge filter: the whole graph — scene pass,
      // grade, tone map, grain — runs at that fraction, and EASU reconstructs
      // to the drawing buffer. The scene-pass assembler applies the same scale
      // to `pass()`, so the two halves render at one resolution.
      const lowResolution = rtt(output);
      lowResolution.setResolutionScale(upscaling.sceneResolutionScale);
      trailingDisposables.push(lowResolution as unknown as { dispose?: () => void });
      // FSR 1's second half IS RCAS, so the player's sharpness drives it and the
      // standalone sharpen stage below is skipped. Running both would apply the
      // same filter twice; `assertGradeChainOrder` rejects that outright.
      const upscaled = fsr1(lowResolution, sharpnessUniform);
      trailingDisposables.push(upscaled as unknown as { dispose?: () => void });
      output = upscaled as unknown as Node<'vec4'>;
      builtStages.push('display-fsr1-easu-rcas-upscale');
    } else if (uiSharpness > 0) {
      const sharpenNode = sharpen(output, sharpnessUniform);
      trailingDisposables.push(sharpenNode as unknown as { dispose?: () => void });
      output = sharpenNode as unknown as Node<'vec4'>;
      builtStages.push('display-cas-sharpen');
    }
    assertGradeChainOrder(builtStages);
    gradedNode = output;
    stages = Object.freeze(builtStages);
    bloomNodes = collectTunableBloomNodes(linearSource);
    lastWrittenStrength = new WeakMap<TunableBloomNode, number>();
    retuneBloom();
  };

  rebuild();

  Object.defineProperty(pipeline, 'outputNode', {
    configurable: true,
    enumerable: true,
    get: () => gradedNode,
    set: (next: unknown) => {
      linearSource = (next ?? null) as Node<'vec4'> | null;
      rebuild();
    },
  });
  // Stage 7 owns the output transform now. Leaving this true would append a
  // SECOND tone map after the display-referred stages and re-encode sRGB on
  // already-encoded pixels.
  pipeline.outputColorTransform = false;
  pipeline.needsUpdate = true;

  const handle: FilmicGradeChainHandle = Object.freeze({
    profileId: () => profile.id,
    stages: () => stages,
    uniforms,
    tunedBloomNodes: () => bloomNodes.length,
    setProfile(profileId: GradeProfileId) {
      baseProfile = resolveGradeProfile(profileId);
      applyComposedProfile();
      retuneBloom();
    },
    setArenaArtDirection(direction: ArenaArtDirection | null) {
      if (direction === artDirection) return;
      artDirection = direction;
      applyComposedProfile();
      retuneBloom();
    },
    arenaArtDirection: () => artDirection,
    setGrainStrength8Bit(strength8Bit: number) {
      grainStrength8Bit = Number.isFinite(strength8Bit) ? Math.max(0, strength8Bit) : 0;
      uniforms.grainAmplitude.value = grainAmplitudeFor(profile, grainStrength8Bit);
    },
    setDisplayVignetteStrength(strength: number) {
      vignetteSetting = Number.isFinite(strength) ? Math.max(0, strength) : 0;
      uniforms.vignetteStrength.value = composeArtDirectedVignette(vignetteSetting, artDirection);
    },
    setPostAntiAliasing(mode: PostAntiAliasingMode) {
      if (mode === postAntiAliasingMode) return;
      postAntiAliasingMode = mode;
      rebuild();
      pipeline.needsUpdate = true;
    },
    postAntiAliasing: () => postAntiAliasingMode,
    setSharpness(nextSharpness: number) {
      const bounded = Number.isFinite(nextSharpness) ? Math.min(1, Math.max(0, nextSharpness)) : 0;
      // While FSR 1 owns RCAS the sharpen stage is never standalone, so
      // crossing zero changes nothing about the topology — only the uniform.
      const stageToggled = !upscaling.enabled && (bounded > 0) !== (uiSharpness > 0);
      uiSharpness = bounded;
      sharpnessUniform.value = rcasSharpnessFor(bounded);
      // Strength moves through the live uniform; only crossing zero changes
      // the graph topology (the stage is bypassed entirely at zero).
      if (stageToggled) {
        rebuild();
        pipeline.needsUpdate = true;
      }
    },
    sharpness: () => uiSharpness,
    setSpatialUpscaling(request: SpatialUpscalingRequest) {
      const next: SpatialUpscalingRequest = Object.freeze({
        enabled: request.enabled === true,
        sceneResolutionScale: Number.isFinite(request.sceneResolutionScale)
          ? Math.min(1, Math.max(0.25, request.sceneResolutionScale))
          : 1,
      });
      if (next.enabled === upscaling.enabled && next.sceneResolutionScale === upscaling.sceneResolutionScale) return;
      upscaling = next;
      rebuild();
      pipeline.needsUpdate = true;
    },
    spatialUpscaling: () => upscaling,
    setLinearSourceStages(stages: readonly string[]) {
      const next = Object.freeze([...stages]);
      if (next.length === upstreamStages.length && next.every((stage, index) => stage === upstreamStages[index])) return;
      upstreamStages = next;
      rebuild();
      pipeline.needsUpdate = true;
    },
    beforeRender(timeMs: number) {
      uniforms.grainSeed.value = grainSeedFor(profile, timeMs);
      retuneBloom();
    },
    dispose() {
      disposeTrailingNodes();
      delete marked[INSTALL_MARKER];
      Object.defineProperty(pipeline, 'outputNode', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: linearSource,
      });
      pipeline.outputColorTransform = true;
      pipeline.needsUpdate = true;
    },
  });
  marked[INSTALL_MARKER] = handle;
  return handle;
}
