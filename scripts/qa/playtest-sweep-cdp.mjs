#!/usr/bin/env node
// Pass 79 playtest-and-debug lane: actually PLAY each arena in installed Chrome
// headless over CDP on real hardware WebGPU (channel:'chrome' headless gets a
// real device — measured 2026-08-25; needs no governor browser slot).
//
// Per arena: spawn, walk the playable area, go prone against walls, shoot every
// surface type, pick up weapons, trigger a killstreak, screenshot throughout,
// and record telemetry that turns "felt wrong" into a reproducible defect:
//   - walked-but-displacement-0 while grounded + inputEnabled  -> stuck/movement gate
//   - collisionProbe(playerX, playerZ) true while standing     -> inside a collider (clipping)
//   - player.y < -5                                            -> fell out of world
//   - console/page errors                                      -> recorded verbatim with arena + phase
//
// Usage: node scripts/qa/playtest-sweep-cdp.mjs [--url http://127.0.0.1:41911]
//        [--arenas a,b,c] [--out artifacts/qa/pass79-playtest] [--walk-ms 900]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultBootRoster } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = resolve(arg('--out', 'artifacts/qa/pass79-playtest'));
const WALK_MS = Number(arg('--walk-ms', '1100'));
// PASS 85 Lane N: this default was a hardcoded arena literal, so Test1, Test2
// and Map 3 were never swept by it and nothing said so. It is now derived from
// the registry (scripts/qa/arena-roster.mjs) and is a strict superset of what
// it covered before; `--arenas` still overrides it.
const ARENAS = arg('--arenas', defaultBootRoster())
  .split(',').map((entry) => entry.trim()).filter(Boolean);
mkdirSync(OUT_DIR, { recursive: true });

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

