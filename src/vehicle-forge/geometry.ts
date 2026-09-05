/**
 * vehicle-forge/geometry.ts - lofted vehicle bodies from data-only specs.
 *
 * PRESENTATION ONLY. Everything in this module produces `THREE.BufferGeometry`
 * and nothing else. It registers no collider, no shot surface, no spawn and no
 * navigation, and nothing here may be used to derive collision: the arena's
 * existing authored boxes remain the sole movement and ballistic authority for
 * every vehicle this forge dresses.
 *
 * DETERMINISTIC. Pure arithmetic on the spec record - no `Math.random`, no
 * `Date`, no iteration-order dependence. Two calls with the same spec produce
 * byte-identical typed arrays.
 *
 * HEADLESS-SAFE. Plain CPU `BufferGeometry` construction, so the vitest gates
 * and the collider/visual parity audit run it in Node with no GPU.
 *
 * METHOD PROVENANCE. The lofted-vehicle method (one globally anchored flank
 * profile, superellipse wheel arches, analytic crease normals, shut lines as
 * bracketed inset stations, glass cut out of the loft over an inside-out
 * lining, analytic-normal lathe wheels with a concave cover) was observed in
 * the unlicensed public repository `StarKnightt/morning-diner` (Claude Fable,
 * 2026), shared by the owner, and is RE-IMPLEMENTED HERE FROM FIRST PRINCIPLES
 * per owner policy HF-472. No line, identifier, shader or prose was copied;
 * only the physical measurements and the named failure modes, which are facts
 * rather than expression.
 *
 * WHY A LOFT AND NOT A BOX. A box with a painted stripe has no tumblehome, no
 * sill radius, no arch cut and no shut line, so every light in the arena lands
 * on it as four flat values and the eye reads a crate. The loft's whole job is
 * to give the paint a curvature gradient and give the silhouette an arch.
 */
import * as THREE from 'three';

/** Points per station ring. Fixed, so mirror symmetry is an index identity. */
export const RING_POINTS = 24;

/** Stations laid across one wheel arch. 21 facets the legs; 33 does not. */
export const ARCH_STATIONS = 33;

/** Superellipse exponent for a wheel arch. p = 4 reads as a flap with a void. */
export const ARCH_EXPONENT = 2.6;

/** Half the authored width of a shut line, in metres (a 7 mm gap). */
export const SHUT_LINE_HALF = 0.0035;

/** Paint chamfer either side of a shut line, in metres. */
export const SHUT_LINE_CHAMFER = 0.006;

/** How deep a shut line sinks below the skin, in metres. */
export const SHUT_LINE_DEPTH = 0.008;

/** Two stations closer than this are the same station. */
const STATION_EPSILON = 1e-4;

const COS45 = Math.SQRT1_2;

export type Vec2 = readonly [number, number];
type Vec3 = [number, number, number];

/** One vertex of the roof/hood/deck line, in the vehicle's local frame. */
export interface TopVertex {
  /** Distance from the nose, metres. */
  readonly z: number;
  /** Height of the top surface above the ground. */
  readonly yTop: number;
  /** Half width of the top surface (tumblehome: less than the belt). */
  readonly halfWidthTop: number;
  /** Radius of the top edge arc. */
  readonly topRadius: number;
  /**
   * A one-sided normal break. Hood to windshield and roof to backlight are
   * creases; without the flag the radii and the break average into one soft
   * fold and the car reads as a bar of soap.
   */
  readonly crease?: boolean;
}

export interface SpanZ {
  readonly z0: number;
  readonly z1: number;
}

export interface VehicleSpec {
  readonly id: string;
  /** Nose at z = 0, tail at z = length. */
  readonly length: number;
  /** Half width at the belt line - the widest point of the body. */
  readonly halfWidth: number;
  /** Half width at the sill. Always less than `halfWidth`. */
  readonly sillHalfWidth: number;
  /** Height of the sill above the ground. */
  readonly sillY: number;
  /** Height of the belt line - where the flank stops growing. */
  readonly beltY: number;
  /** Radius rolled onto the sill edge. */
  readonly sillRadius: number;
  readonly wheelRadius: number;
  readonly tyreHalfWidth: number;
  /** |x| of a wheel's centre plane. */
  readonly trackHalfWidth: number;
  /** Axle z positions. Each one cuts an arch out of the loft. */
  readonly wheelZ: readonly number[];
  /** Clearance between the tyre crown and the arch crown. */
  readonly archGap: number;
  readonly top: readonly TopVertex[];
  /** Side pane spans, cut out of the tumblehome segment. */
  readonly sideGlass: readonly SpanZ[];
  /** Windshield / backlight spans, cut out of the top arc band. */
  readonly screens: readonly SpanZ[];
  /** Shut line positions along z. */
  readonly shutLines: readonly number[];
  /**
   * A glazing band cut out of the NOSE CAP, as a height range.
   *
   * Without it a cab-over coach or truck has no windscreen at all: the loft can
   * only cut glass from a flank quad or a top-arc quad, so a body whose front
   * IS its end cap gets a blank painted face with two lamps stuck on it, and
   * every review frame reads it as a van rather than a vehicle with a driver.
   */
  readonly noseGlass?: { readonly yMin: number; readonly yMax: number };
  /** Background station spacing where nothing else asks for one. */
  /**
   * Subtle transverse crown of the roof, metres above the loft's flat yTop at
   * the centre plane, falling to zero at the top-arc edges. The ring stations
   * loft a flat crown edge to edge, which is the dead-flat read the reference
   * critic calls out; a few centimetres of fall across the crown width breaks
   * it without touching the envelope (the peak must stay inside the box the
   * spec dresses - see the proportions gate). Absent (0) the crown is flat.
   */
  readonly roofCrownM?: number;
  /** Background station spacing where nothing else asks for one. */
  readonly stationSpacing: number;
}

