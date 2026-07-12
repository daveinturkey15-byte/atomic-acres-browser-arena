export type BotMovement = 'idle' | 'advance' | 'retreat' | 'strafe-left' | 'strafe-right';

export type BotSense = {
  alive: boolean;
  distanceToPlayer: number;
  hasLineOfSight: boolean;
  health: number;
  now: number;
  lastShotAt: number;
  waypointReached: boolean;
  random: number;
  lineOfSightSince?: number;
  reactionDelay?: number;
  burstShotsRemaining?: number;
};

export type BotIntent = {
  movement: BotMovement;
  fire: boolean;
  changeWaypoint: boolean;
};

export const SOLO_BOT_COUNT = 1;
export const BOT_FIRE_RANGE = 22;
export const BOT_REACTION_DELAY = 650;

export type BotSpawnScore = {
  nearestThreatDistanceSq: number;
  visibleThreats: number;
  occupied: boolean;
  preferred: boolean;
};

/** Larger scores are safer; line-of-sight exposure dominates a modest authored preference. */
export function scoreBotSpawn(candidate: BotSpawnScore): number {
  const distance = Number.isFinite(candidate.nearestThreatDistanceSq)
    ? Math.max(0, candidate.nearestThreatDistanceSq)
    : 0;
  return distance
    - Math.max(0, candidate.visibleThreats) * 5_000
    - (candidate.occupied ? 10_000 : 0)
    + (candidate.preferred ? 1 : 0);
}

export type TacticalWaypointCandidate = {
  index: number;
  distanceFromBot: number;
  distanceFromPlayer: number;
  seesPlayer: boolean;
};

/** Chooses an intercept/reacquisition point without requiring a heavyweight navigation mesh. */
export function chooseTacticalWaypoint(
  candidates: TacticalWaypointCandidate[],
  currentIndex: number,
  variationSeed = 0,
): number {
  if (candidates.length === 0) return currentIndex;
  const scored = candidates.map((candidate) => {
    const travelCost = Math.max(0, candidate.distanceFromBot) * 0.42;
    const engagementBandPenalty = Math.abs(Math.max(0, candidate.distanceFromPlayer) - 13) * 0.34;
    const reacquisitionBonus = candidate.seesPlayer ? 7 : 0;
    const routeChangeBonus = candidate.index === currentIndex ? -4 : 0.8;
    const tieBreak = ((candidate.index * 17 + variationSeed * 7) % 11) * 0.001;
    return { index: candidate.index, score: reacquisitionBonus + routeChangeBonus + tieBreak - travelCost - engagementBandPenalty };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].index;
}

/** Close-range bots remain readable; their aim becomes deliberately poor toward medium range. */
export function botAimJitter(distance: number): number {
  const rangeFraction = Math.max(0, Math.min(1, (distance - 6) / (BOT_FIRE_RANGE - 6)));
  return 0.024 + rangeFraction * rangeFraction * 0.076;
}

export function chooseBotIntent(sense: BotSense): BotIntent {
  if (!sense.alive) return { movement: 'idle', fire: false, changeWaypoint: false };
  const reacted = sense.hasLineOfSight
    && sense.now - (sense.lineOfSightSince ?? sense.now) >= (sense.reactionDelay ?? 0);
  const shotInterval = (sense.burstShotsRemaining ?? 0) > 0 ? 135 : 620;
  const fire = reacted
    && sense.distanceToPlayer <= BOT_FIRE_RANGE
    && sense.distanceToPlayer >= 2.5
    && sense.now - sense.lastShotAt >= shotInterval;
  let movement: BotMovement;
  if (sense.health < 35 && sense.hasLineOfSight && sense.distanceToPlayer < 18) movement = 'retreat';
  else if (sense.distanceToPlayer < 5.5) movement = 'retreat';
  else if (!sense.hasLineOfSight || sense.distanceToPlayer > 28) movement = 'advance';
  else movement = sense.random < 0.5 ? 'strafe-right' : 'strafe-left';
  return { movement, fire, changeWaypoint: sense.waypointReached || (!sense.hasLineOfSight && sense.random > 0.88) };
}

export function respawnBotState(now: number): {
  health: number;
  alive: boolean;
  invulnerableUntil: number;
  lastShotAt: number;
} {
  return { health: 100, alive: true, invulnerableUntil: now + 1_000, lastShotAt: 0 };
}
