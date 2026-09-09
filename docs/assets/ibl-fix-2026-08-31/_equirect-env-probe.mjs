import { chromium } from '@playwright/test';
import sharp from 'sharp';
const lin = (c) => (c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
async function stats(buf){ const {data,info}=await sharp(buf).raw().toBuffer({resolveWithObject:true}); const n=info.width*info.height; const l=new Float32Array(n); let s=0; for(let i=0,p=0;p<n;p++,i+=info.channels){ const y=0.2126*lin(data[i]/255)+0.7152*lin(data[i+1]/255)+0.0722*lin(data[i+2]/255); l[p]=y; s+=y;} return {l,n,mean:s/n}; }
function cmp(a,b){ let moved=0; for(let p=0;p<a.n;p++) if (Math.abs(b.l[p]-a.l[p])>0.01) moved+=1; return { before:+a.mean.toFixed(4), after:+b.mean.toFixed(4), deltaPct:+(((b.mean-a.mean)/a.mean)*100).toFixed(2), movedPct:+((moved/a.n)*100).toFixed(1) }; }
const browser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--mute-audio','--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-features=CalculateNativeWinOcclusion'] });
for (const [arena, cam] of [['test2','test2-pool-lane'],['atomic-acres','nuke-town-street-axis'],['high-seas','high-seas-stern-main-deck']]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('http://127.0.0.1:41999/?release=latest&renderer=webgpu&render=quality&seed=eq&previewTime=0', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180000 });
  await page.evaluate(async (a) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(a); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase==='active' && s.gameStarted===true; }, undefined, { timeout: 180000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.clearBots?.());
  await page.waitForTimeout(6000);
  await page.evaluate((c) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(c), cam);
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); return { env: s.environment?.name ?? null, intensity: s.environmentIntensity }; });
  // "before" = the state the bug shipped AND the state the PMREM env is
  // indistinguishable from: no usable environment contribution.
  await page.evaluate(() => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); window.__P__=s.environment; s.environment=null; s.environmentIntensity=1; });
  await page.waitForTimeout(1800);
  const before = await stats(await page.screenshot());
  // "after" = the equirect sky bound directly as the environment, at the arena's authored intensity.
  await page.evaluate((i) => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); s.environment = s.background; s.environmentIntensity = i; }, info.intensity);
  await page.waitForTimeout(2500);
  const after = await stats(await page.screenshot());
  // control: the PMREM texture at the same intensity
  await page.evaluate((i) => { const s = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph(); s.environment = window.__P__; s.environmentIntensity = i; }, info.intensity);
  await page.waitForTimeout(2500);
  const pmrem = await stats(await page.screenshot());
  console.log(arena, cam, 'authoredIntensity', info.intensity, 'EQUIRECT', JSON.stringify(cmp(before, after)), 'PMREM', JSON.stringify(cmp(before, pmrem)));
  await page.close();
}
await browser.close();
