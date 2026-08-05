import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  KILLSTREAK_DEMO_CAPTURE_IDS,
  KILLSTREAK_DEMO_CAPTURE_VIEWPORT,
  KILLSTREAK_DEMO_MEDIA_MANIFEST_SCHEMA_VERSION,
  validateKillstreakDemoCaptureReceipt,
  type KillstreakDemoCaptureReceipt,
} from '../../src/killstreak-demo-capture-contract';
import {
  collectKillstreakDemoSourceClosure,
  killstreakDemoSourceClosureSha256,
} from './pass66-killstreak-demo-source-closure';
import {
  assertKillstreakDemoMp4Envelope,
  probeH264Mp4,
  sameKillstreakDemoVideoProbe,
  type KillstreakDemoVideoProbe,
  type KillstreakDemoVideoProbeFn,
} from './pass66-killstreak-demo-video-probe';

export {
  assertKillstreakDemoMp4Envelope,
  probeH264Mp4,
  sameKillstreakDemoVideoProbe,
};
export type { KillstreakDemoVideoProbe, KillstreakDemoVideoProbeFn };

const DEFAULT_RECEIPT = 'artifacts/pass66/killstreak-demo-capture/capture-receipt.json';
const PUBLIC_MEDIA_DIRECTORY = 'public/assets/original/killstreak-demo';
const SOURCE_RECEIPT = 'source-assets/killstreak-demo/pass66-real-test-bay-capture-receipt.json';
const ASSET_MANIFEST = 'assets.manifest.json';
const ASSET_ID = 'atomic-acres-pass66-real-gun-range-killstreak-demo-videos-2026-08-02';
const LEGACY_ASSET_ID = 'atomic-acres-pass66-real-gun-range-killstreak-demo-posters-2026-08-02';
const PUBLISHED_MEDIA_GIT_PATHS = Object.freeze([
  'assets.manifest.json',
  'docs/PASS66_FINAL_ADJUSTMENTS_LEDGER_2026-08-01.md',
  'docs/PASS66_RECENT_REQUEST_AUDIT_2026-08-01.md',
  'public/assets/original/killstreak-demo/',
  'source-assets/killstreak-demo/pass66-real-test-bay-capture-receipt.json',
] as const);

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function absoluteBelow(root: string, path: string): string {
  const absolute = resolve(root, path);
  const fromRoot = relative(root, absolute);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error(`${path} resolves outside repository root`);
  return absolute;
}

function gitOutput(repositoryRoot: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function assertExactCaptureGitState(repositoryRoot: string, gitHead: string): void {
  const currentHead = gitOutput(repositoryRoot, ['rev-parse', 'HEAD']);
  if (currentHead !== gitHead) {
    throw new Error(`capture receipt gitHead is not the current source-freeze commit: ${gitHead} != ${currentHead}`);
  }
  const dirty = gitOutput(repositoryRoot, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty) throw new Error('capture finalization requires the exact clean source-freeze worktree');
}

function allowedPublishedMediaPath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  return PUBLISHED_MEDIA_GIT_PATHS.some((allowed) => (
    allowed.endsWith('/') ? normalized.startsWith(allowed) : normalized === allowed
  ));
}

function assertPublishedMediaGitLineage(repositoryRoot: string, gitHead: string): void {
  execFileSync('git', ['merge-base', '--is-ancestor', gitHead, 'HEAD'], {
    cwd: repositoryRoot,
    stdio: 'pipe',
    windowsHide: true,
  });
  const dirty = gitOutput(repositoryRoot, ['status', '--porcelain', '--untracked-files=all']);
  if (dirty) throw new Error('release-grade published media verification requires a clean worktree');
  const changes = gitOutput(repositoryRoot, ['diff', '--name-status', '--no-renames', `${gitHead}..HEAD`, '--'])
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf('\t');
      if (separator < 1) return Object.freeze({ status: '', path: line });
      return Object.freeze({ status: line.slice(0, separator), path: line.slice(separator + 1) });
    });
  const invalid = changes.filter(({ status, path }) => !['A', 'M'].includes(status) || !allowedPublishedMediaPath(path));
  if (invalid.length > 0) {
    throw new Error(`published media diverged from its source commit outside approved media/evidence paths: ${invalid.map(({ status, path }) => `${status}:${path}`).join(', ')}`);
  }
}

