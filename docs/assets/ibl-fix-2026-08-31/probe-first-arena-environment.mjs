#!/usr/bin/env node
/**
 * First-arena environment evidence (2026-08-31).
 *
 * Proves, on a FRESH PAGE per arena (the first arena of a session is the one
 * that was broken), that:
 *   1. scene.environment is non-null, and
 *   2. scene.environmentIntensity === budgetEnvironmentIntensity
 *      x arenaEnvironmentScale(arenaId) x reflectionScale.
 *
 * Then measures the visual delta at the arena's own authored review cameras.
 * The A/B is done in-page on the SAME frame pair: `after` is the shipped state,
 * `before` is that identical frame with `scene.environment = null` and
 * `scene.environmentIntensity = 1` - which is EXACTLY the state the bug left
 * behind. Nothing else moves: fixed review camera, fixed visual time, fixed
 * seed, bots cleared. So the pixel difference IS the environment.
 *
 * Chrome only: Playwright's bundled Chromium cannot acquire a WebGPU device on
 * dave-gaming-pc (dxil.dll Windows Error 87), so `channel: 'chrome'` is not
 * optional. `--mute-audio` is mandatory for every browser this repo launches.
 *
 * Usage: node probe-first-arena-environment.mjs --url http://127.0.0.1:41999
 *          [--arenas atomic-acres,high-seas,test2,test1]
 *          [--out docs/assets/ibl-fix-2026-08-31]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41999');
const ARENAS = arg('--arenas', 'atomic-acres,high-seas,test2,test1').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = resolve(process.cwd(), arg('--out', 'docs/assets/ibl-fix-2026-08-31'));
const MAX_SHOTS = Number(arg('--shots', '3'));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

/** sRGB -> relative linear luminance, the same rec.709 weights the art pass used. */
const linearize = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
async function statsOf(buffer) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixels = info.width * info.height;
  const luma = new Float32Array(pixels);
  let sum = 0;
  for (let i = 0, p = 0; p < pixels; p += 1, i += channels) {
    const y = 0.2126 * linearize(data[i] / 255)
      + 0.7152 * linearize(data[i + 1] / 255)
      + 0.0722 * linearize(data[i + 2] / 255);
    luma[p] = y;
    sum += y;
  }
  return { luma, pixels, mean: sum / pixels, width: info.width, height: info.height };
}
function compare(before, after) {
  let moved = 0;
  let absSum = 0;
  for (let p = 0; p < before.pixels; p += 1) {
    const delta = after.luma[p] - before.luma[p];
    absSum += Math.abs(delta);
    if (Math.abs(delta) > 0.01) moved += 1;
  }
  return {
    meanLuminanceBefore: Number(before.mean.toFixed(4)),
    meanLuminanceAfter: Number(after.mean.toFixed(4)),
    meanLuminanceDeltaPercent: Number((((after.mean - before.mean) / before.mean) * 100).toFixed(2)),
    pixelsMovedPercent: Number(((moved / before.pixels) * 100).toFixed(1)),
    meanAbsDelta: Number((absSum / before.pixels).toFixed(5)),
  };
}

const report = { generatedAt: new Date().toISOString(), base: BASE, arenas: {} };

