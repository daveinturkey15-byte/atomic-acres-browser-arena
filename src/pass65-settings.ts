import { renderProfileConfig, type RenderProfile, type RenderProfileConfig } from './render-profile';
import { AUDIO_BUS_IDS, type AudioBusId } from './audio-buses';
import {
  GRAPHICS_PRESET_VALUES,
  normalizeAdvancedGraphicsValues,
  type AdvancedGraphicsValues,
  type FilmicProfileChoice,
  type ReflectionQualityTier,
  type ShadowFilterMode,
  type ToneMappingMode,
} from './graphics-settings-registry';
import {
  resolveScreenSpacePostRuntime,
  SCREEN_SPACE_POST_DISABLED,
  type ScreenSpacePostRuntime,
} from './rendering/screen-space-post-profile';

export { AUDIO_BUS_IDS };
export type { AudioBusId };

export const PASS65_SETTINGS_STORAGE_KEY = 'atomic-acres-pass65-settings-v1';
export type GraphicsPreset = 'performance' | 'high' | 'max' | 'custom';
export type ShadowQuality = 'off' | 'high';

export type GraphicsSettings = Readonly<AdvancedGraphicsValues & {
  schemaVersion: 1;
  preset: GraphicsPreset;
}>;

export type AudioSettings = Readonly<{
  schemaVersion: 1;
  gains: Readonly<Record<AudioBusId, number>>;
  mutes: Readonly<Record<AudioBusId, boolean>>;
}>;

export type AccessibilitySettings = Readonly<{
  schemaVersion: 1;
  reducedMotion: boolean;
  reducedDamageFlash: boolean;
  reducedSensoryEffects: boolean;
  damageFlashScale: number;
  weaponMotionScale: number;
}>;

export type PrivacySettings = Readonly<{
  schemaVersion: 1;
  shareGlobalLeaderboard: boolean;
}>;

export type Pass65Settings = Readonly<{
  version: 1;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  accessibility: AccessibilitySettings;
  privacy: PrivacySettings;
}>;

export type GraphicsRuntime = Readonly<{
  requestedPreset: GraphicsPreset;
  effectivePreset: GraphicsPreset;
  renderProfile: RenderProfile;
  renderScale: number;
  adaptive: boolean;
  targetFps: GraphicsSettings['targetFps'];
  frameRateLimit: number;
  antialiasSamples: 0 | 2 | 4;
  /** WebGPU display-side post anti-aliasing stage; 'off' whenever MSAA owns AA. */
  postAntiAliasing: 'off' | 'fxaa' | 'smaa';
  shadows: boolean;
  shadowMapSize: 1024 | 2048;
  shadowUpdateMode: GraphicsSettings['shadowUpdateMode'];
  shadowFilter: ShadowFilterMode;
  indirectLightScale: number;
  ambientOcclusion: Readonly<{
    quality: GraphicsSettings['ambientOcclusion'];
    enabled: boolean;
    resolutionScale: number;
    samples: number;
    radius: number;
    strength: number;
    /** High/Ultra tiers run the depth/normal-aware denoise pass over the raw GTAO target. */
    denoise: boolean;
  }>;
  reflectionScale: number;
  reflectionQuality: ReflectionQualityTier;
  environmentIntensity: number;
  /**
   * HF-364 — the resolved screen-space raymarched stack (volumetric shafts,
   * SSR, SSGI, depth of field, motion blur) plus the FSR 1 upscaler. The tier
   * tables and the combat-safety ceilings live in
   * `rendering/screen-space-post-profile.ts`, which is also where the numbers
   * are proven; this field is only the resolved result.
   */
  screenSpace: ScreenSpacePostRuntime;
  volumetricScale: number;
  maximumAnisotropy: GraphicsSettings['anisotropy'];
  particleScale: number;
  decalScale: number;
  smokeScale: number;
  post: Readonly<{
    bloomStrength: number;
    exposureScale: number;
    toneMapping: ToneMappingMode;
    filmGrainScale: number;
    vignetteStrength: number;
    /** 0 disables the display-side RCAS stage entirely. */
    sharpness: number;
  }>;
  /** 'arena-default' keeps the preset-matched filmic grade profile mapping. */
  gradeProfile: FilmicProfileChoice;
  reason: string | null;
}>;

