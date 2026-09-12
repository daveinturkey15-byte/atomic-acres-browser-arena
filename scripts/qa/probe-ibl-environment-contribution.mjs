#!/usr/bin/env node
// PASS 85 Lane I - HOW FAR THE SHIPPED LOOK SITS FROM THE PRE-IBL-FIX LOOK.
//
// MEASUREMENT TOOL, NOT A GATE. It writes numbers and frames; it exits non-zero
// only when a run is INVALID (no hardware WebGPU device, the wrong arena
// committed, the frame carried combat damage, the environment suppression did
// not take, or the scene was not restored afterwards). It has no pixel
// threshold and it must never be wired into a green/red check as if it had one.
// The gate for this lane is `src/rendering/arena-environment-load-parity.test.ts`.
//
// WHY THIS EXISTS. Lane I's other probe answers the owner's stated invariant
// ("map 1 must light like map 2") by comparing the two LOAD PATHS. The lane
// brief also asks a second question: are the arenas still at the look the owner
// approved, or did the 2026-08-31 environment fix move them off it? Path parity
// cannot answer that - after the fix BOTH paths sit at the same, moved value.
//
// The direct comparison the brief suggests is not available:
//   * `artifacts/qa/artstyle-overhaul/` does not exist in this worktree. The
//     only copies on this machine are in the retired `atomic-acres-highseas`
//     worktree and a 2026-08-23 backup, and they are Lane L's 2026-08-23
//     free-camera boot frames (no authored review camera, no pinned visual
//     clock, no seed, farcrysis timed out) - nine passes older than PASS 81 and
//     not resolvable to +/-1%.
//   * The live `pass81` channel returned 404 from 15:16 BST on 2026-09-02: the
//     PASS 84 publish retired every channel except pass84 and pass83 under the
//     owner's HF-400 two-channel policy.
// So the pre-fix look cannot be re-rendered from a shipped build. What CAN be
// rendered is the state the pre-fix build actually presented, in the shipped
// build, on the same frame: `scene.environment = null` with a pristine
// `environmentIntensity = 1` is EXACTLY what every arena rendered before
// 2026-08-31 (null on the first arena of a page; non-null but carrying no light
// on later arenas, because the PMREM was built with the WebGL generator against
// a WebGPURenderer - measured: driving intensity to 20 moved mean luminance by
// 0.0000). Suppressing it in place holds camera, visual clock, seed, exposure,
// grade, geometry and materials fixed, so the difference IS the environment.
//
// The number this produces is the answer to the brief's re-tune question: if
// the owner ever wants the pre-fix look back, this is what each arena's grade
// would have to give back, per authored review camera.
//
// HEADLESS installed Chrome only (owner instruction 2026-09-02 12:40: QA
// browsers must never take his screen or his mouse).
//
// Usage:
//   node scripts/qa/probe-ibl-environment-contribution.mjs --serve-dist dist
//        [--arenas a,b] [--shots 2] [--out artifacts/qa/ibl] [--label pass85e]
import { chromium } from '@playwright/test';
import { execFile, spawn, spawnSync } from 'node:child_process';
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

/** Derived roster, same rule as the parity probe: a new arena joins by existing. */
function registryArenaIds() {
  const source = readFileSync(resolve(process.cwd(), 'src/arena-identity.ts'), 'utf8');
  const block = source.match(/export const ARENA_IDS = Object\.freeze\(\[([\s\S]*?)\] as const\);/u);
  if (!block) throw new Error('ARENA_IDS could not be read from src/arena-identity.ts');
  const ids = [...block[1].matchAll(/'([a-z0-9-]+)'/gu)].map((match) => match[1]);
  if (ids.length < 8) throw new Error(`ARENA_IDS derivation collapsed to ${ids.length} ids`);
  return ids;
}

const LABEL = arg('--label', 'pass85e');
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
const FRAME_DIR = resolve(OUT, LABEL);
mkdirSync(FRAME_DIR, { recursive: true });

// --- The owner's ComfyUI shares this GPU; never crowd it, never kill it. ----
async function waitForComfyIdle(attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let busy = false;
    try {
      const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return { comfy: 'unreachable', attempt };
      const queue = await response.json();
      busy = (queue.queue_running?.length ?? 0) > 0 || (queue.queue_pending?.length ?? 0) > 0;
    } catch {
      return { comfy: 'absent', attempt };
    }
    if (!busy) return { comfy: 'idle', attempt };
    console.error(`[ibl-contribution] ComfyUI is generating; waiting 60 s (attempt ${attempt + 1}/${attempts})`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`ComfyUI never went idle after ${attempts} checks; measure later rather than crowd it`);
}

