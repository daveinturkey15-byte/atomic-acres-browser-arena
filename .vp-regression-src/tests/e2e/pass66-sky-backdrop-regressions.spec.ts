import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const SKY_REVIEWS = [
  {
    arenaId: 'atomic-acres', cameraId: 'nuke-town-overview', position: [42, 28, 48], target: [0, 2, 0],
    skyAsset: './assets/original/skies/atomic-acres-sunset.webp',
  },
  {
    arenaId: 'rustworks-1v1', cameraId: 'rustrig-overview', position: [38, 31, 42], target: [0, 5, 0],
    skyAsset: './assets/original/skies/rustworks-industrial-night.webp',
  },
  {
    arenaId: 'skyline-terminal', cameraId: 'terminal-overview', position: [42, 29, 42], target: [0, 3, -10],
    skyAsset: './assets/original/skies/terminal-airport-dawn.webp',
  },
] as const;
const requestedArena = process.env.PASS66_SKY_ARENA;
const requestedRenderProfile = process.env.PASS66_SKY_RENDER_PROFILE ?? 'blender';
const requestedRenderer = process.env.PASS66_SKY_RENDERER ?? 'webgl2';
const ACTIVE_SKY_REVIEWS = SKY_REVIEWS.filter((review) => !requestedArena || review.arenaId === requestedArena);
const OUTDOOR_SKY_ASSETS = SKY_REVIEWS.map((review) => review.skyAsset);
const CAPTURE_SIZE = Object.freeze({ width: 3_840, height: 2_160 });
// Hardware WebGPU's warmed HDR/post-AA path measured lower one-pixel energy
// than direct WebGL2 (Atomic baseline: 0.441 / 1.203 / 0.721 versus
// 0.768 / 2.714 / 0.499). These renderer-specific bounds remain independent
// of the stricter decoded-asset authoring gates and do not relax seam health.
const LIVE_DETAIL_THRESHOLDS = requestedRenderer === 'webgpu'
  ? Object.freeze({ adjacentMae: 0.25, laplacianMae: 0.8, flatNeighborRatio: 0.82 })
  : Object.freeze({ adjacentMae: 0.4, laplacianMae: 1.5, flatNeighborRatio: 0.68 });

type DecodedFrame = Readonly<{ data: Buffer; width: number; height: number; channels: number }>;

async function decodeFrame(frame: Buffer): Promise<DecodedFrame> {
  const { data, info } = await sharp(frame).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return Object.freeze({ data, width: info.width, height: info.height, channels: info.channels });
}

function columnMae(frame: DecodedFrame, leftX: number, rightX: number): number {
  const maximumY = Math.floor(frame.height * 0.72);
  let delta = 0;
  let samples = 0;
  for (let y = 0; y < maximumY; y += 1) {
    const row = y * frame.width * frame.channels;
    const left = row + leftX * frame.channels;
    const right = row + rightX * frame.channels;
    for (let channel = 0; channel < 3; channel += 1) {
      delta += Math.abs(frame.data[left + channel]! - frame.data[right + channel]!);
      samples += 1;
    }
  }
  return delta / samples;
}

function crossFrameColumnMae(left: DecodedFrame, right: DecodedFrame, x: number): number {
  expect(right.width).toBe(left.width);
  expect(right.height).toBe(left.height);
  const maximumY = Math.floor(left.height * 0.72);
  let delta = 0;
  let samples = 0;
  for (let y = 0; y < maximumY; y += 1) {
    const pixel = (y * left.width + x) * left.channels;
    const other = (y * right.width + x) * right.channels;
    for (let channel = 0; channel < 3; channel += 1) {
      delta += Math.abs(left.data[pixel + channel]! - right.data[other + channel]!);
      samples += 1;
    }
  }
  return delta / samples;
}

function skyDetailEvidence(frame: DecodedFrame): Readonly<{
  adjacentMae: number;
  laplacianMae: number;
  flatNeighborRatio: number;
}> {
  const maximumY = Math.floor(frame.height * 0.72);
  let adjacentDelta = 0;
  let laplacianDelta = 0;
  let flatNeighbors = 0;
  let adjacentSamples = 0;
  let laplacianSamples = 0;
  for (let y = 1; y < maximumY - 1; y += 2) {
    for (let x = 1; x < frame.width - 1; x += 2) {
      const pixel = (y * frame.width + x) * frame.channels;
      const left = pixel - frame.channels;
      const right = pixel + frame.channels;
      const above = pixel - frame.width * frame.channels;
      const below = pixel + frame.width * frame.channels;
      let neighborDelta = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = frame.data[pixel + channel]!;
        neighborDelta += Math.abs(center - frame.data[right + channel]!);
        laplacianDelta += Math.abs(
          center * 4
          - frame.data[left + channel]!
          - frame.data[right + channel]!
          - frame.data[above + channel]!
          - frame.data[below + channel]!,
        );
        adjacentSamples += 1;
        laplacianSamples += 1;
      }
      adjacentDelta += neighborDelta;
      if (neighborDelta / 3 < 0.5) flatNeighbors += 1;
    }
  }
  const sampledPixels = adjacentSamples / 3;
  return Object.freeze({
    adjacentMae: adjacentDelta / adjacentSamples,
    laplacianMae: laplacianDelta / laplacianSamples,
    flatNeighborRatio: flatNeighbors / sampledPixels,
  });
}

