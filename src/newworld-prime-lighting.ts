import { DeterministicRng } from './deterministic-rng';

/**
 * newworld-prime lighting + atmosphere parameter sets (presentation-only).
 *
 * This module is pure data: it mints no materials, no ShaderMaterial/GLSL and
 * no scene objects. The Shell resolves every entry through the arena registry:
 * TSL pipeline roles below name verified `pass64.*.tsl.v1` pipelines from
 * `src/rendering/tsl-migration-inventory.ts`, and practical role ids name
 * `ArenaPracticalDefinition` entries owned by the arena visual definition.
 * Authority, colliders, spawns and nav are untouched; variants change light +
 * weather only, never layout or camera.
 *
 * Visual bar (orchestrator brief, not in repo):
 * - batch-3/variants/__dawn-mist sample plates
 * - batch-3/variants/__golden-dusk sample plates
 * - batch-3/variants/__overcast sample plates
 * - batch-3/variants/__night-rain sample plates
 * - LAYOUT_CONTRACT Style section
 */

export type NewworldPrimeLightingVariant =
  | 'late-morning'
  | 'dawn-mist'
  | 'golden-dusk'
  | 'overcast'
  | 'night-rain';

/** Deterministic seed for every derived lighting value in this module. */
export const NEWWORLD_PRIME_LIGHTING_SEED = 0x9e3779b1;

/** Late-morning key sun position in metres (matches DEFAULT_LIGHTING azimuth family). */
export const NEWWORLD_PRIME_SUN_POSITION_LATE_MORNING = Object.freeze([-48, 42, 30] as const);
/** Dawn-mist key sun position in metres: low eastern sun through the mist layer. */
export const NEWWORLD_PRIME_SUN_POSITION_DAWN_MIST = Object.freeze([-62, 14, 38] as const);
/** Golden-dusk key sun position in metres: low western sun, long shadows. */
export const NEWWORLD_PRIME_SUN_POSITION_GOLDEN_DUSK = Object.freeze([58, 16, -34] as const);
/** Overcast key sun position in metres: high diffuse dome, direction barely reads. */
export const NEWWORLD_PRIME_SUN_POSITION_OVERCAST = Object.freeze([-12, 64, 8] as const);
/** Night-rain key (moon) position in metres: steep cool wash above the rain. */
export const NEWWORLD_PRIME_SUN_POSITION_NIGHT_RAIN = Object.freeze([18, 58, -22] as const);

/** Late-morning key sun intensity (mirrors the blender-family ~3.2 neutral day). */
export const NEWWORLD_PRIME_SUN_INTENSITY_LATE_MORNING = 3.2;
/** Late-morning ambient intensity. */
export const NEWWORLD_PRIME_AMBIENT_INTENSITY_LATE_MORNING = 0.42;
/** Late-morning fog window in metres. */
export const NEWWORLD_PRIME_FOG_NEAR_LATE_MORNING_METRES = 58;
export const NEWWORLD_PRIME_FOG_FAR_LATE_MORNING_METRES = 148;
/** Late-morning HDR exposure. */
export const NEWWORLD_PRIME_EXPOSURE_LATE_MORNING = 1.08;

/** Verified TSL pipeline roles this arena requests; owned by the TSL inventory. */
export const NEWWORLD_PRIME_TSL_PIPELINE_ROLES = Object.freeze([
  'pass64.sky-atmosphere.tsl.v1',
  'pass64.hdr-grade-grain.tsl.v1',
  'pass64.atmosphere-mist.tsl.v1',
  'pass64.atmosphere-smoke.tsl.v1',
  'pass64.atmosphere-dust.tsl.v1',
] as const);

/** Practical-light role ids this arena requests; owned by the visual definition. */
export const NEWWORLD_PRIME_PRACTICAL_ROLE_IDS = Object.freeze([
  'newworld-prime-street-fixtures',
  'newworld-prime-interior-fixtures',
  'newworld-prime-exterior-contrast-keys',
] as const);

