#!/usr/bin/env node
// Measures whether the ARENA SUN's shadow render target survives a LIVE
// graphics-preset round trip (high -> performance -> high) on the real route
// under test, driven over CDP in installed Chrome.
//
// WHY THIS EXISTS. legacy-main.ts applyLiveGraphicsSettings() used to dispose
// and null sunLight.shadow.map whenever the configured size changed while a
// map existed. On the WebGPU route that target is OWNED by three's ShadowNode
// (three.webgpu.js setupShadow() assigns BOTH ShadowNode.shadowMap AND
// light.shadow.map to the SAME render target, and renderShadow() resizes it
// itself every frame). setupShadow() only re-runs on a shadow-TYPE change, so
// after one live size change light.shadow.map stayed NULL FOR THE SESSION,
// GodraysNode.setup() then dereferenced light.shadow.map.depthTexture on the
// next shaft rebuild, three swallowed the throw, and composited a default
// NodeMaterial as the shaft light — the exact HF-401 failure class, reachable
// from the OPTIONS screen.
//
// What it measures, per backend:
//   sun.castShadow / shadow.map presence / map width / configured mapSize,
//   sampled at boot, after switching to the low preset, and after switching
//   back; plus every console/page error (the swallowed TSL failure logs as
//   "THREE.TSL: ...").
//
// Expected verdicts:
//   webgpu AFTER fix : final castShadow=true, map NOT null, no new TSL error.
//   webgl2 AFTER fix : mid-trip map disposed (null), final map RE-ALLOCATED by
//                      WebGLShadowMap at the new size (width === mapSize).
//
// Usage:
//   node scripts/qa/verify-shadow-map-live-preset-cdp.mjs \
//        --url http://127.0.0.1:41922 [--renderer webgpu|webgl2] \
//        [--render quality|blender] [--arena atomic-acres] \
//        [--low performance] [--high high] [--out artifacts/qa/x.json]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41922');
const RENDERER = arg('--renderer', 'webgpu');
const RENDER = arg('--render', RENDERER === 'webgl2' ? 'blender' : 'quality');
const ARENA = arg('--arena', 'atomic-acres');
const LOW = arg('--low', 'performance');
const HIGH = arg('--high', 'high');
const OUT = arg('--out', `artifacts/qa/shadow-map-live-preset-${RENDERER}.json`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const consoleLines = [];
page.on('pageerror', (error) => consoleLines.push({ kind: 'pageerror', text: String(error).slice(0, 300) }));
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleLines.push({ kind: message.type(), text: message.text().slice(0, 300) });
  }
});

