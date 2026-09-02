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
// MEASUREMENT TOOL, NOT A GATE. Its exit code reports only INVALIDATION -
// receipt mismatch, a failed arena selection, combat contamination in the
// frame - never a pixel threshold. A large luminance divergence exits 0 on
// purpose, because on this build the largest pixel divergences measured were
// not lighting at all (a DOM damage overlay; unpinned surf and canopy
// animation on farcrysis) and a threshold here would encode that noise as a
// contract. Do not wire `measure:ibl:load-parity` into a green/red check. The
// gate for this lane is `src/rendering/arena-environment-load-parity.test.ts`,
// which asserts the two caller orders produce the same observation in unit
// space where there is no animation phase to confound it.
//
// Usage:
//   node scripts/qa/probe-ibl-load-parity.mjs --serve-dist dist [--arenas a,b]
//        [--shots 2] [--out artifacts/qa/ibl] [--label pass85]
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
const LONG_FLOOR_MS = Number(arg('--long-floor-ms', '15000'));
const PER_ARENA_MS = Number(arg('--per-arena-ms', '180000'));
const SEED = arg('--seed', 'iblparity');
const VIEWPORT = (() => {
  const [w, h] = arg('--viewport', '1280x720').split('x').map(Number);
  return { width: w, height: h };
})();
const ARENAS = arg('--arenas', registryArenaIds().join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean);
mkdirSync(OUT, { recursive: true });

// --- The owner's ComfyUI shares this GPU; never crowd it, never kill it. ----
/**
 * Free VRAM is necessary but not sufficient: ComfyUI can hold a model resident
 * and still be mid-generation, and a GPU sharing a diffusion sampler misses
 * WebGPU submission deadlines. That is not hypothetical here - the 2026-09-02
 * sweep lost the gun-range map switch to "WebGPU queue completion exceeded
 * 12000 ms". Wait for an idle queue rather than measure through the contention.
 */
