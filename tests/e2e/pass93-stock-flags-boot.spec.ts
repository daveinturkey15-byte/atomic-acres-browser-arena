import { chromium, expect, test, type Browser, type Page } from '@playwright/test';

// PASS 93 stock-flags boot gate.
//
// Exists because of a specific incident: every QA smoke launched installed
// Chrome with --enable-unsafe-webgpu, which changes Tint's shader lowering and
// hid a Chrome 153 bug ("swizzle view instruction still has usages after
// lowering") that killed Nuke Town Rebuild for the owner in his everyday
// Chrome. PASS 92 was green everywhere and unplayable for him.
//
// This spec launches the INSTALLED Chrome channel with the flags a visitor's
// browser actually has - no --enable-unsafe-webgpu, no --enable-features, no
// --ignore-gpu-blocklist, no --use-angle - walks the real menu (map card, Solo
// button, no debug shortcuts) and requires a live gameplay frame with zero
// console errors and zero pipeline-repair sweeps. It skips, loudly and by
// name, only when the installed Chrome channel is absent or the machine has
// no WebGPU adapter under stock flags; a device that exists and cannot boot
// the arena is the failure this file was written for.
//
// It runs its own browser rather than the chromium project's fixture on
// purpose: playwright.config.ts adds the unsafe flag whenever
// PASS73_NATIVE_WEBGPU=1, and this gate must never inherit it.

const STOCK_CHROME_ARGS = [
  // Owner standing instruction: every browser this repo launches stays silent
  // and off his screen while he is at the PC.
  '--mute-audio',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--window-position=-32000,-32000',
  '--window-size=2640,1520',
] as const;

const FORBIDDEN_FLAG_PREFIXES = [
  '--enable-unsafe-webgpu',
  '--enable-features',
  '--ignore-gpu-blocklist',
  '--use-angle',
] as const;

// The arena the owner could not load, plus another selectable team arena as
// the control. The original Nuketown remains registered but is parked (HF-466).
const ARENAS = ['nuketown2', 'skyline-terminal'] as const;

// Deploy -> active phase under stock flags measured 54 s on nuketown2 and
// ~62 s on skyline-terminal (headless installed Chrome at ~29 FPS: streaming,
// pipeline compilation, then the authored deployment-sync countdown). The
// wait matches pass74-arena-boot-smoke.spec.ts's 120 s active-phase patience;
// what is asserted at the end of it is unchanged.
const LIVE_FRAME_TIMEOUT_MS = 120_000;

type DebugApi = {
  snapshot?: () => { gameStarted?: boolean; matchPhase?: string };
  admissionState?: () => { presentedGameplayFrame?: number | null };
};

async function visible(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).isVisible().catch(() => false);
}

async function dismissStaleUi(page: Page): Promise<void> {
  for (const selector of ['#changelog-close', '#project-map-close', '#rtx-native-runtime-explainer-close']) {
    if (await visible(page, selector)) await page.locator(selector).click();
  }
  await page.keyboard.press('Escape').catch(() => undefined);
}

let browser: Browser | null = null;
let skipReason: string | null = null;

test.describe('PASS 93 stock-flags boot - installed Chrome without the unsafe WebGPU flag', () => {
  test.beforeAll(async () => {
    try {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: [...STOCK_CHROME_ARGS],
      });
    } catch (error) {
      skipReason = `installed Chrome channel unavailable: ${String(error).split('\n')[0]}`;
    }
  });

  test.afterAll(async () => {
    await browser?.close();
    browser = null;
  });

  test('launch arguments carry none of the flags that mask Tint lowering bugs', () => {
    for (const argument of STOCK_CHROME_ARGS) {
      for (const forbidden of FORBIDDEN_FLAG_PREFIXES) {
        expect(argument.startsWith(forbidden), `${argument} must not be launched by the stock gate`).toBe(false);
      }
    }
  });

  test('stock-flag Chrome exposes a WebGPU device, or the arena boots skip by name', async ({ baseURL }) => {
    test.skip(skipReason !== null, skipReason ?? '');
    const page = await browser!.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    try {
      await page.goto(baseURL ?? '/', { waitUntil: 'domcontentloaded' });
      const device = await page.evaluate(async () => {
        if (!navigator.gpu) return 'no navigator.gpu';
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return 'no adapter';
        try { await adapter.requestDevice(); return 'ok'; } catch (error) { return String(error); }
      });
      if (device !== 'ok') {
        skipReason = `stock-flag installed Chrome has no usable WebGPU device here (${device})`;
      }
      test.skip(skipReason !== null, skipReason ?? '');
    } finally {
      await page.close();
    }
  });

  for (const arenaId of ARENAS) {
    test(`${arenaId}: the real menu reaches a live frame with zero pipeline errors`, async ({ baseURL }) => {
      test.skip(skipReason !== null, skipReason ?? '');
      test.setTimeout(240_000);
      const page = await browser!.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 400));
      });
      page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 400)));

      try {
        await page.goto(baseURL ?? '/', { waitUntil: 'domcontentloaded' });
        await dismissStaleUi(page);
        if (await visible(page, '#release-channel-gate')) {
          await page.locator('[data-release-choice="latest"]').click();
        }
        await page.waitForSelector('#menu', { state: 'visible', timeout: 60_000 });
        const card = page.locator(`.map-card[data-arena-id="${arenaId}"]:not([disabled])`);
        await card.waitFor({ state: 'visible', timeout: 60_000 });
        await card.click();
        await page.waitForFunction(
          (id) => document.querySelector('.map-card[aria-pressed="true"]')?.getAttribute('data-arena-id') === id,
          arenaId,
          { timeout: 10_000 },
        );

        const frameBefore = await page.evaluate(() => {
          const debug = (globalThis as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
          return debug?.admissionState?.().presentedGameplayFrame ?? null;
        });
        await page.locator('#solo').click();

        await page.waitForFunction(
          ({ id, before }) => {
            const root = document.documentElement;
            const debug = (globalThis as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
            const snapshot = debug?.snapshot?.() ?? null;
            const presented = debug?.admissionState?.().presentedGameplayFrame ?? null;
            const frameAdvanced = typeof presented === 'number' && (typeof before !== 'number' || presented > before);
            return root.dataset.gameplayArena === id
              && root.dataset.renderBackend === 'webgpu'
              && document.querySelector('#menu')?.classList.contains('hidden') === true
              && (document.querySelector('#deployment-transition') as HTMLElement | null)?.hidden === true
              && (document.querySelector('#hud') as HTMLElement | null)?.hidden === false
              && snapshot !== null && snapshot.gameStarted === true && snapshot.matchPhase === 'active'
              && frameAdvanced;
          },
          { id: arenaId, before: frameBefore },
          { timeout: LIVE_FRAME_TIMEOUT_MS },
        );

        const telemetry = await page.evaluate(() => ({
          shim: document.documentElement.dataset.tintSwizzleShim ?? null,
          repairs: document.documentElement.dataset.tintPipelineRepairs ?? null,
          backend: document.documentElement.dataset.renderBackend ?? null,
        }));
        expect(telemetry.backend, `${arenaId}: WebGPU backend must be live`).toBe('webgpu');
        expect(telemetry.shim, `${arenaId}: the Tint swizzle shim must be installed`).toBe('true');
        expect(telemetry.repairs, `${arenaId}: no errored pipeline may need a repair sweep`).toBeNull();
        expect(pageErrors, `${arenaId}: no uncaught page errors`).toEqual([]);
        expect(consoleErrors, `${arenaId}: no console errors`).toEqual([]);
      } finally {
        await page.close();
      }
    });
  }
});
