#!/usr/bin/env node
// Below-deck evidence for the High Seas (Hijacked) service deck.
//
// The owner's report was "the inside of the boat underneath is all water".
// The unit tests now probe a grid for authored floor, but a probe grid is not
// something an owner can look at - this walks the PLAYER down there and takes
// frames from inside the corridor, at the engine room, and at both ends.
//
// Usage: node scripts/qa/capture-below-deck.mjs [--out artifacts/pass76/below-deck]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41876');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/pass76/below-deck'));

// Service-deck stations. The corridor runs bow-to-stern on z with the engine
// room bulging mid-ship; eye height 1.7 m above the corridor floor at y=0.
const STATIONS = [
  { id: 'bow-ramp-foot', pos: [0, 1.7, -18.5], yaw: Math.PI, note: 'looking down the corridor from the bow entry' },
  { id: 'corridor-forward', pos: [0, 1.7, -12], yaw: Math.PI, note: 'cramped one-man corridor' },
  { id: 'engine-room', pos: [0, 1.7, 0], yaw: Math.PI, note: 'mid-ship engine room bulge' },
  { id: 'engine-room-look-back', pos: [0, 1.7, 2], yaw: 0, note: 'engine room toward the bow' },
  { id: 'corridor-aft', pos: [0, 1.7, 12], yaw: 0, note: 'aft corridor run' },
  { id: 'stern-ramp-foot', pos: [0, 1.7, 18.5], yaw: 0, note: 'stern entry, looking forward' },
  { id: 'floor-check-down', pos: [0, 1.7, -6], yaw: Math.PI, pitch: -1.1, note: 'looking at the deck under our feet' },
];

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));

await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=quality&seed=below-deck&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
await page.waitForTimeout(2_500);

mkdirSync(OUT, { recursive: true });
const report = [];
for (const station of STATIONS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...station.pos, station.yaw, station.pitch ?? 0]);
  await page.waitForTimeout(900);

  // Where did the player actually END UP? If the floor is missing they will
  // have fallen, which is the exact failure this evidence exists to disprove.
  const landed = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { position: snapshot.player.position.map((value) => Number(value.toFixed(2))), alive: snapshot.player.alive };
  });
  const file = resolve(OUT, `below-deck-${station.id}.png`);
  await page.screenshot({ path: file });
  const fellThrough = landed.position[1] < 0.5;
  report.push({ ...station, landed, fellThrough, file });
  console.error(`[below-deck] ${station.id}: y=${landed.position[1]}${fellThrough ? '  *** FELL THROUGH ***' : ''}`);
}

await browser.close();
console.log(JSON.stringify({
  verdict: report.some((entry) => entry.fellThrough) ? 'FAIL' : 'PASS',
  pageErrors: [...new Set(errors)].slice(0, 5),
  stations: report,
}, null, 2));
