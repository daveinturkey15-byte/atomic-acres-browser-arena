#!/usr/bin/env node
/**
 * THE OBJECTIVE ANSWER TO "the gun still goes through walls and floor".
 *
 * Every previous attempt at this defect was graded on something that was not
 * the defect: the muzzle socket (one authored point - it passed while the
 * magazine sat 0.26 m through a wall), or a screenshot (the viewmodel draws on
 * a depth-cleared overlay, so it paints over world geometry whether or not it
 * is inside it, and a human cannot tell those two apart by looking).
 *
 * This drives the real game through the real WebGPU route and reads
 * `__ATOMIC_ACRES_DEBUG__.sampleViewmodelPenetration()`, which walks every
 * visible viewmodel VERTEX in world space and reports how deep the deepest one
 * is inside a solid, and how far the lowest one is below the standing surface.
 *
 * The scenario set is deliberately not just "walk at a wall head on". That case
 * a camera-perpendicular clip plane can already handle. The interesting rows
 * are the ones it structurally cannot: strafing ALONGSIDE a wall (the rig sits
 * ~0.33 m right of the eye, so the gun is in the wall while the crosshair is
 * parallel to it), inside corners, and sloped ground.
 *
 * Headless. Never opens a window on the owner's display.
 *
 * Usage:
 *   node scripts/qa/run-with-preview-server.mjs \
 *     node scripts/qa/measure-viewmodel-penetration-cdp.mjs --out artifacts/qa/penetration
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41933/');
const OUT = arg('--out', 'artifacts/qa/viewmodel-penetration');
const ARENAS = arg('--arenas', 'atomic-acres,test2').split(',').map((s) => s.trim()).filter(Boolean);
const WEAPONS = arg('--weapons', 'carbine,m4a1,lmg').split(',').map((s) => s.trim()).filter(Boolean);
const LABEL = arg('--label', 'run');

mkdirSync(resolve(OUT), { recursive: true });

/**
 * Scenarios are authored as a pose plus a reason. `sweepYaw` rotates the player
 * on the spot through a full turn, which is what finds the glancing-angle cases:
 * a wall is only "head on" for a few degrees of the circle.
 */
const SCENARIOS = {
  'atomic-acres': [
    { name: 'house-front-wall', x: 4, z: -6.4, yaw: Math.PI, pitch: 0, sweepYaw: true, why: 'head-on and every glancing angle against the aqua house front wall' },
    { name: 'bus-van-gap', x: 4.5, z: -3.75, yaw: Math.PI / 2, pitch: 0, sweepYaw: true, why: 'narrow gap with a solid on both sides' },
    { name: 'garage-door', x: 17.7, z: -6.2, yaw: Math.PI, pitch: 0, sweepYaw: true, why: 'flush door line' },
    { name: 'west-fence-corner', x: -36.6, z: 23.0, yaw: Math.PI / 2, pitch: 0, sweepYaw: true, why: 'the corner that emptied the frame on 2026-08-31' },
    { name: 'open-ground-down', x: 0, z: 0, yaw: 0, pitch: -1.2, sweepYaw: false, why: 'looking down at flat ground, weapon must stay above it' },
    { name: 'grass-slope-down', x: -24, z: 26, yaw: 2.2, pitch: -0.85, sweepYaw: true, why: 'the owner screenshot: sloped grass, looking down' },
  ],
  test2: [
    { name: 'zone-a-wall', x: -34, z: -0.5, yaw: 0, pitch: 0, sweepYaw: true, why: 'Domination zone A surrounds' },
    { name: 'zone-b-court', x: 0, z: 14, yaw: 0, pitch: -0.6, sweepYaw: true, why: 'sunken court, looking down' },
    { name: 'zone-c-wall', x: 34, z: -0.5, yaw: Math.PI, pitch: 0, sweepYaw: true, why: 'Domination zone C surrounds' },
    { name: 'upper-room', x: 0, z: -20, yaw: 0, pitch: -0.4, sweepYaw: true, why: 'upper floor interior, floor beneath and walls around' },
  ],
};