export type NewworldPrimeLightingParams = Readonly<{
  variant: NewworldPrimeLightingVariant;
  /** Key sun colour/moon colour as a hex number; position in metres. */
  sunColor: number;
  sunIntensity: number;
  sunPosition: readonly [number, number, number];
  ambientColor: number;
  ambientIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  exposure: number;
  fog: Readonly<{ color: number; nearMetres: number; farMetres: number }>;
  atmosphere: Readonly<{ preset: string; mist: number; dust: number; clouds: boolean }>;
  /** Rain streak density 0..1; 0 disables the rain role request. */
  rain: number;
  tslPipelineRoles: readonly string[];
  practicalRoleIds: readonly string[];
}>;

function baseParams(params: Omit<NewworldPrimeLightingParams, 'tslPipelineRoles' | 'practicalRoleIds'>): NewworldPrimeLightingParams {
  return Object.freeze({
    ...params,
    sunPosition: Object.freeze([...params.sunPosition] as [number, number, number]),
    fog: Object.freeze({ ...params.fog }),
    atmosphere: Object.freeze({ ...params.atmosphere }),
    tslPipelineRoles: NEWWORLD_PRIME_TSL_PIPELINE_ROLES,
    practicalRoleIds: NEWWORLD_PRIME_PRACTICAL_ROLE_IDS,
  });
}

/**
 * Late-morning base: neutral high sun, open fog window, light haze.
 * Bar: LAYOUT_CONTRACT Style section (daylight reference).
 */
export const NEWWORLD_PRIME_LATE_MORNING_LIGHTING: NewworldPrimeLightingParams = baseParams({
  variant: 'late-morning',
  sunColor: 0xfff1ce,
  sunIntensity: NEWWORLD_PRIME_SUN_INTENSITY_LATE_MORNING,
  sunPosition: NEWWORLD_PRIME_SUN_POSITION_LATE_MORNING,
  ambientColor: 0x8fb0bf,
  ambientIntensity: NEWWORLD_PRIME_AMBIENT_INTENSITY_LATE_MORNING,
  hemisphereSky: 0xc9dbe2,
  hemisphereGround: 0xb8ab8d,
  hemisphereIntensity: 0.72,
  exposure: NEWWORLD_PRIME_EXPOSURE_LATE_MORNING,
  fog: {
    color: 0xb1c0be,
    nearMetres: NEWWORLD_PRIME_FOG_NEAR_LATE_MORNING_METRES,
    farMetres: NEWWORLD_PRIME_FOG_FAR_LATE_MORNING_METRES,
  },
  atmosphere: { preset: 'newworld-prime-late-morning', mist: 0.3, dust: 0.28, clouds: true },
  rain: 0,
});

/**
 * Dawn mist: low warm-grey sun, dense ground mist, heavy bloom on fixtures.
 * Bar: batch-3/variants/__dawn-mist sample plates.
 */
export const NEWWORLD_PRIME_DAWN_MIST_LIGHTING: NewworldPrimeLightingParams = baseParams({
  variant: 'dawn-mist',
  sunColor: 0xffd9ae,
  sunIntensity: 2.1,
  sunPosition: NEWWORLD_PRIME_SUN_POSITION_DAWN_MIST,
  ambientColor: 0xa9b8bd,
  ambientIntensity: 0.36,
  hemisphereSky: 0xd3cfc4,
  hemisphereGround: 0x9d9789,
  hemisphereIntensity: 0.66,
  exposure: 1.04,
  fog: { color: 0xc3c9c2, nearMetres: 26, farMetres: 96 },
  atmosphere: { preset: 'newworld-prime-dawn-mist', mist: 0.85, dust: 0.12, clouds: false },
  rain: 0,
});

/**
 * Golden dusk: low amber sun, long-shadow contrast, warm grade lift.
 * Bar: batch-3/variants/__golden-dusk sample plates.
 */
export const NEWWORLD_PRIME_GOLDEN_DUSK_LIGHTING: NewworldPrimeLightingParams = baseParams({
  variant: 'golden-dusk',
  sunColor: 0xffb46b,
  sunIntensity: 2.6,
  sunPosition: NEWWORLD_PRIME_SUN_POSITION_GOLDEN_DUSK,
  ambientColor: 0xb08d7f,
  ambientIntensity: 0.34,
  hemisphereSky: 0xd9a988,
  hemisphereGround: 0x8d7f6e,
  hemisphereIntensity: 0.6,
  exposure: 1.1,
  fog: { color: 0xc49a7e, nearMetres: 44, farMetres: 128 },
  atmosphere: { preset: 'newworld-prime-golden-dusk', mist: 0.38, dust: 0.34, clouds: true },
  rain: 0,
});

