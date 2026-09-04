// Captures one headless-Chromium screenshot per worst-measured viewmodel-penetration pose plus a control pose, to pixel-grade viewmodel surface clipping.
// Usage: node scripts/qa/capture-viewmodel-clip-frames.mjs [--out <dir>] [--label <label>] [--url <url>]
//   --out          output directory for the screenshots (default: docs/assets/viewmodel-surface-clip-2026-08-31)
//   --label        filename prefix for the PNGs (default: run)
//   --url          page to load before capture (default: $QA_BASE_URL, else http://127.0.0.1:41933/)
//   QA_BASE_URL    env: base URL used as the --url default (default: unset, falls back to http://127.0.0.1:41933/)
// Writes: <out>/ (created if missing) plus <out>/<label>-<pose>.png per pose; prints a JSON penetration report to stdout.
// Exit codes: 0 on success; no process.exit calls, so failures surface as unhandled-throw non-zero exits.
// Captures the FRAME at the worst measured penetration poses, so the fix is
// graded on pixels and not only on geometry.
//
// This matters because the shipped WebGPU route has NO depth-cleared viewmodel
// overlay (`atomicSignal` is hardcoded null in legacy-main.ts), so the rig
// shares the world depth buffer. Geometry inside a COLLIDER box is not
// necessarily visible - collider boxes and visual meshes are different things.
// Only a screenshot settles what the player sees.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg('--out', 'docs/assets/viewmodel-surface-clip-2026-08-31');
const LABEL = arg('--label', 'run');
mkdirSync(resolve(OUT), { recursive: true });

// The poses that measured worst, plus a control in the open.
const POSES = [
  { name: 'garage-door-crouch-yaw270', x: 17.7, z: -6.2, yaw: (270 * Math.PI) / 180, pitch: 0, stance: 'crouch' },
  { name: 'garage-door-prone-yaw300', x: 17.7, z: -6.2, yaw: (300 * Math.PI) / 180, pitch: 0, stance: 'prone' },
  { name: 'house-front-stand-yaw60', x: 4, z: -6.4, yaw: (60 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { name: 'west-fence-stand-yaw90', x: -36.6, z: 23.0, yaw: (90 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { name: 'bus-van-gap-stand-yaw240', x: 4.5, z: -3.75, yaw: (240 * Math.PI) / 180, pitch: 0, stance: 'stand' },
  { name: 'control-open-ground', x: 0, z: 0, yaw: 0, pitch: 0, stance: 'stand' },
];

const browser = await chromium.launch({ headless: true, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41933/'), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });
await page.evaluate(async () => {
  await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres');
  window.__ATOMIC_ACRES_DEBUG__.startSolo();
});
await page.waitForTimeout(25_000);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));

const report = [];
for (const pose of POSES) {
  await page.evaluate((value) => window.__ATOMIC_ACRES_DEBUG__.setStance(value), pose.stance);
  const sample = await page.evaluate(async (p) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.teleportPlayer(p.x, 1.7, p.z, p.yaw, p.pitch);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))));
    return api.sampleViewmodelPenetration();
  }, pose);
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(OUT, `${LABEL}-${pose.name}.png`) });
  report.push({ pose: pose.name, penetrationM: sample.maxPenetrationM, clipped: sample.clippedVertices, planes: sample.activeClipPlanes });
}
await browser.close();
console.log(JSON.stringify(report, null, 2));
