import { resolveLightingConditions, resolveWorldStudioLightingInspection, type LightingConditionsInput, type LightingConditionWrites } from '../rendering/lighting-conditions';
import { deriveWeatherMatchSeed } from '../legacy-pure-helpers-2';
import { activeWeatherPresentation, type WeatherPresentationRuntime } from '../weather/weather-settings';
import { forcedWeatherSample, weatherStateRow, type WeatherSample, type WeatherState } from '../weather/weather-state';
import { STUDIO_ENVIRONMENTS, studioEnvironmentForSeed, type StudioEnvironment, type StudioPresetId } from './environment';

/** Waiting lobbies use their shared host identity and epoch zero; no local fallback. */
export function studioWeatherSeed(
  hosted: boolean, hostId: string | null, hostEpoch: number | null, offlineSeed: number,
): number | null {
  if (!hosted) return offlineSeed >>> 0;
  if (!hostId || (hostEpoch !== null && (!Number.isFinite(hostEpoch) || hostEpoch < 0))) return null;
  return deriveWeatherMatchSeed(hostId, hostEpoch ?? 0);
}

export function isStudioPresetId(value: unknown): value is StudioPresetId {
  return STUDIO_ENVIRONMENTS.some((preset) => preset.id === value);
}

export type StudioWeatherRoute = Readonly<{
  /** Shared simulation identity, unaffected by local presentation settings. */
  preset: StudioEnvironment;
  /** Root-owned nature/snow consume these clamped presentation values. */
  environment: StudioEnvironment;
  weather: WeatherSample;
}>;

/** Cache roots and samples between seed/preset/settings changes, not per frame. */
export function createStudioWeatherRouter(): Readonly<{
  resolve(seed: number, hosted: boolean, offlineOverride?: string | null, presentation?: WeatherPresentationRuntime): StudioWeatherRoute;
}> {
  let previousPreset: StudioEnvironment | null = null;
  let previousPresentation: WeatherPresentationRuntime | null = null;
  let previousRoute: StudioWeatherRoute | null = null;
  return {
    resolve(seed, hosted, offlineOverride, presentation = activeWeatherPresentation()) {
      const preset = studioEnvironmentForSeed(seed, hosted ? null : offlineOverride);
      if (previousRoute && previousPreset === preset && previousPresentation === presentation) return previousRoute;
      // Spring rain is present immediately. Snow uses the overcast sky and
      // root-owned snow particles; it never creates rain streaks or a new wire state.
      const state: WeatherState = preset.rain > 0 ? 'heavy-rain'
        : preset.snow > 0 || preset.id === 'overcast-morning' ? 'overcast' : 'clear';
      const base = forcedWeatherSample('world-studio', state, presentation, 0);
      const ceiling = weatherStateRow(presentation.ceilingState);
      const precipitationCeiling = presentation.weatherEnabled ? ceiling.rainRate : 0;
      const rain = Math.min(preset.rain, precipitationCeiling);
      const snow = Math.min(preset.snow, precipitationCeiling);
      const wetness = presentation.weatherEnabled && presentation.wetSurfaces
        ? Math.min(preset.wetness, ceiling.wetnessTarget) : 0;
      const environment: StudioEnvironment = Object.freeze({
        ...preset, rain, snow, wetness, wind: preset.wind * presentation.windStrength,
      });
      const weather: WeatherSample = Object.freeze({
        ...base, rainRate: rain, raining: rain > 0.001, wetness,
        windMultiplier: base.windMultiplier * preset.wind,
      });
      previousPreset = preset;
      previousPresentation = presentation;
      previousRoute = Object.freeze({ preset, environment, weather });
      return previousRoute;
    },
  };
}

/**
 * Shared random mode follows the weather preset's hour. The production catalog
 * remains pinned until its band scan passes. Explicit fixed-hour inspection is
 * offline only; neither a guest URL nor its preset override can change the sun.
 */
export function resolveStudioLightingConditions(
  input: Omit<LightingConditionsInput, 'arenaId'> & {
    hosted: boolean;
    offlinePresetOverride?: string | null;
  },
): LightingConditionWrites {
  const { hosted, offlinePresetOverride, fixedHour, ...shared } = input;
  if (!hosted && fixedHour !== undefined && Number.isFinite(fixedHour)) {
    return resolveWorldStudioLightingInspection({ ...shared, fixedHour });
  }
  const preset = studioEnvironmentForSeed(shared.matchSeed ?? 0, hosted ? null : offlinePresetOverride);
  return resolveLightingConditions({
    ...shared, arenaId: 'world-studio',
    ...((shared.choice ?? 'random') === 'random' ? { fixedHour: preset.hour } : {}),
  });
}
