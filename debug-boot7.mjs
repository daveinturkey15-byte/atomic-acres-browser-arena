import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 250)); });
await page.goto('http://127.0.0.1:4180/?render=performance&renderer=webgl2&release=latest', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const status = document.querySelector('#network-status');
  const solo = document.querySelector('#solo');
  const debugApi = window.__ATOMIC_ACRES_DEBUG__;
  return status?.dataset.kind === 'ok' && solo?.disabled === false && !!debugApi?.snapshot();
}, undefined, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);

// Find the scene through the debug hook's closure if exposed, else use renderer internals
const probe = await page.evaluate(() => {
  // Try to reach the scene via canvas/webgl context is not possible; use names in DOM data attrs
  // and the debug snapshot's own telemetry
  const dbg = window.__ATOMIC_ACRES_DEBUG__;
  const s = dbg.snapshot();
  return {
    snapshot: {
      art: s.originalArtLoaded, story: s.arenaStoryReady, menu: s.menuVisible,
      phase: s.matchPhase, bootstrap: s.bootstrapStage, qualityStreaming: s.qualityAssetStreaming,
      arenaId: s.selectedArena?.id, blenderEnvironment: s.render?.blenderEnvironment,
    },
    debugKeys: Object.keys(dbg),
    statusText: document.querySelector('#network-status')?.textContent,
    bodyHead: document.body.innerText.slice(0, 150),
  };
});
console.log(JSON.stringify(probe, null, 1));
console.log('ERRORS:', JSON.stringify(errors.slice(0, 6), null, 1));
await browser.close();