export interface Ring {
  readonly z: number;
  /** 24 `[x, y]` pairs, bottom centre first, right flank rising. */
  readonly points: readonly Vec2[];
  readonly yLow: number;
  readonly yTop: number;
  readonly crease: boolean;
  /** Metres this whole ring is sunk below the skin (a shut line floor). */
  readonly inset: number;
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * The flank profile, ANCHORED ONCE GLOBALLY on the spec's nominal sill and
 * belt. Every station reads this same curve, which is the whole reason the
 * skin does not breathe around a wheel cut-out: re-anchoring the bulge to
 * "the height remaining above this station's arch" gives every station over an
 * arch its own curve and blisters the fender.
 */
export function flankHalfWidth(spec: VehicleSpec, y: number): number {
  const span = spec.beltY - spec.sillY;
  const t = span <= 1e-6 ? 1 : clamp((y - spec.sillY) / span, 0, 1);
  return spec.sillHalfWidth + (spec.halfWidth - spec.sillHalfWidth) * Math.pow(t, 0.45);
}

/**
 * The lower edge of the skin at `z`: the sill, lifted over any wheel arch.
 *
 * The arch is a superellipse whose legs land EXACTLY on the sill, so there is
 * no step where the arch ends. An arch authored about the axle height alone
 * ends 0.1 m above the sill and drops vertically to it, which reads as a flap
 * with a void behind it from every oblique angle.
 */
export function archLowerEdge(spec: VehicleSpec, z: number): number {
  let y = spec.sillY;
  const crown = 2 * spec.wheelRadius + spec.archGap;
  const halfSpan = spec.wheelRadius + 0.095;
  for (const axle of spec.wheelZ) {
    const d = Math.abs(z - axle);
    if (d >= halfSpan) continue;
    const u = d / halfSpan;
    const lift = spec.sillY + (crown - spec.sillY)
      * Math.pow(Math.max(0, 1 - Math.pow(u, ARCH_EXPONENT)), 1 / ARCH_EXPONENT);
    if (lift > y) y = lift;
  }
  return y;
}

/** Piecewise-linear read of the roof/hood/deck line at `z`. */
export function topAt(spec: VehicleSpec, z: number): {
  yTop: number; halfWidthTop: number; topRadius: number; crease: boolean;
} {
  const line = spec.top;
  const first = line[0]!;
  const last = line[line.length - 1]!;
  if (z <= first.z) {
    return { yTop: first.yTop, halfWidthTop: first.halfWidthTop, topRadius: first.topRadius, crease: false };
  }
  if (z >= last.z) {
    return { yTop: last.yTop, halfWidthTop: last.halfWidthTop, topRadius: last.topRadius, crease: false };
  }
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]!;
    const b = line[i + 1]!;
    if (z < a.z || z > b.z) continue;
    const span = b.z - a.z;
    const t = span <= 1e-9 ? 0 : (z - a.z) / span;
    const onA = Math.abs(z - a.z) < STATION_EPSILON;
    const onB = Math.abs(z - b.z) < STATION_EPSILON;
    return {
      yTop: a.yTop + (b.yTop - a.yTop) * t,
      halfWidthTop: a.halfWidthTop + (b.halfWidthTop - a.halfWidthTop) * t,
      topRadius: a.topRadius + (b.topRadius - a.topRadius) * t,
      crease: (onA && a.crease === true) || (onB && b.crease === true),
    };
  }
  return { yTop: last.yTop, halfWidthTop: last.halfWidthTop, topRadius: last.topRadius, crease: false };
}

/**
 * How far below the skin the station at `z` sits.
 *
 * A shut line is TWO stations bracketing a 7 mm gap 8 mm deep, with a 6 mm
 * paint chamfer either side. The two chamfers face opposite ways along z, so
 * one catches light and one shadows - which is the highlight/dark pair a real
 * cut line shows, and the reason a single drawn dark quad never reads as one.
 */
export function shutLineInset(spec: VehicleSpec, z: number): number {
  for (const cut of spec.shutLines) {
    if (Math.abs(z - cut) <= SHUT_LINE_HALF + STATION_EPSILON) return SHUT_LINE_DEPTH;
  }
  return 0;
}

/**
 * Where to put the `ARCH_STATIONS` stations across one arch: at EQUAL ARC
 * LENGTH along the superellipse, not at equal angle and not at equal z.
 *
 * This is the difference between an arch and a facet. The superellipse's legs
 * approach vertical, so equal steps in the parameter put almost every station
 * on the crown and leave the two legs as single 8 cm chords - the same "flap
 * with a void behind it" that a p = 4 arch produces, arrived at from the other
 * direction. Equal arc length spends stations where the curve actually turns
 * and walks the straight legs in even strides.
 */
function archStationOffsets(halfSpan: number, height: number): number[] {
  const dense = 512;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= dense; i += 1) {
    const theta = (Math.PI * i) / dense;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    xs.push(halfSpan * Math.sign(c) * Math.pow(Math.abs(c), 2 / ARCH_EXPONENT));
    ys.push(height * Math.pow(Math.abs(s), 2 / ARCH_EXPONENT));
  }
  const cumulative: number[] = [0];
  for (let i = 1; i <= dense; i += 1) {
    cumulative.push(cumulative[i - 1]! + Math.hypot(xs[i]! - xs[i - 1]!, ys[i]! - ys[i - 1]!));
  }
  const total = cumulative[dense]!;
  const offsets: number[] = [];
  let cursor = 0;
  for (let k = 0; k < ARCH_STATIONS; k += 1) {
    const target = (total * k) / (ARCH_STATIONS - 1);
    while (cursor < dense && cumulative[cursor + 1]! < target) cursor += 1;
    const a = cumulative[cursor]!;
    const b = cumulative[Math.min(dense, cursor + 1)]!;
    const t = b - a <= 1e-12 ? 0 : (target - a) / (b - a);
    offsets.push(xs[cursor]! + (xs[Math.min(dense, cursor + 1)]! - xs[cursor]!) * t);
  }
  return offsets;
}

/**
 * Every z that earns a station: top-line vertices, glass and screen edges, the
 * arch sweeps, the shut lines with their chamfers, and a background spacing.
 *
 * A WIDE groove keeps its interior stations. The failure this ordering avoids
 * is a shut-line filter written as "drop everything between the two stations",
 * which silently deletes a whole wheel arch and still lofts closed - just
 * straight.
 */
