/**
 * HF-536 facade ELEVATION assembly.
 *
 * One wall face described as data - an along-extent, a height, the openings
 * cut through it and a style - composed into the facade kit's parts, grouped
 * by the PROP each group belongs to, for the arena's own emit helper. Nothing
 * here constructs a material, a mesh or a collider; the assembly only calls
 * `lapSidingParts`, `windowRevealParts` and `panelDoorParts` and translates
 * their output into place, so a wall's geometry is never copied by hand.
 *
 * FRAME. `extent` and every opening's `along` share the anchor's along axis
 * (x for z-facing walls, z for x-facing walls - `place()` in `facade.ts`).
 * `up` is metres above the anchor; `out` is the outward normal, with the
 * anchor on the wall's OUTER face. A consumer that anchors at along = 0 can
 * therefore pass its authored wall coordinates unchanged.
 *
 * WHAT IS EMITTED, per opening kind and style:
 *  - piers (the wall between openings) get lap courses, the elevation's
 *    `sidingRole`, pitch and course offset;
 *  - windows get four reveal liners inside the wall (`windowReveals`);
 *  - a door gets `bare` nothing, `parked-leaf` a panelled leaf standing flat
 *    beside the opening (a doorway is a route, so the leaf is never hung in
 *    it), or `sectional-head` a band of short courses over the head - the
 *    parked sectional door of a vehicle bay.
 */
import {
  type FacadeFacing,
  type FacadePart,
  type FacadePartRole,
  facadeOffset,
  lapSidingParts,
  panelDoorParts,
  windowRevealParts,
} from './facade';

export type FacadeOpeningKind = 'window' | 'door';

export interface FacadeOpening {
  readonly kind: FacadeOpeningKind;
  /** [start, end] on the anchor's along axis, metres. */
  readonly along: readonly [number, number];
  /** Sill height above the anchor, metres. Doors default to 0. */
  readonly sill?: number;
  /** Head height above the anchor, metres. */
  readonly head: number;
  /** Prop id for this opening's group, when the default scheme is not wanted. */
  readonly prop?: string;
}

export type FacadeDoorTreatment = 'bare' | 'parked-leaf' | 'sectional-head';

export interface FacadeStyle {
  /** Role every pier board asks its arena for. Default `siding`. */
  readonly sidingRole?: FacadePartRole;
  /** Pier lap backing; does not affect window liners or door treatment. */
  readonly jointRole?: FacadePartRole;
  readonly courseHeight?: number;
  readonly courseOffset?: number;
  /** Line each window opening with reveal liners. Default true. */
  readonly windowReveals?: boolean;
  /** What a door opening receives. Default `bare`. */
  readonly door?: FacadeDoorTreatment;
  /** Parked-leaf role and thickness. Defaults `panel`, `FACADE_LEAF_T`. */
  readonly leafRole?: FacadePartRole;
  readonly leafThickness?: number;
  /** Clear gap between the opening and the parked leaf, metres. */
  readonly leafGap?: number;
  /** Course pitch of a sectional head band, metres. */
  readonly headCourseHeight?: number;
}

export interface FacadeElevationOptions {
  /** Prefix of every group's prop id, e.g. `house front`. */
  readonly id: string;
  /** [start, end] of the sided wall on the anchor's along axis, metres. */
  readonly extent: readonly [number, number];
  /** Height of the storey band the courses fill, metres. */
  readonly height: number;
  readonly facing: FacadeFacing;
  /** Thickness of the wall the openings are cut through, metres. */
  readonly wallThickness: number;
  readonly openings?: readonly FacadeOpening[];
  readonly style?: FacadeStyle;
}

/** One prop's worth of parts. The arena emits each group under `prop`. */
export interface FacadeElevationGroup {
  readonly prop: string;
  readonly parts: readonly FacadePart[];
}

