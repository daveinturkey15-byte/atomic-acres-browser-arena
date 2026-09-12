/**
 * HF-396 - "the rail is still detached from the barrel and scope".
 *
 * The rails are not nodes. The Pass 65 deliveries batch every rigid part of a
 * weapon into a handful of per-material meshes, so a rail, its riser and the
 * optic mount it carries are triangles inside `..._Runtime_static_...` with no
 * name and no transform of their own. A contract on "socket positions" cannot
 * see them; only the geometry can.
 *
 * So the contract is geometric: drop a vertical probe line through the weapon
 * at a chosen (x, z) and read the solid intervals it passes through. Where a
 * rail sits ON the receiver, the probe from the bore up to the top of the rail
 * is one unbroken solid. Where it floats, there is an empty run between the
 * receiver's top and the rail's underside - which is exactly what the owner
 * sees. The same probe, run up to the optic, says whether the optic mount is
 * seated on the rail.
 *
 * The occupancy is read by winding, not by parity: every batched mesh is a
 * union of closed, outward-wound solids (Blender cubes, cylinders and profiled
 * prisms), and overlapping solids are the normal case on a gun. Counting
 * "entered a solid" (down-facing triangle above the probe point) against
 * "left a solid" (up-facing) survives overlap where an in/out parity walk does
 * not.
 */

export type RailProbe = Readonly<{
  /** Root-space X of the probe line (metres; the weapon's centreline is 0). */
  x: number;
  /** Root-space Z of the probe line (metres; the muzzle is toward -Z). */
  z: number;
  /** Inclusive vertical span the probe must find solid, bottom to top. */
  fromY: number;
  toY: number;
}>;

export type Interval = readonly [number, number];

/** Solid intervals along the vertical line at (x, z), merged, ascending. */
export function verticalOccupancy(triangles: Float64Array | Float32Array, x: number, z: number): Interval[] {
  // Crossings: [y, +1 entering the solid from below, -1 leaving it].
  const crossings: Array<[number, number]> = [];
  for (let offset = 0; offset + 8 < triangles.length; offset += 9) {
    const ax = triangles[offset]!; const ay = triangles[offset + 1]!; const az = triangles[offset + 2]!;
    const bx = triangles[offset + 3]!; const by = triangles[offset + 4]!; const bz = triangles[offset + 5]!;
    const cx = triangles[offset + 6]!; const cy = triangles[offset + 7]!; const cz = triangles[offset + 8]!;
    // Point-in-triangle in the XZ projection via barycentric coordinates.
    const v0x = cx - ax; const v0z = cz - az;
    const v1x = bx - ax; const v1z = bz - az;
    const v2x = x - ax; const v2z = z - az;
    const dot00 = v0x * v0x + v0z * v0z;
    const dot01 = v0x * v1x + v0z * v1z;
    const dot02 = v0x * v2x + v0z * v2z;
    const dot11 = v1x * v1x + v1z * v1z;
    const dot12 = v1x * v2x + v1z * v2z;
    const denominator = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(denominator) < 1e-14) continue; // vertical face: measure-zero for a vertical probe
    const inverse = 1 / denominator;
    const u = (dot11 * dot02 - dot01 * dot12) * inverse;
    const v = (dot00 * dot12 - dot01 * dot02) * inverse;
    if (u < 0 || v < 0 || u + v > 1) continue;
    const y = ay + u * (cy - ay) + v * (by - ay);
    // Outward normal's Y sign from the winding: (b - a) x (c - a).
    const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    if (normalY === 0) continue;
    // Walking UP the probe: an up-facing triangle (normal +Y) is where the
    // solid ENDS, a down-facing one is where it BEGINS.
    crossings.push([y, normalY > 0 ? -1 : 1]);
  }
  crossings.sort((left, right) => left[0] - right[0] || right[1] - left[1]);
  const intervals: Array<[number, number]> = [];
  let depth = 0;
  let start = 0;
  for (const [y, delta] of crossings) {
    const before = depth;
    depth += delta;
    if (before <= 0 && depth > 0) start = y;
    if (before > 0 && depth <= 0) intervals.push([start, y]);
  }
  // Merge touching or overlapping intervals.
  const merged: Array<[number, number]> = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], interval[1]);
    else merged.push([interval[0], interval[1]]);
  }
  return merged;
}

export type ProbeVerdict = Readonly<{
  probe: RailProbe;
  /** Solid intervals found along the probe, clipped to [fromY, toY]. */
  solids: readonly Interval[];
  /** Empty runs inside [fromY, toY], longest first. */
  gaps: readonly Interval[];
  /** The longest empty run inside [fromY, toY], in metres; 0 when unbroken. */
  largestGapMeters: number;
}>;

/**
 * Where the probe's span is NOT solid. A rail seated on its receiver, and an
 * optic seated on its rail, show as an unbroken solid from the bore to the top
 * of the stack; a floating rail shows as one empty run whose length is exactly
 * how far it floats.
 */
export function probeVerticalStack(triangles: Float64Array | Float32Array, probe: RailProbe): ProbeVerdict {
  const solids = verticalOccupancy(triangles, probe.x, probe.z)
    .map(([low, high]) => [Math.max(low, probe.fromY), Math.min(high, probe.toY)] as [number, number])
    .filter(([low, high]) => high > low);
  const gaps: Array<[number, number]> = [];
  let cursor = probe.fromY;
  for (const [low, high] of solids) {
    if (low > cursor) gaps.push([cursor, low]);
    cursor = Math.max(cursor, high);
  }
  if (cursor < probe.toY) gaps.push([cursor, probe.toY]);
  gaps.sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]));
  return Object.freeze({
    probe,
    solids: Object.freeze(solids),
    gaps: Object.freeze(gaps),
    largestGapMeters: gaps.length > 0 ? gaps[0]![1] - gaps[0]![0] : 0,
  });
}
