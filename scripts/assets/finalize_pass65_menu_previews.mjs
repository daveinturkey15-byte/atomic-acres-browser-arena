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
const captureReceiptPath = path.join(sourceRoot, 'runtime-capture-receipt.json');
const provenancePath = path.join(sourceRoot, 'provenance.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts');
const finalizerPath = fileURLToPath(import.meta.url);
const verifierPath = path.join(root, 'scripts/qa/verify-pass65-menu-preview-production.mjs');
const cameraEvaluatorPath = path.join(root, 'src/ui/menu-preview-camera.ts');
const runtimeEntryPath = path.join(root, 'src/legacy-main.ts');
const chopperSourcePath = path.join(root, 'source-assets/blender/pass65-chopper-gunner.blend');
const choreography = JSON.parse(await readFile(choreographyPath, 'utf8'));
const arenas = Object.keys(choreography.arenas);
const runtimeSourcePaths = Object.freeze({
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
const supersededGunRange = Object.freeze({
  reason: 'HF-011 and R114 explicitly supersede the former byte-identical media gate.',
  files: Object.freeze({
    'public/assets/original/menu-previews/gun-range.mp4': '3de2c28899d32ee48b8a023613305690d59227b1e64189ffafaf1aa0b447fc13',
    'public/assets/original/menu-previews/gun-range.webm': '708bdf00af28906a8ce7b1605dc1c534c854c537fb82fecab62173dbce1e9885',
    'public/assets/original/menu-previews/gun-range.webp': '23479fe37b290d909e21d0c3015e49f3b09a244d51d986b67c665136fce210fe',
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
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
}

function validateRecipe() {
  if (choreography.schemaVersion !== 3 || choreography.recipeId !== 'pass65-authoritative-runtime-menu-preview-v4') {
    throw new Error('canonical authoritative-runtime choreography schema or recipe id is invalid');
  }
  if (choreography.capture?.source !== 'authoritative-runtime-arena'
    || choreography.capture?.backend !== 'webgpu'
    || choreography.capture?.rendererRequired !== true
    || choreography.capture?.overlayScale !== 0.5) {
    throw new Error('capture must require authoritative WebGPU arenas and the reviewed half-scale overlay');
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
    throw new Error('reviewFrames must be unique and include the exact loop endpoints');
  }
  if (choreography.media.cacheKey !== 'pass65-runtime-preview-v6') throw new Error('runtime preview cache key is stale');
  const rotor = choreography.helicopter?.rotorPresentation;
  if (rotor?.id !== 'perspective-projected-cockpit-rotor-rig-v1'
    || rotor.mainTurnsPerLoop !== choreography.helicopter.rotorTurnsPerLoop
    || rotor.tailTurnsPerLoop !== rotor.mainTurnsPerLoop * 3
    || rotor.mainDiscPitchDegrees < 68
    || rotor.mainDiscPitchDegrees > 82
    || rotor.tailDiscYawDegrees < 50
    || rotor.tailDiscYawDegrees > 75
    || rotor.tailCameraReflection !== true
    || !['mast-hub', 'canopy-header', 'tail-boom'].every((layer) => rotor.occlusionLayers?.includes(layer))) {
    throw new Error('perspective-aware main/tail rotor projection contract is invalid');
  }
  for (const arena of arenas) {
    const recipe = choreography.arenas[arena];
    if (!['helicopter', 'cat'].includes(recipe.kind)) throw new Error(`${arena} has an invalid preview kind`);
    if (!Number.isInteger(recipe.seed)) throw new Error(`${arena} seed must be an integer`);
    if (!choreography.reviewFrames.includes(recipe.posterFrame)) throw new Error(`${arena} posterFrame is not reviewable`);
    for (const axis of ['x', 'y', 'z']) {
      const bounds = recipe.safeVolume?.[axis];
      if (!Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[1]) {
        throw new Error(`${arena} has invalid ${axis} safe-volume bounds`);
      }
    }
  }
}

async function assertFrames(arena, frames = undefined) {
  const directory = path.join(frameRoot, arena);
  const available = new Set((await readdir(directory)).filter((entry) => /^frame-\d{4}\.png$/.test(entry)));
  const expectedNumbers = frames ?? Array.from({ length: choreography.frameCount }, (_, index) => index + 1);
  const missing = expectedNumbers
    .map((frame) => `frame-${String(frame).padStart(4, '0')}.png`)
    .filter((frame) => !available.has(frame));
  if (missing.length > 0) throw new Error(`${arena} is missing staged frames: ${missing.join(', ')}`);
  if (!frames && available.size !== choreography.frameCount) {
    throw new Error(`${arena} must provide exactly ${choreography.frameCount} staged PNG frames, got ${available.size}`);
  }
}

async function assertCaptureReceipt() {
  const receipt = JSON.parse(await readFile(captureReceiptPath, 'utf8'));
  const recipeDigest = createHash('sha256').update(JSON.stringify(choreography)).digest('hex');
  if (receipt.schemaVersion !== 1
    || receipt.captureId !== 'pass65-authoritative-runtime-menu-preview-capture-v2'
    || receipt.recipeId !== choreography.recipeId
    || receipt.recipeDigest !== recipeDigest
    || receipt.source !== choreography.capture.source
    || receipt.backendRequired !== 'webgpu'
    || receipt.overlay?.scale !== 0.5
    || receipt.overlay?.liveLoadingRenderer !== false) {
    throw new Error('runtime capture receipt does not match the canonical offline authoring contract');
  }
  const expectedFrames = Array.from({ length: choreography.frameCount }, (_, index) => index + 1);
  if (JSON.stringify(receipt.frameRoster) !== JSON.stringify(expectedFrames)) {
    throw new Error('runtime capture receipt does not prove the exact full frame roster');
  }
  if ((receipt.arenas ?? []).map((entry) => entry.arenaId).join(',') !== arenas.join(',')) {
    throw new Error('runtime capture receipt arena roster/order drifted');
  }
  const expectedCaptureRuntime = ['src/legacy-main.ts', 'src/ui/menu-preview-camera.ts'];
  if (receipt.runtimeInputs?.captureTool?.path !== relative(generatorPath)
    || await sha256(generatorPath) !== receipt.runtimeInputs.captureTool.sha256) {
    throw new Error('runtime capture receipt capture-tool digest is stale');
  }
  if ((receipt.runtimeInputs?.captureRuntime ?? []).map((entry) => entry.path).join(',') !== expectedCaptureRuntime.join(',')) {
    throw new Error('runtime capture receipt capture-runtime source roster drifted');
  }
  for (const record of receipt.runtimeInputs.captureRuntime) {
    if (await sha256(path.join(root, record.path)) !== record.sha256) throw new Error(`runtime capture input drifted after capture: ${record.path}`);
  }
  for (const arena of arenas) {
    const records = receipt.runtimeInputs?.arenas?.[arena] ?? [];
    if (records.map((entry) => entry.path).join(',') !== runtimeSourcePaths[arena].join(',')) {
      throw new Error(`${arena} runtime capture source roster drifted`);
    }
    for (const record of records) {
      if (await sha256(path.join(root, record.path)) !== record.sha256) throw new Error(`runtime capture input drifted after capture: ${record.path}`);
    }
  }
  for (const evidence of receipt.arenas) {
    if (evidence.backend !== 'webgpu'
      || evidence.softwareAdapter !== false
      || evidence.constructionHistory?.length !== 1
      || evidence.constructionHistory[0] !== evidence.arenaId
      || evidence.residentArenaRoots !== 1
      || evidence.capturedFrames !== choreography.frameCount
      || evidence.viewmodelHidden !== true
      || evidence.colliders <= 0
      || evidence.raycastMeshes <= 0) {
      throw new Error(`${evidence.arenaId} receipt does not prove one healthy authoritative hardware-WebGPU arena`);
    }
    const recipe = choreography.arenas[evidence.arenaId];
    if ((evidence.reviewFrames ?? []).map((entry) => entry.frame).join(',') !== choreography.reviewFrames.join(',')) {
      throw new Error(`${evidence.arenaId} receipt does not prove every deterministic review frame`);
    }
    for (const frame of evidence.reviewFrames) {
      const positionError = Math.hypot(...frame.requestedPosition.map((value, index) => value - frame.renderedPosition[index]));
      const elapsedMs = (frame.frame - 1) / (choreography.frameCount - 1) * choreography.durationSeconds * 1_000;
      const expectedFixedTimeMs = choreography.capture.fixedTimeStartMs + (elapsedMs % (choreography.durationSeconds * 1_000));
      if (positionError > 0.01
        || Math.abs(frame.requestedFov - frame.renderedFov) > 0.1
        || frame.requestedFov !== recipe.fovDegrees
        || Math.abs(frame.fixedVisualTimeMs - expectedFixedTimeMs) > 0.01
        || frame.aboveArenaFloor !== true
        || frame.insideHorizontalCollider !== false
        || !/^[0-9a-f]{64}$/.test(frame.pngSha256)) {
        throw new Error(`${evidence.arenaId} review frame ${frame.frame} camera/visual evidence is invalid`);
      }
    }
    const firstReview = evidence.reviewFrames.find((entry) => entry.frame === 1);
    const seamReview = evidence.reviewFrames.find((entry) => entry.frame === choreography.frameCount);
    if (!firstReview || !seamReview || seamReview.seamSourceFrame !== 1 || seamReview.pngSha256 !== firstReview.pngSha256) {
      throw new Error(`${evidence.arenaId} does not prove the exact copied first/final loop seam`);
    }
  }
  return receipt;
}

function audioSource(kind) {
  const duration = choreography.durationSeconds;
  return kind === 'helicopter'
    ? `aevalsrc=0.015*(1+0.28*sin(2*PI*8*t))*sin(2*PI*43*t)+0.006*sin(2*PI*86*t)+0.003*sin(2*PI*4*t):s=48000:d=${duration}`
    : `aevalsrc=0.005*sin(2*PI*63*t)+0.0025*sin(2*PI*126*t)+0.0015*sin(2*PI*252*t):s=48000:d=${duration}`;
}

function transcode(arena) {
  const recipe = choreography.arenas[arena];
  const input = path.join(frameRoot, arena, 'frame-%04d.png');
  const mp4 = path.join(runtimeRoot, `${arena}.mp4`);
  const webm = path.join(runtimeRoot, `${arena}.webm`);
  const poster = path.join(runtimeRoot, `${arena}.webp`);
  const common = [
    '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(choreography.fps),
    '-start_number', '1', '-i', input, '-f', 'lavfi', '-i', audioSource(recipe.kind),
    '-fflags', '+bitexact', '-map_metadata', '-1', '-map', '0:v:0', '-map', '1:a:0',
    '-t', String(choreography.durationSeconds),
  ];
  run('ffmpeg', [...common, '-c:v', 'libx264', '-preset', 'slow', '-b:v', '850k', '-minrate', '700k', '-maxrate', '900k', '-bufsize', '1800k', '-flags:v', '+bitexact', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-flags:a', '+bitexact', '-b:a', '64k', mp4]);
  run('ffmpeg', [...common, '-c:v', 'libvpx-vp9', '-crf', '35', '-b:v', '820k', '-minrate', '650k', '-maxrate', '880k', '-bufsize', '1760k', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-flags:v', '+bitexact', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-flags:a', '+bitexact', '-b:a', '48k', webm]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', path.join(frameRoot, arena, `frame-${String(recipe.posterFrame).padStart(4, '0')}.png`), '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster]);
}

function createReviewSheet(arena) {
  const inputs = choreography.reviewFrames.flatMap((frame) => ['-i', path.join(frameRoot, arena, `frame-${String(frame).padStart(4, '0')}.png`)]);
  const scales = choreography.reviewFrames.map((_, index) => `[${index}:v]scale=384:216:flags=lanczos[r${index}]`).join(';');
  const labels = choreography.reviewFrames.map((_, index) => `[r${index}]`).join('');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${scales};${labels}hstack=inputs=${choreography.reviewFrames.length}[review]`, '-map', '[review]', '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', path.join(reviewRoot, `${arena}-review-frames.webp`)]);
}

async function fileRecord(file, extra = {}) {
  return { path: relative(file), sha256: await sha256(file), ...extra };
}

async function sourceRecord(arena) {
  return {
    arenaId: arena,
    kind: choreography.arenas[arena].kind,
    seed: choreography.arenas[arena].seed,
    fovDegrees: choreography.arenas[arena].fovDegrees,
    reviewLabel: choreography.arenas[arena].reviewLabel,
    source: 'authoritative-runtime-arena',
    runtimeSources: await Promise.all(runtimeSourcePaths[arena].map((file) => fileRecord(path.join(root, file)))),
  };
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
    await assertFrames(arena, choreography.reviewFrames);
    createReviewSheet(arena);
  }
  console.log(JSON.stringify({ reviewSheets: 'generated', frames: choreography.reviewFrames, arenas }, null, 2));
  process.exit(0);
}
const captureReceipt = await assertCaptureReceipt();
for (const arena of arenas) {
  await assertFrames(arena);
  transcode(arena);
  createReviewSheet(arena);
}

const sources = [];
const runtimeFiles = [];
const reviewEvidence = [];
for (const arena of arenas) {
  sources.push(await sourceRecord(arena));
  for (const extension of ['mp4', 'webm', 'webp']) runtimeFiles.push(await fileRecord(path.join(runtimeRoot, `${arena}.${extension}`), { arenaId: arena, extension }));
  reviewEvidence.push(await fileRecord(path.join(reviewRoot, `${arena}-review-frames.webp`), { arenaId: arena, frames: choreography.reviewFrames }));
}

const provenance = {
  schemaVersion: 3,
  assetId: 'atomic-acres-pass65-prerecorded-menu-previews-2026-07-26',
  generatedAt: '2026-07-28',
  creator: 'Atomic Acres project',
  license: 'Original project work',
  releaseState: 'HITL candidate only',
  choreography: await fileRecord(choreographyPath, { recipeId: choreography.recipeId }),
  documentation: await fileRecord(documentationPath),
  generator: await fileRecord(generatorPath, { engine: 'Playwright installed Chrome hardware WebGPU', deterministicCapture: true }),
  finalizer: await fileRecord(finalizerPath, { ffmpeg: 'required' }),
  verification: await fileRecord(verifierPath, { failClosed: true }),
  captureReceipt: await fileRecord(captureReceiptPath, { captureId: captureReceipt.captureId, backend: 'webgpu' }),
  captureRuntime: await Promise.all([cameraEvaluatorPath, runtimeEntryPath].map((file) => fileRecord(file))),
  authoredCockpit: {
    assetId: 'chopper-gunner-vehicle-v1',
    ...(await fileRecord(chopperSourcePath)),
    qualityTier: 'LOD0',
    role: 'visual design reference; compact black-grey treatment is baked offline over runtime footage',
    evidence: 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png',
    evidenceSha256: 'a09ec4d7344a369546fde3179b17012badf434681a37f9e8bab663a142ca3b8f',
  },
  sources,
  render: {
    masterFrames: `${choreography.frameCount} PNG frames per arena (intermediate frames excluded from git)`,
    dimensions: '960x540',
    frameRate: choreography.fps,
    durationSeconds: choreography.durationSeconds,
    mapSource: 'Selected authoritative production runtime arena under hardware WebGPU',
    motion: 'Canonical deterministic cyclic camera paths over fixed runtime visual time',
    helicopter: 'Graphite first-person rotor and sculpted three-panel cockpit with cyan/green avionics, canopy depth, glass, braces and a map-safe reticle baked offline',
    cat: 'Expressive charcoal/silver feline crown, articulated ears, forelegs and coral-padded paws baked offline over the authoritative Gun Range moving-target scene',
    overlayScale: choreography.capture.overlayScale,
    audio: choreography.media.audioProfiles,
  },
  runtimeContract: choreography.runtimeContract,
  runtimeFiles,
  reviewEvidence,
  supersedes: { gunRangeByteIdenticalGate: supersededGunRange },
  externalAssets: [],
  notes: 'All four previews are compressed prerecorded captures of their actual selected runtime arenas. Reduced motion uses the poster; browsing and loading construct no arena and submit no gameplay frames.',
};
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const record = manifest.assets.find((asset) => asset.id === provenance.assetId);
if (!record) throw new Error(`Missing ${provenance.assetId} in assets.manifest.json`);
record.kind = 'original-project-prerecorded-authoritative-runtime-menu-video-family';
record.source = relative(generatorPath);
record.sourceScript = relative(generatorPath);
record.sourceScriptSha256 = provenance.generator.sha256;
record.sourceProvenanceSha256 = await sha256(provenancePath);
record.generatedAsOf = provenance.generatedAt;
record.format = 'Four distinct 960x540 eight-second 24 FPS selected-map runtime captures, shipped as VP9/Opus WebM, H.264/AAC MP4 and static WebP posters, plus deterministic five-frame review evidence';
record.modifications = 'Captured offline from each actual authoritative production WebGPU arena with deterministic camera and visual time. Three map flyovers bake a graphite rotor, dimensional canopy and cyan/green cockpit avionics; Gun Range bakes an expressive charcoal/silver crown, articulated ears, forelegs and coral-padded paws. Runtime loading/menu playback remains prerecorded-only, reduced motion is poster-only, and no downloaded or sampled assets are used. The former byte-identical Gun Range media gate is explicitly superseded.';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ releaseState: provenance.releaseState, recipeId: choreography.recipeId, source: choreography.capture.source, arenas, runtimeFiles: runtimeFiles.length, reviewSheets: reviewEvidence.length }, null, 2));
