// HF-383 verification capture: boots atomic-acres (Nuke Town) on the real
// WebGPU route in INSTALLED Chrome, HEADLESS (per GAUNTLET-SPEC 2026-08-25
// correction: installed chrome headless gets a real hardware WebGPU device;
// only Playwright's bundled chromium fails at requestDevice). Drives the
// shared preview on 127.0.0.1:41911 and captures street-level frames covering
// the kerb-side vans, planter fins and central bus for visual inspection.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41911';
const OUT = 'artifacts/hf383-verify-frames';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
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
page.on('pageerror', (error) => console.error('[hf383v] pageerror:', String(error).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383v&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
// Prove the backend is really WebGPU before trusting any frame.
const gpuProof = await page.evaluate(() => {
  const dbg = window.__ATOMIC_ACRES_DEBUG__;
  const snap = typeof dbg?.snapshot === 'function' ? dbg.snapshot() : null;
  return {
    rendererParam: new URLSearchParams(location.search).get('renderer'),
    snapshotRenderer: snap?.renderer ?? snap?.settings?.renderer ?? null,
  };
});
console.log('[hf383v] gpu proof:', JSON.stringify(gpuProof));
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres', undefined, { timeout: 150000 });
console.log('[hf383v] arena committed');
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
console.log('[hf383v] solo match started');
await new Promise((r) => setTimeout(r, 8000));

// Vantages: [name, x, z, yaw]. three.js forward at yaw 0 is -Z; looking down
// +X is yaw -PI/2, down -X is +PI/2. Shots cover each van end-on and broadside,
// the bus flanks, and both corner-to-corner approach diagonals.
const shots = [
  { name: 'street-west', x: -25, z: 0, yaw: -Math.PI / 2 },
  { name: 'street-east', x: 25, z: 0, yaw: Math.PI / 2 },
  { name: 'van-east-broadside', x: 7.2, z: -1.5, yaw: Math.PI },
  { name: 'van-west-broadside', x: -7.2, z: 1.5, yaw: 0 },
  { name: 'bus-flank-north', x: 0, z: -4.2, yaw: 0 },
  { name: 'diag-corner-nw', x: -26, y: 1.7, z: -24, yaw: -Math.PI / 4 },
];
for (const s of shots) {
  await page.evaluate((s) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(s.x, s.y ?? 1.7, s.z, s.yaw, 0);
  }, s);
  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('[hf383v] captured', s.name);
}
await browser.close();
console.log('[hf383v] done ->', OUT);