export function jpegDimensions(bytes: Buffer): Readonly<{ width: number; height: number }> {
  if (bytes.length < 12_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8
    || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('capture is not a complete bounded JPEG');
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) {
      offset += 2;
      continue;
    }
    const segmentLength = bytes.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) throw new Error('capture JPEG segment is invalid');
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return Object.freeze({ height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) });
    }
    offset += 2 + segmentLength;
  }
  throw new Error('capture JPEG dimensions are missing');
}

type StagedMedia = Readonly<{
  id: string;
  poster: Readonly<{ source: string; bytes: Buffer; sha256: string; sizeBytes: number }>;
  video: Readonly<{
    source: string;
    bytes: Buffer;
    sha256: string;
    sizeBytes: number;
    probe: KillstreakDemoVideoProbe;
  }>;
}>;

export type ValidatedKillstreakDemoCapture = Readonly<{
  receipt: KillstreakDemoCaptureReceipt;
  receiptBytes: Buffer;
  staged: readonly StagedMedia[];
}>;

type PublishedFile = Readonly<{
  path: string;
  sha256: string;
  sizeBytes: number;
  width: number;
  height: number;
}>;

type PublishedMedia = Readonly<{
  id: string;
  poster: PublishedFile;
  video: PublishedFile & Readonly<{
    durationMs: number;
    frameCount: number;
    sampleFrameSha256: readonly [string, string, string];
    motionFrameCount: number;
    nearDuplicateFrameCount: number;
    nearDuplicateFrameRatio: number;
    longestNearDuplicateRun: number;
    codec: 'h264';
    profile: 'High';
    container: 'mp4';
    pixelFormat: 'yuv420p';
    fastStart: true;
    hasAudio: false;
  }>;
}>;

type PublishedManifest = Readonly<{
  schemaVersion: number;
  assetFamily: string;
  captureKind: string;
  sourceReceipt: string;
  sourceReceiptSha256: string;
  gitHead: string;
  servedSourceSha: string;
  servedRuntimeTreeSha256: string;
  servedRuntimeFileCount: number;
  sourceClosureSha256: string;
  sourceInputs: readonly Readonly<{ path: string; sha256: string }>[];
  media: readonly PublishedMedia[];
  aggregateSha256: string;
}>;

