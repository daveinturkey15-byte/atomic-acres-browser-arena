export type Box2 = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  /** Optional visual-space Euler rotation consumed only by the Rapier physics adapter. */
  rotation?: [number, number, number];
};
export type Point3 = { x: number; y: number; z: number };
export type SweptSphereHit = { time: number; normal: Point3 };

/** Earliest swept-sphere hit against authored AABBs; prevents fast grenades tunnelling through thin cover. */
export function sweepSphereAgainstBoxes(
  start: Point3,
  delta: Point3,
  boxes: readonly Box2[],
  radius = 0.17,
): SweptSphereHit | null {
  let best: SweptSphereHit | null = null;
  for (const box of boxes) {
    const mins = [box.minX - radius, (box.minY ?? 0) - radius, box.minZ - radius];
    const maxs = [box.maxX + radius, (box.maxY ?? 8) + radius, box.maxZ + radius];
    const starts = [start.x, start.y, start.z];
    const deltas = [delta.x, delta.y, delta.z];
    let near = 0;
    let far = 1;
    let nearAxis = -1;
    let nearSign = 0;
    let valid = true;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(deltas[axis]) < 1e-7) {
        if (starts[axis] < mins[axis] || starts[axis] > maxs[axis]) valid = false;
        continue;
      }
      let first = (mins[axis] - starts[axis]) / deltas[axis];
      let second = (maxs[axis] - starts[axis]) / deltas[axis];
      let sign = -Math.sign(deltas[axis]);
      if (first > second) { [first, second] = [second, first]; sign *= -1; }
      if (first > near) { near = first; nearAxis = axis; nearSign = sign; }
      far = Math.min(far, second);
      if (near > far) { valid = false; break; }
    }
    if (!valid || nearAxis < 0 || near < 0 || near > 1 || (best && near >= best.time)) continue;
    const normal = { x: 0, y: 0, z: 0 };
    if (nearAxis === 0) normal.x = nearSign;
    else if (nearAxis === 1) normal.y = nearSign;
    else normal.z = nearSign;
    best = { time: near, normal };
  }
  return best;
}

export function circleIntersectsBox(x: number, z: number, radius: number, box: Box2): boolean {
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

/** Exact three-dimensional segment/AABB entry time. Null means the segment is not blocked. */
export function segmentBoxHitTime(start: Point3, end: Point3, box: Box2, padding = 0.02): number | null {
  let near = 0;
  let far = 1;
  for (const [origin, delta, min, max] of [
    [start.x, end.x - start.x, box.minX - padding, box.maxX + padding],
    [start.y, end.y - start.y, (box.minY ?? 0) - padding, (box.maxY ?? 8) + padding],
    [start.z, end.z - start.z, box.minZ - padding, box.maxZ + padding],
  ] as const) {
    if (Math.abs(delta) < 1e-8) {
      if (origin < min || origin > max) return null;
      continue;
    }
    const first = (min - origin) / delta;
    const second = (max - origin) / delta;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }
  return far > 0.01 && near < 0.99 ? Math.max(0, near) : null;
}

/** Exact line-of-sight check against a solid 3D AABB. */
export function segmentIntersectsBox(start: Point3, end: Point3, box: Box2, padding = 0.02): boolean {
  return segmentBoxHitTime(start, end, box, padding) !== null;
}

export function firstSegmentBoxHit(
  start: Point3,
  end: Point3,
  boxes: readonly Box2[],
  padding = 0.02,
): { box: Box2; time: number } | null {
  let first: { box: Box2; time: number } | null = null;
  for (const box of boxes) {
    const time = segmentBoxHitTime(start, end, box, padding);
    if (time !== null && (!first || time < first.time)) first = { box, time };
  }
  return first;
}

export type HitscanResolution = {
  hitTarget: boolean;
  blockedByCover: boolean;
  tracerDistance: number;
  targetDistanceAlongRay: number;
};

/** Resolves target proximity and the first cover impact from the same authoritative ray. */
export function resolveHitscanAgainstTarget(
  origin: Point3,
  direction: Point3,
  maxDistance: number,
  target: Point3,
  targetRadius: number,
  boxes: readonly Box2[],
): HitscanResolution {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const unit = { x: direction.x / magnitude, y: direction.y / magnitude, z: direction.z / magnitude };
  const end = {
    x: origin.x + unit.x * maxDistance,
    y: origin.y + unit.y * maxDistance,
    z: origin.z + unit.z * maxDistance,
  };
  const cover = firstSegmentBoxHit(origin, end, boxes);
  const tracerDistance = cover ? maxDistance * cover.time : maxDistance;
  const toTarget = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const along = toTarget.x * unit.x + toTarget.y * unit.y + toTarget.z * unit.z;
  const closest = {
    x: origin.x + unit.x * along,
    y: origin.y + unit.y * along,
    z: origin.z + unit.z * along,
  };
  const missDistance = Math.hypot(target.x - closest.x, target.y - closest.y, target.z - closest.z);
  const blockedByCover = cover !== null && tracerDistance < along - targetRadius;
  return {
    hitTarget: along > 0 && along <= maxDistance && missDistance < targetRadius && !blockedByCover,
    blockedByCover,
    tracerDistance,
    targetDistanceAlongRay: along,
  };
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

export function pointInsideBounds(point: Point3, bounds: Box2, margin = 0): boolean {
  return point.x >= bounds.minX + margin
    && point.x <= bounds.maxX - margin
    && point.z >= bounds.minZ + margin
    && point.z <= bounds.maxZ - margin;
}

export function clampPointToBounds(point: Point3, bounds: Box2, margin = 0): Point3 {
  return {
    x: Math.max(bounds.minX + margin, Math.min(point.x, bounds.maxX - margin)),
    y: point.y,
    z: Math.max(bounds.minZ + margin, Math.min(point.z, bounds.maxZ - margin)),
  };
}

export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-smoothing * dt));
}
