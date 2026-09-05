#!/usr/bin/env node
/**
 * PASS 95 - HUD / menu / lobby layout audit.
 *
 * One short, headless, installed-Chrome, native-WebGPU session that measures
 * the REAL laid-out geometry of every player-facing surface at three review
 * resolutions, instead of asserting on CSS source text. It answers three
 * questions the text contracts cannot:
 *
 *   1. Does any pair of HUD surfaces that must never touch actually overlap?
 *   2. Is any critical value or label below the readability floor the
 *      repository already promises (AGENTS.md: >= 9px status text,
 *      >= 12px primary actions and values at 1280x720)?
 *   3. Does any surface hang outside the viewport?
 *
 * It also samples Blink's own style/layout cost while the match runs, so the
 * "no per-frame recalc above 1.5 ms" budget is a measurement rather than a
 * claim. The sample uses CDP `Performance.getMetrics` deltas
 * (RecalcStyleDuration + LayoutDuration) divided by the frames presented in
 * the same window.
 *
 * ONE match deploy, three viewport sizes: resizing is what a responsive HUD
 * has to survive, and re-deploying per resolution would blow the session
 * time box for no extra signal.
 *
 * Usage:
 *   node scripts/qa/audit-hud-menu-layout.mjs --label before --out <dir>
 * Exit code is non-zero when a finding is present, so it can gate.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const label = flag('label', 'audit');
const base = process.env.BASE_URL ?? `http://127.0.0.1:${process.env.QA_PORT ?? '4261'}`;
const outDir = resolve(process.cwd(), flag('out', 'docs/evidence/pass95/hud-menu-polish'));
const arena = flag('arena', 'nuketown2');
mkdirSync(outDir, { recursive: true });

/** The three review resolutions named in the pass brief. */
const VIEWPORTS = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1440', width: 2560, height: 1440 },
];

/**
 * HUD surfaces measured every run. `critical` marks a surface that carries a
 * decision (ammo, health, objective, minimap); those get the strict floor.
 */
const HUD_SURFACES = [
  { selector: '.hud-mission-console', role: 'objectives', critical: true },
  { selector: '.hud-map-console', role: 'minimap', critical: true },
  { selector: '.hud-operator-console', role: 'health', critical: true },
  { selector: '.hud-weapon-console', role: 'ammo', critical: true },
  { selector: '#support-block', role: 'killstreak', critical: false },
  { selector: '#killfeed', role: 'killfeed', critical: false },
  { selector: '#text-chat', role: 'chat', critical: false },
  { selector: '#crosshair', role: 'crosshair', critical: true },
  { selector: '#hitmarker', role: 'hitmarker', critical: false },
  { selector: '#damage-direction', role: 'damage-direction', critical: false },
  { selector: '#pickup-prompt', role: 'prompt', critical: false },
  { selector: '#objective', role: 'objective-text', critical: true },
  { selector: '#scoreline', role: 'scoreline', critical: true },
  { selector: '#timer', role: 'timer', critical: true },
];

/**
 * Pairs that must never overlap. The crosshair band is deliberately included
 * against every peripheral console: a surface that reaches the reticle is a
 * readability defect even when it is faint.
 */
const FORBIDDEN_OVERLAPS = [
  ['.hud-map-console', '#text-chat'],
  ['.hud-map-console', '#support-block'],
  ['.hud-map-console', '.hud-mission-console'],
  ['.hud-map-console', '#killfeed'],
  ['.hud-weapon-console', '#text-chat'],
  ['.hud-weapon-console', '.hud-operator-console'],
  ['.hud-weapon-console', '#support-block'],
  ['.hud-operator-console', '#text-chat'],
  ['.hud-mission-console', '#text-chat'],
  ['.hud-mission-console', '#killfeed'],
  ['#crosshair', '#text-chat'],
  ['#crosshair', '.hud-map-console'],
  ['#crosshair', '.hud-weapon-console'],
  ['#crosshair', '.hud-operator-console'],
  ['#crosshair', '#support-block'],
  ['#crosshair', '#killfeed'],
];

