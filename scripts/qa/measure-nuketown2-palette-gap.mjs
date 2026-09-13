#!/usr/bin/env node
/**
 * measure-nuketown2-palette-gap.mjs — the PALETTE gap, per station, against the boards.
 *
 * WHY IT IS SHAPED THIS WAY.
 *
 * A mean saturation delta can be moved by a global saturation twist without changing a
 * single colour in the scene. The obvious fix - hue entropy over the most-saturated
 * pixels - is invariant to that twist but is NOT invariant to NOISE, and buying it with
 * noise makes the picture worse. Measured on nuketown2 interim-13, per-pixel hue jitter:
 *   pixel hue entropy 2.369 -> 2.750 at +/-10 deg -> 3.133 at +/-20 deg -> 3.675 at +/-40 deg
 * i.e. one noise term in one shader clears any plausible target and beats the reference.
 *
 * So the GATED metric is the BLOCK variant: 20 px blocks, each block's circular-MEAN hue,
 * histogram over the blocks whose median saturation is at or above the frame's own median
 * block saturation. Per-pixel noise averages out inside a block; a real palette change
 * moves whole blocks. Same frames, same jitter:
 *   block hue entropy 2.399 -> 2.415 -> 2.435 -> 2.495     (+0.016 at +/-10 deg)
 * and under a global saturation twist 0.75x / 1.00x / 1.30x: 2.423 / 2.399 / 2.454.
 * The pixel metric is still computed and REPORTED, as a diagnostic. It is never gated.
 *
 * The other three families are:
 *  - THE FIELD/ACCENT PAIR. Named fixed crops on named stations. The large FIELD surfaces
 *    (plaster, ceiling, road) must lose chroma while the ACCENT surface (the wood floor)
 *    gains it. A global twist moves both the same way, so it cannot pass both.
 *  - STREAK COHERENCE. A structure tensor over a flat wall crop AND over the ceiling crop.
 *    Directional wear on a surface the reference shows as isotropic mottle is a geometry/uv
 *    bug, not a colour one. The ceiling is measured because the drywall spec drives both,
 *    so a uv change can fix one and break the other.
 *  - LOCAL HUE NOISE. Mean |hue - local 8 px block-mean hue| inside a flat crop. Metre-scale
 *    coloured grime does not move it; per-pixel hue noise does. Measured: plaster ours 0.33
 *    deg, board 0.82 deg, ours + 10 deg jitter 4.95 deg.
 *
 * The per-station saturation delta is reported as a DISTRIBUTION (min/p25/median/p75/max
 * plus the count inside +/-25%), never as a mean, because a mean can improve while
 * individual stations get worse in both directions.
 *
 * Usage:
 *   node scripts/qa/measure-nuketown2-palette-gap.mjs --ours <dir> --boards <dir> \
 *     --out <json> [--crops-out <dir>]
 * Ours are  <dir>/nuketown2-<station>.png ; boards are <dir>/<station>.target.png.
 */
import { createRequire } from 'node:module';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OURS = resolve(arg('ours', ''));
const BOARDS = resolve(arg('boards', ''));
const OUT = resolve(arg('out', 'docs/forge/palette-gap.json'));
const CROPS_OUT = arg('crops-out', '');

const BLOCK = 20;          // px, the gated block size. Do not change it; the self-check depends on it.
const NOISE_BLOCK = 8;     // px, the local-hue-noise neighbourhood.

const satOf = (r, g, b) => { const mx = Math.max(r, g, b); return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx; };
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return null;
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
const round = (v, n = 3) => (Number.isFinite(v) ? Number(v.toFixed(n)) : null);
const entropyOf = (bins, n) => {
  let H = 0, cov = 0;
  for (const v of bins) { const p = v / Math.max(1, n); if (p > 0) H -= p * Math.log2(p); if (p >= 0.02) cov += 1; }
  return { H, cov };
};

