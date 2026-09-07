#!/usr/bin/env node
// Probe round 2: eliminates my round-1 harness artifacts.
//   B2. farcrysis movement: four facings + playerVelocity, so "moved 0" cannot
//       be 'walked into a wall'.
//   C2. high-seas prone: settle at the REAL spawn Y (+0.5) before prone, so we
//       engage stance on the deck, not inside the hull.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = resolve(arg('--out', 'artifacts/qa/pass79-playtest-r2'));
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probes79b&previewTime=0`;

const bootArena = async (arena) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
};

const fullSnap = () => page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const s = api.snapshot();
  const gate = api.sampleSimulationGate();
  return {
    pos: s.player?.position?.map((v) => Number(v.toFixed(3))) ?? null,
    vel: gate.playerVelocity ? gate.playerVelocity.map((v) => Number(v.toFixed(3))) : null,
    grounded: s.player?.grounded ?? null,
    stance: s.player?.stance ?? null,
    alive: s.player?.alive ?? null,
  };
});

const shot = async (name) => {
  await page.screenshot({ path: resolve(OUT_DIR, name) }).catch(() => {});
  return name;
};

const results = {};

// --- B2. farcrysis movement, four facings ---------------------------------
await bootArena('farcrysis');
results.B2_facings = [];
for (const facingDeg of [0, 90, 180, 270]) {
  const yaw = (facingDeg * Math.PI) / 180;
  // Fresh spawn-tile start each time, exact spawn height.
  await page.evaluate(({ yaw }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    const s = api.snapshot();
    api.teleportPlayer(s.player.spawnPosition?.[0] ?? 0, (s.player.spawnPosition?.[1] ?? 1.8) + 0.4, s.player.spawnPosition?.[2] ?? 16, yaw, 0);
  }, { yaw });
  await sleep(1200);
  const before = await fullSnap();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
  const samples = [];
  for (let i = 0; i < 5; i += 1) { await sleep(400); samples.push(await fullSnap()); }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  const after = samples.at(-1);
  const moved = Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]);
  results.B2_facings.push({
    facingDeg, before: before.pos, after: after.pos, movedM: Number(moved.toFixed(3)),
    grounded: after.grounded, velEnd: after.vel, velMid: samples[2].vel,
  });
}
await shot('farcrysis-b2-end.png');

// --- C2. high-seas prone from real deck height -----------------------------
await bootArena('high-seas');
const spawnC = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position.map((v) => Math.round(v * 10) / 10));
await page.evaluate(([x, y, z]) => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.setStance('stand');
  api.teleportPlayer(x, y + 0.5, z, 0, 0);
}, spawnC);
await sleep(1500);
const settledC = await fullSnap();
await shot('highseas-c2-standing.png');
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
await sleep(1600);
const proneC = await fullSnap();
await shot('highseas-c2-prone.png');
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
await sleep(2000);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
const afterC = await fullSnap();
await shot('highseas-c2-prone-walk.png');
results.C2_highseas_prone = {
  spawn: spawnC, settled: settledC, proneEngaged: proneC.stance, pronePos: proneC.pos,
  afterWalkPos: afterC.pos, travelledProneM: Number(Math.hypot(
    afterC.pos[0] - proneC.pos[0], afterC.pos[2] - proneC.pos[2],
  ).toFixed(3)), aliveAfter: afterC.alive,
};

await browser.close();
writeFileSync(resolve(OUT_DIR, 'defect-probes-r2.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
