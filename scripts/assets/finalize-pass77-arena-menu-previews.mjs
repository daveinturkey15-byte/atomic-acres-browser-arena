/**
 * finalize-pass77-arena-menu-previews.mjs — HF-372.
 *
 * Farcrysis and High Seas shipped with no menu preview at all: their map cards
 * fell back to a "PREVIEW STANDBY" placeholder, and because the deployment
 * loading surface reuses the selected arena's preview poster and video element,
 * their loading screen was a black rectangle with a progress bar on it. That is
 * the whole of the owner's HF-372 complaint.
 *
 * This finalizer deliberately does NOT re-open the Pass 66 four-arena family.
 * That family's cache key is bound, byte for byte, to a lock record covering all
 * twelve accepted runtime files, and reopening it would mean re-rendering four
 * owner-approved previews to add two new ones. Instead the two new arenas get
 * their own additive family beside it, using the same staged frames, the same
 * encoding profiles, the same budgets and the same runtime file layout, so the
 * menu cannot tell the difference and the accepted bytes never move.
 *
 * Inputs are the frames staged by scripts/assets/generate-pass65-runtime-menu-previews.ts
 * (the authoritative-runtime capture path) plus that run's receipt. Everything it
 * asserts is recomputed here rather than trusted: the frame roster, the frame-set
 * digest, the camera/backend evidence, the encoded structure and every budget.
 *
 *   node scripts/assets/finalize-pass77-arena-menu-previews.mjs
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { digestOrderedFileSet, orderedFrameNames } from './pass65-menu-preview-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frameRoot = path.join(root, 'artifacts/pass65/menu-preview-master-frames');
const captureRoot = path.join(root, 'artifacts/pass77/capture');
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');
const reviewRoot = path.join(root, 'docs/assets/pass77-menu-previews');
const provenanceRoot = path.join(root, 'source-assets/menu/pass77-arena-previews');
const manifestPath = path.join(root, 'assets.manifest.json');

const MASTERS = JSON.parse(await readFile(path.join(root, 'source-assets/menu/pass65-preview-masters/choreography.json'), 'utf8'));
const EXTENSIONS = Object.freeze({
  farcrysis: JSON.parse(await readFile(path.join(root, 'source-assets/menu/pass77-farcrysis-preview/choreography.json'), 'utf8')),
  'high-seas': JSON.parse(await readFile(path.join(root, 'source-assets/menu/pass75-high-seas-preview/choreography.json'), 'utf8')),
});
/** Display order, matching ARENA_SELECTIONS: farcrysis is fifth, high-seas sixth. */
const ARENAS = Object.freeze(['farcrysis', 'high-seas']);
const CACHE_KEY = 'pass77-arena-preview-v1';

const slash = (value) => value.split(path.sep).join('/');
const relative = (value) => slash(path.relative(root, value));
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const rate = (value) => `${value}k`;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result;
}

