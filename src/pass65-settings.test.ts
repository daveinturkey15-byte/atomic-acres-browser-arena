import { describe, expect, it } from 'vitest';
import {
  AUDIO_BUS_IDS,
  advancePresentationFrameAnchor,
  createDefaultPass65Settings,
  normalizePass65Settings,
  parsePass65Settings,
  presentationFrameDue,
  resolveAccessibilityRuntime,
  resolveGraphicsRuntime,
  writePass65Settings,
} from './pass65-settings';

describe('Pass 65 settings contract', () => {
  it('defaults capable machines to a real High configuration', () => {
    const settings = createDefaultPass65Settings({ hardwareConcurrency: 16, deviceMemoryGb: 16 });
    expect(settings.graphics).toMatchObject({
      schemaVersion: 1, preset: 'high', renderScale: 1, adaptiveResolution: true, targetFps: 60,
      frameRateLimit: 0, antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high',
      shadowResolution: 'high', indirectLighting: 'high', volumetricQuality: 'high',
      anisotropy: 8, bloomQuality: 'cinematic', toneMapping: 'aces',
    });
    expect(resolveGraphicsRuntime(settings.graphics)).toMatchObject({
      renderProfile: 'blender', adaptive: true, shadows: true, antialiasSamples: 4,
      shadowMapSize: 2048, maximumAnisotropy: 8,
    });
    expect(Object.keys(settings.audio.gains).sort()).toEqual([...AUDIO_BUS_IDS].sort());
    expect(Object.keys(settings.audio.mutes).sort()).toEqual([...AUDIO_BUS_IDS].sort());
  });

  it('uses Performance on constrained machines and keeps Max available to internal benchmarks', () => {
    expect(createDefaultPass65Settings({ hardwareConcurrency: 4, deviceMemoryGb: 4 }).graphics.preset).toBe('performance');
    const max = normalizePass65Settings({ graphics: { preset: 'max' } });
    expect(resolveGraphicsRuntime(max.graphics)).toMatchObject({
      renderProfile: 'blender', renderScale: 1.25, adaptive: false, shadows: true,
      shadowUpdateMode: 'dynamic', maximumAnisotropy: 16,
    });
  });

  it('migrates legacy persisted High and Max presets into the simplified public Quality choice', () => {
    const legacyHigh = parsePass65Settings(JSON.stringify({
      version: 1,
      graphics: { schemaVersion: 1, preset: 'high', renderScale: 0.9, adaptiveResolution: true, targetFps: 165, shadows: 'high' },
    }));
    const legacyMax = parsePass65Settings(JSON.stringify({
      version: 1,
      graphics: { schemaVersion: 1, preset: 'max', renderScale: 1, adaptiveResolution: false, targetFps: 240, shadows: 'high' },
    }));
    expect(legacyHigh.graphics).toMatchObject({ preset: 'high', targetFps: 165 });
    expect(legacyMax.graphics).toMatchObject({ preset: 'high', targetFps: 240 });
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
    });
  });

  it('canonicalizes custom supersampling to the renderer-supported 125% ceiling', () => {
    const settings = normalizePass65Settings({ graphics: { preset: 'custom', renderScale: 2 } });
    expect(settings.graphics.renderScale).toBe(1.25);
    expect(resolveGraphicsRuntime(settings.graphics)).toMatchObject({ renderScale: 1.25, reason: null });
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
