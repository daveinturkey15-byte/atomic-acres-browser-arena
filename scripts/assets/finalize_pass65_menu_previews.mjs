import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frameRoot = path.join(root, 'artifacts/pass65/menu-preview-master-frames');
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');
const sourceRoot = path.join(root, 'source-assets/menu/pass65-preview-masters');
const reviewRoot = path.join(root, 'docs/assets/pass65-menu-previews');
const choreographyPath = path.join(sourceRoot, 'choreography.json');
const documentationPath = path.join(sourceRoot, 'README.md');
const provenancePath = path.join(sourceRoot, 'provenance.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate_pass65_menu_previews.py');
const finalizerPath = fileURLToPath(import.meta.url);
const auditScriptPath = path.join(root, 'scripts/qa/audit_pass65_menu_preview_blend.py');
const verifierPath = path.join(root, 'scripts/qa/verify-pass65-menu-preview-production.mjs');
const chopperSourcePath = path.join(root, 'source-assets/blender/pass65-chopper-gunner.blend');
const choreography = JSON.parse(await readFile(choreographyPath, 'utf8'));
const arenas = Object.keys(choreography.arenas);

const supersededGunRange = Object.freeze({
  reason: 'HF-011 and R114 explicitly supersede the byte-identical gate so clearer authored anatomy and the compact joyful path can ship.',
  files: Object.freeze({
    'public/assets/original/menu-previews/gun-range.mp4': '3de2c28899d32ee48b8a023613305690d59227b1e64189ffafaf1aa0b447fc13',
    'public/assets/original/menu-previews/gun-range.webm': '708bdf00af28906a8ce7b1605dc1c534c854c537fb82fecab62173dbce1e9885',
    'public/assets/original/menu-previews/gun-range.webp': '23479fe37b290d909e21d0c3015e49f3b09a244d51d986b67c665136fce210fe',
    'source-assets/menu/pass65-preview-masters/gun-range.blend': '14d9f6bc7b3a3b1b0948559d9d172c2666156c1730110540a88650b2a5c1994b',
  }),
});

const slash = (value) => value.split(path.sep).join('/');
const relative = (value) => slash(path.relative(root, value));
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function validateRecipe() {
  if (choreography.schemaVersion !== 2 || choreography.recipeId !== 'pass65-menu-preview-choreography-v2') {
    throw new Error('canonical choreography schema or recipe id is invalid');
  }
  if (choreography.frameCount !== choreography.fps * choreography.durationSeconds) {
    throw new Error('frameCount must equal fps * durationSeconds');
  }
  if (arenas.join(',') !== 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range') {
    throw new Error(`unexpected canonical arena order/set: ${arenas.join(',')}`);
  }
  if (new Set(choreography.reviewFrames).size !== choreography.reviewFrames.length
    || choreography.reviewFrames[0] !== 1
    || choreography.reviewFrames.at(-1) !== choreography.frameCount) {
    throw new Error('reviewFrames must be unique and include the first and final authored frames');
  }
  const seeds = new Set();
  for (const arena of arenas) {
    const recipe = choreography.arenas[arena];
    if (!['helicopter', 'cat'].includes(recipe.kind)) throw new Error(`${arena} has an invalid preview kind`);
    if (!Number.isInteger(recipe.seed) || seeds.has(recipe.seed)) throw new Error(`${arena} seed must be a unique integer`);
    seeds.add(recipe.seed);
    if (!choreography.reviewFrames.includes(recipe.posterFrame)) throw new Error(`${arena} posterFrame is not reviewable`);
    for (const axis of ['x', 'y', 'z']) {
      const bounds = recipe.safeVolume?.[axis];
      if (!Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[1]) {
        throw new Error(`${arena} has invalid ${axis} safe-volume bounds`);
      }
    }
  }
  if (choreography.helicopter.varianceAlgorithm !== 'xorshift32-cyclic-quintic-hold-v1') {
    throw new Error('helicopter variance algorithm is not the reviewed deterministic implementation');
  }
  for (const key of [
    'maximumLinearSpeedMps',
    'maximumLinearAccelerationMps2',
    'maximumAngularVelocityRadPerSecond',
    'maximumAngularAccelerationRadPerSecond2',
  ]) {
    if (!Number.isFinite(choreography.helicopter[key]) || choreography.helicopter[key] <= 0) {
      throw new Error(`helicopter ${key} must be a positive finite motion bound`);
    }
  }
  if (choreography.media.cacheKey !== 'pass65-preview-v2') {
    throw new Error('runtime preview cache key must be bumped for the regenerated media family');
  }
  const budget = choreography.media.encodingBudget;
  for (const key of [
    'minimumAverageBitrateKbps',
    'maximumAverageBitrateKbps',
    'maximumBytesPerVideo',
    'maximumPosterBytes',
    'maximumReviewSheetBytes',
  ]) {
    if (!Number.isFinite(budget?.[key]) || budget[key] <= 0) {
      throw new Error(`media encoding budget ${key} must be a positive finite number`);
    }
  }
  if (budget.minimumAverageBitrateKbps >= budget.maximumAverageBitrateKbps) {
    throw new Error('media encoding bitrate budget minimum must be below its maximum');
  }
}

