// Lane R (PASS 85), item 1: farcrysis in-combat frame time against
// atomic-acres, headless, under the same load, with the draw-load attribution
// that says WHY they differ.
//
//   node scripts/qa/run-with-preview-server.mjs \
//     node scripts/qa/measure-farcrysis-frame-time.mjs --url http://127.0.0.1:4180 [--seconds 20]
//
// Method notes, because the arena's frame pacing has been argued about before:
//
// - The cadence is measured from rAF deltas inside the page, not from the HUD
//   counter and not from outside: the HUD number is a smoothed average, and the
//   owner's in-HUD readout is already on record as suspect (PASS 84, HF-399).
//   p50 / p95 / p99 frame TIME is reported, plus the long-frame count, because
//   a mean hides exactly the hitching this lane is looking for.
// - `--disable-frame-rate-limit --disable-gpu-vsync` so the number is the
//   renderer's cost and not the compositor's cadence.
// - Headless only, one browser at a time, per the machine rules. The owner's
//   ComfyUI shares this GPU, so every run records the free VRAM it started
//   with: a farcrysis/atomic ratio is only meaningful when both halves ran in
//   the same window, which is why they are measured back to back in one launch.
// - Pipeline creations during the sample window are counted too: Lane C's whole
//   load fix rests on farcrysis reaching 0 in-combat pipeline creations, and a
//   frame-time run that quietly compiled shaders would be measuring that
//   instead.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { presentationArgs } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:4180');
const SECONDS = Number(arg('--seconds', '20'));
const WIDTH = Number(arg('--width', '1600'));
const HEIGHT = Number(arg('--height', '900'));
const RENDERER = arg('--renderer', 'webgpu');
const ARENAS = arg('--arenas', 'atomic-acres,farcrysis').split(',').map((entry) => entry.trim()).filter(Boolean);
const OUT = arg('--out', null);
/** A frame this long is a visible hitch at any refresh rate the game targets. */
const LONG_FRAME_MS = 33.4;

const SAMPLE = (seconds) => new Promise((done) => {
  const deltas = [];
  let previous = performance.now();
  const endAt = previous + seconds * 1000;
  const tick = () => {
    const now = performance.now();
    deltas.push(now - previous);
    previous = now;
    if (now < endAt) requestAnimationFrame(tick);
    else done(deltas);
  };
  requestAnimationFrame(tick);
});

const DRAW_LOAD = () => {
  const scene = window.__ATOMIC_ACRES_DEBUG__?.sampleSceneGraph?.();
  if (!scene) return null;
  let meshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let triangles = 0;
  let transparent = 0;
  let shadowCasters = 0;
  let alwaysDrawn = 0;
  const materials = new Set();
  scene.traverse((object) => {
    if (!object.visible) return;
    for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
    if (!(object.isMesh || object.isPoints)) return;
    meshes += 1;
    const geometry = object.geometry;
    let tris = 0;
    if (geometry?.index) tris = geometry.index.count / 3;
    else if (geometry?.attributes?.position) tris = geometry.attributes.position.count / 3;
    if (object.isInstancedMesh) {
      instancedMeshes += 1;
      instances += object.count ?? 0;
      tris *= object.count ?? 0;
    }
    triangles += tris;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material.uuid ?? material.id);
    if (list.some((material) => material?.transparent)) transparent += 1;
    if (object.castShadow) shadowCasters += 1;
    if (object.frustumCulled === false) alwaysDrawn += 1;
  });
  return {
    meshes,
    instancedMeshes,
    instances,
    triangles: Math.round(triangles),
    transparent,
    shadowCasters,
    alwaysDrawn,
    distinctMaterials: materials.size,
  };
};


/**
 * Minimal version of Lane C's pipeline hook (scripts/qa/probe-farcrysis-boot-cdp.mjs):
 * count `createRenderPipeline` / `createRenderPipelineAsync` calls, so a frame
 * sample that quietly compiled shaders is visible instead of being read as
 * frame cost. Installed before any page script runs.
 */
const PIPELINE_HOOK = () => {
  const state = { pipelines: 0, hooked: false };
  window.__LANE_R_PIPELINES__ = state;
  const install = () => {
    if (state.hooked) return;
    const device = window.GPUDevice;
    if (!device?.prototype) return;
    state.hooked = true;
    for (const method of ['createRenderPipeline', 'createRenderPipelineAsync']) {
      const original = device.prototype[method];
      if (typeof original !== 'function') continue;
      device.prototype[method] = function patched(...args) {
        state.pipelines += 1;
        return original.apply(this, args);
      };
    }
  };
  install();
  if (!state.hooked) {
    const timer = setInterval(() => { install(); if (state.hooked) clearInterval(timer); }, 10);
    setTimeout(() => clearInterval(timer), 60_000);
  }
};

/** Per-object cost dump: what the frame is actually spending its triangles and shadow passes on. */
const OBJECT_DUMP = () => {
  const scene = window.__ATOMIC_ACRES_DEBUG__?.sampleSceneGraph?.();
  if (!scene) return [];
  const out = [];
  scene.traverse((object) => {
    if (!object.visible) return;
    for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
    if (!(object.isMesh || object.isPoints)) return;
    const geometry = object.geometry;
    let tris = 0;
    if (geometry?.index) tris = geometry.index.count / 3;
    else if (geometry?.attributes?.position) tris = geometry.attributes.position.count / 3;
    const count = object.isInstancedMesh ? (object.count ?? 0) : 1;
    out.push({
      name: object.name || '(unnamed)',
      instanced: Boolean(object.isInstancedMesh),
      count,
      trisEach: Math.round(tris),
      tris: Math.round(tris * count),
      castShadow: Boolean(object.castShadow),
      transparent: (Array.isArray(object.material) ? object.material : [object.material]).some((m) => m?.transparent),
    });
  });
  return out.sort((a, b) => b.tris - a.tris).slice(0, 40);
};

