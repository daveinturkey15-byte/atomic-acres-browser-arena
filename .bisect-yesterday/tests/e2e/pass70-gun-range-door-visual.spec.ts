import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const renderer = process.env.PASS70_TEST_BAY_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';

test('renders the authored secure test-bay door with native lighting and exact collision projection', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=gun-range&renderer=${renderer}${requireWebGpu}&render=blender&grass=off&mist=off&rays=off&externalServices=off&seed=pass70-test-bay-door`);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
    return snapshot?.bootstrap.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  const runtime = await page.evaluate(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).render.runtime);
  expect(runtime).toMatchObject({
    requestedBackend: renderer,
    actualBackend: renderer,
    initialized: true,
    failClosed: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  if (renderer === 'webgpu') {
    expect(runtime).toMatchObject({
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      softwareAdapter: false,
      presentation: { status: 'healthy' },
    });
  }

  const output = resolve(process.cwd(), `artifacts/pass70/hitl2-support-testbay/${renderer}`);
  mkdirSync(output, { recursive: true });
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(51.5, 1.7, 12)
  ))).toBe(true);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera('gun-range-test-bay-door-relief'))).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(output, 'test-bay-door-closed-relief-1920x1080.png'), animations: 'disabled' });

  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null);
    window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(48.75, 1.7, 12, -Math.PI / 2, 0);
  });
  await expect.poll(async () => page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.collisionProbeAt(51.5, 1.7, 12)
  )), { timeout: 3_000 }).toBe(false);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera('gun-range-test-bay-door-bay-face'))).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(output, 'test-bay-door-open-bay-face-1920x1080.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});
