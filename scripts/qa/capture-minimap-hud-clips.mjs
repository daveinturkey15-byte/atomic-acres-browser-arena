#!/usr/bin/env node
/**
 * HF-510: live, in-game clips of the HUD minimap, one per catalog arena.
 *
 * The offline rasteriser (`minimap-structural-audit.mts`) proves WHAT the
 * structural layer selects. This proves the running HUD actually draws it:
 * it boots the built game, starts a solo match on each arena, and clips the
 * real `#minimap` canvas out of the composited page.
 *
 * Owner rules this harness obeys, non-negotiably:
 *   - HEADLESS installed Chrome, stock flags plus --mute-audio (SILENT_ARGS).
 *     Never a window on the owner's screen.
 *   - ONE browser at a time, and every browser session is hard-killed at
 *     SESSION_BUDGET_MS whether or not it has finished.
 *   - The arena roster is passed in by the caller from ALL_ARENA_IDS; this
 *     script never hardcodes a map list.
 *
 *   node scripts/qa/capture-minimap-hud-clips.mjs \
 *     --base http://127.0.0.1:4260 --out docs/evidence/pass95/minimap-simplify \
 *     --arenas nuketown2,raid2,...
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

/** Hard ceiling on a single browser session. The owner's rule is 4 minutes. */
const SESSION_BUDGET_MS = 210_000;
/** Boot budget inside a session, leaving room for the clip itself. */
const BOOT_TIMEOUT_MS = 150_000;

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const base = arg('base', 'http://127.0.0.1:4260');
const outDir = resolve(process.cwd(), arg('out', 'docs/evidence/pass95/minimap-simplify'));
const label = arg('label', 'live');
const arenas = String(arg('arenas', '')).split(',').map((id) => id.trim()).filter(Boolean);
if (arenas.length === 0) throw new Error('--arenas is required (pass the roster derived from ALL_ARENA_IDS)');
mkdirSync(outDir, { recursive: true });

/**
 * One arena, one browser session, hard-killed at the budget.
 * @returns {Promise<object>} the measurement for this arena.
 */
async function captureArena(arenaId) {
  const started = Date.now();
  const browser = await chromium.launch({ headless: true, channel: 'chrome', args: [...SILENT_ARGS] });
  let killed = false;
  const watchdog = setTimeout(() => {
    killed = true;
    browser.close().catch(() => {});
  }, SESSION_BUDGET_MS);
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text().slice(0, 240));
    });

    await page.goto(
      `${base}/?release=latest&renderer=webgpu&render=quality&seed=hf510-${arenaId}&previewTime=0`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: BOOT_TIMEOUT_MS });
    // Let the retained minimap layer build and a few frames present.
    await page.waitForTimeout(2_000);

    const probe = await page.evaluate(() => {
      const canvas = document.querySelector('#minimap');
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#minimap canvas missing');
      const box = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return {
        backend: document.documentElement.dataset.renderBackend ?? null,
        arena: window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaId ?? null,
        canvas: {
          backingWidth: canvas.width,
          backingHeight: canvas.height,
          cssWidth: Math.round(box.width * 1000) / 1000,
          cssHeight: Math.round(box.height * 1000) / 1000,
          left: Math.round(box.left * 1000) / 1000,
          top: Math.round(box.top * 1000) / 1000,
          opacity: style.opacity,
          display: style.display,
        },
      };
    });

    if (probe.canvas.cssWidth < 4 || probe.canvas.cssHeight < 4) {
      throw new Error(`${arenaId}: minimap canvas is not laid out (${probe.canvas.cssWidth}x${probe.canvas.cssHeight})`);
    }

    // Ink coverage: how much of the minimap disc is NOT the near-black ground.
    // This is the readability/clutter number - a busy map inks a large area.
    const ink = await page.evaluate(() => {
      const canvas = document.querySelector('#minimap');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      const { width, height } = canvas;
      const { data } = context.getImageData(0, 0, width, height);
      const centreX = width / 2;
      const centreY = height / 2;
      const radius = Math.min(width, height) / 2;
      let inside = 0;
      let inked = 0;
      let luminanceSum = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const dx = x - centreX;
          const dy = y - centreY;
          if (dx * dx + dy * dy > radius * radius) continue;
          inside += 1;
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          luminanceSum += luminance;
          // Ground is rgba(7,15,18,.86) over the console backdrop: very dark.
          if (luminance > 40) inked += 1;
        }
      }
      return {
        sampledPixels: inside,
        inkedPixels: inked,
        inkedFraction: inside > 0 ? Math.round((inked / inside) * 10_000) / 10_000 : null,
        meanLuminance: inside > 0 ? Math.round((luminanceSum / inside) * 100) / 100 : null,
      };
    });

    const clipPath = resolve(outDir, `${arenaId}-minimap-hud-${label}.png`);
    await page.locator('#minimap').screenshot({ path: clipPath, animations: 'disabled' });

    const measurement = {
      arena: arenaId,
      ok: true,
      backend: probe.backend,
      reportedArena: probe.arena,
      canvas: probe.canvas,
      ink,
      clip: `${arenaId}-minimap-hud-${label}.png`,
      elapsedMs: Date.now() - started,
      errors: [...new Set(errors)],
    };
    if (probe.backend !== 'webgpu') {
      measurement.ok = false;
      measurement.failure = `expected native WebGPU, got ${probe.backend}`;
    }
    return measurement;
  } catch (error) {
    return {
      arena: arenaId,
      ok: false,
      killedByWatchdog: killed,
      failure: String(error).slice(0, 400),
      elapsedMs: Date.now() - started,
      errors: [...new Set(errors)],
    };
  } finally {
    clearTimeout(watchdog);
    await browser.close().catch(() => {});
  }
}

const results = [];
for (const arenaId of arenas) {
  // Strictly sequential: one browser on this machine at a time.
  const measurement = await captureArena(arenaId);
  results.push(measurement);
  console.log(
    `${measurement.ok ? 'PASS' : 'FAIL'} ${arenaId} ` +
    `${measurement.ok ? `ink=${measurement.ink?.inkedFraction} backend=${measurement.backend}` : measurement.failure} ` +
    `(${measurement.elapsedMs} ms)`,
  );
}

const summary = {
  generatedAt: new Date().toISOString(),
  base,
  label,
  sessionBudgetMs: SESSION_BUDGET_MS,
  arenas: results,
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
};
writeFileSync(resolve(outDir, `minimap-hud-${label}-clips.json`), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n${summary.passed} passed / ${summary.failed} failed -> minimap-hud-${label}-clips.json`);
if (summary.failed > 0) process.exitCode = 1;
