// Repair-round visual review: boot atomic-acres on the real WebGPU route in
// INSTALLED Chrome, headless (real hardware WebGPU device; no browser slot
// needed). Captures the re-staged side-verge cross-runs (HF-383 seam repair)
// from street and verge vantages. Derived from capture-hf383-declutter.mjs.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41977';
const OUT = 'artifacts/hf383-repair-frames';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
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
page.on('pageerror', (error) => console.error('[repair] pageerror:', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383repair&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });

// Prove the renderer is REAL WebGPU on real hardware before trusting frames.
const gpu = await page.evaluate(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { ok: false, reason: 'no adapter' };
  const device = await adapter.requestDevice();
  if (!device) return { ok: false, reason: 'no device', vendor: adapter.info?.vendor };
  return { ok: true, vendor: adapter.info?.vendor, architecture: adapter.info?.architecture };
});
console.log('[repair] webgpu probe:', JSON.stringify(gpu));
if (!gpu.ok) {
  console.error('[repair] FAIL: no usable WebGPU device - frames would not be evidence');
  await browser.close();
  process.exit(1);
}

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres', undefined, { timeout: 150000 });
console.log('[repair] arena committed on WebGPU');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
console.log('[repair] solo match started');
await new Promise((r) => setTimeout(r, 8000));

// Vantages covering both moved side-verge runs (now centred x=+-27.9,
// z=+-17.75) and the corner seams they must seal.
const shots = [
  { name: 'east-verge-south', x: 27.5, z: -26, yaw: Math.PI },      // looking north down east verge
  { name: 'east-corner-seam', x: 24.6, z: -22, yaw: -2.2 },         // rear pocket walk-in view
  { name: 'west-verge-north', x: -27.5, z: 26, yaw: 0 },            // looking south down west verge
  { name: 'west-corner-seam', x: -24.6, z: 22, yaw: -0.9 },
  { name: 'street-west', x: -25, z: 0, yaw: -Math.PI / 2 },
];
for (const s of shots) {
  await page.evaluate((s) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(s.x, 1.7, s.z, s.yaw, 0);
  }, s);
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('[repair] captured', s.name);
}
await browser.close();
console.log('[repair] done ->', OUT);
