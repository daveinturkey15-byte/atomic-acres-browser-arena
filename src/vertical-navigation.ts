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

/** Returns map-authored bot feet elevation for ramps and retained upper surfaces. */
export function authoredElevationAt(
  navigation: ArenaVerticalNavigation | null | undefined,
  position: Point3,
  previousY: number,
): number {
  if (!navigation) return 0;
  for (const ramp of navigation.ramps) {
    const sample = rampSample(ramp, position);
    if (sample.progress < -0.06 || sample.progress > 1.06 || sample.distance > ramp.width / 2 - 0.08) continue;
    const progress = Math.max(0, Math.min(1, sample.progress));
    return ramp.from[1] + (ramp.to[1] - ramp.from[1]) * progress;
  }
  if (previousY > 1) {
    const platform = navigation.platforms.find((entry) =>
      position.x >= entry.minX && position.x <= entry.maxX
      && position.z >= entry.minZ && position.z <= entry.maxZ);
    if (platform) return platform.y;
  }
  return 0;
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
  const targetUpper = target.y > 2.2;
  const activeRamp = navigation.ramps.find((ramp) => {
    const sample = rampSample(ramp, actor);
    return sample.progress >= -0.03 && sample.progress <= 1.03 && sample.distance <= ramp.width / 2 - 0.08;
  });
  if (activeRamp) {
    const from = tuplePoint(activeRamp.from);
    const to = tuplePoint(activeRamp.to);
    const desiredEnd = targetUpper === (to.y >= from.y) ? to : from;
    if (distanceXZ(actor, desiredEnd) > 0.35) return desiredEnd;
  }
  const actorUpper = actor.y > 2.2;
  if (actorUpper === targetUpper) return null;

  let best: { entry: Point3; exit: Point3; score: number } | null = null;
  for (const route of navigation.routes) {
    const foot = tuplePoint(route.foot);
    const top = tuplePoint(route.top);
    const entry = targetUpper ? foot : top;
    const exit = targetUpper ? top : foot;
    const score = distanceXZ(actor, entry) + distanceXZ(target, exit);
    if (!best || score < best.score) best = { entry, exit, score };
  }
  if (!best) return null;
  return distanceXZ(actor, best.entry) <= 1.35 ? best.exit : best.entry;
}