const YAW_STEPS = 12; // 30 degrees apart
const STANCES = ['stand', 'crouch', 'prone'];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });

const rows = [];

for (const arena of ARENAS) {
  const scenarios = SCENARIOS[arena];
  if (!scenarios) { console.error(`no scenarios authored for ${arena}, skipping`); continue; }

  await page.evaluate(async (id) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  }, arena);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot?.player && snapshot.gameStarted !== false;
  }, null, { timeout: 180_000 }).catch(() => {});
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));

  for (const weapon of WEAPONS) {
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon?.(id), weapon).catch(() => {});
    await page.waitForTimeout(350);

    for (const scenario of scenarios) {
      const yaws = scenario.sweepYaw
        ? Array.from({ length: YAW_STEPS }, (_unused, step) => (step / YAW_STEPS) * Math.PI * 2)
        : [scenario.yaw];

      for (const stance of STANCES) {
        await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setStance(value), stance);
        await page.waitForTimeout(120);

        for (const yaw of yaws) {
          const sample = await page.evaluate(async (pose) => {
            const api = window.__ATOMIC_ACRES_DEBUG__;
            api.teleportPlayer(pose.x, pose.y, pose.z, pose.yaw, pose.pitch);
            // Settle: the contact fold and the clip plane are driven per frame,
            // so a single frame after a teleport is not the resting pose.
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))));
            return api.sampleViewmodelPenetration();
          }, { x: scenario.x, y: 1.7, z: scenario.z, yaw, pitch: scenario.pitch });

          rows.push({
            arena,
            weapon,
            stance,
            scenario: scenario.name,
            why: scenario.why,
            yawDegrees: Math.round((yaw * 180) / Math.PI),
            pitchRadians: scenario.pitch,
            maxPenetrationM: sample.maxPenetrationM,
            maxBelowFloorM: sample.maxBelowFloorM,
            worstMesh: sample.worstMesh,
            solidBoxes: sample.solidBoxes,
            dressingBoxes: sample.dressingBoxes,
          });
        }
      }
    }
  }
}

await browser.close();

const penetrating = rows.filter((row) => row.maxPenetrationM > 0.01);
const belowFloor = rows.filter((row) => row.maxBelowFloorM > 0.01);
const worst = [...rows].sort((left, right) => right.maxPenetrationM - left.maxPenetrationM).slice(0, 15);

const summary = {
  label: LABEL,
  rows: rows.length,
  penetratingRows: penetrating.length,
  belowFloorRows: belowFloor.length,
  maxPenetrationM: rows.reduce((peak, row) => Math.max(peak, row.maxPenetrationM), 0),
  maxBelowFloorM: rows.reduce((peak, row) => Math.max(peak, row.maxBelowFloorM), 0),
  // Where it fails matters as much as how often: a defect only at glancing
  // angles points at the clip plane's orientation, not at its distance.
  byScenario: Object.fromEntries(
    [...new Set(rows.map((row) => `${row.arena}/${row.scenario}`))].map((key) => {
      const scoped = rows.filter((row) => `${row.arena}/${row.scenario}` === key);
      return [key, {
        rows: scoped.length,
        penetrating: scoped.filter((row) => row.maxPenetrationM > 0.01).length,
        worstM: scoped.reduce((peak, row) => Math.max(peak, row.maxPenetrationM), 0),
      }];
    }),
  ),
  worst,
};

writeFileSync(resolve(OUT, `${LABEL}-rows.json`), `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync(resolve(OUT, `${LABEL}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
console.log(`\n${penetrating.length}/${rows.length} poses have visible weapon geometry inside a solid`);
console.log(`${belowFloor.length}/${rows.length} poses have visible weapon geometry below the standing surface`);
