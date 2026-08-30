#!/usr/bin/env node
// Pass 79 playtest-and-debug lane: actually PLAY each arena in installed Chrome
// (headless, real WebGPU device) over CDP and capture evidence.
//
// For every arena: boot -> solo start -> walk legs in four facings ->
// prone-into-wall penetration probe -> shoot floor/wall surfaces ->
// weapon switch/pickup -> killstreak/support activation -> grenade/melee/reload,
// screenshotting throughout and recording telemetry JSON per step.
//
// Usage:
//   node scripts/qa/playtest-arena-cdp.mjs [--url http://127.0.0.1:41911]
//        [--arenas atomic-acres,...] [--outdir artifacts/playtest-pass79]
//
// Evidence rules honoured here: never fabricate - every recorded number comes
// from the live snapshot(); screenshots land on disk for human/model reading;
// console errors are captured per arena. This script reports defects, it does
// not weaken anything.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUTDIR = arg('--outdir', 'artifacts/playtest-pass79');
const ARENAS = arg('--arenas', 'atomic-acres,farcrysis,high-seas,skyline-terminal,rustworks-1v1,gun-range')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const BOOT_TIMEOUT_MS = Number(arg('--boot-timeout', '180000'));

mkdirSync(resolve(OUTDIR), { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

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

let consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 240)}`));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
});

const URL = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=playtest79&previewTime=0`;

const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);

// --- page-side helpers ------------------------------------------------

const snap = () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());

const gpuProbe = () => page.evaluate(async () => {
  if (!navigator.gpu) return { secureContext: window.isSecureContext, gpu: false };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { secureContext: window.isSecureContext, gpu: true, adapter: false };
  return {
    secureContext: window.isSecureContext,
    gpu: true,
    adapter: true,
    vendor: adapter.info?.vendor ?? null,
    architecture: adapter.info?.architecture ?? null,
  };
});

async function shot(label) {
  const path = resolve(OUTDIR, `${label}.png`);
  await page.screenshot({ path }).catch((error) => console.error(`[shot-fail] ${label}: ${error}`));
  return path;
}

// Walk forward under REAL input (KeyW via setMovement) sampling position.
async function walkLeg(durationMs, sprint = false) {
  const samples = [];
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true, false));
  if (sprint) await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true));
  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    await sleep(250);
    samples.push(await snapPlayerPos());
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false));
  return samples;
}

async function snapPlayerPos() {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      p: snapshot.player.position.map((v) => Number(v.toFixed(3))),
      stance: snapshot.player.stance,
      hp: snapshot.player.hp,
      alive: snapshot.player.alive,
      grounded: snapshot.player.grounded,
      weapon: snapshot.player.weapon,
    };
  });
}

// March collisionProbe outward from (x,z) in direction [dx,dz]; returns first
// blocked distance or null within maxDist.
const probeMarch = (x, z, dx, dz, step = 0.25, maxDist = 6) => page.evaluate(
  ({ x, z, dx, dz, step, maxDist }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    for (let dist = step; dist <= maxDist; dist += step) {
      if (debug.collisionProbe(x + dx * dist, z + dz * dist)) return Number(dist.toFixed(2));
    }
    return null;
  },
  { x, z, dx, dz, step, maxDist },
);

const segmentBlockedBetween = (x1, z1, x2, z2) => page.evaluate(
  ({ x1, z1, x2, z2 }) => window.__ATOMIC_ACRES_DEBUG__.segmentBlocked(x1, z1, x2, z2),
  { x1, z1, x2, z2 },
);

// Find the nearest blocking wall around (x,z): scan 8 compass directions.
async function nearestWall(x, z) {
  const dirs = [];
  for (let k = 0; k < 8; k += 1) {
    const angle = (Math.PI / 4) * k;
    dirs.push({ angle, dx: Math.sin(angle), dz: Math.cos(angle) * -1 });
  }
  let best = null;
  for (const dir of dirs) {
    const dist = await probeMarch(x, z, dir.dx, dir.dz);
    if (dist !== null && (!best || dist < best.dist)) best = { ...dir, dist };
  }
  return best;
}

// --- per-arena scenario ------------------------------------------------

