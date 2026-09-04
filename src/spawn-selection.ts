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
  /**
   * HF-491: how many of the most recent uses count as recent regardless of age.
   * Defaults to one short of the pool, which makes the fresh-point preference a
   * shuffle bag over the authored points - a wall clock cannot guarantee a
   * rotation when the respawn cadence is unknown, and a count can.
   */
  recentUseDepth?: number;
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

export const RECENT_USE_AVOIDANCE_MS = 12_000;
export const FFA_MINIMUM_SPAWN_SEPARATION = 8;

/**
 * HF-456/HF-491, the spread half. A fresh point is a HARD preference, so how
 * widely spawns spread is decided entirely by how long a use is remembered -
 * and that was one flat 12 s for every arena. A solo respawn cycle is longer
 * than 12 s, so by the time the same actor spawned again the window had emptied
 * and the deterministic argmax below returned the SAME point every time. That
 * is the literal mechanism behind "bot spawns seem to just spawn in 1 or two
 * places": not a bad table, a memory shorter than the thing it is meant to
 * remember.
 *
 * The horizon is now derived from the number of points the arena actually
 * authors, so an arena that authors sixteen rotates through its sixteen before
 * repeating and an arena that authors four is unchanged. No arena id and no
 * count appears here; a map that gains points widens its own horizon.
 *
 * If every point does fall inside the window the selector still degrades to the
 * full scored pool rather than starving - the fallback below is unchanged.
 */
export function spawnUseMemoryMs(candidateCount: number): number {
  return RECENT_USE_AVOIDANCE_MS * Math.max(1, Math.ceil(candidateCount / 4));
}

/** Both derived horizons, named as the selector's own context fields. */
export function spawnUseWindow(candidateCount: number): { recentUseAvoidanceMs: number; recentUseDepth: number } {
  return { recentUseAvoidanceMs: spawnUseMemoryMs(candidateCount), recentUseDepth: Math.max(0, candidateCount - 1) };
}

/**
 * HF-491 (owner, 2026-09-04, after playing HITL 4 on nuketown2 in Solo):
 * "the bots not in there". Also the second half of HF-456, "bot spawns seem to
 * just spawn in 1 or two places".
 *
 * Neither report is about the spawn TABLES. `src/spawn-layout-quality.test.ts`
 * already pins eight well-spread authored points per team on every arena, and
 * `measureSpawnLayout` reports zero failures for nuketown2's sixteen. The
 * defect is in the RULE that chooses among them.
 *
 * The reward term was the raw squared distance to the nearest threat. It is
 * monotone and unbounded, so once the hard clauses (no line of sight, no recent
 * death, no recent use, occupant separation) have removed the unsafe points,
 * the survivor with the highest score is always the point FARTHEST FROM THE
 * PLAYER ON THE MAP. Deterministically, every deployment and every respawn.
 *
 * In Solo that is decisive rather than cosmetic. Solo fields exactly one bot on
 * every bot-enabled arena (AGENTS.md, Pass 66 routing; `SOLO_BOT_COUNT = 1`),
 * so the single opponent is placed at the far extreme of an 84 m map behind two
 * houses, and the whole of the owner's half of the arena contains nobody. The
 * bot is present in the snapshot and absent from the game.
 *
 * The replacement keeps every hard safety clause untouched and only changes
 * WHICH of the already-safe points wins: the distance reward now rises to an
 * ENGAGEMENT DISTANCE and decays beyond it, instead of rising forever.
 *
 * The engagement distance is derived from the arena's own data at the moment of
 * the choice - a low quantile of the candidate-to-threat distances actually
 * available - and floored at the arena's trap radius, so no roster, arena id or
 * metre count is hard-coded here. A big map yields a big band, a 1v1 rig yields
 * a small one, and an arena with only distant points still gets its nearest
 * distant point rather than a throw.
 *
 * Monotonicity below the band is preserved (the rise is the same term it always
 * was) and the decay is deliberately gentler than the rise, so a set whose
 * points all sit beyond the band still orders sensibly instead of inverting.
 */
export const SPAWN_ENGAGEMENT_QUANTILE = 0.25;
/** The overshoot decay is half the rise, so ordering degrades rather than inverts. */
export const SPAWN_ENGAGEMENT_OVERSHOOT_WEIGHT = 0.5;

/**
 * The distance a spawn should sit from the nearest threat, derived from the
 * candidate set in front of us rather than authored per arena.
 *
 * `minimumM` is the caller's safety floor (the arena trap radius, which already
 * widens with population); a quantile under it is lifted to it, never below.
 */
export function spawnEngagementDistance(distancesM: readonly number[], minimumM: number): number {
  const sorted = distancesM.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return minimumM;
  const quantile = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * SPAWN_ENGAGEMENT_QUANTILE))]!;
  return Math.max(minimumM, quantile);
}

/**
 * Rises exactly as the old raw term did up to `engagementM`, then decays. Units
 * stay squared metres so every other weight in the score is unchanged.
 */
export function spawnDistanceReward(distanceM: number, engagementM: number | null): number {
  if (engagementM === null || distanceM <= engagementM) return distanceM * distanceM;
  return engagementM * engagementM - SPAWN_ENGAGEMENT_OVERSHOOT_WEIGHT * (distanceM - engagementM) ** 2;
}
export const MAP_TRAP_RADIUS: Readonly<Record<ArenaId, number>> = Object.freeze({
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
  const avoidanceMs = context.recentUseAvoidanceMs ?? spawnUseMemoryMs(finiteCandidates.length);
  const nowMs = currentTime(context);
  // HF-491: one pass over the candidates first, so the engagement band is a
  // property of THIS choice on THIS arena rather than an authored constant.
  // With no threats on the board there is nothing to be far from and the old
  // constant reward is kept exactly, which is what the per-arena coverage gate
  // in src/spawn-selection.test.ts measures.
  const nearestThreatDistance = (point: Point3): number => (
    context.threats.length === 0 ? 100 : Math.sqrt(Math.min(...context.threats.map((threat) => distanceSq(point, threat))))
  );
  const engagementDistance = context.threats.length === 0
    ? null
    : spawnEngagementDistance(finiteCandidates.map(({ point }) => nearestThreatDistance(point)), trapRadius);
  const recentUseDepth = Math.max(0, context.recentUseDepth ?? (finiteCandidates.length - 1));
  const recentByDepth = new Set((context.recentUses ?? []).slice(-recentUseDepth).map((use) => use.index));
  const scored = finiteCandidates.map(({ index, point, side }): SpawnCandidateScore => {
    const visibleThreats = context.threats.filter((threat) => !context.colliders.some((box) => segmentIntersectsBox(point, threat, box))).length;
    const nearestThreatDistanceSq = context.threats.length === 0 ? 10_000 : Math.min(...context.threats.map((threat) => distanceSq(point, threat)));
    const nearestOccupantDistanceSq = context.occupants.length === 0 ? 10_000 : Math.min(...context.occupants.map((occupant) => distanceSq(point, occupant)));
    const recentDeathPressure = context.recentDeaths.filter((death) => distanceSq(point, death) <= trapRadiusSq).length;
    const recentUsePressure = (context.recentUses?.filter((use) => use.index === index && nowMs >= use.at && nowMs - use.at <= avoidanceMs).length ?? 0)
      + (recentByDepth.has(index) ? 1 : 0);
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
    // HF-491: banded, not unbounded. Everything below is unchanged.
    const score = spawnDistanceReward(Math.sqrt(nearestThreatDistanceSq), engagementDistance)
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
    engagementDistance === null ? 'engagement-band:none' : `engagement-band:${Math.round(engagementDistance)}`,
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
