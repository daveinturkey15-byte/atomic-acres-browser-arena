import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADVANCED_GRAPHICS_CONTROLS,
  ADVANCED_GRAPHICS_RUNTIME_EVIDENCE,
  GRAPHICS_CAPABILITY_NOTICES,
  GRAPHICS_PRESET_VALUES,
  normalizeAdvancedGraphicsValues,
  validateAdvancedGraphicsRegistry,
} from './graphics-settings-registry';
import { BAKED_INDIRECT_MAXIMUM_GAIN } from './rendering/lighting/baked-indirect';
import {
  DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX,
  GODRAY_MAXIMUM_ADDITIVE_GAIN,
  MOTION_BLUR_MAXIMUM_UV_OFFSET,
  SSGI_MAXIMUM_GI_INTENSITY,
  SSR_MAXIMUM_INTENSITY,
  resolveScreenSpacePostRuntime,
} from './rendering/screen-space-post-profile';

/**
 * The weather and air family. Pass 79 ADDS the two rows that were still
 * missing - wet surfaces and airborne detail - to this list rather than
 * exempting them, so both are held to the same plain-language, live-apply and
 * atmosphere-category rules every other weather row already answers to.
 */
const WEATHER_KEYS = [
  'weatherIntensity', 'rainDensity', 'windStrength', 'lightning',
  'wetSurfaces', 'ambientLife',
] as const;

/** Controls the screen-space stack owns, i.e. the ones the presets re-tier. */
const SCREEN_SPACE_KEYS = [
  'volumetricLightShafts', 'screenSpaceReflections', 'screenSpaceGi',
  // HF-398 joins the family it composites with: the trace adds into the same
  // additive reflection term and is bound by the same envelope.
  'rayTracing',
  // HF-418 joins for the same reason and because of how it nearly did not: the
  // control was added to the promise matrix below with a value of 'off' on all
  // four presets and NEVER COMPARED, because it was missing from this list. A
  // table that is not read is worse than no table - it told the owner MAX gets
  // no baked bounce while MAX shipped 'high'.
  'bakedIndirect',
  'depthOfField', 'depthOfFieldStrength', 'motionBlur', 'spatialUpscaling',
] as const;