export async function validateStagedKillstreakDemoCapture(
  repositoryRoot: string,
  receiptRelativePath = DEFAULT_RECEIPT,
  probeVideo: KillstreakDemoVideoProbeFn = probeH264Mp4,
  enforceGitState = true,
): Promise<ValidatedKillstreakDemoCapture> {
  const receiptPath = absoluteBelow(repositoryRoot, receiptRelativePath);
  const receiptBytes = await readFile(receiptPath);
  let receipt: KillstreakDemoCaptureReceipt;
  try {
    receipt = JSON.parse(receiptBytes.toString('utf8')) as KillstreakDemoCaptureReceipt;
  } catch (error) {
    throw new Error(`capture receipt is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const contractErrors = validateKillstreakDemoCaptureReceipt(receipt);
  if (contractErrors.length > 0) throw new Error(`capture receipt rejected:\n${contractErrors.map((error) => `- ${error}`).join('\n')}`);
  if (enforceGitState) assertExactCaptureGitState(repositoryRoot, receipt.gitHead);

  const currentSourceClosure = await collectKillstreakDemoSourceClosure(repositoryRoot);
  if (JSON.stringify(receipt.sourceInputs) !== JSON.stringify(currentSourceClosure)) {
    throw new Error('capture source closure path/hash roster diverges from the complete current src/public/build/topology recipe');
  }
  const currentSourceClosureSha256 = killstreakDemoSourceClosureSha256(currentSourceClosure);
  if (receipt.sourceClosureSha256 !== currentSourceClosureSha256) {
    throw new Error(`capture source closure digest mismatch: ${receipt.sourceClosureSha256} != ${currentSourceClosureSha256}`);
  }

  const staged = await Promise.all(receipt.captures.map(async (capture): Promise<StagedMedia> => {
    const posterSource = absoluteBelow(repositoryRoot, capture.artifactPath);
    const posterBytes = await readFile(posterSource);
    const posterSha256 = sha256(posterBytes);
    if (posterSha256 !== capture.sha256) throw new Error(`${capture.id} staged poster bytes do not match the runtime receipt`);
    if (posterBytes.length !== capture.sizeBytes) throw new Error(`${capture.id} staged poster size does not match the runtime receipt`);
    const dimensions = jpegDimensions(posterBytes);
    if (dimensions.width !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width
      || dimensions.height !== KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height
      || dimensions.width !== capture.width || dimensions.height !== capture.height) {
      throw new Error(`${capture.id} staged poster dimensions do not match the runtime receipt`);
    }

    const videoSource = absoluteBelow(repositoryRoot, capture.videoArtifactPath);
    const videoBytes = await readFile(videoSource);
    assertKillstreakDemoMp4Envelope(videoBytes);
    const videoSha256 = sha256(videoBytes);
    if (videoSha256 !== capture.videoSha256) throw new Error(`${capture.id} staged video bytes do not match the runtime receipt`);
    if (videoBytes.length !== capture.videoSizeBytes) throw new Error(`${capture.id} staged video size does not match the runtime receipt`);
    const videoProbe = await probeVideo(videoSource);
    const receiptProbe: KillstreakDemoVideoProbe = {
      codec: capture.videoCodec,
      profile: capture.videoProfile,
      container: capture.videoContainer,
      pixelFormat: capture.videoPixelFormat,
      fastStart: capture.videoFastStart,
      width: capture.videoWidth,
      height: capture.videoHeight,
      durationMs: capture.videoDurationMs,
      frameCount: capture.videoFrameCount,
      sampleFrameSha256: capture.videoSampleFrameSha256,
      motionFrameCount: capture.videoMotionFrameCount,
      nearDuplicateFrameCount: capture.videoNearDuplicateFrameCount,
      nearDuplicateFrameRatio: capture.videoNearDuplicateFrameRatio,
      longestNearDuplicateRun: capture.videoLongestNearDuplicateRun,
      hasAudio: capture.videoHasAudio,
    };
    if (!sameKillstreakDemoVideoProbe(videoProbe, receiptProbe)) throw new Error(`${capture.id} staged video probe diverges from the runtime receipt`);
    return Object.freeze({
      id: capture.id,
      poster: Object.freeze({ source: posterSource, bytes: posterBytes, sha256: posterSha256, sizeBytes: posterBytes.length }),
      video: Object.freeze({ source: videoSource, bytes: videoBytes, sha256: videoSha256, sizeBytes: videoBytes.length, probe: videoProbe }),
    });
  }));
  if (new Set(staged.map(({ poster }) => poster.sha256)).size !== KILLSTREAK_DEMO_CAPTURE_IDS.length) {
    throw new Error('generic or duplicate poster bytes cannot be finalized');
  }
  if (new Set(staged.map(({ video }) => video.sha256)).size !== KILLSTREAK_DEMO_CAPTURE_IDS.length) {
    throw new Error('generic or duplicate video bytes cannot be finalized');
  }
  return Object.freeze({ receipt: Object.freeze(receipt), receiptBytes, staged: Object.freeze(staged) });
}

async function updateAssetManifest(
  repositoryRoot: string,
  publicManifestPath: string,
  sourceReceiptPath: string,
  media: readonly PublishedMedia[],
  capturedAt: string,
): Promise<void> {
  const manifestPath = absoluteBelow(repositoryRoot, ASSET_MANIFEST);
  const manifest = JSON.parse((await readFile(manifestPath)).toString('utf8')) as {
    schemaVersion: number;
    assets: Array<Record<string, unknown>>;
  };
  if (manifest.schemaVersion !== 3 || !Array.isArray(manifest.assets)) throw new Error('assets.manifest.json schema is not supported');
  const sourceScript = 'tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts';
  const sourceSpec = 'scripts/qa/finalize-pass66-killstreak-demo-media.ts';
  const fileRecords = media.flatMap(({ poster, video }) => [
    { path: poster.path, sha256: poster.sha256 },
    { path: video.path, sha256: video.sha256 },
  ]);
  fileRecords.push({
    path: relative(repositoryRoot, publicManifestPath).replaceAll('\\', '/'),
    sha256: sha256(await readFile(publicManifestPath)),
  });
  const record = {
    id: ASSET_ID,
    kind: 'original-project-browser-captured-authoritative-runtime-video-family',
    creator: 'Atomic Acres project',
    source: sourceScript,
    generatedAsOf: capturedAt.slice(0, 10),
    license: 'Original project work',
    files: fileRecords,
    sourceScript,
    sourceScriptSha256: sha256(await readFile(absoluteBelow(repositoryRoot, sourceScript))),
    sourceSpec,
    sourceSpecSha256: sha256(await readFile(absoluteBelow(repositoryRoot, sourceSpec))),
    sourceProvenance: SOURCE_RECEIPT,
    sourceProvenanceSha256: sha256(await readFile(sourceReceiptPath)),
    format: 'Eleven distinct compact 960x540 H.264/yuv420p MP4 loops with JPEG poster fallbacks, support-specific runtime-subject cameras, and decoded cadence proof from fresh hardware-Chrome contexts in the real Gun Range grey test bay',
    modifications: 'Each clip retains a bounded pre-activation lead and real active-effect tail after its canonical station wins the normal keyboard F lifecycle. Playwright records the authoritative runtime; FFmpeg trims and transcodes without synthetic animation, audio, or live menu rendering.',
    attributionRequired: false,
  };
  const matches = manifest.assets.reduce<number[]>((indices, asset, index) => {
    if (asset.id === ASSET_ID || asset.id === LEGACY_ASSET_ID) indices.push(index);
    return indices;
  }, []);
  if (matches.length > 1) throw new Error('assets.manifest.json contains duplicate killstreak demo families');
  if (matches.length === 1) manifest.assets[matches[0]!] = record;
  else manifest.assets.push(record);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function finalizeKillstreakDemoMedia(
  repositoryRoot: string,
  receiptRelativePath = DEFAULT_RECEIPT,
  probeVideo: KillstreakDemoVideoProbeFn = probeH264Mp4,
  enforceGitState = true,
): Promise<Readonly<{
  manifestPath: string;
  sourceReceiptPath: string;
  mediaCount: number;
  totalVideoBytes: number;
  aggregateSha256: string;
}>> {
  const validated = await validateStagedKillstreakDemoCapture(
    repositoryRoot,
    receiptRelativePath,
    probeVideo,
    enforceGitState,
  );
  const outputDirectory = absoluteBelow(repositoryRoot, PUBLIC_MEDIA_DIRECTORY);
  const sourceReceiptPath = absoluteBelow(repositoryRoot, SOURCE_RECEIPT);
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(dirname(sourceReceiptPath), { recursive: true });
  const expectedOutputNames = new Set([
    ...KILLSTREAK_DEMO_CAPTURE_IDS.flatMap((id) => [`${id}.jpg`, `${id}.mp4`]),
    'manifest.json',
  ]);
  const existingOutputNames = await readdir(outputDirectory);
  const unexpected = existingOutputNames.filter((name) => !expectedOutputNames.has(name));
  if (unexpected.length > 0) throw new Error(`killstreak demo output contains unexpected files: ${unexpected.join(', ')}`);

  const mediaRecords = await Promise.all(validated.staged.map(async (capture): Promise<PublishedMedia> => {
    const posterFileName = `${capture.id}.jpg`;
    const videoFileName = `${capture.id}.mp4`;
    await copyFile(capture.poster.source, resolve(outputDirectory, posterFileName));
    await copyFile(capture.video.source, resolve(outputDirectory, videoFileName));
    return Object.freeze({
      id: capture.id,
      poster: Object.freeze({
        path: `public/assets/original/killstreak-demo/${posterFileName}`,
        sha256: capture.poster.sha256,
        sizeBytes: capture.poster.sizeBytes,
        width: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.width,
        height: KILLSTREAK_DEMO_CAPTURE_VIEWPORT.height,
      }),
      video: Object.freeze({
        path: `public/assets/original/killstreak-demo/${videoFileName}`,
        sha256: capture.video.sha256,
        sizeBytes: capture.video.sizeBytes,
        width: capture.video.probe.width,
        height: capture.video.probe.height,
        durationMs: capture.video.probe.durationMs,
        frameCount: capture.video.probe.frameCount,
        sampleFrameSha256: capture.video.probe.sampleFrameSha256,
        motionFrameCount: capture.video.probe.motionFrameCount,
        nearDuplicateFrameCount: capture.video.probe.nearDuplicateFrameCount,
        nearDuplicateFrameRatio: capture.video.probe.nearDuplicateFrameRatio,
        longestNearDuplicateRun: capture.video.probe.longestNearDuplicateRun,
        codec: capture.video.probe.codec,
        profile: capture.video.probe.profile,
        container: capture.video.probe.container,
        pixelFormat: capture.video.probe.pixelFormat,
        fastStart: capture.video.probe.fastStart,
        hasAudio: false,
      }),
    });
  }));
  await writeFile(sourceReceiptPath, validated.receiptBytes);
  const aggregateSha256 = sha256(JSON.stringify(mediaRecords.map(({ id, poster, video }) => [id, poster.sha256, video.sha256])));
  const publicManifest = Object.freeze({
    schemaVersion: KILLSTREAK_DEMO_MEDIA_MANIFEST_SCHEMA_VERSION,
    assetFamily: 'atomic-acres-pass66-real-gun-range-killstreak-demo-videos',
    captureKind: validated.receipt.captureKind,
    capturedAt: validated.receipt.capturedAt,
    gitHead: validated.receipt.gitHead,
    browserName: validated.receipt.browserName,
    browserVersion: validated.receipt.browserVersion,
    encoderName: validated.receipt.encoderName,
    encoderVersion: validated.receipt.encoderVersion,
    renderer: validated.receipt.renderer,
    route: validated.receipt.route,
    seed: validated.receipt.seed,
    viewport: validated.receipt.viewport,
    sourceReceipt: SOURCE_RECEIPT,
    sourceReceiptSha256: sha256(validated.receiptBytes),
    sourceClosureSha256: validated.receipt.sourceClosureSha256,
    sourceInputs: validated.receipt.sourceInputs,
    servedSourceSha: validated.receipt.servedSourceSha,
    servedRuntimeTreeSha256: validated.receipt.servedRuntimeTreeSha256,
    servedRuntimeFileCount: validated.receipt.servedRuntimeFileCount,
    media: Object.freeze(mediaRecords),
    aggregateSha256,
    claim: 'Each local video is a unique fresh-context hardware-Chrome recording of the real Gun Range test bay from the clean-SHA served candidate runtime tree, trimmed around a normal keyboard-F station commit and bound to support-specific in-frame subjects, visible-effect milestones, healthy presented-frame cadence, and decoded duplicate-frame budgets; the complete source/public/build recipe closure remains byte-bound.',
  });
  const manifestPath = resolve(outputDirectory, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(publicManifest, null, 2)}\n`, 'utf8');
  await updateAssetManifest(repositoryRoot, manifestPath, sourceReceiptPath, mediaRecords, validated.receipt.capturedAt);
  // This immediate byte/provenance check runs before the finalizer-owned files
  // can be committed. Standalone --verify-only is the release-grade clean
  // descendant check.
  await verifyFinalizedKillstreakDemoMedia(repositoryRoot, probeVideo, false);
  return Object.freeze({
    manifestPath,
    sourceReceiptPath,
    mediaCount: mediaRecords.length,
    totalVideoBytes: mediaRecords.reduce((total, media) => total + media.video.sizeBytes, 0),
    aggregateSha256,
  });
}

export async function verifyFinalizedKillstreakDemoMedia(
  repositoryRoot: string,
  probeVideo: KillstreakDemoVideoProbeFn = probeH264Mp4,
  enforceGitState = true,
): Promise<Readonly<{ mediaCount: number; totalVideoBytes: number; aggregateSha256: string }>> {
  const outputDirectory = absoluteBelow(repositoryRoot, PUBLIC_MEDIA_DIRECTORY);
  const manifestPath = resolve(outputDirectory, 'manifest.json');
  const manifest = JSON.parse((await readFile(manifestPath)).toString('utf8')) as PublishedManifest;
  if (manifest.schemaVersion !== KILLSTREAK_DEMO_MEDIA_MANIFEST_SCHEMA_VERSION
    || manifest.assetFamily !== 'atomic-acres-pass66-real-gun-range-killstreak-demo-videos'
    || manifest.captureKind !== 'real-gun-range-test-bay-runtime') {
    throw new Error('published killstreak demo manifest identity is invalid');
  }
  if (manifest.sourceReceipt !== SOURCE_RECEIPT) throw new Error('published killstreak demo source receipt path is invalid');
  const sourceReceiptBytes = await readFile(absoluteBelow(repositoryRoot, manifest.sourceReceipt));
  if (sha256(sourceReceiptBytes) !== manifest.sourceReceiptSha256) throw new Error('published source receipt digest mismatch');
  const sourceReceipt = JSON.parse(sourceReceiptBytes.toString('utf8')) as KillstreakDemoCaptureReceipt;
  const receiptErrors = validateKillstreakDemoCaptureReceipt(sourceReceipt);
  if (receiptErrors.length > 0) throw new Error(`published source receipt rejected:\n${receiptErrors.join('\n')}`);
  if (enforceGitState) assertPublishedMediaGitLineage(repositoryRoot, sourceReceipt.gitHead);
  if (manifest.gitHead !== sourceReceipt.gitHead
    || manifest.servedSourceSha !== sourceReceipt.servedSourceSha
    || manifest.servedRuntimeTreeSha256 !== sourceReceipt.servedRuntimeTreeSha256
    || manifest.servedRuntimeFileCount !== sourceReceipt.servedRuntimeFileCount) {
    throw new Error('published served-runtime identity diverges from capture receipt');
  }
  if (manifest.sourceClosureSha256 !== sourceReceipt.sourceClosureSha256
    || JSON.stringify(manifest.sourceInputs) !== JSON.stringify(sourceReceipt.sourceInputs)) {
    throw new Error('published source closure diverges from capture receipt');
  }
  const currentSourceClosure = await collectKillstreakDemoSourceClosure(repositoryRoot);
  if (JSON.stringify(manifest.sourceInputs) !== JSON.stringify(currentSourceClosure)) {
    throw new Error('published media source closure path/hash roster drifted');
  }
  const currentSourceClosureSha256 = killstreakDemoSourceClosureSha256(currentSourceClosure);
  if (manifest.sourceClosureSha256 !== currentSourceClosureSha256) {
    throw new Error('published media source closure digest drifted');
  }

  if (!Array.isArray(manifest.media)
    || manifest.media.map(({ id }) => id).join('\n') !== KILLSTREAK_DEMO_CAPTURE_IDS.join('\n')) {
    throw new Error('published media do not cover the canonical catalog in order');
  }
  const captureById = new Map(sourceReceipt.captures.map((capture) => [capture.id, capture]));
  const posterDigests = new Set<string>();
  const videoDigests = new Set<string>();
  await Promise.all(manifest.media.map(async (media) => {
    const capture = captureById.get(media.id as typeof KILLSTREAK_DEMO_CAPTURE_IDS[number]);
    const expectedPosterPath = `public/assets/original/killstreak-demo/${media.id}.jpg`;
    const expectedVideoPath = `public/assets/original/killstreak-demo/${media.id}.mp4`;
    if (!capture || media.poster.path !== expectedPosterPath || media.video.path !== expectedVideoPath
      || media.poster.sha256 !== capture.sha256 || media.poster.sizeBytes !== capture.sizeBytes
      || media.video.sha256 !== capture.videoSha256 || media.video.sizeBytes !== capture.videoSizeBytes) {
      throw new Error(`${media.id} published media metadata diverges from capture receipt`);
    }
    const posterBytes = await readFile(absoluteBelow(repositoryRoot, media.poster.path));
    const dimensions = jpegDimensions(posterBytes);
    if (sha256(posterBytes) !== media.poster.sha256 || posterBytes.length !== media.poster.sizeBytes
      || dimensions.width !== media.poster.width || dimensions.height !== media.poster.height) {
      throw new Error(`${media.id} published poster bytes failed verification`);
    }
    const videoBytes = await readFile(absoluteBelow(repositoryRoot, media.video.path));
    assertKillstreakDemoMp4Envelope(videoBytes);
    const observedProbe = await probeVideo(absoluteBelow(repositoryRoot, media.video.path));
    const manifestProbe: KillstreakDemoVideoProbe = {
      codec: media.video.codec,
      profile: media.video.profile,
      container: media.video.container,
      pixelFormat: media.video.pixelFormat,
      fastStart: media.video.fastStart,
      width: media.video.width,
      height: media.video.height,
      durationMs: media.video.durationMs,
      frameCount: media.video.frameCount,
      sampleFrameSha256: media.video.sampleFrameSha256,
      motionFrameCount: media.video.motionFrameCount,
      nearDuplicateFrameCount: media.video.nearDuplicateFrameCount,
      nearDuplicateFrameRatio: media.video.nearDuplicateFrameRatio,
      longestNearDuplicateRun: media.video.longestNearDuplicateRun,
      hasAudio: media.video.hasAudio,
    };
    if (sha256(videoBytes) !== media.video.sha256 || videoBytes.length !== media.video.sizeBytes
      || !sameKillstreakDemoVideoProbe(observedProbe, manifestProbe)) throw new Error(`${media.id} published video bytes failed verification`);
    posterDigests.add(media.poster.sha256);
    videoDigests.add(media.video.sha256);
  }));
  if (posterDigests.size !== KILLSTREAK_DEMO_CAPTURE_IDS.length) throw new Error('published posters are not unique');
  if (videoDigests.size !== KILLSTREAK_DEMO_CAPTURE_IDS.length) throw new Error('published videos are not unique');
  const aggregateSha256 = sha256(JSON.stringify(manifest.media.map(({ id, poster, video }) => [id, poster.sha256, video.sha256])));
  if (aggregateSha256 !== manifest.aggregateSha256) throw new Error('published media aggregate digest mismatch');
  const expectedNames = new Set([
    ...KILLSTREAK_DEMO_CAPTURE_IDS.flatMap((id) => [`${id}.jpg`, `${id}.mp4`]),
    'manifest.json',
  ]);
  const actualNames = await readdir(outputDirectory);
  if (actualNames.length !== expectedNames.size || actualNames.some((name) => !expectedNames.has(name))) {
    throw new Error('published killstreak demo directory contains missing or unexpected files');
  }
  const assetManifest = JSON.parse((await readFile(absoluteBelow(repositoryRoot, ASSET_MANIFEST))).toString('utf8')) as {
    schemaVersion?: number;
    assets?: Array<Record<string, unknown>>;
  };
  const assetRecords = (assetManifest.assets ?? []).filter(({ id }) => id === ASSET_ID || id === LEGACY_ASSET_ID);
  if (assetManifest.schemaVersion !== 3 || assetRecords.length !== 1 || assetRecords[0]?.id !== ASSET_ID) {
    throw new Error('killstreak video provenance family is missing or duplicated in assets.manifest.json');
  }
  const assetRecord = assetRecords[0]!;
  const expectedAssetFiles = manifest.media.flatMap(({ poster, video }) => [
    { path: poster.path, sha256: poster.sha256 },
    { path: video.path, sha256: video.sha256 },
  ]);
  expectedAssetFiles.push({
    path: 'public/assets/original/killstreak-demo/manifest.json',
    sha256: sha256(await readFile(manifestPath)),
  });
  if (JSON.stringify(assetRecord.files) !== JSON.stringify(expectedAssetFiles)
    || assetRecord.sourceScript !== 'tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts'
    || assetRecord.sourceScriptSha256 !== sha256(await readFile(absoluteBelow(repositoryRoot, 'tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts')))
    || assetRecord.sourceSpec !== 'scripts/qa/finalize-pass66-killstreak-demo-media.ts'
    || assetRecord.sourceSpecSha256 !== sha256(await readFile(absoluteBelow(repositoryRoot, 'scripts/qa/finalize-pass66-killstreak-demo-media.ts')))
    || assetRecord.sourceProvenance !== SOURCE_RECEIPT
    || assetRecord.sourceProvenanceSha256 !== sha256(sourceReceiptBytes)) {
    throw new Error('killstreak video asset provenance diverges from finalized media');
  }
  return Object.freeze({
    mediaCount: manifest.media.length,
    totalVideoBytes: manifest.media.reduce((total, media) => total + media.video.sizeBytes, 0),
    aggregateSha256,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
async function main(): Promise<void> {
  const repositoryRoot = resolve(process.cwd());
  const receiptArgumentIndex = process.argv.indexOf('--receipt');
  const receipt = receiptArgumentIndex >= 0 ? process.argv[receiptArgumentIndex + 1] : DEFAULT_RECEIPT;
  if (!receipt) throw new Error('--receipt requires a repository-relative path');
  if (process.argv.includes('--validate-capture-only')) {
    const validated = await validateStagedKillstreakDemoCapture(repositoryRoot, receipt);
    console.log(JSON.stringify({
      status: 'validated-clean-source-capture',
      gitHead: validated.receipt.gitHead,
      servedRuntimeTreeSha256: validated.receipt.servedRuntimeTreeSha256,
      sourceClosureSha256: validated.receipt.sourceClosureSha256,
      mediaCount: validated.staged.length,
    }, null, 2));
    return;
  }
  if (process.argv.includes('--verify-only')) {
    const verified = await verifyFinalizedKillstreakDemoMedia(repositoryRoot);
    console.log(JSON.stringify({ status: 'verified-real-test-bay-videos', ...verified }, null, 2));
    return;
  }
  const result = await finalizeKillstreakDemoMedia(repositoryRoot, receipt);
  console.log(JSON.stringify({ status: 'finalized-real-test-bay-videos', ...result }, null, 2));
}

if (invokedPath === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
