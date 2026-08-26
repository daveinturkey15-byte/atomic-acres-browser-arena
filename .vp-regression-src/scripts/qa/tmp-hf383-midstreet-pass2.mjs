// TEMPORARY HF-383 pass 2 - untracked. 4-yaw sweep from street-axis vantages
// so van visibility does not depend on getting the yaw convention right.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41959';
const OUT = 'artifacts/hf383-midstreet-frames/pass2';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (e) => console.error('[hf383p2] pageerror:', String(e).slice(0, 200)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.waitForFunction(() => document.documentElement.dataset.arenaId === 'atomic-acres', undefined, { timeout: 150000 });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__?.sampleSimulationGate?.()?.gameStarted), undefined, { timeout: 150000 });
await new Promise((r) => setTimeout(r, 8000));

// West of the west van and east of the east van, street centre line, 4 yaws.
const vantages = [
  { name: 'from-west', x: -18, z: 0 },
  { name: 'from-east', x: 18, z: 0 },
];
const yaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
for (const v of vantages) {
  for (let i = 0; i < yaws.length; i++) {
    await page.evaluate((s) => {
      window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(s.x, 1.7, s.z, s.yaw, 0);
    }, { ...v, yaw: yaws[i] });
    await new Promise((r) => setTimeout(r, 1800));
    await page.screenshot({ path: `${OUT}/${v.name}-yaw${i}.png` });
    console.log('[hf383p2] captured', v.name, 'yaw', i);
  }
}
await browser.close();
console.log('[hf383p2] done ->', OUT);