export type AccessibilityRuntime = Readonly<AccessibilitySettings & {
  reducedSensory: boolean;
  reasons: readonly string[];
}>;

export type CapabilityHints = Readonly<{
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  forceCompatibility?: boolean;
}>;

export const MIN_GRAPHICS_TARGET_FPS = 30;
export const MAX_GRAPHICS_TARGET_FPS = 360;
const PRESETS = new Set<GraphicsPreset>(['performance', 'high', 'max', 'custom']);

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function presetGraphics(preset: Exclude<GraphicsPreset, 'custom'>): GraphicsSettings {
  return Object.freeze({ schemaVersion: 1, preset, ...GRAPHICS_PRESET_VALUES[preset] });
}

export function defaultGraphicsPreset(capabilities: CapabilityHints = {}): Exclude<GraphicsPreset, 'custom'> {
  if (capabilities.forceCompatibility) return 'performance';
  const cores = finiteNumber(capabilities.hardwareConcurrency, 8);
  const memory = finiteNumber(capabilities.deviceMemoryGb, 8);
  return cores >= 8 && memory >= 8 ? 'high' : 'performance';
}

export function createDefaultPass65Settings(capabilities: CapabilityHints = {}): Pass65Settings {
  const preset = defaultGraphicsPreset(capabilities);
  const gains = Object.fromEntries(AUDIO_BUS_IDS.map((id) => [id, 100])) as Record<AudioBusId, number>;
  const mutes = Object.fromEntries(AUDIO_BUS_IDS.map((id) => [id, false])) as Record<AudioBusId, boolean>;
  gains['menu-music'] = 72;
  gains['game-music'] = 68;
  gains.ambience = 82;
  return Object.freeze({
    version: 1,
    graphics: presetGraphics(preset),
    audio: Object.freeze({ schemaVersion: 1, gains: Object.freeze(gains), mutes: Object.freeze(mutes) }),
    accessibility: Object.freeze({
      schemaVersion: 1,
      reducedMotion: false,
      reducedDamageFlash: false,
      reducedSensoryEffects: false,
      damageFlashScale: 1,
      weaponMotionScale: 1,
    }),
    privacy: Object.freeze({
      schemaVersion: 1,
      shareGlobalLeaderboard: false,
    }),
  });
}

export function normalizePass65Settings(value: unknown, capabilities: CapabilityHints = {}): Pass65Settings {
  const defaults = createDefaultPass65Settings(capabilities);
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Partial<Pass65Settings>;
  const rawGraphics = raw.graphics && typeof raw.graphics === 'object' ? raw.graphics as Partial<GraphicsSettings> : {};
  const preset = PRESETS.has(rawGraphics.preset as GraphicsPreset) ? rawGraphics.preset as GraphicsPreset : defaults.graphics.preset;
  // A named profile is an atomic, canonical choice. Persisted advanced values
  // can only belong to Custom; allowing them to leak into a named profile
  // makes the label lie about the runtime configuration after migrations.
  const graphics: GraphicsSettings = preset === 'custom'
    ? Object.freeze({
        schemaVersion: 1,
        preset,
        ...normalizeAdvancedGraphicsValues(rawGraphics, defaults.graphics),
      })
    : presetGraphics(preset);
  const rawAudio = raw.audio && typeof raw.audio === 'object' ? raw.audio as Partial<AudioSettings> : {};
  const rawGains = rawAudio.gains && typeof rawAudio.gains === 'object' ? rawAudio.gains as Partial<Record<AudioBusId, number>> : {};
  const rawMutes = rawAudio.mutes && typeof rawAudio.mutes === 'object' ? rawAudio.mutes as Partial<Record<AudioBusId, boolean>> : {};
  const gains = Object.fromEntries(AUDIO_BUS_IDS.map((id) => [
    id, Math.round(clamp(finiteNumber(rawGains[id], defaults.audio.gains[id]), 0, 100)),
  ])) as Record<AudioBusId, number>;
  const mutes = Object.fromEntries(AUDIO_BUS_IDS.map((id) => [
    id, bool(rawMutes[id], defaults.audio.mutes[id]),
  ])) as Record<AudioBusId, boolean>;
  const audio: AudioSettings = Object.freeze({ schemaVersion: 1, gains: Object.freeze(gains), mutes: Object.freeze(mutes) });
  const rawAccessibility = raw.accessibility && typeof raw.accessibility === 'object'
    ? raw.accessibility as Partial<AccessibilitySettings>
    : {};
  const accessibility: AccessibilitySettings = Object.freeze({
    schemaVersion: 1,
    reducedMotion: bool(rawAccessibility.reducedMotion, defaults.accessibility.reducedMotion),
    reducedDamageFlash: bool(rawAccessibility.reducedDamageFlash, defaults.accessibility.reducedDamageFlash),
    reducedSensoryEffects: bool(rawAccessibility.reducedSensoryEffects, defaults.accessibility.reducedSensoryEffects),
    damageFlashScale: Number(clamp(finiteNumber(rawAccessibility.damageFlashScale, 1), 0, 1).toFixed(2)),
    weaponMotionScale: Number(clamp(finiteNumber(rawAccessibility.weaponMotionScale, 1), 0, 1).toFixed(2)),
  });
  const rawPrivacy = raw.privacy && typeof raw.privacy === 'object'
    ? raw.privacy as Partial<PrivacySettings>
    : {};
  const privacy: PrivacySettings = Object.freeze({
    schemaVersion: 1,
    shareGlobalLeaderboard: bool(rawPrivacy.shareGlobalLeaderboard, defaults.privacy.shareGlobalLeaderboard),
  });
  return Object.freeze({ version: 1, graphics, audio, accessibility, privacy });
}

