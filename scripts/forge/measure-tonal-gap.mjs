#!/usr/bin/env node
/**
 * HF-536 look-2a — TONAL GAP measurement.
 *
 * Measures OUR captured frame against the per-station TARGET BOARD on the
 * axes the owner named ("pale, cool and flat next to the boards"), so the
 * grade/sky/exposure moves that follow are derived rather than felt.
 *
 * Per station, on both images (same camera, 1280x720):
 *   - global luma histogram p5 / p50 / p95 (Rec.709 luma on the 8-bit frame)
 *   - mean HSV saturation over the whole frame
 *   - SKY boxes (scripts/forge/boxes.json kind === 'sky'): circular-mean hue,
 *     mean saturation, luma p50, plus zenith (top third of the box) vs
 *     horizon (bottom third) so "deeper blue zenith / warm horizon" is a
 *     number and not an adjective
 *   - CONTRAST: within every ground/siding box, luma p75 / luma p25 — a
 *     within-box sunlit-vs-shade ratio that needs no pixel correspondence
 *     between our frame and a generated board
 *   - WARM/COOL: mean(R) - mean(B) over the SUNLIT pixels (luma >= that box's
 *     p75) of every non-sky box, and separately over siding/cream boxes
 *   - SHADOW FLOOR guard: ground-box p10 (the value the shipped shadow-floor
 *     row protects) so a saturation/contrast move cannot buy warmth by
 *     crushing the shade.
 *
 * Usage:
 *   node scripts/forge/measure-tonal-gap.mjs \
 *     --ours <dir with nuketown2-<station>.png> \
 *     --boards <dir with <station>.target.png> \
 *     --out docs/forge/tonal-gap.json
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const HERE = dirname(fileURLToPath(import.meta.url));
const BOXES = require(join(HERE, 'boxes.json'));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const OURS_DIR = resolve(arg('ours', ''));
const BOARDS_DIR = resolve(arg('boards', ''));
const OUT = resolve(arg('out', 'docs/forge/tonal-gap.json'));

/** Rec.709 luma on the displayed 8-bit values (what the eye and the owner see). */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function hsvSat(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function hueDeg(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function percentile(sortedCounts, total, p) {
  const target = total * p;
  let seen = 0;
  for (let v = 0; v < sortedCounts.length; v += 1) {
    seen += sortedCounts[v];
    if (seen >= target) return v;
  }
  return sortedCounts.length - 1;
}

/** Accumulates a 0..255 histogram plus channel sums. */
function newAcc() {
  return { hist: new Float64Array(256), n: 0, sr: 0, sg: 0, sb: 0, ssat: 0, hx: 0, hy: 0, hn: 0 };
}

function push(acc, r, g, b) {
  const l = luma(r, g, b);
  acc.hist[Math.max(0, Math.min(255, Math.round(l)))] += 1;
  acc.n += 1;
  acc.sr += r; acc.sg += g; acc.sb += b;
  acc.ssat += hsvSat(r, g, b);
  const h = hueDeg(r, g, b);
  if (h !== null) {
    const rad = (h * Math.PI) / 180;
    acc.hx += Math.cos(rad); acc.hy += Math.sin(rad); acc.hn += 1;
  }
}

function stats(acc) {
  if (acc.n === 0) return null;
  const hue = acc.hn > 0 ? ((Math.atan2(acc.hy / acc.hn, acc.hx / acc.hn) * 180) / Math.PI + 360) % 360 : null;
  return {
    n: acc.n,
    p5: percentile(acc.hist, acc.n, 0.05),
    p10: percentile(acc.hist, acc.n, 0.1),
    p25: percentile(acc.hist, acc.n, 0.25),
    p50: percentile(acc.hist, acc.n, 0.5),
    p75: percentile(acc.hist, acc.n, 0.75),
    p95: percentile(acc.hist, acc.n, 0.95),
    p99: percentile(acc.hist, acc.n, 0.99),
    meanR: acc.sr / acc.n,
    meanG: acc.sg / acc.n,
    meanB: acc.sb / acc.n,
    meanSat: acc.ssat / acc.n,
    hue,
    rMinusB: (acc.sr - acc.sb) / acc.n,
  };
}

const round = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
function tidy(s) {
  if (!s) return null;
  return {
    p5: s.p5, p10: s.p10, p25: s.p25, p50: s.p50, p75: s.p75, p95: s.p95, p99: s.p99,
    meanSat: round(s.meanSat, 4), hue: round(s.hue, 1), rMinusB: round(s.rMinusB, 2),
    meanR: round(s.meanR, 1), meanG: round(s.meanG, 1), meanB: round(s.meanB, 1),
  };
}

async function loadRgb(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

/** Iterate a box rect [x, y, w, h] clamped to the frame. */
function forBox(img, rect, fn) {
  const [bx, by, bw, bh] = rect;
  const x0 = Math.max(0, Math.round(bx));
  const y0 = Math.max(0, Math.round(by));
  const x1 = Math.min(img.w, Math.round(bx + bw));
  const y1 = Math.min(img.h, Math.round(by + bh));
  for (let y = y0; y < y1; y += 1) {
    let i = (y * img.w + x0) * img.ch;
    for (let x = x0; x < x1; x += 1, i += img.ch) fn(img.data[i], img.data[i + 1], img.data[i + 2], x, y);
  }
}

/** Second pass over a box, keeping only pixels at or above a luma threshold. */
function boxAbove(img, rect, threshold) {
  const acc = newAcc();
  forBox(img, rect, (r, g, b) => { if (luma(r, g, b) >= threshold) push(acc, r, g, b); });
  return stats(acc);
}

function boxStats(img, rect) {
  const acc = newAcc();
  forBox(img, rect, (r, g, b) => push(acc, r, g, b));
  return stats(acc);
}

/** Sub-band of a box: fraction range of its height. */
function band(rect, from, to) {
  const [x, y, w, h] = rect;
  return [x, y + h * from, w, h * (to - from)];
}

/** Every 4th pixel of the whole frame — the global histogram. */
function globalStats(img) {
  const acc = newAcc();
  for (let y = 0; y < img.h; y += 2) {
    let i = y * img.w * img.ch;
    for (let x = 0; x < img.w; x += 2, i += img.ch * 2) push(acc, img.data[i], img.data[i + 1], img.data[i + 2]);
  }
  return stats(acc);
}

const CONTRAST_KINDS = new Set(['ground', 'siding', 'cream', 'roof']);

async function measure(path) {
  const img = await loadRgb(path);
  const out = { global: tidy(globalStats(img)), sky: null, skyZenith: null, skyHorizon: null, contrast: null, sunlit: null, groundP10: null, boxes: {} };
  return { img, out };
}

async function measureStation(stationId, path) {
  const { img, out } = await measure(path);
  const boxes = BOXES.stations[stationId]?.boxes ?? [];

  const skyAcc = newAcc(); const zenAcc = newAcc(); const horAcc = newAcc();
  const sunAcc = newAcc(); const sidingAcc = newAcc();
  const contrastRatios = []; const groundP10s = [];

  for (const box of boxes) {
    const s = boxStats(img, box.rect);
    if (!s) continue;
    out.boxes[box.name] = { kind: box.kind, ...tidy(s) };

    if (box.kind === 'sky') {
      forBox(img, box.rect, (r, g, b) => push(skyAcc, r, g, b));
      forBox(img, band(box.rect, 0, 0.34), (r, g, b) => push(zenAcc, r, g, b));
      forBox(img, band(box.rect, 0.66, 1), (r, g, b) => push(horAcc, r, g, b));
      continue;
    }

    // Non-sky: sunlit set = pixels at or above this box's own p75.
    forBox(img, box.rect, (r, g, b) => { if (luma(r, g, b) >= s.p75) push(sunAcc, r, g, b); });
    if (box.kind === 'siding' || box.kind === 'cream') {
      forBox(img, box.rect, (r, g, b) => { if (luma(r, g, b) >= s.p75) push(sidingAcc, r, g, b); });
    }
    if (CONTRAST_KINDS.has(box.kind)) {
      if (s.p25 > 0) contrastRatios.push(s.p75 / Math.max(1, s.p25));
      out.boxes[box.name].contrastRatio = round(s.p75 / Math.max(1, s.p25), 3);
    }
    if (box.kind === 'ground') groundP10s.push(s.p10);
  }

  out.sky = tidy(stats(skyAcc));
  out.skyZenith = tidy(stats(zenAcc));
  out.skyHorizon = tidy(stats(horAcc));
  out.sunlit = tidy(stats(sunAcc));
  out.sunlitSiding = tidy(stats(sidingAcc));
  out.contrast = contrastRatios.length
    ? round(contrastRatios.reduce((a, b) => a + b, 0) / contrastRatios.length, 3)
    : null;
  out.groundP10 = groundP10s.length ? Math.min(...groundP10s) : null;
  return out;
}

const STATIONS = Object.keys(BOXES.stations);

const perStation = {};
const missing = [];
for (const id of STATIONS) {
  const short = id.replace(/^nuketown2-/, '');
  const oursPath = join(OURS_DIR, `${id}.png`);
  const boardPath = join(BOARDS_DIR, `${short}.target.png`);
  if (!existsSync(oursPath) || !existsSync(boardPath)) { missing.push(id); continue; }
  // eslint-disable-next-line no-await-in-loop
  const ours = await measureStation(id, oursPath);
  // eslint-disable-next-line no-await-in-loop
  const board = await measureStation(id, boardPath);

  const d = (a, b, k) => (a?.[k] === null || a?.[k] === undefined || b?.[k] === null || b?.[k] === undefined ? null : round(a[k] - b[k], 3));
  const hueDelta = (a, b) => {
    if (!a?.hue && a?.hue !== 0) return null;
    if (!b?.hue && b?.hue !== 0) return null;
    let x = a.hue - b.hue;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return round(x, 1);
  };

  perStation[id] = {
    ours, board,
    delta: {
      globalP5: d(ours.global, board.global, 'p5'),
      globalP50: d(ours.global, board.global, 'p50'),
      globalP95: d(ours.global, board.global, 'p95'),
      globalSat: d(ours.global, board.global, 'meanSat'),
      globalSatPct: ours.global && board.global && board.global.meanSat > 0
        ? round(((ours.global.meanSat - board.global.meanSat) / board.global.meanSat) * 100, 1) : null,
      skyP50: d(ours.sky, board.sky, 'p50'),
      skySat: d(ours.sky, board.sky, 'meanSat'),
      skySatPct: ours.sky && board.sky && board.sky.meanSat > 0
        ? round(((ours.sky.meanSat - board.sky.meanSat) / board.sky.meanSat) * 100, 1) : null,
      skyHue: hueDelta(ours.sky, board.sky),
      skyZenithP50: d(ours.skyZenith, board.skyZenith, 'p50'),
      skyZenithSat: d(ours.skyZenith, board.skyZenith, 'meanSat'),
      skyHorizonRminusB: d(ours.skyHorizon, board.skyHorizon, 'rMinusB'),
      sunlitRminusB: d(ours.sunlit, board.sunlit, 'rMinusB'),
      sunlitSidingRminusB: d(ours.sunlitSiding, board.sunlitSiding, 'rMinusB'),
      contrast: ours.contrast !== null && board.contrast !== null ? round(ours.contrast - board.contrast, 3) : null,
      contrastPct: ours.contrast !== null && board.contrast ? round(((ours.contrast - board.contrast) / board.contrast) * 100, 1) : null,
      groundP10: ours.groundP10 !== null && board.groundP10 !== null ? ours.groundP10 - board.groundP10 : null,
    },
  };
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const collect = (key) => Object.values(perStation).map((s) => s.delta[key]).filter((v) => v !== null && v !== undefined);

const summary = {
  stations: Object.keys(perStation).length,
  missing,
  meanDelta: {
    globalP5: round(mean(collect('globalP5')), 2),
    globalP50: round(mean(collect('globalP50')), 2),
    globalP95: round(mean(collect('globalP95')), 2),
    globalSatPct: round(mean(collect('globalSatPct')), 1),
    skyP50: round(mean(collect('skyP50')), 2),
    skySatPct: round(mean(collect('skySatPct')), 1),
    skyHue: round(mean(collect('skyHue')), 1),
    skyZenithP50: round(mean(collect('skyZenithP50')), 2),
    skyHorizonRminusB: round(mean(collect('skyHorizonRminusB')), 2),
    sunlitRminusB: round(mean(collect('sunlitRminusB')), 2),
    contrastPct: round(mean(collect('contrastPct')), 1),
  },
  gates: {
    skySatWithin20pct: collect('skySatPct').filter((v) => Math.abs(v) <= 20).length,
    skySatJudged: collect('skySatPct').length,
    sunlitWarmthWithin15: collect('sunlitRminusB').filter((v) => Math.abs(v) <= 15).length,
    sunlitWarmthJudged: collect('sunlitRminusB').length,
    contrastWithin20pct: collect('contrastPct').filter((v) => Math.abs(v) <= 20).length,
    contrastJudged: collect('contrastPct').length,
    groundP10AtLeast10: Object.values(perStation).filter((s) => (s.ours.groundP10 ?? 999) >= 10).length,
    groundP10Judged: Object.values(perStation).filter((s) => s.ours.groundP10 !== null).length,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), ours: OURS_DIR, boards: BOARDS_DIR, summary, perStation }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${OUT}`);
