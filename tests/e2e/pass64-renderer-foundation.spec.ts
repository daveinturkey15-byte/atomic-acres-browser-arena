import { expect, test, type Page } from '@playwright/test';

type DebugApi = {
  snapshot: () => any;
};

async function choosePass68(page: Page): Promise<void> {
  await page.getByRole('button', { name: /PASS 68 .*LIVE/i }).click();
}

async function waitForRendererContract(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    return root.dataset.renderBackend === 'blocked' || Boolean(debug?.snapshot()?.render?.runtime?.initialized);
  }, undefined, { timeout: 45_000 });
}

test('selected Pass 68 route initializes its declared backend without silent fallback', async ({ page }) => {
  await page.goto('/?render=blender');
  await choosePass68(page);
  await waitForRendererContract(page);

  const state = await page.evaluate(() => {
    const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    return {
      backend: document.documentElement.dataset.renderBackend,
      blocked: document.querySelector('#webgpu-gameplay-blocked')?.textContent ?? null,
      runtime: debug?.snapshot()?.render?.runtime ?? null,
    };
  });

  if (state.backend === 'blocked') {
    expect(state.blocked).toContain('GAMEPLAY RENDERER BLOCKED');
    expect(state.runtime).toBeNull();
    return;
  }

  expect(state.runtime).toMatchObject({
    actualBackend: state.runtime.requestedBackend,
    initialized: true,
    failClosed: false,
    deviceLost: false,
  });
  expect(['webgpu', 'webgl2']).toContain(state.runtime.actualBackend);
  expect(state.backend).toBe(state.runtime.actualBackend);
});

test('explicit WebGL2 compatibility route reports its real initialized backend', async ({ page }) => {
  await page.goto('/?renderer=webgl2&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=6401&map=skyline-terminal');
  await choosePass68(page);
  await waitForRendererContract(page);

  const state = await page.evaluate(() => {
    const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug?.snapshot();
    return {
      backend: document.documentElement.dataset.renderBackend,
      context: document.documentElement.dataset.webglContext,
      runtime: snapshot?.render?.runtime ?? null,
    };
  });

  expect(state).toMatchObject({
    backend: 'webgl2',
    context: 'ready',
    runtime: {
      requestedBackend: 'webgl2',
      actualBackend: 'webgl2',
      initialized: true,
      failClosed: false,
      deviceLost: false,
      renderPipelineApi: 'legacy-direct',
    },
  });
});

test('compatibility route exposes stable framebuffer evidence before gameplay assertions', async ({ page }) => {
  await page.goto('/?renderer=webgl2&render=blender&signal=off&grass=off&mist=off&clouds=off&rays=off&seed=6401&map=skyline-terminal');
  await choosePass68(page);
  await waitForRendererContract(page);

  const evidence = await page.evaluate(() => {
    const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: DebugApi }).__ATOMIC_ACRES_DEBUG__;
    const render = debug?.snapshot()?.render;
    return {
      drawingBuffer: render?.drawingBuffer,
      runtime: render?.runtime,
      context: document.documentElement.dataset.webglContext,
    };
  });

  expect(evidence.context).toBe('ready');
  expect(evidence.runtime).toMatchObject({
    requestedBackend: 'webgl2',
    actualBackend: 'webgl2',
    initialized: true,
    deviceLost: false,
  });
  expect(evidence.drawingBuffer[0]).toBeGreaterThan(0);
  expect(evidence.drawingBuffer[1]).toBeGreaterThan(0);
});
