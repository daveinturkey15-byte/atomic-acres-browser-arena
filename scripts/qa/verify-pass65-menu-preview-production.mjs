import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
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
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate_pass65_menu_previews.py');
const finalizerPath = path.join(root, 'scripts/assets/finalize_pass65_menu_previews.mjs');
const auditScriptPath = path.join(root, 'scripts/qa/audit_pass65_menu_preview_blend.py');
const runtimeSourcePath = path.join(root, 'src/ui/menu-preview-video.ts');
const runtimeEntryPath = path.join(root, 'src/legacy-main.ts');
const acceptedCockpitEvidence = 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png';
const acceptedCockpitDigest = 'a09ec4d7344a369546fde3179b17012badf434681a37f9e8bab663a142ca3b8f';
const arenas = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
const helicopterArenas = arenas.slice(0, 3);
const supersededGunRangeDigests = Object.freeze({
  'public/assets/original/menu-previews/gun-range.mp4': '3de2c28899d32ee48b8a023613305690d59227b1e64189ffafaf1aa0b447fc13',
  'public/assets/original/menu-previews/gun-range.webm': '708bdf00af28906a8ce7b1605dc1c534c854c537fb82fecab62173dbce1e9885',
  'public/assets/original/menu-previews/gun-range.webp': '23479fe37b290d909e21d0c3015e49f3b09a244d51d986b67c665136fce210fe',
  'source-assets/menu/pass65-preview-masters/gun-range.blend': '14d9f6bc7b3a3b1b0948559d9d172c2666156c1730110540a88650b2a5c1994b',
});
const blenderCandidates = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
].filter(Boolean);

const failures = [];
const blendAudits = [];
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
  const result = spawnSync(command, args, {
    cwd: root,
    encoding,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
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
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    failures.push(`${label} did not return JSON: ${error.message}`);
    return null;
  }
}

function inspectMedia(file) {
  return runJson('ffprobe', [
    '-v', 'error', '-count_frames', '-show_entries',
    'format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration',
    '-of', 'json', file,
  ], `ffprobe ${relative(file)}`);
}

function audioPeakDb(file) {
  const result = run('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'volumedetect', '-f', 'null', '-',
  ], `audio audit ${relative(file)}`);
  if (!result) return null;
  const match = result.stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  if (!match) {
    failures.push(`${relative(file)} audio peak could not be measured`);
    return null;
  }
  return Number(match[1]);
}

function decodedFrame(file, frame) {
  const result = run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-i', file,
    '-vf', `select=eq(n\\,${frame}),scale=160:90:flags=area,format=gray`,
    '-vsync', '0', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1',
  ], `decode frame ${frame} from ${relative(file)}`, null);
  if (!result) return null;
  if (result.stdout.length !== 160 * 90) {
    failures.push(`${relative(file)} frame ${frame} decoded ${result.stdout.length} bytes, expected ${160 * 90}`);
    return null;
  }
  return result.stdout;
}

function meanAbsoluteDifference(left, right) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]);
  return total / left.length;
}

