#!/usr/bin/env node
// HF-398 diagnostic — what the arenas' surfaces actually ARE.
//
// The ray-traced reflection layer only spawns a ray on a surface smooth enough
// to return a recognisable image. Whether that is one surface or a thousand is
// a property of the arenas, not of the tracer, and it decides whether the
// preset is worth offering. So measure it rather than assume it.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41917');
const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas')
  .split(',').map((v) => v.trim()).filter(Boolean);
const OUT = arg('--out', 'artifacts/qa/rt-roughness');

mkdirSync(resolve(OUT), { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const report = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = `${BASE}/?release=latest&renderer=webgpu&seed=rt-rough&previewTime=0`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  for (const arena of ARENAS) {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 240_000 }).catch(() => {});
    report[arena] = await page.evaluate(() => {
      const bands = [0.05, 0.1, 0.15, 0.22, 0.3, 0.4, 0.5, 0.65, 0.8, 1.01];
      const counts = Object.fromEntries(bands.map((band) => [band, 0]));
      const areaByBand = Object.fromEntries(bands.map((band) => [band, 0]));
      let meshes = 0;
      let metalMeshes = 0;
      let noRoughness = 0;
      const smoothest = [];
      const stack = [];
      const sceneRoot = window.__ATOMIC_ACRES_DEBUG__?.sampleSceneGraph?.() ?? null;
      if (!sceneRoot) return { unavailable: 'no scene accessor on the debug API' };
      stack.push(sceneRoot);
      while (stack.length > 0) {
        const node = stack.pop();
        for (const child of node.children ?? []) stack.push(child);
        if (!node.isMesh || node.visible === false) continue;
        const material = Array.isArray(node.material) ? node.material[0] : node.material;
        if (!material) continue;
        meshes += 1;
        if (typeof material.roughness !== 'number') { noRoughness += 1; continue; }
        const roughness = material.roughness;
        const metalness = typeof material.metalness === 'number' ? material.metalness : 0;
        if (metalness >= 0.6) metalMeshes += 1;
        const geometry = node.geometry;
        if (geometry && !geometry.boundingBox) geometry.computeBoundingBox?.();
        const box = geometry?.boundingBox ?? null;
        const area = box
          ? Math.max(
            (box.max.x - box.min.x) * (box.max.z - box.min.z),
            (box.max.x - box.min.x) * (box.max.y - box.min.y),
            (box.max.z - box.min.z) * (box.max.y - box.min.y),
          ) : 0;
        const band = bands.find((edge) => roughness < edge) ?? 1.01;
        counts[band] += 1;
        areaByBand[band] += Number.isFinite(area) ? area : 0;
        if (roughness <= 0.5) {
          smoothest.push({ name: node.name || '(unnamed)', roughness: Number(roughness.toFixed(3)), metalness: Number(metalness.toFixed(3)) });
        }
      }
      smoothest.sort((a, b) => a.roughness - b.roughness);
      return {
        meshes,
        metalMeshes,
        noRoughness,
        counts,
        areaByBand: Object.fromEntries(Object.entries(areaByBand).map(([k, v]) => [k, Number(v.toFixed(1))])),
        smoothest: smoothest.slice(0, 25),
      };
    }).catch((error) => ({ error: String(error).slice(0, 200) }));
    console.error(`[roughness] ${arena.padEnd(18)} ${JSON.stringify(report[arena]).slice(0, 400)}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 }).catch(() => {});
  }
} finally {
  await browser.close().catch(() => {});
}
writeFileSync(resolve(OUT, 'roughness.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log('written', resolve(OUT, 'roughness.json'));
