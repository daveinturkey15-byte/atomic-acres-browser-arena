// HF-393/HF-394 visual review: boot farcrysis on the real WebGPU route in
// installed Chrome (same launch contract as verify-arena-boot-cdp.mjs), deploy
// into a solo match, teleport to shoreline vantages and capture frames of the
// reshaped wade shelf and depth-blended water.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41910';
const OUT = 'artifacts/hf393-water-frames';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
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
page.on('pageerror', (error) => console.error('[hf393] pageerror:', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf393&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('[hf393] backend =', backend);
if (!backend || !backend.toLowerCase().includes('webgpu')) {
  console.error('[hf393] NOT on WebGPU — aborting rather than reporting a fake pass');
  await browser.close();
  process.exit(2);
}
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'farcrysis', undefined, { timeout: 150000 });
console.log('[hf393] arena committed on WebGPU');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
console.log('[hf393] solo match started');
await new Promise((r) => setTimeout(r, 8000));

// Vantages down the -z beach centreline (yaw 0 looks toward -Z):
//   beach-waterline : dry sand at the flatten seam (dist 14), eye height
//   wade-shelf      : chest-deep on the envelope (dist ~6), eye just above surface
//   offshore-inward : beyond the wall face, looking back at the whole shore blend
const shots = [
  { name: 'beach-waterline', x: 0, y: 2.0, z: -50, yaw: 0 },
  { name: 'wade-shelf', x: 0, y: 1.1, z: -57.5, yaw: 0 },
  { name: 'offshore-inward', x: 0, y: 1.4, z: -68, yaw: Math.PI },
];
for (const s of shots) {
  await page.evaluate((s) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(s.x, s.y, s.z, s.yaw, 0);
  }, s);
  // Let gravity/plates/swim settle the capsule before capturing.
  await new Promise((r) => setTimeout(r, 2500));
  console.log('[hf393] captured', s.name);
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
}
await browser.close();
console.log('[hf393] done ->', OUT);
