/**
 * HF-398 — the ray-traced preset's tuning data and its fail-closed bounds.
 *
 * This file is to the ray tracer what `screen-space-post-profile.ts` is to the
 * screen-space stack: it owns the numbers and the combat-safety envelope, and
 * `raytraced-light-node.ts` owns the graph. Every ceiling below is a CLAMP the
 * resolver applies, not advice a future edit is trusted to follow.
 *
 * =====================================================================
 * NAMING. THIS PRESET IS NOT CALLED "RTX", AND HERE IS WHY.
 * =====================================================================
 * No shipping browser exposes a hardware ray-tracing pipeline. There is no ray
 * query, no acceleration-structure API and no extension a web page can request;
 * RT cores are not addressable from inside a tab on any GPU, including the
 * review machine's. A preset named "RTX" would therefore be a truth claim the
 * build cannot back, and every player with a capable card who selected it and
 * saw software shading would be right to file a bug.
 *
 * What this preset IS, is genuine classic recursive ray tracing: real
 * geometric intersection against real world-space geometry, recursing at
 * reflective and refractive surfaces and casting shadow rays at lights. So the
 * words "ray traced" are honest and need no scare quotes. The four claims it
 * still may never make, in a label, a tooltip, a log line or a commit message:
 * RTX, hardware acceleration, RT cores, and path tracing.
 *
 * =====================================================================
 * THE COLD-COMPILE BUDGET, WHICH IS THE REASON MOST OF THESE NUMBERS ARE
 * WHAT THEY ARE.
 * =====================================================================
 * This project admits a match against a 4000 ms WebGPU queue-completion bound
 * (`assertWebGpuAdmissionCompletionLatency`). MAX already exceeds it, measured
 * at 5.17 / 5.59 / 6.48 / 6.54 s, and bounces the player back to the menu. The
 * fence is FROZEN: nothing here raises it, widens a timeout or exempts a preset
 * from it.
 *
 * A classic ray tracer has a nastier shape here than a stack of small post
 * passes: the trace is ONE large fragment shader, so its cold compile arrives
 * as a single long stall landing squarely on the admission frame. HF-438 folds
 * the trace into QUALITY and MAX, so the integration — where the cost is paid
 * and what stays a Custom opt-in — is stated as data in
 * `RAY_TRACED_FOLD_INTEGRATION` rather than trusted to a comment.
 */

import {
  type Vec3,
  type WhittedMaterialType,
  vec3,
} from './whitted-materials';
import {
  type ProxyScene,
  DEFAULT_PROXY_EXTRACTION,
} from './analytic-proxy-scene';
import {
  type ThinLensCamera,
  type TraceLight,
  type TraceOptions,
  type TraceSurfaceContext,
  apertureBlurCircleDiameterPx,
  traceRay,
} from './whitted-tracer';

/**
 * The player-facing tiers.
 *
 * `reflections` is the tier that pays for itself first: true reflections and
 * pixel-perfect shadows, no refraction recursion, no caustics.
 * `refractions` adds the transmissive half — refraction through glass and water
 * and the shadow-ray caustics that survive it.
 */
export type RayTracingTier = 'off' | 'reflections' | 'refractions';

// ---------------------------------------------------------------------------
// The combat-safety envelope. Clamps, not advice.
// ---------------------------------------------------------------------------

/**
 * Largest linear-HDR value the ray-traced layer may ADD to a pixel.
 *
 * The whole contribution composites with `+`, exactly like the godray, SSR and
 * SSGI tiers this project already ships: it can brighten a pixel and has no
 * code path by which it can darken one. That is what makes it structurally
 * incapable of hiding something that renders today. The ceiling is the same
 * order as `GODRAY_MAXIMUM_ADDITIVE_GAIN` (0.22), which is the additive bound
 * this project has already proven safe on these arenas.
 */
export const RAY_TRACED_MAXIMUM_ADDITIVE_GAIN = 0.2;

