/**
 * make-compare-sheet.mjs — before/after strips for the judged stations.
 *
 * One row per station: today's integration build on the left, this pass on the
 * right, at half size, with the station id burned in. This is for a HUMAN to
 * look at; the numbers live in score.json. Nothing here is a gate.
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const DAY = 'C:/Users/david/Desktop/stuff/aa-day-2026-09-06';
const BASE = `${DAY}/root-captures/forge-final/nuketown2`;
const CAND = process.argv[2] ?? `${DAY}/lanes/night-materials/captures/night-materials-1/nuketown2`;
const OUT = process.argv[3] ?? `${DAY}/lanes/night-materials/captures/compare`;

const STATIONS = [
  'nuketown2-into-sun-street', 'nuketown2-street-centre', 'nuketown2-vehicle-far',
  'nuketown2-front-porch', 'nuketown2-north-yard', 'nuketown2-south-yard',
  'nuketown2-border-path-close', 'nuketown2-perimeter-wall-long-close',
  'nuketown2-driveway-apron-close', 'nuketown2-garage', 'nuketown2-north-interior',
];

const W = 640, H = 360;
mkdirSync(OUT, { recursive: true });

const label = (text, w) => Buffer.from(
  `<svg width="${w}" height="26"><rect width="${w}" height="26" fill="#101014"/>` +
  `<text x="8" y="18" font-family="Consolas,monospace" font-size="14" fill="#c8d2e0">${text}</text></svg>`,
);

const rows = [];
for (const station of STATIONS) {
  const b = join(BASE, `${station}.png`);
  const c = join(CAND, `${station}.png`);
  if (!existsSync(b) || !existsSync(c)) { console.log(`skip ${station} (missing)`); continue; }
  const [bi, ci] = await Promise.all([
    sharp(b).resize(W, H, { fit: 'fill' }).toBuffer(),
    sharp(c).resize(W, H, { fit: 'fill' }).toBuffer(),
  ]);
  const row = await sharp({ create: { width: W * 2 + 6, height: H + 26, channels: 3, background: '#101014' } })
    .composite([
      { input: label(`${station}      LEFT: forge-final (today's build)      RIGHT: night-materials relief pass`, W * 2 + 6), top: 0, left: 0 },
      { input: bi, top: 26, left: 0 },
      { input: ci, top: 26, left: W + 6 },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
  const out = join(OUT, `${station}.compare.jpg`);
  await sharp(row).toFile(out);
  rows.push({ station, out, height: H + 26, width: W * 2 + 6 });
  console.log(`wrote ${out}`);
}

// One contact sheet of every row, stacked.
if (rows.length) {
  const width = rows[0].width;
  const height = rows.reduce((a, r) => a + r.height + 4, 0);
  const composites = [];
  let top = 0;
  for (const r of rows) { composites.push({ input: r.out, top, left: 0 }); top += r.height + 4; }
  await sharp({ create: { width, height, channels: 3, background: '#000000' } })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toFile(join(OUT, 'SHEET-night-materials.jpg'));
  console.log(`wrote ${join(OUT, 'SHEET-night-materials.jpg')}`);
}
