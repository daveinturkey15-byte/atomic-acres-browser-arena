import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  appendCacheFamily,
  buildDependencyClosure,
  cacheFamilyLockFailures,
  digestFinalMediaSet,
  digestOrderedFrameSet,
  RETAINED_CACHE_FAMILY_BASELINE,
} from './pass65-menu-preview-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frameRoot = path.join(root, 'artifacts/pass65/menu-preview-master-frames');
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');
const sourceRoot = path.join(root, 'source-assets/menu/pass65-preview-masters');
const reviewRoot = path.join(root, 'docs/assets/pass65-menu-previews');
const choreographyPath = path.join(sourceRoot, 'choreography.json');
const documentationPath = path.join(sourceRoot, 'README.md');
const captureReceiptPath = path.join(sourceRoot, 'runtime-capture-receipt.json');
const cacheFamilyLockPath = path.join(sourceRoot, 'cache-family-lock.json');
const provenancePath = path.join(sourceRoot, 'provenance.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts');
const integrityPath = path.join(root, 'scripts/assets/pass65-menu-preview-integrity.mjs');
const integrityTypesPath = path.join(root, 'scripts/assets/pass65-menu-preview-integrity.d.mts');
const dependencyManifestPath = path.join(root, 'scripts/assets/pass65-menu-preview-arena-dependencies.ts');
const dependencyPrinterPath = path.join(root, 'scripts/assets/print-pass65-menu-preview-arena-dependencies.ts');
const finalizerPath = fileURLToPath(import.meta.url);
const verifierPath = path.join(root, 'scripts/qa/verify-pass65-menu-preview-production.mjs');
const chopperSourcePath = path.join(root, 'source-assets/blender/pass65-chopper-gunner.blend');
const acceptedCockpitEvidence = 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png';
const acceptedCockpitEvidencePath = path.join(root, acceptedCockpitEvidence);
const acceptedCockpitDigest = '2bc59c95e2be10ab3146627bb781d3b2536c273e8658978c753ce180515c9760';
const choreography = JSON.parse(await readFile(choreographyPath, 'utf8'));
const generatedAt = choreography.generatedAt;
const arenas = Object.keys(choreography.arenas);
const captureToolPaths = [generatorPath, integrityPath, integrityTypesPath, dependencyManifestPath];
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
  return result;
}

function ffmpegSupportsEncoder(encoder) {
  const result = run('ffmpeg', ['-hide_banner', '-encoders']);
  const escaped = encoder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s*A\\S*\\s+${escaped}\\s`, 'm').test(result.stdout);
}

function canonicalArenaDependencies() {
  const result = run(process.execPath, ['--import', 'tsx', dependencyPrinterPath]);
  let manifest;
  try {
    manifest = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Canonical arena dependency printer returned invalid JSON: ${error.message}`);
  }
  if (manifest.arenaOrder?.join(',') !== arenas.join(',')) throw new Error('canonical arena dependency roster/order drifted');
  return manifest;
}