/**
 * The bound that actually protects an enemy silhouette.
 *
 * WORK IT THROUGH PROPERLY, because the obvious derivation is wrong and this
 * one was wrong first. Weber contrast is |a - b| / b for a target at luminance
 * `a` against a background at `b`. The traced layer lands on the BACKGROUND and
 * not on the target: an operator is cloth, webbing and scuffed gear, well above
 * the gloss ramp's ceiling, so `mirrorWeight` is exactly zero on him. Add `g`
 * to the background only and the NUMERATOR moves too — which the first version
 * of this comment quietly assumed it did not.
 *
 * Two cases, and they point in opposite directions:
 *
 *   TARGET DARKER THAN BACKGROUND (a < b), the common case: contrast becomes
 *   (b + g - a)/(b + g), which is strictly GREATER than (b - a)/b. Brightening
 *   the wall behind a dark operator makes him easier to see, not harder.
 *
 *   TARGET BRIGHTER THAN BACKGROUND (a > b) — a light operator against dark wet
 *   asphalt — is the case that costs: (a - b - g)/(b + g). With g = k*b this is
 *
 *       C_after = (C_before - k) / (1 + k)
 *
 *   which is worse than the naive C_before/(1+k). The bound is therefore
 *   written against this case, because a bound written against the average case
 *   is not a bound.
 *
 * At k = 0.06 a silhouette needs a baseline of
 * `RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST` (0.431) to still clear the
 * project's 0.35 READABLE threshold with the preset on. That is the honest
 * price of this preset, and it is the reason k is a sixteenth rather than
 * something more photogenic: raising it needs MEASURED per-arena silhouette
 * contrasts, not a preference.
 */
export const RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION = 0.06;

/**
 * The project's EXISTING enemy-readability threshold, restated here rather than
 * invented: `scripts/qa/measure-below-deck-silhouette.mjs` calls a staged bot
 * READABLE at Weber contrast >= 0.35 against its own background. This preset
 * does not get to move it, soften it, or measure something else instead.
 */
export const PROJECT_READABLE_WEBER_CONTRAST = 0.35;

/**
 * The baseline contrast a silhouette needs for the preset to be provably safe
 * on it. Derived, not chosen: it is exactly the contrast that lands on the
 * project threshold after the worst-case relative addition above.
 */
export const RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST =
  PROJECT_READABLE_WEBER_CONTRAST * (1 + RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION)
  + RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION;

/**
 * Hard recursion depth per tier. Two mirrors facing each other will eat any
 * depth offered and the visual return past a few bounces is nil, so this is a
 * number that is held rather than a quality dial.
 */
export const RAY_TRACED_MAXIMUM_RECURSION_DEPTH = 3;

/**
 * Shadow-casting lights the tracer is allowed. One — the sun. Pixel-perfect
 * shadows are the single most legible win this technique offers and they are
 * per-light per-hit, so the count is declared and held rather than discovered.
 */
export const RAY_TRACED_SHADOW_CASTING_LIGHTS = 1;

/**
 * Screen-area budgets, as fractions of the frame. Every Metal and Transparent
 * surface spawns recursion, and one huge glass wall costs far more than twenty
 * bottles, so the budget is area and never a count of objects.
 */
export const RAY_TRACED_METAL_SCREEN_AREA_BUDGET = 0.12;
export const RAY_TRACED_TRANSPARENT_SCREEN_AREA_BUDGET = 0.06;

/**
 * Caustics earn their cost only where a small bright light, a transparent
 * object with real thickness, and a plain receiving surface behind it all
 * coincide. One caustic-casting light and one caustic-casting object per view
 * is the design decision, not a limitation to work around.
 */
export const RAY_TRACED_CAUSTIC_LIGHTS_PER_VIEW = 1;
export const RAY_TRACED_CAUSTIC_OBJECTS_PER_VIEW = 1;

/**
 * Analytic proxy shapes every ray tests, and therefore the single number that
 * decides the trace's arithmetic cost. Declared, not discovered: at this count
 * a shaded pixel runs at most 24 box tests for the reflection ray, 24 for its
 * shadow ray and, at the refraction tier, the same again for the transmitted
 * ray — a stateable ~96 intersections rather than a scene-dependent unknown.
 */
export const RAY_TRACED_MAXIMUM_SHAPES = DEFAULT_PROXY_EXTRACTION.maximumShapes;

