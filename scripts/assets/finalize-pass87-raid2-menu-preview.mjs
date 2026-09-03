/**
 * finalize-pass87-raid2-menu-preview.mjs — RAID2, owner 2026-09-02 (HF-408).
 *
 * Raid Rebuild (`raid2`) was registered as a selectable arena in this lane with NO
 * menu preview media, so its card rendered the labelled PREVIEW STANDBY
 * placeholder - the ONE item the do-not-repeat list in the lane brief named
 * explicitly, and an entry in a MEDIA_PENDING_ARENAS set whose own comment said
 * "It is empty, and should stay empty". This finalizer closes that: it encodes
 * Raid Rebuild's own flyover from Raid Rebuild's own authoritative runtime
 * capture.
 *
 * It is the FIFTH additive family, built to the pattern
 * finalize-pass77-arena-menu-previews.mjs established and
 * finalize-pass79-test-arena-menu-previews.mjs and finalize-pass84-map3-menu-preview.mjs repeated, for the same reason
 * both of those exist: the retained Pass 66 four-arena family is bound byte for
 * byte to a cache-family lock, and reopening it would mean re-rendering four
 * owner-approved previews to add one new one. So Raid Rebuild gets its own family
 * beside it, using the same staged frames, the SAME encoding profiles read out
 * of the retained masters choreography, the same budgets and the same runtime
 * file layout.
 *
 * Nothing here invents an encoder setting. Every codec, bitrate, GOP, colour and
 * threading flag is read from
 * source-assets/menu/pass65-preview-masters/choreography.json, which is what the
 * shipped eight arenas were encoded with, so the new files are members of the
 * same shipped set rather than lookalikes of it.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. The failure being avoided is not
 * hypothetical and not old: on 2026-08-30 Test1 and Test2 shipped menu previews
 * that were byte-identical copies of the gun-range and high-seas media, so
 * hovering Test1 in the live menu played the Gun Range flyover. The reason that
 * happened is recorded in generate-pass65-runtime-menu-previews.ts: the two
 * arenas reached ARENA_SELECTIONS but never reached that tool's choreography
 * merge, so its roster assertion rejected EVERY capture and a placeholder was
 * dropped in instead. raid2 was added to that merge in the same commit as this
 * file, and `assertDistinctFromEveryOtherArena` below asserts the defect is
 * absent on the exact bytes this script just wrote - against all NINE other
 * arenas, this time including Map 3.
 *
 * Inputs are the frames staged by scripts/assets/generate-pass65-runtime-menu-previews.ts
 * plus that run's receipt. Everything the receipt claims is re-derived here from
 * the frames on disk before a byte is encoded, and every encoded file is probed
 * against the inherited budget before it is allowed near public/.
 *
 *   AA_PREVIEW_REVIEW_ONLY=1 AA_PREVIEW_ARENAS=raid2 npx tsx scripts/assets/generate-pass65-runtime-menu-previews.ts
 *   node scripts/assets/finalize-pass87-raid2-menu-preview.mjs
 *
 * AA_PASS87_RECEIPT overrides the capture receipt path.
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
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');
const reviewRoot = path.join(root, 'docs/assets/pass87-menu-previews');
const provenanceRoot = path.join(root, 'source-assets/menu/pass87-raid2-preview');
const manifestPath = path.join(root, 'assets.manifest.json');

/**
 * The capture receipt.
 *
 * The generator has exactly ONE canonical receipt slot,
 * source-assets/menu/pass65-preview-masters/runtime-capture-receipt.json, and
 * that slot belongs to the retained Pass 66 family:
 * verify-pass65-menu-preview-production.mjs pins its digest AND asserts its
 * arena roster is exactly the retained four. A raid2 capture written there would
 * take the retained gate red, so this capture is run with
 * AA_PREVIEW_REVIEW_ONLY=1 and its receipt lands on the review path instead.
 * That is a receipt-ROUTING constraint, not a quality one: the capture itself
 * ran the canonical recipe on the canonical WebGPU backend at the canonical
 * 2560x1440, which is re-derived below rather than taken on trust.
 */
const RECEIPT_PATH = path.join(root, process.env.AA_PASS87_RECEIPT
  ?? 'artifacts/pass65/menu-preview-rotor-review/runtime-capture-receipt.json');