async function playArena(arena) {
  consoleErrors = [];
  const record = { arena, steps: [], defects: [], errors: [] };
  const step = async (name, fn) => {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      record.steps.push({ name, ms: Date.now() - startedAt, ...(detail ?? {}) });
      console.error(`[play] ${arena} :: ${name} ok (${Date.now() - startedAt}ms)`);
    } catch (error) {
      record.steps.push({ name, ms: Date.now() - startedAt, error: String(error).slice(0, 300) });
      console.error(`[play] ${arena} :: ${name} ERROR ${String(error).slice(0, 200)}`);
    }
  };

  // Boot.
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  const bundleAtStart = await servedBundle();
  record.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  record.gpu = await gpuProbe();
  await step('select-start', async () => {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: BOOT_TIMEOUT_MS });
    const snapshot = await snap();
    return {
      matchPhase: snapshot.matchPhase,
      bounds: snapshot.arenaSelection.bounds,
      spawns: snapshot.arenaSelection.spawnCounts,
      colliders: snapshot.arenaSelection.colliders,
      botCount: snapshot.bots.length,
      transitionPhase: snapshot.arenaSelection.streaming.transition.phase,
    };
  });
  const initial = await snap();
  const [sx, , sz] = initial.player.position;
  await shot(`${arena}-00-spawn`);

  // 1. Walk legs in four facings under real input.
  const legs = [];
  for (const [legIndex, facingDeg] of [0, 90, 180, 270].entries()) {
    const yawRad = (facingDeg * Math.PI) / 180;
    await page.evaluate(({ x, y, z, yaw }) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y + 1.5, z, yaw);
    }, { x: sx, y: initial.player.position[1], z: sz, yaw: yawRad });
    await sleep(600); // settle onto ground
    const before = await snapPlayerPos();
    const samples = await walkLeg(2000, legIndex % 2 === 1);
    const after = await snapPlayerPos();
    const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
    const moved = flat(before.p, after.p);
    legs.push({ facingDeg, before: before.p, after: after.p, movedM: Number(moved.toFixed(2)), samples: samples.length });
    if (moved < 0.5) {
      const gate = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate());
      record.defects.push({
        id: `${arena}-movement-stuck-${facingDeg}`,
        what: `Walking facing ${facingDeg}deg moved player only ${moved.toFixed(2)}m in 2s`,
        evidence: { before: before.p, after: after.p, gate },
      });
    }
  }
  record.walkLegs = legs;
  await shot(`${arena}-01-after-walk`);


  // 1b. Waypoint tour: cover the playable area (quarters of the bounds),
  // probing collision state and capturing one frame per waypoint.
  await step('waypoint-tour', async () => {
    const bounds = (await snap()).arenaSelection.bounds;
    const y = initial.player.position[1] + 1.5;
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    const points = [
      ['w-min', bounds.minX * 0.8, bounds.minZ * 0.8],
      ['w-max', bounds.maxX * 0.8, bounds.maxZ * 0.8],
      ['w-cross-x', bounds.maxX * 0.8, bounds.minZ * 0.8],
      ['w-cross-z', bounds.minX * 0.8, bounds.maxZ * 0.8],
      ['w-centre', cx, cz],
    ];
    const visited = [];
    let index = 0;
    for (const [name, wx, wz] of points) {
      index += 1;
      await page.evaluate(({ x, yy, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, yy, z),
        { x: wx, yy: y, z: wz });
      await sleep(900);
      const state = await snapPlayerPos();
      const insideBlocked = await page.evaluate(
        ({ x, yy, z }) => window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(x, yy, z),
        { x: state.p[0], yy: state.p[1], z: state.p[2] },
      );
      const botsVisible = await page.evaluate(() => (
        window.__ATOMIC_ACRES_DEBUG__.snapshot().bots.filter((bot) => bot.alive && bot.rootEffectivelyVisible).length
      ));
      visited.push({ name, target: [Number(wx.toFixed(1)), Number(wz.toFixed(1))], landed: state.p, insideBlocked, botsVisible });
      if (insideBlocked) {
        record.defects.push({
          id: `${arena}-spawn-inside-collider-${name}`,
          what: `Waypoint ${name} (${wx.toFixed(1)}, ${wz.toFixed(1)}) settled INSIDE a collider`,
          evidence: visited.at(-1),
        });
      }
      await shot(`${arena}-0${index + 1}-tour-${name}`);
    }
    return { visited };
  });
  // 2. Prone against nearest wall (HF-387 clipping).
  await step('prone-wall', async () => {
    const here = await snapPlayerPos();
    const wall = await nearestWall(here.p[0], here.p[2]);
    if (!wall) return { note: 'no wall within 6m of spawn' };
    // Stand just outside the wall, facing it.
    const startX = here.p[0];
    const startZ = here.p[2];
    const faceX = startX + wall.dx * (wall.dist - 0.7);
    const faceZ = startZ + wall.dz * (wall.dist - 0.7);
    await page.evaluate(({ x, y, z, yaw }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw),
      { x: faceX, y: here.p[1], z: faceZ, yaw: wall.angle });
    await sleep(500);
    await shot(`${arena}-10-wall-standing`);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
    await sleep(900);
    const proneState = await snapPlayerPos();
    await shot(`${arena}-11-prone`);
    if (!proneState.stance || proneState.stance !== 'prone') {
      record.defects.push({
        id: `${arena}-prone-not-applied`,
        what: `setStance('prone') did not apply; stance=${proneState.stance}`,
        evidence: proneState,
      });
    }
    // Walk into the wall while prone.
    const before = await snapPlayerPos();
    const samples = await walkLeg(1500);
    const after = await snapPlayerPos();
    await shot(`${arena}-12-prone-into-wall`);
    const movedToward = Math.hypot(after.p[0] - before.p[0], after.p[2] - before.p[2]);
    // Did we end up INSIDE the collider?
    const insideBlocked = await page.evaluate(
      ({ x, y, z }) => window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(x, y, z),
      { x: after.p[0], y: after.p[1], z: after.p[2] },
    );
    const travelled = Math.hypot(after.p[0] - faceX, after.p[2] - faceZ);
    // Traversal proof: if the straight segment from the face point to where we
    // ended crosses a collider but we are NOT inside one, the body crossed a
    // blocking volume it should not have (HF-387). Walking around a wall end
    // can false-positive on long walks; 1.5 s prone walks keep that risk low.
    const throughSegment = await segmentBlockedBetween(faceX, faceZ, after.p[0], after.p[2]);
    const clippedThrough = throughSegment && !insideBlocked;
    return {
      wall: { dist: wall.dist, angleDeg: Number(((wall.angle * 180) / Math.PI).toFixed(1)) },
      proneStanceApplied: proneState.stance === 'prone',
      movedWhileProneIntoWallM: Number(movedToward.toFixed(2)),
      endPositionInsideCollider: insideBlocked,
      travelledFromWallFaceM: Number(travelled.toFixed(2)),
      segmentFaceToEndBlocked: throughSegment,
      clippedThroughWallProne: clippedThrough,
      endPos: after.p,
    };
  });
  // 2b. Same wall, STANDING (HF-387 says prone OR near walls).
  await step('stand-wall', async () => {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('stand'));
    await sleep(700);
    const before = await snapPlayerPos();
    const samples = await walkLeg(1500);
    const after = await snapPlayerPos();
    await shot(`${arena}-13-standing-into-wall`);
    const insideBlocked = await page.evaluate(
      ({ x, y, z }) => window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(x, y, z),
      { x: after.p[0], y: after.p[1], z: after.p[2] },
    );
    return {
      movedStandingM: Number(Math.hypot(after.p[0] - before.p[0], after.p[2] - before.p[2]).toFixed(2)),
      endPositionInsideCollider: insideBlocked,
      endPos: after.p,
    };
  });
  // 3. Shoot surface types (HF-386 world-hit feedback) + ballistics trace.
  // Move to open ground first: the smoke run showed every prone shot next to
  // a slope was refused with viewmodel-contact-raise, so shoot from standing.
  await step('shoot-floor', async () => {
    const here = await snapPlayerPos();
    await page.evaluate(({ x, y, z }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y + 1.5, z),
      { x: here.p[0], y: here.p[1], z: here.p[2] });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('stand'));
    await sleep(700);

    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setAds(false));
    // Look down at the floor and fire three times.
    const cur = await snap();
    const yawNow = cur.player.yaw;
    await page.evaluate(({ x, y, z, yaw }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, -1.1),
      { x: here.p[0], y: here.p[1], z: here.p[2], yaw: yawNow });
    await sleep(400);
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      await sleep(350);
    }
    const fireBlock = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fireBlock);
    await sleep(500);
    await shot(`${arena}-20-shoot-floor`);
    return { fireBlockTotal: fireBlock.total, lastReason: fireBlock.last?.reason ?? fireBlock.last ?? null };
  });
  await step('shoot-wall', async () => {
    const here = await snapPlayerPos();
    const wall = await nearestWall(here.p[0], here.p[2]);
    if (!wall) return { note: 'no wall to shoot' };
    await page.evaluate(({ x, y, z, yaw, pitch }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch),
      { x: here.p[0], y: here.p[1], z: here.p[2], yaw: wall.angle, pitch: 0 });
    await sleep(300);
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
      await sleep(350);
    }
    await shot(`${arena}-21-shoot-wall`);
    // Trace ballistics into that wall for surface classification.
    const trace = await page.evaluate(({ ox, oy, oz, dx, dz }) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      return debug.traceBallistics(debug.snapshot().player.weapon, [ox, oy, oz], [dx, 0, dz], 40);
    }, { ox: here.p[0], oy: here.p[1] + 0.2, oz: here.p[2], dx: wall.dx, dz: wall.dz });
    const summarise = (node) => node == null ? null : typeof node !== 'object' ? node : Array.isArray(node)
      ? node.slice(0, 3).map(summarise)
      : Object.fromEntries(Object.entries(node).slice(0, 14).map(([k, v]) => [k, summarise(v)]));
    return { trace: summarise(trace) };
  });
  await step('shoot-sky-trace', async () => {
    const here = await snapPlayerPos();
    const traces = {};
    for (const [label, dir] of [['up', [0, 1, 0]], ['forward', [0, 0, -1]], ['down', [0, -1, 0]]]) {
      const result = await page.evaluate(({ o, d }) => {
        const debug = window.__ATOMIC_ACRES_DEBUG__;
        return debug.traceBallistics(debug.snapshot().player.weapon, o, d, 60);
      }, { o: [here.p[0], here.p[1] + 0.2, here.p[2]], d: dir });
      const summarise = (node) => node == null ? null : typeof node !== 'object' ? node : Array.isArray(node)
        ? node.slice(0, 3).map(summarise)
        : Object.fromEntries(Object.entries(node).slice(0, 14).map(([k, v]) => [k, summarise(v)]));
      traces[label] = summarise(result);
    }
    return traces;
  });

  // 4. Weapons: switch slots, equip, pickup interaction.
  await step('weapons', async () => {
    const before = (await snap()).player.weapon;
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.switchWeapon(1));
    await sleep(700);
    const afterSlot1 = (await snap()).player.weapon;
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.switchWeapon(0));
    await sleep(700);
    const afterSlot0 = (await snap()).player.weapon;
    const dropResult = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactDrop());
    await sleep(400);
    const afterDrop = (await snap()).player.weapon;
    await shot(`${arena}-30-weapons`);
    return { before, afterSlot1, afterSlot0, dropResult, afterDrop };
  });

  // 5. Killstreak / field support (earn then activate).
  await step('killstreak', async () => {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(16));
    await sleep(400);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateSupport('scout-sweep'));
    await sleep(2500);
    await shot(`${arena}-40-support-scout`);
    // Chopper (instant activation, heavy presentation).
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateSupport('chopper'));
    await sleep(3500);
    const gate = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate());
    await shot(`${arena}-41-chopper`);
    // Tri-pass targeted strike at a point ahead.
    const here = await snapPlayerPos();
    const anchor = [here.p[0], here.p[1], here.p[2] - 8];
    const triPass = await page.evaluate(({ a, f }) => (
      window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('tri-pass', a, f)
    ), { a: anchor, f: [0, 0, -1] });
    await sleep(2500);
    await shot(`${arena}-42-tripass`);
    return { possessedAfterChopper: gate.possessed, triPassAccepted: triPass };
  });

  // 6. Grenade / melee / reload sanity.
  await step('grenade-melee-reload', async () => {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.throwGrenade());
    await sleep(2200);
    await shot(`${arena}-50-grenade`);
    const meleeResult = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.melee());
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.reload());
    await sleep(800);
    const final = await snapPlayerPos();
    return { meleeResult, alive: final.alive, hp: final.hp };
  });

  record.errors = [...new Set(consoleErrors)].slice(0, 12);
  const bundleNow = await servedBundle();
  if (bundleNow !== bundleAtStart) record.bundleChangedMidRun = { atStart: bundleAtStart, atEnd: bundleNow };
  return record;
}

const results = [];
for (const arena of ARENAS) {
  console.error(`[play] ==== ${arena} ====`);
  const startedAt = Date.now();
  try {
    results.push(await playArena(arena));
  } catch (error) {
    results.push({ arena, fatal: String(error).slice(0, 400) });
    console.error(`[play] ${arena} FATAL ${String(error).slice(0, 200)}`);
  }
  console.error(`[play] ==== ${arena} done in ${((Date.now() - startedAt) / 1000).toFixed(0)}s ====`);
}

await browser.close();

writeFileSync(
  resolve(OUTDIR, 'playtest-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results.map((entry) => ({
  arena: entry.arena,
  backend: entry.backend ?? null,
  gpuVendor: entry.gpu?.vendor ?? null,
  defects: entry.defects?.length ?? 0,
  errors: entry.errors?.length ?? 0,
  fatal: entry.fatal ?? null,
})), null, 2));
