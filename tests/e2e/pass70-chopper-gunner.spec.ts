import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import {
  captureFrameActionBaseline,
  deriveFrameActionBudget,
  type FrameActionBudget,
} from './frame-action-budget';

const renderer = process.env.PASS70_CHOPPER_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const loadout = Object.freeze({
  schemaVersion: 1,
  slots: ['care-package', 'piloted-drone', 'carpet-bomber', 'chopper', 'drone-swarm'],
});

type PresentedReceiptKind = 'rigged' | 'camera-only';

type ChopperPossessionEntryReceipt = Readonly<{
  accepted: boolean;
  synchronousMs: number;
  eventToPresentedFrameMs: number;
  eventToCompletionMs: number;
  maximumAnimationFrameGapMs: number;
  maximumPendingForMs: number;
  presentationStatus: string;
  startingPresentedFrame: number;
  endingPresentedFrame: number;
  startingSubmissionSequence: number;
  startingCompletedSequence: number;
  targetSubmissionSequence: number;
  endingSubmissionSequence: number;
  endingCompletedSequence: number;
  completionFailures: number;
  possession: string;
}>;

async function captureFirstChopperPossessionEntry(page: Page): Promise<ChopperPossessionEntryReceipt> {
  return page.evaluate(() => new Promise<ChopperPossessionEntryReceipt>((resolveEntry, rejectEntry) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    requestAnimationFrame(() => {
      const startedAt = performance.now();
      const startingPresentedFrame = debug.admissionState().presentedGameplayFrame;
      const startingPresentation = debug.samplePresentationTelemetry() as any;
      const synchronous = startingPresentation.status === 'synchronous';
      const accepted = debug.toggleChopperGunnerControl();
      const synchronousMs = performance.now() - startedAt;
      let previousAnimationFrameAt = startedAt;
      let maximumAnimationFrameGapMs = 0;
      let maximumPendingForMs = startingPresentation.pendingForMs as number;
      let eventToPresentedFrameMs: number | null = null;
      let eventToCompletionMs: number | null = null;
      let targetSubmissionSequence: number | null = synchronous ? 0 : null;
      let endingPresentedFrame = startingPresentedFrame;
      let endingPresentation = startingPresentation;
      const deadline = startedAt + 2_000;
      const rounded = (value: number) => Number(value.toFixed(3));
      const inspect = () => {
        const now = performance.now();
        maximumAnimationFrameGapMs = Math.max(maximumAnimationFrameGapMs, now - previousAnimationFrameAt);
        previousAnimationFrameAt = now;
        endingPresentedFrame = debug.admissionState().presentedGameplayFrame;
        endingPresentation = debug.samplePresentationTelemetry() as any;
        maximumPendingForMs = Math.max(maximumPendingForMs, endingPresentation.pendingForMs as number);
        if (eventToPresentedFrameMs === null && endingPresentedFrame > startingPresentedFrame) {
          eventToPresentedFrameMs = now - startedAt;
          if (synchronous) eventToCompletionMs = eventToPresentedFrameMs;
        }
        if (!synchronous && targetSubmissionSequence === null
          && endingPresentation.submissionSequence > startingPresentation.submissionSequence) {
          targetSubmissionSequence = endingPresentation.submissionSequence;
        }
        if (!synchronous && eventToCompletionMs === null && targetSubmissionSequence !== null
          && endingPresentation.completedSequence >= targetSubmissionSequence) {
          eventToCompletionMs = now - startedAt;
        }
        if (eventToPresentedFrameMs !== null && eventToCompletionMs !== null
          && targetSubmissionSequence !== null) {
          resolveEntry({
            accepted,
            synchronousMs: rounded(synchronousMs),
            eventToPresentedFrameMs: rounded(eventToPresentedFrameMs),
            eventToCompletionMs: rounded(eventToCompletionMs),
            maximumAnimationFrameGapMs: rounded(maximumAnimationFrameGapMs),
            maximumPendingForMs: rounded(maximumPendingForMs),
            presentationStatus: endingPresentation.status,
            startingPresentedFrame,
            endingPresentedFrame,
            startingSubmissionSequence: startingPresentation.submissionSequence,
            startingCompletedSequence: startingPresentation.completedSequence,
            targetSubmissionSequence,
            endingSubmissionSequence: endingPresentation.submissionSequence,
            endingCompletedSequence: endingPresentation.completedSequence,
            completionFailures: endingPresentation.completionFailures,
            possession: document.documentElement.dataset.killstreakPossession ?? 'none',
          });
          return;
        }
        if (now >= deadline) {
          rejectEntry(new Error('First Chopper possession did not reach a completed presented frame within 2000ms'));
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }));
}

function assertBoundedChopperPossessionEntry(
  receipt: ChopperPossessionEntryReceipt,
  budget: FrameActionBudget,
): void {
  const evidence = JSON.stringify({ receipt, budget });
  expect(receipt.accepted, evidence).toBe(true);
  expect(receipt.synchronousMs, `${evidence}: synchronous control admission`).toBeLessThan(budget.maximumSynchronousActionMs);
  expect(receipt.eventToPresentedFrameMs, `${evidence}: next presented gameplay frame`).toBeLessThan(budget.maximumActionMs);
  expect(receipt.eventToCompletionMs, `${evidence}: completed presentation frontier`).toBeLessThan(budget.maximumActionMs);
  expect(receipt.maximumAnimationFrameGapMs, `${evidence}: no possession-entry hitch`).toBeLessThan(budget.maximumActionMs);
  expect(receipt.maximumPendingForMs, `${evidence}: no hidden completion backlog`).toBeLessThan(budget.maximumActionMs);
  expect(receipt.completionFailures, evidence).toBe(0);
  expect(receipt.presentationStatus, evidence).toMatch(/^(?:healthy|synchronous)$/u);
  expect(receipt.endingPresentedFrame, evidence).toBeGreaterThan(receipt.startingPresentedFrame);
  expect(receipt.endingSubmissionSequence, evidence).toBeGreaterThanOrEqual(receipt.startingSubmissionSequence);
  expect(receipt.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(receipt.startingCompletedSequence);
  expect(receipt.endingCompletedSequence, evidence).toBeGreaterThanOrEqual(receipt.targetSubmissionSequence);
  expect(receipt.possession, evidence).toBe('chopper-gunner');
}

function projectWorldBounds(
  bounds: { min: number[]; max: number[] },
  receipt: { position: number[]; yaw: number; pitch: number; fov: number },
  viewport: number[],
) {
  const [width, height] = viewport;
  const verticalTangent = Math.tan((receipt.fov * Math.PI / 180) / 2);
  const horizontalTangent = verticalTangent * (width / height);
  const forward = [
    -Math.sin(receipt.yaw) * Math.cos(receipt.pitch),
    Math.sin(receipt.pitch),
    -Math.cos(receipt.yaw) * Math.cos(receipt.pitch),
  ];
  const right = [-forward[2], 0, forward[0]];
  const rightLength = Math.hypot(...right);
  for (let axis = 0; axis < 3; axis += 1) right[axis] /= rightLength;
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const projected = [] as { x: number; y: number; depth: number }[];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) {
        const relative = [x - receipt.position[0], y - receipt.position[1], z - receipt.position[2]];
        const depth = relative.reduce((sum, coordinate, axis) => sum + coordinate * forward[axis], 0);
        const cameraX = relative.reduce((sum, coordinate, axis) => sum + coordinate * right[axis], 0);
        const cameraY = relative.reduce((sum, coordinate, axis) => sum + coordinate * up[axis], 0);
        projected.push({
          x: width * (0.5 + cameraX / Math.max(0.001, depth) / horizontalTangent / 2),
          y: height * (0.5 - cameraY / Math.max(0.001, depth) / verticalTangent / 2),
          depth,
        });
      }
    }
  }
  const viewportBounds = {
    minX: Math.min(...projected.map((point) => point.x)),
    maxX: Math.max(...projected.map((point) => point.x)),
    minY: Math.min(...projected.map((point) => point.y)),
    maxY: Math.max(...projected.map((point) => point.y)),
  };
  return {
    viewportBounds,
    viewportCoverage: {
      width: (viewportBounds.maxX - viewportBounds.minX) / width,
      height: (viewportBounds.maxY - viewportBounds.minY) / height,
    },
    allBoundsInFront: projected.every((point) => point.depth > 0),
  };
}

async function pauseCompletedPresentedFrame(
  page: Page,
  captureRevision: number | null = null,
  receiptKind: PresentedReceiptKind = 'rigged',
) {
  const baselineFrame = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.admissionState() as any
  ).presentedGameplayFrame as number);
  const committedHandle = await page.waitForFunction(({ afterFrame, revision, kind }) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const presentedGameplayFrame = (api.admissionState() as any).presentedGameplayFrame as number;
    if (presentedGameplayFrame < afterFrame + 2) return false;
    if (revision === null) return { frame: presentedGameplayFrame, captureRevision: null };
    const deterministicReview = (api.snapshot() as any).deterministicReview;
    const receipt = kind === 'camera-only'
      ? deterministicReview.presentedCamera
      : deterministicReview.presentedCapture;
    if (kind === 'camera-only' && (!receipt?.chopperReviewTracker?.active
      || receipt.chopperReviewTracker.frame !== receipt.frame
      || receipt.chopperReviewTracker.captureRevision !== receipt.captureRevision
      || receipt.chopperReviewTracker.entityId !== receipt.reviewedChopper?.entityId
      || receipt.chopperReviewTracker.submissionSequence !== receipt.submissionSequence
      || !receipt?.reviewedChopper?.rootVisible
      || receipt.reviewedChopper.activeLodIndex !== 0
      || !(receipt.reviewedChopper.expiresInMs > 1_000)
      || !(receipt.reviewedChopper.drawableStableMeshCount > 0)
      || !receipt.reviewedChopper.drawableStableBounds)) return false;
    return receipt?.captureRevision === revision
      && receipt.frame === presentedGameplayFrame
      ? {
          frame: presentedGameplayFrame,
          captureRevision: receipt.captureRevision,
          receipt,
        }
      : false;
  }, { afterFrame: baselineFrame, revision: captureRevision, kind: receiptKind }, { timeout: 8_000, polling: 16 });
  const committed = await committedHandle.jsonValue() as {
    frame: number;
    captureRevision: number | null;
    receipt?: any;
  };
  const paused = await page.evaluate((kind) => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    api.setRenderPaused(true);
    const snapshot = api.snapshot() as any;
    const receipt = kind === 'camera-only'
      ? snapshot.deterministicReview.presentedCamera
      : snapshot.deterministicReview.presentedCapture;
    return {
      frame: (api.admissionState() as any).presentedGameplayFrame as number,
      debugRenderPaused: snapshot.deterministicReview.debugRenderPaused as boolean,
      captureRevision: receipt?.captureRevision ?? null,
      receipt,
      presentation: api.samplePresentationTelemetry() as any,
    };
  }, receiptKind);
  expect(paused.debugRenderPaused).toBe(true);
  expect(paused.frame).toBeGreaterThanOrEqual(committed.frame);
  if (captureRevision !== null) expect(paused.captureRevision).toBe(captureRevision);
  if (paused.receipt) {
    expect(paused.receipt.frame).toBe(paused.frame);
    expect(paused.receipt.submissionSequence).toBe(paused.presentation.submissionSequence);
  }
  const completion = await page.evaluate(async (kind) => (
    kind === 'camera-only'
      ? window.__ATOMIC_ACRES_DEBUG__.awaitCommittedCameraCompletion()
      : window.__ATOMIC_ACRES_DEBUG__.awaitRiggedEvidenceCaptureCompletion()
  ) as Promise<any>, receiptKind);
  expect(completion.submissionSequence).toBe(paused.presentation.submissionSequence);
  if (paused.receipt) expect(completion.submissionSequence).toBe(paused.receipt.submissionSequence);
  expect(completion.completedSequence).toBeGreaterThanOrEqual(completion.submissionSequence);
  if (paused.receipt) expect(completion.completedSequence).toBeGreaterThanOrEqual(paused.receipt.submissionSequence);
  for (let boundary = 0; boundary < 2; boundary += 1) {
    await page.evaluate(() => new Promise<void>((resolveBoundary) => requestAnimationFrame(() => resolveBoundary())));
  }
  const stable = await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = api.snapshot() as any;
    return {
      frame: (api.admissionState() as any).presentedGameplayFrame as number,
      debugRenderPaused: snapshot.deterministicReview.debugRenderPaused as boolean,
      presentation: api.samplePresentationTelemetry() as any,
    };
  });
  expect(stable.debugRenderPaused).toBe(true);
  expect(stable.frame).toBe(paused.frame);
  expect(stable.presentation.submissionSequence).toBe(paused.presentation.submissionSequence);
  expect(stable.presentation.completedSequence).toBeGreaterThanOrEqual(completion.completedSequence);
  return { committed, paused, completion, stable };
}

