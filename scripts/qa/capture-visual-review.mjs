#!/usr/bin/env node
// Pass 75 visual review capture.
//
// One command that produces the evidence a human actually needs to judge a
// visual pass: every menu panel and every arena's live HUD, at the contract
// review viewports, plus a mechanical legibility audit at each one.
//
// It deliberately reports rather than asserts: a visual pass is owner-taste,
// so this exists to put real frames in front of the owner, while the numeric
// audit (sub-9px text, horizontal overflow, surface presence) stays objective
// and is the part a gate can be built on later.
//
// Usage:
//   node scripts/qa/capture-visual-review.mjs [--url http://127.0.0.1:41876]
//                                             [--out artifacts/pass75/visual-review]
//                                             [--arenas atomic-acres,high-seas]
//                                             [--menu-only]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const RENDERER = arg('--renderer', 'webgl2');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/pass75/visual-review'));
const MENU_ONLY = argv.includes('--menu-only');
const ARENAS = arg('--arenas', 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range,farcrysis,high-seas')
  .split(',').map((entry) => entry.trim()).filter(Boolean);

// The AGENTS.md review viewports. Narrow and ultrawide are where surface
// overlap actually shows up, so they are not optional.
const VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '3440x1440-ultrawide', width: 3440, height: 1440 },
];

const MENU_PANELS = [
  { id: 'deploy', tab: '#menu-tab-deploy' },
  { id: 'kit', tab: '#menu-tab-kit' },
  { id: 'streaks', tab: '#menu-tab-streaks' },
  { id: 'options', tab: '#menu-tab-options' },
];

/** Objective legibility + layout audit of whatever is currently on screen. */
const AUDIT = () => {
  const tooSmall = [];
  const seen = new Set();
  for (const element of document.querySelectorAll('body *')) {
    const text = (element.textContent || '').trim();
    if (!text) continue;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const size = Number.parseFloat(style.fontSize);
    if (size > 0 && size < 9) {
      const key = `${element.tagName}.${element.className || '-'}:${size}`;
      if (!seen.has(key)) {
        seen.add(key);
        tooSmall.push({ tag: element.tagName, cls: String(element.className || '-').slice(0, 60), px: size, sample: text.slice(0, 40) });
      }
    }
  }
  const root = document.documentElement;
  return {
    belowNinePx: tooSmall,
    pageOverflowX: root.scrollWidth - root.clientWidth,
    devicePixelRatio: window.devicePixelRatio,
  };
};

const report = { base: BASE, capturedAt: null, viewports: [], notes: [] };

// Headless Chromium exposes no navigator.gpu on this machine, so a headless
// capture ALWAYS shows the WebGL2 compat path, never the WebGPU/TSL route the
// owner actually plays. Worse, default headless falls back to SwiftShader, which
// would make the art look far worse than it is. These flags pin real hardware
// ANGLE so the frames at least represent the GPU. The report records the backend
// and adapter it actually got, so no frame here can be mistaken for WebGPU
// evidence - that requires a HEADED run (--headed).
const HEADED = argv.includes('--headed');
const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
try {
  for (const viewport of VIEWPORTS) {
    const record = { viewport: viewport.name, menu: [], arenas: [] };
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 180)); });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 180)}`));

    await page.goto(`${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=visual-review&previewTime=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
    await page.waitForTimeout(1_200);

    // Record the renderer identity so every frame is self-describing.
    record.renderer = await page.evaluate(() => {
      const runtime = (() => {
        try { return window.__ATOMIC_ACRES_DEBUG__.snapshot()?.render?.runtime ?? null; } catch { return null; }
      })();
      return {
        backend: document.documentElement.dataset.renderBackend ?? null,
        webgpuAvailable: Boolean(navigator.gpu),
        actualBackend: runtime?.actualBackend ?? null,
        adapterLabel: runtime?.adapterLabel ?? null,
        softwareAdapter: runtime?.softwareAdapter ?? null,
      };
    });

    for (const panel of MENU_PANELS) {
      await page.evaluate((selector) => document.querySelector(selector)?.click(), panel.tab);
      await page.waitForTimeout(450);
      const file = resolve(OUT, `menu-${panel.id}-${viewport.name}.png`);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: file });
      record.menu.push({ panel: panel.id, file, audit: await page.evaluate(AUDIT) });
    }

    if (!MENU_ONLY) {
      for (const arenaId of ARENAS) {
        try {
          await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
          await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
          await page.waitForFunction(() => {
            const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
            return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
          }, undefined, { timeout: 120_000 });
          // Let the HUD settle and a few frames present before judging it.
          await page.waitForTimeout(2_500);
          const file = resolve(OUT, `hud-${arenaId}-${viewport.name}.png`);
          await page.screenshot({ path: file });
          record.arenas.push({ arena: arenaId, file, audit: await page.evaluate(AUDIT) });
          await page.goto(`${BASE}/?release=latest&renderer=${RENDERER}&render=quality&seed=visual-review&previewTime=0`, { waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
          await page.waitForTimeout(900);
        } catch (error) {
          record.arenas.push({ arena: arenaId, file: null, error: String(error).slice(0, 200) });
        }
      }
    }

    record.consoleErrors = [...new Set(consoleErrors)];
    report.viewports.push(record);
    await page.close();
  }
} finally {
  await browser.close();
}

report.capturedAt = new Date().toISOString();
const totalBelowFloor = report.viewports.reduce((sum, viewport) => sum
  + viewport.menu.reduce((inner, entry) => inner + entry.audit.belowNinePx.length, 0)
  + viewport.arenas.reduce((inner, entry) => inner + (entry.audit?.belowNinePx.length ?? 0), 0), 0);
const overflow = report.viewports.some((viewport) => [...viewport.menu, ...viewport.arenas]
  .some((entry) => (entry.audit?.pageOverflowX ?? 0) > 0));
report.summary = {
  totalTextBelowNinePx: totalBelowFloor,
  anyHorizontalOverflow: overflow,
  renderers: report.viewports.map((viewport) => ({ viewport: viewport.viewport, ...viewport.renderer })),
  // Stated plainly so a reader never mistakes a compat-path frame for WebGPU.
  evidenceScope: report.viewports.every((viewport) => viewport.renderer?.actualBackend === 'webgpu')
    ? 'webgpu-route'
    : 'webgl2-compat-route-only (headless has no navigator.gpu; run --headed for WebGPU)',
};

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'visual-review.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
process.stdout.write(`captures + report written to ${OUT}\n`);
