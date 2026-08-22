/**
 * HF-363 — Per-Arena Ambience & Grade Identity Layer.
 *
 * INTENDED CONSUMPTION POINT (Anchored Note):
 * ---------------------------------------------------------------------------
 * This module is the single authoritative source of per-arena lighting,
 * atmospheric ambience, and grade identity. It feeds the unified filmic post chain
 * and is intended to be consumed at:
 *
 * 1. Scene Lighting Setup (pass64-tsl-scene.ts / legacy-main.ts / arena visual definition loaders):
 *    Constructs the directional sun (or moon/key) light, hemisphere sky/ground fill,
 *    and baseline ambient illumination for the selected arena at map load time.
 *
 * 2. Exponential Fog Binding (scene.fog = new THREE.FogExp2(fogColor, fogDensity)):
 *    Replaces per-map ad-hoc fog configs with a single exponential fog tinted
 *    directly from each arena's unique grade identity, preserving map mood without
 *    compromising combat visibility.
 *
 * 3. Filmic Grading Pipeline (src/rendering/grade-profile.ts & post-processing passes):
 *    Feeds arena-specific exposure, contrast, saturation, and split-toning tint biases
 *    into the shared ACES-filmic post pipeline so every arena reads as a distinct place
 *    through one global post chain rather than per-map shader hacks.
 * ---------------------------------------------------------------------------
 *
 * Combat-Safety Contract (Competitive FPS):
 * - Minimum Shadow Lift Floor: No arena grade may crush shadow detail where enemies
 *   hide in shade, doorways, or under structures. Every arena enforces an ambient
 *   intensity >= MIN_AMBIENT_INTENSITY and a shadow lift floor >= MIN_SHADOW_LIFT.
 * - Maximum Fog Density Ceiling: Exponential fog density must never obscure active
 *   combat sightlines below the competitive visibility threshold (transmittance >= 60%
 *   at the arena's maximum authored engagement distance).
 */

import type { ArenaId } from './map-selection';

export type FrozenVector3 = readonly [number, number, number];

export type ArenaGradeIdentity = Readonly<{
  /** Canonical arena identifier matching ArenaId from map-selection */
  id: ArenaId;
  /** Player-facing display name */
  displayName: string;
  /** High-level visual narrative and palette grounding description */
  description: string;

  // --- Top-level flat accessors for lighting & fog loaders ---
  sunColor: number;
  sunIntensity: number;
  sunPosition: FrozenVector3;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  ambientLevel: number;
  fogColor: number;
  fogDensity: number;

  // --- Structured domain records ---
  /** Primary directional celestial / key light */
  sun: Readonly<{
    color: number;
    intensity: number;
    position: FrozenVector3;
  }>;

  /** Hemisphere light for natural sky/ground environmental fill */
  hemisphere: Readonly<{
    skyColor: number;
    groundColor: number;
    intensity: number;
  }>;

  /** Baseline ambient fill light */
  ambient: Readonly<{
    color: number;
    intensity: number;
  }>;

  /** Exponential fog (THREE.FogExp2) derived from the arena's grade */
  fog: Readonly<{
    color: number;
    density: number;
    /** Derivation reasoning grounded in the arena's built geometry & grade */
    derivation: string;
  }>;

  /** Filmic grade parameters feeding the post chain */
  grade: Readonly<{
    exposure: number;
    contrast: number;
    saturation: number;
    shadowTint: number;
    highlightTint: number;
    shadowLift: number;
  }>;

  /** Combat sightline and visibility verification metrics */
  combatMetrics: Readonly<{
    maxEngagementDistance: number;
    minEngagementVisibility: number;
  }>;
}>;

export type FrozenArenaGradeIdentity = ArenaGradeIdentity;

/**
 * HF-363 Competitive combat-safety bounds.
 * Verified across every registered arena to ensure zero unfair visibility loss.
 */