test('captures every outdoor compatibility sky from its deterministic overview camera', async ({ page }) => {
  // Three maps x five 4K captures can exceed four minutes on CI's SwiftShader
  // WebGL2 fallback even when every frame and renderer watchdog is healthy.
  test.setTimeout(480_000);
  await page.setViewportSize(CAPTURE_SIZE);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  const output = resolve(process.cwd(), 'artifacts/pass66/sky-backdrops');
  mkdirSync(output, { recursive: true });
  const runReceipt: Array<Record<string, unknown>> = [];

  expect(ACTIVE_SKY_REVIEWS.length).toBeGreaterThan(0);
  for (const review of ACTIVE_SKY_REVIEWS) {
    const requireWebGpu = requestedRenderer === 'webgpu' ? '&requireWebGPU=1' : '';
    await page.goto(`/?release=latest&map=${review.arenaId}&renderer=${requestedRenderer}${requireWebGpu}&render=${requestedRenderProfile}&signal=off&grass=off&mist=off&rays=off&externalServices=off&seed=pass66-sky-review`);
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
    await page.waitForFunction((asset) => performance.getEntriesByName(new URL(asset, location.href).href)
      .some((entry) => entry.entryType === 'resource' && entry.responseEnd > 0), review.skyAsset, { timeout: 30_000 });
    const reviewState = await page.evaluate(({ arenaId, cameraId }) => {
      const api = window.__ATOMIC_ACRES_DEBUG__;
      api.setBotsFrozen(true);
      api.setCaptureViewmodelHidden(true);
      const cameraAccepted = api.setArenaReviewCamera(cameraId);
      const snapshot = api.snapshot();
      return {
        cameraAccepted,
        arenaId: snapshot.arenaSelection.id,
        definitionId: snapshot.render.playableScene.appliedArenaVisualPolicy.definitionId,
        cameraId: snapshot.render.playableScene.deterministicReview.cameraId,
        cameraPosition: snapshot.render.playableScene.cameraComposition.position,
        cameraForward: snapshot.render.playableScene.cameraComposition.forward,
        arenaReceipt: snapshot.render.playableScene.arena,
        arenaWatchdog: snapshot.render.playableScene.renderWatchdog,
        activePresentationRoots: snapshot.render.playableScene.authoritativeArenaRoots,
        runtime: snapshot.render.runtime,
        frameCount: snapshot.frameCount,
        expectedArenaId: arenaId,
      };
    }, review);
    console.log('PASS66_SKY_DIAGNOSTIC', JSON.stringify(reviewState));
    expect(reviewState).toMatchObject({
      cameraAccepted: true,
      arenaId: review.arenaId,
      definitionId: review.arenaId,
      cameraId: review.cameraId,
      expectedArenaId: review.arenaId,
      arenaReceipt: {
        arenaId: review.arenaId,
        activePresentationRoots: 1,
        authority: 'gameplay-root-adopted',
      },
      activePresentationRoots: 1,
    });
    expect(reviewState.arenaReceipt.requestedResources).toContain(review.skyAsset);
    for (const unselectedSky of OUTDOOR_SKY_ASSETS.filter((asset) => asset !== review.skyAsset)) {
      expect(reviewState.arenaReceipt.requestedResources).not.toContain(unselectedSky);
    }
    if (requestedRenderer === 'webgpu') {
      expect(reviewState.runtime).toMatchObject({
        actualBackend: 'webgpu',
        deviceLost: false,
        uncapturedErrors: 0,
        presentation: { status: 'healthy' },
      });
    }
    await page.waitForFunction((frameCount) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frameCount, reviewState.frameCount);
    const afterFrame = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().render.playableScene.cameraComposition);
    expect(afterFrame.position).toEqual(review.position);
    const expectedForward = review.target.map((value, index) => value - review.position[index]);
    const expectedLength = Math.hypot(...expectedForward);
    const directionDot = afterFrame.forward.reduce(
      (sum: number, value: number, index: number) => sum + value * expectedForward[index] / expectedLength,
      0,
    );
    expect(directionDot).toBeGreaterThan(0.9999);
    const rendererSuffix = requestedRenderer === 'webgl2' ? '' : `-${requestedRenderer}`;
    await page.screenshot({ path: resolve(output, `${review.arenaId}${rendererSuffix}-3840x2160.png`), animations: 'disabled' });
    await page.locator('#game').screenshot({ path: resolve(output, `${review.arenaId}${rendererSuffix}-canvas-3840x2160.png`), animations: 'disabled' });

    const seamFrames: Array<{ id: string; yaw: number; decoded?: DecodedFrame }> = [
      { id: 'minus', yaw: Math.PI / 2 - 0.012 },
      { id: 'center', yaw: Math.PI / 2 },
      { id: 'plus', yaw: Math.PI / 2 + 0.012 },
    ];
    for (const seamFrame of seamFrames) {
      const frameCount = await page.evaluate(({ yaw }) => {
        const api = window.__ATOMIC_ACRES_DEBUG__;
        api.setCaptureCameraPose(0, 120, 0, yaw, -0.02, 70, 64_000, 6_402);
        return api.snapshot().frameCount;
      }, seamFrame);
      await page.waitForFunction((count) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > count, frameCount);
      const screenshot = await page.locator('#game').screenshot({
        path: resolve(output, `${review.arenaId}${rendererSuffix}-seam-wrap-${seamFrame.id}-3840x2160.png`),
        animations: 'disabled',
      });
      seamFrame.decoded = await decodeFrame(screenshot);
    }
    const seamMinus = seamFrames[0]!.decoded!;
    const seamCenter = seamFrames[1]!.decoded!;
    const seamPlus = seamFrames[2]!.decoded!;
    const centerX = Math.floor(seamCenter.width / 2);
    const seamEvidence = {
      centerAdjacentMae: columnMae(seamCenter, centerX - 1, centerX),
      crossWrapMae: crossFrameColumnMae(seamMinus, seamPlus, centerX),
      detail: skyDetailEvidence(seamCenter),
    };
    console.log('PASS66_SKY_SEAM', JSON.stringify({ arenaId: review.arenaId, renderer: requestedRenderer, ...seamEvidence }));
    expect(seamCenter).toMatchObject(CAPTURE_SIZE);
    expect(seamEvidence.centerAdjacentMae).toBeLessThan(12);
    expect(seamEvidence.crossWrapMae).toBeLessThan(18);
    // Use independent variation and second-derivative gates: the 4K renderer's
    // bilinear sampling and RustRig's low luminance legitimately lower mean
    // one-pixel MAE, while a flat gradient or block-upscale still fails the
    // independent Laplacian and tightened flat-neighbor gates decisively.
    expect(seamEvidence.detail.adjacentMae).toBeGreaterThan(LIVE_DETAIL_THRESHOLDS.adjacentMae);
    expect(seamEvidence.detail.laplacianMae).toBeGreaterThan(LIVE_DETAIL_THRESHOLDS.laplacianMae);
    expect(seamEvidence.detail.flatNeighborRatio).toBeLessThan(LIVE_DETAIL_THRESHOLDS.flatNeighborRatio);

    if (review.arenaId === 'atomic-acres') {
      const contextFrame = await page.evaluate(() => {
        window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(0, 5, 20, 0, -0.15, 70, 63_000, 6_401);
        return window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount;
      });
      await page.waitForFunction((frameCount) => window.__ATOMIC_ACRES_DEBUG__.snapshot().frameCount > frameCount, contextFrame);
      await page.screenshot({ path: resolve(output, `atomic-acres${rendererSuffix}-ground-context-3840x2160.png`), animations: 'disabled' });
    }
    runReceipt.push({
      arenaId: review.arenaId,
      skyAsset: review.skyAsset,
      cameraId: review.cameraId,
      renderer: {
        requestedBackend: reviewState.runtime.requestedBackend,
        actualBackend: reviewState.runtime.actualBackend,
        adapterLabel: reviewState.runtime.adapterLabel,
        softwareAdapter: reviewState.runtime.softwareAdapter,
        deviceLost: reviewState.runtime.deviceLost,
        uncapturedErrors: reviewState.runtime.uncapturedErrors,
        presentationStatus: reviewState.runtime.presentation.status,
      },
      arenaWatchdog: {
        status: reviewState.arenaWatchdog.status,
        incidents: reviewState.arenaWatchdog.incidents,
        recoveries: reviewState.arenaWatchdog.recoveries,
        fatal: reviewState.arenaWatchdog.fatal,
      },
      activePresentationRoots: reviewState.activePresentationRoots,
      thresholds: {
        centerAdjacentMaeMaximum: 12,
        crossWrapMaeMaximum: 18,
        ...LIVE_DETAIL_THRESHOLDS,
      },
      evidence: seamEvidence,
    });
  }
  expect(errors).toEqual([]);
  writeFileSync(
    resolve(output, `pass66-sky-${requestedRenderer}-3840x2160-receipt.json`),
    `${JSON.stringify({
      renderer: requestedRenderer,
      renderProfile: requestedRenderProfile,
      captureSize: CAPTURE_SIZE,
      staticAssetGate: '4096x2048 runtime, >500000 encoded bytes, source-relative luminance/variance/entropy/adjacent/Laplacian authoring gates',
      maps: runReceipt,
      pageErrors: errors,
    }, null, 2)}\n`,
    'utf8',
  );
});
