import { isBlocked, pointInsideBounds, type Box2, type Point3 } from './collision';
import { FFA_MINIMUM_SPAWN_SEPARATION } from './spawn-selection';
import type { SpawnCandidate, SpawnMode } from './spawn-selection';

export { FFA_MINIMUM_SPAWN_SEPARATION, MAP_TRAP_RADIUS, scoreSpawnCandidates } from './spawn-selection';
export type { SpawnCandidate, SpawnMode, SpawnSelectionContext, SpawnCandidateScore, SpawnSelection } from './spawn-selection';

export function playerSpawnProtectionMs(mode: SpawnMode): number {
  // FFA now owns safety through spatial separation. Per-client immunity made
  // the host uniquely unkillable while remote health remained host-authoritative.
  return mode === 'ffa' ? 0 : 1_350;
}

export function stableSpawnTieBreakSeed(id: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/**
 * Initial FFA deployment happens before peer snapshots are guaranteed to be
 * visible. Reserve separated authored points from the shared lobby roster so
 * every peer cannot independently select the same apparently-empty spawn.
 */
export function initialFfaSpawnReservation(
  actorId: string,
  actorIds: readonly string[],
  candidates: readonly SpawnCandidate[],
  rotationSeed = 0,
): number | null {
  const actors = [...new Set(actorIds.filter(Boolean))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const actorIndex = actors.indexOf(actorId);
  if (actorIndex < 0 || candidates.length < actors.length) return null;

  const orderedCandidates = [...candidates]
    .filter(({ point }) => finitePoint(point))
    .sort((left, right) => seededRank(left.index, rotationSeed) - seededRank(right.index, rotationSeed)
      || left.index - right.index);
  const reservations: SpawnCandidate[] = [];
  const minimumSeparationSq = FFA_MINIMUM_SPAWN_SEPARATION ** 2;
  const reserveSeparatedSet = (candidateIndex: number): boolean => {
    if (reservations.length === actors.length) return true;
    const required = actors.length - reservations.length;
    if (orderedCandidates.length - candidateIndex < required) return false;
    for (let index = candidateIndex; index < orderedCandidates.length; index += 1) {
      const candidate = orderedCandidates[index];
      if (!reservations.every((reserved) => distanceSq(candidate.point, reserved.point) >= minimumSeparationSq)) continue;
      reservations.push(candidate);
      if (reserveSeparatedSet(index + 1)) return true;
      reservations.pop();
    }
    return false;
  };
  if (!reserveSeparatedSet(0)) return null;
  return reservations[actorIndex]?.index ?? null;
}

function seededRank(index: number, seed: number): number {
  let value = Math.imul((index | 0) ^ (seed | 0), 0x45d9f3b);
  value ^= value >>> 16;
  return value >>> 0;
}

function distanceSq(a: Point3, b: Point3): number {
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return (a.x - b.x) ** 2 + dy ** 2 + (a.z - b.z) ** 2;
}

function finitePoint(point: Point3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y ?? 0) && Number.isFinite(point.z);
}

/** Validates an authored spawn at its authored elevation, not an assumed ground plane. */
export function validArenaSpawnPoint(
  point: Point3,
  bounds: Box2,
  colliders: readonly Box2[],
  radius = 0.44,
): boolean {
  return finitePoint(point)
    && pointInsideBounds(point, bounds, radius)
    && !isBlocked(point, colliders, radius);
}

/** Converts a floor/waypoint position to the bot's LOS eye without losing deck elevation. */
export function waypointEyePoint(
  point: Readonly<{ x: number; y?: number; z: number }>,
  eyeHeight = 1.42,
): Readonly<{ x: number; y: number; z: number }> {
  return { x: point.x, y: (point.y ?? 0) + eyeHeight, z: point.z };
}
