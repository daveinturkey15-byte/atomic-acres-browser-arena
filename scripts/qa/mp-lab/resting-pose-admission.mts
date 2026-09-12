// MP-LAB: is a legal wall-hugging pose admissible? Executable arithmetic, not a
// story in a report.
//
// The bug this lane fixed (e6150446) was a margin mismatch: movement authority
// is a Rapier capsule (src/physics.ts) against boundary walls whose inner faces
// ARE arena.bounds, so a resting centre sits exactly `radius` inside the bounds;
// admission demanded 0.44 m and dropped that legal pose. This script asks the
// REAL src/collision.ts `pointInsideBounds` and the REAL src/physics.ts radii
// the same question for every stance, at every margin a caller in
// src/legacy-main.ts uses, so a contract test can assert the answer instead of
// quoting a measurement someone typed.
//
//   node node_modules/tsx/dist/cli.mjs scripts/qa/mp-lab/resting-pose-admission.mts --print
import { pointInsideBounds } from '../../../src/collision';
import { CHARACTER_PHYSICS_CONFIG, STANCE_SHAPES } from '../../../src/physics';

/** A synthetic arena box. Only the distance from a face matters here. */
const BOUNDS = { minX: -37, maxX: 37, minZ: -20, maxZ: 20 } as const;

export type RestingPoseRow = Readonly<{
  stance: string;
  radius: number;
  /** The pose a resting capsule holds against the +X wall: centre = maxX - radius. */
  restingX: number;
  admittedAtMargin: Readonly<Record<string, boolean>>;
}>;

export type RestingPoseReport = Readonly<{
  bounds: typeof BOUNDS;
  margins: number[];
  smallestRadius: number;
  rows: RestingPoseRow[];
  /** A pose genuinely outside the world, to show a 0 margin still rejects something. */
  outsideWorld: Readonly<{ x: number; admittedAtZeroMargin: boolean }>;
}>;

export function restingPoseAdmission(margins: number[]): RestingPoseReport {
  const radii = new Map<string, number>([['stand', CHARACTER_PHYSICS_CONFIG.playerRadius]]);
  for (const [stance, shape] of Object.entries(STANCE_SHAPES)) radii.set(stance, shape.radius);
  const rows: RestingPoseRow[] = [...radii].map(([stance, radius]) => {
    const restingX = BOUNDS.maxX - radius;
    const admittedAtMargin: Record<string, boolean> = {};
    for (const margin of margins) {
      admittedAtMargin[String(margin)] = pointInsideBounds({ x: restingX, y: 1.73, z: 0 }, BOUNDS, margin);
    }
    return { stance, radius, restingX, admittedAtMargin };
  });
  const outsideX = BOUNDS.maxX + 0.01;
  return {
    bounds: BOUNDS,
    margins,
    smallestRadius: Math.min(...radii.values()),
    rows,
    outsideWorld: { x: outsideX, admittedAtZeroMargin: pointInsideBounds({ x: outsideX, y: 1.73, z: 0 }, BOUNDS, 0) },
  };
}

if (process.argv.includes('--print')) {
  const index = process.argv.indexOf('--margins');
  const margins = index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1].split(',').map(Number)
    : [0, 0.44];
  process.stdout.write(`${JSON.stringify(restingPoseAdmission(margins))}\n`);
}
