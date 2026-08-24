import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:41876/?release=latest&renderer=webgl2&render=quality', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 120000 });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
await page.waitForTimeout(3000);
// overview shot
await page.screenshot({ path: '.gauntlet-tmp/critic-overview.png' });
// teleport above a mid-map landmark ring position and look down
for (const [name, x, z] of [['nw', -26, -26], ['ne', 26, -26], ['sw', -26, 26], ['se', 26, 26]]) {
  await page.evaluate(([px, pz]) => {
    const d = window.__ATOMIC_ACRES_DEBUG__;
    d.teleportPlayer(px, 12, pz, Math.atan2(-(-px), -(-pz)) || 0);
  }, [x, z]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `.gauntlet-tmp/critic-landmark-${name}.png` });
}
await browser.close();
console.log('captured');
