#!/usr/bin/env node
// HF-387 repro: prone / wall-adjacent clipping, driven on the REAL WebGPU route
// in installed Chrome over CDP (conventions from verify-arena-boot-cdp.mjs).
//
// For each named spot (owner-faithful Nuketown locations), with bots frozen:
//   A. Walk into the nearest wall standing (contact), drop prone, keep pushing.
//   B. Sprint-dive prone into the same wall.
//   C. Crawl sideways along the wall while prone.
//
// Key metric: signed distance past the wall face plane (positive = through).
// Evidence: sampled player positions + screenshots, read by a human.
//
// Usage:
//   node scripts/qa/verify-hf387-prone-clip-cdp.mjs --url http://127.0.0.1:41937 \
//     [--out artifacts/qa/hf387-prone-clip] [--arenas atomic-acres] \
//     [--spots "name:x,z,yaw;name2:x2,z2,yaw2"]

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41937');
const RENDERER = arg('--renderer', 'webgpu');
const OUT = arg('--out', 'artifacts/qa/hf387-prone-clip');
const ARENAS = arg('--arenas', 'atomic-acres').split(',').map((s) => s.trim()).filter(Boolean);

// Owner-faithful Nuketown clip spots (coordinates from src/arena-layout.ts):
//   house-front: aqua house street wall (house x=4 z=-17.4, front wall z=-9.2)
//   bus-van-gap: between bus east face (x=2.8) and east van west face (x=6.25)
//   garage-door: aqua garage door line (garage 17.7,-12.5, door flush z=-9.2)
//   yard-fence: waist-high fence run at (11, 20), prone under its rail line
const NUKETOWN_SPOTS = [
  { name: 'house-front', x: 4, z: -6.4, yaw: Math.PI },
  { name: 'bus-van-gap', x: 4.5, z: -3.75, yaw: Math.PI / 2 },
  { name: 'garage-door', x: 17.7, z: -6.2, yaw: Math.PI },
  { name: 'yard-fence', x: 11, z: 16.8, yaw: 0 },
];

const SPOTS = arg('--spots', '')
  .split(';').map((s) => s.trim()).filter(Boolean)
  .map((entry) => {
    const [name, x, z, yaw] = entry.split(',');
    return { name, x: Number(x), z: Number(z), yaw: Number(yaw) };
  });

mkdirSync(resolve(OUT), { recursive: true });