describe('Advanced Graphics canonical registry', () => {
  it('is complete, unique and executable by a named runtime consumer', () => {
    expect(validateAdvancedGraphicsRegistry()).toEqual([]);
    expect(new Set(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key)).size).toBe(ADVANCED_GRAPHICS_CONTROLS.length);
    expect(ADVANCED_GRAPHICS_CONTROLS.every(({ runtimeConsumer }) => runtimeConsumer.length > 0)).toBe(true);
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(Object.keys(preset).sort()).toEqual(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key).sort());
    }
  });

  it('fails closed unless every visible control names a real source symbol and telemetry path', () => {
    // This is a SOURCE-SHAPE check and nothing more: it greps the named file
    // for the named symbol. It catches a deleted or renamed consumer. It does
    // NOT prove the consumer executes - a distinction this suite learned the
    // expensive way, see the live-observation test below.
    expect(Object.keys(ADVANCED_GRAPHICS_RUNTIME_EVIDENCE).sort())
      .toEqual(ADVANCED_GRAPHICS_CONTROLS.map(({ key }) => key).sort());
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      const probes = ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[definition.key];
      expect(probes.length, definition.key).toBeGreaterThan(0);
      for (const probe of probes) {
        expect(existsSync(probe.path), `${definition.key}: ${probe.path}`).toBe(true);
        expect(readFileSync(probe.path, 'utf8'), `${definition.key}: ${probe.symbol}`).toContain(probe.symbol);
        expect(probe.telemetryPath.length, definition.key).toBeGreaterThan(12);
      }
    }
  });

  /**
   * The environment rows are the reason `liveObservation` exists.
   *
   * Until 2026-08-31 environmentIntensity's "runtime evidence" was a grep for
   * the string `scene.environmentIntensity` inside arena-environment-ibl.ts.
   * The string was there. The assignment ran on every arena EXCEPT the first
   * one of each page load - which is the only arena most sessions ever see -
   * because the sole call site sat inside `applyDefinition`, and the first
   * arena is the one that constructs the systems object instead of applying a
   * definition to it. Nine unit tests passed over a dead code path.
   *
   * A row may only claim a live observation if the named assertion is a real
   * exported symbol that reads the scene. That is what this pins.
   */
  it('backs the environment-intensity row with a live observation, not a source grep', () => {
    const iblSource = readFileSync('src/rendering/arena-environment-ibl.ts', 'utf8');
    for (const key of ['environmentIntensity'] as const) {
      const [probe] = ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[key];
      expect(probe.liveObservation, key).toBeTruthy();
      expect(probe.liveObservation, key).toContain('assertArenaEnvironmentLive');
      // The gate has to exist as an export, and it has to read the scene rather
      // than re-state its inputs.
      expect(iblSource).toContain('export function assertArenaEnvironmentLive');
      expect(iblSource).toContain('export function observeArenaEnvironment');
      expect(iblSource).toContain('const environment = scene.environment;');
      expect(iblSource).toContain('environmentIntensity: scene.environmentIntensity,');
    }
    // Every OTHER row is honest about being a source-shape trace: it must not
    // silently acquire the strong claim without a gate behind it.
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      for (const probe of ADVANCED_GRAPHICS_RUNTIME_EVIDENCE[definition.key]) {
        if (probe.liveObservation === undefined) continue;
        expect(probe.liveObservation.length, definition.key).toBeGreaterThan(23);
      }
    }
  });

  it('normalizes hostile values and preserves the explicit uncapped sentinel', () => {
    expect(normalizeAdvancedGraphicsValues({
      renderScale: 99,
      targetFps: 999,
      frameRateLimit: 0,
      antiAliasing: 'invented',
      anisotropy: 128,
      exposure: Number.NaN,
    })).toMatchObject({
      renderScale: 1.25,
      targetFps: 360,
      frameRateLimit: 0,
      antiAliasing: GRAPHICS_PRESET_VALUES.high.antiAliasing,
      anisotropy: GRAPHICS_PRESET_VALUES.high.anisotropy,
      exposure: GRAPHICS_PRESET_VALUES.high.exposure,
    });
    expect(normalizeAdvancedGraphicsValues({ frameRateLimit: 361 }).frameRateLimit).toBe(0);
  });

  it('exposes the Pass 76 WebGPU feature controls with honest defaults', () => {
    const byKey = new Map(ADVANCED_GRAPHICS_CONTROLS.map((definition) => [definition.key, definition]));
    const optionValues = (key: 'antiAliasing' | 'reflectionQuality' | 'shadowFilter' | 'filmicProfile') => {
      const definition = byKey.get(key);
      return definition?.kind === 'select' ? definition.options.map(({ value }) => value) : [];
    };
    expect(optionValues('antiAliasing')).toEqual(['off', 'msaa-2x', 'msaa-4x', 'fxaa', 'smaa']);
    expect(optionValues('reflectionQuality')).toEqual(['off', 'low', 'high', 'ultra']);
    expect(optionValues('shadowFilter')).toEqual(['auto', 'pcf', 'pcss-soft']);
    expect(optionValues('filmicProfile')).toEqual(['arena-default', 'performance', 'quality', 'max']);
    expect(byKey.get('sharpness')).toMatchObject({ kind: 'range', minimum: 0, maximum: 1, applyMode: 'live' });
    expect(byKey.get('environmentIntensity')).toMatchObject({ kind: 'range', minimum: 0, maximum: 2, applyMode: 'live' });
    // Every preset keeps the new controls at behaviour-preserving defaults;
    // Max additionally claims the new highest reflection tier.
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(preset.shadowFilter).toBe('auto');
      expect(preset.filmicProfile).toBe('arena-default');
      expect(preset.sharpness).toBe(0);
      expect(preset.environmentIntensity).toBe(1);
    }
    expect(GRAPHICS_PRESET_VALUES.max.reflectionQuality).toBe('ultra');
    expect(normalizeAdvancedGraphicsValues({ antiAliasing: 'fxaa', sharpness: 3, shadowFilter: 'invented' }))
      .toMatchObject({ antiAliasing: 'fxaa', sharpness: 1, shadowFilter: 'auto' });
  });

  it('labels unsupported vendor paths without fake controls, and never both ways at once', () => {
    expect(GRAPHICS_CAPABILITY_NOTICES.map(({ state }) => state)).not.toContain('active');
    // HF-364 turned SSR, SSGI, depth of field, motion blur and spatial
    // upscaling into real controls. What remains unavailable is the genuine
    // browser boundary: no ray-tracing pipeline and no vendor-native temporal
    // reconstruction. This is an EXACT list, not a superset: a notice that
    // outlives its feature is the same lie as a control that does nothing.
    expect(GRAPHICS_CAPABILITY_NOTICES.map(({ id }) => id)).toEqual([
      'path-tracing',
      'ai-upscaling-frame-generation',
    ]);
    expect(GRAPHICS_CAPABILITY_NOTICES.every(({ reason, evidence }) => reason.length > 24 && evidence.length > 0)).toBe(true);
    // The strictness this replaces the old arrayContaining with: nothing may be
    // simultaneously advertised as an unavailable capability and shipped as a
    // working control.
    const noticeTopics = new Set(GRAPHICS_CAPABILITY_NOTICES.map(({ label }) => label.toLowerCase()));
    for (const definition of ADVANCED_GRAPHICS_CONTROLS) {
      expect(noticeTopics.has(definition.label.toLowerCase()), definition.key).toBe(false);
    }
  });

  it('ships the HF-364 screen-space stack as real controls with conservative preset defaults', () => {
    const byKey = new Map(ADVANCED_GRAPHICS_CONTROLS.map((definition) => [definition.key, definition]));
    for (const key of ['volumetricLightShafts', 'screenSpaceReflections', 'screenSpaceGi'] as const) {
      const definition = byKey.get(key);
      expect(definition?.kind, key).toBe('select');
      expect(definition?.kind === 'select' ? definition.options.map(({ value }) => value) : [], key)
        .toEqual(['off', 'low', 'high']);
      // Adding or removing a raymarch changes MRT attachments and render
      // targets, so none of these may claim to be a live apply.
      expect(definition?.applyMode, key).toBe('pipeline-rebuild');
    }
    expect(byKey.get('depthOfField')).toMatchObject({ kind: 'toggle', applyMode: 'pipeline-rebuild' });
    expect(byKey.get('depthOfFieldStrength')).toMatchObject({ kind: 'range', minimum: 0, maximum: 1, applyMode: 'live' });
    expect(byKey.get('motionBlur')).toMatchObject({ kind: 'range', minimum: 0, maximum: 1, applyMode: 'pipeline-rebuild' });
    expect(byKey.get('spatialUpscaling')?.kind === 'select'
      ? (byKey.get('spatialUpscaling') as { options: readonly { value: string }[] }).options.map(({ value }) => value)
      : []).toEqual(['off', 'fsr1-quality', 'fsr1-balanced', 'fsr1-performance']);
    expect(normalizeAdvancedGraphicsValues({
      screenSpaceGi: 'ultra', motionBlur: 9, spatialUpscaling: 'dlss', depthOfField: 'yes',
    })).toMatchObject({
      screenSpaceGi: GRAPHICS_PRESET_VALUES.high.screenSpaceGi,
      motionBlur: 1,
      spatialUpscaling: 'off',
      // An absent tier falls back to the Quality preset's value, not to the
      // most expensive one a hostile payload could name.
      rayTracing: GRAPHICS_PRESET_VALUES.high.rayTracing,
      depthOfField: false,
    });
  });

  it('pins the exact screen-space preset matrix the player is promised', () => {
    // This table IS the promise. It is spelled out rather than derived so that
    // a value edit in the registry has to be an argued edit here too, and so
    // that the owner can read what Max gets without opening the renderer.
    const matrix = {
      performance: {
        bakedIndirect: 'off',
        volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
        rayTracing: 'off',
        depthOfField: false, depthOfFieldStrength: 0.3, motionBlur: 0, spatialUpscaling: 'off',
      },
      // HF-418 BALANCED. It takes NOTHING from the screen-space stack: every
      // member of this family is either a new render-target attachment (SSR),
      // a per-pixel raymarch (shafts), an expensive gather (SSGI) or an effect
      // that replaces pixels (DoF, motion blur). Its whole proposition is
      // QUALITY's LOOK - native resolution, shadows, the filmic grade - without
      // QUALITY's per-frame structures, so this row stays identical to
      // PERFORMANCE's. If a future edit promotes one of these into Balanced,
      // this line is where it has to be argued.
      balanced: {
        // PASS 89: the ONE exception to "identical to PERFORMANCE's row", and
        // the reason it is not a promotion of the family above. Lane AL pins
        // that LOW and HIGH baked indirect differ only in BAKE cost and never
        // in per-frame cost, and the bake runs chunked under a per-ray 3 ms
        // wall-clock bound. BALANCED takes QUALITY's tier because a baked
        // volume is an offline cost that buys bounce light - which is exactly
        // this profile's proposition - and because leaving it OFF would have
        // made this rung darker than PERFORMANCE is bright once QUALITY got it.
        bakedIndirect: 'low',
        volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
        rayTracing: 'off',
        depthOfField: false, depthOfFieldStrength: 0.3, motionBlur: 0, spatialUpscaling: 'off',
      },
      high: {
        // QUALITY, the auto-selected default. LOW baked bounce: measured at
        // +0.7% median / +0.3% p95 against the layer switched off, and zero
        // added pipelines at admission.
        bakedIndirect: 'low',
        volumetricLightShafts: 'low', screenSpaceReflections: 'low', screenSpaceGi: 'off',
        rayTracing: 'off',
        depthOfField: false, depthOfFieldStrength: 0.3, motionBlur: 0, spatialUpscaling: 'off',
      },
      max: {
        bakedIndirect: 'high',
        volumetricLightShafts: 'high', screenSpaceReflections: 'high', screenSpaceGi: 'high',
        // MAX is untouched by HF-398. It already cannot deploy against the
        // 4000 ms admission bound; adding a large new fragment shader to it
        // would make a failing preset fail harder.
        rayTracing: 'off',
        depthOfField: true, depthOfFieldStrength: 0.6, motionBlur: 0.35, spatialUpscaling: 'off',
      },
    } as const;
    // A preset with no row here would be silently unpinned, which is exactly
    // how a table stops being "the promise" it says it is.
    expect(Object.keys(matrix).sort()).toEqual(Object.keys(GRAPHICS_PRESET_VALUES).sort());
    for (const [name, expected] of Object.entries(matrix)) {
      const preset = GRAPHICS_PRESET_VALUES[name as keyof typeof GRAPHICS_PRESET_VALUES];
      for (const key of SCREEN_SPACE_KEYS) {
        expect(preset[key], `${name}.${key}`).toBe(expected[key]);
      }
    }
    // Performance is the compatibility/low-spec preset and the regression guard
    // for this whole family: nothing in the stack may ever be promoted into it.
    expect(Object.values(matrix.performance).every((value) => value === 'off' || value === false || value === 0 || value === 0.3)).toBe(true);
    // Spatial upscaling is the one control with no combat-safety bound enforced
    // anywhere in code, and it renders below native. It stays a Custom opt-in in
    // every preset, including the one whose whole job is to crank everything.
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(preset.spatialUpscaling).toBe('off');
    }
    // Sun shafts raymarch the sun shadow map, so a preset that enables them and
    // disables shadows would ship a control that reports itself unavailable.
    for (const [name, preset] of Object.entries(GRAPHICS_PRESET_VALUES)) {
      if (preset.volumetricLightShafts !== 'off') expect(preset.shadows, name).toBe('high');
    }
  });

  it('keeps every shipped preset inside the enforced combat-safety envelope', () => {
    for (const [name, preset] of Object.entries(GRAPHICS_PRESET_VALUES)) {
      // resolveScreenSpacePostRuntime calls assertScreenSpacePostCombatSafety
      // and throws on a breach, so this is the same fail-closed check the arena
      // build runs — not a restatement of it.
      const runtime = resolveScreenSpacePostRuntime({
        // preset.X, like every sibling field. Hardcoding 'off' here meant the
        // shipped presets' baked composite never reached the envelope assert.
        bakedIndirect: preset.bakedIndirect,
        volumetricLightShafts: preset.volumetricLightShafts,
        screenSpaceReflections: preset.screenSpaceReflections,
        screenSpaceGi: preset.screenSpaceGi,
        depthOfField: preset.depthOfField,
        depthOfFieldStrength: preset.depthOfFieldStrength,
        motionBlur: preset.motionBlur,
        spatialUpscaling: preset.spatialUpscaling,
        rayTracing: preset.rayTracing,
      }, { shadowsEnabled: preset.shadows === 'high' });
      expect(runtime.godrays.additiveGain, `${name} godray gain`).toBeLessThanOrEqual(GODRAY_MAXIMUM_ADDITIVE_GAIN);
      expect(runtime.reflections.intensity, `${name} SSR intensity`).toBeLessThanOrEqual(SSR_MAXIMUM_INTENSITY);
      expect(runtime.globalIllumination.giIntensity, `${name} SSGI gain`).toBeLessThanOrEqual(SSGI_MAXIMUM_GI_INTENSITY);
      expect(runtime.motionBlur.maximumUvOffset, `${name} blur offset`).toBeLessThanOrEqual(MOTION_BLUR_MAXIMUM_UV_OFFSET);
      expect(runtime.bakedIndirect.composite, `${name} baked indirect gain`)
        .toBeLessThanOrEqual(BAKED_INDIRECT_MAXIMUM_GAIN);
      // A preset that asks for the layer must actually get it, not a silent off.
      expect(runtime.bakedIndirect.enabled, `${name} baked indirect`).toBe(preset.bakedIndirect !== 'off');
      // A preset that enables shafts must actually get them, not a reason string.
      if (preset.volumetricLightShafts !== 'off') {
        expect(runtime.godrays.enabled, `${name} shafts`).toBe(true);
        expect(runtime.godrays.unavailableReason, `${name} shafts`).toBeNull();
      }
    }
    // Depth of field is the one bound that is a function of a slider rather than
    // a tier, so pin the shipped Max strength against the ceiling directly.
    const maxRuntime = resolveScreenSpacePostRuntime({
      bakedIndirect: 'off',
      volumetricLightShafts: 'off', screenSpaceReflections: 'off', screenSpaceGi: 'off',
      depthOfField: GRAPHICS_PRESET_VALUES.max.depthOfField,
      depthOfFieldStrength: GRAPHICS_PRESET_VALUES.max.depthOfFieldStrength,
      motionBlur: 0, spatialUpscaling: 'off', rayTracing: 'off',
    }, { shadowsEnabled: true });
    expect(maxRuntime.depthOfField.enabled).toBe(true);
    expect(DEPTH_OF_FIELD_MIDFIELD_MAXIMUM_BLUR_PX).toBeGreaterThan(0);
  });

  it('describes every screen-space control in player language, not node names', () => {
    // The owner's complaint was that these read as engineering notes. A one-line
    // `<small>` under the control is the whole budget, so cap it and ban the
    // vocabulary that made the old copy unreadable. "FSR 1" survives on purpose:
    // it is a product name and the honesty rule requires it.
    const banned = [
      'pmrem', 'easu', 'rcas', 'tsl', 'mrt', 'webgpu', 'raymarch', 'ray-march', 'ray-marches',
      'depth buffer', 'velocity buffer', 'bokeh', 'circle of confusion', 'shadow map',
      'node', 'render target', 'framebuffer', 'upstream', 'linear-hdr', 'additive',
    ];
    const byKey = new Map(ADVANCED_GRAPHICS_CONTROLS.map((definition) => [definition.key, definition]));
    for (const key of SCREEN_SPACE_KEYS) {
      const definition = byKey.get(key);
      expect(definition, key).toBeDefined();
      const label = definition!.label;
      const description = definition!.description;
      expect(label.length, `${key} label`).toBeGreaterThan(0);
      expect(description.length, `${key} description`).toBeLessThanOrEqual(200);
      // One line means at most two short sentences, not a paragraph.
      expect(description.split(/(?<=[.!?])\s+/).length, `${key} sentences`).toBeLessThanOrEqual(2);
      const haystack = `${label} ${description}`.toLowerCase();
      for (const word of banned) {
        expect(haystack.includes(word), `${key} description leaks "${word}"`).toBe(false);
      }
    }
  });
});

