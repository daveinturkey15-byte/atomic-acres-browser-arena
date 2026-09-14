import { chromium } from '@playwright/test';
import sharp from 'sharp';
const lin = (c) => (c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
async function mean(buf){ const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true}); const n=info.width*info.height; let s=0; for(let i=0,p=0;p<n;p++,i+=info.channels){ s+=0.2126*lin(data[i]/255)+0.7152*lin(data[i+1]/255)+0.0722*lin(data[i+2]/255);} return s/n; }
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const msgs = []; page.on('console', (m) => { if (m.type()==='warning'||m.type()==='error') msgs.push(m.text().slice(0,200)); });
await page.goto('http://127.0.0.1:41999/?release=latest&renderer=webgpu&render=quality&seed=ecp&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('test2'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase==='active' && s.gameStarted===true; }, undefined, { timeout: 180000 });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots?.());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera('test2-pool-lane'));
await page.waitForTimeout(2000);
const shot = async (tag) => console.log(tag, Number((await mean(await page.screenshot())).toFixed(4)));
await shot('A base (PMREM env, intensity 0.22)');

// B: intensity 20 on the PMREM env
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph().environmentIntensity = 20; });
await page.waitForTimeout(2000); await shot('B PMREM env @20');

// C: swap in the raw equirect sky as the environment (no PMREM), intensity 20
await page.evaluate(() => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); window.__P__ = s.environment; s.environment = s.background; });
await page.waitForTimeout(2500); await shot('C raw equirect env @20');

// D: metalness 1 / roughness 0 on all standard materials with the PMREM env @20
await page.evaluate(() => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); s.environment = window.__P__;
  s.traverse((o) => { const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[]; for (const m of mats) if (m?.isMeshStandardMaterial) { m.metalness=1; m.roughness=0.05; m.envMapIntensity=1; m.needsUpdate=true; } }); });
await page.waitForTimeout(2500); await shot('D PMREM env @20, all mirror metal');

console.log('CONSOLE', JSON.stringify(msgs.slice(0,10)));
await browser.close();