/** A parked leaf stops this far below the opening head, metres. */
export const FACADE_LEAF_HEAD_CLEARANCE = 0.05;
/** Clear gap between a door opening and its parked leaf, metres. */
export const FACADE_LEAF_PARK_GAP = 0.10;
/** Course pitch of a sectional door's head band, metres (200 mm panels). */
export const FACADE_SECTIONAL_COURSE_H = 0.20;
/**
 * Default parked-leaf thickness, metres. `panelDoorParts` alone defaults to
 * 50 mm, but its rails stand 13 mm proud of the leaf face, so a 50 mm leaf
 * would break the elevation's `FACADE_MAX_PROUD` promise; 30 mm keeps the
 * whole leaf at 43 mm proud, as the house front has always authored it.
 */
export const FACADE_LEAF_T = 0.03;

const DOOR_TREATMENTS: ReadonlySet<string> = new Set(['bare', 'parked-leaf', 'sectional-head']);

const isFinitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Round to a micrometre so a derived height never drifts a course count. */
const snap = (value: number): number => Math.round(value * 1e6) / 1e6;

function translate(
  parts: readonly FacadePart[],
  facing: FacadeFacing,
  along: number, up: number, out: number,
): FacadePart[] {
  const [dx, dy, dz] = facadeOffset(facing, along, up, out);
  return parts.map((part) => ({
    ...part,
    offset: [part.offset[0] + dx, part.offset[1] + dy, part.offset[2] + dz] as const,
  }));
}

function validate(options: FacadeElevationOptions): readonly FacadeOpening[] {
  const { id, extent, height, wallThickness, style = {} } = options;
  if (typeof id !== 'string' || id.trim() === '') throw new Error('facadeElevationParts id must be a non-empty string');
  if (!isFiniteNumber(extent?.[0]) || !isFiniteNumber(extent?.[1]) || !(extent[1] > extent[0])) {
    throw new Error('facadeElevationParts extent must be a finite ascending [start, end]');
  }
  if (!isFinitePositive(height)) throw new Error('facadeElevationParts height must be positive');
  if (!isFinitePositive(wallThickness)) throw new Error('facadeElevationParts wallThickness must be positive');
  if (style.courseHeight !== undefined && !isFinitePositive(style.courseHeight)) {
    throw new Error('facadeElevationParts courseHeight must be positive');
  }
  if (style.headCourseHeight !== undefined && !isFinitePositive(style.headCourseHeight)) {
    throw new Error('facadeElevationParts headCourseHeight must be positive');
  }
  if (style.leafThickness !== undefined && !isFinitePositive(style.leafThickness)) {
    throw new Error('facadeElevationParts leafThickness must be positive');
  }
  if (style.leafGap !== undefined && (!isFiniteNumber(style.leafGap) || style.leafGap < 0)) {
    throw new Error('facadeElevationParts leafGap must be finite and not negative');
  }
  if (style.door !== undefined && !DOOR_TREATMENTS.has(style.door)) {
    throw new Error(`facadeElevationParts door treatment '${String(style.door)}' is not bare, parked-leaf or sectional-head`);
  }
  const openings = [...(options.openings ?? [])].sort((a, b) => a.along[0] - b.along[0]);
  let cursor = extent[0];
  for (const opening of openings) {
    const [a0, a1] = opening.along;
    const sill = opening.sill ?? 0;
    if (opening.kind !== 'window' && opening.kind !== 'door') {
      throw new Error(`facadeElevationParts opening kind '${String(opening.kind)}' is not window or door`);
    }
    if (!isFiniteNumber(a0) || !isFiniteNumber(a1) || !(a1 > a0)) {
      throw new Error('facadeElevationParts opening along must be a finite ascending [start, end]');
    }
    if (a0 < extent[0] - 1e-9 || a1 > extent[1] + 1e-9) {
      throw new Error(`facadeElevationParts opening [${a0}, ${a1}] lies outside the extent [${extent[0]}, ${extent[1]}]`);
    }
    if (a0 < cursor - 1e-9) throw new Error(`facadeElevationParts opening starting at ${a0} overlaps the one before it`);
    if (!isFiniteNumber(sill) || sill < 0 || !isFiniteNumber(opening.head) || !(opening.head > sill) || opening.head > height + 1e-9) {
      throw new Error('facadeElevationParts opening needs 0 <= sill < head <= height');
    }
    cursor = a1;
  }
  return openings;
}