async function waitForGpuHeadroom(minimumFreeMiB = 3000, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { stdout } = await execFileAsync('nvidia-smi',
      ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits']);
    const [used, total] = stdout.trim().split('\n')[0].split(',').map((value) => Number(value.trim()));
    const free = total - used;
    if (free >= minimumFreeMiB) return { free, total, attempt };
    console.error(`[ibl-contribution] GPU has ${free} MiB free (< ${minimumFreeMiB}); waiting 60 s`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`GPU never reached ${minimumFreeMiB} MiB free after ${attempts} checks`);
}

// --- served dist -----------------------------------------------------------
let BASE = arg('--url', null);
let SERVE_CHILD = null;
const killServeChild = () => {
  if (!SERVE_CHILD || SERVE_CHILD.pid == null) return;
  // SYNCHRONOUS. Measured 2026-09-02 in the Lane I repair: an async spawn here
  // races `process.exit()` below and the vite preview survives the run (found
  // holding port 41948 after a clean exit-0 run). A cleanup that only usually
  // runs is how this lane orphaned servers twice.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
  else SERVE_CHILD.kill('SIGTERM');
};
const serveDist = arg('--serve-dist', null);
if (serveDist && !BASE) {
  const PORT = Number(arg('--port', '41948'));
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
  if (!up) { killServeChild(); console.error('[ibl-contribution] served dist never came up'); process.exit(2); }
  BASE = `http://127.0.0.1:${PORT}`;
}
if (!BASE) { console.error('[ibl-contribution] pass --serve-dist <dir> or --url'); process.exit(2); }

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
    meanLuminanceSuppressed: Number(before.mean.toFixed(4)),
    meanLuminanceShipped: Number(after.mean.toFixed(4)),
    meanLuminanceDeltaPercent: Number((((after.mean - before.mean) / before.mean) * 100).toFixed(2)),
    pixelsMovedPercent: Number(((moved / before.pixels) * 100).toFixed(1)),
    meanAbsDelta: Number((absSum / before.pixels).toFixed(5)),
  };
}

const comfy = await waitForComfyIdle();
const gpu = await waitForGpuHeadroom();
console.error(`[ibl-contribution] ComfyUI ${comfy.comfy}; GPU ${gpu.free}/${gpu.total} MiB free`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    // Belt and braces on top of headless: even if a future edit flipped
    // headless off by accident, the window cannot land on the owner's screen.
    '--window-position=-32000,-32000',
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
  method: 'in-place environment suppression on the shipped build; suppressed = pre-2026-08-31 presented state',
  isGate: false,
  viewport: VIEWPORT, seed: SEED,
  machine: { comfyUi: comfy.comfy, gpuFreeMiB: gpu.free, gpuTotalMiB: gpu.total },
  arenas: {},
};

