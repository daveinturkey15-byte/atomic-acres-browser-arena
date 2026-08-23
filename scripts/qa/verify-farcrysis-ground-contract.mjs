#!/usr/bin/env node
// Farcrysis ground contract: does the player stand ON the island, and can they
// WALK into the sea and swim?
//
// The unit tests assert the terrain authority agrees with itself. This asserts
// the thing a player experiences, which is a different claim:
//
//  1. STANDING - teleport above a spread of sampled points across the island
//     and let the capsule settle. It must come to rest near the authored
//     surface, not sink through it and not hover above it. The audit's finding
//     was a flat y=0 physics floor under terrain sculpted to 2.2 m, so a player
//     stood INSIDE hills; a settle height far below the authored surface is
//     exactly that failure.
//  2. SWIMMING BY WALKING - stand on the beach and hold W toward open water.
//     The swim state must engage. The audit found the shoreline never reached
//     swim depth, so the swimmable body was unreachable on foot even though
//     the reducer worked when teleported into deep water.
//
// Usage: node scripts/qa/verify-farcrysis-ground-contract.mjs
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41876');
// Settle tolerance: the physics surface is a tangent-plane tiling of the
// analytic height field, so a small fit error is expected and acceptable.
const SETTLE_TOLERANCE_M = Number(arg('--tolerance', '0.6'));
const WALK_MS = Number(arg('--walk-ms', '9000'));

const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)));

await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=quality&seed=ground&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
await page.waitForTimeout(2_500);

// Freeze the bots. Without this the harness measures BOT MARKSMANSHIP, not
// ground contact: a stationary player teleported into the open is shot dead in
// about two seconds, and an earlier version of this file read that as a
// terrain fault (continuous HP loss while grounded, no fall damage recorded).
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
await page.waitForTimeout(400);

// Sample the island interior on a coarse grid, avoiding the outer shore ramp.
const SAMPLES = [];
for (let x = -22; x <= 22; x += 11) {
  for (let z = -22; z <= 22; z += 11) SAMPLES.push([x, z]);
}

/** Puts the player somewhere alive and settled, or reports why it could not. */
async function placeAndSettle(x, y, z, yaw = 0) {
  await page.evaluate(([px, py, pz, pyaw]) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    if (!debug.snapshot().player.alive) debug.respawn();
    debug.teleportPlayer(px, py, pz, pyaw, 0);
  }, [x, y, z, yaw]);
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      alive: snapshot.player.alive,
      hp: snapshot.player.hp,
    };
  });
}

const standing = [];
for (const [x, z] of SAMPLES) {
  // Drop from a modest height: enough that the capsule must find the ground
  // itself, low enough not to inflict lethal fall damage. Dropping from 12 m
  // killed the player on every low sample in an earlier version, which then
  // respawned them at their spawn point and quietly poisoned every later
  // measurement in the run.
  const settled = await placeAndSettle(x, 5, z);
  standing.push({ x, z, eyeY: settled.position[1], alive: settled.alive });
}

// Authored surface height for the same points, read from the single authority
// the arena now builds from.
const authored = await page.evaluate((samples) => {
  const audit = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph?.()
    ?.getObjectByName('f4rcry515 — flooded jungle research station')?.userData?.farcrysisTerrainSamples;
  if (audit) return audit;
  return samples.map(() => null);
}, SAMPLES);

const standingReport = standing.map((entry, index) => {
  const surface = Array.isArray(authored) ? authored[index] : null;
  // Eye height is 1.7 m above the feet.
  const feetY = entry.eyeY - 1.7;
  return { ...entry, feetY: Number(feetY.toFixed(2)), authoredY: surface };
});
// Without an exported sample list we still catch the reported failure mode:
// a player standing INSIDE a hill settles at/below y=0 everywhere, while the
// island rises to ~2.2 m. So require that the settle heights VARY with the
// terrain rather than all collapsing onto one plane.
const feetHeights = standingReport.map((entry) => entry.feetY);
const spread = Math.max(...feetHeights) - Math.min(...feetHeights);
const anyoneFell = standingReport.some((entry) => entry.feetY < -3);
const standingOk = spread > 0.8 && !anyoneFell;

// --- Walk into the sea ---
// Start on the beach on the +Z side and walk seaward with real input.
// Yaw convention: forward is (-sin(yaw), -cos(yaw)), so yaw 0 faces -Z and
// walking seaward on the +Z side needs yaw = PI. The first version of this
// harness used yaw 0 here and walked INLAND while reporting "never reached
// water", which was true and completely uninformative.
const beach = await placeAndSettle(0, 4, 24, Math.PI);
const beachStart = beach.position;
// A harness that silently walks from the wrong place reports a meaningless
// failure. Assert the precondition instead of assuming it.
const startedOnBeach = Math.abs(beachStart[2] - 24) < 2 && beach.alive;
await page.click('body');
await page.keyboard.down('KeyW');
let swamAt = null;
const walkTrace = [];
for (let elapsed = 0; elapsed < WALK_MS && !swamAt; elapsed += 500) {
  await page.waitForTimeout(500);
  const state = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      swimming: snapshot.swim?.swimming ?? null,
      bodySwimmable: snapshot.swim?.bodySwimmable ?? null,
      hp: snapshot.player.hp,
      alive: snapshot.player.alive,
    };
  });
  walkTrace.push({ atMs: elapsed + 500, ...state });
  if (state.swimming) swamAt = elapsed + 500;
}
await page.keyboard.up('KeyW');

await browser.close();

const verdict = standingOk && startedOnBeach && swamAt !== null ? 'PASS' : 'FAIL';
console.log(JSON.stringify({
  verdict,
  standing: {
    ok: standingOk,
    settleSpreadM: Number(spread.toFixed(2)),
    anyoneFell,
    samples: standingReport,
  },
  walkIntoSea: {
    ok: startedOnBeach && swamAt !== null,
    startedOnBeach,
    beachStart,
    swamAfterMs: swamAt,
    trace: walkTrace,
  },
  pageErrors: [...new Set(errors)].slice(0, 5),
}, null, 2));
process.exit(verdict === 'PASS' ? 0 : 1);
