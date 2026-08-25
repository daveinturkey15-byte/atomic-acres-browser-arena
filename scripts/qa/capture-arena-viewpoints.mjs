#!/usr/bin/env node
// Arena viewpoint regression — CAPTURE side.
//
// Answers "is the game worse than yesterday?" repeatably: deploys every arena,
// parks the camera on each AUTHORED deterministic review camera (frozen visual
// time, seed and exposure, HUD hidden — see src/rendering/arenas/*.ts), and
// saves one screenshot per viewpoint plus a manifest pinning the exact served
// bundle, git SHA, render backend and GPU adapter. Pair with
// scripts/qa/diff-arena-viewpoints.mjs, which diffs two capture directories.
//
// Runs INSTALLED CHROME HEADLESS over CDP (channel:'chrome', headless:true).
// Measured on this machine 2026-08-25: that launch gets a real hardware WebGPU
// device, so it needs NO governor browser slot. The manifest records the
// backend and adapter vendor actually obtained; a run that asked for webgpu
// but got anything else is INVALIDATED, never silently written as a baseline.
//
// Cross-commit workflow (no src/ edits, no shared-worktree mutations):
//   1. Build each side into its own outDir in ITS OWN worktree:
//        npx vite build --outDir dist-vr-<label>
//   2. Serve it (or pass --serve-dist to have this script spawn and reap a
//      short-lived `vite preview` on port 41931):
//        npx vite preview --outDir dist-vr-<label> --host 127.0.0.1 --port 41931 --strictPort
//   3. node scripts/qa/capture-arena-viewpoints.mjs --url http://127.0.0.1:41931 \
//        --label base --sha <git-sha-of-that-build>
//   4. Repeat for the candidate label, then:
//      node scripts/qa/diff-arena-viewpoints.mjs \
//        --base artifacts/viewpoint-regression/base --candidate artifacts/viewpoint-regression/candidate
//
// Usage: node scripts/qa/capture-arena-viewpoints.mjs [--url http://127.0.0.1:41911]
//        [--label <name>] [--sha <sha>] [--arenas a,b] [--settle-ms 5000]
//        [--per-arena-ms 150000] [--viewport 1280x720] [--renderer webgpu]
//        [--serve-dist <dir>] [--out artifacts/viewpoint-regression/<label>]
import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { VIEWPOINT_CATALOG, CATALOG_ARENAS } from './viewpoint-catalog.mjs';

const execFileAsync = promisify(execFile);

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);

const RENDERER = arg('--renderer', 'webgpu');
let BASE = arg('--url', 'http://127.0.0.1:41911');
const LABEL = arg('--label', null);
const SETTLE_MS = Number(arg('--settle-ms', '5000'));
const PER_ARENA_MS = Number(arg('--per-arena-ms', '150000'));
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();
const ARENAS = (arg('--arenas', CATALOG_ARENAS.join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean));
for (const arena of ARENAS) {
  if (!VIEWPOINT_CATALOG[arena]) {
    console.error(`[viewpoint-capture] unknown arena '${arena}'. Known: ${CATALOG_ARENAS.join(', ')}`);
    process.exit(2);
  }
}
const SEED = arg('--seed', 'viewpoint');

