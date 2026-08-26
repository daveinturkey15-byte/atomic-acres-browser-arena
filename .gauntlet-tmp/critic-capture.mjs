// Critic-only viewpoint capture: same stations as scripts/qa/capture-hijacked-viewpoints.mjs
// but without ?release=latest (unsafe on a dev server) and with an extra close
// exterior framing of the bow deckhouse window band.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:5174';
const OUT = resolve(process.argv[3] ?? 'artifacts/critic-verify-hijacked');
mkdirSync(OUT, { recursive: true });

const EYE_DECK = 4.9;
const EYE_UPPER = 7.9;
const EYE_ENGINE = 1.7;
const VIEWPOINTS = [
  { id: 'spawn-stern', pos: [9, EYE_DECK, 40], yaw: 0, pitch: 0 },
  { id: 'mid-deck-along-bow', pos: [0, EYE_DECK, -6], yaw: 0, pitch: 0 },
  { id: 'mid-deck-along-stern', pos: [0, EYE_DECK, 6], yaw: Math.PI, pitch: 0 },
  { id: 'mid-deck-across', pos: [-6, EYE_DECK, 0], yaw: -Math.PI / 2, pitch: 0 },
  { id: 'bow-end', pos: [-9, EYE_DECK, -38], yaw: Math.PI, pitch: 0 },
  { id: 'stern-end', pos: [0, EYE_DECK, 36], yaw: 0, pitch: 0 },
  { id: 'upper-deck', pos: [8, EYE_UPPER, 5], yaw: Math.PI, pitch: 0 },
  { id: 'below-deck-engine', pos: [0, EYE_ENGINE, 0], yaw: 0, pitch: 0 },
  { id: 'below-deck-corridor', pos: [0, EYE_ENGINE, 12], yaw: Math.PI, pitch: 0 },
  { id: 'deckhouse-close-bow', pos: [7, 5.6, -26], yaw: Math.PI * 0.85, pitch: 0.05 },
];

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
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));

await page.goto(`${BASE}/?renderer=webgpu&render=quality&seed=hijacked&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
console.log('backend:', backend);
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2500);

for (const vp of VIEWPOINTS) {
  await page.evaluate(([x, y, z, yaw, pitch]) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yaw, pitch);
  }, [...vp.pos, vp.yaw, vp.pitch]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(OUT, `${vp.id}.png`) });
  console.log('captured', vp.id);
}
await browser.close();
console.log('DONE', OUT);