export const COMBAT_SAFETY_BOUNDS = Object.freeze({
  /** Minimum ambient intensity to guarantee shadow separation from pitch black */
  minAmbientIntensity: 0.20,
  /** Minimum shadow lift floor in display toe to prevent shadow crushing */
  minShadowLift: 0.035,
  /** Maximum allowable exponential fog density across competitive arenas */
  maxFogDensity: 0.0055,
  /** Minimum required visibility transmittance at maximum authored engagement distance (60%) */
  minEngagementTransmittance: 0.60,
  /** Maximum midtone contrast to prevent shadow crushing in post */
  maxGradeContrast: 1.15,
} as const);

/**
 * Calculates exponential fog transmittance: T(d) = e^(-density * distance).
 * Represents the fraction of unattenuated light/contrast reaching the player camera.
 */
export function calculateFogTransmittance(density: number, distance: number): number {
  return Math.exp(-density * distance);
}

// ---------------------------------------------------------------------------
// 1. Atomic Acres (Nuke Town)
// ---------------------------------------------------------------------------
const ATOMIC_ACRES_IDENTITY: ArenaGradeIdentity = Object.freeze({
  id: 'atomic-acres',
  displayName: 'Nuke Town',
  description: 'Retro-future cul-de-sac neighbourhood with vibrant aqua/orange houses under late-afternoon sunset sky.',
  sunColor: 0xfff1ce,
  sunIntensity: 3.2,
  sunPosition: Object.freeze([-48, 42, 30] as const),
  hemisphereSky: 0xc9dbe2,
  hemisphereGround: 0xb8ab8d,
  hemisphereIntensity: 0.85,
  ambientColor: 0x8fb0bf,
  ambientIntensity: 0.40,
  ambientLevel: 0.40,
  fogColor: 0xb1c0be,
  fogDensity: 0.0035,
  sun: Object.freeze({
    color: 0xfff1ce,
    intensity: 3.2,
    position: Object.freeze([-48, 42, 30] as const),
  }),
  hemisphere: Object.freeze({
    skyColor: 0xc9dbe2,
    groundColor: 0xb8ab8d,
    intensity: 0.85,
  }),
  ambient: Object.freeze({
    color: 0x8fb0bf,
    intensity: 0.40,
  }),
  fog: Object.freeze({
    color: 0xb1c0be,
    density: 0.0035,
    derivation: 'Blended from sunset sky (0xc9dbe2) and warm earth (0xb8ab8d) to simulate dusty farmland atmosphere without obscuring house-to-house sightlines.',
  }),
  grade: Object.freeze({
    exposure: 1.08,
    contrast: 1.03,
    saturation: 1.02,
    shadowTint: 0x274356,
    highlightTint: 0xffd5a2,
    shadowLift: 0.040,
  }),
  combatMetrics: Object.freeze({
    maxEngagementDistance: 75,
    minEngagementVisibility: calculateFogTransmittance(0.0035, 75),
  }),
});

// ---------------------------------------------------------------------------
// 2. Skyline Terminal (Terminal)
// ---------------------------------------------------------------------------
const SKYLINE_TERMINAL_IDENTITY: ArenaGradeIdentity = Object.freeze({
  id: 'skyline-terminal',
  displayName: 'Terminal',
  description: 'Modern airport concourse and jetliner tarmac apron under crisp cool morning dawn light.',
  sunColor: 0xeaf7ff,
  sunIntensity: 2.9,
  sunPosition: Object.freeze([-35, 45, -25] as const),
  hemisphereSky: 0xaed2e6,
  hemisphereGround: 0x6a7882,
  hemisphereIntensity: 0.80,
  ambientColor: 0x8aa5af,
  ambientIntensity: 0.38,
  ambientLevel: 0.38,
  fogColor: 0xa9bec4,
  fogDensity: 0.0030,
  sun: Object.freeze({
    color: 0xeaf7ff,
    intensity: 2.9,
    position: Object.freeze([-35, 45, -25] as const),
  }),
  hemisphere: Object.freeze({
    skyColor: 0xaed2e6,
    groundColor: 0x6a7882,
    intensity: 0.80,
  }),
  ambient: Object.freeze({
    color: 0x8aa5af,
    intensity: 0.38,
  }),
  fog: Object.freeze({
    color: 0xa9bec4,
    density: 0.0030,
    derivation: 'Derived from the cool dawn sky (0xaed2e6) and concrete tarmac (0x6a7882) into a crisp aerodrome morning mist that preserves open runway sightlines.',
  }),
  grade: Object.freeze({
    exposure: 1.06,
    contrast: 1.04,
    saturation: 0.98,
    shadowTint: 0x1f3344,
    highlightTint: 0xf0f6ff,
    shadowLift: 0.038,
  }),
  combatMetrics: Object.freeze({
    maxEngagementDistance: 85,
    minEngagementVisibility: calculateFogTransmittance(0.0030, 85),
  }),
});

