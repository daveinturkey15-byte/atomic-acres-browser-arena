export type Box2 = { minX: number; maxX: number; minZ: number; maxZ: number; minY?: number; maxY?: number };
export type Point3 = { x: number; y: number; z: number };

export function circleIntersectsBox(x: number, z: number, radius: number, box: Box2): boolean {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

/** Fast horizontal line-of-sight check against a solid AABB. */
export function segmentIntersectsBox(start: Point3, end: Point3, box: Box2, padding = 0.02): boolean {
  const eyeY = (start.y + end.y) / 2;
  if (box.minY !== undefined && eyeY < box.minY) return false;
  if (box.maxY !== undefined && eyeY > box.maxY) return false;
  let near = 0;
  let far = 1;
  for (const [origin, delta, min, max] of [
    [start.x, end.x - start.x, box.minX - padding, box.maxX + padding],
    [start.z, end.z - start.z, box.minZ - padding, box.maxZ + padding],
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return false;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return false;
  }
  return far > 0.01 && near < 0.99;
}

export function isBlocked(point: Point3, colliders: readonly Box2[], radius = 0.42): boolean {
  return colliders.some((box) => {
    if (box.minY !== undefined && point.y < box.minY) return false;
    if (box.maxY !== undefined && point.y - 1.65 > box.maxY) return false;
    return circleIntersectsBox(point.x, point.z, radius, box);
  });
}

export function resolveHorizontalMove(
  current: Point3,
  desired: Point3,
  colliders: readonly Box2[],
  bounds: Box2,
  radius = 0.42,
): Point3 {
  const next = { ...current };
  const clampedX = Math.max(bounds.minX + radius, Math.min(desired.x, bounds.maxX - radius));
  const xAttempt = { x: clampedX, y: desired.y, z: current.z };
  if (!isBlocked(xAttempt, colliders, radius)) next.x = clampedX;

  const clampedZ = Math.max(bounds.minZ + radius, Math.min(desired.z, bounds.maxZ - radius));
  const zAttempt = { x: next.x, y: desired.y, z: clampedZ };
  if (!isBlocked(zAttempt, colliders, radius)) next.z = clampedZ;
  next.y = desired.y;
  return next;
}

export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}
