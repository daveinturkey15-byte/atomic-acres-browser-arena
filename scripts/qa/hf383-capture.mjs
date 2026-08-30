#!/usr/bin/env node
// HF-383 lane scratch tool: boots atomic-acres on real WebGPU in installed
// Chrome over CDP and captures deterministic capture-camera frames from named
// map poses so bulky obstructing props can be identified visually.
// NOT part of the repo QA suite; used by the nuketown gauntlet lane only.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41912';
const OUT = process.argv[3] ?? 'artifacts/hf383';
mkdirSync(OUT, { recursive: true });

// Forward convention from legacy-main setCaptureCameraPose:
// dir = (-sin(yaw)*cosP, sinP, -cos(yaw)*cosP)
function pose([x, y, z], [tx, ty, tz]) {
  const dx = tx - x, dy = ty - y, dz = tz - z;
  const horiz = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx / horiz, -dz / horiz);
  const pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
  return [x, y, z, yaw, pitch];
}

const VIEWS = {
  overview: [[30, 20, 34], [0, 1, 0]],
  streetWestEye: [[-27, 1.65, 0], [27, 1.65, 0]],
  streetEastEye: [[27, 1.65, 0], [-27, 1.65, 0]],
  diagNWtoSE: [[-26, 1.65, -26], [26, 1.65, 26]],
  diagSEtoNW: [[26, 1.65, 26], [-26, 1.65, -26]],
  diagNEtoSW: [[26, 1.65, -26], [-26, 1.65, 26]],
  northYardToHouse: [[-22, 1.65, -22], [6, 1.65, -10]],
  southYardToHouse: [[22, 1.65, 22], [-6, 1.65, 10]],
  aquaFrontDoorAcrossRoad: [[4, 1.65, -7.5], [-4, 1.65, 16]],
  busEndEast: [[9, 1.65, 0], [-9, 1.65, 0]],
};

const browser = await chromium.launch({
  headless: false,
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

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf383] backend=${backend}`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
console.error('[hf383] arena active');

for (const [name, [from, to]] of Object.entries(VIEWS)) {
  const args = pose(from, to);
  await page.evaluate((a) => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(a[0], a[1], a[2], a[3], a[4], 75, 43_200_000);
  }, args);
  // The pause surface reasserts between captures (held-gameplay lifecycle).
  // Dismiss it so the frame shows the arena, not the menu blur.
  const back = page.locator('button', { hasText: 'RETURN TO MATCH' });
  if (await back.count() > 0 && await back.first().isVisible().catch(() => false)) {
    await back.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  // Let a few frames present through the deterministic review camera.
  const start = Date.now();
  await page.waitForFunction((s) => {
    const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snap.frameCount > s + 10;
  }, await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount), { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.error(`[hf383] captured ${name} in ${Date.now() - start} ms`);
}

await browser.close();
console.error('[hf383] done');
