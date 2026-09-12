#!/usr/bin/env node
// Calibration probe for scripts/qa/sweep-invisible-walls-cdp.mjs.
//
// The sweep explains a blocked move when any VISIBLE leaf-mesh world AABB
// intersects a +/-0.5 m box around the probe point. If arena-scale meshes
// (sky dome, ocean plane, full-map terrain) enter that sample, EVERY block is
// "explained" and the map silently reads all-clear - the exact false-negative
// this lane exists to prevent. This probe boots one arena and reports:
//   - total visible boxes and the ten largest by volume (name + extents)
//   - how many boxes contain an arbitrary mid-air interior point (should be 0)
//   - which named boxes intersect a probe at player height at the arena centre
//
// Read-only against the shared preview. Usage:
//   node scripts/qa/probe-invisible-wall-boxes.mjs [--url http://127.0.0.1:41911] [--arena atomic-acres]
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41911');
const ARENA = arg('--arena', 'atomic-acres');

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

page.on('pageerror', (error) => console.error(`[probe] pageerror: ${String(error).slice(0, 160)}`));

await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=boxprobe&previewTime=0`, { waitUntil: 'load' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 300_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.error(`[probe] backend=${backend}`);
if (backend !== 'webgpu') {
  console.error('[probe] ABORT: not webgpu');
  await browser.close();
  process.exit(1);
}

await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return Boolean(snapshot) && snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 300_000 });
await page.waitForTimeout(2_000);

const report = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  scene.updateMatrixWorld(true);
  const boxes = [];
  scene.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    let visible = node.visible;
    for (let parent = node.parent; parent; parent = parent.parent) if (!parent.visible) visible = false;
    if (!visible) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    if (!materials.some((material) => material && material.visible && (!material.transparent || material.opacity > 0.05))) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const bounding = node.geometry.boundingBox;
    if (!bounding || bounding.isEmpty()) return;
    const box = bounding.clone().applyMatrix4(node.matrixWorld);
    boxes.push({
      minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z,
      name: node.name || '(unnamed)',
    });
  });
  const volume = (box) =>
    (box.maxX - box.minX) * Math.max(0, box.maxY - box.minY) * (box.maxZ - box.minZ);
  const largest = [...boxes]
    .sort((a, b) => volume(b) - volume(a))
    .slice(0, 12)
    .map((box) => ({
      name: box.name,
      extentsM: [Number((box.maxX - box.minX).toFixed(1)), Number((box.maxY - box.minY).toFixed(1)), Number((box.maxZ - box.minZ).toFixed(1))],
      yRange: [Number(box.minY.toFixed(1)), Number(box.maxY.toFixed(1))],
      volumeM3: Number(volume(box).toFixed(0)),
    }));
  // Player-height band at the world origin area: which boxes cover it?
  const coveringAtPlayerHeight = boxes.filter((box) =>
    box.minX <= 0.5 && box.maxX >= -0.5 && box.minZ <= 0.5 && box.maxZ >= -0.5
    && box.minY <= 1.5 && box.maxY >= 0.5)
    .map((box) => box.name);
  const snapshotPos = window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position;
  const coveringAtSpawn = boxes.filter((box) => {
    const px = snapshotPos[0]; const py = snapshotPos[1] - 1.7; const pz = snapshotPos[2];
    return box.minX <= px + 0.5 && box.maxX >= px - 0.5 && box.minZ <= pz + 0.5 && box.maxZ >= pz - 0.5
      && box.minY <= py + 1.35 && box.maxY >= py + 0.15;
  }).map((box) => box.name);
  return { totalBoxes: boxes.length, largest, coveringAtOriginBand: coveringAtPlayerHeight, coveringAtSpawnProbe: coveringAtSpawn };
});

console.log(JSON.stringify({ arena: ARENA, backend, ...report }, null, 2));
await browser.close();
