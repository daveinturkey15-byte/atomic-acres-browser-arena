#!/usr/bin/env node
// World-space ground truth for the NW landmark: wall/crate/trunk world
// positions (matrixWorld-decomposed) and the live player position.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41914';
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hfprobe2&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240_000 });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const out = [];
  const v = new (Object.getPrototypeOf(scene.position).constructor)();
  const visit = (node) => {
    if (node.name && /^farcrysis-(ruined-wall|crate|canopy-trunk|palm-trunk)-(nw|ne|sw|se)/.test(node.name)) {
      node.updateWorldMatrix(true, false);
      node.getWorldPosition(v);
      out.push({ name: node.name, world: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] });
    }
    node.children?.forEach(visit);
  };
  visit(scene);
  return out;
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
