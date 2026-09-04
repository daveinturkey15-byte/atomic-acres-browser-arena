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
//        [--serve-dist <dir>] [--out artifacts/viewpoint-regression/<label>]
//        [--samples 3] [--registry-wait-ms 30000] [--warm-up]
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { VIEWPOINT_CATALOG, CATALOG_ARENAS } from './viewpoint-catalog.mjs';
import {
  startPreviewServer,
  stopPreviewServer,
  waitForReviewCameraRegistry,
} from './capture-arena-viewpoints-support.mjs';

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
const REGISTRY_WAIT_MS = Number(arg('--registry-wait-ms', '30000'));
const WARM_UP = flag('--warm-up');
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();
const ARENAS = (arg('--arenas', CATALOG_ARENAS.join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean));
// Persistence evidence: dynamic content (solo bot, sliding containers,
// animated water, flickering work lights) differs BETWEEN capture sessions
// while geometry does not. N samples per viewpoint let the diff keep a
// viewpoint quiet when ANY sample matches base; a real regression differs
// in EVERY sample. Deterministic inter-sample beats, never Math.random.
const SAMPLES = Math.max(1, Number(arg('--samples', '3')));
for (const arena of ARENAS) {
  if (!VIEWPOINT_CATALOG[arena]) {
    console.error(`[viewpoint-capture] unknown arena '${arena}'. Known: ${CATALOG_ARENAS.join(', ')}`);
    process.exit(2);
  }
}
const SEED = arg('--seed', 'viewpoint');
// Optional station subset for bounded evidence runs. The default remains the
// complete authored catalog, so an unqualified capture cannot silently omit a
// review station.
const CAMERAS = arg('--cameras', null)?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? null;
const stationsFor = (arena) => CAMERAS
  ? VIEWPOINT_CATALOG[arena].filter((id) => CAMERAS.includes(id))
  : VIEWPOINT_CATALOG[arena];

let SERVE_SERVER = null;
const stopServe = async () => {
  if (!SERVE_SERVER) return;
  const server = SERVE_SERVER;
  SERVE_SERVER = null;
  await stopPreviewServer(server);
};

