import type { PrimaryWeaponId } from './protocol';

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
  fireIntervalMs?: number;
};

export type BotIntent = {
  movement: BotMovement;
  fire: boolean;
  changeWaypoint: boolean;
};

export const SOLO_BOT_COUNT = 2;
export const MAX_SOLO_BOTS = 6;
export const BOT_DEATHS_PER_REINFORCEMENT = 5;
export const BOT_FIRE_RANGE = 22;
export const BOT_REACTION_DELAY = 650;
export const BOT_GRENADE_MIN_RANGE = 7;
export const BOT_GRENADE_MAX_RANGE = 18;
export const BOT_GRENADE_COOLDOWN_MS = 12_000;
export const BOT_WEAPON_POOL: readonly PrimaryWeaponId[] = Object.freeze(['carbine', 'smg', 'scattergun', 'sniper']);

export function assignBotWeapons(count: number, random: () => number): PrimaryWeaponId[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const assignments: PrimaryWeaponId[] = [];
  while (assignments.length < total) {
    const cycle = [...BOT_WEAPON_POOL];
    for (let index = cycle.length - 1; index > 0; index -= 1) {
      const sample = random();
      const bounded = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999, sample)) : 0;
      const swap = Math.floor(bounded * (index + 1));
      [cycle[index], cycle[swap]] = [cycle[swap], cycle[index]];
    }
    if (assignments.length > 0 && cycle[0] === assignments[assignments.length - 1]) {
      const alternate = cycle.findIndex((weapon) => weapon !== assignments[assignments.length - 1]);
      [cycle[0], cycle[alternate]] = [cycle[alternate], cycle[0]];
    }
    assignments.push(...cycle.slice(0, total - assignments.length));
  }
  return assignments;
}

export function botWeaponBurstSize(weapon: PrimaryWeaponId, variation: number): number {
  if (weapon === 'scattergun' || weapon === 'sniper') return 1;
  return weapon === 'smg' ? 4 + Math.abs(Math.floor(variation)) % 2 : 3 + Math.abs(Math.floor(variation)) % 2;
}

export function botWeaponFireInterval(weapon: PrimaryWeaponId, burstActive: boolean): number {
  if (weapon === 'sniper') return 1_250;
  if (weapon === 'scattergun') return 920;
  if (weapon === 'smg') return burstActive ? 92 : 520;
  return burstActive ? 135 : 620;
}

export type BotGrenadeSense = Readonly<{
  alive: boolean;
  hasLineOfSight: boolean;
  reacted: boolean;
  distanceToPlayer: number;
  now: number;
  nextGrenadeAt: number;
  botGrenadeActive: boolean;
  activeBotGrenades: number;
  random: number;
}>;

export function shouldBotThrowGrenade(sense: BotGrenadeSense): boolean {
  return sense.alive
    && sense.hasLineOfSight
    && sense.reacted
    && sense.distanceToPlayer >= BOT_GRENADE_MIN_RANGE
    && sense.distanceToPlayer <= BOT_GRENADE_MAX_RANGE
    && sense.now >= sense.nextGrenadeAt
    && !sense.botGrenadeActive
    && sense.activeBotGrenades === 0
    && Number.isFinite(sense.random)
    && sense.random < 0.32;
}

/** Fifth-death reinforcements, capped so an uncapped five-minute score race stays performant. */
export function soloBotTargetForDeaths(botDeaths: number): number {
  const deaths = Number.isFinite(botDeaths) ? Math.max(0, Math.floor(botDeaths)) : 0;
  return Math.min(MAX_SOLO_BOTS, SOLO_BOT_COUNT + Math.floor(deaths / BOT_DEATHS_PER_REINFORCEMENT));
}

/** Yaw that points Atomic Acres' authoritative -Z operator-forward axis toward a target. */
export function operatorYawToward(from: { x: number; z: number }, target: { x: number; z: number }): number {
  return Math.atan2(-(target.x - from.x), -(target.z - from.z));
}

export type SpawnCandidate = {
  index: number;
  nearestPlayerDistanceSq: number;
  visibleThreats: number;
};

export type SpawnSidePressure = Readonly<{
  minimumVisibleThreats: number;
  safestNearestThreatDistanceSq: number;
}>;

export const SPAWN_FLIP_SUSTAIN_MS = 1_200;
export type SpawnFlipHysteresis = Readonly<{ pressuredSince: number | null }>;

export function createSpawnFlipHysteresis(): SpawnFlipHysteresis {
  return { pressuredSince: null };
}