async function raw(path, extract) {
  let img = sharp(path); if (extract) img = img.extract(extract);
  const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

/** DIAGNOSTIC ONLY: per-pixel adaptive hue entropy + whole-frame mean saturation. Stride 2. */
async function pixelStats(path) {
  const { data, w, h, ch } = await raw(path);
  const sats = []; const px = [];
  for (let y = 0; y < h; y += 2) {
    let i = y * w * ch;
    for (let x = 0; x < w; x += 2, i += ch * 2) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const s = satOf(r, g, b); sats.push(s); px.push([hueOf(r, g, b), s]);
    }
  }
  const sorted = [...sats].sort((a, b) => a - b);
  const thr = sorted[Math.floor(sorted.length * 0.5)];
  const bins = new Float64Array(36); let n = 0;
  for (const [hu, s] of px) { if (hu !== null && s >= thr) { bins[Math.min(35, Math.floor(hu / 10))] += 1; n += 1; } }
  const { H } = entropyOf(bins, n);
  return { meanSat: sats.reduce((a, b) => a + b, 0) / sats.length, hueEntropy: H };
}

/** GATED: 20 px blocks, circular-mean hue per block, adaptive threshold on block median saturation. */
async function blockStats(path) {
  const { data, w, h, ch } = await raw(path);
  const bx = Math.floor(w / BLOCK), by = Math.floor(h / BLOCK);
  const blocks = [];
  for (let b = 0; b < by; b += 1) for (let a = 0; a < bx; a += 1) {
    const hs = [], ss = [];
    for (let y = b * BLOCK; y < (b + 1) * BLOCK; y += 2) for (let x = a * BLOCK; x < (a + 1) * BLOCK; x += 2) {
      const i = (y * w + x) * ch;
      const r = data[i], g = data[i + 1], bl = data[i + 2];
      const hu = hueOf(r, g, bl);
      if (hu !== null) hs.push(hu);
      ss.push(satOf(r, g, bl));
    }
    if (!hs.length) continue;
    let sx = 0, sy = 0;
    for (const hu of hs) { sx += Math.cos(hu * Math.PI / 180); sy += Math.sin(hu * Math.PI / 180); }
    const mean = (Math.atan2(sy, sx) * 180 / Math.PI + 360) % 360;
    ss.sort((p, q) => p - q);
    blocks.push([mean, ss[Math.floor(ss.length / 2)]]);
  }
  const sats = blocks.map((v) => v[1]).sort((p, q) => p - q);
  const thr = sats[Math.floor(sats.length * 0.5)];
  const bins = new Float64Array(36); let n = 0;
  for (const [hu, s] of blocks) { if (s >= thr) { bins[Math.min(35, Math.floor(hu / 10))] += 1; n += 1; } }
  const { H, cov } = entropyOf(bins, n);
  return { hueEntropy: H, hueCoverage: cov, blocks: blocks.length };
}

/** Mean HSV saturation and value over one fixed crop. */
async function patchStats(path, [left, top, width, height]) {
  const { data, ch } = await raw(path, { left, top, width, height });
  let S = 0, V = 0, n = 0;
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    S += satOf(r, g, b); V += Math.max(r, g, b) / 255; n += 1;
  }
  return { sat: S / n, val: V / n };
}

/** Mean |hue - local block-mean hue|, degrees, over one crop. The noise guard. */
async function localHueNoise(path, [left, top, width, height]) {
  const { data, w, h, ch } = await raw(path, { left, top, width, height });
  const B = NOISE_BLOCK;
  let acc = 0, cnt = 0;
  for (let by = 0; by + B <= h; by += B) for (let bx = 0; bx + B <= w; bx += B) {
    const hs = [];
    for (let y = by; y < by + B; y += 1) for (let x = bx; x < bx + B; x += 1) {
      const i = (y * w + x) * ch;
      const hu = hueOf(data[i], data[i + 1], data[i + 2]);
      if (hu !== null) hs.push(hu);
    }
    if (hs.length < 8) continue;
    let sx = 0, sy = 0;
    for (const hu of hs) { sx += Math.cos(hu * Math.PI / 180); sy += Math.sin(hu * Math.PI / 180); }
    const mean = Math.atan2(sy, sx) * 180 / Math.PI;
    for (const hu of hs) { acc += Math.abs(((hu - mean + 540) % 360) - 180); cnt += 1; }
  }
  return cnt ? acc / cnt : null;
}

