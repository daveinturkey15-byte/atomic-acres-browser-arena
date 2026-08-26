#!/usr/bin/env node
// HF-392 round 2: straight-on exterior shots of every deckhouse window face,
// plus a scene-graph dump of every window-related mesh (name, world position,
// size, material response) so pixels can be correlated to meshes.
//
// Usage:
//   node scripts/qa/capture-hf392-windows-round2.mjs --url http://127.0.0.1:41947 --out artifacts/hf392/round2 --tag r2
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41947');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/hf392/round2'));
const TAG = arg('--tag', 'r2');

const STATIONS = [
  { id: 'ext-bow-face', pos: [0, 5.6, -38], yaw: Math.PI, pitch: 0.08 },
  { id: 'ext-bow-face-alt', pos: [0, 5.6, -38], yaw: 0, pitch: 0.08 },
  { id: 'ext-stern-face', pos: [0, 5.6, 41], yaw: 0, pitch: 0.08 },
  { id: 'ext-stern-face-alt', pos: [0, 5.6, 41], yaw: Math.PI, pitch: 0.08 },
  { id: 'ext-side-a', pos: [-11.5, 5.6, -21], yaw: Math.PI / 2, pitch: 0.05 },
  { id: 'ext-side-b', pos: [-11.5, 5.6, -21], yaw: -Math.PI / 2, pitch: 0.05 },
  { id: 'ext-side-c', pos: [11.5, 5.6, 21], yaw: Math.PI / 2, pitch: 0.05 },
  { id: 'ext-side-d', pos: [11.5, 5.6, 21], yaw: -Math.PI / 2, pitch: 0.05 },
];

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
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf392r2&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[hf392-r2] backend=${backend}`);
if (backend !== 'webgpu') { await browser.close(); process.exit(2); }

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(3_000);

// Scene-graph dump of window-related meshes (plain math; THREE is not a page global).
const meshDump = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const out = [];
  scene.traverse((obj) => {
    const name = obj.name || '';
    if (!/window|glaz|mullion|windscreen|sill|header|cabin-ceiling/i.test(name)) return;
    if (!obj.isMesh) return;
    const m = obj.matrixWorld.elements;
    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const geometry = obj.geometry;
    geometry.computeBoundingBox();
    const min = geometry.boundingBox.min;
    const max = geometry.boundingBox.max;
    out.push({
      name,
      worldPos: [+m[12].toFixed(2), +m[13].toFixed(2), +m[14].toFixed(2)],
      localSize: [
        +(max.x - min.x).toFixed(2),
        +(max.y - min.y).toFixed(2),
        +(max.z - min.z).toFixed(2),
      ],
      visible: obj.visible,
      material: material ? {
        type: material.type,
        color: material.color ? `#${material.color.getHexString()}` : null,
        transparent: material.transparent ?? null,
        opacity: material.opacity ?? null,
        metalness: material.metalness ?? null,
        roughness: material.roughness ?? null,
        side: material.side ?? null,
      } : null,
    });
  });
  return out;
});

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, `${TAG}-meshes.json`), JSON.stringify(meshDump, null, 2));
console.error(`[hf392-r2] dumped ${meshDump.length} window meshes`);

const report = [];
for (const station of STATIONS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...station.pos, station.yaw, station.pitch]);
  await page.waitForTimeout(900);
  const landed = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position.map((v) => Number(v.toFixed(2))));
  await page.waitForTimeout(600);
  const file = resolve(OUT, `${TAG}-${station.id}.png`);
  await page.screenshot({ path: file });
  report.push({ ...station, landed, file });
  console.error(`[hf392-r2] ${station.id}: landed=${JSON.stringify(landed)}`);
}

await browser.close();
writeFileSync(resolve(OUT, `${TAG}-manifest.json`), JSON.stringify({ tag: TAG, backend, stations: report }, null, 2));
console.log(JSON.stringify({ tag: TAG, backend, meshes: meshDump.length, stations: report.length }, null, 2));
