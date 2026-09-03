#!/usr/bin/env node
// ===========================================================================
// ARENA SWITCH MATRIX — every arena reached from every other arena.
//
// WHY
// ---
// HF-417 (Lane I, 2026-09-02): switching INTO Gun Range from an already
// committed arena fails with
//   [Gun Range map selection failed] Error: WebGPU queue completion exceeded
//   12000 ms for submission 614 ... fenced draws 770
// and the previous arena stays committed. Gun Range's FIRST-load path is
// fine, so nothing that only ever boots straight into an arena — the
// eight-arena boot smoke, the pipeline probe, the player-path probe — can see
// this defect. Every one of them was green while the map was unreachable.
//
// The class is general: an arena's cold pipeline vocabulary being realised
// INSIDE the 12 s admission fence rather than before it. Which arena falls
// over depends on which one is entered second, so the only honest instrument
// is the full ordered matrix, and the roster has to be DERIVED — a hand-typed
// arena list is the exact bug this repo removed on 2026-08-30 (see
// gotcha "hardcoded gate rosters").
//
// HOW
// ---
// Roster is derived twice and intersected:
//   * `ARENA_IDS` in `src/arena-identity.ts` (the canonical id boundary), and
//   * the live menu's `.map-card[data-arena-id]` elements in the booted page
//     (what a player can actually pick).
// Both derivations have floors, so a derivation that stops matching fails
// LOUD instead of quietly sweeping an empty matrix.
//
// The ordered pairs are covered by a Hierholzer Eulerian circuit over the
// complete digraph, so N*(N-1) switches are walked in ONE continuous chain
// with no wasted transitions — every arena's in-degree equals its out-degree
// on K_n, so the circuit always exists. The chain is cut into fixed-size
// chunks, one fresh page per chunk, because a single page holding 56 arena
// generations is measuring the leak, not the switch.
//
// Each edge records the authoritative transition profile the game itself
// publishes (`snapshot().streaming.transition`), the per-phase breakdown, the
// WebGPU render pipelines and shader modules created inside the switch
// window, and whether the match then went active ON THE REQUESTED ARENA.
//
// THIS IS A GATE. Exit 1 when any edge does not commit. It never asserts a
// duration threshold: timings are evidence, commitment is the contract.
// The fence is never widened to make an edge pass.
//
// HEADLESS installed Chrome only (owner instruction 2026-09-02 12:40: "it
// keeps stealing my mouse, stop that"). The bundled Chromium cannot acquire a
// WebGPU device on dave-gaming-pc (dxil.dll Windows Error 87), so
// channel:'chrome' is not optional; a run that does not get a hardware WebGPU
// device is INVALIDATED (exit 2) rather than written as evidence.
//
// USAGE
//   node scripts/qa/probe-arena-switch-matrix.mjs --dist dist --label before
//   node scripts/qa/probe-arena-switch-matrix.mjs --dist dist \
//        --targets gun-range --sources atomic-acres,test1   (focused repro)
// ===========================================================================
import { chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
// The roster and the pair walk are pure and unit-tested in
// src/arena-switch-matrix-roster.test.ts; this file only drives a browser.
import { eulerianPairWalk, selectableArenaIdsFromSource } from './arena-switch-matrix-roster.mjs';

const execFileAsync = promisify(execFile);
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const flag = (name) => argv.includes(name);
const list = (value) => (value ? value.split(',').map((entry) => entry.trim()).filter(Boolean) : null);

const DIST = resolve(arg('--dist', 'dist'));
const LABEL = arg('--label', 'run');
const PORT = Number(arg('--port', '4197'));
const WIDTH = Number(arg('--width', '1600'));
const HEIGHT = Number(arg('--height', '900'));
const CHUNK_EDGES = Number(arg('--session-edges', '8'));
const SWITCH_TIMEOUT_MS = Number(arg('--switch-timeout-ms', '180000'));
const BOOT_TIMEOUT_MS = Number(arg('--boot-timeout-ms', '300000'));
const SETTLE_MS = Number(arg('--settle-ms', '900'));
const SOURCES = list(arg('--sources', null));
const TARGETS = list(arg('--targets', null));
const INCLUDE_HIDDEN = flag('--include-hidden');
const OUT = resolve(arg('--out', `artifacts/qa/switch-matrix/${LABEL}.json`));
const MIN_FREE_VRAM_MIB = Number(arg('--min-free-vram', '3000'));
// How long to YIELD to another lane's browser before measuring anyway. The
// default is unchanged (20 x 60 s); the flag exists so a run taken under
// DECLARED contention is possible on a machine three lanes share, and every
// such run still stamps `machine.playwrightChromeRivalSamples` so a reader
// can see how loud the room was. It is not a threshold: nothing passes or
// fails on it.
const RIVAL_WAIT_ATTEMPTS = Number(arg('--rival-wait-attempts', '20'));

if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);

