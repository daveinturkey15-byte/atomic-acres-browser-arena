// Capture a matched with-enemy / without-enemy pair at a REQUIRED staged enemy
// world position, reloading into a fresh match until the spawn that produces it
// comes up. startSolo picks between two Nuke Town spawns and only one of them
// leaves placeBotAhead's staged enemy actually visible - its raycast set does
// not include the hedges - so the spawn has to be selected for, not assumed.
import { chromium } from '@playwright/test';
const W = process.argv[2] ?? 'storm';
const WANT = (process.argv[3] ?? '-11.80,-16.66').split(',').map(Number);
const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-angle=d3d11','--enable-unsafe-webgpu','--ignore-gpu-blocklist','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-features=CalculateNativeWinOcclusion'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(() => { try { localStorage.setItem('atomic-acres-pass65-settings-v1', JSON.stringify({ version:1, graphics:{ schemaVersion:1, preset:'custom', weatherIntensity:'storm', rainDensity:1.5, windStrength:2, lightning:true, wetSurfaces:true, ambientLife:2 } })); } catch {} });
const page = await ctx.newPage();
const s = await page.context().newCDPSession(page); await s.send('Emulation.setFocusEmulationEnabled',{enabled:true}).catch(()=>{});
let staged = null;
for (let attempt = 0; attempt < 8; attempt += 1) {
  await page.goto(`http://127.0.0.1:41917/?release=latest&renderer=webgpu&render=quality&seed=pass79weather&weather=${W}`, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => { const s = window.__ATOMIC_ACRES_DEBUG__.snapshot(); return s.matchPhase==='active' && s.gameStarted===true; }, undefined, { timeout: 240000 });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); });
  staged = await page.evaluate(() => { const r = window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(9); if (r) window.__ATOMIC_ACRES_DEBUG__.aimAtBot(); return r; });
  const pos = staged?.bot.logicalPosition ?? [];
  console.error(`attempt ${attempt} bot=${pos.map(v=>+v.toFixed(2))}`);
  if (staged && Math.abs(pos[0]-WANT[0]) < 0.5 && Math.abs(pos[2]-WANT[1]) < 0.5) break;
  staged = null;
}
if (!staged) { console.error('FAILED to reach the required spawn'); await b.close(); process.exit(1); }
await page.waitForTimeout(3500);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.aimAtBot(); });
await page.waitForTimeout(1200);
console.error('weather', JSON.stringify(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.sampleWeather().rain)));
console.error('particles', JSON.stringify(await page.evaluate(() => { const p = window.__ATOMIC_ACRES_DEBUG__.sampleWeather().particles; return { draws: p.instancedDraws, loose: p.looseMeshes, quality: p.quality, live: p.liveParticles, visible: p.visibleParticles, capacity: p.capacityAtQuality, ambientLifeScale: p.ambientLifeScale, adaptive: p.adaptiveDensityScale, alloc: p.perFrameAllocations, families: p.families.map(f => ({ id: f.id, live: f.live, visible: f.visible, peakOpacity: f.peakOpacity, alloc: f.perFrameAllocations })) }; })));
await page.screenshot({ path: `artifacts/pass79/weather/pair-${W}-with.png` });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.clearBots(); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `artifacts/pass79/weather/pair-${W}-without.png` });
await b.close();
