import { expect, test } from '@playwright/test';

type Vector3 = readonly [number, number, number];

function inside(minimum: Vector3, maximum: Vector3, point: Vector3): boolean {
  return point.every((value, axis) => value >= minimum[axis] && value <= maximum[axis]);
}

test('ships the bounded, shadowed, slow-moving Gun Range contrast-light contract', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?renderer=webgl2&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&seed=6502&map=gun-range');
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__;
    return api?.snapshot().weaponReady === true;
  }, undefined, { timeout: 45_000 });

  await page.locator('#player-name').fill('PASS 65 RANGE LIGHT QA');
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__;
    const snapshot = api?.snapshot();
    return snapshot?.gameStarted === true
      && snapshot?.arenaSelection?.id === 'gun-range'
      && snapshot?.render?.arenaContrastLighting?.arenaId === 'gun-range';
  }, undefined, { timeout: 45_000 });

  const evidence = await page.evaluate(() => (
    window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot: () => any } }
  ).__ATOMIC_ACRES_DEBUG__.snapshot().render.arenaContrastLighting);

  expect(evidence).toMatchObject({
    arenaId: 'gun-range',
    definitionId: 'gun-range',
    maximumShadowLights: 1,
    authoredLights: [{
      practicalId: 'range-inspection-key',
      shadowMapSize: 512,
      intendedVolume: { id: 'gun-range-authored-shell-interior' },
    }],
    occlusion: { violations: [] },
  });
  expect([0, 1]).toContain(evidence.activeLights);
  expect(evidence.shadowCastingLights).toBe(evidence.activeLights);
  expect(evidence.occlusion.activeLocalLights).toBe(evidence.activeLights);
  expect(evidence.occlusion.shadowedLocalLights).toBe(evidence.activeLights);

  const light = evidence.authoredLights[0] as {
    position: Vector3;
    target: Vector3;
    intensity: number;
    intendedVolume: { minimum: Vector3; maximum: Vector3 };
    motion: {
      intensity: { amplitudeRatio: number; frequencyHz: number; phaseRadians: number };
      target: { amplitude: Vector3; frequencyHz: number; phaseRadians: number };
    };
  };
  expect(inside(light.intendedVolume.minimum, light.intendedVolume.maximum, light.position)).toBe(true);
  expect(inside(light.intendedVolume.minimum, light.intendedVolume.maximum, light.target)).toBe(true);
  const minimumTarget = light.target.map((value, axis) => value - Math.abs(light.motion.target.amplitude[axis])) as unknown as Vector3;
  const maximumTarget = light.target.map((value, axis) => value + Math.abs(light.motion.target.amplitude[axis])) as unknown as Vector3;
  expect(inside(light.intendedVolume.minimum, light.intendedVolume.maximum, minimumTarget)).toBe(true);
  expect(inside(light.intendedVolume.minimum, light.intendedVolume.maximum, maximumTarget)).toBe(true);

  const frequencies = [light.motion.intensity.frequencyHz, light.motion.target.frequencyHz];
  expect(Math.min(...frequencies)).toBeGreaterThan(0);
  expect(Math.max(...frequencies)).toBeLessThanOrEqual(0.5);
  const samples = [0, 2_500, 5_000, 7_500, 10_000].map((nowMs) => {
    const seconds = nowMs / 1_000;
    const intensityPhase = seconds * Math.PI * 2 * light.motion.intensity.frequencyHz + light.motion.intensity.phaseRadians;
    const targetPhase = seconds * Math.PI * 2 * light.motion.target.frequencyHz + light.motion.target.phaseRadians;
    return {
      intensity: light.intensity * (1 + light.motion.intensity.amplitudeRatio * Math.sin(intensityPhase)),
      targetX: light.target[0] + light.motion.target.amplitude[0] * Math.sin(targetPhase),
    };
  });
  const intensitySpan = Math.max(...samples.map((sample) => sample.intensity)) - Math.min(...samples.map((sample) => sample.intensity));
  const targetSpan = Math.max(...samples.map((sample) => sample.targetX)) - Math.min(...samples.map((sample) => sample.targetX));
  expect(intensitySpan).toBeGreaterThan(0);
  expect(intensitySpan).toBeLessThanOrEqual(light.intensity * light.motion.intensity.amplitudeRatio * 2 + 1e-9);
  expect(targetSpan).toBeGreaterThan(0);
  expect(targetSpan).toBeLessThanOrEqual(Math.abs(light.motion.target.amplitude[0]) * 2 + 1e-9);
});
