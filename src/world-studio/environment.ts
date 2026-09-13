export type StudioPresetId = 'clear-noon' | 'golden-wind' | 'spring-rain' | 'winter-snow' | 'overcast-morning';
export type StudioEnvironment = Readonly<{ id: StudioPresetId; hour: number; wind: number; rain: number; snow: number; wetness: number }>;

export const STUDIO_ENVIRONMENTS: readonly StudioEnvironment[] = Object.freeze([
  Object.freeze({ id: 'clear-noon', hour: 12, wind: .22, rain: 0, snow: 0, wetness: 0 }),
  Object.freeze({ id: 'golden-wind', hour: 16.5, wind: .85, rain: 0, snow: 0, wetness: .05 }),
  Object.freeze({ id: 'spring-rain', hour: 11, wind: .52, rain: .48, snow: 0, wetness: .7 }),
  Object.freeze({ id: 'winter-snow', hour: 13.5, wind: .35, rain: 0, snow: .65, wetness: .12 }),
  Object.freeze({ id: 'overcast-morning', hour: 9.5, wind: .48, rain: 0, snow: 0, wetness: .2 }),
]);

/** Pure shared match input. Late join and fresh construction resolve identical presets. */
export function studioEnvironmentForSeed(seed: number, offlineOverride?: string | null): StudioEnvironment {
  const forced = offlineOverride && STUDIO_ENVIRONMENTS.find((preset) => preset.id === offlineOverride);
  if (forced) return forced;
  let n = seed >>> 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = (n ^ (n >>> 16)) >>> 0;
  return STUDIO_ENVIRONMENTS[n % STUDIO_ENVIRONMENTS.length]!;
}
