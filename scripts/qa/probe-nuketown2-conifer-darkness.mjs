#!/usr/bin/env node
// Nuke Town 2 CONIFER DARKNESS PROBE — HF-536 night-defects-3b (job 4).
//
// The question is "is the darkest shaded conifer rendering as exact black?".
// A whole-frame black fraction cannot answer it: the frame also contains
// shadowed interiors, tyre wells and the underside of the coach, all of which
// are legitimately near zero. So this probe isolates the conifer pixels
// EXACTLY rather than guessing a screen region:
//
//   shot 1  the station as shipped
//   shot 2  the same pose with `forest-conifers` (and the other forest
//           instanced meshes when --include-forest) set invisible
//   mask    every pixel that changed between them IS a pixel whose front-most
//           drawn surface was a conifer
//
// Then the max-channel histogram of shot 1 INSIDE that mask is the measured
// answer: the darkest rendered conifer pixel, the count at or below the
// diff instrument's exact-black floor (6), and the count below the brief's
// legibility floor (10). No inference, no region guess, no eyeballing.
//
// Same pose path and receipts as probe-nuketown2-microshift-flicker.mjs.
//
// Usage:
//   node scripts/qa/probe-nuketown2-conifer-darkness.mjs \
//     --serve-dist dist-defects-b --port 4321 \
//     --stations nuketown2-glasshouse-north-close,nuketown2-border-path-close \
//     --out artifacts/qa/conifer-darkness
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { execFile, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const ARENA = arg('--arena', 'nuketown2');
const STATIONS = arg('--stations', 'nuketown2-glasshouse-north-close,nuketown2-border-path-close')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Names of the instanced meshes registered by buildNuketownForestSurround().
const CONIFER_NAMES = arg('--mesh-names', 'forest-conifers').split(',').map((s) => s.trim());
const HOLD_MS = Number(arg('--hold-ms', '6000'));
const SETTLE_MS = Number(arg('--settle-ms', '5000'));
const BLACK_FLOOR = Number(arg('--black-floor', '6'));   // diff-arena-viewpoints THRESHOLDS.newlyBlackFloor
const LEGIBLE_FLOOR = Number(arg('--legible-floor', '10')); // the brief's "max channel >= 10"
const MASK_DELTA = Number(arg('--mask-delta', '3'));     // a pixel counts as conifer when hiding them moves it this much
const PORT = Number(arg('--port', '4321'));
const VIEWPORT = (() => { const [w, h] = arg('--viewport', '1280x720').split('x').map(Number); return { width: w, height: h }; })();
const OUT_DIR = resolve(process.cwd(), arg('--out', 'artifacts/qa/conifer-darkness'));
mkdirSync(OUT_DIR, { recursive: true });

let BASE = arg('--url', `http://127.0.0.1:${PORT}`);
let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
    spawnSync('powershell', ['-NoProfile', '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`],
      { stdio: 'ignore' });
  } else SERVE_CHILD.kill('SIGTERM');
};

const serveDist = arg('--serve-dist', null);
if (serveDist) {
  console.error(`[conifer] serving ${serveDist} on :${PORT}`);
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { killServeChild(); console.error('[conifer] served dist never came up'); process.exit(2); }
  const diskIndex = readFileSync(resolve(serveDist, 'index.html'), 'utf8');
  const servedIndex = await (await fetch(`http://127.0.0.1:${PORT}/index.html`)).text();
  if (servedIndex !== diskIndex || server.exitCode !== null) {
    killServeChild();
    console.error(`[conifer] REFUSED :${PORT}: ${server.exitCode !== null ? `preview exited ${server.exitCode}` : 'served index.html differs from the dist on disk'}`);
    process.exit(2);
  }
  BASE = `http://127.0.0.1:${PORT}`;
  SERVE_CHILD = server;
}