// ---------------------------------------------------------------------------
// 3. Rustworks 1v1 (RustRig)
// ---------------------------------------------------------------------------
const RUSTWORKS_1V1_IDENTITY: ArenaGradeIdentity = Object.freeze({
  id: 'rustworks-1v1',
  displayName: 'RustRig',
  description: 'Moody nighttime offshore oil rig with weathered rust plates, industrial floodlights, and deep maritime atmosphere.',
  sunColor: 0xe2ebff,
  sunIntensity: 3.6,
  sunPosition: Object.freeze([-62, 35, 38] as const),
  hemisphereSky: 0x3a4c60,
  hemisphereGround: 0x2a221e,
  hemisphereIntensity: 0.75,
  ambientColor: 0x718aa5,
  ambientIntensity: 0.32,
  ambientLevel: 0.32,
  fogColor: 0x293747,
  fogDensity: 0.0042,
  sun: Object.freeze({
    color: 0xe2ebff,
    intensity: 3.6,
    position: Object.freeze([-62, 35, 38] as const),
  }),
  hemisphere: Object.freeze({
    skyColor: 0x3a4c60,
    groundColor: 0x2a221e,
    intensity: 0.75,
  }),
  ambient: Object.freeze({
    color: 0x718aa5,
    intensity: 0.32,
  }),
  fog: Object.freeze({
    color: 0x293747,
    density: 0.0042,
    derivation: 'Derived from deep oceanic navy night tones (0x14202c) and wet oxidized steel (0x2a221e) to evoke dense sea spray while keeping the 54x58m deck clear.',
  }),
  grade: Object.freeze({
    exposure: 1.20,
    contrast: 1.06,
    saturation: 0.95,
    shadowTint: 0x14202c,
    highlightTint: 0xffd2a0,
    shadowLift: 0.045,
  }),
  combatMetrics: Object.freeze({
    maxEngagementDistance: 50,
    minEngagementVisibility: calculateFogTransmittance(0.0042, 50),
  }),
});

// ---------------------------------------------------------------------------
// 4. Gun Range
// ---------------------------------------------------------------------------
const GUN_RANGE_IDENTITY: ArenaGradeIdentity = Object.freeze({
  id: 'gun-range',
  displayName: 'Gun Range',
  description: 'Indoor ballistics training lab with high-tech fluorescent panels, target lanes, and clean controlled testing atmosphere.',
  sunColor: 0xffffff,
  sunIntensity: 0.0,
  sunPosition: Object.freeze([0, 20, 0] as const),
  hemisphereSky: 0xb0d0d8,
  hemisphereGround: 0x38444a,
  hemisphereIntensity: 0.90,
  ambientColor: 0xc8e2e6,
  ambientIntensity: 0.64,
  ambientLevel: 0.64,
  fogColor: 0x28333a,
  fogDensity: 0.0018,
  sun: Object.freeze({
    color: 0xffffff,
    intensity: 0.0,
    position: Object.freeze([0, 20, 0] as const),
  }),
  hemisphere: Object.freeze({
    skyColor: 0xb0d0d8,
    groundColor: 0x38444a,
    intensity: 0.90,
  }),
  ambient: Object.freeze({
    color: 0xc8e2e6,
    intensity: 0.64,
  }),
  fog: Object.freeze({
    color: 0x28333a,
    density: 0.0018,
    derivation: 'Tinted from dark rubber backing (0x38444a) and concrete acoustic baffles, tuned to ultra-low density so 50m lane targets remain razor sharp.',
  }),
  grade: Object.freeze({
    exposure: 1.00,
    contrast: 1.02,
    saturation: 1.00,
    shadowTint: 0x183038,
    highlightTint: 0xffffff,
    shadowLift: 0.050,
  }),
  combatMetrics: Object.freeze({
    maxEngagementDistance: 55,
    minEngagementVisibility: calculateFogTransmittance(0.0018, 55),
  }),
});

