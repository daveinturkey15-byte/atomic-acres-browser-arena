import {
  CARPET_BOMBER_DEFAULT_RUN_LENGTH_M,
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  CARPET_BOMBER_MIN_RUN_LENGTH_M,
  type SupportVec3,
} from './killstreak-runtime';

/**
 * HF-317 (owner: "carpet bomb is still like carepackage not tri pass as
 * requested? fix it" — the corridor flow was reaffirmed twice, superseding the
 * earlier frozen crosshair presentation): Carpet Bomber targeting is a
 * two-point bombing corridor picked on the tactical map, mirroring the
 * Tri-Pass map flow in field-support.ts. The derived intent feeds the
 * corridor-native host runtime through the existing anchor + facing
 * activation-intent shape — zero protocol changes.
 */
export type CarpetCorridorPoint = Readonly<{ x: number; z: number }>;
export type CarpetCorridorBounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
export type CarpetCorridorTargeting = Readonly<{
  points: readonly CarpetCorridorPoint[];
  complete: boolean;
}>;

export const CARPET_CORRIDOR_POINT_COUNT = 2;

/**
 * Corridor state and intent derived from the run's start and end map clicks.
 * `facing` is deliberately UNNORMALIZED: its direction is the run heading and
 * its magnitude is the requested run length in metres, exactly what the host
 * clamps in carpetImpactPattern. `anchor` Y is never authoritative — the host
 * re-derives the surface height at the anchor.
 */
export type CarpetCorridorIntent = Readonly<{
  anchor: SupportVec3;
  facing: SupportVec3;
  lengthM: number;
}>;

export function createCarpetCorridorTargeting(): CarpetCorridorTargeting {
  return { points: [], complete: false };
}

/**
 * Registers one tactical-map click. Non-finite points are rejected; finite
 * points are clamped into the tactical-map bounds (unlike Tri-Pass's reject,
 * a run end dragged just past the map edge still authors a legal corridor —
 * silently ignoring the second click would strand the two-point flow).
 */
export function registerCarpetCorridorPoint(
  state: CarpetCorridorTargeting,
  point: CarpetCorridorPoint,
  bounds: CarpetCorridorBounds,
): CarpetCorridorTargeting {
  if (state.complete || state.points.length >= CARPET_CORRIDOR_POINT_COUNT) return state;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)
    || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)
    || !Number.isFinite(bounds.minZ) || !Number.isFinite(bounds.maxZ)
    || bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) return state;
  const points = [...state.points, {
    x: Math.min(bounds.maxX, Math.max(bounds.minX, point.x)),
    z: Math.min(bounds.maxZ, Math.max(bounds.minZ, point.z)),
  }];
  return { points, complete: points.length === CARPET_CORRIDOR_POINT_COUNT };
}

/**
 * Derives the activation intent from a complete corridor: anchor = midpoint,
 * facing = (end - start) with magnitude clamped to the host's admitted run
 * lengths so the preview always matches what the host will fly. A degenerate
 * same-point pick still authors a runnable minimum-length run whose heading
 * deterministically falls back to +X east. Returns null while incomplete.
 */
export function carpetCorridorIntent(state: CarpetCorridorTargeting): CarpetCorridorIntent | null {
  if (!state.complete || state.points.length !== CARPET_CORRIDOR_POINT_COUNT) return null;
  const [start, end] = state.points;
  const rawDx = end.x - start.x;
  const rawDz = end.z - start.z;
  const rawLength = Math.hypot(rawDx, rawDz);
  const lengthM = Math.min(
    CARPET_BOMBER_MAX_RUN_LENGTH_M,
    Math.max(CARPET_BOMBER_MIN_RUN_LENGTH_M, rawLength),
  );
  const direction: readonly [number, number] = rawLength > 0
    ? [rawDx / rawLength, rawDz / rawLength]
    : [1, 0];
  return Object.freeze({
    anchor: Object.freeze([(start.x + end.x) / 2, 0, (start.z + end.z) / 2] as const),
    facing: Object.freeze([direction[0] * lengthM, 0, direction[1] * lengthM] as const),
    lengthM,
  });
}

/** Re-exported so the tactical-map preview shares the host's exact clamps. */
export {
  CARPET_BOMBER_DEFAULT_RUN_LENGTH_M,
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  CARPET_BOMBER_MIN_RUN_LENGTH_M,
};
