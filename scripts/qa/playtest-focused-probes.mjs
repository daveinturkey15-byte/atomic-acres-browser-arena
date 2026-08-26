#!/usr/bin/env node
// Pass 79 playtest-and-debug lane — focused follow-up probes to
// playtest-sweep-cdp.mjs, driven by its r3 findings:
//
//   A. PRONE CLIP-THROUGH (HF-387 class): sweep shows prone-walking into a wall
//      ends with the player BELOW the world on atomic-acres (-48.5), rustworks
//      (-42.2), gun-range (-48.2). This probe samples position every 100 ms
//      during the prone walk and records the first sample where y drops > 1 m,
//      plus the x,z at that moment — the exact coordinate where the floor
//      fails, so a fixing team gets a one-step repro.
//   B. WEAPON PICKUP: the sweep's blind interactDrop() never stood near a real
//      drop. Here we teleport to each snapshot weaponDrop / gun-range station,
//      face it, attempt the interaction, and record weapon before/after.
//   C. SURFACE TYPES (HF-390): traceBallistics from a central open point in 8
//      compass directions + straight down, recording every surface class hit
//      and its penetration rating, so "shoot every surface type" is evidence,
//      not intention.
//
// Usage: node scripts/qa/playtest-focused-probes.mjs [--url http://127.0.0.1:41911]
//        [--arenas a,b] [--out artifacts/qa/pass79-playtest-r3]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = resolve(arg('--out', 'artifacts/qa/pass79-playtest-r3'));
const ARENAS = arg('--arenas', 'atomic-acres,farcrysis,high-seas,skyline-terminal,rustworks-1v1,gun-range')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
mkdirSync(OUT_DIR, { recursive: true });

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