/** Structure-tensor coherence over one crop. 0 = isotropic mottle, 1 = a perfect stripe. */
async function coherence(path, [left, top, width, height]) {
  const { data, info } = await sharp(path).extract({ left, top, width, height })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let Jxx = 0, Jyy = 0, Jxy = 0, n = 0;
  for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
    const gx = (data[y * W + x + 1] - data[y * W + x - 1]) / 2;
    const gy = (data[(y + 1) * W + x] - data[(y - 1) * W + x]) / 2;
    Jxx += gx * gx; Jyy += gy * gy; Jxy += gx * gy; n += 1;
  }
  Jxx /= n; Jyy /= n; Jxy /= n;
  const t = Jxx + Jyy, d = Math.sqrt((Jxx - Jyy) ** 2 + 4 * Jxy * Jxy);
  let featureAngle = 0.5 * Math.atan2(2 * Jxy, Jxx - Jyy) * 180 / Math.PI + 90;
  while (featureAngle > 90) featureAngle -= 180;
  while (featureAngle < -90) featureAngle += 180;
  return { coherence: t > 1e-9 ? d / t : 0, featureAngle };
}

/** The named FIELD/ACCENT surfaces. Crops are [left, top, width, height] at 1280x720. */
const SURFACES = [
  { id: 'plaster', role: 'field',  station: 'south-interior', crop: [700, 200, 400, 180], noise: true },
  { id: 'ceiling', role: 'field',  station: 'south-interior', crop: [400,  20, 500,  60], noise: false },
  { id: 'road',    role: 'field',  station: 'street-centre',  crop: [150, 560, 300,  80], noise: true },
  { id: 'floor',   role: 'accent', station: 'south-interior', crop: [300, 650, 250,  50], noise: false },
];
const STREAKS = [
  { id: 'wall',    station: 'south-interior', crop: [600, 170, 600, 420] },
  { id: 'ceiling', station: 'south-interior', crop: [400,  20, 500,  60] },
];
/** Reported, but EXCLUDED from the pass/fail aggregate — the reflections lane owns these. FIVE. */
const VEHICLE_STATIONS = new Set(['vehicle-near', 'vehicle-mid', 'vehicle-far', 'truck-cab-near', 'coach-elevation']);

const oursPath  = (s) => join(OURS, `nuketown2-${s}.png`);
const boardPath = (s) => join(BOARDS, `${s}.target.png`);

const stations = readdirSync(OURS)
  .filter((f) => f.endsWith('.png') && !f.includes('.s1.'))
  .map((f) => f.replace(/^nuketown2-/, '').replace(/\.png$/, ''))
  .filter((s) => existsSync(boardPath(s)))
  .sort();

const perStation = {};
for (const s of stations) {
  const ob = await blockStats(oursPath(s));
  const bb = await blockStats(boardPath(s));
  const op = await pixelStats(oursPath(s));
  const bp = await pixelStats(boardPath(s));
  perStation[s] = {
    vehicle: VEHICLE_STATIONS.has(s),
    blockHueEntropyOurs: round(ob.hueEntropy), blockHueEntropyBoard: round(bb.hueEntropy),
    blockHueEntropyDelta: round(ob.hueEntropy - bb.hueEntropy),
    blockCoverageOurs: ob.hueCoverage, blockCoverageBoard: bb.hueCoverage,
    pixelHueEntropyOurs: round(op.hueEntropy), pixelHueEntropyBoard: round(bp.hueEntropy),
    pixelHueEntropyDelta: round(op.hueEntropy - bp.hueEntropy),
    meanSatOurs: round(op.meanSat, 4), meanSatBoard: round(bp.meanSat, 4),
    satDeltaPct: round(((op.meanSat - bp.meanSat) / bp.meanSat) * 100, 1),
  };
}