const MASTERS = JSON.parse(await readFile(path.join(root, 'source-assets/menu/pass65-preview-masters/choreography.json'), 'utf8'));
const EXTENSION = JSON.parse(await readFile(path.join(provenanceRoot, 'choreography.json'), 'utf8'));
/** Display order, matching ARENA_SELECTIONS: raid2 is tenth and last. */
const ARENAS = Object.freeze(['raid2']);
const FAMILY_ID = 'pass87-raid2-menu-preview';
const CACHE_KEY = 'pass87-raid2-preview-v1';
/** The arenas the retained Pass 66 capture covers; this family must not touch them. */
const RETAINED_ARENAS = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']);
const PASS77_ARENAS = Object.freeze(['farcrysis', 'high-seas']);
const PASS79_ARENAS = Object.freeze(['test1', 'test2']);
const PASS84_ARENAS = Object.freeze(['map3']);

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

/** Same quiet beds as the retained, pass77 and pass79 families so no card stands out. */
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

/** The additive-family contract: this family must not reopen accepted history. */
function assertAdditive() {
  const retained = Object.keys(MASTERS.arenas ?? {});
  if (retained.join(',') !== RETAINED_ARENAS.join(',')) {
    throw new Error(`Retained Pass 66 masters choreography must still describe exactly its four captured arenas, found: ${retained.join(',')}`);
  }
  if (Object.keys(EXTENSION.arenas ?? {}).join(',') !== ARENAS.join(',')) {
    throw new Error(`pass87 extension choreography must describe exactly ${ARENAS.join(',')} in that order`);
  }
  if (EXTENSION.inheritsMotionContract !== MASTERS.recipeId) {
    throw new Error('pass87 extension recipe does not inherit the Pass 66 motion contract');
  }
  for (const arena of ARENAS) {
    if (RETAINED_ARENAS.includes(arena) || PASS77_ARENAS.includes(arena)
      || PASS79_ARENAS.includes(arena) || PASS84_ARENAS.includes(arena)) {
      throw new Error(`${arena} already belongs to another preview family`);
    }
  }
}

/**
 * The receipt is evidence, not decoration: every claim it makes about the
 * capture is re-derived from the frames on disk before a single byte is encoded.
 */
async function verifiedCapture(receipt, arena) {
  const evidence = receipt.arenas?.find((entry) => entry.arenaId === arena);
  if (!evidence) throw new Error(`Capture receipt ${relative(RECEIPT_PATH)} does not describe ${arena}`);
  if (receipt.recipeId !== MASTERS.recipeId) throw new Error(`${arena} capture used recipe ${receipt.recipeId}, expected ${MASTERS.recipeId}`);
  if (receipt.source !== 'authoritative-runtime-arena') throw new Error(`${arena} capture is not from the authoritative runtime arena`);
  if (receipt.viewport[0] !== MASTERS.capture.viewport[0] || receipt.viewport[1] !== MASTERS.capture.viewport[1]) {
    throw new Error(`${arena} capture viewport drifted from the canonical ${MASTERS.capture.viewport.join('x')}`);
  }
  if (receipt.overlay?.mode !== 'offline-baked-minimal-graphite-green' || receipt.overlay?.liveLoadingRenderer !== false) {
    throw new Error(`${arena} capture does not prove the canonical offline baked overlay`);
  }
  if (evidence.capturedFrames !== MASTERS.frameCount) throw new Error(`${arena} staged ${evidence.capturedFrames} frames, expected ${MASTERS.frameCount}`);
  if (evidence.residentArenaRoots !== 1) throw new Error(`${arena} capture did not hold exactly one resident arena root`);
  if (evidence.constructionHistory[0] !== arena) throw new Error(`${arena} capture constructed ${evidence.constructionHistory[0]} first`);
  if (evidence.softwareAdapter !== false) throw new Error(`${arena} capture ran on a software adapter`);
  if (evidence.viewmodelHidden !== true) throw new Error(`${arena} capture leaked the first-person viewmodel`);
  // WebGPU is the canonical backend and Raid Rebuild is known-good on it (its
  // boot smoke runs there). A compat capture is not silently accepted here: it
  // must name itself.
  if (evidence.backend !== MASTERS.capture.backend && !receipt.compatReason) {
    throw new Error(`${arena} captured on ${evidence.backend} without a declared compat reason`);
  }
  for (const review of evidence.reviewFrames) {
    if (review.aboveArenaFloor !== true || review.insideHorizontalCollider !== false) {
      throw new Error(`${arena} review frame ${review.frame} violates the camera safe volume`);
    }
  }
  const firstReview = evidence.reviewFrames.find((entry) => entry.frame === 1);
  const seamReview = evidence.reviewFrames.find((entry) => entry.frame === MASTERS.frameCount);
  if (!firstReview || !seamReview || seamReview.seamSourceFrame !== 1 || seamReview.pngSha256 !== firstReview.pngSha256) {
    throw new Error(`${arena} does not prove an exact copied first/final loop seam`);
  }
  // Recompute the frame-set digest rather than trusting the receipt's copy.
  const staged = await digestOrderedFileSet(path.join(frameRoot, arena), orderedFrameNames(MASTERS.frameCount), `menu-preview-frames:${arena}`);
  if (staged.sha256 !== evidence.frameSet.sha256) {
    throw new Error(`${arena} staged frames drifted from the capture receipt: ${staged.sha256} != ${evidence.frameSet.sha256}`);
  }
  return { evidence, staged };
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
    // produce different bytes run to run. Inherited from the retained family.
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
  if (failures.length > 0) throw new Error(`Pass 84 encoded contract failed:\n- ${failures.join('\n- ')}`);
}

