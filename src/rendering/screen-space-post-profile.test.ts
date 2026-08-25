import { describe, expect, it } from 'vitest';
import {
  adaptScreenSpacePostForPressure,
  assertDepthOfFieldCombatSafety,
  assertScreenSpacePostCombatSafety,
  depthOfFieldBlendWeight,
  depthOfFieldBlurRadiusPixels,
  depthOfFieldCircleOfConfusion,
  DEPTH_OF_FIELD_MIDFIELD_FAR_M,
  DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX,
  DEPTH_OF_FIELD_MIDFIELD_NEAR_M,
  GODRAY_MAXIMUM_ADDITIVE_GAIN,
  MOTION_BLUR_MAXIMUM_UV_OFFSET,
  motionBlurScreenOffset,
  resolveDepthOfFieldTuning,
  resolveGodraysTuning,
  resolveMotionBlurTuning,
  resolveScreenSpaceGiTuning,
  resolveScreenSpacePostRuntime,
  resolveScreenSpaceReflectionTuning,
  resolveSpatialUpscaling,
  SCREEN_SPACE_POST_DISABLED,
  SCREEN_SPACE_PRESSURE_DEMOTE_RATIO,
  SCREEN_SPACE_PRESSURE_STARVE_RATIO,
  SSGI_MAXIMUM_GI_INTENSITY,
  SSR_MAXIMUM_INTENSITY,
} from './screen-space-post-profile';

const HIGH_SELECTION = {
  volumetricLightShafts: 'high',
  screenSpaceReflections: 'high',
  screenSpaceGi: 'high',
  depthOfField: true,
  depthOfFieldStrength: 1,
  motionBlur: 1,
  spatialUpscaling: 'fsr1-quality',
  rayTracing: 'refractions',
} as const;

describe('HF-364 screen-space post tiers', () => {
  it('keeps every tier inside its combat-safety ceiling', () => {
    const runtime = resolveScreenSpacePostRuntime(HIGH_SELECTION, { shadowsEnabled: true });
    expect(runtime.godrays.additiveGain).toBeLessThanOrEqual(GODRAY_MAXIMUM_ADDITIVE_GAIN);
    expect(runtime.reflections.intensity).toBeLessThanOrEqual(SSR_MAXIMUM_INTENSITY);
    expect(runtime.globalIllumination.giIntensity).toBeLessThanOrEqual(SSGI_MAXIMUM_GI_INTENSITY);
    expect(runtime.motionBlur.maximumUvOffset).toBeLessThanOrEqual(MOTION_BLUR_MAXIMUM_UV_OFFSET);
    expect(() => assertScreenSpacePostCombatSafety(runtime)).not.toThrow();
  });

  it('rejects a tuning that exceeds a ceiling instead of quietly shipping it', () => {
    const runtime = resolveScreenSpacePostRuntime(HIGH_SELECTION, { shadowsEnabled: true });
    expect(() => assertScreenSpacePostCombatSafety({
      ...runtime,
      godrays: { ...runtime.godrays, additiveGain: GODRAY_MAXIMUM_ADDITIVE_GAIN + 0.01 },
    })).toThrow(/godray additive gain/);
    expect(() => assertScreenSpacePostCombatSafety({
      ...runtime,
      reflections: { ...runtime.reflections, intensity: 1 },
    })).toThrow(/SSR intensity/);
    expect(() => assertScreenSpacePostCombatSafety({
      ...runtime,
      globalIllumination: { ...runtime.globalIllumination, giIntensity: 10 },
    })).toThrow(/SSGI intensity/);
    expect(() => assertScreenSpacePostCombatSafety({
      ...runtime,
      motionBlur: { ...runtime.motionBlur, maximumUvOffset: 0.25 },
    })).toThrow(/motion blur offset/);
  });

  it('refuses volumetric shafts without the sun shadow map they raymarch', () => {
    const withShadows = resolveGodraysTuning('high', { shadowsEnabled: true });
    expect(withShadows.enabled).toBe(true);
    expect(withShadows.unavailableReason).toBeNull();
    const withoutShadows = resolveGodraysTuning('high', { shadowsEnabled: false });
    expect(withoutShadows.enabled).toBe(false);
    // The tier the player asked for is retained so the UI can explain itself
    // rather than silently snapping the control back to Off.
    expect(withoutShadows.quality).toBe('high');
    expect(withoutShadows.unavailableReason).toMatch(/Sun shadows/);
    expect(resolveGodraysTuning('off', { shadowsEnabled: true }).enabled).toBe(false);
  });

  it('scales tiers monotonically and never inverts a cost knob', () => {
    const lowShafts = resolveGodraysTuning('low', { shadowsEnabled: true });
    const highShafts = resolveGodraysTuning('high', { shadowsEnabled: true });
    expect(highShafts.raymarchSteps).toBeGreaterThan(lowShafts.raymarchSteps);
    expect(highShafts.resolutionScale).toBeGreaterThan(lowShafts.resolutionScale);
    const lowSsr = resolveScreenSpaceReflectionTuning('low');
    const highSsr = resolveScreenSpaceReflectionTuning('high');
    expect(highSsr.marchQuality).toBeGreaterThan(lowSsr.marchQuality);
    expect(highSsr.maximumDistance).toBeGreaterThan(lowSsr.maximumDistance);
    // Dielectrics must reflect at every active tier: water is the whole point.
    expect(lowSsr.reflectNonMetals && highSsr.reflectNonMetals).toBe(true);
    const lowGi = resolveScreenSpaceGiTuning('low');
    const highGi = resolveScreenSpaceGiTuning('high');
    expect(highGi.stepCount).toBeGreaterThan(lowGi.stepCount);
    expect(highGi.sliceCount).toBeGreaterThanOrEqual(lowGi.sliceCount);
    // Temporal filtering is unavailable without a TRAA resolve, so both active
    // tiers must carry the spatial denoise that stands in for it.
    expect(lowGi.denoise && highGi.denoise).toBe(true);
  });

  it('publishes FSR 1 at the vendor ratios and nothing at all when off', () => {
    expect(resolveSpatialUpscaling('fsr1-quality').sceneResolutionScale).toBeCloseTo(0.67, 2);
    expect(resolveSpatialUpscaling('fsr1-balanced').sceneResolutionScale).toBeCloseTo(0.59, 2);
    expect(resolveSpatialUpscaling('fsr1-performance').sceneResolutionScale).toBeCloseTo(0.5, 2);
    const off = resolveSpatialUpscaling('off');
    expect(off.enabled).toBe(false);
    expect(off.sceneResolutionScale).toBe(1);
  });

  it('has a genuinely zero disabled state', () => {
    expect(SCREEN_SPACE_POST_DISABLED.godrays.enabled).toBe(false);
    expect(SCREEN_SPACE_POST_DISABLED.reflections.enabled).toBe(false);
    expect(SCREEN_SPACE_POST_DISABLED.globalIllumination.enabled).toBe(false);
    expect(SCREEN_SPACE_POST_DISABLED.depthOfField.enabled).toBe(false);
    expect(SCREEN_SPACE_POST_DISABLED.motionBlur.enabled).toBe(false);
    expect(SCREEN_SPACE_POST_DISABLED.upscaling.enabled).toBe(false);
    expect(SCREEN_SPACE_POST_DISABLED.depthOfField.bokehScale).toBe(0);
    expect(SCREEN_SPACE_POST_DISABLED.motionBlur.maximumUvOffset).toBe(0);
  });
});

