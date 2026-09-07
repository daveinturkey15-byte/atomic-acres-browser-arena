#!/usr/bin/env node
// HF-541 — CAPTURE FRAME-VARIETY GUARD.
//
// WHAT IT CATCHES. A review station whose frame is dominated by one flat
// surface. `nuketown2-perimeter-wall-end-close` aimed 36 degrees into the
// perimeter end wall from 1.05 m; that shaded face filled 64.6 % of the frame
// and left 4.0 % sky (measured offline against the built geometry, and again
// in pixels: 13,025 distinct RGB values at mean luma 30.6, where every other
// station in the same run read 40,172-147,991).
//
// WHY IT IS A GATE AND NOT A NOTE. A flat frame is a LOW-VARIANCE SAMPLE, so
// averaging it into a station-set aggregate drags the aggregate toward
// whatever it is being compared with. Measured on interim-11: dropping that
// one station moves the reported midtone delta from +20.90 to +23.86 and the
// highlight delta from -4.66 to +1.00. The instrument was reporting a smaller
// gap than the build actually had, and nothing in the pipeline could see it -
// the station's own tonal boxes had been re-cut around the fault
// (scripts/forge/boxes.json: "left two-thirds of frame render pure black at
// base"), which records the symptom instead of failing on it.
//
// THE BAR. Two rules, both against the station-set MEDIAN of the same run
// (median, not mean: one flat frame must not move the bar it is judged by):
//
//   1. ORDER OF MAGNITUDE, two-sided: 0.1x <= distinct/median <= 10x.
//   2. FLOOR: distinct/median >= VARIETY_FLOOR_RATIO.
//
// Rule 1 alone does NOT catch the fault that motivated this guard - 13,025 /
// 92,715 = 0.140x is inside a 10x band. Rule 2 is what bites, and its value is
// DERIVED, not tuned: the healthy interim-11 stations bottom out at 0.433x
// (border-path-close) and the fault sits at 0.140x, so the floor is placed at
// the log-space midpoint of those two, sqrt(0.140 * 0.433) = 0.247 -> 0.25.
// That clears the lowest real station by 1.73x and the fault by 1.78x, so it
// is a separator between two measured populations rather than a number fitted
// to one sample. Raising it is a tightening and needs no ceremony; LOWERING it
// weakens a verifier and is forbidden by the regression rule - the test
// `an order-of-magnitude band alone would have PASSED this fault` is the
// falsifier that makes such a change go red.
//
// SCOPE. The guard is a population statistic, so it only runs when a full
// station roster was captured. A `--cameras` subset is reported `skipped` with
// the reason and is never reported as a pass.
//
// CLI:
//   node scripts/qa/capture-frame-variety.mjs --dir <capture-dir>/<arena> [--json]
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

/** Below this fraction of the station-set median a frame is not sampling the arena. */
export const VARIETY_FLOOR_RATIO = 0.25;
/** Two-sided order-of-magnitude band around the station-set median. */
export const VARIETY_ORDER_OF_MAGNITUDE = 10;
/** Fewer stations than this and the median is not a population statistic. */
export const VARIETY_MIN_STATIONS = 8;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * @param {ReadonlyArray<{ station: string, distinct: number }>} rows
 * @returns {{ status: 'pass'|'fail'|'skipped', reason?: string, median?: number,
 *             floor?: number, ceiling?: number,
 *             offenders: Array<{ station: string, distinct: number, ratio: number, reason: string }>,
 *             stations: Array<{ station: string, distinct: number, ratio: number }> }}
 */
export function assessFrameVariety(rows) {
  if (rows.length < VARIETY_MIN_STATIONS) {
    return {
      status: 'skipped',
      reason: `${rows.length} station(s) captured; the median needs at least ${VARIETY_MIN_STATIONS} to be a population statistic`,
      offenders: [],
      stations: rows.map((row) => ({ station: row.station, distinct: row.distinct, ratio: NaN })),
    };
  }
  const mid = median(rows.map((row) => row.distinct));
  const floor = mid * VARIETY_FLOOR_RATIO;
  const oomFloor = mid / VARIETY_ORDER_OF_MAGNITUDE;
  const ceiling = mid * VARIETY_ORDER_OF_MAGNITUDE;
  const stations = rows
    .map((row) => ({ station: row.station, distinct: row.distinct, ratio: row.distinct / mid }))
    .sort((a, b) => a.distinct - b.distinct);
  const offenders = [];
  for (const entry of stations) {
    const bars = [];
    if (entry.distinct < oomFloor) bars.push(`below 1/${VARIETY_ORDER_OF_MAGNITUDE} of the median`);
    if (entry.distinct > ceiling) bars.push(`above ${VARIETY_ORDER_OF_MAGNITUDE}x the median`);
    if (entry.distinct < floor) bars.push(`below the ${VARIETY_FLOOR_RATIO}x variety floor`);
    if (bars.length === 0) continue;
    offenders.push({
      ...entry,
      reason: `${entry.station}: ${entry.distinct} distinct RGB values against a station-set median of ${mid}`
        + ` (${entry.ratio.toFixed(3)}x) - ${bars.join('; ')}`,
    });
  }
  return {
    status: offenders.length > 0 ? 'fail' : 'pass',
    median: mid, floor, ceiling, offenders, stations,
  };
}

/** Distinct RGB values in one 8-bit frame. Alpha is ignored; the guard is about colour. */
export async function distinctColours(pngPath) {
  const sharp = require('sharp');
  const { data, info } = await sharp(pngPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Set();
  for (let i = 0; i + 2 < data.length; i += info.channels) {
    seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return seen.size;
}

/** Sample 0 only: `<station>.png`, never the `<station>.sN.png` persistence samples. */
export async function measureCaptureDirectory(dir) {
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.png') && !/\.s\d+\.png$/.test(name))
    .sort();
  const rows = [];
  for (const name of files) {
    rows.push({ station: basename(name, '.png'), distinct: await distinctColours(join(dir, name)) });
  }
  return rows;
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (invokedDirectly) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--dir');
  if (at < 0 || !argv[at + 1]) {
    console.error('usage: node scripts/qa/capture-frame-variety.mjs --dir <capture-dir>/<arena> [--json]');
    process.exit(2);
  }
  const result = assessFrameVariety(await measureCaptureDirectory(resolve(argv[at + 1])));
  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const entry of result.stations) {
      console.log(`${String(entry.distinct).padStart(8)}  ${entry.ratio.toFixed(3).padStart(6)}x  ${entry.station}`);
    }
    console.log(`\n${result.status.toUpperCase()}  median=${result.median ?? '-'}  floor=${result.floor?.toFixed(0) ?? '-'}`);
    for (const offender of result.offenders) console.log(`  FLAT FRAME  ${offender.reason}`);
    if (result.reason) console.log(`  ${result.reason}`);
  }
  process.exit(result.status === 'fail' ? 1 : result.status === 'skipped' ? 2 : 0);
}
