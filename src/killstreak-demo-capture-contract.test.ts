import { describe, expect, it } from 'vitest';
import {
  KILLSTREAK_DEMO_CAPTURE_IDS,
  KILLSTREAK_DEMO_CAPTURE_ROUTE,
  KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS,
  KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
  KILLSTREAK_DEMO_CLIP_DURATION_MS,
  KILLSTREAK_DEMO_EXPECTED_PROOF,
  KILLSTREAK_DEMO_VISUAL_REQUIREMENTS,
  killstreakDemoPosterPath,
  killstreakDemoVideoPath,
  projectKillstreakDemoWorldPoint,
  resolveKillstreakDemoCameraPose,
  summarizeKillstreakDemoRuntimeCadence,
  validateKillstreakDemoCaptureReceipt,
  type KillstreakDemoCaptureReceipt,
} from './killstreak-demo-capture-contract';
import { PASS65_KILLSTREAK_CATALOG } from './killstreak-catalog';

function validRuntimeCadence(durationMs: number, baseFrame: number, fps = 30) {
  const frameCount = Math.floor(durationMs / (1_000 / fps));
  const samples = Array.from({ length: frameCount + 1 }, (_, index) => ({
    elapsedMs: Number((index * durationMs / frameCount).toFixed(3)),
    presentedFrame: baseFrame + index,
  }));
  const summary = summarizeKillstreakDemoRuntimeCadence({
    durationMs,
    presentedFrameStart: baseFrame,
    presentedFrameEnd: baseFrame + frameCount,
    samples,
  });
  return {
    durationMs,
    frameCountStart: baseFrame,
    frameCountEnd: baseFrame + frameCount,
    presentedFrameStart: baseFrame,
    presentedFrameEnd: baseFrame + frameCount,
    ...summary,
    samples,
  };
}

function validVisualEvidence(id: typeof KILLSTREAK_DEMO_CAPTURE_IDS[number], index: number) {
  const requirement = KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id];
  const positions = Array.from({ length: requirement.minimumSubjectCount }, (_, ordinal) => (
    [70 + ordinal * 0.35, 2 + ordinal % 2 * 0.15, index + ordinal * 0.25] as const
  ));
  const cameraPoints = positions.length > 0 ? positions : [[70, 1.2, index], [74, 1.2, index + 4]] as const;
  const cameraPose = resolveKillstreakDemoCameraPose(id, cameraPoints);
  const subjects = positions.map((worldPosition, ordinal) => ({
    id: `${id}-subject-${ordinal}`,
    worldPosition,
    ...projectKillstreakDemoWorldPoint(cameraPose, worldPosition),
  }));
  return {
    cameraPose,
    visualProof: {
      kind: requirement.kind,
      sampledAtPresentedFrame: 100 + index,
      subjectCount: subjects.length,
      inFrameCount: subjects.length,
      subjects,
      hudRegion: requirement.hudSelector === null ? null : {
        selector: requirement.hudSelector,
        left: 24,
        top: 92,
        width: 150,
        height: 150,
        visible: true as const,
      },
      milestones: requirement.requiredMilestones,
    },
  };
}

