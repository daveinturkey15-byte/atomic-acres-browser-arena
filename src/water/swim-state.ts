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
 *    Its depth thresholds are keyed to the water column over the player's
 *    FEET (Pass 81 HF-393 correction); the eye-relative depth call sites
 *    measure is converted once, inside the reducer.
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
 * Standing feet-to-eye distance of the player capsule, in metres.
 *
 * Derived from physics.ts: STANCE_SHAPES.stand.eyeFromCenter (0.79)
 * + CHARACTER_PHYSICS_CONFIG.playerHalfHeight (0.53)
 * + CHARACTER_PHYSICS_CONFIG.playerRadius (0.38) = 1.70 m.
 *
 * Duplicated here deliberately rather than imported, so this module stays
 * outside the physics/rapier import graph (it is renderer-free and
 * dependency-free gameplay authority by design). swim-state.test.ts pins the
 * literal against the live physics constants, so the two cannot drift.
 */
export const EYE_ABOVE_FEET_M = 1.7;

/**
 * HF-393 BODY-REFERENCE CORRECTION (Pass 81).
 *
 * Every call site measures water depth against the player's EYE, because
 * `player.position` IS the eye (legacy-main teleportEye / camera.position
 * copy). Depth over the eye is a terrible thing to key body-scale gameplay
 * thresholds to: an eye depth of 0 already means the water is at eye level,
 * i.e. the player is submerged to the forehead.
 *
 * The tuning below is therefore keyed to the water column over the player's
 * FEET, which is the depth a human reads ("ankle / knee / waist / chest"),
 * and `stepSwimState` converts the eye depth it is fed with
 * `feetDepthFromEyeDepth` at the single point of entry. Call sites are
 * unchanged; only the meaning of the CONSTANTS moved.
 *
 * Before this correction, enterDepth 0.9 was 0.9 m over the EYE = 2.60 m over
 * the feet — deeper than the float zone can ever hold a player (buoyancy
 * equilibrium sits at 1.661 m over the feet), so the swim state was
 * mathematically unreachable and the arena's only swimmable body could never
 * be swum. Measured, both with and without the legacy float-zone buoyancy
 * branch, by the vertical-loop test in farcrysis-terrain-authority.test.ts.
 */
export function feetDepthFromEyeDepth(depthOverEye: number): number {
  return depthOverEye + EYE_ABOVE_FEET_M;
}

/**
 * Swim movement tuning for swimmable bodies. New HF-358 scope — these numbers
 * only ever apply where WaterBodyDefinition.swimmable is true, so the
 * rustworks float zone is untouched by construction.
 *
 * DEPTHS ARE FEET-RELATIVE (see feetDepthFromEyeDepth above): the water column
 * standing over the player's feet, NOT over the eye.
 */
export const SWIM_TUNING = Object.freeze({
  /**
   * Water column over the FEET (metres) that begins the enter timer. 1.55 m
   * against a 1.70 m eye height is chin-deep — the depth at which a standing
   * player stops walking and starts swimming.
   */
  enterDepth: 1.55,
  /**
   * Column over the FEET at or below which the exit timer runs (hysteresis
   * band). 1.05 m is waist-deep: a swimmer who paddles back up the shelf
   * stands up again well before they are stranded on dry sand.
   */
  exitDepth: 1.05,
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
  /**
   * Water depth over the player's EYE: `surfaceY - player.position.y`
   * (metres), the one convention every call site can measure, because
   * `player.position` is the eye. Converted to the feet-relative depth
   * SWIM_TUNING is keyed to by `feetDepthFromEyeDepth` inside the reducer —
   * do NOT pre-convert at the call site or the offset is applied twice.
   */
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
  // Single conversion point: eye-relative in, feet-relative thresholds.
  const depth = feetDepthFromEyeDepth(input.depth);
  if (!previous.swimming) {
    const wetSeconds = depth >= SWIM_TUNING.enterDepth ? previous.wetSeconds + dt : 0;
    const swimming = wetSeconds >= SWIM_TUNING.enterDelaySeconds;
    return Object.freeze({
      swimming,
      wetSeconds: swimming ? 0 : wetSeconds,
      drySeconds: 0,
      weaponRestricted: swimming,
    });
  }
  const drySeconds = depth <= SWIM_TUNING.exitDepth ? previous.drySeconds + dt : 0;
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
