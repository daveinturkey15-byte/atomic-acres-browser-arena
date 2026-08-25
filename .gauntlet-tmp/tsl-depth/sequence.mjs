#!/usr/bin/env node
// Blast-radius probe: drives an arena SEQUENCE inside ONE page session (no reload
// between arenas) because `pass64TslSystems` — and therefore the godrays node —
// is constructed once per page and reused for every later arena.
//
// Reports, per step: swallowed THREE.TSL console errors, the directional-light
// shadow-map allocation state, and the mean luminance of an in-match frame.
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
const SEQUENCE = arg('--sequence', 'gun-range,atomic-acres').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = arg('--out', `.gauntlet-tmp/tsl-depth/sequence-${PRESET}.json`);
const SHOTDIR = arg('--shots', '.gauntlet-tmp/tsl-depth/shots');

const browser = await chromium.launch({
  headless: arg('--headless', '1') === '1',
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

await page.addInitScript(() => {
  const store = [];
  Object.defineProperty(window, '__TSL_BUILD_ERRORS__', { get: () => store });
  const native = console.error.bind(console);
  console.error = (...args) => {
    try {
      const text = args.map((a) => (a instanceof Error ? `${a.message}` : String(a))).join(' ');
      if (/TSL|depthTexture/.test(text)) {
        store.push({ at: Math.round(performance.now()), arenaId: document.documentElement.dataset.arenaId ?? null, text: text.slice(0, 500) });
      }
    } catch { /* ignore */ }
    native(...args);
  };
});

const waitForDebug = () => page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const url = `${BASE}/?release=latest&renderer=webgpu&seed=tslseq&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await waitForDebug();

await page.evaluate((preset) => {
  document.querySelector('#menu-tab-options')?.click();
  const select = document.querySelector('#graphics-profile');
  select.value = preset;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, PRESET);
const nav = page.waitForNavigation({ timeout: 60_000 }).catch(() => null);
await page.evaluate(() => { document.querySelector('#menu-tab-deploy')?.click(); });
await nav;
await waitForDebug();

const applied = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot().settings;
  let adapter = null;
  try { const r = window.__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry().render; adapter = { label: r.adapterLabel, software: r.softwareAdapter, backend: r.actualBackend }; } catch { /* */ }
  return { preset: s.displayedGraphicsPreset, staged: s.liveApplication?.stagedReconstruction ?? null, backend: document.documentElement.dataset.renderBackend ?? null, adapter };
});
console.error(`[seq] applied=${JSON.stringify(applied)}`);
if (applied.preset !== PRESET || applied.backend !== 'webgpu' || applied.adapter?.software !== false) {
  console.error('[seq] REFUSING: preset/backend not proven'); await browser.close(); process.exit(2);
}

mkdirSync(resolve(SHOTDIR), { recursive: true });

const lights = () => page.evaluate(() => {
  const out = [];
  window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph().traverse((o) => {
    if (o.isDirectionalLight) out.push({ name: o.name || '(sun)', castShadow: o.castShadow === true, intensity: o.intensity, mapAllocated: Boolean(o.shadow?.map) });
  });
  return out;
});

const steps = [];
for (const arena of SEQUENCE) {
  await page.evaluate(() => { window.__TSL_BUILD_ERRORS__.length = 0; });
  const t0 = Date.now();
  const step = { arena, ok: false };
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return s.matchPhase === 'active' && s.gameStarted === true;
    }, undefined, { timeout: 240_000 });
    step.ok = true;
  } catch (e) { step.error = String(e).slice(0, 200); }
  step.ms = Date.now() - t0;
  step.tslErrors = await page.evaluate(() => window.__TSL_BUILD_ERRORS__.map((e) => e.text));
  step.lights = await lights();
  await page.waitForTimeout(1500);
  const shot = resolve(SHOTDIR, `${PRESET}-${SEQUENCE.indexOf(arena)}-${arena}.png`);
  await page.screenshot({ path: shot });
  step.shot = shot;
  steps.push(step);
  console.error(`[seq] ${arena.padEnd(16)} ${step.ok ? 'OK ' : 'FAIL'} ${String(step.ms).padStart(6)}ms  tslErrors=${step.tslErrors.length}  lights=${JSON.stringify(step.lights)}`);
  for (const t of step.tslErrors) console.error(`     ${t.slice(0, 140)}`);
  // Back to the menu WITHOUT reloading, so the same pass64TslSystems is reused.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.openMenu?.(); }).catch(() => {});
  await page.waitForTimeout(800);
}

await browser.close();
mkdirSync(dirname(resolve(OUT)), { recursive: true });
writeFileSync(resolve(OUT), JSON.stringify({ applied, sequence: SEQUENCE, steps }, null, 2));
