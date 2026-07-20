import { isBlocked, pointInsideBounds, segmentIntersectsBox, type Box2, type Point3 } from './collision';

export function windowBreakPathBlocked(
  origin: Point3,
  centre: Point3,
  colliders: readonly Box2[],
  endpointInset = 0.12,
): boolean {
  const dx = origin.x - centre.x;
  const dy = origin.y - centre.y;
  const dz = origin.z - centre.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= Math.max(0, endpointInset)) return false;
  const inset = Math.min(Math.max(0, endpointInset), distance * 0.25);
  const end = {
    x: centre.x + dx / distance * inset,
    y: centre.y + dy / distance * inset,
    z: centre.z + dz / distance * inset,
  };
  return colliders.some((box) => segmentIntersectsBox(origin, end, box));
}

export function selectPlayableWindowApproach(
  centre: Point3,
  houseOrigin: Readonly<{ x: number; z: number }>,
  bounds: Box2,
  colliders: readonly Box2[],
  requestedDistance: number,
): Point3 | null {
  const outward = Math.sign(centre.z - houseOrigin.z) || 1;
  const maximum = Math.min(8, Math.max(1.1, Number.isFinite(requestedDistance) ? requestedDistance : 3));
  const distances = [...new Set([maximum, Math.min(maximum, 2.2), 1.1])];
  for (const side of [outward, -outward]) {
    for (const distance of distances) {
      const candidate = { x: centre.x, y: centre.y, z: centre.z + side * distance };
      if (!pointInsideBounds(candidate, bounds, 0.44) || isBlocked(candidate, colliders, 0.44)) continue;
      if (windowBreakPathBlocked(candidate, centre, colliders)) continue;
      return candidate;
    }
  }
  return null;
}
