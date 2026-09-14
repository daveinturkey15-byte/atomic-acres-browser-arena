#!/usr/bin/env node
// HF-536 night-defects-3b — the FALSIFIER for the micro-shift flicker probe.
//
// A 2 mm lateral camera move is not free of legitimate change. The projected
// position of a point at distance d moves by (shift / d) * focalPixels; with
// fov 70 at 1280 px wide the focal length is 914 px, so a surface 5 m away
// moves 0.37 px and one 1 m away moves 1.8 px. On a HIGH-CONTRAST SILHOUETTE
// that sub-pixel move changes the antialiased edge pixel's coverage, and a
// coverage change of a third across a 200-level contrast step is a 60-level
// jump - over the probe's 40 threshold, with no depth race anywhere near it.
//
// So the raw flicker count is an upper bound, not a finding. This tool splits
// it by the one property the two causes do not share:
//
//   EDGE flicker      the pixel sits where frame A is already changing fast.
//                     Sub-pixel resampling explains it. Not evidence.
//   INTERIOR flicker  the pixel's 5x5 neighbourhood in frame A is FLAT (max
//                     minus min <= --flat-span) and it still jumped by more
//                     than the threshold. Resampling a flat region cannot do
//                     that: every sample in the kernel has nearly the same
//                     value. This is the honest z-fighting candidate set.
//
// Interior candidates are then grouped into 4-connected regions and ranked by
// area, because a depth race covers a PATCH of one surface while a leftover
// edge artefact is a thread. Regions are reported with their bounding boxes so
// the next step is "look at these pixels in a.png", not "believe the number".
//
// Usage:
//   node scripts/qa/classify-microshift-flicker.mjs \
//     --report artifacts/qa/microshift-flicker-1/microshift-report.json \
//     [--flat-span 12] [--min-region 12] [--out <dir>]
import sharp from 'sharp';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REPORT = resolve(process.cwd(), arg('--report', 'artifacts/qa/microshift-flicker-1/microshift-report.json'));
const FLAT_SPAN = Number(arg('--flat-span', '12'));
const MIN_REGION = Number(arg('--min-region', '12'));
const OUT = resolve(process.cwd(), arg('--out', dirname(REPORT)));

const report = JSON.parse(readFileSync(REPORT, 'utf8'));
const THRESHOLD = report.maxChannelThreshold;

const maxChannel = async (path) => {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * info.channels;
    const r = data[o]; const g = data[o + 1]; const b = data[o + 2];
    out[i] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }
  return { m: out, w: info.width, h: info.height };
};

const results = [];
for (const station of report.stations) {
  if (!station.ok || !station.artifacts?.a) continue;
  const a = station.artifacts.a; const b = station.artifacts.shifted; const c = station.artifacts.control;
  if (![a, b, c].every(existsSync)) { results.push({ stationId: station.stationId, error: 'frames missing' }); continue; }
  const A = await maxChannel(a); const B = await maxChannel(b); const C = await maxChannel(c);
  const { w, h } = A;
  const flicker = new Uint8Array(w * h);
  const interior = new Uint8Array(w * h);
  let flickerCount = 0; let interiorCount = 0; let edgeCount = 0;
  const spanHist = new Uint32Array(256);
  for (let y = 2; y < h - 2; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const i = y * w + x;
      if (Math.abs(C.m[i] - A.m[i]) > THRESHOLD) continue;       // control noise, masked out
      if (Math.abs(B.m[i] - A.m[i]) <= THRESHOLD) continue;
      flicker[i] = 1; flickerCount += 1;
      // 5x5 flatness of frame A around the pixel.
      let mn = 255; let mx = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const v = A.m[i + dy * w + dx];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      const span = mx - mn;
      spanHist[Math.min(255, span)] += 1;
      if (span <= FLAT_SPAN) { interior[i] = 1; interiorCount += 1; } else edgeCount += 1;
    }
  }

  // 4-connected regions over the interior candidates only.
  const seen = new Uint8Array(w * h);
  const regions = [];
  const stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    if (!interior[i] || seen[i]) continue;
    let sp = 0; stack[sp += 1] = i; seen[i] = 1;
    let count = 0; let x0 = w; let y0 = h; let x1 = 0; let y1 = 0; let sx = 0; let sy = 0;
    while (sp > 0) {
      const p = stack[sp]; sp -= 1;
      const px = p % w; const py = (p - px) / w;
      count += 1; sx += px; sy += py;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      const neigh = [p - 1, p + 1, p - w, p + w];
      for (const q of neigh) {
        if (q < 0 || q >= w * h || seen[q] || !interior[q]) continue;
        seen[q] = 1; stack[sp += 1] = q;
      }
    }
    if (count >= MIN_REGION) {
      regions.push({
        pixels: count,
        box: [x0, y0, x1, y1],
        centre: [Math.round(sx / count), Math.round(sy / count)],
        // A patch fills its box; a thread does not.
        fill: Number((count / Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1))).toFixed(3)),
      });
    }
  }
  regions.sort((p, q) => q.pixels - p.pixels);

  const maskRaw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i += 1) {
    if (interior[i]) { maskRaw[i * 3] = 255; maskRaw[i * 3 + 1] = 40; maskRaw[i * 3 + 2] = 0; }
    else if (flicker[i]) { maskRaw[i * 3 + 2] = 150; maskRaw[i * 3 + 1] = 60; }
  }
  const maskPath = resolve(OUT, `${station.stationId}-classified.png`);
  await sharp(maskRaw, { raw: { width: w, height: h, channels: 3 } }).png().toFile(maskPath);

  const pctile = (p) => { const want = flickerCount * p; let acc = 0; for (let v = 0; v < 256; v += 1) { acc += spanHist[v]; if (acc >= want) return v; } return 255; };
  results.push({
    stationId: station.stationId,
    flickerPixels: flickerCount,
    flickerPct: Number(((flickerCount / (w * h)) * 100).toFixed(4)),
    edgePixels: edgeCount,
    interiorPixels: interiorCount,
    interiorPct: Number(((interiorCount / (w * h)) * 100).toFixed(4)),
    interiorShareOfFlicker: Number((interiorCount / Math.max(1, flickerCount)).toFixed(4)),
    localSpanPercentiles: { p10: pctile(0.1), p50: pctile(0.5), p90: pctile(0.9) },
    regions: regions.slice(0, 15),
    regionCount: regions.length,
    largestRegionPixels: regions[0]?.pixels ?? 0,
    classifiedMask: maskPath,
  });
  console.error(`[classify] ${station.stationId.padEnd(30)} flicker ${flickerCount}  edge ${edgeCount}  interior ${interiorCount} (${(100 * interiorCount / Math.max(1, flickerCount)).toFixed(1)}%)  regions>=${MIN_REGION}px ${regions.length}  largest ${regions[0]?.pixels ?? 0}`);
}

const out = {
  contract: 'microshift-flicker-classification-v1',
  source: REPORT,
  sha: report.sha,
  shiftM: report.shiftM,
  maxChannelThreshold: THRESHOLD,
  flatSpan: FLAT_SPAN,
  minRegion: MIN_REGION,
  note: 'interiorPixels is the honest z-fighting candidate count; edgePixels are explained by sub-pixel resampling of a silhouette and are NOT evidence of a depth race.',
  stations: results,
};
writeFileSync(resolve(OUT, 'microshift-classification.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ out: resolve(OUT, 'microshift-classification.json'), stations: results.map((r) => ({ s: r.stationId, interiorPct: r.interiorPct, largest: r.largestRegionPixels })) }, null, 2));
