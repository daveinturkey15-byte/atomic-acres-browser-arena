import type { Point3 } from './collision';

export type VerticalRoute = Readonly<{
  id: string;
  foot: readonly [number, number, number];
  top: readonly [number, number, number];
}>;

export type VerticalRamp = Readonly<{
  id: string;
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  width: number;
}>;

export type VerticalPlatform = Readonly<{
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}>;

export type ArenaVerticalNavigation = Readonly<{
  routes: readonly VerticalRoute[];
  ramps: readonly VerticalRamp[];
  platforms: readonly VerticalPlatform[];
}>;

function tuplePoint(tuple: readonly [number, number, number]): Point3 {
  return { x: tuple[0], y: tuple[1], z: tuple[2] };
}

function distanceXZ(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const COMBAT_TARGET_EYE_HEIGHTS = [1.7, 1.16, 0.61] as const;
// Skyline's 2.55-3.34 m connected surfaces are one historical upper tier;
// yacht decks separated by roughly 3 m remain distinct graph nodes.
const LEVEL_TIER_MAX_SPAN = 1;
// Prevent an actor below one ramp from being captured by a stacked ramp that
// happens to share the same XZ footprint.
const RAMP_VERTICAL_CAPTURE_DISTANCE = 1.25;

type RampSample = Readonly<{
  ramp: VerticalRamp;
  progress: number;
  distance: number;
  y: number;
}>;

type RouteEdge = Readonly<{
  route: VerticalRoute;
  footLevel: number;
  topLevel: number;
}>;

function rampSample(ramp: VerticalRamp, position: Point3): { progress: number; distance: number } {
  const from = tuplePoint(ramp.from);
  const to = tuplePoint(ramp.to);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const progress = lengthSquared > 0
    ? ((position.x - from.x) * dx + (position.z - from.z) * dz) / lengthSquared
    : 0;
  const nearestX = from.x + dx * progress;
  const nearestZ = from.z + dz * progress;
  return { progress, distance: Math.hypot(position.x - nearestX, position.z - nearestZ) };
}

function activeRampSamples(navigation: ArenaVerticalNavigation, position: Point3): RampSample[] {
  return navigation.ramps.flatMap((ramp) => {
    const sample = rampSample(ramp, position);
    if (sample.progress < -0.06 || sample.progress > 1.06 || sample.distance > ramp.width / 2 - 0.08) return [];
    const progress = Math.max(0, Math.min(1, sample.progress));
    return [{
      ramp,
      progress,
      distance: sample.distance,
      y: ramp.from[1] + (ramp.to[1] - ramp.from[1]) * progress,
    }];
  });
}

function nearestRampSample(
  navigation: ArenaVerticalNavigation,
  position: Point3,
  referenceY: number,
): RampSample | null {
  const candidates = activeRampSamples(navigation, position)
    .filter((sample) => Math.abs(sample.y - referenceY) <= RAMP_VERTICAL_CAPTURE_DISTANCE)
    .sort((left, right) =>
      Math.abs(left.y - referenceY) - Math.abs(right.y - referenceY)
      || left.distance - right.distance
      || left.ramp.id.localeCompare(right.ramp.id));
  return candidates[0] ?? null;
}

function authoredRouteLevels(navigation: ArenaVerticalNavigation): number[] {
  const elevations = [
    0,
    ...navigation.routes.flatMap((route) => [route.foot[1], route.top[1]]),
    ...navigation.platforms.map((platform) => platform.y),
  ].sort((left, right) => left - right);
  const tiers: number[][] = [];
  for (const elevation of elevations) {
    const tier = tiers[tiers.length - 1];
    if (!tier || elevation - tier[0] > LEVEL_TIER_MAX_SPAN) tiers.push([elevation]);
    else tier.push(elevation);
  }
  return tiers.map((tier) => tier.reduce((total, elevation) => total + elevation, 0) / tier.length);
}

function nearestLevel(levels: readonly number[], elevation: number): number {
  let nearest = 0;
  for (let index = 1; index < levels.length; index += 1) {
    const distance = Math.abs(levels[index] - elevation);
    const nearestDistance = Math.abs(levels[nearest] - elevation);
    if (distance < nearestDistance) nearest = index;
  }
  return nearest;
}

function combatTargetLevel(levels: readonly number[], targetY: number): number {
  // Combat targets are camera/eye positions while authored route levels and
  // bot actors use feet elevations. Consider every supported player stance.
  let best = { level: 0, distance: Number.POSITIVE_INFINITY, eyeHeightIndex: 0 };
  COMBAT_TARGET_EYE_HEIGHTS.forEach((eyeHeight, eyeHeightIndex) => {
    const feetY = targetY - eyeHeight;
    const level = nearestLevel(levels, feetY);
    const distance = Math.abs(levels[level] - feetY);
    if (distance < best.distance || (distance === best.distance && eyeHeightIndex < best.eyeHeightIndex)) {
      best = { level, distance, eyeHeightIndex };
    }
  });
  return best.level;
}

function routeEdges(navigation: ArenaVerticalNavigation, levels: readonly number[]): RouteEdge[] {
  return navigation.routes.map((route) => ({
    route,
    footLevel: nearestLevel(levels, route.foot[1]),
    topLevel: nearestLevel(levels, route.top[1]),
  })).filter((edge) => edge.footLevel !== edge.topLevel);
}

function levelDistancesToTarget(levelCount: number, edges: readonly RouteEdge[], targetLevel: number): number[] {
  const distances = Array<number>(levelCount).fill(Number.POSITIVE_INFINITY);
  distances[targetLevel] = 0;
  const queue = [targetLevel];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const level = queue[cursor];
    for (const edge of edges) {
      const adjacent = edge.footLevel === level ? edge.topLevel
        : edge.topLevel === level ? edge.footLevel : null;
      if (adjacent === null || Number.isFinite(distances[adjacent])) continue;
      distances[adjacent] = distances[level] + 1;
      queue.push(adjacent);
    }
  }
  return distances;
}

