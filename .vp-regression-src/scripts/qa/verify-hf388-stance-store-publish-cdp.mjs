#!/usr/bin/env node
// HF-382/HF-388 companion: prove the OPERATOR panel's stance card reaches the
// LIVE first-person arms store in a shipped bundle on real WebGPU.
//
// The audited defect: legacy-main.ts's [data-operator-stance] click handler
// persisted the choice to localStorage but never called
// setActiveOperatorStance(), so activeOperatorStance()'s cache stayed stale and
// weapon-presentation's per-frame FIRST_PERSON_STANCE_PRESENTATIONS lookup kept
// the previous stance until a full page reload.
//
// What this measures, on INSTALLED Chrome headless (real hardware WebGPU device,
// secure context first, requestDevice() called and vendor recorded):
//   1. The delegated card handler actually runs (localStorage updates).
//   2. THE OUTPUT A PLAYER SEES: snapshot().weaponPresentation
//      .armBounds.center / viewmodelViewport.rootPosition+rootRotation move by
//      the authored 'low' presentation (dropMeters 0.055, yawRadians +0.1)
//      WITHOUT any reload, and the RIGID viewmodel root round-trips to its
//      baseline when Weapon Ready is re-selected. (The arm CENTER of an
//      animated skinned mesh legitimately differs in idle-loop phase between
//      two instants, so only the root - which stance owns - is held to a tight
//      round-trip band.)
//   3. Frames captured either side; pixel diff recorded as supporting evidence.
//
// Usage: node scripts/qa/verify-hf388-stance-store-publish-cdp.mjs --url http://127.0.0.1:41921
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41921');
const TAG = arg('--tag', 'run');
const OUT = `artifacts/hf388/stance-publish-${TAG}`;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));