/**
 * Overcast: flattened diffuse dome, desaturated grade, closer fog wall.
 * Bar: batch-3/variants/__overcast sample plates.
 */
export const NEWWORLD_PRIME_OVERCAST_LIGHTING: NewworldPrimeLightingParams = baseParams({
  variant: 'overcast',
  sunColor: 0xdde4e6,
  sunIntensity: 1.4,
  sunPosition: NEWWORLD_PRIME_SUN_POSITION_OVERCAST,
  ambientColor: 0x9aa5ab,
  ambientIntensity: 0.52,
  hemisphereSky: 0xbcc5c7,
  hemisphereGround: 0x8f8b80,
  hemisphereIntensity: 0.9,
  exposure: 1.0,
  fog: { color: 0xaeb6b4, nearMetres: 38, farMetres: 112 },
  atmosphere: { preset: 'newworld-prime-overcast', mist: 0.55, dust: 0.08, clouds: true },
  rain: 0,
});

/**
 * Night rain: cool moon wash, wet-surface practical lift, rain streaks on.
 * Bar: batch-3/variants/__night-rain sample plates.
 */
export const NEWWORLD_PRIME_NIGHT_RAIN_LIGHTING: NewworldPrimeLightingParams = baseParams({
  variant: 'night-rain',
  sunColor: 0x9fb8e8,
  sunIntensity: 1.1,
  sunPosition: NEWWORLD_PRIME_SUN_POSITION_NIGHT_RAIN,
  ambientColor: 0x5d7186,
  ambientIntensity: 0.5,
  hemisphereSky: 0x4d5a70,
  hemisphereGround: 0x3c3a36,
  hemisphereIntensity: 0.55,
  exposure: 1.12,
  fog: { color: 0x3d4a58, nearMetres: 30, farMetres: 104 },
  atmosphere: { preset: 'newworld-prime-night-rain', mist: 0.62, dust: 0.05, clouds: true },
  rain: 0.8,
});

export const NEWWORLD_PRIME_LIGHTING_SETS: Readonly<Record<NewworldPrimeLightingVariant, NewworldPrimeLightingParams>> = Object.freeze({
  'late-morning': NEWWORLD_PRIME_LATE_MORNING_LIGHTING,
  'dawn-mist': NEWWORLD_PRIME_DAWN_MIST_LIGHTING,
  'golden-dusk': NEWWORLD_PRIME_GOLDEN_DUSK_LIGHTING,
  overcast: NEWWORLD_PRIME_OVERCAST_LIGHTING,
  'night-rain': NEWWORLD_PRIME_NIGHT_RAIN_LIGHTING,
});

/** Selects the parameter set for a variant; defaults to the late-morning base. */
export function newworldPrimeLightingFor(variant: NewworldPrimeLightingVariant = 'late-morning'): NewworldPrimeLightingParams {
  return NEWWORLD_PRIME_LIGHTING_SETS[variant] ?? NEWWORLD_PRIME_LATE_MORNING_LIGHTING;
}

export type NewworldPrimeLightingJitter = Readonly<{
  variant: NewworldPrimeLightingVariant;
  /** Deterministic ±0.02 mist shimmer derived from the module seed. */
  mistDelta: number;
  /** Deterministic ±0.02 dust shimmer derived from the module seed. */
  dustDelta: number;
}>;

/**
 * Deterministic per-variant shimmer for mist/dust cards. Presentation-only;
 * gameplay and layout are unaffected. Never uses Math.random.
 */
export function newworldPrimeLightingJitter(variant: NewworldPrimeLightingVariant = 'late-morning'): NewworldPrimeLightingJitter {
  const rng = new DeterministicRng(NEWWORLD_PRIME_LIGHTING_SEED).fork(`lighting-jitter:${variant}`);
  return Object.freeze({
    variant,
    mistDelta: (rng.next() - 0.5) * 0.04,
    dustDelta: (rng.next() - 0.5) * 0.04,
  });
}
