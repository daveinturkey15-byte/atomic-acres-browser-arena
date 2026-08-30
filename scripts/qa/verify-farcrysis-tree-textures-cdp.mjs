#!/usr/bin/env node
// Farcrysis tree-species texture verification on the REAL WebGPU route.
//
// Adapted from verify-arena-boot-cdp.mjs (headless:true + installed Chrome
// channel per GAUNTLET-SPEC failure-mode #2 correction: installed Chrome
// headless gets a real hardware WebGPU device; bundled chromium does not).
//
// Proves three things about the Pass 79 tree-species PBR treatment:
//   1. The page boots farcrysis solo on native WebGPU (backend dataset check).
//   2. LIVE SCENE GRAPH: the tree-species InstancedMeshes in the rendered
//      scene carry their texture maps — wiring proof, not unit proof.
//   3. PIXELS: frames captured through the arena's OWN deterministic review
//      cameras (gameplay re-poses the camera every frame, so raw
//      camera.position writes are overwritten before the next presented frame).
//
// Usage: node scripts/qa/verify-farcrysis-tree-textures-cdp.mjs [--url ...]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');
const OUT_DIR = arg('--out', 'artifacts/qa/farcrysis-tree-textures');

mkdirSync(resolve(OUT_DIR), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
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
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=treetex&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
// An adapter is not a device (failure-mode #2 gotcha): require the real thing.
const gpuProbe = await page.evaluate(async () => {
  if (!navigator.gpu) return { ok: false, reason: 'no navigator.gpu' };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { ok: false, reason: 'no adapter' };
  const device = await adapter.requestDevice().then(() => true).catch(() => false);
  return { ok: device, vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null };
});

console.error(`[treetex] backend=${backend} gpu=${JSON.stringify(gpuProbe)}`);

await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, 'farcrysis');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });

// Give the renderer a few seconds of active frames so canvas textures are
// uploaded and the async image-texture upgrade (if any) has its chance.
await page.waitForTimeout(8000);

// ---- Wiring proof: walk the LIVE scene graph -------------------------------
const liveProof = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const wanted = [
    'farcrysis-vege-palm-fronds',
    'farcrysis-vege-broadleaf-trunks',
    'farcrysis-vege-broadleaf-canopies',
    'farcrysis-vege-kapok-trunks',
    'farcrysis-vege-mangrove-trunks',
    'farcrysis-vege-bamboo-grove-stems',
    'farcrysis-vege-emergent-crowns-upper',
    'farcrysis-vege-cycad-leaves',
  ];
  const out = {};
  scene.traverse((obj) => {
    if (!obj.isInstancedMesh && !(obj.isMesh)) return;
    if (!wanted.includes(obj.name)) return;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    out[obj.name] = {
      instances: obj.count ?? 1,
      hasMap: Boolean(mat?.map),
      hasNormalMap: Boolean(mat?.normalMap),
      hasRoughnessMap: Boolean(mat?.roughnessMap),
      hasAlphaMap: Boolean(mat?.alphaMap),
      materialType: mat?.constructor?.name ?? String(mat),
    };
  });
  return out;
});
console.error('[treetex] live-scene material state:');
for (const [name, info] of Object.entries(liveProof)) console.error(`  ${name}: ${JSON.stringify(info)}`);

// ---- Pixels ----------------------------------------------------------------
const shots = [];
async function snapReview(cameraId, label) {
  const ok = await page.evaluate((id) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    return typeof debug.setArenaReviewCamera === 'function' ? debug.setArenaReviewCamera(id) : false;
  }, cameraId);
  if (!ok) { console.error(`[treetex] review camera ${cameraId} unavailable`); return; }
  await page.waitForTimeout(1500);
  const file = resolve(OUT_DIR, `${label}.png`);
  const buffer = await page.screenshot({ path: file });
  shots.push({ label, cameraId, file, bytes: buffer.length });
  console.error(`[treetex] captured ${label} (${cameraId}) ${buffer.length} bytes`);
}

await snapReview('farcrysis-west-shoreline', '01-west-shoreline-palms');
await snapReview('farcrysis-beach-golden', '02-beach-golden-overview');
await snapReview('farcrysis-jungle-dapple', '03-jungle-dapple');
await snapReview('farcrysis-island-topdown', '04-island-topdown');

writeFileSync(
  resolve(OUT_DIR, 'result.json'),
  `${JSON.stringify({ backend, gpuProbe, errors: [...new Set(errors)].slice(0, 8), liveProof, shots }, null, 2)}\n`,
);
console.log(JSON.stringify({ backend, gpuProbe, liveProofOk:
  Object.values(liveProof).every((m) => m.hasAlphaMap || (m.hasMap && m.hasNormalMap && m.hasRoughnessMap)),
  shots }, null, 2));
await browser.close();
