export type Box2 = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  /** Optional XYZ Euler rotation shared by Rapier and the lightweight collision queries below. */
  rotation?: [number, number, number];
};
export type Point3 = { x: number; y: number; z: number };
export type SweptSphereHit = { time: number; normal: Point3 };

type RotationMatrix = {
  xx: number; xy: number; xz: number;
  yx: number; yy: number; yz: number;
  zx: number; zy: number; zz: number;
};

type ProjectedPoint = { x: number; z: number };

type BoxFrame = {
  centre: Point3;
  halfExtents: Point3;
  rotation: RotationMatrix;
  worldVertices?: readonly Point3[];
  projectedHull?: readonly ProjectedPoint[];
};

type CachedBoxFrame = BoxFrame & {
  source: readonly [number, number, number, number, number, number, number, number, number];
};

type SlabHit = {
  near: number;
  far: number;
  nearAxis: number;
  nearSign: number;
};

const boxFrameCache = new WeakMap<Box2, CachedBoxFrame>();

/** Matches the XYZ Euler-to-quaternion convention used by the Rapier adapter. */
function rotationMatrix(rotation: Box2['rotation']): RotationMatrix {
  if (!rotation) {
    return { xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 };
  }
  const [x, y, z] = rotation;
  const [sx, cx] = [Math.sin(x / 2), Math.cos(x / 2)];
  const [sy, cy] = [Math.sin(y / 2), Math.cos(y / 2)];
  const [sz, cz] = [Math.sin(z / 2), Math.cos(z / 2)];
  const qx = sx * cy * cz + cx * sy * sz;
  const qy = cx * sy * cz - sx * cy * sz;
  const qz = cx * cy * sz + sx * sy * cz;
  const qw = cx * cy * cz - sx * sy * sz;
  const xx2 = qx * qx;
  const yy2 = qy * qy;
  const zz2 = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const wx = qw * qx;
  const wy = qw * qy;
  const wz = qw * qz;
  return {
    xx: 1 - 2 * (yy2 + zz2),
    xy: 2 * (xy - wz),
    xz: 2 * (xz + wy),
    yx: 2 * (xy + wz),
    yy: 1 - 2 * (xx2 + zz2),
    yz: 2 * (yz - wx),
    zx: 2 * (xz - wy),
    zy: 2 * (yz + wx),
    zz: 1 - 2 * (xx2 + yy2),
  };
}

function boxFrame(box: Box2): CachedBoxFrame {
  const minY = box.minY ?? 0;
  const maxY = box.maxY ?? 8;
  const rotationX = box.rotation?.[0] ?? 0;
  const rotationY = box.rotation?.[1] ?? 0;
  const rotationZ = box.rotation?.[2] ?? 0;
  const cached = boxFrameCache.get(box);
  if (cached
    && cached.source[0] === box.minX
    && cached.source[1] === box.maxX
    && cached.source[2] === minY
    && cached.source[3] === maxY
    && cached.source[4] === box.minZ
    && cached.source[5] === box.maxZ
    && cached.source[6] === rotationX
    && cached.source[7] === rotationY
    && cached.source[8] === rotationZ) {
    return cached;
  }
  const frame: CachedBoxFrame = {
    source: [box.minX, box.maxX, minY, maxY, box.minZ, box.maxZ, rotationX, rotationY, rotationZ],
    centre: {
      x: (box.minX + box.maxX) / 2,
      y: (minY + maxY) / 2,
      z: (box.minZ + box.maxZ) / 2,
    },
    halfExtents: {
      x: Math.max(0, (box.maxX - box.minX) / 2),
      y: Math.max(0, (maxY - minY) / 2),
      z: Math.max(0, (box.maxZ - box.minZ) / 2),
    },
    rotation: rotationMatrix(box.rotation),
  };
  boxFrameCache.set(box, frame);
  return frame;
}

function worldPointToLocal(frame: BoxFrame, point: Point3): Point3 {
  const x = point.x - frame.centre.x;
  const y = point.y - frame.centre.y;
  const z = point.z - frame.centre.z;
  const rotation = frame.rotation;
  return {
    x: rotation.xx * x + rotation.yx * y + rotation.zx * z,
    y: rotation.xy * x + rotation.yy * y + rotation.zy * z,
    z: rotation.xz * x + rotation.yz * y + rotation.zz * z,
  };
}

function worldVectorToLocal(frame: BoxFrame, vector: Point3): Point3 {
  const rotation = frame.rotation;
  return {
    x: rotation.xx * vector.x + rotation.yx * vector.y + rotation.zx * vector.z,
    y: rotation.xy * vector.x + rotation.yy * vector.y + rotation.zy * vector.z,
    z: rotation.xz * vector.x + rotation.yz * vector.y + rotation.zz * vector.z,
  };
}

