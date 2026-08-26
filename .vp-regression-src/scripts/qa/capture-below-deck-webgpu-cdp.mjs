#!/usr/bin/env node
// Pass 79 hijacked-lane layout verification: boots high-seas on REAL WebGPU in
// installed Chrome over CDP (copy of scripts/qa/verify-arena-boot-cdp.mjs
// plumbing) and captures frames from stations that answer exactly four layout
// questions against BO2 Hijacked:
//   1. long central below-deck corridor
//   2. symmetric bow and stern spawns
//   3. mid-ship engine-room bulge
//   4. stairwells from main deck to the sun deck (upper deck)
// Frames land in artifacts/pass79/below-deck-layout for human reading.
//
// Usage: node scripts/qa/capture-below-deck-webgpu-cdp.mjs [--url http://127.0.0.1:41910]
import { chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41910');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/pass79/below-deck-layout'));

// [id, x, eyeY, z, yaw, pitch, note]. Yaw PI looks toward -z, 0 toward +z.
const STATIONS = [
  { id: 'bow-engine-ramp-foot', pos: [0, 1.7, -18.5], yaw: Math.PI, pitch: 0, note: 'corridor claim: full length visible aft from bow vestibule' },
  { id: 'corridor-mid-bow', pos: [0, 1.7, -12], yaw: Math.PI, pitch: 0, note: 'cramped one-man corridor half-width 0.72 m' },
  { id: 'engine-room-centre', pos: [0, 1.7, 0], yaw: Math.PI / 2, pitch: 0, note: 'bulge claim: room half-width 2.35 m vs corridor 0.72 m' },
  { id: 'stern-corridor', pos: [0, 1.7, 12], yaw: 0, pitch: 0, note: 'aft corridor run symmetry check vs bow side' },
  { id: 'stern-engine-ramp-foot', pos: [0, 1.7, 18.5], yaw: 0, pitch: 0, note: 'stern entry mirror of bow station 1' },
  { id: 'bow-spawn', pos: [-9, 4.9, -40], yaw: Math.PI * 0.75, pitch: -0.15, note: 'spawn symmetry: bow pair anchor' },
  { id: 'stern-spawn', pos: [9, 4.9, 40], yaw: -Math.PI * 0.25, pitch: -0.15, note: 'spawn symmetry: exact [-x,-z] mirror of bow station' },
  { id: 'bow-internal-stair-foot', pos: [4.6, 5.1, -17.6], yaw: 0, pitch: 0.45, note: 'sun-deck claim: internal stairwell rising to upper deck, viewed up-slope' },
  { id: 'bow-external-stair-foot', pos: [-4.6, 5.1, -31.6], yaw: Math.PI, pitch: 0.45, note: 'sun-deck claim: external stair to sun deck, viewed up-slope' },
  { id: 'upper-sun-deck-bow', pos: [0, 7.9, -21], yaw: Math.PI, pitch: -0.05, note: 'arrived on the sun deck through the stairwell' },
];

const browser = await chromium.launch({
  headless: false,
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

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=below-deck-layout&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[below-deck-cdp] backend=${backend}`);
if (backend !== 'webgpu') console.error('[below-deck-cdp] *** NOT WEBGPU — evidence invalid for owner surface ***');

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2_500);

mkdirSync(OUT, { recursive: true });
const report = [];
for (const station of STATIONS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...station.pos, station.yaw, station.pitch]);
  await page.waitForTimeout(900);
  const landed = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      alive: snapshot.player.alive,
      frameCount: snapshot.frameCount,
    };
  });
  await page.waitForTimeout(500);
  const laterFrameCount = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
  const rendering = laterFrameCount > landed.frameCount;
  const file = resolve(OUT, `${station.id}.png`);
  await page.screenshot({ path: file });
  report.push({
    ...station,
    landed,
    rendering,
    framesAtStation: [landed.frameCount, laterFrameCount],
    fellThrough: landed.position[1] < (station.pos[1] - 1.5),
    file,
  });
  console.error(`[below-deck-cdp] ${station.id}: landed=${JSON.stringify(landed.position)} frames ${landed.frameCount}->${laterFrameCount}${rendering ? '' : '  *** NOT RENDERING ***'}`);
}

await browser.close();
const verdict = report.every((entry) => entry.rendering && !entry.fellThrough && entry.landed.alive) ? 'PASS' : 'FAIL';
writeFileSync(resolve(OUT, 'report.json'), `${JSON.stringify({ verdict, backend, errors: [...new Set(errors)].slice(0, 8), report }, null, 2)}\n`);
console.log(JSON.stringify({ verdict, backend, stations: report.length, out: OUT }, null, 2));
