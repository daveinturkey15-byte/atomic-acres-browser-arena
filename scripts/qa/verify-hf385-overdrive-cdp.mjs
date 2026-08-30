#!/usr/bin/env node
// HF-385 verification: the 2x Damage Core is claimable and its icon visible on
// Nuke Town, measured on the REAL WebGPU route (installed Chrome, headless,
// real hardware device - no browser slot needed) over CDP.
//
// Copies the launch/focus/bundle-pinning discipline of verify-arena-boot-cdp.mjs.
//
// Usage: node scripts/qa/verify-hf385-overdrive-cdp.mjs [--url http://127.0.0.1:41910]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');

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

mkdirSync(resolve('artifacts/hf385'), { recursive: true });

try {
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf385&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  console.error(`[hf385] renderBackend=${backend}`);
  if (backend !== 'webgpu') throw new Error(`expected webgpu backend, got ${backend}`);
  const bundle = await page.evaluate(() => {
    const entry = performance.getEntriesByType('resource')
      .map((resource) => resource.name)
      .find((name) => name.includes('/legacy-main-'));
    return entry ? entry.slice(entry.lastIndexOf('/')) : null;
  });
  console.error(`[hf385] servedBundle=${bundle} (expected legacy-main-CeOOo71B.js)`);
  if (bundle !== '/legacy-main-CeOOo71B.js') throw new Error(`stale served bundle: ${bundle}`);

  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  console.error('[hf385] match active');

  // Stage a spawned core without waiting the 120 s spawn interval. 'available'
  // sets nextSpawnAt = now, so the very next advanceOverdrive flips it live.
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setOverdrive('available'); });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive.available === true
    && window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive.visible === true, undefined, { timeout: 30_000 });

  const staged = await page.evaluate(() => {
    const overdrive = window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive;
    return {
      position: overdrive.position, available: overdrive.available, visible: overdrive.visible,
      worldIconVisible: overdrive.worldIconVisible, holderId: overdrive.holderId,
      damageMultiplier: overdrive.damageMultiplier, playerId: window.__ATOMIC_ACRES_DEBUG__.snapshot().player.id,
    };
  });
  console.log(JSON.stringify({ staged }, null, 2));

  // Look at the core from down-street (yaw PI faces back toward it) so the
  // frame shows it standing in the open rather than sealed in a vehicle.
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(9.6, 1.7, 7.5, Math.PI, 0);
  });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(9.6, 1.7, 1.2, 0, 0); });
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive.holderId !== null, undefined, { timeout: 15_000 });
  const claimed = await page.evaluate(() => {
    const overdrive = window.__ATOMIC_ACRES_DEBUG__.snapshot().overdrive;
    return {
      holderId: overdrive.holderId, damageMultiplier: overdrive.damageMultiplier,
      remainingMs: overdrive.remainingMs, pickups: overdrive.pickups,
    };
  });
  console.log(JSON.stringify({ corePixelSample, claimed }, null, 2));
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve('artifacts/hf385/after-claim-hud.png') });

  const ok = staged.visible === true
    && staged.worldIconVisible === true
    && Math.abs(staged.position[0] - 9.6) < 1e-6
    && claimed.damageMultiplier === 2
    && claimed.pickups >= 1;
  writeFileSync(resolve('artifacts/hf385/hf385-overdrive-cdp.json'), `${JSON.stringify({ verdict: ok ? 'PASS' : 'FAIL', backend, staged, corePixelSample, claimed, errors: [...new Set(errors)].slice(0, 6) }, null, 2)}\n`);
  console.log(`[hf385] VERDICT ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
} finally {
  await browser.close();
}