function validateVideo(file, videoCodec, audioCodec, recipe) {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration ?? video?.duration);
  if (video?.codec_name !== videoCodec) failures.push(`${relative(file)} must use ${videoCodec} video`);
  if (video?.width !== 960 || video?.height !== 540) failures.push(`${relative(file)} must be 960x540`);
  if (video?.r_frame_rate !== `${recipe.fps}/1`) failures.push(`${relative(file)} must be ${recipe.fps} FPS`);
  const frameCount = Number(video?.nb_read_frames);
  if (!Number.isFinite(frameCount) || frameCount !== recipe.frameCount) {
    failures.push(`${relative(file)} must contain exactly ${recipe.frameCount} video frames`);
  }
  if (!Number.isFinite(duration) || Math.abs(duration - recipe.durationSeconds) > 0.08) {
    failures.push(`${relative(file)} must be a ${recipe.durationSeconds}-second loop`);
  }
  if (audio?.codec_name !== audioCodec) failures.push(`${relative(file)} must include ${audioCodec} audio`);
  const sizeBytes = Number(probe.format?.size);
  const averageBitrateKbps = Number(probe.format?.bit_rate) / 1000;
  const budget = recipe.media.encodingBudget;
  if (!Number.isFinite(sizeBytes) || sizeBytes > budget.maximumBytesPerVideo) {
    failures.push(`${relative(file)} size ${sizeBytes} exceeds ${budget.maximumBytesPerVideo}-byte preview budget`);
  }
  if (!Number.isFinite(averageBitrateKbps)
    || averageBitrateKbps < budget.minimumAverageBitrateKbps
    || averageBitrateKbps > budget.maximumAverageBitrateKbps) {
    failures.push(`${relative(file)} average bitrate ${averageBitrateKbps.toFixed(1)} kbps violates ${budget.minimumAverageBitrateKbps}..${budget.maximumAverageBitrateKbps} kbps budget`);
  }
  const peak = audioPeakDb(file);
  const profile = recipe.media.audioProfiles[recipe.arenas[path.basename(file, path.extname(file))].kind];
  if (peak !== null && (peak < profile.minimumPeakDb || peak > profile.maximumPeakDb)) {
    failures.push(`${relative(file)} audio peak ${peak} dB violates quiet audible bounds ${profile.minimumPeakDb}..${profile.maximumPeakDb} dB`);
  }
  const first = decodedFrame(file, 0);
  const middle = decodedFrame(file, Math.floor(recipe.frameCount / 2));
  const final = decodedFrame(file, recipe.frameCount - 1);
  const seamDifference = meanAbsoluteDifference(first, final);
  const motionDifference = meanAbsoluteDifference(first, middle);
  if (seamDifference > 7.5) failures.push(`${relative(file)} loop seam visual delta is too high: ${seamDifference.toFixed(3)}`);
  if (motionDifference < 1.5) failures.push(`${relative(file)} appears static: midpoint delta ${motionDifference.toFixed(3)}`);
  mediaAudits.push({
    path: relative(file),
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    frameCount,
    durationSeconds: duration,
    sizeBytes,
    averageBitrateKbps,
    audioPeakDb: peak,
    seamMeanAbsoluteDifference: seamDifference,
    midpointMeanAbsoluteDifference: motionDifference,
  });
}

function validateImage(file, width, height, maximumBytes, codec = 'webp') {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (video?.codec_name !== codec || video?.width !== width || video?.height !== height) {
    failures.push(`${relative(file)} must be a ${width}x${height} ${codec.toUpperCase()} image`);
  }
  const sizeBytes = Number(probe.format?.size);
  if (!Number.isFinite(sizeBytes) || sizeBytes > maximumBytes) {
    failures.push(`${relative(file)} size ${sizeBytes} exceeds ${maximumBytes}-byte image budget`);
  }
  imageAudits.push({
    path: relative(file),
    codec: video?.codec_name,
    width: video?.width,
    height: video?.height,
    sizeBytes,
    maximumBytes,
  });
}

