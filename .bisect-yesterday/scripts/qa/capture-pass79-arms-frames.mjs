#!/usr/bin/env node
// Gauntlet Pass 79 P1: capture first-person viewmodel frames on REAL WebGPU
// (installed Chrome, CDP focus emulation) so the trigger-hand framing fix is
// judged on what the owner actually sees, not on unit-test geometry.
//
// Usage: node scripts/qa/capture-pass79-arms-frames.mjs [--url http://127.0.0.1:41910]
// Writes PNGs to artifacts/pass79/arms/<name>.png and a summary JSON.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41910');
const OUT = 'artifacts/pass79/arms';
const ARENA = arg('--arena', 'gun-range');
const WEAPON = arg('--weapon', 'carbine');

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
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
const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=pass79arms&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[pass79-arms] backend=${backend}`);
if (backend !== 'webgpu') console.error('[pass79-arms] WARNING: backend is NOT webgpu');

await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
console.error('[pass79-arms] match active');

// Give the weapon/viewmodel a beat to settle after match start.
await page.evaluate((weapon) => { window.__ATOMIC_ACRES_DEBUG__.equipWeapon(weapon); }, WEAPON);
await page.waitForTimeout(2500);

const shots = [];
async function snap(name) {
  const path = resolve(`${OUT}/${name}.png`);
  await page.screenshot({ path });
  shots.push(name);
  console.error(`[pass79-arms] captured ${name}`);
}

await snap('01-hip-idle');

// ADS hold.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setAds(true); });
await page.waitForTimeout(1200);
await snap('02-ads');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setAds(false); });
await page.waitForTimeout(800);

// Mid-reload pose.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(0.45); });
await page.waitForTimeout(600);
await snap('03-reload-mid');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setReloadCaptureProgress(null); });
await page.waitForTimeout(400);

// Bot in frame, frozen, for per-skin animation/presentation checks.
// placeBotAhead restages the EXISTING solo bot pool; clearing it first is why
// every prior run captured an empty lane and returned null.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
const placed = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(6)).catch(() => null);
await page.waitForTimeout(1800);
await snap('04-bot-ahead');

// Measure, do not guess: project both rigged hands into NDC and read the
// ammo panel's on-screen rect, so "trigger hand under the ammo panel" is a
// number, not an impression. Camera comes from the live scene graph.
const framing = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const telemetry = api.samplePresentationTelemetry();
  const scene = api.sampleSceneGraph();
  let camera = null;
  scene.traverse((node) => { if (!camera && node.isCamera) camera = node; });
  if (!camera) return { error: 'no camera in scene graph' };
  const hands = {};
  for (const arm of telemetry?.riggedArms ?? []) {
    hands[arm.side] = { world: arm.hand };
  }
  // Project with a scratch Vector3 borrowed from the camera's own class.
  const vectorClass = camera.position.constructor;
  for (const side of Object.keys(hands)) {
    const [x, y, z] = hands[side].world;
    const projected = new vectorClass(x, y, z).project(camera);
    hands[side].ndc = [projected.x, projected.y];
  }
  const panel = document.querySelector('#weapon-block')?.getBoundingClientRect?.() ?? null;
  const panelNdc = panel ? {
    x: [((panel.left / innerWidth) * 2) - 1, ((panel.right / innerWidth) * 2) - 1],
    y: [1 - (panel.bottom / innerHeight) * 2, 1 - (panel.top / innerHeight) * 2],
  } : null;
  return {
    hands,
    ammoPanelNdc: panelNdc,
    viewport: [innerWidth, innerHeight],
    rootPosition: telemetry?.framing?.rootPosition ?? null,
  };
}).catch((error) => ({ error: String(error).slice(0, 300) }));

// Per-skin animation differentiation: place four bots (the match cycles the
// four catalog skins) and read each live operator's assigned skin plus the
// animation director profile it actually drives. If every director resolves
// the same profile, per-skin animation is NOT differentiating on live bots.
const perSkin = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  api.setBotsFrozen(true);
  const placed = [];
  for (let index = 0; index < 4; index += 1) {
    const bot = api.placeBotAhead ? api.placeBotAhead(6) : null;
    if (bot) placed.push(bot.bot.id);
  }
  const rows = [];
  api.sampleSceneGraph().traverse((node) => {
    const runtimeState = node.userData?.riggedOperatorRuntime;
    if (!runtimeState?.director || placed.length === 0) return;
    const name = String(node.name ?? '');
    if (!placed.some((id) => name.includes(id))) return;
    rows.push({
      operator: name,
      skinId: String(node.userData.operatorSkinId ?? '(unset)'),
      profileId: runtimeState.director.profile?.id ?? null,
      archetype: runtimeState.director.profile?.archetype ?? null,
      idleClip: runtimeState.director.profile?.idleClip ?? null,
      spinePitchRadians: runtimeState.director.profile?.postureBias?.spinePitchRadians ?? null,
      currentBase: runtimeState.currentBase ?? null,
    });
  });
  return { placed, rows };
}).catch((error) => ({ error: String(error).slice(0, 300) }));
await page.waitForTimeout(2500);
await snap('06-bot-per-skin');

// Sprint pose for arm motion check.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(true, true); });
await page.waitForTimeout(1500);
await snap('05-sprint');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setMovement(false, false); });

const summary = {
  backend, arena: ARENA, weapon: WEAPON, shots, errors: [...new Set(errors)].slice(0, 8),
  framing, perSkin,
};
writeFileSync(resolve(`${OUT}/capture-summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ backend, arena: ARENA, shots, errorCount: errors.length }, null, 2));
