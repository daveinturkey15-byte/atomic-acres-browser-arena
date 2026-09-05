// HF-472 TAA Pass 2 temporal-stability instrument.
//
// Captures three consecutive post-commit frames at the two decision stations
// with TAA off and on, then reports the mean absolute difference between the
// frames after a 3x3 luma high-pass. The unit is normalized luma (0..1).
// This is deliberately a single headless Chrome session on port 4220 so the
// before/after pair shares the same browser route and station setup.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};

const DIST = resolve(arg('--dist', 'dist'));
const PORT = Number(arg('--port', '4220'));
const WIDTH = Number(arg('--width', '2560'));
const HEIGHT = Number(arg('--height', '1440'));
const FRAMES = Number(arg('--frames', '3'));
const SETTLE_MS = Number(arg('--settle-ms', '3000'));
const OUT_DIR = resolve(arg('--out', 'docs/evidence/pass96/taa-resolve/pass2/temporal-stability'));
const ARENA = 'nuketown2';
const STATIONS = ['nuketown2-street-centre', 'nuketown2-north-yard'];
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);
if (FRAMES !== 3) throw new Error('The decision procedure requires exactly three consecutive frames');
mkdirSync(OUT_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.bin': 'application/octet-stream',
};
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    response.writeHead(404).end('not found');
    return;
  }
  const body = readFileSync(file);
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  response.end(body);
});
await new Promise((resolveServer, reject) => {
  server.once('error', reject);
  server.listen(PORT, '127.0.0.1', resolveServer);
});

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const settingFor = (mode) => JSON.stringify({
  version: 1,
  graphics: { schemaVersion: 1, preset: 'custom', taaResolve: mode === 'on' },
});

function highPass3x3(bytes, width, height) {
  const luminance = new Float32Array(width * height);
  const stride = width + 1;
  const integral = new Float64Array((height + 1) * stride);
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const value = (0.2126 * bytes[source] + 0.7152 * bytes[source + 1] + 0.0722 * bytes[source + 2]) / 255;
      luminance[y * width + x] = value;
      row += value;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
    }
  }
  const outputWidth = width - 2;
  const outputHeight = height - 2;
  const output = new Float32Array(outputWidth * outputHeight);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const x0 = x - 1;
      const y0 = y - 1;
      const x1 = x + 2;
      const y1 = y + 2;
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1]
        - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      output[(y - 1) * outputWidth + x - 1] = luminance[y * width + x] - sum / 9;
    }
  }
  return output;
}

function meanAbsoluteDelta(first, second) {
  if (first.length !== second.length) throw new Error('high-pass frames have different sizes');
  let total = 0;
  for (let index = 0; index < first.length; index += 1) total += Math.abs(first[index] - second[index]);
  return total / first.length;
}

async function decodeHighPass(png) {
  const decoded = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: decoded.info.width,
    height: decoded.info.height,
    pixels: highPass3x3(decoded.data, decoded.info.width, decoded.info.height),
  };
}

let page = null;

async function openMode(mode) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.context().newCDPSession(page).then((session) =>
    session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}));
  await page.addInitScript((serialized) => {
    localStorage.setItem('atomic-acres-pass65-settings-v1', serialized);
  }, settingFor(mode));
  await page.goto(`http://127.0.0.1:${PORT}/?release=latest&renderer=webgpu&seed=taa2-temporal`, { waitUntil: 'domcontentloaded' });
  await waitReady();
}

async function waitReady() {
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const solo = document.querySelector('#solo');
    return solo !== null && !solo.disabled;
  }, undefined, { timeout: 180_000 });
}

async function deploy() {
  await page.evaluate((arena) => document.querySelector(`.map-card[data-arena-id="${arena}"]`)?.click(), ARENA);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    scene?.traverse((object) => {
      if (object.name === 'bot-operator' || object.name.startsWith('bot-operator')) {
        object.position.set(0, -100, 0);
        object.visible = false;
      }
    });
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
  });
  await page.waitForTimeout(SETTLE_MS);
}

async function captureStation(mode, station) {
  const revisionBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraRevision);
  const applied = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), station);
  if (applied !== true) throw new Error(`setArenaReviewCamera failed for ${station}`);
  const committed = await page.waitForFunction(({ id, revision }) => {
    const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
    return review.cameraId === id && review.captureCameraRevision > revision
      && review.presentedCamera?.captureRevision === review.captureCameraRevision;
  }, { id: station, revision: revisionBefore }, { timeout: 30_000 });
  await committed.dispose();
  // Let the review-camera history seed and converge before the measured
  // consecutive frames. This keeps the metric about station shimmer, not the
  // deliberate camera jump from the previous station.
  await page.waitForTimeout(500);

  const frames = [];
  for (let index = 0; index < FRAMES; index += 1) {
    await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
    const path = join(OUT_DIR, `${mode}-${station}-f${index}.png`);
    const png = await page.screenshot({ path });
    frames.push({ path, ...(await decodeHighPass(png)) });
  }
  const deltas = [
    meanAbsoluteDelta(frames[0].pixels, frames[1].pixels),
    meanAbsoluteDelta(frames[1].pixels, frames[2].pixels),
  ].map((value) => Number(value.toFixed(8)));
  const receipt = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const advanced = snapshot.render?.atomicSignal?.advancedGraphics ?? null;
    return {
      backend: snapshot.render?.runtime?.backend ?? document.documentElement.dataset.renderBackend ?? null,
      taaEnabled: advanced?.screenSpace?.taaResolve?.enabled ?? null,
      cameraId: snapshot.deterministicReview.cameraId,
      captureRevision: snapshot.deterministicReview.captureCameraRevision,
      presentedRevision: snapshot.deterministicReview.presentedCamera?.captureRevision ?? null,
    };
  });
  return {
    station,
    mode,
    frames: frames.map(({ path, width, height }) => ({ path, width, height })),
    highPass3x3MeanAbsoluteLumaDelta: deltas,
    meanHighPass3x3MeanAbsoluteLumaDelta: Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(8)),
    receipt,
  };
}

const report = {
  contract: 'taa-temporal-stability-v1',
  measuredAt: new Date().toISOString(),
  arena: ARENA,
  viewport: { width: WIDTH, height: HEIGHT },
  framesPerStation: FRAMES,
  highPass: 'luma minus the inclusive 3x3 neighbourhood mean; values normalized to 0..1',
  stations: STATIONS,
  modes: {},
};
try {
  for (const mode of ['off', 'on']) {
    await openMode(mode);
    await deploy();
    report.modes[mode] = {};
    for (const station of STATIONS) report.modes[mode][station] = await captureStation(mode, station);
  }
  writeFileSync(join(OUT_DIR, 'taa2-temporal-stability.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await page?.close();
  await browser.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}
