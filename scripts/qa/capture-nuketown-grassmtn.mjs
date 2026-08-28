#!/usr/bin/env node
// Pass 82 evidence: boots a solo atomic-acres match on real WebGPU and grabs
// eye-level stills of the new instanced lawns and the beyond-fence mountain
// backdrop. Reuses the verify-arena-boot-cdp.mjs launch discipline and the
// teleportPlayer debug hook (forward = (-sin yaw, 0, -cos yaw)).
//
// Usage: node scripts/qa/capture-nuketown-grassmtn.mjs [--url http://127.0.0.1:41932]
//        [--out artifacts/qa/nuketown-grassmtn]
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', 'http://127.0.0.1:41932');
const OUT = resolve(process.cwd(), arg('--out', 'artifacts/qa/nuketown-grassmtn'));
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  // Across the west back yard toward the houses: lawn in the mid-ground.
  { name: 'yard-lawn-west', x: -20, y: 1.7, z: -24, lookX: 4, lookZ: -12, pitch: -0.18 },
  // Over the north fence: foothills + main ridge through the arena fog.
  { name: 'mountains-over-north-fence', x: -16, y: 1.7, z: -26, lookX: -16, lookZ: -80, pitch: 0.04 },
  // Down the east verge: verge grass, service lane, mountains over the south fence.
  { name: 'verge-east-toward-south', x: 27, y: 1.7, z: -12, lookX: 25, lookZ: 20, pitch: -0.08 },
  // Kneeling close-up of the lawn itself.
  { name: 'lawn-closeup', x: -18, y: 1.05, z: -22, lookX: -14, lookZ: -18, pitch: -0.42 },
];

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=grassmtn&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(6_000); // streaming + pipelines settle

const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
for (const shot of SHOTS) {
  const yaw = Math.atan2(-(shot.lookX - shot.x), -(shot.lookZ - shot.z));
  await page.evaluate(({ x, y, z, yaw: yawIn, pitch }) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, yawIn, pitch);
  }, { ...shot, yaw });
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: resolve(OUT, `${shot.name}.png`) });
}

writeFileSync(resolve(OUT, 'capture-manifest.json'), `${JSON.stringify({
  backend,
  base: BASE,
  shots: SHOTS.map((shot) => shot.name),
  errors,
  capturedAt: new Date().toISOString(),
}, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify({ backend, out: OUT, errors: errors.slice(0, 4) }, null, 2));
