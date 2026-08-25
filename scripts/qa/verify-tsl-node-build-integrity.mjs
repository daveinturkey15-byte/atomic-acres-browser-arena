#!/usr/bin/env node
// HF-401 — fails when three SWALLOWS a TSL node-build failure, and fails just
// as hard when the sun shafts quietly stop being built where they belong.
//
// WHY A DEDICATED HARNESS. Three r185 builds a render object's node graph
// inside a try/catch in `Nodes.getForRender()`. On a throw it does not rethrow:
// it rebuilds the object against a bare `NodeMaterial`, logs
// `THREE.TSL: <error>` and carries on. The arena admits, the match runs and
// `verify-arena-boot-cdp.mjs` reports OK — while the failed object renders a
// default material. Measured on gun-range: three swallowed
// "Cannot read properties of null (reading 'depthTexture')" per transition at
// MAX and two at HIGH, on a production bundle, and every boot gate was green.
//
// So booting is not the assertion. There are three, and all of them have to
// hold or the run fails:
//
//   1. `documentElement.dataset.tslNodeBuildErrors` is "0". That receipt is
//      published by `installTslNodeBuildDiagnostics` in
//      `src/rendering/render-runtime.ts`, which watches three's own console
//      routing, so it counts failures nobody printed a stack for.
//   2. No `THREE.TSL:` line reached the console either. Belt and braces: the
//      receipt could be broken, the console could be filtered, but not both.
//   3. THE ANTI-CHEAT. Deleting the shaft stage would satisfy 1 and 2 while
//      silently removing a feature, which is the exact state HF-401 was
//      reported in. So on every arena whose sun casts shadows, with a preset
//      that asks for shafts, the BUILT graph must report the shaft stage on
//      and a non-zero effective additive gain; and on an arena whose sun casts
//      none, the refusal must be NAMED rather than merely absent.
//
// Usage:
//   node scripts/qa/verify-tsl-node-build-integrity.mjs --url http://127.0.0.1:41918 \
//        [--arenas gun-range,atomic-acres,high-seas] [--presets high,max] [--out artifacts/qa/x.json]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41918');
const ARENAS = arg('--arenas', 'gun-range,atomic-acres,high-seas')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const PRESETS = arg('--presets', 'high,max').split(',').map((entry) => entry.trim()).filter(Boolean);
const PER_ARENA_MS = Number(arg('--per-arena', '240000'));
const OUT = arg('--out', 'artifacts/qa/tsl-node-build-integrity.json');
// Installed Chrome headless gets a REAL hardware WebGPU device on this machine
// (nvidia / blackwell, softwareAdapter false). Only Playwright's bundled
// chromium fails, and it fails at requestDevice() after returning an adapter.
const HEADLESS = arg('--headless', '1') === '1';

const browser = await chromium.launch({
  headless: HEADLESS,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    // Without these an occluded window is timer-throttled and every arena
    // reads exactly like a wedged one.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

// three hands console.error an Error OBJECT whose stack is the captured TSL
// StackTrace; Playwright's message.text() flattens that to "JSHandle@error", so
// the useful text has to be read in-page.
await page.addInitScript(() => {
  const store = [];
  Object.defineProperty(window, '__TSL_CONSOLE_ERRORS__', { get: () => store });
  const native = console.error.bind(console);
  console.error = (...args) => {
    try {
      const text = args.map((a) => (a instanceof Error ? `${a.message}` : String(a))).join(' ');
      if (text.includes('THREE.TSL:')) {
        store.push({
          at: Math.round(performance.now()),
          arenaId: document.documentElement.dataset.arenaId ?? null,
          text: text.slice(0, 400),
        });
      }
    } catch { /* a probe must never break the page it observes */ }
    native(...args);
  };
});

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));

// `page.evaluate` has NO default timeout in Playwright, and
// `__ATOMIC_ACRES_DEBUG__.selectArena` awaits a whole arena transition. On a
// busy machine that transition can fail to settle, and the harness then waits
// for it forever, producing no output at all — which reads exactly like a slow
// pass and is therefore worse than a failure. Every in-page await below is
// fenced so a wedged transition is REPORTED rather than waited on.
const withDeadline = (promise, ms, label) => {
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => { if (timer) clearTimeout(timer); });
};