const errors = [];
page.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 240)}`));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 240)}`);
});

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe79&previewTime=0`;
const results = [];

for (const arena of ARENAS) {
  const record = { arena, probes: {} };
  errors.length = 0;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 240_000 });
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });

    // ---- A. Prone clip-through fine sampling -----------------------------
    record.probes.proneClip = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const s = api.snapshot();
      const bounds = s.arenaSelection?.bounds;
      if (!bounds) return { error: 'no bounds' };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Find a walkable cell adjacent to a blocked one, like the sweep does.
      const spanX = bounds.maxX - bounds.minX;
      const spanZ = bounds.maxZ - bounds.minZ;
      let spot = null;
      outer:
      for (let ix = 0; ix <= 6; ix += 1) {
        for (let iz = 0; iz <= 6; iz += 1) {
          const x = Math.round((bounds.minX + (spanX * ix) / 6) * 10) / 10;
          const z = Math.round((bounds.minZ + (spanZ * iz) / 6) * 10) / 10;
          if (api.collisionProbe(x, z)) continue;
          for (const [dx, dz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
            const nx = Math.round((x + dx) * 10) / 10;
            const nz = Math.round((z + dz) * 10) / 10;
            if (nx < bounds.minX || nx > bounds.maxX || nz < bounds.minZ || nz > bounds.maxZ) continue;
            if (api.collisionProbe(nx, nz)) { spot = { free: { x, z }, wall: { x: nx, z: nz } }; break outer; }
          }
        }
      }
      if (!spot) return { error: 'no wall spot found' };
      api.setStance('stand');
      api.teleportPlayer(spot.free.x, 1.2, spot.free.z);
      await sleep(600);
      api.setStance('prone');
      await sleep(1200);
      const yaw = Math.atan2(-(spot.wall.x - spot.free.x), -(spot.wall.z - spot.free.z));
      api.teleportPlayer(spot.free.x, api.snapshot().player.position[1], spot.free.z, yaw, 0);
      api.setMovement(true);
      const samples = [];
      let firstDrop = null;
      for (let i = 0; i < 20; i += 1) {
        await sleep(100);
        const p = api.snapshot().player.position;
        const sample = { t: (i + 1) * 100, x: Number(p[0].toFixed(2)), y: Number(p[1].toFixed(2)), z: Number(p[2].toFixed(2)) };
        samples.push(sample);
        if (!firstDrop && p[1] < 0.4 - 1.0) firstDrop = sample;
      }
      api.setMovement(false);
      const end = api.snapshot().player.position;
      return {
        spot, firstDrop, samples,
        end: { x: Number(end[0].toFixed(2)), y: Number(end[1].toFixed(2)), z: Number(end[2].toFixed(2)) },
        fellBelowWorld: end[1] < -5,
      };
    });

    // ---- B. Weapon pickups ------------------------------------------------
    // snapshot().rangePractice.stations is the canonical gun-range station list;
    // world death drops have NO snapshot key, so spawn one via the debug API at
    // the player's own position, step back, and attempt the pickup.
    record.probes.pickup = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const s = api.snapshot();
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const attempts = [];
      const dropId = api.spawnDeathDrop();
      await sleep(600);
      if (dropId) {
        const before = api.snapshot().player.weapon;
        const here = api.snapshot().player.position;
        api.setStance('stand');
        api.teleportPlayer(here[0], Math.max(1.2, here[1]), here[2] + 1.3, 0, 0);
        await sleep(700);
        const accepted = api.interactDrop();
        await sleep(500);
        attempts.push({ drop: dropId, before, accepted: Boolean(accepted), after: api.snapshot().player.weapon });
      } else {
        attempts.push({ drop: 'spawnDeathDrop returned null' });
      }
      const stations = s.rangePractice?.stations ?? [];
      for (const station of stations.slice(0, 4)) {
        const p = station.position;
        if (!p) continue;
        const before = api.snapshot().player.weapon;
        api.setStance('stand');
        api.teleportPlayer(p[0], 1.4, p[2] + 1.1, 0, 0);
        await sleep(700);
        const accepted = api.interactTestBayStation();
        await sleep(500);
        attempts.push({ station: station.weapon ?? station.id ?? 'unknown', visible: station.visible, before, accepted: Boolean(accepted), after: api.snapshot().player.weapon });
      }
      return { attempts, stationCount: stations.length };
    });

    // ---- B2. Ballistics census: are shot surfaces registered at all? ------
    record.probes.ballisticsCensus = await page.evaluate(() => {
      const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        activeSurfaces: s.ballistics?.activeSurfaces ?? null,
        arenas: s.ballistics?.arenas ?? null,
      };
    });

    // ---- C. Surface types via traceBallistics -----------------------------
    record.probes.surfaces = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const s = api.snapshot();
      const bounds = s.arenaSelection?.bounds;
      if (!bounds) return { error: 'no bounds' };
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      // Stand at the centre-most open cell.
      let centre = null;
      outer:
      for (let r = 0; r <= 1; r += 0.25) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
          const x = Math.round(((bounds.minX + bounds.maxX) / 2 + Math.cos(a) * r * (bounds.maxX - bounds.minX) / 2) * 10) / 10;
          const z = Math.round(((bounds.minZ + bounds.maxZ) / 2 + Math.sin(a) * r * (bounds.maxZ - bounds.minZ) / 2) * 10) / 10;
          if (!api.collisionProbe(x, z)) { centre = { x, z }; break outer; }
        }
      }
      if (!centre) return { error: 'no open centre cell' };
      api.setStance('stand');
      api.teleportPlayer(centre.x, Math.max(1.6, api.snapshot().player.position[1]), centre.z, 0, 0);
      await sleep(600);
      const eye = api.snapshot().player.position;
      const directions = [];
      for (let i = 0; i < 8; i += 1) {
        const a = (i * Math.PI) / 4;
        directions.push({ name: `compass-${i * 45}`, dir: [Math.sin(a), 0, -Math.cos(a)] });
      }
      directions.push({ name: 'down', dir: [0, -1, 0] });
      const traces = [];
      for (const { name, dir } of directions) {
        try {
          const trace = api.traceBallistics('carbine', [eye[0], eye[1] + 0.2, eye[2]], dir, 80);
          traces.push({
            name,
            surfaces: (Array.isArray(trace) ? trace : trace?.impacts ?? trace?.hits ?? [trace])
              .map((hit) => ({
                surface: hit?.surface ?? hit?.surfaceClass ?? hit?.material ?? null,
                penetration: hit?.penetration ?? hit?.piercing ?? null,
                point: hit?.point ? [Number(hit.point[0]?.toFixed?.(1) ?? hit.point.x?.toFixed?.(1)).valueOf?.() ?? null] : null,
              })).slice(0, 4),
            raw: Array.isArray(trace) ? undefined : JSON.stringify(trace)?.slice(0, 200),
          });
        } catch (error) {
          traces.push({ name, error: String(error).slice(0, 140) });
        }
      }
      return { centre, eye: [Number(eye[0].toFixed(1)), Number(eye[1].toFixed(1)), Number(eye[2].toFixed(1))], traces };
    });

    // Screenshot the post-prone state for the report.
    await page.screenshot({ path: resolve(OUT_DIR, `${arena}-probe-prone-end.png`) }).catch(() => {});
  } catch (error) {
    record.error = String(error).slice(0, 240);
  }
  record.errors = [...errors].slice(0, 4);
  results.push(record);
  console.error(`[probe79] ${arena.padEnd(18)} prone=${JSON.stringify(record.probes.proneClip?.end ?? record.error)} fell=${record.probes.proneClip?.fellBelowWorld}`);
}

await browser.close();
writeFileSync(resolve(OUT_DIR, 'focused-probe-report.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log('[probe79] wrote focused-probe-report.json');
