import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KILLSTREAK_DEMO_CAPTURE_IDS,
  KILLSTREAK_DEMO_CAPTURE_ROUTE,
  KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS,
  KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
  KILLSTREAK_DEMO_CLIP_DURATION_MS,
  KILLSTREAK_DEMO_EXPECTED_PROOF,
  KILLSTREAK_DEMO_VISUAL_REQUIREMENTS,
  projectKillstreakDemoWorldPoint,
  resolveKillstreakDemoCameraPose,
  summarizeKillstreakDemoRuntimeCadence,
} from './killstreak-demo-capture-contract';
import {
  assertKillstreakDemoMp4Envelope,
  finalizeKillstreakDemoMedia,
  validateStagedKillstreakDemoCapture,
  verifyFinalizedKillstreakDemoMedia,
  type KillstreakDemoVideoProbe,
} from '../scripts/qa/finalize-pass66-killstreak-demo-media';
import {
  collectKillstreakDemoSourceClosure,
  killstreakDemoSourceClosureSha256,
} from '../scripts/qa/pass66-killstreak-demo-source-closure';
import { analyzeKillstreakDemoDecodedCadence } from '../scripts/qa/pass66-killstreak-demo-video-probe';

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

function syntheticJpeg(seed: number): Buffer {
  const bytes = Buffer.alloc(12_500, seed);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x1c, 0x03, 0xc0, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00], 0);
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9;
  return bytes;
}

function syntheticMp4(seed: number): Buffer {
  const bytes = Buffer.alloc(60_000 + seed, seed);
  bytes.writeUInt32BE(24, 0);
  bytes.write('ftyp', 4, 'ascii');
  bytes.write('isom', 8, 'ascii');
  bytes.writeUInt32BE(104, 24);
  bytes.write('moov', 28, 'ascii');
  bytes.writeUInt32BE(bytes.length - 128, 128);
  bytes.write('mdat', 132, 'ascii');
  return bytes;
}

function syntheticRuntimeEvidence(id: typeof KILLSTREAK_DEMO_CAPTURE_IDS[number], index: number) {
  const durationMs = KILLSTREAK_DEMO_CLIP_DURATION_MS[id];
  const presentedFrames = Math.floor(durationMs / (1_000 / 30));
  const baseFrame = 1_000 + index * 500;
  const samples = Array.from({ length: presentedFrames + 1 }, (_, ordinal) => ({
    elapsedMs: Number((ordinal * durationMs / presentedFrames).toFixed(3)),
    presentedFrame: baseFrame + ordinal,
  }));
  const cadenceSummary = summarizeKillstreakDemoRuntimeCadence({
    durationMs,
    presentedFrameStart: baseFrame,
    presentedFrameEnd: baseFrame + presentedFrames,
    samples,
  });
  const requirement = KILLSTREAK_DEMO_VISUAL_REQUIREMENTS[id];
  const positions = Array.from({ length: requirement.minimumSubjectCount }, (_, ordinal) => (
    [70 + ordinal * 0.25, 2 + ordinal % 2 * 0.1, index + ordinal * 0.2] as const
  ));
  const framingPoints = positions.length > 0 ? positions : [[68, 1.2, -10], [76, 1.2, 12]] as const;
  const cameraPose = resolveKillstreakDemoCameraPose(id, framingPoints);
  const subjects = positions.map((worldPosition, ordinal) => ({
    id: `${id}-subject-${ordinal}`,
    worldPosition,
    ...projectKillstreakDemoWorldPoint(cameraPose, worldPosition),
  }));
  return {
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
    cameraPose,
    visualProof: {
      kind: requirement.kind,
      sampledAtPresentedFrame: baseFrame + 30,
      subjectCount: subjects.length,
      inFrameCount: subjects.length,
      subjects,
      hudRegion: requirement.hudSelector === null ? null : {
        selector: requirement.hudSelector, left: 24, top: 92, width: 150, height: 150, visible: true as const,
      },
      milestones: requirement.requiredMilestones,
    },
    runtimeCadence: {
      durationMs,
      frameCountStart: baseFrame,
      frameCountEnd: baseFrame + presentedFrames,
      presentedFrameStart: baseFrame,
      presentedFrameEnd: baseFrame + presentedFrames,
      ...cadenceSummary,
      samples,
    },
  };
}

