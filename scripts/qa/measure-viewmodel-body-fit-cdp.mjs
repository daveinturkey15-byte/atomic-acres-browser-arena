#!/usr/bin/env node
/**
 * HF-410 - DOES THE RIG FIT INSIDE THE BODY THAT CARRIES IT?
 *
 * The penetration instrument answers "is the gun inside a wall right now". It
 * cannot answer why, and for six passes the answer was treated as a rendering
 * problem: retreat, fold, clip planes, a depth-cleared overlay. The cause is
 * geometric. `HIP_VIEWMODEL_POSITION.z` is -1.08 m and the rig reaches further
 * still, while the standing capsule radius is 0.38 m, so the weapon lives
 * roughly two thirds of a metre OUTSIDE the player's own collision body. Every
 * wall the capsule is allowed to stand next to therefore contains the weapon,
 * and no amount of retreat can fix a body/rig size mismatch.
 *
 * This walks every visible viewmodel vertex through
 * `__ATOMIC_ACRES_DEBUG__.sampleViewmodelRigExtent()` on OPEN GROUND - no wall,
 * no contact response, no fold - for every graded weapon at hip and ADS in each
 * stance, and tables the envelope against the capsule radius, the floor and the
 * camera near plane. `capsuleMarginM` negative is the defect.
 *
 * Headless. Never opens a window on the owner's display.
 *
 * Usage:
 *   node scripts/qa/run-with-preview-server.mjs \
 *     node scripts/qa/measure-viewmodel-body-fit-cdp.mjs --out artifacts/qa/body-fit --label before
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180/');
const OUT = arg('--out', 'artifacts/qa/viewmodel-body-fit');
const LABEL = arg('--label', 'run');
const ARENA = arg('--arena', 'atomic-acres');
/**
 * The graded set spans the authored size range on purpose: the largest
 * first-person rigs (which is where a body-fit failure is worst) and the
 * smallest (which is where an over-aggressive fit would show up as a weapon
 * that has become a toy).
 */
const WEAPONS = arg(
  '--weapons',
  'lmg,minigun,railgun,sniper,slug-shotgun,flamethrower,m4a1,carbine,pistol,mini-uzi',
).split(',').map((value) => value.trim()).filter(Boolean);
const STANCES = ['stand', 'crouch', 'prone'];
/** Open ground on atomic-acres: nothing within reach in any direction. */
const OPEN_GROUND = { x: Number(arg('--x', '0')), z: Number(arg('--z', '0')), yaw: 0, pitch: 0 };

mkdirSync(resolve(OUT), { recursive: true });

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
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));

const rows = [];
try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });
  await page.evaluate(async (id) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  }, ARENA);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot?.player && snapshot.gameStarted !== false;
  }, null, { timeout: 180_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));

  for (const weapon of WEAPONS) {
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon?.(id), weapon).catch(() => {});
    await page.waitForTimeout(400);
    for (const stance of STANCES) {
      for (const ads of [false, true]) {
        const sample = await page.evaluate(async (pose) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const frame = () => new Promise((done) => requestAnimationFrame(done));
          let grounded = false;
          for (let attempt = 0; attempt < 3 && !grounded; attempt += 1) {
            api.teleportPlayer(pose.x, 1.7, pose.z, pose.yaw, pose.pitch);
            for (let waited = 0; waited < 90 && !grounded; waited += 1) {
              await frame();
              grounded = api.snapshot()?.player?.grounded === true;
            }
          }
          const stanceReached = api.setStanceForQa(pose.stance);
          for (let waited = 0; waited < 30; waited += 1) await frame();
          api.setAds(pose.ads);
          // The ADS blend is a first-order filter; 90 frames is well past its
          // settling time at any frame rate this harness produces.
          for (let waited = 0; waited < 90; waited += 1) await frame();
          const measured = api.sampleViewmodelRigExtent();
          api.setAds(false);
          return {
            ...measured,
            grounded: api.snapshot()?.player?.grounded === true,
            stanceReached,
          };
        }, { ...OPEN_GROUND, stance, ads });
        const valid = sample.grounded === true
          && sample.stanceReached === stance
          && (ads ? sample.adsBlend > 0.9 : sample.adsBlend < 0.1);
        rows.push({ arena: ARENA, weapon, stance, ads, valid, ...sample });
        console.log(
          `${weapon.padEnd(14)} ${stance.padEnd(6)} ${ads ? 'ads ' : 'hip '}`
          + ` fwd ${String(sample.eyeForwardMaxM).padStart(7)}`
          + ` radial ${String(sample.capsuleRadialMaxM).padStart(7)}`
          + ` margin ${String(sample.capsuleMarginM).padStart(7)}`
          + ` floor ${String(sample.floorClearanceMinM).padStart(7)}`
          + ` near ${String(sample.nearPlaneMarginM).padStart(7)}`
          + (valid ? '' : '   INVALID'),
        );
      }
    }
  }
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}

const valid = rows.filter((row) => row.valid);
const worst = valid.reduce(
  (accumulator, row) => (
    row.capsuleMarginM !== null && row.capsuleMarginM < accumulator.capsuleMarginM ? row : accumulator
  ),
  { capsuleMarginM: Number.POSITIVE_INFINITY },
);
const summary = {
  contract: 'viewmodel-body-fit-v1',
  label: LABEL,
  arena: ARENA,
  measuredAt: new Date().toISOString(),
  rows: rows.length,
  validRows: valid.length,
  /** Negative on any row means the rig leaves the player's own collision body. */
  worstCapsuleMarginM: Number.isFinite(worst.capsuleMarginM) ? worst.capsuleMarginM : null,
  worstCapsuleRow: Number.isFinite(worst.capsuleMarginM)
    ? { weapon: worst.weapon, stance: worst.stance, ads: worst.ads, radialMesh: worst.radialMesh }
    : null,
  maxForwardM: valid.reduce((max, row) => Math.max(max, row.eyeForwardMaxM ?? 0), 0),
  minFloorClearanceM: valid.reduce(
    (min, row) => Math.min(min, row.floorClearanceMinM ?? Number.POSITIVE_INFINITY),
    Number.POSITIVE_INFINITY,
  ),
  minNearPlaneMarginM: valid.reduce(
    (min, row) => Math.min(min, row.nearPlaneMarginM ?? Number.POSITIVE_INFINITY),
    Number.POSITIVE_INFINITY,
  ),
};
writeFileSync(resolve(OUT, `body-fit-${LABEL}.json`), `${JSON.stringify({ summary, rows }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (valid.length === 0) {
  console.error('NO VALID ROWS - this run is not evidence.');
  process.exitCode = 1;
}
