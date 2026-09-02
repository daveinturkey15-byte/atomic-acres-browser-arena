import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg('--out', 'artifacts/qa/hf410-frames');
const LABEL = arg('--label', 'run');
mkdirSync(resolve(OUT), { recursive: true });
const POSES = [
  { name: 'open-ground-stand', x: 0, z: 0, yaw: 0, pitch: 0, stance: 'stand' },
  { name: 'open-ground-prone', x: 0, z: 0, yaw: 0, pitch: 0, stance: 'prone' },
  { name: 'house-front-stand-yaw60', x: 4, z: -6.4, yaw: (60 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { name: 'west-fence-corner-stand', x: -36.6, z: 23.0, yaw: Math.PI / 2, pitch: 0, stance: 'stand' },
  // HF-410: the near-plane cost check. Long sight lines across the map, where
  // coarser distant depth resolution would show as z-fighting on coplanar
  // roads, roofs and decals.
  { name: 'long-sightline-north', x: -38, z: 30, yaw: (200 * Math.PI) / 180, pitch: -0.05, stance: 'stand' },
  { name: 'long-sightline-south', x: 30, z: -30, yaw: (20 * Math.PI) / 180, pitch: -0.05, stance: 'stand' },
];
const WEAPONS = arg('--weapons', 'carbine,lmg,sniper').split(',');
const browser = await chromium.launch({ headless: true, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
try {
  await page.goto(arg('--url', 'http://127.0.0.1:41942/'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });
  await page.evaluate(async () => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s?.player && s.gameStarted !== false;
  }, null, { timeout: 180_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));
  for (const weapon of WEAPONS) {
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon?.(id), weapon).catch(() => {});
    await page.waitForTimeout(400);
    for (const pose of POSES) {
      await page.evaluate(async (p) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        const frame = () => new Promise((done) => requestAnimationFrame(done));
        let grounded = false;
        for (let attempt = 0; attempt < 3 && !grounded; attempt += 1) {
          api.teleportPlayer(p.x, 1.7, p.z, p.yaw, p.pitch);
          for (let waited = 0; waited < 90 && !grounded; waited += 1) { await frame(); grounded = api.snapshot()?.player?.grounded === true; }
        }
        api.setStanceForQa(p.stance);
        for (let waited = 0; waited < 60; waited += 1) await frame();
      }, pose);
      await page.screenshot({ path: resolve(OUT, `${LABEL}-${weapon}-${pose.name}.png`) });
      console.log('captured', LABEL, weapon, pose.name);
    }
  }
} finally {
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
}
