import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const output = process.env.OUTPUT_DIR ?? 'artifacts/pass29/browser';
const scenario = process.env.PASS29_SCENARIO ?? 'all';
const supportedScenarios = new Set(['all', 'ordinary-blender', 'forced-performance', 'compatibility']);
if (!supportedScenarios.has(scenario)) throw new Error(`Unknown PASS29_SCENARIO: ${scenario}`);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const evidence = {};

async function openProfile(query) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true && state?.originalArtLoaded === true;
  }, undefined, { timeout: 90_000 });
  return { page, errors, url: url.toString() };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  if (scenario === 'all' || scenario === 'ordinary-blender') {
    console.log('pass29-qa: ordinary Blender');
    const { page, errors, url } = await openProfile({ render: 'blender' });
    const result = await page.evaluate(() => ({
      rendererClass: document.documentElement.dataset.atomicSignalRenderer,
      render: window.__ATOMIC_ACRES_DEBUG__.snapshot().render,
    }));
    if (result.rendererClass === 'software') {
      assert(result.render.grass.enabled === false && result.render.grass.bypassReason === 'software-renderer', 'ordinary software Blender must bypass grass');
      assert(result.render.sky.godRayStrength === 0, 'ordinary software Blender must bypass god rays');
    } else {
      assert(result.render.grass.enabled === true, 'hardware Blender must enable grass');
      assert(result.render.sky.godRayStrength === 0.12, 'hardware Blender must enable bounded god rays');
    }
    assert(errors.length === 0, `ordinary Blender errors: ${JSON.stringify(errors)}`);
    evidence.ordinaryBlender = { url, rendererClass: result.rendererClass, grass: result.render.grass, sky: result.render.sky, errors };
    await page.close();
  }

  if (scenario === 'all' || scenario === 'forced-performance') {
    console.log('pass29-qa: forced Performance');
    const { page, errors, url } = await openProfile({ render: 'performance', grass: 'on', rays: 'on' });
    console.log('pass29-qa: forced Performance booted');
    await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setGrassTime(2.5);
    });
    await page.waitForFunction(() => {
      const render = window.__ATOMIC_ACRES_DEBUG__.snapshot().render;
      return render.grass.submissions > 0;
    }, undefined, { timeout: 90_000 });
    console.log('pass29-qa: forced Performance grass ready');
    const before = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      return { bend: debug.sampleGrassBend(0), random: debug.snapshot().random, render: debug.snapshot().render };
    });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setGrassTime(4.5));
    await page.waitForFunction(({ bendX, bendZ }) => {
      const bend = window.__ATOMIC_ACRES_DEBUG__.sampleGrassBend(0);
      return bend && (Math.abs(bend.bendX - bendX) > 0.001 || Math.abs(bend.bendZ - bendZ) > 0.001);
    }, before.bend, { timeout: 30_000 });
    console.log('pass29-qa: forced Performance wind changed');
    const afterWind = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      return { bend: debug.sampleGrassBend(0), random: debug.snapshot().random };
    });
    await page.evaluate(({ x, z }) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setGrassInteractionProbe(x, z);
    }, before.bend);
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__.sampleGrassBend(0)?.flatten > 0.99, undefined, { timeout: 30_000 });

    console.log('pass29-qa: forced Performance interaction changed');
    const final = await page.evaluate(() => ({
      bend: window.__ATOMIC_ACRES_DEBUG__.sampleGrassBend(0),
      snapshot: window.__ATOMIC_ACRES_DEBUG__.snapshot(),
    }));
    assert(before.bend.flatten === 0, 'remote grass sample must begin outside player influence');
    assert(afterWind.bend.bendX !== before.bend.bendX || afterWind.bend.bendZ !== before.bend.bendZ, 'wind time must change deterministic bend');
    assert(JSON.stringify(before.random) === JSON.stringify(afterWind.random), 'presentation time must not consume runtime RNG');
    assert(final.bend.flatten > 0.99, 'local player must bend nearby grass');
    assert(final.snapshot.render.grass.instances === 1_200
      && final.snapshot.render.grass.blades === 3_600
      && final.snapshot.render.grass.triangles === 21_600, 'Performance tapered-tuft grass budget mismatch');
    assert(final.snapshot.render.grass.chunks <= 4 && final.snapshot.render.grass.visibleChunks <= 4 && final.snapshot.render.grass.submissions <= 8, `Performance grass submission budget exceeded: ${JSON.stringify(final.snapshot.render.grass)}`);
    assert(final.snapshot.render.sky.godRayStrength === 0.08 && final.snapshot.render.sky.extraDraws === 0, 'Performance god-ray budget mismatch');
    assert(final.snapshot.render.atomicSignal.enabled === false
      && final.snapshot.render.atomicSignal.bypassReason === 'software-renderer', 'Performance software safety bypass must remain explicit');
    assert(final.snapshot.render.triangles <= 160_000, `Performance triangle budget exceeded: ${final.snapshot.render.triangles}`);
    assert(/^\d+$/.test(final.snapshot.render.fpsCounter.value), `FPS HUD is not numeric: ${final.snapshot.render.fpsCounter.value}`);
    assert(errors.length === 0, `forced Performance errors: ${JSON.stringify(errors)}`);

    evidence.forcedPerformance = {
      url,
      beforeBend: before.bend,
      afterWindBend: afterWind.bend,
      localBend: final.bend,
      grass: final.snapshot.render.grass,
      sky: final.snapshot.render.sky,
      calls: final.snapshot.render.calls,
      triangles: final.snapshot.render.triangles,
      fpsCounter: final.snapshot.render.fpsCounter,
      atomicSignal: final.snapshot.render.atomicSignal,
      contextLifecycle: final.snapshot.render.contextLifecycle,
      errors,
    };
    await page.close();
  }

  if (scenario === 'all' || scenario === 'compatibility') {
    console.log('pass29-qa: Compatibility');
    const { page, errors, url } = await openProfile({ render: 'compat' });
    const render = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render);
    assert(render.grass.enabled === false && render.grass.blades === 0 && render.grass.submissions === 0, 'Compatibility grass must be inert');
    assert(render.sky.godRayStrength === 0 && render.sky.godRayLobes === 0, 'Compatibility god rays must be inert');
    assert(render.lighting.routeLightCount === 0 && render.lighting.streetLightCount === 0 && render.lighting.interiorLightCount === 0, 'Compatibility local-light budget must be zero');
    assert(errors.length === 0, `Compatibility errors: ${JSON.stringify(errors)}`);
    evidence.compatibility = { url, grass: render.grass, sky: render.sky, lighting: render.lighting, errors };
    await page.close();
  }

  const evidenceFile = scenario === 'all' ? 'verification.json' : `verification-${scenario}.json`;
  await writeFile(`${output}/${evidenceFile}`, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ pass29Environment: 'ok', output, scenario, profiles: Object.keys(evidence) }));
} finally {
  await browser.close();
}
