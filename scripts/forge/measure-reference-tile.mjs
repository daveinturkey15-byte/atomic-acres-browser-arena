/**
 * measure-reference-tile.mjs — the FIT stage of the forge loop, mechanised.
 *
 * A generated reference tile is an INPUT, never a shipped asset (ART-FORGE
 * ruleset Amendment A2). To turn one into procedural family parameters you
 * have to read numbers off it rather than eyeball it, and these are the four
 * numbers a family graph actually needs:
 *
 *   p50 / stddev of luma  -> the base albedo and the total wear excursion the
 *                            family has to reproduce (spec.ts authors albedo
 *                            swings as fractions of base, so a tile whose
 *                            stddev is 11 % of its mean needs ~0.22 of
 *                            peak-to-peak swing, not 0.06).
 *   radial autocorrelation -> the DOMINANT FEATURE SIZE in pixels. The first
 *                            local minimum of the normalised autocorrelation
 *                            of the luma field is one feature width; scaled by
 *                            the tile's declared real-world span it is the
 *                            metre figure a WearScale.sizeM takes.
 *   directional variance   -> whether the surface is coursed (a strong
 *                            horizontal periodicity, e.g. siding, roof,
 *                            blockwork) or isotropic (asphalt, concrete).
 *
 * Usage:
 *   node scripts/forge/measure-reference-tile.mjs <tile.png> [--span-m 2.0]
 *   node scripts/forge/measure-reference-tile.mjs docs/forge/references/*.png
 */
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const SIZE = 256;

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

/** Normalised autocorrelation of a 1-D signal, lags 1..max. */
function autocorr(signal, maxLag) {
  const n = signal.length;
  const mean = signal.reduce((a, b) => a + b, 0) / n;
  const dev = signal.map((v) => v - mean);
  const denom = dev.reduce((a, b) => a + b * b, 0) || 1;
  const out = [];
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += dev[i] * dev[(i + lag) % n];
    out.push(sum / denom);
  }
  return out;
}

/** First local minimum of an autocorrelation curve = one feature width, in samples. */
function firstTrough(curve) {
  for (let i = 1; i < curve.length - 1; i += 1) {
    if (curve[i] <= curve[i - 1] && curve[i] < curve[i + 1]) return i + 1;
  }
  return curve.length;
}

/** First local MAXIMUM after the first trough = the repeat period (courses), in samples. */
function firstPeak(curve, after) {
  for (let i = after; i < curve.length - 1; i += 1) {
    if (curve[i] >= curve[i - 1] && curve[i] > curve[i + 1] && curve[i] > 0.08) return i + 1;
  }
  return null;
}

async function measure(path, spanM) {
  const { data } = await sharp(path)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const luma = new Float64Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    luma[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  }
  const sorted = Float64Array.from(luma).sort();
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
  const mean = luma.reduce((a, b) => a + b, 0) / luma.length;
  const stddev = Math.sqrt(luma.reduce((a, b) => a + (b - mean) ** 2, 0) / luma.length);

  // Row-mean and column-mean profiles isolate horizontal courses from vertical ones.
  const rowMean = [];
  const colMean = [];
  for (let y = 0; y < SIZE; y += 1) {
    let s = 0;
    for (let x = 0; x < SIZE; x += 1) s += luma[y * SIZE + x];
    rowMean.push(s / SIZE);
  }
  for (let x = 0; x < SIZE; x += 1) {
    let s = 0;
    for (let y = 0; y < SIZE; y += 1) s += luma[y * SIZE + x];
    colMean.push(s / SIZE);
  }
  const rowVar = rowMean.reduce((a, b) => a + (b - mean) ** 2, 0) / SIZE;
  const colVar = colMean.reduce((a, b) => a + (b - mean) ** 2, 0) / SIZE;

  // Isotropic feature size from a single central scanline pair.
  const midRow = Array.from({ length: SIZE }, (_, x) => luma[(SIZE >> 1) * SIZE + x]);
  const acRow = autocorr(midRow, SIZE >> 2);
  const acCourse = autocorr(rowMean, SIZE >> 2);
  const featurePx = firstTrough(acRow);
  const coursePx = firstPeak(acCourse, firstTrough(acCourse));

  const perPx = spanM / SIZE;
  return {
    tile: basename(path),
    spanM,
    lumaP50: +q(0.5).toFixed(1),
    lumaP10: +q(0.1).toFixed(1),
    lumaP90: +q(0.9).toFixed(1),
    lumaMean: +mean.toFixed(1),
    lumaStddev: +stddev.toFixed(2),
    /** stddev as a fraction of the mean: the peak-to-peak albedo swing a family must reproduce. */
    relativeSwing: +(stddev / Math.max(mean, 1)).toFixed(3),
    dominantFeatureM: +(featurePx * perPx).toFixed(4),
    coursePeriodM: coursePx === null ? null : +(coursePx * perPx).toFixed(4),
    /** > 1 means horizontal banding dominates (coursed); ~1 means isotropic. */
    coursedness: +(rowVar / Math.max(colVar, 1e-6)).toFixed(2),
  };
}

const spanM = Number(argValue('--span-m', '2.0'));
const flagValues = new Set(['--span-m']);
const raw = process.argv.slice(2);
const targets = raw.filter((a, i) => !a.startsWith('--') && !(i > 0 && flagValues.has(raw[i - 1])));
const files = [];
for (const t of targets) {
  if (statSync(t).isDirectory()) {
    for (const f of readdirSync(t)) if (f.endsWith('.png')) files.push(join(t, f));
  } else files.push(t);
}
const rows = [];
for (const f of files) rows.push(await measure(f, spanM));
console.log(JSON.stringify(rows, null, 2));