const syntheticProbe = async (path: string): Promise<KillstreakDemoVideoProbe> => {
  const id = basename(path, '.mp4') as typeof KILLSTREAK_DEMO_CAPTURE_IDS[number];
  const durationMs = KILLSTREAK_DEMO_CLIP_DURATION_MS[id];
  const frameCount = Math.ceil(durationMs / 1_000 * 30);
  const nearDuplicateFrameCount = Math.floor((frameCount - 1) * 0.1);
  return {
    codec: 'h264',
    profile: 'High',
    container: 'mp4',
    pixelFormat: 'yuv420p',
    fastStart: true,
    width: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width,
    height: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height,
    durationMs,
    frameCount,
    sampleFrameSha256: [digest(`${id}-sample-1`), digest(`${id}-sample-2`), digest(`${id}-sample-3`)],
    motionFrameCount: frameCount - 1 - nearDuplicateFrameCount,
    nearDuplicateFrameCount,
    nearDuplicateFrameRatio: Number((nearDuplicateFrameCount / (frameCount - 1)).toFixed(6)),
    longestNearDuplicateRun: 2,
    hasAudio: false,
  };
};

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'atomic-killstreak-media-'));
  await writeFile(resolve(root, 'assets.manifest.json'), '{"schemaVersion":3,"assets":[]}\n');
  await Promise.all(KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS.map(async (path, index) => {
    const bytes = `source-${index}`;
    const absolute = resolve(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
  }));
  await mkdir(resolve(root, 'src'), { recursive: true });
  await mkdir(resolve(root, 'public'), { recursive: true });
  await mkdir(resolve(root, 'shared'), { recursive: true });
  await writeFile(resolve(root, 'src/runtime.ts'), 'runtime-source');
  await writeFile(resolve(root, 'public/runtime.bin'), 'runtime-public-asset');
  await writeFile(resolve(root, 'shared/runtime.ts'), 'runtime-shared-source');
  const sourceInputs = await collectKillstreakDemoSourceClosure(root);
  const captures = await Promise.all(KILLSTREAK_DEMO_CAPTURE_IDS.map(async (id, index) => {
    const artifactPath = `artifacts/pass66/killstreak-demo-capture/staged/${id}.jpg`;
    const bytes = syntheticJpeg(index + 1);
    const absolute = resolve(root, artifactPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
    const videoArtifactPath = `artifacts/pass66/killstreak-demo-capture/staged/${id}.mp4`;
    const videoBytes = syntheticMp4(index + 1);
    const videoAbsolute = resolve(root, videoArtifactPath);
    await writeFile(videoAbsolute, videoBytes);
    const probe = await syntheticProbe(videoAbsolute);
    return {
      id,
      artifactPath,
      sha256: digest(bytes),
      sizeBytes: bytes.length,
      ...KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
      videoArtifactPath,
      videoSha256: digest(videoBytes),
      videoSizeBytes: videoBytes.length,
      videoWidth: probe.width,
      videoHeight: probe.height,
      videoDurationMs: probe.durationMs,
      videoFrameCount: probe.frameCount,
      videoSampleFrameSha256: probe.sampleFrameSha256,
      videoMotionFrameCount: probe.motionFrameCount,
      videoNearDuplicateFrameCount: probe.nearDuplicateFrameCount,
      videoNearDuplicateFrameRatio: probe.nearDuplicateFrameRatio,
      videoLongestNearDuplicateRun: probe.longestNearDuplicateRun,
      videoCodec: probe.codec,
      videoProfile: probe.profile,
      videoContainer: probe.container,
      videoPixelFormat: probe.pixelFormat,
      videoFastStart: probe.fastStart,
      videoHasAudio: false,
      videoActivationOffsetMs: 750,
      videoVisualProofOffsetMs: 1_250,
      recordingContextId: `${(index + 1).toString(16).padStart(8, '0')}-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
      rawRecordingSha256: (index + 80).toString(16).padStart(64, '0'),
      fCandidateTargetId: `test-bay-support:${id}`,
      fCommitTargetId: `test-bay-support:${id}`,
      revisionBefore: index,
      revisionAfter: index + 1,
      proof: { kind: KILLSTREAK_DEMO_EXPECTED_PROOF[id].kind, count: KILLSTREAK_DEMO_EXPECTED_PROOF[id].minimumCount, activationIds: [] },
      ...syntheticRuntimeEvidence(id, index),
    };
  }));
  const receipt = {
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
    sourceClosureSha256: killstreakDemoSourceClosureSha256(sourceInputs),
    sourceInputs,
    captures,
    pageErrors: [],
  };
  const receiptPath = resolve(root, 'artifacts/pass66/killstreak-demo-capture/capture-receipt.json');
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return { root, receiptPath, captures };
}

describe('Pass 66 real test-bay media finalizer', () => {
  it('distinguishes genuine decoded motion from a nominal frame rate padded with duplicate frames', () => {
    const frameSize = 96 * 54;
    const moving = Buffer.concat(Array.from({ length: 10 }, (_, index) => Buffer.alloc(frameSize, index * 12)));
    expect(analyzeKillstreakDemoDecodedCadence(moving, 10)).toEqual({
      motionFrameCount: 9,
      nearDuplicateFrameCount: 0,
      nearDuplicateFrameRatio: 0,
      longestNearDuplicateRun: 0,
    });
    const padded = Buffer.concat([
      ...Array.from({ length: 8 }, () => Buffer.alloc(frameSize, 20)),
      Buffer.alloc(frameSize, 80),
      Buffer.alloc(frameSize, 120),
    ]);
    expect(analyzeKillstreakDemoDecodedCadence(padded, 10)).toMatchObject({
      motionFrameCount: 2,
      nearDuplicateFrameCount: 7,
      nearDuplicateFrameRatio: 0.777778,
      longestNearDuplicateRun: 7,
    });
  });

  it('rejects a valid-looking MP4 whose moov atom follows media data', () => {
    const bytes = syntheticMp4(1);
    const moovSize = bytes.readUInt32BE(24);
    const mdatSize = bytes.readUInt32BE(128);
    const reordered = Buffer.concat([
      bytes.subarray(0, 24),
      bytes.subarray(128, 128 + mdatSize),
      bytes.subarray(24, 24 + moovSize),
    ]);
    expect(() => assertKillstreakDemoMp4Envelope(reordered)).toThrow('not fast-start');
  });

  it('finalizes only a complete catalog capture into unique public posters and a bound manifest', async () => {
    const { root } = await fixture();
    const result = await finalizeKillstreakDemoMedia(root, undefined, syntheticProbe, false);
    expect(result.mediaCount).toBe(KILLSTREAK_DEMO_CAPTURE_IDS.length);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
    expect(manifest.media.map(({ id }: { id: string }) => id)).toEqual(KILLSTREAK_DEMO_CAPTURE_IDS);
    expect(new Set(manifest.media.map(({ poster }: { poster: { sha256: string } }) => poster.sha256)).size).toBe(KILLSTREAK_DEMO_CAPTURE_IDS.length);
    expect(new Set(manifest.media.map(({ video }: { video: { sha256: string } }) => video.sha256)).size).toBe(KILLSTREAK_DEMO_CAPTURE_IDS.length);
    await expect(verifyFinalizedKillstreakDemoMedia(root, syntheticProbe, false)).resolves.toMatchObject({ mediaCount: KILLSTREAK_DEMO_CAPTURE_IDS.length });
    const assets = JSON.parse(await readFile(resolve(root, 'assets.manifest.json'), 'utf8'));
    expect(assets.assets).toHaveLength(1);
    expect(assets.assets[0].files).toHaveLength(KILLSTREAK_DEMO_CAPTURE_IDS.length * 2 + 1);
  });

  it('rejects staged bytes changed after the browser receipt', async () => {
    const { root, captures } = await fixture();
    await writeFile(resolve(root, captures[0].artifactPath), syntheticJpeg(250));
    await expect(validateStagedKillstreakDemoCapture(root, undefined, syntheticProbe, false)).rejects.toThrow('staged poster bytes do not match');
  });

  it('rejects any recursive source/public or fixed recipe closure drift', async () => {
    const { root } = await fixture();
    await writeFile(resolve(root, 'public/runtime.bin'), 'changed-runtime-public-asset');
    await expect(validateStagedKillstreakDemoCapture(root, undefined, syntheticProbe, false))
      .rejects.toThrow('source closure path/hash roster diverges');
  });

  it('rejects a staged video changed after the browser receipt', async () => {
    const { root, captures } = await fixture();
    await writeFile(resolve(root, captures[0].videoArtifactPath), syntheticMp4(240));
    await expect(validateStagedKillstreakDemoCapture(root, undefined, syntheticProbe, false)).rejects.toThrow('staged video bytes do not match');
  });

  it('fails verification when the public asset provenance is stale', async () => {
    const { root } = await fixture();
    await finalizeKillstreakDemoMedia(root, undefined, syntheticProbe, false);
    const assetManifestPath = resolve(root, 'assets.manifest.json');
    const assetManifest = JSON.parse(await readFile(assetManifestPath, 'utf8'));
    assetManifest.assets[0].files[0].sha256 = '0'.repeat(64);
    await writeFile(assetManifestPath, `${JSON.stringify(assetManifest, null, 2)}\n`);
    await expect(verifyFinalizedKillstreakDemoMedia(root, syntheticProbe, false)).rejects.toThrow('asset provenance diverges');
  });
});
