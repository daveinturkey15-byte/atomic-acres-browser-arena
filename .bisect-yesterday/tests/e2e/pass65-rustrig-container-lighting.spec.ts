import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

type Vector3 = readonly [number, number, number];

function inside(minimum: Vector3, maximum: Vector3, point: Vector3): boolean {
  return point.every((value, axis) => value >= minimum[axis] && value <= maximum[axis]);
}

test('distributes bounded red, orange and yellow shadowed practicals across RustRig freight clusters', async ({ page }) => {
  test.setTimeout(90_000);
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  await page.goto('/?release=latest&renderer=webgl2&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=6503&map=rustworks-1v1');
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
    window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
  });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.gameStarted === true
      && snapshot?.arenaSelection?.id === 'rustworks-1v1'
      && snapshot?.render?.arenaContrastLighting?.definitionId === 'rustworks-1v1';
  }, undefined, { timeout: 45_000 });

  const evidence = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return {
      lighting: snapshot.render.arenaContrastLighting,
      policy: snapshot.render.playableScene.appliedArenaVisualPolicy,
      watchdog: snapshot.render.playableScene.renderWatchdog,
    };
  });
  expect(evidence.policy.budgets.maximumShadowLights).toBe(7);
  expect(evidence.lighting).toMatchObject({
    arenaId: 'rustworks-1v1',
    definitionId: 'rustworks-1v1',
    maximumShadowLights: 7,
    occlusion: { violations: [] },
  });
  expect([0, 6]).toContain(evidence.lighting.activeLights);
  expect(evidence.lighting.shadowCastingLights).toBe(evidence.lighting.activeLights);
  expect(evidence.lighting.occlusion.activeLocalLights).toBe(evidence.lighting.activeLights);
  expect(evidence.lighting.occlusion.shadowedLocalLights).toBe(evidence.lighting.activeLights);
  expect(evidence.watchdog).toMatchObject({ status: 'healthy', fatal: false });

  const containerLights = evidence.lighting.authoredLights.filter(
    ({ practicalId }: { practicalId: string }) => practicalId.startsWith('container-dynamic-'),
  ) as Array<{
    practicalId: string;
    position: Vector3;
    target: Vector3;
    color: number;
    intensity: number;
    shadowMapSize: number;
    intendedVolume: { id: string; minimum: Vector3; maximum: Vector3 };
    motion: { intensity: { amplitudeRatio: number; frequencyHz: number; phaseRadians: number } };
  }>;
  expect(containerLights.map(({ practicalId }) => practicalId)).toEqual([
    'container-dynamic-north-west',
    'container-dynamic-north-east',
    'container-dynamic-south-west',
    'container-dynamic-south-east',
  ]);
  expect(new Set(containerLights.map(({ color }) => color))).toEqual(new Set([0xff4d2e, 0xff9a3d, 0xffd25a]));
  for (const light of containerLights) {
    expect(light.shadowMapSize).toBe(256);
    expect(light.intendedVolume.id).toBe(`rustrig-${light.practicalId.replace('dynamic-', '')}-interior`);
    expect(inside(light.intendedVolume.minimum, light.intendedVolume.maximum, light.position)).toBe(true);
    expect(inside(light.intendedVolume.minimum, light.intendedVolume.maximum, light.target)).toBe(true);
    expect(light.motion.intensity.amplitudeRatio).toBeGreaterThan(0);
    expect(light.motion.intensity.amplitudeRatio).toBeLessThanOrEqual(0.2);
    expect(light.motion.intensity.frequencyHz).toBeGreaterThan(0);
    expect(light.motion.intensity.frequencyHz).toBeLessThanOrEqual(0.5);
  }
  expect(new Set(containerLights.map(({ intendedVolume }) => intendedVolume.id)).size).toBe(4);
  const evidenceDirectory = resolve(process.cwd(), 'artifacts/pass65/rustrig-container-lighting');
  mkdirSync(evidenceDirectory, { recursive: true });
  for (const cameraId of ['rustrig-container-dynamic-northwest', 'rustrig-container-dynamic-southeast']) {
    expect(await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.setArenaReviewCamera(id), cameraId)).toBe(true);
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true));
    await page.waitForTimeout(450);
    await page.screenshot({
      path: resolve(evidenceDirectory, `${cameraId}.png`),
      animations: 'disabled',
    });
  }
  expect(runtimeErrors).toEqual([]);
});
