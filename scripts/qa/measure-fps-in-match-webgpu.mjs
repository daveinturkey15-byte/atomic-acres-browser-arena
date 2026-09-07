// In-match rAF FPS on the REAL WebGPU route at 1280x720.
// measure-fps-in-match.mjs body + verify-arena-boot-cdp.mjs launch flags
// (without --use-angle=d3d11/--enable-unsafe-webgpu the page silently falls
// back to webgl2 and the measurement answers the wrong question).
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'http://127.0.0.1:41931');
const ARENA = arg('--arena', 'atomic-acres');
const LABEL = arg('--label', 'run');
// Optional fixed pose: 'x,y,z,lookX,lookZ,pitch' teleports there before sampling
// so two builds are measured on the SAME view, not whichever spawn came up.
const POSE = arg('--pose', null);

// FRAME-PACING LANE, RUN HEADLESS ON PURPOSE - do not "hide" this by parking
// it off-screen instead.
//
// Owner 2026-08-31: QA browsers may not appear on his screen while he works.
// For a lane that measures pacing there are two ways to honour that and only
// one of them is honest:
//
//   HEADED, parked at -32000,-32000  - the window can stop being composited,
//     and an uncomposited window free-runs requestAnimationFrame instead of
//     tracking vsync. The number stays plausible and becomes meaningless.
//   HEADLESS (this)                  - measured on this machine 2026-08-31:
//     installed Chrome via channel:'chrome' gets a real hardware WebGPU
//     device (nvidia / blackwell), renders real frames, and paces rAF at
//     60.4 Hz over a 2 s window - vsync-correct, not free-running.
//
// So headless is both the invisible option AND the trustworthy one here. If
// this lane ever has to go headed again, it must NOT be parked off-screen:
// mark it DECLARED VISIBLE LANE and say why, the way the installed-browser
// lanes do. See scripts/qa/browser-visibility-contract.test.mjs.
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
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

await page.goto(`${BASE}/?release=latest&renderer=webgpu`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#solo:not([disabled])', { timeout: 120_000 });
await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
await page.locator('#solo').click();
await page.waitForFunction(() => {
  const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return Boolean(snap && snap.matchPhase === 'active' && snap.gameStarted === true);
}, undefined, { timeout: 240_000 });

await page.waitForTimeout(6_000);
if (POSE) {
  const [x, y, z, lookX, lookZ, pitch] = POSE.split(',').map(Number);
  const yaw = Math.atan2(-(lookX - x), -(lookZ - z));
  await page.evaluate(({ x: px, y: py, z: pz, yaw: pYaw, pitch: pPitch }) => {
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(px, py, pz, pYaw, pPitch);
  }, { x, y, z, yaw, pitch });
  await page.waitForTimeout(2_000);
}
const result = await page.evaluate(async () => {
  const intervals = [];
  let last = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      intervals.push(now - last);
      last = now;
      if (intervals.length >= 600) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(resolve, 15_000);
  });
  intervals.sort((a, b) => a - b);
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const p95 = intervals[Math.floor(intervals.length * 0.95)] ?? 0;
  const p99 = intervals[Math.floor(intervals.length * 0.99)] ?? 0;
  return {
    frames: intervals.length,
    meanFps: Math.round(1000 / mean * 10) / 10,
    p95FrameMs: Math.round(p95 * 10) / 10,
    p99FrameMs: Math.round(p99 * 10) / 10,
    backend: document.documentElement.dataset.renderBackend ?? null,
  };
});
console.log(JSON.stringify({ label: LABEL, arena: ARENA, requested: 'webgpu', ...result }));
await browser.close();
