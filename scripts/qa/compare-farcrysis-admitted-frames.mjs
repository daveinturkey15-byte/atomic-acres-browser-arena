/**
 * compare-farcrysis-admitted-frames.mjs — PASS 84 lane C.
 *
 * Compares the admission frames the farcrysis boot probe captures, with a
 * SIGNED metric. The lane's first comparison used an unsigned "% of pixels
 * differing by more than 16" figure, which is structurally blind to a
 * one-directional change: foliage that MOVED and foliage that got BRIGHTER
 * score the same. That blindness hid a real regression (foliage shadow
 * casters NaN'd by a materialReference in the position node), so the
 * comparison reports, per pair and per tile:
 *
 *   mean signed luminance, % of pixels brighter by >8, % darker by >8,
 *   the old unsigned % for continuity, and a 6x8 tile grid of mean signed
 *   luminance so a band of the frame (canopy, ground, sky) can be read alone.
 *
 * A same-build CONTROL pair is always compared first: the wind is time-driven,
 * so no two frames of one build match either, and the control is what "no
 * change" actually looks like on this instrument.
 *
 * Usage (from the worktree root, so `sharp` resolves):
 *   node scripts/qa/compare-farcrysis-admitted-frames.mjs
 */
import sharp from 'sharp';
const dir = 'artifacts/qa/farcrysis-load/';
const load = async (f) => {
  const { data, info } = await sharp(dir + f).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, c: info.channels };
};
const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
async function cmp(a, b) {
  const A = await load(a), B = await load(b);
  if (A.w !== B.w || A.h !== B.h) throw new Error('size mismatch');
  const TX = 8, TY = 6;
  const tiles = Array.from({ length: TY }, () => Array.from({ length: TX }, () => ({ s: 0, n: 0 })));
  let sum = 0, n = 0, brighter = 0, darker = 0, diff16 = 0;
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * A.c;
      const d = lum(B.data, i) - lum(A.data, i);
      sum += d; n++;
      if (d > 8) brighter++; else if (d < -8) darker++;
      if (Math.abs(B.data[i] - A.data[i]) > 16 || Math.abs(B.data[i+1] - A.data[i+1]) > 16 || Math.abs(B.data[i+2] - A.data[i+2]) > 16) diff16++;
      const t = tiles[Math.min(TY - 1, Math.floor(y / (A.h / TY)))][Math.min(TX - 1, Math.floor(x / (A.w / TX)))];
      t.s += d; t.n++;
    }
  }
  const grid = tiles.map((row) => row.map((t) => (t.s / t.n).toFixed(2).padStart(6)).join(' '));
  return {
    pair: `${a} -> ${b}`,
    meanSignedLum: +(sum / n).toFixed(4),
    pctBrighter8: +((brighter / n) * 100).toFixed(2),
    pctDarker8: +((darker / n) * 100).toFixed(2),
    pctAnyChannelDiff16: +((diff16 / n) * 100).toFixed(2),
    tileGrid6x8: grid,
  };
}
// Pairs may be given as `a.png:b.png` arguments; the defaults are the PASS 84
// lane-C set, CONTROL (two runs of one build) first.
const pairs = process.argv.slice(2).filter((a) => a.includes(':')).map((a) => a.split(':'));
const defaults = [
  ['after-3-admitted.png', 'after-4-admitted.png'],           // CONTROL: same build, two runs
  ['before-foliage-admitted.png', 'after-3-admitted.png'],
  ['before-foliage-admitted.png', 'after-4-admitted.png'],
];
const out = [];
for (const [a, b] of pairs.length ? pairs : defaults) out.push(await cmp(a, b));
for (const r of out) {
  console.log('\n=== ' + r.pair + ' ===');
  console.log('mean signed luminance:', r.meanSignedLum, '| %brighter>8:', r.pctBrighter8, '| %darker>8:', r.pctDarker8, '| %anyChannel>16:', r.pctAnyChannelDiff16);
  console.log('per-tile mean signed luminance (6 rows x 8 cols, top->bottom):');
  for (const row of r.tileGrid6x8) console.log('  ' + row);
}
