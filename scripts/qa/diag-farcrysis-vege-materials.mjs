#!/usr/bin/env node
// One-off diagnostic: why do live farcrysis vege materials carry no maps on WebGPU?
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });

await page.goto('http://127.0.0.1:41914/?release=latest&renderer=webgpu&render=quality&seed=diag&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`backend=${backend}`);

// Probe BEFORE arena commit: what does the menu scene look like? Then commit.
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.waitForTimeout(3000);

const report = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const out = {};
  const trunk = scene.getObjectByName('farcrysis-vege-broadleaf-trunks');
  if (trunk) {
    const m = trunk.material;
    out.trunk = {
      ctor: m?.constructor?.name,
      type: m?.type,
      isNodeMaterial: m?.isNodeMaterial === true,
      isMeshStandardMaterial: m?.isMeshStandardMaterial === true,
      isMeshStandardNodeMaterial: m?.isMeshStandardNodeMaterial === true,
      map: m?.map ? (m.map.image ? `canvas ${m.map.image.width}x${m.map.image.height}` : 'map-no-image') : null,
      normalMap: !!m?.normalMap,
      roughnessMap: !!m?.roughnessMap,
      colorHex: m?.color?.getHexString?.() ?? null,
      hasUV: !!trunk.geometry.getAttribute('uv'),
      name: m?.name ?? null,
    };
  } else out.trunk = 'MESH NOT FOUND';

  // Global: which materials anywhere in the scene carry any texture map?
  const mapped = new Map();
  let total = 0;
  scene.traverse((obj) => {
    if (!obj.isMesh && !obj.isInstancedMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      total++;
      if (m.map || m.normalMap || m.roughnessMap || m.alphaMap) {
        const key = `${m.constructor.name}|${m.name || '(unnamed)'}`;
        mapped.set(key, (mapped.get(key) ?? 0) + 1);
      }
    }
  });
  out.totalMaterials = total;
  out.mappedMaterials = [...mapped.entries()];
  return out;
});

console.error(JSON.stringify(report, null, 2));
console.error('pageErrors:', JSON.stringify([...new Set(errors)].slice(0, 6)));
await browser.close();
