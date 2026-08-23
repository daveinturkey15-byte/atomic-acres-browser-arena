// One-off P0 probe: boots the built bundle in installed Chrome over CDP and
// dumps console output + lifecycle markers so a silent production-boot crash
// is visible. Not part of the QA contract; diagnostic only.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41947';
const ARENA = process.argv[3] ?? 'atomic-acres';
const TIMEOUT = Number(process.argv[4] ?? '240000');

const browser = await chromium.launch({
  headless: false,
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

page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 400)));
page.on('console', (m) => {
  const text = `[${m.type()}@${(performance.now()/1000).toFixed(1)}s] ${m.text().slice(0, 4000)}`;
  console.error(text);
});

const url = `${BASE}/?release=latest&renderer=webgpu&render=quality&seed=bootcdp&previewTime=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: TIMEOUT });
  console.log(`[probe] debug global ready after wait; selecting ${ARENA} + startSolo`);
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: TIMEOUT });
  const snap = await page.evaluate(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return { matchPhase: s.matchPhase, gameStarted: s.gameStarted };
  });
  console.log(`[probe] COMMITTED ${ARENA}:`, JSON.stringify(snap));
} catch (error) {
  const state = await page.evaluate(() => ({
    backend: document.documentElement.dataset.renderBackend ?? null,
    gameplayArena: document.documentElement.dataset.gameplayArena ?? null,
    bootstrapStage: window.__ATOMIC_ACRES_DEBUG__?.snapshot?.()?.bootstrap?.stage ?? null,
    status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 200),
    hasDebugGlobal: Boolean(window.__ATOMIC_ACRES_DEBUG__),
  })).catch((e) => ({ probeError: String(e) }));
  console.error('[probe] FAILED:', String(error).slice(0, 300));
  console.error('[probe] state:', JSON.stringify(state));
} finally {
  await browser.close();
}
