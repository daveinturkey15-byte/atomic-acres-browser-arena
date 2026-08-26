/**
 * HF-364 — tuning data for the screen-space post stack.
 *
 * `screen-space-post.ts` owns the *graph*: it turns the values here into typed
 * TSL nodes on the live linear-HDR chain. This module owns the *data* and the
 * numeric combat-safety envelope, exactly the way `grade-profile.ts` owns the
 * filmic profile data for `filmic-grade-chain.ts`.
 *
 * WHAT THESE EFFECTS ACTUALLY ARE — the labels here are deliberately literal,
 * because the marketing words for this family are all wrong for a browser:
 * - WebGPU exposes NO hardware ray-tracing pipeline in any shipping browser.
 *   There are no acceleration structures, no ray queries, and nothing here is
 *   ray tracing. The `hardware-ray-tracing` capability notice stays.
 * - SSR and SSGI are screen-space RAY-MARCHED techniques. They step along a
 *   ray through the depth buffer, so they only ever see what is already on
 *   screen. That is where the modern look comes from and it is the honest
 *   description; the UI calls SSGI "SCREEN-SPACE GI" and never "ray tracing".
 * - Godrays are a screen-space raymarch through the sun's shadow map, i.e. the
 *   real volumetric shaft, not the additive quads the farcrysis arena dresses
 *   its sun with. Those quads are owned elsewhere and are left alone.
 *
 * COMBAT SAFETY (competitive FPS — verified in screen-space-post-profile.test.ts):
 * - Every lighting effect here is ADDITIVE. SSGI contributes its GI buffer and
 *   deliberately discards its AO buffer, SSR adds reflected light, godrays add
 *   shaft light. None of them can darken a pixel, so nothing that is visible
 *   today can be hidden by turning one on.
 * - Additive light can still wash a sightline out, so each one carries a hard
 *   linear-HDR gain ceiling that the resolver clamps rather than trusts.
 * - Depth of field is bounded by a pixel-radius proof: across the whole
 *   combat-relevant midfield band the circle of confusion stays sub-pixel, so
 *   an enemy at engagement range is never softened. Only the far background
 *   past the band is allowed to go soft.
 * - Motion blur has a dead zone: below a real angular rate the smear is
 *   exactly zero, so aiming adjustments and slow strafes never smear. Its
 *   total screen offset is capped so a fast flick cannot erase a target.
 */

import type { LightingTier } from '../graphics-settings-registry';

export type ScreenSpaceTier = LightingTier;
export type SpatialUpscalingMode = 'off' | 'fsr1-quality' | 'fsr1-balanced' | 'fsr1-performance';

// ---------------------------------------------------------------------------
// Combat-safety envelope. These are clamps, not advice.
// ---------------------------------------------------------------------------

/**
 * Largest linear-HDR value a godray shaft may add to a pixel. The upstream
 * node's own default maximum density is 0.5, which at this arena's exposure is
 * a white-out across a doorway. A fifth of that is a visible shaft that still
 * leaves a silhouette readable inside it.
 */
export const GODRAY_MAXIMUM_ADDITIVE_GAIN = 0.22;

/** Largest multiplier applied to the SSR node's reflected colour. */
export const SSR_MAXIMUM_INTENSITY = 0.75;

/**
 * Largest bounce-light multiplier for SSGI. Upstream defaults to 10, which is
 * tuned for a darkened archviz interior; at that value a bounced wall lights a
 * crouching player's cover as brightly as the sun does.
 */
export const SSGI_MAXIMUM_GI_INTENSITY = 4.5;

/**
 * The band, in metres from the camera, inside which a target may realistically
 * be engaged on these arenas. The gameplay far plane is 180 m but the sun
 * shadow camera stops at 150 m and every authored arena fits inside ~45 m of
 * playable depth, so this is the range that has to stay razor sharp.
 */
export const DEPTH_OF_FIELD_MIDFIELD_NEAR_M = 1.5;
export const DEPTH_OF_FIELD_MIDFIELD_FAR_M = 45;

/**
 * Hard ceiling on the depth-of-field blur radius anywhere inside that band,
 * in pixels. Sub-pixel means the bokeh kernel's widest tap lands inside the
 * source pixel, so the "blurred" midfield is arithmetically the sharp one.
 */
export const DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX = 0.5;

