// Deploy an arena through the real menu and measure in-match rAF rate for ten seconds.
//
// The owner reports "FPS were all shit" on the compat route. The historical datum for
// WebGL2 compat on this machine is ~73.9 Hz in-match. This measures the same thing the
// player feels, after the match is genuinely active, with the window focus-emulated so
// throttling cannot masquerade as a render problem.

import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass81');
const ARENA = arg('--arena', 'rustworks-1v1');
const RENDERER = arg('--renderer', 'webgl2');

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
  channel: arg('--browser-channel', 'chrome'),
  args: [...SILENT_ARGS,
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

await page.goto(`${BASE}/?release=latest&renderer=${RENDERER}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#solo:not([disabled])', { timeout: 120_000 });
await page.locator(`.map-card[data-arena-id="${ARENA}"]`).click();
await page.locator('#solo').click();
await page.waitForFunction(() => {
  const snap = window.__ATOMIC_ACRES_DEBUG__?.snapshot?.();
  return Boolean(snap && snap.matchPhase === 'active' && snap.gameStarted === true);
}, undefined, { timeout: 240_000 });

// Let streaming settle before measuring, then sample frame intervals for 10 s.
await page.waitForTimeout(5_000);
const result = await page.evaluate(async () => {
  const intervals = [];
  let last = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      intervals.push(now - last);
      last = now;
      if (intervals.length < 600 && now - performance.timeOrigin < 1e9) {
        if (intervals.length < 600) requestAnimationFrame(tick); else resolve();
      }
      if (intervals.length >= 600) resolve();
    };
    requestAnimationFrame(tick);
    setTimeout(resolve, 12_000);
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
console.log(JSON.stringify({ arena: ARENA, renderer: RENDERER, ...result }));
await browser.close();
