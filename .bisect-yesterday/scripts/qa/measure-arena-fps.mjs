#!/usr/bin/env node
// Per-arena frame-rate and draw-load measurement.
//
// Reads the HUD's own frame counter over a sampling window rather than timing
// from outside the page, so the number is the one a player actually sees, and
// pairs it with what the frame is being asked to draw: visible meshes, visible
// triangles, and how many of those surfaces are transparent.
//
// Transparent surface count is called out separately because it is the usual
// culprit when two arenas have similar triangle counts and very different
// frame rates - large additive planes cost fill rate, not vertices, and they
// get no early-z rejection.
//
// Usage: node scripts/qa/measure-arena-fps.mjs [--arenas a,b] [--seconds 8]
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas')
  .split(',').map((entry) => entry.trim()).filter(Boolean);
const SECONDS = Number(arg('--seconds', '8'));
const WIDTH = Number(arg('--width', '1920'));
const HEIGHT = Number(arg('--height', '1080'));

const DRAW_LOAD = () => {
  const scene = window.__ATOMIC_ACRES_DEBUG__?.sampleSceneGraph?.();
  if (!scene) return null;
  let meshes = 0;
  let triangles = 0;
  let transparent = 0;
  let alwaysDrawn = 0;
  scene.traverse((object) => {
    if (!object.visible) return;
    for (let parent = object.parent; parent; parent = parent.parent) {
      if (!parent.visible) return;
    }
    if (!(object.isMesh || object.isPoints)) return;
    meshes += 1;
    const geometry = object.geometry;
    if (geometry?.index) triangles += geometry.index.count / 3;
    else if (geometry?.attributes?.position) triangles += geometry.attributes.position.count / 3;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => material?.transparent)) transparent += 1;
    if (object.frustumCulled === false) alwaysDrawn += 1;
  });
  return { meshes, triangles: Math.round(triangles), transparent, alwaysDrawn };
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

const rows = [];
for (const arenaId of ARENAS) {
  await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=quality&seed=fps&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 120_000 });

  // Let the arena settle before sampling: the first seconds include streaming
  // and shader compilation, which are real but are not the steady state.
  await page.waitForTimeout(3_000);

  const samples = [];
  for (let index = 0; index < SECONDS; index += 1) {
    await page.waitForTimeout(1_000);
    const value = await page.evaluate(() => {
      const text = document.querySelector('#fps-counter b')?.textContent ?? '';
      const parsed = Number.parseFloat(text);
      return Number.isFinite(parsed) ? parsed : null;
    });
    if (value !== null) samples.push(value);
  }

  const load = await page.evaluate(DRAW_LOAD);
  const sorted = [...samples].sort((a, b) => a - b);
  rows.push({
    arena: arenaId,
    samples,
    medianFps: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    minFps: sorted.length ? sorted[0] : null,
    ...load,
  });
}

await browser.close();

console.log(`viewport ${WIDTH}x${HEIGHT}, ${SECONDS}s per arena\n`);
console.log('arena             fps(med/min)   meshes    tris  transparent  never-culled');
for (const row of rows) {
  console.log(
    row.arena.padEnd(18)
    + `${String(row.medianFps).padStart(3)}/${String(row.minFps).padEnd(4)}`
    + String(row.meshes).padStart(9)
    + String(row.triangles).padStart(8)
    + String(row.transparent).padStart(13)
    + String(row.alwaysDrawn).padStart(14),
  );
}
console.log(`\n${JSON.stringify(rows)}`);
