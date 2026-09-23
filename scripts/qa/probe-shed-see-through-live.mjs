#!/usr/bin/env node
// Live Gate-1 escape probe. It uses the scene's own Three.js module and the
// shipped debug hook only to drive the host state transition; no CPU clone of
// the browser geometry is used for the measured ray hits.

import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
if (argv.includes('--help')) {
  console.log(`Usage: node scripts/qa/probe-shed-see-through-live.mjs [--url http://127.0.0.1:4373] [--placement id] [--repro]`);
  process.exit(0);
}

const url = value('--url', 'http://127.0.0.1:4373');
const placementId = value('--placement', 'nuketown2-shed-north-yard');
const repro = argv.includes('--repro');
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 240)));
try {
  await page.goto(`${url}/?release=latest&renderer=webgpu&render=quality&seed=shed-live&previewTime=0`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true); });
  await page.waitForTimeout(2_000);
  const result = await page.evaluate(async ({ placementId: id, repro: runRepro }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const scene = debug.sampleSceneGraph();
    let shed = null;
    scene.traverse((node) => {
      if (!shed && node.userData?.placementId === id) shed = node;
    });
    if (!shed) return { verdict: 'FAIL', reason: 'shed-root-not-found', placementId: id };
    const shell = shed.getObjectByName('field-shed-damageable-shell');
    const door = shed.getObjectByName('field-shed-door-leaf');
    if (!shell || !door) return { verdict: 'FAIL', reason: 'shed-envelope-mesh-not-found', placementId: id };
    const resources = performance.getEntriesByType('resource').map((entry) => entry.name);
    const chunkUrl = resources.find((name) => /three\.webgpu[^/]*\.js/.test(name))
      ?? resources.find((name) => /vendor-three[^/]*\.js/.test(name));
    if (!chunkUrl) return { verdict: 'FAIL', reason: 'three-chunk-not-found', placementId: id };
    const three = await import(chunkUrl);
    if (typeof three.Raycaster !== 'function') return { verdict: 'FAIL', reason: 'raycaster-not-found', placementId: id };
    const sample = () => {
      shed.updateMatrixWorld(true);
      const origin = new three.Vector3(0, 1.6, 0).applyMatrix4(shed.matrixWorld);
      const rotation = new three.Quaternion().setFromRotationMatrix(shed.matrixWorld);
      const raycaster = new three.Raycaster(undefined, undefined, 0, 12);
      let escaped = 0;
      for (let index = 0; index < 20_400; index += 1) {
        const y = (index + 0.5) / 20_400;
        const radial = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = index * Math.PI * (3 - Math.sqrt(5));
        const direction = new three.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial)
          .applyQuaternion(rotation).normalize();
        raycaster.set(origin, direction);
        if (raycaster.intersectObjects([shell, door], true).length === 0) escaped += 1;
      }
      return {
        escaped,
        total: 20_400,
        fraction: escaped / 20_400,
        shellTriangles: shell.geometry.index ? shell.geometry.index.count / 3 : 0,
        doorTriangles: door.geometry.index ? door.geometry.index.count / 3 : 0,
      };
    };
    const intact = sample();
    let mutations = [];
    if (runRepro) {
      for (let index = 0; index < 3; index += 1) mutations.push(debug.bulletHitShed(id, 'wall-east', 30, 300));
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    const reproSample = runRepro ? sample() : null;
    const snapshot = debug.snapshot();
    const sheds = snapshot.interactiveWorld?.envelope?.sheds ?? snapshot.interactiveWorld?.sheds ?? [];
    const current = Array.isArray(sheds) ? sheds.find((candidate) => candidate.placementId === id) : null;
    const east = current?.surfaces?.find((surface) => surface.surfaceId === 'wall-east') ?? null;
    return {
      verdict: 'PASS',
      placementId: id,
      intact,
      repro: reproSample,
      mutationCount: mutations.length,
      mutationResults: mutations.map((mutation) => ({ accepted: mutation?.accepted ?? null, reason: mutation?.reason ?? null })),
      discriminator: east ? { stage: east.stage, apertures: east.apertures?.length ?? null, detachedChunkIds: current?.detachedChunkIds ?? [] } : null,
      pageErrors: [],
    };
  }, { placementId, repro });
  result.pageErrors = pageErrors;
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.verdict === 'PASS' ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ verdict: 'FAIL', error: String(error), pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
