#!/usr/bin/env node
// Ground truth: enumerate the live farcrysis landmark objects (ruin walls,
// crates, canopy trunks, hedges) with world positions, and the player position.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41914';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hfprobe&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240_000 });

const report = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const found = {};
  const visit = (node) => {
    if (node.name && node.name.startsWith('farcrysis-')) {
      for (const prefix of ['farcrysis-ruined-wall', 'farcrysis-crate', 'farcrysis-canopy-trunk', 'farcrysis-canopy-undergrowth', 'farcrysis-ruin-rubble']) {
        if (node.name.startsWith(prefix)) {
          (found[prefix] ??= []).push({
            name: node.name,
            p: node.position ? [+node.position.x.toFixed(2), +node.position.y.toFixed(2), +node.position.z.toFixed(2)] : null,
          });
        }
      }
    }
    node.children?.forEach(visit);
  };
  visit(scene);
  return found;
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