describe('Advanced Graphics weather controls', () => {
  const byKey = new Map(ADVANCED_GRAPHICS_CONTROLS.map((definition) => [definition.key, definition]));

  it('ships all four weather rows the owner asked for, under Atmosphere', () => {
    // The audit rated this family NOT-STARTED because there was no
    // player-facing control at all - not a bad one, none.
    for (const key of WEATHER_KEYS) {
      const definition = byKey.get(key);
      expect(definition, key).toBeDefined();
      expect(definition!.category, key).toBe('atmosphere');
      // Every one of these is a uniform or an instance-count write, so none may
      // claim a rebuild the player would have to wait for.
      expect(definition!.applyMode, key).toBe('live');
    }
    expect(byKey.get('weatherIntensity')?.kind === 'select'
      ? (byKey.get('weatherIntensity') as { options: readonly { value: string }[] }).options.map(({ value }) => value)
      : []).toEqual(['off', 'light', 'moderate', 'heavy', 'storm']);
    expect(byKey.get('rainDensity')).toMatchObject({ kind: 'range', minimum: 0.25, maximum: 1.5, unit: 'multiplier' });
    expect(byKey.get('windStrength')).toMatchObject({ kind: 'range', minimum: 0, maximum: 2, unit: 'multiplier' });
    expect(byKey.get('wetSurfaces')).toMatchObject({ kind: 'toggle' });
    expect(byKey.get('ambientLife')).toMatchObject({ kind: 'range', minimum: 0, maximum: 2, unit: 'multiplier' });
    // The air row must be able to reach BOTH ends of a real change: off, and
    // meaningfully more than the arenas author.
    expect(byKey.get('ambientLife')?.kind === 'range' ? (byKey.get('ambientLife') as { minimum: number }).minimum : 1).toBe(0);
    expect(byKey.get('lightning')).toMatchObject({ kind: 'toggle' });
  });

  it('describes weather in player language, not node names', () => {
    // Same rule the screen-space family carries: a one-line <small> under the
    // control is the whole budget, and a paragraph of engineering vocabulary
    // there is how a real feature reads as noise.
    const banned = [
      'tsl', 'webgpu', 'instanced', 'shader', 'uniform', 'node',
      'seed', 'deterministic', 'hemisphere', 'clamp',
      'toroidal', 'raymarch', 'billboard',
    ];
    for (const key of WEATHER_KEYS) {
      const definition = byKey.get(key)!;
      expect(definition.label.length, key).toBeGreaterThan(0);
      expect(definition.description.length, key).toBeLessThanOrEqual(200);
      expect(definition.description.split(/(?<=[.!?])\s+/).length, key).toBeLessThanOrEqual(2);
      const haystack = `${definition.label} ${definition.description}`.toLowerCase();
      for (const word of banned) {
        expect(haystack.includes(word), `${key} description leaks "${word}"`).toBe(false);
      }
    }
  });

  it('pins the exact weather matrix each preset promises', () => {
    // Spelled out rather than derived, for the same reason the screen-space
    // matrix is: an edit to these numbers has to be an argued edit here too.
    const matrix = {
      performance: {
        weatherIntensity: 'light', rainDensity: 0.5, windStrength: 1, lightning: false,
        wetSurfaces: true, ambientLife: 0.6,
      },
      // HF-418 BALANCED. Rain and air sit BETWEEN the two neighbouring rungs,
      // and the storm CEILING is left open rather than capped as PERFORMANCE
      // caps it: the ceiling is not the cost, the instance count is, so this
      // profile thins the count instead of hiding a weather state the arenas
      // were authored to reach.
      balanced: {
        weatherIntensity: 'storm', rainDensity: 0.75, windStrength: 1, lightning: true,
        wetSurfaces: true, ambientLife: 0.8,
      },
      high: {
        weatherIntensity: 'storm', rainDensity: 1, windStrength: 1, lightning: true,
        wetSurfaces: true, ambientLife: 1,
      },
      max: {
        weatherIntensity: 'storm', rainDensity: 1.35, windStrength: 1, lightning: true,
        wetSurfaces: true, ambientLife: 1.5,
      },
    } as const;
    // A preset with no row here would be silently unpinned, which is exactly
    // how a table stops being "the promise" it says it is.
    expect(Object.keys(matrix).sort()).toEqual(Object.keys(GRAPHICS_PRESET_VALUES).sort());
    for (const [name, expected] of Object.entries(matrix)) {
      const preset = GRAPHICS_PRESET_VALUES[name as keyof typeof GRAPHICS_PRESET_VALUES];
      for (const key of WEATHER_KEYS) {
        expect(preset[key], `${name}.${key}`).toBe(expected[key]);
      }
    }
    // Wind strength is authored per arena, so no preset has any business
    // re-authoring it - it is a taste control, not a budget.
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(preset.windStrength).toBe(1);
    }
    // The density is the cost. Nothing but the low-spec preset caps the
    // CEILING, because a state the arenas were authored to reach should not be
    // invisible on the preset most machines land on.
    expect(GRAPHICS_PRESET_VALUES.high.weatherIntensity).toBe('storm');
    // Airborne detail rises monotonically with the preset ladder: a heavier
    // preset that showed LESS air would be a straight defect. (HF-438: the
    // RAY TRACED rung was retired; its 1.15 air no longer sits in between.)
    expect(GRAPHICS_PRESET_VALUES.performance.ambientLife)
      .toBeLessThan(GRAPHICS_PRESET_VALUES.high.ambientLife);
    expect(GRAPHICS_PRESET_VALUES.high.ambientLife)
      .toBeLessThan(GRAPHICS_PRESET_VALUES.max.ambientLife);
    // Wet ground costs two material writes on a 2.5 s scan, so no preset has a
    // performance reason to drop it - it stays a taste control on every rung.
    for (const preset of Object.values(GRAPHICS_PRESET_VALUES)) {
      expect(preset.wetSurfaces).toBe(true);
    }
    expect(GRAPHICS_PRESET_VALUES.max.rainDensity).toBeGreaterThan(GRAPHICS_PRESET_VALUES.high.rainDensity);
    expect(GRAPHICS_PRESET_VALUES.performance.rainDensity).toBeLessThan(GRAPHICS_PRESET_VALUES.high.rainDensity);
  });

  it('normalizes hostile weather values back into the shipped envelope', () => {
    expect(normalizeAdvancedGraphicsValues({
      weatherIntensity: 'apocalypse',
      rainDensity: 12,
      windStrength: -3,
      lightning: 'sometimes',
    })).toMatchObject({
      weatherIntensity: GRAPHICS_PRESET_VALUES.high.weatherIntensity,
      rainDensity: 1.5,
      windStrength: 0,
      lightning: GRAPHICS_PRESET_VALUES.high.lightning,
    });
  });
});
