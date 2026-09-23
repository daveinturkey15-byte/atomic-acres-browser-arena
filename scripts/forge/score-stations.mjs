#!/usr/bin/env node
// PASS 0 mechanical scorer (HF-536 ART-FORGE-RULESET stage 5).
//
// Usage:
//   node scripts/forge/score-stations.mjs --candidate <captureDir> --base <captureDir> \
//     --boxes scripts/forge/boxes.json --out <score.json>
//
// captureDir layout: <dir>/nuketown2/<station>.png (committed frame; mirrors
// scripts/qa/diff-arena-viewpoints.mjs samplePaths s===0 naming).
// Per station, per named pixel box: luma p10/p50/p90, mean RGB, hue angle,
// stddev; per station the newly-black and healed fractions at FULL resolution
// with the exact rule from artifacts/day-root/black-frac.mjs:
//   newly-black: base max(r,g,b) > 6 AND candidate max(r,g,b) <= 6
// (pathToFileURL import lives with the other imports below.)
// Deterministic (sorted keys), no network. Exits non-zero when a station or
// box is missing, a box leaves the 1280x720 frame, or an image is unreadable.
import sharp from 'sharp';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const CANDIDATE_DIR = arg('--candidate');
const BASE_DIR = arg('--base');
const BOXES_PATH = arg('--boxes');
const OUT_PATH = arg('--out');

export const NEWLY_BLACK_FLOOR = 6;

const fail = (msg) => {
  process.stderr.write(`[score-stations] ERROR ${msg}\n`);
  process.exit(2);
};

if (!CANDIDATE_DIR) fail('missing --candidate <captureDir>');
if (!BASE_DIR) fail('missing --base <captureDir>');
if (!BOXES_PATH) fail('missing --boxes <boxes.json>');
if (!OUT_PATH) fail('missing --out <score.json>');

const lumaOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Hue angle in degrees of a mean RGB triple. Achromatic (max-min ~ 0) -> 0.
export function hueDeg(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx - mn < 1e-6) return 0;
  let h;
  if (mx === r) h = ((g - b) / (mx - mn)) % 6;
  else if (mx === g) h = (b - r) / (mx - mn) + 2;
  else h = (r - g) / (mx - mn) + 4;
  h *= 60;
  if (h < 0) h += 360;
  return Math.round(h * 10) / 10;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const r1 = (v) => Math.round(v * 10) / 10;

