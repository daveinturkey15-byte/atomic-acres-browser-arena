// HF-394 water review capture: boots the farcrysis arena on the real WebGPU route in installed headless Chrome, deploys into a solo match, teleports to four shoreline/offshore vantages and captures PNG frames of the reflective/refractive sea surface.
// Usage: node scripts/qa/capture-hf394-water.mjs
// Flags: none.
// Env: BASE_URL (default: http://127.0.0.1:41919) — base URL of the app to boot.
// Writes: artifacts/hf394-water-frames/{beach-waterline,wade-shelf,offshore-inward,offshore-high}.png (one PNG per vantage).
// Exit codes: 0 = all frames captured; 2 = page is not on the WebGPU backend (aborts before capture rather than reporting a fake pass).
// HF-394 visual review: boot farcrysis on the real WebGPU route in INSTALLED
// CHROME HEADLESS (real hardware WebGPU device, no governor browser slot —
// same launch contract as verify-arena-boot-cdp.mjs), deploy into a solo
// match, teleport to shoreline/offshore vantages and capture frames of the
// reflective/refractive sea surface (Fresnel sky reflection + depth-graded
// transmission from src/farcrysis-water-surface.ts).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41919';
const OUT = 'artifacts/hf394-water-frames';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  // Installed chrome HEADLESS gets a real WebGPU device here; Playwright's
  // bundled chromium does NOT (fails at requestDevice). Measured 2026-08-25.
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', 
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
page.on('pageerror', (error) => console.error('[hf394] pageerror:', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf394&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('[hf394] backend =', backend);
if (!backend || !backend.toLowerCase().includes('webgpu')) {
  console.error('[hf394] NOT on WebGPU — aborting rather than reporting a fake pass');
  await browser.close();
  process.exit(2);
}
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'farcrysis', undefined, { timeout: 150000 });
console.log('[hf394] arena committed on WebGPU');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
console.log('[hf394] solo match started');
await new Promise((r) => setTimeout(r, 8000));

// Vantages down the -z beach centreline (yaw 0 looks toward -Z):
//   beach-waterline : dry sand at the flatten seam, eye height — refraction of
//                     wet sand through shallow lens
//   wade-shelf      : chest-deep on the envelope — depth-graded transmission
//   offshore-inward : beyond the wall face looking back — grazing Fresnel sky
//                     reflection across the widest water area
//   offshore-high   : elevated look back — deep vs shallow absorption ramp
const shots = [
  { name: 'beach-waterline', x: 0, y: 2.0, z: -50, yaw: 0, pitch: 0 },
  { name: 'wade-shelf', x: 0, y: 1.1, z: -57.5, yaw: 0, pitch: 0 },
  { name: 'offshore-inward', x: 0, y: 1.4, z: -68, yaw: Math.PI, pitch: 0 },
  { name: 'offshore-high', x: 0, y: 10, z: -66, yaw: Math.PI, pitch: -0.45 },
];
for (const s of shots) {
  await page.evaluate((s) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(s.x, s.y, s.z, s.yaw, s.pitch ?? 0);
  }, s);
  // Let gravity/plates/swim settle the capsule before capturing.
  await new Promise((r) => setTimeout(r, 2500));
  console.log('[hf394] captured', s.name);
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
}
await browser.close();
console.log('[hf394] done ->', OUT);
