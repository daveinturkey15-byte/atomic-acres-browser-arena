#!/usr/bin/env node
/**
 * Source 50's runnable artifact: the mechanical passability gate.
 *
 * It imports `sweepCorridor` from the demo module itself, so the gate and the
 * exhibit cannot drift apart — if the sweep changes, both change. Node 24
 * strips the TypeScript types natively, so no build step is involved.
 *
 * The gate's contract, and the reason it is worth having: it EXITS NON-ZERO
 * when any station is blocked. A sweep that reports and then passes is not a
 * gate, and this repository has a standing lesson about green gates that never
 * asked the real question.
 *
 * Usage:
 *   node scripts/technique-lab/group-c/passability-sweep.mjs            # cleared corridor -> 0
 *   node scripts/technique-lab/group-c/passability-sweep.mjs --defective # -> exits 1
 */

import {
  CLEARED_OBSTACLES,
  DEFECTIVE_OBSTACLES,
  PLAYER_RADIUS,
  STATION_SPACING,
  sweepCorridor,
} from '../../../src/map3/technique-lab/demos/group-c/passability.ts';

const LENGTH = 9.0;
const WIDTH = 2.2;

const defective = process.argv.includes('--defective');
const obstacles = defective ? DEFECTIVE_OBSTACLES : CLEARED_OBSTACLES;
const result = sweepCorridor(LENGTH, WIDTH, obstacles);

console.log(
  `passability sweep: ${result.stations.length} stations every ${STATION_SPACING} m, `
  + `disc radius ${PLAYER_RADIUS} m, corridor ${LENGTH} x ${WIDTH} m`,
);
// Counts before timings, deliberately: headless wall-clock on a shared machine
// drifts 20-30% run to run, so a time that moved is almost never evidence.
console.log(`colliders: ${obstacles.length}`);
console.log(
  `passable: ${result.stations.length - result.blocked}/${result.stations.length} `
  + `(${(result.passableFraction * 100).toFixed(1)}%)`,
);

for (const run of result.blockedRuns) {
  console.error(
    `BLOCKED z ${run.fromZ.toFixed(2)} .. ${run.toZ.toFixed(2)} `
    + `(${run.stations} station${run.stations === 1 ? '' : 's'})`,
  );
}

if (result.blocked > 0) {
  console.error(`FAIL: ${result.blocked} blocked station(s) in ${result.blockedRuns.length} run(s)`);
  process.exit(1);
}
console.log('PASS: every station admits the disc');
