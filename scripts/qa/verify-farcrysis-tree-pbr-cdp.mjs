#!/usr/bin/env node
// Farcrysis tree-species PBR verification (Pass 79 lane: HF-396/398).
//
// Copy of the boot pattern in scripts/qa/verify-arena-boot-cdp.mjs, extended to:
//   1. Prove the REAL WebGPU device (adapter.info.vendor, not just navigator.gpu),
//   2. Walk the LIVE scene graph and report every farcrysis-vege-* tree-species
//      mesh's material texture slots (map / normalMap / roughnessMap) —
//      "wired at runtime" proof, not a unit-test claim,
//   3. Teleport to tree vantage points and CAPTURE FRAMES for visual reading.
//
// Usage:
//   node scripts/qa/verify-farcrysis-tree-pbr-cdp.mjs [--url http://127.0.0.1:41910]
//
// Installed Chrome headless:true gets a real hardware WebGPU device on this
// machine (GAUNTLET-SPEC failure-mode 2 correction, measured 2026-08-25) and
// needs no governor browser slot.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
// Pin served bundle identity: a sibling agent rebuilding dist-gauntlet mid-sweep
// otherwise serves mixed assets and invalidates the measurement silently.
const servedBundle = () => page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-') || name.includes('/farcrysis-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
}).catch(() => null);

 const errors = [];
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BUNDLE_AT_START = await servedBundle();
if (!BUNDLE_AT_START) throw new Error('could not pin served bundle identity');
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11',
const BUNDLE_NOW = await servedBundle();
if (BUNDLE_NOW !== BUNDLE_AT_START) {
  console.error(`[tree-pbr] INVALID — served bundle changed mid-run (${BUNDLE_AT_START} -> ${BUNDLE_NOW})`);
  writeFileSync(resolve(OUT_DIR, 'environment.json'), JSON.stringify({ backend, gpuProbe, invalid: true }, null, 2));
  await browser.close();
  process.exit(3);
}
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

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=treepbr&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

// An adapter is not a device (spec gotcha): call requestDevice() and check vendor.
const gpuProbe = await page.evaluate(async () => {
  if (!navigator.gpu) return { ok: false, reason: 'no navigator.gpu' };
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { ok: false, reason: 'no adapter' };
  let device = null;
  try { device = await adapter.requestDevice(); } catch (e) { return { ok: false, reason: `requestDevice threw: ${e}` }; }
    // Duplicate names mean two arena copies exist; record how many were seen.
    const row = rows.get(key) ?? { mesh: key, instances: 0, isInstanced: obj.isInstancedMesh === true, seen: 0 };
    row.seen += 1;
  const out = {
    ok: Boolean(device) && String(info.vendor || '').toLowerCase() !== 'microsoft',
    vendor: info.vendor ?? null,
    architecture: info.architecture ?? null,
    description: info.description ?? null,
    hadDevice: Boolean(device),
  };
  device?.destroy?.();
  return out;
});
console.error(`[tree-pbr] backend=${backend} gpu=${JSON.stringify(gpuProbe)}`);

if (backend !== 'webgpu' || !gpuProbe.ok) {
  console.error('[tree-pbr] FAIL — not on real hardware WebGPU; refusing to record frames as evidence');
  writeFileSync(resolve(OUT_DIR, 'environment.json'), JSON.stringify({ backend, gpuProbe, errors }, null, 2));
  await browser.close();
  process.exit(2);
}

await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, 'farcrysis');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 240_000 });

// Give the first rendered frames time to settle (async pipeline compile etc.).
await page.waitForTimeout(4000);

// --- Live scene-graph wiring proof -----------------------------------------
const vegeReport = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const rows = new Map();
  scene.traverse((obj) => {
    const name = String(obj.name || '');
    if (!name.startsWith('farcrysis-vege-')) return;
    const mat = obj.material;
    if (!mat) return;
    const key = name;
    const row = rows.get(key) ?? { mesh: key, instances: 0, isInstanced: obj.isInstancedMesh === true };
    row.instances += obj.isInstancedMesh ? obj.count : 1;
    // Record the FINAL live material state (after TSL conversion + textures).
    row.materialType = mat.type ?? mat.constructor?.name ?? 'unknown';
    row.isNodeMaterial = mat.isNodeMaterial === true;
    row.hasMap = !!mat.map;
    row.mapName = mat.map?.name || (mat.map ? '(canvas)' : null);
    row.hasNormalMap = !!mat.normalMap;
    row.hasRoughnessMap = !!mat.roughnessMap;
    rows.set(key, row);
  });
  return [...rows.values()];
});

const TREE_RE = /(broadleaf|fan-palms|banana|bamboo-stems|dead-trunks|kapok|coconut-trunks|mangrove|bamboo-grove-stems|cycad|bloom|emergent)/;
const treeRows = vegeReport.filter((r) => TREE_RE.test(r.mesh));
const missingMaps = treeRows.filter((r) => !(r.hasMap && r.hasNormalMap && r.hasRoughnessMap));
console.error(`[tree-pbr] tree-species meshes=${treeRows.length} with-full-PBR=${treeRows.length - missingMaps.length} missing=${missingMaps.length}`);
for (const row of treeRows.sort((a, b) => a.mesh.localeCompare(b.mesh))) {
  console.error(`[tree-pbr]   ${row.mesh} inst=${row.instances} type=${row.materialType}${row.isNodeMaterial ? '/node' : ''} map=${row.hasMap ? row.mapName : 'NONE'} nrm=${row.hasNormalMap} rgh=${row.hasRoughnessMap}`);
}
for (const row of missingMaps) console.error(`[tree-pbr] MISSING-PBR ${row.mesh}`);

// --- Frame capture at tree vantage points -----------------------------------
// farcrysis island is +/-32 m square shore (HF-396 grew bounds to +/-64 but the
// playfield shoreline convention here is ARENA_HALF=32 per terrain authority).
// Spawns sit NW (-26,-26)...(-18,-26) and SE (26,26)...(18,26); avoid staring
// straight into spawn cover. yaw=0 faces -Z (three.js camera convention).
const VANTAGES = [
  { name: 'jungle-interior-canopy', x: -4, y: 1.7, z: -10, yaw: Math.PI * 0.25, pitch: 0.15 },
  { name: 'jungle-upward-canopy', x: 6, y: 1.7, z: 4, yaw: -Math.PI * 0.5, pitch: 0.55 },
  { name: 'beach-palms-inward', x: 24, y: 1.7, z: -18, yaw: Math.PI * 0.75, pitch: 0.05 },
  { name: 'midstorey-corridor', x: 0, y: 1.7, z: 14, yaw: Math.PI, pitch: 0.1 },
];

for (const spot of VANTAGES) {
  await page.evaluate(({ x, y, z, yaw, pitch }) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, spot);
  await page.waitForTimeout(1200); // let wind/TSL frame settle at the new pose
  const path = resolve(OUT_DIR, `${spot.name}.png`);
  await page.screenshot({ path });
  console.error(`[tree-pbr] captured ${spot.name} -> ${path}`);
}

const summary = {
  backend,
  gpuProbe,
  treeMeshCount: treeRows.length,
  fullPbrCount: treeRows.length - missingMaps.length,
  missingPbrMeshes: missingMaps.map((r) => r.mesh),
  pageErrors: [...new Set(errors)].slice(0, 8),
};
writeFileSync(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
console.error(`[tree-pbr] SUMMARY ${JSON.stringify(summary)}`);

await browser.close();
process.exit(missingMaps.length === 0 && summary.pageErrors.length === 0 ? 0 : 1);
