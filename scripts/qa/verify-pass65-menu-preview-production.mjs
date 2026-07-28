import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const verifierPath = fileURLToPath(import.meta.url);
const sourceRoot = path.join(root, 'source-assets/menu/pass65-preview-masters');
const provenancePath = path.join(sourceRoot, 'provenance.json');
const choreographyPath = path.join(sourceRoot, 'choreography.json');
const documentationPath = path.join(sourceRoot, 'README.md');
const captureReceiptPath = path.join(sourceRoot, 'runtime-capture-receipt.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts');
const finalizerPath = path.join(root, 'scripts/assets/finalize_pass65_menu_previews.mjs');
const runtimeSourcePath = path.join(root, 'src/ui/menu-preview-video.ts');
const runtimeEntryPath = path.join(root, 'src/legacy-main.ts');
const cameraEvaluatorPath = path.join(root, 'src/ui/menu-preview-camera.ts');
const acceptedCockpitEvidence = 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png';
const acceptedCockpitDigest = 'a09ec4d7344a369546fde3179b17012badf434681a37f9e8bab663a142ca3b8f';
const arenas = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
const helicopterArenas = arenas.slice(0, 3);
const expectedRuntimeInputPaths = Object.freeze({
  'atomic-acres': ['src/map.ts', 'src/arena-layout.ts', 'src/rendering/arenas/atomic-acres.ts'],
  'skyline-terminal': ['src/additional-maps.ts', 'src/rendering/arenas/skyline-terminal.ts'],
  'rustworks-1v1': ['src/additional-maps.ts', 'src/rendering/arenas/rustworks-1v1.ts'],
  'gun-range': [
    'src/additional-maps.ts',
    'src/gun-range-armory.ts',
    'src/gun-range-rack-presentation.ts',
    'src/weapon-model.ts',
    'src/rendering/arenas/gun-range.ts',
    'public/assets/original/models/weapons/pass65-firearms/carbine/carbine-world-lod0.glb',
    'public/assets/original/models/weapons/pass65-firearms/smg/smg-world-lod0.glb',
    'public/assets/original/models/weapons/pass65-firearms/lmg/lmg-world-lod0.glb',
    'public/assets/original/models/weapons/pass65-firearms/scattergun/scattergun-world-lod0.glb',
    'public/assets/original/models/weapons/pass65-firearms/sniper/sniper-world-lod0.glb',
  ],
});
const supersededGunRangeDigests = Object.freeze({
  'public/assets/original/menu-previews/gun-range.mp4': '3de2c28899d32ee48b8a023613305690d59227b1e64189ffafaf1aa0b447fc13',
  'public/assets/original/menu-previews/gun-range.webm': '708bdf00af28906a8ce7b1605dc1c534c854c537fb82fecab62173dbce1e9885',
  'public/assets/original/menu-previews/gun-range.webp': '23479fe37b290d909e21d0c3015e49f3b09a244d51d986b67c665136fce210fe',
});

const failures = [];
const mediaAudits = [];
const imageAudits = [];
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const relative = (file) => path.relative(root, file).split(path.sep).join('/');

async function checkHash(file, expected, label = relative(file)) {
  try {
    const actual = await sha256(file);
    if (actual !== expected) failures.push(`${label} digest mismatch: expected ${expected}, got ${actual}`);
    return actual;
  } catch (error) {
    failures.push(`${label} cannot be read: ${error.message}`);
    return null;
  }
}

function run(command, args, label, encoding = 'utf8') {
  const result = spawnSync(command, args, { cwd: root, encoding, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString('utf8') : result.stdout;
    failures.push(`${label} failed: ${(stderr || stdout || '').trim()}`);
    return null;
  }
  return result;
}

function runJson(command, args, label) {
  const result = run(command, args, label);
  if (!result) return null;
  try { return JSON.parse(result.stdout); } catch (error) {
    failures.push(`${label} did not return JSON: ${error.message}`);
    return null;
  }
}

function inspectMedia(file) {
  return runJson('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', file], `ffprobe ${relative(file)}`);
}

function audioPeakDb(file) {
  const result = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-'], `audio audit ${relative(file)}`);
  if (!result) return null;
  const match = result.stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  if (!match) failures.push(`${relative(file)} audio peak could not be measured`);
  return match ? Number(match[1]) : null;
}