describe('HF-364 depth-of-field combat-safety envelope', () => {
  it('stays sub-pixel across the whole combat midfield at every strength', () => {
    for (let step = 0; step <= 20; step += 1) {
      const tuning = resolveDepthOfFieldTuning(true, step / 20);
      expect(() => assertDepthOfFieldCombatSafety(tuning)).not.toThrow();
      for (let sample = 0; sample <= 90; sample += 1) {
        const distance = DEPTH_OF_FIELD_MIDFIELD_NEAR_M
          + (DEPTH_OF_FIELD_MIDFIELD_FAR_M - DEPTH_OF_FIELD_MIDFIELD_NEAR_M) * (sample / 90);
        expect(depthOfFieldBlurRadiusPixels(distance, tuning))
          .toBeLessThanOrEqual(DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX);
      }
    }
  });

  it('leaves the first-person weapon plane sharp', () => {
    const tuning = resolveDepthOfFieldTuning(true, 1);
    // The viewmodel sits well inside a metre of the camera. A short focal
    // length is exactly what would smear it, which is why the tuning uses one
    // far longer than any arena.
    for (const distance of [0.2, 0.4, 0.6, 1]) {
      expect(depthOfFieldBlurRadiusPixels(distance, tuning))
        .toBeLessThanOrEqual(DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX);
    }
  });

  it('still actually defocuses the far background, or the feature is a lie', () => {
    const tuning = resolveDepthOfFieldTuning(true, 1);
    // The gameplay far plane is 180 m; the sky sits on it.
    expect(depthOfFieldBlurRadiusPixels(180, tuning)).toBeGreaterThan(2);
    expect(depthOfFieldBlendWeight(180, tuning)).toBeGreaterThan(0.9);
    // ... and the effect grows with the strength control rather than ignoring it.
    expect(depthOfFieldBlurRadiusPixels(180, resolveDepthOfFieldTuning(true, 1)))
      .toBeGreaterThan(depthOfFieldBlurRadiusPixels(180, resolveDepthOfFieldTuning(true, 0.25)));
  });

  it('is exactly zero when disabled or at zero strength', () => {
    expect(depthOfFieldCircleOfConfusion(180, resolveDepthOfFieldTuning(false, 1))).toBe(0);
    expect(resolveDepthOfFieldTuning(true, 0).enabled).toBe(false);
    expect(depthOfFieldBlurRadiusPixels(180, resolveDepthOfFieldTuning(true, 0))).toBe(0);
  });

  it('fails the build rather than shipping a tuning that softens the midfield', () => {
    const hostile = { ...resolveDepthOfFieldTuning(true, 1), focalLengthM: 4, bokehScale: 6 };
    expect(() => assertDepthOfFieldCombatSafety(hostile)).toThrow(/blur the combat midfield/);
  });
});

