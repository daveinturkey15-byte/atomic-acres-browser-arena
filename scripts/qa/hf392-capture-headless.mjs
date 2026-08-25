#!/usr/bin/env node
// HF-392 lane scratch tool (headless variant of hf392-capture.mjs): boots
// high-seas on real WebGPU in INSTALLED Chrome (channel:'chrome', headless:true
// gets a hardware WebGPU device on this machine and needs no browser slot)
// over CDP, and captures deterministic capture-camera frames of the upper
// deckhouse windows from inside and outside.
// NOT part of the repo QA suite; used by the HF-392 gauntlet lane only.
// Usage: node scripts/qa/hf392-capture-headless.mjs [baseURL] [outDir] [tag]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41933';
const OUT = process.argv[3] ?? 'artifacts/hf392-headless';
const TAG = process.argv[4] ?? 'before';
mkdirSync(OUT, { recursive: true });
function pose([x, y, z], [tx, ty, tz]) {
  const dx = tx - x, dy = ty - y, dz = tz - z;
  const horiz = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dx / horiz, -dz / horiz);
  const pitch = Math.asin(dy / Math.hypot(dx, dy, dz));
  return [x, y, z, yaw, pitch];
}

// Stern cabin: centerZ=21, cabin z 13..29, half width 7.4.
// Bow cabin mirrors it around z -> centerZ=-21.
const VIEWS = {
  outsidePortStern: [[-18, 6.6, 21], [-7.4, 7.5, 21]],
  insidePortStern: [[-2.5, 7.4, 23], [-12, 7.2, 21]],
  insideStarboardBow: [[2.5, 7.4, -23], [12, 7.2, -21]],
  outsideStarboardBow: [[18, 8.0, -21], [7.4, 7.5, -21]],
  overviewAft: [[16, 14, 46], [0, 6, 10]],
  endOnBowInnerWindow: [[0, 7.5, -2], [0, 7.4, -13]],
  endOnSternInnerWindow: [[0, 7.5, 2], [0, 7.4, 13]],
  rooflineCloseStern: [[-10, 10.5, 33], [0, 8.6, 22]],
  insideBowLookingAft: [[0, 7.4, -20], [0, 7.2, -28]],
  outsideQuarterStern: [[-20, 9.5, 36], [-4, 7.6, 22]],
};

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

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf392&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf392:${TAG}] backend=${backend}`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
console.error(`[hf392:${TAG}] arena active`);

for (const [name, [from, to]] of Object.entries(VIEWS)) {
  const args = pose(from, to);
  await page.evaluate((a) => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(a[0], a[1], a[2], a[3], a[4], 75, 43_200_000);
  }, args);
  const back = page.locator('button', { hasText: 'RETURN TO MATCH' });
  if (await back.count() > 0 && await back.first().isVisible().catch(() => false)) {
    await back.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
  const start = Date.now();
  await page.waitForFunction((s) => {
    const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snap.frameCount > s + 10;
  }, await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount), { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
  console.error(`[hf392:${TAG}] captured ${name} in ${Date.now() - start} ms`);
}

await browser.close();
console.error(`[hf392:${TAG}] done`);
