#!/usr/bin/env node
// PASS 85 Lane I - FIRST-LOAD vs SECOND-LOAD arena lighting parity.
//
// The invariant this measures, stated by the owner as "map 1 must light like
// map 2": one build must render an arena identically whether it is the FIRST
// arena of a page load or one reached by an in-page map switch.
//
// Until 2026-08-31 it did not. `scene.environment` was null for the whole of
// the first arena of every session, because the only PMREM generation site sat
// inside `applyDefinition`, and the first arena is the one that CONSTRUCTS the
// systems object and therefore takes the other branch
// (docs/IBL_FIRST_ARENA_BUG_2026-08-31.md). That fix landed; nothing measured
// the two paths AGAINST EACH OTHER afterwards, which is what this does.
//
// Method, per arena:
//   FIRST  - a fresh page that boots straight into the arena.
//   SECOND - a fresh page that boots a DIFFERENT arena first, returns to the
//            menu, and then enters the same arena (a real map switch: calling
//            selectArena from inside a live match leaves the committed arena
//            untouched, which is how an earlier probe measured four identical
//            "switches").
// Both cases then park on the arena's OWN authored review cameras - fixed
// pose, fixed visual clock, fixed seed, fixed exposure, HUD and viewmodel
// hidden, bots frozen - so the only thing that can move between the two frames
// is the lighting the two load paths produced. The published
// ArenaEnvironmentObservation is read off the live scene in both cases and
// compared field by field, and a temporal noise floor (two frames, nothing
// changed) is measured in the same session so a delta can be told from jitter.
//
// The roster is DERIVED, never listed: arena ids come from
// src/arena-identity.ts and review-camera ids come from the live snapshot. A
// hardcoded roster is the exact bug class this repo spent 2026-08-30 removing.
//
// HEADLESS installed Chrome only (owner instruction 2026-09-02 12:40: QA
// browsers must never take his screen or his mouse). Playwright's bundled
// Chromium cannot acquire a WebGPU device on dave-gaming-pc (dxil.dll Windows
// Error 87), so channel:'chrome' is not optional; a run that does not get a
// hardware WebGPU device is INVALIDATED rather than written as evidence.
//
// Usage:
//   node scripts/qa/probe-ibl-load-parity.mjs --serve-dist dist [--arenas a,b]
//        [--shots 2] [--out artifacts/qa/ibl] [--label pass85]
import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

/** Derived roster. A new arena joins this probe by existing, not by editing it. */
function registryArenaIds() {
  const source = readFileSync(resolve(process.cwd(), 'src/arena-identity.ts'), 'utf8');
  const block = source.match(/export const ARENA_IDS = Object\.freeze\(\[([\s\S]*?)\] as const\);/u);
  if (!block) throw new Error('ARENA_IDS could not be read from src/arena-identity.ts');
  const ids = [...block[1].matchAll(/'([a-z0-9-]+)'/gu)].map((match) => match[1]);
  // Floor, so a derivation that stops matching fails LOUD instead of running
  // an empty sweep and reporting parity over nothing.
  if (ids.length < 8) throw new Error(`ARENA_IDS derivation collapsed to ${ids.length} ids`);
  return ids;
}

const LABEL = arg('--label', 'pass85');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/ibl'));
const SHOTS = Number(arg('--shots', '2'));
const SETTLE_MS = Number(arg('--settle-ms', '6000'));
const PER_ARENA_MS = Number(arg('--per-arena-ms', '180000'));
const SEED = arg('--seed', 'iblparity');
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();
const ARENAS = arg('--arenas', registryArenaIds().join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean);
mkdirSync(OUT, { recursive: true });

