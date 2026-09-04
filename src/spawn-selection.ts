import { segmentIntersectsBox, type Box2, type Point3 } from './collision';
import type { ArenaId } from './map-selection';
import type { Team } from './protocol';

export type SpawnMode = 'solo' | 'tdm' | 'ffa';
export type SpawnCandidate = Readonly<{ index: number; point: Point3; side?: Team }>;
export type SpawnUse = Readonly<{ index: number; at: number }>;
export type SpawnSelectionContext = Readonly<{
  arenaId: ArenaId;
  arenaKind?: 'team' | 'explore';
  mode: SpawnMode;
  population: number;
  team?: Team;
  preferredSide?: Team;
  candidates: readonly SpawnCandidate[];
  threats: readonly Point3[];
  occupants: readonly Point3[];
  recentDeaths: readonly Point3[];
  recentUses?: readonly SpawnUse[];
  nowMs?: number;
  recentUseAvoidanceMs?: number;
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
  recentUsePressure: number;
  sidePenalty: number;
  repeated: boolean;
}>;
export type SpawnSelection = Readonly<{
  index: number;
  score: number;
  reason: string;
  candidates: readonly SpawnCandidateScore[];
}>;

const RECENT_USE_AVOIDANCE_MS = 12_000;
const FFA_MINIMUM_SPAWN_SEPARATION = 8;
const MAP_TRAP_RADIUS: Readonly<Record<ArenaId, number>> = Object.freeze({
  'atomic-acres': 9,
  'rustworks-1v1': 7,
  'gun-range': 8,
  'skyline-terminal': 10,
  'farcrysis': 8,
  'high-seas': 8,
  'test1': 7,
  'test2': 7,
  'map3': 8,
  'nuketown2': 7,
  'raid2': 7,
});

export { FFA_MINIMUM_SPAWN_SEPARATION };

export function stableSpawnTieBreakSeed(id: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
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

function currentTime(context: SpawnSelectionContext): number {
  if (context.nowMs !== undefined) return context.nowMs;
  return context.recentUses?.reduce((latest, use) => Math.max(latest, use.at), 0) ?? 0;
}

/** Shared deterministic selector for every player and bot spawn path. */
export function selectSpawnCandidates(context: SpawnSelectionContext): SpawnSelection {
  if (context.candidates.length === 0) throw new Error('No spawn candidates');
  const finiteCandidates = context.candidates.filter(({ point }) => finitePoint(point));
  if (finiteCandidates.length === 0) throw new Error('No finite spawn candidates');
  const trapRadius = (MAP_TRAP_RADIUS[context.arenaId] ?? 7)
    + Math.min(4, Math.max(0, context.population - 2) * 0.5);
  const trapRadiusSq = trapRadius * trapRadius;
  const avoidanceMs = context.recentUseAvoidanceMs ?? RECENT_USE_AVOIDANCE_MS;
  const nowMs = currentTime(context);
  const scored = finiteCandidates.map(({ index, point, side }): SpawnCandidateScore => {
    const visibleThreats = context.threats.filter((threat) => !context.colliders.some((box) => segmentIntersectsBox(point, threat, box))).length;
    const nearestThreatDistanceSq = context.threats.length === 0 ? 10_000 : Math.min(...context.threats.map((threat) => distanceSq(point, threat)));
    const nearestOccupantDistanceSq = context.occupants.length === 0 ? 10_000 : Math.min(...context.occupants.map((occupant) => distanceSq(point, occupant)));
    const recentDeathPressure = context.recentDeaths.filter((death) => distanceSq(point, death) <= trapRadiusSq).length;
    const recentUsePressure = context.recentUses?.filter((use) => use.index === index && nowMs >= use.at && nowMs - use.at <= avoidanceMs).length ?? 0;
    const preferredSide = context.preferredSide ?? context.team;
    const sideAware = context.arenaKind === 'team' && context.mode === 'tdm' && preferredSide !== undefined;
    const sidePenalty = sideAware && side !== undefined && side !== preferredSide ? 50_000 : 0;
    const repeated = index === context.previousIndex;
    const separationSq = context.mode === 'ffa' ? FFA_MINIMUM_SPAWN_SEPARATION ** 2 : 25;
    let proximityPenalty = 0;
    for (const occupant of context.occupants) {
      const occupantDistanceSq = distanceSq(point, occupant);
      if (occupantDistanceSq < separationSq) proximityPenalty += (separationSq - occupantDistanceSq) * 20_000;
    }
    const modePressure = context.mode === 'ffa' ? 1.25 : context.mode === 'solo' ? 0.9 : 1;
    const score = nearestThreatDistanceSq
      - visibleThreats * 1_000_000 * modePressure
      - recentDeathPressure * 250_000
      - recentUsePressure * 175_000
      - proximityPenalty
      - sidePenalty
      - (repeated ? 125_000 : 0);
    return { index, score, visibleThreats, nearestThreatDistanceSq, nearestOccupantDistanceSq, recentDeathPressure, recentUsePressure, sidePenalty, repeated };
  });

  // A fresh point is a hard preference while any fresh point exists. If every
  // point is inside the window, pressure remains in the score and the seeded
  // order still makes the fallback deterministic.
  const fresh = scored.filter((candidate) => candidate.recentUsePressure === 0);
  const recentUsePool = fresh.length > 0 ? fresh : scored;
  const preferredSide = context.preferredSide ?? context.team;
  const sideAware = context.arenaKind === 'team' && context.mode === 'tdm' && preferredSide !== undefined;
  const preferredSidePool = sideAware
    ? recentUsePool.filter((candidate) => finiteCandidates.find((entry) => entry.index === candidate.index)?.side === preferredSide)
    : [];
  const pool = preferredSidePool.length > 0 ? preferredSidePool : recentUsePool;
  const ordered = [...pool].sort((left, right) => right.score - left.score
    || seededRank(left.index, context.tieBreakSeed ?? 0) - seededRank(right.index, context.tieBreakSeed ?? 0)
    || left.index - right.index);
  const selected = ordered[0];
  if (!selected) throw new Error('No finite spawn candidates');
  const reason = [
    selected.visibleThreats === 0 ? 'no-immediate-los' : `minimum-los:${selected.visibleThreats}`,
    `nearest-threat-sq:${Math.round(selected.nearestThreatDistanceSq)}`,
    selected.recentDeathPressure === 0 ? 'recent-death-clear' : `recent-death-pressure:${selected.recentDeathPressure}`,
    selected.recentUsePressure === 0 ? 'recent-use-clear' : `recent-use-pressure:${selected.recentUsePressure}`,
    selected.repeated ? 'repeat-fallback' : 'repeat-avoided',
    selected.sidePenalty === 0 ? 'team-side-preferred' : 'team-side-fallback',
    `nearest-occupant-sq:${Math.round(selected.nearestOccupantDistanceSq)}`,
    `mode:${context.mode}`,
    `population:${context.population}`,
  ].join('|');
  return { index: selected.index, score: selected.score, reason, candidates: ordered };
}

/** Compatibility name for the existing safety-focused callers and tests. */
export const scoreSpawnCandidates = selectSpawnCandidates;
