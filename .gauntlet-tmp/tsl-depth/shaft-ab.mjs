#!/usr/bin/env node
// A/B on ONE arena, ONE browser, ONE viewport: Sun shafts OFF vs the requested tier.
// Both legs reload (the shafts tier stages a screen-space topology change), so each
// leg is a cold session at the same spawn. Screenshots only; luminance is measured
// separately with PIL so nothing here can quietly invent a number.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const BASE = arg('--url', 'http://127.0.0.1:41918');
const ARENA = arg('--arena', 'gun-range');
const PRESET = arg('--preset', 'max');
const TAG = arg('--tag', 'before');
const SHOTDIR = arg('--shots', '.gauntlet-tmp/tsl-depth/ab');
const LEGS = arg('--legs', 'off,high').split(',');

const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

await page.addInitScript(() => {
  const store = [];
  Object.defineProperty(window, '__TSL_BUILD_ERRORS__', { get: () => store });
  const native = console.error.bind(console);
  console.error = (...a) => {
    try {
      const t = a.map((x) => (x instanceof Error ? x.message : String(x))).join(' ');
      if (/TSL|depthTexture/.test(t)) store.push(t.slice(0, 200));
    } catch { /* */ }
    native(...a);
  };
});

const waitDebug = () => page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const url = `${BASE}/?release=latest&renderer=webgpu&seed=shaftab&previewTime=0`;
mkdirSync(resolve(SHOTDIR), { recursive: true });

const results = [];
for (const leg of LEGS) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitDebug();
  // preset first, then the shafts tier; both flush on leaving OPTIONS.
  await page.evaluate(({ preset, shafts }) => {
    document.querySelector('#menu-tab-options')?.click();
    const p = document.querySelector('#graphics-profile');
    if (p) { p.value = preset; p.dispatchEvent(new Event('change', { bubbles: true })); }
    const s = document.querySelector('#graphics-volumetric-light-shafts');
    if (!s) throw new Error('#graphics-volumetric-light-shafts not found');
    s.value = shafts;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  }, { preset: PRESET, shafts: leg });
  const nav = page.waitForNavigation({ timeout: 60_000 }).catch(() => null);
  await page.evaluate(() => { document.querySelector('#menu-tab-deploy')?.click(); });
  await nav;
  await waitDebug();

  const applied = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot().settings;
    let adapter = null;
    try { const r = window.__ATOMIC_ACRES_DEBUG__.sampleGrenadeColdPathTelemetry().render; adapter = { software: r.softwareAdapter, backend: r.actualBackend }; } catch { /* */ }
    return {
      preset: s.displayedGraphicsPreset,
      shaftTier: s.graphics?.screenSpace?.godrays?.quality ?? null,
      shaftEnabled: s.graphics?.screenSpace?.godrays?.enabled ?? null,
      shaftReason: s.graphics?.screenSpace?.godrays?.unavailableReason ?? null,
      staged: s.liveApplication?.stagedReconstruction ?? null,
      backend: document.documentElement.dataset.renderBackend ?? null,
      adapter,
    };
  });
  // Both legs read back as preset "custom" — that is what changing one setting does.
  // What must be proven is the SHAFT TIER actually applied, on a real hardware device.
  if (applied.shaftTier !== leg || applied.backend !== 'webgpu' || applied.adapter?.software !== false) {
    console.error(`[ab] REFUSING leg=${leg}: ${JSON.stringify(applied)}`); await browser.close(); process.exit(2);
  }

  await page.evaluate(() => { window.__TSL_BUILD_ERRORS__.length = 0; });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 240_000 });
  await page.waitForTimeout(2000);
  const shot = resolve(SHOTDIR, `${TAG}-${ARENA}-${PRESET}-shafts-${leg}.png`);
  await page.screenshot({ path: shot });
  const tslErrors = await page.evaluate(() => [...window.__TSL_BUILD_ERRORS__]);
  const pos = await page.evaluate(() => {
    const g = window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate();
    return { v: g.playerVelocity };
  });
  results.push({ leg, applied, tslErrors: tslErrors.length, shot, pos });
  console.error(`[ab] shafts=${leg.padEnd(4)} enabled=${applied.shaftEnabled} reason=${applied.shaftReason} tslErrors=${tslErrors.length} -> ${shot}`);
}

await browser.close();
writeFileSync(resolve(SHOTDIR, `${TAG}-${ARENA}-${PRESET}.json`), JSON.stringify(results, null, 2));