// --- GPU headroom. The owner's ComfyUI shares this GPU; never crowd it. -----
async function waitForGpuHeadroom(minimumFreeMiB = 3000, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { stdout } = await execFileAsync('nvidia-smi',
      ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits']);
    const [used, total] = stdout.trim().split('\n')[0].split(',').map((value) => Number(value.trim()));
    const free = total - used;
    if (free >= minimumFreeMiB) return { free, total, attempt };
    console.error(`[ibl-parity] GPU has ${free} MiB free (< ${minimumFreeMiB}); waiting 60 s`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`GPU never reached ${minimumFreeMiB} MiB free after ${attempts} checks`);
}

// --- served dist -----------------------------------------------------------
let BASE = arg('--url', null);
let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  // shell:true wraps the server in cmd.exe; killing the wrapper alone orphans
  // the vite child and leaves the port occupied for the next run.
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
  else SERVE_CHILD.kill('SIGTERM');
};
const serveDist = arg('--serve-dist', null);
if (serveDist && !BASE) {
  const PORT = Number(arg('--port', '41947'));
  const server = spawn('npx', ['vite', 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' });
  SERVE_CHILD = server;
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).ok; } catch { /* not up yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) { killServeChild(); console.error('[ibl-parity] served dist never came up'); process.exit(2); }
  BASE = `http://127.0.0.1:${PORT}`;
}
if (!BASE) { console.error('[ibl-parity] pass --serve-dist <dir> or --url'); process.exit(2); }

// --- luminance measurement, the art pass's own rec.709 weights -------------
const linearize = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
async function statsOf(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixels = info.width * info.height;
  const luma = new Float32Array(pixels);
  let sum = 0;
  for (let i = 0, p = 0; p < pixels; p += 1, i += channels) {
    const y = 0.2126 * linearize(data[i] / 255)
      + 0.7152 * linearize(data[i + 1] / 255)
      + 0.0722 * linearize(data[i + 2] / 255);
    luma[p] = y;
    sum += y;
  }
  return { luma, pixels, mean: sum / pixels };
}
function compare(before, after) {
  let moved = 0;
  let absSum = 0;
  for (let p = 0; p < before.pixels; p += 1) {
    const delta = after.luma[p] - before.luma[p];
    absSum += Math.abs(delta);
    if (Math.abs(delta) > 0.01) moved += 1;
  }
  return {
    meanLuminanceFirst: Number(before.mean.toFixed(4)),
    meanLuminanceSecond: Number(after.mean.toFixed(4)),
    meanLuminanceDeltaPercent: Number((((after.mean - before.mean) / before.mean) * 100).toFixed(2)),
    pixelsMovedPercent: Number(((moved / before.pixels) * 100).toFixed(1)),
    meanAbsDelta: Number((absSum / before.pixels).toFixed(5)),
  };
}

const gpu = await waitForGpuHeadroom();
console.error(`[ibl-parity] GPU ${gpu.free}/${gpu.total} MiB free`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const gitSha = await execFileAsync('git', ['rev-parse', 'HEAD'])
  .then((r) => r.stdout.trim()).catch(() => null);
const report = {
  generatedAt: new Date().toISOString(), label: LABEL, base: BASE, gitSha,
  viewport: VIEWPORT, seed: SEED, arenas: {},
};

/** Boots a page, optionally through a warm-up arena and a real menu round trip. */
async function measureCase(arena, { warmup }) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });
  const session = await page.context().newCDPSession(page);
  // Focus EMULATION, not a real focus grab: a headless page still throttles
  // timers when it believes it is backgrounded, and a throttled arena reads
  // like a wedged one. This never touches the owner's desktop focus.
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const enter = async (id) => {
    await page.evaluate(async (target) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(target); }, id);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    await page.waitForTimeout(SETTLE_MS);
  };
  try {
    await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=${SEED}&previewTime=0`,
      { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    const adapter = await page.evaluate(async () => {
      if (!navigator.gpu) return { gpu: false };
      try {
        const found = await navigator.gpu.requestAdapter();
        if (!found) return { gpu: true, adapter: false };
        const device = await found.requestDevice();
        return { gpu: true, adapter: true, device: Boolean(device), vendor: found.info?.vendor ?? null };
      } catch (error) { return { gpu: true, adapter: 'error', error: String(error).slice(0, 120) }; }
    });
    if (warmup) {
      await enter(warmup);
      // A map switch is a MENU round trip; selectArena inside a live match
      // leaves the committed arena untouched.
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu(); });
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.gameStarted === false || snapshot.menuVisible === true;
      }, undefined, { timeout: 120_000 });
      await page.waitForTimeout(1_500);
    }
    await enter(arena);
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
      // A live bot shoots the idle player and paints a damage vignette over
      // the frame; a frozen bot is a posed static part of the compared world.
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    });
    const observation = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const scene = debug.sampleSceneGraph();
      const snapshot = debug.snapshot();
      const playable = snapshot?.render?.playableScene ?? snapshot?.playableScene ?? null;
      const published = snapshot?.render?.atomicSignal?.advancedGraphics?.arenaEnvironment
        ?? snapshot?.atomicSignal?.advancedGraphics?.arenaEnvironment ?? null;
      return {
        appliedTslArenaDefinitions: playable?.appliedTslArenaDefinitions ?? null,
        reviewCameraIds: playable?.appliedArenaVisualPolicy?.reviewCameraIds ?? [],
        sceneEnvironment: scene.environment ? (scene.environment.name || '(unnamed)') : null,
        sceneEnvironmentIntensity: scene.environmentIntensity,
        sceneBackground: scene.background ? (scene.background.name || '(unnamed)') : null,
        skyBackdropStatus: scene.userData?.pass66SkyBackdropStatus ?? null,
        published,
      };
    });
    const shots = [];
    const cameraIds = (observation.reviewCameraIds ?? []).slice(0, SHOTS);
    for (const cameraId of cameraIds) {
      const revisionBefore = await page.evaluate(() =>
        window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraRevision);
      const applied = await page.evaluate((id) =>
        window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
      if (applied === false) { shots.push({ cameraId, ok: false, error: 'authored camera missing' }); continue; }
      // Game-loop proof, not a sleep: the presentation loop must have COMMITTED
      // a frame at this camera revision before any pixel is read.
      const committed = await page.waitForFunction(({ id, rev }) => {
        const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return review.cameraId === id && review.captureCameraRevision > rev
          && review.presentedCamera?.captureRevision === review.captureCameraRevision
          ? (review.presentedCamera ?? null) : null;
      }, { id: cameraId, rev: revisionBefore }, { timeout: 60_000 }).then(() => true).catch(() => false);
      if (!committed) { shots.push({ cameraId, ok: false, error: 'camera revision never committed' }); continue; }
      await page.waitForTimeout(1_800);
      const buffer = await page.screenshot();
      shots.push({ cameraId, ok: true, buffer });
    }
    // Temporal noise floor, in this same session: two frames, nothing changed.
    await page.waitForTimeout(700);
    const noiseA = await page.screenshot();
    await page.waitForTimeout(900);
    const noiseB = await page.screenshot();
    const noise = compare(await statsOf(noiseA), await statsOf(noiseB));
    return { ok: true, backend, adapter, observation, shots, noise, errors };
  } catch (error) {
    return { ok: false, failure: String(error).slice(0, 400), errors };
  } finally {
    await page.close();
  }
}

let exitCode = 0;
try {
  for (const arena of ARENAS) {
    const warmup = ARENAS.find((id) => id !== arena) ?? 'gun-range';
    const entry = { warmupArena: warmup };
    report.arenas[arena] = entry;
    const first = await measureCase(arena, { warmup: null });
    const second = await measureCase(arena, { warmup });
    entry.first = { ...first, shots: (first.shots ?? []).map(({ buffer, ...rest }) => rest) };
    entry.second = { ...second, shots: (second.shots ?? []).map(({ buffer, ...rest }) => rest) };
    if (!first.ok || !second.ok) {
      console.error(`[ibl-parity] ${arena}: FAILED first=${first.ok} second=${second.ok} ${first.failure ?? ''} ${second.failure ?? ''}`);
      exitCode = 1;
      continue;
    }
    // 1. The environment receipt, field by field. This is the hard half: two
    //    load paths that produced different environments are not "close", they
    //    are a defect, whatever the pixels say.
    const fields = ['present', 'environmentName', 'environmentIntensity', 'expectedEnvironmentIntensity',
      'matchesIblState', 'sourceTextureName', 'resolutionTier', 'generatedCubeSize'];
    const observationDiff = {};
    for (const field of fields) {
      const a = first.observation.published?.[field] ?? null;
      const b = second.observation.published?.[field] ?? null;
      if (a !== b) observationDiff[field] = { first: a, second: b };
    }
    entry.observationDiff = observationDiff;
    entry.observationParity = Object.keys(observationDiff).length === 0;
    // 2. The pixels, at the arena's own authored cameras.
    const dir = resolve(OUT, LABEL, arena);
    mkdirSync(dir, { recursive: true });
    entry.cameras = [];
    for (const shot of first.shots) {
      const mate = second.shots.find((candidate) => candidate.cameraId === shot.cameraId);
      if (!shot.ok || !mate?.ok) { entry.cameras.push({ cameraId: shot.cameraId, ok: false }); continue; }
      writeFileSync(resolve(dir, `${shot.cameraId}-first.png`), shot.buffer);
      writeFileSync(resolve(dir, `${shot.cameraId}-second.png`), mate.buffer);
      const measurement = compare(await statsOf(shot.buffer), await statsOf(mate.buffer));
      entry.cameras.push({ cameraId: shot.cameraId, ok: true, ...measurement });
      console.error(`[ibl-parity] ${arena}/${shot.cameraId}: ${measurement.meanLuminanceFirst} -> ${measurement.meanLuminanceSecond} (${measurement.meanLuminanceDeltaPercent}%), ${measurement.pixelsMovedPercent}% pixels moved`);
    }
    entry.noiseFloorPercent = Number(Math.max(
      Math.abs(first.noise.meanLuminanceDeltaPercent), Math.abs(second.noise.meanLuminanceDeltaPercent),
    ).toFixed(2));
    console.error(`[ibl-parity] ${arena}: env parity=${entry.observationParity} noise floor ${entry.noiseFloorPercent}% env='${first.observation.sceneEnvironment}' vs '${second.observation.sceneEnvironment}'`);
    if (!entry.observationParity) exitCode = 1;
  }
} finally {
  await browser.close();
  killServeChild();
}
const reportPath = resolve(OUT, `load-parity-${LABEL}.json`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.error(`[ibl-parity] wrote ${reportPath} (exit ${exitCode})`);
process.exit(exitCode);