async function assertFrames(arena) {
  const directory = path.join(frameRoot, arena);
  const frames = (await readdir(directory)).filter((entry) => /^frame-\d{4}\.png$/.test(entry)).sort();
  const expected = Array.from(
    { length: choreography.frameCount },
    (_, index) => `frame-${String(index + 1).padStart(4, '0')}.png`,
  );
  if (frames.length !== expected.length || frames.some((frame, index) => frame !== expected[index])) {
    throw new Error(`${arena} must provide the exact ${choreography.frameCount}-frame sequence`);
  }
}

async function assertReviewFrames(arena) {
  const directory = path.join(frameRoot, arena);
  const available = new Set((await readdir(directory)).filter((entry) => /^frame-\d{4}\.png$/.test(entry)));
  const missing = choreography.reviewFrames
    .map((frame) => `frame-${String(frame).padStart(4, '0')}.png`)
    .filter((frame) => !available.has(frame));
  if (missing.length > 0) throw new Error(`${arena} is missing staged review frames: ${missing.join(', ')}`);
}

function audioSource(kind) {
  const duration = choreography.durationSeconds;
  if (kind === 'helicopter') {
    return `aevalsrc=0.015*(1+0.28*sin(2*PI*8*t))*sin(2*PI*43*t)+0.006*sin(2*PI*86*t)+0.003*sin(2*PI*4*t):s=48000:d=${duration}`;
  }
  return `aevalsrc=0.005*sin(2*PI*63*t)+0.0025*sin(2*PI*126*t)+0.0015*sin(2*PI*252*t):s=48000:d=${duration}`;
}

function transcode(arena) {
  const recipe = choreography.arenas[arena];
  const input = path.join(frameRoot, arena, 'frame-%04d.png');
  const mp4 = path.join(runtimeRoot, `${arena}.mp4`);
  const webm = path.join(runtimeRoot, `${arena}.webm`);
  const poster = path.join(runtimeRoot, `${arena}.webp`);
  const common = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(choreography.fps), '-start_number', '1', '-i', input,
    '-f', 'lavfi', '-i', audioSource(recipe.kind),
    '-fflags', '+bitexact', '-map_metadata', '-1',
    '-map', '0:v:0', '-map', '1:a:0', '-t', String(choreography.durationSeconds),
  ];

  run('ffmpeg', [
    ...common,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-flags:v', '+bitexact',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-flags:a', '+bitexact', '-b:a', '64k', mp4,
  ]);
  run('ffmpeg', [
    ...common,
    '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-row-mt', '1',
    '-deadline', 'good', '-cpu-used', '2', '-flags:v', '+bitexact', '-pix_fmt', 'yuv420p',
    '-c:a', 'libopus', '-flags:a', '+bitexact', '-b:a', '48k', webm,
  ]);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact',
    '-i', path.join(frameRoot, arena, `frame-${String(recipe.posterFrame).padStart(4, '0')}.png`),
    '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '84', poster,
  ]);
}

function createReviewSheet(arena) {
  const inputs = choreography.reviewFrames.flatMap((frame) => [
    '-i', path.join(frameRoot, arena, `frame-${String(frame).padStart(4, '0')}.png`),
  ]);
  const scales = choreography.reviewFrames
    .map((_, index) => `[${index}:v]scale=384:216:flags=lanczos[r${index}]`)
    .join(';');
  const labels = choreography.reviewFrames.map((_, index) => `[r${index}]`).join('');
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex',
    `${scales};${labels}hstack=inputs=${choreography.reviewFrames.length}[review]`,
    '-map', '[review]', '-map_metadata', '-1', '-frames:v', '1',
    '-c:v', 'libwebp', '-quality', '88', path.join(reviewRoot, `${arena}-review-frames.webp`),
  ]);
}

async function assertSupersededCatChanged() {
  for (const [file, oldDigest] of Object.entries(supersededGunRange.files)) {
    const currentDigest = await sha256(path.join(root, file));
    if (currentDigest === oldDigest) {
      throw new Error(`superseded Gun Range asset was not regenerated: ${file}`);
    }
  }
}

async function sourceRecord(arena) {
  const file = path.join(sourceRoot, `${arena}.blend`);
  const recipe = choreography.arenas[arena];
  return {
    arenaId: arena,
    kind: recipe.kind,
    path: relative(file),
    sha256: await sha256(file),
    seed: recipe.seed,
    fovDegrees: recipe.fovDegrees,
    reviewLabel: recipe.reviewLabel,
  };
}

async function fileRecord(file, extra = {}) {
  return { path: relative(file), sha256: await sha256(file), ...extra };
}

