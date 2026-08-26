#!/usr/bin/env node
// Arena viewpoint regression — DIFF side.
//
// Compares two capture directories produced by capture-arena-viewpoints.mjs
// and answers, repeatably and mechanically: which viewpoints changed, by how
// much, and is the change consistent with a real visual regression or just
// dynamic actors (the solo bot, animated containers) moving inside an
// otherwise identical frame?
//
// PERSISTENCE RULE (SYMMETRIC since 2026-08-26): both sides may carry
// multiple samples per viewpoint (capture-arena-viewpoints.mjs --samples).
// Verdicts are computed on the pixel-wise MINIMUM |base-candidate| delta
// across ALL base x candidate sample PAIRS (never base x base: two agreeing
// base samples would produce a 0 diff that absorbs a candidate matching
// neither). Dynamic content (rail targets, sliding containers, animated
// water, flickering work lights) sits at a different script phase in every
// session while geometry does not, so a pixel matching ANY base sample in
// ANY candidate sample counts as unchanged; a real regression differs from
// EVERY base sample and survives the min - at unchanged per-pixel thresholds.
// Metric design (per viewpoint, computed on that persistence-min map with
// both sides downscaled to ANALYSIS_W x ANALYSIS_H grayscale):
//   meanAbsDelta      - global luminance shift; catches grade/exposure washes.
//   ratioOver8        - fraction of pixels moved > 8/255; broad soft changes.
//   ratioOver32       - fraction moved > 32/255; hard geometry/light changes.
//   largestRegion*    - largest 4-connected cluster of >32 pixels, as a
//                       fraction of the frame, plus its bounding box. A moving
//                       bot is ONE small region; a deleted building or a
//                       lighting regression is many/large regions.
// Verdict tiers (thresholds CLI-overridable? NO — pinned here and guarded by
// scripts/qa/arena-viewpoint-regression.test.mjs):
//   MATCH          meanAbsDelta <= meanQuiet && ratioOver32 well under regionMin
//   DYNAMIC_ONLY   below REGION_CHANGED floor - consistent with actor noise
//   REGION_CHANGED one or more solid regions moved - read the composite
//   GLOBAL_CHANGED whole-frame shift - near-certain real change
//   MISSING        a side lacks the capture
//
// Usage:
//   node scripts/qa/diff-arena-viewpoints.mjs \
//     --base artifacts/viewpoint-regression/base \
//     --candidate artifacts/viewpoint-regression/candidate \
//     [--out artifacts/viewpoint-regression/diff-<base>-<candidate>]
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { VIEWPOINT_CATALOG } from './viewpoint-catalog.mjs';

export const ANALYSIS_W = 640;
export const ANALYSIS_H = 360;
// Pinned defaults. Do not loosen to make a diff disappear; a loosened
// threshold hides exactly the regressions this instrument exists to catch.
export const THRESHOLDS = Object.freeze({
  meanQuiet: 0.5,        // <= this meanAbsDelta reads as encoder/compositor noise
  regionMin: 0.0025,     // >=0.25% of frame in >32-delta pixels leaves DYNAMIC_ONLY
  regionGlobal: 0.15,    // >=15% of frame in >32-delta pixels is GLOBAL_CHANGED
  deltaHard: 32,
  deltaSoft: 8,
});