/** A transient pressure sample starts observation; only sustained pressure flips the authored side. */
export function advanceSpawnFlipHysteresis(
  state: SpawnFlipHysteresis,
  pressured: boolean,
  now: number,
): { state: SpawnFlipHysteresis; flip: boolean } {
  if (!pressured || !Number.isFinite(now)) return { state: createSpawnFlipHysteresis(), flip: false };
  const pressuredSince = state.pressuredSince ?? now;
  return {
    state: { pressuredSince },
    flip: now - pressuredSince >= SPAWN_FLIP_SUSTAIN_MS,
  };
}

/** Flip only when the home side is materially pressured and the authored opposite side is safer. */
export function shouldFlipSpawnSide(home: SpawnSidePressure, opposite: SpawnSidePressure): boolean {
  const homeVisible = Math.max(0, home.minimumVisibleThreats);
  const oppositeVisible = Math.max(0, opposite.minimumVisibleThreats);
  const homeDistance = Number.isFinite(home.safestNearestThreatDistanceSq)
    ? Math.max(0, home.safestNearestThreatDistanceSq)
    : Number.POSITIVE_INFINITY;
  const oppositeDistance = Number.isFinite(opposite.safestNearestThreatDistanceSq)
    ? Math.max(0, opposite.safestNearestThreatDistanceSq)
    : Number.POSITIVE_INFINITY;
  if (homeVisible >= 2 && oppositeVisible < homeVisible) return true;
  return homeVisible >= 1
    && oppositeVisible <= homeVisible
    && homeDistance < 12 * 12
    && oppositeDistance > homeDistance * 1.8;
}

/**
 * Selects from the least-exposed spawn tier first, then the farthest bounded
 * pool. A previous spawn is avoided when another equally covered option exists.
 */
export function selectFarthestSpawnCandidate(
  candidates: readonly SpawnCandidate[],
  random: number,
  poolSize = 3,
  avoidIndex = -1,
): number {
  if (candidates.length === 0) return -1;
  const leastVisibleThreats = Math.min(...candidates.map((candidate) => Math.max(0, candidate.visibleThreats)));
  const coveredTier = candidates.filter((candidate) => Math.max(0, candidate.visibleThreats) === leastVisibleThreats);
  const freshTier = coveredTier.filter((candidate) => candidate.index !== avoidIndex);
  const eligible = freshTier.length > 0 ? freshTier : coveredTier;
  const ranked = [...eligible].sort((a, b) =>
    b.nearestPlayerDistanceSq - a.nearestPlayerDistanceSq
    || a.index - b.index,
  );
  const allUncontested = ranked.every((candidate) => !Number.isFinite(candidate.nearestPlayerDistanceSq));
  const pool = allUncontested
    ? ranked
    : ranked.slice(0, Math.max(1, Math.min(Math.floor(poolSize), ranked.length)));
  const boundedRandom = Number.isFinite(random) ? Math.max(0, Math.min(0.999999999, random)) : 0;
  return pool[Math.floor(boundedRandom * pool.length)].index;
}

export type BotSpawnScore = {
  nearestThreatDistanceSq: number;
  visibleThreats: number;
  occupied: boolean;
  preferred: boolean;
};

/** Larger scores are safer; occupation and exposure are hard tiers ahead of distance/preference. */
export function scoreBotSpawn(candidate: BotSpawnScore): number {
  const distance = Number.isFinite(candidate.nearestThreatDistanceSq)
    ? Math.min(1_000_000, Math.max(0, candidate.nearestThreatDistanceSq))
    : 0;
  return distance
    - Math.max(0, candidate.visibleThreats) * 1_000_000_000
    - (candidate.occupied ? 1_000_000_000_000 : 0)
    + (candidate.preferred ? 1 : 0);
}

export function botCanFireWhileProtected(intentFire: boolean, now: number, invulnerableUntil: number): boolean {
  return intentFire && now >= invulnerableUntil;
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
  const shotInterval = Number.isFinite(sense.fireIntervalMs)
    ? Math.max(40, sense.fireIntervalMs!)
    : (sense.burstShotsRemaining ?? 0) > 0 ? 135 : 620;
  const fire = reacted
    && sense.distanceToPlayer <= BOT_FIRE_RANGE
    && sense.distanceToPlayer >= 2.5
    && sense.now - sense.lastShotAt >= shotInterval;
  let movement: BotMovement;
  if (sense.health < 35 && sense.hasLineOfSight && sense.distanceToPlayer < 18) movement = 'retreat';
  else if (sense.distanceToPlayer < 5.5) movement = 'retreat';
  else if (!sense.hasLineOfSight || sense.distanceToPlayer > 18) movement = 'advance';
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