const bootT = Date.now();
const stamp = () => `t+${((Date.now() - bootT) / 1000).toFixed(1)}s`;
const errors = [];
let errorPhase = 'boot';
page.on('pageerror', (error) => errors.push(`${stamp()} [${errorPhase}] pageerror: ${String(error).slice(0, 300)}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`${stamp()} [${errorPhase}] console: ${message.text().slice(0, 300)}`);
});

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=play79&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
const adapterVendor = await page.evaluate(async () => {
  if (!navigator.gpu) return 'no-navigator-gpu';
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return 'no-adapter';
  if (!adapter.requestDevice) return 'adapter-no-device';
  const device = await adapter.requestDevice().catch(() => null);
  const info = adapter.info ?? {};
  return `${info.vendor ?? '?'}/${info.architecture ?? '?'} device=${device ? 'yes' : 'NO'}`;
}).catch(() => 'probe-error');
console.error(`[play79] backend=${backend} adapter=${adapterVendor}`);

const snap = () => page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const s = api.snapshot();
  return {
    position: s.player?.position ?? null,
    grounded: s.player?.grounded ?? null,
    stance: s.player?.stance ?? null,
    alive: s.player?.alive ?? null,
    hp: s.player?.hp ?? null,
    weapon: s.player?.weapon ?? null,
    inputEnabled: s.simulationGate?.inputEnabled ?? undefined,
    simGate: api.sampleSimulationGate ? Object.fromEntries(Object.entries(api.sampleSimulationGate())
      .filter(([, v]) => typeof v === 'boolean' || typeof v === 'number')) : null,
    swim: s.swim ?? null,
    rawBounds: s.arenaSelection?.bounds ?? null,
    weaponDrops: Array.isArray(s.weaponDrops)
      ? s.weaponDrops.map((d) => ({ id: d.id ?? d.weapon ?? null, position: d.position ?? null }))
      : [],
    kills: s.score?.kills ?? s.kills ?? null,
  };
}).catch(async () => null);

async function shot(name) {
  const path = resolve(OUT_DIR, name);
  await page.screenshot({ path }).catch((e) => errors.push(`${stamp()} screenshot-fail ${name}: ${e}`));
  return path;
}

const results = [];

for (const arena of ARENAS) {
  errorPhase = `${arena}:boot`;
  errors.length = 0;
  const record = { arena, ok: false, defects: [], screenshots: [], phases: {} };
  const defect = (kind, detail) => {
    record.defects.push({ kind, ...detail });
    console.error(`[play79] ${arena} DEFECT ${kind}: ${JSON.stringify(detail).slice(0, 240)}`);
  };

  try {
    // --- Boot -------------------------------------------------------------
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    const bootedAt = Date.now();
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 240_000 });
    record.phases.bootMs = Date.now() - bootedAt;
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });

    let state = await snap();
    const raw = state?.rawBounds;
    record.spawn = state?.position;
    record.bounds = raw;
    if (!raw || ![raw.minX, raw.maxX, raw.minZ, raw.maxZ].every(Number.isFinite)) throw new Error(`no bounds in snapshot: ${JSON.stringify(state).slice(0, 200)}`);
    const bounds = { min: { x: raw.minX, z: raw.minZ }, max: { x: raw.maxX, z: raw.maxZ } };
    record.screenshots.push(await shot(`${arena}-00-spawn.png`));

    // --- Walk the playable area -------------------------------------------
    errorPhase = `${arena}:walk`;
    const spanX = bounds.max.x - bounds.min.x;
    const spanZ = bounds.max.z - bounds.min.z;
    const stepX = spanX / 4;
    const stepZ = spanZ / 4;
    const waypoints = [];
    for (let ix = 0; ix <= 4; ix += 1) {
      for (let iz = 0; iz <= 4; iz += 1) {
        waypoints.push({
          x: Math.round((bounds.min.x + stepX * ix) * 10) / 10,
          z: Math.round((bounds.min.z + stepZ * iz) * 10) / 10,
        });
      }
    }
    // Keep only waypoints not inside a collider.
    const walkable = [];
    for (const point of waypoints) {
      const blocked = await page.evaluate(([x, z]) => window.__ATOMIC_ACRES_DEBUG__.collisionProbe(x, z), [point.x, point.z]);
      if (!blocked) walkable.push(point);
    }
    record.walkWaypoints = walkable.length;

    let walkIndex = 0;
    for (const point of walkable.slice(0, 13)) {
      await page.evaluate(([x, z]) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.setStance('stand');
        api.teleportPlayer(x, api.snapshot().player.position[1], z);
        api.setMovement(true);
      }, [point.x, point.z]);
      await page.waitForTimeout(WALK_MS);
      await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(false); });
      state = await snap();
      const pos = state?.position;
      const drifted = Math.hypot(pos[0] - point.x, pos[2] - point.z);
      // setMovement(true) walks forward ~1.1 s; a healthy player covers >0.5 m.
      // Displacement near zero while grounded + input enabled = stuck/movement gate.
      const stuckWhileWalking = state.grounded === true
        && state.alive === true
        && state.simGate?.inputEnabled !== false
        && state.simGate?.simulationEnabled !== false
        && drifted < 0.3;
      const belowWorld = pos[1] < -5;
      const insideCollider = await page.evaluate(([x, z]) => window.__ATOMIC_ACRES_DEBUG__.collisionProbe(x, z), [Math.round(pos[0] * 100) / 100, Math.round(pos[2] * 100) / 100]);
      if (belowWorld) defect('fell-below-world', { at: pos, waypoint: point });
      else if (stuckWhileWalking) defect('stuck-while-walking', { waypoint: point, ended: pos, moved: Number(drifted.toFixed(3)), simGate: state.simGate });
      else if (insideCollider) defect('standing-inside-collider', { at: [Number(pos[0].toFixed(2)), Number(pos[1].toFixed(2)), Number(pos[2].toFixed(2))] });
      if (state.swim?.swimming) record.phases.everSwam = true;
      walkIndex += 1;
      if (walkIndex % 4 === 0) record.screenshots.push(await shot(`${arena}-walk-${String(walkIndex).padStart(2, '0')}.png`));
    }

    // --- Prone against walls ----------------------------------------------
    errorPhase = `${arena}:prone`;
    // Find a wall: an unwalkable cell adjacent to a walkable one.
    let wallSpot = null;
    outer:
    for (const point of walkable) {
      for (const [dx, dz] of [[stepX / 2, 0], [-stepX / 2, 0], [0, stepZ / 2], [0, -stepZ / 2]]) {
        const nx = Math.round((point.x + dx) * 10) / 10;
        const nz = Math.round((point.z + dz) * 10) / 10;
        if (nx < bounds.min.x || nx > bounds.max.x || nz < bounds.min.z || nz > bounds.max.z) continue;
        const blocked = await page.evaluate(([x, z]) => window.__ATOMIC_ACRES_DEBUG__.collisionProbe(x, z), [nx, nz]);
        if (blocked) { wallSpot = { free: point, wall: { x: nx, z: nz } }; break outer; }
      }
    }
    if (wallSpot) {
      const proneResult = await page.evaluate(async ([free, wall]) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.setStance('stand');
        api.teleportPlayer(free.x, 1.2, free.z);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 600));
        api.setStance('prone');
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200));
        // Face the wall and walk into it prone.
        const yaw = Math.atan2(-(wall.x - free.x), -(wall.z - free.z));
        api.teleportPlayer(free.x, api.snapshot().player.position[1], free.z, yaw, 0);
        api.setMovement(true);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));
        api.setMovement(false);
        const s = api.snapshot();
        return {
          position: s.player.position.map((v) => Number(v.toFixed(3))),
          stance: s.player.stance,
          grounded: s.player.grounded,
          probeBlockedAtPlayer: api.collisionProbe(s.player.position[0], s.player.position[2]),
          probeBlockedIntoWall: api.collisionProbe(wall.x, wall.z),
        };
      }, [wallSpot.free, wallSpot.wall]);
      record.prone = { spot: wallSpot, result: proneResult };
      record.screenshots.push(await shot(`${arena}-01-prone-wall.png`));
      if (proneResult.probeBlockedAtPlayer) defect('prone-inside-collider', { at: proneResult.position, stance: proneResult.stance });
      if (proneResult.stance !== 'prone') defect('prone-did-not-engage', { stance: proneResult.stance });
      const pushedThrough = Math.hypot(
        proneResult.position[0] - wallSpot.free.x,
        proneResult.position[2] - wallSpot.free.z,
      );
      const towardWall = Math.hypot(wallSpot.wall.x - wallSpot.free.x, wallSpot.wall.z - wallSpot.free.z);
      if (pushedThrough > towardWall + 0.35) {
        defect('prone-pushed-through-wall', { from: wallSpot.free, wall: wallSpot.wall, ended: proneResult.position, travelled: Number(pushedThrough.toFixed(2)), wallDistance: Number(towardWall.toFixed(2)) });
      }
    } else {
      record.prone = 'no-wall-spot-found';
    }

    // --- Shoot surface types ----------------------------------------------
    errorPhase = `${arena}:shoot`;
    const shootResult = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const s0 = api.snapshot();
      const px = s0.player.position[0];
      const pz = s0.player.position[2];
      api.setStance('stand');
      api.teleportPlayer(px, Math.max(1.2, s0.player.position[1]), pz);
      const outcomes = [];
      // Floor: pitch straight down.
      api.teleportPlayer(px, Math.max(1.2, s0.player.position[1]), pz, 0, -1.4);
      await new Promise((r) => setTimeout(r, 400));
      api.fireOnce();
      await new Promise((r) => setTimeout(r, 350));
      outcomes.push({ target: 'floor', ammoAfter: api.snapshot().player.ammo });
      // Horizon: pitch level, fire downrange; then sky.
      api.teleportPlayer(px, Math.max(1.2, s0.player.position[1]), pz, 0, 0);
      await new Promise((r) => setTimeout(r, 400));
      api.fireOnce();
      await new Promise((r) => setTimeout(r, 350));
      outcomes.push({ target: 'downrange' });
      api.teleportPlayer(px, Math.max(1.2, s0.player.position[1]), pz, Math.PI / 2, 0.6);
      await new Promise((r) => setTimeout(r, 400));
      api.fireOnce();
      await new Promise((r) => setTimeout(r, 350));
      outcomes.push({ target: 'upward' });
      return { outcomes };
    });
    record.shoot = shootResult;
    record.screenshots.push(await shot(`${arena}-02-after-fire.png`));

    // --- Weapon pickup ------------------------------------------------------
    errorPhase = `${arena}:pickup`;
    const pickup = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const before = api.snapshot().player.weapon;
      const accepted = api.interactDrop();
      await new Promise((r) => setTimeout(r, 500));
      const after = api.snapshot().player.weapon;
      return { before, accepted, after };
    });
    record.pickup = pickup;
    if (pickup.before === pickup.after && pickup.accepted === false) {
      // Not necessarily a defect (may be no drop nearby) — note it.
      record.pickup.note = 'interactDrop returned falsy and weapon unchanged (may be no drop within range)';
    }

    // --- Killstreak ---------------------------------------------------------
    errorPhase = `${arena}:killstreak`;
    // requestKillstreakActivation only admits ids present in the player's 5-slot
    // loadout (or a revealed care reward), so try every earned selectable id
    // instead of assuming 'care-package' is in the default solo loadout.
    const ks = await page.evaluate(async ([bx, bz]) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.earnSupport(8);
      await new Promise((r) => setTimeout(r, 700));
      const s = api.snapshot();
      const available = s.fieldSupport?.available ?? {};
      const anchor = [Math.round(bx), 0.2, Math.round(bz)];
      const tried = [];
      let activatedId = null;
      // Non-possession ids first; possession ids change the camera.
      for (const id of ['care-package', 'scout-sweep', 'adrenaline', 'yardhawk', 'hunter-swarm', 'tri-pass', 'carpet-bomber', 'drone-swarm', 'piloted-drone', 'chopper']) {
        if (available[id] !== true) continue;
        const ok = api.activateKillstreak(id, anchor, [0, 0, -1]);
        tried.push({ id, ok });
        if (ok) { activatedId = id; break; }
      }
      await new Promise((r) => setTimeout(r, 2500));
      return { activatedId, tried, anchor, available };
    }, [(bounds.min.x + bounds.max.x) / 2, (bounds.min.z + bounds.max.z) / 2]);
    record.killstreak = ks;
    record.screenshots.push(await shot(`${arena}-03-killstreak.png`));
    if (!ks.activatedId) defect('killstreak-not-activated', { tried: ks.tried, available: Object.keys(ks.available).filter((k) => ks.available[k]) });

    record.ok = true;
  } catch (error) {
    record.error = String(error).slice(0, 300);
    record.diagnostics = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        bootstrapStage: snapshot.bootstrap?.stage ?? null,
        matchPhase: snapshot.matchPhase ?? null,
        arenaId: document.documentElement.dataset.arenaId ?? null,
        status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 160),
      };
    }).catch(() => null);
    record.screenshots.push(await shot(`${arena}-99-error.png`).catch(() => '(screenshot failed)'));
  }
  record.errors = [...errors];
  results.push(record);
  console.error(`[play79] ${arena.padEnd(18)} ${record.ok ? 'DONE' : 'ERROR'} defects=${record.defects.length} shots=${record.screenshots.length}`);
}

await browser.close();
const verdict = results.every((entry) => entry.ok) ? 'COMPLETE' : 'PARTIAL';
writeFileSync(resolve(OUT_DIR, 'playtest-report.json'),
  `${JSON.stringify({ verdict, backend, adapterVendor, generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify({
  verdict, backend, adapterVendor,
  perArena: results.map((r) => ({ arena: r.arena, ok: r.ok, defects: r.defects })),
}, null, 2));