async function waitForComfyIdle(attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let busy = false;
    try {
      const response = await fetch('http://127.0.0.1:8188/queue', { signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return { comfy: 'unreachable', attempt };
      const queue = await response.json();
      busy = (queue.queue_running?.length ?? 0) > 0 || (queue.queue_pending?.length ?? 0) > 0;
    } catch {
      return { comfy: 'absent', attempt }; // not running at all; nothing to yield to
    }
    if (!busy) return { comfy: 'idle', attempt };
    console.error(`[ibl-parity] ComfyUI is generating; waiting 60 s (attempt ${attempt + 1}/${attempts})`);
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
  // SYNCHRONOUS. Measured 2026-09-02 in the Lane I repair: an async spawn here
  // races `process.exit()` below and the vite preview survives the run (found
  // holding port 41948 after a clean exit-0 run). A cleanup that only usually
  // runs is how this lane orphaned servers twice.
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(SERVE_CHILD.pid), '/T', '/F'], { stdio: 'ignore' });
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

const comfy = await waitForComfyIdle();
const gpu = await waitForGpuHeadroom();
console.error(`[ibl-parity] ComfyUI ${comfy.comfy}; GPU ${gpu.free}/${gpu.total} MiB free`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    // Belt and braces on top of headless. Added 2026-09-02 in the Lane I
    // repair: the lane report had claimed this flag was already here and it
    // was not. `headless: true` above is the protection that actually matters;
    // this only guarantees that a future edit which flips headless off by
    // accident still cannot put a window on the owner's screen.
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
  viewport: VIEWPORT, seed: SEED,
  // What else the machine was doing. A run measured beside a live diffusion
  // sampler is not comparable to one measured on a quiet GPU.
  machine: { comfyUi: comfy.comfy, gpuFreeMiB: gpu.free, gpuTotalMiB: gpu.total },
  arenas: {},
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
    // FREEZE BEFORE THE SETTLE, not after. Measured 2026-09-02 on
    // rustworks-1v1: freezing after a 6 s idle settle let the solo bot shoot
    // the parked player, and `#low-health-vignette` painted a radial red wash
    // over the WHOLE frame (+118/255 red at the corners, centre pixels
    // byte-identical). That read out as "first load is 23% darker than second
    // load" - a lighting divergence that did not exist. Freezing a bot does
    // not undo damage already taken, so the only correct order is: no live
    // combat at any point in the measured window.
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
    await page.waitForTimeout(SETTLE_MS);
  };
  /**
   * Combat state at capture time. The red overlay is a DOM element
   * (`#low-health-vignette`, driven by `--low-health-opacity`), so it is IN the
   * screenshot but NOT in the scene: nothing about the environment, the grade
   * or the renderer can be inferred from a frame that carries it. This is read
   * on both cases and required to be clean, so a combat difference is reported
   * as a combat difference instead of being laundered into a luminance number.
   */
  const combatState = async () => page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const sensory = snapshot?.sensory ?? null;
    return {
      hp: snapshot?.player?.hp ?? null,
      alive: snapshot?.player?.alive ?? null,
      // The game publishes what it painted; read that rather than re-deriving
      // it from CSS, so the receipt and the pixels have the same author.
      lowHealthOpacity: sensory ? sensory.lowHealthOpacity : null,
      lowHealthActive: sensory ? sensory.lowHealthActive : null,
      // Directional hit markers are a second on-screen overlay from the same
      // cause; a frame carrying one is contaminated even at full health.
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
      // THIS CAMERA'S OWN temporal floor, not the arena's. One floor per arena
      // is measured at whichever camera happened to be last, and cameras differ
      // enormously in how much of the frame is animated: measured 2026-09-02,
      // farcrysis read 0% moved at the jungle camera and 6.4% at the same
      // arena's second sample. A delta can only be called a lighting delta
      // against the floor of the frame it was taken in.
      await page.waitForTimeout(900);
      const bufferAgain = await page.screenshot();
      // A SECOND floor on a LONG baseline. 900 ms catches fast jitter and
      // nothing else: an animation whose period is tens of seconds - swell,
      // canopy sway, drifting cloud - barely moves inside that window and
      // still lands the two load paths on different phases, because they
      // reach the camera at different elapsed times. Measured 2026-09-02 on
      // farcrysis: 0% moved at 900 ms while the two load paths differed by
      // 17%. Without this sample there is no way to tell that apart from a
      // lighting difference, and the 900 ms floor alone would call it one.
      await page.waitForTimeout(LONG_FLOOR_MS);
      const bufferLater = await page.screenshot();
      shots.push({ cameraId, ok: true, buffer, bufferAgain, bufferLater });
    }
    // Temporal noise floor, in this same session: two frames, nothing changed.
    await page.waitForTimeout(700);
    const noiseA = await page.screenshot();
    await page.waitForTimeout(900);
    const noiseB = await page.screenshot();
    const noise = compare(await statsOf(noiseA), await statsOf(noiseB));
    // Read combat state again AFTER the last pixel, so a hit landed anywhere
    // inside the capture window is caught, not just one landed before it.
    const combatAfter = await combatState();
    return { ok: true, backend, adapter, observation, shots, noise, errors, combat, combatAfter };
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
    entry.first = { ...first, shots: (first.shots ?? []).map(({ buffer, bufferAgain, bufferLater, ...rest }) => rest) };
    entry.second = { ...second, shots: (second.shots ?? []).map(({ buffer, bufferAgain, bufferLater, ...rest }) => rest) };
    if (!first.ok || !second.ok) {
      console.error(`[ibl-parity] ${arena}: FAILED first=${first.ok} second=${second.ok} ${first.failure ?? ''} ${second.failure ?? ''}`);
      exitCode = 1;
      continue;
    }
    // WHICH ARENA IS ACTUALLY COMMITTED, before anything is compared. A map
    // switch can fail and leave the PREVIOUS arena live (measured 2026-09-02:
    // "[Gun Range map selection failed] WebGPU queue completion exceeded
    // 12000 ms"), and the match stays active throughout - so the naive
    // comparison reads the previous arena's environment as this arena's and
    // reports a lighting divergence that is really a failed selection. Those
    // are different defects and must never be conflated.
    entry.committedArena = {
      first: first.observation.published?.arenaId ?? null,
      second: second.observation.published?.arenaId ?? null,
    };
    if (entry.committedArena.first !== arena || entry.committedArena.second !== arena) {
      entry.selectionFailed = true;
      console.error(`[ibl-parity] ${arena}: SELECTION FAILED - committed first=${entry.committedArena.first} second=${entry.committedArena.second}; page errors: ${JSON.stringify((second.errors ?? []).slice(0, 2))}`);
      exitCode = 1;
      continue;
    }
    // COMBAT STATE, before any pixel is compared. `#low-health-vignette` is a
    // DOM overlay on top of the canvas; a frame carrying it says nothing about
    // lighting. Both cases must be untouched at full health with the overlay
    // fully off, at the start AND the end of the capture window. This is a
    // hard invalidation, never a tolerance: an arena measured under fire has
    // no lighting measurement at all.
    const combatClean = (side) => {
      const before = side.combat ?? null;
      const after = side.combatAfter ?? null;
      if (!before || !after) return { clean: false, reason: 'combat state unavailable' };
      for (const [label, state] of [['before', before], ['after', after]]) {
        if (state.alive !== true) return { clean: false, reason: `player not alive (${label})` };
        if (state.hp !== 100) return { clean: false, reason: `hp ${state.hp} != 100 (${label})` };
        if (!(state.lowHealthOpacity === 0)) {
          return { clean: false, reason: `low-health vignette ${state.lowHealthOpacity} != 0 (${label})` };
        }
        if (state.lowHealthActive !== false) return { clean: false, reason: `low-health feedback active (${label})` };
        if (!(state.damageMarkerOpacity === 0)) {
          return { clean: false, reason: `damage marker ${state.damageMarkerOpacity} != 0 (${label})` };
        }
      }
      return { clean: true };
    };
    const combatFirst = combatClean(first);
    const combatSecond = combatClean(second);
    entry.combat = {
      first: { ...(first.combat ?? {}), after: first.combatAfter ?? null, ...combatFirst },
      second: { ...(second.combat ?? {}), after: second.combatAfter ?? null, ...combatSecond },
    };
    if (!combatFirst.clean || !combatSecond.clean) {
      entry.combatContaminated = true;
      console.error(`[ibl-parity] ${arena}: COMBAT-CONTAMINATED - first: ${combatFirst.reason ?? 'clean'}; second: ${combatSecond.reason ?? 'clean'}. No lighting comparison is valid on these frames.`);
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
      // Per-camera temporal floor: the worse of the two cases' own repeat
      // frames at THIS camera. A delta inside it is the frame moving, not the
      // load path.
      const floorFirst = shot.bufferAgain
        ? compare(await statsOf(shot.buffer), await statsOf(shot.bufferAgain)) : null;
      const floorSecond = mate.bufferAgain
        ? compare(await statsOf(mate.buffer), await statsOf(mate.bufferAgain)) : null;
      const cameraNoisePercent = floorFirst && floorSecond
        ? Number(Math.max(Math.abs(floorFirst.meanLuminanceDeltaPercent), Math.abs(floorSecond.meanLuminanceDeltaPercent)).toFixed(2))
        : null;
      const cameraNoiseMovedPercent = floorFirst && floorSecond
        ? Number(Math.max(floorFirst.pixelsMovedPercent, floorSecond.pixelsMovedPercent).toFixed(1))
        : null;
      const longFirst = shot.bufferLater
        ? compare(await statsOf(shot.buffer), await statsOf(shot.bufferLater)) : null;
      const longSecond = mate.bufferLater
        ? compare(await statsOf(mate.buffer), await statsOf(mate.bufferLater)) : null;
      const longNoisePercent = longFirst && longSecond
        ? Number(Math.max(Math.abs(longFirst.meanLuminanceDeltaPercent), Math.abs(longSecond.meanLuminanceDeltaPercent)).toFixed(2))
        : null;
      const longNoiseMovedPercent = longFirst && longSecond
        ? Number(Math.max(longFirst.pixelsMovedPercent, longSecond.pixelsMovedPercent).toFixed(1))
        : null;
      entry.cameras.push({
        cameraId: shot.cameraId, ok: true, ...measurement,
        cameraNoisePercent, cameraNoiseMovedPercent,
        longFloorMs: LONG_FLOOR_MS, longNoisePercent, longNoiseMovedPercent,
        withinCameraNoise: cameraNoisePercent === null
          ? null
          : Math.abs(measurement.meanLuminanceDeltaPercent) <= cameraNoisePercent
            && measurement.pixelsMovedPercent <= cameraNoiseMovedPercent,
        // The honest verdict: a delta inside EITHER floor is the frame moving
        // on its own, not the load path producing different light.
        withinLongFloor: longNoisePercent === null
          ? null
          : Math.abs(measurement.meanLuminanceDeltaPercent) <= longNoisePercent
            && measurement.pixelsMovedPercent <= longNoiseMovedPercent,
      });
      console.error(`[ibl-parity] ${arena}/${shot.cameraId}: ${measurement.meanLuminanceFirst} -> ${measurement.meanLuminanceSecond} (${measurement.meanLuminanceDeltaPercent}%), ${measurement.pixelsMovedPercent}% pixels moved; this camera's own floors ${cameraNoisePercent}%/${cameraNoiseMovedPercent}% @900ms, ${longNoisePercent}%/${longNoiseMovedPercent}% @${LONG_FLOOR_MS}ms`);
    }
    entry.noiseFloorPercent = Number(Math.max(
      Math.abs(first.noise.meanLuminanceDeltaPercent), Math.abs(second.noise.meanLuminanceDeltaPercent),
    ).toFixed(2));
    // Pixels-moved needs its own floor. On arenas with animated content that
    // the review clock does not pin - farcrysis surf and canopy, measured
    // 2026-09-02 at 19.2% and 12.8% moved on a mean luminance delta of -0.4%
    // and -0.17% - a large moved% is the animation, not the lighting, and
    // without this floor there is nothing to say so.
    entry.noiseFloorMovedPercent = Number(Math.max(
      first.noise.pixelsMovedPercent, second.noise.pixelsMovedPercent,
    ).toFixed(1));
    console.error(`[ibl-parity] ${arena}: env parity=${entry.observationParity} noise floor ${entry.noiseFloorPercent}% luminance / ${entry.noiseFloorMovedPercent}% pixels env='${first.observation.sceneEnvironment}' vs '${second.observation.sceneEnvironment}'`);
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
