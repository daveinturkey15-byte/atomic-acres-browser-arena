#!/usr/bin/env node
// Lane-local visual verification for the Pass 79 farcrysis tree-species PBR
// treatment (farcrysis-tree-materials gate). Adapted from
// verify-arena-boot-cdp.mjs: INSTALLED Chrome (channel:'chrome') headless gets
// a real hardware WebGPU device and needs no headed browser slot.
//
// Boots farcrysis on the real WebGPU route, proves the tree materials carry
// maps on the LIVE scene graph, then TELEPORTS next to real instanced tree
// positions (read out of the live InstancedMesh matrices) and captures
// close-up frames so the bark/leaf treatment can be read by eye.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41988');
const OUT = arg('--outDir', 'artifacts/qa/farcrysis-trees');
mkdirSync(resolve(OUT), { recursive: true });

const browser = await chromium.launch({
  headless: true,
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
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=treecap&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[tree-cap] backend=${backend}`);
if (backend !== 'webgpu') {
  console.error('[tree-cap] FATAL: not on the WebGPU route — evidence would be invalid');
  process.exit(2);
}

const adapterInfo = await page.evaluate(async () => {
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    await adapter.requestDevice();
    return { vendor: adapter.info?.vendor ?? null, architecture: adapter.info?.architecture ?? null };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
});
console.error(`[tree-cap] adapter=${JSON.stringify(adapterInfo)}`);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
console.error('[tree-cap] farcrysis active');

// Arena presentation attaches ASYNC after match start — a fixed wait races
// (one run saw 23 vege meshes, the next 0). Poll the live graph instead.
await page.waitForFunction(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  if (!scene) return false;
  let vege = 0;
  scene.traverse((o) => { if (o.isMesh && String(o.name).startsWith('farcrysis-vege-')) vege++; });
  return vege > 20;
}, undefined, { timeout: 180_000, polling: 1000 });
console.error('[tree-cap] arena vegetation attached');
await page.waitForTimeout(6_000); // let compile/admission settle before reading

const liveProof = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const re = /^farcrysis-vege-(broadleaf|fan-palms|banana|bamboo-stems|dead-trunks|kapok|coconut-trunks|mangrove|bamboo-grove-stems|cycad|bloom|emergent|midstorey)/;
  let sampled = 0; let textured = 0;
  const anchors = {};
  scene?.traverse((obj) => {
    if (!obj.isMesh || !re.test(obj.name)) return;
    sampled += 1;
    const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (mat && mat.map && mat.normalMap && mat.roughnessMap) textured += 1;
    // Instance 0 translation lives at elements [12,13,14] of the matrix array.
    const family = obj.name.replace(/^farcrysis-vege-/, '');
    if (!anchors[family] && obj.count > 0 && obj.instanceMatrix?.array) {
      const t = obj.instanceMatrix.array;
      anchors[family] = { x: t[12], y: t[13], z: t[14], count: obj.count };
    }
  });
  return { sampled, textured, anchors };
});
console.error(`[tree-cap] live tree meshes sampled=${liveProof.sampled} fully-textured=${liveProof.textured}`);

async function shot(name) {
  const path = resolve(OUT, name);
  await page.waitForTimeout(900); // let TSL wind/compile settle after teleport
  await page.screenshot({ path });
  console.error(`[tree-cap] captured ${path}`);
}

// Close-ups: stand ~4 m from each anchor, look slightly up at trunk/canopy.
const anchors = liveProof.anchors ?? {};
const targets = [
  ['broadleaf-trunks', 'trunk-broadleaf', 4.2, 0.28],
  ['kapok-trunks', 'trunk-kapok', 4.6, 0.3],
  ['coconut-trunks', 'trunk-coconut', 4.2, 0.35],
  ['banana-leaves', 'leaves-banana', 3.2, 0.1],
  ['broadleaf-canopies', 'canopy-broadleaf', 6.0, 0.55],
  ['emergent-crowns-lower', 'crowns-emergent', 7.0, 0.5],
];
for (const [family, label, dist, pitch] of targets) {
  const a = anchors[family];
  if (!a) { console.error(`[tree-cap] no live anchor for ${family}`); continue; }
  await page.evaluate(({ a, dist, pitch }) => {
    const dbg = window.__ATOMIC_ACRES_DEBUG__;
    const ex = a.x + dist;
    const ez = a.z + dist;
    // Yaw so the camera faces the anchor (game yaw basis: atan2(dx, dz)).
    const yaw = Math.atan2(a.x - ex, a.z - ez);
    dbg.teleportPlayer(ex, a.y + 1.4, ez, yaw, pitch);
  }, { a, dist, pitch });
  await shot(`close-${label}.png`);
}

writeFileSync(
  resolve(OUT, 'capture-evidence.json'),
  `${JSON.stringify({ backend, adapterInfo, liveProof, errors: [...new Set(errors)].slice(0, 8) }, null, 2)}\n`,
);
console.log(JSON.stringify({ backend, adapterInfo, texturedTreeMeshes: liveProof.textured, sampledMeshes: liveProof.sampled }, null, 2));
await browser.close();