const browser = await chromium.launch({
  headless: true,
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

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=hf387&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf387] backend=${backend}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

for (const arena of ARENAS) {
  errors.length = 0;
  await page.evaluate(async (id) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 120_000 });
  console.error(`[hf387] ${arena} active`);

  // Freeze the bot so nothing kills or teleports the player mid-scenario
  // (a respawn reads exactly like a clip-through).
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
  await sleep(6_000); // wait out the engage countdown

  const sample = () => page.evaluate(() => {
    const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { position: p.position, stance: p.stance, alive: p.alive, deaths: p.deaths, hp: p.hp };
  });

  const record = { arena, backend, scenarios: {} };

  for (const spot of (SPOTS.length > 0 ? SPOTS : NUKETOWN_SPOTS)) {
    // Teleport to the spot, then discover the nearest wall with horizontal
    // ballistic rays at prone eye height. The FIRST impact's entryDistance is
    // the distance to the face.
    const wall = await page.evaluate(({ spot }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(spot.x, 1.7, spot.z, spot.yaw, 0);
      const base = [spot.x, 0.61, spot.z];
      for (let a = 0; a < 36; a++) {
        const yaw = spot.yaw + a * (Math.PI / 18); // full-circle sweep
        const dir = [-Math.sin(yaw), 0, -Math.cos(yaw)];
        let trace;
        try { trace = api.traceBallistics('carbine', base, dir, 10); } catch { continue; }
        const entry = trace?.impacts?.[0]?.entryDistance;
        if (Number.isFinite(entry) && entry >= 0.9 && entry <= 6) {
          return { yaw, distanceM: entry, from: base };
        }
      }
      return null;
    }, { spot });
    if (!wall) {
      record.scenarios[spot.name] = { ok: false, error: 'no wall within 0.9-6 m of spot' };
      continue;
    }
    console.error(`[hf387] ${arena}/${spot.name} wall yaw=${wall.yaw.toFixed(2)} dist=${wall.distanceM.toFixed(2)}`);

    // Signed distance past the wall face plane, metres. Positive = through.
    const sideBeyondWall = (pos) => {
      const dx = pos[0] - wall.from[0];
      const dz = pos[2] - wall.from[2];
      return -(dx * Math.sin(wall.yaw) + dz * Math.cos(wall.yaw)) - wall.distanceM;
    };

    const spotRecord = { wall: { yaw: wall.yaw, distanceM: wall.distanceM, from: wall.from } };

    // --- A: stand contact -> prone -> keep pushing ---------------------------
    await page.evaluate(({ wall }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(
        wall.from[0] + Math.sin(wall.yaw) * 2.0,
        1.7,
        wall.from[2] + Math.cos(wall.yaw) * 2.0,
        wall.yaw, 0);
    }, { wall });
    await sleep(400);

    await page.keyboard.down('KeyW');
    const standSamples = [];
    for (let i = 0; i < 25; i++) {
      await sleep(100);
      standSamples.push(await sample());
    }
    await page.keyboard.up('KeyW');
    const standContact = standSamples.at(-1).position;
    await page.screenshot({ path: resolve(OUT, `${arena}-${spot.name}-A-stand.png`) });

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    await sleep(300);
    await page.keyboard.down('KeyW');
    const proneSamples = [];
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      proneSamples.push(await sample());
    }
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: resolve(OUT, `${arena}-${spot.name}-A-prone.png`) });

    spotRecord.A = {
      standContact,
      proneStart: proneSamples[0].position,
      proneEnd: proneSamples.at(-1).position,
      worstBeyondWallFaceM: Number(Math.max(...proneSamples.map((s) => sideBeyondWall(s.position))).toFixed(3)),
      stances: [...new Set(proneSamples.map((s) => s.stance))],
      died: proneSamples.some((s) => s.deaths > 0 || !s.alive),
    };

    // --- B: sprint-dive prone at the wall ------------------------------------
    await page.evaluate(({ wall }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(
        wall.from[0] + Math.sin(wall.yaw) * 6,
        1.7,
        wall.from[2] + Math.cos(wall.yaw) * 6,
        wall.yaw, 0);
    }, { wall });
    await sleep(300);
    await page.keyboard.down('KeyW');
    await sleep(350); // build sprint speed
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    const diveSamples = [];
    for (let i = 0; i < 25; i++) {
      await sleep(80);
      diveSamples.push(await sample());
    }
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: resolve(OUT, `${arena}-${spot.name}-B-dive.png`) });
    spotRecord.B = {
      finalPosition: diveSamples.at(-1).position,
      worstBeyondWallFaceM: Number(Math.max(...diveSamples.map((s) => sideBeyondWall(s.position))).toFixed(3)),
      stances: [...new Set(diveSamples.map((s) => s.stance))],
      died: diveSamples.some((s) => s.deaths > 0 || !s.alive),
    };

    // --- C: crawl sideways along the wall while prone ------------------------
    await page.evaluate(({ wall }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(
        wall.from[0] + Math.sin(wall.yaw) * 1.2,
        1.7,
        wall.from[2] + Math.cos(wall.yaw) * 1.2,
        wall.yaw + Math.PI / 2, 0); // face along the wall
    }, { wall });
    await sleep(300);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    await sleep(200);
    await page.keyboard.down('KeyW');
    const crawlSamples = [];
    for (let i = 0; i < 30; i++) {
      await sleep(100);
      crawlSamples.push(await sample());
    }
    await page.keyboard.up('KeyW');
    await page.screenshot({ path: resolve(OUT, `${arena}-${spot.name}-C-crawl.png`) });
    spotRecord.C = {
      start: crawlSamples[0].position,
      end: crawlSamples.at(-1).position,
      worstBeyondWallFaceM: Number(Math.max(...crawlSamples.map((s) => sideBeyondWall(s.position))).toFixed(3)),
      died: crawlSamples.some((s) => s.deaths > 0 || !s.alive),
    };

    record.scenarios[spot.name] = spotRecord;
    console.error(`[hf387] ${arena}/${spot.name} A=${spotRecord.A.worstBeyondWallFaceM} `
      + `B=${spotRecord.B.worstBeyondWallFaceM} C=${spotRecord.C.worstBeyondWallFaceM} m beyond face`);
  }

  record.errors = [...new Set(errors)].slice(0, 5);
  results.push(record);

  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 }).catch(() => {});
}

writeFileSync(resolve(OUT, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
await browser.close();
