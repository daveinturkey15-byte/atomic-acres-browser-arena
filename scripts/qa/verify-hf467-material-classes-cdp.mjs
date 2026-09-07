#!/usr/bin/env node
// HF-467 live material-class verification over CDP (installed Chrome, headless, real WebGPU).
//
// The owner's statement was about CLASSES of surface, not props:
//   "glass or blocks have no penetration; metal and glass should be shot
//    through, glass breaks; thin metal (the shed) should get a hole with no
//    collision after"
//
// `verify-hf390-ballistics-cdp.mjs` already proves, per arena, that no surface
// classifies as `fallback` and that SOME rays penetrate. It cannot answer the
// owner's question, because "some rays penetrated" is satisfied by a map whose
// glass works and whose sheet metal does not. This probe fires at the arena
// with two weapons and buckets every impact by MATERIAL, then holds each
// material to the contract its `BALLISTIC_MATERIAL_CLASS` entry promises:
//
//   shatter / perforate / penetrate  a sidearm crosses it
//   stop                             a sidearm is stopped by it
//   reinforced                       must not be present at all - it is the
//                                    classifier's defect sentinel, not cover
//
// It runs against the SHIPPED trace (`debug.traceBallistics`), which is the
// same `traceBallisticPath` authority local fire, bots and host verification
// use, so a pass here is a statement about the game and not about a fixture.
//
// Usage:
//   node scripts/qa/verify-hf467-material-classes-cdp.mjs [--url http://127.0.0.1:41973] [--arenas nuketown2]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41973');
const PER_ARENA_MS = Number(arg('--per-arena', '150000'));
const ARENAS = arg('--arenas', 'nuketown2').split(',').map((entry) => entry.trim()).filter(Boolean);

// The class map is DERIVED from src/ballistics.ts, not copied. This file is a
// plain .mjs operator tool that cannot import the TypeScript module, so it
// reads the source text the way scripts/qa/arena-roster.mjs reads the arena
// registry - and for the same reason recorded there: a roster frozen inside a
// verifier is this repository's most reliable way to ship a green gate that is
// not looking at the game. The parse is strict and the counts must agree, so a
// rename fails the probe instead of silently shrinking what it checks.
const BALLISTICS_SOURCE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../src/ballistics.ts'), 'utf8');

const sliceObject = (marker) => {
  const start = BALLISTICS_SOURCE.indexOf(marker);
  if (start < 0) throw new Error(`verify-hf467: '${marker}' not found in src/ballistics.ts`);
  const open = BALLISTICS_SOURCE.indexOf('({', start);
  const close = BALLISTICS_SOURCE.indexOf('});', open);
  if (open < 0 || close < 0) throw new Error(`verify-hf467: could not bound '${marker}'`);
  return BALLISTICS_SOURCE.slice(open, close);
};

const EXPECTED_CLASS = Object.fromEntries(
  [...sliceObject('export const BALLISTIC_MATERIAL_CLASS').matchAll(/^\s*'?([a-z-]+)'?:\s*'(shatter|perforate|penetrate|stop)'/gm)]
    .map(([, material, klass]) => [material, klass]),
);
const MATERIAL_IDS = [...sliceObject('export const BALLISTIC_MATERIALS').matchAll(/^\s*'?([a-z-]+)'?:\s*Object\.freeze/gm)]
  .map(([, material]) => material);

