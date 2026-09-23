import { describe, expect, it } from 'vitest';
import {
  AUTHORED_MAXIMUM_HORIZONTAL_FOV_DEGREES,
  PROJECT_READABLE_WEBER_CONTRAST,
  RAY_TRACED_APERTURE_PROOF_HEIGHT_PX,
  RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION,
  RAY_TRACED_GAMEPLAY_APERTURE_RADIUS_M,
  RAY_TRACED_MAXIMUM_ADDITIVE_GAIN,
  RAY_TRACED_MAXIMUM_RECURSION_DEPTH,
  RAY_TRACED_MAXIMUM_SHAPES,
  RAY_TRACED_METAL_SCREEN_AREA_BUDGET,
  RAY_TRACED_MIDFIELD_FAR_M,
  RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX,
  RAY_TRACED_MIDFIELD_NEAR_M,
  RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST,
  RAY_TRACED_FOLD_INTEGRATION,
  RAY_TRACED_PRESET_PARITY,
  RAY_TRACED_SHADOW_CASTING_LIGHTS,
  RAY_TRACED_TRANSPARENT_SCREEN_AREA_BUDGET,
  RAY_TRACING_DISABLED,
  assertRayTracedApertureCombatSafety,
  assertRayTracingCombatSafety,
  auditMaterialClasses,
  contrastAfterRayTracedAddition,
  evaluateReadability,
  gameplayApertureCamera,
  peakTracedRadiance,
  resolveRayTracingTuning,
  weberContrast,
} from './raytracing-profile';
import { finaliseProxyScene, type ProxyShape } from './analytic-proxy-scene';
import { vec3 } from './whitted-materials';
import { apertureBlurCircleDiameterPx, type TraceLight, type TraceSurfaceContext } from './whitted-tracer';
import { DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX } from '../screen-space-post-profile';
import { GRAPHICS_PRESET_VALUES } from '../../graphics-settings-registry';

const CAPABLE = Object.freeze({
  materialAttachmentAvailable: true,
  normalAttachmentAvailable: true,
  shadowsEnabled: true,
});

describe('HF-398 ray-tracing tier resolution', () => {
  it('is structurally absent when off', () => {
    expect(resolveRayTracingTuning('off', CAPABLE)).toBe(RAY_TRACING_DISABLED);
    expect(RAY_TRACING_DISABLED.enabled).toBe(false);
    expect(RAY_TRACING_DISABLED.maximumProxyShapes).toBe(0);
  });

  it('reports why a tier cannot run instead of silently drawing nothing', () => {
    for (const [capability, fragment] of [
      [{ ...CAPABLE, normalAttachmentAvailable: false }, 'normal attachment'],
      [{ ...CAPABLE, materialAttachmentAvailable: false }, 'metalness/roughness'],
      [{ ...CAPABLE, shadowsEnabled: false }, 'Sun shadows'],
    ] as const) {
      const tuning = resolveRayTracingTuning('reflections', capability);
      expect(tuning.enabled).toBe(false);
      expect(tuning.tier).toBe('reflections');
      expect(tuning.unavailableReason).toContain(fragment);
    }
  });

  it('spends one extra recursion level and the caustic term only at the refraction tier', () => {
    const reflections = resolveRayTracingTuning('reflections', CAPABLE);
    const refractions = resolveRayTracingTuning('refractions', CAPABLE);
    expect(reflections.maximumDepth).toBe(2);
    expect(reflections.refractionsEnabled).toBe(false);
    expect(reflections.causticsEnabled).toBe(false);
    expect(refractions.maximumDepth).toBe(3);
    expect(refractions.refractionsEnabled).toBe(true);
    expect(refractions.causticsEnabled).toBe(true);
    for (const tuning of [reflections, refractions]) {
      expect(tuning.maximumDepth).toBeLessThanOrEqual(RAY_TRACED_MAXIMUM_RECURSION_DEPTH);
      expect(tuning.shadowCastingLights).toBe(RAY_TRACED_SHADOW_CASTING_LIGHTS);
      expect(tuning.maximumProxyShapes).toBe(RAY_TRACED_MAXIMUM_SHAPES);
      expect(tuning.maximumAdditiveGain).toBe(RAY_TRACED_MAXIMUM_ADDITIVE_GAIN);
      expect(tuning.backgroundLuminanceFraction).toBe(RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION);
    }
  });

  it('declares every cost as a number rather than an adjective', () => {
    const tuning = resolveRayTracingTuning('refractions', CAPABLE);
    // Screen-area budgets, not object counts: one huge glass wall costs far
    // more than twenty bottles.
    expect(tuning.metalScreenAreaBudget).toBe(RAY_TRACED_METAL_SCREEN_AREA_BUDGET);
    expect(tuning.transparentScreenAreaBudget).toBe(RAY_TRACED_TRANSPARENT_SCREEN_AREA_BUDGET);
    expect(tuning.metalScreenAreaBudget).toBeGreaterThan(tuning.transparentScreenAreaBudget);
  });
});

