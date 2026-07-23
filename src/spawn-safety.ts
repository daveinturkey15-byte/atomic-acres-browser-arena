import { segmentIntersectsBox, type Box2, type Point3 } from './collision';
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
});

function distanceSq(a: Point3, b: Point3): number {
  const dy = (a.y ?? 0) - (b.y ?? 0);
  return (a.x - b.x) ** 2 + dy ** 2 + (a.z - b.z) ** 2;
}

function finitePoint(point: Point3): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y ?? 0) && Number.isFinite(point.z);
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
    const proximityPenalty = nearestOccupantDistanceSq < 25 ? (25 - nearestOccupantDistanceSq) * 20_000 : 0;
    const score = nearestThreatDistanceSq
      - visibleThreats * 1_000_000 * modePressure
      - recentDeathPressure * 250_000
      - proximityPenalty
      - (repeated ? 125_000 : 0);
    return { index, score, visibleThreats, nearestThreatDistanceSq, nearestOccupantDistanceSq, recentDeathPressure, repeated };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  if (scored.length === 0) throw new Error('No finite spawn candidates');
  const selected = scored[0];
  const reason = [
    selected.visibleThreats === 0 ? 'no-immediate-los' : `minimum-los:${selected.visibleThreats}`,
    `nearest-threat-sq:${Math.round(selected.nearestThreatDistanceSq)}`,
    selected.recentDeathPressure === 0 ? 'recent-death-clear' : `recent-death-pressure:${selected.recentDeathPressure}`,
    selected.repeated ? 'repeat-fallback' : 'repeat-avoided',
    `mode:${context.mode}`,
    `population:${context.population}`,
  ].join('|');
  return { index: selected.index, score: selected.score, reason, candidates: scored };
}