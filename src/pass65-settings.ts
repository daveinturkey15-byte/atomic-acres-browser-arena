import type { RenderProfile } from './render-profile';
import { AUDIO_BUS_IDS, type AudioBusId } from './audio-buses';

export { AUDIO_BUS_IDS };
export type { AudioBusId };

export const PASS65_SETTINGS_STORAGE_KEY = 'atomic-acres-pass65-settings-v1';
export type GraphicsPreset = 'performance' | 'high' | 'max' | 'custom';
export type ShadowQuality = 'off' | 'high';

export type GraphicsSettings = Readonly<{
  schemaVersion: 1;
  preset: GraphicsPreset;
  renderScale: number;
  adaptiveResolution: boolean;
  targetFps: 60 | 90 | 120 | 144;
  shadows: ShadowQuality;
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

export type Pass65Settings = Readonly<{
  version: 1;
  graphics: GraphicsSettings;
  audio: AudioSettings;
  accessibility: AccessibilitySettings;
}>;

export type GraphicsRuntime = Readonly<{
  requestedPreset: GraphicsPreset;
  effectivePreset: GraphicsPreset;
  renderProfile: RenderProfile;
  renderScale: number;
  adaptive: boolean;
  targetFps: GraphicsSettings['targetFps'];
  shadows: boolean;
  reason: string | null;
}>;

export type AccessibilityRuntime = Readonly<AccessibilitySettings & {
  reducedSensory: boolean;
  reasons: readonly string[];
}>;

type CapabilityHints = Readonly<{
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  forceCompatibility?: boolean;
}>;

const TARGET_FPS = new Set([60, 90, 120, 144]);
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
  if (preset === 'performance') {
    return Object.freeze({ schemaVersion: 1, preset, renderScale: 0.75, adaptiveResolution: true, targetFps: 60, shadows: 'off' });
  }
  if (preset === 'max') {
    return Object.freeze({ schemaVersion: 1, preset, renderScale: 1, adaptiveResolution: false, targetFps: 60, shadows: 'high' });
  }
  return Object.freeze({ schemaVersion: 1, preset, renderScale: 1, adaptiveResolution: true, targetFps: 60, shadows: 'high' });
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
  });
}

export function normalizePass65Settings(value: unknown, capabilities: CapabilityHints = {}): Pass65Settings {
  const defaults = createDefaultPass65Settings(capabilities);
  if (!value || typeof value !== 'object') return defaults;
  const raw = value as Partial<Pass65Settings>;
  const rawGraphics = raw.graphics && typeof raw.graphics === 'object' ? raw.graphics as Partial<GraphicsSettings> : {};
  const preset = PRESETS.has(rawGraphics.preset as GraphicsPreset) ? rawGraphics.preset as GraphicsPreset : defaults.graphics.preset;
  const base = preset === 'custom' ? defaults.graphics : presetGraphics(preset);
  const targetCandidate = finiteNumber(rawGraphics.targetFps, base.targetFps);
  const targetFps = (TARGET_FPS.has(targetCandidate) ? targetCandidate : base.targetFps) as GraphicsSettings['targetFps'];
  const graphics: GraphicsSettings = Object.freeze({
    schemaVersion: 1,
    preset,
    renderScale: Number(clamp(finiteNumber(rawGraphics.renderScale, base.renderScale), 0.5, 2).toFixed(2)),
    adaptiveResolution: bool(rawGraphics.adaptiveResolution, base.adaptiveResolution),
    targetFps,
    shadows: rawGraphics.shadows === 'off' || rawGraphics.shadows === 'high' ? rawGraphics.shadows : base.shadows,
  });
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
  return Object.freeze({ version: 1, graphics, audio, accessibility });
}

export function parsePass65Settings(serialized: string | null, capabilities: CapabilityHints = {}): Pass65Settings {
  if (!serialized) return createDefaultPass65Settings(capabilities);
  try {
    return normalizePass65Settings(JSON.parse(serialized), capabilities);
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
  if (forceCompatibility) {
    return Object.freeze({
      requestedPreset: settings.preset,
      effectivePreset: 'performance',
      renderProfile: 'compat',
      renderScale: 0.2,
      adaptive: false,
      targetFps: settings.targetFps,
      shadows: false,
      reason: 'Compatibility renderer is active.',
    });
  }
  return Object.freeze({
    requestedPreset: settings.preset,
    effectivePreset: settings.preset,
    renderProfile: settings.preset === 'performance' ? 'performance' : 'blender',
    renderScale: Math.min(1, settings.renderScale),
    adaptive: settings.adaptiveResolution,
    targetFps: settings.targetFps,
    shadows: settings.shadows === 'high' && settings.preset !== 'performance',
    reason: settings.renderScale > 1 ? 'Render scale is safety-capped at 100% for this renderer generation.' : null,
  });
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
