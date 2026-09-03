import { afterEach, describe, expect, it } from 'vitest';
import {
  AUDIO_BUS_IDS,
  advancePresentationFrameAnchor,
  createDefaultPass65Settings,
  normalizePass65Settings,
  parsePass65Settings,
  presentationFrameDue,
  resolveAccessibilityRuntime,
  resolveActiveGraphicsConfig,
  resolveDisplayedGraphicsPreset,
  resolveGraphicsRuntime,
  writePass65Settings,
} from './pass65-settings';
import { GRAPHICS_PRESET_VALUES } from './graphics-settings-registry';
import { activeWeatherPresentation, resetWeatherPresentation } from './weather/weather-settings';
import { sampleWeather } from './weather/weather-state';

describe('Pass 65 settings contract', () => {
  it('defaults capable machines to a real High configuration', () => {
    const settings = createDefaultPass65Settings({ hardwareConcurrency: 16, deviceMemoryGb: 16 });
    expect(settings.graphics).toMatchObject({
      schemaVersion: 1, preset: 'high', renderScale: 1, adaptiveResolution: true, targetFps: 240,
      frameRateLimit: 0, antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high',
      // HF-438: QUALITY carries the retired RAY TRACED rung's trace (light
      // tier) and its AO tier.
      shadowResolution: 'high', indirectLighting: 'high', ambientOcclusion: 'high', volumetricQuality: 'high',
      anisotropy: 8, bloomQuality: 'cinematic', toneMapping: 'aces',
    });
    expect(settings.graphics.rayTracing).toBe('reflections');
    expect(resolveGraphicsRuntime(settings.graphics)).toMatchObject({
      renderProfile: 'blender', adaptive: true, shadows: true, antialiasSamples: 4,
      shadowMapSize: 2048, maximumAnisotropy: 8,
      ambientOcclusion: {
        quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52,
      },
    });
    expect(Object.keys(settings.audio.gains).sort()).toEqual([...AUDIO_BUS_IDS].sort());
    expect(Object.keys(settings.audio.mutes).sort()).toEqual([...AUDIO_BUS_IDS].sort());
    expect(settings.privacy).toEqual({ schemaVersion: 1, shareGlobalLeaderboard: false });
  });

  it('uses Performance on constrained machines and keeps Max available to internal benchmarks', () => {
    expect(createDefaultPass65Settings({ hardwareConcurrency: 4, deviceMemoryGb: 4 }).graphics.preset).toBe('performance');
    const max = normalizePass65Settings({ graphics: { preset: 'max' } });
    // Max keeps every highest-supported value but retains the adaptive-resolution
    // distress valve so it is as load-stable as Quality and Performance.
    expect(resolveGraphicsRuntime(max.graphics)).toMatchObject({
      renderProfile: 'blender', renderScale: 1.15, adaptive: true, shadows: true,
      shadowUpdateMode: 'dynamic', maximumAnisotropy: 16,
      ambientOcclusion: { quality: 'ultra', enabled: true, resolutionScale: 0.75, samples: 16 },
    });
  });

  it('migrates legacy persisted High preset but preserves Max as a distinct public choice', () => {
    const legacyHigh = parsePass65Settings(JSON.stringify({
      version: 1,
      graphics: {
        schemaVersion: 1, preset: 'high', renderScale: 0.9, adaptiveResolution: true,
        targetFps: 165, frameRateLimit: 60, shadows: 'high',
      },
    }));
    const legacyMax = parsePass65Settings(JSON.stringify({
      version: 1,
      graphics: {
        schemaVersion: 1, preset: 'max', renderScale: 1, adaptiveResolution: false,
        targetFps: 240, frameRateLimit: 144, shadows: 'high',
      },
    }));
    // Named presets discard every stale advanced override and resolve to one
    // canonical profile. Custom is the only profile that preserves overrides.
    expect(legacyHigh.graphics).toMatchObject({
      preset: 'high', renderScale: 1, adaptiveResolution: true,
      targetFps: 240, frameRateLimit: 0, shadows: 'high',
    });
    expect(legacyMax.graphics).toMatchObject({
      preset: 'max', renderScale: 1.15, adaptiveResolution: true,
      targetFps: 240, frameRateLimit: 0, shadows: 'high',
    });
  });

  it('keeps every named profile uncapped while preserving an explicit Custom cap', () => {
    // DERIVED, not listed. This loop used to name three presets by hand, so
    // RAY TRACED went unchecked from the day it shipped and BALANCED would
    // have too: a roster written out beside a registry is a gate that stops
    // looking at the newest thing. Reading the registry means a new preset is
    // covered the moment it exists.
    for (const preset of Object.keys(GRAPHICS_PRESET_VALUES) as ReadonlyArray<keyof typeof GRAPHICS_PRESET_VALUES>) {
      const named = normalizePass65Settings({
        graphics: { preset, targetFps: 60, frameRateLimit: 60 },
      });
      expect(named.graphics).toMatchObject({ preset, targetFps: 240, frameRateLimit: 0 });
    }

    const custom = normalizePass65Settings({
      graphics: { preset: 'custom', targetFps: 165, frameRateLimit: 60 },
    });
    expect(custom.graphics).toMatchObject({ preset: 'custom', targetFps: 165, frameRateLimit: 60 });
  });

  it('does not let stale advanced overrides masquerade as a named profile', () => {
    const quality = normalizePass65Settings({
      graphics: {
        preset: 'high', renderScale: 0.5, adaptiveResolution: false,
        shadows: 'off', shadowUpdateMode: 'dynamic', particleQuality: 'low',
        ambientOcclusion: 'ultra', frameRateLimit: 60,
      },
    });
    expect(quality.graphics).toMatchObject({
      preset: 'high', renderScale: 1, adaptiveResolution: true,
      shadows: 'high', shadowUpdateMode: 'static', particleQuality: 'high',
      // HF-438: the canonical QUALITY value is now HIGH, so a stored override
      // of anything else is discarded in favour of it.
      ambientOcclusion: 'high', targetFps: 240, frameRateLimit: 0,
    });
  });

  it('accepts display-aware adaptive targets beyond 144 and clamps hostile storage', () => {
    expect(normalizePass65Settings({ graphics: { preset: 'custom', targetFps: 240 } }).graphics.targetFps).toBe(240);
    expect(normalizePass65Settings({ graphics: { preset: 'custom', targetFps: 999 } }).graphics.targetFps).toBe(360);
    expect(normalizePass65Settings({ graphics: { preset: 'custom', targetFps: -10 } }).graphics.targetFps).toBe(30);
    expect(normalizePass65Settings({ graphics: { preset: 'custom', targetFps: 143.7 } }).graphics.targetFps).toBe(144);
  });

  it('retains a custom 240 FPS target across a later-session storage read', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    const settings = normalizePass65Settings({ graphics: { preset: 'custom', targetFps: 240 } });
    expect(writePass65Settings(storage, settings)).toBe(true);
    expect(parsePass65Settings([...values.values()][0] ?? null).graphics).toMatchObject({ preset: 'custom', targetFps: 240 });
  });

  it('keeps global leaderboard sharing default-off and persists explicit consent', () => {
    const defaults = createDefaultPass65Settings();
    expect(defaults.privacy.shareGlobalLeaderboard).toBe(false);
    const optedIn = normalizePass65Settings({
      ...defaults,
      privacy: { schemaVersion: 1, shareGlobalLeaderboard: true },
    });
    expect(parsePass65Settings(JSON.stringify(optedIn)).privacy.shareGlobalLeaderboard).toBe(true);
    expect(normalizePass65Settings({
      ...optedIn,
      privacy: { schemaVersion: 1, shareGlobalLeaderboard: 'yes' as unknown as boolean },
    }).privacy.shareGlobalLeaderboard).toBe(false);
  });

  it('migrates the pre-retune game-music gain once and then respects a deliberate 100', () => {
    // Pre-retune storage: no marker, gain at the OLD default -> migrates to 50.
    const preRetune = normalizePass65Settings({
      version: 1,
      audio: { schemaVersion: 1, gains: { 'game-music': 100 }, mutes: {} },
    });
    expect(preRetune.audio.gains['game-music']).toBe(50);
    expect(preRetune.audio.gameMusicRetuned).toBe(true);
    // Post-retune storage where the user deliberately chose 100 again: kept.
    const deliberate = normalizePass65Settings({
      version: 1,
      audio: { schemaVersion: 1, gains: { 'game-music': 100 }, mutes: {}, gameMusicRetuned: true },
    });
    expect(deliberate.audio.gains['game-music']).toBe(100);
    // A pre-retune CUSTOM value (not the old default) is the user's own mix: kept.
    const custom = normalizePass65Settings({
      version: 1,
      audio: { schemaVersion: 1, gains: { 'game-music': 80 }, mutes: {} },
    });
    expect(custom.audio.gains['game-music']).toBe(80);
  });

  it('recovers corrupt storage and clamps every numeric boundary', () => {
    expect(parsePass65Settings('{bad')).toEqual(createDefaultPass65Settings());
    const settings = normalizePass65Settings({
      graphics: { preset: 'custom', renderScale: Number.POSITIVE_INFINITY, targetFps: 77, shadows: 'wat' },
      audio: { gains: { master: 999, movement: -20 }, mutes: { master: true } },
      accessibility: { damageFlashScale: 12, weaponMotionScale: -2 },
    });
    expect(settings.graphics.renderScale).toBe(1);
    expect(settings.graphics.targetFps).toBe(77);
    expect(settings.audio.gains.master).toBe(100);
    expect(settings.audio.mutes.master).toBe(true);
    expect(settings.audio.gains.movement).toBe(0);
    expect(settings.accessibility).toMatchObject({ damageFlashScale: 1, weaponMotionScale: 0 });
  });

  it('applies the most restrictive accessibility source', () => {
    const settings = createDefaultPass65Settings().accessibility;
    expect(resolveAccessibilityRuntime(settings, { reducedMotion: true })).toMatchObject({
      reducedSensory: true, reducedMotion: true, reducedDamageFlash: true, damageFlashScale: 0.2, weaponMotionScale: 0.35,
    });
    expect(resolveAccessibilityRuntime({ ...settings, reducedSensoryEffects: true }, { reducedMotion: false }).reasons)
      .toContain('Reduced sensory effects');
    expect(resolveAccessibilityRuntime({ ...settings, reducedDamageFlash: true }, { reducedMotion: false }))
      .toMatchObject({ reducedSensory: false, reducedDamageFlash: true, damageFlashScale: 0.2, weaponMotionScale: 1 });
  });

  it('reports compatibility downgrades instead of silently pretending Max is active', () => {
    const settings = normalizePass65Settings({ graphics: { preset: 'max' } });
    expect(resolveGraphicsRuntime(settings.graphics, true)).toMatchObject({
      requestedPreset: 'max', effectivePreset: 'performance', renderProfile: 'compat', renderScale: 0.2,
      ambientOcclusion: { quality: 'off', enabled: false, samples: 0 },
    });
  });

  it('normalizes and resolves every bounded WebGPU GTAO tier', () => {
    // A hostile tier falls back to the QUALITY preset's canonical tier, never
    // to the most expensive one a hostile payload could name. HF-438 made that
    // canonical tier HIGH (QUALITY carries the trace with its AO), still one
    // step below MAX's ultra — the fail-safe property is re-pinned, not moved.
    expect(normalizePass65Settings({ graphics: { preset: 'custom', ambientOcclusion: 'invented' } }).graphics.ambientOcclusion)
      .toBe(GRAPHICS_PRESET_VALUES.high.ambientOcclusion);
    expect(normalizePass65Settings({ graphics: { preset: 'custom', ambientOcclusion: 'invented' } }).graphics.ambientOcclusion)
      .not.toBe('ultra');
    expect(resolveGraphicsRuntime(normalizePass65Settings({ graphics: { preset: 'custom', ambientOcclusion: 'off' } }).graphics).ambientOcclusion)
      .toEqual({ quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false });
    expect(resolveGraphicsRuntime(normalizePass65Settings({ graphics: { preset: 'custom', ambientOcclusion: 'low' } }).graphics).ambientOcclusion)
      .toEqual({ quality: 'low', enabled: true, resolutionScale: 0.35, samples: 8, radius: 0.18, strength: 0.42, denoise: false });
    // Pass 76: High and Ultra add the depth/normal-aware denoise pass; Low
    // stays the raw cheap tier.
    expect(resolveGraphicsRuntime(normalizePass65Settings({ graphics: { preset: 'custom', ambientOcclusion: 'high' } }).graphics).ambientOcclusion)
      .toEqual({ quality: 'high', enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52, denoise: true });
    expect(resolveGraphicsRuntime(normalizePass65Settings({ graphics: { preset: 'custom', ambientOcclusion: 'ultra' } }).graphics).ambientOcclusion)
      .toEqual({ quality: 'ultra', enabled: true, resolutionScale: 0.75, samples: 16, radius: 0.25, strength: 0.62, denoise: true });
  });

  it('canonicalizes custom supersampling to the renderer-supported 125% ceiling', () => {
    const settings = normalizePass65Settings({ graphics: { preset: 'custom', renderScale: 2 } });
    expect(settings.graphics.renderScale).toBe(1.25);
    expect(resolveGraphicsRuntime(settings.graphics)).toMatchObject({ renderScale: 1.25, reason: null });
  });

  it('keeps Custom controls independent when reduced geometry is selected', () => {
    const settings = normalizePass65Settings({
      graphics: {
        preset: 'custom', geometryDetail: 'reduced', renderScale: 1.25,
        shadows: 'high', shadowResolution: 'high', shadowUpdateMode: 'dynamic',
      },
    });
    const runtime = resolveGraphicsRuntime(settings.graphics);
    expect(runtime).toMatchObject({
      requestedPreset: 'custom', effectivePreset: 'custom', renderProfile: 'performance',
      renderScale: 1.25, shadows: true, shadowMapSize: 2048, shadowUpdateMode: 'dynamic',
    });
    expect(resolveActiveGraphicsConfig(runtime, runtime.renderProfile)).toMatchObject({
      reducedPresentationDetail: true, pixelRatioCap: 1.25, shadows: true,
      shadowMapSize: 2048, shadowMode: 'dynamic',
    });
    expect(resolveDisplayedGraphicsPreset(settings.graphics.preset)).toBe('custom');
  });

  it('keeps explicit renderer review overrides bounded and truthfully labelled', () => {
    const settings = normalizePass65Settings({ graphics: { preset: 'custom', renderScale: 1.25, shadows: 'high' } });
    const runtime = resolveGraphicsRuntime(settings.graphics);
    expect(resolveActiveGraphicsConfig(runtime, 'performance', 'performance')).toMatchObject({
      pixelRatioCap: 0.75, shadows: false, shadowMode: 'off',
    });
    expect(resolveActiveGraphicsConfig(runtime, 'blender', 'blender')).toMatchObject({
      pixelRatioCap: 1, shadows: true,
    });
    expect(resolveDisplayedGraphicsPreset('custom', 'performance')).toBe('performance');
    expect(resolveDisplayedGraphicsPreset('custom', 'blender')).toBe('high');
  });

  it('keeps adaptive target and output frame limiter separate beyond 144 FPS', () => {
    const settings = normalizePass65Settings({
      graphics: { preset: 'custom', targetFps: 240, frameRateLimit: 360 },
    });
    expect(resolveGraphicsRuntime(settings.graphics)).toMatchObject({ targetFps: 240, frameRateLimit: 360 });
    expect(presentationFrameDue(102, 100, 360)).toBe(false);
    expect(presentationFrameDue(103, 100, 360)).toBe(true);
    expect(presentationFrameDue(100.01, 100, 0)).toBe(true);
    const first = advancePresentationFrameAnchor(120.8, 100, 60);
    expect(first).toBeCloseTo(116.667, 2);
    expect(presentationFrameDue(134.7, first, 60)).toBe(true);
  });

  it('persists only a canonical read-back and rolls back a mismatched store', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => { values.delete(key); },
    };
    const settings = createDefaultPass65Settings();
    expect(writePass65Settings(storage, settings)).toBe(true);
    const prior = [...values.values()][0];
    let reads = 0;
    const corruptingStorage = {
      ...storage,
      getItem: (key: string) => {
        reads += 1;
        return reads === 2 ? '{corrupt' : values.get(key) ?? null;
      },
    };
    expect(writePass65Settings(corruptingStorage, settings)).toBe(false);
    expect([...values.values()][0]).toBe(prior);

    reads = 0;
    const throwingStorage = {
      ...storage,
      getItem: (key: string) => {
        reads += 1;
        if (reads === 2) throw new Error('read-back unavailable');
        return values.get(key) ?? null;
      },
    };
    expect(writePass65Settings(throwingStorage, settings)).toBe(false);
    expect([...values.values()][0]).toBe(prior);
  });
});

