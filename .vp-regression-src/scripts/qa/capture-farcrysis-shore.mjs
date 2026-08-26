#!/usr/bin/env node
// Captures deterministic farcrysis review frames on the REAL WebGPU route in
// INSTALLED Chrome (headless — gets the hardware device, no browser slot).
// Derived from scripts/qa/verify-arena-boot-cdp.mjs (focus emulation, anti-
// throttling flags, secure-context 127.0.0.1 navigation).
//
// Usage: node scripts/qa/capture-farcrysis-shore.mjs --url http://127.0.0.1:41910 --out artifacts/fc-shore/<label>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41910');
const OUT = arg('--out', 'artifacts/fc-shore/frame');

const browser = await chromium.launch({
  headless: true,
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

page.on('pageerror', (error) => console.error(`[pageerror] ${String(error).slice(0, 200)}`));

// navigator.gpu needs a SECURE CONTEXT — always land on 127.0.0.1, never about:blank.
const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=shorecap&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[shore-cap] backend=${backend}`);
if (backend !== 'webgpu') {
  console.error('[shore-cap] NOT WebGPU — capture invalid, aborting');
  await browser.close();
  process.exit(2);
}

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
console.error('[shore-cap] farcrysis committed');

const arenaId = await page.evaluate(() => ({
  dataset: document.documentElement.dataset.arenaId ?? null,
  snapshotArena: window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaId ?? null,
}));
console.error(`[shore-cap] arena identity: ${JSON.stringify(arenaId)}`);
if (arenaId.dataset !== 'farcrysis' && arenaId.snapshotArena !== 'farcrysis') {
  console.error('[shore-cap] WRONG ARENA COMMITTED — capture invalid');
  await browser.close();
  process.exit(3);
}

mkdirSync(resolve(OUT), { recursive: true });

// Deterministic review cameras. Yaw convention matches the aim code:
// yaw = atan2(-dx, -dz) to look from P toward T.
const lookYaw = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));

const SHOTS = [
  // Whole-island top-down: vegetation bands read as rings around the island.
  { name: 'topdown', pos: [0, 150, 0], yaw: 0, pitch: -Math.PI / 2 + 0.02 },
  // East face beach, eye level, looking north along the shore toward the NE corner.
  { name: 'east-beach', pos: [57, 3.2, 6], yaw: lookYaw([57, 0, 6], [40, 0, 45]), pitch: -0.06 },
  // NE corner beach, eye level, looking back along the shore — where circular
  // bands stranded props inland and square bands follow the corner.
  { name: 'corner', pos: [47, 3.2, 47], yaw: lookYaw([47, 0, 47], [10, 0, 57]), pitch: -0.04 },
];

for (const shot of SHOTS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...shot.pos, shot.yaw, shot.pitch]);
  // Let the renderer settle on the new pose (timer-throttle safe: focus emulated).
  await page.waitForTimeout(1600);
  const path = resolve(OUT, `${shot.name}.png`);
  await page.screenshot({ path });
  console.log(`[shore-cap] wrote ${path}`);
}

await browser.close();
console.log('[shore-cap] done');