function validReceipt(): KillstreakDemoCaptureReceipt {
  return {
    schemaVersion: 5,
    captureKind: 'real-gun-range-test-bay-runtime',
    capturedAt: '2026-08-02T00:00:00.000Z',
    gitHead: '1'.repeat(40),
    servedSourceSha: '1'.repeat(40),
    servedRuntimeTreeSha256: '2'.repeat(64),
    servedRuntimeFileCount: 42,
    browserName: 'Google Chrome',
    browserVersion: '150.0.7871.187',
    encoderName: 'ffmpeg/libx264',
    encoderVersion: 'ffmpeg version 8.1.1-full_build',
    renderer: 'webgl2',
    route: KILLSTREAK_DEMO_CAPTURE_ROUTE,
    seed: 'pass66-killstreak-demo',
    viewport: KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
    sourceClosureSha256: '3'.repeat(64),
    sourceInputs: [...KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS, 'public/example.bin', 'shared/example.ts', 'src/example.ts']
      .sort()
      .map((path, index) => ({ path, sha256: index.toString(16).padStart(64, '0') })),
    captures: KILLSTREAK_DEMO_CAPTURE_IDS.map((id, index) => ({
      id,
      artifactPath: `artifacts/pass66/killstreak-demo-capture/staged/${id}.jpg`,
      sha256: (index + 20).toString(16).padStart(64, '0'),
      sizeBytes: 40_000 + index,
      width: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width,
      height: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height,
      videoArtifactPath: `artifacts/pass66/killstreak-demo-capture/staged/${id}.mp4`,
      videoSha256: (index + 40).toString(16).padStart(64, '0'),
      videoSizeBytes: 250_000 + index,
      videoWidth: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width,
      videoHeight: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height,
      videoDurationMs: KILLSTREAK_DEMO_CLIP_DURATION_MS[id],
      videoFrameCount: Math.ceil(KILLSTREAK_DEMO_CLIP_DURATION_MS[id] / 1_000 * 30),
      videoSampleFrameSha256: [
        (index + 100).toString(16).padStart(64, '0'),
        (index + 120).toString(16).padStart(64, '0'),
        (index + 140).toString(16).padStart(64, '0'),
      ],
      videoMotionFrameCount: Math.ceil(KILLSTREAK_DEMO_CLIP_DURATION_MS[id] / 1_000 * 30) - 1
        - Math.floor((Math.ceil(KILLSTREAK_DEMO_CLIP_DURATION_MS[id] / 1_000 * 30) - 1) * 0.1),
      videoNearDuplicateFrameCount: Math.floor((Math.ceil(KILLSTREAK_DEMO_CLIP_DURATION_MS[id] / 1_000 * 30) - 1) * 0.1),
      videoNearDuplicateFrameRatio: Number((Math.floor((Math.ceil(KILLSTREAK_DEMO_CLIP_DURATION_MS[id] / 1_000 * 30) - 1) * 0.1)
        / (Math.ceil(KILLSTREAK_DEMO_CLIP_DURATION_MS[id] / 1_000 * 30) - 1)).toFixed(6)),
      videoLongestNearDuplicateRun: 2,
      videoCodec: 'h264' as const,
      videoProfile: 'High' as const,
      videoContainer: 'mp4' as const,
      videoPixelFormat: 'yuv420p' as const,
      videoFastStart: true as const,
      videoHasAudio: false as const,
      videoActivationOffsetMs: 750,
      videoVisualProofOffsetMs: 1_250,
      recordingContextId: `${(index + 1).toString(16).padStart(8, '0')}-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
      rawRecordingSha256: (index + 60).toString(16).padStart(64, '0'),
      fCandidateTargetId: `test-bay-support:${id}`,
      fCommitTargetId: `test-bay-support:${id}`,
      revisionBefore: index * 4,
      revisionAfter: index * 4 + 2,
      proof: {
        kind: KILLSTREAK_DEMO_EXPECTED_PROOF[id].kind,
        count: KILLSTREAK_DEMO_EXPECTED_PROOF[id].minimumCount,
        activationIds: [],
      },
      runtimeHealth: {
        bootstrapStage: 'ready' as const,
        bootstrapError: null,
        matchPhase: 'active' as const,
        arenaId: 'gun-range' as const,
        actualBackend: 'webgl2' as const,
        webglVersion: 'WebGL 2.0 Direct3D11',
        softwareAdapter: false as const,
        contextLost: false as const,
        presentationStatus: 'synchronous' as const,
        runtimeErrorVisible: false as const,
      },
      ...validVisualEvidence(id, index),
      runtimeCadence: validRuntimeCadence(KILLSTREAK_DEMO_CLIP_DURATION_MS[id], 1_000 + index * 500),
    })),
    pageErrors: [],
  };
}

describe('Pass 66 real test-bay killstreak capture contract', () => {
  it('projects every capture ID and poster path from the canonical catalog', () => {
    expect(KILLSTREAK_DEMO_CAPTURE_IDS).toEqual(PASS65_KILLSTREAK_CATALOG.definitions.map(({ id }) => id));
    expect(Object.keys(KILLSTREAK_DEMO_EXPECTED_PROOF).sort()).toEqual([...KILLSTREAK_DEMO_CAPTURE_IDS].sort());
    for (const id of KILLSTREAK_DEMO_CAPTURE_IDS) {
      expect(killstreakDemoPosterPath(id)).toBe(`./assets/original/killstreak-demo/${id}.jpg`);
      expect(killstreakDemoVideoPath(id)).toBe(`./assets/original/killstreak-demo/${id}.mp4`);
    }
  });

  it('accepts one distinct, real-runtime F-commit capture for every support', () => {
    expect(validateKillstreakDemoCaptureReceipt(validReceipt())).toEqual([]);
  });

  it('keeps all eleven camera plans distinct and frames every supplied runtime subject', () => {
    const subjects = [[68, 2, -4], [72, 4, 0], [76, 2.5, 5]] as const;
    const poses = KILLSTREAK_DEMO_CAPTURE_IDS.map((id) => resolveKillstreakDemoCameraPose(id, subjects));
    expect(new Set(poses.map((pose) => JSON.stringify({
      position: pose.position, yaw: pose.yaw, pitch: pose.pitch, fov: pose.fov,
    }))).size).toBe(KILLSTREAK_DEMO_CAPTURE_IDS.length);
    for (const pose of poses) {
      for (const subject of subjects) {
        expect(projectKillstreakDemoWorldPoint(pose, subject)).toMatchObject({
          ndcX: expect.any(Number), ndcY: expect.any(Number), depthM: expect.any(Number),
        });
        const projected = projectKillstreakDemoWorldPoint(pose, subject);
        expect(projected.depthM).toBeGreaterThan(0);
        expect(Math.abs(projected.ndcX)).toBeLessThanOrEqual(0.82);
        expect(Math.abs(projected.ndcY)).toBeLessThanOrEqual(0.82);
      }
    }
  });

  it('fails closed on served-source drift, incomplete closure, duplicate media, a reused context, or missing support', () => {
    const base = validReceipt();
    expect(validateKillstreakDemoCaptureReceipt({ ...base, servedSourceSha: '4'.repeat(40) }))
      .toContain('receipt servedSourceSha must equal the clean capture gitHead');
    expect(validateKillstreakDemoCaptureReceipt({
      ...base,
      sourceInputs: base.sourceInputs.filter(({ path }) => path !== 'package.json'),
    })).toContain('receipt sourceInputs do not bind every fixed capture/build/topology recipe input');
    const captures = base.captures.map((capture, index) => index === 1
      ? {
          ...capture,
          sha256: base.captures[0].sha256,
          videoSha256: base.captures[0].videoSha256,
          recordingContextId: base.captures[0].recordingContextId,
          revisionAfter: capture.revisionBefore,
        }
      : capture);
    const duplicateErrors = validateKillstreakDemoCaptureReceipt({
      ...base,
      captures,
    });
    expect(duplicateErrors.some((error) => error.includes('video is byte-identical'))).toBe(true);
    expect(duplicateErrors.some((error) => error.includes('did not use a fresh recording context'))).toBe(true);
    expect(duplicateErrors.some((error) => error.includes('runtime revision did not advance'))).toBe(true);
    const missingErrors = validateKillstreakDemoCaptureReceipt({
      ...base,
      captures: captures.slice(1),
    });
    expect(missingErrors).toEqual(expect.arrayContaining([
      'captures must cover every canonical killstreak exactly once',
    ]));
  });

  it('rejects swapped poster or video paths even when all bytes and proofs are otherwise distinct', () => {
    const base = validReceipt();
    const first = base.captures[0];
    const second = base.captures[1];
    const errors = validateKillstreakDemoCaptureReceipt({
      ...base,
      captures: base.captures.map((capture, index) => index === 0
        ? { ...capture, artifactPath: second.artifactPath, videoArtifactPath: second.videoArtifactPath }
        : index === 1
          ? { ...capture, artifactPath: first.artifactPath, videoArtifactPath: first.videoArtifactPath }
          : capture),
    });
    expect(errors).toEqual(expect.arrayContaining([
      `${first.id} artifactPath invalid`,
      `${first.id} videoArtifactPath invalid`,
      `${second.id} artifactPath invalid`,
      `${second.id} videoArtifactPath invalid`,
    ]));
  });

  it('fails closed on generic framing, missing visible milestones, software rendering, slow presentation, or padded video', () => {
    const base = validReceipt();
    const first = base.captures[0];
    const slowCadence = validRuntimeCadence(KILLSTREAK_DEMO_CLIP_DURATION_MS[first.id], 8_000, 9);
    const errors = validateKillstreakDemoCaptureReceipt({
      ...base,
      captures: base.captures.map((capture, index) => index === 0 ? {
        ...capture,
        runtimeHealth: { ...capture.runtimeHealth, softwareAdapter: true },
        cameraPose: { ...capture.cameraPose, strategy: 'dynamic-world-subjects' },
        visualProof: { ...capture.visualProof, milestones: [] },
        runtimeCadence: slowCadence,
        videoMotionFrameCount: 10,
        videoNearDuplicateFrameCount: capture.videoFrameCount - 11,
        videoNearDuplicateFrameRatio: Number(((capture.videoFrameCount - 11) / (capture.videoFrameCount - 1)).toFixed(6)),
        videoLongestNearDuplicateRun: 18,
      } : capture),
    });
    expect(errors).toEqual(expect.arrayContaining([
      `${first.id} encoded near-duplicate frame ratio exceeds the motion budget`,
      `${first.id} encoded near-duplicate run exceeds the motion budget`,
      `${first.id} renderer/admission health is not hardware WebGL2 ready`,
      `${first.id} support-specific camera pose is invalid`,
      `${first.id} visible effect milestones are incomplete or out of canonical order`,
      `${first.id} runtime presented-frame cadence is below the capture budget`,
    ]));
  });

  it('rejects forged viewport coordinates or a camera detached from its runtime subjects', () => {
    const base = validReceipt();
    const captureIndex = KILLSTREAK_DEMO_CAPTURE_IDS.indexOf('care-package');
    const target = base.captures[captureIndex];
    const errors = validateKillstreakDemoCaptureReceipt({
      ...base,
      captures: base.captures.map((capture, index) => index === captureIndex ? {
        ...capture,
        cameraPose: {
          ...capture.cameraPose,
          position: [capture.cameraPose.position[0] + 2, ...capture.cameraPose.position.slice(1)] as [number, number, number],
        },
        visualProof: {
          ...capture.visualProof,
          subjects: capture.visualProof.subjects.map((subject, subjectIndex) => subjectIndex === 0
            ? { ...subject, ndcX: 0 }
            : subject),
        },
      } : capture),
    });
    expect(errors).toEqual(expect.arrayContaining([
      `${target.id} stored visual subject projection does not match its camera pose`,
      `${target.id} camera pose does not match its support-specific runtime-subject solver`,
    ]));
  });
});
