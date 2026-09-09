#!/usr/bin/env node
// Below-deck LUMINANCE evidence for High Seas (Hijacked) - real WebGPU.
//
// WHY THIS EXISTS SEPARATELY FROM capture-below-deck.mjs
// -----------------------------------------------------
// capture-below-deck.mjs derives its PASS/FAIL from a teleport readback
// (`landed.position[1] < 0.5`). That readback succeeds whether or not a single
// frame was ever presented: the player object moves on the simulation side, so
// the script reports PASS against a black or never-rendered canvas. It answers
// "did the floor hold" and nothing else, and it boots `renderer=webgl2`, which
// is not the route the owner plays.
//
// This harness refuses to report anything until it has proven, mechanically:
//   1. the backend actually negotiated is WebGPU (not a silent WebGL2 fallback),
//   2. the match is active AND frameCount is still ADVANCING (frames are being
//      produced right now, at this station, not merely once at boot),
//   3. the player is standing where we asked, within tolerance, on the floor.
// Only then does it keep the frame. Any station that fails a precondition is
// recorded as UNMEASURED - never as a pass.
//
// The measured quantity is the rendered pixel, not a scene-graph guess:
// screenshots go to disk and scripts/qa/report-below-deck-luminance.mjs turns
// them into linear-luminance numbers using the same sRGB decode and the same
// HUD-avoiding crop convention as measure-pass29-luminance.py.
//
// Usage:
//   node scripts/qa/measure-below-deck-luminance.mjs --label before
//   node scripts/qa/measure-below-deck-luminance.mjs --label after --url http://127.0.0.1:41882
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OFFSCREEN_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const LABEL = arg('--label', 'before');
const RENDERER = arg('--renderer', 'webgpu');
const SETTLE_MS = Number(arg('--settle', '6000'));
const STATION_MS = Number(arg('--station-settle', '1400'));
const BOOT_MS = Number(arg('--boot', '300000'));
const HEADLESS = argv.includes('--headless');
const OUT = resolve(process.cwd(), arg('--out', `artifacts/qa/below-deck-luminance/${LABEL}`));

// Service-deck stations. Same seven the owner-facing capture walks, at the same
// eye height (1.7 m above the corridor floor plane at y=0), plus two that put a
// walkable surface and a corridor-range silhouette test squarely in frame.
const STATIONS = [
  { id: 'bow-ramp-foot', pos: [0, 1.7, -18.5], yaw: Math.PI, note: 'looking down the corridor from the bow entry' },
  { id: 'corridor-forward', pos: [0, 1.7, -12], yaw: Math.PI, note: 'cramped one-man corridor' },
  { id: 'engine-room', pos: [0, 1.7, 0], yaw: Math.PI, note: 'mid-ship engine room bulge' },
  { id: 'engine-room-look-back', pos: [0, 1.7, 2], yaw: 0, note: 'engine room toward the bow' },
  { id: 'corridor-aft', pos: [0, 1.7, 12], yaw: 0, note: 'aft corridor run' },
  { id: 'stern-ramp-foot', pos: [0, 1.7, 18.5], yaw: 0, note: 'stern entry, looking forward' },
  { id: 'floor-check-down', pos: [0, 1.7, -6], yaw: Math.PI, pitch: -1.1, note: 'the deck plate under our own feet' },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: HEADLESS,
  channel: 'chrome',
  args: [...OFFSCREEN_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const fail = async (reason, extra = {}) => {
  await browser.close().catch(() => {});
  console.log(JSON.stringify({ verdict: 'UNMEASURED', label: LABEL, reason, ...extra }, null, 2));
  process.exit(2);
};

// No `?release=latest` on a dev server: it triggers a navigation that destroys
// the evaluate context mid-run.
await page.goto(`${BASE}/?renderer=${RENDERER}&render=quality&seed=below-deck&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_MS });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
if (RENDERER === 'webgpu' && backend !== 'webgpu') {
  await fail(`requested WebGPU but the page negotiated "${backend}" - measuring the wrong route`, { backend });
}

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: BOOT_MS });
await page.waitForTimeout(SETTLE_MS);

// Bots walking through frame are a light source (muzzle flash) and an occluder.
// Freeze them so the number describes the room, not the traffic.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); });

const frames = () => page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount);
const framesAdvancing = async (windowMs = 500) => {
  const first = await frames();
  await page.waitForTimeout(windowMs);
  const second = await frames();
  return { first, second, advancing: second > first };
};

const boot = await framesAdvancing(700);
if (!boot.advancing) {
  await fail('frameCount did not advance after the match went active - nothing is being rendered', { boot });
}

// What is actually in the scene graph below the deck plane? This is context for
// the pixel numbers, not a substitute for them.
const lightCensus = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const out = [];
  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    if (!node.isLight) return;
    // World position straight off the matrix - no THREE import needed in-page.
    const e = node.matrixWorld.elements;
    out.push({
      name: node.name || node.type,
      type: node.type,
      intensity: node.intensity,
      distance: node.distance ?? null,
      decay: node.decay ?? null,
      color: node.color?.getHex?.() ?? null,
      world: [e[12], e[13], e[14]].map((v) => Number(v.toFixed(2))),
      worldY: Number(e[13].toFixed(2)),
      castShadow: node.castShadow === true,
    });
  });
  return out;
});

const report = [];
for (const station of STATIONS) {
  const record = { ...station, measured: false };
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...station.pos, station.yaw, station.pitch ?? 0]);
  await page.waitForTimeout(STATION_MS);

  const live = await framesAdvancing(400);
  const landed = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      position: snapshot.player.position.map((value) => Number(value.toFixed(2))),
      alive: snapshot.player.alive,
    };
  });

  const dx = Math.abs(landed.position[0] - station.pos[0]);
  const dz = Math.abs(landed.position[2] - station.pos[2]);
  const fellThrough = landed.position[1] < 0.5;
  const drifted = dx > 1.5 || dz > 1.5;

  const file = resolve(OUT, `${station.id}.png`);
  await page.screenshot({ path: file });

  record.landed = landed;
  record.frames = live;
  record.fellThrough = fellThrough;
  record.drifted = drifted;
  record.file = file;
  // A station only counts as measured when frames were being produced WHILE the
  // player stood there, on the floor, at the asked-for spot.
  record.measured = live.advancing && !fellThrough && !drifted && landed.alive !== false;
  record.unmeasuredReason = record.measured
    ? null
    : [
      live.advancing ? null : 'frames not advancing',
      fellThrough ? 'fell through the floor' : null,
      drifted ? `drifted ${dx.toFixed(2)}/${dz.toFixed(2)} m from the station` : null,
      landed.alive === false ? 'player not alive' : null,
    ].filter(Boolean).join('; ');

  console.error(`[below-deck ${LABEL}] ${station.id}: y=${landed.position[1]} frames ${live.first}->${live.second} ${record.measured ? 'MEASURED' : `UNMEASURED (${record.unmeasuredReason})`}`);
  report.push(record);
}

await browser.close();

const payload = {
  verdict: report.every((entry) => entry.measured) ? 'MEASURED' : 'PARTIAL',
  label: LABEL,
  backend,
  url: `${BASE}/?renderer=${RENDERER}&render=quality&seed=below-deck&previewTime=0`,
  bootFrames: boot,
  belowDeckLightCensus: lightCensus.filter((entry) => entry.worldY < 3.2),
  sceneLightCount: lightCensus.length,
  pageErrors: [...new Set(errors)].slice(0, 6),
  stations: report,
};
writeFileSync(resolve(OUT, 'stations.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify(payload, null, 2));
