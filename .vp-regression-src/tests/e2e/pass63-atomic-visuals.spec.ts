import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const evidenceRoot = resolve('artifacts/pass63/atomic-visuals');

test('keeps every Atomic house aperture visibly open and bloom depth-occluded', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?renderer=webgl2&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=6301&map=atomic-acres');
  await page.waitForFunction(() => {
    const state = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any };
    }).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state?.render?.blenderEnvironment?.status === 'ready'
      && state?.render?.atomicSignal?.samples > 0;
  }, undefined, { timeout: 45_000 });

  const result = await page.evaluate(() => {
    const api = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: {
        startSolo: () => void;
        setBotsFrozen: (frozen: boolean) => void;
        setCaptureViewmodelHidden: (hidden: boolean) => void;
        setCaptureCameraPose: (x: number, y: number, z: number, yaw: number, pitch: number) => void;
        snapshot: () => any;
      };
    }).__ATOMIC_ACRES_DEBUG__;
    api.startSolo();
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    // Outside Aqua's upper ramp entrance, facing through the exact aperture
    // that the old full-depth gunmetal trim rendered as a black door.
    api.setCaptureCameraPose(-21.5, 5.2, -32.8, -Math.PI / 2, 0);
    const state = api.snapshot();
    return {
      blender: state.render.blenderEnvironment,
      signal: state.render.atomicSignal,
      colliders: state.arenaSelection.colliders,
      physicsColliders: state.arenaSelection.physicsColliders,
    };
  });

  expect(result.blender).toMatchObject({
    status: 'ready',
    auditedApertures: 16,
    auditedOpenApertures: 10,
    auditedWindowApertures: 6,
    apertureAuditSamples: 144,
    semanticWindows: 6,
    surfaceSeparationPass: true,
    proceduralWorldHidden: true,
  });
  expect(result.signal).toMatchObject({ enabled: true, fallbackReason: null });
  expect(result.signal.samples).toBeGreaterThan(0);
  expect(result.colliders).toBeGreaterThan(0);
  expect(result.physicsColliders).toBeGreaterThan(0);

  await mkdir(evidenceRoot, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(evidenceRoot, 'aqua-upper-ramp-open-and-occluded.png'),
    animations: 'disabled',
  });

  await page.goto('/?renderer=webgl2&render=performance&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=6301&map=atomic-acres');
  await page.waitForFunction(() => {
    const state = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any };
    }).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.weaponReady === true
      && state?.arenaSelection?.id === 'atomic-acres'
      && state?.frameCount > 12;
  }, undefined, { timeout: 45_000 });
  const performanceMechanics = await page.evaluate(() => {
    const state = (window as unknown as {
      __ATOMIC_ACRES_DEBUG__: { snapshot: () => any };
    }).__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      colliders: state.arenaSelection.colliders,
      physicsColliders: state.arenaSelection.physicsColliders,
    };
  });
  expect(performanceMechanics).toEqual({
    colliders: result.colliders,
    physicsColliders: result.physicsColliders,
  });
});