function ffmpegSupportsEncoder(encoder) {
  const escaped = encoder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*\\S+\\s+${escaped}\\s`, 'm').test(run('ffmpeg', ['-hide_banner', '-encoders']).stdout);
}

/** Same quiet beds as the retained family so the two new cards do not stand out. */
function audioSource(kind) {
  const duration = MASTERS.durationSeconds;
  return kind === 'helicopter'
    ? `aevalsrc=0.015*(1+0.28*sin(2*PI*8*t))*sin(2*PI*43*t)+0.006*sin(2*PI*86*t)+0.003*sin(2*PI*4*t):s=48000:d=${duration}`
    : `aevalsrc=0.005*sin(2*PI*63*t)+0.0025*sin(2*PI*126*t)+0.0015*sin(2*PI*252*t):s=48000:d=${duration}`;
}

function probeMedia(file) {
  const result = run('ffprobe', [
    '-v', 'error', '-count_frames',
    '-show_entries', 'format=duration,size,bit_rate:stream=index,codec_type,codec_name,codec_tag_string,profile,pix_fmt,width,height,r_frame_rate,nb_read_frames',
    '-of', 'json', file,
  ]);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`ffprobe returned invalid JSON for ${relative(file)}: ${error.message}`);
  }
}

/**
 * The receipt is evidence, not decoration: every claim it makes about the
 * capture is re-derived from the frames on disk before a single byte is encoded.
 */
async function verifiedCapture(arena) {
  const receiptPath = path.join(captureRoot, `receipt-${arena}.json`);
  if (!existsSync(receiptPath)) throw new Error(`Missing capture receipt for ${arena}: ${relative(receiptPath)}`);
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const evidence = receipt.arenas?.find((entry) => entry.arenaId === arena);
  if (!evidence) throw new Error(`Capture receipt for ${arena} does not describe that arena`);
  if (receipt.recipeId !== MASTERS.recipeId) throw new Error(`${arena} capture used recipe ${receipt.recipeId}, expected ${MASTERS.recipeId}`);
  if (receipt.source !== 'authoritative-runtime-arena') throw new Error(`${arena} capture is not from the authoritative runtime arena`);
  if (receipt.viewport[0] !== MASTERS.capture.viewport[0] || receipt.viewport[1] !== MASTERS.capture.viewport[1]) {
    throw new Error(`${arena} capture viewport drifted from the canonical ${MASTERS.capture.viewport.join('x')}`);
  }
  if (evidence.capturedFrames !== MASTERS.frameCount) throw new Error(`${arena} staged ${evidence.capturedFrames} frames, expected ${MASTERS.frameCount}`);
  if (evidence.residentArenaRoots !== 1) throw new Error(`${arena} capture did not hold exactly one resident arena root`);
  if (evidence.constructionHistory[0] !== arena) throw new Error(`${arena} capture constructed ${evidence.constructionHistory[0]} first`);
  if (evidence.softwareAdapter !== false) throw new Error(`${arena} capture ran on a software adapter`);
  if (evidence.viewmodelHidden !== true) throw new Error(`${arena} capture leaked the first-person viewmodel`);
  if (evidence.backend !== 'webgpu' && !receipt.compatReason) {
    throw new Error(`${arena} captured on ${evidence.backend} without a declared compat reason`);
  }
  for (const review of evidence.reviewFrames) {
    if (review.aboveArenaFloor !== true || review.insideHorizontalCollider !== false) {
      throw new Error(`${arena} review frame ${review.frame} violates the camera safe volume`);
    }
  }
  // Recompute the frame-set digest rather than trusting the receipt's copy.
  const staged = await digestOrderedFileSet(path.join(frameRoot, arena), orderedFrameNames(MASTERS.frameCount), `menu-preview-frames:${arena}`);
  if (staged.sha256 !== evidence.frameSet.sha256) {
    throw new Error(`${arena} staged frames drifted from the capture receipt: ${staged.sha256} != ${evidence.frameSet.sha256}`);
  }
  return { receipt, evidence, staged };
}

function transcode(arena, kind, posterFrame, outputRoot) {
  const input = path.join(frameRoot, arena, 'frame-%04d.png');
  const mp4Profile = MASTERS.media.encodingProfiles.mp4;
  const webmProfile = MASTERS.media.encodingProfiles.webm;
  const images = MASTERS.media.encodingProfiles.images;
  const colour = MASTERS.media.encodingProfiles.colour;
  const webmAudioEncoder = webmProfile.audioCodec === 'opus' && ffmpegSupportsEncoder('libopus') ? 'libopus' : webmProfile.audioCodec;
  const common = [
    '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(MASTERS.fps),
    '-start_number', '1', '-i', input, '-f', 'lavfi', '-i', audioSource(kind),
    '-fflags', '+bitexact', '-map_metadata', '-1', '-map', '0:v:0', '-map', '1:a:0',
    '-t', String(MASTERS.durationSeconds),
  ];
  const colourArgs = [
    '-pix_fmt', colour.pixelFormat,
    '-color_primaries', colour.primaries,
    '-color_trc', colour.transfer,
    '-colorspace', colour.space,
    '-color_range', colour.range,
  ];
  run('ffmpeg', [
    ...common,
    '-c:v', mp4Profile.encoder, '-preset', 'slow',
    '-profile:v', mp4Profile.profile, '-level:v', mp4Profile.level, '-tag:v', mp4Profile.codecTag,
    '-b:v', rate(mp4Profile.targetVideoBitrateKbps),
    '-minrate', rate(mp4Profile.minimumVideoBitrateKbps),
    '-maxrate', rate(mp4Profile.maximumVideoBitrateKbps),
    '-bufsize', rate(mp4Profile.bufferSizeKbps),
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    // Single-threaded video and audio: multi-threaded x264/AAC output on this
    // host depends on the OS scheduler, which made a "deterministic" recipe
    // produce different bytes run to run. The retained family learned this the
    // hard way; the new family inherits the fix rather than the lesson.
    '-threads:v', '1',
    '-x264-params', 'threads=1:lookahead_threads=1:sliced_threads=0:nal-hrd=vbr:force-cfr=1:colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited',
    '-flags:v', '+bitexact',
    ...colourArgs,
    '-movflags', '+faststart',
    '-c:a', mp4Profile.audioCodec, '-threads:a', '1', '-flags:a', '+bitexact', '-b:a', rate(mp4Profile.audioBitrateKbps),
    path.join(outputRoot, `${arena}.mp4`),
  ]);
  run('ffmpeg', [
    ...common,
    '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', webmProfile.encoder, '-profile:v', String(webmProfile.profile), '-crf', String(webmProfile.crf),
    '-b:v', rate(webmProfile.targetVideoBitrateKbps),
    '-minrate', rate(webmProfile.minimumVideoBitrateKbps),
    '-maxrate', rate(webmProfile.maximumVideoBitrateKbps),
    '-bufsize', rate(webmProfile.bufferSizeKbps),
    '-g', '60', '-row-mt', '1', '-deadline', 'good', '-cpu-used', String(webmProfile.cpuUsed),
    '-flags:v', '+bitexact',
    ...colourArgs,
    '-c:a', webmAudioEncoder, ...(webmAudioEncoder === 'opus' ? ['-strict', '-2'] : []),
    '-flags:a', '+bitexact', '-b:a', rate(webmProfile.audioBitrateKbps),
    path.join(outputRoot, `${arena}.webm`),
  ]);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact',
    '-i', path.join(frameRoot, arena, `frame-${String(posterFrame).padStart(4, '0')}.png`),
    '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(images.posterQuality),
    path.join(outputRoot, `${arena}.webp`),
  ]);
}

function createReviewSheet(arena, outputRoot) {
  const images = MASTERS.media.encodingProfiles.images;
  const inputs = MASTERS.reviewFrames.flatMap((frame) => ['-i', path.join(frameRoot, arena, `frame-${String(frame).padStart(4, '0')}.png`)]);
  const scales = MASTERS.reviewFrames.map((_, index) => `[${index}:v]scale=${images.reviewFrameWidth}:${images.reviewFrameHeight}:flags=lanczos[r${index}]`).join(';');
  const labels = MASTERS.reviewFrames.map((_, index) => `[r${index}]`).join('');
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', ...inputs,
    '-filter_complex', `${scales};${labels}hstack=inputs=${MASTERS.reviewFrames.length}[review]`,
    '-map', '[review]', '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(images.reviewQuality),
    path.join(outputRoot, `${arena}-review-frames.webp`),
  ]);
}

/** Staged output is probed before anything is allowed near public/. */
function assertEncodedContract(arena, stagingRoot) {
  const budget = MASTERS.media.encodingBudget;
  const [width, height] = MASTERS.capture.viewport;
  const failures = [];
  for (const [extension, expectedCodec] of [['mp4', 'h264'], ['webm', 'vp9']]) {
    const file = path.join(stagingRoot, `${arena}.${extension}`);
    const probe = probeMedia(file);
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    const audio = probe.streams.find((stream) => stream.codec_type === 'audio');
    const sizeBytes = Number(probe.format.size);
    const averageKbps = Number(probe.format.bit_rate) / 1000;
    if (video?.codec_name !== expectedCodec) failures.push(`${arena}.${extension} codec is ${video?.codec_name}, expected ${expectedCodec}`);
    if (video?.width !== width || video?.height !== height) failures.push(`${arena}.${extension} is ${video?.width}x${video?.height}, expected ${width}x${height}`);
    if (Number(video?.nb_read_frames) !== MASTERS.frameCount) failures.push(`${arena}.${extension} holds ${video?.nb_read_frames} frames, expected ${MASTERS.frameCount}`);
    if (video?.pix_fmt !== MASTERS.media.encodingProfiles.colour.pixelFormat) failures.push(`${arena}.${extension} pixel format is ${video?.pix_fmt}`);
    if (!audio) failures.push(`${arena}.${extension} has no audio bed`);
    if (Math.abs(Number(probe.format.duration) - MASTERS.durationSeconds) > 0.12) failures.push(`${arena}.${extension} runs ${probe.format.duration}s, expected ${MASTERS.durationSeconds}s`);
    if (sizeBytes > budget.maximumBytesPerVideo) failures.push(`${arena}.${extension} is ${sizeBytes} bytes, over the ${budget.maximumBytesPerVideo} budget`);
    if (averageKbps < budget.minimumAverageBitrateKbps || averageKbps > budget.maximumAverageBitrateKbps) {
      failures.push(`${arena}.${extension} averages ${averageKbps.toFixed(0)} kbps, outside ${budget.minimumAverageBitrateKbps}-${budget.maximumAverageBitrateKbps}`);
    }
    if (extension === 'mp4' && video?.codec_tag_string !== MASTERS.media.encodingProfiles.mp4.codecTag) {
      failures.push(`${arena}.mp4 sample entry is ${video?.codec_tag_string}, expected ${MASTERS.media.encodingProfiles.mp4.codecTag}`);
    }
  }
  const posterProbe = probeMedia(path.join(stagingRoot, `${arena}.webp`));
  const posterImage = posterProbe.streams.find((stream) => stream.codec_type === 'video');
  const posterBytes = Number(posterProbe.format.size);
  if (posterImage?.codec_name !== 'webp') failures.push(`${arena}.webp is not a WebP`);
  if (posterImage?.width !== width || posterImage?.height !== height) failures.push(`${arena}.webp is ${posterImage?.width}x${posterImage?.height}, expected full resolution`);
  if (posterBytes > budget.maximumPosterBytes) failures.push(`${arena}.webp is ${posterBytes} bytes, over the ${budget.maximumPosterBytes} budget`);
  if (failures.length > 0) throw new Error(`Pass 77 encoded contract failed:\n- ${failures.join('\n- ')}`);
}

async function main() {
  const captures = new Map();
  for (const arena of ARENAS) captures.set(arena, await verifiedCapture(arena));

  const staging = await mkdtemp(path.join(os.tmpdir(), 'aa-pass77-menu-'));
  const stagingReview = path.join(staging, 'review');
  await mkdir(stagingReview, { recursive: true });
  const files = [];
  try {
    for (const arena of ARENAS) {
      const recipe = EXTENSIONS[arena].arenas[arena];
      transcode(arena, recipe.kind, recipe.posterFrame, staging);
      createReviewSheet(arena, stagingReview);
      assertEncodedContract(arena, staging);
    }
    await mkdir(runtimeRoot, { recursive: true });
    await mkdir(reviewRoot, { recursive: true });
    for (const arena of ARENAS) {
      for (const extension of ['mp4', 'webm', 'webp']) {
        await copyFile(path.join(staging, `${arena}.${extension}`), path.join(runtimeRoot, `${arena}.${extension}`));
      }
      await copyFile(path.join(stagingReview, `${arena}-review-frames.webp`), path.join(reviewRoot, `${arena}-review-frames.webp`));
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  for (const arena of ARENAS) {
    const recipe = EXTENSIONS[arena].arenas[arena];
    const { receipt, evidence, staged } = captures.get(arena);
    const runtimeFiles = [];
    for (const extension of ['mp4', 'webm', 'webp']) {
      const file = path.join(runtimeRoot, `${arena}.${extension}`);
      runtimeFiles.push({ path: relative(file), sha256: await sha256(file) });
    }
    const reviewSheet = path.join(reviewRoot, `${arena}-review-frames.webp`);
    files.push({
      arenaId: arena,
      recipeId: EXTENSIONS[arena].recipeId,
      presentationId: recipe.presentationId,
      kind: recipe.kind,
      posterFrame: recipe.posterFrame,
      capture: {
        source: receipt.source,
        backendRequired: receipt.backendRequired,
        backendUsed: evidence.backend,
        softwareAdapter: evidence.softwareAdapter,
        // Carried forward verbatim: a compat capture and a capture taken while
        // the source tree was moving both have to stay legible downstream.
        compatReason: receipt.compatReason ?? null,
        inputsStable: receipt.inputsStable ?? null,
        driftedInputPaths: receipt.driftedInputPaths ?? [],
        capturedFrames: evidence.capturedFrames,
        frameSetSha256: staged.sha256,
        frameSetBytes: staged.totalBytes,
      },
      runtimeFiles,
      reviewSheet: { path: relative(reviewSheet), sha256: await sha256(reviewSheet) },
    });
  }

  const finalMedia = await digestOrderedFileSet(runtimeRoot, ARENAS.flatMap((arena) => ['mp4', 'webm', 'webp'].map((extension) => `${arena}.${extension}`)), 'menu-preview-final-media');
  const provenance = {
    schemaVersion: 1,
    familyId: 'pass77-farcrysis-high-seas-menu-previews',
    cacheKey: CACHE_KEY,
    generatedAt: new Date().toISOString().slice(0, 10),
    inheritsMotionContract: MASTERS.recipeId,
    note: 'Additive family for the two arenas added after the Pass 66 four-arena capture. The retained pass66-runtime-preview-v15 media and its cache-family lock are untouched by this finalizer.',
    finalMediaSet: { algorithm: finalMedia.algorithm, fileCount: finalMedia.fileCount, totalBytes: finalMedia.totalBytes, sha256: finalMedia.sha256 },
    finalizer: { path: relative(fileURLToPath(import.meta.url)), sha256: await sha256(fileURLToPath(import.meta.url)) },
    generator: { path: 'scripts/assets/generate-pass65-runtime-menu-previews.ts', sha256: await sha256(path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts')) },
    arenas: files,
  };
  await mkdir(provenanceRoot, { recursive: true });
  await writeFile(path.join(provenanceRoot, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

  // assets.manifest.json is the provenance gate's index of every public byte.
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const retained = manifest.assets.find((asset) => asset.id === 'atomic-acres-pass65-prerecorded-menu-previews-2026-07-26');
  if (!retained) throw new Error('Retained Pass 65 menu preview manifest entry is missing');
  // The retained entry used to claim public/assets/original/menu-previews/* —
  // a wildcard that would silently absorb these two new arenas and attribute
  // them to a capture they were not part of. Naming its twelve files with their
  // digests is both stricter (the gate now verifies each retained byte) and
  // honest about which recipe produced what.
  const retainedFiles = [];
  for (const arena of ['atomic-acres', 'gun-range', 'rustworks-1v1', 'skyline-terminal']) {
    for (const extension of ['mp4', 'webm', 'webp']) {
      const file = path.join(runtimeRoot, `${arena}.${extension}`);
      retainedFiles.push({ path: relative(file), sha256: await sha256(file) });
    }
  }
  retained.files = retainedFiles;
  retained.sourceScriptSha256 = provenance.generator.sha256;

  const entryId = 'atomic-acres-pass77-farcrysis-high-seas-menu-previews';
  const entry = {
    id: entryId,
    kind: 'original-project-prerecorded-authoritative-runtime-menu-video-family',
    creator: 'Atomic Acres project',
    source: 'scripts/assets/generate-pass65-runtime-menu-previews.ts',
    generatedAsOf: provenance.generatedAt,
    license: 'Original project work',
    files: files.flatMap((arena) => arena.runtimeFiles.map((file) => ({ path: file.path, sha256: file.sha256 }))),
    contactSheet: files.map((arena) => arena.reviewSheet.path),
    sourceScript: 'scripts/assets/finalize-pass77-arena-menu-previews.mjs',
    sourceScriptSha256: provenance.finalizer.sha256,
    sourceProvenance: 'source-assets/menu/pass77-arena-previews/provenance.json',
    format: `Two distinct ${MASTERS.capture.viewport.join('x')} eight-second 30 FPS selected-map runtime captures, shipped as VP9/Opus WebM, H.264 High Level 5.0/AAC MP4 and full-resolution static WebP posters, plus five-frame review sheets`,
    modifications: `Captured offline from the actual authoritative Farcrysis and High Seas runtime arenas with the deterministic Pass 66 camera recipe, visual time and baked cockpit overlay, then encoded with the Pass 66 profiles and budgets. High Seas was captured on the WebGPU route; Farcrysis was captured on the WebGL2 compat route because it cannot currently complete a WebGPU prewarm (HF-374), which its provenance records and which requires a WebGPU re-capture once that is fixed. No downloaded or sampled art is used.`,
    attributionRequired: false,
  };
  const existingIndex = manifest.assets.findIndex((asset) => asset.id === entryId);
  if (existingIndex >= 0) manifest.assets[existingIndex] = entry;
  else manifest.assets.push(entry);
  // The contact sheets live under docs/, which the public-asset gate does not
  // scan; keep them declared anyway so a reader can find the review evidence.
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    finalize: 'passed',
    cacheKey: CACHE_KEY,
    arenas: files.map((arena) => ({
      arenaId: arena.arenaId,
      backendUsed: arena.capture.backendUsed,
      inputsStable: arena.capture.inputsStable,
      bytes: arena.runtimeFiles.map((file) => file.path),
    })),
    finalMediaSet: provenance.finalMediaSet,
  }, null, 2));
}

await main();