function localVectorToWorld(frame: BoxFrame, vector: Point3): Point3 {
  const rotation = frame.rotation;
  const result = {
    x: rotation.xx * vector.x + rotation.xy * vector.y + rotation.xz * vector.z,
    y: rotation.yx * vector.x + rotation.yy * vector.y + rotation.yz * vector.z,
    z: rotation.zx * vector.x + rotation.zy * vector.y + rotation.zz * vector.z,
  };
  const magnitude = Math.hypot(result.x, result.y, result.z) || 1;
  const clean = (value: number) => {
    const normalized = value / magnitude;
    if (Math.abs(normalized) < 1e-12) return 0;
    if (Math.abs(normalized - 1) < 1e-12) return 1;
    if (Math.abs(normalized + 1) < 1e-12) return -1;
    return normalized;
  };
  return { x: clean(result.x), y: clean(result.y), z: clean(result.z) };
}

function segmentSlabHit(start: Point3, delta: Point3, halfExtents: Point3, padding: number): SlabHit | null {
  const starts = [start.x, start.y, start.z];
  const deltas = [delta.x, delta.y, delta.z];
  const halfSizes = [halfExtents.x + padding, halfExtents.y + padding, halfExtents.z + padding];
  let near = 0;
  let far = 1;
  let nearAxis = -1;
  let nearSign = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = starts[axis];
    const direction = deltas[axis];
    const halfSize = halfSizes[axis];
    if (Math.abs(direction) < 1e-8) {
      if (origin < -halfSize || origin > halfSize) return null;
      continue;
    }
    let first = (-halfSize - origin) / direction;
    let second = (halfSize - origin) / direction;
    let sign = -Math.sign(direction);
    if (first > second) {
      [first, second] = [second, first];
      sign *= -1;
    }
    if (first > near) {
      near = first;
      nearAxis = axis;
      nearSign = sign;
    }
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return { near, far, nearAxis, nearSign };
}

function cross2d(origin: ProjectedPoint, a: ProjectedPoint, b: ProjectedPoint): number {
  return (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
}

function worldVertices(frame: CachedBoxFrame): readonly Point3[] {
  if (frame.worldVertices) return frame.worldVertices;
  const vertices: Point3[] = [];
  const { halfExtents: half, rotation, centre } = frame;
  for (const xSign of [-1, 1]) {
    for (const ySign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const x = half.x * xSign;
        const y = half.y * ySign;
        const z = half.z * zSign;
        vertices.push({
          x: centre.x + rotation.xx * x + rotation.xy * y + rotation.xz * z,
          y: centre.y + rotation.yx * x + rotation.yy * y + rotation.yz * z,
          z: centre.z + rotation.zx * x + rotation.zy * y + rotation.zz * z,
        });
      }
    }
  }
  frame.worldVertices = vertices;
  return vertices;
}

function convexHull(points: readonly ProjectedPoint[]): readonly ProjectedPoint[] {
  const sorted = [...points];
  sorted.sort((left, right) => left.x - right.x || left.z - right.z);
  const unique = sorted.filter((point, index) => index === 0
    || Math.abs(point.x - sorted[index - 1].x) > 1e-10
    || Math.abs(point.z - sorted[index - 1].z) > 1e-10);
  if (unique.length <= 2) return unique;
  const lower: ProjectedPoint[] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross2d(lower[lower.length - 2], lower[lower.length - 1], point) <= 1e-12) lower.pop();
    lower.push(point);
  }
  const upper: ProjectedPoint[] = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross2d(upper[upper.length - 2], upper[upper.length - 1], point) <= 1e-12) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function projectedHull(frame: CachedBoxFrame): readonly ProjectedPoint[] {
  if (frame.projectedHull) return frame.projectedHull;
  frame.projectedHull = convexHull(worldVertices(frame).map((vertex) => ({ x: vertex.x, z: vertex.z })));
  return frame.projectedHull;
}

const BOX_EDGES = [
  [0, 4], [1, 5], [2, 6], [3, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 1], [2, 3], [4, 5], [6, 7],
] as const;

/** Horizontal footprint of the OBB portion intersecting a player's vertical body span. */
function projectedHullWithinVerticalSpan(
  frame: CachedBoxFrame,
  minimumY: number,
  maximumY: number,
): readonly ProjectedPoint[] {
  const vertices = worldVertices(frame);
  const points: ProjectedPoint[] = vertices
    .filter((vertex) => vertex.y >= minimumY - 1e-10 && vertex.y <= maximumY + 1e-10)
    .map((vertex) => ({ x: vertex.x, z: vertex.z }));
  for (const [startIndex, endIndex] of BOX_EDGES) {
    const start = vertices[startIndex];
    const end = vertices[endIndex];
    const deltaY = end.y - start.y;
    if (Math.abs(deltaY) < 1e-12) continue;
    for (const planeY of [minimumY, maximumY]) {
      if (!Number.isFinite(planeY)) continue;
      const time = (planeY - start.y) / deltaY;
      if (time < -1e-10 || time > 1 + 1e-10) continue;
      points.push({
        x: start.x + (end.x - start.x) * time,
        z: start.z + (end.z - start.z) * time,
      });
    }
  }
  return convexHull(points);
}

