#!/usr/bin/env node
// Focused probe: WHY does real walking stop ~4-6 m from spawn on atomic-acres?
// 1. Name every surface hit by ballistic rays in all directions from spawn.
// 2. Fine angular walk sweep (10 deg steps) measuring real walked extent.
// 3. Try jump (Space) and crouch during forward walks.

import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41911';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe-walls&previewTime=0`, { waitUntil: 'domcontentloaded' });
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

const pose = () => page.evaluate(() => {
  const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
  return { position: p.position, stance: p.stance };
});

// 1. Surface census around spawn
const census = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const p = api.snapshot().player;
  const origin = [p.position[0], 1.2, p.position[2]];
  const hits = new Map();
  for (let h = 0; h < 36; h++) {
    const yaw = (h / 36) * Math.PI * 2;
    for (const pitch of [-0.3, 0, 0.25]) {
      const cosP = Math.cos(pitch);
      const dir = [Math.sin(yaw) * cosP, Math.sin(pitch), Math.cos(yaw) * cosP];
      let trace;
      try { trace = api.traceBallistics('carbine', origin, dir, 40); } catch { continue; }
      const impact = trace?.impacts?.[0];
      if (!impact) continue;
      const k = impact.surface.name;
      if (!hits.has(k)) hits.set(k, {
        name: k, material: impact.surface.material, distanceM: Number(impact.entryDistance.toFixed(1)),
        bearingDeg: Number((yaw * 180 / Math.PI).toFixed(0)),
        point: [origin[0] + dir[0] * impact.entryDistance, origin[1] + dir[1] * impact.entryDistance, origin[2] + dir[2] * impact.entryDistance].map((v) => Number(v.toFixed(1))),
      });
    }
  }
  return [...hits.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, 20);
});
console.log('SURFACE CENSUS FROM SPAWN:');
for (const s of census) console.log(` ${s.distanceM}m bearing${String(s.bearingDeg).padStart(4)} ${s.material} ${s.name} @`, s.point);

// 2. Fine angular walk sweep
console.log('\nWALK SWEEP (10 deg steps, 6 s each):');
const start = (await pose()).position;
let maxExtent = 0;
for (let h = 0; h < 36; h++) {
  const yaw = (h / 36) * Math.PI * 2;
  await page.evaluate(({ x, z, y, yaw }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, 0),
    { x: start[0], y: 1.7, z: start[2], yaw });
  await sleep(300);
  await page.keyboard.down('KeyW');
  const deadline = Date.now() + 6_000;
  let last = await pose();
  let lastCheck = Date.now();
  let outcome = 'timeout';
  while (Date.now() < deadline) {
    await sleep(200);
    const cur = await pose();
    if (cur.position[1] < -20) { outcome = 'fell'; break; }
    if (Date.now() - lastCheck >= 600) {
      if (Math.hypot(cur.position[0] - last.position[0], cur.position[2] - last.position[2]) < 0.08) { outcome = 'blocked'; break; }
      last = cur; lastCheck = Date.now();
    }
  }
  await page.keyboard.up('KeyW');
  const end = await pose();
  const extent = Math.hypot(end.position[0] - start[0], end.position[2] - start[2]);
  maxExtent = Math.max(maxExtent, extent);
  console.log(` yaw=${(yaw * 180 / Math.PI).toFixed(0)}deg outcome=${outcome} extent=${extent.toFixed(1)}m end=[${end.position.map((v) => Number(v.toFixed(1)))}]`);
}
console.log(`MAX EXTENT FROM SPAWN: ${maxExtent.toFixed(1)} m`);

// 3. Jump-assisted and crouch walks toward the two most promising bearings
for (const extra of [['jump', 'Space'], ['crouch', 'ControlLeft']]) {
  const [label, key] = extra;
  await page.evaluate(({ x, y, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, 0, 0), { x: start[0], y: 1.7, z: start[2] });
  await sleep(400);
  await page.keyboard.down(key);
  await page.keyboard.down('KeyW');
  await sleep(3_000);
  await page.keyboard.up(key);
  await page.keyboard.up('KeyW');
  const end = await pose();
  console.log(`${label}-walk extent=${Math.hypot(end.position[0] - start[0], end.position[2] - start[2]).toFixed(1)}m end=[${end.position.map((v) => Number(v.toFixed(1)))}]`);
}

await browser.close();