function validateRecipe() {
  if (choreography.schemaVersion !== 4
    || choreography.recipeId !== 'pass66-authoritative-runtime-menu-preview-v2'
    || choreography.captureId !== 'pass66-authoritative-runtime-menu-preview-capture-v2'
    || choreography.generatedAt !== '2026-08-02') {
    throw new Error('canonical authoritative-runtime choreography schema or recipe id is invalid');
  }
  if (choreography.capture?.source !== 'authoritative-runtime-arena'
    || choreography.capture?.backend !== 'webgpu'
    || choreography.capture?.rendererRequired !== true
    || choreography.capture?.overlayScale !== 0.5
    || choreography.capture?.overlayReferenceViewport?.[0] !== 1280
    || choreography.capture?.overlayReferenceViewport?.[1] !== 720
    || choreography.capture?.overlayOutputScale !== 2) {
    throw new Error('capture must require authoritative WebGPU arenas and the reviewed half-scale overlay');
  }
  if (choreography.fps !== 30
    || choreography.durationSeconds !== 8
    || choreography.frameCount !== 240
    || choreography.frameCount !== choreography.fps * choreography.durationSeconds
    || choreography.capture.viewport?.[0] !== 2560
    || choreography.capture.viewport?.[1] !== 1440) {
    throw new Error('canonical menu-preview masters must be exactly 2560x1440, 30 FPS, eight seconds and 240 frames');
  }
  if (arenas.join(',') !== 'atomic-acres,skyline-terminal,rustworks-1v1,gun-range') {
    throw new Error(`unexpected canonical arena order/set: ${arenas.join(',')}`);
  }
  if (new Set(choreography.reviewFrames).size !== choreography.reviewFrames.length
    || choreography.reviewFrames[0] !== 1
    || choreography.reviewFrames.at(-1) !== choreography.frameCount) {
    throw new Error('reviewFrames must be unique and include the exact loop endpoints');
  }
  if (choreography.media.cacheKey !== 'pass66-runtime-preview-v10') throw new Error('runtime preview cache key is stale');
  const budget = choreography.media.encodingBudget;
  if (budget?.minimumAverageBitrateKbps !== 3000
    || budget?.maximumAverageBitrateKbps !== 9000
    || budget?.maximumBytesPerVideo !== 9500000
    || budget?.maximumPosterBytes !== 1500000
    || budget?.maximumReviewSheetBytes !== 1200000) {
    throw new Error('1440p menu-preview encoding/file-size budget drifted');
  }
  const mp4 = choreography.media.encodingProfiles?.mp4;
  const webm = choreography.media.encodingProfiles?.webm;
  const images = choreography.media.encodingProfiles?.images;
  const colour = choreography.media.encodingProfiles?.colour;
  if (mp4?.encoder !== 'libx264'
    || mp4?.videoCodec !== 'h264'
    || mp4?.profile !== 'high'
    || mp4?.level !== '5.0'
    || mp4?.codecTag !== 'avc1'
    || mp4?.rfc6381 !== 'avc1.640032'
    || mp4?.audioCodec !== 'aac'
    || mp4?.audioRfc6381 !== 'mp4a.40.2'
    || mp4?.targetVideoBitrateKbps !== 7500
    || mp4?.minimumVideoBitrateKbps !== 6000
    || mp4?.maximumVideoBitrateKbps !== 8500
    || mp4?.bufferSizeKbps !== 17000
    || mp4?.audioBitrateKbps !== 64
    || mp4?.mimeType !== 'video/mp4; codecs="avc1.640032,mp4a.40.2"') {
    throw new Error('canonical H.264 High Level 5.0 1440p profile drifted');
  }
  if (webm?.encoder !== 'libvpx-vp9'
    || webm?.videoCodec !== 'vp9'
    || webm?.profile !== 0
    || webm?.audioCodec !== 'opus'
    || webm?.targetVideoBitrateKbps !== 6000
    || webm?.minimumVideoBitrateKbps !== 4500
    || webm?.maximumVideoBitrateKbps !== 7500
    || webm?.bufferSizeKbps !== 15000
    || webm?.crf !== 20
    || webm?.cpuUsed !== 2
    || webm?.audioBitrateKbps !== 48
    || webm?.mimeType !== 'video/webm; codecs="vp9,opus"') {
    throw new Error('canonical VP9 1440p profile drifted');
  }
  if (images?.posterQuality !== 88
    || images?.reviewFrameWidth !== 640
    || images?.reviewFrameHeight !== 360
    || images?.reviewQuality !== 88
    || colour?.pixelFormat !== 'yuv420p'
    || colour?.primaries !== 'bt709'
    || colour?.transfer !== 'bt709'
    || colour?.space !== 'bt709'
    || colour?.range !== 'tv') {
    throw new Error('canonical 1440p image or BT.709 delivery profile drifted');
  }
  const rotor = choreography.helicopter?.rotorPresentation;
  const configuredRotorArea = rotor?.mainStageWidthPercent / 100 * rotor?.mainStageHeightPercent / 100;
  const configuredRotorTop = rotor?.mainStageTopPercent / 100;
  const configuredRotorBottom = (rotor?.mainStageTopPercent + rotor?.mainStageHeightPercent) / 100;
  const configuredStageLeft = (100 - rotor?.mainStageWidthPercent) / 2;
  const configuredTieLeft = configuredStageLeft + rotor?.mainStageWidthPercent * rotor?.mainStructuralTieInsetPercent / 100;
  const configuredTieRight = configuredTieLeft + rotor?.mainStageWidthPercent * rotor?.mainStructuralTieWidthPercent / 100;
  const configuredHeaderLeft = configuredStageLeft + rotor?.mainStageWidthPercent * (100 - rotor?.mainCanopyHeaderWidthPercent) / 200;
  const configuredMaximumHorizontalShiftPercent = rotor?.mainMaximumPoseShiftPixels
    * choreography.capture.overlayOutputScale / choreography.capture.viewport[0] * 100;
  if (rotor?.id !== 'perspective-elliptic-cockpit-rotor-rig-v1'
    || rotor.mainTurnsPerLoop !== choreography.helicopter.rotorTurnsPerLoop
    || rotor.mainTurnsPerLoop <= 0
    || rotor.tailTurnsPerLoop !== rotor.mainTurnsPerLoop * 3
    || rotor.mainDiscPitchDegrees < 78
    || rotor.mainDiscPitchDegrees > 86
    || rotor.mainStageTopPercent < -3
    || rotor.mainStageTopPercent > 1
    || rotor.mainStageWidthPercent < 80
    || rotor.mainStageWidthPercent > 88
    || rotor.mainStageHeightPercent < 20
    || rotor.mainStageHeightPercent > 24
    || rotor.mainBladeCount !== 4
    || rotor.mainArcCount !== 3
    || rotor.mainBladeMode !== 'elliptic-motion-arcs-with-subdued-spokes-v1'
    || rotor.mainContrastMode !== 'graphite-low-contrast-motion-v1'
    || rotor.mainFilledDisc !== false
    || rotor.mainMinimumLegibleBladeSweeps !== 2
    || rotor.mainMinimumProjectedBladeLengthPixels < 520
    || rotor.mainMinimumProjectedBladeLengthPixels > 840
    || rotor.mainMinimumProjectedSweepSpanPixels < 1360
    || rotor.mainMinimumProjectedSweepSpanPixels > 1920
    || rotor.mainMinimumProjectedArcSpanPixels < 1280
    || rotor.mainMinimumProjectedArcSpanPixels > 2000
    || rotor.mainMinimumAuthoredBladeThicknessPixels < 2
    || rotor.mainMinimumAuthoredBladeThicknessPixels > 5
    || rotor.mainMinimumBladeOpacity < 0.18
    || rotor.mainMinimumBladeOpacity > 0.34
    || rotor.mainMaximumBladeOpacity < rotor.mainMinimumBladeOpacity
    || rotor.mainMaximumBladeOpacity > 0.42
    || rotor.mainMinimumScreenWidthFraction < 0.75
    || rotor.mainMaximumScreenWidthFraction > 0.92
    || rotor.mainStageWidthPercent / 100 < rotor.mainMinimumScreenWidthFraction
    || rotor.mainStageWidthPercent / 100 > rotor.mainMaximumScreenWidthFraction
    || rotor.mainMinimumScreenHeightFraction < 0.16
    || rotor.mainMaximumScreenHeightFraction > 0.26
    || rotor.mainStageHeightPercent / 100 < rotor.mainMinimumScreenHeightFraction
    || rotor.mainStageHeightPercent / 100 > rotor.mainMaximumScreenHeightFraction
    || rotor.mainMinimumScreenAreaFraction < 0.13
    || rotor.mainMaximumScreenAreaFraction > 0.22
    || !Number.isFinite(configuredRotorArea)
    || !Number.isFinite(configuredRotorTop)
    || !Number.isFinite(configuredRotorBottom)
    || configuredRotorArea < rotor.mainMinimumScreenAreaFraction
    || configuredRotorArea > rotor.mainMaximumScreenAreaFraction
    || configuredRotorTop > rotor.mainMaximumStageTopFraction
    || configuredRotorBottom < rotor.mainMinimumStageBottomFraction
    || configuredRotorBottom > rotor.mainMaximumStageBottomFraction
    || rotor.mainMaximumStageBottomFraction >= 0.32
    || rotor.mainMaximumPoseShiftPixels < 8
    || rotor.mainMaximumPoseShiftPixels > 18
    || rotor.mainMaximumVerticalPoseShiftPixels < 2
    || rotor.mainMaximumVerticalPoseShiftPixels > 7
    || rotor.mainMaximumPoseBankDegrees < 1
    || rotor.mainMaximumPoseBankDegrees > 3
    || rotor.mainMaximumDiscPitchResponseDegrees < 0.3
    || rotor.mainMaximumDiscPitchResponseDegrees > 0.9
    || rotor.mainMaximumDiscYawResponseDegrees < 0.4
    || rotor.mainMaximumDiscYawResponseDegrees > 1.1
    || rotor.mainMinimumHubDiameterPixels < 32
    || rotor.mainMinimumHubDiameterPixels > 60
    || rotor.mainMinimumHubCanopyOverlapPixels < 4
    || rotor.mainMinimumHubCanopyOverlapPixels > 16
    || rotor.mainMaximumHubCanopyOcclusionFraction < 0.35
    || rotor.mainMaximumHubCanopyOcclusionFraction > 0.7
    || rotor.mainMinimumMastCanopyOverlapPixels < 12
    || rotor.mainMinimumMastCanopyOverlapPixels > 28
    || rotor.mainCanopyHeaderWidthPercent < 28
    || rotor.mainCanopyHeaderWidthPercent > 40
    || rotor.mainStructuralTieInsetPercent < 12
    || rotor.mainStructuralTieInsetPercent > 24
    || rotor.mainStructuralTieWidthPercent < 10
    || rotor.mainStructuralTieWidthPercent > 24
    || rotor.mainStructuralTieAngleDegrees < 4
    || rotor.mainStructuralTieAngleDegrees > 14
    || rotor.mainMinimumTieHeaderOverlapAreaPixels < 40
    || rotor.mainMinimumTieHeaderOverlapAreaPixels > 480
    || rotor.mainMinimumTieCanopyOverlapAreaPixels < 40
    || rotor.mainMinimumTieCanopyOverlapAreaPixels > 480
    || !Number.isFinite(configuredTieLeft)
    || !Number.isFinite(configuredTieRight)
    || !Number.isFinite(configuredHeaderLeft)
    || !Number.isFinite(configuredMaximumHorizontalShiftPercent)
    || configuredTieLeft + configuredMaximumHorizontalShiftPercent >= 24
    || configuredTieRight <= configuredHeaderLeft
    || rotor.mainMotionBlurTrailCount !== 2
    || rotor.mainNearTrailDegrees < 3
    || rotor.mainNearTrailDegrees > 6
    || rotor.mainFarTrailDegrees < 7
    || rotor.mainFarTrailDegrees > 12
    || rotor.mainFarTrailDegrees <= rotor.mainNearTrailDegrees
    || rotor.mainMotionBlurOpacity < 0.08
    || rotor.mainMotionBlurOpacity > 0.16
    || rotor.poseResponsive !== true
    || rotor.tailDiscYawDegrees < 50
    || rotor.tailDiscYawDegrees > 75
    || rotor.tailCameraReflection !== true
    || !['mast-hub', 'structural-ties', 'canopy-header', 'tail-boom'].every((layer) => rotor.occlusionLayers?.includes(layer))) {
    throw new Error('perspective-elliptic main/tail rotor projection contract is invalid');
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
  if (receipt.schemaVersion !== 4
    || receipt.captureId !== choreography.captureId
    || receipt.generatedAt !== generatedAt
    || receipt.recipeId !== choreography.recipeId
    || receipt.recipeDigest !== recipeDigest
    || receipt.source !== choreography.capture.source
    || receipt.backendRequired !== 'webgpu'
    || receipt.overlay?.scale !== 0.5
    || JSON.stringify(receipt.overlay?.referenceViewport) !== JSON.stringify(choreography.capture.overlayReferenceViewport)
    || receipt.overlay?.outputScale !== choreography.capture.overlayOutputScale
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
  const expectedCaptureTools = captureToolPaths.map(relative);
  if ((receipt.runtimeInputs?.captureTools ?? []).map((entry) => entry.path).join(',') !== expectedCaptureTools.join(',')) {
    throw new Error('runtime capture receipt capture-tool roster drifted');
  }
  for (const record of receipt.runtimeInputs.captureTools) {
    if (await sha256(path.join(root, record.path)) !== record.sha256) throw new Error(`runtime capture tool drifted after capture: ${record.path}`);
  }
  const currentCanonicalDependencies = canonicalArenaDependencies();
  if (JSON.stringify(receipt.runtimeInputs?.canonicalArenaDependencies) !== JSON.stringify(currentCanonicalDependencies)) {
    throw new Error('runtime capture receipt canonical arena dependencies drifted');
  }
  const currentDependencyClosure = await buildDependencyClosure(root, {
    extraPaths: currentCanonicalDependencies.arenas.flatMap((arena) => arena.localAssetPaths),
  });
  if (JSON.stringify(receipt.runtimeInputs?.dependencyClosure) !== JSON.stringify(currentDependencyClosure)) {
    throw new Error('runtime capture dependency closure drifted after capture');
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
    await assertFrames(evidence.arenaId);
    const currentFrameSet = await digestOrderedFrameSet(frameRoot, evidence.arenaId, choreography.frameCount);
    const expectedFrameSet = { ...currentFrameSet, frameRoster: expectedFrames };
    if (JSON.stringify(evidence.frameSet) !== JSON.stringify(expectedFrameSet)) {
      throw new Error(`${evidence.arenaId} staged PNG frame set no longer matches its capture receipt`);
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
        || !/^[0-9a-f]{64}$/.test(frame.pngSha256)
        || await sha256(path.join(frameRoot, evidence.arenaId, `frame-${String(frame.frame).padStart(4, '0')}.png`)) !== frame.pngSha256) {
        throw new Error(`${evidence.arenaId} review frame ${frame.frame} camera/visual evidence is invalid`);
      }
      if (recipe.kind === 'helicopter') {
        const projection = frame.rotorProjection;
        if (projection?.mode !== 'perspective-elliptic-motion-arcs'
          || projection.bladeCount !== choreography.helicopter.rotorPresentation.mainBladeCount
          || projection.arcCount !== choreography.helicopter.rotorPresentation.mainArcCount
          || projection.temporalTrailCount !== choreography.helicopter.rotorPresentation.mainMotionBlurTrailCount
          || projection.legibleBladeSweeps < choreography.helicopter.rotorPresentation.mainMinimumLegibleBladeSweeps
          || projection.projectedBladeThresholdPixels !== choreography.helicopter.rotorPresentation.mainMinimumProjectedBladeLengthPixels
          || !Number.isFinite(projection.shortestProjectedBladeLengthPixels)
          || projection.projectedSweepSpanPixels < choreography.helicopter.rotorPresentation.mainMinimumProjectedSweepSpanPixels
          || projection.projectedArcSpanPixels < choreography.helicopter.rotorPresentation.mainMinimumProjectedArcSpanPixels
          || projection.authoredBladeThicknessPixels < choreography.helicopter.rotorPresentation.mainMinimumAuthoredBladeThicknessPixels
          || projection.bladeOpacity < choreography.helicopter.rotorPresentation.mainMinimumBladeOpacity
          || projection.bladeOpacity > choreography.helicopter.rotorPresentation.mainMaximumBladeOpacity
          || projection.contrastMode !== choreography.helicopter.rotorPresentation.mainContrastMode
          || projection.filledDiscDetected !== false
          || projection.stageTopFraction > choreography.helicopter.rotorPresentation.mainMaximumStageTopFraction
          || projection.stageBottomFraction < choreography.helicopter.rotorPresentation.mainMinimumStageBottomFraction
          || projection.stageBottomFraction > choreography.helicopter.rotorPresentation.mainMaximumStageBottomFraction
          || projection.stageWidthFraction < choreography.helicopter.rotorPresentation.mainMinimumScreenWidthFraction
          || projection.stageWidthFraction > choreography.helicopter.rotorPresentation.mainMaximumScreenWidthFraction
          || projection.stageHeightFraction < choreography.helicopter.rotorPresentation.mainMinimumScreenHeightFraction
          || projection.stageHeightFraction > choreography.helicopter.rotorPresentation.mainMaximumScreenHeightFraction
          || projection.stageAreaFraction < choreography.helicopter.rotorPresentation.mainMinimumScreenAreaFraction
          || projection.stageAreaFraction > choreography.helicopter.rotorPresentation.mainMaximumScreenAreaFraction
          || projection.hubDiameterPixels < choreography.helicopter.rotorPresentation.mainMinimumHubDiameterPixels
          || projection.hubCanopyOverlapPixels < choreography.helicopter.rotorPresentation.mainMinimumHubCanopyOverlapPixels
          || projection.hubCanopyOcclusionFraction > choreography.helicopter.rotorPresentation.mainMaximumHubCanopyOcclusionFraction
          || projection.mastCanopyOverlapPixels < choreography.helicopter.rotorPresentation.mainMinimumMastCanopyOverlapPixels
          || projection.structuralTieCount !== 2
          || projection.leftTieHeaderOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieHeaderOverlapAreaPixels
          || projection.rightTieHeaderOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieHeaderOverlapAreaPixels
          || projection.leftTieCanopyOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieCanopyOverlapAreaPixels
          || projection.rightTieCanopyOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieCanopyOverlapAreaPixels
          || projection.leftTieHeaderOcclusionSampled !== true
          || projection.rightTieHeaderOcclusionSampled !== true
          || projection.leftTieCanopyOcclusionSampled !== true
          || projection.rightTieCanopyOcclusionSampled !== true
          || projection.hubCanopyOcclusionSampled !== true
          || projection.mastCanopyOcclusionSampled !== true
          || projection.occlusionStackValid !== true
          || projection.reticleClear !== true
          || projection.tailOpticClear !== true
          || projection.poseResponsive !== true
          || !Number.isFinite(projection.poseShiftXPixels)
          || !Number.isFinite(projection.poseShiftYPixels)
          || !Number.isFinite(projection.poseBankDegrees)
          || !Number.isFinite(projection.discPitchResponseDegrees)
          || !Number.isFinite(projection.discYawResponseDegrees)
          || Math.abs(projection.poseShiftXPixels) > choreography.helicopter.rotorPresentation.mainMaximumPoseShiftPixels
          || Math.abs(projection.poseShiftYPixels) > choreography.helicopter.rotorPresentation.mainMaximumVerticalPoseShiftPixels
          || Math.abs(projection.poseBankDegrees) > choreography.helicopter.rotorPresentation.mainMaximumPoseBankDegrees
          || Math.abs(projection.discPitchResponseDegrees) > choreography.helicopter.rotorPresentation.mainMaximumDiscPitchResponseDegrees
          || Math.abs(projection.discYawResponseDegrees) > choreography.helicopter.rotorPresentation.mainMaximumDiscYawResponseDegrees
          || projection.poseTransform === 'none') {
          throw new Error(`${evidence.arenaId} review frame ${frame.frame} does not prove the perspective-elliptic rotor projection`);
        }
      } else if (frame.rotorProjection !== undefined) {
        throw new Error(`${evidence.arenaId} cat review frame ${frame.frame} unexpectedly contains helicopter rotor evidence`);
      }
    }
    const firstReview = evidence.reviewFrames.find((entry) => entry.frame === 1);
    const seamReview = evidence.reviewFrames.find((entry) => entry.frame === choreography.frameCount);
    if (!firstReview || !seamReview || seamReview.seamSourceFrame !== 1 || seamReview.pngSha256 !== firstReview.pngSha256) {
      throw new Error(`${evidence.arenaId} does not prove the exact copied first/final loop seam`);
    }
  }
  return { receipt, currentCanonicalDependencies, currentDependencyClosure };
}

function audioSource(kind) {
  const duration = choreography.durationSeconds;
  return kind === 'helicopter'
    ? `aevalsrc=0.015*(1+0.28*sin(2*PI*8*t))*sin(2*PI*43*t)+0.006*sin(2*PI*86*t)+0.003*sin(2*PI*4*t):s=48000:d=${duration}`
    : `aevalsrc=0.005*sin(2*PI*63*t)+0.0025*sin(2*PI*126*t)+0.0015*sin(2*PI*252*t):s=48000:d=${duration}`;
}

const rate = (value) => `${value}k`;

function probeMedia(file) {
  const result = run('ffprobe', [
    '-v', 'error', '-count_frames',
    '-show_entries', 'format=duration,size,bit_rate:stream=index,codec_type,codec_name,codec_tag_string,profile,level,pix_fmt,color_range,color_space,color_transfer,color_primaries,width,height,r_frame_rate,nb_read_frames,duration',
    '-of', 'json', file,
  ]);
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`ffprobe returned invalid JSON for ${relative(file)}: ${error.message}`);
  }
}