/**
 * THE GLOSS RAMP — how smooth a surface has to be to receive a traced
 * reflection, and why it is NOT the same number as the material classifier's
 * mirror ceiling.
 *
 * `MIRROR_ROUGHNESS_CEILING` (0.22) answers a different question: "is this
 * surface a MIRROR", i.e. does it get the Metal material with a tinted,
 * recognisable, image-forming reflection. That boundary is right where it is.
 *
 * This pair answers "does this surface reflect AT ALL, and how strongly". A
 * rougher surface still reflects; it reflects blurrily. The measured reality of
 * these arenas made the distinction load-bearing rather than pedantic: a walk
 * of the live scene graph (`scripts/qa/probe-arena-surface-roughness.mjs`)
 * counted, on Nuke Town, 2 meshes below 0.10 roughness, 13 below 0.15, 80 below
 * 0.22 — and 1179 in the 0.22-to-0.50 band. Cutting the ramp at 0.22 therefore
 * produced a technically correct reflection layer that landed on a handful of
 * window panes and was, in practice, invisible.
 *
 * Widening it is defensible on the technique's own terms, not just on taste:
 * the reflected image here comes off a coarse analytic proxy set, so it is
 * already low-frequency — which is exactly what a blurred glossy reflection
 * looks like. Using it for the semi-gloss band is a closer approximation than
 * discarding the band entirely.
 *
 * It costs nothing in readability, because the strength ramp is not what bounds
 * this layer: the absolute linear-HDR ceiling and the per-pixel relative
 * ceiling are, and both are applied after it.
 */
export const RAY_TRACED_GLOSS_RAMP_FLOOR = 0.05;
export const RAY_TRACED_GLOSS_RAMP_CEILING = 0.5;

/**
 * Pixels further than this are excluded from the trace entirely.
 *
 * Two reasons, both load-bearing. First, the sky dome and the additive
 * atmosphere cards are non-PBR materials that leave metalness and roughness
 * zero-initialised, which the classifier would otherwise read as a perfect
 * mirror and turn the sky to chrome. Second, it caps the trace's screen area:
 * the gameplay far plane is 180 m and every authored arena fits inside about
 * 45 m of playable depth, so nothing inside the combat band is lost.
 */
export const RAY_TRACED_GEOMETRY_DEPTH_LIMIT_M = 200;

// ---------------------------------------------------------------------------
// Aperture and focal distance
// ---------------------------------------------------------------------------

/**
 * The combat band this project already defends, restated from
 * `screen-space-post-profile.ts` rather than redefined. Nothing here widens it.
 */
export const RAY_TRACED_MIDFIELD_NEAR_M = 1.5;
export const RAY_TRACED_MIDFIELD_FAR_M = 45;

/**
 * The project's existing blur ceiling inside that band, in pixels. Reused
 * verbatim: a second, looser ceiling for a second effect is how a frozen bound
 * quietly stops being one.
 */
export const RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX = 0.5;

/**
 * =====================================================================
 * APERTURE AND FOCAL DISTANCE — THE DECISION, AND WHAT IS ACTUALLY SHIPPED.
 * =====================================================================
 *
 * Classic ray tracing offers real thin-lens depth of field: aperture ray
 * spread rather than a post-process blur, with no depth-buffer halos and no
 * bleeding across silhouettes. It costs variance rather than a pass.
 *
 * WHAT IS SHIPPED HERE: a pinhole, and the arithmetic that proves it has to be
 * one. This layer is a SECONDARY-ray pass over a rasterized primary image, so
 * it does not own primary visibility and cannot spread camera rays across a
 * lens even if the budget allowed it. That makes the aperture question a bound
 * rather than a look knob — and the bound turns out to be decisive on its own.
 *
 * Work it through at the arenas' authored 82-degree field of view, focused at
 * the existing 26 m plane, on a 2160-line framebuffer. The blur circle at the
 * NEAR end of the combat band, 1.5 m, is
 *
 *     c_px = A * |d - f| * H / (2 * d^2 * tan(fovY/2))
 *
 * which for the project's unchanged 0.5 px ceiling admits an aperture DIAMETER
 * of about 20 micrometres. There is no aperture wide enough to be visible that
 * is also narrow enough to leave a muzzle flash, a silhouette edge or a world
 * marker at engagement range unsoftened. So the gameplay camera is a pinhole,
 * every ray is sharp, and the honest reading of "pick an aperture so depth of
 * field reads as intent" is: on the gameplay camera it cannot, and pretending
 * otherwise costs the player targets.
 *
 * That is why the RAY TRACED preset also leaves `depthOfField` OFF. The
 * existing bokeh pass is a real, separately-proven effect and it is untouched
 * by this work; this preset simply does not spend its budget there.
 *
 * The wide aperture belongs to photo mode, spectator and replay cameras, and
 * the constant below records what it would be — but nothing in this build
 * consumes it yet, and it is labelled so rather than left to look wired.
 */

