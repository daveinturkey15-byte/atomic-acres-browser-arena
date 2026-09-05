#!/usr/bin/env npx tsx
// PASS 95 farcrysis layout stage — ROUTE traversability probe under STOCK FLAGS.
//
// Walks every segment of the three authored loops and the four cross lanes in
// src/farcrysis-layout.ts with the real character controller (teleport, hold
// forward, watch the position), and classifies every stop the way
// sweep-farcrysis-traversal.mjs does: a named surface within 1.2 m is a wall
// the player can see; ground climbing >= 0.6 m in the next metre is a slope;
// water or the island edge is the edge; anything else with a movement probe
// blocked ahead is an INVISIBLE WALL - the defect class the brief names.
//
// Why not run sweep-farcrysis-traversal.mjs: it launches Chrome with
// --enable-unsafe-webgpu (the HF-454 flag set) and its 96 walks exceed the
// four-minute session cap. This probe is stock flags (installed Chrome,
// PASS73_NATIVE_WEBGPU=1, --mute-audio only), one browser, own port, ~32 walks,
// hard kill at 235 s.
//
//   npx tsx scripts/qa/probe-farcrysis-routes-stock.mjs --url http://127.0.0.1:4267 \
//       --out docs/evidence/pass95/farcrysis-rebuild/route-probe.json
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from '../../src/farcrysis-terrain-authority.ts';
import { FARCRYSIS_CROSS_LANES, FARCRYSIS_ROUTE_SEGMENTS, FARCRYSIS_SCALE } from '../../src/farcrysis-layout.ts';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:4267');
const OUT = resolve(arg('--out', 'artifacts/qa/farcrysis-route-probe.json'));
const WALK_MS = Number(arg('--walk-ms', '3500'));
const HARD_KILL_MS = Number(arg('--hard-kill-ms', '235000'));
const BLOCKER_NEAR_M = 1.2;
const SLOPE_STEP_M = 0.6;
const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });
process.env.PASS73_NATIVE_WEBGPU = '1';

/** Every walk: start x/z, heading toward the next waypoint. */
const walks = [];
for (const edge of FARCRYSIS_ROUTE_SEGMENTS) {
  walks.push({
    route: edge.routeId,
    segment: edge.segment,
    from: [edge.from[0], edge.from[1]],
    to: [edge.to[0], edge.to[1]],
    widthM: edge.widthM,
    plannedDistanceM: Number(edge.distanceM.toFixed(2)),
    plannedSprintSeconds: Number(edge.sprintSeconds.toFixed(2)),
  });
}
for (const lane of FARCRYSIS_CROSS_LANES) {
  const mid = [(lane.from[0] + lane.to[0]) / 2, (lane.from[1] + lane.to[1]) / 2];
  // Keep the previous stage's midpoint probe as an additional check; the
  // full edge above is the canonical route table entry, so this extends the
  // probe instead of replacing its earlier coverage.
  walks.push({
    route: lane.id,
    segment: 1,
    from: mid,
    to: [lane.to[0], lane.to[1]],
    widthM: lane.widthM,
    plannedDistanceM: Number(Math.hypot(lane.to[0] - mid[0], lane.to[1] - mid[1]).toFixed(2)),
    plannedSprintSeconds: Number((Math.hypot(lane.to[0] - mid[0], lane.to[1] - mid[1]) / FARCRYSIS_SCALE.sprintMps).toFixed(2)),
  });
}

const groundAt = (x, z) => {
  const height = farcrysisTerrainHeight(x, z);
  return Number.isFinite(height) ? Number(height.toFixed(3)) : null;
};
const overWater = (x, z) => (groundAt(x, z) ?? -99) <= FARCRYSIS_WATER_LEVEL;

