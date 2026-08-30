#!/usr/bin/env node
// Measures cold MAX-preset match admission on the REAL WebGPU route in
// installed Chrome, driven over CDP with focus emulation.
//
// WHY THIS EXISTS rather than scripts/qa/measure-preset-admission.mjs.
// That harness sets `#graphics-profile` and dispatches `change`, which only
// records `pendingGraphicsPreset`. The graphics transaction is flushed when
// the player LEAVES the options tab (legacy-main `setMenuTab` ->
// `flushPendingGraphics`), and switching to MAX stages
// `ambientOcclusionTopology` + `screenSpaceTopology`, so the flush ends in
// `reloadForGraphicsRuntime()` - a full page reload that reconstructs the
// renderer with the MAX MRT/post topology. Without that reload the measured
// deployment is still the PREVIOUS preset, and the harness also read
// `snapshot().graphics` (which does not exist; the field is
// `snapshot().settings.graphics`), so its receipts recorded `graphics: null`
// and could not have caught the mistake.
//
// This harness drives the owner's exact route - OPTIONS tab -> GRAPHICS MODE
// -> DEPLOY tab -> reload - and then FAILS CLOSED unless the reloaded page
// reports the requested preset with an empty staged-reconstruction list and a
// real WebGPU backend. Every timing below is therefore a MAX timing.
//
// Usage:
//   node scripts/qa/measure-max-preset-admission-cdp.mjs --url http://127.0.0.1:41910 \
//        [--preset max] [--arena atomic-acres] [--timeout-ms 240000] [--out artifacts/qa/x.json]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const PRESET = arg('--preset', 'max');
const ARENA = arg('--arena', 'atomic-acres');
const TIMEOUT_MS = Number(arg('--timeout-ms', '240000'));
const OUT = arg('--out', `artifacts/qa/max-admission-${PRESET}-${ARENA}.json`);
// HEADLESS IS REAL WEBGPU HERE, and that is not what this repo assumed.
// GAUNTLET-SPEC records "headless Chromium on this machine cannot create a
// WebGPU device", which is true of Playwright's BUNDLED Chromium. Installed
// Chrome driven with channel:'chrome' and headless:true reports
// actualBackend 'webgpu' on adapter "nvidia / blackwell" with
// softwareAdapter false, document.hasFocus() true and visibilityState
// 'visible' — a real hardware device on the owner's RTX 5080, verified before
// this flag was added. That matters because a headed Chrome doing WebGPU is
// worth several agents of RAM and has to take a machine-wide governor slot,
// while this does not.
// It is still not the owner's environment: there is no real compositor
// presenting a swapchain, so FRAME PACING results from a headless run are not
// interchangeable with headed ones. Pipeline compilation and queue completion
// — what this harness measures — are real GPU work on the real adapter.
// Default stays headed; --headless 1 is an explicit, disclosed choice.
const HEADLESS = arg('--headless', '0') === '1';

const browser = await chromium.launch({
  headless: HEADLESS,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is timer-throttled and every stage
    // looks like a stall.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 400)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text().slice(0, 400));
});

const waitForDebug = async () => {
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
};

// A shared outDir means another agent's `vite build` can repopulate the served
// tree mid-run; pin the bundle identity so that reads as an invalidated
// measurement rather than a renderer regression.
const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-') || name.includes('/index-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);

// traceNodeBuilds installs the runtime's node-build trace, so a slow cold
// compile can be attributed to the exact material/geometry that produced it
// instead of guessed at from a wall-clock total.
const url = `${BASE}/?release=latest&renderer=webgpu&seed=maxadm-${PRESET}&previewTime=0&traceNodeBuilds=1`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await waitForDebug();
const bundleAtStart = await servedBundle();

