#!/usr/bin/env node
// HF-392 lane scratch tool: boots high-seas on real WebGPU in installed Chrome
// over CDP and captures deterministic capture-camera frames of the upper
// deckhouse windows from inside and outside, so the glazing defects can be
// diagnosed and the fix verified visually.
// NOT part of the repo QA suite; used by the HF-392 gauntlet lane only.
// Usage: node scripts/qa/hf392-capture.mjs [baseURL] [outDir] [tag]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41912';
const OUT = process.argv[3] ?? 'artifacts/hf392';
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
  // Outside port side of stern deckhouse, eye-level on main deck looking at the window band.
  outsidePortStern: [[-18, 6.6, 21], [-7.4, 7.5, 21]],
  // Inside the stern upper room looking out through the port glazing.
  insidePortStern: [[-2.5, 7.4, 23], [-12, 7.2, 21]],
  // Inside the bow upper room looking out through the starboard glazing.
  insideStarboardBow: [[2.5, 7.4, -23], [12, 7.2, -21]],
  // Outside starboard bow deckhouse from above deck level.
  outsideStarboardBow: [[18, 8.0, -21], [7.4, 7.5, -21]],
  // Aft overview showing both deckhouses from outside.
  overviewAft: [[16, 14, 46], [0, 6, 10]],
  // End-on: inner end-wall window aperture of the bow cabin seen from the centre deck.
  endOnBowInnerWindow: [[0, 7.5, -2], [0, 7.4, -13]],
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
  // The pause surface reasserts between captures (held-gameplay lifecycle).
  // Dismiss it so the frame shows the arena, not the menu blur.
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