/**
 * Motion-blur dead zone and knee, in NDC units of per-frame screen motion.
 * Below the dead zone the smear is exactly zero. A 240 Hz aim adjustment moves
 * a few thousandths of NDC per frame; a fast flick or a nearby sprinting
 * silhouette moves an order of magnitude more.
 */
export const MOTION_BLUR_DEAD_ZONE_NDC = 0.006;
export const MOTION_BLUR_KNEE_NDC = 0.024;

/**
 * Largest UV distance the blur may sample away from the shaded pixel. 2.5% of
 * the screen is a readable sense of speed; beyond that a flick starts deleting
 * targets from the frame.
 */
export const MOTION_BLUR_MAXIMUM_UV_OFFSET = 0.025;

// ---------------------------------------------------------------------------
// Resolved tunings
// ---------------------------------------------------------------------------

export type GodraysTuning = Readonly<{
  quality: ScreenSpaceTier;
  enabled: boolean;
  /** Why the tier is not running, when the player asked for one. */
  unavailableReason: string | null;
  raymarchSteps: number;
  resolutionScale: number;
  density: number;
  maximumDensity: number;
  distanceAttenuation: number;
  /** Linear-HDR multiplier on the composited shaft, <= GODRAY_MAXIMUM_ADDITIVE_GAIN. */
  additiveGain: number;
  /** Bilateral denoise of the raymarch result before compositing. */
  bilateralBlur: boolean;
}>;

export type ScreenSpaceReflectionTuning = Readonly<{
  quality: ScreenSpaceTier;
  enabled: boolean;
  resolutionScale: number;
  /** The node's own 0..1 raymarch quality, i.e. how many of its 64 steps run. */
  marchQuality: number;
  maximumDistance: number;
  thickness: number;
  intensity: number;
  screenEdgeFade: number;
  binaryRefine: boolean;
  /**
   * Dielectrics must reflect: the whole point of this tier is wet decking and
   * standing water, and water is not a metal.
   */
  reflectNonMetals: boolean;
}>;

export type ScreenSpaceGiTuning = Readonly<{
  quality: ScreenSpaceTier;
  enabled: boolean;
  sliceCount: number;
  stepCount: number;
  giIntensity: number;
  radius: number;
  thickness: number;
  expFactor: number;
  /** Spatial denoise stands in for the temporal filter this chain cannot run. */
  denoise: boolean;
}>;

export type DepthOfFieldTuning = Readonly<{
  enabled: boolean;
  strength: number;
  focusDistanceM: number;
  /** Distance from the focal plane at which a pixel is fully out of focus. */
  focalLengthM: number;
  /** Bokeh kernel radius in pixels at a fully out-of-focus pixel. */
  bokehScale: number;
}>;

export type MotionBlurTuning = Readonly<{
  enabled: boolean;
  strength: number;
  samples: number;
  deadZoneNdc: number;
  kneeNdc: number;
  maximumUvOffset: number;
}>;

export type SpatialUpscalingTuning = Readonly<{
  mode: SpatialUpscalingMode;
  enabled: boolean;
  /** Fraction of the drawing buffer the scene is actually rendered at. */
  sceneResolutionScale: number;
  label: string;
}>;

