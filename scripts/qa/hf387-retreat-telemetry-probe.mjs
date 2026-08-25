#!/usr/bin/env node
// HF-387 live measurement: honest viewmodel retreat telemetry on real WebGPU.
//
// Boots the dist-hf387 candidate bundle in INSTALLED Chrome (headless gets a
// real hardware WebGPU device here), deploys solo on gun-range, then walks the
// canonical west-wall contact fixture from
// tests/e2e/pass69-3-authored-near-plane-catalog.spec.ts CONTACT_FIXTURE
// ('gun-range-west-wall-prone-pose-v2', prone FIRST, then teleport to
// (-19.65, 1.7, -14.5), yaw PI/2; controller settles at eye height ~0.636).
// It records presentationState() retreat telemetry at three poses and captures
// a frame per pose.
//
// Usage: node scripts/qa/hf387-retreat-telemetry-probe.mjs [--url ...]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:42187');

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf387&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
const gpuInfo = await page.evaluate(async () => {
  if (!navigator.gpu) return { secureContext: false };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { secureContext: true, adapter: false };
  let device = null;
  try { device = await adapter.requestDevice(); } catch { device = null; }
  return {
    secureContext: window.isSecureContext,
    adapter: true,
    device: Boolean(device),
    vendor: adapter.info?.vendor ?? null,
    architecture: adapter.info?.architecture ?? null,
  };
}).catch((error) => ({ error: String(error) }));
console.error(`[hf387] backend=${backend} gpu=${JSON.stringify(gpuInfo)}`);

mkdirSync(resolve('artifacts/qa/hf387'), { recursive: true });
const shots = [];
async function capture(label) {
  const path = resolve(`artifacts/qa/hf387/${label}.png`);
  await page.screenshot({ path });
  shots.push(path);
}

const sample = () => page.evaluate(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const wp = snapshot.weaponPresentation;
  return {
    surfaceRetreat: wp.surfaceRetreat,
    requestedSurfaceRetreat: wp.requestedSurfaceRetreat ?? null,
    surfaceRetreatCapMeters: wp.surfaceRetreatCapMeters ?? null,
    surfaceRetreatCapped: wp.surfaceRetreatCapped ?? null,
    surfaceLift: wp.surfaceLift,
    wallBlend: wp.contactResponse?.wallBlend ?? null,
    highReadyBlend: wp.contactResponse?.highReadyBlend ?? null,
    scale: wp.contactResponse?.scale ?? null,
    pitchRadians: wp.contactResponse?.pitchRadians ?? null,
    fireAdmission: wp.fireAdmission ? {
      fireBlocked: wp.fireAdmission.fireBlocked,
      blockReason: wp.fireAdmission.blockReason,
    } : null,
    rootPositionZ: wp.viewmodelViewport?.rootPosition?.[2] ?? null,
    weaponNearPlaneClear: wp.weaponFraming?.nearPlaneClear ?? null,
    armsNearPlaneClear: wp.armFraming?.nearPlaneClear ?? null,
    worldPlaneClearance: wp.worldPlaneClearance ?? null,
    playerStance: snapshot.player?.stance ?? null,
    playerPosition: snapshot.player?.position ?? null,
  };
});

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(1200);

const results = {};
results.openFloor = await sample();
await capture('open-floor-standing');

// Canonical gun-range west-wall contact fixture: prone FIRST, then teleport.
await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.setStance('prone');
  api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0);
});
await page.waitForFunction(() => {
  const state = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const position = state.player.position;
  return state.player.stance === 'prone'
    && Array.isArray(position)
    && Math.abs(position[1] - 0.6363) < 0.05;
}, undefined, { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(900);
results.wallProne = await sample();
await capture('wall-prone');

// Wall-adjacent standing at the same spot for the pure wall response.
await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.setStance('stand');
  api.teleportPlayer(-19.65, 1.7, -14.5, Math.PI / 2, 0);
});
await page.waitForTimeout(1200);
results.wallStanding = await sample();
await capture('wall-standing');

results.backend = backend;
results.gpu = gpuInfo;
results.consoleErrors = [...new Set(errors)].slice(0, 6);
results.screenshots = shots;
writeFileSync(resolve('artifacts/qa/hf387/retreat-telemetry.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
await browser.close();
