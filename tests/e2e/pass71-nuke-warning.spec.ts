import { mkdirSync, writeFileSync } from 'node:fs';
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
  }>;
}>;

type RasterCrop = Readonly<{ left: number; top: number; width: number; height: number }>;

async function redWarningAttributionDelta(control: Buffer, visible: Buffer, crop: RasterCrop): Promise<Readonly<{
  changedWarningPixels: number;
  maximumRedDelta: number;
}>> {
  const [controlRaw, visibleRaw] = await Promise.all([
    sharp(control).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(visible).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(visibleRaw.info).toMatchObject({ width: controlRaw.info.width, height: controlRaw.info.height, channels: 3 });
  const { width, height, channels } = visibleRaw.info;
  let changedWarningPixels = 0;
  let maximumRedDelta = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = visibleRaw.data[offset]!;
      const green = visibleRaw.data[offset + 1]!;
      const blue = visibleRaw.data[offset + 2]!;
      const redDelta = red - controlRaw.data[offset]!;
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
  await page.setViewportSize({ width: 1_280, height: 720 });
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
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  await page.evaluate(({ position, yaw, pitch }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__ as any;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    api.setCaptureCameraPose(position[0], position[1], position[2], yaw, pitch, 60, 1_000, 7_101);
  }, { position: cameraPosition, yaw: cameraYaw, pitch: cameraPitch });
  await page.waitForTimeout(250);

  const output = resolve(process.cwd(), `artifacts/pass71/nuke-warning/${renderer}`);
  mkdirSync(output, { recursive: true });
  const beforePath = resolve(output, 'gun-range-before-warning-1920x1080.png');
  const activePath = resolve(output, 'gun-range-nuke-warning-1920x1080.png');
  const hiddenControlPath = resolve(output, 'gun-range-nuke-warning-hidden-control.nonpublishable.png');
  const cdp = await page.context().newCDPSession(page);
  try {
    const beforeSurface = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    writeFileSync(beforePath, Buffer.from(beforeSurface.data, 'base64'));

    const activation = await page.evaluate(async () => {
      const api = window.__ATOMIC_ACRES_DEBUG__ as any;
      const snapshot = (): NukeWarningSnapshot => (
        (api.snapshot() as any).fieldSupport.nuke as NukeWarningSnapshot
      );
      api.earnSupport(15);
      api.activateSupport('nuke');
      const armed = snapshot();
      const rendered = await new Promise<NukeWarningSnapshot>((resolveRendered) => {
        const sampleRenderedFrame = (): void => {
          const current = snapshot();
          if ((current.warning?.scale ?? 0) > 0.72 || current.detonated || !current.active) {
            resolveRendered(current);
            return;
          }
          requestAnimationFrame(sampleRenderedFrame);
        };
        requestAnimationFrame(sampleRenderedFrame);
      });
      const frozen = rendered.active && !rendered.detonated && (rendered.warning?.scale ?? 0) > 0.72
        ? await api.freezeNukeWarningEvidenceFrame()
        : null;
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
      const hud = document.querySelector<HTMLElement>('#nuke-warning')!.getBoundingClientRect();
      return {
        armed,
        rendered,
        frozen,
        framing: {
          canvas: { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
          hud: { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom },
        },
      };
    });
    const activeSurface = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const active = Buffer.from(activeSurface.data, 'base64');
    writeFileSync(activePath, active);
    const visibleCaptureReceipt = await page.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__ as any).nukeWarningEvidenceFrame()
    ));
    const hiddenControl = await page.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__ as any).captureNukeWarningHiddenControl()
    ));
    const hiddenControlSurface = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const hiddenControlPng = Buffer.from(hiddenControlSurface.data, 'base64');
    writeFileSync(hiddenControlPath, hiddenControlPng);

    expect(activation.armed).toMatchObject({
      active: true,
      detonated: false,
      warning: {
        visible: true,
        arenaId: 'gun-range',
        position: [...warningPosition],
      },
    });
    expect(activation.armed.detonateInMs).toBeGreaterThan(2_000);
    expect(activation.rendered).toMatchObject({
      active: true,
      detonated: false,
      warning: {
        visible: true,
        arenaId: 'gun-range',
        position: [...warningPosition],
      },
    });
    expect(activation.rendered.warning!.scale).toBeGreaterThan(0.72);
    expect(activation.rendered.warning!.coreOpacity).toBeGreaterThan(0);
    expect(activation.rendered.warning!.ringOpacity).toBeGreaterThan(0);
    expect(activation.frozen).toMatchObject({
      contract: 'nuke-warning-frozen-visible-frame-v1',
      renderer,
      active: true,
      detonated: false,
      beaconVisible: true,
      beaconPosition: [...warningPosition],
    });
    expect(activation.frozen.detonateInMs).toBeGreaterThan(2_000);
    expect(activation.frozen.beaconScale).toBeGreaterThan(0.72);
    expect(activation.frozen.coreOpacity).toBeGreaterThan(0);
    expect(activation.frozen.ringOpacity).toBeGreaterThan(0);
    expect(visibleCaptureReceipt).toEqual(activation.frozen);
    expect(hiddenControl).toMatchObject({
      contract: 'nuke-warning-hidden-control-v1',
      nonPublishable: true,
      renderer,
      simulationFrame: activation.frozen.simulationFrame,
      captureRevision: activation.frozen.captureRevision,
      officialSubmissionSequence: activation.frozen.submissionSequence,
      beaconPosition: [...warningPosition],
      beaconScale: activation.frozen.beaconScale,
      coreOpacity: activation.frozen.coreOpacity,
      ringOpacity: activation.frozen.ringOpacity,
      beaconHiddenDuringSubmission: true,
      beaconRestored: true,
    });
    if (renderer === 'webgpu') {
      expect(hiddenControl.submissionSequence).toBeGreaterThan(hiddenControl.officialSubmissionSequence);
      expect(hiddenControl.completedSequence).toBeGreaterThanOrEqual(hiddenControl.submissionSequence);
    }

    const width = 1_920;
    const height = 1_080;
    const cropTop = Math.max(Math.ceil(activation.framing.hud.bottom + 16), Math.floor(height * 0.28));
    const attributableCrop = {
      left: Math.floor(width * 0.25),
      top: cropTop,
      width: Math.ceil(width * 0.75) - Math.floor(width * 0.25),
      height: Math.ceil(height * 0.78) - cropTop,
    } satisfies RasterCrop;
    expect(activation.framing.canvas).toEqual({ left: 0, top: 0, right: width, bottom: height });
    expect(attributableCrop.top).toBeGreaterThan(activation.framing.hud.bottom);
    expect(attributableCrop.top).toBeLessThan(height / 2);
    expect(attributableCrop.height).toBeGreaterThan(0);
    const raster = await redWarningAttributionDelta(hiddenControlPng, active, attributableCrop);
    await testInfo.attach('pass71-nuke-warning-raster', {
      body: Buffer.from(`${JSON.stringify({
        renderer,
        ...activation,
        visibleCaptureReceipt,
        hiddenControl,
        attributableCrop,
        raster,
      }, null, 2)}\n`),
      contentType: 'application/json',
    });
    await testInfo.attach('pass71-nuke-warning-hidden-control-nonpublishable', {
      path: hiddenControlPath,
      contentType: 'image/png',
    });
    expect(raster.maximumRedDelta).toBeGreaterThanOrEqual(72);
    expect(raster.changedWarningPixels).toBeGreaterThanOrEqual(240);
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => (
      (window.__ATOMIC_ACRES_DEBUG__ as any).releaseNukeWarningEvidenceFrame()
    )).catch(() => false);
    await cdp.detach();
  }
});
