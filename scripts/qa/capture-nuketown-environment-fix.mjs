#!/usr/bin/env node
/**
 * Nuke Town environment fix evidence (2026-08-31).
 *
 * Matched before/after capture + measurement for the four measured environment
 * problems (inverted mountains, sphere-on-a-stick Quality trees, unreachable
 * vegetation, forest standing on a flat plate).
 *
 * Everything here is deterministic on purpose: `setCaptureCameraPose` is driven
 * with a FIXED visual time and seed, so the sky, clouds and wind are byte-for-
 * byte the same pose-to-pose and run-to-run. A "before" set and an "after" set
 * are therefore directly comparable pixel-for-pixel.
 *
 * The ridge/sky luminance ratio is measured by DIFFERENCING, not by guessing a
 * horizon row: each ridge view is rendered twice, once normally and once with
 * the backdrop group hidden. The pixels that changed ARE the backdrop; their
 * mean luminance is the ridge, and the mean luminance of those same pixels in
 * the backdrop-hidden frame is the sky the ridge covers. Ratio = ridge / sky.
 *
 * Chrome only: Playwright's bundled Chromium cannot acquire a WebGPU device on
 * dave-gaming-pc (dxil.dll Windows Error 87), so `channel: 'chrome'` is not
 * optional. `--mute-audio` is mandatory for every browser this repo launches.
 *
 * Usage: node scripts/qa/capture-nuketown-environment-fix.mjs --label before
 *        [--url http://127.0.0.1:41932] [--out docs/assets/nuketown-environment-fix-2026-08-31]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41932');
const LABEL = arg('--label', 'after');
const OUT = resolve(process.cwd(), arg('--out', 'docs/assets/nuketown-environment-fix-2026-08-31'));
mkdirSync(OUT, { recursive: true });

/** Fixed visual clock + seed: identical sky/cloud/wind phase in every frame. */
const FIXED_TIME_MS = 42_000;
const SEED = 82_031;

/** forward = (-sin yaw, 0, -cos yaw) — the repo's camera convention. */
const yawToward = (x, z, lookX, lookZ) => Math.atan2(-(lookX - x), -(lookZ - z));

const SHOTS = [
  // 1. What he plays: eye level down the street axis (the arena review camera).
  { name: '1-lane', x: -27, y: 1.7, z: 0, lookX: 34, lookZ: 0, pitch: -0.02 },
  // 2. Eye-level horizon over the north fence: ridge behind the forest ring.
  { name: '2-horizon', x: 0, y: 1.7, z: -20, lookX: 0, lookZ: -90, pitch: 0.05 },
  // 3. Kneeling on the north lawn beside a house wall.
  { name: '3-grass', x: 0, y: 0.92, z: -18, lookX: -3.5, lookZ: -21.5, pitch: -0.36 },
  // 4. Standing off the east yard tree at (13, -27.5) with the massif behind it.
  { name: '4-tree', x: 17, y: 1.62, z: -24.2, lookX: 13, lookZ: -27.5, pitch: 0.18 },
  // 4b. The north-west yard tree from the side, whole silhouette against sky.
  { name: '4b-tree-side', x: -13.5, y: 1.62, z: -25.5, lookX: -9, lookZ: -28.5, pitch: 0.16 },
  // 5. Where the forest meets the ground. It HAS to be an elevated pose: the
  //    boundary wall is 3.1 m and from inside the fence the forest floor is
  //    not visible at all, which is half of the owner's problem 3.
  { name: '5-forest-contact', x: 0, y: 6.5, z: -27, lookX: 0, lookZ: -48, pitch: -0.16 },
  // 6. Ridge meter: raised clean of the canopy so the massif meets open sky.
  { name: '6-ridge-meter', x: 0, y: 11, z: -8, lookX: 0, lookZ: -90, pitch: 0.02 },
  // 7. Second ridge meter on the opposite bearing (different ridge segments).
  { name: '7-ridge-meter-south', x: 0, y: 11, z: 8, lookX: 0, lookZ: 90, pitch: 0.02 },
];

/** Roots whose draw/triangle cost this pass is accountable for. */
const OWNED_ROOTS = [
  'nuketown-mountain-backdrop',
  'nuketown-forest-surround',
  'nuketown-lawn',
  'nuketown-yard-vegetation',
];

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--mute-audio',
    // Uncapped presentation: with vsync on, every pacing sample reads 16.7 ms
    // and the frame-cost question cannot be answered at all.
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
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
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=envfix&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
// Bots OFF before a single frame is taken. The first pass of these captures
// shipped an "after" grass frame with a red damage vignette across it - a bot
// had shot the player while the capture camera was detached - which made a
// pure colour re-key look like it had gone dry and olive. Evidence frames must
// differ only in what this pass changed.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots?.(); });
await page.waitForTimeout(7_000); // asset streaming + WebGPU pipeline warm-up
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots?.(); });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

// --- inventory: what the environment layers actually cost -------------------
const inventory = await page.evaluate((ownedRoots) => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const triangleCount = (geometry) => {
    if (!geometry) return 0;
    if (geometry.index) return geometry.index.count / 3;
    const position = geometry.getAttribute?.('position');
    return position ? position.count / 3 : 0;
  };
  const layers = {};
  for (const name of ownedRoots) {
    const root = scene.getObjectByName(name);
    if (!root) { layers[name] = { found: false }; continue; }
    let drawCalls = 0;
    let triangles = 0;
    let instances = 0;
    root.traverse((node) => {
      if (!node.isMesh) return;
      drawCalls += 1;
      const count = node.isInstancedMesh ? node.count : 1;
      instances += node.isInstancedMesh ? node.count : 0;
      triangles += triangleCount(node.geometry) * count;
    });
    layers[name] = { found: true, drawCalls, triangles: Math.round(triangles), instances };
  }
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const audit = snapshot?.playableScene?.budgetAudit ?? null;
  return {
    layers,
    budget: audit ? { measured: audit.measured, pass: audit.pass, violations: audit.violations } : null,
    neighbourhoodLife: scene.getObjectByName('pass31-neighbourhood-life')?.userData ?? null,
  };
}, OWNED_ROOTS);

