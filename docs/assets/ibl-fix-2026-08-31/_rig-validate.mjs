import { chromium } from '@playwright/test';
import sharp from 'sharp';
const lin = (c) => (c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
async function mean(buf){ const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true}); const n=info.width*info.height; let s=0; for(let i=0,p=0;p<n;p++,i+=info.channels){ s+=0.2126*lin(data[i]/255)+0.7152*lin(data[i+1]/255)+0.0722*lin(data[i+2]/255);} return s/n; }
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://127.0.0.1:41999/?release=latest&renderer=webgpu&render=quality&seed=rig&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('test2'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase==='active' && s.gameStarted===true; }, undefined, { timeout: 180000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots?.());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera('test2-pool-lane'));
await page.waitForTimeout(2000);
console.log('base', Number((await mean(await page.screenshot())).toFixed(4)));
await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  s.traverse((o) => { const mats = o.material?(Array.isArray(o.material)?o.material:[o.material]):[]; for (const m of mats) if (m?.isMeshStandardMaterial) { m.color.setRGB(0,0,0); m.needsUpdate = true; } });
});
await page.waitForTimeout(2500);
console.log('all-standard-black', Number((await mean(await page.screenshot())).toFixed(4)));
await browser.close();