function squaredDistanceToSegment(point: ProjectedPoint, start: ProjectedPoint, end: ProjectedPoint): number {
  const edgeX = end.x - start.x;
  const edgeZ = end.z - start.z;
  const lengthSquared = edgeX * edgeX + edgeZ * edgeZ;
  const projection = lengthSquared > 1e-16
    ? Math.max(0, Math.min(1, ((point.x - start.x) * edgeX + (point.z - start.z) * edgeZ) / lengthSquared))
    : 0;
  const dx = point.x - (start.x + edgeX * projection);
  const dz = point.z - (start.z + edgeZ * projection);
  return dx * dx + dz * dz;
}

function circleIntersectsProjectedHull(x: number, z: number, radius: number, hull: readonly ProjectedPoint[]): boolean {
  const radiusSquared = radius * radius;
  if (radiusSquared === 0 || hull.length === 0) return false;
  const point = { x, z };
  if (hull.length >= 3) {
    let positive = false;
    let negative = false;
    for (let index = 0; index < hull.length; index += 1) {
      const cross = cross2d(hull[index], hull[(index + 1) % hull.length], point);
      if (cross > 1e-12) positive = true;
      else if (cross < -1e-12) negative = true;
      if (positive && negative) break;
    }
    if (!(positive && negative)) return true;
  }
  let distanceSquared = Number.POSITIVE_INFINITY;
  const edgeCount = hull.length === 1 ? 1 : hull.length;
  for (let index = 0; index < edgeCount; index += 1) {
    distanceSquared = Math.min(
      distanceSquared,
      squaredDistanceToSegment(point, hull[index], hull[(index + 1) % hull.length]),
    );
  }
  return distanceSquared < radiusSquared;
}

/** Earliest swept-sphere hit against authored boxes, including oriented boxes. */
export function sweepSphereAgainstBoxes(
  start: Point3,
  delta: Point3,
  boxes: readonly Box2[],
  radius = 0.17,
): SweptSphereHit | null {
  let best: SweptSphereHit | null = null;
  for (const box of boxes) {
    const frame = boxFrame(box);
    const localStart = worldPointToLocal(frame, start);
    const localDelta = worldVectorToLocal(frame, delta);
    const hit = segmentSlabHit(localStart, localDelta, frame.halfExtents, radius);
    if (!hit || hit.nearAxis < 0 || hit.near < 0 || hit.near > 1 || (best && hit.near >= best.time)) continue;
    const localNormal = { x: 0, y: 0, z: 0 };
    if (hit.nearAxis === 0) localNormal.x = hit.nearSign;
    else if (hit.nearAxis === 1) localNormal.y = hit.nearSign;
    else localNormal.z = hit.nearSign;
    best = { time: hit.near, normal: localVectorToWorld(frame, localNormal) };
  }
  return best;
}

export function circleIntersectsBox(x: number, z: number, radius: number, box: Box2): boolean {
  if (box.rotation) return circleIntersectsProjectedHull(x, z, radius, projectedHull(boxFrame(box)));
  const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
  const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
  const dx = x - nearestX;
  const dz = z - nearestZ;
  return dx * dx + dz * dz < radius * radius;
}

/** Exact three-dimensional segment/box entry time. Null means the segment is not blocked. */
export function segmentBoxHitTime(start: Point3, end: Point3, box: Box2, padding = 0.02): number | null {
  const frame = boxFrame(box);
  const localStart = worldPointToLocal(frame, start);
  const localDelta = worldVectorToLocal(frame, {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  });
  const hit = segmentSlabHit(localStart, localDelta, frame.halfExtents, padding);
  return hit && hit.far > 0.01 && hit.near < 0.99 ? Math.max(0, hit.near) : null;
}

/** Exact line-of-sight check against a solid 3D box. */
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
    if (box.rotation) {
      const frame = boxFrame(box);
      const rotation = frame.rotation;
      const worldHalfY = Math.abs(rotation.yx) * frame.halfExtents.x
        + Math.abs(rotation.yy) * frame.halfExtents.y
        + Math.abs(rotation.yz) * frame.halfExtents.z;
      const minimumY = box.maxY === undefined ? Number.NEGATIVE_INFINITY : point.y - 1.65;
      const maximumY = box.minY === undefined ? Number.POSITIVE_INFINITY : point.y;
      if (maximumY < frame.centre.y - worldHalfY || minimumY > frame.centre.y + worldHalfY) return false;
      const horizontalAndVerticalAxesDecoupled = Math.abs(rotation.xy) < 1e-12
        && Math.abs(rotation.zy) < 1e-12
        && Math.abs(rotation.yx) < 1e-12
        && Math.abs(rotation.yz) < 1e-12;
      const hull = horizontalAndVerticalAxesDecoupled
        ? projectedHull(frame)
        : projectedHullWithinVerticalSpan(frame, minimumY, maximumY);
      return circleIntersectsProjectedHull(point.x, point.z, radius, hull);
    } else {
      if (box.minY !== undefined && point.y < box.minY) return false;
      if (box.maxY !== undefined && point.y - 1.65 > box.maxY) return false;
    }
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