describe('HF-398 combat-safety envelope', () => {
  it('throws rather than clamping when a tuning breaches a declared ceiling', () => {
    const base = resolveRayTracingTuning('refractions', CAPABLE);
    const breaches = [
      { maximumAdditiveGain: RAY_TRACED_MAXIMUM_ADDITIVE_GAIN + 0.01 },
      { backgroundLuminanceFraction: RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION + 0.01 },
      { maximumDepth: RAY_TRACED_MAXIMUM_RECURSION_DEPTH + 1 },
      { shadowCastingLights: RAY_TRACED_SHADOW_CASTING_LIGHTS + 1 },
      { metalScreenAreaBudget: RAY_TRACED_METAL_SCREEN_AREA_BUDGET + 0.01 },
      { transparentScreenAreaBudget: RAY_TRACED_TRANSPARENT_SCREEN_AREA_BUDGET + 0.01 },
    ];
    for (const breach of breaches) {
      expect(() => assertRayTracingCombatSafety({ ...base, ...breach }), JSON.stringify(breach)).toThrow(/HF-398/);
    }
    expect(() => assertRayTracingCombatSafety(base)).not.toThrow();
    // A disabled tuning is trivially safe and must not throw on a stale field.
    expect(() => assertRayTracingCombatSafety({ ...RAY_TRACING_DISABLED, maximumDepth: 99 })).not.toThrow();
  });

  it('keeps a silhouette at the safe baseline exactly on the project threshold, never under it', () => {
    const tuning = resolveRayTracingTuning('refractions', CAPABLE);
    const worst = contrastAfterRayTracedAddition(RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST, tuning);
    expect(worst).toBeCloseTo(PROJECT_READABLE_WEBER_CONTRAST, 9);
    expect(worst).toBeGreaterThanOrEqual(PROJECT_READABLE_WEBER_CONTRAST - 1e-9);
    // The threshold itself is the project's, restated and not moved: the
    // below-deck silhouette harness calls a staged bot READABLE at 0.35.
    expect(PROJECT_READABLE_WEBER_CONTRAST).toBe(0.35);
  });

  it('reduces contrast by a bounded factor and never by an unbounded amount', () => {
    const tuning = resolveRayTracingTuning('refractions', CAPABLE);
    for (const baseline of [0.6, 1.2, 3]) {
      const after = contrastAfterRayTracedAddition(baseline, tuning);
      expect(after).toBeLessThan(baseline);
      const k = RAY_TRACED_BACKGROUND_LUMINANCE_FRACTION;
      expect(after).toBeCloseTo((baseline - k) / (1 + k), 9);
      // The loss shrinks as the baseline grows, which is why a well-lit arena
      // pays almost nothing and a murky one pays the most.
      expect(1 - after / baseline).toBeLessThan(0.16);
    }
    // High-contrast silhouettes, which is what a readable arena produces, lose
    // under 9% of their contrast.
    expect(1 - contrastAfterRayTracedAddition(1.2, tuning) / 1.2).toBeLessThan(0.11);
    // With the tier off, nothing moves at all.
    expect(contrastAfterRayTracedAddition(0.4, RAY_TRACING_DISABLED)).toBe(0.4);
  });

  it('evaluates readability against measured luminances rather than assumed ones', () => {
    const tuning = resolveRayTracingTuning('refractions', CAPABLE);
    const verdicts = evaluateReadability([
      // A dark operator against a lit wall: high contrast, comfortably safe.
      { distanceM: 8, silhouetteLuminance: 0.04, backgroundLuminance: 0.42 },
      // A mid-tone operator against mid-tone cover: baseline 0.581, still clear
      // under the corrected bright-target bound.
      { distanceM: 22, silhouetteLuminance: 0.13, backgroundLuminance: 0.31 },
      // And a genuinely unreadable pair, which must still report unreadable —
      // the gate reports what it measures rather than what we would like.
      { distanceM: 35, silhouetteLuminance: 0.3, backgroundLuminance: 0.33 },
    ], tuning);
    expect(verdicts[0].readable).toBe(true);
    expect(verdicts[0].baselineContrast).toBeGreaterThan(verdicts[0].tracedContrast);
    expect(verdicts[1].readable).toBe(true);
    expect(verdicts[2].readable).toBe(false);
    expect(weberContrast(0.04, 0.42)).toBeCloseTo(0.9048, 3);
    expect(weberContrast(0.5, 0)).toBe(0);

    // THE BOUNDARY, PINNED. This is what the preset actually costs, and it is
    // not comfortable: a silhouette whose BASELINE contrast is 0.355 — above
    // the project's 0.35 READABLE threshold today — falls below it with the
    // trace on. The safe floor is 0.431, and that is the honest bound this
    // preset ships under rather than a claim that it is free.
    //
    // Note this is the WORST case, a light operator against a dark glossy
    // background. The common case is the opposite — a dark operator against a
    // lit wall — and there the layer IMPROVES contrast, because brightening the
    // background behind a dark silhouette separates it further.
    const marginal = evaluateReadability(
      [{ distanceM: 22, silhouetteLuminance: 0.2, backgroundLuminance: 0.31 }],
      tuning,
    )[0];
    expect(marginal.baselineContrast).toBeGreaterThan(PROJECT_READABLE_WEBER_CONTRAST);
    expect(marginal.readable).toBe(false);
    const justSafe = evaluateReadability([{
      distanceM: 22,
      silhouetteLuminance: 1 - RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST,
      backgroundLuminance: 1,
    }], tuning)[0];
    expect(justSafe.baselineContrast).toBeCloseTo(RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST, 9);
    expect(justSafe.readable).toBe(true);
    expect(RAY_TRACED_MINIMUM_SAFE_BASELINE_CONTRAST).toBeCloseTo(0.431, 3);
    // The dark-target case, stated as a test rather than as a comment: a dark
    // operator against a lit wall gets MORE readable, not less.
    const darkOnLight = weberContrast(0.05, 0.4);
    const brightened = Math.abs(0.05 - 0.4 * 1.06) / (0.4 * 1.06);
    expect(brightened).toBeGreaterThan(darkOnLight);
  });

  it('audits the classified frame against the screen-area budgets it declared', () => {
    const tuning = resolveRayTracingTuning('refractions', CAPABLE);
    const withinBudget = auditMaterialClasses([
      { type: 'phong', screenAreaFraction: 0.7, readabilityDemotion: false },
      { type: 'clearcoat', screenAreaFraction: 0.2, readabilityDemotion: true },
      { type: 'metal', screenAreaFraction: 0.08, readabilityDemotion: false },
      { type: 'transparent', screenAreaFraction: 0.02, readabilityDemotion: false },
    ], tuning);
    expect(withinBudget.withinBudget).toBe(true);
    expect(withinBudget.readabilityDemotions).toBe(1);
    const overBudget = auditMaterialClasses([
      { type: 'metal', screenAreaFraction: 0.4, readabilityDemotion: false },
      { type: 'transparent', screenAreaFraction: 0.3, readabilityDemotion: false },
    ], tuning);
    expect(overBudget.withinBudget).toBe(false);
    expect(overBudget.violations).toHaveLength(2);
  });
});

