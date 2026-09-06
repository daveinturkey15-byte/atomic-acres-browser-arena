#!/usr/bin/env node
/**
 * HF-536 look-2a — "PALE" AS ONE NUMBER.
 *
 * Fraction of frame pixels that are simultaneously bright and colourless
 * (Rec.709 luma > 180 of 255 AND HSV saturation < 15%). That is exactly the
 * thing the owner called pale: a big area of the picture carrying brightness
 * without carrying colour. Measured on interim-2 (sha 805c102f) against the
 * per-station target boards: ours 24.9% of frame, the boards 7.9%.
 *
 * node scripts/forge/pale-wash.mjs --a <dirA/nuketown2-<station>.png> --b <boards dir> [--bsuffix .target.png]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const BOXES = require('./boxes.json');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const A = resolve(arg('a', '')); const B = resolve(arg('b', ''));
const BSUF = arg('bsuffix', '.target.png');

export const PALE_WASH_LUMA = 180;
export const PALE_WASH_SATURATION = 0.15;
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const sat = (r, g, b) => { const m = Math.max(r, g, b); return m ? (m - Math.min(r, g, b)) / m : 0; };

async function fraction(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let hit = 0; let total = 0;
  for (let i = 0; i < data.length; i += info.channels * 3) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    total += 1;
    if (luma(r, g, b) > PALE_WASH_LUMA && sat(r, g, b) < PALE_WASH_SATURATION) hit += 1;
  }
  return (hit / total) * 100;
}

let sa = 0; let sb = 0; let n = 0;
for (const id of Object.keys(BOXES.stations)) {
  const short = id.replace(/^nuketown2-/, '');
  const a = await fraction(join(A, `${id}.png`));
  const b = await fraction(join(B, `${short}${BSUF}`));
  sa += a; sb += b; n += 1;
  console.log(`${short.padEnd(26)} A ${a.toFixed(1).padStart(5)}%   B ${b.toFixed(1).padStart(5)}%   delta ${(a - b).toFixed(1).padStart(6)}`);
}
console.log(`MEAN pale-wash (luma>${PALE_WASH_LUMA} AND sat<${PALE_WASH_SATURATION * 100}%): A ${(sa / n).toFixed(1)}%   B ${(sb / n).toFixed(1)}%`);
