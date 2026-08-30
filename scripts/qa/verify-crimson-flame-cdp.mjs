#!/usr/bin/env node
// Captures the map flamethrower and the crimson flamethrower firing in a live
// solo match on real WebGPU (installed Chrome, headless), over CDP.
//
// Owner request 2026-08-25: "ensure crimson flamethrower has same fire style as
// the original btw, just with the adjusted dmg?" This harness records frames
// plus flame-stream telemetry for BOTH weapons so the visual claim is settled
// by pixels and counters, not by unit tests.
//
// Route mirrors tests/e2e/pass66-timed-map-weapons.spec.ts: fires from the
// authored flamethrower pickup deck on rustworks-1v1, acquires pointer lock
// with a real click on #game, then holds the REAL trigger — tryFire refuses
// without pointer lock (legacy-main L17242) and fireOnce's release resets
// spin-up, so a spin-up weapon can never fire through repeated debug calls.
//
// Usage: node scripts/qa/verify-crimson-flame-cdp.mjs [--url http://127.0.0.1:41911]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = resolve('artifacts/qa/crimson-flame');
mkdirSync(OUT_DIR, { recursive: true });

const WEAPONS = ['flamethrower', 'crimson-flamethrower'];
const FRAME_INTERVAL_MS = 220;
const FRAME_COUNT = 4;

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

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=crimsonflame&previewTime=0`;

const flameTelemetry = () => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.timedMapWeapons?.flameStream ?? null;
});

const results = [];
for (const weapon of WEAPONS) {
  errors.length = 0;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  const record = { weapon, backend, frames: [], ok: false };
  try {
    await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      await api.selectArena('rustworks-1v1');
      api.startSolo();
    });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 120_000 });

    await page.evaluate(async (w) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      // Proven-open firing spot: the authored flamethrower pickup deck on
      // rustworks-1v1 (TIMED_MAP_WEAPON_DEFINITIONS.flamethrower.spawnPosition).
      // Slight downward pitch so the stream strikes the deck and ground fire
      // can ignite within the 18 m range.
      api.teleportPlayer(0.4, 8.64, 0.2, undefined, -0.25);
      if (w === 'flamethrower') {
        // The map flamethrower is a TIMED-MAP weapon: tryFire refuses without
        // held pickup authority (legacy-main L17324), so take the real pickup
        // exactly like tests/e2e/pass66-timed-map-weapons.spec.ts does.
        if (!api.interactDrop()) throw new Error('map flamethrower pickup refused');
      } else {
        api.equipWeapon(w);
        api.setAmmo(w, 999, 0);
      }
    }, weapon);

    await page.locator('#game').click({ position: { x: 640, y: 360 } });
    await page.waitForFunction(
      () => document.pointerLockElement === document.querySelector('#game'),
      undefined,
      { timeout: 10_000 },
    );

    record.before = await flameTelemetry();

    await page.mouse.down();
    try {
      // Prove the weapon is ACTUALLY firing before trusting any frame: the
      // shared stream's emission counter must advance while the trigger holds.
      await page.waitForFunction(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return (snapshot.timedMapWeapons?.flameStream?.emissions ?? 0) > 0;
      }, undefined, { polling: 'raf', timeout: 8_000 });
      for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
        await page.waitForTimeout(FRAME_INTERVAL_MS);
        const path = resolve(OUT_DIR, `${weapon}-${frame}.png`);
        await page.screenshot({ path });
        record.frames.push(path);
      }
    } finally {
      await page.mouse.up();
    }
    await page.waitForTimeout(400);

    record.after = await flameTelemetry();
    record.ok = record.frames.length === FRAME_COUNT;
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.fireBlock = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.fireBlock ?? null).catch(() => null);
  }
  record.errors = [...new Set(errors)].slice(0, 6);
  results.push(record);
  console.error(`[crimson-flame] ${weapon.padEnd(22)} ${record.ok ? 'OK' : 'FAIL'}${record.error ? ` — ${record.error}` : ''}`);
}

await browser.close();
writeFileSync(resolve(OUT_DIR, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((entry) => !entry.ok);
console.log(JSON.stringify({
  verdict: failed.length ? 'FAIL' : 'PASS',
  telemetry: results.map(({ weapon, before, after, ok }) => ({ weapon, ok, before, after })),
}, null, 2));
process.exit(failed.length ? 1 : 0);