// ---------------------------------------------------------------------------
// 5. Farcrysis
// ---------------------------------------------------------------------------
const FARCRYSIS_IDENTITY: ArenaGradeIdentity = Object.freeze({
  id: 'farcrysis',
  displayName: 'Farcrysis',
  description: 'Tropical Pacific island research outpost with golden-hour beach sunlight, lush jungle canopy, and turquoise lagoon water.',
  sunColor: 0xffd9a0,
  sunIntensity: 3.1,
  sunPosition: Object.freeze([-18, 22, 25] as const),
  hemisphereSky: 0xffe8cc,
  hemisphereGround: 0x4a6b3a,
  hemisphereIntensity: 0.55,
  ambientColor: 0x9fbfa8,
  ambientIntensity: 0.42,
  ambientLevel: 0.42,
  fogColor: 0xcfe0c8,
  fogDensity: 0.0028,
  sun: Object.freeze({
    color: 0xffd9a0,
    intensity: 3.1,
    position: Object.freeze([-18, 22, 25] as const),
  }),
  hemisphere: Object.freeze({
    skyColor: 0xffe8cc,
    groundColor: 0x4a6b3a,
    intensity: 0.55,
  }),
  ambient: Object.freeze({
    color: 0x9fbfa8,
    intensity: 0.42,
  }),
  fog: Object.freeze({
    color: 0xcfe0c8,
    density: 0.0028,
    derivation: 'Derived from golden-hour sun (0xffd9a0), beach sand (0xd9c08a), and lush jungle canopy (0x9fbfa8) matching farcrysis-art.ts FogExp2 specifications.',
  }),
  grade: Object.freeze({
    exposure: 1.08,
    contrast: 1.03,
    saturation: 1.08,
    shadowTint: 0x1e3828,
    highlightTint: 0xffe2b8,
    shadowLift: 0.042,
  }),
  combatMetrics: Object.freeze({
    maxEngagementDistance: 65,
    minEngagementVisibility: calculateFogTransmittance(0.0028, 65),
  }),
});

// ---------------------------------------------------------------------------
// 6. High Seas
// ---------------------------------------------------------------------------
const HIGH_SEAS_IDENTITY: ArenaGradeIdentity = Object.freeze({
  id: 'high-seas',
  displayName: 'High Seas',
  description: 'Compact luxury yacht at clear ocean daybreak, with warm sun on white decks and cool maritime fill through the cabins.',
  sunColor: 0xffe3bb,
  sunIntensity: 3.0,
  sunPosition: Object.freeze([-28, 32, -22] as const),
  hemisphereSky: 0xc7e7ed,
  hemisphereGround: 0x5a7074,
  hemisphereIntensity: 0.78,
  ambientColor: 0x9fc7cf,
  ambientIntensity: 0.40,
  ambientLevel: 0.40,
  fogColor: 0xb8d6dc,
  fogDensity: 0.0032,
  sun: Object.freeze({
    color: 0xffe3bb,
    intensity: 3.0,
    position: Object.freeze([-28, 32, -22] as const),
  }),
  hemisphere: Object.freeze({
    skyColor: 0xc7e7ed,
    groundColor: 0x5a7074,
    intensity: 0.78,
  }),
  ambient: Object.freeze({
    color: 0x9fc7cf,
    intensity: 0.40,
  }),
  fog: Object.freeze({
    color: 0xb8d6dc,
    density: 0.0032,
    derivation: 'Derived from the authored daybreak sky, white yacht superstructure, and cyan open ocean; density preserves the full 88 m bow-to-stern engagement lane.',
  }),
  grade: Object.freeze({
    exposure: 1.06,
    contrast: 1.03,
    saturation: 1.02,
    shadowTint: 0x294a58,
    highlightTint: 0xffe3bb,
    shadowLift: 0.042,
  }),
  combatMetrics: Object.freeze({
    maxEngagementDistance: 88,
    minEngagementVisibility: calculateFogTransmittance(0.0032, 88),
  }),
});

