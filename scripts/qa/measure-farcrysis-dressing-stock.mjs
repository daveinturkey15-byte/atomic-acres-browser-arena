#!/usr/bin/env node
// PASS 95 FARCRYSIS DRESSING - stock WebGPU runtime receipt.
//
// This is deliberately separate from the older lane probes: this harness uses
// installed headless Chrome with only --mute-audio, so its cold-admission and
// in-combat receipts match the dressing brief. It reads existing debug APIs;
// it does not add a gameplay or renderer backdoor.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:4268');
const OUT = resolve(arg('--out', 'docs/evidence/pass95/farcrysis-dressing/runtime.json'));
const COMBAT_SECONDS = Number(arg('--combat-seconds', '60'));
const WIDTH = Number(arg('--width', '1280'));
const HEIGHT = Number(arg('--height', '720'));
const ARENA = 'farcrysis';
const RETIREMENT_ARENAS = ['atomic-acres', 'rustworks-1v1'];

process.env.PASS73_NATIVE_WEBGPU = '1';

const PIPELINE_HOOK = () => {
  const state = { renderPipelines: 0, hooked: false };
  window.__FARCRYSIS_DRESSING_PIPELINES__ = state;
  const install = () => {
    if (state.hooked) return;
    const device = window.GPUDevice;
    if (!device?.prototype) return;
    state.hooked = true;
    for (const method of ['createRenderPipeline', 'createRenderPipelineAsync']) {
      const original = device.prototype[method];
      if (typeof original !== 'function') continue;
      device.prototype[method] = function patched(...args) {
        state.renderPipelines += 1;
        return original.apply(this, args);
      };
    }
  };
  install();
  if (!state.hooked) {
    const timer = setInterval(() => {
      install();
      if (state.hooked) clearInterval(timer);
    }, 10);
    setTimeout(() => clearInterval(timer), 120_000);
  }
};

const CENSUS = () => {
  const scene = window.__ATOMIC_ACRES_DEBUG__?.sampleSceneGraph?.();
  if (!scene) return null;
  const materials = new Set();
  const geometries = new Set();
  const dressingObjects = [];
  let visibleDrawObjects = 0;
  let visibleMeshes = 0;
  let instancedMeshes = 0;
  let instances = 0;
  let triangles = 0;
  scene.traverse((object) => {
    if (!object.visible) return;
    for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) return;
    if (!(object.isMesh || object.isPoints)) return;
    visibleDrawObjects += 1;
    visibleMeshes += object.isMesh ? 1 : 0;
    if (object.isInstancedMesh) {
      instancedMeshes += 1;
      instances += object.count ?? 0;
    }
    const geometry = object.geometry;
    geometries.add(geometry?.uuid ?? geometry);
    let tris = geometry?.index ? geometry.index.count / 3 : (geometry?.attributes?.position?.count ?? 0) / 3;
    if (object.isInstancedMesh) tris *= object.count ?? 0;
    triangles += tris;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material.uuid ?? material.id);
    if (object.name.startsWith('farcrysis-dressing-')) dressingObjects.push({ name: object.name, count: object.count ?? 1 });
  });
  return {
    visibleDrawObjects,
    visibleMeshes,
    instancedMeshes,
    instances,
    triangles: Math.round(triangles),
    distinctMaterials: materials.size,
    geometries: geometries.size,
    dressingObjects,
  };
};

const percentile = (values, q) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2));
};

