#!/usr/bin/env node
// Playtest-and-debug lane v2: actually PLAY each arena in installed Chrome
// HEADLESS over CDP on the real WebGPU route, capture screenshots throughout,
// and emit a structured defect log another team can reproduce in one step.
//
// Per arena:
//   boot solo -> spawn record -> collisionProbe map scan (open-region bounds)
//   -> REAL keyboard walk lanes across the whole playable area -> prone/crawl
//   into discovered walls (signed metres past face) -> shoot every ballistic
//   surface material class reachable from 3 vantages -> weapon pickups
//   (railgun at its authority pickup position; Gun Range test-bay station)
//   -> earn + activate Chopper Gunner with feed-admission capture and
//   possession retry polling -> care package drop.
//
// Liveness proof: presentedGameplayFrame deltas sampled around every phase; a
// stalled counter invalidates that phase as visual evidence.
//
// Usage:
//   node scripts/qa/playtest-arena-cdp.mjs --url http://127.0.0.1:41911 \
//     [--arenas atomic-acres,...] [--out artifacts/playtest]

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT = arg('--out', 'artifacts/playtest');
const ARENAS = arg('--arenas', 'atomic-acres,farcrysis,high-seas,skyline-terminal,rustworks-1v1,gun-range')
  .split(',').map((entry) => entry.trim()).filter(Boolean);

mkdirSync(resolve(OUT), { recursive: true });

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

