type Vector3Tuple = readonly [number, number, number];

export type FlyingCatPose = Readonly<{
  position: Vector3Tuple;
  yawRadians: number;
  pitchRadians: number;
  rollRadians: number;
  pathProgress: number;
  tailPhase: number;
  trailPhase: number;
}>;

export const FLYING_CAT_PATH_DURATION_MS = 20_000;

const FLYING_CAT_PATH = Object.freeze([
  [10.5, 3.8, -18], [8.2, 4.45, -28.5], [0.5, 4.15, -36], [-8.8, 3.55, -31],
  [-11.2, 4.2, -20], [-6.2, 3.35, -12.2], [2.8, 3.95, -10.4], [9.5, 4.5, -14.2],
] as const);

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function catmullRom(from: number, start: number, end: number, to: number, progress: number): number {
  const progress2 = progress * progress;
  const progress3 = progress2 * progress;
  return 0.5 * (
    2 * start
    + (-from + end) * progress
    + (2 * from - 5 * start + 4 * end - to) * progress2
    + (-from + 3 * start - 3 * end + to) * progress3
  );
}

function closedSpline(progress: number): Vector3Tuple {
  const scaled = wrapUnit(progress) * FLYING_CAT_PATH.length;
  const index = Math.floor(scaled) % FLYING_CAT_PATH.length;
  const local = scaled - Math.floor(scaled);
  const before = FLYING_CAT_PATH[(index - 1 + FLYING_CAT_PATH.length) % FLYING_CAT_PATH.length]!;
  const start = FLYING_CAT_PATH[index]!;
  const end = FLYING_CAT_PATH[(index + 1) % FLYING_CAT_PATH.length]!;
  const after = FLYING_CAT_PATH[(index + 2) % FLYING_CAT_PATH.length]!;
  return [
    catmullRom(before[0], start[0], end[0], after[0], local),
    catmullRom(before[1], start[1], end[1], after[1], local),
    catmullRom(before[2], start[2], end[2], after[2], local),
  ];
}

/**
 * A deterministic, closed, broad figure-eight-like patrol. It keeps the bonus
 * target in the live-fire volume while adding readable climbs, dives and banks.
 */
export function flyingCatPose(elapsedMs: number): FlyingCatPose {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const pathProgress = wrapUnit(elapsed / FLYING_CAT_PATH_DURATION_MS);
  const position = closedSpline(pathProgress);
  const lookAhead = closedSpline(pathProgress + 0.0015);
  const dx = lookAhead[0] - position[0];
  const dy = lookAhead[1] - position[1];
  const dz = lookAhead[2] - position[2];
  const horizontal = Math.max(0.000_001, Math.hypot(dx, dz));
  const celebratoryBeat = Math.sin(pathProgress * Math.PI * 4);
  return Object.freeze({
    position,
    // The authored cat faces local -Z (head) with its tail/trail on +Z.
    // Align -Z, rather than +Z, with the path tangent so it never flies tail-first.
    yawRadians: Math.atan2(-dx, -dz),
    pitchRadians: Math.atan2(dy, horizontal),
    rollRadians: Math.sin(pathProgress * Math.PI * 2) * 0.11 + celebratoryBeat * 0.025,
    pathProgress,
    tailPhase: pathProgress * Math.PI * 10,
    trailPhase: pathProgress * Math.PI * 16,
  });
}