const COMBAT_SAMPLE = async (seconds) => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const beforePipelines = window.__FARCRYSIS_DRESSING_PIPELINES__?.renderPipelines ?? null;
  const percentileInPage = (values, q) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return Number(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(2));
  };
  const deltas = [];
  let previous = performance.now();
  const endAt = previous + seconds * 1000;
  let running = true;
  const raf = (now) => {
    if (!running) return;
    deltas.push(now - previous);
    previous = now;
    if (now < endAt) requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
  let step = 0;
  let alive = true;
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true }));
  const timer = setInterval(() => {
    step += 1;
    try {
      if (step % 40 === 0) alive = api.snapshot().player.alive;
      if (!alive) {
        if (step % 80 === 0) {
          api.respawn?.();
          alive = true;
        }
        return;
      }
      api.setMovement?.(true, step % 40 < 12);
      if (step % 20 === 0) key('keydown', 'KeyA');
      if (step % 20 === 6) key('keyup', 'KeyA');
      if (step % 20 === 10) key('keydown', 'KeyD');
      if (step % 20 === 16) key('keyup', 'KeyD');
      if (step % 25 === 0) api.aimAtBot?.();
      if (step % 16 === 0) api.setTriggerHeld?.(true);
      if (step % 16 === 9) api.setTriggerHeld?.(false);
      if (step % 200 === 150) api.reload?.();
    } catch {
      // The error is captured by the outer page listeners; keep the sampler alive.
    }
  }, 50);
  await new Promise((done) => setTimeout(done, seconds * 1000));
  running = false;
  clearInterval(timer);
  try { api.setTriggerHeld?.(false); api.setMovement?.(false, false); } catch { /* page is closing */ }
  const afterPipelines = window.__FARCRYSIS_DRESSING_PIPELINES__?.renderPipelines ?? null;
  const frames = deltas.slice(1);
  return {
    seconds,
    frames: frames.length,
    meanFrameMs: frames.length ? Number((frames.reduce((sum, value) => sum + value, 0) / frames.length).toFixed(2)) : null,
    p50FrameMs: percentileInPage(frames, 0.5),
    p95FrameMs: percentileInPage(frames, 0.95),
    p99FrameMs: percentileInPage(frames, 0.99),
    worstFrameMs: percentileInPage(frames, 1),
    longFramesOver33ms: frames.filter((value) => value > 33.4).length,
    gapsOver1000ms: frames.filter((value) => value > 1000).length,
    pipelinesBefore: beforePipelines,
    pipelinesAfter: afterPipelines,
    pipelinesDuringSample: beforePipelines === null || afterPipelines === null ? null : afterPipelines - beforePipelines,
  };
};

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const pageErrors = [];
const consoleErrors = [];
const report = {
  contract: 'farcrysis-dressing-stock-runtime-v1',
  measuredAt: new Date().toISOString(),
  url: BASE,
  arena: ARENA,
  flags: ['--mute-audio'],
  env: { PASS73_NATIVE_WEBGPU: '1' },
  pageErrors,
  consoleErrors,
  outcome: 'incomplete',
};

try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 400)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400)); });
  await page.addInitScript(PIPELINE_HOOK);
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=dressing-runtime&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
  report.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  report.adapter = await page.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    const adapter = await navigator.gpu.requestAdapter();
    const info = adapter?.info ?? {};
    return { gpu: true, adapter: Boolean(adapter), vendor: info.vendor ?? null, architecture: info.architecture ?? null };
  });
  const startedAt = Date.now();
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  report.selectToActiveMs = Date.now() - startedAt;
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
  });
  await page.waitForTimeout(5000);
  report.card = await page.evaluate(() => {
    const card = document.querySelector('.map-card[data-arena-id="farcrysis"]');
    return card ? { exists: true, hidden: card.classList.contains('hidden'), ariaHidden: card.getAttribute('aria-hidden') } : { exists: false };
  });
  report.sceneBeforeCombat = await page.evaluate(CENSUS);
  report.presentationBeforeCombat = await page.evaluate(() => ({
    counters: window.__ATOMIC_ACRES_DEBUG__.samplePresentationCounters(),
    telemetry: window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry(),
  }));
  report.combat = await page.evaluate(COMBAT_SAMPLE, COMBAT_SECONDS);
  report.sceneAfterCombat = await page.evaluate(CENSUS);
  report.presentationAfterCombat = await page.evaluate(() => ({
    counters: window.__ATOMIC_ACRES_DEBUG__.samplePresentationCounters(),
    telemetry: window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry(),
  }));

  const retirementBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection.streaming.retirement);
  report.retirementBefore = retirementBefore;
  report.retirementSwitches = [];
  for (const arenaId of RETIREMENT_ARENAS) {
    const switchStartedAt = Date.now();
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
    await page.waitForTimeout(1000);
    const snapshot = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
    report.retirementSwitches.push({
      arenaId,
      elapsedMs: Date.now() - switchStartedAt,
      selected: snapshot.arenaSelection.id,
      residentArenaIds: snapshot.arenaSelection.streaming.residentArenaIds,
      retirement: snapshot.arenaSelection.streaming.retirement,
    });
  }
  const finalSnapshot = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
  report.retirementAfter = finalSnapshot.arenaSelection.streaming.retirement;
  report.finalArena = finalSnapshot.arenaSelection.id;
  report.outcome = 'admitted-and-sampled';
} catch (error) {
  report.error = String(error).slice(0, 800);
} finally {
  await browser.close().catch(() => {});
  report.pageErrors = pageErrors.slice();
  report.consoleErrors = consoleErrors.slice();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.outcome === 'admitted-and-sampled' ? 0 : 1);
