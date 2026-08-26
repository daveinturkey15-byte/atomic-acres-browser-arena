#!/usr/bin/env node
// Pass 79 playtest-and-debug lane: targeted follow-up probes for defects the
// 2026-08-26 sweeps flagged. Each probe isolates ONE claim with clean setup
// (fixed-Y teleport, fresh state, sampled over time) so a repro is one step.
//
// Probes:
//   A. rustworks-1v1   — full 5x5 grid ground audit: which cells have floor,
//                        which drop the player into an infinite fall.
//   B. farcrysis       — centre freeze: player suspended mid-air, input dead?
//   C. high-seas       — prone engagement on deck + prone push against wall.
//   D. skyline-terminal— corner (-35,-35): stuck or outside geometry?
//   E. gun-range       — stuck spots + east-edge fall at x=100.
//   F. atomic-acres    — shoot open-ground floor from a clean spawn: are shots
//                        admitted (viewmodel-contact-raise only when embedded)?
//
// Usage: node scripts/qa/playtest-defect-probes.mjs [--url http://127.0.0.1:41911]
//        [--out artifacts/qa/pass79-playtest-r2] [--only A,B,C]
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
const ONLY = arg('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const browser = await chromium.launch({
  headless: true,
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

let errorPhase = 'boot';
const errors = [];
page.on('pageerror', (error) => errors.push(`[${errorPhase}] pageerror: ${String(error).slice(0, 240)}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`[${errorPhase}] console: ${message.text().slice(0, 240)}`);
});

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probes79&previewTime=0`;

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

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

const snapState = () => page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const s = api.snapshot();
  return {
    pos: s.player?.position?.map((v) => Number(v.toFixed(3))) ?? null,
    grounded: s.player?.grounded ?? null,
    stance: s.player?.stance ?? null,
    alive: s.player?.alive ?? null,
    hp: s.player?.hp ?? null,
    weapon: s.player?.weapon ?? null,
    ammo: s.player?.ammo ? s.player.ammo[s.player.weapon] : null,
    simGateInput: s.simulationGate?.inputEnabled ?? null,
    frameCount: typeof s.frameCount === 'number' ? s.frameCount : null,
  };
});

const shot = async (name) => {
  const path = resolve(OUT_DIR, name);
  await page.screenshot({ path }).catch((e) => errors.push(`screenshot-fail ${name}: ${e}`));
  return name;
};

const results = {};
const runProbe = async (id, fn) => {
  if (ONLY.length && !ONLY.includes(id)) return;
  errorPhase = id;
  console.error(`[probe] ${id} ...`);
  try {
    results[id] = await fn();
  } catch (error) {
    results[id] = { error: String(error).slice(0, 300) };
  }
  console.error(`[probe] ${id} done`);
};

// --- A. rustworks-1v1 grid ground audit -----------------------------------
await runProbe('A-rustworks-grid', async () => {
  await bootArena('rustworks-1v1');
  const bounds = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.bounds);
  const cells = [];
  const stepX = (bounds.maxX - bounds.minX) / 4;
  const stepZ = (bounds.maxZ - bounds.minZ) / 4;
  for (let ix = 0; ix <= 4; ix += 1) {
    for (let iz = 0; iz <= 4; iz += 1) {
      const x = Math.round(bounds.minX + stepX * ix);
      const z = Math.round(bounds.minZ + stepZ * iz);
      // Fixed Y every time — never inherit a previous cell's fallen Y.
      await page.evaluate(([px, pz]) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.setStance('stand');
        api.teleportPlayer(px, 1.8, pz, 0, 0);
      }, [x, z]);
      await sleep(1600);
      const state = await snapState();
      const outcome = !state.alive ? 'died'
        : state.pos[1] < -4 ? 'falling-void'
          : !state.grounded ? 'airborne'
            : 'grounded';
      cells.push({ x, z, outcome, y: state.pos[1], hp: state.hp });
      if (outcome !== 'grounded') await shot(`rustworks-cell-${x}-${z}-${outcome}.png`);
    }
  }
  const summary = Object.fromEntries(['grounded', 'airborne', 'falling-void', 'died']
    .map((k) => [k, cells.filter((c) => c.outcome === k).length]));
  return { bounds, summary, badCells: cells.filter((c) => c.outcome !== 'grounded'), cells };
});

// --- B. farcrysis centre freeze -------------------------------------------
await runProbe('B-farcrysis-freeze', async () => {
  await bootArena('farcrysis');
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(0, 1.8, 16, 0, 0);
  });
  await sleep(800);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
  const samples = [];
  for (let i = 0; i < 8; i += 1) {
    await sleep(400);
    samples.push(await snapState());
  }
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  await shot('farcrysis-freeze-end.png');
  const gate = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleSimulationGate());
  const first = samples[0];
  const last = samples.at(-1);
  const moved = Math.hypot(last.pos[0] - first.pos[0], last.pos[2] - first.pos[2]);
  return { samples, movedM: Number(moved.toFixed(3)), everGrounded: samples.some((s) => s.grounded), gate };
});

