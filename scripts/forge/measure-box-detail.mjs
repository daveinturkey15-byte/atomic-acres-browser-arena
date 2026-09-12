/**
 * measure-box-detail.mjs — high-frequency detail energy per scoring box.
 *
 * WHY THIS EXISTS, and it is a correction to how this forge has been measuring.
 *
 * `score-stations.mjs` reports each box's luma stddev. That is the right number
 * for a VALUE change - a road getting darker, a wall getting a damp band. It is
 * the wrong number for a DETAIL change, and the night-materials relief pass is
 * the case that proves it: the aggregate, mortar and course relief are plainly
 * visible in the crops, and every declared box's stddev moved by under 10 %.
 *
 * The reason is that these boxes are large and already contain the scene's own
 * lighting gradient - the into-sun-street road box has a stddev of 76 because
 * half of it is a specular sun streak and half is shadow. A 22 mm stone
 * speckle riding on top of a 76-wide gradient cannot move the global stddev,
 * however loud it is to the eye. What it does move is the energy ABOVE the
 * gradient: the part of the image a blur would remove.
 *
 * So: subtract a box blur of radius `--radius` (default 3 px, i.e. features up
 * to ~7 px - the band a 22 mm stone at 10-25 m and a 5 mm mortar joint at 5-15 m
 * both live in) and report the standard deviation of what is left. That number
 * IS "how much surface detail is in this crop", it is blind to lighting and to
 * value drift, and it is the number a "detail is visible" claim should be made
 * against.
 *
 * Usage: node scripts/forge/measure-box-detail.mjs --a <dirA> --b <dirB> --boxes scripts/forge/boxes.json [--radius 3]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DIR_A = arg('--a', null);
const DIR_B = arg('--b', null);
const BOXES = JSON.parse(readFileSync(arg('--boxes', 'scripts/forge/boxes.json'), 'utf8'));
const RADIUS = Number(arg('--radius', '3'));

/** Luma plane of one crop. */
async function crop(path, rect) {
  const [left, top, width, height] = rect;
  const { data, info } = await sharp(path)
    .extract({ left, top, width, height })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const luma = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    luma[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  }
  return { luma, w: info.width, h: info.height };
}

/** stddev of (luma - boxblur(luma)) : energy the blur removes = surface detail. */
function detailEnergy({ luma, w, h }, r) {
  const blur = new Float64Array(w * h);
  // Separable box blur, clamped at the edges.
  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k += 1) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        s += luma[y * w + xx]; c += 1;
      }
      tmp[y * w + x] = s / c;
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k += 1) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        s += tmp[yy * w + x]; c += 1;
      }
      blur[y * w + x] = s / c;
    }
  }
  let mean = 0;
  const hp = new Float64Array(w * h);
  for (let i = 0; i < hp.length; i += 1) { hp[i] = luma[i] - blur[i]; mean += hp[i]; }
  mean /= hp.length;
  let v = 0;
  for (let i = 0; i < hp.length; i += 1) v += (hp[i] - mean) ** 2;
  return Math.sqrt(v / hp.length);
}

const rows = [];
for (const [station, def] of Object.entries(BOXES.stations)) {
  const a = join(DIR_A, 'nuketown2', `${station}.png`);
  const b = join(DIR_B, 'nuketown2', `${station}.png`);
  if (!existsSync(a) || !existsSync(b)) continue;
  for (const box of def.boxes ?? []) {
    const ea = detailEnergy(await crop(a, box.rect), RADIUS);
    const eb = detailEnergy(await crop(b, box.rect), RADIUS);
    rows.push({
      station, box: box.name, kind: box.kind, protected: box.protected === true,
      detailA: +ea.toFixed(3), detailB: +eb.toFixed(3),
      ratio: ea > 0.0005 ? +(eb / ea).toFixed(3) : null,
    });
  }
}
console.log(JSON.stringify(rows, null, 1));
