#!/usr/bin/env node
// PASS 95 farcrysis layout stage — station + overhead captures under STOCK FLAGS.
//
// Why a separate script and not `capture-arena-viewpoints.mjs`: that harness
// launches Chrome with `--enable-unsafe-webgpu --use-angle=d3d11
// --ignore-gpu-blocklist`, and HF-454 recorded exactly that flag set hiding a
// Tint swizzle bug that made the live site unlaunchable. The lane rule is
// installed Chrome, `PASS73_NATIVE_WEBGPU=1`, stock flags, `--mute-audio`,
// headless, one browser, own port, under four minutes with a hard kill. This
// script is the same deploy path (debug handle -> selectArena -> startSolo ->
// authored review cameras) with only those flags, farcrysis only, and a
// wall-clock kill.
//
// Usage: node scripts/qa/capture-farcrysis-stations-stock.mjs --url http://127.0.0.1:4267 \
//          --out docs/evidence/pass95/farcrysis-rebuild/captures --sha <sha>
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VIEWPOINT_CATALOG } from './viewpoint-catalog.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:4267');
const OUT_DIR = resolve(process.cwd(), arg('--out', 'artifacts/qa/farcrysis-stations-stock'));
const SHA = arg('--sha', null);
const SETTLE_MS = Number(arg('--settle-ms', '5000'));
const HARD_KILL_MS = Number(arg('--hard-kill-ms', String(4 * 60 * 1000 - 5000)));
const ARENA = 'farcrysis';
const STATIONS = VIEWPOINT_CATALOG[ARENA];

process.env.PASS73_NATIVE_WEBGPU = '1';
mkdirSync(resolve(OUT_DIR, ARENA), { recursive: true });

const startedAt = Date.now();
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const killer = setTimeout(() => {
  console.error(`[stock-capture] HARD KILL at ${HARD_KILL_MS} ms`);
  browser.close().catch(() => {});
  process.exit(3);
}, HARD_KILL_MS);

const manifest = { contract: 'farcrysis-stock-station-capture-v1', sha: SHA, url: BASE, startedAt: new Date(startedAt).toISOString(), flags: ['--mute-audio'], env: { PASS73_NATIVE_WEBGPU: '1' }, backend: null, adapter: null, arena: ARENA, shots: [], errors: [], ok: false };
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=viewpoint&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
  manifest.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  manifest.adapter = await page.evaluate(async () => {
    if (!navigator.gpu) return { gpu: false };
    const adapter = await navigator.gpu.requestAdapter();
    const info = adapter?.info ?? {};
    return { gpu: true, adapter: Boolean(adapter), vendor: info.vendor ?? null, architecture: info.architecture ?? null };
  }).catch((error) => ({ error: String(error).slice(0, 120) }));
  console.error(`[stock-capture] backend=${manifest.backend} adapter=${JSON.stringify(manifest.adapter)}`);
  if (manifest.backend !== 'webgpu') throw new Error(`asked for webgpu, got backend=${manifest.backend}`);

  const t0 = Date.now();
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 150_000 });
  manifest.selectToActiveMs = Date.now() - t0;
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    if (scene) {
      scene.traverse((obj) => {
        if (obj.name === 'bot-operator' || obj.name.startsWith('bot-operator')) { obj.position.set(0, -100, 0); obj.visible = false; }
      });
    }
  });
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true); });
  for (const cameraId of STATIONS) {
    const revisionBefore = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraRevision);
    const applied = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
    if (applied === false) { manifest.shots.push({ cameraId, ok: false, error: 'authored camera missing' }); continue; }
    const committed = await page.waitForFunction(({ id, rev }) => {
      const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
      return review.cameraId === id && review.captureCameraRevision > rev
        && review.presentedCamera?.captureRevision === review.captureCameraRevision ? (review.presentedCamera ?? null) : null;
    }, { id: cameraId, rev: revisionBefore }, { timeout: 30_000 }).then((h) => h.jsonValue()).catch(() => null);
    if (!committed) { manifest.shots.push({ cameraId, ok: false, error: 'camera never committed' }); continue; }
    await page.waitForTimeout(400);
    const path = resolve(OUT_DIR, ARENA, `${cameraId}.png`);
    await page.screenshot({ path });
    manifest.shots.push({ cameraId, ok: true, path: path.replace(process.cwd(), '.').replace(/\\/g, '/'), frame: committed.frame ?? null });
    console.error(`[stock-capture] ${cameraId} -> ${path}`);
  }
  manifest.errors = errors.slice();
  manifest.ok = manifest.shots.every((s) => s.ok) && errors.length === 0;
} catch (error) {
  manifest.errors.push(String(error).slice(0, 400));
  exitCode = 1;
} finally {
  clearTimeout(killer);
  manifest.elapsedMs = Date.now() - startedAt;
  writeFileSync(resolve(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await browser.close().catch(() => {});
}
console.error(`[stock-capture] ok=${manifest.ok} shots=${manifest.shots.filter((s) => s.ok).length}/${STATIONS.length} errors=${manifest.errors.length} elapsed=${manifest.elapsedMs} ms`);
process.exit(manifest.ok ? 0 : (exitCode || 1));
