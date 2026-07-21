import { expect, test } from '@playwright/test';

test.describe('Pass 25A browser capability smoke', () => {
  test('boots the safe menu and reports its graphics capability without an uncaught exception', async ({ page, browserName }) => {
    const errors: string[] = [];
    const shaderErrors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /Atomic Signal|Shader Error|WebGLProgram/.test(message.text())) shaderErrors.push(message.text());
    });
    const shaderOverride = browserName === 'firefox' ? '' : '&signal=on';
    await page.goto(`/?render=performance${shaderOverride}&seed=pass25a-capability`);
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('#solo')).toBeEnabled({ timeout: 30_000 });
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.calls > 0, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => {
      const signal = window.__ATOMIC_ACRES_DEBUG__?.snapshot().render.atomicSignal;
      return signal?.bypassReason === 'software-renderer' || signal?.targetValidated && signal?.outputValidated;
    }, undefined, { timeout: 30_000 });
    const capability = await page.evaluate(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        webglVersion: snapshot.render.webglVersion,
        pointerLock: typeof document.querySelector<HTMLCanvasElement>('#game')?.requestPointerLock === 'function',
        webRtc: typeof window.RTCPeerConnection === 'function',
        contextState: document.documentElement.dataset.webglContext,
        atomicSignal: snapshot.render.atomicSignal,
      };
    });
    expect(capability.webglVersion, `${browserName} renderer-owned WebGL2 context`).toContain('WebGL 2');
    expect(capability.contextState).toBe('ready');
    if (capability.atomicSignal.bypassReason === 'software-renderer') {
      expect(capability.atomicSignal).toMatchObject({
        enabled: false,
        profile: 'performance',
        fallbackReason: null,
        textureSamples: 0,
        targetValidated: false,
        outputValidated: false,
      });
    } else {
      expect(capability.atomicSignal).toMatchObject({
        enabled: true,
        profile: 'performance',
        fallbackReason: null,
        bypassReason: null,
        textureSamples: 1,
        targetValidated: true,
        outputValidated: true,
      });
    }
    expect(shaderErrors).toEqual([]);
    expect(errors).toEqual([]);
  });
});