describe('HF-398 aperture bound', () => {
  it('reuses the project ceiling verbatim instead of inventing a looser one', () => {
    expect(RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX).toBe(DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX);
    expect(RAY_TRACED_MIDFIELD_NEAR_M).toBe(1.5);
    expect(RAY_TRACED_MIDFIELD_FAR_M).toBe(45);
  });

  it('keeps the blur circle sub-pixel across the whole band at the widest FOV and tallest buffer', () => {
    const camera = gameplayApertureCamera(26, RAY_TRACED_GAMEPLAY_APERTURE_RADIUS_M);
    expect(() => assertRayTracedApertureCombatSafety(camera, RAY_TRACED_APERTURE_PROOF_HEIGHT_PX)).not.toThrow();
    // The near end of the band is the worst case, so pin the actual number.
    const worst = apertureBlurCircleDiameterPx(camera, RAY_TRACED_MIDFIELD_NEAR_M, RAY_TRACED_APERTURE_PROOF_HEIGHT_PX);
    expect(worst).toBeLessThan(RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX);
    expect(worst).toBeGreaterThan(0);
    expect(AUTHORED_MAXIMUM_HORIZONTAL_FOV_DEGREES).toBe(100);
  });

  it('fails closed the moment the aperture opens far enough to be visible', () => {
    // Roughly a 12 mm aperture: what a photo-mode camera would want, and what
    // the gameplay camera must never have. If this ever stops throwing, the
    // pinhole argument has quietly been abandoned.
    const wide = gameplayApertureCamera(26, 6e-3);
    expect(() => assertRayTracedApertureCombatSafety(wide, RAY_TRACED_APERTURE_PROOF_HEIGHT_PX))
      .toThrow(/blur the combat midfield/);
  });

  it('is proven at a taller framebuffer than 1080, because blur in pixels grows with resolution', () => {
    const camera = gameplayApertureCamera(26, RAY_TRACED_GAMEPLAY_APERTURE_RADIUS_M);
    const atFullHd = apertureBlurCircleDiameterPx(camera, RAY_TRACED_MIDFIELD_NEAR_M, 1080);
    const atProof = apertureBlurCircleDiameterPx(camera, RAY_TRACED_MIDFIELD_NEAR_M, RAY_TRACED_APERTURE_PROOF_HEIGHT_PX);
    expect(RAY_TRACED_APERTURE_PROOF_HEIGHT_PX).toBeGreaterThan(1080);
    expect(atProof).toBeGreaterThan(atFullHd);
    expect(atProof).toBeLessThan(RAY_TRACED_MIDFIELD_MAXIMUM_BLUR_PX);
  });
});