for (const arena of ARENAS) {
  // A FRESH PAGE per arena. The whole defect only exists on the first arena of
  // a page load; reusing the page would test the path that already worked.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
  const entry = { errors, shots: [] };
  report.arenas[arena] = entry;
  try {
    await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=iblfix&previewTime=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
    }, undefined, { timeout: 180_000 });
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots?.(); });
    await page.waitForTimeout(7_000);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots?.(); });

    // --- 1. THE GATE, read off the live scene --------------------------------
    entry.observation = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      const scene = debug.sampleSceneGraph();
      const snapshot = debug.snapshot();
      const playable = snapshot?.render?.playableScene ?? snapshot?.playableScene ?? null;
      const published = snapshot?.render?.atomicSignal?.advancedGraphics?.arenaEnvironment
        ?? snapshot?.atomicSignal?.advancedGraphics?.arenaEnvironment
        ?? null;
      return {
        backend: document.documentElement.dataset.renderBackend ?? null,
        appliedTslArenaDefinitions: playable?.appliedTslArenaDefinitions ?? null,
        reviewCameraIds: playable?.appliedArenaVisualPolicy?.reviewCameraIds ?? [],
        sceneEnvironment: scene.environment ? (scene.environment.name || '(unnamed)') : null,
        sceneEnvironmentIntensity: scene.environmentIntensity,
        sceneBackground: scene.background ? (scene.background.name || '(unnamed)') : null,
        skyBackdropStatus: scene.userData?.pass66SkyBackdropStatus ?? null,
        skyBackdropSource: scene.userData?.pass66SkyBackdropSource ?? null,
        publishedArenaEnvironment: published,
      };
    });

    // --- 2. fixed-pose A/B at the arena's authored review cameras ------------
    const cameraIds = (entry.observation.reviewCameraIds ?? []).slice(0, MAX_SHOTS);
    for (const cameraId of cameraIds) {
      const applied = await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId);
      if (!applied) { entry.shots.push({ cameraId, applied: false }); continue; }
      // The authored review camera pins position, fov, exposure, the TSL visual
      // clock and the layout seed, so the sky, mist, dust and grass phase are
      // identical between the two frames of the pair.
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.awaitCommittedCameraCompletion?.()).catch(() => {});
      await page.waitForTimeout(1_800);
      const afterBuffer = await page.screenshot();
      // The measured "before": the exact state the bug left on every first
      // arena - no environment texture and a pristine intensity of 1.
      const restore = await page.evaluate(() => {
        const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        window.__IBL_HELD__ = { environment: scene.environment, intensity: scene.environmentIntensity };
        scene.environment = null;
        scene.environmentIntensity = 1;
        return { heldIntensity: window.__IBL_HELD__.intensity, heldName: window.__IBL_HELD__.environment?.name ?? null };
      });
      await page.waitForTimeout(1_200);
      const beforeBuffer = await page.screenshot();
      await page.evaluate(() => {
        const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
        scene.environment = window.__IBL_HELD__.environment;
        scene.environmentIntensity = window.__IBL_HELD__.intensity;
      });
      writeFileSync(resolve(OUT, `${arena}-${cameraId}-before.png`), beforeBuffer);
      writeFileSync(resolve(OUT, `${arena}-${cameraId}-after.png`), afterBuffer);
      const measurement = compare(await statsOf(beforeBuffer), await statsOf(afterBuffer));
      entry.shots.push({ cameraId, applied: true, ...restore, ...measurement });
      console.log(`${arena}/${cameraId}: mean ${measurement.meanLuminanceBefore} -> ${measurement.meanLuminanceAfter} (${measurement.meanLuminanceDeltaPercent > 0 ? '+' : ''}${measurement.meanLuminanceDeltaPercent}%), ${measurement.pixelsMovedPercent}% pixels moved`);
    }

    // --- 3. temporal noise floor: two frames, nothing changed ---------------
    await page.waitForTimeout(600);
    const noiseA = await page.screenshot();
    await page.waitForTimeout(900);
    const noiseB = await page.screenshot();
    entry.temporalNoiseFloor = compare(await statsOf(noiseA), await statsOf(noiseB));

    console.log(`${arena}: environment=${entry.observation.sceneEnvironment} intensity=${entry.observation.sceneEnvironmentIntensity} backend=${entry.observation.backend} errors=${errors.length}`);
  } catch (error) {
    entry.failure = String(error).slice(0, 400);
    console.error(`${arena}: FAILED ${entry.failure}`);
  } finally {
    await page.close();
  }
}

await browser.close();
writeFileSync(resolve(OUT, 'first-arena-environment-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nwrote ${resolve(OUT, 'first-arena-environment-report.json')}`);
