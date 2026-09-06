#!/usr/bin/env node
/**
 * HF-536 look-2a — BEFORE / AFTER / BOARD contact sheet.
 *
 * One row per station: our interim-2 frame, our candidate frame, and the
 * target board, all at the same camera, so the tonal move is judged against
 * the bar rather than against a memory of it.
 *
 * node scripts/forge/tonal-sheet.mjs --before <dir> --after <dir> --boards <dir> --out <file.jpg>
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BEFORE = resolve(arg('before', ''));
const AFTER = resolve(arg('after', ''));
const BOARDS = resolve(arg('boards', ''));
const OUT = resolve(arg('out', 'sheet.jpg'));

const STATIONS = (arg('stations', [
  'street-centre', 'nuke-street', 'into-sun-street', 'vehicle-near',
  'vehicle-mid', 'north-yard', 'south-yard', 'north-upper-window',
  'coach-elevation', 'front-porch', 'overhead', 'truck-cab-near',
].join(','))).split(',');

const CELL_W = 420;
const CELL_H = Math.round((720 / 1280) * CELL_W); // 236
const LABEL_H = 22;
const GUTTER = 6;
const ROW_H = CELL_H + LABEL_H + GUTTER;
const SHEET_W = CELL_W * 3 + GUTTER * 4;
const SHEET_H = ROW_H * STATIONS.length + LABEL_H + GUTTER;

const svgText = (text, w, h, size = 15) => Buffer.from(
  `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#101216"/>`
  + `<text x="8" y="${Math.round(h * 0.72)}" font-family="Consolas,monospace" font-size="${size}" fill="#e6e6e6">${
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`,
);

const composites = [];
composites.push({ input: svgText('HF-536 look-2a  |  LEFT interim-2 (before)   MIDDLE look-2a candidate (after)   RIGHT target board', SHEET_W, LABEL_H, 14), top: 0, left: 0 });

let y = LABEL_H + GUTTER;
for (const station of STATIONS) {
  const cells = [
    join(BEFORE, `nuketown2-${station}.png`),
    join(AFTER, `nuketown2-${station}.png`),
    join(BOARDS, `${station}.target.png`),
  ];
  composites.push({ input: svgText(`${station}`, SHEET_W, LABEL_H, 14), top: y, left: 0 });
  for (let c = 0; c < 3; c += 1) {
    if (!existsSync(cells[c])) continue;
    composites.push({
      input: await sharp(cells[c]).resize(CELL_W, CELL_H, { fit: 'fill' }).toBuffer(),
      top: y + LABEL_H,
      left: GUTTER + c * (CELL_W + GUTTER),
    });
  }
  y += ROW_H;
}

mkdirSync(dirname(OUT), { recursive: true });
await sharp({ create: { width: SHEET_W, height: SHEET_H, channels: 3, background: '#101216' } })
  .composite(composites).jpeg({ quality: 88 }).toFile(OUT);
console.log(`wrote ${OUT}  (${SHEET_W}x${SHEET_H}, ${STATIONS.length} stations)`);