/** Canonical id boundary, read from source. Floor so a broken regex fails loud. */
function registryArenaIds() {
  const source = readFileSync(resolve(process.cwd(), 'src/arena-identity.ts'), 'utf8');
  const block = source.match(/export const ARENA_IDS = Object\.freeze\(\[([\s\S]*?)\] as const\);/u);
  if (!block) throw new Error('ARENA_IDS could not be read from src/arena-identity.ts');
  const ids = [...block[1].matchAll(/'([a-z0-9-]+)'/gu)].map((match) => match[1]);
  if (ids.length < 8) throw new Error(`ARENA_IDS derivation collapsed to ${ids.length} ids`);
  return ids;
}

// --- the owner's ComfyUI shares this GPU; never crowd it, never kill it ----
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
    console.error(`[switch-matrix] ComfyUI is generating; waiting 60 s (${attempt + 1}/${attempts})`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`ComfyUI never went idle after ${attempts} checks; measure later rather than crowd it`);
}

/**
 * OTHER LANES SHARE THIS GPU. Measured 2026-09-02: a Lane V Playwright run
 * started at 19:04 and its eight headless Chrome processes were live through
 * the middle of this lane's baseline sweep. Free VRAM said nothing about it -
 * a rival browser competes for the SAME GPU submission queue this probe is
 * timing, and a 12 s fence is exactly the thing that loses to contention.
 * So: count rival Playwright Chromes (this probe has launched none yet at the
 * time of the check) and yield to them. After the wait budget the run
 * PROCEEDS but stamps the count, because a lane that can never measure is
 * worse than a measurement that says how loud the room was.
 */
async function countRivalPlaywrightBrowsers() {
  if (process.platform !== 'win32') return 0;
  const script = "@(Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | "
    + "Where-Object { $_.CommandLine -like '*playwright*' }).Count";
  try {
    const { stdout } = await execFileAsync('powershell', ['-NoProfile', '-Command', script]);
    const count = Number(stdout.trim());
    return Number.isFinite(count) ? count : 0;
  } catch { return 0; }
}

async function waitForQuietBrowsers(attempts = 20) {
  let count = await countRivalPlaywrightBrowsers();
  for (let attempt = 0; attempt < attempts && count > 0; attempt += 1) {
    console.error(`[switch-matrix] ${count} rival Playwright Chrome processes on this GPU; waiting 60 s (${attempt + 1}/${attempts})`);
    await new Promise((r) => setTimeout(r, 60_000));
    count = await countRivalPlaywrightBrowsers();
  }
  return count;
}