/** Deeply frozen per-arena grade identity catalog */
export const ARENA_GRADE_IDENTITIES: Readonly<Record<ArenaId, ArenaGradeIdentity>> = Object.freeze({
  'atomic-acres': ATOMIC_ACRES_IDENTITY,
  'skyline-terminal': SKYLINE_TERMINAL_IDENTITY,
  'rustworks-1v1': RUSTWORKS_1V1_IDENTITY,
  'gun-range': GUN_RANGE_IDENTITY,
  'farcrysis': FARCRYSIS_IDENTITY,
  'high-seas': HIGH_SEAS_IDENTITY,
});

export const DEFAULT_ARENA_GRADE_ID: ArenaId = 'atomic-acres';

/**
 * Fail-closed lookup for arena grade identities.
 * Throws a descriptive error on unknown arena IDs.
 */
export function resolveArenaGradeIdentity(
  arenaId: ArenaId | string | null | undefined = DEFAULT_ARENA_GRADE_ID,
): ArenaGradeIdentity {
  if (!arenaId) return ARENA_GRADE_IDENTITIES[DEFAULT_ARENA_GRADE_ID];
  const identity = ARENA_GRADE_IDENTITIES[arenaId as ArenaId];
  if (!identity) {
    throw new Error('HF-363 unknown arena grade identity: \'' + String(arenaId) + '\'');
  }
  return identity;
}

/** Alias for resolveArenaGradeIdentity */
export const getArenaGradeIdentity = resolveArenaGradeIdentity;

/**
 * Validates that an arena grade identity satisfies all competitive combat-safety rules.
 * Throws on any safety violation.
 */
export function assertArenaGradeSafety(identity: ArenaGradeIdentity): void {
  if (identity.ambientIntensity < COMBAT_SAFETY_BOUNDS.minAmbientIntensity) {
    throw new Error(
      'HF-363 combat safety violation in ' + identity.id + ': ambientIntensity (' + identity.ambientIntensity + ') is below minimum floor (' + COMBAT_SAFETY_BOUNDS.minAmbientIntensity + ')',
    );
  }
  if (identity.grade.shadowLift < COMBAT_SAFETY_BOUNDS.minShadowLift) {
    throw new Error(
      'HF-363 combat safety violation in ' + identity.id + ': shadowLift (' + identity.grade.shadowLift + ') is below minimum floor (' + COMBAT_SAFETY_BOUNDS.minShadowLift + ')',
    );
  }
  if (identity.fogDensity > COMBAT_SAFETY_BOUNDS.maxFogDensity) {
    throw new Error(
      'HF-363 combat safety violation in ' + identity.id + ': fogDensity (' + identity.fogDensity + ') exceeds maximum ceiling (' + COMBAT_SAFETY_BOUNDS.maxFogDensity + ')',
    );
  }
  if (identity.grade.contrast > COMBAT_SAFETY_BOUNDS.maxGradeContrast) {
    throw new Error(
      'HF-363 combat safety violation in ' + identity.id + ': contrast (' + identity.grade.contrast + ') exceeds maximum bound (' + COMBAT_SAFETY_BOUNDS.maxGradeContrast + ')',
    );
  }
  const visibility = calculateFogTransmittance(identity.fogDensity, identity.combatMetrics.maxEngagementDistance);
  if (visibility < COMBAT_SAFETY_BOUNDS.minEngagementTransmittance) {
    throw new Error(
      'HF-363 combat safety violation in ' + identity.id + ': engagement visibility (' + visibility.toFixed(3) + ') at ' + identity.combatMetrics.maxEngagementDistance + 'm is below threshold (' + COMBAT_SAFETY_BOUNDS.minEngagementTransmittance + ')',
    );
  }
}