function assertStagedVideo(file, profile) {
  const probe = probeMedia(file);
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration ?? video?.duration);
  const sizeBytes = Number(probe.format?.size);
  const averageBitrateKbps = Number.isFinite(Number(probe.format?.bit_rate))
    ? Number(probe.format.bit_rate) / 1000
    : sizeBytes * 8 / duration / 1000;
  const budget = choreography.media.encodingBudget;
  const colour = choreography.media.encodingProfiles.colour;
  if (video?.codec_name !== profile.videoCodec
    || audio?.codec_name !== profile.audioCodec
    || video?.width !== choreography.capture.viewport[0]
    || video?.height !== choreography.capture.viewport[1]
    || video?.r_frame_rate !== `${choreography.fps}/1`
    || Number(video?.nb_read_frames) !== choreography.frameCount
    || !Number.isFinite(duration)
    || Math.abs(duration - choreography.durationSeconds) > 0.08
    || video?.pix_fmt !== colour.pixelFormat
    || video?.color_primaries !== colour.primaries
    || video?.color_transfer !== colour.transfer
    || video?.color_space !== colour.space
    || video?.color_range !== colour.range) {
    throw new Error(`${relative(file)} does not satisfy the canonical 2560x1440/30 FPS/BT.709 stream contract: ${JSON.stringify({ format: probe.format, video, audio })}`);
  }
  if (profile.videoCodec === 'h264'
    && (String(video?.profile ?? '').toLowerCase() !== profile.profile
      || Number(video?.level) !== Number(profile.level) * 10
      || video?.codec_tag_string !== profile.codecTag)) {
    throw new Error(`${relative(file)} is not H.264 High Level 5.0 with an avc1 sample entry`);
  }
  if (!Number.isFinite(sizeBytes)
    || sizeBytes > budget.maximumBytesPerVideo
    || !Number.isFinite(averageBitrateKbps)
    || averageBitrateKbps < budget.minimumAverageBitrateKbps
    || averageBitrateKbps > budget.maximumAverageBitrateKbps) {
    throw new Error(`${relative(file)} violates the 1440p bitrate/file-size budget (${averageBitrateKbps.toFixed(1)} kbps, ${sizeBytes} bytes)`);
  }
}