async function scoreBox(candPath, rect) {
  const [left, top, width, height] = rect;
  let data;
  let info;
  try {
    ({ data, info } = await sharp(candPath)
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch (error) {
    fail(`box [${rect}] unreadable in ${candPath}: ${String(error).slice(0, 160)}`);
  }
  const n = info.width * info.height;
  const ch = info.channels;
  let r = 0;
  let g = 0;
  let b = 0;
  let m2 = 0;
  let mean = 0;
  const lumas = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const pr = data[i * ch];
    const pg = data[i * ch + 1];
    const pb = data[i * ch + 2];
    r += pr;
    g += pg;
    b += pb;
    const l = lumaOf(pr, pg, pb);
    lumas[i] = l;
    // Welford for a stable stddev.
    const delta = l - mean;
    mean += delta / (i + 1);
    m2 += delta * (l - mean);
  }
  const sorted = Array.from(lumas).sort((x, y) => x - y);
  const meanR = r / n;
  const meanG = g / n;
  const meanB = b / n;
  return {
    n,
    luma: { p10: r1(quantile(sorted, 0.1)), p50: r1(quantile(sorted, 0.5)), p90: r1(quantile(sorted, 0.9)) },
    meanRGB: [r1(meanR), r1(meanG), r1(meanB)],
    hueDeg: hueDeg(meanR, meanG, meanB),
    stddev: r1(Math.sqrt(m2 / Math.max(1, n))),
  };
}

// Full-resolution newly-black / healed fractions, exact black-frac.mjs rule.
async function blackFractions(basePath, candPath) {
  let b;
  let c;
  try {
    b = await sharp(basePath).raw().toBuffer({ resolveWithObject: true });
    c = await sharp(candPath).raw().toBuffer({ resolveWithObject: true });
  } catch (error) {
    fail(`full-frame read failed (${basePath} vs ${candPath}): ${String(error).slice(0, 160)}`);
  }
  if (b.info.width !== c.info.width || b.info.height !== c.info.height) {
    fail(`frame size mismatch: ${basePath} ${b.info.width}x${b.info.height} vs ${candPath} ${c.info.width}x${c.info.height}`);
  }
  const n = b.info.width * b.info.height;
  const bch = b.info.channels;
  const cch = c.info.channels;
  let nb = 0;
  let healed = 0;
  for (let i = 0; i < n; i += 1) {
    const bo = i * bch;
    const co = i * cch;
    const bm = Math.max(b.data[bo], b.data[bo + 1], b.data[bo + 2]);
    const cm = Math.max(c.data[co], c.data[co + 1], c.data[co + 2]);
    if (bm > NEWLY_BLACK_FLOOR && cm <= NEWLY_BLACK_FLOOR) nb += 1;
    if (bm <= NEWLY_BLACK_FLOOR && cm > NEWLY_BLACK_FLOOR) healed += 1;
  }
  return { newlyBlack: nb / n, healed: healed / n };
}

export async function scoreStations({ candidateDir, baseDir, boxes }) {
  const out = { version: 1, candidate: candidateDir, base: baseDir, stations: {} };
  for (const station of Object.keys(boxes.stations).sort()) {
    const candPath = resolve(candidateDir, 'nuketown2', `${station}.png`);
    const basePath = resolve(baseDir, 'nuketown2', `${station}.png`);
    if (!existsSync(candPath)) fail(`station missing in candidate: ${candPath}`);
    if (!existsSync(basePath)) fail(`station missing in base: ${basePath}`);
    const stationOut = { file: `${station}.png`, boxes: {} };
    for (const box of boxes.stations[station].boxes) {
      if (!box || !box.name || !Array.isArray(box.rect) || box.rect.length !== 4) {
        fail(`malformed box entry in station ${station}: ${JSON.stringify(box).slice(0, 120)}`);
      }
      const [l, t, w, h] = box.rect;
      if (![l, t, w, h].every(Number.isFinite) || w <= 0 || h <= 0 || l < 0 || t < 0 || l + w > 1280 || t + h > 720) {
        fail(`box ${station}::${box.name} rect [${box.rect}] leaves the 1280x720 frame`);
      }
      stationOut.boxes[box.name] = {
        rect: box.rect,
        kind: box.kind ?? null,
        protected: box.protected === true,
        ...await scoreBox(candPath, box.rect),
      };
    }
    const frac = await blackFractions(basePath, candPath);
    stationOut.newlyBlack = frac.newlyBlack;
    stationOut.healed = frac.healed;
    out.stations[station] = stationOut;
  }
  return out;
}

async function main() {
  let boxes;
  try {
    boxes = JSON.parse((await import('node:fs')).readFileSync(resolve(BOXES_PATH), 'utf8'));
  } catch (error) {
    fail(`cannot read boxes ${BOXES_PATH}: ${String(error).slice(0, 160)}`);
  }
  if (!boxes || !boxes.stations || typeof boxes.stations !== 'object') fail(`no stations table in ${BOXES_PATH}`);
  const result = await scoreStations({
    candidateDir: resolve(CANDIDATE_DIR),
    baseDir: resolve(BASE_DIR),
    boxes,
  });
  mkdirSync(dirname(resolve(OUT_PATH)), { recursive: true });
  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(result, null, 1)}\n`);
  const ids = Object.keys(result.stations);
  const boxCount = ids.reduce((n, id) => n + Object.keys(result.stations[id].boxes).length, 0);
  process.stdout.write(`[score-stations] ${ids.length} stations, ${boxCount} boxes -> ${OUT_PATH}\n`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) await main();
