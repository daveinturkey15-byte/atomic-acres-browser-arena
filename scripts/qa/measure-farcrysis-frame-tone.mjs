#!/usr/bin/env node
// Lane R (PASS 87, HF-423) — FRAME TONE instrument for the farcrysis art pass.
//
// The defect it exists to measure, in numbers rather than adjectives: on the
// authored review cameras every tree trunk rendered as a pure-black silhouette
// against the sky ("burnt forest"). HF-396 already recognised that class and
// added a fake-subsurface emissive lift, but at a scale that did not clear it.
//
// Metrics, per captured PNG, on the linear-light luma of the frame:
//   crushedShare  fraction of pixels below LUMA 0.02 (sRGB ~40/255) - the
//                 "collapsed to black" mass this pass is trying to reduce.
//   p05, p50      5th-percentile and median luma - the shadow floor and the
//                 overall exposure, so a lift can be shown NOT to have simply
//                 washed the frame out (the rejected beige-wash look).
//   chromaMean    mean sRGB saturation - a lift that only greys shadows out
//                 would drop this; a lift toward each layer's own hue should
//                 hold or raise it.
//
// AGGREGATES. `ALL VIEWS` is the arena's whole review set and it is the number
// a publish reviewer should read first - it is printed unconditionally and it
// cannot be suppressed. `--exclude <view,...>` adds a SECOND, clearly labelled
// row beside it, for the case where a camera itself MOVED between the two
// captures: farcrysis-core-interior was inside a catwalk in the before capture
// (nearest opaque surface 0.01 m) and was re-aimed by this same lane, so the
// five unchanged cameras answer "did the lighting change help?" while ALL VIEWS
// answers "is the arena's review set better off?". Both are true and they point
// different ways here, so both are printed. Reporting only the subset would be
// choosing the flattering aggregate.
//
// Usage: node scripts/qa/measure-farcrysis-frame-tone.mjs [--exclude a,b] <dir> [<dir> ...]
import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const excludeIndex = argv.indexOf('--exclude');
const EXCLUDED = excludeIndex >= 0 && argv[excludeIndex + 1]
  ? argv[excludeIndex + 1].split(',').map((entry) => entry.trim()).filter(Boolean)
  : [];
const dirs = argv.filter((entry, index) => entry !== '--exclude' && index !== excludeIndex + 1);
if (dirs.length === 0) throw new Error('usage: measure-farcrysis-frame-tone.mjs [--exclude a,b] <captureDir> [...]');

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LUT = Array.from({ length: 256 }, (_, i) => srgbToLinear(i / 255));

async function measure(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const stride = info.channels;
  const n = info.width * info.height;
  const luma = new Float64Array(n);
  let chroma = 0;
  for (let i = 0, p = 0; i < n; i += 1, p += stride) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    luma[i] = 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    chroma += mx === 0 ? 0 : (mx - mn) / mx;
  }
  const sorted = Float64Array.from(luma).sort();
  let crushed = 0;
  for (let i = 0; i < n; i += 1) if (luma[i] < 0.02) crushed += 1;
  return {
    crushedShare: crushed / n,
    p05: sorted[Math.floor(n * 0.05)],
    p50: sorted[Math.floor(n * 0.5)],
    chromaMean: chroma / n,
  };
}

for (const dir of dirs) {
  const files = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      // The capture writes three samples per viewpoint (x.png, x.s1.png,
      // x.s2.png). The primary is the reported figure; the other two exist to
      // MEASURE this instrument's own noise floor, because the arena's wind,
      // atmosphere and grass LOD are driven by performance.now() and are NOT
      // frozen by the deterministic camera. A between-build delta smaller than
      // that spread is not a result.
      else if (entry.endsWith('.png')) files.push(full);
    }
  };
  walk(dir);
  files.sort();
  const all = [];
  for (const file of files) {
    const name = basename(file, '.png');
    const view = name.replace(/\.s\d+$/u, '');
    all.push({ view, primary: view === name, ...(await measure(file)) });
  }
  const rows = all.filter((r) => r.primary);
  const mean = (list, key) => list.reduce((sum, row) => sum + row[key], 0) / list.length;
  console.log(`\n${dir}`);
  let sampleSpread = 0;
  for (const row of rows) {
    const samples = all.filter((r) => r.view === row.view);
    const lo = Math.min(...samples.map((r) => r.crushedShare));
    const hi = Math.max(...samples.map((r) => r.crushedShare));
    sampleSpread = Math.max(sampleSpread, hi - lo);
    console.log(`  ${row.view.padEnd(32)} crushed=${(row.crushedShare * 100).toFixed(2)}%`
      + ` p05=${row.p05.toFixed(4)} p50=${row.p50.toFixed(4)} chroma=${row.chromaMean.toFixed(4)}`
      + ` [n=${samples.length} spread ${((hi - lo) * 100).toFixed(2)}pp]`);
  }
  console.log(`  ${`ALL VIEWS (${rows.length})`.padEnd(32)} crushed=${(mean(rows, 'crushedShare') * 100).toFixed(2)}%`
    + ` p05=${mean(rows, 'p05').toFixed(4)} p50=${mean(rows, 'p50').toFixed(4)} chroma=${mean(rows, 'chromaMean').toFixed(4)}`);
  if (EXCLUDED.length > 0) {
    const kept = rows.filter((row) => !EXCLUDED.includes(row.view));
    const missing = EXCLUDED.filter((view) => !rows.some((row) => row.view === view));
    if (missing.length > 0) throw new Error(`--exclude names ${missing.join(', ')}, not present in ${dir}`);
    if (kept.length === 0) throw new Error('--exclude removed every view; there is no aggregate left to print');
    console.log(`  ${`EXCL ${EXCLUDED.join(',')} (${kept.length})`.padEnd(32)} crushed=${(mean(kept, 'crushedShare') * 100).toFixed(2)}%`
      + ` p05=${mean(kept, 'p05').toFixed(4)} p50=${mean(kept, 'p50').toFixed(4)} chroma=${mean(kept, 'chromaMean').toFixed(4)}`);
  }
  console.log(`  ${'ALL SAMPLES'.padEnd(32)} crushed=${(mean(all, 'crushedShare') * 100).toFixed(2)}%`
    + ` (n=${all.length}); worst single-view sample spread ${(sampleSpread * 100).toFixed(2)}pp`);
}
