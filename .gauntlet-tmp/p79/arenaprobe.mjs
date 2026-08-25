import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const s = await page.context().newCDPSession(page); await s.send('Emulation.setFocusEmulationEnabled',{enabled:true}).catch(()=>{});
page.on('pageerror', e => console.error('[pageerror]', String(e).slice(0,200)));
await page.goto('http://127.0.0.1:41917/?release=latest&renderer=webgpu&weather=storm', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
console.error('before', JSON.stringify(await page.evaluate(() => { const a = window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection; return { id: a?.id, label: a?.label, phase: a?.transition?.phase, keys: Object.keys(a ?? {}) }; })));
const r = await page.evaluate(async () => { try { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); return 'resolved'; } catch (e) { return 'threw: ' + String(e).slice(0,150); } });
console.error('selectArena ->', r);
for (const wait of [500, 2000, 6000, 15000]) {
  await page.waitForTimeout(wait);
  console.error(wait, JSON.stringify(await page.evaluate(() => { const a = window.__ATOMIC_ACRES_DEBUG__.snapshot().arenaSelection; return { id: a?.id, phase: a?.transition?.phase, failure: a?.transition?.failure }; })));
}
await browser.close();