const waitForDebug = () => page.waitForFunction(
  () => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 },
);
const url = `${BASE}/?release=latest&renderer=webgpu&seed=tslintegrity&previewTime=0`;

const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);

const results = [];
const failures = [];
let bundleAtStart = null;

for (const preset of PRESETS) {
  for (const arena of ARENAS) {
    // A fresh page per cell. The post graph is built once per page, so reusing
    // one would measure only the first arena's shaft topology.
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForDebug();
    if (bundleAtStart === null) bundleAtStart = await servedBundle();

    // The owner's real route: OPTIONS -> preset -> DEPLOY. A preset that stages
    // a topology change ends in a full reload, and only after that reload is
    // the requested preset the one actually running.
    await page.evaluate((value) => {
      document.querySelector('#menu-tab-options')?.click();
      const select = document.querySelector('#graphics-profile');
      if (!(select instanceof HTMLSelectElement)) throw new Error('#graphics-profile not found');
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, preset);
    const navigation = page.waitForNavigation({ timeout: 60_000 }).catch(() => null);
    await page.evaluate(() => { document.querySelector('#menu-tab-deploy')?.click(); });
    await navigation;
    await waitForDebug();

    const applied = await page.evaluate(() => {
      const settings = window.__ATOMIC_ACRES_DEBUG__.snapshot().settings;
      let adapter = null;
      try {
        const render = window.__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry().render;
        adapter = { label: render.adapterLabel, softwareAdapter: render.softwareAdapter, actualBackend: render.actualBackend };
      } catch { /* telemetry unavailable */ }
      return {
        displayedGraphicsPreset: settings.displayedGraphicsPreset ?? null,
        stagedReconstruction: settings.liveApplication?.stagedReconstruction ?? null,
        requestedShaftTier: settings.graphics?.screenSpace?.godrays?.quality ?? null,
        backend: document.documentElement.dataset.renderBackend ?? null,
        adapter,
      };
    });

    // A harness that cannot fail is not evidence: refuse to report anything
    // unless the preset and a real hardware device are proven first.
    const provenEnvironment = applied.displayedGraphicsPreset === preset
      && applied.backend === 'webgpu'
      && applied.adapter?.softwareAdapter === false
      && Array.isArray(applied.stagedReconstruction) && applied.stagedReconstruction.length === 0;
    if (!provenEnvironment) {
      failures.push(`${preset}/${arena}: environment not proven — ${JSON.stringify(applied)}`);
      results.push({ preset, arena, outcome: 'environment-not-proven', applied });
      console.error(`[tsl-integrity] ${preset}/${arena} ENVIRONMENT NOT PROVEN`);
      continue;
    }

    const record = { preset, arena, requestedShaftTier: applied.requestedShaftTier, admitted: false };
    try {
      await withDeadline(
        page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena),
        PER_ARENA_MS,
        'selectArena',
      );
      await withDeadline(
        page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); }),
        30_000,
        'startSolo',
      );
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
      }, undefined, { timeout: PER_ARENA_MS });
      record.admitted = true;
    } catch (error) {
      record.error = String(error).slice(0, 240);
    }
    // A few live frames, so the shaft gain reported below is one the composite
    // actually received rather than its construction-time default.
    await page.waitForTimeout(1200);

    const observed = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const advanced = snapshot.render?.atomicSignal?.advancedGraphics ?? null;
      const policy = snapshot.render?.playableScene?.actualArenaVisualPolicy ?? null;
      return {
        tslNodeBuildErrors: document.documentElement.dataset.tslNodeBuildErrors ?? null,
        consoleErrors: window.__TSL_CONSOLE_ERRORS__.slice(0, 6),
        sunCastShadow: policy?.shadows?.sunCastShadow ?? null,
        shadowsEnabled: policy?.shadows?.enabled ?? null,
        builtShafts: advanced?.screenSpace?.godrays ?? null,
        linearSourceStages: advanced?.linearSourceStages ?? null,
        bundle: performance.getEntriesByType('resource')
          .map((resource) => resource.name)
          .filter((name) => name.includes('/legacy-main-'))
          .map((name) => name.slice(name.lastIndexOf('/')))[0] ?? null,
      };
    });
    Object.assign(record, observed);

    const cell = `${preset}/${arena}`;
    if (observed.bundle && bundleAtStart && observed.bundle !== bundleAtStart) {
      failures.push(`${cell}: served bundle changed mid-run (${bundleAtStart} -> ${observed.bundle})`);
    }
    if (!record.admitted) failures.push(`${cell}: arena never admitted — ${record.error ?? 'unknown'}`);
    // 1 — the runtime receipt.
    if (observed.tslNodeBuildErrors !== '0') {
      failures.push(`${cell}: tslNodeBuildErrors=${observed.tslNodeBuildErrors} (expected "0")`);
    }
    // 2 — the console, independently.
    if (observed.consoleErrors.length > 0) {
      failures.push(`${cell}: ${observed.consoleErrors.length} THREE.TSL console error(s): ${observed.consoleErrors[0].text}`);
    }
    // 3 — the anti-cheat. Silence bought by deleting the feature is a failure.
    const wantsShafts = applied.requestedShaftTier !== null && applied.requestedShaftTier !== 'off';
    if (wantsShafts && (observed.sunCastShadow === null || observed.builtShafts === null)) {
      // A harness that cannot fail is not evidence. If the discriminator or the
      // built-graph receipt cannot be read, the anti-cheat clause below would
      // silently pass everything, so refuse instead of skipping.
      failures.push(
        `${cell}: cannot read the shaft discriminator`
        + ` (sunCastShadow=${observed.sunCastShadow}, builtShafts=${observed.builtShafts === null ? 'null' : 'present'})`,
      );
    }
    if (wantsShafts && observed.builtShafts) {
      if (observed.sunCastShadow === true) {
        if (observed.builtShafts.enabled !== true) {
          failures.push(`${cell}: shaft stage NOT built on a shadow-casting sun (reason=${observed.builtShafts.unavailableReason})`);
        }
        if (!(observed.builtShafts.effectiveAdditiveGain > 0)) {
          failures.push(`${cell}: shaft stage built but its effective gain is ${observed.builtShafts.effectiveAdditiveGain}`);
        }
        if (!(observed.linearSourceStages ?? []).includes('godrays-volumetric-shaft-add')) {
          failures.push(`${cell}: shaft stage missing from the installed linear stage order`);
        }
      } else if (observed.sunCastShadow === false) {
        // Absent is correct here. Absent AND UNEXPLAINED is the defect.
        if (observed.builtShafts.enabled !== false) {
          failures.push(`${cell}: shaft stage claims enabled on a sun that casts no shadows`);
        }
        if (!observed.builtShafts.unavailableReason) {
          failures.push(`${cell}: shaft stage absent with no stated reason — a silent missing feature`);
        }
        if ((observed.builtShafts.effectiveAdditiveGain ?? 0) !== 0) {
          failures.push(`${cell}: shafts still adding gain ${observed.builtShafts.effectiveAdditiveGain} with no shadow map to march`);
        }
      }
    }

    results.push(record);
    // Rewrite the receipt after EVERY cell. A long sweep that only writes at the
    // end loses everything it proved when the machine is busy enough that the
    // run has to be abandoned, and partial evidence is worth far more than none.
    mkdirSync(dirname(resolve(OUT)), { recursive: true });
    writeFileSync(resolve(OUT), JSON.stringify(
      { url: BASE, presets: PRESETS, arenas: ARENAS, bundleAtStart, complete: false, results, failures, pageErrors },
      null,
      2,
    ));
    console.error(
      `[tsl-integrity] ${cell.padEnd(28)} admitted=${record.admitted}`
      + ` tslErrors=${observed.tslNodeBuildErrors} console=${observed.consoleErrors.length}`
      + ` sunCastShadow=${observed.sunCastShadow}`
      + ` shafts=${observed.builtShafts ? `${observed.builtShafts.enabled}/gain ${observed.builtShafts.effectiveAdditiveGain}` : 'n/a'}`
      + (observed.builtShafts?.unavailableReason ? ` reason="${observed.builtShafts.unavailableReason}"` : ''),
    );
  }
}

await browser.close();

const payload = { url: BASE, presets: PRESETS, arenas: ARENAS, bundleAtStart, complete: true, results, failures, pageErrors };
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify(payload, null, 2));

if (failures.length > 0) {
  console.error(`\n[tsl-integrity] FAIL — ${failures.length} problem(s):`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.error(`\n[tsl-integrity] PASS — ${results.length} arena/preset cells, zero swallowed TSL node-build failures.`);