validateRecipe();
if (process.env.AA_PREVIEW_VALIDATE_ONLY === '1') {
  console.log(JSON.stringify({ recipeValidation: 'passed', recipeId: choreography.recipeId, arenas }, null, 2));
  process.exit(0);
}
await mkdir(runtimeRoot, { recursive: true });
await mkdir(reviewRoot, { recursive: true });
if (process.env.AA_PREVIEW_REVIEW_ONLY === '1') {
  for (const arena of arenas) {
    await assertReviewFrames(arena);
    createReviewSheet(arena);
  }
  console.log(JSON.stringify({ reviewSheets: 'generated', frames: choreography.reviewFrames, arenas }, null, 2));
  process.exit(0);
}
for (const arena of arenas) {
  await assertFrames(arena);
  transcode(arena);
  createReviewSheet(arena);
}
await assertSupersededCatChanged();

const sources = [];
const runtimeFiles = [];
const reviewEvidence = [];
for (const arena of arenas) {
  sources.push(await sourceRecord(arena));
  for (const extension of ['mp4', 'webm', 'webp']) {
    runtimeFiles.push(await fileRecord(path.join(runtimeRoot, `${arena}.${extension}`), { arenaId: arena, extension }));
  }
  reviewEvidence.push(await fileRecord(path.join(reviewRoot, `${arena}-review-frames.webp`), {
    arenaId: arena,
    frames: choreography.reviewFrames,
  }));
}

const provenance = {
  schemaVersion: 2,
  assetId: 'atomic-acres-pass65-prerecorded-menu-previews-2026-07-26',
  generatedAt: '2026-07-27',
  creator: 'Atomic Acres project',
  license: 'Original project work',
  releaseState: 'HITL candidate only',
  choreography: await fileRecord(choreographyPath, { recipeId: choreography.recipeId }),
  documentation: await fileRecord(documentationPath),
  generator: await fileRecord(generatorPath, { blender: '5.1.2' }),
  finalizer: await fileRecord(finalizerPath, { ffmpeg: 'required' }),
  blendAudit: await fileRecord(auditScriptPath, { failClosed: true }),
  verification: await fileRecord(verifierPath, { failClosed: true }),
  authoredCockpit: {
    assetId: 'chopper-gunner-vehicle-v1',
    ...(await fileRecord(chopperSourcePath)),
    qualityTier: 'LOD0',
    evidence: 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png',
    evidenceSha256: 'a09ec4d7344a369546fde3179b17012badf434681a37f9e8bab663a142ca3b8f',
  },
  sources,
  render: {
    masterFrames: `${choreography.frameCount} PNG frames per arena (intermediate frames excluded from git)`,
    dimensions: '960x540',
    frameRate: choreography.fps,
    durationSeconds: choreography.durationSeconds,
    motion: 'Canonical deterministic cyclic paths; xorshift32 targets; long holds and quintic blends; exact first/final camera and rotor seam',
    helicopter: 'Authored LOD0 three-dimensional cockpit, cyan/green emissive instruments, canopy glass, first-person rotor and bounded occasional corrections',
    cat: 'Authored non-primitive ear shells, pinnae, tufts, forelegs, palms, four toes and pads per paw; compact clip-safe prowl with alternating paw and ear beats',
    audio: choreography.media.audioProfiles,
  },
  runtimeContract: choreography.runtimeContract,
  runtimeFiles,
  reviewEvidence,
  supersedes: { gunRangeByteIdenticalGate: supersededGunRange },
  externalAssets: [],
  notes: 'All four runtime previews are compressed prerecorded media. Reduced motion uses the authored poster and menu browsing constructs no arena and submits no gameplay frames.',
};
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const record = manifest.assets.find((asset) => asset.id === provenance.assetId);
if (!record) throw new Error(`Missing ${provenance.assetId} in assets.manifest.json`);
record.sourceScriptSha256 = provenance.generator.sha256;
record.sourceProvenanceSha256 = await sha256(provenancePath);
record.generatedAsOf = provenance.generatedAt;
record.format = 'Four distinct 960x540 eight-second 24 FPS loops, each shipped as VP9/Opus WebM, H.264/AAC MP4 and a static WebP poster, plus deterministic five-frame review evidence';
record.modifications = 'Four project-original prerecorded Blender previews: three deterministic cockpit flyovers using the authored chopper-gunner LOD0 with bounded hold/blend corrections, visible first-person rotor, cyan/green emissive instruments, modeled canopy glass and quiet synthetic rotor audio; plus a regenerated Gun Range cat POV with authored non-primitive ears, paws, toes and pads, a compact loop-safe path, moving illuminated targets and quiet synthetic room tone. The former byte-identical Gun Range gate is explicitly superseded. No downloaded or sampled assets are used.';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  releaseState: provenance.releaseState,
  recipeId: choreography.recipeId,
  arenas,
  runtimeFiles: runtimeFiles.length,
  reviewSheets: reviewEvidence.length,
  supersededGunRange: true,
}, null, 2));
