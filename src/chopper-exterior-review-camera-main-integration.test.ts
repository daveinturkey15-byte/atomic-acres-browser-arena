import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(start: string, end: string): string {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  expect(startAt, `missing ${start}`).toBeGreaterThanOrEqual(0);
  expect(endAt, `missing ${end}`).toBeGreaterThan(startAt);
  return source.slice(startAt, endAt);
}

describe('Chopper exterior same-frame review camera integration', () => {
  it('samples current submitted-scene bounds after entity sync and before the exact render', () => {
    const frame = block(
      'function frame(now: number, scheduleNext = true): void {',
      '\nfunction activePostTelemetry(',
    );
    const entityUpdate = frame.indexOf('updatePass65KillstreakRuntime(now);');
    const trackerUpdate = frame.indexOf('updateDebugChopperExteriorReviewTracker();');
    const cameraApply = frame.indexOf('if (debugCaptureCameraActive) {');
    const render = frame.indexOf('frameSubmitted = submitWebGpuFrame(now, false, submissionMode);');
    expect(entityUpdate).toBeGreaterThanOrEqual(0);
    expect(entityUpdate).toBeLessThan(trackerUpdate);
    expect(trackerUpdate).toBeLessThan(cameraApply);
    expect(cameraApply).toBeLessThan(render);

    const tracker = block(
      'function updateDebugChopperExteriorReviewTracker(): void {',
      '\nfunction clearDebugRiggedEvidenceCaptureTargets(',
    );
    expect(tracker).toContain('killstreakPresentation.telemetry().entityDetails');
    expect(tracker).toContain('drawableStableAirframeBounds');
    expect(tracker).toContain('frame: frameCount');
    expect(tracker).toContain('captureRevision: debugCaptureCameraRevision');
  });

  it('cannot mutate gameplay/network authority and never chooses a pose from raster feedback', () => {
    const tracker = block(
      'function updateDebugChopperExteriorReviewTracker(): void {',
      '\nfunction clearDebugRiggedEvidenceCaptureTargets(',
    );
    for (const forbidden of [
      'network.',
      'killstreakRuntime.',
      'refreshLocalKillstreakSnapshot',
      'broadcastKillstreakState',
      'requestKillstreakControl',
      'pixel',
      'coverage',
      'readRenderTarget',
    ]) expect(tracker).not.toContain(forbidden);
    expect(tracker).toContain('chopperExteriorReviewCameraPose({');
    expect(tracker).toContain('preferredSide: debugChopperExteriorReviewTrackerSide');
    expect(tracker).toContain('assessDebugChopperExteriorReviewWorldCandidate(bounds, candidate)');
    expect(source).toContain('activeWorldColliders()');
    expect(source).toContain('sphereIntersectsBox(cameraPoint, cameraClearanceRadiusM, box)');
    expect(source).toContain('segmentIntersectsBox(cameraPoint, { x, y, z }, box)');
    expect(tracker).toContain('debugChopperExteriorReviewTrackerSide = pose.side;');
  });

  it('binds active tracker identity, same frame, pose, bounds and submission into the receipt', () => {
    const receipt = block(
      'function debugCommittedCameraPresentationReceipt(frame: number): DebugCommittedCameraPresentationReceipt {',
      '\nfunction debugCapturePresentationReceipt(',
    );
    expect(receipt).toContain('lastDebugChopperExteriorReviewTrackerFrame?.frame === frame');
    expect(receipt).toContain('captureRevision === debugCaptureCameraRevision');
    expect(receipt).toContain('submissionSequence: presentation.submissionSequence');
    expect(receipt).toContain('completedSequence: presentation.completedSequence');
    expect(receipt).toContain('chopperReviewTracker: reviewTracker');
    expect(source).toContain('cameraColliderClear: pose.world.cameraColliderClear');
    expect(source).toContain('clearLineOfSightSampleCount: pose.world.clearLineOfSightSampleCount');
  });

  it('resets tracker ownership on hold/lifecycle and capture-mode exits', () => {
    const holdReset = block(
      'function resetDebugChopperExteriorReviewHold(): void {',
      '\nfunction resetDebugChopperExteriorReviewTracker(',
    );
    expect(holdReset).toContain('resetDebugChopperExteriorReviewTracker();');
    const trackerReset = block(
      'function resetDebugChopperExteriorReviewTracker(): void {',
      '\nfunction synchronizeDebugChopperExteriorReviewHold(',
    );
    expect(trackerReset).toContain('debugChopperExteriorReviewTrackerRequested = false;');
    expect(trackerReset).toContain('debugCaptureCameraActive = false;');
    expect(trackerReset).toContain('lastDebugCommittedCameraPresentation = null;');
    const cameraSetter = block('setCaptureCameraPose: (x,', '\n  setCaptureCameraFarPlane:');
    expect(cameraSetter).toContain('resetDebugChopperExteriorReviewTracker();');
    expect(source).toContain('synchronizeDebugChopperExteriorReviewHold();');
  });

  it('renders a distinct paired hidden-root control only after the official frame is frozen', () => {
    const frame = block(
      'function frame(now: number, scheduleNext = true): void {',
      '\nfunction activePostTelemetry(',
    );
    const frozen = frame.indexOf('debugRenderPaused\n    && debugChopperExteriorReviewTrackerRequested');
    expect(frozen).toBeGreaterThanOrEqual(0);
    expect(frozen).toBeLessThan(frame.indexOf('frameCount += 1;'));
    expect(frozen).toBeLessThan(frame.indexOf('updatePass65KillstreakRuntime(now);'));
    expect(frame.slice(frozen, frame.indexOf('if (scheduleNext && !presentationFrameDue', frozen)))
      .toContain('return;');
    const control = block(
      'async function captureDebugChopperExteriorHiddenControl()',
      '\nfunction debugCapturePresentationReceipt(',
    );
    expect(control).toContain('if (!debugRenderPaused');
    expect(control).toContain('official.frame !== lastGameplayPresentedFrame');
    expect(control).toContain('official.captureRevision !== debugCaptureCameraRevision');
    expect(control).toContain('killstreakPresentation.entityRoot(tracker.entityId)');
    expect(control).toContain('boundsMatchOfficial');
    expect(control).toContain('tracker.submittedSceneDrawableBounds.min[axis]');
    expect(control).toContain('withExactChopperRootHiddenForControl(root, async () => {');
    expect(control).toContain("await submitForegroundWebGpuFrame(true, 'serialized');");
    expect(control).toContain('await flushWebGpuFrames(8_000);');
    expect(control).toContain('debugCaptureCameraRevision += 1;');
    expect(control).toContain('rootHiddenDuringSubmission: true');
    expect(control).toContain('rootRestored: true');
    for (const forbidden of ['network.', 'killstreakRuntime.', '.material', 'overrideMaterial']) {
      expect(control).not.toContain(forbidden);
    }
  });

  it('keeps the official PNG first and labels the paired control non-publishable', () => {
    const e2e = readFileSync(new URL('../tests/e2e/pass70-chopper-gunner.spec.ts', import.meta.url), 'utf8');
    const official = e2e.indexOf("writeFileSync(resolve(evidence, 'exterior-front-quarter.png'), exteriorPng);");
    const control = e2e.indexOf('captureChopperExteriorHiddenControl()');
    const hiddenPng = e2e.indexOf("'exterior-hidden-control.nonpublishable.png'");
    const firstRasterAnalysis = e2e.indexOf('const pixelBounds = receiptProjection.viewportBounds;');
    expect(official).toBeGreaterThanOrEqual(0);
    expect(official).toBeLessThan(control);
    expect(control).toBeLessThan(hiddenPng);
    expect(hiddenPng).toBeLessThan(firstRasterAnalysis);
    expect(e2e).toContain("contract: 'visible-airframe-vs-hidden-control-raster-difference-v1'");
    expect(e2e).toContain('materiallyChangedPixelRatio');
    expect(e2e).toContain('highContrastChangedPixelRatio');
    expect(e2e).toContain('maximumPerceptualDifference');
  });
});