describe('weather settings reach the weather systems', () => {
  afterEach(() => {
    resetWeatherPresentation();
  });

  it('resolves the player weather clamp onto the runtime', () => {
    const settings = normalizePass65Settings({
      graphics: {
        preset: 'custom',
        weatherIntensity: 'moderate',
        rainDensity: 0.6,
        windStrength: 1.4,
        lightning: false,
      },
    }).graphics;
    expect(resolveGraphicsRuntime(settings).weather).toMatchObject({
      intensity: 'moderate',
      ceilingState: 'light-rain',
      rainDensity: 0.6,
      windStrength: 1.4,
      lightning: false,
      weatherEnabled: true,
    });
  });

  it('PUBLISHES it, because nothing else ever hands the weather systems settings', () => {
    // The weather systems are constructed at module scope before any settings
    // exist and the frame loop never passes them any. Without this publish
    // every weather row in Options is a switch wired to nothing, which is the
    // exact defect the audit recorded.
    resetWeatherPresentation();
    const quiet = normalizePass65Settings({
      graphics: { preset: 'custom', weatherIntensity: 'off', rainDensity: 0.25, lightning: false },
    }).graphics;
    resolveGraphicsRuntime(quiet);
    expect(activeWeatherPresentation()).toMatchObject({ intensity: 'off', weatherEnabled: false, lightning: false });
    // ...and the weather model itself picks it up with no further plumbing.
    expect(sampleWeather('high-seas', 4_242, 420).rainRate).toBe(0);
  });

  it('keeps publishing on the compatibility route, where wind still matters', () => {
    resetWeatherPresentation();
    const settings = normalizePass65Settings({
      graphics: { preset: 'custom', weatherIntensity: 'light', windStrength: 0.5 },
    }).graphics;
    const runtime = resolveGraphicsRuntime(settings, true);
    expect(runtime.renderProfile).toBe('compat');
    expect(runtime.weather).toMatchObject({ intensity: 'light', windStrength: 0.5 });
    expect(activeWeatherPresentation().windStrength).toBe(0.5);
  });

  it('is idempotent - resolving twice publishes the same numbers', () => {
    const settings = normalizePass65Settings({ graphics: { preset: 'max' } }).graphics;
    const first = resolveGraphicsRuntime(settings).weather;
    const second = resolveGraphicsRuntime(settings).weather;
    expect(second).toEqual(first);
    expect(activeWeatherPresentation()).toEqual(first);
  });
});
