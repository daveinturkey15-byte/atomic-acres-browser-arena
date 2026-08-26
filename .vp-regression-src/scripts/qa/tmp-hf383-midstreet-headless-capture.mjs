// TEMPORARY HF-383 verification (team atomic-acres-regression) - untracked.
// Headless installed Chrome gets a real hardware WebGPU device on this machine
// (GAUNTLET-SPEC failure-mode 2 table), so no headed browser slot is needed.
// Boots atomic-acres on the REAL WebGPU route, deploys solo, captures street
// frames covering the mid-street van staging, and probes the GPU adapter so a
// software-rasteriser run cannot masquerade as evidence.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41959';
const OUT = 'artifacts/hf383-midstreet-frames';
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
page.on('pageerror', (error) => console.error('[hf383] pageerror:', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });

// Adapter is not device: requestDevice() and check vendor. Microsoft vendor
// string means the software rasteriser - timings/frames then prove nothing.
const gpu = await page.evaluate(async () => {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) return { ok: false, reason: 'no adapter' };
  const device = await adapter.requestDevice();
  return { ok: Boolean(device), vendor: adapter.info?.vendor ?? 'unknown', architecture: adapter.info?.architecture ?? 'unknown' };
});
console.log('[hf383] webgpu device probe:', JSON.stringify(gpu));
if (!gpu.ok || String(gpu.vendor).toLowerCase() === 'microsoft') {
  console.error('[hf383] FATAL: no hardware WebGPU device - refusing to record evidence');
  await browser.close();
  process.exit(2);
}

await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres', undefined, { timeout: 150000 });
console.log('[hf383] arena committed on WebGPU');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
console.log('[hf383] solo match started');
await new Promise((r) => setTimeout(r, 8000));

// Vantages framing the mid-street vans at (+/-8.6, -/+1.5) against the bus
// [x -6.3..6.3]. three.js forward at yaw 0 is -Z; down +X is yaw -PI/2.
const shots = [
  { name: 'street-west-toward-bus', x: -25, z: 0, yaw: -Math.PI / 2 },
  { name: 'street-east-toward-bus', x: 25, z: 0, yaw: Math.PI / 2 },
  { name: 'east-van-north-flank', x: 8.6, z: -6, yaw: 0 },
  { name: 'midfield-cross-north', x: 0, z: -6.5, yaw: Math.PI },
  { name: 'overhead-street', x: 8.6, z: -4, yaw: -Math.PI / 2 },
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
