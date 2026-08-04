import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const probe = await page.evaluate(() => {
  const names = ['route-marker-verdant-array', 'route-marker-civic-transit', 'route-marker-helio-service'];
  const found = {};
  for (const n of names) found[n] = !!window.__THREE_SCENE__ ? 'n/a' : 'no-scene-exposed';
  // try via debug internals if exposed
  const dbg = window.__ATOMIC_ACRES_DEBUG__;
  return {
    names,
    hasSceneExposed: typeof window.__THREE_SCENE__ !== 'undefined',
    dbgKeys: Object.keys(dbg || {}).slice(0, 20),
    storyFromSnapshot: dbg?.snapshot?.().arenaStoryReady,
  };
});
console.log(JSON.stringify(probe, null, 1));
await browser.close();