// --- C. high-seas prone ----------------------------------------------------
await runProbe('C-highseas-prone', async () => {
  await bootArena('high-seas');
  const spawn = await snapState();
  // Deck spot near spawn: stand, settle, then prone.
  await page.evaluate(([x, z]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(x, 1.8, z, 0, 0);
  }, [Math.round(spawn.pos[0]), Math.round(spawn.pos[2])]);
  await sleep(1200);
  const settled = await snapState();
  await shot('highseas-pre-prone.png');
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  await sleep(1500);
  const proneState = await snapState();
  await shot('highseas-prone.png');
  // Now walk forward prone for 2s and watch for pushing through geometry.
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
  await sleep(2000);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  const afterWalk = await snapState();
  await shot('highseas-prone-walk.png');
  const travelled = Math.hypot(afterWalk.pos[0] - proneState.pos[0], afterWalk.pos[2] - proneState.pos[2]);
  return {
    spawn: spawn.pos, settled: settled.pos, settledGrounded: settled.grounded,
    proneEngaged: proneState.stance, pronePos: proneState.pos,
    afterWalkPos: afterWalk.pos, travelledProneM: Number(travelled.toFixed(3)),
    endedAlive: afterWalk.alive, endedY: afterWalk.pos[1],
  };
});

// --- D. skyline-terminal corner --------------------------------------------
await runProbe('D-skyline-corner', async () => {
  await bootArena('skyline-terminal');
  const bounds = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.bounds);
  await page.evaluate(([x, z]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(x, 1.8, z, Math.PI, 0);
  }, [bounds.minX + 1, bounds.minZ + 1]);
  await sleep(1000);
  const atCorner = await snapState();
  await shot('skyline-corner.png');
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true));
  await sleep(2000);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
  const after = await snapState();
  await shot('skyline-corner-after.png');
  const moved = Math.hypot(after.pos[0] - atCorner.pos[0], after.pos[2] - atCorner.pos[2]);
  const blockedHere = await page.evaluate(([x, z]) => (
    window.__ATOMIC_ACRES_DEBUG__.collisionProbe(x, z)
  ), [atCorner.pos[0], atCorner.pos[2]]);
  return { bounds, atCorner: atCorner.pos, grounded: atCorner.grounded, collisionProbeAtRest: blockedHere, movedSprintM: Number(moved.toFixed(3)), after: after.pos };
});

// --- E. gun-range stuck spots + east edge ----------------------------------
await runProbe('E-gunrange-spots', async () => {
  await bootArena('gun-range');
  const spots = [[-20, 38], [40, -48], [70, -48], [98, -54]];
  const findings = [];
  for (const [x, z] of spots) {
    await page.evaluate(([px, pz]) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setStance('stand');
      api.teleportPlayer(px, 1.8, pz, Math.PI, 0);
    }, [x, z]);
    await sleep(900);
    const before = await snapState();
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
    await sleep(1400);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
    const after = await snapState();
    const moved = Math.hypot(after.pos[0] - before.pos[0], after.pos[2] - before.pos[2]);
    findings.push({
      spot: [x, z], landedY: before.pos[1], groundedBefore: before.grounded,
      movedM: Number(moved.toFixed(3)), endPos: after.pos, endY: after.pos[1],
      outcome: !after.alive ? 'died' : after.pos[1] < -4 ? 'void' : moved < 0.3 ? 'stuck' : 'moved',
    });
    if (findings.at(-1).outcome !== 'moved') await shot(`gunrange-spot-${x}-${z}-${findings.at(-1).outcome}.png`);
  }
  return { findings };
});

// --- F. atomic-acres open-ground shooting ----------------------------------
await runProbe('F-atomic-shoot-floor', async () => {
  await bootArena('atomic-acres');
  const spawn = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position.map((v) => Math.round(v)));
  // Clean spawn tile, stand, look straight down, fire three times.
  await page.evaluate(([x, z]) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(x, 1.8, z, 0, -1.35);
  }, [spawn[0], spawn[2]]);
  await sleep(900);
  const fireBlockBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().fireBlock?.total ?? null);
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.fireOnce());
    await sleep(400);
  }
  const afterShots = await snapState();
  const fireBlockAfter = await page.evaluate(() => {
    const block = window.__ATOMIC_ACRES_DEBUG__.snapshot().fireBlock;
    return { total: block?.total ?? null, last: block?.last ?? null };
  });
  await shot('atomic-floor-shots.png');
  const ammo = afterShots.ammo;
  return {
    spawnTile: [spawn[0], spawn[2]],
    fireBlockBefore, fireBlockAfter, ammoAfterShots: ammo,
    shotsAdmitted: fireBlockAfter.total === fireBlockBefore,
    aliveAfter: afterShots.alive,
  };
});

await browser.close();
writeFileSync(
  resolve(OUT_DIR, 'defect-probes.json'),
  `${JSON.stringify({ backend, generatedAt: new Date().toISOString(), results, errors: [...new Set(errors)].slice(0, 20) }, null, 2)}\n`,
);
console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => ([k, v.error ? { error: v.error } : 'see json']))), null, 2));