export function collectStations(spec: VehicleSpec): number[] {
  const out: number[] = [0, spec.length];
  const add = (z: number): void => {
    if (z > STATION_EPSILON && z < spec.length - STATION_EPSILON) out.push(z);
  };
  for (const vertex of spec.top) add(vertex.z);
  for (const span of spec.sideGlass) { add(span.z0); add(span.z1); }
  for (const span of spec.screens) { add(span.z0); add(span.z1); }
  const halfSpan = spec.wheelRadius + 0.095;
  const offsets = archStationOffsets(halfSpan, 2 * spec.wheelRadius + spec.archGap - spec.sillY);
  for (const axle of spec.wheelZ) {
    for (const offset of offsets) add(axle + offset);
  }
  for (const cut of spec.shutLines) {
    add(cut - SHUT_LINE_HALF - SHUT_LINE_CHAMFER);
    add(cut - SHUT_LINE_HALF);
    add(cut + SHUT_LINE_HALF);
    add(cut + SHUT_LINE_HALF + SHUT_LINE_CHAMFER);
  }
  const count = Math.max(1, Math.round(spec.length / spec.stationSpacing));
  for (let i = 1; i < count; i += 1) add((spec.length * i) / count);
  out.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const z of out) {
    const previous = deduped[deduped.length - 1];
    if (previous !== undefined && z - previous < STATION_EPSILON) continue;
    deduped.push(z);
  }
  return deduped;
}

/** Outward 2D normals of a closed, counter-clockwise ring. */
function ringNormals(points: readonly Vec2[], centreY: number): Vec2[] {
  const n = points.length;
  const normals: Vec2[] = [];
  for (let j = 0; j < n; j += 1) {
    const a = points[(j - 1 + n) % n]!;
    const b = points[(j + 1) % n]!;
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const length = Math.hypot(tx, ty) || 1;
    tx /= length;
    ty /= length;
    let nx = ty;
    let ny = -tx;
    const point = points[j]!;
    if (nx * point[0] + ny * (point[1] - centreY) < 0) { nx = -nx; ny = -ny; }
    normals.push([nx, ny] as const);
  }
  return normals;
}

/**
 * Roof surface height at plan offset x on the station at z, including the
 * spec's transverse crown. The crown falls as cos() from +crown at the
 * centre plane to zero at the top-arc edge (hwTop - rTop), so it meets the
 * arc with a near-horizontal tangent and no kink. stationRing and the roof
 * rails both read this, so a rail base can never drift off the skin it sits
 * on. Uses the same clamped hwTop/rTop the ring builder uses.
 */
export function crownSurfaceY(spec: VehicleSpec, z: number, x: number): number {
  const top = topAt(spec, z);
  const yBelt = Math.min(spec.beltY, top.yTop - 0.03);
  const hwBelt = flankHalfWidth(spec, yBelt);
  const hwTop = Math.min(top.halfWidthTop, hwBelt);
  const rTop = Math.max(0.005, Math.min(top.topRadius, (top.yTop - yBelt) * 0.9, hwTop * 0.5));
  const crown = spec.roofCrownM ?? 0;
  if (crown <= 0) return top.yTop;
  const edge = Math.max(1e-3, hwTop - rTop);
  const t = Math.min(1, Math.abs(x) / edge);
  return top.yTop + crown * Math.cos((t * Math.PI) / 2);
}
/**
 * One closed 24-point cross-section: bottom centre, right flank rising, top
 * centre, left flank descending as the exact mirror.
 */

export function stationRing(spec: VehicleSpec, z: number): Ring {
  const top = topAt(spec, z);
  const yLowRaw = archLowerEdge(spec, z);
  const yTop = top.yTop;
  // Over the hood and the deck the top is BELOW the belt. An unclamped belt
  // ring then sits above the top ring, the skin folds outward, and its
  // underside reads as a black lip a few centimetres wide along the far edge.
  const yBelt = Math.min(spec.beltY, yTop - 0.03);
  const yLow = Math.min(yLowRaw, yBelt - 0.06);
  const hwBelt = flankHalfWidth(spec, yBelt);
  // Tumblehome. A body whose flanks are vertical to the roof reads as a box.
  const hwTop = Math.min(top.halfWidthTop, hwBelt);
  const rSill = Math.max(0.002, Math.min(spec.sillRadius, (yBelt - yLow) * 0.35, spec.sillHalfWidth * 0.4));
  const rTop = Math.max(0.005, Math.min(top.topRadius, (yTop - yBelt) * 0.9, hwTop * 0.5));
  const hwSill = flankHalfWidth(spec, yLow);

  const points: Vec2[] = new Array<Vec2>(RING_POINTS);
  points[0] = [0, yLow] as const;
  points[1] = [Math.max(0.001, hwSill - rSill), yLow] as const;
  points[2] = [hwSill - rSill * (1 - COS45), yLow + rSill * (1 - COS45)] as const;
  const ySillTop = yLow + rSill;
  points[3] = [flankHalfWidth(spec, ySillTop), ySillTop] as const;
  const flankFractions = [0.3, 0.6, 0.85];
  for (let k = 0; k < 3; k += 1) {
    const y = ySillTop + (yBelt - ySillTop) * flankFractions[k]!;
    points[4 + k] = [flankHalfWidth(spec, y), y] as const;
  }
  points[7] = [hwBelt, yBelt] as const;
  const yArcStart = yTop - rTop;
  points[8] = [(hwBelt + hwTop) / 2, (yBelt + yArcStart) / 2] as const;
  points[9] = [hwTop, yArcStart] as const;
  points[10] = [hwTop - rTop * (1 - COS45), yTop - rTop * (1 - COS45)] as const;
  points[11] = [Math.max(0.001, hwTop - rTop), yTop] as const;
  points[12] = [0, crownSurfaceY(spec, z, 0)] as const;
  for (let k = 1; k <= 11; k += 1) {
    const mirrored = points[12 - k]!;
    points[12 + k] = [-mirrored[0], mirrored[1]] as const;
  }

  const inset = shutLineInset(spec, z);
  if (inset > 0) {
    const normals = ringNormals(points, (yLow + yTop) / 2);
    for (let j = 0; j < RING_POINTS; j += 1) {
      const point = points[j]!;
      const normal = normals[j]!;
      points[j] = [point[0] - normal[0] * inset, point[1] - normal[1] * inset] as const;
    }
    // Re-impose the mirror EXACTLY. The normals are symmetric only to within
    // floating point, and a shut line 4e-17 m out of true would defeat the
    // ring-symmetry gate for no visual reason at all.
    for (let k = 1; k <= 11; k += 1) {
      const mirrored = points[12 - k]!;
      points[12 + k] = [-mirrored[0], mirrored[1]] as const;
    }
    points[0] = [0, points[0]![1]] as const;
    points[12] = [0, points[12]![1]] as const;
  }

  return { z, points, yLow, yTop, crease: top.crease, inset };
}

