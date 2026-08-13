import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const renderer = process.env.PASS71_NUKE_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const warningPosition = [75.75, 7.5, 6] as const;
const cameraPosition = [91, 8.5, 20] as const;
const cameraYaw = Math.atan2(
  cameraPosition[0] - warningPosition[0],
  cameraPosition[2] - warningPosition[2],
);
const cameraPitch = Math.atan2(
  warningPosition[1] - cameraPosition[1],
  Math.hypot(cameraPosition[0] - warningPosition[0], cameraPosition[2] - warningPosition[2]),
);

type NukeWarningSnapshot = Readonly<{
  active: boolean;
  detonated: boolean;
  detonateInMs: number;
  warning?: Readonly<{
    visible: boolean;
    arenaId: string;
    position: number[];
    scale: number;
    coreOpacity: number;
    ringOpacity: number;
    lightIntensity: number;
  }>;
}>;

async function redWarningDelta(before: Buffer, after: Buffer): Promise<Readonly<{
  changedWarningPixels: number;
  maximumRedDelta: number;
}>> {
  const [beforeRaw, afterRaw] = await Promise.all([
    sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(afterRaw.info).toMatchObject({ width: beforeRaw.info.width, height: beforeRaw.info.height, channels: 3 });
  const { width, height, channels } = afterRaw.info;
  let changedWarningPixels = 0;
  let maximumRedDelta = 0;
  for (let y = Math.floor(height * 0.16); y < Math.ceil(height * 0.84); y += 1) {
    for (let x = Math.floor(width * 0.18); x < Math.ceil(width * 0.82); x += 1) {
      const offset = (y * width + x) * channels;
      const red = afterRaw.data[offset]!;
      const green = afterRaw.data[offset + 1]!;
      const blue = afterRaw.data[offset + 2]!;
      const redDelta = red - beforeRaw.data[offset]!;
      maximumRedDelta = Math.max(maximumRedDelta, redDelta);
      if (redDelta >= 34 && red >= 82 && red >= green * 1.18 && red >= blue * 1.32) {
        changedWarningPixels += 1;
      }
    }
  }
  return Object.freeze({ changedWarningPixels, maximumRedDelta });
}

test('renders the pre-detonation Nuke warning inside the Gun Range killstreak room', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=gun-range&renderer=${renderer}${requireWebGpu}&render=blender&signal=on&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=pass71-nuke-warning`);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot() as any;
    return snapshot?.bootstrap?.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
  await page.evaluate(({ position, yaw, pitch }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    api.setCaptureCameraPose(position[0], position[1], position[2], yaw, pitch, 60, 1_000, 7_101);
  }, { position: cameraPosition, yaw: cameraYaw, pitch: cameraPitch });
  await page.waitForTimeout(250);

  const output = resolve(process.cwd(), `artifacts/pass71/nuke-warning/${renderer}`);
  mkdirSync(output, { recursive: true });
  const before = await page.screenshot({ path: resolve(output, 'gun-range-before-warning-1920x1080.png'), animations: 'disabled' });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.earnSupport(15);
    api.activateSupport('nuke');
  });
  await expect(page.locator('#nuke-warning')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).fieldSupport.nuke as NukeWarningSnapshot
  )), { timeout: 2_500 }).toMatchObject({
    active: true,
    detonated: false,
    warning: {
      visible: true,
      arenaId: 'gun-range',
      position: [...warningPosition],
    },
  });
  await expect.poll(async () => page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).fieldSupport.nuke.warning?.scale ?? 0
  )), { timeout: 2_000 }).toBeGreaterThan(0.72);
  const armed = await page.evaluate(() => (
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).fieldSupport.nuke as NukeWarningSnapshot
  ));
  expect(armed.detonateInMs).toBeGreaterThan(2_000);
  expect(armed.warning).toMatchObject({
    visible: true,
    arenaId: 'gun-range',
    position: [...warningPosition],
  });
  expect(armed.warning!.coreOpacity).toBeGreaterThan(0);
  expect(armed.warning!.ringOpacity).toBeGreaterThan(0);
  expect(armed.warning!.lightIntensity).toBeGreaterThan(0);

  const active = await page.screenshot({ path: resolve(output, 'gun-range-nuke-warning-1920x1080.png'), animations: 'disabled' });
  const raster = await redWarningDelta(before, active);
  await testInfo.attach('pass71-nuke-warning-raster', {
    body: Buffer.from(`${JSON.stringify({ renderer, armed, raster }, null, 2)}\n`),
    contentType: 'application/json',
  });
  expect(raster.maximumRedDelta).toBeGreaterThanOrEqual(72);
  expect(raster.changedWarningPixels).toBeGreaterThanOrEqual(240);
  expect(errors).toEqual([]);
});