function decodedFrame(file, frame) {
  const result = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,${frame}),scale=160:90:flags=area,format=gray`, '-vsync', '0', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], `decode frame ${frame} from ${relative(file)}`, null);
  if (!result) return null;
  if (result.stdout.length !== 160 * 90) failures.push(`${relative(file)} frame ${frame} decoded ${result.stdout.length} bytes, expected ${160 * 90}`);
  return result.stdout.length === 160 * 90 ? result.stdout : null;
}

function meanAbsoluteDifference(left, right) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function validateVideo(file, videoCodec, audioCodec, recipe, arena) {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration ?? video?.duration);
  const frameCount = Number(video?.nb_read_frames);
  const sizeBytes = Number(probe.format?.size);
  const averageBitrateKbps = Number(probe.format?.bit_rate) / 1000;
  const budget = recipe.media.encodingBudget;
  if (video?.codec_name !== videoCodec) failures.push(`${relative(file)} must use ${videoCodec} video`);
  if (audio?.codec_name !== audioCodec) failures.push(`${relative(file)} must include ${audioCodec} audio`);
  if (video?.width !== 960 || video?.height !== 540) failures.push(`${relative(file)} must be 960x540`);
  if (video?.r_frame_rate !== `${recipe.fps}/1`) failures.push(`${relative(file)} must be ${recipe.fps} FPS`);
  if (frameCount !== recipe.frameCount) failures.push(`${relative(file)} must contain exactly ${recipe.frameCount} frames`);
  if (!Number.isFinite(duration) || Math.abs(duration - recipe.durationSeconds) > 0.08) failures.push(`${relative(file)} must be ${recipe.durationSeconds} seconds`);
  if (!Number.isFinite(sizeBytes) || sizeBytes > budget.maximumBytesPerVideo) failures.push(`${relative(file)} exceeds the ${budget.maximumBytesPerVideo}-byte budget`);
  if (!Number.isFinite(averageBitrateKbps) || averageBitrateKbps < budget.minimumAverageBitrateKbps || averageBitrateKbps > budget.maximumAverageBitrateKbps) {
    failures.push(`${relative(file)} average bitrate ${averageBitrateKbps.toFixed(1)} kbps violates ${budget.minimumAverageBitrateKbps}..${budget.maximumAverageBitrateKbps} kbps`);
  }
  const peak = audioPeakDb(file);
  const profile = recipe.media.audioProfiles[recipe.arenas[arena].kind];
  if (peak !== null && (peak < profile.minimumPeakDb || peak > profile.maximumPeakDb)) failures.push(`${relative(file)} audio peak ${peak} dB violates quiet-audible bounds`);
  const first = decodedFrame(file, 0);
  const middle = decodedFrame(file, Math.floor(recipe.frameCount / 2));
  const final = decodedFrame(file, recipe.frameCount - 1);
  const seamDifference = meanAbsoluteDifference(first, final);
  const motionDifference = meanAbsoluteDifference(first, middle);
  if (seamDifference > 8.5) failures.push(`${relative(file)} loop seam visual delta is too high: ${seamDifference.toFixed(3)}`);
  if (motionDifference < 1.5) failures.push(`${relative(file)} appears static: midpoint delta ${motionDifference.toFixed(3)}`);
  mediaAudits.push({ path: relative(file), videoCodec: video?.codec_name, audioCodec: audio?.codec_name, frameCount, durationSeconds: duration, sizeBytes, averageBitrateKbps, audioPeakDb: peak, seamMeanAbsoluteDifference: seamDifference, midpointMeanAbsoluteDifference: motionDifference });
}

function validateImage(file, width, height, maximumBytes) {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const sizeBytes = Number(probe.format?.size);
  if (video?.codec_name !== 'webp' || video?.width !== width || video?.height !== height) failures.push(`${relative(file)} must be ${width}x${height} WebP`);
  if (!Number.isFinite(sizeBytes) || sizeBytes > maximumBytes) failures.push(`${relative(file)} exceeds the ${maximumBytes}-byte image budget`);
  imageAudits.push({ path: relative(file), width: video?.width, height: video?.height, sizeBytes, maximumBytes });
}

const choreography = JSON.parse(await readFile(choreographyPath, 'utf8'));
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
const captureReceipt = JSON.parse(await readFile(captureReceiptPath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestRecord = manifest.assets.find((asset) => asset.id === provenance.assetId);

if (choreography.schemaVersion !== 3 || choreography.recipeId !== 'pass65-authoritative-runtime-menu-preview-v3') failures.push('canonical runtime choreography schema/recipe drifted');
if (choreography.capture?.source !== 'authoritative-runtime-arena' || choreography.capture?.backend !== 'webgpu' || choreography.capture?.overlayScale !== 0.5) failures.push('canonical capture must pin authoritative WebGPU arenas and half-scale overlays');
if (choreography.frameCount !== choreography.fps * choreography.durationSeconds) failures.push('choreography frame count does not equal fps * duration');
if (Object.keys(choreography.arenas).join(',') !== arenas.join(',')) failures.push('choreography arena roster/order drifted');
if (provenance.schemaVersion !== 3 || provenance.releaseState !== 'HITL candidate only') failures.push('provenance must be schema 3 HITL-candidate media');
if (!manifestRecord) failures.push(`assets.manifest.json is missing ${provenance.assetId}`);
if (provenance.authoredCockpit?.assetId !== 'chopper-gunner-vehicle-v1' || provenance.authoredCockpit?.qualityTier !== 'LOD0') failures.push('provenance must retain the accepted LOD0 cockpit design reference');

const recipeDigest = createHash('sha256').update(JSON.stringify(choreography)).digest('hex');
if (captureReceipt.captureId !== 'pass65-authoritative-runtime-menu-preview-capture-v1'
  || captureReceipt.recipeId !== choreography.recipeId
  || captureReceipt.recipeDigest !== recipeDigest
  || captureReceipt.source !== 'authoritative-runtime-arena'
  || captureReceipt.backendRequired !== 'webgpu'
  || captureReceipt.overlay?.scale !== 0.5
  || captureReceipt.overlay?.mode !== 'offline-baked-compact-black-grey'
  || captureReceipt.overlay?.liveLoadingRenderer !== false) failures.push('capture receipt does not prove the canonical offline runtime capture/overlay contract');
if (JSON.stringify(captureReceipt.frameRoster) !== JSON.stringify(Array.from({ length: choreography.frameCount }, (_, index) => index + 1))) failures.push('capture receipt frame roster is not exact/full');
if ((captureReceipt.arenas ?? []).map((entry) => entry.arenaId).join(',') !== arenas.join(',')) failures.push('capture receipt arena roster/order drifted');
for (const evidence of captureReceipt.arenas ?? []) {
  if (evidence.backend !== 'webgpu' || evidence.softwareAdapter !== false || evidence.constructionHistory?.length !== 1 || evidence.constructionHistory[0] !== evidence.arenaId || evidence.residentArenaRoots !== 1 || evidence.capturedFrames !== choreography.frameCount || evidence.viewmodelHidden !== true || evidence.colliders <= 0 || evidence.raycastMeshes <= 0) failures.push(`${evidence.arenaId} capture does not prove one authoritative hardware-WebGPU arena with the gameplay viewmodel excluded`);
  const recipe = choreography.arenas[evidence.arenaId];
  if ((evidence.reviewFrames ?? []).map((entry) => entry.frame).join(',') !== choreography.reviewFrames.join(',')) failures.push(`${evidence.arenaId} capture does not prove all deterministic review frames`);
  for (const frame of evidence.reviewFrames ?? []) {
    const positionError = Math.hypot(...frame.requestedPosition.map((value, index) => value - frame.renderedPosition[index]));
    const elapsedMs = (frame.frame - 1) / (choreography.frameCount - 1) * choreography.durationSeconds * 1_000;
    const expectedFixedTimeMs = choreography.capture.fixedTimeStartMs + (elapsedMs % (choreography.durationSeconds * 1_000));
    if (positionError > 0.01 || Math.abs(frame.requestedFov - frame.renderedFov) > 0.1 || frame.requestedFov !== recipe.fovDegrees || Math.abs(frame.fixedVisualTimeMs - expectedFixedTimeMs) > 0.01 || frame.aboveArenaFloor !== true || frame.insideHorizontalCollider !== false || !/^[0-9a-f]{64}$/.test(frame.pngSha256)) failures.push(`${evidence.arenaId} review frame ${frame.frame} camera/visual evidence is invalid`);
  }
  const firstReview = evidence.reviewFrames?.find((entry) => entry.frame === 1);
  const seamReview = evidence.reviewFrames?.find((entry) => entry.frame === choreography.frameCount);
  if (!firstReview || !seamReview || seamReview.seamSourceFrame !== 1 || seamReview.pngSha256 !== firstReview.pngSha256) failures.push(`${evidence.arenaId} does not prove an exact copied first/final loop seam`);
}
const expectedCaptureRuntime = ['src/legacy-main.ts', 'src/ui/menu-preview-camera.ts'];
if (captureReceipt.runtimeInputs?.captureTool?.path !== 'scripts/assets/generate-pass65-runtime-menu-previews.ts') failures.push('capture receipt capture-tool path drifted');
else await checkHash(generatorPath, captureReceipt.runtimeInputs.captureTool.sha256, 'captured generator input');
if ((captureReceipt.runtimeInputs?.captureRuntime ?? []).map((entry) => entry.path).join(',') !== expectedCaptureRuntime.join(',')) failures.push('capture receipt capture-runtime input roster drifted');
for (const record of captureReceipt.runtimeInputs?.captureRuntime ?? []) await checkHash(path.join(root, record.path), record.sha256, `captured runtime input ${record.path}`);
for (const arena of arenas) {
  const records = captureReceipt.runtimeInputs?.arenas?.[arena] ?? [];
  if (records.map((entry) => entry.path).join(',') !== expectedRuntimeInputPaths[arena].join(',')) failures.push(`${arena} capture input roster drifted`);
  for (const record of records) await checkHash(path.join(root, record.path), record.sha256, `captured ${arena} input ${record.path}`);
}

await checkHash(path.join(root, acceptedCockpitEvidence), acceptedCockpitDigest, 'accepted cockpit evidence');
await checkHash(choreographyPath, provenance.choreography.sha256, 'canonical choreography');
await checkHash(documentationPath, provenance.documentation.sha256, 'preview authoring documentation');
await checkHash(generatorPath, provenance.generator.sha256, 'runtime capture generator');
await checkHash(finalizerPath, provenance.finalizer.sha256, 'preview finalizer');
await checkHash(verifierPath, provenance.verification.sha256, 'production verifier');
await checkHash(captureReceiptPath, provenance.captureReceipt.sha256, 'runtime capture receipt');
await checkHash(path.join(root, provenance.authoredCockpit.path), provenance.authoredCockpit.sha256, 'authored cockpit design source');
for (const record of provenance.captureRuntime ?? []) await checkHash(path.join(root, record.path), record.sha256);
for (const source of provenance.sources ?? []) for (const record of source.runtimeSources ?? []) await checkHash(path.join(root, record.path), record.sha256);
for (const runtime of provenance.runtimeFiles ?? []) await checkHash(path.join(root, runtime.path), runtime.sha256);
for (const review of provenance.reviewEvidence ?? []) await checkHash(path.join(root, review.path), review.sha256);

const expectedRuntime = arenas.flatMap((arena) => ['mp4', 'webm', 'webp'].map((extension) => `public/assets/original/menu-previews/${arena}.${extension}`)).sort();
const actualRuntime = (provenance.runtimeFiles ?? []).map((entry) => entry.path).sort();
if (JSON.stringify(actualRuntime) !== JSON.stringify(expectedRuntime)) failures.push('provenance runtime media inventory drifted');
const expectedReview = arenas.map((arena) => `docs/assets/pass65-menu-previews/${arena}-review-frames.webp`).sort();
if (JSON.stringify((provenance.reviewEvidence ?? []).map((entry) => entry.path).sort()) !== JSON.stringify(expectedReview)) failures.push('review evidence inventory drifted');
if ((provenance.sources ?? []).map((entry) => entry.arenaId).join(',') !== arenas.join(',') || (provenance.sources ?? []).some((entry) => entry.source !== 'authoritative-runtime-arena' || entry.runtimeSources?.length < 2)) failures.push('provenance does not pin per-arena authoritative runtime source files');

for (const [file, oldDigest] of Object.entries(supersededGunRangeDigests)) {
  const actual = await sha256(path.join(root, file));
  if (actual === oldDigest) failures.push(`${file} still has the explicitly superseded digest`);
  if (provenance.supersedes?.gunRangeByteIdenticalGate?.files?.[file] !== oldDigest) failures.push(`provenance lost superseded digest history for ${file}`);
}
if (manifestRecord) {
  if (manifestRecord.sourceScript !== 'scripts/assets/generate-pass65-runtime-menu-previews.ts' || manifestRecord.sourceScriptSha256 !== provenance.generator.sha256) failures.push('manifest runtime generator record is stale');
  if (manifestRecord.sourceProvenanceSha256 !== await sha256(provenancePath)) failures.push('manifest provenance digest is stale');
  if (!manifestRecord.modifications.includes('actual authoritative production WebGPU arena')
    || !manifestRecord.modifications.includes('cyan/green cockpit avionics')
    || !manifestRecord.modifications.includes('articulated ears, forelegs and coral-padded paws')) failures.push('manifest does not disclose authoritative runtime source and reviewed cockpit/cat overlay treatment');
}

const runtimeHashesByExtension = { mp4: new Set(), webm: new Set(), webp: new Set() };
for (const arena of arenas) {
  for (const extension of ['mp4', 'webm', 'webp']) runtimeHashesByExtension[extension].add(await sha256(path.join(root, `public/assets/original/menu-previews/${arena}.${extension}`)));
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.mp4`), 'h264', 'aac', choreography, arena);
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.webm`), 'vp9', 'opus', choreography, arena);
  validateImage(path.join(root, `public/assets/original/menu-previews/${arena}.webp`), 960, 540, choreography.media.encodingBudget.maximumPosterBytes);
  validateImage(path.join(root, `docs/assets/pass65-menu-previews/${arena}-review-frames.webp`), 1920, 216, choreography.media.encodingBudget.maximumReviewSheetBytes);
}
for (const [extension, hashes] of Object.entries(runtimeHashesByExtension)) if (hashes.size !== arenas.length) failures.push(`${extension} previews are not four distinct selected-map captures`);

const generatorSource = await readFile(generatorPath, 'utf8');
const documentationSource = await readFile(documentationPath, 'utf8');
for (const marker of ['chromium.launch', 'createServer', 'menuPreviewPose', 'setCaptureCameraPose', 'authoritative-runtime-arena', 'offline-menu-preview-overlay', 'offline-baked-compact-black-grey', 'overlayScale', 'aa-canopy', 'aa-glass', 'aa-reticle', 'aa-foreleg']) if (!generatorSource.includes(marker)) failures.push(`runtime capture generator is missing ${marker}`);
for (const forbidden of ['import bpy', 'primitive_cube_add', 'generate_pass65_menu_previews.py']) if (generatorSource.includes(forbidden)) failures.push(`runtime capture generator still contains synthetic Blender authoring marker ${forbidden}`);
if (!documentationSource.includes('npm run author:pass65:menu-previews') || !documentationSource.includes('actual authoritative map')) failures.push('authoring documentation does not describe the fail-closed runtime capture workflow');

const runtimeSource = await readFile(runtimeSourcePath, 'utf8');
if (!runtimeSource.includes('<video id="menu-preview-video"') || !runtimeSource.includes('preload="metadata"') || runtimeSource.includes('<canvas') || !runtimeSource.includes('rendererSubmissions: 0') || !runtimeSource.includes(`const CACHE_KEY = '${choreography.media.cacheKey}'`) || !/if\s*\(reducedMotion\)\s*\{\s*video\.removeAttribute\('src'\)/.test(runtimeSource)) failures.push('menu runtime must remain one prerecorded video, zero submissions, and poster-only for reduced motion');
const runtimeEntry = await readFile(runtimeEntryPath, 'utf8');
if (!runtimeEntry.includes("from './ui/menu-preview-video'") || runtimeEntry.includes("from './ui/menu-preview-camera'")) failures.push('browser entry must own prerecorded media only and never import the offline camera evaluator');
const cameraSource = await readFile(cameraEvaluatorPath, 'utf8');
if (!cameraSource.includes('authoring/tests only') || !cameraSource.includes('xorshift32-cyclic-quintic-hold-v1')) failures.push('offline camera evaluator lost its authoring-only deterministic contract');

if (failures.length > 0) {
  console.error(`Pass 65 menu preview production verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({ releaseState: provenance.releaseState, recipeId: choreography.recipeId, source: choreography.capture.source, authoredCockpit: provenance.authoredCockpit.assetId, helicopterArenas, gunRange: 'authoritative-runtime-cat-pov', runtimeMode: 'prerecorded-video-only', overlay: captureReceipt.overlay, mediaAudits, imageAudits }, null, 2));
