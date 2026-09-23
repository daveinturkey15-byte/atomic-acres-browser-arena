#!/usr/bin/env node
// Lane L — per-arena ART DIRECTION capture, on the REAL WebGPU route, at MAX.
//
// WHY THIS EXISTS. The owner's report was "the whole game artstyle looks the
// same", after two grading passes he could not see. A pass that claims to have
// changed how a place READS has to be judged on frames, side by side, not on a
// diff — and it has to be judged on the route he actually plays: WebGPU at the
// MAX preset, where sun shafts, SSR, SSGI, DOF and motion blur are all live.
//
// Three things make these frames trustworthy:
//   - HEADED installed Chrome over CDP with focus emulation. Headless Chromium
//     on this machine has no navigator.gpu at all, so a headless frame is
//     always the WebGL2 compat path and can never be WebGPU evidence.
//   - Deterministic ARENA REVIEW CAMERAS (fixed pose, fixedTimeMs 63000,
//     seed 6401, HUD hidden). A before/after pair taken from a free camera
//     proves nothing; these two frames differ ONLY by the grade.
//   - The MAX preset seeded into settings storage BEFORE first paint, with the
//     resolved preset read back out of the DOM into the receipt.
//
// It also measures each frame (mean channel levels, saturation, shadow mass,
// highlight mass, corner-vs-centre falloff) so the pair can be read
// mechanically as well as by eye — "obviously different" needs a number
// attached or it is just taste.
//
// Usage:
//   node scripts/qa/capture-lane-l-art-direction.mjs --url http://127.0.0.1:41893
//        --out artifacts/lane-l/after --label after [--arenas farcrysis,high-seas]
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41893');
const LABEL = arg('--label', 'after');
const OUT = resolve(process.cwd(), arg('--out', `artifacts/lane-l/${LABEL}`));
const PER_ARENA_MS = Number(arg('--per-arena', '420000'));
const SETTLE_MS = Number(arg('--settle', '2200'));
const BOOT_MS = Number(arg('--boot', '420000'));
const VIEWPORT_WIDTH = Number(arg('--width', '1920'));
const VIEWPORT_HEIGHT = Number(arg('--height', '1080'));

// One establishing camera (the first-five-seconds read) and one eye-level
// camera (the combat read, where crushed shadows and lost silhouettes show up)
// per arena. Ids come from each arena's reviewCameras in src/rendering/arenas.
const SHOTS = {
  'farcrysis': ['farcrysis-beach-golden', 'farcrysis-jungle-dapple'],
  'high-seas': ['high-seas-starboard-overview', 'high-seas-stern-main-deck'],
  'atomic-acres': ['nuke-town-overview', 'nuke-town-aqua-wall-closed'],
  'skyline-terminal': ['terminal-overview', 'terminal-concourse-wall-closed'],
  'rustworks-1v1': ['rustrig-overview', 'rustrig-deck-surface'],
  'gun-range': ['gun-range-overview', 'gun-range-neon-lanes'],
};

const ARENAS = arg('--arenas', Object.keys(SHOTS).join(','))
  .split(',').map((entry) => entry.trim()).filter(Boolean);

const SETTINGS_KEY = 'atomic-acres-pass65-settings-v1';

/**
 * Frame statistics. Everything is computed on the sRGB frame the owner sees,
 * because that is what "reads different" means; scene-linear numbers would
 * describe the pipeline rather than the picture.
 */
