// Shared QA harness: boot Chrome, load the preview build, enter a solo match
// on an arena, and hand back { browser, page, debug-evaluate helpers }.
//
// Every ad-hoc probe this repo writes repeats the same ~30 lines of
// anti-throttle launch flags and boot/match wait logic (streamline cadence,
// owner directive 2026-08-22). Import this instead:
//
//   import { launchSoloMatch } from './lib/launch-match.mjs';
//   const { page, close } = await launchSoloMatch({ arena: 'atomic-acres' });
//   const out = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
//   await close();
//
// NOTE: --enable-unsafe-webgpu masks the Chrome 153 Tint race - keep the
// default flags for gameplay/visual probes, but pass { tintRealism: true }
// for any probe that must reproduce stock-Chrome pipeline behaviour.
import { chromium } from 'playwright';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:41975';

export async function launchSoloMatch({
  arena = 'atomic-acres',
  baseUrl = DEFAULT_BASE_URL,
  renderer = 'webgpu',
  render = 'quality',
  seed = 'qa',
  viewport = { width: 1280, height: 720 },
  headless = false,
  uncapFrameRate = false,
  tintRealism = false,
  extraQuery = '',
} = {}) {
  const args = [
    '--mute-audio',
    '--use-angle=d3d11', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
    '--autoplay-policy=no-user-gesture-required',
  ];
  if (!tintRealism) args.push('--enable-unsafe-webgpu');
  if (uncapFrameRate) args.push('--disable-frame-rate-limit');
  const browser = await chromium.launch({ headless, channel: 'chrome', args });
  const page = await browser.newPage({ viewport });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.goto(
    `${baseUrl}/?release=latest&renderer=${renderer}&render=${render}&seed=${seed}&previewTime=0${extraQuery}`,
    { waitUntil: 'domcontentloaded', timeout: 120_000 },
  );
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 300_000 });
  return {
    browser,
    page,
    close: () => browser.close(),
  };
}
