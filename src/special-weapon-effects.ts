import { FLAME_DAMAGE_CATALOG } from './flame-damage-contract';

export const FLAMETHROWER_EFFECT = Object.freeze({
  rangeM: 18,
  streamRadiusM: 0.58,
  particleLifetimeMs: 520,
  poolCapacity: 96,
  maximumActiveParticles: 72,
});

export const FLARE_PROJECTILE_EFFECT = Object.freeze({
  speedMps: 52,
  gravityMps2: 5.4,
  collisionRadiusM: 0.16,
  maximumFlightMs: 5_500,
  burnDurationMs: 5_000,
  directDamage: 42,
  burnRadiusM: 3.4,
  burnDamagePerSecond: FLAME_DAMAGE_CATALOG['flare-gun-burn'].damagePerSecond,
  poolCapacity: 12,
});

export type FlareProjectileKinematics = Readonly<{
  position: readonly [number, number, number];
  velocity: readonly [number, number, number];
  ageMs: number;
}>;

function finiteTriplet(value: readonly number[]): value is readonly [number, number, number] {
  return value.length === 3 && value.every(Number.isFinite);
}

/** Fixed-step-compatible ballistic integration shared by host and presentation. */
export function advanceFlareProjectileKinematics(
  state: FlareProjectileKinematics,
  deltaSeconds: number,
): FlareProjectileKinematics {
  if (!finiteTriplet(state.position) || !finiteTriplet(state.velocity)
    || !Number.isFinite(state.ageMs) || state.ageMs < 0
    || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || deltaSeconds > 0.1) return state;
  const [x, y, z] = state.position;
  const [vx, vy, vz] = state.velocity;
  // Semi-implicit Euler is deterministic at the fixed simulation step and
  // keeps authority/presentation trajectories aligned without frame-time use.
  const nextVy = vy - FLARE_PROJECTILE_EFFECT.gravityMps2 * deltaSeconds;
  return Object.freeze({
    position: Object.freeze([
      x + vx * deltaSeconds,
      y + nextVy * deltaSeconds,
      z + vz * deltaSeconds,
    ] as const),
    velocity: Object.freeze([vx, nextVy, vz] as const),
    ageMs: state.ageMs + deltaSeconds * 1_000,
  });
}

export function createFlareProjectileKinematics(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
): FlareProjectileKinematics | null {
  if (!finiteTriplet(origin) || !finiteTriplet(direction)) return null;
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (!Number.isFinite(length) || length < 0.999 || length > 1.001) return null;
  return Object.freeze({
    position: Object.freeze([...origin] as [number, number, number]),
    velocity: Object.freeze([
      direction[0] * FLARE_PROJECTILE_EFFECT.speedMps,
      direction[1] * FLARE_PROJECTILE_EFFECT.speedMps,
      direction[2] * FLARE_PROJECTILE_EFFECT.speedMps,
    ] as const),
    ageMs: 0,
  });
}

export function flareProjectileExpired(state: FlareProjectileKinematics): boolean {
  return !Number.isFinite(state.ageMs) || state.ageMs >= FLARE_PROJECTILE_EFFECT.maximumFlightMs;
}

/** Flat non-explosive fire DPS while a target remains inside the admitted radius. */
export function flareBurnDamagePerSecond(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM >= FLARE_PROJECTILE_EFFECT.burnRadiusM) return 0;
  return FLARE_PROJECTILE_EFFECT.burnDamagePerSecond;
}

export function flamethrowerStreamScale(distanceM: number): number {
  if (!Number.isFinite(distanceM) || distanceM < 0 || distanceM > FLAMETHROWER_EFFECT.rangeM) return 0;
  return Math.max(0.18, 1 - distanceM / FLAMETHROWER_EFFECT.rangeM * 0.82);
}
