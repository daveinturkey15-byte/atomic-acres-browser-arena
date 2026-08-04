import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2000);
const out = await page.evaluate(() => {
  const d = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const keys = Object.keys(d);
  const picked = {};
  for (const k of ['originalArtLoaded', 'arenaStoryReady', 'menuVisible', 'qualityAssetStreaming', 'bootstrapStage', 'arenaTransitionPhase', 'gameplayArenaPrepared', 'selectedArena', 'matchPhase']) {
    if (k in d) picked[k] = d[k];
  }
  return { keys, picked };
});
console.log('KEYS:', JSON.stringify(out.keys));
console.log('PICKED:', JSON.stringify(out.picked, null, 1));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