const serveDist = arg('--serve-dist', null);
if (serveDist) {
  // Short-lived direct vite child, reaped by the LISTENING pid on the QA port.
  const PORT = 4222;
  console.error(`[viewpoint-capture] serving ${serveDist} on :${PORT}`);
  SERVE_SERVER = await startPreviewServer({ serveDist, port: PORT, cwd: process.cwd() });
  BASE = SERVE_SERVER.url;
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
  args: ['--mute-audio', 
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
  const servedBundle = () => page.evaluate(async () => {
    const entry = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .find((name) => name.includes('/legacy-main-'));
    if (!entry) return null;
    const response = await fetch(entry, { cache: 'no-store' });
    if (!response.ok) return { path: entry.slice(entry.lastIndexOf('/')), sha256: null };
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { path: entry.slice(entry.lastIndexOf('/')), sha256: hash };
  }).catch(() => null);
  const bundleAtStart = await servedBundle();
  const BUNDLE_AT_START = bundleAtStart?.path ?? null;
  const BUNDLE_HASH_AT_START = bundleAtStart?.sha256 ?? null;

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
    : BUNDLE_HASH_AT_START === null ? 'served legacy-main bundle SHA-256 unavailable'
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
        if (!debugReady || bundleNow?.path !== BUNDLE_AT_START || bundleNow?.sha256 !== BUNDLE_HASH_AT_START) {
          record.environmentInvalid = !debugReady
            ? 'debug handle never returned after reload'
            : `bundle changed mid-sweep (${BUNDLE_AT_START}@${BUNDLE_HASH_AT_START} -> ${bundleNow?.path ?? null}@${bundleNow?.sha256 ?? null})`;
          record.ms = Date.now() - startedAt;
          results.push(record);
          break;
        }
      }
      try {
        const deployArena = async (purpose) => {
          await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
          await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
          await page.waitForFunction(() => {
            const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
            return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
          }, undefined, { timeout: PER_ARENA_MS });
          const registryWait = await waitForReviewCameraRegistry(
            () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleArenaReviewCameraRegistry()),
            { arena, cameraIds: stationsFor(arena), timeoutMs: REGISTRY_WAIT_MS },
          );
          console.error(`[viewpoint-capture] ${arena} ${purpose} review-camera registry ready after ${registryWait.waitedMs} ms `
            + `(${registryWait.attempts} polls): ${JSON.stringify(registryWait.state)}`);
        };
        if (WARM_UP) {
          await deployArena('warm-up');
          await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu(); });
          await page.waitForFunction(() => {
            const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
            return snapshot.matchPhase !== 'active' && snapshot.gameStarted === false;
          }, undefined, { timeout: 30_000 });
          console.error(`[viewpoint-capture] ${arena} warm-up deploy complete; starting measured deploy`);
        }
        await deployArena('capture');
        // Freeze the solo bot IMMEDIATELY so it does not wander to the driveway
        // during settle time before camera review, and hide/relocate it away from
        // the camera review viewpoints:
        await page.evaluate(() => {
          window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
          const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
          if (scene) {
            scene.traverse((obj) => {
              if (obj.name === 'bot-operator' || obj.name.startsWith('bot-operator')) {
                obj.position.set(0, -100, 0);
                obj.visible = false;
              }
            });
          }
        });
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
          const committed = await page.waitForFunction(({ id, rev }) => {
            const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
            // Optional chain on purpose: a snapshot taken BETWEEN the review
            // revision bump and the presentedCamera publish must read as
            // not-yet-committed (null), never throw and never alias a pose
            // from an older revision.
            return review.cameraId === id && review.captureCameraRevision > rev
              && review.presentedCamera?.captureRevision === review.captureCameraRevision
                ? (review.presentedCamera ?? null)
                : null;
          }, { id: cameraId, rev: revisionBefore }, { timeout: 30_000 }).then((handle) => handle.jsonValue()).catch(() => null);
          if (!committed) {
            record.shots.push({ cameraId, ok: false, error: `camera '${cameraId}' revision >${revisionBefore} never committed by presentation loop` });
            continue;
          }
          // Persistence sampling. Sample 0 keeps the original contract
          // exactly: TSL-transition settle (700 ms), receipt check,
          // screenshot. Samples 1..N-1 add deterministic extra beats so
          // flicker phase, bot position and animated-water phase decorrelate
          // between samples; the diff's pixel-wise persistence-min uses them
          // to tell transient actor noise from a change that persists in
          // every sample (a real regression).
          const samplePaths = [];
          let sampleTelemetry = null;
          let failure = null;
          for (let sample = 0; sample < SAMPLES; sample += 1) {
            if (sample > 0) await page.waitForTimeout(400 + 350 * sample);
            // Pixel-time proof, not just commit-time: re-read the
            // presentation receipt immediately before EVERY screenshot; a
            // lost receipt means the shot could show a stale pose.
            const presentedFrame = await page.evaluate(() => {
              const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
              return review.presentedCamera
                && review.presentedCamera.captureRevision === review.captureCameraRevision
                ? review.presentedCamera.frame : null;
            });
            if (presentedFrame === null) {
              failure = `presentation receipt lost before pixels for '${cameraId}'`;
              break;
            }
            const shotPath = resolve(OUT_DIR, arena,
              sample === 0 ? `${cameraId}.png` : `${cameraId}.s${sample}.png`);
            await page.screenshot({ path: shotPath });
            samplePaths.push(shotPath);
            if (sampleTelemetry === null) {
              sampleTelemetry = await page.evaluate(() => {
                const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
                return {
                  cameraId: review.cameraId,
                  fixedTimeMs: review.fixedTimeMs,
                  seed: review.seed,
                  exposure: review.exposure,
                  frame: review.presentedCamera?.frame ?? null,
                };
              });
            }
          }
          if (failure) {
            record.shots.push({ cameraId, ok: false, error: failure });
            continue;
          }
          if (samplePaths.length < SAMPLES) {
            record.shots.push({ cameraId, ok: false, error: `only ${samplePaths.length}/${SAMPLES} samples captured for '${cameraId}'` });
            continue;
          }
          record.shots.push({
            cameraId,
            ok: true,
            path: samplePaths[0],
            samplePaths,
            committedFrame: committed.frame,
            ...sampleTelemetry,
          });
        }
        record.ok = record.shots.every((shot) => shot.ok);
      } catch (error) {
        record.error = String(error).slice(0, 400);
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
    bundleSha256: BUNDLE_HASH_AT_START,
    viewport: VIEWPORT,
    seed: SEED,
    settleMs: SETTLE_MS,
    samples: SAMPLES,
    capturedAt: new Date().toISOString(),
    environmentInvalid,
    arenas: results,
  };
  writeFileSync(resolve(OUT_DIR, 'capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ verdict, backend, adapterVendor: adapterInfo.vendor ?? null, failed, out: OUT_DIR }, null, 2));
  exitCode = verdict === 'PASS' ? 0 : verdict === 'INVALID' ? 2 : 1;
} finally {
  await browser.close();
  await stopServe().catch((error) => {
    console.error(`[viewpoint-capture] preview teardown failed: ${String(error).slice(0, 400)}`);
    exitCode = 2;
  });
}
process.exit(exitCode);