function assertStagedImage(file, width, height, maximumBytes) {
  const probe = probeMedia(file);
  const image = probe.streams?.find((stream) => stream.codec_type === 'video');
  const sizeBytes = Number(probe.format?.size);
  if (image?.codec_name !== 'webp'
    || image?.width !== width
    || image?.height !== height
    || !Number.isFinite(sizeBytes)
    || sizeBytes > maximumBytes) {
    throw new Error(`${relative(file)} violates the ${width}x${height} WebP/${maximumBytes}-byte contract`);
  }
}

function assertStagedMedia(arena, runtimeOutputRoot, reviewOutputRoot) {
  assertStagedVideo(path.join(runtimeOutputRoot, `${arena}.mp4`), choreography.media.encodingProfiles.mp4);
  assertStagedVideo(path.join(runtimeOutputRoot, `${arena}.webm`), choreography.media.encodingProfiles.webm);
  assertStagedImage(
    path.join(runtimeOutputRoot, `${arena}.webp`),
    choreography.capture.viewport[0],
    choreography.capture.viewport[1],
    choreography.media.encodingBudget.maximumPosterBytes,
  );
  assertStagedImage(
    path.join(reviewOutputRoot, `${arena}-review-frames.webp`),
    choreography.media.encodingProfiles.images.reviewFrameWidth * choreography.reviewFrames.length,
    choreography.media.encodingProfiles.images.reviewFrameHeight,
    choreography.media.encodingBudget.maximumReviewSheetBytes,
  );
}