const gitSha = arg('--sha', null)
  ?? await execFileAsync('git', ['rev-parse', 'HEAD']).then((r) => r.stdout.trim()).catch(() => null);

const toRgb = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const max = new Uint8Array(n);
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const o = i * info.channels;
    const r = data[o]; const g = data[o + 1]; const b = data[o + 2];
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
    max[i] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }
  return { max, rgb, width: info.width, height: info.height };
};

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=viewpoint&previewTime=0&tod=authored`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  const bundleAtStart = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/legacy-main-'));
    return e ? e.slice(e.lastIndexOf('/')) : null;
  });
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  if (backend !== 'webgpu') {
    console.error(`[conifer] INVALID backend=${backend}`);
    writeFileSync(resolve(OUT_DIR, 'conifer-darkness.json'), `${JSON.stringify({ verdict: 'INVALID', backend }, null, 2)}\n`);
    process.exit(2);
  }

  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    if (scene) scene.traverse((o) => {
      if (o.name === 'bot-operator' || o.name.startsWith('bot-operator')) { o.position.set(0, -100, 0); o.visible = false; }
    });
  });
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true); });

  // Report what the scene actually contains, so a zero mask can never be read
  // as "no black conifers" when the truth is "the mesh name was wrong".
  const meshCensus = await page.evaluate((names) => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    const found = [];
    scene?.traverse((o) => { if (names.includes(o.name)) found.push({ name: o.name, count: o.count ?? null, visible: o.visible }); });
    return found;
  }, CONIFER_NAMES);
  console.error(`[conifer] scene census ${JSON.stringify(meshCensus)}`);

  const setConifersVisible = (visible) => page.evaluate(({ names, v }) => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    let touched = 0;
    scene?.traverse((o) => { if (names.includes(o.name)) { o.visible = v; touched += 1; } });
    return touched;
  }, { names: CONIFER_NAMES, v: visible });

  const stations = [];
  for (const stationId of STATIONS) {
    const record = { stationId, ok: false };
    try {
      const applied = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), stationId);
      if (applied === false) throw new Error('setArenaReviewCamera returned false');
      const rev = await page.waitForFunction((id) => {
        const r = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return r.cameraId === id && r.presentedCamera?.captureRevision === r.captureCameraRevision ? r.captureCameraRevision : null;
      }, stationId, { timeout: 30_000 }).then((h) => h.jsonValue());
      await page.waitForTimeout(HOLD_MS);
      const withTrees = await page.screenshot();

      const hidden = await setConifersVisible(false);
      if (hidden === 0) throw new Error(`no mesh named ${CONIFER_NAMES.join('/')} in the scene graph`);
      await page.waitForTimeout(1200);
      const withoutTrees = await page.screenshot();
      await setConifersVisible(true);
      await page.waitForTimeout(600);

      const on = await toRgb(withTrees);
      const off = await toRgb(withoutTrees);
      const n = on.width * on.height;
      let maskCount = 0;
      let darkest = 255;
      let atOrBelowBlack = 0;
      let belowLegible = 0;
      let darkestPixel = null;
      const hist = new Uint32Array(256);
      const mask = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) {
        const d = Math.abs(on.max[i] - off.max[i])
          + Math.abs(on.rgb[i * 3] - off.rgb[i * 3])
          + Math.abs(on.rgb[i * 3 + 1] - off.rgb[i * 3 + 1])
          + Math.abs(on.rgb[i * 3 + 2] - off.rgb[i * 3 + 2]);
        if (d <= MASK_DELTA) continue;
        mask[i] = 1;
        maskCount += 1;
        const m = on.max[i];
        hist[m] += 1;
        if (m <= BLACK_FLOOR) atOrBelowBlack += 1;
        if (m < LEGIBLE_FLOOR) belowLegible += 1;
        if (m < darkest) {
          darkest = m;
          darkestPixel = { x: i % on.width, y: Math.floor(i / on.width), rgb: [on.rgb[i * 3], on.rgb[i * 3 + 1], on.rgb[i * 3 + 2]] };
        }
      }
      // 1st/5th percentile of the conifer pixels — one stray pixel should not
      // decide a design constant, so report the distribution, not just the min.
      const pct = (p) => {
        let want = Math.floor(maskCount * p); let acc = 0;
        for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc > want) return v; }
        return 255;
      };
      const stationDir = resolve(OUT_DIR, stationId);
      mkdirSync(stationDir, { recursive: true });
      writeFileSync(resolve(stationDir, 'with-conifers.png'), withTrees);
      writeFileSync(resolve(stationDir, 'without-conifers.png'), withoutTrees);
      const maskRaw = Buffer.alloc(n * 3);
      for (let i = 0; i < n; i += 1) {
        if (!mask[i]) continue;
        const dark = on.max[i] < LEGIBLE_FLOOR;
        maskRaw[i * 3] = dark ? 255 : 40;
        maskRaw[i * 3 + 1] = dark ? 0 : 200;
        maskRaw[i * 3 + 2] = dark ? 0 : 60;
      }
      await sharp(maskRaw, { raw: { width: on.width, height: on.height, channels: 3 } })
        .png().toFile(resolve(stationDir, 'conifer-mask.png'));

      record.ok = true;
      record.reviewRevision = rev;
      record.coniferPixels = maskCount;
      record.coniferFractionOfFrame = Number(((maskCount / n) * 100).toFixed(3));
      record.darkestMaxChannel = maskCount > 0 ? darkest : null;
      record.darkestPixel = darkestPixel;
      record.p01MaxChannel = maskCount > 0 ? pct(0.01) : null;
      record.p05MaxChannel = maskCount > 0 ? pct(0.05) : null;
      record.p50MaxChannel = maskCount > 0 ? pct(0.5) : null;
      record.pixelsAtOrBelowBlackFloor = atOrBelowBlack;
      record.pixelsBelowLegibleFloor = belowLegible;
      record.blackFloor = BLACK_FLOOR;
      record.legibleFloor = LEGIBLE_FLOOR;
      record.artifacts = {
        withConifers: resolve(stationDir, 'with-conifers.png'),
        withoutConifers: resolve(stationDir, 'without-conifers.png'),
        mask: resolve(stationDir, 'conifer-mask.png'),
      };
      console.error(`[conifer] ${stationId.padEnd(34)} px=${maskCount} darkest=${darkest} p01=${record.p01MaxChannel} p50=${record.p50MaxChannel} <=${BLACK_FLOOR}:${atOrBelowBlack} <${LEGIBLE_FLOOR}:${belowLegible}`);
    } catch (error) {
      record.error = String(error).slice(0, 220);
      console.error(`[conifer] ${stationId} ERROR ${record.error}`);
      await setConifersVisible(true).catch(() => {});
    }
    stations.push(record);
  }

  const report = {
    contract: 'nuketown2-conifer-darkness-v1',
    sha: gitSha, url: BASE, bundleAtStart, backend, viewport: VIEWPORT,
    meshNames: CONIFER_NAMES, meshCensus, maskDelta: MASK_DELTA,
    blackFloor: BLACK_FLOOR, legibleFloor: LEGIBLE_FLOOR, holdMs: HOLD_MS,
    capturedAt: new Date().toISOString(), stations,
  };
  writeFileSync(resolve(OUT_DIR, 'conifer-darkness.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    out: OUT_DIR,
    stations: stations.map((s) => ({ stationId: s.stationId, darkest: s.darkestMaxChannel ?? null, black: s.pixelsAtOrBelowBlackFloor ?? null, belowLegible: s.pixelsBelowLegibleFloor ?? null, error: s.error ?? null })),
  }, null, 2));
  exitCode = stations.every((s) => s.ok) ? 0 : 1;
} finally {
  await browser.close();
  killServeChild();
}
process.exit(exitCode);