/**
 * The defect this family exists to prevent, asserted on the bytes it just wrote.
 * A preview that equals another arena's preview is the whole bug; catching it
 * here means a bad run never reaches the gate, let alone the owner.
 */
async function assertDistinctFromEveryOtherArena(installed) {
  const others = [...RETAINED_ARENAS, ...PASS77_ARENAS, ...PASS79_ARENAS, ...PASS84_ARENAS];
  const foreign = new Map();
  for (const arena of others) {
    for (const extension of ['mp4', 'webm', 'webp']) {
      const file = path.join(runtimeRoot, `${arena}.${extension}`);
      if (!existsSync(file)) continue;
      foreign.set(await sha256(file), `${arena}.${extension}`);
    }
  }
  const mine = new Map();
  for (const record of installed) {
    const owner = foreign.get(record.sha256) ?? mine.get(record.sha256);
    if (owner) throw new Error(`${record.path} is byte-identical to ${owner}; that is the placeholder defect this family exists to prevent`);
    mine.set(record.sha256, path.basename(record.path));
  }
}

async function main() {
  assertAdditive();
  if (!existsSync(RECEIPT_PATH)) throw new Error(`Missing capture receipt: ${relative(RECEIPT_PATH)}`);
  const receipt = JSON.parse(await readFile(RECEIPT_PATH, 'utf8'));
  const captures = new Map();
  for (const arena of ARENAS) captures.set(arena, await verifiedCapture(receipt, arena));

  const staging = await mkdtemp(path.join(os.tmpdir(), 'aa-pass87-menu-'));
  const stagingReview = path.join(staging, 'review');
  await mkdir(stagingReview, { recursive: true });
  try {
    for (const arena of ARENAS) {
      const recipe = EXTENSION.arenas[arena];
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

  const files = [];
  const installed = [];
  for (const arena of ARENAS) {
    const recipe = EXTENSION.arenas[arena];
    const { evidence, staged } = captures.get(arena);
    const runtimeFiles = [];
    for (const extension of ['mp4', 'webm', 'webp']) {
      const file = path.join(runtimeRoot, `${arena}.${extension}`);
      const record = { path: relative(file), sha256: await sha256(file) };
      runtimeFiles.push(record);
      installed.push(record);
    }
    const reviewSheet = path.join(reviewRoot, `${arena}-review-frames.webp`);
    files.push({
      arenaId: arena,
      recipeId: EXTENSION.recipeId,
      presentationId: recipe.presentationId,
      kind: recipe.kind,
      posterFrame: recipe.posterFrame,
      capture: {
        source: receipt.source,
        backendRequired: receipt.backendRequired,
        backendUsed: evidence.backend,
        softwareAdapter: evidence.softwareAdapter,
        compatReason: receipt.compatReason ?? null,
        // The receipt route, recorded so nobody has to guess why this family's
        // evidence is not in the canonical slot: that slot is the retained Pass
        // 66 family's, digest-pinned and roster-pinned to its own four arenas.
        receiptPath: relative(RECEIPT_PATH),
        // Carried forward verbatim: a capture taken while the source tree was
        // moving has to stay legible downstream. Several agents share this
        // machine, so this is routinely false and must not be hidden.
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
  await assertDistinctFromEveryOtherArena(installed);

  const finalMedia = await digestOrderedFileSet(runtimeRoot, ARENAS.flatMap((arena) => ['mp4', 'webm', 'webp'].map((extension) => `${arena}.${extension}`)), 'menu-preview-final-media');
  const provenance = {
    schemaVersion: 1,
    familyId: FAMILY_ID,
    cacheKey: CACHE_KEY,
    generatedAt: new Date().toISOString().slice(0, 10),
    inheritsMotionContract: MASTERS.recipeId,
    note: 'Additive family for Raid Rebuild (raid2, HF-408), the arena registered on 2026-09-02. Replaces the labelled PREVIEW STANDBY card it shipped with - the one item the do-not-repeat list in the lane brief named explicitly - and never a byte-copy of another arena, which is the placeholder defect the pass79 family had to undo. The retained pass66-runtime-preview-v15 media, its cache-family lock, and the pass77, pass79 and pass84 families are untouched by this finalizer.',
    finalMediaSet: { algorithm: finalMedia.algorithm, fileCount: finalMedia.fileCount, totalBytes: finalMedia.totalBytes, sha256: finalMedia.sha256 },
    finalizer: { path: relative(fileURLToPath(import.meta.url)), sha256: await sha256(fileURLToPath(import.meta.url)) },
    generator: { path: 'scripts/assets/generate-pass65-runtime-menu-previews.ts', sha256: await sha256(path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts')) },
    arenas: files,
  };
  await mkdir(provenanceRoot, { recursive: true });
  await writeFile(path.join(provenanceRoot, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entryId = `atomic-acres-${FAMILY_ID}`;
  const entry = {
    id: entryId,
    kind: 'original-project-prerecorded-authoritative-runtime-menu-video-family',
    creator: 'Atomic Acres project',
    source: 'scripts/assets/generate-pass65-runtime-menu-previews.ts',
    generatedAsOf: provenance.generatedAt,
    license: 'Original project work',
    files: files.flatMap((arena) => arena.runtimeFiles.map((file) => ({ path: file.path, sha256: file.sha256 }))),
    contactSheet: files.map((arena) => arena.reviewSheet.path),
    sourceScript: relative(fileURLToPath(import.meta.url)),
    sourceScriptSha256: provenance.finalizer.sha256,
    sourceProvenance: relative(path.join(provenanceRoot, 'provenance.json')),
    format: `One distinct ${MASTERS.capture.viewport.join('x')} eight-second 30 FPS selected-map runtime capture, shipped as VP9/Opus WebM, H.264 High Level 5.0/AAC MP4 and a full-resolution static WebP poster, plus a five-frame review sheet`,
    modifications: 'Captured offline from the actual authoritative Raid Rebuild runtime arena on the canonical WebGPU route with the deterministic Pass 66 camera recipe, visual time and baked cockpit overlay, then encoded with the Pass 66 profiles and budgets. No downloaded or sampled art is used.',
    attributionRequired: false,
  };
  const existingIndex = manifest.assets.findIndex((asset) => asset.id === entryId);
  if (existingIndex >= 0) manifest.assets[existingIndex] = entry;
  else manifest.assets.push(entry);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    finalize: 'passed',
    family: FAMILY_ID,
    cacheKey: CACHE_KEY,
    arenas: files.map((arena) => ({
      arenaId: arena.arenaId,
      backendUsed: arena.capture.backendUsed,
      inputsStable: arena.capture.inputsStable,
      runtimeFiles: arena.runtimeFiles,
    })),
    finalMediaSet: provenance.finalMediaSet,
  }, null, 2));
}

await main();