/**
 * Compose one elevation. Deterministic: the same options give the same parts
 * in the same order, whatever order the openings were listed in.
 */
export function facadeElevationParts(options: FacadeElevationOptions): FacadeElevationGroup[] {
  const openings = validate(options);
  const { id, extent, height, facing, wallThickness } = options;
  const style = options.style ?? {};
  const sidingRole = style.sidingRole ?? 'siding';
  const doorTreatment = style.door ?? 'bare';
  const groups: FacadeElevationGroup[] = [];

  // Piers: the wall left standing between the openings, in along order.
  let pierIndex = 0;
  let cursor = extent[0];
  const pier = (from: number, to: number): void => {
    const run = to - from;
    if (run <= 0) return;
    groups.push({
      prop: `${id} siding ${pierIndex}`,
      parts: translate(lapSidingParts({
        run, height, facing, role: sidingRole, jointRole: style.jointRole,
        courseHeight: style.courseHeight, courseOffset: style.courseOffset,
      }), facing, (from + to) / 2, 0, 0),
    });
    pierIndex += 1;
  };
  for (const opening of openings) {
    pier(cursor, opening.along[0]);
    cursor = opening.along[1];
  }
  pier(cursor, extent[1]);

  // Openings, in along order.
  let windowIndex = 0;
  let doorIndex = 0;
  for (const opening of openings) {
    const [a0, a1] = opening.along;
    const width = a1 - a0;
    const sill = opening.sill ?? 0;
    if (opening.kind === 'window') {
      const index = windowIndex;
      windowIndex += 1;
      if (style.windowReveals === false) continue;
      groups.push({
        prop: opening.prop ?? `${id} window reveal ${index}`,
        parts: translate(
          windowRevealParts({ width, height: snap(opening.head - sill), facing, wallThickness }),
          facing, (a0 + a1) / 2, (sill + opening.head) / 2, -wallThickness / 2,
        ),
      });
      continue;
    }
    const suffix = doorIndex === 0 ? '' : ` ${doorIndex}`;
    doorIndex += 1;
    if (doorTreatment === 'parked-leaf') {
      const gap = style.leafGap ?? FACADE_LEAF_PARK_GAP;
      const parkedEnd = a1 + gap + width;
      if (parkedEnd > extent[1] + 1e-9) {
        throw new Error(`facadeElevationParts parked leaf for the door at [${a0}, ${a1}] would end at ${parkedEnd}, past the extent`);
      }
      groups.push({
        prop: opening.prop ?? `${id} door leaf${suffix}`,
        parts: translate(panelDoorParts({
          width, height: snap(opening.head - FACADE_LEAF_HEAD_CLEARANCE), facing,
          thickness: style.leafThickness ?? FACADE_LEAF_T, role: style.leafRole,
        }), facing, a1 + width / 2 + gap, 0, 0),
      });
    } else if (doorTreatment === 'sectional-head') {
      groups.push({
        prop: opening.prop ?? `${id} door head${suffix}`,
        parts: translate(lapSidingParts({
          run: width, height: snap(height - opening.head), facing, role: 'panel',
          courseHeight: style.headCourseHeight ?? FACADE_SECTIONAL_COURSE_H,
        }), facing, (a0 + a1) / 2, opening.head, 0),
      });
    }
  }
  return groups;
}

/** Every part of every group, flattened, for budget and bounds checks. */
export function facadeElevationFlatParts(groups: readonly FacadeElevationGroup[]): FacadePart[] {
  return groups.flatMap((group) => [...group.parts]);
}