/**
 * Gameplay aperture RADIUS, metres. A pinhole in every practical sense, and
 * derived rather than chosen: it is the largest radius that keeps the blur
 * circle under the project's unchanged 0.5 px ceiling across the whole
 * engagement band at `RAY_TRACED_APERTURE_PROOF_HEIGHT_PX`, with margin.
 */
export const RAY_TRACED_GAMEPLAY_APERTURE_RADIUS_M = 8e-6;

/**
 * Framebuffer height the aperture bound is proven at. 2160 rather than 1080
 * because the blur circle in PIXELS grows with resolution, so proving it on a
 * 1080-line buffer would prove nothing about the machine the owner plays on.
 */
export const RAY_TRACED_APERTURE_PROOF_HEIGHT_PX = 2160;

/**
 * NOT WIRED. What a presentation camera — photo mode, spectator, replay —
 * would use once one owns primary visibility. It is recorded here so the
 * safety case does not have to be re-derived later, and it is deliberately
 * not referenced by any resolver: a constant that looks wired and is not is
 * the exact defect this project has paid for three times.
 */
export const RAY_TRACED_PRESENTATION_APERTURE_RADIUS_M = 6e-3;

/** Default focal distance, matching the existing depth-of-field focus plane. */
export const RAY_TRACED_DEFAULT_FOCAL_DISTANCE_M = 26;

/** Focal distance is clamped to the band the arenas actually use. */
export const RAY_TRACED_FOCAL_DISTANCE_MINIMUM_M = 2;
export const RAY_TRACED_FOCAL_DISTANCE_MAXIMUM_M = 90;

// ---------------------------------------------------------------------------
// Resolved tuning
// ---------------------------------------------------------------------------

export type RayTracingTuning = Readonly<{
  tier: RayTracingTier;
  enabled: boolean;
  /** Why the tier is not running when the player asked for one. */
  unavailableReason: string | null;
  /** Recursion depth actually used. */
  maximumDepth: number;
  refractionsEnabled: boolean;
  causticsEnabled: boolean;
  /** Shadow-casting lights the trace is allowed to query. */
  shadowCastingLights: number;
  /** Analytic proxy shapes the trace intersects, per ray. */
  maximumProxyShapes: number;
  /** Linear-HDR ceiling on the additive contribution. */
  maximumAdditiveGain: number;
  /** Ceiling as a fraction of the shaded pixel's own luminance. */
  backgroundLuminanceFraction: number;
  /** Metal and Transparent screen-area budgets. */
  metalScreenAreaBudget: number;
  transparentScreenAreaBudget: number;
  /** Aperture in use, metres of radius. Always the gameplay pinhole today. */
  apertureRadiusM: number;
  focalDistanceM: number;
}>;

export const RAY_TRACING_DISABLED: RayTracingTuning = Object.freeze({
  tier: 'off',
  enabled: false,
  unavailableReason: null,
  maximumDepth: 0,
  refractionsEnabled: false,
  causticsEnabled: false,
  shadowCastingLights: 0,
  maximumProxyShapes: 0,
  maximumAdditiveGain: 0,
  backgroundLuminanceFraction: 0,
  metalScreenAreaBudget: 0,
  transparentScreenAreaBudget: 0,
  apertureRadiusM: 0,
  focalDistanceM: RAY_TRACED_DEFAULT_FOCAL_DISTANCE_M,
});