const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 240)}`));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

async function snapPose() {
  return page.evaluate(() => {
    const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { position: p.position, stance: p.stance, alive: p.alive, deaths: p.deaths, hp: p.hp };
  });
}

async function presentedFrame() {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.admissionState?.()?.presentedGameplayFrame ?? null);
}

async function withLiveness(record, fn) {
  const before = await presentedFrame();
  const startedAt = Date.now();
  const value = await fn();
  const after = await presentedFrame();
  record.framesAdvanced = after !== null && before !== null ? after - before : null;
  record.ms = Date.now() - startedAt;
  record.live = record.framesAdvanced === null ? 'unknown' : record.framesAdvanced > 0;
  return value;
}

async function shot(name) {
  await page.screenshot({ path: resolve(OUT, name) });
}

async function teleportTo(x, z, yaw = 0, pitch = 0, y = 1.7) {
  // ALWAYS use an absolute safe Y. Reusing the live Y teleports a falling
  // player below the world and every later phase then reads as an instant
  // fall (v3 smoke bug). Gravity settles the drop on uneven terrain.
  await page.evaluate(({ x, y, z, yaw, pitch }) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, { x, y, z, yaw, pitch });
  await settle();
}

// Wait until the pose is vertically quiet (landed) or 2 s elapse.
async function settle() {
  let last = (await snapPose()).position[1];
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    await sleep(200);
    const current = (await snapPose()).position[1];
    if (Math.abs(current - last) < 0.03 && current > -5) return true;
    last = current;
  }
  return false;
}

async function killfeedLines() {
  return page.evaluate(() =>
    [...document.querySelectorAll('#killfeed div')]
      .map((row) => row.textContent)
      .filter(Boolean)
      .slice(0, 6));
}

// Real-keyboard walk toward current yaw until blocked / arrived / timeout.
async function walkForward(maxMs, arriveWithinM, targetX, targetZ) {
  const samples = [];
  await page.keyboard.down('KeyW');
  const deadline = Date.now() + maxMs;
  let lastPos = (await snapPose()).position;
  let lastMoveCheck = Date.now();
  let outcome = 'timeout';
  while (Date.now() < deadline) {
    await sleep(200);
    const pose = await snapPose();
    samples.push(pose);
    const p = pose.position;
    if (targetX !== undefined) {
      const remaining = Math.hypot(p[0] - targetX, p[2] - targetZ);
      if (remaining <= arriveWithinM) { outcome = 'arrived'; break; }
    }
    if (p[1] < -20) { outcome = 'fell'; break; }
    if (Date.now() - lastMoveCheck >= 600) {
      if (Math.hypot(p[0] - lastPos[0], p[2] - lastPos[2]) < 0.08) {
        // stalled against geometry: jink left then right with W held before
        // declaring blocked — real players strafe around corners.
        let escaped = false;
        for (const strafeKey of ['KeyA', 'KeyD']) {
          await page.keyboard.down(strafeKey);
          const jinkStart = Date.now();
          while (Date.now() - jinkStart < 900) {
            await sleep(150);
            const jp = (await snapPose()).position;
            if (Math.hypot(jp[0] - lastPos[0], jp[2] - lastPos[2]) > 0.5) { escaped = true; break; }
          }
          await page.keyboard.up(strafeKey);
          if (escaped) break;
        }
        if (!escaped) { outcome = 'blocked'; break; }
        lastPos = p;
        lastMoveCheck = Date.now();
        continue;
      }
      lastPos = p;
      lastMoveCheck = Date.now();
    }
  }
  await page.keyboard.up('KeyW');
  return { samples, outcome };
}

// --- main per-arena flow ---------------------------------------------------

for (const arena of ARENAS) {
  consoleErrors.length = 0;
  const tag = arena;
  const record = { arena, phases: {}, consoleErrors: [] };
  const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=playtest-${arena}&previewTime=0`;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    record.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

    // Boot + spawn ---------------------------------------------------------
    await page.evaluate(async (id) => {
      await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
      window.__ATOMIC_ACRES_DEBUG__.startSolo();
    }, arena);
    await page.waitForFunction(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return s.matchPhase === 'active' && s.gameStarted === true;
    }, undefined, { timeout: 150_000 });

    record.phases.spawn = {};
    await withLiveness(record.phases.spawn, async () => {
      await sleep(5_000); // engage countdown
      record.phases.spawn.pose = await snapPose();
      await shot(`${tag}-01-spawn.png`);
      await sleep(2_000);
      await shot(`${tag}-02-spawn-plus2s.png`);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true));
    });
    const spawn = record.phases.spawn.pose?.position ?? [0, 0, 0];

    // Map scan: open walkable cells via the authoritative capsule probe -----
    record.phases.mapScan = {};
    await withLiveness(record.phases.mapScan, async () => {
      record.phases.mapScan.scan = await page.evaluate(({ sx, sz }) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const R = 70;
        const step = 2.5;
        const key = (ix, iz) => `${ix}:${iz}`;
        // grid indices relative to spawn
        const open = new Set();
        for (let ix = -R; ix <= R; ix += step) {
          for (let iz = -R; iz <= R; iz += step) {
            if (!api.collisionProbe(sx + ix, sz + iz)) open.add(key(ix, iz));
          }
        }
        // Flood fill from the spawn cell across cells connected by unblocked
        // straight segments. The raw "not blocked" region extends far past the
        // authored play boundary (open sky/void reads as unblocked), so only
        // the SPAWN-CONNECTED component counts as playable area.
        let startIx = 0;
        let startIz = 0;
        if (!open.has(key(startIx, startIz))) {
          // spawn cell blocked (rare): take nearest open cell as seed
          let best = null; let bestD = Infinity;
          for (const k of open) {
            const [ix, iz] = k.split(':').map(Number);
            const d = ix * ix + iz * iz;
            if (d < bestD) { bestD = d; best = [ix, iz]; }
          }
          if (!best) return { openCount: 0, bounds: null, component: [], laneTargets: [] };
          [startIx, startIz] = best;
        }
        const seen = new Set([key(startIx, startIz)]);
        const queue = [[startIx, startIz]];
        const neighbours = [];
        for (let dx = -step; dx <= step; dx += step) {
          for (let dz = -step; dz <= step; dz += step) {
            if (dx === 0 && dz === 0) continue;
            neighbours.push([dx, dz]);
          }
        }
        let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
        while (queue.length > 0) {
          const [ix, iz] = queue.shift();
          const wx = sx + ix; const wz = sz + iz;
          if (wx < minX) minX = wx;
          if (wx > maxX) maxX = wx;
          if (wz < minZ) minZ = wz;
          if (wz > maxZ) maxZ = wz;
          for (const [dx, dz] of neighbours) {
            const nk = key(ix + dx, iz + dz);
            if (seen.has(nk) || !open.has(nk)) continue;
            // Probe adjacency only: colliders already mark their own cells
            // blocked. segmentBlocked at the fixed 0.2-1.1 m band over-cuts
            // hedge-line gaps narrower than the grid step and collapsed the
            // component to a 5-cell spawn pen in v4.
            seen.add(nk);
            queue.push([ix + dx, iz + dz]);
          }
        }
        const component = [...seen].map((k) => k.split(':').map(Number));
        // lane targets: component cells nearest to 8 spread points inside the
        // component bounds shrunk by one cell
        const M = step * 2;
        const b = {
          minX: minX + M, maxX: maxX - M,
          minZ: minZ + M, maxZ: maxZ - M,
        };
        const picks = [];
        if (b.minX < b.maxX && b.minZ < b.maxZ) {
          const corners = [
            [b.minX, b.minZ], [b.maxX, b.minZ], [b.minX, b.maxZ], [b.maxX, b.maxZ],
            [(b.minX + b.maxX) / 2, b.minZ], [(b.minX + b.maxX) / 2, b.maxZ],
            [b.minX, (b.minZ + b.maxZ) / 2], [b.maxX, (b.minZ + b.maxZ) / 2],
          ];
          for (const [cx, cz] of corners) {
            let best = null; let bestD = Infinity;
            for (const [ix, iz] of component) {
              const d = (sx + ix - cx) ** 2 + (sz + iz - cz) ** 2;
              if (d < bestD) { bestD = d; best = [Number((sx + ix).toFixed(1)), Number((sz + iz).toFixed(1))]; }
            }
            if (best && !picks.some(([px, pz]) => px === best[0] && pz === best[1])) picks.push(best);
          }
        }
        return {
          openCount: open.size,
          componentSize: component.length,
          bounds: { minX, maxX, minZ, maxZ },
          laneTargets: picks,
        };
      }, { sx: spawn[0], sz: spawn[2] });
    });

    // Walk lanes across the whole playable area ------------------------------
    record.phases.walk = { legs: {} };
    await withLiveness(record.phases.walk, async () => {
      const targets = record.phases.mapScan.scan?.laneTargets ?? [];
      let index = 0;
      for (const [tx, tz] of targets.slice(0, 12)) {
        // find an open start cell adjacent to current position toward target:
        // simply teleport onto the target cell itself, then walk back toward
        await teleportTo(tx, tz, Math.atan2(spawn[0] - tx, spawn[2] - tz), 0);
        await sleep(250);
        let beforePose = await snapPose();
        if (!beforePose.alive || beforePose.position[1] < -5) {
          // bad landing cell: skip this target rather than record a fake fall
          await teleportTo(spawn[0], spawn[2], 0);
          await sleep(600);
          continue;
        }
        const leg = await walkForward(5_000, 999, undefined, undefined);
        const endPose = leg.samples.at(-1) ?? beforePose;
        record.phases.walk.legs[`lane${index}`] = {
          target: [tx, tz],
          startStance: beforePose.stance,
          from: beforePose.position,
          to: endPose.position,
          metresWalked: Number(Math.hypot(
            endPose.position[0] - beforePose.position[0],
            endPose.position[2] - beforePose.position[2],
          ).toFixed(1)),
          outcome: leg.outcome,
          minYReached: Number(Math.min(...leg.samples.map((s) => s.position[1])).toFixed(2)),
          died: leg.samples.some((s) => !s.alive || s.deaths > (beforePose.deaths ?? 0)),
        };
        await shot(`${tag}-10-lane-${String(index).padStart(2, '0')}.png`);
        index += 1;
        if (leg.outcome === 'fell' || !endPose.alive || endPose.position[1] < -5) {
          await teleportTo(spawn[0], spawn[2], 0);
          await sleep(600);
        }
      }
    });

    // Boundary leak walk: from spawn, walk outward in 16 headings on REAL key
    // input. A player-reachable out-of-world fall shows up as y collapsing
    // without a respawn (kill-z missing) or a respawn loop (leak + kill-z).
    record.phases.boundaryWalk = { headings: {} };
    await withLiveness(record.phases.boundaryWalk, async () => {
      for (let h = 0; h < 16; h++) {
        await teleportTo(spawn[0], spawn[2], (h / 16) * Math.PI * 2, 0);
        await sleep(250);
        const start = await snapPose();
        const leg = await walkForward(6_000, 999, undefined, undefined);
        const end = leg.samples.at(-1) ?? start;
        const extent = Number(Math.hypot(
          end.position[0] - start.position[0],
          end.position[2] - start.position[2],
        ).toFixed(1));
        const fell = leg.outcome === 'fell' || end.position[1] < start.position[1] - 3;
        record.phases.boundaryWalk.headings[`h${h}`] = {
          yaw: Number(((h / 16) * Math.PI * 2).toFixed(3)),
          from: start.position,
          to: end.position,
          extentM: extent,
          outcome: leg.outcome,
          fell,
          died: leg.samples.some((s) => s.deaths > (start.deaths ?? 0)),
          minYReached: Number(Math.min(...leg.samples.map((s) => s.position[1])).toFixed(2)),
        };
        if (fell) {
          await shot(`${tag}-11-boundary-fell-h${h}.png`);
          await teleportTo(spawn[0], spawn[2], 0);
          await sleep(800);
        }
      }
    });

    // Prone against two discovered walls -------------------------------------
    record.phases.proneWalls = {};
    await withLiveness(record.phases.proneWalls, async () => {
      for (const spotName of ['wall-near-spawn', 'wall-second']) {
        await teleportTo(spawn[0], spawn[2], spotName === 'wall-second' ? Math.PI / 2 : 0);
        await sleep(300);
        const wall = await page.evaluate((baseYaw) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const p = api.snapshot().player;
          const base = [p.position[0], 0.9, p.position[2]];
          for (let a = 0; a < 24; a++) {
            const yaw = baseYaw + ((a % 2 === 0 ? 1 : -1) * Math.ceil(a / 2)) * (Math.PI / 24);
            const dir = [Math.sin(yaw), 0, Math.cos(yaw)];
            let trace;
            try { trace = api.traceBallistics('carbine', base, dir, 12); } catch { continue; }
            const entry = trace?.impacts?.[0]?.entryDistance;
            if (Number.isFinite(entry) && entry >= 0.9 && entry <= 6) {
              return {
                yaw,
                distanceM: entry,
                from: base,
                material: trace.impacts[0].surface.material,
                surfaceName: trace.impacts[0].surface.name,
              };
            }
          }
          return null;
        }, spotName === 'wall-second' ? Math.PI / 2 : 0);
        if (!wall) {
          record.phases.proneWalls[spotName] = { ok: false, error: 'no wall within 0.9-6 m' };
          continue;
        }
        record.phases.proneWalls[spotName] = await runProneScenario(spotName, wall, tag);
      }
    });

    // Shoot every surface material class from 3 vantages ----------------------
    record.phases.shootSurfaces = {};
    await withLiveness(record.phases.shootSurfaces, async () => {
      const vantages = [
        { x: spawn[0], z: spawn[2] },
        ...((record.phases.mapScan.scan?.laneTargets ?? []).slice(0, 2).map(([x, z]) => ({ x, z }))),
      ];
      const surveyUnion = new Map();
      let surveyIndex = 0;
      for (const v of vantages) {
        await teleportTo(v.x, v.z, 0, 0);
        await sleep(350);
        const found = await page.evaluate(() => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const p = api.snapshot().player;
          const origin = [p.position[0], 1.4, p.position[2]];
          const out = [];
          for (let h = 0; h < 24; h++) {
            const yaw = (h / 24) * Math.PI * 2;
            for (const pitch of [-0.45, -0.12, 0.18]) {
              const cosP = Math.cos(pitch);
              const dir = [Math.sin(yaw) * cosP, Math.sin(pitch), Math.cos(yaw) * cosP];
              let trace;
              try { trace = api.traceBallistics('carbine', origin, dir, 90); } catch { continue; }
              const impact = trace?.impacts?.[0];
              if (!impact) continue;
              out.push({
                material: impact.surface.material,
                surfaceName: impact.surface.name,
                entryDistance: impact.entryDistance,
                penetrated: impact.penetrated,
                thicknessM: impact.thickness,
                point: [
                  origin[0] + dir[0] * impact.entryDistance,
                  origin[1] + dir[1] * impact.entryDistance,
                  origin[2] + dir[2] * impact.entryDistance,
                ],
              });
            }
          }
          return out;
        });
        for (const entry of found) {
          if (!surveyUnion.has(entry.material)) surveyUnion.set(entry.material, entry);
        }
        await shot(`${tag}-19-vantage-${surveyIndex}.png`);
        surveyIndex += 1;
      }
      record.phases.shootSurfaces.surveyMaterials = [...surveyUnion.keys()];
      let shotIndex = 0;
      for (const [material, surface] of surveyUnion) {
        const point = [
          Number(surface.point[0].toFixed(2)),
          Number(surface.point[1].toFixed(2)),
          Number(surface.point[2].toFixed(2)),
        ];
        await page.evaluate(([target]) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const p = api.snapshot().player;
          const dx = target[0] - p.position[0];
          const dy = target[1] - p.position[1];
          const dz = target[2] - p.position[2];
          api.teleportPlayer(p.position[0], p.position[1], p.position[2],
            Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)));
          for (let i = 0; i < 4; i++) api.fireOnce();
        }, [point]);
        await sleep(450);
        await shot(`${tag}-20-shot-${shotIndex}-${material}.png`);
        record.phases.shootSurfaces[material] = {
          surfaceName: surface.surfaceName,
          point,
          thicknessM: Number(surface.thicknessM.toFixed?.(3) ?? surface.thicknessM),
          penetratedTrace: surface.penetrated,
        };
        shotIndex += 1;
      }
      try {
        await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.throwGrenade());
        await sleep(2_400);
        await shot(`${tag}-21-grenade.png`);
      } catch (error) {
        record.phases.shootSurfaces.grenadeError = String(error).slice(0, 120);
      }
    });

    // Weapon pickups ----------------------------------------------------------
    record.phases.pickup = {};
    await withLiveness(record.phases.pickup, async () => {
      // Railgun (atomic-acres only): stage, read the authority pickup position,
      // stand next to it, then interact.
      try {
        const railgun = await page.evaluate(() => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const staged = api.stageRailgunSpawn ? api.stageRailgunSpawn(0) : null;
          return staged ? { pickupPosition: staged.pickupPosition, status: staged.status } : null;
        });
        record.phases.pickup.railgunStage = railgun;
        if (railgun?.pickupPosition) {
          const [px, py, pz] = railgun.pickupPosition;
          await teleportTo(px + 0.8, pz, Math.atan2(-0.8, 0), 0, py + 0.4);
          await sleep(500);
          await shot(`${tag}-30-railgun-nearby.png`);
          const interacted = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.interactRailgun());
          record.phases.pickup.railgunInteract = interacted;
          await sleep(600);
          await shot(`${tag}-31-railgun-after-interact.png`);
        }
      } catch (error) {
        record.phases.pickup.railgunError = String(error).slice(0, 160);
      }
      // Gun Range test-bay support station
      try {
        const station = await page.evaluate(() => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          return typeof api.interactTestBayStation === 'function' ? api.interactTestBayStation() : 'n/a';
        });
        record.phases.pickup.testBayStation = station;
      } catch (error) {
        record.phases.pickup.stationError = String(error).slice(0, 160);
      }
    });

    // Killstreak: Chopper Gunner (HF-389 regression watch) --------------------
    record.phases.killstreak = {};
    await withLiveness(record.phases.killstreak, async () => {
      await teleportTo(spawn[0], spawn[2], 0, 0);
      await sleep(300);
      const activation = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.earnSupport(15);
        return { accepted: api.activateKillstreak('chopper') };
      });
      record.phases.killstreak.activation = activation;
      record.phases.killstreak.feedAfterActivation = await killfeedLines();
      await sleep(1_000);
      await shot(`${tag}-40-chopper-activated.png`);

      // Possession may need the aircraft to finish flying in: poll up to 10 s.
      let possessed = false;
      for (let attempt = 0; attempt < 20 && !possessed; attempt++) {
        possessed = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
        if (!possessed) await sleep(500);
      }
      record.phases.killstreak.possessionToggled = possessed;
      await sleep(800);
      await shot(`${tag}-41-chopper-possession.png`);
      await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        for (let i = 0; i < 8; i++) api.fireOnce();
      });
      await sleep(900);
      await shot(`${tag}-42-chopper-fired.png`);
      if (possessed) {
        await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl());
        await sleep(700);
      }
      await shot(`${tag}-43-chopper-exited.png`);
      record.phases.killstreak.poseAfter = await snapPose();

      // Care package world drop presentation
      const care = await page.evaluate(() => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.earnSupport(4);
        return api.activateKillstreak('care-package');
      });
      record.phases.killstreak.carePackageAccepted = care;
      record.phases.killstreak.feedAfterCarePackage = await killfeedLines();
      await sleep(3_000);
      await shot(`${tag}-44-care-package.png`);
    });

    record.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
  } catch (error) {
    record.fatal = String(error).slice(0, 300);
    record.consoleErrors = [...new Set(consoleErrors)].slice(0, 12);
    try { await shot(`${tag}-99-fatal.png`); } catch {}
  }

  results.push(record);
  console.error(`[playtest] ${arena} done`
    + (record.fatal ? ` FATAL ${record.fatal}` : '')
    + ` errors=${record.consoleErrors.length}`);
  writeFileSync(resolve(OUT, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
}

await browser.close();

// Prone wall scenario helper (module scope so both loops share it).
async function runProneScenario(spotName, wall, tag) {
  const sideBeyondWall = (pos) => {
    const dx = pos[0] - wall.from[0];
    const dz = pos[2] - wall.from[2];
    return (dx * Math.sin(wall.yaw) + dz * Math.cos(wall.yaw)) - wall.distanceM;
  };
  const snap = async () => page.evaluate(() => {
    const p = window.__ATOMIC_ACRES_DEBUG__.snapshot().player;
    return { position: p.position, stance: p.stance, alive: p.alive, deaths: p.deaths };
  });
  const record = { wall: { material: wall.material, surfaceName: wall.surfaceName, distanceM: Number(Number(wall.distanceM).toFixed(2)) } };

  // A: stand contact -> prone -> keep pushing
  await page.evaluate(({ wall }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(wall.from[0] - Math.sin(wall.yaw) * 2, 1.7, wall.from[2] - Math.cos(wall.yaw) * 2, wall.yaw, 0);
  }, { wall });
  await sleep(400);
  await page.keyboard.down('KeyW');
  const standSamples = [];
  for (let i = 0; i < 25; i++) { await sleep(100); standSamples.push(await snap()); }
  await page.keyboard.up('KeyW');
  const standEnd = standSamples.at(-1) ?? (await snap());
  await shot(`${tag}-${spotName}-A-stand-contact.png`);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  await sleep(300);
  await page.keyboard.down('KeyW');
  const proneSamples = [];
  for (let i = 0; i < 30; i++) { await sleep(100); proneSamples.push(await snap()); }
  await page.keyboard.up('KeyW');
  await shot(`${tag}-${spotName}-A-prone-push.png`);
  record.A = {
    worstBeyondWallFaceM: Number(Math.max(...proneSamples.map((s) => sideBeyondWall(s.position))).toFixed(3)),
    stancesSeen: [...new Set(proneSamples.map((s) => s.stance))],
    standContact: standEnd.position,
    proneEnd: proneSamples.at(-1)?.position ?? null,
  };

  // B: sprint-dive prone at the wall
  await page.evaluate(({ wall }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(wall.from[0] - Math.sin(wall.yaw) * 6, 1.7, wall.from[2] - Math.cos(wall.yaw) * 6, wall.yaw, 0);
  }, { wall });
  await sleep(300);
  await page.keyboard.down('KeyW');
  await sleep(350);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  const diveSamples = [];
  for (let i = 0; i < 25; i++) { await sleep(80); diveSamples.push(await snap()); }
  await page.keyboard.up('KeyW');
  await shot(`${tag}-${spotName}-B-sprint-dive.png`);
  record.B = {
    worstBeyondWallFaceM: Number(Math.max(...diveSamples.map((s) => sideBeyondWall(s.position))).toFixed(3)),
    finalPosition: diveSamples.at(-1)?.position ?? null,
  };

  // C: crawl sideways along the wall while prone
  await page.evaluate(({ wall }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setStance('stand');
    api.teleportPlayer(wall.from[0] - Math.sin(wall.yaw) * 1.2, 1.7, wall.from[2] - Math.cos(wall.yaw) * 1.2, wall.yaw + Math.PI / 2, 0);
  }, { wall });
  await sleep(300);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('prone'));
  await sleep(200);
  await page.keyboard.down('KeyW');
  const crawlSamples = [];
  for (let i = 0; i < 30; i++) { await sleep(100); crawlSamples.push(await snap()); }
  await page.keyboard.up('KeyW');
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setStance('stand'));
  await shot(`${tag}-${spotName}-C-prone-crawl.png`);
  record.C = {
    worstBeyondWallFaceM: Number(Math.max(...crawlSamples.map((s) => sideBeyondWall(s.position))).toFixed(3)),
    end: crawlSamples.at(-1)?.position ?? null,
  };
  return record;
}