function transcode(arena, outputRoot = runtimeRoot) {
  const recipe = choreography.arenas[arena];
  const input = path.join(frameRoot, arena, 'frame-%04d.png');
  const mp4 = path.join(outputRoot, `${arena}.mp4`);
  const webm = path.join(outputRoot, `${arena}.webm`);
  const poster = path.join(outputRoot, `${arena}.webp`);
  const mp4Profile = choreography.media.encodingProfiles.mp4;
  const webmProfile = choreography.media.encodingProfiles.webm;
  const webmAudioEncoder = webmProfile.audioCodec === 'opus' && ffmpegSupportsEncoder('libopus')
    ? 'libopus'
    : webmProfile.audioCodec;
  const webmAudioCompatibility = webmAudioEncoder === 'opus' ? ['-strict', '-2'] : [];
  const images = choreography.media.encodingProfiles.images;
  const colour = choreography.media.encodingProfiles.colour;
  const common = [
    '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(choreography.fps),
    '-start_number', '1', '-i', input, '-f', 'lavfi', '-i', audioSource(recipe.kind),
    '-fflags', '+bitexact', '-map_metadata', '-1', '-map', '0:v:0', '-map', '1:a:0',
    '-t', String(choreography.durationSeconds),
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
    '-c:v', mp4Profile.encoder,
    '-preset', 'slow',
    '-profile:v', mp4Profile.profile,
    '-level:v', mp4Profile.level,
    '-tag:v', mp4Profile.codecTag,
    '-b:v', rate(mp4Profile.targetVideoBitrateKbps),
    '-minrate', rate(mp4Profile.minimumVideoBitrateKbps),
    '-maxrate', rate(mp4Profile.maximumVideoBitrateKbps),
    '-bufsize', rate(mp4Profile.bufferSizeKbps),
    '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-threads:v', '1',
    '-x264-params', 'threads=1:lookahead_threads=1:sliced_threads=0:nal-hrd=vbr:force-cfr=1:colorprim=bt709:transfer=bt709:colormatrix=bt709:range=limited',
    '-flags:v', '+bitexact',
    ...colourArgs,
    '-movflags', '+faststart',
    '-c:a', mp4Profile.audioCodec,
    '-threads:a', '1',
    '-flags:a', '+bitexact',
    '-b:a', rate(mp4Profile.audioBitrateKbps),
    mp4,
  ]);
  run('ffmpeg', [
    ...common,
    '-vf', 'setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    '-c:v', webmProfile.encoder,
    '-profile:v', String(webmProfile.profile),
    '-crf', String(webmProfile.crf),
    '-b:v', rate(webmProfile.targetVideoBitrateKbps),
    '-minrate', rate(webmProfile.minimumVideoBitrateKbps),
    '-maxrate', rate(webmProfile.maximumVideoBitrateKbps),
    '-bufsize', rate(webmProfile.bufferSizeKbps),
    '-g', '60', '-row-mt', '1', '-deadline', 'good', '-cpu-used', String(webmProfile.cpuUsed),
    '-flags:v', '+bitexact',
    ...colourArgs,
    '-c:a', webmAudioEncoder,
    ...webmAudioCompatibility,
    '-flags:a', '+bitexact',
    '-b:a', rate(webmProfile.audioBitrateKbps),
    webm,
  ]);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact', '-i', path.join(frameRoot, arena, `frame-${String(recipe.posterFrame).padStart(4, '0')}.png`), '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(images.posterQuality), poster]);
}

