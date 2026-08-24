// arena-fidelity lane scratch QA: capture farcrysis gameplay frames on the
// REAL WebGPU route in installed Chrome (headed, focus-emulated) and save PNGs
// for human/agent inspection. Based on scripts/qa/capture-visual-review.mjs.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41913';
const OUT = resolve('.gauntlet-tmp/farcrysis-frames');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=farcrysis-frames&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('backend:', backend);

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });

for (const [label, ms] of [['spawn-3s', 3000], ['mid-10s', 7000], ['late-20s', 10000]]) {
  await page.waitForTimeout(ms);
  const file = resolve(OUT, `farcrysis-${label}.png`);
  await page.screenshot({ path: file });
  console.log('saved', file);
}

const snap = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return { matchPhase: s.matchPhase, position: s.player?.position ?? null };
});
console.log(JSON.stringify(snap));
console.log('consoleErrors:', JSON.stringify([...new Set(errors)].slice(0, 8)));
await browser.close();
