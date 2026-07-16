import { expect, test } from '@playwright/test';

test.describe('Pass 25A browser capability smoke', () => {
  test('boots the safe menu and reports its graphics capability without an uncaught exception', async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?render=performance&seed=pass25a-capability');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#solo')).toBeEnabled({ timeout: 30_000 });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.calls > 0, undefined, { timeout: 30_000 });
    const capability = await page.evaluate(() => ({
      webglVersion: window.__ATOMIC_ACRES_DEBUG__.snapshot().render.webglVersion,
      pointerLock: typeof document.querySelector<HTMLCanvasElement>('#game')?.requestPointerLock === 'function',
      webRtc: typeof window.RTCPeerConnection === 'function',
      contextState: document.documentElement.dataset.webglContext,
    }));
    expect(capability.webglVersion, `${browserName} renderer-owned WebGL2 context`).toContain('WebGL 2');
    expect(capability.contextState).toBe('ready');
    expect(errors).toEqual([]);
  });
});