const quantile = (sorted, q) => (sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);

// `channel: 'chrome'` is not optional: Playwright's bundled chromium has no
// WebGPU adapter headless on this machine and the page dies with "WebGPU was
// required, but no GPU adapter was available at all". Installed headless Chrome
// does acquire one (scripts/qa/lib/browser-launch-flags.mjs records the
// measurement). Headless is also the only presentation a frame-pacing lane may
// use here - an off-screen headed window stops being composited and its
// requestAnimationFrame free-runs.
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: presentationArgs({
    headless: true,
    extra: [
      '--use-angle=d3d11',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--disable-frame-rate-limit',
      '--disable-gpu-vsync',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
    ],
  }),
});
const rows = [];
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  await page.addInitScript(PIPELINE_HOOK);
  page.on('pageerror', (error) => console.log(`  [pageerror] ${error.message}`));
  for (const arenaId of ARENAS) {
    const startedAt = Date.now();
    await page.goto(`${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=laner&previewTime=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 240_000 });
    const admittedMs = Date.now() - startedAt;

    // Settle: the first seconds are streaming and compilation, real but not the
    // steady state this lane is measuring.
    await page.waitForTimeout(5_000);
    const pipelinesBefore = await page.evaluate(() => window.__LANE_R_PIPELINES__?.pipelines ?? null);
    const deltas = await page.evaluate(SAMPLE, SECONDS);
    const pipelinesAfter = await page.evaluate(() => window.__LANE_R_PIPELINES__?.pipelines ?? null);
    const load = await page.evaluate(DRAW_LOAD);
    const objects = argv.includes('--dump-objects') ? await page.evaluate(OBJECT_DUMP) : null;
    if (objects) {
      console.log(`  top objects on ${arenaId} by drawn triangles:`);
      console.log('    tris        x count   each  shadow  transp  name');
      for (const object of objects) {
        console.log(`    ${String(object.tris).padStart(9)}  x${String(object.count).padStart(7)}  ${String(object.trisEach).padStart(5)}  `
          + `${object.castShadow ? 'CAST' : '  - '}    ${object.transparent ? 'T' : '-'}      ${object.name}`);
      }
    }

    // The first delta is the gap from the evaluate call, not a rendered frame.
    const frames = deltas.slice(1);
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length;
    rows.push({
      arena: arenaId,
      admittedMs,
      frames: frames.length,
      meanFrameMs: Number(mean.toFixed(2)),
      meanFps: Number((1000 / mean).toFixed(1)),
      p50FrameMs: Number(quantile(sorted, 0.5).toFixed(2)),
      p95FrameMs: Number(quantile(sorted, 0.95).toFixed(2)),
      p99FrameMs: Number(quantile(sorted, 0.99).toFixed(2)),
      worstFrameMs: Number(sorted[sorted.length - 1].toFixed(2)),
      longFrames: frames.filter((value) => value > LONG_FRAME_MS).length,
      longFramePercent: Number(((frames.filter((value) => value > LONG_FRAME_MS).length / frames.length) * 100).toFixed(2)),
      pipelinesDuringSample: pipelinesBefore === null || pipelinesAfter === null ? null : pipelinesAfter - pipelinesBefore,
      ...load,
      ...(objects ? { topObjects: objects } : {}),
    });
    console.log(`${arenaId}: admitted ${(admittedMs / 1000).toFixed(1)} s, ${rows.at(-1).meanFps} fps mean, `
      + `p50 ${rows.at(-1).p50FrameMs} ms, p95 ${rows.at(-1).p95FrameMs} ms, p99 ${rows.at(-1).p99FrameMs} ms, `
      + `worst ${rows.at(-1).worstFrameMs} ms, long frames ${rows.at(-1).longFramePercent}%, `
      + `pipelines during sample ${rows.at(-1).pipelinesDuringSample}`);
    console.log(`  draw: ${load?.meshes} meshes (${load?.instancedMeshes} instanced, ${load?.instances} instances), `
      + `${load?.triangles} tris, ${load?.transparent} transparent, ${load?.shadowCasters} shadow casters, `
      + `${load?.alwaysDrawn} never culled, ${load?.distinctMaterials} distinct materials`);
  }
} finally {
  await browser.close();
}

const base = rows.find((row) => row.arena === 'atomic-acres');
if (base) {
  for (const row of rows) {
    if (row.arena === 'atomic-acres') continue;
    console.log(`\n${row.arena} vs atomic-acres: p50 frame time x${(row.p50FrameMs / base.p50FrameMs).toFixed(2)}, `
      + `p95 x${(row.p95FrameMs / base.p95FrameMs).toFixed(2)}, mean fps ${row.meanFps} vs ${base.meanFps}, `
      + `tris x${(row.triangles / base.triangles).toFixed(2)}, meshes x${(row.meshes / base.meshes).toFixed(2)}, `
      + `transparent x${(row.transparent / base.transparent).toFixed(2)}, shadow casters x${(row.shadowCasters / base.shadowCasters).toFixed(2)}`);
  }
}

if (OUT) {
  const path = resolve(process.cwd(), OUT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), renderer: RENDERER, viewport: [WIDTH, HEIGHT], seconds: SECONDS, rows }, null, 2));
  console.log(`\nwrote ${path}`);
}