export type ScreenSpacePostRuntime = Readonly<{
  godrays: GodraysTuning;
  reflections: ScreenSpaceReflectionTuning;
  globalIllumination: ScreenSpaceGiTuning;
  depthOfField: DepthOfFieldTuning;
  motionBlur: MotionBlurTuning;
  upscaling: SpatialUpscalingTuning;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

const GODRAYS_OFF: GodraysTuning = Object.freeze({
  quality: 'off', enabled: false, unavailableReason: null, raymarchSteps: 0, resolutionScale: 0,
  density: 0, maximumDensity: 0, distanceAttenuation: 0, additiveGain: 0, bilateralBlur: false,
});

/**
 * Godrays raymarch the sun's shadow map, so a shadow-casting light is not a
 * nice-to-have: without one there is nothing to occlude the volume and the
 * upstream node has no `light.shadow.camera` to reference. Reporting that as a
 * reason beats silently drawing nothing.
 */
export function resolveGodraysTuning(
  tier: ScreenSpaceTier,
  capability: Readonly<{ shadowsEnabled: boolean }>,
): GodraysTuning {
  if (tier === 'off') return GODRAYS_OFF;
  if (!capability.shadowsEnabled) {
    return Object.freeze({
      ...GODRAYS_OFF,
      quality: tier,
      unavailableReason: 'Volumetric light shafts raymarch the sun shadow map; enable Sun shadows.',
    });
  }
  const high = tier === 'high';
  return Object.freeze({
    quality: tier,
    enabled: true,
    unavailableReason: null,
    raymarchSteps: high ? 48 : 24,
    resolutionScale: high ? 0.5 : 0.35,
    density: high ? 0.5 : 0.35,
    maximumDensity: high ? 0.18 : 0.12,
    distanceAttenuation: high ? 2.2 : 2.6,
    additiveGain: Math.min(high ? 0.22 : 0.14, GODRAY_MAXIMUM_ADDITIVE_GAIN),
    bilateralBlur: true,
  });
}

const SSR_OFF: ScreenSpaceReflectionTuning = Object.freeze({
  quality: 'off', enabled: false, resolutionScale: 0, marchQuality: 0, maximumDistance: 0,
  thickness: 0, intensity: 0, screenEdgeFade: 0, binaryRefine: false, reflectNonMetals: false,
});

export function resolveScreenSpaceReflectionTuning(tier: ScreenSpaceTier): ScreenSpaceReflectionTuning {
  if (tier === 'off') return SSR_OFF;
  const high = tier === 'high';
  return Object.freeze({
    quality: tier,
    enabled: true,
    resolutionScale: high ? 0.75 : 0.5,
    marchQuality: high ? 0.6 : 0.35,
    maximumDistance: high ? 12 : 6,
    thickness: high ? 0.12 : 0.18,
    intensity: Math.min(high ? 0.7 : 0.5, SSR_MAXIMUM_INTENSITY),
    // A wide edge fade matters more here than in an offline renderer: a hit
    // that vanishes at the screen border reads as a flickering panel exactly
    // when the player is turning, which is when they are looking for a target.
    screenEdgeFade: 0.24,
    binaryRefine: high,
    reflectNonMetals: true,
  });
}

const SSGI_OFF: ScreenSpaceGiTuning = Object.freeze({
  quality: 'off', enabled: false, sliceCount: 0, stepCount: 0, giIntensity: 0,
  radius: 0, thickness: 0, expFactor: 0, denoise: false,
});

export function resolveScreenSpaceGiTuning(tier: ScreenSpaceTier): ScreenSpaceGiTuning {
  if (tier === 'off') return SSGI_OFF;
  const high = tier === 'high';
  return Object.freeze({
    quality: tier,
    enabled: true,
    sliceCount: high ? 2 : 1,
    stepCount: high ? 12 : 8,
    giIntensity: Math.min(high ? 4 : 2.5, SSGI_MAXIMUM_GI_INTENSITY),
    // World-space metres. The arenas are ~60 m across, so an 8 m gather is a
    // room-scale bounce rather than a whole-map wash.
    radius: high ? 8 : 5,
    thickness: 1,
    expFactor: 2,
    // Upstream's temporal filter is only stable under a TRAA resolve this
    // chain does not run — the same reason GTAO keeps temporal filtering off.
    // The depth/normal-aware spatial denoise stands in for it.
    denoise: true,
  });
}

/** Fixed focus, chosen so the whole playable depth of every arena sits inside it. */
const DEPTH_OF_FIELD_FOCUS_M = 26;
/**
 * Deliberately far larger than the arenas. A short focal length is what makes
 * cinematic DOF hide things; this one is long enough that the circle of
 * confusion only opens up past the combat band, on sky and distant horizon.
 */
const DEPTH_OF_FIELD_FOCAL_LENGTH_M = 120;
const DEPTH_OF_FIELD_BASE_BOKEH_PX = 1;
const DEPTH_OF_FIELD_BOKEH_RANGE_PX = 2.6;

export function resolveDepthOfFieldTuning(enabled: boolean, strength: number): DepthOfFieldTuning {
  const bounded = clamp(strength, 0, 1);
  if (!enabled || bounded === 0) {
    return Object.freeze({
      enabled: false, strength: bounded, focusDistanceM: DEPTH_OF_FIELD_FOCUS_M,
      focalLengthM: DEPTH_OF_FIELD_FOCAL_LENGTH_M, bokehScale: 0,
    });
  }
  return Object.freeze({
    enabled: true,
    strength: bounded,
    focusDistanceM: DEPTH_OF_FIELD_FOCUS_M,
    focalLengthM: DEPTH_OF_FIELD_FOCAL_LENGTH_M,
    bokehScale: DEPTH_OF_FIELD_BASE_BOKEH_PX + bounded * DEPTH_OF_FIELD_BOKEH_RANGE_PX,
  });
}

const MOTION_BLUR_OFF: MotionBlurTuning = Object.freeze({
  enabled: false, strength: 0, samples: 0,
  deadZoneNdc: MOTION_BLUR_DEAD_ZONE_NDC, kneeNdc: MOTION_BLUR_KNEE_NDC,
  maximumUvOffset: 0,
});

export function resolveMotionBlurTuning(strength: number): MotionBlurTuning {
  const bounded = clamp(strength, 0, 1);
  if (bounded === 0) return MOTION_BLUR_OFF;
  return Object.freeze({
    enabled: true,
    strength: bounded,
    // Eight taps is enough for a short smear and keeps the loop cost bounded;
    // the upstream default of sixteen buys nothing at this offset ceiling.
    samples: 8,
    deadZoneNdc: MOTION_BLUR_DEAD_ZONE_NDC,
    kneeNdc: MOTION_BLUR_KNEE_NDC,
    maximumUvOffset: MOTION_BLUR_MAXIMUM_UV_OFFSET * bounded,
  });
}

/**
 * FSR 1 ratios are AMD's published presets. The scene pass renders at this
 * fraction of the drawing buffer and EASU reconstructs back up to it, which is
 * the whole difference from `renderScale`: that one shrinks the drawing buffer
 * itself and hands the upsample to the browser's bilinear blit.
 */
export function resolveSpatialUpscaling(mode: SpatialUpscalingMode): SpatialUpscalingTuning {
  if (mode === 'fsr1-quality') {
    return Object.freeze({ mode, enabled: true, sceneResolutionScale: 0.67, label: 'FSR 1 Quality (1.5x)' });
  }
  if (mode === 'fsr1-balanced') {
    return Object.freeze({ mode, enabled: true, sceneResolutionScale: 0.59, label: 'FSR 1 Balanced (1.7x)' });
  }
  if (mode === 'fsr1-performance') {
    return Object.freeze({ mode, enabled: true, sceneResolutionScale: 0.5, label: 'FSR 1 Performance (2.0x)' });
  }
  return Object.freeze({ mode: 'off', enabled: false, sceneResolutionScale: 1, label: 'Off' });
}

// ---------------------------------------------------------------------------
// CPU reference implementations.
//
// These mirror the upstream node maths stage for stage so the combat-safety
// envelope can be proven numerically without a GPU, exactly like the filmic
// grade chain's reference stages.
// ---------------------------------------------------------------------------

function smoothstepScalar(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * DepthOfFieldNode's circle of confusion, verbatim:
 * `smoothstep(0, focalLength, abs(-viewZ - focusDistance))`.
 */
export function depthOfFieldCircleOfConfusion(distanceM: number, tuning: DepthOfFieldTuning): number {
  if (!tuning.enabled) return 0;
  const signedDistance = distanceM - tuning.focusDistanceM;
  return smoothstepScalar(0, Math.max(tuning.focalLengthM, 1e-4), Math.abs(signedDistance));
}

/**
 * Blur radius in pixels. The node's bokeh kernels are unit-disc point sets and
 * the sample step is `invSize * bokehScale * CoC`, so the widest tap lands
 * `bokehScale * CoC` pixels from the shaded pixel.
 */
export function depthOfFieldBlurRadiusPixels(distanceM: number, tuning: DepthOfFieldTuning): number {
  return tuning.bokehScale * depthOfFieldCircleOfConfusion(distanceM, tuning);
}

/**
 * How strongly the blurred field replaces the sharp one, from the node's
 * composite: `min(CoC, 0.5) * 2`.
 */
export function depthOfFieldBlendWeight(distanceM: number, tuning: DepthOfFieldTuning): number {
  return Math.min(depthOfFieldCircleOfConfusion(distanceM, tuning), 0.5) * 2;
}

/**
 * The gated motion-blur screen offset, in UV units, for a per-frame NDC
 * velocity magnitude. Mirrors the TSL gate in `screen-space-post.ts`.
 */
export function motionBlurScreenOffset(velocityNdc: number, tuning: MotionBlurTuning): number {
  if (!tuning.enabled) return 0;
  const speed = Math.max(0, Number.isFinite(velocityNdc) ? velocityNdc : 0);
  const gate = smoothstepScalar(tuning.deadZoneNdc, tuning.kneeNdc, speed);
  // NDC spans 2 units across the screen; UV spans 1.
  return Math.min(speed / 2, tuning.maximumUvOffset) * gate;
}

/**
 * Fail-closed proof that a depth-of-field tuning cannot soften a target inside
 * the combat band. Called at graph construction, not merely asserted in tests:
 * a future tuning edit that breaks the bound must fail the arena build.
 */
export function assertDepthOfFieldCombatSafety(tuning: DepthOfFieldTuning): void {
  if (!tuning.enabled) return;
  // Sample the band densely rather than only its endpoints: the circle of
  // confusion is monotonic away from the focal plane, so the worst case is at
  // whichever endpoint is further from focus, but a future non-monotonic
  // tuning must not be able to sneak past a two-point check.
  const steps = 64;
  for (let index = 0; index <= steps; index += 1) {
    const distance = DEPTH_OF_FIELD_MIDFIELD_NEAR_M
      + (DEPTH_OF_FIELD_MIDFIELD_FAR_M - DEPTH_OF_FIELD_MIDFIELD_NEAR_M) * (index / steps);
    const radius = depthOfFieldBlurRadiusPixels(distance, tuning);
    if (!(radius <= DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX)) {
      throw new Error(
        `HF-364 depth of field would blur the combat midfield: ${radius.toFixed(3)}px at ${distance.toFixed(1)}m `
        + `exceeds the ${DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX}px ceiling (strength ${tuning.strength})`,
      );
    }
  }
}

/** Fail-closed proof that no additive tier exceeds its linear-HDR gain ceiling. */
export function assertScreenSpacePostCombatSafety(runtime: ScreenSpacePostRuntime): void {
  if (runtime.godrays.additiveGain > GODRAY_MAXIMUM_ADDITIVE_GAIN) {
    throw new Error(`HF-364 godray additive gain ${runtime.godrays.additiveGain} exceeds ${GODRAY_MAXIMUM_ADDITIVE_GAIN}`);
  }
  if (runtime.reflections.intensity > SSR_MAXIMUM_INTENSITY) {
    throw new Error(`HF-364 SSR intensity ${runtime.reflections.intensity} exceeds ${SSR_MAXIMUM_INTENSITY}`);
  }
  if (runtime.globalIllumination.giIntensity > SSGI_MAXIMUM_GI_INTENSITY) {
    throw new Error(`HF-364 SSGI intensity ${runtime.globalIllumination.giIntensity} exceeds ${SSGI_MAXIMUM_GI_INTENSITY}`);
  }
  if (runtime.motionBlur.maximumUvOffset > MOTION_BLUR_MAXIMUM_UV_OFFSET) {
    throw new Error(
      `HF-364 motion blur offset ${runtime.motionBlur.maximumUvOffset} exceeds ${MOTION_BLUR_MAXIMUM_UV_OFFSET}`,
    );
  }
  assertDepthOfFieldCombatSafety(runtime.depthOfField);
}

export type ScreenSpacePostSelection = Readonly<{
  volumetricLightShafts: ScreenSpaceTier;
  screenSpaceReflections: ScreenSpaceTier;
  screenSpaceGi: ScreenSpaceTier;
  depthOfField: boolean;
  depthOfFieldStrength: number;
  motionBlur: number;
  spatialUpscaling: SpatialUpscalingMode;
}>;

/**
 * One resolver for the whole family, so the graphics runtime never has to know
 * a tier table. `shadowsEnabled` is the only capability input: it is the sole
 * hard dependency any of these has on the rest of the renderer.
 */
export function resolveScreenSpacePostRuntime(
  selection: ScreenSpacePostSelection,
  capability: Readonly<{ shadowsEnabled: boolean }>,
): ScreenSpacePostRuntime {
  const runtime: ScreenSpacePostRuntime = Object.freeze({
    godrays: resolveGodraysTuning(selection.volumetricLightShafts, capability),
    reflections: resolveScreenSpaceReflectionTuning(selection.screenSpaceReflections),
    globalIllumination: resolveScreenSpaceGiTuning(selection.screenSpaceGi),
    depthOfField: resolveDepthOfFieldTuning(selection.depthOfField, selection.depthOfFieldStrength),
    motionBlur: resolveMotionBlurTuning(selection.motionBlur),
    upscaling: resolveSpatialUpscaling(selection.spatialUpscaling),
  });
  assertScreenSpacePostCombatSafety(runtime);
  return runtime;
}

/** Every effect off. The compatibility route and the disabled state share it. */
export const SCREEN_SPACE_POST_DISABLED: ScreenSpacePostRuntime = Object.freeze({
  godrays: GODRAYS_OFF,
  reflections: SSR_OFF,
  globalIllumination: SSGI_OFF,
  depthOfField: resolveDepthOfFieldTuning(false, 0),
  motionBlur: MOTION_BLUR_OFF,
  upscaling: resolveSpatialUpscaling('off'),
});

/**
 * Adaptive-quality pressure bands, expressed as a fraction of the pixel-ratio
 * cap the player actually asked for. `configuredAdaptiveQualityLevels` walks
 * down through 0.85 / 0.75 / 0.65 / 0.55 of the cap, so these two thresholds
 * sit exactly on the first and third downshift.
 */
export const SCREEN_SPACE_PRESSURE_DEMOTE_RATIO = 0.85;
export const SCREEN_SPACE_PRESSURE_STARVE_RATIO = 0.7;

/** How far the starved band scales march resolution and additive gain. */
const STARVED_RESOLUTION_SCALE = 0.6;
const STARVED_GAIN_SCALE = 0.5;

/**
 * Adaptive-quality pressure valve.
 *
 * The adaptive controller only owns the pixel ratio, but these raymarches are
 * the most expensive thing in the frame, so a sustained downshift has to be
 * able to take them down too — otherwise the controller keeps shrinking the
 * framebuffer while the real cost sits untouched behind it.
 *
 * IMPORTANT — what this can and cannot do: every value it changes is a live
 * uniform or a render-target scale, so the valve works without touching the
 * graph. Removing a march entirely is a topology change and stays on the
 * declared `pipeline-rebuild` path; under starvation the marches therefore run
 * at their smallest target and lowest sample count with the composite gain
 * halved, rather than disappearing. That is the honest bound, and it is still
 * roughly an order of magnitude off the high tier's cost.
 */
export function adaptScreenSpacePostForPressure(
  runtime: ScreenSpacePostRuntime,
  pressure: Readonly<{ pixelRatioCap: number; requestedPixelRatioCap: number }>,
): ScreenSpacePostRuntime {
  const requested = pressure.requestedPixelRatioCap > 0 ? pressure.requestedPixelRatioCap : 1;
  const ratio = clamp(pressure.pixelRatioCap / requested, 0, 1);
  if (ratio >= SCREEN_SPACE_PRESSURE_DEMOTE_RATIO) return runtime;
  const starved = ratio < SCREEN_SPACE_PRESSURE_STARVE_RATIO;
  const demote = (tier: ScreenSpaceTier): ScreenSpaceTier => (tier === 'high' ? 'low' : tier);
  const shadowsEnabled = runtime.godrays.unavailableReason === null;
  const godrays = resolveGodraysTuning(demote(runtime.godrays.quality), { shadowsEnabled });
  const reflections = resolveScreenSpaceReflectionTuning(demote(runtime.reflections.quality));
  const globalIllumination = resolveScreenSpaceGiTuning(demote(runtime.globalIllumination.quality));
  if (!starved) {
    return Object.freeze({ ...runtime, godrays, reflections, globalIllumination });
  }
  return Object.freeze({
    ...runtime,
    godrays: Object.freeze({
      ...godrays,
      resolutionScale: godrays.resolutionScale * STARVED_RESOLUTION_SCALE,
      raymarchSteps: Math.max(8, Math.round(godrays.raymarchSteps * STARVED_GAIN_SCALE)),
      additiveGain: godrays.additiveGain * STARVED_GAIN_SCALE,
    }),
    reflections: Object.freeze({
      ...reflections,
      resolutionScale: reflections.resolutionScale * STARVED_RESOLUTION_SCALE,
      marchQuality: reflections.marchQuality * STARVED_GAIN_SCALE,
      intensity: reflections.intensity * STARVED_GAIN_SCALE,
    }),
    globalIllumination: Object.freeze({
      ...globalIllumination,
      sliceCount: 1,
      stepCount: Math.max(4, Math.round(globalIllumination.stepCount * STARVED_GAIN_SCALE)),
      giIntensity: globalIllumination.giIntensity * STARVED_GAIN_SCALE,
    }),
  });
}