export function parsePass65Settings(serialized: string | null, capabilities: CapabilityHints = {}): Pass65Settings {
  if (!serialized) return createDefaultPass65Settings(capabilities);
  try {
    const decoded = JSON.parse(serialized) as unknown;
    if (decoded && typeof decoded === 'object') {
      const record = decoded as { graphics?: unknown };
      if (record.graphics && typeof record.graphics === 'object') {
        const graphics = record.graphics as { preset?: unknown };
        if (graphics.preset === 'max') {
          return normalizePass65Settings(decoded, capabilities);
        }
      }
    }
    return normalizePass65Settings(decoded, capabilities);
  } catch {
    return createDefaultPass65Settings(capabilities);
  }
}

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function writePass65Settings(
  storage: SettingsStorage,
  settings: Pass65Settings,
  capabilities: CapabilityHints = {},
): boolean {
  const serialized = JSON.stringify(settings);
  let prior: string | null = null;
  let wrote = false;
  try {
    prior = storage.getItem(PASS65_SETTINGS_STORAGE_KEY);
    storage.setItem(PASS65_SETTINGS_STORAGE_KEY, serialized);
    wrote = true;
    const readBack = storage.getItem(PASS65_SETTINGS_STORAGE_KEY);
    if (readBack === serialized && JSON.stringify(parsePass65Settings(readBack, capabilities)) === serialized) return true;
  } catch { /* Restore below when the write itself completed. */ }
  if (wrote) {
    try {
      if (prior === null) storage.removeItem(PASS65_SETTINGS_STORAGE_KEY);
      else storage.setItem(PASS65_SETTINGS_STORAGE_KEY, prior);
    } catch { /* Storage is unavailable; report failure without masking the original error. */ }
  }
  return false;
}

