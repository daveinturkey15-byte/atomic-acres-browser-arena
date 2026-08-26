#!/usr/bin/env node
// Probes where teleportPlayer actually lands the player on high-seas.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41960';
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hijacked&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2000);

const targets = [
  ['spawn-stern', 9, 40],
  ['mid-deck', 0, 0],
  ['bow-end', -9, -38],
];
for (const [id, x, z] of targets) {
  for (const y of [3.3, 4.9, 6.0]) {
    await page.evaluate(([x, y, z]) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, 0, 0);
    }, [x, y, z]);
    await page.waitForTimeout(1200);
    const pose = await page.evaluate(() => {
      const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
      return { pos: p.position ?? p.pos ?? p, grounded: p.grounded };
    });
    console.log(id, 'y-in', y, '-> player', JSON.stringify(pose));
  }
}
await browser.close();