/** Which bucket a lofted quad belongs to. */
export type QuadKind = 'body' | 'glass' | 'groove';

/**
 * Quads on the tumblehome segment - where a side pane lives. The right side is
 * belt -> tumblehome mid -> arc start; the left side is its mirror.
 */
const SIDE_GLASS_QUADS = new Set([7, 8, 15, 16]);

/**
 * Quads across the top arc band, inside the pillar columns - where a
 * windshield or a backlight lives. Quads 9 and 14 stay painted, which is what
 * gives the pane a real A-pillar and roof rail rather than a floating sheet.
 */
const SCREEN_QUADS = new Set([10, 11, 12, 13]);

function inAnySpan(spans: readonly SpanZ[], z: number): boolean {
  for (const span of spans) {
    const low = Math.min(span.z0, span.z1);
    const high = Math.max(span.z0, span.z1);
    if (z >= low - STATION_EPSILON && z <= high + STATION_EPSILON) return true;
  }
  return false;
}

export function classifyQuad(spec: VehicleSpec, a: Ring, b: Ring, j: number): QuadKind {
  if (a.inset > 0 && b.inset > 0) return 'groove';
  const midZ = (a.z + b.z) / 2;
  if (a.inset === 0 && b.inset === 0) {
    if (SIDE_GLASS_QUADS.has(j) && inAnySpan(spec.sideGlass, midZ)) return 'glass';
    if (SCREEN_QUADS.has(j) && inAnySpan(spec.screens, midZ)) return 'glass';
  }
  return 'body';
}

interface Sink {
  position: number[];
  normal: number[];
  uv: number[];
}

function emptySink(): Sink {
  return { position: [], normal: [], uv: [] };
}

