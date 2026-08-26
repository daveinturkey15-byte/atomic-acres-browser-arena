import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RATIO,
  KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RUN,
} from '../../src/killstreak-demo-capture-contract';

const MOTION_PROBE_WIDTH = 96;
const MOTION_PROBE_HEIGHT = 54;
const NEAR_DUPLICATE_MEAN_LUMA_DELTA = 0.8;
const NEAR_DUPLICATE_CHANGED_PIXEL_RATIO = 0.015;

export type KillstreakDemoVideoProbe = Readonly<{
  codec: 'h264';
  profile: 'High';
  container: 'mp4';
  pixelFormat: 'yuv420p';
  fastStart: true;
  width: number;
  height: number;
  durationMs: number;
  frameCount: number;
  sampleFrameSha256: readonly [string, string, string];
  motionFrameCount: number;
  nearDuplicateFrameCount: number;
  nearDuplicateFrameRatio: number;
  longestNearDuplicateRun: number;
  hasAudio: boolean;
}>;

export type KillstreakDemoVideoProbeFn = (path: string) => Promise<KillstreakDemoVideoProbe>;

type FfprobeOutput = Readonly<{
  streams?: readonly Readonly<{
    codec_type?: string;
    codec_name?: string;
    profile?: string;
    pix_fmt?: string;
    width?: number;
    height?: number;
    nb_read_frames?: string;
  }>[];
  format?: Readonly<{ format_name?: string; duration?: string }>;
}>;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function topLevelMp4Atoms(bytes: Buffer): readonly string[] {
  const atoms: string[] = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > bytes.length) throw new Error('capture MP4 has a truncated extended atom header');
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('capture MP4 atom is too large');
      size = Number(extended);
      headerSize = 16;
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) throw new Error('capture MP4 has an invalid top-level atom');
    atoms.push(type);
    offset += size;
    if (size32 === 0) break;
  }
  if (offset !== bytes.length) throw new Error('capture MP4 has trailing bytes outside top-level atoms');
  return Object.freeze(atoms);
}

export function assertKillstreakDemoMp4Envelope(bytes: Buffer): void {
  if (bytes.length < 50_000 || bytes.length > 3_000_000) throw new Error('capture MP4 is outside the compact media budget');
  const atoms = topLevelMp4Atoms(bytes);
  if (atoms[0] !== 'ftyp') throw new Error('capture is not an ISO BMFF/MP4 file');
  const moovIndex = atoms.indexOf('moov');
  const mdatIndex = atoms.indexOf('mdat');
  if (moovIndex < 0 || mdatIndex < 0) throw new Error('capture MP4 is incomplete');
  if (moovIndex > mdatIndex) throw new Error('capture MP4 is not fast-start; moov follows mdat');
}

export function analyzeKillstreakDemoDecodedCadence(
  frames: Buffer,
  frameCount: number,
  width = MOTION_PROBE_WIDTH,
  height = MOTION_PROBE_HEIGHT,
): Readonly<{
  motionFrameCount: number;
  nearDuplicateFrameCount: number;
  nearDuplicateFrameRatio: number;
  longestNearDuplicateRun: number;
}> {
  const frameSize = width * height;
  if (!Number.isSafeInteger(frameCount) || frameCount < 2 || width < 8 || height < 8
    || frames.length !== frameSize * frameCount) {
    throw new Error('decoded cadence probe has an invalid frame envelope');
  }
  let nearDuplicateFrameCount = 0;
  let longestNearDuplicateRun = 0;
  let currentNearDuplicateRun = 0;
  for (let frameIndex = 1; frameIndex < frameCount; frameIndex += 1) {
    const previousOffset = (frameIndex - 1) * frameSize;
    const currentOffset = frameIndex * frameSize;
    let absoluteDelta = 0;
    let changedPixels = 0;
    for (let pixel = 0; pixel < frameSize; pixel += 1) {
      const delta = Math.abs(frames[previousOffset + pixel]! - frames[currentOffset + pixel]!);
      absoluteDelta += delta;
      if (delta > 2) changedPixels += 1;
    }
    const meanDelta = absoluteDelta / frameSize;
    const changedRatio = changedPixels / frameSize;
    const nearDuplicate = meanDelta <= NEAR_DUPLICATE_MEAN_LUMA_DELTA
      && changedRatio <= NEAR_DUPLICATE_CHANGED_PIXEL_RATIO;
    if (nearDuplicate) {
      nearDuplicateFrameCount += 1;
      currentNearDuplicateRun += 1;
      longestNearDuplicateRun = Math.max(longestNearDuplicateRun, currentNearDuplicateRun);
    } else currentNearDuplicateRun = 0;
  }
  const transitions = frameCount - 1;
  return Object.freeze({
    motionFrameCount: transitions - nearDuplicateFrameCount,
    nearDuplicateFrameCount,
    nearDuplicateFrameRatio: Number((nearDuplicateFrameCount / transitions).toFixed(6)),
    longestNearDuplicateRun,
  });
}

