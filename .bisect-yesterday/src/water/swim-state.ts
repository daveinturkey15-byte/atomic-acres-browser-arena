/**
 * swim-state.ts — pure, host-authoritative water movement reducers.
 *
 * HF-358: island water must be traversable rather than a death barrier. This
 * module owns two things:
 *
 * 1. sampleFloatZonePhysics — the buoyancy/drag float-zone formula extracted
 *    verbatim from WaterSystem.samplePhysics (consumed by legacy-main.ts
 *    updatePhysics, the pre/post move block around lines 22336-22355). The
 *    FLOAT_ZONE constants are a regression contract: rustworks out-of-bounds
 *    float behaviour must not change (guarded by swim-state.test.ts and
 *    water-system.test.ts).
 *
 * 2. stepSwimState — the swim movement state machine (enter/exit hysteresis,
 *    weapon-restriction flag) for swimmable bodies (water-authoring.ts
 *    swimmable: true). Host-authoritative like every movement state; the
 *    reducer is pure so hosts and replays step it deterministically.
 *
 * No THREE dependency: this is gameplay authority, kept renderer-free.
 */

export type WaterPhysicsSample = Readonly<{
  inWater: boolean;
  surfaceY: number;
  buoyancy: number;
  drag: number;
  surfaceVelocityY: number;
}>;

/**
 * Exact constants of the pre-HF-358 rustworks float zone
 * (src/water-system.ts samplePhysics / legacy-main.ts 22336-22355 consumers).
 * Changing any value is a gameplay behaviour change and needs an owner row.
 */
export const FLOAT_ZONE = Object.freeze({
  /** Metres added to each island half extent before the outside test. */
  islandMargin: 0.8,
  /** Normalized Chebyshev distance at which a position counts as offshore. */
  outsideThreshold: 0.98,
  /** inWater requires depth (surfaceY - y) above this (metres). */
  entryDepth: -1.2,
  /** submerged = clamp(depth + submergedOffset, 0, submergedMax). */
  submergedOffset: 1.4,
  submergedMax: 4,
  /** buoyancy = submerged * buoyancyPerSubmergedMetre (m/s^2). */
  buoyancyPerSubmergedMetre: 18,
  /** drag = dragBase + submerged * dragPerSubmergedMetre (1/s). */
  dragBase: 0.7,
  dragPerSubmergedMetre: 0.15,
} as const);

export type FloatZoneInput = Readonly<{
  enabled: boolean;
  waterLevel: number;
  islandHalfX: number;
  islandHalfZ: number;
  position: Readonly<{ x: number; y: number; z: number }>;
  /** Authoritative wave sample at position.xz (ocean-spectrum sampleOcean). */
  wave: Readonly<{ height: number; verticalVelocity: number }>;
}>;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** Byte-exact extraction of the legacy WaterSystem.samplePhysics formula. */
export function sampleFloatZonePhysics(input: FloatZoneInput): WaterPhysicsSample {
  if (!input.enabled) {
    return { inWater: false, surfaceY: input.waterLevel, buoyancy: 0, drag: 0, surfaceVelocityY: 0 };
  }
  const nx = Math.abs(input.position.x) / (input.islandHalfX + FLOAT_ZONE.islandMargin);
  const nz = Math.abs(input.position.z) / (input.islandHalfZ + FLOAT_ZONE.islandMargin);
  const outside = Math.max(nx, nz) >= FLOAT_ZONE.outsideThreshold;
  const surfaceY = input.waterLevel + input.wave.height;
  const depth = surfaceY - input.position.y;
  const inWater = outside && depth > FLOAT_ZONE.entryDepth;
  if (!inWater) {
    return { inWater: false, surfaceY, buoyancy: 0, drag: 0, surfaceVelocityY: input.wave.verticalVelocity };
  }
  const submerged = clamp(depth + FLOAT_ZONE.submergedOffset, 0, FLOAT_ZONE.submergedMax);
  return {
    inWater: true,
    surfaceY,
    buoyancy: submerged * FLOAT_ZONE.buoyancyPerSubmergedMetre,
    drag: FLOAT_ZONE.dragBase + submerged * FLOAT_ZONE.dragPerSubmergedMetre,
    surfaceVelocityY: input.wave.verticalVelocity,
  };
}

