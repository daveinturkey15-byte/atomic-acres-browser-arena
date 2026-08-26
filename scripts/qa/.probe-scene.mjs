import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:41988/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('farcrysis'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase === 'active' && s.gameStarted === true; }, undefined, { timeout: 180_000 });
const probe = await page.waitForFunction(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  if (!scene) return null;
  let vege = 0;
  scene.traverse((o) => { if (o.isMesh && String(o.name).startsWith('farcrysis-vege-')) vege++; });
  return vege > 0 ? vege : null;
}, undefined, { timeout: 120_000 }).then((h) => h.jsonValue()).catch(() => null);
console.log('vege meshes found:', probe);
const detail = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const arenaGroups = [];
  scene.traverse((o) => {
    const n = String(o.name || '');
    if (/arena|farcrysis|presentation-root/i.test(n) && o.isObject3D && arenaGroups.length < 10) arenaGroups.push({ name: n, type: o.type, children: o.children.length });
  });
  return arenaGroups;
});
console.log(JSON.stringify(detail, null, 2));
await browser.close();