async function measureArena(arena) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const combatState = async () => page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const sensory = snapshot?.sensory ?? null;
    return {
      hp: snapshot?.player?.hp ?? null,
      alive: snapshot?.player?.alive ?? null,
      lowHealthOpacity: sensory ? sensory.lowHealthOpacity : null,
      lowHealthActive: sensory ? sensory.lowHealthActive : null,
      damageMarkerOpacity: sensory
        ? Math.max(0, ...(sensory.directions ?? []).map((entry) => entry?.opacity ?? 0))
        : null,
    };
  });
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
        return { gpu: true, adapter: true, device: Boolean(device) };
      } catch (error) { return { gpu: true, adapter: 'error', error: String(error).slice(0, 120) }; }
    });
    await page.evaluate(async (target) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(target); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    // Freeze BEFORE the settle. A bot that shoots the parked player paints
    // `#low-health-vignette` over the whole frame and there is no lighting
    // measurement left (measured 2026-09-02 on rustworks-1v1: a fake -23%).
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
    await page.waitForTimeout(SETTLE_MS);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true); });
    const combat = await combatState();
    const observation = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const scene = debug.sampleSceneGraph();
      const snapshot = debug.snapshot();
      const playable = snapshot?.render?.playableScene ?? snapshot?.playableScene ?? null;
      const published = snapshot?.render?.atomicSignal?.advancedGraphics?.arenaEnvironment
        ?? snapshot?.atomicSignal?.advancedGraphics?.arenaEnvironment ?? null;
      return {
        reviewCameraIds: playable?.appliedArenaVisualPolicy?.reviewCameraIds ?? [],
        sceneEnvironment: scene.environment ? (scene.environment.name || '(unnamed)') : null,
        sceneEnvironmentIntensity: scene.environmentIntensity,
        sceneBackground: scene.background ? (scene.background.name || '(unnamed)') : null,
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
      const committed = await page.waitForFunction(({ id, rev }) => {
        const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return review.cameraId === id && review.captureCameraRevision > rev
          && review.presentedCamera?.captureRevision === review.captureCameraRevision
          ? (review.presentedCamera ?? null) : null;
      }, { id: cameraId, rev: revisionBefore }, { timeout: 60_000 }).then(() => true).catch(() => false);
      if (!committed) { shots.push({ cameraId, ok: false, error: 'camera revision never committed' }); continue; }
      await page.waitForTimeout(1_800);
      const shippedBuffer = await page.screenshot();
      // This camera's own temporal floor, measured on the SAME state and the
      // same interval the suppressed frame is taken over, so the contribution
      // number can be told from frame-to-frame jitter.
      await page.waitForTimeout(1_400);
      const shippedAgain = await page.screenshot();

      // The pre-2026-08-31 presented state, in place. Nothing else moves.
      const held = await page.evaluate(() => {
        const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        window.__IBL_HELD__ = { environment: scene.environment, intensity: scene.environmentIntensity };
        scene.environment = null;
        scene.environmentIntensity = 1;
        const after = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        return {
          heldName: window.__IBL_HELD__.environment?.name ?? null,
          heldIntensity: window.__IBL_HELD__.intensity,
          // Read BACK, so "suppressed" is observed rather than assumed.
          suppressedEnvironment: after.environment ? (after.environment.name || '(unnamed)') : null,
          suppressedIntensity: after.environmentIntensity,
        };
      });
      await page.waitForTimeout(1_400);
      const suppressedBuffer = await page.screenshot();
      const restored = await page.evaluate(() => {
        const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        scene.environment = window.__IBL_HELD__.environment;
        scene.environmentIntensity = window.__IBL_HELD__.intensity;
        const after = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        return {
          environment: after.environment ? (after.environment.name || '(unnamed)') : null,
          intensity: after.environmentIntensity,
        };
      });
      writeFileSync(resolve(FRAME_DIR, `${arena}-${cameraId}-shipped.png`), shippedBuffer);
      writeFileSync(resolve(FRAME_DIR, `${arena}-${cameraId}-suppressed.png`), suppressedBuffer);
      const contribution = compare(await statsOf(suppressedBuffer), await statsOf(shippedBuffer));
      const floor = compare(await statsOf(shippedBuffer), await statsOf(shippedAgain));
      shots.push({
        cameraId, ok: true, ...held, restored, ...contribution,
        floorLuminancePercent: Math.abs(floor.meanLuminanceDeltaPercent),
        floorPixelsMovedPercent: floor.pixelsMovedPercent,
      });
      console.error(`[ibl-contribution] ${arena}/${cameraId}: suppressed ${contribution.meanLuminanceSuppressed} -> shipped ${contribution.meanLuminanceShipped} (${contribution.meanLuminanceDeltaPercent > 0 ? '+' : ''}${contribution.meanLuminanceDeltaPercent}%), ${contribution.pixelsMovedPercent}% moved, floor ${Math.abs(floor.meanLuminanceDeltaPercent)}%/${floor.pixelsMovedPercent}%`);
    }
    const combatAfter = await combatState();
    return { ok: true, backend, adapter, observation, shots, errors, combat, combatAfter };
  } catch (error) {
    return { ok: false, failure: String(error).slice(0, 400), errors };
  } finally {
    await page.close();
  }
}

let exitCode = 0;
try {
  for (const arena of ARENAS) {
    const result = await measureArena(arena);
    report.arenas[arena] = result;
    if (!result.ok) {
      console.error(`[ibl-contribution] ${arena}: FAILED ${result.failure ?? ''}`);
      exitCode = 1;
      continue;
    }
    if (result.adapter?.adapter !== true || result.backend !== 'webgpu') {
      report.arenas[arena].invalidated = 'no hardware WebGPU device';
      exitCode = 1;
      continue;
    }
    const committed = result.observation.published?.arenaId ?? null;
    if (committed !== arena) {
      report.arenas[arena].invalidated = `wrong arena committed (${committed})`;
      console.error(`[ibl-contribution] ${arena}: SELECTION FAILED - committed ${committed}`);
      exitCode = 1;
      continue;
    }
    // Combat contamination is a hard invalidation, never a tolerance.
    for (const [label, state] of [['before', result.combat], ['after', result.combatAfter]]) {
      if (!state || state.alive !== true || state.hp !== 100
        || state.lowHealthOpacity !== 0 || state.lowHealthActive !== false
        || state.damageMarkerOpacity !== 0) {
        report.arenas[arena].invalidated = `combat contamination (${label})`;
        exitCode = 1;
      }
    }
    // The suppression and the restore must both be OBSERVED, not assumed: a
    // measurement taken while the environment was still bound is not a
    // measurement of the environment, and a scene left suppressed would
    // poison every later camera in the same page.
    for (const shot of result.shots) {
      if (!shot.ok) continue;
      if (shot.suppressedEnvironment !== null || shot.suppressedIntensity !== 1) {
        report.arenas[arena].invalidated = `suppression did not take at ${shot.cameraId}`;
        exitCode = 1;
      }
      if (shot.restored?.environment !== shot.heldName || shot.restored?.intensity !== shot.heldIntensity) {
        report.arenas[arena].invalidated = `restore failed at ${shot.cameraId}`;
        exitCode = 1;
      }
    }
  }
} finally {
  await browser.close();
  killServeChild();
  writeFileSync(resolve(OUT, `environment-contribution-${LABEL}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`[ibl-contribution] wrote ${resolve(OUT, `environment-contribution-${LABEL}.json`)} (exit ${exitCode})`);
}
process.exit(exitCode);