/** Menu / lobby surfaces measured before the match is deployed. */
const MENU_SURFACES = [
  { selector: '#map-selector', role: 'map-cards' },
  { selector: '#arena-title', role: 'arena-title' },
  { selector: '#solo', role: 'primary-action' },
  { selector: '#host', role: 'secondary-action' },
  { selector: '#join', role: 'secondary-action' },
  { selector: '#menu-showcase', role: 'preview' },
  { selector: '#network-status', role: 'status' },
  { selector: '#high-score-card', role: 'leaderboard' },
];

const MEASURE_SCRIPT = ({ surfaces, forbidden }) => {
  const read = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return { selector, present: false };
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible = style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number.parseFloat(style.opacity || '1') > 0.01
      && box.width > 0.5 && box.height > 0.5
      && !element.hasAttribute('hidden');
    let minFont = Number.POSITIVE_INFINITY;
    let maxFont = 0;
    if (visible) {
      const walk = element.querySelectorAll('*');
      const nodes = [element, ...walk];
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        const nodeStyle = getComputedStyle(node);
        if (nodeStyle.display === 'none' || nodeStyle.visibility === 'hidden') continue;
        const text = (node.textContent ?? '').trim();
        const ownText = Array.from(node.childNodes)
          .filter((child) => child.nodeType === 3)
          .map((child) => (child.textContent ?? '').trim())
          .join('');
        if (!text || !ownText) continue;
        const size = Number.parseFloat(nodeStyle.fontSize);
        if (Number.isFinite(size)) {
          minFont = Math.min(minFont, size);
          maxFont = Math.max(maxFont, size);
        }
      }
    }
    return {
      selector,
      present: true,
      visible,
      left: Math.round(box.left * 10) / 10,
      top: Math.round(box.top * 10) / 10,
      right: Math.round(box.right * 10) / 10,
      bottom: Math.round(box.bottom * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
      minFontPx: Number.isFinite(minFont) ? Math.round(minFont * 100) / 100 : null,
      maxFontPx: maxFont > 0 ? Math.round(maxFont * 100) / 100 : null,
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
    };
  };

  const measured = {};
  for (const surface of surfaces) measured[surface.selector] = read(surface.selector);

  const intersect = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0.5 && h > 0.5 ? Math.round(w * h) : 0;
  };

  const overlaps = [];
  for (const [a, b] of forbidden ?? []) {
    const boxA = measured[a];
    const boxB = measured[b];
    if (!boxA?.visible || !boxB?.visible) continue;
    const area = intersect(boxA, boxB);
    if (area > 0) overlaps.push({ a, b, areaPx2: area });
  }

  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const offscreen = [];
  for (const [selector, box] of Object.entries(measured)) {
    if (!box.visible) continue;
    if (box.left < -0.5 || box.top < -0.5 || box.right > viewport.width + 0.5 || box.bottom > viewport.height + 0.5) {
      offscreen.push({ selector, left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    }
  }

  return { viewport, surfaces: measured, overlaps, offscreen };
};

const browser = await chromium.launch({ headless: true, channel: 'chrome', args: [...SILENT_ARGS] });
const errors = [];
const report = {
  label,
  arena,
  capturedAt: new Date().toISOString(),
  base,
  backend: null,
  menu: {},
  hud: {},
  perf: null,
  findings: [],
  errors: [],
};

const hardKill = setTimeout(() => {
  console.error('audit-hud-menu-layout: hard kill at 4 minutes');
  browser.close().finally(() => process.exit(2));
}, 235_000);

try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });

  await page.goto(`${base}/?release=latest&renderer=webgpu&render=quality&seed=pass95-hud&previewTime=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

  // --- menu / lobby, three resolutions -------------------------------------
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(220);
    report.menu[viewport.name] = await page.evaluate(MEASURE_SCRIPT, { surfaces: MENU_SURFACES, forbidden: [] });
    await page.screenshot({ path: resolve(outDir, `${label}-menu-${viewport.name}.png`), animations: 'disabled' });
  }

  // --- deploy once ---------------------------------------------------------
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.waitForTimeout(1_200);

  report.backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);

  // --- Blink style/layout cost per presented frame -------------------------
  const client = await page.context().newCDPSession(page);
  await client.send('Performance.enable');
  const readMetrics = async () => {
    const { metrics } = await client.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
  };
  await page.evaluate(() => {
    window.__PASS95_FRAMES__ = 0;
    const tick = () => { window.__PASS95_FRAMES__ += 1; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const beforeMetrics = await readMetrics();
  const beforeFrames = await page.evaluate(() => window.__PASS95_FRAMES__);
  await page.waitForTimeout(6_000);
  const afterMetrics = await readMetrics();
  const afterFrames = await page.evaluate(() => window.__PASS95_FRAMES__);
  const frames = Math.max(1, afterFrames - beforeFrames);
  const recalcMs = ((afterMetrics.RecalcStyleDuration ?? 0) - (beforeMetrics.RecalcStyleDuration ?? 0)) * 1000;
  const layoutMs = ((afterMetrics.LayoutDuration ?? 0) - (beforeMetrics.LayoutDuration ?? 0)) * 1000;
  report.perf = {
    frames,
    recalcStyleMsPerFrame: Math.round((recalcMs / frames) * 1000) / 1000,
    layoutMsPerFrame: Math.round((layoutMs / frames) * 1000) / 1000,
    styleAndLayoutMsPerFrame: Math.round(((recalcMs + layoutMs) / frames) * 1000) / 1000,
    recalcStyleCountPerFrame: Math.round((((afterMetrics.RecalcStyleCount ?? 0) - (beforeMetrics.RecalcStyleCount ?? 0)) / frames) * 100) / 100,
    layoutCountPerFrame: Math.round((((afterMetrics.LayoutCount ?? 0) - (beforeMetrics.LayoutCount ?? 0)) / frames) * 100) / 100,
    budgetMsPerFrame: 1.5,
  };

  // --- attribution: the same sample with the HUD subtree removed ----------
  await page.evaluate(() => {
    const hud = document.querySelector('#hud');
    if (hud instanceof HTMLElement) hud.dataset.pass95Hidden = 'true';
    if (hud instanceof HTMLElement) hud.style.display = 'none';
  });
  await page.waitForTimeout(600);
  const hiddenBefore = await readMetrics();
  const hiddenFramesBefore = await page.evaluate(() => window.__PASS95_FRAMES__);
  await page.waitForTimeout(5_000);
  const hiddenAfter = await readMetrics();
  const hiddenFramesAfter = await page.evaluate(() => window.__PASS95_FRAMES__);
  const hiddenFrames = Math.max(1, hiddenFramesAfter - hiddenFramesBefore);
  const hiddenRecalc = ((hiddenAfter.RecalcStyleDuration ?? 0) - (hiddenBefore.RecalcStyleDuration ?? 0)) * 1000;
  const hiddenLayout = ((hiddenAfter.LayoutDuration ?? 0) - (hiddenBefore.LayoutDuration ?? 0)) * 1000;
  report.perf.hudHidden = {
    frames: hiddenFrames,
    recalcStyleMsPerFrame: Math.round((hiddenRecalc / hiddenFrames) * 1000) / 1000,
    layoutMsPerFrame: Math.round((hiddenLayout / hiddenFrames) * 1000) / 1000,
    styleAndLayoutMsPerFrame: Math.round(((hiddenRecalc + hiddenLayout) / hiddenFrames) * 1000) / 1000,
  };
  report.perf.hudAttributedMsPerFrame = Math.round(
    (report.perf.styleAndLayoutMsPerFrame - report.perf.hudHidden.styleAndLayoutMsPerFrame) * 1000,
  ) / 1000;
  await page.evaluate(() => {
    const hud = document.querySelector('#hud');
    if (hud instanceof HTMLElement) { hud.style.removeProperty('display'); delete hud.dataset.pass95Hidden; }
  });
  await page.waitForTimeout(500);

  // --- HUD, three resolutions ---------------------------------------------
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(320);
    report.hud[viewport.name] = await page.evaluate(MEASURE_SCRIPT, { surfaces: HUD_SURFACES, forbidden: FORBIDDEN_OVERLAPS });
    await page.screenshot({ path: resolve(outDir, `${label}-hud-${viewport.name}.png`), animations: 'disabled' });
  }
} finally {
  clearTimeout(hardKill);
  await browser.close();
}

report.errors = [...new Set(errors)];

// --- findings ---------------------------------------------------------------
for (const [viewportName, measurement] of Object.entries(report.hud)) {
  for (const overlap of measurement.overlaps) {
    report.findings.push({ kind: 'overlap', viewport: viewportName, detail: `${overlap.a} overlaps ${overlap.b} by ${overlap.areaPx2}px^2` });
  }
  for (const off of measurement.offscreen) {
    report.findings.push({ kind: 'offscreen', viewport: viewportName, detail: `${off.selector} extends outside the viewport` });
  }
  for (const surface of HUD_SURFACES) {
    const box = measurement.surfaces[surface.selector];
    if (!box?.visible || box.minFontPx === null) continue;
    // AGENTS.md readability contract at 1280x720: no text below 9px, and every
    // surface that carries a decision owns at least one value at 12px or more.
    if (box.minFontPx + 0.01 < 9) {
      report.findings.push({ kind: 'type-floor', viewport: viewportName, detail: `${surface.selector} renders ${box.minFontPx}px text, below the 9px floor` });
    }
    if (surface.critical && (box.maxFontPx ?? 0) + 0.01 < 12) {
      report.findings.push({ kind: 'type-ramp', viewport: viewportName, detail: `${surface.selector} carries no value at or above 12px (largest is ${box.maxFontPx}px)` });
    }
  }
}
for (const [viewportName, measurement] of Object.entries(report.menu)) {
  for (const off of measurement.offscreen) {
    report.findings.push({ kind: 'offscreen', viewport: viewportName, detail: `menu ${off.selector} extends outside the viewport` });
  }
  for (const surface of MENU_SURFACES) {
    const box = measurement.surfaces[surface.selector];
    if (!box?.visible || box.minFontPx === null) continue;
    if (box.minFontPx + 0.01 < 9) {
      report.findings.push({ kind: 'type-floor', viewport: viewportName, detail: `menu ${surface.selector} renders ${box.minFontPx}px text, below the 9px floor` });
    }
  }
}
if (report.perf && (report.perf.hudAttributedMsPerFrame ?? report.perf.styleAndLayoutMsPerFrame) > report.perf.budgetMsPerFrame) {
  report.findings.push({ kind: 'perf', viewport: '1920x1080', detail: `HUD-attributed style+layout ${report.perf.hudAttributedMsPerFrame ?? report.perf.styleAndLayoutMsPerFrame} ms/frame exceeds the 1.5 ms budget` });
}
if (report.backend !== 'webgpu') report.findings.push({ kind: 'backend', viewport: '-', detail: `expected native webgpu, got ${report.backend}` });
if (report.errors.length > 0) report.findings.push({ kind: 'console', viewport: '-', detail: report.errors.join(' | ') });

writeFileSync(resolve(outDir, `${label}-layout.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ label, backend: report.backend, perf: report.perf, findings: report.findings }, null, 2));
process.exitCode = report.findings.length > 0 ? 1 : 0;
