#!/usr/bin/env node
// ===========================================================================
// LIGHT-GRAPH CHURN PROBE. The causal step behind the attribution profile.
//
// WHAT THE PROFILE SHOWED (scripts/qa/profile-combat-stall-attribution-cdp.mjs)
// ---------------------------------------------------------------------------
// A family of three.js node-system functions appears ONLY inside the frozen
// milliseconds and never outside them: NodeBuilder build / analyze / setup /
// getHash / generateNodeType / generate / getInputType / _getChildren. That is
// TSL NodeMaterial PROGRAM CONSTRUCTION, running during gameplay frames -
// alongside `(program)` (V8-external time, where the backend shader compile
// lands) and a GC tail.
//
// A node-builder state is cached per render object under a cache key. Rebuilds
// mid-match therefore mean the KEY CHANGED. In three r185 that key includes the
// visible LIGHT GRAPH: add or remove one light from the render list and every
// render object's cached program is invalidated at once, which is exactly the
// shape of a periodic multi-hundred-millisecond freeze during combat and a
// quiet one while idle. The build's own prewarm was written against this rule -
// the presentation prewarm contract requires special-weapon lights to keep
// CONSTANT membership and idle at zero INTENSITY rather than toggling
// `visible` - so the question is not whether the rule exists but which light
// escapes it.
//
// WHAT THIS PROBE DOES
// --------------------
// Walks the live scene every animation frame through
// __ATOMIC_ACRES_DEBUG__.sampleSceneGraph(), records the exact membership of
// the visible light set, and reports every transition with the light named and
// the animation-frame gap that followed it. If the hypothesis is right, the
// long gaps sit immediately after membership transitions and the churning
// lights are nameable. If it is wrong, membership is constant across the whole
// window and the freeze is something else - which is equally worth knowing
// before code changes.
//
// Headless installed Chrome, diagnostic only, no gate.
// ===========================================================================
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : fallback;
};
const DIST = resolve(arg('--dist', 'dist'));
const PORT = Number(arg('--port', '4192'));
const ARENA = arg('--arena', 'atomic-acres');
const SECONDS = Number(arg('--seconds', '45'));
const WARMUP_SECONDS = Number(arg('--warmup', '10'));
const IDLE = argv.includes('--idle');
const OUT = resolve(arg('--out', `artifacts/qa/stall-attribution/${arg('--label', 'light-churn')}.json`));
const BOOT_TIMEOUT_MS = 300_000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance',
  '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