async function measure(file) {
  const image = sharp(file);
  const { width, height } = await image.metadata();
  const raw = await image.clone().removeAlpha().raw().toBuffer();
  let sumR = 0, sumG = 0, sumB = 0, sumSat = 0;
  let shadowMass = 0, highlightMass = 0;
  const lumaHistogram = new Uint32Array(256);
  const pixels = width * height;
  for (let index = 0; index < raw.length; index += 3) {
    const r = raw[index], g = raw[index + 1], b = raw[index + 2];
    sumR += r; sumG += g; sumB += b;
    const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
    sumSat += maximum === 0 ? 0 : (maximum - minimum) / maximum;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaHistogram[Math.min(255, Math.round(luma))] += 1;
    if (luma < 24) shadowMass += 1;
    if (luma > 232) highlightMass += 1;
  }
  const percentile = (fraction) => {
    let seen = 0;
    const target = pixels * fraction;
    for (let level = 0; level < 256; level += 1) {
      seen += lumaHistogram[level];
      if (seen >= target) return level;
    }
    return 255;
  };
  // Corner-vs-centre luminance is the vignette read: the periphery is where
  // enemies enter the frame, so it gets its own number rather than a verdict.
  const meanLumaOf = async (left, top, boxWidth, boxHeight) => {
    const region = await sharp(file)
      .extract({ left, top, width: boxWidth, height: boxHeight })
      .removeAlpha().raw().toBuffer();
    let total = 0;
    for (let index = 0; index < region.length; index += 3) {
      total += 0.2126 * region[index] + 0.7152 * region[index + 1] + 0.0722 * region[index + 2];
    }
    return total / (region.length / 3);
  };
  const box = Math.max(16, Math.round(Math.min(width, height) * 0.12));
  const centre = await meanLumaOf(
    Math.round(width / 2 - box / 2), Math.round(height / 2 - box / 2), box, box,
  );
  const corners = (await Promise.all([
    meanLumaOf(0, 0, box, box),
    meanLumaOf(width - box, 0, box, box),
    meanLumaOf(0, height - box, box, box),
    meanLumaOf(width - box, height - box, box, box),
  ])).reduce((total, value) => total + value, 0) / 4;
  const round = (value) => Number(value.toFixed(2));
  return {
    width, height,
    meanR: round(sumR / pixels), meanG: round(sumG / pixels), meanB: round(sumB / pixels),
    meanSaturation: round((sumSat / pixels) * 100),
    shadowMassPercent: round((shadowMass / pixels) * 100),
    highlightMassPercent: round((highlightMass / pixels) * 100),
    lumaP05: percentile(0.05), lumaP50: percentile(0.5), lumaP95: percentile(0.95),
    centreLuma: round(centre), cornerLuma: round(corners),
    cornerRetentionPercent: round(centre === 0 ? 100 : (corners / centre) * 100),
  };
}

mkdirSync(OUT, { recursive: true });

const launchBrowser = () => chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
let browser = await launchBrowser();
let page = await browser.newPage({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } });
// MAX has to be in storage before the first paint: the preset is read once at
// bootstrap, and a preset applied after the graph is built is a different code
// path from the one the owner boots into. `version: 1` is load-bearing — the
// profile store's legacy migration DROPS a settings blob without it and falls
// back to the capability default, which silently captures High instead.
// `--ssgi off` swaps MAX for the identical Custom set with screenSpaceGi
// disabled. It exists to ISOLATE a suspect effect, and any capture taken with
// it says so in its own receipt — a frame captured below MAX must never be
// filed as MAX evidence.
const PRESET = arg('--preset', 'max');
const SSGI_OFF = arg('--ssgi', 'on') === 'off';
const MAX_AS_CUSTOM = Object.freeze({
  renderScale: 1.15, adaptiveResolution: true, targetFps: 240, frameRateLimit: 0,
  antiAliasing: 'msaa-4x', geometryDetail: 'full', shadows: 'high', shadowResolution: 'high',
  shadowUpdateMode: 'dynamic', shadowFilter: 'auto', indirectLighting: 'high', ambientOcclusion: 'ultra',
  screenSpaceReflections: 'high', screenSpaceGi: 'high', reflectionQuality: 'ultra',
  environmentIntensity: 1, volumetricQuality: 'ultra', volumetricLightShafts: 'high', smokeQuality: 'ultra',
  particleQuality: 'ultra', anisotropy: 16, decalQuality: 'ultra', bloomQuality: 'cinematic',
  exposure: 1, toneMapping: 'aces', filmicProfile: 'arena-default', sharpness: 0, filmGrain: 0.4, vignette: 0.18,
  depthOfField: true, depthOfFieldStrength: 0.6, motionBlur: 0.35, spatialUpscaling: 'off',
  weatherIntensity: 'storm', rainDensity: 1.35, windStrength: 1, lightning: true,
});
const graphicsSeed = SSGI_OFF
  ? { schemaVersion: 1, preset: 'custom', ...MAX_AS_CUSTOM, screenSpaceGi: 'off' }
  : { schemaVersion: 1, preset: PRESET };
const seedSettings = () => page.addInitScript(([key, graphics]) => {
  window.localStorage.setItem(key, JSON.stringify({ version: 1, graphics }));
}, [SETTINGS_KEY, graphicsSeed]);
await seedSettings();
const errors = [];
const wirePage = async () => {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });
};
await wirePage();