function createReviewSheet(arena, outputRoot = reviewRoot) {
  const images = choreography.media.encodingProfiles.images;
  const inputs = choreography.reviewFrames.flatMap((frame) => ['-i', path.join(frameRoot, arena, `frame-${String(frame).padStart(4, '0')}.png`)]);
  const scales = choreography.reviewFrames.map((_, index) => `[${index}:v]scale=${images.reviewFrameWidth}:${images.reviewFrameHeight}:flags=lanczos[r${index}]`).join(';');
  const labels = choreography.reviewFrames.map((_, index) => `[r${index}]`).join('');
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', `${scales};${labels}hstack=inputs=${choreography.reviewFrames.length}[review]`, '-map', '[review]', '-map_metadata', '-1', '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(images.reviewQuality), path.join(outputRoot, `${arena}-review-frames.webp`)]);
}

async function fileRecord(file, extra = {}) {
  return { path: relative(file), sha256: await sha256(file), ...extra };
}

function sourceRecord(arena, canonicalDependencies, dependencyClosure) {
  const canonical = canonicalDependencies.arenas.find((entry) => entry.arenaId === arena);
  if (!canonical) throw new Error(`Canonical dependency manifest is missing ${arena}`);
  return {
    arenaId: arena,
    kind: choreography.arenas[arena].kind,
    seed: choreography.arenas[arena].seed,
    fovDegrees: choreography.arenas[arena].fovDegrees,
    reviewLabel: choreography.arenas[arena].reviewLabel,
    source: 'authoritative-runtime-arena',
    canonicalVisualModule: canonical,
    dependencyClosureTreeSha256: dependencyClosure.treeSha256,
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
const {
  receipt: captureReceipt,
  currentCanonicalDependencies,
  currentDependencyClosure,
} = await assertCaptureReceipt();
const actualCockpitEvidenceDigest = await sha256(acceptedCockpitEvidencePath);
if (actualCockpitEvidenceDigest !== acceptedCockpitDigest) {
  throw new Error(`Accepted cockpit evidence digest drifted: expected ${acceptedCockpitDigest}, got ${actualCockpitEvidenceDigest}`);
}
const retainedCacheFamilyLock = JSON.parse(await readFile(cacheFamilyLockPath, 'utf8'));
const retainedCacheLockIssues = cacheFamilyLockFailures(retainedCacheFamilyLock, RETAINED_CACHE_FAMILY_BASELINE);
if (retainedCacheLockIssues.length > 0) throw new Error(retainedCacheLockIssues.join(' | '));
const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'atomic-acres-pass65-menu-preview-finalize-'));
const stagingRuntimeRoot = path.join(stagingRoot, 'runtime');
const stagingReviewRoot = path.join(stagingRoot, 'review');
let finalMediaSet;
let nextCacheFamilyLock;
try {
  await mkdir(stagingRuntimeRoot, { recursive: true });
  await mkdir(stagingReviewRoot, { recursive: true });
  for (const arena of arenas) {
    transcode(arena, stagingRuntimeRoot);
    createReviewSheet(arena, stagingReviewRoot);
    assertStagedMedia(arena, stagingRuntimeRoot, stagingReviewRoot);
  }
  finalMediaSet = await digestFinalMediaSet(stagingRuntimeRoot, arenas);
  const cacheResult = appendCacheFamily(retainedCacheFamilyLock, {
    cacheKey: choreography.media.cacheKey,
    recipeId: choreography.recipeId,
    finalMediaSetSha256: finalMediaSet.sha256,
    fileCount: finalMediaSet.fileCount,
    totalBytes: finalMediaSet.totalBytes,
    recordedAt: generatedAt,
  });
  nextCacheFamilyLock = cacheResult.lock;
  for (const arena of arenas) {
    for (const extension of ['mp4', 'webm', 'webp']) {
      await copyFile(path.join(stagingRuntimeRoot, `${arena}.${extension}`), path.join(runtimeRoot, `${arena}.${extension}`));
    }
    await copyFile(path.join(stagingReviewRoot, `${arena}-review-frames.webp`), path.join(reviewRoot, `${arena}-review-frames.webp`));
  }
  if (cacheResult.appended) await writeFile(cacheFamilyLockPath, `${JSON.stringify(nextCacheFamilyLock, null, 2)}\n`, 'utf8');
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}