function toGeometry(sink: Sink, name: string): THREE.BufferGeometry | null {
  if (sink.position.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(sink.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(sink.normal, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(sink.uv, 2));
  geometry.name = name;
  return geometry;
}

/**
 * Flank points borrow the BELT column's fore/aft tangent.
 *
 * If each flank point takes its length tangent from its own column, that
 * column climbs the arch, every normal around the wheel leans fore or aft, and
 * the fender shades like a ripple even though the sheet is flat.
 */
function tangentColumn(j: number): number {
  if (j <= 7) return 7;
  if (j >= 17) return 17;
  return j;
}

function lengthTangent(
  rings: readonly Ring[],
  i: number,
  j: number,
  forwardOnly: boolean,
  backwardOnly: boolean,
): Vec3 {
  const column = tangentColumn(j);
  const here = rings[i]!;
  const previous = rings[Math.max(0, i - 1)]!;
  const next = rings[Math.min(rings.length - 1, i + 1)]!;
  const from = forwardOnly || i === 0 ? here : previous;
  const to = backwardOnly || i === rings.length - 1 ? here : next;
  const a = from.points[column]!;
  const b = to.points[column]!;
  const dz = to.z - from.z;
  if (Math.abs(dz) < 1e-9 && Math.abs(b[0] - a[0]) < 1e-9 && Math.abs(b[1] - a[1]) < 1e-9) return [0, 0, 1];
  return [b[0] - a[0], b[1] - a[1], dz];
}

function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * ANALYTIC vertex normal: the ring tangent crossed with the length tangent,
 * oriented away from the station's own centre.
 *
 * The convex-body orientation rule is correct for every body this forge is
 * asked to build - none of them has an open pocket such as a pickup bed, whose
 * floor and inner walls lie outside the station centre and would be oriented
 * into the metal and culled to black. A pocket spec would have to carry a flat
 * face normal aimed at the cavity instead, and grow `classifyQuad` with it.
 */
function vertexNormal(
  rings: readonly Ring[],
  i: number,
  j: number,
  forwardOnly: boolean,
  backwardOnly: boolean,
): Vec3 {
  const ring = rings[i]!;
  const previous = ring.points[(j - 1 + RING_POINTS) % RING_POINTS]!;
  const next = ring.points[(j + 1) % RING_POINTS]!;
  const ringTangent: Vec3 = [next[0] - previous[0], next[1] - previous[1], 0];
  const along = lengthTangent(rings, i, j, forwardOnly, backwardOnly);
  let normal = cross(along, ringTangent);
  const point = ring.points[j]!;
  if (Math.hypot(normal[0], normal[1], normal[2]) < 1e-9) normal = [point[0], 0, 0];
  const centreY = (ring.yLow + ring.yTop) / 2;
  if (normal[0] * point[0] + normal[1] * (point[1] - centreY) < 0) {
    normal = [-normal[0], -normal[1], -normal[2]];
  }
  return normalise(normal);
}

export interface LoftResult {
  readonly rings: readonly Ring[];
  readonly body: THREE.BufferGeometry;
  readonly groove: THREE.BufferGeometry | null;
  readonly glass: THREE.BufferGeometry | null;
  readonly lining: THREE.BufferGeometry | null;
  readonly quadCounts: Readonly<Record<QuadKind, number>>;
}

function pushTriangle(
  sink: Sink,
  p: readonly Vec3[],
  n: readonly Vec3[],
  uv: readonly Vec2[],
  indices: readonly [number, number, number],
  flip: boolean,
): void {
  const order = flip ? ([indices[0], indices[2], indices[1]] as const) : indices;
  for (const index of order) {
    const position = p[index]!;
    const normal = n[index]!;
    const coordinate = uv[index]!;
    sink.position.push(position[0], position[1], position[2]);
    sink.normal.push(
      flip ? -normal[0] : normal[0],
      flip ? -normal[1] : normal[1],
      flip ? -normal[2] : normal[2],
    );
    sink.uv.push(coordinate[0], coordinate[1]);
  }
}

/** Winding follows the analytic normal, never a guess. */
function needsFlip(positions: readonly Vec3[], reference: Vec3): boolean {
  const a = positions[0]!;
  const b = positions[1]!;
  const c = positions[2]!;
  const face = cross(
    [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
  );
  return face[0] * reference[0] + face[1] * reference[1] + face[2] * reference[2] < 0;
}

/**
 * Loft a body through its station rings.
 *
 * Returns four buckets: the painted skin, the unlit shut-line floors, the
 * glass cut OUT of the skin, and an inside-out lining behind the glass. Panes
 * laid proud of a closed body are tinted reflections of a PAINTED surface and
 * read as opaque slabs; cutting them out of the loft and backing them with a
 * dark lining is what makes a window look like a hole.
 */
export function loftBody(spec: VehicleSpec): LoftResult {
  const stations = collectStations(spec);
  const rings = stations.map((z) => stationRing(spec, z));
  const body = emptySink();
  const groove = emptySink();
  const glass = emptySink();
  const lining = emptySink();
  const quadCounts: Record<QuadKind, number> = { body: 0, glass: 0, groove: 0 };
  const sinkFor = (kind: QuadKind): Sink => (kind === 'glass' ? glass : kind === 'groove' ? groove : body);

  let glassMinZ = Infinity;
  let glassMaxZ = -Infinity;

  for (let i = 0; i < rings.length - 1; i += 1) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    for (let j = 0; j < RING_POINTS; j += 1) {
      const j2 = (j + 1) % RING_POINTS;
      const kind = classifyQuad(spec, a, b, j);
      quadCounts[kind] += 1;
      if (kind === 'glass') {
        glassMinZ = Math.min(glassMinZ, a.z);
        glassMaxZ = Math.max(glassMaxZ, b.z);
      }
      const positions: Vec3[] = [
        [a.points[j]![0], a.points[j]![1], a.z],
        [a.points[j2]![0], a.points[j2]![1], a.z],
        [b.points[j2]![0], b.points[j2]![1], b.z],
        [b.points[j]![0], b.points[j]![1], b.z],
      ];
      const normals: Vec3[] = [
        vertexNormal(rings, i, j, a.crease, false),
        vertexNormal(rings, i, j2, a.crease, false),
        vertexNormal(rings, i + 1, j2, false, b.crease),
        vertexNormal(rings, i + 1, j, false, b.crease),
      ];
      const vHigh = j2 === 0 ? 1 : j2 / RING_POINTS;
      const uvs: Vec2[] = [
        [a.z / spec.length, j / RING_POINTS],
        [a.z / spec.length, vHigh],
        [b.z / spec.length, vHigh],
        [b.z / spec.length, j / RING_POINTS],
      ];
      const flip = needsFlip(positions, normals[0]!);
      const sink = sinkFor(kind);
      pushTriangle(sink, positions, normals, uvs, [0, 1, 2], flip);
      pushTriangle(sink, positions, normals, uvs, [0, 2, 3], flip);
    }
  }

  // End caps, built as a stack of HORIZONTAL SLICES between consecutive right-
  // half ring points, mirrored across the centre plane.
  //
  // Not a triangle fan, and the difference is the whole point. A fan cannot
  // express a band: classifying its triangles by height gives two wedges
  // meeting at the apex with a painted triangle between them, and a coach's
  // windscreen comes out as a bow tie. Slices give a real band. Their heights
  // are the RING'S OWN point heights and nothing else, so the cap's boundary is
  // exactly the polyline the side quads meet, with no T-junction - which is why
  // a `noseGlass` band snaps to those heights rather than cutting between them.
  for (const [index, sign] of [[0, -1], [rings.length - 1, 1]] as const) {
    const ring = rings[index]!;
    const nose = sign === -1 ? spec.noseGlass : undefined;
    const normal: Vec3 = [0, 0, sign];
    const emit = (corners: Vec3[], glazed: boolean): void => {
      const sink = glazed ? glass : body;
      const uvs: Vec2[] = corners.map((_, k) => [k / corners.length, 0.5] as Vec2);
      const flip = needsFlip(corners, normal);
      const normals: Vec3[] = corners.map(() => normal);
      pushTriangle(sink, corners, normals, uvs, [0, 1, 2], flip);
      if (corners.length === 4) pushTriangle(sink, corners, normals, uvs, [0, 2, 3], flip);
      if (glazed) quadCounts.glass += 1; else quadCounts.body += 1;
    };
    // The bottom and top edges are three ring points on one line (left, centre,
    // right). One zero-area triangle through the centre point keeps both of its
    // edges paired; without it the cap's single flat edge leaves the loft's two
    // unmatched and the body is no longer watertight.
    for (const [k, centre] of [[1, 0], [11, 12]] as const) {
      const a = ring.points[k]!;
      const c = ring.points[centre]!;
      const mirrored = ring.points[(RING_POINTS - k) % RING_POINTS]!;
      emit([[a[0], a[1], ring.z], [c[0], c[1], ring.z], [mirrored[0], mirrored[1], ring.z]], false);
    }
    for (let k = 1; k <= 10; k += 1) {
      const a = ring.points[k]!;
      const b = ring.points[k + 1]!;
      if (Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[0] - b[0]) < 1e-9) continue;
      const glazed = nose !== undefined
        && Math.min(a[1], b[1]) >= nose.yMin && Math.max(a[1], b[1]) <= nose.yMax;
      if (glazed) {
        glassMinZ = Math.min(glassMinZ, ring.z);
        glassMaxZ = Math.max(glassMaxZ, ring.z);
      }
      emit([
        [a[0], a[1], ring.z], [-a[0], a[1], ring.z], [-b[0], b[1], ring.z], [b[0], b[1], ring.z],
      ], glazed);
    }
  }

  // The cabin lining: the SAME loft, flipped inside out, inset so it cannot
  // z-fight the skin, over the glazed run only - so the only thing behind a
  // pane is a dark interior, and the only openings in the body are the panes.
  if (Number.isFinite(glassMinZ)) {
    const from = glassMinZ - 0.25;
    const to = glassMaxZ + 0.25;
    const liningInset = 0.035;
    // The lining is a BACKDROP, not a second body: it is only ever seen through
    // a pane, at a fixed 35 mm behind one, in a dark matte finish with no
    // silhouette of its own. It therefore takes every third station and only
    // the ring above the lower flank - the arch stations that make the outer
    // skin worth having buy nothing at all behind glass, and the underbody
    // quads are behind the floor. Full density here cost more triangles than
    // the body it hides inside.
    const spanned = rings.filter((ring) => ring.z >= from && ring.z <= to);
    const inner = spanned.filter((_, index) => index % 3 === 0 || index === spanned.length - 1);
    // Quads 6 to 17 - the greenhouse band, points 6 through 18, exactly
    // mirrored. It starts one point BELOW the belt so nothing shows past its
    // lower edge through a raked pane, and no lower: a lining that reaches the
    // sill spans both of the two authored boxes this body dresses, and then
    // NEITHER of their shot surfaces covers 60 % of its height range, so the
    // ballistic audit reports a car's own interior as unrated ghost cover.
    const LINING_FIRST_QUAD = 6;
    const LINING_LAST_QUAD = 17;
    for (let i = 0; i < inner.length - 1; i += 1) {
      const a = inner[i]!;
      const b = inner[i + 1]!;
      const na = ringNormals(a.points, (a.yLow + a.yTop) / 2);
      const nb = ringNormals(b.points, (b.yLow + b.yTop) / 2);
      const shrink = (ring: Ring, normals: readonly Vec2[], k: number): Vec3 => ([
        ring.points[k]![0] - normals[k]![0] * liningInset,
        ring.points[k]![1] - normals[k]![1] * liningInset,
        ring.z,
      ]);
      for (let j = LINING_FIRST_QUAD; j <= LINING_LAST_QUAD; j += 1) {
        const j2 = (j + 1) % RING_POINTS;
        const positions: Vec3[] = [shrink(a, na, j), shrink(a, na, j2), shrink(b, nb, j2), shrink(b, nb, j)];
        const inward: Vec3[] = [
          normalise([-na[j]![0], -na[j]![1], 0]),
          normalise([-na[j2]![0], -na[j2]![1], 0]),
          normalise([-nb[j2]![0], -nb[j2]![1], 0]),
          normalise([-nb[j]![0], -nb[j]![1], 0]),
        ];
        const uvs: Vec2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
        const flip = needsFlip(positions, inward[0]!);
        pushTriangle(lining, positions, inward, uvs, [0, 1, 2], flip);
        pushTriangle(lining, positions, inward, uvs, [0, 2, 3], flip);
      }
    }
  }

  return {
    rings,
    body: toGeometry(body, `${spec.id}-body`)!,
    groove: toGeometry(groove, `${spec.id}-groove`),
    glass: toGeometry(glass, `${spec.id}-glass`),
    lining: toGeometry(lining, `${spec.id}-lining`),
    quadCounts,
  };
}

/**
 * A revolve with ANALYTIC normals: a hard join above `smoothDegrees` between
 * adjacent profile segments, averaged below.
 *
 * A stock lathe averages normals across every profile step, so a stepped
 * chrome dish gets normals that rotate across each step and its reflection
 * swirls. Profiles run inboard -> outboard; reversing one turns the surface
 * inside out.
 */
export function latheGeometry(
  profile: readonly Vec2[],
  segments: number,
  smoothDegrees = 40,
): THREE.BufferGeometry {
  const sink = emptySink();
  const count = profile.length;
  const segmentNormals: Vec2[] = [];
  for (let k = 0; k < count - 1; k += 1) {
    const a = profile[k]!;
    const b = profile[k + 1]!;
    const dr = b[0] - a[0];
    const dh = b[1] - a[1];
    const length = Math.hypot(dr, dh) || 1;
    segmentNormals.push([dh / length, -dr / length] as const);
  }
  const cosLimit = Math.cos((smoothDegrees * Math.PI) / 180);
  const blend = (own: Vec2 | undefined, other: Vec2 | undefined): Vec2 => {
    if (!own) return other ?? ([1, 0] as const);
    if (!other) return own;
    if (own[0] * other[0] + own[1] * other[1] < cosLimit) return own;
    const sx = own[0] + other[0];
    const sy = own[1] + other[1];
    const length = Math.hypot(sx, sy) || 1;
    return [sx / length, sy / length] as const;
  };

  for (let k = 0; k < count - 1; k += 1) {
    const a = profile[k]!;
    const b = profile[k + 1]!;
    const nA = blend(segmentNormals[k], segmentNormals[k - 1]);
    const nB = blend(segmentNormals[k], segmentNormals[k + 1]);
    for (let s = 0; s < segments; s += 1) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      const at = (point: Vec2, normal: Vec2, theta: number): { p: Vec3; n: Vec3 } => ({
        p: [point[0] * Math.cos(theta), point[1], point[0] * Math.sin(theta)],
        n: normalise([normal[0] * Math.cos(theta), normal[1], normal[0] * Math.sin(theta)]),
      });
      const c0 = at(a, nA, t0);
      const c1 = at(a, nA, t1);
      const c2 = at(b, nB, t1);
      const c3 = at(b, nB, t0);
      const positions: Vec3[] = [c0.p, c1.p, c2.p, c3.p];
      const normals: Vec3[] = [c0.n, c1.n, c2.n, c3.n];
      const uvs: Vec2[] = [
        [s / segments, k / (count - 1)],
        [(s + 1) / segments, k / (count - 1)],
        [(s + 1) / segments, (k + 1) / (count - 1)],
        [s / segments, (k + 1) / (count - 1)],
      ];
      const flip = needsFlip(positions, normals[0]!);
      pushTriangle(sink, positions, normals, uvs, [0, 1, 2], flip);
      pushTriangle(sink, positions, normals, uvs, [0, 2, 3], flip);
    }
  }
  return toGeometry(sink, 'lathe')!;
}

