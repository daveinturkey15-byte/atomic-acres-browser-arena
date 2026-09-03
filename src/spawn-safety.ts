import { isBlocked, pointInsideBounds, segmentIntersectsBox, type Box2, type Point3 } from './collision';
import type { ArenaId } from './map-selection';

export type SpawnMode = 'solo' | 'tdm' | 'ffa';
export type SpawnCandidate = Readonly<{ index: number; point: Point3 }>;
export type SpawnSelectionContext = Readonly<{
  arenaId: ArenaId;
  mode: SpawnMode;
  population: number;
  candidates: readonly SpawnCandidate[];
  threats: readonly Point3[];
  occupants: readonly Point3[];
  recentDeaths: readonly Point3[];
  colliders: readonly Box2[];
  previousIndex: number;
  tieBreakSeed?: number;
}>;
export type SpawnCandidateScore = Readonly<{
  index: number;
  score: number;
  visibleThreats: number;
  nearestThreatDistanceSq: number;
  nearestOccupantDistanceSq: number;
  recentDeathPressure: number;
  repeated: boolean;
}>;
export type SpawnSelection = Readonly<{
  index: number;
  score: number;
  reason: string;
  candidates: readonly SpawnCandidateScore[];
}>;

const MAP_TRAP_RADIUS: Readonly<Record<ArenaId, number>> = Object.freeze({
  'atomic-acres': 9,
  'rustworks-1v1': 7,
  'gun-range': 8,
  'skyline-terminal': 10,
  // HF-359 (Pass 74): ported from the Pass 69 hidden lane.
  'farcrysis': 8,
  'high-seas': 8,
  'test1': 7,
  'test2': 7,
  // MAP3 (PREVIEW): a bay is 9 m of clear width between pier lines, so a trap
  // radius wider than that would call every legal bay spawn trapped.
  'map3': 8,
  // NUKETOWN2 (PREVIEW, HF-407): the back yard is 7.5 m deep between the house
  // back wall and the fence, so a trap radius wider than that would call every
  // legal spawn on this map trapped. 7 keeps the whole yard usable.
  'nuketown2': 7,
});

export const FFA_MINIMUM_SPAWN_SEPARATION = 8;

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

export function scoreSpawnCandidates(context: SpawnSelectionContext): SpawnSelection {
  if (context.candidates.length === 0) throw new Error('No spawn candidates');
  const trapRadius = MAP_TRAP_RADIUS[context.arenaId] + Math.min(4, Math.max(0, context.population - 2) * 0.5);
  const trapRadiusSq = trapRadius * trapRadius;
  const scored = context.candidates.filter(({ point }) => finitePoint(point)).map(({ index, point }) => {
    const visibleThreats = context.threats.filter((threat) => !context.colliders.some((box) => segmentIntersectsBox(point, threat, box))).length;
    const nearestThreatDistanceSq = context.threats.length === 0 ? 10_000 : Math.min(...context.threats.map((threat) => distanceSq(point, threat)));
    const nearestOccupantDistanceSq = context.occupants.length === 0 ? 10_000 : Math.min(...context.occupants.map((occupant) => distanceSq(point, occupant)));
    const recentDeathPressure = context.recentDeaths.filter((death) => distanceSq(point, death) <= trapRadiusSq).length;
    const repeated = index === context.previousIndex;
    const modePressure = context.mode === 'ffa' ? 1.25 : context.mode === 'solo' ? 0.9 : 1;
    const separationSq = context.mode === 'ffa' ? FFA_MINIMUM_SPAWN_SEPARATION ** 2 : 25;
    // CROWDING, SUMMED OVER EVERY OCCUPANT - not just the nearest one.
    //
    // Owner 2026-08-31: "make player and bot spawns nicely spread and balanced
    // everywhere alwys need a good rule". The rule was already general; this
    // term was where it stopped working. Taking only the NEAREST occupant means
    // that once every candidate has a body standing on it,
    // `nearestOccupantDistanceSq` is 0 everywhere, the penalty saturates at an
    // identical 500,000, and the scorer can no longer tell a point with one bot
    // on it from a point with three. All that then separates candidates is the
    // repeat penalty, which produces a strict A/B alternation and duplicate
    // spawns - measured on rustworks and farcrysis as two bots on the exact same
    // point (minimum bot pair distance 0.00 m).
    //
    // Summing gives every additional crowd member its own weight, so a busy
    // point keeps getting worse and the fifth bot goes somewhere the first four
    // did not. It is identical to the old behaviour when at most one occupant is
    // in range, which is the common case.
    let proximityPenalty = 0;
    for (const occupant of context.occupants) {
      const occupantDistanceSq = distanceSq(point, occupant);
      if (occupantDistanceSq < separationSq) proximityPenalty += (separationSq - occupantDistanceSq) * 20_000;
    }
    const score = nearestThreatDistanceSq
      - visibleThreats * 1_000_000 * modePressure
      - recentDeathPressure * 250_000
      - proximityPenalty
      - (repeated ? 125_000 : 0);
    return { index, score, visibleThreats, nearestThreatDistanceSq, nearestOccupantDistanceSq, recentDeathPressure, repeated };
  }).sort((left, right) => right.score - left.score
    || seededRank(left.index, context.tieBreakSeed ?? 0) - seededRank(right.index, context.tieBreakSeed ?? 0)
    || left.index - right.index);
  if (scored.length === 0) throw new Error('No finite spawn candidates');
  const selected = scored[0];
  const reason = [
    selected.visibleThreats === 0 ? 'no-immediate-los' : `minimum-los:${selected.visibleThreats}`,
    `nearest-threat-sq:${Math.round(selected.nearestThreatDistanceSq)}`,
    selected.recentDeathPressure === 0 ? 'recent-death-clear' : `recent-death-pressure:${selected.recentDeathPressure}`,
    selected.repeated ? 'repeat-fallback' : 'repeat-avoided',
    `nearest-occupant-sq:${Math.round(selected.nearestOccupantDistanceSq)}`,
    `mode:${context.mode}`,
    `population:${context.population}`,
  ].join('|');
  return { index: selected.index, score: selected.score, reason, candidates: scored };
}