const serveDist = arg('--serve-dist', null);
if (serveDist) {
  // Short-lived server, spawned here and reaped in `finally`. Port chosen away
  // from 41900/41901 (owner builds) and 41910/41911 (shared gauntlet preview).
  const PORT = 41931;
  console.error(`[viewpoint-capture] serving ${serveDist} on :${PORT}`);
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      up = res.ok;
    } catch { /* not up yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    server.kill();
    console.error('[viewpoint-capture] served dist never came up');
    process.exit(2);
  }
  BASE = `http://127.0.0.1:${PORT}`;
  var SERVE_CHILD = server;
}

const OUT_DIR = resolve(process.cwd(), arg('--out',
  `artifacts/viewpoint-regression/${LABEL ?? 'unlabeled'}`));
mkdirSync(OUT_DIR, { recursive: true });

const gitSha = arg('--sha', null)
  ?? await execFileAsync('git', ['rev-parse', 'HEAD'])
    .then((r) => r.stdout.trim()).catch(() => null);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const session = await page.context().newCDPSession(page);
  // Guarantee foreground ownership instead of hoping a window manager grants
  // it; an unfocused surface is timer-throttled and reads like a wedged arena.
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

  const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=${SEED}&previewTime=0`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  // A dist rebuilt mid-sweep serves SPA-fallback HTML for assets, which fails
  // arenas with exactly the signature of a real regression. Pin the bundle.
  const servedBundle = () => page.evaluate(() => {
    const entry = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .find((name) => name.includes('/legacy-main-'));
    return entry ? entry.slice(entry.lastIndexOf('/')) : null;
  }).catch(() => null);
  const BUNDLE_AT_START = await servedBundle();

  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  // An adapter is not a device, and a Microsoft vendor string means the
  // software rasteriser. Prove the real hardware chain before any pixel lands.
  const adapterInfo = await page.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { gpu: true, adapter: false };
      const info = adapter.info ?? {};
      const device = await adapter.requestDevice();
      return { gpu: true, adapter: true, device: Boolean(device), vendor: info.vendor ?? null, architecture: info.architecture ?? null };
    } catch (error) {
      return { gpu: true, adapter: 'error', error: String(error).slice(0, 120) };
    }
  });
  console.error(`[viewpoint-capture] backend=${backend} renderer=${RENDERER} adapter=${JSON.stringify(adapterInfo)}`);

  const environmentInvalid =
    (RENDERER === 'webgpu' && backend !== 'webgpu') ? `asked for webgpu, got backend=${backend}`
    : adapterInfo.gpu !== true ? 'navigator.gpu unavailable (insecure context or unsupported browser)'
    : adapterInfo.adapter !== true ? 'requestAdapter returned nothing'
    : adapterInfo.device !== true ? 'requestDevice failed - adapter without device is not a usable WebGPU route'
    : (adapterInfo.vendor ?? '').toLowerCase() === 'microsoft' ? 'adapter vendor=microsoft means software rasteriser; captures would not represent the owner route'
    : null;

  const results = [];
  if (!environmentInvalid) {
    for (const arena of ARENAS) {
      errors.length = 0;
      const startedAt = Date.now();
      const record = { arena, ok: false, shots: [] };
      if (results.length > 0) {
        // Strict reload gate between arenas: verify the debug handle returned
        // AND the served bundle did not change mid-sweep.
        const debugReady = await page.waitForFunction(
          () => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 },
        ).then(() => true).catch(() => false);
        const bundleNow = await servedBundle();
        if (!debugReady || bundleNow !== BUNDLE_AT_START) {
          record.environmentInvalid = !debugReady
            ? 'debug handle never returned after reload'
            : `bundle changed mid-sweep (${BUNDLE_AT_START} -> ${bundleNow})`;
          record.ms = Date.now() - startedAt;
          results.push(record);
          break;
        }
      }
      try {
        await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
        await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
        await page.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
        }, undefined, { timeout: PER_ARENA_MS });
        // Let the deploy fade finish and grade/atmosphere settle before the
        // first camera move; a frame grabbed at match-active is still fading.
        await page.waitForTimeout(SETTLE_MS);
        await page.evaluate(() => {
          window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
        });

        mkdirSync(resolve(OUT_DIR, arena), { recursive: true });
        for (const cameraId of VIEWPOINT_CATALOG[arena]) {
          // setArenaReviewCamera returns BOOLEAN, not the revision; read the
          // live revision first and demand a committed presentation receipt
          // at the NEW revision for THIS camera id.
          const revisionBefore = await page.evaluate(() =>
            window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraRevision);
          const applied = await page.evaluate((id) =>
            window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
          if (applied === false) {
            record.shots.push({ cameraId, ok: false, error: 'setArenaReviewCamera returned false - authored camera missing' });
            continue;
          }
          // Game-loop proof, not a sleep: wait until the loop has COMMITTED a
          // presented frame at this camera revision.
          const committed = await page.waitForFunction(({ id, revBefore }) => {
            const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
            return review.cameraId === id
              && review.captureCameraRevision > revBefore
              && review.presentedCamera
              && review.presentedCamera.captureRevision === review.captureCameraRevision
              ? review.presentedCamera : null;
          }, { id: cameraId, revBefore: revisionBefore }, { timeout: 30_000 }).then((handle) => handle.jsonValue()).catch(() => null);
          if (!committed) {
            record.shots.push({ cameraId, ok: false, error: `camera '${cameraId}' revision >${revisionBefore} never committed by presentation loop` });
            continue;
          }
          // Give the TSL/atmosphere lane a few frames at the frozen time to
          // finish its review-camera transition before reading pixels.
          await page.waitForTimeout(700);
          const shotPath = resolve(OUT_DIR, arena, `${cameraId}.png`);
          await page.screenshot({ path: shotPath });
          const telemetry = await page.evaluate(() => {
            const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
            return {
              cameraId: review.cameraId,
              fixedTimeMs: review.fixedTimeMs,
              seed: review.seed,
              exposure: review.exposure,
              frame: review.presentedCamera?.frame ?? null,
            };
          });
          record.shots.push({ cameraId, ok: true, path: shotPath, committedFrame: committed.frame, ...telemetry });
        }
        record.ok = record.shots.every((shot) => shot.ok);
      } catch (error) {
        record.error = String(error).slice(0, 160);
        record.diagnostics = await page.evaluate(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return {
            bootstrapStage: snapshot.bootstrap?.stage ?? null,
            matchPhase: snapshot.matchPhase ?? null,
            arenaId: document.documentElement.dataset.arenaId ?? null,
            status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 140),
          };
        }).catch(() => null);
      }
      record.ms = Date.now() - startedAt;
      record.errors = [...new Set(errors)].slice(0, 4);
      results.push(record);
      const shotCount = record.shots.filter((shot) => shot.ok).length;
      console.error(`[viewpoint-capture] ${arena.padEnd(18)} ${record.ok ? 'OK' : 'FAIL'} ${shotCount}/${VIEWPOINT_CATALOG[arena].length} shots ${record.ms} ms`
        + (record.ok ? '' : ` — ${record.diagnostics?.bootstrapStage ?? record.error ?? JSON.stringify(record.shots.filter((s) => !s.ok))}`));
      // Back to the menu so the next arena starts from a clean surface.
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }

  const failed = results.filter((r) => !r.ok && !r.environmentInvalid).map((r) => r.arena);
  const invalidatedRuns = results.filter((r) => r.environmentInvalid).map((r) => r.arena);
  const verdict = environmentInvalid ? 'INVALID' : failed.length > 0 ? 'FAIL'
    : invalidatedRuns.length > 0 || results.length < ARENAS.length ? 'INVALID' : 'PASS';
  const manifest = {
    contract: 'arena-viewpoint-regression-capture-v1',
    verdict,
    label: LABEL,
    sha: gitSha,
    url: BASE,
    renderer: RENDERER,
    backend,
    adapter: adapterInfo,
    bundleAtStart: BUNDLE_AT_START,
    viewport: VIEWPORT,
    seed: SEED,
    settleMs: SETTLE_MS,
    capturedAt: new Date().toISOString(),
    environmentInvalid,
    arenas: results,
  };
  writeFileSync(resolve(OUT_DIR, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ verdict, backend, adapterVendor: adapterInfo.vendor ?? null, failed, out: OUT_DIR }, null, 2));
  exitCode = verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1;
} finally {
  await browser.close();
  if (typeof SERVE_CHILD !== 'undefined') SERVE_CHILD.kill();
}
process.exit(exitCode);