export type RayTracingCapability = Readonly<{
  /**
   * The trace needs the packed metalness/roughness attachment to know which
   * surfaces are reflective at all. Without it every surface would read as a
   * perfectly smooth dielectric and the whole frame would turn to chrome.
   */
  materialAttachmentAvailable: boolean;
  /** The trace needs world-space normals. */
  normalAttachmentAvailable: boolean;
  /** Shadow rays are only meaningful against a shadow-casting sun. */
  shadowsEnabled: boolean;
  /** Focal plane the aperture bound is proven against. */
  focalDistanceM?: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveRayTracingTuning(
  tier: RayTracingTier,
  capability: RayTracingCapability,
): RayTracingTuning {
  if (tier === 'off') return RAY_TRACING_DISABLED;
  const missing = !capability.normalAttachmentAvailable
    ? 'Ray tracing needs the scene normal attachment; it is not present on this route.'
    : !capability.materialAttachmentAvailable
      ? 'Ray tracing needs the packed metalness/roughness attachment; it is not present on this route.'
      : !capability.shadowsEnabled
        ? 'Ray-traced shadows need a shadow-casting sun; enable Sun shadows.'
        : null;
  if (missing !== null) {
    return Object.freeze({ ...RAY_TRACING_DISABLED, tier, unavailableReason: missing });
  }
  const refractions = tier === 'refractions';
  const tuning: RayTracingTuning = Object.freeze({
    tier,
    enabled: true,
    unavailableReason: null,
    // Reflections need one bounce plus the surface itself; refractions need the
    // extra level so a ray can enter and leave a pane of glass.
    maximumDepth: Math.min(refractions ? 3 : 2, RAY_TRACED_MAXIMUM_RECURSION_DEPTH),
    refractionsEnabled: refractions,
    causticsEnabled: refractions,
    shadowCastingLights: RAY_TRACED_SHADOW_CASTING_LIGHTS,
    maximumProxyShapes: RAY_TRACED_MAXIMUM_SHAPES,
    // NOTE ON TRACE RESOLUTION. A secondary image is dim, Fresnel-weighted and
    // low frequency, so tracing it below native and reconstructing is the
    // largest cost lever this technique has. It is deliberately NOT claimed
    // here: this build traces at full resolution, because a reduced-resolution
    // trace needs its own render target and a reconstruction filter, and a
    // declared number that the graph does not honour is worse than no number.
    // It is the first lever to pull if a future arena misses the fence.
    maximumAdditiveGain: RAY_TRACED_MAXIMUM_ADDITIVE_GAIN,
    backgroundLuminanceFraction: RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION,
    metalScreenAreaBudget: RAY_TRACED_METAL_SCREEN_AREA_BUDGET,
    transparentScreenAreaBudget: RAY_TRACED_TRANSPARENT_SCREEN_AREA_BUDGET,
    // Always the gameplay pinhole. There is no presentation camera on this
    // route yet, and a role switch that nothing can reach is a branch that
    // only exists to look complete.
    apertureRadiusM: RAY_TRACED_GAMEPLAY_APERTURE_RADIUS_M,
    focalDistanceM: clamp(
      capability.focalDistanceM ?? RAY_TRACED_DEFAULT_FOCAL_DISTANCE_M,
      RAY_TRACED_FOCAL_DISTANCE_MINIMUM_M,
      RAY_TRACED_FOCAL_DISTANCE_MAXIMUM_M,
    ),
  });
  // Fail closed at the point of resolution, not merely in a suite: a tier the
  // player can select is a promise that selecting it is safe, and this is
  // where that promise is checked.
  assertRayTracingCombatSafety(tuning);
  return tuning;
}

// ---------------------------------------------------------------------------
// Fail-closed proofs
// ---------------------------------------------------------------------------

/**
 * Weber contrast of a target against its background, which is the metric
 * `measure-below-deck-silhouette.mjs` already reports for a staged bot.
 */
export function weberContrast(targetLuminance: number, backgroundLuminance: number): number {
  if (!(backgroundLuminance > 0)) return 0;
  return Math.abs(targetLuminance - backgroundLuminance) / backgroundLuminance;
}

/**
 * The contrast a silhouette is left with once the ray-traced layer has added
 * its worst-case share to the background.
 */
export function contrastAfterRayTracedAddition(
  baselineContrast: number,
  tuning: RayTracingTuning,
): number {
  if (!tuning.enabled) return baselineContrast;
  // The bright-target case, which is the one that loses contrast. The
  // dark-target case gains it, so reporting the worst of the two is the only
  // honest single number.
  const k = tuning.backgroundLuminanceFraction;
  return Math.max(0, (baselineContrast - k) / (1 + k));
}

/**
 * Fail-closed proof that a resolved tuning cannot take a readable silhouette
 * below the project's threshold, and cannot exceed any declared budget.
 *
 * Called from the resolver — not merely asserted in a test — so a future tuning
 * edit that breaks a bound fails at graph construction and on every live push,
 * exactly the way `assertScreenSpacePostCombatSafety` already does.
 */
export function assertRayTracingCombatSafety(tuning: RayTracingTuning): void {
  if (!tuning.enabled) return;
  if (tuning.maximumAdditiveGain > RAY_TRACED_MAXIMUM_ADDITIVE_GAIN) {
    throw new Error(
      `HF-398 ray-traced additive gain ${tuning.maximumAdditiveGain} exceeds ${RAY_TRACED_MAXIMUM_ADDITIVE_GAIN}`,
    );
  }
  if (tuning.backgroundLuminanceFraction > RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION) {
    throw new Error(
      `HF-398 ray-traced relative gain ${tuning.backgroundLuminanceFraction} exceeds ${RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION}`,
    );
  }
  if (tuning.maximumDepth > RAY_TRACED_MAXIMUM_RECURSION_DEPTH) {
    throw new Error(
      `HF-398 ray-traced recursion depth ${tuning.maximumDepth} exceeds ${RAY_TRACED_MAXIMUM_RECURSION_DEPTH}`,
    );
  }
  if (tuning.shadowCastingLights > RAY_TRACED_SHADOW_CASTING_LIGHTS) {
    throw new Error(
      `HF-398 ray-traced shadow light count ${tuning.shadowCastingLights} exceeds ${RAY_TRACED_SHADOW_CASTING_LIGHTS}`,
    );
  }
  if (tuning.metalScreenAreaBudget > RAY_TRACED_METAL_SCREEN_AREA_BUDGET
    || tuning.transparentScreenAreaBudget > RAY_TRACED_TRANSPARENT_SCREEN_AREA_BUDGET) {
    throw new Error('HF-398 ray-traced recursive surface screen-area budget exceeded');
  }
  // The silhouette bound itself, evaluated rather than assumed: a baseline that
  // was exactly at the project's safe floor must still land on the project's
  // threshold, never below it.
  const worstCase = contrastAfterRayTracedAddition(RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST, tuning);
  if (!(worstCase >= PROJECT_READABLE_WEBER_CONTRAST - 1e-9)) {
    throw new Error(
      `HF-398 ray-traced layer would take a ${RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST.toFixed(3)} `
      + `baseline silhouette contrast to ${worstCase.toFixed(3)}, below the project's `
      + `${PROJECT_READABLE_WEBER_CONTRAST} READABLE threshold`,
    );
  }
  // And the aperture, at the arenas' authored field of view, on the tallest
  // framebuffer the preset is offered on. This is why the gameplay camera is a
  // pinhole: it is the only aperture that passes.
  assertRayTracedApertureCombatSafety(
    gameplayApertureCamera(tuning.focalDistanceM, tuning.apertureRadiusM),
    RAY_TRACED_APERTURE_PROOF_HEIGHT_PX,
  );
}

/**
 * The camera the aperture bound is proven against: the arenas' authored
 * 82-degree horizontal field of view on 16:9, which is the widest the FOV
 * slider reaches and therefore the worst case for the blur circle.
 */
export function gameplayApertureCamera(
  focalDistanceM: number,
  apertureRadiusM: number,
): ThinLensCamera {
  const aspect = 16 / 9;
  return Object.freeze({
    position: vec3(0, 1.6, 0),
    forward: vec3(0, 0, -1),
    right: vec3(1, 0, 0),
    up: vec3(0, 1, 0),
    tanHalfFovY: Math.tan((AUTHORED_MAXIMUM_HORIZONTAL_FOV_DEGREES * Math.PI) / 360) / aspect,
    aspect,
    apertureRadiusM,
    focalDistanceM,
  });
}

/**
 * The widest the field-of-view slider goes (`#field-of-view`, 70-100). Wider
 * FOV means a larger world span per pixel, so 100 is the worst case here.
 */
export const AUTHORED_MAXIMUM_HORIZONTAL_FOV_DEGREES = 100;

/**
 * Fail-closed proof that the aperture keeps the blur circle below the smallest
 * feature a player has to identify, across the whole engagement band.
 *
 * The band is sampled densely rather than at its endpoints: the blur circle is
 * monotonic away from the focal plane today, and a future tuning that is not
 * must not be able to slip through a two-point check.
 */
export function assertRayTracedApertureCombatSafety(
  camera: ThinLensCamera,
  framebufferHeightPx: number,
): void {
  const steps = 64;
  for (let index = 0; index <= steps; index += 1) {
    const distance = RAY_TRACED_MIDFIELD_NEAR_M
      + (RAY_TRACED_MIDFIELD_FAR_M - RAY_TRACED_MIDFIELD_NEAR_M) * (index / steps);
    const diameter = apertureBlurCircleDiameterPx(camera, distance, framebufferHeightPx);
    if (!(diameter <= RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX)) {
      throw new Error(
        `HF-398 ray-traced aperture would blur the combat midfield: ${diameter.toFixed(3)}px at `
        + `${distance.toFixed(1)}m exceeds the ${RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX}px ceiling `
        + `(aperture radius ${camera.apertureRadiusM} m, focus ${camera.focalDistanceM} m)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Preset parity, stated in writing because the skill requires it to be
// ---------------------------------------------------------------------------

/**
 * THE PARITY RULE, DECIDED AND WRITTEN DOWN.
 *
 * A reflective surface can show a player an enemy around a corner that no other
 * preset reveals. That is a competitive-integrity decision, not a graphics
 * feature, so it is settled here rather than discovered by a player:
 *
 *   PLAYERS, BOTS, VEHICLES AND ANY OTHER DYNAMIC OBJECT ARE NOT IN THE PROXY
 *   SET, AT ANY TIER.
 *
 * The trace intersects static arena architecture only. It therefore cannot
 * reflect a body, cannot duplicate an enemy into a mirror, and cannot supply
 * one bit of positional information that the Performance preset does not also
 * give. The preset buys the room a nicer surface, and buys the player nothing.
 *
 * The same decision removes the mirror-doubling readability failure at its
 * root: there is no code path by which a reflected enemy image can exist, so
 * there is nothing for a player to shoot at by mistake.
 */
export const RAY_TRACED_PRESET_PARITY = Object.freeze({
  dynamicObjectsTraced: false,
  reflectedPlayersPossible: false,
  statement: 'Ray tracing intersects static arena geometry only. No player, bot or vehicle is in the '
    + 'proxy set, so the preset cannot reveal a position the baseline preset cannot.',
});

/**
 * Where the ray-traced layer's integration cost is paid, stated as data rather
 * than as a comment somebody can quietly disagree with. HF-398's retired
 * preset bought its trace by spending less than MAX; HF-438 folds the trace
 * into the ladder itself, so the statement is now about QUALITY (light tier)
 * and MAX (full tier) and about what the fold deliberately does NOT do.
 */
export const RAY_TRACED_FOLD_INTEGRATION: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['QUALITY (light tier)', 'Carries the reflection trace with MSAA 4x and its low screen-space reflections kept, AO raised off to HIGH (0.5 resolution scale, 12 samples, denoise): the fold is additive and the rung stays the auto-selected default.'] as const),
  Object.freeze(['MAX (full tier)', 'Carries the reflection trace on top of the full stack (ultra AO, ultra PMREM probes, high SSGI); the audit counts the added pipelines at admission and the tripwire requires zero pipelines compiled in combat.'] as const),
  Object.freeze(['Refractions stay Custom', 'The refraction tier (one extra recursion level plus caustics) remains a deliberate Custom opt-in until it has a measured cold-compile figure on every arena, exactly the discipline that keeps spatial upscaling out of every preset.'] as const),
  Object.freeze(['Admission fence unchanged', 'The cold-compile admission fence is not widened: the menu-time precompile the ladder relies on covers the folded control sets, and no combat-time compile is admitted anywhere.'] as const),
]);

export type ReadabilityProbe = Readonly<{
  distanceM: number;
  /** Linear luminance of the enemy silhouette at that range. */
  silhouetteLuminance: number;
  /** Linear luminance of the local background behind it. */
  backgroundLuminance: number;
}>;

export type ReadabilityVerdict = Readonly<{
  distanceM: number;
  baselineContrast: number;
  tracedContrast: number;
  readable: boolean;
}>;

/**
 * Evaluates the silhouette bound at a set of engagement distances.
 *
 * Deliberately takes MEASURED luminances rather than inventing them: the
 * project already has a harness that reports a staged bot's luminance against
 * its background, and asserting the input instead of the output is the exact
 * failure that let a skin system pass for months while being arithmetically
 * incapable of showing a skin.
 */
export function evaluateReadability(
  probes: readonly ReadabilityProbe[],
  tuning: RayTracingTuning,
): readonly ReadabilityVerdict[] {
  return Object.freeze(probes.map((probe) => {
    const baseline = weberContrast(probe.silhouetteLuminance, probe.backgroundLuminance);
    const traced = contrastAfterRayTracedAddition(baseline, tuning);
    return Object.freeze({
      distanceM: probe.distanceM,
      baselineContrast: baseline,
      tracedContrast: traced,
      readable: traced >= PROJECT_READABLE_WEBER_CONTRAST,
    });
  }));
}

/**
 * Traces a canonical engagement view and reports the peak additive radiance the
 * layer produced. This is the OUTPUT assertion: it proves what the tracer
 * actually returns, not what was written into its configuration.
 */
export function peakTracedRadiance(
  scene: ProxyScene,
  lights: readonly TraceLight[],
  context: TraceSurfaceContext,
  camera: ThinLensCamera,
  tuning: RayTracingTuning,
  samplesAcross = 17,
): number {
  if (!tuning.enabled) return 0;
  const options: TraceOptions = Object.freeze({
    maximumDepth: tuning.maximumDepth,
    refractionsEnabled: tuning.refractionsEnabled,
    causticsEnabled: tuning.causticsEnabled,
    maximumAdditiveGain: tuning.maximumAdditiveGain,
    environmentRadiance: vec3(0.05, 0.055, 0.07),
  });
  let peak = 0;
  for (let y = 0; y < samplesAcross; y += 1) {
    for (let x = 0; x < samplesAcross; x += 1) {
      const ndcX = (x / (samplesAcross - 1)) * 2 - 1;
      const ndcY = (y / (samplesAcross - 1)) * 2 - 1;
      const px = ndcX * camera.tanHalfFovY * camera.aspect;
      const py = ndcY * camera.tanHalfFovY;
      const direction = normaliseDirection(camera, px, py);
      const radiance = traceRay(camera.position, direction, scene, lights, context, options);
      peak = Math.max(peak, radiance[0], radiance[1], radiance[2]);
    }
  }
  return peak;
}

function normaliseDirection(camera: ThinLensCamera, px: number, py: number): Vec3 {
  const x = camera.forward[0] + camera.right[0] * px + camera.up[0] * py;
  const y = camera.forward[1] + camera.right[1] * px + camera.up[1] * py;
  const z = camera.forward[2] + camera.right[2] * px + camera.up[2] * py;
  const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;
  return vec3(x / magnitude, y / magnitude, z / magnitude);
}

/**
 * The material-class audit the skill's material section asks for: how much of a
 * classified frame ended up in each recursive class, so the screen-area budgets
 * are checked against reality instead of intention.
 */
export type MaterialClassAudit = Readonly<{
  areaByType: Readonly<Record<WhittedMaterialType, number>>;
  readabilityDemotions: number;
  withinBudget: boolean;
  violations: readonly string[];
}>;

export function auditMaterialClasses(
  entries: readonly Readonly<{ type: WhittedMaterialType; screenAreaFraction: number; readabilityDemotion: boolean }>[],
  tuning: RayTracingTuning,
): MaterialClassAudit {
  const areaByType: Record<WhittedMaterialType, number> = {
    phong: 0, metal: 0, clearcoat: 0, transparent: 0,
  };
  let readabilityDemotions = 0;
  for (const entry of entries) {
    areaByType[entry.type] += Math.max(0, entry.screenAreaFraction);
    if (entry.readabilityDemotion) readabilityDemotions += 1;
  }
  const violations: string[] = [];
  if (areaByType.metal > tuning.metalScreenAreaBudget) {
    violations.push(`metal-screen-area:${areaByType.metal.toFixed(3)}>${tuning.metalScreenAreaBudget}`);
  }
  if (areaByType.transparent > tuning.transparentScreenAreaBudget) {
    violations.push(`transparent-screen-area:${areaByType.transparent.toFixed(3)}>${tuning.transparentScreenAreaBudget}`);
  }
  return Object.freeze({
    areaByType: Object.freeze(areaByType),
    readabilityDemotions,
    withinBudget: violations.length === 0,
    violations: Object.freeze(violations),
  });
}