describe('HF-364 motion-blur dead zone', () => {
  it('smears exactly nothing below a real angular rate', () => {
    const tuning = resolveMotionBlurTuning(1);
    // A 240 Hz aim adjustment moves a few thousandths of NDC per frame.
    expect(motionBlurScreenOffset(0, tuning)).toBe(0);
    expect(motionBlurScreenOffset(0.001, tuning)).toBe(0);
    expect(motionBlurScreenOffset(tuning.deadZoneNdc, tuning)).toBe(0);
  });

  it('ramps in above the knee and never exceeds the screen-offset ceiling', () => {
    const tuning = resolveMotionBlurTuning(1);
    expect(motionBlurScreenOffset(tuning.kneeNdc, tuning)).toBeGreaterThan(0);
    for (const speed of [0.05, 0.2, 1, 2]) {
      expect(motionBlurScreenOffset(speed, tuning)).toBeLessThanOrEqual(MOTION_BLUR_MAXIMUM_UV_OFFSET);
    }
    // A flick has to stay inside the cap, not merely be "usually" small.
    expect(motionBlurScreenOffset(2, tuning)).toBeCloseTo(MOTION_BLUR_MAXIMUM_UV_OFFSET, 5);
  });

  it('scales the ceiling with the player control and disables at zero', () => {
    expect(resolveMotionBlurTuning(0).enabled).toBe(false);
    expect(motionBlurScreenOffset(1, resolveMotionBlurTuning(0))).toBe(0);
    const half = resolveMotionBlurTuning(0.5);
    expect(half.maximumUvOffset).toBeCloseTo(MOTION_BLUR_MAXIMUM_UV_OFFSET * 0.5, 6);
    expect(motionBlurScreenOffset(1, half)).toBeLessThan(motionBlurScreenOffset(1, resolveMotionBlurTuning(1)));
  });
});

describe('HF-364 adaptive-quality pressure valve', () => {
  const runtime = resolveScreenSpacePostRuntime(HIGH_SELECTION, { shadowsEnabled: true });

  it('leaves the healthy band untouched', () => {
    const adapted = adaptScreenSpacePostForPressure(runtime, {
      pixelRatioCap: 1, requestedPixelRatioCap: 1,
    });
    expect(adapted).toBe(runtime);
    expect(adaptScreenSpacePostForPressure(runtime, {
      pixelRatioCap: SCREEN_SPACE_PRESSURE_DEMOTE_RATIO, requestedPixelRatioCap: 1,
    }).godrays.quality).toBe('high');
  });

  it('demotes the high tiers on the first sustained downshift', () => {
    const adapted = adaptScreenSpacePostForPressure(runtime, {
      pixelRatioCap: 0.8, requestedPixelRatioCap: 1,
    });
    expect(adapted.godrays.quality).toBe('low');
    expect(adapted.reflections.quality).toBe('low');
    expect(adapted.globalIllumination.quality).toBe('low');
    expect(adapted.godrays.raymarchSteps).toBeLessThan(runtime.godrays.raymarchSteps);
    expect(adapted.reflections.marchQuality).toBeLessThan(runtime.reflections.marchQuality);
    // The valve must not silently change what the player chose for the effects
    // it does not own.
    expect(adapted.depthOfField).toEqual(runtime.depthOfField);
    expect(adapted.upscaling).toEqual(runtime.upscaling);
  });

  it('starves the marches further under deep pressure, and stays combat-safe', () => {
    const starved = adaptScreenSpacePostForPressure(runtime, {
      pixelRatioCap: SCREEN_SPACE_PRESSURE_STARVE_RATIO - 0.05, requestedPixelRatioCap: 1,
    });
    const demoted = adaptScreenSpacePostForPressure(runtime, {
      pixelRatioCap: 0.8, requestedPixelRatioCap: 1,
    });
    expect(starved.godrays.resolutionScale).toBeLessThan(demoted.godrays.resolutionScale);
    expect(starved.reflections.resolutionScale).toBeLessThan(demoted.reflections.resolutionScale);
    expect(starved.globalIllumination.stepCount).toBeLessThan(demoted.globalIllumination.stepCount);
    expect(starved.globalIllumination.sliceCount).toBe(1);
    expect(() => assertScreenSpacePostCombatSafety(starved)).not.toThrow();
  });

  it('does not resurrect shafts the shadow gate already refused', () => {
    const noShadows = resolveScreenSpacePostRuntime(HIGH_SELECTION, { shadowsEnabled: false });
    const adapted = adaptScreenSpacePostForPressure(noShadows, {
      pixelRatioCap: 0.5, requestedPixelRatioCap: 1,
    });
    expect(adapted.godrays.enabled).toBe(false);
    expect(adapted.godrays.unavailableReason).toMatch(/Sun shadows/);
  });
});