const log = (...parts) => console.error('[hf388-stance]', ...parts);

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf388stance&previewTime=0`, { waitUntil: 'domcontentloaded' });

const gpu = await page.evaluate(async () => {
  if (!navigator.gpu) return { navigatorGpu: false };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { navigatorGpu: true, adapter: false };
  const device = await adapter.requestDevice();
  return { navigatorGpu: true, adapter: true, device: Boolean(device), vendor: adapter.info?.vendor ?? null };
});
log('webgpu', JSON.stringify(gpu));

await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
log('backend', backend);

// gun-range: solo arena with no bot pool - the player stands still at the hip,
// which is exactly where the stance presentation is gated to full strength.
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.waitForTimeout(2600);

async function readState() {
  return page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const wp = snapshot.weaponPresentation ?? {};
    return {
      storedStance: globalThis.localStorage.getItem('atomic-acres-operator-stance'),
      armCenter: wp.armBounds ? wp.armBounds.center : null,
      rootPosition: wp.viewmodelViewport ? wp.viewmodelViewport.rootPosition : null,
      rootRotation: wp.viewmodelViewport ? wp.viewmodelViewport.rootRotation : null,
      frameCount: snapshot.frameCount,
    };
  });
}

async function rawFrame() {
  const png = await page.screenshot({ type: 'png' });
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels, png };
}

function diffPixels(a, b, threshold = 12) {
  let count = 0;
  const n = a.data.length;
  for (let i = 0; i < n; i += a.channels) {
    if (Math.abs(a.data[i] - b.data[i]) > threshold
      || Math.abs(a.data[i + 1] - b.data[i + 1]) > threshold
      || Math.abs(a.data[i + 2] - b.data[i + 2]) > threshold) count += 1;
  }
  return count;
}

// Presses a stance card through the REAL delegated document listener that
// legacy-main registers. Uses the actual menu card when it is in the DOM;
// otherwise an equivalent [data-operator-stance] button appended to body -
// same closest() path, same handler branch the audit names.
async function pressStanceCard(stanceId) {
  await page.evaluate((id) => {
    const existing = document.querySelector(`[data-operator-stance="${id}"]`);
    if (existing) { existing.click(); return 'real-card'; }
    const synthetic = document.createElement('button');
    synthetic.type = 'button';
    synthetic.dataset.operatorStance = id;
    document.body.appendChild(synthetic);
    synthetic.click();
    synthetic.remove();
  }, stanceId);
}

const failures = [];
const check = (name, ok, detail) => { if (!ok) failures.push(`${name}: ${detail}`); log(ok ? 'PASS' : 'FAIL', name, detail); };

const before = await readState();
const frameA = await rawFrame();

// A fresh browser profile has NO stored stance; activeOperatorStance() then
// lazily resolves DEFAULT_OPERATOR_STANCE ('ready'). Both mean the same pose.
check('baseline-ready-or-default', before.storedStance === 'ready' || before.storedStance === null,
  `stored=${before.storedStance}`);
if (before.storedStance !== null && before.storedStance !== 'ready') {
  // Normalise through the same UI path rather than asserting from a dirty base.
  await pressStanceCard('ready');
  await page.waitForTimeout(2600);
}

await pressStanceCard('low');
// No reload anywhere: the whole point is the live cache update.
const noReload = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().gameStarted === true);
check('no-reload-during-test', noReload, 'match stayed live');

// smoothing(7)/smoothing(13)/smoothing(22) lerps need a moment to converge.
await page.waitForTimeout(2600);
const afterLow = await readState();
const frameB = await rawFrame();

check('storage-updated', afterLow.storedStance === 'low', `stored=${afterLow.storedStance}`);

if (before.armCenter && afterLow.armCenter) {
  const dY = afterLow.armCenter[1] - before.armCenter[1];
  // Authored 'low': drop 0.055 m at the hip. Accept a generous band - the idle
  // clip still animates the skeleton - but ZERO/rising movement is the bug
  // signature this harness exists to catch.
  check('arms-drop-y', dY < -0.01, `dY=${dY.toFixed(4)}m (authored drop 0.055m at hip)`);
} else {
  failures.push('armCenter missing from snapshot().weaponPresentation.armBounds');
}
if (before.rootRotation && afterLow.rootRotation) {
  const dYaw = afterLow.rootRotation[1] - before.rootRotation[1];
  check('viewmodel-yaw-shifted', Math.abs(dYaw) > 0.02, `dYaw=${dYaw.toFixed(4)}rad (authored +0.1)`);
} else {
  failures.push('rootRotation missing from snapshot().weaponPresentation.viewmodelViewport');
}

const pixelDiff = diffPixels(frameA, frameB);
writeFileSync(resolve(OUT, 'before-low.png'), frameA.png);
writeFileSync(resolve(OUT, 'after-low.png'), frameB.png);

// Round-trip: selecting Weapon Ready returns the RIGID viewmodel root to its
// baseline, live. Root Y is owned by bob/breath/stance; stance is the only
// centimetre-scale term, so 0.03 m and 0.05 rad are honest bands.
await pressStanceCard('ready');
await page.waitForTimeout(2600);
const afterReady = await readState();
let roundTrip = null;
if (before.rootPosition && before.rootRotation && afterReady.rootPosition && afterReady.rootRotation) {
  roundTrip = {
    dRootY: Number((afterReady.rootPosition[1] - before.rootPosition[1]).toFixed(4)),
    dYaw: Number((afterReady.rootRotation[1] - before.rootRotation[1]).toFixed(4)),
  };
  check('roundtrip-ready', afterReady.storedStance === 'ready'
    && Math.abs(roundTrip.dRootY) < 0.03 && Math.abs(roundTrip.dYaw) < 0.05,
    `stored=${afterReady.storedStance} ${JSON.stringify(roundTrip)}`);
} else {
  failures.push('viewmodel root telemetry missing for round-trip');
}
const frameC = await rawFrame();
writeFileSync(resolve(OUT, 'back-to-ready.png'), frameC.png);

const summary = {
  gpu,
  backend,
  before,
  afterLow,
  afterReady,
  roundTrip,
  pixelDiffAB: pixelDiff,
  pageErrors: errors,
  failures,
};
writeFileSync(resolve(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ gpu, backend, pixelDiffAB: pixelDiff, roundTrip, failures, pageErrors: errors }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
