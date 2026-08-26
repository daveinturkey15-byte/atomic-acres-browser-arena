import { expect, test } from '@playwright/test';
import sharp from 'sharp';

type Vector3 = readonly [number, number, number];

function inside(minimum: Vector3, maximum: Vector3, point: Vector3): boolean {
  return point.every((value, axis) => value >= minimum[axis] && value <= maximum[axis]);
}

function luminanceStats(data: Uint8Array, width: number, height: number, channels: number): Readonly<{
  mean: number;
  median: number;
  fractionAbove12: number;
}> {
  const pixels = width * height;
  const histogram = new Uint32Array(256);
  let sum = 0;
  let above12 = 0;
  for (let pixel = 0, offset = 0; pixel < pixels; pixel += 1, offset += channels) {
    const luminance = Math.round(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722);
    histogram[luminance] += 1;
    sum += luminance;
    if (luminance > 12) above12 += 1;
  }
  const medianIndex = Math.floor(pixels * 0.5);
  let cumulative = 0;
  let median = 0;
  for (; median < histogram.length; median += 1) {
    cumulative += histogram[median];
    if (cumulative > medianIndex) break;
  }
  return Object.freeze({
    mean: sum / pixels,
    median,
    fractionAbove12: above12 / pixels,
  });
}

test('ships the bounded, shadowed, slow-moving Gun Range contrast-light contract', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/?release=latest&renderer=webgl2&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=6502&map=gun-range');
  await page.waitForFunction(() => {
    const api = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot: () => any } }).__ATOMIC_ACRES_DEBUG__;
    return api?.snapshot().weaponReady === true;
  }, undefined, { timeout: 45_000 });

  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
    api.setCaptureViewmodelHidden(true);
    api.setCaptureCameraPose(0, 1.7, 15, 0, 0, 70, 63_000, 6_501);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

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
    maximumShadowLights: 6,
    authoredLights: expect.arrayContaining([expect.objectContaining({
      practicalId: 'range-inspection-key',
      shadowMapSize: 512,
      intendedVolume: expect.objectContaining({ id: 'gun-range-authored-shell-interior' }),
    }), expect.objectContaining({
      practicalId: 'range-cyan-lane-key',
      color: 0x53e9e1,
      shadowMapSize: 256,
    }), expect.objectContaining({
      practicalId: 'range-amber-lane-key',
      color: 0xffb84f,
      shadowMapSize: 256,
    }), expect.objectContaining({
      practicalId: 'test-bay-door-approach-key',
      color: 0x72f4ed,
      shadowMapSize: 256,
    }), expect.objectContaining({
      practicalId: 'test-bay-inspection-key',
      color: 0xc8f7ff,
      shadowMapSize: 512,
      intendedVolume: expect.objectContaining({ id: 'gun-range-test-bay-interior' }),
    }), expect.objectContaining({
      practicalId: 'test-bay-support-key',
      color: 0xffbf66,
      shadowMapSize: 256,
      intendedVolume: expect.objectContaining({ id: 'gun-range-test-bay-interior' }),
    })]),
    occlusion: { violations: [] },
  });
  // SwiftShader/llvmpipe deliberately suppress local shadow lights; hardware
  // Blender mode owns all six authored practicals.
  expect([0, 6]).toContain(evidence.activeLights);
  expect(evidence.shadowCastingLights).toBe(evidence.activeLights);
  expect(evidence.occlusion.activeLocalLights).toBe(evidence.activeLights);
  expect(evidence.occlusion.shadowedLocalLights).toBe(evidence.activeLights);

  const screenshotPath = testInfo.outputPath('gun-range-signal-on-1440p.png');
  const screenshot = await page.locator('#game').screenshot({ path: screenshotPath, animations: 'disabled' });
  await testInfo.attach('gun-range-signal-on-1440p', { path: screenshotPath, contentType: 'image/png' });
  const decoded = await sharp(screenshot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const luminance = luminanceStats(decoded.data, decoded.info.width, decoded.info.height, decoded.info.channels);
  await testInfo.attach('gun-range-signal-on-luminance', {
    body: Buffer.from(`${JSON.stringify(luminance, null, 2)}\n`),
    contentType: 'application/json',
  });
  expect(luminance.mean, 'Atomic Signal must not crush the lit range to black').toBeGreaterThanOrEqual(22);
  expect(luminance.median, 'at least half of the rendered range must retain readable luminance').toBeGreaterThanOrEqual(14);
  expect(luminance.fractionAbove12, 'the range must retain broad readable shadow detail').toBeGreaterThanOrEqual(0.75);

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