/**
 * A bar with a chamfer rolled onto all four long edges, extruded along +x.
 *
 * NOTHING WITHIN REACH OF THE CAMERA IS A RAW BOX. A real bumper, grille
 * surround or moulding has a 0.5-3 mm radius on every edge, and that radius is
 * the only thing that catches a highlight along the length of the part. A raw
 * box gets one flat value per face and reads as a painted rectangle from two
 * metres away, which is where a player stands.
 */
export function chamferedBar(
  halfLength: number,
  halfHeight: number,
  halfDepth: number,
  chamfer: number,
): THREE.BufferGeometry {
  const c = Math.min(chamfer, halfHeight * 0.45, halfDepth * 0.45);
  // The cross-section in (y, z), counter-clockwise, chamfered at each corner.
  const section: Vec2[] = [
    [halfHeight - c, halfDepth], [c - halfHeight, halfDepth],
    [-halfHeight, halfDepth - c], [-halfHeight, c - halfDepth],
    [c - halfHeight, -halfDepth], [halfHeight - c, -halfDepth],
    [halfHeight, c - halfDepth], [halfHeight, halfDepth - c],
  ];
  const sink = emptySink();
  const count = section.length;
  for (let k = 0; k < count; k += 1) {
    const a = section[k]!;
    const b = section[(k + 1) % count]!;
    const dy = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dy, dz) || 1;
    const normal: Vec3 = [0, dz / length, -dy / length];
    const positions: Vec3[] = [
      [-halfLength, a[0], a[1]], [-halfLength, b[0], b[1]],
      [halfLength, b[0], b[1]], [halfLength, a[0], a[1]],
    ];
    const uvs: Vec2[] = [[0, k / count], [0, (k + 1) / count], [1, (k + 1) / count], [1, k / count]];
    const normals: Vec3[] = [normal, normal, normal, normal];
    const flip = needsFlip(positions, normal);
    pushTriangle(sink, positions, normals, uvs, [0, 1, 2], flip);
    pushTriangle(sink, positions, normals, uvs, [0, 2, 3], flip);
  }
  for (const [x, sign] of [[-halfLength, -1], [halfLength, 1]] as const) {
    const normal: Vec3 = [sign, 0, 0];
    for (let k = 0; k < count; k += 1) {
      const a = section[k]!;
      const b = section[(k + 1) % count]!;
      const positions: Vec3[] = [[x, 0, 0], [x, a[0], a[1]], [x, b[0], b[1]]];
      const uvs: Vec2[] = [[0.5, 0.5], [0.5, k / count], [0.5, (k + 1) / count]];
      pushTriangle(sink, positions, [normal, normal, normal], uvs, [0, 1, 2], needsFlip(positions, normal));
    }
  }
  return toGeometry(sink, 'chamfered-bar')!;
}