export async function probeH264Mp4(path: string): Promise<KillstreakDemoVideoProbe> {
  const output = execFileSync('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,profile,pix_fmt,width,height,nb_read_frames',
    '-of', 'json',
    path,
  ], { encoding: 'utf8', windowsHide: true });
  const parsed = JSON.parse(output) as FfprobeOutput;
  const streams = parsed.streams ?? [];
  const videoStreams = streams.filter((stream) => stream.codec_type === 'video');
  const audioStreams = streams.filter((stream) => stream.codec_type === 'audio');
  const video = videoStreams[0];
  const formatNames = new Set((parsed.format?.format_name ?? '').split(','));
  const durationMs = Math.round(Number(parsed.format?.duration ?? Number.NaN) * 1_000);
  const frameCount = Number(video?.nb_read_frames ?? Number.NaN);
  if (videoStreams.length !== 1 || !video || video.codec_name !== 'h264' || video.profile !== 'High'
    || video.pix_fmt !== 'yuv420p' || !formatNames.has('mp4')
    || !Number.isFinite(durationMs) || !Number.isSafeInteger(frameCount)) {
    throw new Error(`video is not one bounded H.264 High/yuv420p MP4 stream: ${path}`);
  }
  assertKillstreakDemoMp4Envelope(await readFile(path));
  const sampleFrameSha256 = [0.15, 0.5, 0.85].map((fraction) => {
    const frame = execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', (durationMs / 1_000 * fraction).toFixed(3),
      '-i', path,
      '-vf', 'scale=160:90:flags=area,format=gray',
      '-frames:v', '1',
      '-f', 'rawvideo',
      'pipe:1',
    ], { windowsHide: true, maxBuffer: 1_000_000 }) as Buffer;
    if (frame.length !== 160 * 90) throw new Error(`decoded sample frame has invalid byte length: ${path}`);
    return sha256(frame);
  }) as [string, string, string];
  if (new Set(sampleFrameSha256).size < 2) throw new Error(`video is frozen across decoded samples: ${path}`);
  const decodedMotionFrames = execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', path,
    '-vf', `scale=${MOTION_PROBE_WIDTH}:${MOTION_PROBE_HEIGHT}:flags=area,format=gray`,
    '-vsync', '0',
    '-f', 'rawvideo',
    'pipe:1',
  ], { windowsHide: true, maxBuffer: frameCount * MOTION_PROBE_WIDTH * MOTION_PROBE_HEIGHT + 1_000_000 }) as Buffer;
  const cadence = analyzeKillstreakDemoDecodedCadence(decodedMotionFrames, frameCount);
  if (cadence.nearDuplicateFrameRatio > KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RATIO
    || cadence.longestNearDuplicateRun > KILLSTREAK_DEMO_MAXIMUM_NEAR_DUPLICATE_RUN) {
    throw new Error(`video cadence is padded with duplicate frames: ${path}`);
  }
  return Object.freeze({
    codec: 'h264',
    profile: 'High',
    container: 'mp4',
    pixelFormat: 'yuv420p',
    fastStart: true,
    width: video.width ?? 0,
    height: video.height ?? 0,
    durationMs,
    frameCount,
    sampleFrameSha256: Object.freeze(sampleFrameSha256),
    ...cadence,
    hasAudio: audioStreams.length > 0,
  });
}

export function sameKillstreakDemoVideoProbe(
  left: KillstreakDemoVideoProbe,
  right: KillstreakDemoVideoProbe,
): boolean {
  return left.codec === right.codec
    && left.profile === right.profile
    && left.container === right.container
    && left.pixelFormat === right.pixelFormat
    && left.fastStart === right.fastStart
    && left.width === right.width
    && left.height === right.height
    && Math.abs(left.durationMs - right.durationMs) <= 2
    && left.frameCount === right.frameCount
    && left.sampleFrameSha256.join('\n') === right.sampleFrameSha256.join('\n')
    && left.motionFrameCount === right.motionFrameCount
    && left.nearDuplicateFrameCount === right.nearDuplicateFrameCount
    && left.nearDuplicateFrameRatio === right.nearDuplicateFrameRatio
    && left.longestNearDuplicateRun === right.longestNearDuplicateRun
    && left.hasAudio === right.hasAudio;
}
