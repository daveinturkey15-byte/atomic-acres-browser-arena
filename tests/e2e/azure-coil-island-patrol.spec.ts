import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Azure Coil animates over Atomic Acres without authority leaks', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/?renderer=webgl2');
  await page.waitForFunction(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    return api?.snapshot().weaponReady === true
      && api.snapshot().render.azureCoil?.state === 'ready';
  }, undefined, { timeout: 45_000 });
  await mkdir('artifacts/azure-coil', { recursive: true });
  await page.screenshot({ path: 'artifacts/azure-coil/azure-coil-menu-preview.png' });
  await page.bringToFront();
  const motionA = await page.evaluate(() => (
    window as any
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.azureCoil);
  await expect.poll(async () => {
    const sample = await page.evaluate(() => (
      window as any
    ).__ATOMIC_ACRES_DEBUG__.snapshot().render.azureCoil);
    return sample.animationTimeSeconds - motionA.animationTimeSeconds;
  }, { timeout: 10_000, intervals: [100, 250, 500] }).toBeGreaterThan(0.35);
  const motionB = await page.evaluate(() => (
    window as any
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.azureCoil);
  const motion = { a: motionA, b: motionB };
  expect(motion.a).toMatchObject({
    state: 'ready', visible: true, activeArenaId: 'atomic-acres',
    clip: 'AzureCoil_Swim', bones: 30, skinnedMeshes: 11,
    materialGroups: 11, runtimeScale: 1.05,
    authority: {
      presentationOnly: true, blocksShots: false, hasRapierCollider: false,
      hasBallisticSurface: false, networkReplicated: false,
    },
  });
  expect(motion.b.animationTimeSeconds - motion.a.animationTimeSeconds).toBeGreaterThan(0.35);
  expect(Math.hypot(
    motion.b.lastSample.x - motion.a.lastSample.x,
    motion.b.lastSample.z - motion.a.lastSample.z,
  )).toBeGreaterThan(1);
  expect(motion.b.lastSample.y).toBeGreaterThanOrEqual(10.1);

  const lifecycle = await page.evaluate(async () => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.selectArena('gun-range');
    while (api.snapshot().render.azureCoil.activeArenaId !== 'gun-range') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const hidden = api.snapshot().render.azureCoil;
    api.selectArena('atomic-acres');
    while (api.snapshot().render.azureCoil.activeArenaId !== 'atomic-acres') {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return { hidden, restored: api.snapshot().render.azureCoil };
  });
  expect(lifecycle.hidden).toMatchObject({ activeArenaId: 'gun-range', visible: false, meshes: 11 });
  expect(lifecycle.restored).toMatchObject({ activeArenaId: 'atomic-acres', visible: true, meshes: 11 });

  const gameStartTime = await page.evaluate(async () => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    while (!api.snapshot().gameStarted) await new Promise((resolve) => setTimeout(resolve, 50));
    return api.snapshot().render.azureCoil.animationTimeSeconds;
  });
  await expect.poll(async () => page.evaluate(() => (
    window as any
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.azureCoil.animationTimeSeconds), {
    timeout: 10_000,
    intervals: [100, 250, 500],
  }).toBeGreaterThan(gameStartTime);
  await expect.poll(async () => page.evaluate(() => {
    const phase = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().render.azureCoil.lastSample.phase;
    return phase >= 1.1 && phase <= 1.8;
  }), { timeout: 30_000, intervals: [250, 500] }).toBe(true);
  await page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const target = api.snapshot().render.azureCoil.lastSample;
    const cameraX = -8;
    const cameraY = 6.5;
    const cameraZ = -12;
    const deltaX = target.x - cameraX;
    const deltaZ = target.z - cameraZ;
    api.setCaptureCameraPose(
      cameraX, cameraY, cameraZ,
      Math.atan2(-deltaX, -deltaZ) + 0.55,
      Math.atan2(target.y - cameraY, Math.hypot(deltaX, deltaZ)),
    );
  });
  await page.screenshot({ path: 'artifacts/azure-coil/azure-coil-in-engine.png' });
  expect(errors).toEqual([]);
});