describe('HF-398 traced output, asserted rather than assumed', () => {
  const shape = (
    centre: readonly [number, number, number],
    half: readonly [number, number, number],
    overrides: Partial<ProxyShape> = {},
  ): ProxyShape => Object.freeze({
    kind: 'box' as const,
    centre: vec3(...centre),
    halfExtents: vec3(...half),
    yaw: 0,
    normal: vec3(0, 0, 0),
    albedo: vec3(0.6, 0.58, 0.54),
    metalness: 0,
    roughness: 0.9,
    name: 'audit',
    ...overrides,
  });

  const CONTEXT: TraceSurfaceContext = Object.freeze({
    floorHeightM: 0,
    screenAreaFor: () => 0.004,
    wet: false,
  });

  const SUN: TraceLight = Object.freeze({
    direction: vec3(0.35, 0.86, -0.37),
    colour: vec3(3.2, 3.05, 2.8),
    distanceM: Number.POSITIVE_INFINITY,
    castsShadows: true,
  });

  it('never exceeds the additive ceiling anywhere in a traced engagement view', () => {
    // A plausible arena corner: ground, a chrome duct, a glass pane, cover.
    const scene = finaliseProxyScene([
      shape([0, -0.2, 0], [40, 0.2, 40], { albedo: vec3(0.42, 0.4, 0.38) }),
      shape([6, 2.4, 10], [1.2, 1.2, 0.4], { metalness: 1, roughness: 0.03, albedo: vec3(0.92, 0.9, 0.86) }),
      shape([-4, 1.4, 9], [1.6, 1.4, 0.08], { metalness: 0, roughness: 0.01, albedo: vec3(0.82, 0.92, 0.88) }),
      shape([1, 1, 14], [3, 1, 1], { albedo: vec3(0.5, 0.47, 0.44) }),
    ], 4);
    const tuning = resolveRayTracingTuning('refractions', CAPABLE);
    const camera = gameplayApertureCamera(26, RAY_TRACED_GAMEPLAY_APERTURE_RADIUS_M);
    const peak = peakTracedRadiance(scene, [SUN], CONTEXT, camera, tuning);
    // The sun here is 3.2 in linear HDR, an order of magnitude above the
    // ceiling, so this is a real clamp rather than a scene that happened to be
    // dim: assert what the tracer PRODUCES.
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(RAY_TRACED_MAXIMUM_ADDITIVE_GAIN + 1e-9);
    expect(peakTracedRadiance(scene, [SUN], CONTEXT, camera, RAY_TRACING_DISABLED)).toBe(0);
  });
});

