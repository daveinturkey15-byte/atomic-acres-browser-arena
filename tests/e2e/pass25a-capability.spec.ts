import { expect, test } from '@playwright/test';

test.describe('Pass 25A browser capability smoke', () => {
  test('deploys an active WebGL2 match without an uncaught exception', async ({ page, browserName }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?release=latest&map=rustworks-1v1&renderer=webgl2&render=performance&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass25a-capability');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#solo')).toBeEnabled({ timeout: 30_000 });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().frameCount > 1, undefined, { timeout: 30_000 });
    const capability = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        webglVersion: snapshot.render.webglVersion,
        pointerLock: typeof document.querySelector<HTMLCanvasElement>('#game')?.requestPointerLock === 'function',
        webRtc: typeof window.RTCPeerConnection === 'function',
        contextState: document.documentElement.dataset.webglContext,
        matchPhase: snapshot.matchPhase,
        frameCount: snapshot.frameCount,
      };
    });
    expect(capability.webglVersion, `${browserName} renderer-owned WebGL2 context`).toContain('WebGL 2');
    expect(capability.contextState).toBe('ready');
    expect(capability.matchPhase).toBe('active');
    expect(capability.frameCount).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
});