test('renders the complete possessed Chopper cockpit and cleans up on exit', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((storedLoadout) => {
    localStorage.setItem('atomic-acres:killstreak-loadout:v1', JSON.stringify(storedLoadout));
  }, loadout);
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&map=gun-range&renderer=${renderer}${requireWebGpu}&render=blender&grass=off&mist=off&rays=off&externalServices=off&seed=pass70-chopper`);
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 45_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  });
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    return snapshot.gameStarted
      && snapshot.matchPhase === 'active'
      && snapshot.supportVehiclePresentation?.state === 'ready'
      && snapshot.killstreakPresentation?.prewarmedAuthoredSupportFamilies?.includes('chopper');
  }, undefined, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setChopperExteriorReviewHold(true))).toBe(true);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.earnSupport(15));
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.activateKillstreak('chopper'))).toBe(true);
  await page.waitForFunction(() => (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreak.entities
    .some((entity: any) => entity.kind === 'chopper' && entity.phase === 'orbiting'), undefined, { timeout: 30_000 });
  const evidence = resolve(process.cwd(), `artifacts/pass70/chopper-gunner/${renderer}`);
  mkdirSync(evidence, { recursive: true });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(true);
    const hud = document.querySelector<HTMLElement>('#hud');
    if (hud) hud.style.visibility = 'hidden';
  });
  const roughExteriorPose = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const detail = snapshot.killstreakPresentation.entityDetails
      .find((entry: any) => entry.poolKey === 'chopper');
    const entity = snapshot.killstreak.entities.find((entry: any) => entry.id === detail?.entityId);
    if (!detail || !entity || !Number.isFinite(entity.attitude?.[1])) {
      throw new Error('Live authored Chopper disappeared before exterior evidence capture');
    }
    const [x, y, z] = detail.worldPosition;
    const visibleBounds = detail.stableAirframeBounds;
    if (!visibleBounds || !(detail.stableAirframeMeshCount > 0)) {
      throw new Error('Live authored Chopper has no stable airframe-only runtime bounds');
    }
    const target = [
      (visibleBounds.min[0] + visibleBounds.max[0]) / 2,
      (visibleBounds.min[1] + visibleBounds.max[1]) / 2,
      (visibleBounds.min[2] + visibleBounds.max[2]) / 2,
    ];
    const entityYaw = entity.attitude[1];
    const inTestBay = x >= 50;
    const bounds = inTestBay
      ? { minX: 52.8, maxX: 99.2, minZ: -25.2, maxZ: 37.2, maxCameraY: 22 }
      : { minX: -19.2, maxX: 19.2, minZ: -47.8, maxZ: 19, maxCameraY: 5.8 };
    const wallDistances = [
      { wall: 'min-x', distance: x - bounds.minX },
      { wall: 'max-x', distance: bounds.maxX - x },
      { wall: 'min-z', distance: z - bounds.minZ },
      { wall: 'max-z', distance: bounds.maxZ - z },
    ].sort((left, right) => left.distance - right.distance);
    const nearestWall = wallDistances[0].wall;
    const wallInsetM = 0.8;
    const visibleSpan = [
      visibleBounds.max[0] - visibleBounds.min[0],
      visibleBounds.max[1] - visibleBounds.min[1],
      visibleBounds.max[2] - visibleBounds.min[2],
    ];
    const cameraDistanceM = inTestBay ? 8.6 : 6.4;
    const sideCandidates = [-1, 1].map((side) => {
      // Authored support assets face local -Z. A 60-degree nose/side quarter
      // keeps the complete tail, rotor and tandem cockpit readable instead of
      // foreshortening the airframe into a head-on stack.
      const angle = entityYaw + Math.PI + (side * Math.PI / 3);
      const candidate = {
        side,
        x: Math.max(
          bounds.minX + wallInsetM,
          Math.min(bounds.maxX - wallInsetM, target[0] + (Math.sin(angle) * cameraDistanceM)),
        ),
        z: Math.max(
          bounds.minZ + wallInsetM,
          Math.min(bounds.maxZ - wallInsetM, target[2] + (Math.cos(angle) * cameraDistanceM)),
        ),
      };
      const clearance = Math.min(
        candidate.x - bounds.minX,
        bounds.maxX - candidate.x,
        candidate.z - bounds.minZ,
        bounds.maxZ - candidate.z,
      );
      return { ...candidate, clearance, distance: Math.hypot(candidate.x - target[0], candidate.z - target[2]) };
    });
    const candidate = sideCandidates.sort((left, right) =>
      (right.clearance + right.distance) - (left.clearance + left.distance))[0];
    const cameraY = Math.max(1.8, Math.min(bounds.maxCameraY, target[1] + (inTestBay ? 1 : 0.7)));
    const horizontalDistanceM = Math.hypot(candidate.x - target[0], candidate.z - target[2]);
    const cameraYaw = Math.atan2(candidate.x - target[0], candidate.z - target[2]);
    const cameraPitch = Math.atan2(target[1] - cameraY, horizontalDistanceM);
    window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(
      candidate.x,
      cameraY,
      candidate.z,
      cameraYaw,
      cameraPitch,
      50,
    );
    return {
      entityId: entity.id,
      worldPosition: [x, y, z],
      entityYaw,
      cameraPosition: [candidate.x, cameraY, candidate.z],
      cameraYaw,
      cameraPitch,
      cameraSide: candidate.side,
      cameraClearanceM: candidate.clearance,
      target,
      visibleBounds,
      stableAirframeMeshCount: detail.stableAirframeMeshCount,
      visibleSpan,
      inTestBay,
      nearestWall,
    };
  });
  await page.waitForFunction(() => {
    const detail = (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.entityDetails
      .find((entry: any) => entry.poolKey === 'chopper');
    return detail?.visible === true
      && detail.presentationSource === 'project-original-blender-glb'
      && detail.activeLodIndex === 0;
  }, undefined, { timeout: 5_000 });
  const exteriorPose = await page.evaluate((roughPose) => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
    const detail = snapshot.killstreakPresentation.entityDetails
      .find((entry: any) => entry.entityId === roughPose.entityId);
    const entity = snapshot.killstreak.entities.find((entry: any) => entry.id === roughPose.entityId);
    if (!detail?.drawableStableAirframeBounds || !(detail.drawableStableAirframeMeshCount > 0)
      || detail.activeLodIndex !== 0 || !Number.isFinite(entity?.attitude?.[1])) {
      throw new Error('Drawable authored Chopper LOD0 bounds were unavailable for the final runtime evidence pose');
    }
    const visibleBounds = detail.drawableStableAirframeBounds;
    const target = [
      (visibleBounds.min[0] + visibleBounds.max[0]) / 2,
      (visibleBounds.min[1] + visibleBounds.max[1]) / 2,
      (visibleBounds.min[2] + visibleBounds.max[2]) / 2,
    ];
    const visibleSpan = [
      visibleBounds.max[0] - visibleBounds.min[0],
      visibleBounds.max[1] - visibleBounds.min[1],
      visibleBounds.max[2] - visibleBounds.min[2],
    ];
    const inTestBay = detail.worldPosition[0] >= 50;
    const bounds = inTestBay
      ? { minX: 52.8, maxX: 99.2, minZ: -25.2, maxZ: 37.2, maxCameraY: 22 }
      : { minX: -19.2, maxX: 19.2, minZ: -47.8, maxZ: 19, maxCameraY: 5.8 };
    const fov = 50;
    const verticalTangent = Math.tan((fov * Math.PI / 180) / 2);
    const horizontalTangent = verticalTangent * (innerWidth / innerHeight);
    const horizontalSpan = Math.max(visibleSpan[0], visibleSpan[2]);
    const fitDistance = Math.max(
      visibleSpan[1] / (2 * verticalTangent * 0.55),
      horizontalSpan / (2 * horizontalTangent * 0.55),
      5.5,
    ) + 1.2;
    const cameraDistanceM = Math.min(18, fitDistance);
    const wallInsetM = 0.8;
    const sideCandidates = [-1, 1].map((side) => {
      const angle = entity.attitude[1] + Math.PI + (side * Math.PI / 3);
      const candidate = {
        side,
        x: Math.max(bounds.minX + wallInsetM, Math.min(
          bounds.maxX - wallInsetM,
          target[0] + (Math.sin(angle) * cameraDistanceM),
        )),
        z: Math.max(bounds.minZ + wallInsetM, Math.min(
          bounds.maxZ - wallInsetM,
          target[2] + (Math.cos(angle) * cameraDistanceM),
        )),
      };
      const clearance = Math.min(
        candidate.x - bounds.minX,
        bounds.maxX - candidate.x,
        candidate.z - bounds.minZ,
        bounds.maxZ - candidate.z,
      );
      return { ...candidate, clearance, distance: Math.hypot(candidate.x - target[0], candidate.z - target[2]) };
    });
    const candidate = sideCandidates.sort((left, right) =>
      (right.distance + right.clearance) - (left.distance + left.clearance))[0];
    const cameraY = Math.max(1.8, Math.min(bounds.maxCameraY, target[1] + Math.max(0.55, visibleSpan[1] * 0.06)));
    const horizontalDistanceM = Math.hypot(candidate.x - target[0], candidate.z - target[2]);
    const cameraYaw = Math.atan2(candidate.x - target[0], candidate.z - target[2]);
    const cameraPitch = Math.atan2(target[1] - cameraY, horizontalDistanceM);
    const captureRevision = window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(
      candidate.x, cameraY, candidate.z, cameraYaw, cameraPitch, fov,
    );
    if (captureRevision === null) throw new Error('Final authored Chopper evidence camera was not admitted');

    const forward = [target[0] - candidate.x, target[1] - cameraY, target[2] - candidate.z];
    const forwardLength = Math.hypot(...forward);
    for (let index = 0; index < 3; index += 1) forward[index] /= forwardLength;
    const right = [-forward[2], 0, forward[0]];
    const rightLength = Math.hypot(...right);
    for (let index = 0; index < 3; index += 1) right[index] /= rightLength;
    const up = [
      right[1] * forward[2] - right[2] * forward[1],
      right[2] * forward[0] - right[0] * forward[2],
      right[0] * forward[1] - right[1] * forward[0],
    ];
    const projected = [] as { x: number; y: number; depth: number }[];
    for (const cornerX of [visibleBounds.min[0], visibleBounds.max[0]]) {
      for (const cornerY of [visibleBounds.min[1], visibleBounds.max[1]]) {
        for (const cornerZ of [visibleBounds.min[2], visibleBounds.max[2]]) {
          const relative = [cornerX - candidate.x, cornerY - cameraY, cornerZ - candidate.z];
          const depth = relative[0] * forward[0] + relative[1] * forward[1] + relative[2] * forward[2];
          const cameraX = relative[0] * right[0] + relative[1] * right[1] + relative[2] * right[2];
          const cameraYProjected = relative[0] * up[0] + relative[1] * up[1] + relative[2] * up[2];
          projected.push({
            x: innerWidth * (0.5 + cameraX / Math.max(0.001, depth) / horizontalTangent / 2),
            y: innerHeight * (0.5 - cameraYProjected / Math.max(0.001, depth) / verticalTangent / 2),
            depth,
          });
        }
      }
    }
    const viewportBounds = {
      minX: Math.min(...projected.map((point) => point.x)),
      maxX: Math.max(...projected.map((point) => point.x)),
      minY: Math.min(...projected.map((point) => point.y)),
      maxY: Math.max(...projected.map((point) => point.y)),
    };
    return {
      entityId: entity.id,
      activeLodIndex: detail.activeLodIndex,
      worldPosition: detail.worldPosition,
      entityYaw: entity.attitude[1],
      cameraPosition: [candidate.x, cameraY, candidate.z],
      cameraYaw,
      cameraPitch,
      cameraSide: candidate.side,
      cameraClearanceM: candidate.clearance,
      cameraDistanceM: candidate.distance,
      target,
      visibleBounds,
      stableAirframeMeshCount: detail.stableAirframeMeshCount,
      drawableStableAirframeMeshCount: detail.drawableStableAirframeMeshCount,
      visibleSpan,
      viewportBounds,
      viewportCoverage: {
        width: (viewportBounds.maxX - viewportBounds.minX) / innerWidth,
        height: (viewportBounds.maxY - viewportBounds.minY) / innerHeight,
      },
      allBoundsInFront: projected.every((point) => point.depth > 0),
      viewport: [innerWidth, innerHeight],
      inTestBay,
      roughPose,
      captureRevision,
    };
  }, roughExteriorPose);
  expect(exteriorPose).toMatchObject({ activeLodIndex: 0, allBoundsInFront: true });
  expect(exteriorPose.stableAirframeMeshCount).toBeGreaterThan(0);
  expect(exteriorPose.drawableStableAirframeMeshCount).toBeGreaterThan(0);
  expect(exteriorPose.viewportCoverage.width).toBeGreaterThan(0.36);
  expect(exteriorPose.viewportCoverage.width).toBeLessThan(0.84);
  expect(exteriorPose.viewportCoverage.height).toBeGreaterThan(0.18);
  expect(exteriorPose.viewportCoverage.height).toBeLessThan(0.92);
  expect(exteriorPose.viewportBounds.minX).toBeGreaterThan(exteriorPose.viewport[0] * 0.03);
  expect(exteriorPose.viewportBounds.maxX).toBeLessThan(exteriorPose.viewport[0] * 0.97);
  expect(exteriorPose.viewportBounds.minY).toBeGreaterThan(exteriorPose.viewport[1] * 0.03);
  expect(exteriorPose.viewportBounds.maxY).toBeLessThan(exteriorPose.viewport[1] * 0.97);
  const trackerRevision = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.setChopperExteriorReviewTracking(true)
  ));
  expect(trackerRevision).toEqual(expect.any(Number));
  const exteriorCaptureCommit = await pauseCompletedPresentedFrame(page, trackerRevision, 'camera-only');
  expect(exteriorCaptureCommit.committed.receipt).toMatchObject({
    targetCount: 0,
    riggedActorTargetCount: 0,
    chopperAutonomousFireHeld: true,
    activeChopperTransientActions: [],
  });
  const exteriorReceipt = exteriorCaptureCommit.paused.receipt as {
    position: number[];
    quaternion: number[];
    yaw: number;
    pitch: number;
    fov: number;
    near: number;
    far: number;
    submissionSequence: number;
    frame: number;
    captureRevision: number;
    chopperReviewTracker: {
      active: true;
      entityId: string;
      frame: number;
      captureRevision: number;
      side: -1 | 1;
      position: number[];
      target: number[];
      yaw: number;
      pitch: number;
      fov: number;
      distanceM: number;
      clearanceM: number;
      inTestBay: boolean;
      cameraColliderClear: boolean;
      cameraClearanceRadiusM: number;
      lineOfSightSampleCount: number;
      clearLineOfSightSampleCount: number;
      submittedSceneDrawableMeshCount: number;
      submittedSceneDrawableBounds: { min: number[]; max: number[] };
      submissionSequence: number;
      completedSequence: number;
    };
    reviewedChopper: {
      entityId: string;
      expiresInMs: number;
      rootVisible: boolean;
      activeLodIndex: number;
      drawableStableMeshCount: number;
      drawableStableBounds: { min: number[]; max: number[] };
      drawRejections: { hierarchy: number; layer: number; material: number; frustum: number };
    };
  };
  const tracker = exteriorReceipt.chopperReviewTracker;
  expect(tracker).toMatchObject({
    active: true,
    entityId: exteriorPose.entityId,
    frame: exteriorReceipt.frame,
    captureRevision: trackerRevision,
    submissionSequence: exteriorReceipt.submissionSequence,
  });
  expect(tracker.submittedSceneDrawableMeshCount).toBeGreaterThan(0);
  expect(tracker.submittedSceneDrawableBounds).not.toBeNull();
  expect(tracker.cameraColliderClear).toBe(true);
  expect(tracker.cameraClearanceRadiusM).toBe(0.4);
  expect(tracker.lineOfSightSampleCount).toBe(9);
  expect(tracker.clearLineOfSightSampleCount).toBe(tracker.lineOfSightSampleCount);
  expect(exteriorReceipt.reviewedChopper).toMatchObject({
    entityId: tracker.entityId,
    rootVisible: true,
    activeLodIndex: 0,
  });
  expect(exteriorReceipt.reviewedChopper.drawableStableMeshCount).toBeGreaterThan(0);
  expect(exteriorReceipt.reviewedChopper.expiresInMs).toBeGreaterThan(1_000);
  expect(exteriorReceipt.reviewedChopper.drawableStableBounds).not.toBeNull();
  expect(exteriorReceipt.reviewedChopper.drawRejections).toEqual({
    hierarchy: 0, layer: 0, material: 0, frustum: 0,
  });
  expect(exteriorReceipt.reviewedChopper.drawableStableMeshCount)
    .toBe(tracker.submittedSceneDrawableMeshCount);
  for (const edge of ['min', 'max'] as const) {
    for (let axis = 0; axis < 3; axis += 1) {
      expect(exteriorReceipt.reviewedChopper.drawableStableBounds[edge][axis])
        .toBeCloseTo(tracker.submittedSceneDrawableBounds[edge][axis], 8);
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    expect(exteriorReceipt.position[axis]).toBeCloseTo(tracker.position[axis], 8);
  }
  expect(exteriorReceipt.yaw).toBeCloseTo(tracker.yaw, 8);
  expect(exteriorReceipt.pitch).toBeCloseTo(tracker.pitch, 8);
  expect(exteriorReceipt.fov).toBeCloseTo(tracker.fov, 8);
  expect(exteriorReceipt.near).toBeCloseTo(0.08, 8);
  expect(exteriorReceipt.far).toBeCloseTo(180, 8);
  expect(exteriorReceipt.submissionSequence).toBe(exteriorCaptureCommit.paused.presentation.submissionSequence);
  expect(exteriorCaptureCommit.completion.completedSequence)
    .toBeGreaterThanOrEqual(exteriorReceipt.submissionSequence);
  expect(exteriorCaptureCommit.completion.completedSequence)
    .toBeGreaterThanOrEqual(tracker.submissionSequence);
  const requestedDirection = tracker.target.map((coordinate: number, axis: number) => (
    coordinate - tracker.position[axis]
  ));
  const requestedDirectionLength = Math.hypot(...requestedDirection);
  const receiptDirection = [
    -Math.sin(exteriorReceipt.yaw) * Math.cos(exteriorReceipt.pitch),
    Math.sin(exteriorReceipt.pitch),
    -Math.cos(exteriorReceipt.yaw) * Math.cos(exteriorReceipt.pitch),
  ];
  const targetDirectionDot = requestedDirection.reduce((sum: number, coordinate: number, axis: number) => (
    sum + (coordinate / requestedDirectionLength) * receiptDirection[axis]
  ), 0);
  expect(targetDirectionDot).toBeGreaterThan(0.99999999);
  const halfPitch = tracker.pitch / 2;
  const halfYaw = tracker.yaw / 2;
  const expectedQuaternion = [
    Math.sin(halfPitch) * Math.cos(halfYaw),
    Math.cos(halfPitch) * Math.sin(halfYaw),
    -Math.sin(halfPitch) * Math.sin(halfYaw),
    Math.cos(halfPitch) * Math.cos(halfYaw),
  ];
  const quaternionDot = Math.abs(expectedQuaternion.reduce((sum, coordinate, axis) => (
    sum + coordinate * exteriorReceipt.quaternion[axis]
  ), 0));
  expect(quaternionDot).toBeGreaterThan(0.99999999);
  const receiptProjection = projectWorldBounds(
    tracker.submittedSceneDrawableBounds,
    exteriorReceipt,
    exteriorPose.viewport,
  );
  expect(receiptProjection.allBoundsInFront).toBe(true);
  expect(receiptProjection.viewportCoverage.width).toBeGreaterThan(0.32);
  expect(receiptProjection.viewportCoverage.width).toBeLessThan(0.88);
  expect(receiptProjection.viewportCoverage.height).toBeGreaterThan(0.16);
  expect(receiptProjection.viewportCoverage.height).toBeLessThan(0.94);
  expect(receiptProjection.viewportBounds.minX).toBeGreaterThan(exteriorPose.viewport[0] * 0.03);
  expect(receiptProjection.viewportBounds.maxX).toBeLessThan(exteriorPose.viewport[0] * 0.97);
  expect(receiptProjection.viewportBounds.minY).toBeGreaterThan(exteriorPose.viewport[1] * 0.03);
  expect(receiptProjection.viewportBounds.maxY).toBeLessThan(exteriorPose.viewport[1] * 0.97);
  const exteriorEvidence = {
    renderer,
    viewport: exteriorPose.viewport,
    pretrackLod0Rehearsal: exteriorPose,
    tracker,
    presentedCamera: {
      frame: exteriorReceipt.frame,
      captureRevision: exteriorReceipt.captureRevision,
      position: exteriorReceipt.position,
      quaternion: exteriorReceipt.quaternion,
      yaw: exteriorReceipt.yaw,
      pitch: exteriorReceipt.pitch,
      fov: exteriorReceipt.fov,
      near: exteriorReceipt.near,
      far: exteriorReceipt.far,
      submissionSequence: exteriorReceipt.submissionSequence,
    },
    receiptTargetBinding: { requestedTarget: tracker.target, targetDirectionDot, quaternionDot },
    receiptProjection,
    captureCommit: exteriorCaptureCommit,
  };
  await testInfo.attach(`pass70-chopper-${renderer}-exterior-pose`, {
    body: Buffer.from(`${JSON.stringify(exteriorEvidence, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
  writeFileSync(resolve(evidence, 'exterior-pose.json'), `${JSON.stringify(exteriorEvidence, null, 2)}\n`, 'utf8');
  try {
    const exteriorPng = await page.screenshot({ animations: 'allow' });
    writeFileSync(resolve(evidence, 'exterior-front-quarter.png'), exteriorPng);
    const hiddenControl = await page.evaluate(async () => (
      window.__ATOMIC_ACRES_DEBUG__.captureChopperExteriorHiddenControl()
    )) as any;
    const hiddenControlPng = await page.screenshot({ animations: 'allow' });
    const hiddenControlPath = resolve(evidence, 'exterior-hidden-control.nonpublishable.png');
    writeFileSync(hiddenControlPath, hiddenControlPng);
    const pixelBounds = receiptProjection.viewportBounds;
    const left = Math.max(0, Math.floor(pixelBounds.minX));
    const top = Math.max(0, Math.floor(pixelBounds.minY));
    const width = Math.min(exteriorPose.viewport[0] - left, Math.max(1, Math.ceil(pixelBounds.maxX) - left));
    const height = Math.min(exteriorPose.viewport[1] - top, Math.max(1, Math.ceil(pixelBounds.maxY) - top));
    const { data, info } = await sharp(exteriorPng)
      .extract({ left, top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let pixelsAboveEight = 0;
    let pixelsAboveTwentyFour = 0;
    let maximumLuminance = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const luminance = data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722;
      if (luminance > 8) pixelsAboveEight += 1;
      if (luminance > 24) pixelsAboveTwentyFour += 1;
      maximumLuminance = Math.max(maximumLuminance, luminance);
    }
    const pixelCount = width * height;
    const rasterVisibility = {
      crop: { left, top, width, height },
      pixelCount,
      pixelsAboveEight,
      pixelsAboveTwentyFour,
      visiblePixelRatio: pixelsAboveEight / pixelCount,
      highContrastPixelRatio: pixelsAboveTwentyFour / pixelCount,
      maximumLuminance,
    };
    expect(rasterVisibility.visiblePixelRatio).toBeGreaterThan(0.01);
    expect(rasterVisibility.highContrastPixelRatio).toBeGreaterThan(0.0025);
    expect(rasterVisibility.maximumLuminance).toBeGreaterThan(32);
    expect(hiddenControl).toMatchObject({
      contract: 'chopper-exterior-hidden-control-v1',
      nonPublishable: true,
      renderer,
      entityId: tracker.entityId,
      simulationFrame: exteriorReceipt.frame,
      officialCaptureRevision: exteriorReceipt.captureRevision,
      rootHiddenDuringSubmission: true,
      rootRestored: true,
      position: exteriorReceipt.position,
      quaternion: exteriorReceipt.quaternion,
      yaw: exteriorReceipt.yaw,
      pitch: exteriorReceipt.pitch,
      fov: exteriorReceipt.fov,
      near: exteriorReceipt.near,
      far: exteriorReceipt.far,
      submittedSceneDrawableMeshCount: tracker.submittedSceneDrawableMeshCount,
      submittedSceneDrawableBounds: tracker.submittedSceneDrawableBounds,
    });
    expect(hiddenControl.controlCaptureRevision).toBeGreaterThan(hiddenControl.officialCaptureRevision);
    if (renderer === 'webgpu') {
      expect(hiddenControl.submissionSequence).toBeGreaterThan(hiddenControl.officialSubmissionSequence);
      expect(hiddenControl.completedSequence).toBeGreaterThanOrEqual(hiddenControl.submissionSequence);
    }
    const restored = await page.evaluate((entityId) => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot() as any;
      const detail = snapshot.killstreakPresentation.entityDetails
        .find((entry: any) => entry.entityId === entityId);
      return {
        visible: detail?.visible,
        tracking: snapshot.deterministicReview.chopperExteriorReviewTracking,
        captureRevision: snapshot.deterministicReview.captureCameraRevision,
        frame: (window.__ATOMIC_ACRES_DEBUG__.admissionState() as any).presentedGameplayFrame,
      };
    }, tracker.entityId);
    expect(restored).toEqual({
      visible: true,
      tracking: true,
      captureRevision: hiddenControl.controlCaptureRevision,
      frame: exteriorReceipt.frame,
    });
    const { data: controlData, info: controlInfo } = await sharp(hiddenControlPng)
      .extract({ left, top, width, height })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(controlInfo).toMatchObject({ width: info.width, height: info.height, channels: info.channels });
    let changedPixelsAboveEight = 0;
    let changedPixelsAboveTwentyFour = 0;
    let maximumPerceptualDifference = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const difference = Math.abs(data[offset]! - controlData[offset]!) * 0.2126
        + Math.abs(data[offset + 1]! - controlData[offset + 1]!) * 0.7152
        + Math.abs(data[offset + 2]! - controlData[offset + 2]!) * 0.0722;
      if (difference > 8) changedPixelsAboveEight += 1;
      if (difference > 24) changedPixelsAboveTwentyFour += 1;
      maximumPerceptualDifference = Math.max(maximumPerceptualDifference, difference);
    }
    const attributableRasterDifference = {
      contract: 'visible-airframe-vs-hidden-control-raster-difference-v1',
      officialEvidence: 'exterior-front-quarter.png',
      hiddenControl: 'exterior-hidden-control.nonpublishable.png',
      hiddenControlReceipt: hiddenControl,
      crop: { left, top, width, height },
      pixelCount,
      changedPixelsAboveEight,
      changedPixelsAboveTwentyFour,
      materiallyChangedPixelRatio: changedPixelsAboveEight / pixelCount,
      highContrastChangedPixelRatio: changedPixelsAboveTwentyFour / pixelCount,
      maximumPerceptualDifference,
    };
    expect(attributableRasterDifference.materiallyChangedPixelRatio).toBeGreaterThan(0.01);
    expect(attributableRasterDifference.highContrastChangedPixelRatio).toBeGreaterThan(0.0025);
    expect(attributableRasterDifference.maximumPerceptualDifference).toBeGreaterThan(32);
    await testInfo.attach(`pass70-chopper-${renderer}-exterior-raster-proof`, {
      body: Buffer.from(`${JSON.stringify({ rasterVisibility, attributableRasterDifference }, null, 2)}\n`, 'utf8'),
      contentType: 'application/json',
    });
    await testInfo.attach(`pass70-chopper-${renderer}-exterior-hidden-control-nonpublishable`, {
      path: hiddenControlPath,
      contentType: 'image/png',
    });
    writeFileSync(resolve(evidence, 'exterior-pose.json'), `${JSON.stringify({
      ...exteriorEvidence,
      rasterVisibility,
      attributableRasterDifference,
    }, null, 2)}\n`, 'utf8');
  } finally {
    await page.evaluate(() => {
      window.__ATOMIC_ACRES_DEBUG__.setChopperExteriorReviewTracking(false);
      window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraPose(null);
      window.__ATOMIC_ACRES_DEBUG__.setCaptureViewmodelHidden(false);
      window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false);
      const hud = document.querySelector<HTMLElement>('#hud');
      if (hud) hud.style.visibility = '';
    });
  }
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setChopperExteriorReviewHold(false))).toBe(true);
  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRiggedEvidenceCaptureTargets([
    { kind: 'training-dummy', id: 'test-dummy-alpha' },
  ]))).toBe(true);
  const possessionEntryBaseline = await captureFrameActionBaseline(page, 'chopper-first-possession-preaction-baseline');
  const possessionEntryBudget = deriveFrameActionBudget(possessionEntryBaseline);
  const possessionEntry = await captureFirstChopperPossessionEntry(page);
  assertBoundedChopperPossessionEntry(possessionEntry, possessionEntryBudget);
  await testInfo.attach(`pass70-chopper-${renderer}-first-possession-frame-budget`, {
    body: Buffer.from(`${JSON.stringify({
      distinction: 'input-handler-through-next-presented-and-completed-frame; excludes intentional cockpit dwell time',
      baseline: possessionEntryBaseline,
      budget: possessionEntryBudget,
      receipt: possessionEntry,
    }, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
  await page.waitForFunction(() => Boolean(
    (window.__ATOMIC_ACRES_DEBUG__.snapshot() as any).killstreakPresentation.firstPersonSightline?.alignment,
  ));

  const presentation = await page.evaluate(() => (
    window.__ATOMIC_ACRES_DEBUG__.snapshot() as any
  ).killstreakPresentation.firstPersonSightline);
  expect(presentation).toMatchObject({
    presentationSource: 'project-original-blender-glb',
    visibleOutsideCockpit: [],
    dashboardVisible: true,
    displaysVisible: true,
    hudVisible: false,
    centreSightlineClear: true,
    weaponVisible: true,
    overlayLayerExclusive: true,
    alignment: { pivotErrorM: expect.any(Number) },
  });
  expect(presentation.alignment.pivotErrorM).toBeLessThan(0.001);
  await expect(page.locator('html')).toHaveAttribute('data-killstreak-possession', 'chopper-gunner');
  await expect(page.locator('#gunner-cockpit-hud')).toBeVisible();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'chopper-gunner');
  await expect(page.locator('#gunner-altitude')).not.toHaveText(/NaN/u);
  const desktopHud = await page.evaluate(() => {
    const suppressedSelectors = [
      '.hud-mission-console', '.hud-map-console', '.hud-operator-console', '.hud-weapon-console',
      '#support-block', '#support-combat-feedback', '#crosshair',
    ];
    const suppressed = suppressedSelectors.map((selector) => ({
      selector,
      display: getComputedStyle(document.querySelector<HTMLElement>(selector)!).display,
    }));
    const centre = { x: innerWidth / 2, y: innerHeight / 2 };
    const centreOccluders = document.elementsFromPoint(centre.x, centre.y)
      .filter((entry) => entry instanceof HTMLElement && entry.id !== 'game')
      .map((entry) => entry instanceof HTMLElement ? entry.id || entry.className : entry.tagName);
    return { suppressed, centreOccluders };
  });
  expect(desktopHud.suppressed.every((entry) => entry.display === 'none')).toBe(true);
  expect(desktopHud.centreOccluders).not.toContain('support-combat-feedback');
  await page.waitForTimeout(4_200);

  await page.setViewportSize({ width: 1_280, height: 720 });
  const desktopCaptureCommit = await pauseCompletedPresentedFrame(page);
  try {
    await page.screenshot({ path: resolve(evidence, 'possessed-desktop.png'), animations: 'disabled' });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  }
  await testInfo.attach(`pass70-chopper-${renderer}-desktop`, {
    path: resolve(evidence, 'possessed-desktop.png'), contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const centre = { x: innerWidth / 2, y: innerHeight / 2 };
    const reticle = document.querySelector<HTMLElement>('.gunner-reticle')!;
    const centreClear = [...reticle.children].every((child) => {
      const bounds = (child as HTMLElement).getBoundingClientRect();
      return !(centre.x >= bounds.left && centre.x <= bounds.right
        && centre.y >= bounds.top && centre.y <= bounds.bottom);
    });
    const readouts = [...document.querySelectorAll<HTMLElement>('.gunner-readout')].map((readout) => {
      const bounds = readout.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.top >= -1
        && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
    });
    const suppressed = [
      '.hud-mission-console', '.hud-map-console', '.hud-operator-console', '.hud-weapon-console',
      '#support-block', '#support-combat-feedback', '#crosshair',
    ].map((selector) => getComputedStyle(document.querySelector<HTMLElement>(selector)!).display);
    const statusBounds = document.querySelector<HTMLElement>('.gunner-status')!.getBoundingClientRect();
    const thermalBounds = document.querySelector<HTMLElement>('#chopper-thermal')!.getBoundingClientRect();
    const statusThermalOverlap = statusBounds.left < thermalBounds.right
      && statusBounds.right > thermalBounds.left
      && statusBounds.top < thermalBounds.bottom
      && statusBounds.bottom > thermalBounds.top;
    return { centreClear, readouts, suppressed, statusThermalOverlap };
  });
  expect(mobile).toEqual({
    centreClear: true,
    readouts: [true, true, true, true, true, true],
    suppressed: ['none', 'none', 'none', 'none', 'none', 'none', 'none'],
    statusThermalOverlap: false,
  });
  const mobileCaptureCommit = await pauseCompletedPresentedFrame(page);
  try {
    await page.screenshot({ path: resolve(evidence, 'possessed-mobile.png'), animations: 'disabled' });
  } finally {
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(false));
  }
  await testInfo.attach(`pass70-chopper-${renderer}-capture-commits`, {
    body: Buffer.from(`${JSON.stringify({ desktop: desktopCaptureCommit, mobile: mobileCaptureCommit }, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await expect(page.locator('#gunner-cockpit-hud')).toBeHidden();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'none');
  await expect(page.locator('#gunner-target-confirm')).toBeHidden();
  await expect(page.locator('#chopper-thermal')).toBeHidden();

  expect(await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.toggleChopperGunnerControl())).toBe(true);
  await expect(page.locator('#gunner-cockpit-hud')).toBeVisible();
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.damage(1_000));
  await expect(page.locator('#gunner-cockpit-hud')).toBeHidden();
  await expect(page.locator('#gunner-cockpit-hud')).toHaveAttribute('data-support-kind', 'none');
  await expect(page.locator('#gunner-target-confirm')).toBeHidden();
  await expect(page.locator('#chopper-thermal')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-killstreak-possession', 'none');
  expect(errors).toEqual([]);
});