export function resolveGraphicsRuntime(settings: GraphicsSettings, forceCompatibility = false): GraphicsRuntime {
  const qualityScale = (tier: GraphicsSettings['particleQuality']): number => tier === 'low' ? 0.5 : tier === 'high' ? 0.8 : 1;
  const lightingScale = (tier: GraphicsSettings['indirectLighting']): number => tier === 'off' ? 0 : tier === 'low' ? 0.62 : 1;
  const bloomStrength = settings.bloomQuality === 'off' ? 0 : settings.bloomQuality === 'subtle' ? 0.065 : 0.14;
  const antialiasSamples = settings.antiAliasing === 'msaa-4x' ? 4 : settings.antiAliasing === 'msaa-2x' ? 2 : 0;
  const postAntiAliasing = settings.antiAliasing === 'fxaa' || settings.antiAliasing === 'smaa'
    ? settings.antiAliasing
    : 'off' as const;
  // Low keeps the raw single-pass GTAO as the cheap tier; High and Ultra add
  // the depth/normal-aware spatial denoise over the same bounded target.
  const ambientOcclusion = settings.ambientOcclusion === 'off'
    ? Object.freeze({ quality: 'off' as const, enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false })
    : settings.ambientOcclusion === 'low'
      ? Object.freeze({ quality: 'low' as const, enabled: true, resolutionScale: 0.35, samples: 8, radius: 0.18, strength: 0.42, denoise: false })
      : settings.ambientOcclusion === 'high'
        ? Object.freeze({ quality: 'high' as const, enabled: true, resolutionScale: 0.5, samples: 12, radius: 0.22, strength: 0.52, denoise: true })
        : Object.freeze({ quality: 'ultra' as const, enabled: true, resolutionScale: 0.75, samples: 16, radius: 0.25, strength: 0.62, denoise: true });
  if (forceCompatibility) {
    return Object.freeze({
      requestedPreset: settings.preset,
      effectivePreset: 'performance',
      renderProfile: 'compat',
      renderScale: 0.2,
      adaptive: false,
      targetFps: settings.targetFps,
      frameRateLimit: settings.frameRateLimit,
      antialiasSamples: 0,
      postAntiAliasing: 'off',
      shadows: false,
      shadowMapSize: 1024,
      shadowUpdateMode: 'static',
      shadowFilter: 'auto',
      indirectLightScale: 0.45,
      ambientOcclusion: Object.freeze({ quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0, denoise: false }),
      reflectionScale: 0,
      reflectionQuality: 'off',
      environmentIntensity: 0,
      // The compatibility route has no RenderPipeline and therefore no linear
      // post graph at all; every screen-space effect is structurally absent
      // rather than merely turned down.
      screenSpace: SCREEN_SPACE_POST_DISABLED,
      volumetricScale: 0.4,
      maximumAnisotropy: 1,
      particleScale: 0.4,
      decalScale: 0.4,
      smokeScale: 0.55,
      post: Object.freeze({ bloomStrength: 0, exposureScale: settings.exposure, toneMapping: settings.toneMapping, filmGrainScale: 0, vignetteStrength: 0, sharpness: 0 }),
      gradeProfile: 'arena-default',
      reason: 'Compatibility renderer is active.',
    });
  }
  return Object.freeze({
    requestedPreset: settings.preset,
    effectivePreset: settings.preset,
    renderProfile: settings.geometryDetail === 'reduced' ? 'performance' : 'blender',
    renderScale: Math.min(1.25, settings.renderScale),
    adaptive: settings.adaptiveResolution,
    targetFps: settings.targetFps,
    frameRateLimit: settings.frameRateLimit,
    antialiasSamples,
    postAntiAliasing,
    shadows: settings.shadows === 'high',
    shadowMapSize: settings.shadowResolution === 'high' ? 2048 : 1024,
    shadowUpdateMode: settings.shadowUpdateMode,
    shadowFilter: settings.shadowFilter,
    indirectLightScale: lightingScale(settings.indirectLighting),
    ambientOcclusion,
    // Ultra shares High's unit reflection gain; the extra tier buys PMREM
    // resolution (512) in arena-environment-ibl, not a hotter multiplier.
    reflectionScale: settings.reflectionQuality === 'off' ? 0 : settings.reflectionQuality === 'low' ? 0.62 : 1,
    reflectionQuality: settings.reflectionQuality,
    environmentIntensity: lightingScale(settings.indirectLighting) * settings.environmentIntensity,
    // Volumetric shafts raymarch the sun shadow map, so the shadow setting is a
    // hard capability input here rather than a taste preference: with shadows
    // off there is nothing to occlude the volume and the resolver reports why.
    screenSpace: resolveScreenSpacePostRuntime({
      volumetricLightShafts: settings.volumetricLightShafts,
      screenSpaceReflections: settings.screenSpaceReflections,
      screenSpaceGi: settings.screenSpaceGi,
      depthOfField: settings.depthOfField,
      depthOfFieldStrength: settings.depthOfFieldStrength,
      motionBlur: settings.motionBlur,
      spatialUpscaling: settings.spatialUpscaling,
    }, { shadowsEnabled: settings.shadows === 'high' }),
    volumetricScale: qualityScale(settings.volumetricQuality),
    maximumAnisotropy: settings.anisotropy,
    particleScale: qualityScale(settings.particleQuality),
    decalScale: qualityScale(settings.decalQuality),
    smokeScale: qualityScale(settings.smokeQuality),
    post: Object.freeze({
      bloomStrength,
      exposureScale: settings.exposure,
      toneMapping: settings.toneMapping,
      filmGrainScale: settings.filmGrain,
      vignetteStrength: settings.vignette,
      sharpness: settings.sharpness,
    }),
    gradeProfile: settings.filmicProfile,
    reason: null,
  });
}