const url = `${BASE}/?release=latest&renderer=webgpu&seed=lanel&previewTime=0`;
// The debug handle appears while bootstrap is still 'finalizing'. Calling
// startSolo before the terminal 'ready' stage wedges the match in warmup
// forever — which reads exactly like an arena that will not boot.
const bootStage = () => page.evaluate(() => {
  if (!window.__ATOMIC_ACRES_DEBUG__) return 'no-debug-handle';
  const bootstrap = window.__ATOMIC_ACRES_DEBUG__.snapshot()?.bootstrap;
  return bootstrap?.error ? `error:${String(bootstrap.error).slice(0, 120)}` : (bootstrap?.stage ?? 'unknown');
}).catch((error) => `evaluate-failed:${String(error).slice(0, 80)}`);

// A cold shader cache at MAX (1.15x supersample over MSAA 4x, SSGI, SSR, DOF)
// takes minutes on the first boot, so this polls and REPORTS the stage instead
// of dying on an opaque waitForFunction timeout.
const boot = async (deadlineMs = BOOT_MS) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const startedAt = Date.now();
  let stage = 'no-debug-handle';
  while (Date.now() - startedAt < deadlineMs) {
    stage = await bootStage();
    if (stage === 'ready') { await page.waitForTimeout(1_200); return; }
    if (stage.startsWith('error:')) break;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`Boot never reached 'ready' in ${Math.round((Date.now() - startedAt) / 1000)}s; last stage '${stage}'. Console: ${[...new Set(errors)].slice(0, 4).join(' | ')}`);
};

/** Surfaces the page console on ANY boot failure, crashes included. */
const bootOrReport = async (deadlineMs = BOOT_MS) => {
  try {
    await boot(deadlineMs);
  } catch (error) {
    console.error(`[lane-l] BOOT FAILED: ${String(error).slice(0, 200)}`);
    for (const line of [...new Set(errors)].slice(0, 12)) console.error(`[lane-l]   console: ${line}`);
    throw error;
  }
};

await bootOrReport();

const renderer = await page.evaluate(() => {
  const runtime = (() => {
    try { return window.__ATOMIC_ACRES_DEBUG__.snapshot()?.render?.runtime ?? null; } catch { return null; }
  })();
  return {
    backend: document.documentElement.dataset.renderBackend ?? null,
    graphicsPreset: document.documentElement.dataset.graphicsPreset ?? null,
    graphicsLiveProfile: document.documentElement.dataset.graphicsLiveProfile ?? null,
    renderProfile: document.documentElement.dataset.renderProfile ?? null,
    toneMapping: document.documentElement.dataset.graphicsToneMapping ?? null,
    webgpuAvailable: Boolean(navigator.gpu),
    actualBackend: runtime?.actualBackend ?? null,
    adapterLabel: runtime?.adapterLabel ?? null,
    softwareAdapter: runtime?.softwareAdapter ?? null,
    deviceFeatures: runtime?.deviceFeatures ?? null,
    // Evidence for the cold-pipeline flush allowance in render-runtime.ts: the
    // worst completion latency the runtime actually observed while building the
    // MAX render graph.
    maximumCompletionLatencyMs: runtime?.presentation?.progress?.maximumCompletionLatencyMs ?? null,
  };
});
console.error(`[lane-l] label=${LABEL} backend=${renderer.actualBackend ?? renderer.backend} preset=${renderer.graphicsPreset} adapter=${renderer.adapterLabel}`);
// Fail closed rather than quietly shipping High frames labelled MAX.
const expectedPreset = SSGI_OFF ? 'custom' : PRESET;
const fatal = renderer.graphicsPreset !== expectedPreset
  ? `Expected the ${expectedPreset.toUpperCase()} preset; the page resolved '${renderer.graphicsPreset}'.`
  : renderer.actualBackend !== 'webgpu'
    ? `Expected the WebGPU route; the page resolved '${renderer.actualBackend}'.`
    : null;
if (fatal) { await browser.close(); throw new Error(fatal); }