function auditBlend(blender, arena) {
  const blendPath = path.join(sourceRoot, `${arena}.blend`);
  const result = spawnSync(blender, [
    '--background', '--factory-startup', '--python-exit-code', '1', '--python', auditScriptPath, '--',
    '--blend', blendPath, '--arena', arena, '--recipe', choreographyPath,
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const blenderOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (/Traceback \(most recent call last\):|Python: Exception:/i.test(blenderOutput)) {
    failures.push(`Blender audit emitted a Python exception for ${arena}`);
    return;
  }
  const marker = result.stdout?.split(/\r?\n/).find((line) => line.startsWith('AA_PREVIEW_BLEND_AUDIT='));
  if (!marker) {
    failures.push(`Blender audit emitted no structured result for ${arena}: ${(result.stderr || result.stdout || '').trim()}`);
    return;
  }
  try {
    const audit = JSON.parse(marker.slice('AA_PREVIEW_BLEND_AUDIT='.length));
    blendAudits.push(audit);
    if (result.status !== 0 || !audit.passed) {
      failures.push(`Blender audit failed for ${arena}: ${(audit.failures ?? []).join('; ')}`);
    }
  } catch (error) {
    failures.push(`Blender audit JSON is invalid for ${arena}: ${error.message}`);
  }
}

const choreography = JSON.parse(await readFile(choreographyPath, 'utf8'));
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestRecord = manifest.assets.find((asset) => asset.id === provenance.assetId);

if (choreography.schemaVersion !== 2 || choreography.recipeId !== 'pass65-menu-preview-choreography-v2') {
  failures.push('canonical choreography schema/recipe id mismatch');
}
if (choreography.frameCount !== choreography.fps * choreography.durationSeconds) {
  failures.push('canonical choreography frameCount does not equal fps * duration');
}
if (Object.keys(choreography.arenas).join(',') !== arenas.join(',')) {
  failures.push('canonical choreography arena set/order drifted');
}
if (provenance.schemaVersion !== 2 || provenance.releaseState !== 'HITL candidate only') {
  failures.push('provenance must describe schema 2 HITL-candidate media without claiming release approval');
}
if (!manifestRecord) failures.push(`assets.manifest.json is missing ${provenance.assetId}`);
if (provenance.authoredCockpit?.assetId !== 'chopper-gunner-vehicle-v1'
  || provenance.authoredCockpit?.qualityTier !== 'LOD0') {
  failures.push('provenance must pin the authored chopper-gunner LOD0 cockpit');
}
if (provenance.generator?.pythonExitCode !== 1 || provenance.blendAudit?.pythonExitCode !== 1) {
  failures.push('provenance must fail-close Blender Python authoring and audit with exit code 1');
}

await checkHash(path.join(root, acceptedCockpitEvidence), acceptedCockpitDigest, 'accepted cockpit evidence');
await checkHash(choreographyPath, provenance.choreography.sha256, 'canonical choreography');
await checkHash(documentationPath, provenance.documentation.sha256, 'menu preview authoring documentation');
await checkHash(generatorPath, provenance.generator.sha256, 'menu preview generator');
await checkHash(finalizerPath, provenance.finalizer.sha256, 'menu preview finalizer');
await checkHash(auditScriptPath, provenance.blendAudit.sha256, 'menu preview blend audit');
await checkHash(verifierPath, provenance.verification.sha256, 'menu preview production verifier');
await checkHash(path.join(root, provenance.authoredCockpit.path), provenance.authoredCockpit.sha256, 'authored cockpit source');
for (const source of provenance.sources ?? []) await checkHash(path.join(root, source.path), source.sha256);
for (const runtime of provenance.runtimeFiles ?? []) await checkHash(path.join(root, runtime.path), runtime.sha256);
for (const review of provenance.reviewEvidence ?? []) await checkHash(path.join(root, review.path), review.sha256);

for (const [file, oldDigest] of Object.entries(supersededGunRangeDigests)) {
  const actual = await sha256(path.join(root, file));
  if (actual === oldDigest) failures.push(`${file} still has the explicitly superseded Gun Range digest`);
  const recorded = provenance.supersedes?.gunRangeByteIdenticalGate?.files?.[file];
  if (recorded !== oldDigest) failures.push(`provenance does not honestly retain the superseded digest for ${file}`);
}

const expectedSources = arenas.map((arena) => `source-assets/menu/pass65-preview-masters/${arena}.blend`).sort();
const actualSources = (provenance.sources ?? []).map((entry) => entry.path).sort();
if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) failures.push('provenance source master inventory drifted');
const expectedRuntime = arenas.flatMap((arena) => ['mp4', 'webm', 'webp'].map((extension) => `public/assets/original/menu-previews/${arena}.${extension}`)).sort();
const actualRuntime = (provenance.runtimeFiles ?? []).map((entry) => entry.path).sort();
if (JSON.stringify(actualRuntime) !== JSON.stringify(expectedRuntime)) failures.push('provenance runtime media inventory drifted');
const expectedReview = arenas.map((arena) => `docs/assets/pass65-menu-previews/${arena}-review-frames.webp`).sort();
const actualReview = (provenance.reviewEvidence ?? []).map((entry) => entry.path).sort();
if (JSON.stringify(actualReview) !== JSON.stringify(expectedReview)) failures.push('deterministic review-sheet inventory drifted');

if (manifestRecord) {
  if (manifestRecord.sourceScriptSha256 !== provenance.generator.sha256) failures.push('manifest generator digest does not match provenance');
  if (manifestRecord.sourceProvenanceSha256 !== await sha256(provenancePath)) failures.push('manifest provenance digest is stale');
  if (!manifestRecord.modifications.includes('former byte-identical Gun Range gate is explicitly superseded')) {
    failures.push('manifest does not disclose the Gun Range gate supersession');
  }
}

for (const arena of arenas) {
  const recipe = choreography.arenas[arena];
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.mp4`), 'h264', 'aac', choreography);
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.webm`), 'vp9', 'opus', choreography);
  validateImage(
    path.join(root, `public/assets/original/menu-previews/${arena}.webp`),
    960,
    540,
    choreography.media.encodingBudget.maximumPosterBytes,
  );
  validateImage(
    path.join(root, `docs/assets/pass65-menu-previews/${arena}-review-frames.webp`),
    1920,
    216,
    choreography.media.encodingBudget.maximumReviewSheetBytes,
  );
  if (!Number.isInteger(recipe.posterFrame) || !choreography.reviewFrames.includes(recipe.posterFrame)) {
    failures.push(`${arena} posterFrame must be one of the deterministic review frames`);
  }
}