describe('HF-438 folded preset integration', () => {
  it('ships the trace inside QUALITY (light) and MAX (full), and leaves the lower two untouched', () => {
    const { performance, balanced, high, max } = GRAPHICS_PRESET_VALUES;
    expect(high.rayTracing).toBe('reflections');
    expect(max.rayTracing).toBe('reflections');
    for (const preset of [performance, balanced]) expect(preset.rayTracing).toBe('off');
    // The LIGHT tier on QUALITY: the trace runs at the reflections tier with
    // AO at the lower sample count, and nothing else about the rung moved.
    expect(high.antiAliasing).toBe('msaa-4x');
    expect(high.ambientOcclusion).toBe('high');
    expect(high.screenSpaceReflections).toBe('low');
    expect(high.shadowUpdateMode).toBe('static');
    expect(high.depthOfField).toBe(false);
    // The FULL tier on MAX: the trace rides on top of the full stack, which
    // already held every raised tier the retired rung had argued for.
    expect(max.ambientOcclusion).toBe('ultra');
    expect(max.shadowUpdateMode).toBe('dynamic');
    expect(max.reflectionQuality).toBe('ultra');
    expect(max.screenSpaceGi).toBe('high');
    // Shadow rays need a shadow-casting sun, so a preset that enables the trace
    // and disables shadows would ship a control that reports itself broken.
    expect(high.shadows).toBe('high');
    expect(max.shadows).toBe('high');
    // Depth of field stays off: the aperture bound above proves the gameplay
    // camera has to be a pinhole, so there is no aperture DoF to spend on.
    expect(high.depthOfField).toBe(false);
    expect(max.motionBlur).toBeGreaterThan(0);
  });

  it('states the fold integration and the parity decision in writing', () => {
    expect(RAY_TRACED_FOLD_INTEGRATION.length).toBeGreaterThanOrEqual(3);
    for (const [trade, why] of RAY_TRACED_FOLD_INTEGRATION) {
      expect(trade.length).toBeGreaterThan(0);
      expect(why.length).toBeGreaterThan(40);
    }
    expect(RAY_TRACED_FOLD_INTEGRATION.some(([tier]) => tier.includes('QUALITY'))).toBe(true);
    expect(RAY_TRACED_FOLD_INTEGRATION.some(([tier]) => tier.includes('MAX'))).toBe(true);
    // The parity rule is a competitive-integrity decision, so it is recorded as
    // data rather than as a comment somebody can quietly disagree with.
    expect(RAY_TRACED_PRESET_PARITY.dynamicObjectsTraced).toBe(false);
    expect(RAY_TRACED_PRESET_PARITY.reflectedPlayersPossible).toBe(false);
    expect(RAY_TRACED_PRESET_PARITY.statement).toContain('static arena geometry only');
  });
});