/**
 * Resolves the concrete presentation configuration after an optional review
 * route override. Advanced controls remain independent in Custom: selecting
 * reduced geometry must not silently cap render scale or disable shadows.
 */
export function resolveActiveGraphicsConfig(
  runtime: GraphicsRuntime,
  renderProfile: RenderProfile,
  queryRenderProfile: RenderProfile | null = null,
): RenderProfileConfig {
  const compatibility = renderProfile === 'compat';
  const forcedPerformance = queryRenderProfile === 'performance';
  const forcedQuality = queryRenderProfile === 'blender';
  const shadows = !compatibility && (forcedQuality || (!forcedPerformance && runtime.shadows));
  const pixelRatioCap = compatibility
    ? 0.2
    : forcedPerformance
      ? Math.min(0.75, runtime.renderScale)
      : forcedQuality
        ? 1
        : runtime.renderScale;
  return Object.freeze({
    ...renderProfileConfig(renderProfile),
    pixelRatioCap,
    antialias: !compatibility && runtime.antialiasSamples > 0,
    shadows,
    shadowMapSize: compatibility ? 0 : runtime.shadowMapSize,
    shadowMode: shadows ? runtime.shadowUpdateMode : 'off',
  });
}

/** Public preset label after an explicit renderer review route is applied. */
export function resolveDisplayedGraphicsPreset(
  requestedPreset: GraphicsPreset,
  queryRenderProfile: RenderProfile | null = null,
): GraphicsPreset {
  if (queryRenderProfile === 'performance' || queryRenderProfile === 'compat') return 'performance';
  if (queryRenderProfile === 'blender') return 'high';
  return requestedPreset;
}

/**
 * Pure presentation scheduler gate. Simulation remains fixed-step; callers use
 * this only to decide whether the next requestAnimationFrame should do work.
 */
export function presentationFrameDue(now: number, lastPresentedAt: number, frameRateLimit: number): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(lastPresentedAt)) return true;
  if (!Number.isFinite(frameRateLimit) || frameRateLimit <= 0) return true;
  const intervalMs = 1_000 / Math.min(MAX_GRAPHICS_TARGET_FPS, Math.max(MIN_GRAPHICS_TARGET_FPS, frameRateLimit));
  return now - lastPresentedAt >= intervalMs - 0.25;
}

export function advancePresentationFrameAnchor(now: number, lastPresentedAt: number, frameRateLimit: number): number {
  if (!Number.isFinite(frameRateLimit) || frameRateLimit <= 0) return now;
  const boundedLimit = Math.min(MAX_GRAPHICS_TARGET_FPS, Math.max(MIN_GRAPHICS_TARGET_FPS, frameRateLimit));
  const intervalMs = 1_000 / boundedLimit;
  const elapsedMs = Math.max(intervalMs, now - lastPresentedAt);
  return lastPresentedAt + Math.max(1, Math.floor((elapsedMs + 0.25) / intervalMs)) * intervalMs;
}

export function resolveAccessibilityRuntime(
  settings: AccessibilitySettings,
  system: Readonly<{ reducedMotion: boolean; reducedTransparency?: boolean }>,
): AccessibilityRuntime {
  const reasons: string[] = [];
  if (system.reducedMotion) reasons.push('Operating system reduced motion');
  if (system.reducedTransparency) reasons.push('Operating system reduced transparency');
  if (settings.reducedSensoryEffects) reasons.push('Reduced sensory effects');
  const reducedSensory = system.reducedMotion || Boolean(system.reducedTransparency) || settings.reducedSensoryEffects;
  const reducedDamageFlash = settings.reducedDamageFlash || reducedSensory;
  return Object.freeze({
    ...settings,
    reducedMotion: settings.reducedMotion || system.reducedMotion || reducedSensory,
    reducedDamageFlash,
    damageFlashScale: reducedDamageFlash ? Math.min(0.2, settings.damageFlashScale) : settings.damageFlashScale,
    weaponMotionScale: reducedSensory ? Math.min(0.35, settings.weaponMotionScale) : settings.weaponMotionScale,
    reducedSensory,
    reasons: Object.freeze(reasons),
  });
}
