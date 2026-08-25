import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { resolve } from 'node:path';
const BASE = process.argv[2] ?? 'http://127.0.0.1:41941';
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=p&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 240000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 240000 });
await page.waitForTimeout(3000);

const wp = await page.evaluate(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  const p = s.weaponPresentation;
  return {
    hasWeaponPresentation: Boolean(p),
    keys: p ? Object.keys(p).slice(0, 90) : null,
    riggedArms: p?.riggedArms?.map((a) => ({
      side: a.side, active: a.active, socket: a.socket, wrist: a.wrist, palm: a.palm,
      shoulder: a.shoulder, elbow: a.elbow, target: a.target, contactError: a.contactError,
      reachRatio: a.reachRatio, shoulderEntryNdc: a.shoulderEntryNdc,
    })) ?? null,
    armFraming: p?.armFraming ?? null,
    viewmodelViewport: p?.viewmodelViewport ?? null,
    armsSource: p?.armsSource ?? null,
  };
});
console.log('WP', JSON.stringify(wp, null, 1).slice(0, 5000));

async function shot(name) {
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).toFile(resolve(`.gauntlet-tmp/hf388/${name}.png`));
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hist = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return { name, top };
}
console.log('NORMAL', JSON.stringify(await shot('n')));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture('right'));
await page.waitForTimeout(400);
console.log('RIGHT', JSON.stringify(await shot('xr')));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture('left'));
await page.waitForTimeout(400);
console.log('LEFT', JSON.stringify(await shot('xl')));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture('background'));
await page.waitForTimeout(400);
console.log('BG', JSON.stringify(await shot('xb')));
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArmEvidenceCapture(null));
await browser.close();
