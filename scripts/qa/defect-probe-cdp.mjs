#!/usr/bin/env node
// Focused one-arena defect probes for the pass-79 playtest lane.
// Usage: node scripts/qa/defect-probe-cdp.mjs --arena rustworks-1v1 --probe fall
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const ARENA = arg('--arena', 'rustworks-1v1');
const PROBE = arg('--probe', 'fall');
const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = resolve('artifacts/qa/pass79-playtest/probes');
mkdirSync(OUT_DIR, { recursive: true });

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
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe79&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
console.error(`[probe] ${ARENA} active`);

const sleep = (ms) => page.waitForTimeout(ms);
const shot = async (name) => page.screenshot({ path: resolve(OUT_DIR, `${ARENA}-${PROBE}-${name}.png`) }).catch(() => null);
const state = () => page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const s = api.snapshot();
  return {
    pos: s.player.position.map((v) => Number(v.toFixed(2))),
    grounded: s.player.grounded, stance: s.player.stance, alive: s.player.alive, hp: s.player.hp,
    swim: s.swim ? { swimming: s.swim.swimming } : null,
    fallDamage: s.player.lastFallDamage ?? null,
    colliders: s.arenaSelection?.colliders ?? null,
    boundaryWalls: s.arenaSelection?.physicsBoundaryWalls ?? null,
    bounds: s.arenaSelection?.bounds ?? null,
  };
});

let result = {};
if (PROBE === 'fall') {
  // Teleport to a waypoint that fell through during the sweep; sample the fall.
  const target = arg('--x', '-27') + ',' + arg('--z', '-29');
  const [x, z] = target.split(',').map(Number);
  await page.evaluate(([tx, tz]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(tx, 1.6, tz, 0, 0);
  }, [x, z]);
  const samples = [];
  for (let i = 0; i < 10; i += 1) {
    await sleep(500);
    samples.push(await state());
  }
  await shot('falling');
  // Does the player ever die/respawn?
  await sleep(4000);
  const afterWait = await state();
  await shot('after-wait');
  result = { target: [x, z], samples, afterWait };
} else if (PROBE === 'stuck') {
  const [x, z] = [Number(arg('--x', '0')), Number(arg('--z', '16'))];
  await page.evaluate(([tx, tz]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(tx, 1.6, tz, 0, 0);
  }, [x, z]);
  await sleep(800);
  const before = await state();
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(true); });
  const mid = [];
  for (let i = 0; i < 4; i += 1) { await sleep(500); mid.push(await state()); }
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(false); });
  await shot('stuck-view');
  // Try each cardinal direction briefly.
  const dirs = {};
  for (const [name, yaw] of [['north', 0], ['west', Math.PI / 2], ['south', Math.PI], ['east', -Math.PI / 2]]) {
    await page.evaluate(([tx, tz, tyaw]) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(tx, 1.6, tz, tyaw, 0);
      window.__ATOMIC_ACRES_DEBUG__.setMovement(true);
    }, [x, z, yaw]);
    await sleep(900);
    const s = await state();
    dirs[name] = { moved: Number(Math.hypot(s.pos[0] - x, s.pos[2] - z).toFixed(2)), pos: s.pos, grounded: s.grounded, swim: s.swim };
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  }
  result = { target: [x, z], before, mid, dirs };
} else if (PROBE === 'prone') {
  // Prone engagement on a known-flat interior spot.
  const [x, z] = [Number(arg('--x', '0')), Number(arg('--z', '0'))];
  await page.evaluate(([tx, tz]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(tx, 1.6, tz, 0, 0);
  }, [x, z]);
  await sleep(1000);
  const before = await state();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  const samples = [];
  for (let i = 0; i < 6; i += 1) { await sleep(400); samples.push(await state()); }
  await shot('prone');
  // Walk forward prone into open space, then toward a wall.
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
  await sleep(1200);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  const afterWalk = await state();
  await shot('prone-walked');
  result = { target: [x, z], before, samples, afterWalk };
} else if (PROBE === 'spawnview') {
  const s = await state();
  await sleep(1500);
  await shot('spawn-view');
  // What is directly in front of the spawn camera?
  const trace = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const s2 = api.snapshot();
    const [px, py, pz] = s2.player.position;
    return api.traceBallistics(s2.player.weapon, [px, py, pz], [0, 0, -1], 40);
  });
  result = { state: s, trace };
}

result.errors = [...new Set(errors)].slice(0, 8);
writeFileSync(resolve(OUT_DIR, `${ARENA}-${PROBE}.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result).slice(0, 2400));
await browser.close();
