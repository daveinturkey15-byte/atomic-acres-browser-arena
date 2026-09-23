#!/usr/bin/env node
// HF-396 verification: farcrysis grass field visible on REAL WebGPU.
//
// Copy of scripts/qa/verify-arena-boot-cdp.mjs discipline (installed Chrome,
// CDP focus emulation, anti-throttle flags) with two changes:
//   - headless:true — measured 2026-08-25 to still get a real hardware WebGPU
//     device in installed Chrome, and it does not consume a governor browser slot.
//   - Captures PNG frames after match start so the grass is judged by its
//     PIXELS, not by a boot boolean. Also probes adapter vendor (Microsoft =
//     software rasteriser = meaningless evidence) and reads the live scene's
//     grass chunk stats through the debug API when available.
//
// Usage: node scripts/qa/hf396-grass-capture-cdp.mjs [--url http://127.0.0.1:41910]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const OUT_DIR = resolve('artifacts/qa/hf396');
mkdirSync(OUT_DIR, { recursive: true });

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
const bootT = Date.now();
const stamp = () => `t+${((Date.now() - bootT) / 1000).toFixed(1)}s`;
page.on('pageerror', (error) => errors.push(`${stamp()} ${String(error).slice(0, 200)}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`${stamp()} ${message.text().slice(0, 200)}`); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf396&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

// Adapter vendor probe: Microsoft Basic Render = software rasteriser; any
// timing or visual taken on it is not RTX 5080 evidence.
let adapterVendor = null;
try {
  adapterVendor = await page.evaluate(async () => {
    if (!navigator.gpu) return 'no-navigator-gpu';
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return 'no-adapter';
    const info = adapter.info ?? {};
    return `${info.vendor ?? '?'}/${info.architecture ?? '?'}`;
  });
} catch { adapterVendor = 'probe-error'; }

console.error(`[hf396] backend=${backend} adapter=${adapterVendor}`);

// Boot farcrysis solo.
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 }).catch(async () => {
  const diag = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      bootstrapStage: snapshot.bootstrap?.stage ?? null,
      matchPhase: snapshot.matchPhase ?? null,
      gameStarted: snapshot.gameStarted ?? null,
      arenaId: document.documentElement.dataset.arenaId ?? null,
      status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 200),
    };
  }).catch(() => null);
  throw new Error(`match never active: ${JSON.stringify(diag)}`);
});
console.error(`[hf396] match-active at t+${((Date.now() - bootT) / 1000).toFixed(1)}s`);
// Let the arena settle, then capture frames over time (wind sway should make
// consecutive frames differ in the canopy/grass region).
await page.waitForTimeout(4000);

const shots = [];
for (let i = 0; i < 5; i += 1) {
  const path = resolve(OUT_DIR, `farcrysis-frame-${i}.png`);
  await page.screenshot({ path });
  shots.push(path);
  await page.waitForTimeout(1200);
}

// Live-scene evidence: walk the scene for grass chunk meshes via the debug API
// if it exposes the THREE scene; tolerate absence.
const sceneStats = await page.evaluate(() => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const rootScene = debug?.scene ?? debug?.getScene?.() ?? null;
  if (!rootScene) return { available: false };
  let chunks = 0;
  let blades = 0;
  let visibleChunks = 0;
  rootScene.traverse((node) => {
    if (node.name?.startsWith('farcrysis-grass-chunk')) {
      chunks += 1;
      blades += node.count ?? 0;
      if (node.visible) visibleChunks += 1;
    }
  });
  return { available: true, chunks, blades, visibleChunks };
}).catch((e) => ({ available: false, error: String(e).slice(0, 160) }));

writeFileSync(
  resolve(OUT_DIR, 'hf396-capture.json'),
  `${JSON.stringify({ backend, adapterVendor, errors: [...new Set(errors)].slice(0, 6), shots, sceneStats }, null, 2)}\n`,
);
console.log(JSON.stringify({ backend, adapterVendor, errorCount: errors.length, shots: shots.length, sceneStats }, null, 2));
await browser.close();
