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
 * HF-369 (owner: "should be clearer that the 2nd click of the carpet bomb is
 * for its direction"). The two clicks are not interchangeable and the flow gave
 * no sign of that: click one plants the DROP pin, click two sets the run
 * DIRECTION. Naming the stage here — rather than having every caller re-derive
 * it from `points.length` — is what lets the tactical map, the prompt copy and
 * the tests all agree on which click the player is on.
 */
export type CarpetCorridorStage = 'drop' | 'direction' | 'complete';

/** 1-based step the next click will fill; `complete` reports the final step. */
export function carpetCorridorStage(state: CarpetCorridorTargeting): CarpetCorridorStage {
  if (state.complete || state.points.length >= CARPET_CORRIDOR_POINT_COUNT) return 'complete';
  return state.points.length === 0 ? 'drop' : 'direction';
}

/** The drop pin once it exists — the pivot every direction preview is drawn from. */
export function carpetCorridorDropPoint(state: CarpetCorridorTargeting): CarpetCorridorPoint | null {
  return state.points[0] ?? null;
}

/**
 * The run the HOST will actually fly, in world metres.
 *
 * This is the second half of HF-369, and the less obvious half: the picked
 * points are *not* the run. `lengthM` is clamped to the host's admitted band,
 * so a 120 m drag flies a 60 m run and a 3 m nudge flies a 20 m run — both
 * re-centred on the midpoint of the pick. Drawing the raw pick as the corridor
 * therefore promises bombs where none land. `start`/`end` here are the clamped
 * run's real ends, so a preview drawn from them cannot lie.
 */
export type CarpetCorridorRun = Readonly<{
  /** Midpoint of the pick; the host re-derives surface height at this point. */
  anchor: CarpetCorridorPoint;
  start: CarpetCorridorPoint;
  end: CarpetCorridorPoint;
  /** Run heading in radians, atan2(dz, dx); +X east when the pick is degenerate. */
  headingRadians: number;
  /** Host-admitted run length actually flown. */
  lengthM: number;
  /** Distance between the two picked points, before clamping. */
  requestedLengthM: number;
  /** How the pick was corrected, so the map can say so instead of silently lying. */
  clamp: 'shortened' | 'extended' | null;
}>;

/**
 * Pure two-point corridor solve shared by the committed intent and by the live
 * map preview, so the preview can never drift from what is dispatched.
 */
export function carpetCorridorRunFromPoints(
  start: CarpetCorridorPoint,
  end: CarpetCorridorPoint,
): CarpetCorridorRun {
  const rawDx = end.x - start.x;
  const rawDz = end.z - start.z;
  const requestedLengthM = Math.hypot(rawDx, rawDz);
  const lengthM = Math.min(
    CARPET_BOMBER_MAX_RUN_LENGTH_M,
    Math.max(CARPET_BOMBER_MIN_RUN_LENGTH_M, requestedLengthM),
  );
  const [dirX, dirZ] = requestedLengthM > 0
    ? [rawDx / requestedLengthM, rawDz / requestedLengthM]
    : [1, 0];
  const anchor = Object.freeze({ x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 });
  const half = lengthM / 2;
  return Object.freeze({
    anchor,
    start: Object.freeze({ x: anchor.x - dirX * half, z: anchor.z - dirZ * half }),
    end: Object.freeze({ x: anchor.x + dirX * half, z: anchor.z + dirZ * half }),
    headingRadians: Math.atan2(dirZ, dirX),
    lengthM,
    requestedLengthM,
    clamp: requestedLengthM > CARPET_BOMBER_MAX_RUN_LENGTH_M
      ? 'shortened'
      : requestedLengthM < CARPET_BOMBER_MIN_RUN_LENGTH_M ? 'extended' : null,
  });
}

/** The flown run for a complete corridor; null while the pick is unfinished. */
export function carpetCorridorRun(state: CarpetCorridorTargeting): CarpetCorridorRun | null {
  if (!state.complete || state.points.length !== CARPET_CORRIDOR_POINT_COUNT) return null;
  return carpetCorridorRunFromPoints(state.points[0]!, state.points[1]!);
}

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
  const run = carpetCorridorRun(state);
  if (!run) return null;
  return Object.freeze({
    anchor: Object.freeze([run.anchor.x, 0, run.anchor.z] as const),
    // The clamped run's own span, so `facing` needs no trig round-trip and is
    // exactly the vector the preview draws.
    facing: Object.freeze([run.end.x - run.start.x, 0, run.end.z - run.start.z] as const),
    lengthM: run.lengthM,
  });
}

/** Re-exported so the tactical-map preview shares the host's exact clamps. */
export {
  CARPET_BOMBER_DEFAULT_RUN_LENGTH_M,
  CARPET_BOMBER_MAX_RUN_LENGTH_M,
  CARPET_BOMBER_MIN_RUN_LENGTH_M,
};
