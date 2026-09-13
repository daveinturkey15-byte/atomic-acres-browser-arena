// HF-383 visual review: boot atomic-acres on the real WebGPU route in
// installed Chrome (same launch contract as verify-arena-boot-cdp.mjs), deploy
// into a solo match, teleport to street-level vantages and capture frames
// covering the decluttered street centre.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41977';
const OUT = 'artifacts/hf383-frames';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (error) => console.error('[hf383] pageerror:', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres', undefined, { timeout: 150000 });
console.log('[hf383] arena committed on WebGPU');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
console.log('[hf383] solo match started');
await new Promise((r) => setTimeout(r, 8000));

// Vantages: [name, x, z, yaw]. three.js forward at yaw 0 is -Z, so looking
// down +X (west end -> centre) is yaw -PI/2, down -X is +PI/2.
const shots = [
  { name: 'street-west', x: -25, z: 0, yaw: -Math.PI / 2 },
  { name: 'street-east', x: 25, z: 0, yaw: Math.PI / 2 },
  { name: 'canyon-flank', x: 16, z: -6.5, yaw: 1.704 },
  { name: 'midfield-cross', x: 0, z: -4.2, yaw: 0 },
];
for (const s of shots) {
  await page.evaluate((s) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(s.x, 1.7, s.z, s.yaw, 0);
  }, s);
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('[hf383] captured', s.name);
}
await browser.close();
console.log('[hf383] done ->', OUT);
