// One-shot backend identity probe: boots atomic-acres on the webgpu route in
// installed headless Chrome and reports the renderer backend the game actually
// initialized, plus the live WebGPU adapter info reported by the browser.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:41911';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=hf383gpu`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
const proof = await page.evaluate(() => {
  const dbg = window.__ATOMIC_ACRES_DEBUG__;
  const keys = Object.keys(dbg ?? {});
  const snap = typeof dbg?.snapshot === 'function' ? dbg.snapshot() : null;
  const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  return {
    debugKeys: keys.filter((k) => /render|gpu|backend|adapter/i.test(k)),
    rendererFields: snap ? Object.fromEntries(Object.entries(snap).filter(([k]) => /render|gpu|backend/i.test(k))) : null,
    settingsGraphics: pick(snap ?? {}, 'settings.graphics') ?? null,
    documentFlags: {
      arenaId: document.documentElement.dataset.arenaId,
      renderer: document.documentElement.dataset.renderer ?? null,
    },
  };
});
console.log('[hf383gpu]', JSON.stringify(proof, null, 1));
await browser.close();
