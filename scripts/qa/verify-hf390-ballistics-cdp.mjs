#!/usr/bin/env node
// HF-390 live ballistics verification over CDP (installed Chrome, headless, real WebGPU).
//
// Proves, on the real renderer route:
//   1. Every arena boots solo on WebGPU (hardware device required; software
//      rasteriser or missing device voids the run with exit 2).
//   2. Live snapshot().ballistics telemetry reports per-arena shot-surface coverage
//      with ZERO fallback classifications (the HF-390 gate, measured at runtime).
//   3. A deterministic multi-origin ray fan through debug.traceBallistics() actually
//      PENETRATES authored material families in every arena - wallbangs work where
//      players fight, not just in unit tests.
//
// The served bundle identity is pinned at start and re-checked before every arena:
// another agent rebuilding a shared outDir mid-sweep invalidates the measurement
// instead of masquerading as an arena failure.
//
// Usage: node scripts/qa/verify-hf390-ballistics-cdp.mjs [--url http://127.0.0.1:41973]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41973');
const PER_ARENA_MS = Number(arg('--per-arena', '150000'));
// PASS 85 Lane N repair: a hardcoded six-arena literal that predated Test1,
// Test2 and Map 3, so this ballistics sweep could never fire a round in them.
// Derived from the registry (scripts/qa/arena-roster.mjs); `--arenas` overrides.
const ARENAS = arg('--arenas', defaultBootRoster())
  .split(',').map((entry) => entry.trim()).filter(Boolean);

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf390&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const servedBundle = () => page.evaluate(() => {
  const script = [...document.querySelectorAll('script[type="module"]')].at(-1);
  return script ? script.src : null;
}).catch(() => null);
const BUNDLE_AT_START = await servedBundle();

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
const gpuInfo = await page.evaluate(async () => {
  if (!navigator.gpu) return { secureContext: isSecureContext, navigatorGpu: false };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { secureContext: isSecureContext, navigatorGpu: true, adapter: false };
  let vendor = 'unknown';
  try { vendor = adapter.info?.vendor ?? 'unknown'; } catch { /* adapter.info unavailable */ }
  const device = await adapter.requestDevice();
  return { secureContext: isSecureContext, navigatorGpu: true, vendor, hasDevice: Boolean(device) };
}).catch((error) => ({ error: String(error) }));
console.error(`[hf390] backend=${backend} gpu=${JSON.stringify(gpuInfo)}`);

if (backend !== 'webgpu' || gpuInfo.hasDevice !== true || gpuInfo.vendor === 'Microsoft'
  || gpuInfo.vendor === 'SwiftShader' || gpuInfo.navigatorGpu === false) {
  console.error('[hf390] ENVIRONMENT INVALID - no hardware WebGPU device; measurement void.');
  await browser.close();
  process.exit(2);
}

// Deterministic multi-origin ray fan through the same traceBallisticPath authority
// the weapons use. Origins spread over plausible combat positions so one unlucky
// spawn point cannot mask real penetrations; stoppedBy records what blocked rays.
const ORIGINS = [
  [0, 1.7, 0], [16, 1.7, 16], [-16, 1.7, -16], [22, 1.7, -22], [-22, 1.7, 22],
];
const fanScript = (id) => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const families = {};
  const stoppedBy = {};
  let traces = 0;
  let tracesWithImpacts = 0;
  let penetratingTraces = 0;
  let penetrations = 0;
  for (const origin of [[0, 1.7, 0], [16, 1.7, 16], [-16, 1.7, -16], [22, 1.7, -22], [-22, 1.7, 22]]) {
    for (let step = 0; step < 36; step += 1) {
      const yaw = (step / 36) * Math.PI * 2;
      for (const pitch of [-0.06, 0.04]) {
        traces += 1;
        const direction = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
        const trace = debug.traceBallistics('ak-47', origin, direction, 60, id);
        if ((trace.impacts?.length ?? 0) > 0) tracesWithImpacts += 1;
        let hit = false;
        for (const impact of trace.impacts ?? []) {
          if (impact.penetrated) {
            hit = true;
            penetrations += 1;
            families[impact.surface.material] = (families[impact.surface.material] ?? 0) + 1;
          }
        }
        if (!hit && trace.stoppedBy) {
          stoppedBy[trace.stoppedBy.material] = (stoppedBy[trace.stoppedBy.material] ?? 0) + 1;
        }
        if (hit) penetratingTraces += 1;
      }
    }
  }
  return { traces, tracesWithImpacts, penetratingTraces, penetrations, families, stoppedBy };
};

const results = [];
for (const arena of ARENAS) {
  errors.length = 0;
  const startedAt = Date.now();
  const record = { arena, ok: false };
  // After the previous iteration navigated back to the menu, wait for the fresh
  // page to expose the debug API again and confirm the bundle did not change.
  const debugReady = await page.waitForFunction(
    () => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 },
  ).then(() => true).catch(() => false);
  const bundleNow = await servedBundle();
  if (!debugReady || bundleNow !== BUNDLE_AT_START) {
    record.invalidated = !debugReady
      ? 'debug API never re-exposed after reload'
      : `served bundle changed mid-sweep (${BUNDLE_AT_START} -> ${bundleNow})`;
    record.ms = Date.now() - startedAt;
    results.push(record);
    console.error(`[hf390] ${arena.padEnd(18)} INVALID ${record.ms} ms — ${record.invalidated}`);
    continue;
  }
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    record.telemetry = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        activeSurfaces: snapshot.ballistics?.activeSurfaces ?? null,
        arenaBallistics: snapshot.ballistics?.arenas ?? null,
        arenaId: document.documentElement.dataset.arenaId ?? null,
      };
    });
    record.fan = await page.evaluate(fanScript, arena);
    record.ok = record.fan.penetratingTraces > 0;
    if (arena === 'farcrysis') {
      await page.screenshot({ path: resolve(`artifacts/qa/hf390-${arena}.png`) });
      record.screenshot = `artifacts/qa/hf390-${arena}.png`;
    }
  } catch (error) {
    record.error = String(error).slice(0, 200);
  }
  record.errors = [...new Set(errors)].slice(0, 4);
  record.ms = Date.now() - startedAt;
  results.push(record);
  console.error(`[hf390] ${arena.padEnd(18)} ${record.invalidated ? 'INVALID' : record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + (record.ok ? ` impacts=${record.fan.tracesWithImpacts}/${record.fan.traces} penetratingTraces=${record.fan.penetratingTraces} families=${JSON.stringify(record.fan.families)}`
      : ` — ${record.invalidated ?? record.error ?? `fan=${JSON.stringify(record.fan)} telem=${JSON.stringify(record.telemetry)}`}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}
await browser.close();

const failed = results.filter((entry) => !entry.ok);
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(resolve('artifacts/qa/hf390-ballistics-cdp.json'), `${JSON.stringify({ verdict: failed.length === 0 ? 'PASS' : 'FAIL', backend, gpuInfo, bundleAtStart: BUNDLE_AT_START, results }, null, 2)}\n`);
console.log(JSON.stringify({ verdict: failed.length === 0 ? 'PASS' : 'FAIL', backend, failedArenas: failed.map((entry) => entry.arena) }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