const generatorSource = await readFile(generatorPath, 'utf8');
const documentationSource = await readFile(documentationPath, 'utf8');
if (!generatorSource.includes('add_authored_helicopter_cockpit(rig)')
  || !generatorSource.includes('XorShift32')
  || !generatorSource.includes('sample_hold_track')
  || !generatorSource.includes('--python-exit-code 1')
  || !generatorSource.includes('"atomic-acres,skyline-terminal,rustworks-1v1,gun-range"')
  || generatorSource.includes('uv_sphere("authored-cat')) {
  failures.push('offline generator lacks canonical authored cockpit/cat/seeded-hold contracts');
}
if (!documentationSource.includes('--python-exit-code 1')
  || !documentationSource.includes('exact `frame-0001.png` through `frame-0192.png` roster')) {
  failures.push('authoring documentation does not fail-close Blender Python or exact frame-roster proof');
}

const runtimeSource = await readFile(runtimeSourcePath, 'utf8');
if (!runtimeSource.includes('<video id="menu-preview-video"')
  || !runtimeSource.includes('preload="metadata"')
  || runtimeSource.includes('<canvas')
  || !runtimeSource.includes('rendererSubmissions: 0')
  || !runtimeSource.includes("frame: 'cat'")
  || !runtimeSource.includes(`const CACHE_KEY = '${choreography.media.cacheKey}'`)
  || !runtimeSource.includes("frame.dataset.motion = reducedMotion ? 'static' : 'video'")
  || !/if\s*\(reducedMotion\)\s*\{\s*video\.removeAttribute\('src'\)/.test(runtimeSource)) {
  failures.push('menu runtime must remain one prerecorded video, zero submissions, and poster-only under reduced motion');
}
const runtimeEntry = await readFile(runtimeEntryPath, 'utf8');
if (!runtimeEntry.includes("from './ui/menu-preview-video'") || runtimeEntry.includes("from './ui/menu-preview-camera'")) {
  failures.push('browser entry must own prerecorded preview media only and must not import the offline camera evaluator');
}

const blender = blenderCandidates.find((candidate) => existsSync(candidate));
if (!blender) {
  failures.push('Blender executable not found; editable master semantic/motion audit is mandatory');
} else {
  for (const arena of arenas) auditBlend(blender, arena);
}

if (blendAudits.length === arenas.length) {
  for (const audit of blendAudits.filter((entry) => helicopterArenas.includes(entry.arenaId))) {
    if (audit.rotorReviewFrameHits !== choreography.reviewFrames.length) failures.push(`${audit.arenaId} rotor review coverage drifted`);
  }
  const catAudit = blendAudits.find((entry) => entry.arenaId === 'gun-range');
  if (!catAudit || catAudit.ears !== 2 || catAudit.paws !== 2 || catAudit.toes !== 8 || catAudit.primitiveSphereAnatomy !== 0) {
    failures.push('Gun Range blend audit does not prove two ears, two paws, eight toes, and zero primitive-sphere anatomy');
  }
}

if (failures.length > 0) {
  console.error(`Pass 65 menu preview production verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  releaseState: provenance.releaseState,
  recipeId: choreography.recipeId,
  authoredCockpit: provenance.authoredCockpit.assetId,
  helicopterArenas,
  gunRange: 'regenerated-authored-cat-pov',
  runtimeMode: 'prerecorded-video-only',
  reviewFrames: choreography.reviewFrames,
  mediaAudits,
  imageAudits,
  blendAudits,
}, null, 2));