const sources = [];
const runtimeFiles = [];
const reviewEvidence = [];
for (const arena of arenas) {
  sources.push(sourceRecord(arena, currentCanonicalDependencies, currentDependencyClosure));
  for (const extension of ['mp4', 'webm', 'webp']) runtimeFiles.push(await fileRecord(path.join(runtimeRoot, `${arena}.${extension}`), { arenaId: arena, extension }));
  reviewEvidence.push(await fileRecord(path.join(reviewRoot, `${arena}-review-frames.webp`), { arenaId: arena, frames: choreography.reviewFrames }));
}

const provenance = {
  schemaVersion: 4,
  assetId: 'atomic-acres-pass65-prerecorded-menu-previews-2026-07-26',
  generatedAt,
  creator: 'Atomic Acres project',
  license: 'Original project work',
  releaseState: 'HITL candidate only',
  choreography: await fileRecord(choreographyPath, { recipeId: choreography.recipeId }),
  documentation: await fileRecord(documentationPath),
  generator: await fileRecord(generatorPath, { engine: 'Playwright installed Chrome hardware WebGPU', deterministicCapture: true }),
  finalizer: await fileRecord(finalizerPath, { ffmpeg: 'required' }),
  verification: await fileRecord(verifierPath, { failClosed: true }),
  captureReceipt: await fileRecord(captureReceiptPath, { captureId: captureReceipt.captureId, backend: 'webgpu' }),
  captureTools: await Promise.all(captureToolPaths.map((file) => fileRecord(file))),
  canonicalArenaDependencies: currentCanonicalDependencies,
  dependencyClosure: {
    schemaVersion: currentDependencyClosure.schemaVersion,
    algorithm: currentDependencyClosure.algorithm,
    roots: currentDependencyClosure.roots,
    excludes: currentDependencyClosure.excludes,
    extraPaths: currentDependencyClosure.extraPaths,
    fileCount: currentDependencyClosure.fileCount,
    totalBytes: currentDependencyClosure.totalBytes,
    treeSha256: currentDependencyClosure.treeSha256,
  },
  cacheFamilyLock: await fileRecord(cacheFamilyLockPath, {
    cacheKey: choreography.media.cacheKey,
    finalMediaSetSha256: finalMediaSet.sha256,
  }),
  authoredCockpit: {
    assetId: 'chopper-gunner-vehicle-v1',
    ...(await fileRecord(chopperSourcePath)),
    qualityTier: 'LOD0',
    role: 'visual design reference; compact black-grey treatment is baked offline over runtime footage',
    evidence: acceptedCockpitEvidence,
    evidenceSha256: actualCockpitEvidenceDigest,
  },
  sources,
  render: {
    masterFrames: `${choreography.frameCount} PNG frames per arena (intermediate frames excluded from git)`,
    dimensions: choreography.capture.viewport.join('x'),
    frameRate: choreography.fps,
    durationSeconds: choreography.durationSeconds,
    mapSource: 'Selected authoritative production runtime arena under hardware WebGPU',
    motion: 'Canonical deterministic cyclic camera paths over fixed runtime visual time',
    helicopter: 'Perspective-aware elliptic rotor arcs with subdued moving spokes, measured hub/mast/header occlusion, visible structural ties into both side canopy rails, and a compact graphite cockpit with restrained green avionics and an unobstructed sightline baked offline',
    cat: 'Compact charcoal/silver feline crown, articulated ears, forelegs and top-facing paws baked offline over the authoritative Gun Range moving-target scene',
    overlayScale: choreography.capture.overlayScale,
    overlayReferenceViewport: choreography.capture.overlayReferenceViewport,
    overlayOutputScale: choreography.capture.overlayOutputScale,
    audio: choreography.media.audioProfiles,
    encodingProfiles: choreography.media.encodingProfiles,
    encodingBudget: choreography.media.encodingBudget,
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
record.format = 'Four distinct 2560x1440 eight-second 30 FPS selected-map runtime captures, shipped as high-bitrate VP9/Opus WebM, H.264 High Level 5.0/AAC MP4 and full-resolution static WebP posters, plus deterministic five-frame review evidence';
record.modifications = 'Captured offline at native 1440p from each actual authoritative production WebGPU arena with deterministic camera and visual time; the reviewed 1280x720 logical overlay is losslessly authored at exact 2x output scale so its fixed-pixel details retain their intended proportions. Three map flyovers bake perspective-aware elliptic rotor arcs with subdued moving spokes, measured mast/hub/header occlusion, two visible structural ties into the side canopy rails, a restrained tail camera and compact green-on-graphite cockpit avionics; Gun Range bakes compact charcoal/silver ears, forelegs and top-facing paws. Runtime loading/menu playback remains one selected metadata-preload decoder with poster-first readiness, reduced motion is poster-only, and no downloaded or sampled assets are used. The former byte-identical Gun Range media gate is explicitly superseded.';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ releaseState: provenance.releaseState, recipeId: choreography.recipeId, source: choreography.capture.source, arenas, runtimeFiles: runtimeFiles.length, reviewSheets: reviewEvidence.length }, null, 2));
