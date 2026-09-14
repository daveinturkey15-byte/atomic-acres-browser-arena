#!/usr/bin/env node
// ===========================================================================
// PERF HITL5 capture pair diff: two same-pose headless captures (the bisect
// harness screenshot at the spawn pose), one before and one after a material
// change. Prints the mean absolute per-channel difference over the frame and
// over a named station crop, and writes a downscaled side-by-side of the crop
// so the difference can be looked at, not just scored.
//
// USAGE
//   node scripts/qa/perf-hitl5-capture-diff.mjs --before a.png --after b.png \
//     [--crop x,y,w,h] [--out side-by-side.png]
// ===========================================================================
import sharp from 'sharp';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const before = resolve(arg('--before'));
const after = resolve(arg('--after'));
const crop = arg('--crop', null)?.split(',').map(Number) ?? null;
const out = arg('--out', null);

const stats = async (a, b, region) => {
  const load = async (file) => {
    let image = sharp(file).ensureAlpha();
    if (region) image = image.extract({ left: region[0], top: region[1], width: region[2], height: region[3] });
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    return { data, info };
  };
  const [x, y] = await Promise.all([load(a), load(b)]);
  if (x.info.width !== y.info.width || x.info.height !== y.info.height) throw new Error('size mismatch');
  let sum = 0; let over8 = 0; let over32 = 0; let n = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    const d = (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2])) / 3;
    sum += d; n += 1; if (d > 8) over8 += 1; if (d > 32) over32 += 1;
  }
  return { width: x.info.width, height: x.info.height, meanAbs: Number((sum / n).toFixed(2)), pctOver8: Number(((over8 / n) * 100).toFixed(1)), pctOver32: Number(((over32 / n) * 100).toFixed(1)) };
};

console.log(JSON.stringify({ frame: await stats(before, after, null), crop: crop ? await stats(before, after, crop) : null }, null, 2));
if (out && crop) {
  const tile = (file) => sharp(file).extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] }).resize({ width: 640 }).png().toBuffer();
  const [l, r] = await Promise.all([tile(before), tile(after)]);
  const meta = await sharp(l).metadata();
  await sharp({ create: { width: 1290, height: meta.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } })
    .composite([{ input: l, left: 0, top: 0 }, { input: r, left: 650, top: 0 }])
    .png().toFile(resolve(out));
  console.log(`wrote ${out}`);
}