/**
 * A trim strip taken FROM THE SURFACE it sits on, station by station, on both
 * flanks.
 *
 * Trim follows the surface, not the feature it decorates. A drip rail sized
 * from the side-glass span floats where the roof starts 30 cm further forward;
 * a waist stripe sized from the overall length wraps the nose. Both extents
 * come from the loft's own edge points here, so neither can happen.
 */
/**
 * Where the flank crosses a given HEIGHT, and the outward normal there.
 *
 * A waistline is a level line at a fixed height, not a fixed ring index. Riding
 * an index makes the stripe climb every wheel arch - the lower flank points are
 * spaced as a fraction of the height remaining above the arch, so index 5 is at
 * 1.2 m between the wheels and at 1.6 m over one - and the result is a red band
 * that humps over each wheel like a decal applied by someone who never looked.
 */
function flankAtHeight(ring: Ring, y: number): { x: number; nx: number; ny: number } | null {
  const normals = ringNormals(ring.points, (ring.yLow + ring.yTop) / 2);
  for (let j = 1; j <= 8; j += 1) {
    const a = ring.points[j]!;
    const b = ring.points[j + 1]!;
    const low = Math.min(a[1], b[1]);
    const high = Math.max(a[1], b[1]);
    if (y < low || y > high) continue;
    const span = b[1] - a[1];
    const t = Math.abs(span) < 1e-9 ? 0 : (y - a[1]) / span;
    const na = normals[j]!;
    const nb = normals[j + 1]!;
    const nx = na[0] + (nb[0] - na[0]) * t;
    const ny = na[1] + (nb[1] - na[1]) * t;
    const length = Math.hypot(nx, ny) || 1;
    return { x: a[0] + (b[0] - a[0]) * t, nx: nx / length, ny: ny / length };
  }
  return null;
}

export function stripAtHeight(
  rings: readonly Ring[],
  y: number,
  z0: number,
  z1: number,
  height: number,
  proud: number,
): THREE.BufferGeometry | null {
  const sink = emptySink();
  const low = Math.min(z0, z1);
  const high = Math.max(z0, z1);
  const used = rings.filter((ring) => ring.z >= low && ring.z <= high);
  for (let i = 0; i < used.length - 1; i += 1) {
    const a = used[i]!;
    const b = used[i + 1]!;
    const hitA = flankAtHeight(a, y);
    const hitB = flankAtHeight(b, y);
    if (!hitA || !hitB) continue;
    for (const side of [1, -1] as const) {
      const pa: Vec2 = [hitA.x * side, y];
      const pb: Vec2 = [hitB.x * side, y];
      const normalA: Vec2 = [hitA.nx * side, hitA.ny];
      const normalB: Vec2 = [hitB.nx * side, hitB.ny];
      const positions: Vec3[] = [
        [pa[0] + normalA[0] * proud, pa[1] + normalA[1] * proud + height / 2, a.z],
        [pa[0] + normalA[0] * proud, pa[1] + normalA[1] * proud - height / 2, a.z],
        [pb[0] + normalB[0] * proud, pb[1] + normalB[1] * proud - height / 2, b.z],
        [pb[0] + normalB[0] * proud, pb[1] + normalB[1] * proud + height / 2, b.z],
      ];
      const nA3 = normalise([normalA[0], normalA[1], 0]);
      const nB3 = normalise([normalB[0], normalB[1], 0]);
      const normals: Vec3[] = [nA3, nA3, nB3, nB3];
      const uvs: Vec2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
      const flip = needsFlip(positions, normals[0]!);
      pushTriangle(sink, positions, normals, uvs, [0, 1, 2], flip);
      pushTriangle(sink, positions, normals, uvs, [0, 2, 3], flip);
    }
  }
  return toGeometry(sink, 'strip');
}
/**
 * A longitudinal roof rail: one closed bar riding the crowned roof surface at
 * the signed plan offset xOffset from z0 to z1 (the caller loops the pair).
 * The base samples crownSurfaceY station by station (the same surface the
 * rings loft), sunk 8 mm so the bar beds into the skin instead of floating
 * on it, and the bar is 45 mm tall - a drip-rail read, not a luggage rack.
 * Faces are top, both flanks and both end caps; the buried bottom is skipped.
 * Returns null when fewer than two rings fall in the span.
 */