const report = {
  label: LABEL, base: BASE, out: OUT, capturedAt: new Date().toISOString(),
  preset: SSGI_OFF ? `${PRESET}-minus-ssgi (custom)` : PRESET,
  screenSpaceGi: SSGI_OFF ? 'off' : 'preset default',
  viewport: `${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}`,
  renderer, arenas: [], recoveries: [],
};
const reportFile = resolve(OUT, 'report.json');
// MERGE, do not clobber. A whole-sweep run is one long GPU session and this
// machine wedges partway through often enough that the reliable shape is one
// browser per arena; each invocation therefore folds its arenas into the
// report already on disk instead of replacing it.
if (existsSync(reportFile)) {
  try {
    const prior = JSON.parse(readFileSync(reportFile, 'utf8'));
    const keep = (prior.arenas ?? []).filter((entry) => !ARENAS.includes(entry.arena));
    report.arenas.push(...keep);
    report.recoveries.push(...(prior.recoveries ?? []));
  } catch { /* An unreadable prior report is replaced, not trusted. */ }
}
const writeReport = () => {
  report.arenas.sort((left, right) => left.arena.localeCompare(right.arena));
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + String.fromCharCode(10));
};

for (const arenaId of ARENAS) {
  const record = { arena: arenaId, shots: [], errors: [] };
  errors.length = 0;
  try {
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: PER_ARENA_MS });
    await page.waitForTimeout(SETTLE_MS);
    // Routing proof from the LIVE page. The atmosphere tint uniforms are the
    // one art-direction value that reaches the scene graph, so reading them
    // back proves this arena's direction actually drove this frame — a frame
    // that merely LOOKS different proves nothing about which code produced it.
    record.liveAtmosphereTints = await page.evaluate(() => {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph?.();
      if (!scene) return null;
      const read = (name) => {
        const node = scene.getObjectByName(name);
        const near = node?.userData?.tintNearUniform?.value;
        const far = node?.userData?.tintFarUniform?.value;
        const opacity = node?.userData?.opacityUniform?.value;
        if (!near || !far) return null;
        return {
          near: `#${near.getHexString()}`,
          far: `#${far.getHexString()}`,
          opacity: typeof opacity === 'number' ? Number(opacity.toFixed(4)) : null,
        };
      };
      return {
        mist: read('Pass 64 TSL mist'),
        smoke: read('Pass 64 TSL smoke'),
        dust: read('Pass 64 TSL deterministic dust'),
      };
    });
    for (const cameraId of SHOTS[arenaId] ?? []) {
      const applied = await page.evaluate(
        (id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id),
        cameraId,
      );
      if (!applied) { record.shots.push({ camera: cameraId, file: null, error: 'camera not found' }); continue; }
      await page.waitForTimeout(1_400);
      const file = resolve(OUT, `${arenaId}--${cameraId}.png`);
      await page.screenshot({ path: file });
      record.shots.push({ camera: cameraId, file, stats: await measure(file) });
      console.error(`[lane-l] ${LABEL} ${arenaId} ${cameraId}`);
    }
  } catch (error) {
    record.errors.push(String(error).slice(0, 300));
    // The deployment status line names the clause that refused the match. Without
    // it an admission failure is indistinguishable from a dead renderer, and the
    // two want completely different fixes.
    record.deploymentStatus = await page.evaluate(() => [...document.querySelectorAll('[id*=status], [class*=status]')]
      .map((element) => (element.textContent || '').trim())
      .filter((text) => /fail|error|cancel|exceed|retry/i.test(text))
      .slice(0, 3)).catch(() => null);
  }
  record.maximumCompletionLatencyMs = await page.evaluate(() => {
    try {
      return window.__ATOMIC_ACRES_DEBUG__.snapshot()?.render?.runtime?.presentation?.progress
        ?.maximumCompletionLatencyMs ?? null;
    } catch { return null; }
  }).catch(() => null);
  record.consoleErrors = [...new Set(errors)];
  report.arenas.push(record);
  // Write after EVERY arena. A GPU-process crash five arenas into a sweep used
  // to throw away the four that had already succeeded, which is how an hour of
  // capture returns nothing.
  writeReport();
  if (arenaId !== ARENAS[ARENAS.length - 1]) {
    try {
      await bootOrReport();
    } catch {
      // A crashed page cannot be re-navigated. Rebuild the browser so one bad
      // arena costs one arena rather than the whole sweep.
      report.recoveries.push(arenaId);
      console.error(`[lane-l] page died after ${arenaId}; rebuilding the browser`);
      await browser.close().catch(() => {});
      browser = await launchBrowser();
      page = await browser.newPage({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } });
      await seedSettings();
      await wirePage();
      await bootOrReport();
    }
  }
}

await browser.close().catch(() => {});
writeReport();
console.log(reportFile);
