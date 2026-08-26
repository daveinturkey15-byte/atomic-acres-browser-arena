import { expect, test } from '@playwright/test';

// Boot-correctness gate for every canonical arena.
//
// Exists because of a specific incident: a required DOM element was removed while
// still queried at module level, 2,858 unit tests stayed green, and the game
// would not start - the owner found it by opening the page. This spec opens the
// page, for all six arenas, before the owner does.
//
// Headless Chromium falls back to SwiftShader on this machine, so this asserts
// BOOT CORRECTNESS only - never a frame-rate or visual-quality number. No retries:
// a flaky boot is a boot bug.
//
// Provenance note: the wave-8 lane that first authored this spec timed out and
// left the file truncated to zero bytes; it had executed once, proving the flow.
// Reconstructed by the orchestrator with the JSHandle assertion bug fixed
// (waitForFunction resolves to a handle, and comparing the handle to a string can
// never pass, which failed even a healthy boot).

const ARENAS = [
  'atomic-acres',
  'skyline-terminal',
  'rustworks-1v1',
  'gun-range',
  'farcrysis',
  'high-seas',
] as const;

const MENU_URL =
  '/?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off&seed=arena-boot-smoke&previewTime=0';

type DebugApi = {
  startSolo: () => void;
  selectArena: (id: string) => Promise<void>;
  snapshot: () => {
    matchPhase: 'warmup' | 'active' | 'ended';
    gameStarted: boolean;
  };
};

test.describe('arena boot smoke — all six canonical arenas', () => {
  for (const arenaId of ARENAS) {
    test(`${arenaId}: boots a clean visible solo match`, async ({ page }) => {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
      });

      await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => Boolean((window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__),
        undefined,
        { timeout: 90_000 },
      );

      await page.evaluate(async (id) => {
        await (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.selectArena(id);
      }, arenaId);
      await page.evaluate(() => {
        (window as unknown as { __ATOMIC_ACRES_DEBUG__: DebugApi }).__ATOMIC_ACRES_DEBUG__.startSolo();
      });

      // Reach active phase - or surface the game's own deployment failure text,
      // which names the cause instead of a bare timeout.
      const outcomeHandle = await page.waitForFunction(
        () => {
          const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
          const state = api?.snapshot();
          if (state?.matchPhase === 'active' && state?.gameStarted === true) return 'active';
          const status = document.querySelector('#status')?.textContent ?? '';
          if (/deployment preparation failed|renderer blocked/i.test(status)) return `deploy-failed: ${status}`;
          return null;
        },
        undefined,
        { timeout: 120_000 },
      );
      const outcome = await outcomeHandle.jsonValue();
      expect(outcome, `${arenaId}: solo match must reach active phase`).toBe('active');

      const canvasInfo = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const style = getComputedStyle(canvas);
        return {
          visible: style.display !== 'none' && style.visibility !== 'hidden',
          width: canvas.width,
          height: canvas.height,
          backend: document.documentElement.dataset.renderBackend ?? null,
        };
      });
      expect(canvasInfo, `${arenaId}: a canvas must exist`).not.toBeNull();
      expect(canvasInfo!.visible, `${arenaId}: the canvas must be visible`).toBe(true);
      expect(canvasInfo!.width, `${arenaId}: canvas must have real size`).toBeGreaterThan(0);
      expect(canvasInfo!.backend, `${arenaId}: renderer backend must be stamped`).toBeTruthy();

      expect(pageErrors, `${arenaId}: no uncaught page errors`).toEqual([]);
      expect(consoleErrors, `${arenaId}: no console errors`).toEqual([]);
    });
  }
});