export function roofRail(
  spec: VehicleSpec,
  rings: readonly Ring[],
  xOffset: number,
  z0: number,
  z1: number,
  halfWidth: number,
  height: number,
): THREE.BufferGeometry | null {
  const BED_M = 0.008;
  const low = Math.min(z0, z1);
  const high = Math.max(z0, z1);
  const used = rings.filter((ring) => ring.z >= low && ring.z <= high);
  if (used.length < 2) return null;
  const sink = emptySink();
  const quad = (positions: Vec3[], normal: Vec3, u: number): void => {
    const normals: Vec3[] = [normal, normal, normal, normal];
    const uvs: Vec2[] = [[u, 0], [u, 1], [u + 1, 1], [u + 1, 0]];
    const flip = needsFlip(positions, normal);
    pushTriangle(sink, positions, normals, uvs, [0, 1, 2], flip);
    pushTriangle(sink, positions, normals, uvs, [0, 2, 3], flip);
  };
  // One bar at the signed plan offset; the caller loops the pair. Both sides
  // sample |xOffset| for the surface height, so a mirrored pair beds evenly.
  const x = xOffset;
  {
    for (let i = 0; i < used.length - 1; i += 1) {
      const a = used[i]!;
      const b = used[i + 1]!;
      const yA = crownSurfaceY(spec, a.z, xOffset) - BED_M;
      const yB = crownSurfaceY(spec, b.z, xOffset) - BED_M;
      const slope = (yB - yA) / Math.max(1e-6, b.z - a.z);
      const topNormal = normalise([0, 1, -slope]);
      // Top face.
      quad([
        [x - halfWidth, yA + height, a.z],
        [x + halfWidth, yA + height, a.z],
        [x + halfWidth, yB + height, b.z],
        [x - halfWidth, yB + height, b.z],
      ], topNormal, i);
      // Flank faces, outward (+x) and inward (-x).
      quad([
        [x + halfWidth, yA, a.z],
        [x + halfWidth, yA + height, a.z],
        [x + halfWidth, yB + height, b.z],
        [x + halfWidth, yB, b.z],
      ], [1, 0, 0], i);
      quad([
        [x - halfWidth, yA + height, a.z],
        [x - halfWidth, yA, a.z],
        [x - halfWidth, yB, b.z],
        [x - halfWidth, yB + height, b.z],
      ], [-1, 0, 0], i);
      // End caps on the first and last intervals.
      if (i === 0) {
        quad([
          [x - halfWidth, yA, a.z],
          [x + halfWidth, yA, a.z],
          [x + halfWidth, yA + height, a.z],
          [x - halfWidth, yA + height, a.z],
        ], [0, 0, -1], i);
      }
      if (i === used.length - 2) {
        quad([
          [x + halfWidth, yB, b.z],
          [x - halfWidth, yB, b.z],
          [x - halfWidth, yB + height, b.z],
          [x + halfWidth, yB + height, b.z],
        ], [0, 0, 1], i);
      }
    }
  }
  return toGeometry(sink, 'roof-rail');
}

/**
 * A broad two-tone panel clipped to the loft's own side surface.
 *
 * This is deliberately a second loft operation, not a flat decal: each patch
 * borrows the same flank points and analytic normals as the body, and glass
 * quads are skipped.  That keeps a coach's maroon upper shell off its window
 * band while preserving the exact rounded silhouette and the body envelope.
 */
export function surfaceBandAtHeights(
  spec: VehicleSpec,
  rings: readonly Ring[],
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  proud: number,
): THREE.BufferGeometry | null {
  const sink = emptySink();
  const lowY = Math.min(y0, y1);
  const highY = Math.max(y0, y1);
  const lowZ = Math.min(z0, z1);
  const highZ = Math.max(z0, z1);
  const used = rings.filter((ring) => ring.z >= lowZ && ring.z <= highZ);
  const edgeSlice = (ring: Ring, j: number, low: number, high: number): [Vec3, Vec3, Vec3, Vec3] | null => {
    const a = ring.points[j]!;
    const b = ring.points[(j + 1) % RING_POINTS]!;
    const edgeLow = Math.min(a[1], b[1]);
    const edgeHigh = Math.max(a[1], b[1]);
    const from = Math.max(low, edgeLow);
    const to = Math.min(high, edgeHigh);
    if (to - from < 1e-6) return null;
    const normals = ringNormals(ring.points, (ring.yLow + ring.yTop) / 2);
    const at = (y: number): [Vec3, Vec3] => {
      const span = b[1] - a[1];
      const t = Math.abs(span) < 1e-9 ? 0 : (y - a[1]) / span;
      const na = normals[j]!;
      const nb = normals[(j + 1) % RING_POINTS]!;
      const nx = na[0] + (nb[0] - na[0]) * t;
      const ny = na[1] + (nb[1] - na[1]) * t;
      const length = Math.hypot(nx, ny) || 1;
      return [[a[0] + (b[0] - a[0]) * t, y, ring.z], [nx / length, ny / length, 0]];
    };
    const [pa, na] = at(from);
    const [pb, nb] = at(to);
    return [pa, pb, na, nb];
  };

  for (let i = 0; i < used.length - 1; i += 1) {
    const a = used[i]!;
    const b = used[i + 1]!;
    // The right flank is 1..8; its mirror is 15..22.  Top-arc quads stay
    // painted so the band has a real roof rail instead of climbing over it.
    for (const j of [...Array.from({ length: 8 }, (_, k) => k + 1), ...Array.from({ length: 8 }, (_, k) => k + 15)]) {
      if (classifyQuad(spec, a, b, j) !== 'body') continue;
      const sliceA = edgeSlice(a, j, lowY, highY);
      const sliceB = edgeSlice(b, j, lowY, highY);
      if (!sliceA || !sliceB) continue;
      const [aLow, aHigh, aNormal, aHighNormal] = sliceA;
      const [bLow, bHigh, bNormal, bHighNormal] = sliceB;
      const positions: Vec3[] = [
        [aLow[0] + aNormal[0] * proud, aLow[1] + aNormal[1] * proud, aLow[2]],
        [aHigh[0] + aHighNormal[0] * proud, aHigh[1] + aHighNormal[1] * proud, aHigh[2]],
        [bHigh[0] + bHighNormal[0] * proud, bHigh[1] + bHighNormal[1] * proud, bHigh[2]],
        [bLow[0] + bNormal[0] * proud, bLow[1] + bNormal[1] * proud, bLow[2]],
      ];
      const normals: Vec3[] = [aNormal, aHighNormal, bHighNormal, bNormal];
      const uvs: Vec2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
      const flip = needsFlip(positions, normals[0]!);
      pushTriangle(sink, positions, normals, uvs, [0, 1, 2], flip);
      pushTriangle(sink, positions, normals, uvs, [0, 2, 3], flip);
    }
  }
  return toGeometry(sink, 'surface-band');
}