const url = `${BASE}/?release=latest&renderer=${RENDERER}&render=${RENDER}&seed=shadowprobe&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
const servedBundle = await page.evaluate(() => {
  const entry = performance.getEntriesByType('resource')
    .map((resource) => resource.name)
    .find((name) => name.includes('/legacy-main-'));
  return entry ? entry.slice(entry.lastIndexOf('/')) : null;
});

// The sun is the only casting directional light in the gameplay scene.
const sampleSun = () => page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  let sun = null;
  scene.traverse((node) => { if (!sun && node.isDirectionalLight && node.castShadow) sun = node; });
  const renderState = window.__ATOMIC_ACRES_DEBUG__.snapshot().render ?? {};
  const schedule = {
    shadowsEnabled: renderState.shadows ?? null,
    shadowAutoUpdate: renderState.shadowAutoUpdate ?? null,
    shadowNeedsUpdate: renderState.shadowNeedsUpdate ?? null,
  };
  if (!sun) return { found: false, schedule };
  return {
    found: true,
    castShadow: sun.castShadow,
    mapNull: sun.shadow.map === null,
    mapWidth: sun.shadow.map ? sun.shadow.map.width : null,
    mapSizeConfigured: sun.shadow.mapSize.width,
    lightAutoUpdate: sun.shadow.autoUpdate,
    lightNeedsUpdate: sun.shadow.needsUpdate,
    schedule,
  };
});

const switchPreset = async (preset) => {
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.openMenu());
  await page.waitForSelector('#menu-tab-options', { state: 'visible', timeout: 30_000 });
  await page.click('#menu-tab-options');
  await page.selectOption('#graphics-profile', preset);
  // Committing the transaction leaves the options surface and flushes
  // pendingGraphicsPreset through flushPendingGraphics -> applyLiveGraphicsSettings.
  await page.click('#graphics-save');
  await page.waitForFunction((wanted) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.settings?.requested?.graphics?.preset === wanted
      && snapshot.settings?.liveApplication != null;
  }, preset, { timeout: 60_000 });
  // #graphics-save commits but does NOT close the menu, and the WebGL2
  // presentation pauses behind it (an armed shadow.needsUpdate is never
  // consumed while the menu is open — measured). Escape returns to play so
  // the samples below observe LIVE frames, exactly like the player path.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => {
    const menu = document.querySelector('#menu');
    return Boolean(menu?.classList.contains('hidden'));
  }, undefined, { timeout: 30_000 });
};

mkdirSync(resolve('artifacts/qa'), { recursive: true });
mkdirSync(resolve('artifacts/qa/shadow-probe'), { recursive: true });
const shotPrefix = `artifacts/qa/shadow-probe/${RENDERER}-${ARENA}`;

try {
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });

  // Let several presented frames run so ShadowNode.setupShadow has definitely
  // allocated its target and any shaft stage has built.
  await page.waitForTimeout(3_000);

  const atBoot = await sampleSun();
  await page.screenshot({ path: `${shotPrefix}-boot.png` });
  const errorsAtBoot = consoleLines.length;

  await switchPreset(LOW);
  await page.waitForTimeout(1_500);
  const atLow = await sampleSun();
  await page.screenshot({ path: `${shotPrefix}-low.png` });
  const errorsAtLow = consoleLines.length;

  await switchPreset(HIGH);
  // Several frames so the shadow node renders again and any shaft rebuild runs.
  await page.waitForTimeout(3_000);
  const backAtHigh = await sampleSun();
  await page.screenshot({ path: `${shotPrefix}-restored.png` });

  const tslErrors = consoleLines.filter((line) => line.text.includes('TSL')).slice(0, 6);
  const result = {
    url: BASE,
    backend,
    rendererQuery: RENDERER,
    renderQuery: RENDER,
    servedBundle,
    arena: ARENA,
    presets: { low: LOW, high: HIGH },
    samples: { atBoot, atLow, backAtHigh },
    newErrorsAfterRoundTrip: consoleLines.length - errorsAtBoot,
    tslErrors,
    allErrorsTail: consoleLines.slice(-8),
  };

  // Verdicts are backend-specific and mechanical; nothing here loosens any
  // existing contract — it only pins NEW behaviour.
  const issues = [];
  if (!atBoot.found || !backAtHigh.found) issues.push('sun-not-found-in-scene-graph');
  if (backend !== RENDERER) issues.push(`backend-mismatch:${backend}`);
  if (backAtHigh.found) {
    if (!backAtHigh.castShadow) issues.push('restored-preset-left-shadows-off');
    if (backAtHigh.mapNull) issues.push('shadow-map-still-null-after-roundtrip');
    else if (backAtHigh.mapSizeConfigured !== backAtHigh.mapWidth && RENDERER !== 'webgl2') {
      // WebGPU's ShadowNode resizes its own target in-place each frame, so a
      // healthy target matches the configured size exactly.
      issues.push(`shadow-map-size-drift:${backAtHigh.mapWidth}!=${backAtHigh.mapSizeConfigured}`);
    }
  }
  if (tslErrors.some((line) => line.text.includes('depthTexture'))) issues.push('swallowed-tsl-depthtexture-error');

  result.verdict = issues.length === 0 ? 'PASS' : 'FAIL';
  result.issues = issues;
  writeFileSync(resolve(OUT), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: result.verdict, backend, issues, samples: result.samples }, null, 2));
} finally {
  await browser.close();
}
