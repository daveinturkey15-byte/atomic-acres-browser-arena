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
import { defaultBootRoster } from './arena-roster.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
// PASS 85 Lane N: this default was a hardcoded six-arena literal, so Test1,
// Test2 and Map 3 were never swept by it and nothing said so. It is now
// derived from the registry (scripts/qa/arena-roster.mjs) and is a strict
// superset of what it covered before; `--arenas` still overrides it.
const ARENAS = arg('--arenas', defaultBootRoster())
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

// RENDERER AND BROWSER CHANNEL ARE OPTIONS, and this file is the reason.
//
// The URL below pinned `renderer=webgl2` and the launch pinned Playwright's
// BUNDLED chromium, while every other script in this directory - the viewpoint
// capture included - runs INSTALLED Chrome (`channel: 'chrome'`) on
// `renderer=webgpu`. On a WebGPU production dist served by `vite preview`
// that combination never brings `window.__ATOMIC_ACRES_DEBUG__` up at all:
// measured 2026-09-06 (HF-536 night-materials), both the base and candidate
// runs died on `page.waitForFunction: Timeout 120000ms exceeded` with an empty
// log, so the lane could not price its own frame cost. Defaults are unchanged
// so no existing caller moves; pass `--renderer webgpu --channel chrome` to
// measure the path the arena actually ships.
const RENDERER = arg('--renderer', 'webgl2');
const CHANNEL = arg('--channel', '');
const BOOT_TIMEOUT_MS = Number(arg('--boot-timeout-ms', '180000'));

const browser = await chromium.launch({
  headless: true,
  ...(CHANNEL ? { channel: CHANNEL } : {}),
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

const rows = [];
for (const arenaId of ARENAS) {
  await page.goto(`${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=fps&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
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