// --- Drive the owner's real route to the preset -----------------------------
await page.evaluate((preset) => {
  const options = document.querySelector('#menu-tab-options');
  if (!(options instanceof HTMLElement)) throw new Error('#menu-tab-options not found');
  options.click();
  const select = document.querySelector('#graphics-profile');
  if (!(select instanceof HTMLSelectElement)) throw new Error('#graphics-profile not found');
  select.value = preset;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, PRESET);

// Leaving OPTIONS is the save point. When the preset changes MRT/post topology
// this reloads the page; when it does not, it applies live and stays.
const navigation = page.waitForNavigation({ timeout: 60_000 }).catch(() => null);
await page.evaluate(() => {
  const deploy = document.querySelector('#menu-tab-deploy');
  if (!(deploy instanceof HTMLElement)) throw new Error('#menu-tab-deploy not found');
  deploy.click();
});
await navigation;
await waitForDebug();

const applied = await page.evaluate(() => {
  const settings = window.__ATOMIC_ACRES_DEBUG__.snapshot().settings;
  const graphics = settings.graphics ?? {};
  let adapter = null;
  try {
    const render = window.__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry().render;
    adapter = {
      label: render.adapterLabel,
      softwareAdapter: render.softwareAdapter,
      actualBackend: render.actualBackend,
    };
  } catch { /* telemetry unavailable */ }
  return {
    adapter,
    displayedGraphicsPreset: settings.displayedGraphicsPreset ?? null,
    requestedPreset: settings.requested?.graphics?.preset ?? null,
    stagedReconstruction: settings.liveApplication?.stagedReconstruction ?? null,
    backend: document.documentElement.dataset.renderBackend ?? null,
    antialiasSamples: graphics.antialiasSamples ?? null,
    ambientOcclusion: graphics.ambientOcclusion ?? null,
    screenSpace: graphics.screenSpace ?? null,
    pixelRatioCap: graphics.pixelRatioCap ?? null,
  };
});

// A software adapter would make every timing below meaningless, so it is
// refused exactly like a wrong preset would be.
const presetProven = applied.displayedGraphicsPreset === PRESET
  && applied.requestedPreset === PRESET
  && Array.isArray(applied.stagedReconstruction)
  && applied.stagedReconstruction.length === 0
  && applied.backend === 'webgpu'
  && applied.adapter?.softwareAdapter === false;

if (!presetProven) {
  const record = {
    preset: PRESET, arena: ARENA, outcome: 'preset-not-applied', applied, bundleAtStart, errors,
  };
  mkdirSync(dirname(resolve(OUT)), { recursive: true });
  writeFileSync(resolve(OUT), JSON.stringify(record, null, 2));
  await browser.close();
  console.error(`[max-admission] PRESET NOT APPLIED — refusing to report a timing. ${JSON.stringify(applied)}`);
  process.exit(2);
}

// --- Arena selection (the arena-rebuild boundary) ---------------------------
const sample = () => page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const state = api.admissionState();
  const status = document.getElementById('network-status')?.textContent ?? '';
  let presentation = null;
  try { presentation = api.samplePresentationTelemetry(); } catch { /* backend may not expose it */ }
  return {
    stage: state.bootstrapStage ?? null,
    gameStarted: state.gameStarted,
    matchPhase: state.matchPhase ?? null,
    arenaTransitionPhase: state.arenaTransitionPhase ?? null,
    status,
    lastCompletionLatencyMs: presentation?.lastCompletionLatencyMs ?? null,
    maximumCompletionLatencyMs: presentation?.progress?.maximumCompletionLatencyMs ?? null,
    submissionSequence: presentation?.submissionSequence ?? null,
    completedSequence: presentation?.completedSequence ?? null,
  };
}).catch(() => null);

const series = [];
const stages = [];
let lastStage = null;
const record = (tMs, entry) => {
  series.push({ tMs, ...entry });
  if (entry.stage !== lastStage) {
    lastStage = entry.stage;
    stages.push({ tMs, ...entry });
  }
};

const startedAt = Date.now();
let outcome = 'unknown';
let selectArenaMs = null;
let startSoloAtMs = null;

const selectPromise = page.evaluate(async (arenaId) => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena(arenaId);
}, ARENA).then(() => 'ok', (error) => String(error).slice(0, 400));

let selectResult = null;
while (Date.now() - startedAt < TIMEOUT_MS) {
  const entry = await sample();
  if (entry) {
    record(Date.now() - startedAt, entry);
    if (/Deployment preparation failed/i.test(entry.status) || /map selection failed/i.test(entry.status)) {
      outcome = 'arena-failed';
      break;
    }
  }
  const settled = await Promise.race([selectPromise, new Promise((r) => setTimeout(() => r(null), 200))]);
  if (settled !== null) { selectResult = settled; break; }
}
if (selectResult === null && outcome === 'unknown') outcome = 'arena-timeout';
// selectArena rejects on a failed transition; that is a REAL failure, not a
// reason to carry on and report a deployment timing.
if (outcome === 'unknown' && selectResult !== null && selectResult !== 'ok') {
  outcome = 'arena-failed';
  errors.push(`selectArena: ${selectResult}`);
}
selectArenaMs = Date.now() - startedAt;

