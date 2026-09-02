#!/usr/bin/env node
// ===========================================================================
// HF-414 — the same authored review camera, once per graphics profile.
//
// The cost table says what a profile costs. This says what it BUYS. The owner
// asked for profiles that are clear about "what they deliver", and a frame
// time cannot show that; two frames of the same camera can.
//
// WHY NOT capture-arena-viewpoints.mjs. That harness is the arena visual
// REGRESSION instrument: it compares one commit against another at a fixed
// profile, and it is depended on by other lanes. Teaching it to switch
// graphics profiles mid-sweep would put a preset dimension into a
// commit-versus-commit tool and risk its baselines. This script borrows its
// camera-commit protocol - set the review camera, wait for the presentation
// loop to COMMIT a frame at the new revision, re-read the receipt immediately
// before the screenshot - and nothing else.
//
// One browser per profile, deliberately: a preset change stages a renderer
// reconstruction and reloads, and a fresh launch also keeps every profile's
// shader cache cold and equal.
//
// HEADLESS ONLY (owner instruction 2026-09-02 12:40).
//
// Usage:
//   node scripts/qa/capture-graphics-profile-views.mjs --url http://localhost:41977 \
//     --arena atomic-acres --cameras nuke-town-overview,nuke-town-street-axis \
//     --presets performance,balanced,high,raytraced,max --out artifacts/graphics-audit/views
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { VIEWPOINT_CATALOG } from './viewpoint-catalog.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://localhost:41977');
const ARENA = arg('--arena', 'atomic-acres');
const PRESETS = arg('--presets', 'performance,balanced,high,raytraced,max').split(',');
const CAMERAS = arg('--cameras', (VIEWPOINT_CATALOG[ARENA] ?? []).slice(0, 2).join(',')).split(',').filter(Boolean);
const OUT_DIR = arg('--out', 'artifacts/graphics-audit/views');
const WIDTH = Number(arg('--width', '1280'));
const HEIGHT = Number(arg('--height', '720'));
const SETTLE_MS = Number(arg('--settle-ms', '5000'));
const BOOT_TIMEOUT_MS = 180_000;

if (CAMERAS.length === 0) {
  console.error(`[profile-views] no cameras for arena '${ARENA}'`);
  process.exit(2);
}

const results = [];
for (const preset of PRESETS) {
  const record = { preset, arena: ARENA, ok: false, shots: [], errors: [] };
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: [...SILENT_ARGS, '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    page.on('pageerror', (error) => record.errors.push(String(error).slice(0, 200)));

    await page.goto(`${BASE}/?release=latest&renderer=webgpu&externalServices=off&seed=gfxviews&previewTime=0`,
      { waitUntil: 'domcontentloaded', timeout: BOOT_TIMEOUT_MS });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });

    record.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
    if (record.backend !== 'webgpu') {
      record.errors.push(`asked for webgpu, got backend=${record.backend}`);
      results.push(record);
      continue;
    }

    await page.evaluate((next) => {
      const select = document.querySelector('#graphics-profile');
      select.value = next;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('#graphics-save')?.click();
    }, preset);
    // Saving a preset that stages a renderer reconstruction reloads the page.
    await page.waitForTimeout(1_500);
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
    const applied = await page.evaluate(() => {
      try { return window.__ATOMIC_ACRES_DEBUG__.snapshot().settings?.displayedGraphicsPreset ?? null; } catch { return null; }
    });
    if (applied !== preset) {
      record.errors.push(`preset did not apply: asked ${preset}, got ${String(applied)}`);
      results.push(record);
      continue;
    }
    record.appliedPreset = applied;

    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: BOOT_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    // Hide the viewmodel and freeze the bot: a bot that engages the idle
    // player paints a damage vignette over the frame, which would read as a
    // profile difference and is not one.
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
      window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    });

    mkdirSync(resolve(OUT_DIR, ARENA), { recursive: true });
    for (const cameraId of CAMERAS) {
      const revisionBefore = await page.evaluate(() =>
        window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview.captureCameraRevision);
      const ok = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
      if (ok === false) {
        record.shots.push({ cameraId, ok: false, error: 'authored camera missing' });
        continue;
      }
      // Game-loop proof, not a sleep: the presentation loop must have
      // COMMITTED a frame at the new camera revision before pixels are read.
      const committed = await page.waitForFunction(({ id, rev }) => {
        const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return review.cameraId === id && review.captureCameraRevision > rev
          && review.presentedCamera?.captureRevision === review.captureCameraRevision
          ? (review.presentedCamera ?? null) : null;
      }, { id: cameraId, rev: revisionBefore }, { timeout: 30_000 })
        .then((handle) => handle.jsonValue()).catch(() => null);
      if (!committed) {
        record.shots.push({ cameraId, ok: false, error: 'camera revision never committed' });
        continue;
      }
      await page.waitForTimeout(700);
      const receipt = await page.evaluate(() => {
        const review = window.__ATOMIC_ACRES_DEBUG__.snapshot().deterministicReview;
        return review.presentedCamera
          && review.presentedCamera.captureRevision === review.captureCameraRevision
          ? { frame: review.presentedCamera.frame, fixedTimeMs: review.fixedTimeMs, seed: review.seed, exposure: review.exposure }
          : null;
      });
      if (!receipt) {
        record.shots.push({ cameraId, ok: false, error: 'presentation receipt lost before pixels' });
        continue;
      }
      const path = resolve(OUT_DIR, ARENA, `${cameraId}.${preset}.png`);
      await page.screenshot({ path });
      record.shots.push({ cameraId, ok: true, path: path.replaceAll('\\', '/'), ...receipt });
    }
    record.ok = record.shots.every((shot) => shot.ok);
  } catch (error) {
    record.errors.push(String(error).slice(0, 300));
  } finally {
    await browser.close();
  }
  results.push(record);
  console.error(`[profile-views] ${preset.padEnd(12)} ${record.ok ? 'OK' : 'FAIL'} ${record.shots.filter((s) => s.ok).length}/${CAMERAS.length}`);
}

mkdirSync(resolve(process.cwd(), OUT_DIR), { recursive: true });
writeFileSync(resolve(process.cwd(), OUT_DIR, 'manifest.json'),
  `${JSON.stringify({ contract: 'hf414-graphics-profile-views/1', capturedAtIso: new Date().toISOString(), arena: ARENA, cameras: CAMERAS, viewport: { width: WIDTH, height: HEIGHT }, results }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(results.map(({ preset, ok, shots, errors }) =>
  ({ preset, ok, shots: shots.length, errors: errors.length })), null, 2));
if (results.some((record) => !record.ok)) process.exitCode = 1;