if (!existsSync(join(DIST, 'index.html'))) throw new Error(`No build at ${DIST}`);

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^\/+/, '');
  const file = join(DIST, relative);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) { response.writeHead(404).end('nope'); return; }
  const body = readFileSync(file);
  response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store' });
  response.end(body);
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const report = { contract: 'light-graph-churn-probe-v1', measuredAt: new Date().toISOString(), arena: ARENA, idle: IDLE, dist: DIST };

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const url = new URL(`http://127.0.0.1:${PORT}/`);
  url.searchParams.set('release', 'latest');
  url.searchParams.set('renderer', 'webgpu');
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.waitForFunction(() => { const s = document.querySelector('#solo'); return s !== null && !s.disabled; }, undefined, { timeout: BOOT_TIMEOUT_MS });
  await page.evaluate((arena) => {
    document.querySelector(`.map-card[data-arena-id="${arena}"]`)?.click();
    const name = document.querySelector('#player-name');
    if (name) name.value = 'LightChurn';
  }, ARENA);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#solo').click());
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return Boolean(s && s.matchPhase === 'active' && s.gameStarted === true);
  }, undefined, { timeout: BOOT_TIMEOUT_MS });
  console.error('[light-churn] match active');
  await page.waitForTimeout(WARMUP_SECONDS * 1000);

  await page.evaluate(() => {
    const state = { transitions: [], raf: [], materialVersionChanges: [], frames: 0, maxLights: 0, minLights: Infinity };
    window.__LIGHT_PROBE__ = state;
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    // Membership as the renderer sees it: a light reaches the render list only
    // when it is a light, it is visible, and every ancestor is visible.
    const visibleLights = () => {
      const found = [];
      scene.traverseVisible((node) => {
        if (!node.isLight) return;
        found.push(`${node.type}:${node.name || '(unnamed)'}:${node.uuid.slice(0, 8)}`);
      });
      found.sort();
      return found;
    };
    // Material program version, sampled sparsely: a bumped `version` is an
    // explicit needsUpdate rebuild, a second and independent way to lose a
    // cached program.
    const materialVersions = new Map();
    const snapshotMaterials = () => {
      const seen = new Map();
      scene.traverse((node) => {
        const material = node.material;
        if (!material) return;
        const list = Array.isArray(material) ? material : [material];
        for (const entry of list) seen.set(entry.uuid, { name: entry.name || entry.type, version: entry.version });
      });
      return seen;
    };
    for (const [uuid, entry] of snapshotMaterials()) materialVersions.set(uuid, entry);

    let previous = visibleLights();
    state.initialLights = previous;
    let lastRafAt = performance.now();
    let sinceMaterialCheck = 0;
    const tick = (now) => {
      if (!state.running) return;
      const gapMs = now - lastRafAt;
      lastRafAt = now;
      state.raf.push(Math.round(gapMs * 100) / 100);
      state.frames += 1;
      const current = visibleLights();
      state.maxLights = Math.max(state.maxLights, current.length);
      state.minLights = Math.min(state.minLights, current.length);
      if (current.length !== previous.length || current.some((entry, index) => entry !== previous[index])) {
        const before = new Set(previous);
        const after = new Set(current);
        state.transitions.push({
          atMs: Math.round(now),
          gapBeforeMs: Math.round(gapMs * 100) / 100,
          added: current.filter((entry) => !before.has(entry)),
          removed: previous.filter((entry) => !after.has(entry)),
          count: current.length,
          // Filled in on the NEXT frame: the cost a membership change causes
          // lands in the frame after it, when the renderer rebuilds.
          gapAfterMs: null,
        });
        previous = current;
      }
      const pending = state.transitions[state.transitions.length - 1];
      if (pending && pending.gapAfterMs === null && pending.atMs !== Math.round(now)) pending.gapAfterMs = Math.round(gapMs * 100) / 100;
      sinceMaterialCheck += 1;
      if (sinceMaterialCheck >= 30) {
        sinceMaterialCheck = 0;
        for (const [uuid, entry] of snapshotMaterials()) {
          const prior = materialVersions.get(uuid);
          if (prior === undefined) { materialVersions.set(uuid, entry); state.materialVersionChanges.push({ atMs: Math.round(now), kind: 'new', name: entry.name, version: entry.version }); continue; }
          if (prior.version !== entry.version) {
            state.materialVersionChanges.push({ atMs: Math.round(now), kind: 'version', name: entry.name, from: prior.version, to: entry.version });
            materialVersions.set(uuid, entry);
          }
        }
      }
      requestAnimationFrame(tick);
    };
    state.running = true;
    requestAnimationFrame(tick);
  });

  if (!IDLE) {
    await page.evaluate(() => {
      let step = 0;
      let aliveCache = null;
      let deadSince = null;
      const api = window.__ATOMIC_ACRES_DEBUG__;
      const key = (type, code) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true })); } catch { /* refused */ } };
      window.__COMBAT_TIMER__ = setInterval(() => {
        step += 1;
        try {
          const menu = document.querySelector('#menu');
          if (menu !== null && !menu.classList.contains('hidden')) { document.querySelector('#resume')?.click(); return; }
          if (step % 40 === 0) { try { aliveCache = api.snapshot().player.alive; } catch { aliveCache = null; } }
          if (aliveCache === false) {
            if (deadSince === null) deadSince = performance.now();
            if (performance.now() - deadSince > 3000) { try { api.respawn(); } catch { /* refused */ } deadSince = null; }
            return;
          }
          deadSince = null;
          api.setMovement?.(true, step % 40 < 12);
          if (step % 20 === 0) key('keydown', 'KeyA');
          if (step % 20 === 6) key('keyup', 'KeyA');
          if (step % 20 === 10) key('keydown', 'KeyD');
          if (step % 20 === 16) key('keyup', 'KeyD');
          if (step % 25 === 0) { try { api.aimAtBot?.(); } catch { /* none */ } }
          if (step % 16 === 0) api.setTriggerHeld?.(true);
          if (step % 16 === 9) api.setTriggerHeld?.(false);
          if (step % 200 === 150) { try { api.reload?.(); } catch { /* refused */ } }
        } catch { /* keep driving */ }
      }, 50);
    });
  }

  await page.waitForTimeout(SECONDS * 1000);
  const state = await page.evaluate(() => {
    const probe = window.__LIGHT_PROBE__;
    probe.running = false;
    if (window.__COMBAT_TIMER__) clearInterval(window.__COMBAT_TIMER__);
    try { window.__ATOMIC_ACRES_DEBUG__.setTriggerHeld?.(false); } catch { /* gone */ }
    try { window.__ATOMIC_ACRES_DEBUG__.setMovement?.(false, false); } catch { /* gone */ }
    return { transitions: probe.transitions, raf: probe.raf, materialVersionChanges: probe.materialVersionChanges, frames: probe.frames, maxLights: probe.maxLights, minLights: probe.minLights, initialLights: probe.initialLights };
  });

  const gaps = state.raf.filter((gap) => gap > 0 && gap < 30000);
  const longGaps = gaps.filter((gap) => gap >= 100);
  const churn = new Map();
  for (const transition of state.transitions) {
    for (const entry of transition.added) churn.set(`+ ${entry}`, (churn.get(`+ ${entry}`) ?? 0) + 1);
    for (const entry of transition.removed) churn.set(`- ${entry}`, (churn.get(`- ${entry}`) ?? 0) + 1);
  }
  report.frames = state.frames;
  report.lights = { initial: state.initialLights, initialCount: state.initialLights.length, min: state.minLights, max: state.maxLights };
  report.transitionCount = state.transitions.length;
  report.transitionsPerMinute = Number(((state.transitions.length / SECONDS) * 60).toFixed(1));
  report.churnByLight = [...churn.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  report.transitions = state.transitions.slice(0, 200);
  report.materialVersionChanges = state.materialVersionChanges.slice(0, 200);
  report.rafGapSummary = {
    frames: gaps.length,
    longGapCount: longGaps.length,
    maxGapMs: gaps.length === 0 ? null : Math.max(...gaps),
    // The correlation. If a membership transition is what triggers the rebuild,
    // the frame gap RIGHT AFTER a transition is far above the ordinary one.
    meanGapAfterTransitionMs: state.transitions.length === 0 ? null
      : Number((state.transitions.filter((t) => t.gapAfterMs !== null).reduce((sum, t) => sum + t.gapAfterMs, 0) / Math.max(1, state.transitions.filter((t) => t.gapAfterMs !== null).length)).toFixed(1)),
    meanGapMs: gaps.length === 0 ? null : Number((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length).toFixed(1)),
  };
  console.error(`[light-churn] ${report.transitionCount} light-set transitions in ${SECONDS}s (${report.transitionsPerMinute}/min); lights ${state.minLights}..${state.maxLights}`);
  console.error(`[light-churn] mean rAF gap ${report.rafGapSummary.meanGapMs} ms; mean gap right after a transition ${report.rafGapSummary.meanGapAfterTransitionMs} ms`);
  for (const row of report.churnByLight.slice(0, 20)) console.error(`   ${String(row.count).padStart(4)}x ${row.label}`);
  console.error(`[light-churn] material version bumps: ${state.materialVersionChanges.length}`);
} finally {
  await browser.close();
  server.close();
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.error(`Wrote ${OUT}`);
