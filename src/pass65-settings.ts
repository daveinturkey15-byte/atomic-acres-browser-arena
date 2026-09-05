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
import {
  publishWeatherPresentation,
  resolveWeatherPresentation,
  type WeatherPresentationRuntime,
} from './weather/weather-settings';
import {
  publishAmbientLife,
  resolveAmbientLife,
  type AmbientLifeRuntime,
} from './particles/ambient-life-settings';

export { AUDIO_BUS_IDS };
export type { AudioBusId };

export const PASS65_SETTINGS_STORAGE_KEY = 'atomic-acres-pass65-settings-v1';
/**
 * The preset ladder, in the order a player climbs it.
 *
 * `balanced` is HF-418 (owner, 2026-09-02 19:10: "maybe make a new balanced
 * profile that doesnt look shit like performance but will run nice and look
 * good?"). It sits between `performance` and `high`; its control set and the
 * reason for every entry in it are in graphics-settings-registry.ts, derived
 * from the HF-414 cost audit.
 *
 * `raytraced` WAS HF-398 and is RETIRED by HF-438 (owner, 2026-09-03:
 * "I don't think we should have a ray tracing AND an RTX mode"). It is no
 * longer a member of this union; a stored `raytraced` preference migrates to
 * `high`, which now carries the trace at its light tier. The word RTX still
 * appears in exactly one place in the player-facing build, and it is not a
 * preset: it is the native-runtime EXPLAINER
 * (src/ui/rtx-native-runtime-explainer.ts), which changes no renderer setting
 * at all.
 */
export type GraphicsPreset = 'performance' | 'balanced' | 'high' | 'max' | 'custom';
export type ShadowQuality = 'off' | 'high';

export type GraphicsSettings = Readonly<AdvancedGraphicsValues & {
  schemaVersion: 1;
  preset: GraphicsPreset;
}>;