const arenaTransition = await page.evaluate(() => {
  const streaming = window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection?.streaming ?? null;
  return streaming?.transition ?? null;
}).catch(() => null);

// The transition profiler reports `coverage-submit-fence` as ONE number. This
// splits it: how much was the yielding exact-ScenePass compile, and therefore
// how much was the forced full-coverage draw that follows it.
const precompile = await page.evaluate(() => {
  let found = null;
  window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph().traverse((node) => {
    const record = node.userData?.pass65AdvancedGraphics?.exactScenePassPrecompile;
    if (record) found = { ...record };
  });
  return found;
}).catch(() => null);

// --- Deployment (the guarded 4000 ms admission flushes) ---------------------
if (outcome === 'unknown') {
  startSoloAtMs = Date.now() - startedAt;
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); }).catch(() => {});
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const entry = await sample();
    if (entry) {
      record(Date.now() - startedAt, entry);
      if (/Deployment preparation failed/i.test(entry.status)) { outcome = 'admission-failed'; break; }
      if (entry.gameStarted && entry.matchPhase) { outcome = 'admitted'; break; }
    }
    await new Promise((tick) => setTimeout(tick, 150));
  }
  if (outcome === 'unknown') outcome = 'timeout';
}

const finalSample = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  let presentation = null;
  try { presentation = api.samplePresentationTelemetry(); } catch { /* ignore */ }
  const snapshot = api.snapshot();
  let slowNodeBuilds = null;
  try {
    const cold = api.sampleGrenadeColdPathTelemetry();
    const builds = cold?.render?.slowNodeBuilds ?? [];
    slowNodeBuilds = [...builds]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 25)
      .map((entry) => ({
        atMs: Math.round(entry.atMs),
        durationMs: Number(entry.durationMs.toFixed(1)),
        mode: entry.mode,
        objectName: entry.objectName,
        materialName: entry.materialName,
        geometryType: entry.geometryType,
      }));
  } catch { /* trace not installed */ }
  return {
    state: api.admissionState(),
    presentation,
    status: document.getElementById('network-status')?.textContent ?? '',
    displayedGraphicsPreset: snapshot.settings?.displayedGraphicsPreset ?? null,
    arenaTransition: snapshot.arenaSelection?.streaming?.transition ?? null,
    slowNodeBuilds,
  };
}).catch(() => null);

const bundleAtEnd = await servedBundle();
const totalMs = Date.now() - startedAt;
await browser.close();

const result = {
  preset: PRESET,
  arena: ARENA,
  headless: HEADLESS,
  outcome,
  totalMs,
  selectArenaMs,
  startSoloAtMs,
  deployMs: startSoloAtMs === null ? null : totalMs - startSoloAtMs,
  applied,
  bundleAtStart,
  bundleAtEnd,
  bundleStable: bundleAtStart !== null && bundleAtStart === bundleAtEnd,
  arenaTransitionAtSelect: arenaTransition,
  exactScenePassPrecompile: precompile,
  stages,
  finalSample,
  series,
  errors,
};
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify(result, null, 2));

const maxLatency = finalSample?.presentation?.progress?.maximumCompletionLatencyMs ?? null;
console.error([
  `[max-admission] preset=${PRESET} arena=${ARENA} headless=${HEADLESS} outcome=${outcome}`,
  `total=${(totalMs / 1000).toFixed(2)}s select=${selectArenaMs === null ? 'n/a' : (selectArenaMs / 1000).toFixed(2) + 's'}`,
  `deploy=${startSoloAtMs === null ? 'n/a' : ((totalMs - startSoloAtMs) / 1000).toFixed(2) + 's'}`,
  `maxCompletionLatencyMs=${maxLatency}`,
  `scenePassPrecompile=${precompile ? `${precompile.durationMs} ms x${precompile.runs}` : 'n/a'}`,
  `bundleStable=${bundleAtStart === bundleAtEnd}`,
  `status="${finalSample?.status ?? ''}"`,
].join(' '));
if (errors.length > 0) console.error(`[max-admission] page errors: ${errors.slice(0, 6).join(' | ')}`);
process.exit(outcome === 'admitted' ? 0 : 1);