const surfaces = {}; const noise = {};
if (CROPS_OUT) mkdirSync(resolve(CROPS_OUT), { recursive: true });
for (const s of SURFACES) {
  if (!existsSync(oursPath(s.station))) continue;
  const [left, top, width, height] = s.crop;
  const o = await patchStats(oursPath(s.station), s.crop);
  const b = await patchStats(boardPath(s.station), s.crop);
  surfaces[s.id] = {
    role: s.role, station: s.station, crop: s.crop,
    satOurs: round(o.sat), satBoard: round(b.sat),
    valOurs: round(o.val, 2), valBoard: round(b.val, 2),
    satDelta: round(o.sat - b.sat),
  };
  if (s.noise) {
    noise[s.id] = {
      station: s.station, crop: s.crop,
      localOurs: round(await localHueNoise(oursPath(s.station), s.crop), 2),
      localBoard: round(await localHueNoise(boardPath(s.station), s.crop), 2),
    };
  }
  if (CROPS_OUT) {
    await sharp(oursPath(s.station)).extract({ left, top, width, height })
      .png().toFile(join(resolve(CROPS_OUT), `${s.id}-ours.png`));
    await sharp(boardPath(s.station)).extract({ left, top, width, height })
      .png().toFile(join(resolve(CROPS_OUT), `${s.id}-board.png`));
  }
}

const streak = {};
for (const st of STREAKS) {
  const so = await coherence(oursPath(st.station), st.crop);
  const sb = await coherence(boardPath(st.station), st.crop);
  streak[st.id] = {
    station: st.station, crop: st.crop,
    coherenceOurs: round(so.coherence), coherenceBoard: round(sb.coherence),
    featureAngleOurs: round(so.featureAngle, 1), featureAngleBoard: round(sb.featureAngle, 1),
  };
}

const judged = (pred) => Object.entries(perStation).filter(([, v]) => pred(v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };

function aggregate(rows, label) {
  const dB = rows.map(([, v]) => v.blockHueEntropyDelta);
  const dS = rows.map(([, v]) => v.satDeltaPct);
  const worstB = rows.reduce((a, r) => (a === null || r[1].blockHueEntropyDelta < a[1].blockHueEntropyDelta ? r : a), null);
  const worstS = rows.reduce((a, r) => (a === null || Math.abs(r[1].satDeltaPct) > Math.abs(a[1].satDeltaPct) ? r : a), null);
  return {
    label, stations: rows.length,
    meanBlockHueEntropyOurs: round(mean(rows.map(([, v]) => v.blockHueEntropyOurs))),
    meanBlockHueEntropyBoard: round(mean(rows.map(([, v]) => v.blockHueEntropyBoard))),
    meanBlockHueEntropyDelta: round(mean(dB)),
    blockDeficitOver0_30: dB.filter((v) => v < -0.30).length,
    worstBlockDeficit: worstB ? round(worstB[1].blockHueEntropyDelta) : null,
    worstBlockDeficitStation: worstB ? worstB[0] : null,
    meanPixelHueEntropyOurs: round(mean(rows.map(([, v]) => v.pixelHueEntropyOurs))),
    meanPixelHueEntropyBoard: round(mean(rows.map(([, v]) => v.pixelHueEntropyBoard))),
    meanSatDeltaPct: round(mean(dS), 1),
    satDeltaPctMin: q(dS, 0), satDeltaPctP25: q(dS, 0.25), satDeltaPctMedian: q(dS, 0.5),
    satDeltaPctP75: q(dS, 0.75), satDeltaPctMax: q(dS, 0.999),
    satDeltaPctWithin25: dS.filter((v) => Math.abs(v) <= 25).length,
    satDeltaPctWithin15: dS.filter((v) => Math.abs(v) <= 15).length,
    worstSatDeltaPct: worstS ? worstS[1].satDeltaPct : null,
    worstSatDeltaPctStation: worstS ? worstS[0] : null,
  };
}

const summary = {
  all: aggregate(judged(() => true), 'all-stations (DIAGNOSTIC)'),
  gated: aggregate(judged((v) => !v.vehicle), 'non-vehicle (THE PASS/FAIL SET)'),
  surfaces, noise, streak,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), ours: OURS, boards: BOARDS, summary, perStation }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${OUT}`);
