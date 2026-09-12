#!/usr/bin/env node
// HF-536 night-defects-3a — one-shot probe: what draws the SKY on nuketown2,
// and can it be replaced by a colour that exists nowhere else in the world?
//
// A colour-matched sky detector reports blue OBJECTS as holes (measured: the
// yard pool at (-6,3.48,4) produced a 1628 px "hole"). Repainting the
// background to a colour no material uses turns the test from a guess into a
// measurement, so this probe finds the nodes to hide.
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'http://127.0.0.1:4310');

const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0&tod=authored`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 180_000 });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
    const out = { background: null, fog: null, candidates: [], huge: [], total: 0 };
    if (!scene) return out;
    out.background = scene.background
      ? (scene.background.isColor ? `Color(${scene.background.getHexString?.() ?? '?'})` : scene.background.constructor?.name ?? 'unknown')
      : null;
    out.fog = scene.fog ? `${scene.fog.constructor?.name}(${scene.fog.color?.getHexString?.() ?? '?'})` : null;
    scene.traverse((node) => {
      if (!node.isMesh) return;
      out.total += 1;
      const name = (node.name || '').toLowerCase();
      if (/sky|backdrop|cloud|horizon|atmos|dome|firmament|celest/.test(name)) {
        out.candidates.push({ name: node.name, geometry: node.geometry?.type, side: node.material?.side, visible: node.visible });
      }
      if (node.geometry?.boundingSphere === null) node.geometry.computeBoundingSphere?.();
      const radius = node.geometry?.boundingSphere?.radius ?? 0;
      if (radius > 200) out.huge.push({ name: node.name, radius: Math.round(radius), geometry: node.geometry?.type });
    });
    return out;
  });
  console.log(JSON.stringify(info, null, 2));
} finally {
  await browser.close().catch(() => {});
}