// --- frame pacing at a fixed pose -------------------------------------------
const framePacing = async (tag) => page.evaluate(async () => {
  const samples = [];
  await new Promise((done) => {
    let previous = performance.now();
    let frames = 0;
    const tick = () => {
      const now = performance.now();
      samples.push(now - previous);
      previous = now;
      frames += 1;
      if (frames >= 600) { done(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const sorted = samples.slice(30).sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return { frames: sorted.length, meanMs: Number(mean.toFixed(3)), medianMs: at(0.5), p95Ms: at(0.95), fps: Number((1000 / mean).toFixed(1)) };
});

const pose = async (shot) => {
  const yaw = yawToward(shot.x, shot.z, shot.lookX, shot.lookZ);
  await page.evaluate(({ x, y, z, yaw: yawIn, pitch, time, seed }) => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(x, y, z, yawIn, pitch, undefined, time, seed);
  }, { ...shot, yaw, time: FIXED_TIME_MS, seed: SEED });
  await page.waitForTimeout(1_400);
};

const setBackdropVisible = async (visible) => page.evaluate((show) => {
  // `visible = false` does NOT hold: a per-frame presentation pass re-shows
  // scene meshes, so the backdrop kept rendering and the "hidden" frame was
  // identical (measured 2026-08-31). Detaching the group from its parent is
  // the only removal that survives a frame; the handle is stashed on window.
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  if (!show) {
    const root = scene.getObjectByName('nuketown-mountain-backdrop');
    if (!root) return false;
    window.__ENV_FIX_BACKDROP__ = { root, parent: root.parent };
    root.parent.remove(root);
    return true;
  }
  const stash = window.__ENV_FIX_BACKDROP__;
  if (!stash) return false;
  stash.parent.add(stash.root);
  window.__ENV_FIX_BACKDROP__ = null;
  return true;
}, visible);

const readPixels = async (buffer) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Ridge = the pixels the backdrop paints over; sky = what is behind them. */
function ridgeSkyRatio(withPng, withoutPng) {
  let ridgeSum = 0;
  let skySum = 0;
  let pixels = 0;
  for (let index = 0; index < withPng.data.length; index += 4) {
    const dr = withPng.data[index] - withoutPng.data[index];
    const dg = withPng.data[index + 1] - withoutPng.data[index + 1];
    const db = withPng.data[index + 2] - withoutPng.data[index + 2];
    if (Math.abs(dr) + Math.abs(dg) + Math.abs(db) < 8) continue; // unchanged
    ridgeSum += luminance(withPng.data[index], withPng.data[index + 1], withPng.data[index + 2]);
    skySum += luminance(withoutPng.data[index], withoutPng.data[index + 1], withoutPng.data[index + 2]);
    pixels += 1;
  }
  if (pixels === 0) return { pixels: 0, ridgeLuminance: null, skyLuminance: null, ratio: null };
  const ridgeLuminance = ridgeSum / pixels;
  const skyLuminance = skySum / pixels;
  return {
    pixels,
    coveragePercent: Number(((pixels / (withPng.width * withPng.height)) * 100).toFixed(2)),
    ridgeLuminance: Number(ridgeLuminance.toFixed(2)),
    skyLuminance: Number(skyLuminance.toFixed(2)),
    ratio: Number((ridgeLuminance / skyLuminance).toFixed(3)),
  };
}

const results = { label: LABEL, backend, base: BASE, fixedTimeMs: FIXED_TIME_MS, seed: SEED, inventory, shots: {}, ridgeSky: {} };

for (const shot of SHOTS) {
  await pose(shot);
  const buffer = await page.screenshot();
  writeFileSync(resolve(OUT, `${LABEL}-${shot.name}.png`), buffer);
  results.shots[shot.name] = { pose: { ...shot, yaw: yawToward(shot.x, shot.z, shot.lookX, shot.lookZ) } };

  if (shot.name.includes('ridge-meter') || shot.name === '2-horizon') {
    await setBackdropVisible(false);
    await page.waitForTimeout(700);
    const withoutBuffer = await page.screenshot();
    writeFileSync(resolve(OUT, `${LABEL}-${shot.name}-no-backdrop.png`), withoutBuffer);
    await setBackdropVisible(true);
    await page.waitForTimeout(500);
    results.ridgeSky[shot.name] = ridgeSkyRatio(await readPixels(buffer), await readPixels(withoutBuffer));
  }
}

// Pace at the lane pose: the view he actually plays from.
await pose(SHOTS[0]);
results.framePacing = { '1-lane': await framePacing('1-lane') };
await pose(SHOTS[1]);
results.framePacing['2-horizon'] = await framePacing('2-horizon');

results.errors = errors;
results.capturedAt = new Date().toISOString();
writeFileSync(resolve(OUT, `${LABEL}-measurements.json`), `${JSON.stringify(results, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({
  label: LABEL,
  backend,
  layers: inventory.layers,
  budget: inventory.budget?.measured ? { drawCalls: inventory.budget.measured.drawCalls, triangles: inventory.budget.measured.triangles, pass: inventory.budget.pass } : null,
  ridgeSky: results.ridgeSky,
  framePacing: results.framePacing,
  errors: errors.slice(0, 5),
}, null, 2));