async function waitForGpuHeadroom(minimumFreeMiB, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { stdout } = await execFileAsync('nvidia-smi',
      ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits']);
    const [used, total] = stdout.trim().split('\n')[0].split(',').map((value) => Number(value.trim()));
    const free = total - used;
    if (free >= minimumFreeMiB) return { free, total, attempt };
    console.error(`[switch-matrix] GPU has ${free} MiB free (< ${minimumFreeMiB}); waiting 60 s`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
  throw new Error(`GPU never reached ${minimumFreeMiB} MiB free after ${attempts} checks`);
}

// --- static dist server (no vite child; nothing to orphan) -----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
  const body = readFileSync(file);
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': body.length, 'cache-control': 'no-store',
  });
  response.end(body);
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const comfy = await waitForComfyIdle();
const rivalBrowsers = await waitForQuietBrowsers(RIVAL_WAIT_ATTEMPTS);
const gpu = await waitForGpuHeadroom(MIN_FREE_VRAM_MIB);
console.error(`[switch-matrix] ComfyUI ${comfy.comfy}; rival browsers ${rivalBrowsers}; GPU ${gpu.free}/${gpu.total} MiB free`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    // Belt and braces on top of headless: a future edit that flips headless
    // off by accident still cannot put a window on the owner's screen.
    '--window-position=-32000,-32000',
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const gitSha = await execFileAsync('git', ['rev-parse', 'HEAD']).then((r) => r.stdout.trim()).catch(() => null);
// A dist built from an uncommitted tree carries a HEAD sha that does NOT
// describe the measured code. PASS 85 lane H shipped exactly that receipt (its
// after-run stamped b082bc83 while measuring two later commits' source), so the
// header now names the dirt instead of leaving a reviewer to discover it.
const gitDirtyFiles = await execFileAsync('git', ['status', '--porcelain'])
  .then((r) => r.stdout.split('\n').map((line) => line.trim()).filter(Boolean))
  .catch(() => null);
const report = {
  contract: 'arena-switch-matrix-v1',
  measuredAt: new Date().toISOString(),
  label: LABEL, dist: DIST, gitSha,
  // `gitSha` is the SOURCE TREE this probe ran FROM, which is NOT necessarily
  // the tree the measured DIST was built from - a baseline dist served out of a
  // second worktree is exactly that case, and reading gitSha as the build's
  // identity is how the first pass of this lane shipped a receipt named for a
  // commit it did not contain. The content-hashed entry bundle names the BUILD
  // and cannot be confused with anything else.
  distBundle: (() => {
    try {
      const assets = join(DIST, 'assets');
      if (!existsSync(assets)) return null;
      return readdirSync(assets).find((file) => /^legacy-main-[A-Za-z0-9_-]+\.js$/u.test(file)) ?? null;
    } catch { return null; }
  })(),
  gitDirty: gitDirtyFiles === null ? null : gitDirtyFiles.length > 0,
  gitDirtyFiles: gitDirtyFiles === null ? null : gitDirtyFiles.slice(0, 40),
  viewport: { width: WIDTH, height: HEIGHT },
  machine: {
    comfyUi: comfy.comfy, gpuFreeMiB: gpu.free, gpuTotalMiB: gpu.total,
    // Non-zero means another lane's browser was competing for this GPU for at
    // least part of the sweep; treat every duration in the report as an upper
    // bound and do not set it beside a quiet-machine run.
    rivalPlaywrightBrowsersAtLaunch: rivalBrowsers,
    rivalWaitAttempts: RIVAL_WAIT_ATTEMPTS,
    // Sampled every 60 s FOR THE WHOLE RUN and filled in at the end. A
    // launch-only check is how lane H's baseline sweep was reported "quiet"
    // while eight of another lane's headless Chromes were live through the
    // middle of it. `self` is this probe's own Chrome process family, measured
    // once its first page is up, so the excess over it is other people's work.
    playwrightChromeProcessesSelf: null,
    playwrightChromeProcessesMax: null,
    playwrightChromeProcessSamples: null,
    rivalPlaywrightBrowsersMaxDuringRun: null,
  },
  roster: null, edges: [], firstLoads: [], invalidated: null,
};

const COUNT_HOOK = () => {
  // SYNC AND ASYNC ARE DIFFERENT MEASUREMENTS. `createRenderPipeline` blocks the
  // calling frame and is what a 12 s fence dies on; `createRenderPipelineAsync`
  // hands the compile to the driver and returns. PASS 85 lane H's first cut
  // pushed both into one array and then derived an "in-fence" figure from it,
  // which counted its own off-fence precompile as fenced work. Separate sinks.
  const state = { pipelines: [], pipelinesAsync: [], shaderModules: [], hooked: false };
  window.__SWITCH_PROBE__ = state;
  const install = () => {
    if (state.hooked) return;
    const device = window.GPUDevice;
    if (!device?.prototype) return;
    state.hooked = true;
    const wrap = (methodName, sink) => {
      const original = device.prototype[methodName];
      if (typeof original !== 'function') return;
      device.prototype[methodName] = function patched(descriptor, ...rest) {
        sink.push(Math.round(performance.now()));
        return original.call(this, descriptor, ...rest);
      };
    };
    wrap('createRenderPipeline', state.pipelines);
    wrap('createRenderPipelineAsync', state.pipelinesAsync);
    wrap('createShaderModule', state.shaderModules);
  };
  install();
  if (!state.hooked) {
    const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
    setTimeout(() => clearInterval(timer), 30_000);
  }
};

async function openPage() {
  const openedAt = Date.now();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 300)); });
  const cdp = await page.context().newCDPSession(page);
  // Focus EMULATION, not a real focus grab: a headless page still throttles
  // timers when it believes it is backgrounded. Never touches the desktop.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.addInitScript(COUNT_HOOK);
  await page.goto(`http://127.0.0.1:${PORT}/?release=latest&renderer=webgpu&render=quality&seed=switchmatrix`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => {
    const solo = document.querySelector('#solo');
    return solo !== null && !solo.disabled;
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  return { page, errors, timeToMenuMs: Date.now() - openedAt };
}

const counters = (page) => page.evaluate(() => ({
  pipelinesSync: window.__SWITCH_PROBE__?.pipelines.length ?? -1,
  pipelinesAsync: window.__SWITCH_PROBE__?.pipelinesAsync.length ?? -1,
  // `pipelines` stays the sync+async total so every historical field keeps its
  // meaning; the fenced-cost question is answered by the sync figure alone.
  pipelines: (window.__SWITCH_PROBE__?.pipelines.length ?? 0)
    + (window.__SWITCH_PROBE__?.pipelinesAsync.length ?? 0),
  shaderModules: window.__SWITCH_PROBE__?.shaderModules.length ?? -1,
}));

/**
 * The creation TIMESTAMPS since `fromIndex`, in the page's own performance.now()
 * clock — the same clock the arena transition profiler stamps its phases with.
 * Totals alone cannot answer the question HF-417 actually asks, which is not
 * "how many pipelines" but "how many were built INSIDE a fenced submission".
 */
const creationTimeline = (page, from) => page.evaluate(({ p, a, m }) => ({
  pipelines: (window.__SWITCH_PROBE__?.pipelines ?? []).slice(p),
  pipelinesAsync: (window.__SWITCH_PROBE__?.pipelinesAsync ?? []).slice(a),
  shaderModules: (window.__SWITCH_PROBE__?.shaderModules ?? []).slice(m),
}), { p: from.pipelinesSync, a: from.pipelinesAsync, m: from.shaderModules });

/** Buckets creation timestamps into the transition phases that contain them. */
function attributeToPhases(phases, timestamps) {
  const buckets = Object.create(null);
  for (const at of timestamps) {
    const phase = phases.find((entry) => at >= entry.startedAt && at <= entry.completedAt);
    const key = phase ? phase.phase : 'outside-transition';
    buckets[key] = (buckets[key] ?? 0) + 1;
  }
  return buckets;
}

const transitionState = (page) => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const streaming = snapshot?.arenaSelection?.streaming ?? snapshot?.streaming ?? null;
  const transition = streaming?.transition ?? null;
  return {
    committedArenaId: document.documentElement.dataset.arenaId ?? null,
    phase: transition?.phase ?? null,
    failure: transition?.failure ?? null,
    outcome: transition?.profile?.outcome ?? null,
    profileArenaId: transition?.profile?.arenaId ?? null,
    durationMs: transition?.profile?.durationMs ?? null,
    phases: (transition?.profile?.phases ?? []).map((entry) => ({
      phase: entry.phase, startedAt: entry.startedAt, completedAt: entry.completedAt, durationMs: entry.durationMs,
    })),
    residentArenaRoots: streaming?.residentArenaRoots ?? null,
    matchPhase: snapshot?.matchPhase ?? null,
    gameStarted: snapshot?.gameStarted ?? null,
    // Attribution INSIDE the single dominant phase. `prewarm-batched-effects`
    // is one profiler phase but ten independent vocabulary families, and the
    // game already publishes their individual durations; reading them here is
    // the difference between "10 s of prewarm" and knowing which family to cut.
    effectPrewarm: (() => {
      const profile = snapshot?.bootstrap?.effectPrewarmProfile ?? null;
      if (!profile) return null;
      return {
        durationMs: profile.durationMs,
        groups: (profile.groups ?? []).map((group) => [group.name, group.durationMs]),
      };
    })(),
  };
});

