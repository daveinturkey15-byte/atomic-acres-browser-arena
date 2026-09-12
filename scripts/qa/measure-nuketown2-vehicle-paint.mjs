#!/usr/bin/env node
/**
 * CPU-only vehicle-paint scorer.
 *
 * Usage:
 *   node scripts/qa/measure-nuketown2-vehicle-paint.mjs \
 *     --arena nuketown2 --ours <dir> --boards <dir> \
 *     --stations vehicle-near,garage --rects <json> --out <json>
 *
 * The instrument deliberately measures displayed PNGs, not renderer internals.
 * Structural metrics use a 3x3 box blur and a 4-pixel stride so a high-frequency
 * noise term cannot masquerade as authored geometry or shading.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

export const AUTHORING_FRAME = Object.freeze({ width: 1280, height: 720 });
export const BLUE_MASK = Object.freeze({ hueMin: 210, hueMax: 285, saturationMin: 0.55, valueMin: 0.15 });

export const DEFAULT_RECTS = Object.freeze({
  'vehicle-near': Object.freeze({
    doorPanel: Object.freeze({ ours: [520, 370, 120, 60], boards: [520, 340, 120, 60] }),
    frontFascia: Object.freeze({ ours: [960, 300, 200, 90], boards: [960, 300, 200, 90] }),
  }),
  garage: Object.freeze({
    lowerSlab: Object.freeze({ ours: [200, 570, 880, 140], boards: [200, 570, 880, 140] }),
    midBand: Object.freeze({ ours: [420, 325, 460, 60], boards: [420, 325, 460, 60] }),
    midFloor: Object.freeze({ ours: [250, 410, 780, 130], boards: [250, 410, 780, 130] }),
  }),
  'coach-elevation': Object.freeze({
    roadLower: Object.freeze({ ours: [150, 530, 750, 170], boards: [150, 530, 750, 170] }),
  }),
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function round(value, places = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value ?? null;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function percentile(values, percent) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((percent / 100) * (sorted.length - 1))));
  return sorted[index];
}

export function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function rgbToHsv(r8, g8, b8) {
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
  }
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

function hsvInBlueMask(hsv) {
  return hsv.hue >= BLUE_MASK.hueMin
    && hsv.hue <= BLUE_MASK.hueMax
    && hsv.saturation >= BLUE_MASK.saturationMin
    && hsv.value >= BLUE_MASK.valueMin;
}

function rgbIndex(image, x, y) {
  return (y * image.width + x) * image.channels;
}

export function getRgb(image, x, y) {
  const index = rgbIndex(image, x, y);
  return [image.data[index] ?? 0, image.data[index + 1] ?? 0, image.data[index + 2] ?? 0];
}

function scaledRect(image, rect, label) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} has an invalid rect`);
  }
  const [x, y, width, height] = rect;
  const sx = image.width / AUTHORING_FRAME.width;
  const sy = image.height / AUTHORING_FRAME.height;
  const startX = Math.round(x * sx);
  const startY = Math.round(y * sy);
  const endX = Math.round((x + width) * sx);
  const endY = Math.round((y + height) * sy);
  if (startX < 0 || startY < 0 || endX > image.width || endY > image.height || startX >= endX || startY >= endY) {
    throw new Error(`${label} [${rect.join(',')}] is outside ${image.width}x${image.height}`);
  }
  return { startX, startY, endX, endY };
}

function bounded(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function blurredRgb(image, x, y) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const px = bounded(x + ox, 0, image.width - 1);
      const py = bounded(y + oy, 0, image.height - 1);
      const [pr, pg, pb] = getRgb(image, px, py);
      r += pr;
      g += pg;
      b += pb;
      count += 1;
    }
  }
  return [r / count, g / count, b / count];
}

function pixelsInRect(image, rect, label) {
  const bounds = scaledRect(image, rect, label);
  const pixels = [];
  for (let y = bounds.startY; y < bounds.endY; y += 1) {
    for (let x = bounds.startX; x < bounds.endX; x += 1) pixels.push(getRgb(image, x, y));
  }
  return { bounds, pixels };
}

function circularMeanHue(hues) {
  if (!hues.length) return null;
  let sin = 0;
  let cos = 0;
  for (const hue of hues) {
    const radians = (hue * Math.PI) / 180;
    sin += Math.sin(radians);
    cos += Math.cos(radians);
  }
  let result = (Math.atan2(sin, cos) * 180) / Math.PI;
  if (result < 0) result += 360;
  return result;
}

function distinctRgb(pixels) {
  const values = new Set();
  for (const [r, g, b] of pixels) values.add((r << 16) | (g << 8) | b);
  return values.size;
}

function distinctQuantized(pixels) {
  const values = new Set();
  for (const [r, g, b] of pixels) values.add(((Math.round(r) >> 4) << 8) | ((Math.round(g) >> 4) << 4) | (Math.round(b) >> 4));
  return values.size;
}

function rawEdgeDensity(image, bounds) {
  let edges = 0;
  let possible = 0;
  for (let y = bounds.startY; y < bounds.endY - 1; y += 1) {
    for (let x = bounds.startX; x < bounds.endX - 1; x += 1) {
      const [r, g, b] = getRgb(image, x, y);
      const [rx, gx, bx] = getRgb(image, x + 1, y);
      const [ry, gy, by] = getRgb(image, x, y + 1);
      if (Math.abs(luma(r, g, b) - luma(rx, gx, bx)) + Math.abs(luma(r, g, b) - luma(ry, gy, by)) > 8) edges += 1;
      possible += 1;
    }
  }
  return possible ? edges / possible : 0;
}

export function structuralStats(image, rect, label = 'rect') {
  const bounds = scaledRect(image, rect, label);
  const blurred = [];
  for (let y = bounds.startY; y < bounds.endY; y += 1) {
    for (let x = bounds.startX; x < bounds.endX; x += 1) blurred.push(blurredRgb(image, x, y));
  }
  const blurredLuma = blurred.map(([r, g, b]) => luma(r, g, b));
  const third = Math.max(1, Math.floor((bounds.endY - bounds.startY) / 3));
  const top = [];
  const bottom = [];
  for (let y = bounds.startY; y < bounds.endY; y += 1) {
    if (y < bounds.startY + third) {
      for (let x = bounds.startX; x < bounds.endX; x += 1) top.push(luma(...blurredRgb(image, x, y)));
    } else if (y >= bounds.endY - third) {
      for (let x = bounds.startX; x < bounds.endX; x += 1) bottom.push(luma(...blurredRgb(image, x, y)));
    }
  }
  let edges = 0;
  let possible = 0;
  for (let y = bounds.startY; y < bounds.endY - 4; y += 4) {
    for (let x = bounds.startX; x < bounds.endX - 4; x += 4) {
      const a = luma(...blurredRgb(image, x, y));
      const dx = luma(...blurredRgb(image, x + 4, y));
      const dy = luma(...blurredRgb(image, x, y + 4));
      if (Math.abs(a - dx) + Math.abs(a - dy) > 8) edges += 1;
      possible += 1;
    }
  }
  const topMean = top.length ? top.reduce((sum, value) => sum + value, 0) / top.length : null;
  const bottomMean = bottom.length ? bottom.reduce((sum, value) => sum + value, 0) / bottom.length : null;
  return {
    coarseEdgeDensity: possible ? edges / possible : 0,
    lumaP5: percentile(blurredLuma, 5),
    lumaP50: percentile(blurredLuma, 50),
    lumaP95: percentile(blurredLuma, 95),
    lumaSpread: percentile(blurredLuma, 95) - percentile(blurredLuma, 5),
    verticalShadingGradient: topMean === null || bottomMean === null ? null : topMean - bottomMean,
    distinctQuantized: distinctQuantized(blurred),
  };
}

export function blueMaskStats(image) {
  const pixels = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const rgb = getRgb(image, x, y);
      const hsv = rgbToHsv(...rgb);
      if (hsvInBlueMask(hsv)) pixels.push({ rgb, hsv });
    }
  }
  const meanR = mean(pixels.map(({ rgb }) => rgb[0]));
  const meanG = mean(pixels.map(({ rgb }) => rgb[1]));
  const hues = pixels.map(({ hsv }) => hsv.hue).sort((a, b) => a - b);
  const saturations = pixels.map(({ hsv }) => hsv.saturation);
  return {
    pixelPercent: pixels.length / (image.width * image.height) * 100,
    pixelCount: pixels.length,
    meanRgb: { r: meanR, g: meanG, b: mean(pixels.map(({ rgb }) => rgb[2])) },
    meanSaturation: mean(saturations),
    hueP25: percentile(hues, 25),
    hueP50: percentile(hues, 50),
    hueP75: percentile(hues, 75),
    hueWidth: pixels.length ? percentile(hues, 75) - percentile(hues, 25) : null,
    hueCircularMean: circularMeanHue(hues),
    saturationP50: percentile(saturations, 50),
    saturationP90: percentile(saturations, 90),
    meanGreenOverRed: meanR === null || meanR === 0 ? null : meanG / meanR,
  };
}

export function rectRawStats(image, rect, label = 'rect') {
  const { bounds, pixels } = pixelsInRect(image, rect, label);
  const hues = pixels.map(([r, g, b]) => rgbToHsv(r, g, b).hue);
  const saturations = pixels.map(([r, g, b]) => rgbToHsv(r, g, b).saturation);
  const lumas = pixels.map(([r, g, b]) => luma(r, g, b));
  return {
    meanRgb: { r: mean(pixels.map(([r]) => r)), g: mean(pixels.map(([, g]) => g)), b: mean(pixels.map(([, , b]) => b)) },
    circularMeanHue: circularMeanHue(hues),
    saturationP50: percentile(saturations, 50),
    saturationP90: percentile(saturations, 90),
    lumaP5: percentile(lumas, 5),
    lumaP50: percentile(lumas, 50),
    lumaP95: percentile(lumas, 95),
    distinctRgb: distinctRgb(pixels),
    edgeDensity: rawEdgeDensity(image, bounds),
  };
}

export function rosterAggregate(rows) {
  const keys = ['pixelPercent', 'meanSaturation', 'hueP25', 'hueP50', 'hueP75', 'hueWidth', 'saturationP50', 'saturationP90', 'meanGreenOverRed'];
  return Object.fromEntries(keys.map((key) => [key, mean(rows.map((row) => row[key]).filter((value) => Number.isFinite(value)))]));
}

export function shadowPlateauStats(image) {
  let plateau = 0;
  let below = 0;
  const total = image.width * image.height;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b] = getRgb(image, x, y);
      const value = luma(r, g, b);
      if (value >= 18.5 && value <= 20.5) plateau += 1;
      if (value < 18.5) below += 1;
    }
  }
  return { plateauPercent: plateau / total * 100, belowPercent: below / total * 100 };
}

export function wholeFrameDistinctStats(image) {
  const raw = [];
  const blurred = [];
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      raw.push(getRgb(image, x, y));
      blurred.push(blurredRgb(image, x, y));
    }
  }
  return { raw: distinctRgb(raw), blurredQuantized: distinctQuantized(blurred) };
}

function parseArgs(argv) {
  const values = { arena: 'nuketown2', stations: null, rects: null };
  const allowed = new Set(['arena', 'ours', 'boards', 'stations', 'rects', 'out']);
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected positional argument ${token}`);
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`unknown flag --${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    values[key] = value;
    i += 1;
  }
  for (const key of ['ours', 'boards', 'out']) if (!values[key]) throw new Error(`missing required flag --${key}`);
  return values;
}

function cloneRects(rects) {
  return JSON.parse(JSON.stringify(rects));
}

function loadRects(args) {
  if (!args.rects) return cloneRects(DEFAULT_RECTS);
  const loaded = JSON.parse(readFileSync(resolve(args.rects), 'utf8'));
  return loaded.rects ?? loaded;
}

function stationName(arena, value) {
  return value.startsWith(`${arena}-`) ? value : `${arena}-${value}`;
}

function discoverStations(arena, oursDir) {
  return readdirSync(oursDir)
    .filter((name) => name.startsWith(`${arena}-`) && name.endsWith('.png') && !/\.s\d+\.png$/.test(name))
    .map((name) => basename(name, '.png').slice(arena.length + 1))
    .sort();
}

async function readImage(filePath) {
  const { data, info } = await sharp(filePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function imagePath(directory, names) {
  for (const name of names) {
    const candidate = join(directory, name);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`missing image in ${directory}: ${names.join(' or ')}`);
}

async function scorePair(ours, board, station, rectCatalog) {
  const oursBlue = blueMaskStats(ours);
  const boardBlue = blueMaskStats(board);
  const rects = rectCatalog[station] ?? {};
  const rectResults = {};
  for (const [name, entry] of Object.entries(rects)) {
    const oursRect = entry.ours ?? entry;
    const boardRect = entry.boards ?? entry;
    rectResults[name] = {
      ours: {
        raw: rectRawStats(ours, oursRect, `${station}/${name}/ours`),
        structural: structuralStats(ours, oursRect, `${station}/${name}/ours`),
      },
      board: {
        raw: rectRawStats(board, boardRect, `${station}/${name}/boards`),
        structural: structuralStats(board, boardRect, `${station}/${name}/boards`),
      },
      rects: { ours: oursRect, boards: boardRect },
    };
  }
  return {
    station,
    blueMask: { ours: oursBlue, boards: boardBlue },
    rects: rectResults,
    shadowPlateau: { ours: shadowPlateauStats(ours), boards: shadowPlateauStats(board) },
    wholeFrameDistinct: { ours: wholeFrameDistinctStats(ours), boards: wholeFrameDistinctStats(board) },
  };
}

export async function measureVehiclePaint(args) {
  const arena = args.arena ?? 'nuketown2';
  const oursDir = resolve(args.ours);
  const boardsDir = resolve(args.boards);
  const stations = args.stations
    ? args.stations.split(',').map((value) => value.trim()).filter(Boolean).map((value) => value.startsWith(`${arena}-`) ? value.slice(arena.length + 1) : value)
    : discoverStations(arena, oursDir);
  const rectCatalog = loadRects(args);
  const rows = [];
  for (const station of stations) {
    const full = stationName(arena, station);
    const oursPath = imagePath(oursDir, [`${full}.png`, `${station}.png`]);
    const boardPath = imagePath(boardsDir, [`${station}.target.png`, `${full}.target.png`]);
    rows.push(await scorePair(await readImage(oursPath), await readImage(boardPath), station, rectCatalog));
  }
  const rosterNames = ['vehicle-near', 'vehicle-mid', 'truck-cab-near', 'coach-elevation', 'nuke-street'];
  const roster = {
    definition: 'unweighted mean of the five per-station blue-mask values; never pooled pixels',
    stations: rosterNames,
    ours: rosterAggregate(rosterNames.map((name) => rows.find((row) => row.station === name)?.blueMask.ours).filter(Boolean)),
    boards: rosterAggregate(rosterNames.map((name) => rows.find((row) => row.station === name)?.blueMask.boards).filter(Boolean)),
    perStation: Object.fromEntries(rosterNames.map((name) => {
      const row = rows.find((candidate) => candidate.station === name);
      return [name, row ? { ours: row.blueMask.ours, boards: row.blueMask.boards } : null];
    })),
  };
  return {
    version: 1,
    arena,
    authoringFrame: AUTHORING_FRAME,
    mask: BLUE_MASK,
    rectMetricDefinition: 'raw continuity metrics are unblurred; structural acceptance metrics use a 3x3 box blur, 4-pixel stride and |dLx|+|dLy| > 8',
    stations: rows,
    roster,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await measureVehiclePaint(args);
  writeFileSync(resolve(args.out), `${JSON.stringify(result, null, 2)}\n`);
  const summary = {
    arena: result.arena,
    stations: Object.keys(result.stations).length,
    roster: { ours: result.roster.ours, boards: result.roster.boards },
    out: resolve(args.out),
  };
  console.log(JSON.stringify(summary, null, 2));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`[vehicle-paint] ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
