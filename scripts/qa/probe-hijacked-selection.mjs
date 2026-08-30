import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));

await page.goto('http://127.0.0.1:58247/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
try {
  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
  console.log('[probe] selectArena resolved');
} catch (error) {
  console.log('[probe] selectArena REJECTED:', String(error).slice(0, 300));
}
const state = await page.evaluate(() => ({
  arenaId: document.documentElement.dataset.arenaId,
  gameplayArena: document.documentElement.dataset.gameplayArena,
  renderBackend: document.documentElement.dataset.renderBackend,
  status: (document.getElementById('network-status')?.textContent ?? '').slice(0, 200),
}));
console.log('[probe]', JSON.stringify(state, null, 2));
await browser.close();