/**
 * What the arena actually asks the renderer to draw. Unique MATERIALS (by
 * object identity, not name — two materials with the same name and different
 * parameters are two pipelines) and total triangles are the two numbers that
 * explain a load-time outlier, and the material count is the direct handle on
 * "compile less".
 */
const sceneCensus = (page) => page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const materials = new Set();
  const materialNames = new Set();
  let triangles = 0;
  let meshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let skinned = 0;
  scene.traverseVisible((node) => {
    if (!node.isMesh && !node.isInstancedMesh && !node.isSkinnedMesh && !node.isLine && !node.isPoints) return;
    meshes += 1;
    if (node.isSkinnedMesh) skinned += 1;
    const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of list) { materials.add(material); materialNames.add(material.name || material.type); }
    const geometry = node.geometry;
    const count = node.isInstancedMesh ? (node.count ?? 1) : 1;
    if (node.isInstancedMesh) { instancedMeshes += 1; instances += count; }
    if (geometry?.index) triangles += (geometry.index.count / 3) * count;
    else if (geometry?.attributes?.position) triangles += (geometry.attributes.position.count / 3) * count;
  });
  return {
    uniqueMaterials: materials.size,
    distinctMaterialNames: materialNames.size,
    triangles: Math.round(triangles),
    meshes, instancedMeshes, instances, skinnedMeshes: skinned,
  };
});