export type AudioSettings = Readonly<{
  schemaVersion: 1;
  gains: Readonly<Record<AudioBusId, number>>;
  mutes: Readonly<Record<AudioBusId, boolean>>;
  /** One-time migration marker: the 2026-08-29 owner retune moved the
   * game-music default 100 -> 50. Stored settings from before the retune
   * carry the OLD default and would override the new one forever; when this
   * marker is absent and the stored gain still equals that old default, the
   * gain migrates to 50. Once the marker is written, a user deliberately
   * choosing 100 again is respected. */
  gameMusicRetuned: true;
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
  /**
   * Pass 78 — the player's weather ceiling, rain density, wind strength and
   * lightning switch, resolved. The weather MODEL is untouched by this: it
   * stays a pure function of (arena, match seed, elapsed) that every peer
   * agrees on, and this only decides how much of it the local screen draws.
   */
  weather: WeatherPresentationRuntime;
  /**
   * Pass 79 — how much of the authored ambient population the player asked to
   * see. Same latch argument as `weather` above: the ambient particle runtime
   * is constructed at module scope in legacy-main and is never handed settings,
   * so without publishing this the AIRBORNE DETAIL row would be a switch wired
   * to nothing.
   */
  ambientLife: AmbientLifeRuntime;
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
/** Static membership table for the stored-preset gate (HF-438: no 'raytraced'). */
const PRESETS: Readonly<Record<string, true>> = Object.freeze({ performance: true, balanced: true, high: true, max: true, custom: true });

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
  gains['game-music'] = 50; // owner-tuned 2026-08-29 with the 0.214 bus
  gains.ambience = 82;
  return Object.freeze({
    version: 1,
    graphics: presetGraphics(preset),
    audio: Object.freeze({ schemaVersion: 1, gains: Object.freeze(gains), mutes: Object.freeze(mutes), gameMusicRetuned: true as const }),
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
  // HF-438 migration: a stored `raytraced` preference (HF-398, retired) maps
  // to QUALITY on load — the rung that now carries the trace — regardless of
  // what this machine's automatic default would have been.
  const LEGACY_PRESET_ALIASES: Readonly<Record<string, Exclude<GraphicsPreset, 'custom'>>> = Object.freeze({ raytraced: 'high' });
  const storedPreset = typeof rawGraphics.preset === 'string' ? rawGraphics.preset : null;
  const requestedPreset = storedPreset !== null && storedPreset in LEGACY_PRESET_ALIASES
    ? LEGACY_PRESET_ALIASES[storedPreset]
    : storedPreset;
  const preset = requestedPreset !== null && requestedPreset in PRESETS
    ? requestedPreset as GraphicsPreset
    : defaults.graphics.preset;
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
  // 2026-08-29 owner retune migration: pre-retune stored settings hold the
  // old game-music default (100) and would drown the new 50 default forever.
  if (rawAudio.gameMusicRetuned !== true && gains['game-music'] === 100) {
    gains['game-music'] = defaults.audio.gains['game-music'];
  }
  const audio: AudioSettings = Object.freeze({ schemaVersion: 1, gains: Object.freeze(gains), mutes: Object.freeze(mutes), gameMusicRetuned: true as const });
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

/**
 * What the RENDERER ROUTE can actually do. Only the caller that owns the
 * renderer knows this, so it is passed in rather than sniffed: `navigator.gpu`
 * existing is not the same statement as "this session adopted the WebGPU
 * backend", and the fallback to WebGL2 happens after adapter request.
 */
export type GraphicsRouteCapability = Readonly<{
  /**
   * True when the classic ray tracer can be built at all. The tracer composites
   * inside the TSL/HDR graph, and `legacy-main` constructs that graph only when
   * `renderRuntime.backend === 'webgpu'`, so on every other route the trace is
   * structurally absent rather than merely expensive.
   *
   * Defaults to TRUE. Every existing caller resolves settings without a
   * renderer in hand (storage round-trips, the feature inventory, the whole
   * unit suite) and must keep the behaviour it had; the one caller that owns a
   * renderer passes the real backend.
   */
  rayTracingCapable?: boolean;
}>;

/**
 * Why the ray-traced controls were switched off. Printed by the EFFECTIVE
 * badge next to the preset the player kept, in the same slot the
 * compatibility route uses.
 */
export const RAY_TRACED_REQUIRES_WEBGPU_REASON =
  'Ray tracing needs the WebGPU renderer; this device fell back to WebGL2.';

/**
 * Resolves the runtime AND publishes the weather half of it.
 *
 * THE ONE SIDE EFFECT IN THIS FILE, AND WHY IT IS HERE. The weather systems are
 * constructed at module scope in legacy-main, before any settings object
 * exists, and the frame loop never hands them settings afterwards — it passes a
 * camera, a weather sample and a wind sample and nothing else. Without a latch,
 * every weather row in Options would be a switch wired to nothing, which is the
 * exact defect this lane was opened to fix.
 *
 * It is safe to sit in a resolver because the published value is a pure
 * function of `settings`: resolving twice with the same settings publishes the
 * same frozen numbers, and order between callers cannot matter. Consumers take
 * it as a DEFAULT ARGUMENT, so any caller that wants purity passes its own and
 * never reads the latch (`resetWeatherPresentation` exists for suites that do
 * exercise this path).
 *
 * This runs at boot and again on every Options apply — exactly the cadence a
 * presentation clamp needs.
 */
export function resolveGraphicsRuntime(
  requestedGraphics: GraphicsSettings,
  forceCompatibility = false,
  capability: GraphicsRouteCapability = {},
): GraphicsRuntime {
  // PASS 81 — the capability gate for the classic ray tracer. Since HF-438 the
  // trace ships inside QUALITY and MAX, so a renderer that cannot trace simply
  // has that one control switched off, with a reason: the player keeps the
  // rung they chose and every other value they asked for.
  const traceUnavailable = capability.rayTracingCapable === false && requestedGraphics.rayTracing !== 'off';
  const settings: GraphicsSettings = traceUnavailable
    ? Object.freeze({ ...requestedGraphics, rayTracing: 'off' as const })
    : requestedGraphics;
  const weather = resolveWeatherPresentation(settings);
  publishWeatherPresentation(weather);
  // Second latch, same contract, same cadence: a pure function of `settings`,
  // published here because the ambient particle runtime has no other route to
  // the player's choice.
  const ambientLife = resolveAmbientLife(settings);
  publishAmbientLife(ambientLife);
  const qualityScale = (tier: GraphicsSettings['particleQuality']): number => tier === 'low' ? 0.5 : tier === 'high' ? 0.8 : 1;
  const lightingScale = (tier: GraphicsSettings['indirectLighting']): number => tier === 'off' ? 0 : tier === 'low' ? 0.62 : 1;
  const bloomStrength = settings.bloomQuality === 'off' ? 0 : settings.bloomQuality === 'subtle' ? 0.065 : 0.14;
  const requestedAntialiasSamples = settings.antiAliasing === 'msaa-4x' ? 4 : settings.antiAliasing === 'msaa-2x' ? 2 : 0;
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
  const screenSpace = resolveScreenSpacePostRuntime({
    bakedIndirect: settings.bakedIndirect,
    volumetricLightShafts: settings.volumetricLightShafts,
    volumetricQuality: settings.volumetricQuality,
    screenSpaceReflections: settings.screenSpaceReflections,
    screenSpaceGi: settings.screenSpaceGi,
    depthOfField: settings.depthOfField,
    depthOfFieldStrength: settings.depthOfFieldStrength,
    motionBlur: settings.motionBlur,
    taaResolve: settings.taaResolve,
    spatialUpscaling: settings.spatialUpscaling,
    rayTracing: settings.rayTracing,
  }, { shadowsEnabled: settings.shadows === 'high' });
  // TAA owns the principal resolve. MSAA would pay the multisampled principal
  // target cost and then resolve it a second time, so admission makes the
  // principal target single-sampled while the saved selector remains intact.
  const antialiasSamples = screenSpace.taaResolve.enabled ? 0 : requestedAntialiasSamples;
  if (forceCompatibility) {
    return Object.freeze({
      requestedPreset: requestedGraphics.preset,
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
      // The compatibility route draws no rain at all (rainBypassReason ->
      // 'compat-profile'), but the player's settings are still resolved and
      // published: wind strength reaches particle drift and foliage on this
      // route, and a control that silently stops existing on one renderer is
      // worse than one that is honestly bounded.
      weather,
      // The compatibility route runs the ambient families at the LOW tier
      // rather than bypassing them (particles/index.ts says why), so the
      // player's row reaches this renderer too.
      ambientLife,
      reason: 'Compatibility renderer is active.',
    });
  }
  return Object.freeze({
    requestedPreset: requestedGraphics.preset,
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
    screenSpace,
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
    weather,
    ambientLife,
    reason: traceUnavailable ? RAY_TRACED_REQUIRES_WEBGPU_REASON : null,
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

/**
 * Public preset label after an explicit renderer review route is applied.
 *
 * An explicit review route is a stronger statement than any preset:
 * `?render=performance` already forced the whole budget down, and reporting a
 * preset the route does not run would be the same lie from the other
 * direction. It mirrors `resolveGraphicsRuntime`'s `effectivePreset`; the
 * trace's capability gate lives THERE — since HF-438 it switches the one
 * control off and keeps the rung — and its reason string is
 * `RAY_TRACED_REQUIRES_WEBGPU_REASON`, published through
 * `GraphicsRuntime.reason`.
 */
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