if (MATERIAL_IDS.length < 12) {
  throw new Error(`verify-hf467: only parsed ${MATERIAL_IDS.length} materials from src/ballistics.ts (floor 12)`);
}
for (const material of MATERIAL_IDS) {
  if (!EXPECTED_CLASS[material]) throw new Error(`verify-hf467: material '${material}' has no class in BALLISTIC_MATERIAL_CLASS`);
}
if (Object.keys(EXPECTED_CLASS).length !== MATERIAL_IDS.length) {
  throw new Error('verify-hf467: BALLISTIC_MATERIAL_CLASS and BALLISTIC_MATERIALS disagree on size');
}

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
    // Never open on the owner's main screen.
    '--window-position=2560,0',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf467&previewTime=0`;
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
console.error(`[hf467] backend=${backend} gpu=${JSON.stringify(gpuInfo)}`);

if (backend !== 'webgpu' || gpuInfo.hasDevice !== true || gpuInfo.vendor === 'Microsoft'
  || gpuInfo.vendor === 'SwiftShader' || gpuInfo.navigatorGpu === false) {
  console.error('[hf467] ENVIRONMENT INVALID - no hardware WebGPU device; measurement void.');
  await browser.close();
  process.exit(2);
}

/**
 * One dense ray fan per weapon, from combat-plausible eye positions, bucketing
 * every surface the trace MEETS into crossed / stopped by material.
 */
const fanScript = ({ id, weapon }) => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const crossed = {};
  const stopped = {};
  const met = {};
  let traces = 0;
  const origins = [
    [0, 1.7, 0], [0, 1.7, -14], [0, 1.7, 14], [10, 1.7, -18], [-10, 1.7, 18],
    [14, 1.7, 0], [-14, 1.7, 0], [0, 5.6, -16], [0, 5.6, 16],
  ];
  for (const origin of origins) {
    for (let step = 0; step < 72; step += 1) {
      const yaw = (step / 72) * Math.PI * 2;
      for (const pitch of [-0.28, -0.08, 0.03, 0.16]) {
        traces += 1;
        const direction = [Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch)];
        const trace = debug.traceBallistics(weapon, origin, direction, 70, id);
        for (const impact of trace.impacts ?? []) {
          const material = impact.surface.material;
          met[material] = (met[material] ?? 0) + 1;
          if (impact.penetrated) crossed[material] = (crossed[material] ?? 0) + 1;
        }
        if (trace.stoppedBy) {
          const material = trace.stoppedBy.material;
          stopped[material] = (stopped[material] ?? 0) + 1;
        }
      }
    }
  }
  return { traces, met, crossed, stopped };
};

const results = [];
for (const arena of ARENAS) {
  errors.length = 0;
  const startedAt = Date.now();
  const record = { arena, ok: false, violations: [] };
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
    console.error(`[hf467] ${arena.padEnd(14)} INVALID — ${record.invalidated}`);
    continue;
  }
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });

    record.telemetry = await page.evaluate((id) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      const entry = snapshot.ballistics?.arenas?.[id] ?? null;
      return {
        arenaId: document.documentElement.dataset.arenaId ?? null,
        activeSurfaces: snapshot.ballistics?.activeSurfaces ?? null,
        shotSurfaces: entry?.shotSurfaces ?? null,
        fallbackSurfaces: entry?.fallbackSurfaces ?? null,
      };
    }, arena);

    // The owner's sidearm case and the wallbang case, in one run.
    record.pistol = await page.evaluate(fanScript, { id: arena, weapon: 'pistol' });
    record.sniper = await page.evaluate(fanScript, { id: arena, weapon: 'sniper' });

    const fallbacks = record.telemetry.fallbackSurfaces ?? [];
    if (fallbacks.length > 0) {
      record.violations.push(`${fallbacks.length} fallback surface(s) at runtime: ${fallbacks.slice(0, 8).join(' | ')}`);
    }
    for (const material of Object.keys(record.pistol.met)) {
      const klass = EXPECTED_CLASS[material];
      if (!klass) {
        record.violations.push(`unknown material '${material}' met at runtime`);
        continue;
      }
      if (material === 'reinforced') {
        record.violations.push(`'reinforced' met at runtime - it is the classifier's defect sentinel, not cover`);
        continue;
      }
      const crossed = record.pistol.crossed[material] ?? 0;
      if (klass === 'stop') {
        if (crossed > 0) record.violations.push(`${material} is class 'stop' but a pistol crossed it ${crossed}x`);
      } else if (crossed === 0) {
        record.violations.push(`${material} is class '${klass}' but a pistol never crossed it (met ${record.pistol.met[material]}x)`);
      }
    }
    // The owner's two named families must actually be present in this arena,
    // otherwise the run proves nothing about them.
    for (const required of ['glass', 'thin-metal']) {
      if (!(required in record.pistol.met)) {
        record.violations.push(`no ${required} surface was met - the fan did not exercise the class the owner named`);
      }
    }
    record.ok = record.violations.length === 0;
  } catch (error) {
    record.error = String(error).slice(0, 200);
    record.violations.push(record.error);
  }
  record.errors = [...new Set(errors)].slice(0, 4);
  record.ms = Date.now() - startedAt;
  results.push(record);
  console.error(`[hf467] ${arena.padEnd(14)} ${record.ok ? 'OK' : 'FAIL'} ${record.ms} ms`
    + ` pistolCrossed=${JSON.stringify(record.pistol?.crossed ?? {})}`
    + ` pistolStopped=${JSON.stringify(record.pistol?.stopped ?? {})}`
    + (record.ok ? '' : ` — ${record.violations.join(' ; ')}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
}
await browser.close();

const failed = results.filter((entry) => !entry.ok);
mkdirSync(resolve('artifacts/qa'), { recursive: true });
writeFileSync(
  resolve('artifacts/qa/hf467-material-classes-cdp.json'),
  `${JSON.stringify({ verdict: failed.length === 0 ? 'PASS' : 'FAIL', backend, gpuInfo, bundleAtStart: BUNDLE_AT_START, results }, null, 2)}\n`,
);
console.log(JSON.stringify({
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  backend,
  failedArenas: failed.map((entry) => entry.arena),
}, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