/**
 * Match admission's own phase breakdown, published by the game since lane H2.
 * `deployMs` alone is 14-20 s per arena and says nothing about WHERE it goes;
 * this is the same shape the transition profiler publishes. Null on a build
 * that predates the profiler, so a before/after against an older dist degrades
 * to "no rows" instead of throwing.
 */
const matchAdmissionProfile = (page) => page.evaluate(() => {
  const profile = window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.bootstrap?.matchAdmissionProfile ?? null;
  if (!profile) return null;
  return {
    arenaId: profile.arenaId, mode: profile.mode, durationMs: profile.durationMs,
    steps: (profile.steps ?? []).map((step) => [step.name, step.durationMs]),
  };
});

/** Deploy the currently selected arena and wait for a live match on it. */
async function deploy(page, arena) {
  const startedAt = Date.now();
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  const active = await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(snapshot && snapshot.matchPhase === 'active' && snapshot.gameStarted === true);
  }, undefined, { timeout: SWITCH_TIMEOUT_MS }).then(() => true).catch(() => false);
  const onRequestedArena = await page.evaluate(() => document.documentElement.dataset.arenaId ?? null);
  return { deployMs: Date.now() - startedAt, matchActive: active, matchArenaId: onRequestedArena, requested: arena };
}

/** One measured edge: menu round trip, select `target`, deploy, report. */
async function switchEdge(page, errors, source, target) {
  const errorsBefore = errors.length;
  const before = await counters(page);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.returnToMainMenu(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.gameStarted === false;
  }, undefined, { timeout: SWITCH_TIMEOUT_MS });
  await page.waitForTimeout(SETTLE_MS);
  const selectStartedAt = Date.now();
  // The selection promise resolves on commit AND on rollback, so a failing
  // edge is measured rather than timing out into an unattributable error.
  const selectionError = await page.evaluate(async (id) => {
    try { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); return null; }
    catch (error) { return String(error).slice(0, 300); }
  }, target).catch((error) => `probe: ${String(error).slice(0, 200)}`);
  const selectMs = Date.now() - selectStartedAt;
  const state = await transitionState(page);
  const committed = state.outcome === 'committed'
    && state.profileArenaId === target
    && state.committedArenaId === target;
  // Read the timeline BEFORE deploying: the deploy submits its own frames and
  // would fold match-start compiles into the switch's attribution.
  const timeline = await creationTimeline(page, before);
  const switchCounters = await counters(page);
  const deployed = committed ? await deploy(page, target) : { deployMs: null, matchActive: false, matchArenaId: state.committedArenaId, requested: target };
  const admission = committed ? await matchAdmissionProfile(page) : null;
  const after = await counters(page);
  return {
    source, target, committed,
    ok: committed && deployed.matchActive && deployed.matchArenaId === target,
    selectMs, deployMs: deployed.deployMs,
    transitionMs: state.durationMs,
    outcome: state.outcome, phase: state.phase, failure: state.failure,
    committedArenaId: state.committedArenaId,
    matchActive: deployed.matchActive, matchArenaId: deployed.matchArenaId,
    matchAdmission: admission,
    residentArenaRoots: state.residentArenaRoots,
    effectPrewarm: state.effectPrewarm,
    pipelinesCreated: switchCounters.pipelines - before.pipelines,
    pipelinesCreatedSync: switchCounters.pipelinesSync - before.pipelinesSync,
    pipelinesCreatedAsync: switchCounters.pipelinesAsync - before.pipelinesAsync,
    shaderModulesCreated: switchCounters.shaderModules - before.shaderModules,
    pipelinesCreatedDuringDeploy: after.pipelines - switchCounters.pipelines,
    // WHERE the compiles landed. `visual-definition` holds the warm frame and
    // its 12 s fence; `coverage-submit-fence` holds the committing coverage
    // draw and its own. A SYNCHRONOUS pipeline created inside either was built
    // inside a fenced submission, which is the HF-417 failure mechanism. An
    // ASYNC one was not: it is exactly the work an off-fence precompile moves
    // out of the fence, and it lands in the same wall-clock window, so the two
    // must never be summed and called "in-fence" (they were, in the first cut).
    pipelinesByPhase: attributeToPhases(state.phases, [...timeline.pipelines, ...timeline.pipelinesAsync]),
    pipelinesSyncByPhase: attributeToPhases(state.phases, timeline.pipelines),
    pipelinesAsyncByPhase: attributeToPhases(state.phases, timeline.pipelinesAsync),
    shaderModulesByPhase: attributeToPhases(state.phases, timeline.shaderModules),
    phases: state.phases,
    selectionError,
    errors: errors.slice(errorsBefore).slice(0, 8),
  };
}