/**
 * Swim movement tuning for swimmable bodies. New HF-358 scope — these numbers
 * only ever apply where WaterBodyDefinition.swimmable is true, so the
 * rustworks float zone is untouched by construction.
 */
export const SWIM_TUNING = Object.freeze({
  /** Depth (surfaceY - eyeY, metres) that begins the enter timer. */
  enterDepth: 0.9,
  /** Depth at or below which the exit timer runs (hysteresis band). */
  exitDepth: 0.35,
  /** Sustained submersion required before the swim state engages (s). */
  enterDelaySeconds: 0.1,
  /** Sustained shallow water required before the swim state releases (s). */
  exitDelaySeconds: 0.25,
  /** Horizontal move speed multiplier while swimming. */
  swimSpeedScale: 0.62,
  /** Maximum commanded vertical swim speed (m/s). */
  swimVerticalSpeed: 3.2,
  /** Extra velocity damping while swimming (1/s), on top of float-zone drag. */
  swimDrag: 1.15,
} as const);

export type SwimState = Readonly<{
  swimming: boolean;
  /** Consecutive seconds at/below enter depth while not swimming. */
  wetSeconds: number;
  /** Consecutive seconds at/above exit depth while swimming. */
  drySeconds: number;
  /** Primary weapons are restricted while swimming (presentation/loadout gate). */
  weaponRestricted: boolean;
}>;

export function createSwimState(): SwimState {
  return Object.freeze({ swimming: false, wetSeconds: 0, drySeconds: 0, weaponRestricted: false });
}

export type SwimInput = Readonly<{
  /** Water depth over the player reference point: surfaceY - y (metres). */
  depth: number;
  /** WaterBodyDefinition.swimmable for the active body (false = no body). */
  swimmable: boolean;
  dtSeconds: number;
}>;

/**
 * Pure swim reducer with enter/exit hysteresis. Non-swimmable bodies can
 * never enter the swim state regardless of depth (swimmable-flag gating).
 */
export function stepSwimState(previous: SwimState, input: SwimInput): SwimState {
  if (!input.swimmable) {
    return previous.swimming || previous.wetSeconds > 0 || previous.drySeconds > 0 || previous.weaponRestricted
      ? createSwimState()
      : previous;
  }
  const dt = Math.max(0, input.dtSeconds);
  if (!previous.swimming) {
    const wetSeconds = input.depth >= SWIM_TUNING.enterDepth ? previous.wetSeconds + dt : 0;
    const swimming = wetSeconds >= SWIM_TUNING.enterDelaySeconds;
    return Object.freeze({
      swimming,
      wetSeconds: swimming ? 0 : wetSeconds,
      drySeconds: 0,
      weaponRestricted: swimming,
    });
  }
  const drySeconds = input.depth <= SWIM_TUNING.exitDepth ? previous.drySeconds + dt : 0;
  const swimming = drySeconds < SWIM_TUNING.exitDelaySeconds;
  return Object.freeze({
    swimming,
    wetSeconds: 0,
    drySeconds: swimming ? drySeconds : 0,
    weaponRestricted: swimming,
  });
}

export type SwimMovementModifiers = Readonly<{
  speedScale: number;
  verticalSpeed: number;
  extraDrag: number;
  weaponRestricted: boolean;
}>;

/** Movement modifiers for the physics step consumer (wave-2 wiring). */
export function swimMovementModifiers(state: SwimState): SwimMovementModifiers {
  if (!state.swimming) {
    return { speedScale: 1, verticalSpeed: 0, extraDrag: 0, weaponRestricted: false };
  }
  return {
    speedScale: SWIM_TUNING.swimSpeedScale,
    verticalSpeed: SWIM_TUNING.swimVerticalSpeed,
    extraDrag: SWIM_TUNING.swimDrag,
    weaponRestricted: true,
  };
}