/** Returns map-authored bot feet elevation for ramps and retained upper surfaces. */
export function authoredElevationAt(
  navigation: ArenaVerticalNavigation | null | undefined,
  position: Point3,
  previousY: number,
): number {
  if (!navigation) return 0;
  const ramp = nearestRampSample(navigation, position, previousY);
  if (ramp) return ramp.y;
  const supportedElevations = [
    0,
    ...navigation.platforms.filter((platform) =>
      position.x >= platform.minX && position.x <= platform.maxX
      && position.z >= platform.minZ && position.z <= platform.maxZ)
      .map((platform) => platform.y),
  ];
  return supportedElevations.reduce((nearest, elevation) =>
    Math.abs(elevation - previousY) < Math.abs(nearest - previousY) ? elevation : nearest, 0);
}

/**
 * Chooses an authored ascent/descent route and returns its next endpoint.
 * The score considers both actor approach and target-side exit distance, so a
 * cabin target selects the airstair while a terminal target selects an escalator.
 */
export function authoredVerticalRouteTarget(
  navigation: ArenaVerticalNavigation | null | undefined,
  actor: Point3,
  target: Point3,
): Point3 | null {
  if (!navigation?.routes.length) return null;
  const levels = authoredRouteLevels(navigation);
  const targetLevel = combatTargetLevel(levels, target.y);
  const activeRamp = nearestRampSample(navigation, actor, actor.y);
  if (activeRamp) {
    const from = tuplePoint(activeRamp.ramp.from);
    const to = tuplePoint(activeRamp.ramp.to);
    const targetElevation = levels[targetLevel];
    const desiredEnd = Math.abs(to.y - targetElevation) < Math.abs(from.y - targetElevation) ? to : from;
    if (distanceXZ(actor, desiredEnd) > 0.35) return desiredEnd;
  }
  const actorLevel = nearestLevel(levels, actor.y);
  if (actorLevel === targetLevel) return null;

  const edges = routeEdges(navigation, levels);
  const distances = levelDistancesToTarget(levels.length, edges, targetLevel);
  if (!Number.isFinite(distances[actorLevel])) return null;

  let best: { entry: Point3; exit: Point3; score: number } | null = null;
  for (const edge of edges) {
    if (edge.footLevel !== actorLevel && edge.topLevel !== actorLevel) continue;
    const entryIsFoot = edge.footLevel === actorLevel;
    const adjacentLevel = entryIsFoot ? edge.topLevel : edge.footLevel;
    if (distances[adjacentLevel] !== distances[actorLevel] - 1) continue;
    const entry = tuplePoint(entryIsFoot ? edge.route.foot : edge.route.top);
    const exit = tuplePoint(entryIsFoot ? edge.route.top : edge.route.foot);
    const score = distanceXZ(actor, entry) + distanceXZ(target, exit);
    if (!best || score < best.score) best = { entry, exit, score };
  }
  if (!best) return null;
  return distanceXZ(actor, best.entry) <= 1.35 ? best.exit : best.entry;
}