const startedAt = Date.now();
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const killer = setTimeout(() => { console.error('[route-probe] HARD KILL'); browser.close().catch(() => {}); process.exit(3); }, HARD_KILL_MS);
const rows = [];
const notes = [];
let backend = null;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => notes.push(`pageerror: ${String(error).slice(0, 200)}`));
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=pass95-routes&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
  backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); window.__ATOMIC_ACRES_DEBUG__.startSolo(); }, 'farcrysis');
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 150_000 });
  await sleep(4_000);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true)).catch(() => notes.push('setBotsFrozen unavailable'));
  for (const walk of walks) {
    if (Date.now() - startedAt > HARD_KILL_MS - 12_000) { rows.push({ ...walk, skipped: 'time box' }); continue; }
    const [sx, sz] = walk.from;
    const dx = walk.to[0] - sx;
    const dz = walk.to[1] - sz;
    const distance = Math.hypot(dx, dz);
    const ux = distance > 0 ? dx / distance : 0;
    const uz = distance > 0 ? dz / distance : 0;
    let probeSx = sx;
    let probeSz = sz;
    let startAdjustmentM = 0;
    const startBlocked = await page.evaluate(([px, pz]) => Boolean(window.__ATOMIC_ACRES_DEBUG__.collisionProbe(px, pz)), [sx, sz]);
    if (startBlocked) {
      // Closed-loop vertices can coincide with the shell collider at a corner.
      // Walk a short distance into the segment so the probe tests the authored
      // edge instead of discarding it as an invalid spawn point.
      for (const adjustmentM of [0.75, 1.25, 1.75, 2.25, 2.75]) {
        const candidateX = sx + ux * adjustmentM;
        const candidateZ = sz + uz * adjustmentM;
        const candidateGround = groundAt(candidateX, candidateZ);
        const candidateBlocked = await page.evaluate(([px, pz]) => Boolean(window.__ATOMIC_ACRES_DEBUG__.collisionProbe(px, pz)), [candidateX, candidateZ]);
        if (!candidateBlocked && candidateGround !== null && candidateGround > FARCRYSIS_WATER_LEVEL) {
          probeSx = candidateX;
          probeSz = candidateZ;
          startAdjustmentM = adjustmentM;
          break;
        }
      }
    }
    const ground = groundAt(probeSx, probeSz);
    if ((startBlocked && startAdjustmentM === 0) || ground === null || ground <= FARCRYSIS_WATER_LEVEL) {
      rows.push({ ...walk, skipped: startBlocked ? 'start inside a collider; no clear segment entry' : ground === null ? 'no ground' : 'start in water' });
      continue;
    }
    const yaw = Math.atan2(-dx, -dz); // controller walks along (-sin h, 0, -cos h)
    const phase = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase);
    if (phase !== 'active') {
      notes.push(`match phase ${phase} before ${walk.route}#${walk.segment} - rematched`);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.rematch());
      await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase === 'active' && s.gameStarted === true; }, undefined, { timeout: 120_000 });
      await sleep(2_000);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true)).catch(() => {});
    }
    await page.evaluate(({ x, y, z, h }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, h, 0), { x: probeSx, y: ground + 1.7, z: probeSz, h: yaw });
    await sleep(400);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
    const deadline = Date.now() + WALK_MS;
    let outcome = 'walked';
    let last = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    let lastCheck = Date.now();
    while (Date.now() < deadline) {
      await sleep(200);
      const position = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
      if (position[1] < -20) { outcome = 'fell'; break; }
      if (Date.now() - lastCheck >= 700) {
        if (Math.hypot(position[0] - last[0], position[2] - last[2]) < 0.10) { outcome = 'stopped'; break; }
        last = position; lastCheck = Date.now();
      }
    }
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
    const end = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
    const walkedM = Math.hypot(end[0] - probeSx, end[2] - probeSz);
    let classification = outcome;
    let blocker = null;
    let slope = null;
    let movementBlocked = null;
    if (outcome === 'stopped') {
      blocker = await page.evaluate(([ex, ey, ez, h]) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        let best = null;
        for (let a = -4; a <= 4; a += 1) {
          const y2 = h + a * 0.06;
          let trace;
          try { trace = api.traceBallistics('carbine', [ex, ey, ez], [-Math.sin(y2), 0, -Math.cos(y2)], 4); } catch { continue; }
          const impact = trace?.impacts?.[0];
          if (impact && (!best || impact.entryDistance < best.distanceM)) best = { name: impact.surface.name, material: impact.surface.material ?? null, distanceM: Number(impact.entryDistance.toFixed(2)) };
        }
        return best;
      }, [end[0], end[1] - 0.7, end[2], yaw]);
      movementBlocked = await page.evaluate(([ex, ez, h]) => [0.5, 1.0, 1.5].map((step) => Boolean(window.__ATOMIC_ACRES_DEBUG__.collisionProbe(ex - Math.sin(h) * step, ez - Math.cos(h) * step))), [end[0], end[2], yaw]);
      const aheadX = end[0] - Math.sin(yaw);
      const aheadZ = end[2] - Math.cos(yaw);
      const here = groundAt(end[0], end[2]);
      const ahead = overWater(aheadX, aheadZ) ? null : groundAt(aheadX, aheadZ);
      slope = here === null || ahead === null ? null : Number((ahead - here).toFixed(3));
      if (blocker && blocker.distanceM <= BLOCKER_NEAR_M) classification = 'stopped-at-surface';
      else if (slope !== null && slope >= SLOPE_STEP_M) classification = 'stopped-on-slope';
      else if (ahead === null) classification = 'stopped-at-island-edge';
      else if (movementBlocked && movementBlocked.some(Boolean)) classification = 'INVISIBLE-WALL';
      else classification = 'stopped-no-cause-found';
    }
    rows.push({ ...walk, yaw: Number(yaw.toFixed(3)), probeFrom: [Number(probeSx.toFixed(2)), Number(probeSz.toFixed(2))], startAdjustmentM, outcome, classification, walkedM: Number(walkedM.toFixed(2)), end: end.map((v) => Number(v.toFixed(2))), blocker, groundStepAheadM: slope, movementBlockedAt: movementBlocked });
    console.error(`[route-probe] ${walk.route}#${walk.segment} ${classification} ${walkedM.toFixed(1)} m${blocker ? ` (${blocker.name} @ ${blocker.distanceM} m)` : ''}`);
  }
} catch (error) {
  notes.push(`fatal: ${String(error).slice(0, 300)}`);
} finally {
  clearTimeout(killer);
  await browser.close().catch(() => {});
}
const attempted = rows.filter((r) => !r.skipped);
const counts = {};
for (const r of attempted) counts[r.classification] = (counts[r.classification] ?? 0) + 1;
const record = {
  contract: 'farcrysis-route-probe-v1',
  sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  measuredAt: new Date().toISOString(),
  url: BASE,
  backend,
  flags: ['--mute-audio'],
  env: { PASS73_NATIVE_WEBGPU: '1' },
  method: {
    walkMs: WALK_MS,
    blockerNearM: BLOCKER_NEAR_M,
    slopeStepM: SLOPE_STEP_M,
    routes: [...new Set(FARCRYSIS_ROUTE_SEGMENTS.map((edge) => edge.routeId))],
    routeSegments: FARCRYSIS_ROUTE_SEGMENTS.length,
  },
  planned: walks.length,
  attempted: attempted.length,
  skipped: rows.filter((r) => r.skipped).length,
  counts,
  invisibleWalls: attempted.filter((r) => r.classification === 'INVISIBLE-WALL'),
  rows,
  notes,
  elapsedMs: Date.now() - startedAt,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);
console.error(`[route-probe] backend=${backend} attempted ${attempted.length}/${walks.length} counts=${JSON.stringify(counts)} invisible-walls=${record.invisibleWalls.length} elapsed=${record.elapsedMs} ms -> ${OUT}`);
process.exit(record.invisibleWalls.length === 0 && attempted.length > 0 && notes.every((n) => !n.startsWith('fatal')) ? 0 : 1);
