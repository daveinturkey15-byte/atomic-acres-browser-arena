#!/usr/bin/env node
// Probe: is walking free elsewhere on atomic-acres, or blocked map-wide?
// Teleports to a grid of spots and walks 5 s each, reporting extent + blocker.

import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41911';
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe-walkfree&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
console.error('backend:', await page.evaluate(() => document.documentElement.dataset.renderBackend));
await page.evaluate(async () => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
});
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 150_000 });
await sleep(6_000);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));

// find open cells near these probe spots first
const spots = [];
for (let x = -20; x <= 20; x += 10) {
  for (let z = -20; z <= 20; z += 10) {
    const open = await page.evaluate(([px, pz]) => !window.__ATOMIC_ACRES_DEBUG__.collisionProbe(px, pz), [x, z]);
    if (open) spots.push([x, z]);
  }
}
console.log(`open probe spots near origin: ${spots.length}`);

for (const [sx, sz] of spots.slice(0, 12)) {
  await page.evaluate(({ x, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, 1.7, z, Math.PI * 0.25, 0), { x: sx, z: sz });
  await sleep(400);
  const startY = (await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position[1]));
  await page.keyboard.down('KeyW');
  const deadline = Date.now() + 5_000;
  let last = null; let lastCheck = Date.now();
  let outcome = 'timeout';
  let lastPos = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  while (Date.now() < deadline) {
    await sleep(200);
    const p = (await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position));
    if (p[1] < -20) { outcome = 'fell'; break; }
    if (Date.now() - lastCheck >= 600) {
      if (Math.hypot(p[0] - lastPos[0], p[2] - lastPos[2]) < 0.08) { outcome = 'blocked'; break; }
      lastPos = p; lastCheck = Date.now();
    }
    last = p;
  }
  await page.keyboard.up('KeyW');
  const end = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
  // what surface stopped us?
  const blocker = await page.evaluate(([ex, ez, yaw]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    let best = null;
    for (let a = -3; a <= 3; a++) {
      const yw = yaw + a * 0.05;
      let trace;
      try { trace = api.traceBallistics('carbine', [ex, 1.0, ez], [Math.sin(yw), 0, Math.cos(yw)], 3); } catch { continue; }
      const impact = trace?.impacts?.[0];
      if (impact && (!best || impact.entryDistance < best.distanceM)) {
        best = { name: impact.surface.name, material: impact.surface.material, distanceM: Number(impact.entryDistance.toFixed(2)) };
      }
    }
    return best;
  }, [end[0], end[2], Math.PI * 0.25]);
  console.log(`spot(${sx},${sz}) startY=${Number(startY).toFixed(1)} outcome=${outcome} walked=${Math.hypot(end[0] - sx, end[2] - sz).toFixed(1)}m end=[${end.map((v) => Number(v.toFixed(1)))}] blocker=${blocker ? `${blocker.material}/${blocker.name}@${blocker.distanceM}m` : 'none'}`);
}

await browser.close();