const grayscale = async (path) => new Promise((resolvePromise, rejectPromise) => {
  sharp(path)
    .resize(ANALYSIS_W, ANALYSIS_H, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
    .then(({ data }) => resolvePromise(data))
    .catch(rejectPromise);
});

// Largest 4-connected component of cells over the hard-delta threshold.
function largestRegion(over) {
  const seen = new Uint8Array(over.length);
  let best = { count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const stack = [];
  for (let start = 0; start < over.length; start += 1) {
    if (!over[start] || seen[start]) continue;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    let count = 0;
    let minX = ANALYSIS_W; let minY = ANALYSIS_H; let maxX = 0; let maxY = 0;
    while (stack.length > 0) {
      const cell = stack.pop();
      const x = cell % ANALYSIS_W;
      const y = (cell / ANALYSIS_W) | 0;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x > 0 && over[cell - 1] && !seen[cell - 1]) { seen[cell - 1] = 1; stack.push(cell - 1); }
      if (x < ANALYSIS_W - 1 && over[cell + 1] && !seen[cell + 1]) { seen[cell + 1] = 1; stack.push(cell + 1); }
      if (y > 0 && over[cell - ANALYSIS_W] && !seen[cell - ANALYSIS_W]) { seen[cell - ANALYSIS_W] = 1; stack.push(cell - ANALYSIS_W); }
      if (y < ANALYSIS_H - 1 && over[cell + ANALYSIS_W] && !seen[cell + ANALYSIS_W]) { seen[cell + ANALYSIS_W] = 1; stack.push(cell + ANALYSIS_W); }
    }
    if (count > best.count) best = { count, minX, minY, maxX, maxY };
  }
  return best;
}

// Verdict tiers documented in the header comment above. Restored 2026-08-26:
// d4585388 (r9) deleted this function while keeping its caller, so every
// real diff run crashed with ReferenceError until a live end-to-end round
// executed it - the source-contract tests never call main(). Tier order
// matters: blocking gates run first so concentrated change cannot be
// diluted by a quiet global mean, and a whole-frame exposure/grade wash
// (meanAbsDelta >= 6, the r2-calibrated floor) blocks even without one.
export function verdictFor(metrics) {
  if (metrics.largestRegionFraction >= THRESHOLDS.regionGlobal) return 'GLOBAL_CHANGED';
  if (metrics.meanAbsDelta >= 6) return 'GLOBAL_CHANGED';
  if (metrics.largestRegionFraction >= THRESHOLDS.regionMin) return 'REGION_CHANGED';
  if (metrics.meanAbsDelta <= THRESHOLDS.meanQuiet
    && metrics.ratioOver32 < THRESHOLDS.regionMin * 0.4) return 'MATCH';
  return 'DYNAMIC_ONLY';
}

export async function comparePair(basePngs, candPngs) {
  // SYMMETRIC persistence-min: a pixel counts as changed only if it differs
  // from EVERY base sample in EVERY candidate sample. Scripted arena motion
  // (lateral targets, sliding containers, water phase) sits at a different
  // phase in each capture session; min over all base x candidate pairs
  // absorbs that phase noise on either side. A real regression differs from
  // every base sample, so it survives at UNCHANGED per-pixel thresholds.
  const bases = Array.isArray(basePngs) ? basePngs : [basePngs];
  const cands = Array.isArray(candPngs) ? candPngs : [candPngs];
  const [firstBase, ...otherBases] = await Promise.all(bases.map(grayscale));
  const candFrames = await Promise.all(cands.map(grayscale));
  const n = firstBase.length;
  const over32 = new Uint8Array(n);
  const persistenceMin = new Uint8Array(n);
  let sum = 0; let hard = 0; let soft = 0;
  for (let i = 0; i < n; i += 1) {
    // Base x candidate pairs ONLY. Base x base pairs must never enter this
    // min: two agreeing base samples would produce a 0 diff that absorbs a
    // candidate matching neither - a silent real-regression hole.
    let d = 255;
    for (const cand of candFrames) {
      d = Math.min(d, Math.abs(firstBase[i] - cand[i]));
      for (const base of otherBases) d = Math.min(d, Math.abs(base[i] - cand[i]));
    }
    persistenceMin[i] = d;
    sum += d;
    if (d > THRESHOLDS.deltaHard) { over32[i] = 1; hard += 1; }
    if (d > THRESHOLDS.deltaSoft) soft += 1;
  }
  const region = largestRegion(over32);
  return {
    metrics: {
      meanAbsDelta: Number((sum / n).toFixed(3)),
      ratioOver8: Number((soft / n).toFixed(5)),
      ratioOver32: Number((hard / n).toFixed(5)),
      largestRegionFraction: Number((region.count / n).toFixed(5)),
      largestRegionBox: region.count > 0
        ? { x: region.minX, y: region.minY, w: region.maxX - region.minX + 1, h: region.maxY - region.minY + 1 }
        : null,
    },
    persistenceMin,
  };
}

async function writeComposite(basePng, candPng, outPath, persistenceMin) {
  // Base | candidate | amplified PERSISTENCE-MIN delta heat map, stacked.
  const heat = Buffer.alloc(ANALYSIS_W * ANALYSIS_H * 3);
  for (let i = 0; i < ANALYSIS_W * ANALYSIS_H; i += 1) {
    const d = persistenceMin[i];
    heat[i * 3] = Math.min(255, d * 4);
    heat[(i * 3) + 1] = Math.min(255, d * 2);
    heat[(i * 3) + 2] = d > 4 ? 40 : 0;
  }
  const heatPng = await sharp(heat, { raw: { width: ANALYSIS_W, height: ANALYSIS_H, channels: 3 } }).png().toBuffer();
  const rows = [
    await sharp(basePng).resize(ANALYSIS_W, ANALYSIS_H, { fit: 'fill' }).png().toBuffer(),
    await sharp(candPng).resize(ANALYSIS_W, ANALYSIS_H, { fit: 'fill' }).png().toBuffer(),
    heatPng,
  ];
  await sharp({
    create: { width: ANALYSIS_W, height: ANALYSIS_H * rows.length, channels: 3, background: { r: 20, g: 20, b: 20 } },
  })
    .composite(rows.map((input, index) => ({ input, top: ANALYSIS_H * index, left: 0 })))
    .png()
    .toFile(outPath);
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  const BASE_DIR = resolve(arg('--base', ''));
  const CAND_DIR = resolve(arg('--candidate', ''));
  if (!BASE_DIR || !CAND_DIR || !existsSync(BASE_DIR) || !existsSync(CAND_DIR)) {
    console.error('[viewpoint-diff] both --base and --candidate must be existing capture directories');
    process.exit(2);
  }
  const OUT_DIR = resolve(arg('--out',
    `artifacts/viewpoint-regression/diff-${BASE_DIR.split(/[\\/]/).pop()}-${CAND_DIR.split(/[\\/]/).pop()}`));

  const loadManifest = (dir) => {
    const path = resolve(dir, 'capture-manifest.json');
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
  };
  const baseManifest = loadManifest(BASE_DIR);
  const candManifest = loadManifest(CAND_DIR);
  if (!baseManifest || !candManifest) {
    console.error('[viewpoint-diff] capture-manifest.json missing on a side; run capture-arena-viewpoints.mjs first');
    process.exit(2);
  }
  // Comparing WebGPU against WebGL2 proves nothing about either route; a
  // capture taken under an invalidated environment proves even less.
  const envProblems = [];
  if (baseManifest.backend !== candManifest.backend) {
    envProblems.push(`backend mismatch: ${baseManifest.backend} vs ${candManifest.backend} - comparing WebGPU against WebGL2 proves nothing`);
  }
  for (const m of [baseManifest, candManifest]) {
    if (m.environmentInvalid) envProblems.push(`${m.label ?? m.url}: captured under invalid environment (${m.environmentInvalid})`);
  }
  if (envProblems.length > 0) {
    console.error('[viewpoint-diff] INVALID environment comparison:');
    for (const problem of envProblems) console.error(`  - ${problem}`);
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const candSampleCount = Math.max(1, Number(candManifest.samples ?? 1));
  const baseSampleCount = Math.max(1, Number(baseManifest.samples ?? 1));
  const samplePaths = (dir, arena, cameraId, count) => {
    const paths = [];
    for (let s = 0; s < count; s += 1) {
      const p = resolve(dir, arena,
        s === 0 ? `${cameraId}.png` : `${cameraId}.s${s}.png`);
      if (existsSync(p)) paths.push(p);
    }
    return paths;
  };
  const candidatePaths = (arena, cameraId) => samplePaths(CAND_DIR, arena, cameraId, candSampleCount);
  const basePaths = (arena, cameraId) => samplePaths(BASE_DIR, arena, cameraId, baseSampleCount);
  const comparisons = [];
  for (const arena of Object.keys(VIEWPOINT_CATALOG)) {
    for (const cameraId of VIEWPOINT_CATALOG[arena]) {
      const rel = resolve(BASE_DIR, arena, `${cameraId}.png`);
      const entry = { arena, cameraId };
      if (!existsSync(rel)) {
        entry.verdict = 'MISSING';
        entry.missingSide = 'base';
        comparisons.push(entry);
        continue;
      }
      const cPaths = candidatePaths(arena, cameraId);
      if (cPaths.length === 0) {
        entry.verdict = 'MISSING';
        entry.missingSide = 'candidate';
        comparisons.push(entry);
        continue;
      }
      const bPaths = basePaths(arena, cameraId);
      const { metrics, persistenceMin } = await comparePair(bPaths, cPaths);
      entry.metrics = metrics;
      entry.samplesUsed = { base: bPaths.length, candidate: cPaths.length };
      entry.verdict = verdictFor(metrics);
      if (entry.verdict === 'REGION_CHANGED' || entry.verdict === 'GLOBAL_CHANGED') {
        entry.composite = resolve(OUT_DIR, `${arena}__${cameraId}.png`);
        await writeComposite(bPaths[0], cPaths[0], entry.composite, persistenceMin);
      }
      comparisons.push(entry);
    }
  }

  const counts = {};
  for (const entry of comparisons) counts[entry.verdict] = (counts[entry.verdict] ?? 0) + 1;
  const blocking = ['REGION_CHANGED', 'GLOBAL_CHANGED', 'MISSING'];
  const verdict = comparisons.some((c) => blocking.includes(c.verdict)) ? 'DIFFS' : 'CLEAN';
  const report = {
    contract: 'arena-viewpoint-regression-diff-v1',
    verdict,
    thresholds: THRESHOLDS,
    analysis: { width: ANALYSIS_W, height: ANALYSIS_H },
    base: { dir: BASE_DIR, sha: baseManifest.sha, bundleAtStart: baseManifest.bundleAtStart, capturedAt: baseManifest.capturedAt },
    persistence: { rule: 'pixel-wise min |base-candidate| across ALL base x candidate sample pairs', baseSamples: baseManifest.samples ?? 1, candidateSamples: candManifest.samples ?? 1 },
    candidate: { dir: CAND_DIR, sha: candManifest.sha, bundleAtStart: candManifest.bundleAtStart, capturedAt: candManifest.capturedAt },
    counts,
    comparisons,
  };
  writeFileSync(resolve(OUT_DIR, 'diff-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({ verdict, counts, report: resolve(OUT_DIR, 'diff-report.json') }, null, 2));
  for (const entry of comparisons) {
    if (!blocking.includes(entry.verdict)) continue;
    const m = entry.metrics;
    console.error(`[viewpoint-diff] ${entry.verdict.padEnd(14)} ${entry.arena}/${entry.cameraId}`
      + (m ? ` mean=${m.meanAbsDelta} r32=${m.ratioOver32} region=${m.largestRegionFraction}` : ` (${entry.missingSide} missing)`));
  }
  process.exit(verdict === 'CLEAN' ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
