#!/usr/bin/env node
// REPRO PROBE for "THREE.TSL: TypeError: Cannot read properties of null (reading 'depthTexture')".
//
// Runs against a PRODUCTION bundle on installed Chrome headless (real WebGPU).
// Captures every console.error the page emits, keeps the ones three.js logs
// from its swallowed node-build catch, and snapshots the sun light's shadow
// map allocation state at the moment of the arena transition.
//
// Usage:
//   node repro-tsl-depthtexture.mjs --url http://127.0.0.1:41918 --preset max --arenas gun-range
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41918');
const PRESET = arg('--preset', 'max');
const ARENAS = arg('--arenas', 'gun-range').split(',').map((s) => s.trim()).filter(Boolean);
const PER_ARENA_MS = Number(arg('--per-arena', '180000'));
const OUT = arg('--out', '');

const browser = await chromium.launch({
  headless: arg('--headless', '1') === '1',
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

// Record inside the page: three.js hands console.error an Error OBJECT whose
// stack is the captured TSL StackTrace. Playwright's console.text() flattens
// that to "JSHandle@error", so the useful part has to be read in-page.
await page.addInitScript(() => {
  const store = [];
  Object.defineProperty(window, '__TSL_BUILD_ERRORS__', { get: () => store });
  const native = console.error.bind(console);
  console.error = (...args) => {
    try {
      const text = args.map((a) => {
        if (a instanceof Error) return `${a.message}\n${a.stack ?? ''}`;
        return String(a);
      }).join(' ');
      if (/TSL|depthTexture/.test(text)) {
        store.push({
          at: Math.round(performance.now()),
          arenaId: document.documentElement.dataset.arenaId ?? null,
          stage: document.documentElement.dataset.bootstrapStage ?? null,
          text: text.slice(0, 4000),
        });
      }
    } catch { /* never let the probe break the page */ }
    native(...args);
  };
});

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));

const waitForDebug = () => page.waitForFunction(
  () => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 },
);

const url = `${BASE}/?release=latest&renderer=webgpu&seed=tsldepth&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await waitForDebug();

// --- owner's real route to the preset (OPTIONS -> preset -> DEPLOY -> reload)
await page.evaluate((preset) => {
  document.querySelector('#menu-tab-options')?.click();
  const select = document.querySelector('#graphics-profile');
  if (!(select instanceof HTMLSelectElement)) throw new Error('#graphics-profile not found');
  select.value = preset;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, PRESET);
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
  } catch { /* ignore */ }
  return {
    displayedGraphicsPreset: settings.displayedGraphicsPreset ?? null,
    requestedPreset: settings.requested?.graphics?.preset ?? null,
    stagedReconstruction: settings.liveApplication?.stagedReconstruction ?? null,
    backend: document.documentElement.dataset.renderBackend ?? null,
    shafts: settings.graphics?.screenSpace?.godrays ?? null,
    adapter,
  };
});
console.error(`[repro] preset=${PRESET} applied=${JSON.stringify(applied)}`);

const provenPreset = applied.displayedGraphicsPreset === PRESET
  && applied.backend === 'webgpu'
  && applied.adapter?.softwareAdapter === false
  && Array.isArray(applied.stagedReconstruction) && applied.stagedReconstruction.length === 0;
if (!provenPreset) {
  console.error('[repro] REFUSING to report: preset/backend not proven applied');
  await browser.close();
  process.exit(2);
}

const sunState = () => page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const lights = [];
  scene.traverse((o) => {
    if (o.isDirectionalLight || o.isPointLight) {
      lights.push({
        type: o.type,
        name: o.name || null,
        castShadow: o.castShadow === true,
        intensity: o.intensity,
        shadowMapAllocated: Boolean(o.shadow && o.shadow.map),
        shadowDepthTexture: Boolean(o.shadow && o.shadow.map && o.shadow.map.depthTexture),
        mapSize: o.shadow ? o.shadow.mapSize.x : null,
      });
    }
  });
  return lights;
});

const results = [];
for (const [index, arena] of ARENAS.entries()) {
  if (index > 0) await waitForDebug();
  await page.evaluate(() => { window.__TSL_BUILD_ERRORS__.length = 0; });
  const before = await sunState();
  const startedAt = Date.now();
  const record = { arena, preset: PRESET, ok: false, sunBefore: before };
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return s.matchPhase === 'active' && s.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    record.ok = true;
  } catch (error) {
    record.error = String(error).slice(0, 300);
  }
  record.ms = Date.now() - startedAt;
  record.sunAfter = await sunState();
  record.tslErrors = await page.evaluate(() => window.__TSL_BUILD_ERRORS__.slice(0, 8));
  record.shaftStage = await page.evaluate(() => {
    try {
      const t = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return t.render?.atomicSignal?.advancedGraphics?.screenSpace?.godrays ?? null;
    } catch { return null; }
  });
  results.push(record);
  console.error(`[repro] ${arena.padEnd(18)} ${record.ok ? 'ADMITTED' : 'FAILED'} ${record.ms} ms  tslErrors=${record.tslErrors.length}`);
  for (const e of record.tslErrors) {
    console.error(`   --- @${e.at}ms arena=${e.arenaId} ---`);
    console.error(e.text.split('\n').slice(0, 14).map((l) => `       ${l}`).join('\n'));
  }
  console.error(`   sun after: ${JSON.stringify(record.sunAfter)}`);
  console.error(`   shaft telemetry: ${JSON.stringify(record.shaftStage)}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}

await browser.close();
const payload = { url: BASE, preset: PRESET, applied, results, pageErrors: [...new Set(pageErrors)].slice(0, 10) };
if (OUT) { mkdirSync(dirname(resolve(OUT)), { recursive: true }); writeFileSync(resolve(OUT), JSON.stringify(payload, null, 2)); }
const withErrors = results.filter((r) => r.tslErrors.length > 0).map((r) => r.arena);
console.error(`[repro] arenas logging TSL build errors: ${withErrors.length ? withErrors.join(',') : 'none'}`);
process.exit(withErrors.length ? 1 : 0);