let exitCode = 0;
// Every 60 s for the whole sweep. `self` is this probe's own Chrome family
// once its first page exists, so anything above it is another lane's browser
// competing for the SAME GPU submission queue the fence is timed against.
let playwrightSamples = [];
let selfPlaywrightProcesses = null;
const rivalSampler = setInterval(() => {
  countRivalPlaywrightBrowsers()
    .then((count) => playwrightSamples.push(count))
    .catch(() => {});
}, 60_000);
rivalSampler.unref?.();
try {
  const registryIds = registryArenaIds();
  const { page: rosterPage } = await openPage();  // eslint-disable-line
  selfPlaywrightProcesses = await countRivalPlaywrightBrowsers().catch(() => null);
  report.machine.playwrightChromeProcessesSelf = selfPlaywrightProcesses;
  const backend = await rosterPage.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  const device = await rosterPage.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { gpu: true, adapter: false };
      return { gpu: true, adapter: true, device: Boolean(await adapter.requestDevice()) };
    } catch (error) { return { gpu: true, adapter: 'error', error: String(error).slice(0, 160) }; }
  });
  const sourceSelectable = selectableArenaIdsFromSource(readFileSync(resolve(process.cwd(), 'src/map-selection.ts'), 'utf8'));
  // Wait for the grid the source says must exist, rather than reading whatever
  // is mounted at the instant `#solo` enables.
  await rosterPage.waitForFunction((expected) =>
    document.querySelectorAll('.map-card[data-arena-id]').length === expected,
  sourceSelectable.length, { timeout: BOOT_TIMEOUT_MS });
  const menuIds = await rosterPage.evaluate(() =>
    [...document.querySelectorAll('.map-card[data-arena-id]')].map((card) => card.dataset.arenaId));
  await rosterPage.close();
  if ([...menuIds].sort().join(',') !== [...sourceSelectable].sort().join(',')) {
    throw new Error(`menu roster ${menuIds.join(',')} does not match the source's selectable set ${sourceSelectable.join(',')}`);
  }
  if (backend !== 'webgpu' || device.device !== true) {
    report.invalidated = `no hardware WebGPU device (backend=${backend}, device=${JSON.stringify(device)})`;
    throw new Error(report.invalidated);
  }
  if (menuIds.length < 6) throw new Error(`menu roster derivation collapsed to ${menuIds.length} cards`);
  const unknown = menuIds.filter((id) => !registryIds.includes(id));
  if (unknown.length > 0) throw new Error(`menu offers ids the registry does not know: ${unknown.join(',')}`);
  let roster = INCLUDE_HIDDEN ? registryIds : menuIds;
  report.roster = { registryIds, sourceSelectable, menuIds, includeHidden: INCLUDE_HIDDEN, roster, backend, device };

  let pairs = eulerianPairWalk(roster);
  if (SOURCES) pairs = pairs.filter(([source]) => SOURCES.includes(source));
  if (TARGETS) pairs = pairs.filter(([, target]) => TARGETS.includes(target));
  report.plannedEdges = pairs.length;
  console.error(`[switch-matrix] ${roster.length} arenas, ${pairs.length} ordered pairs, ${CHUNK_EDGES} per session`);

  for (let offset = 0; offset < pairs.length; offset += CHUNK_EDGES) {
    const chunk = pairs.slice(offset, offset + CHUNK_EDGES);
    const { page, errors, timeToMenuMs: pageTimeToMenuMs } = await openPage();
    try {
      // The chunk's first source is entered as a FIRST load; only the
      // switches after it are measured edges.
      let current = null;
      for (const [source, target] of chunk) {
        if (current !== source) {
          const firstLoadStartedAt = Date.now();
          // MEASURED DEFECT (lane H2, 2026-09-03): `performArenaSelection` early-
          // returns while `gameStarted` is true, so selecting a new source while
          // the previous edge's match is still live is a NO-OP. The probe then
          // deployed (also a no-op), saw `matchActive`, recorded a first-load row
          // and walked an "edge" that never left the arena it was already on -
          // four of eight rows in the `--targets nuketown2` run had selectMs of
          // 1-10 ms and 0 pipelines. Return to the menu first, then select.
          await page.evaluate(async () => {
            const debug = window.__ATOMIC_ACRES_DEBUG__;
            if (debug.snapshot().gameStarted === true) debug.returnToMainMenu();
          });
          await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === false,
            undefined, { timeout: SWITCH_TIMEOUT_MS });
          await page.waitForTimeout(SETTLE_MS);
          await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, source);
          const state = await transitionState(page);
          const beforeAdmission = await counters(page);
          const deployed = await deploy(page, source);
          const admission = await matchAdmissionProfile(page);
          const afterAdmission = await counters(page);
          const census = deployed.matchActive ? await sceneCensus(page) : null;
          report.firstLoads.push({
            arena: source, ms: Date.now() - firstLoadStartedAt,
            timeToMenuMs: pageTimeToMenuMs,
            transitionMs: state.durationMs, outcome: state.outcome,
            deployMs: deployed.deployMs,
            matchActive: deployed.matchActive, phases: state.phases,
            effectPrewarm: state.effectPrewarm,
            matchAdmission: admission,
            // "Before admission" is everything the page compiled from boot up
            // to the first live match frame — the number the owner feels as
            // "how long until I am playing".
            pipelinesBeforeAdmission: beforeAdmission.pipelines,
            pipelinesSyncBeforeAdmission: beforeAdmission.pipelinesSync,
            pipelinesAsyncBeforeAdmission: beforeAdmission.pipelinesAsync,
            shaderModulesBeforeAdmission: beforeAdmission.shaderModules,
            pipelinesDuringAdmission: afterAdmission.pipelines - beforeAdmission.pipelines,
            census,
          });
          if (!deployed.matchActive) throw new Error(`first load into ${source} never reached an active match`);
          // The floor that would have caught the defect above at once: a first
          // load that lands on a DIFFERENT arena than the one asked for makes
          // every edge measured from it a fiction. Fail loud, never record it.
          if (deployed.matchArenaId !== source) {
            throw new Error(`first load asked for ${source} but the live match is on ${deployed.matchArenaId}`);
          }
          current = source;
        }
        const edge = await switchEdge(page, errors, source, target);
        report.edges.push(edge);
        console.error(`[switch-matrix] ${source} -> ${target}: ${edge.ok ? 'ok' : 'FAIL'} `
          + `${edge.transitionMs ?? '?'} ms, ${edge.pipelinesCreated} pipelines`
          + (edge.failure ? ` — ${edge.failure.slice(0, 120)}` : ''));
        // A failed edge leaves the PREVIOUS arena committed, which is exactly
        // the defect; the chain continues from whatever is actually live.
        current = edge.committed ? target : edge.committedArenaId;
        if (!edge.ok) exitCode = 1;
      }
    } finally {
      await page.close();
    }
  }
  report.summary = {
    edges: report.edges.length,
    failed: report.edges.filter((edge) => !edge.ok).length,
    failedPairs: report.edges.filter((edge) => !edge.ok).map((edge) => `${edge.source}->${edge.target}`),
    medianTransitionMs: (() => {
      const values = report.edges.map((edge) => edge.transitionMs).filter((value) => typeof value === 'number').sort((a, b) => a - b);
      return values.length ? values[Math.floor(values.length / 2)] : null;
    })(),
    slowestEdges: [...report.edges].sort((a, b) => (b.transitionMs ?? 0) - (a.transitionMs ?? 0)).slice(0, 6)
      .map((edge) => ({ pair: `${edge.source}->${edge.target}`, transitionMs: edge.transitionMs, pipelines: edge.pipelinesCreated })),
  };
} catch (error) {
  report.error = String(error).slice(0, 600);
  exitCode = report.invalidated ? 2 : 1;
} finally {
  clearInterval(rivalSampler);
  const maxObserved = playwrightSamples.length ? Math.max(...playwrightSamples) : null;
  report.machine.playwrightChromeProcessesMax = maxObserved;
  report.machine.playwrightChromeProcessSamples = playwrightSamples.length;
  // Never negative, and null when the self baseline could not be taken: a
  // number that cannot be justified is worse than an honest gap.
  report.machine.rivalPlaywrightBrowsersMaxDuringRun =
    maxObserved === null || selfPlaywrightProcesses === null
      ? null : Math.max(0, maxObserved - selfPlaywrightProcesses);
  await browser.close().catch(() => {});
  await new Promise((done) => server.close(done));
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`[switch-matrix] wrote ${OUT}`);
  if (report.summary) console.error(`[switch-matrix] ${report.summary.edges - report.summary.failed}/${report.summary.edges} edges committed`);
  if (report.error) console.error(`[switch-matrix] ${report.error}`);
  // Playwright's Chrome child can outlive close() on Windows. This REPORTS an
  // orphan and never kills anything: the machine rule is absolute (never kill a
  // process you did not start) and this probe cannot prove which are its own.
  // What stood here was `spawnSync('cmd', ['/c', 'exit', '0'])` - a no-op
  // wearing a cleanup comment, the same defect class this gate exists to catch.
  const leftBehind = await countRivalPlaywrightBrowsers().catch(() => null);
  if (leftBehind !== null && leftBehind > rivalBrowsers) {
    console.error(`[switch-matrix] WARNING: ${leftBehind} Playwright Chrome processes remain `
      + `(${rivalBrowsers} before this run). Killing none; check for an orphan.`);
  }
  process.exit(exitCode);
}
