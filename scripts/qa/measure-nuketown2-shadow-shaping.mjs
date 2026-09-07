#!/usr/bin/env node
/**
 * CPU-only shadow-shaping scorer for authored arena captures.
 *
 * Usage:
 *   node scripts/qa/measure-nuketown2-shadow-shaping.mjs \
 *     --arena nuketown2 --ours <capture-dir> --boards <board-dir> --out <json>
 *
 * The default arena keeps the lane's established command short; pass another
 * arena id to reuse the instrument against any matching station catalog.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const SHAPING_KINDS = new Set(['ground', 'wall', 'siding', 'roof', 'cream', 'subject']);
const AUTHORING_FRAME = { width: 1280, height: 720 };
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function fail(message) {
  console.error(`[shadow-shaping] ERROR: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const values = {
    arena: 'nuketown2',
    boxes: join(REPO_ROOT, 'scripts', 'forge', 'boxes.json'),
  };
  const allowed = new Set(['arena', 'boxes', 'ours', 'boards', 'out']);
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
  for (const key of ['ours', 'boards', 'out']) {
    if (!values[key]) throw new Error(`missing required flag --${key}`);
  }
  return values;
}

function percentile(sorted, percent) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((percent / 100) * (sorted.length - 1))));
  return sorted[index];
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

async function readImage(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function validateRect(rect, station, boxName) {
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isFinite(value))) {
    throw new Error(`${station}/${boxName} has an invalid rect`);
  }
  const [x, y, width, height] = rect;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > AUTHORING_FRAME.width || y + height > AUTHORING_FRAME.height) {
    throw new Error(`${station}/${boxName} is outside the ${AUTHORING_FRAME.width}x${AUTHORING_FRAME.height} authoring frame`);
  }
}

function boxStats(image, rect) {
  const [x0, y0, width, height] = rect;
  const sx = image.width / AUTHORING_FRAME.width;
  const sy = image.height / AUTHORING_FRAME.height;
  const startX = Math.round(x0 * sx);
  const endX = Math.round((x0 + width) * sx);
  const startY = Math.round(y0 * sy);
  const endY = Math.round((y0 + height) * sy);
  if (startX < 0 || startY < 0 || endX > image.width || endY > image.height || startX >= endX || startY >= endY) {
    throw new Error(`scaled box [${rect.join(',')}] is outside ${image.width}x${image.height}`);
  }
  const values = [];
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * image.width + x) * image.channels;
      values.push(luma(image.data[index], image.data[index + 1], image.data[index + 2]));
    }
  }
  if (!values.length) throw new Error(`box [${rect.join(',')}] contains no pixels`);
  values.sort((a, b) => a - b);
  const p10 = percentile(values, 10);
  const p50 = percentile(values, 50);
  const p90 = percentile(values, 90);
  const threshold = 0.72 * p90;
  let below = 0;
  for (const value of values) if (value < threshold) below += 1;
  return {
    p10,
    p50,
    p90,
    keyContrast: p90 / Math.max(p10, 1),
    shadeFraction: below / values.length,
  };
}

function mean(values) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null;
}

function roundedStats(stats) {
  return Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, Number(value.toFixed(3))]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const boxesPath = resolve(args.boxes);
  const oursDir = resolve(args.ours);
  const boardsDir = resolve(args.boards);
  const outPath = resolve(args.out);
  if (!existsSync(boxesPath)) throw new Error(`boxes file not found: ${boxesPath}`);
  if (!existsSync(oursDir)) throw new Error(`ours directory not found: ${oursDir}`);
  if (!existsSync(boardsDir)) throw new Error(`boards directory not found: ${boardsDir}`);

  const catalog = JSON.parse(readFileSync(boxesPath, 'utf8'));
  const prefix = `${args.arena}-`;
  const stationEntries = Object.entries(catalog.stations ?? {})
    .filter(([station]) => station.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));
  if (!stationEntries.length) throw new Error(`no stations found for arena ${args.arena}`);

  const perStation = [];
  for (const [station, stationData] of stationEntries) {
    const bare = station.slice(prefix.length);
    const selected = (stationData.boxes ?? [])
      .filter((box) => SHAPING_KINDS.has(box.kind))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!selected.length) throw new Error(`${station} has no shaping boxes`);
    for (const box of selected) validateRect(box.rect, station, box.name);
    const oursPath = join(oursDir, `${station}.png`);
    const boardPath = join(boardsDir, `${bare}.target.png`);
    if (!existsSync(oursPath)) throw new Error(`missing ours station: ${oursPath}`);
    if (!existsSync(boardPath)) throw new Error(`missing board station: ${boardPath}`);
    const [ours, board] = await Promise.all([readImage(oursPath), readImage(boardPath)]);
    const ground = [];
    const allSurface = [];
    const boxRows = [];
    for (const box of selected) {
      const oursStats = boxStats(ours, box.rect);
      const boardStats = boxStats(board, box.rect);
      const row = { kind: box.kind, name: box.name, ours: oursStats, board: boardStats };
      boxRows.push({ ...row, ours: roundedStats(oursStats), board: roundedStats(boardStats) });
      allSurface.push({ ours: oursStats, board: boardStats });
      if (box.kind === 'ground') ground.push({ ours: oursStats, board: boardStats });
    }
    perStation.push({
      station: bare,
      boxes: { ground: ground.length, allSurface: allSurface.length, selected: selected.length },
      ground: {
        oursKeyContrast: mean(ground.map((row) => row.ours.keyContrast)),
        boardKeyContrast: mean(ground.map((row) => row.board.keyContrast)),
        oursShadeFraction: mean(ground.map((row) => row.ours.shadeFraction)),
        boardShadeFraction: mean(ground.map((row) => row.board.shadeFraction)),
      },
      allSurface: {
        oursKeyContrast: mean(allSurface.map((row) => row.ours.keyContrast)),
        boardKeyContrast: mean(allSurface.map((row) => row.board.keyContrast)),
        oursShadeFraction: mean(allSurface.map((row) => row.ours.shadeFraction)),
        boardShadeFraction: mean(allSurface.map((row) => row.board.shadeFraction)),
      },
      boxRows,
    });
  }

  const groundRows = perStation.filter((row) => row.boxes.ground > 0);
  const surfaceRows = perStation.filter((row) => row.boxes.allSurface > 0);
  const result = {
    arena: args.arena,
    authoringFrame: AUTHORING_FRAME,
    stations: perStation.length,
    missing: [],
    boxCounts: {
      ground: groundRows.reduce((sum, row) => sum + row.boxes.ground, 0),
      allSurface: surfaceRows.reduce((sum, row) => sum + row.boxes.allSurface, 0),
      selected: perStation.reduce((sum, row) => sum + row.boxes.selected, 0),
    },
    meanOverStations: {
      ground: {
        oursKeyContrast: mean(groundRows.map((row) => row.ground.oursKeyContrast)),
        boardKeyContrast: mean(groundRows.map((row) => row.ground.boardKeyContrast)),
        oursShadeFraction: mean(groundRows.map((row) => row.ground.oursShadeFraction)),
        boardShadeFraction: mean(groundRows.map((row) => row.ground.boardShadeFraction)),
      },
      allSurface: {
        oursKeyContrast: mean(surfaceRows.map((row) => row.allSurface.oursKeyContrast)),
        boardKeyContrast: mean(surfaceRows.map((row) => row.allSurface.boardKeyContrast)),
        oursShadeFraction: mean(surfaceRows.map((row) => row.allSurface.oursShadeFraction)),
        boardShadeFraction: mean(surfaceRows.map((row) => row.allSurface.boardShadeFraction)),
      },
    },
    perStation,
  };
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    arena: result.arena,
    stations: result.stations,
    boxCounts: result.boxCounts,
    meanOverStations: result.meanOverStations,
    out: outPath,
  }, null, 2));
}

try {
  await main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
