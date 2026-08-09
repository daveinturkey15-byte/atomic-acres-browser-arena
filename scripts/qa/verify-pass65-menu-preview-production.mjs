import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildDependencyClosure,
  cacheFamilyLockFailures,
  digestFinalMediaSet,
  RETAINED_CACHE_FAMILY_BASELINE,
  runIntegrityMutationSelfTest,
} from '../assets/pass65-menu-preview-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const verifierPath = fileURLToPath(import.meta.url);
const sourceRoot = path.join(root, 'source-assets/menu/pass65-preview-masters');
const provenancePath = path.join(sourceRoot, 'provenance.json');
const choreographyPath = path.join(sourceRoot, 'choreography.json');
const documentationPath = path.join(sourceRoot, 'README.md');
const captureReceiptPath = path.join(sourceRoot, 'runtime-capture-receipt.json');
const cacheFamilyLockPath = path.join(sourceRoot, 'cache-family-lock.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts');
const integrityPath = path.join(root, 'scripts/assets/pass65-menu-preview-integrity.mjs');
const integrityTypesPath = path.join(root, 'scripts/assets/pass65-menu-preview-integrity.d.mts');
const dependencyManifestPath = path.join(root, 'scripts/assets/pass65-menu-preview-arena-dependencies.ts');
const dependencyPrinterPath = path.join(root, 'scripts/assets/print-pass65-menu-preview-arena-dependencies.ts');
const finalizerPath = path.join(root, 'scripts/assets/finalize_pass65_menu_previews.mjs');
const runtimeSourcePath = path.join(root, 'src/ui/menu-preview-video.ts');
const runtimeEntryPath = path.join(root, 'src/legacy-main.ts');
const cameraEvaluatorPath = path.join(root, 'src/ui/menu-preview-camera.ts');
const acceptedCockpitEvidence = 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png';
const acceptedCockpitDigest = '2bc59c95e2be10ab3146627bb781d3b2536c273e8658978c753ce180515c9760';
const requiredGenerationDate = '2026-08-02';
const arenas = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
const helicopterArenas = arenas.slice(0, 3);
const captureToolPaths = [generatorPath, integrityPath, integrityTypesPath, dependencyManifestPath];
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

function canonicalArenaDependencies() {
  return runJson(process.execPath, ['--import', 'tsx', dependencyPrinterPath], 'canonical Pass 65 arena dependency manifest');
}

function inspectMedia(file) {
  return runJson('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'format=duration,size,bit_rate:stream=index,codec_type,codec_name,codec_tag_string,profile,level,pix_fmt,color_range,color_space,color_transfer,color_primaries,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', file], `ffprobe ${relative(file)}`);
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

function validateVideo(file, container, recipe, arena) {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const encoding = recipe.media.encodingProfiles[container];
  const colour = recipe.media.encodingProfiles.colour;
  const duration = Number(probe.format?.duration ?? video?.duration);
  const frameCount = Number(video?.nb_read_frames);
  const sizeBytes = Number(probe.format?.size);
  const averageBitrateKbps = Number.isFinite(Number(probe.format?.bit_rate))
    ? Number(probe.format.bit_rate) / 1000
    : sizeBytes * 8 / duration / 1000;
  const budget = recipe.media.encodingBudget;
  if (video?.codec_name !== encoding.videoCodec) failures.push(`${relative(file)} must use ${encoding.videoCodec} video`);
  if (audio?.codec_name !== encoding.audioCodec) failures.push(`${relative(file)} must include ${encoding.audioCodec} audio`);
  if (video?.width !== recipe.capture.viewport[0] || video?.height !== recipe.capture.viewport[1]) failures.push(`${relative(file)} must be ${recipe.capture.viewport.join('x')}`);
  if (video?.r_frame_rate !== `${recipe.fps}/1`) failures.push(`${relative(file)} must be ${recipe.fps} FPS`);
  if (frameCount !== recipe.frameCount) failures.push(`${relative(file)} must contain exactly ${recipe.frameCount} frames`);
  if (!Number.isFinite(duration) || Math.abs(duration - recipe.durationSeconds) > 0.08) failures.push(`${relative(file)} must be ${recipe.durationSeconds} seconds`);
  if (video?.pix_fmt !== colour.pixelFormat
    || video?.color_primaries !== colour.primaries
    || video?.color_transfer !== colour.transfer
    || video?.color_space !== colour.space
    || video?.color_range !== colour.range) failures.push(`${relative(file)} must declare the canonical BT.709 limited-range ${colour.pixelFormat} delivery metadata`);
  if (container === 'mp4'
    && (String(video?.profile ?? '').toLowerCase() !== encoding.profile
      || Number(video?.level) !== Number(encoding.level) * 10
      || video?.codec_tag_string !== encoding.codecTag)) failures.push(`${relative(file)} must be H.264 High Level 5.0 with an avc1 sample entry`);
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
  mediaAudits.push({ path: relative(file), videoCodec: video?.codec_name, audioCodec: audio?.codec_name, profile: video?.profile, level: video?.level, codecTag: video?.codec_tag_string, colour: { pixelFormat: video?.pix_fmt, range: video?.color_range, space: video?.color_space, transfer: video?.color_transfer, primaries: video?.color_primaries }, frameCount, durationSeconds: duration, sizeBytes, averageBitrateKbps, audioPeakDb: peak, seamMeanAbsoluteDifference: seamDifference, midpointMeanAbsoluteDifference: motionDifference });
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

function rotorContractFailures(recipe, generatorSource) {
  const issues = [];
  const rotor = recipe.helicopter?.rotorPresentation;
  const configuredArea = rotor?.mainStageWidthPercent / 100 * rotor?.mainStageHeightPercent / 100;
  const configuredTop = rotor?.mainStageTopPercent / 100;
  const configuredBottom = (rotor?.mainStageTopPercent + rotor?.mainStageHeightPercent) / 100;
  const configuredStageLeft = (100 - rotor?.mainStageWidthPercent) / 2;
  const configuredTieLeft = configuredStageLeft + rotor?.mainStageWidthPercent * rotor?.mainStructuralTieInsetPercent / 100;
  const configuredTieRight = configuredTieLeft + rotor?.mainStageWidthPercent * rotor?.mainStructuralTieWidthPercent / 100;
  const configuredHeaderLeft = configuredStageLeft + rotor?.mainStageWidthPercent * (100 - rotor?.mainCanopyHeaderWidthPercent) / 200;
  const configuredMaximumHorizontalShiftPercent = rotor?.mainMaximumPoseShiftPixels
    * recipe.capture?.overlayOutputScale / recipe.capture?.viewport?.[0] * 100;
  if (rotor?.id !== 'perspective-elliptic-cockpit-rotor-rig-v1'
    || rotor.mainTurnsPerLoop !== recipe.helicopter?.rotorTurnsPerLoop
    || rotor.mainTurnsPerLoop <= 0
    || rotor.tailTurnsPerLoop !== rotor.mainTurnsPerLoop * 3
    || rotor.mainDiscPitchDegrees < 78
    || rotor.mainDiscPitchDegrees > 86) {
    issues.push('rotor identity, forward spin cadence, or perspective pitch drifted');
  }
  if (!Number.isFinite(configuredArea)
    || !Number.isFinite(configuredTop)
    || !Number.isFinite(configuredBottom)
    || rotor.mainStageTopPercent < -3
    || rotor.mainStageTopPercent > 1
    || rotor.mainStageWidthPercent < 80
    || rotor.mainStageWidthPercent > 88
    || rotor.mainStageHeightPercent < 20
    || rotor.mainStageHeightPercent > 24
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
    || configuredArea < rotor.mainMinimumScreenAreaFraction
    || configuredArea > rotor.mainMaximumScreenAreaFraction
    || configuredTop > rotor.mainMaximumStageTopFraction
    || configuredBottom < rotor.mainMinimumStageBottomFraction
    || configuredBottom > rotor.mainMaximumStageBottomFraction
    || rotor.mainMaximumStageBottomFraction >= 0.32) {
    issues.push('main rotor must occupy a broad but upper-windscreen-bounded transparent stage');
  }
  if (rotor.mainBladeCount !== 4
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
    || rotor.mainMaximumBladeOpacity > 0.42) {
    issues.push('main rotor physical blade, elliptic arc, thickness, or subdued alpha contract drifted');
  }
  if (rotor.mainMotionBlurTrailCount !== 2
    || rotor.mainNearTrailDegrees < 3
    || rotor.mainNearTrailDegrees > 6
    || rotor.mainFarTrailDegrees < 7
    || rotor.mainFarTrailDegrees > 12
    || rotor.mainFarTrailDegrees <= rotor.mainNearTrailDegrees
    || rotor.mainMotionBlurOpacity < 0.08
    || rotor.mainMotionBlurOpacity > 0.16) {
    issues.push('main rotor must use exactly two restrained temporal motion-blur trails');
  }
  if (rotor.mainMaximumPoseShiftPixels < 8
    || rotor.mainMaximumPoseShiftPixels > 18
    || rotor.mainMaximumVerticalPoseShiftPixels < 2
    || rotor.mainMaximumVerticalPoseShiftPixels > 7
    || rotor.mainMaximumPoseBankDegrees < 1
    || rotor.mainMaximumPoseBankDegrees > 3
    || rotor.mainMaximumDiscPitchResponseDegrees < 0.3
    || rotor.mainMaximumDiscPitchResponseDegrees > 0.9
    || rotor.mainMaximumDiscYawResponseDegrees < 0.4
    || rotor.mainMaximumDiscYawResponseDegrees > 1.1
    || rotor.poseResponsive !== true) {
    issues.push('main rotor bounded stage and disc pose response contract drifted');
  }
  if (rotor.mainMinimumHubDiameterPixels < 32
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
    || !['mast-hub', 'structural-ties', 'canopy-header', 'tail-boom'].every((layer) => rotor.occlusionLayers?.includes(layer))) {
    issues.push('hub, mast, structural ties, and canopy-header occlusion contract drifted');
  }
  if (rotor.tailDiscYawDegrees < 50
    || rotor.tailDiscYawDegrees > 75
    || rotor.tailCameraReflection !== true) {
    issues.push('tail-optic perspective contract drifted');
  }

  const mainStart = generatorSource.indexOf('.aa-main-rotor-stage');
  const tailStart = generatorSource.indexOf('.aa-tail-rotor-camera');
  const mainSource = mainStart >= 0 && tailStart > mainStart ? generatorSource.slice(mainStart, tailStart) : '';
  const ruleSlice = (start, end) => {
    const from = mainSource.indexOf(start);
    const to = mainSource.indexOf(end, from + start.length);
    return from >= 0 && to > from ? mainSource.slice(from, to) : '';
  };
  const stageRule = ruleSlice('.aa-main-rotor-stage{', '.aa-main-rotor-arc{');
  const arcRule = ruleSlice('.aa-main-rotor-arc{', '.aa-main-rotor-plane{');
  const planeRule = ruleSlice('.aa-main-rotor-plane{', '.aa-main-rotor-blade{');
  const bladeRule = ruleSlice('.aa-main-rotor-blade{', '.aa-main-rotor-blade:before,.aa-main-rotor-blade:after{');
  const tieRule = ruleSlice('.aa-main-rotor-structural-tie{', '.aa-main-rotor-structural-tie.left{');
  const canopyHeaderRule = ruleSlice('.aa-main-rotor-canopy-header{', '.aa-main-rotor-canopy-header:before{');
  const bladeElements = (generatorSource.match(/class="aa-main-rotor-blade"><\/i>/g) ?? []).length;
  const arcElements = (generatorSource.match(/class="aa-main-rotor-arc (?:near|mid|far)"><\/i>/g) ?? []).length;
  const tieElements = (generatorSource.match(/class="aa-main-rotor-structural-tie (?:left|right)"><\/i>/g) ?? []).length;
  for (const marker of [
    'data-projection="perspective-elliptic-motion-arcs"',
    'data-contrast="graphite-low-contrast-motion-v1"',
    'data-occlusion-order="rotor-arcs<rotor-plane<mast-hub<structural-ties<canopy-header"',
    'top:${rotorPresentation.mainStageTopPercent}%',
    'width:${rotorPresentation.mainStageWidthPercent}%',
    'height:${rotorPresentation.mainStageHeightPercent}%',
    '.aa-main-rotor-blade:before,.aa-main-rotor-blade:after',
    '.aa-main-rotor-blade:before{',
    '.aa-main-rotor-blade:after',
    '--aa-main-rotor-shift-x',
    '--aa-main-rotor-shift-y',
    '--aa-main-rotor-bank',
    '--aa-main-rotor-pitch-response',
    '--aa-main-rotor-yaw-response',
    "overlay.dataset.rotorPoseResponsive = 'true'",
    'overlay.dataset.minimumProjectedBladeLength',
    'overlay.dataset.minimumProjectedSweepSpan',
    'overlay.dataset.minimumProjectedArcSpan',
    'overlay.dataset.rotorDiscPitchResponse',
    'overlay.dataset.rotorDiscYawResponse',
    '.aa-main-rotor-mast',
    '.aa-main-rotor-hub',
    '.aa-main-rotor-structural-tie',
    '.aa-main-rotor-canopy-header',
    'hubCanopyOverlapPixels',
    'mastCanopyOverlapPixels',
    'leftTieHeaderOverlapAreaPixels',
    'rightTieHeaderOverlapAreaPixels',
    'leftTieCanopyOverlapAreaPixels',
    'rightTieCanopyOverlapAreaPixels',
    'leftTieHeaderOcclusionSampled',
    'rightTieHeaderOcclusionSampled',
    'leftTieCanopyOcclusionSampled',
    'rightTieCanopyOcclusionSampled',
    'hubCanopyOcclusionSampled',
    'mastCanopyOcclusionSampled',
    'document.elementsFromPoint',
    'occlusionStackValid',
    'reticleClear',
    'tailOpticClear',
    'filledDiscDetected',
  ]) if (!generatorSource.includes(marker)) issues.push(`rotor generator is missing ${marker}`);
  if (!mainSource || !stageRule || !arcRule || !planeRule || !bladeRule) issues.push('main rotor source boundary/stage/arc/plane/blade rule is missing');
  if (!mainSource.includes('overflow:hidden') || !stageRule.includes('isolation:isolate')) issues.push('main rotor projection must isolate and clip blade sweeps at the canopy viewport boundary');
  if (bladeElements !== rotor?.mainBladeCount) issues.push(`main rotor must emit exactly ${rotor?.mainBladeCount ?? 0} discrete radial blades, got ${bladeElements}`);
  if (arcElements !== rotor?.mainArcCount || !arcRule.includes('border-top:2px solid') || !arcRule.includes('border-radius:50%')) issues.push(`main rotor must emit exactly ${rotor?.mainArcCount ?? 0} transparent elliptic motion arcs, got ${arcElements}`);
  if (tieElements !== 2 || !tieRule) issues.push(`main rotor must emit exactly two visible structural ties, got ${tieElements}`);
  if (/repeating-conic-gradient|\.aa-main-rotor-plane:(?:before|after)/.test(mainSource)) issues.push('main rotor regressed to a filled/full-disc pseudo surface');
  if (/background(?:-image)?\s*:/.test(stageRule)) issues.push('main rotor stage must remain transparent rather than becoming a large alpha fill');
  if (/background(?:-image)?\s*:|border-radius\s*:/.test(planeRule)) issues.push('main rotor plane itself must remain transparent and geometry-free');
  const authoredBladeOpacity = Number(bladeRule.match(/opacity:(\d+(?:\.\d+)?)/)?.[1]);
  const authoredBladeHeight = Number(bladeRule.match(/height:(\d+(?:\.\d+)?)px/)?.[1]);
  if (!Number.isFinite(authoredBladeOpacity)
    || authoredBladeOpacity < rotor.mainMinimumBladeOpacity
    || authoredBladeOpacity > rotor.mainMaximumBladeOpacity
    || !Number.isFinite(authoredBladeHeight)
    || authoredBladeHeight < rotor.mainMinimumAuthoredBladeThicknessPixels
    || authoredBladeHeight > 5) issues.push('authored blade alpha/thickness must stay subdued and physically tapered');
  if (!canopyHeaderRule.includes('clip-path:polygon(')
    || !canopyHeaderRule.includes('background:linear-gradient(')
    || !canopyHeaderRule.includes('border-top:2px solid')
    || !canopyHeaderRule.includes('z-index:6')) issues.push('canopy occluder must read as a structural cockpit header above the hub, mast, ties, and arcs');
  if (!tieRule.includes('height:5px')
    || !tieRule.includes('background:linear-gradient(')
    || !tieRule.includes('z-index:5')) issues.push('structural ties must remain visible physical members between the canopy header and side rails');
  if (!generatorSource.includes('.aa-tail-rotor-camera{position:absolute;z-index:8;')) issues.push('tail optic must remain above the clipped main-rotor stage');
  return issues;
}

function rotorProjectionFailures(recipe, projection) {
  const issues = [];
  const rotor = recipe.helicopter?.rotorPresentation;
  if (projection?.mode !== 'perspective-elliptic-motion-arcs'
    || projection.bladeCount !== rotor?.mainBladeCount
    || projection.arcCount !== rotor?.mainArcCount
    || projection.temporalTrailCount !== rotor?.mainMotionBlurTrailCount
    || projection.legibleBladeSweeps < rotor?.mainMinimumLegibleBladeSweeps
    || projection.projectedBladeThresholdPixels !== rotor?.mainMinimumProjectedBladeLengthPixels
    || !Number.isFinite(projection.shortestProjectedBladeLengthPixels)
    || projection.projectedSweepSpanPixels < rotor?.mainMinimumProjectedSweepSpanPixels
    || projection.projectedArcSpanPixels < rotor?.mainMinimumProjectedArcSpanPixels
    || projection.authoredBladeThicknessPixels < rotor?.mainMinimumAuthoredBladeThicknessPixels
    || projection.bladeOpacity < rotor?.mainMinimumBladeOpacity
    || projection.bladeOpacity > rotor?.mainMaximumBladeOpacity
    || projection.contrastMode !== rotor?.mainContrastMode
    || projection.filledDiscDetected !== false
    || projection.stageTopFraction > rotor?.mainMaximumStageTopFraction
    || projection.stageBottomFraction < rotor?.mainMinimumStageBottomFraction
    || projection.stageBottomFraction > rotor?.mainMaximumStageBottomFraction
    || projection.stageWidthFraction < rotor?.mainMinimumScreenWidthFraction
    || projection.stageWidthFraction > rotor?.mainMaximumScreenWidthFraction
    || projection.stageHeightFraction < rotor?.mainMinimumScreenHeightFraction
    || projection.stageHeightFraction > rotor?.mainMaximumScreenHeightFraction
    || projection.stageAreaFraction < rotor?.mainMinimumScreenAreaFraction
    || projection.stageAreaFraction > rotor?.mainMaximumScreenAreaFraction) {
    issues.push('receipt rotor projection geometry or physical blade evidence is invalid');
  }
  if (projection?.hubDiameterPixels < rotor?.mainMinimumHubDiameterPixels
    || projection?.hubCanopyOverlapPixels < rotor?.mainMinimumHubCanopyOverlapPixels
    || projection?.hubCanopyOcclusionFraction > rotor?.mainMaximumHubCanopyOcclusionFraction
    || projection?.mastCanopyOverlapPixels < rotor?.mainMinimumMastCanopyOverlapPixels
    || projection?.hubCanopyOcclusionSampled !== true
    || projection?.mastCanopyOcclusionSampled !== true
    || projection?.occlusionStackValid !== true) {
    issues.push('receipt must prove measured and sampled hub/mast/header occlusion');
  }
  if (projection?.structuralTieCount !== 2
    || projection?.leftTieHeaderOverlapAreaPixels < rotor?.mainMinimumTieHeaderOverlapAreaPixels
    || projection?.rightTieHeaderOverlapAreaPixels < rotor?.mainMinimumTieHeaderOverlapAreaPixels
    || projection?.leftTieCanopyOverlapAreaPixels < rotor?.mainMinimumTieCanopyOverlapAreaPixels
    || projection?.rightTieCanopyOverlapAreaPixels < rotor?.mainMinimumTieCanopyOverlapAreaPixels
    || projection?.leftTieHeaderOcclusionSampled !== true
    || projection?.rightTieHeaderOcclusionSampled !== true
    || projection?.leftTieCanopyOcclusionSampled !== true
    || projection?.rightTieCanopyOcclusionSampled !== true) {
    issues.push('receipt must prove two connected and sampled structural ties from header to side canopy rails');
  }
  if (projection?.reticleClear !== true
    || projection?.tailOpticClear !== true
    || projection?.poseResponsive !== true
    || !Number.isFinite(projection?.poseShiftXPixels)
    || !Number.isFinite(projection?.poseShiftYPixels)
    || !Number.isFinite(projection?.poseBankDegrees)
    || !Number.isFinite(projection?.discPitchResponseDegrees)
    || !Number.isFinite(projection?.discYawResponseDegrees)
    || Math.abs(projection?.poseShiftXPixels) > rotor?.mainMaximumPoseShiftPixels
    || Math.abs(projection?.poseShiftYPixels) > rotor?.mainMaximumVerticalPoseShiftPixels
    || Math.abs(projection?.poseBankDegrees) > rotor?.mainMaximumPoseBankDegrees
    || Math.abs(projection?.discPitchResponseDegrees) > rotor?.mainMaximumDiscPitchResponseDegrees
    || Math.abs(projection?.discYawResponseDegrees) > rotor?.mainMaximumDiscYawResponseDegrees
    || projection?.poseTransform === 'none') {
    issues.push('receipt rotor visibility or bounded pose-response evidence is invalid');
  }
  return issues;
}

const rotorOnly = process.argv.includes('--rotor-contract-only');
const rotorSelfTest = process.argv.includes('--rotor-contract-self-test');
if (rotorOnly || rotorSelfTest) {
  const recipe = JSON.parse(await readFile(choreographyPath, 'utf8'));
  const source = await readFile(generatorPath, 'utf8');
  failures.push(...rotorContractFailures(recipe, source));
  if (rotorSelfTest) {
    const rotor = recipe.helicopter.rotorPresentation;
    const legacyTinyStarRecipe = {
      ...recipe,
      helicopter: {
        ...recipe.helicopter,
        rotorPresentation: {
          ...rotor,
          id: 'perspective-projected-cockpit-rotor-rig-v2',
          mainDiscPitchDegrees: 83,
          mainStageTopPercent: 4.3,
          mainStageWidthPercent: 28,
          mainStageHeightPercent: 7,
          mainBladeMode: 'discrete-radial-sweeps-v1',
          mainContrastMode: 'graphite-root-fade-v1',
          mainMinimumProjectedBladeLengthPixels: 54,
          mainMinimumProjectedSweepSpanPixels: 108,
          mainMinimumAuthoredBladeThicknessPixels: 2.5,
          mainMinimumBladeOpacity: 0.9,
          mainMotionBlurTrailCount: 1,
          mainCanopyHeaderWidthPercent: 4,
        },
      },
    };
    const legacyTinyStarSource = source
      .replace('data-projection="perspective-elliptic-motion-arcs"', 'data-projection="foreshortened-partial-sweep"')
      .replace('data-contrast="graphite-low-contrast-motion-v1"', 'data-contrast="graphite-root-fade-v1"')
      .replace(' data-occlusion-order="rotor-arcs<rotor-plane<mast-hub<structural-ties<canopy-header"', '')
      .replace(/\s*\.aa-main-rotor-blade:before\{[^}]*\}/, '')
      .replaceAll('aa-main-rotor-canopy-header', 'aa-main-rotor-occluder');
    const mutations = [
      ['legacy v2 tiny-star recipe', legacyTinyStarRecipe, source, /broad but upper-windscreen-bounded|physical blade|elliptic arc/],
      ['legacy v2 tiny-star source', recipe, legacyTinyStarSource, /rotor generator is missing|canopy occluder/],
      ['filled-disc flag', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainFilledDisc: true } } }, source, /physical blade|elliptic arc/],
      ['oversized stage', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainStageWidthPercent: 96 } } }, source, /broad but upper-windscreen-bounded/],
      ['flat projection', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainDiscPitchDegrees: 58 } } }, source, /perspective pitch/],
      ['single temporal trail', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainMotionBlurTrailCount: 1 } } }, source, /exactly two restrained temporal/],
      ['missing sweep span floor', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainMinimumProjectedSweepSpanPixels: 108 } } }, source, /physical blade|elliptic arc/],
      ['missing arc span floor', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainMinimumProjectedArcSpanPixels: 108 } } }, source, /physical blade|elliptic arc/],
      ['missing legibility floor', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainMinimumLegibleBladeSweeps: 0 } } }, source, /physical blade|elliptic arc/],
      ['filled conic surface', recipe, source.replace('.aa-tail-rotor-camera', '.aa-main-rotor-plane:before{background:repeating-conic-gradient(red,transparent)} .aa-tail-rotor-camera'), /filled\/full-disc/],
      ['alpha-washed stage', recipe, source.replace('overflow:hidden;isolation:isolate;', 'overflow:hidden;isolation:isolate;background:rgba(120,180,190,.35);'), /stage must remain transparent/],
      ['floating canopy bar', recipe, source.replace('clip-path:polygon(9% 0,91% 0,100% 100%,0 100%);background:linear-gradient', 'background:linear-gradient'), /structural cockpit header/],
      ['missing elliptic arcs', recipe, source.replaceAll('aa-main-rotor-arc', 'aa-main-rotor-missing-arc'), /transparent elliptic motion arcs|rotor generator is missing/],
      ['missing structural ties', recipe, source.replaceAll('aa-main-rotor-structural-tie', 'aa-main-rotor-detached-tie'), /exactly two visible structural ties|rotor generator is missing/],
      ['disconnected structural ties', { ...recipe, helicopter: { ...recipe.helicopter, rotorPresentation: { ...rotor, mainStructuralTieInsetPercent: 34, mainStructuralTieWidthPercent: 8 } } }, source, /structural ties/],
    ];
    for (const [label, mutatedRecipe, mutatedSource, expectedIssue] of mutations) {
      const issues = rotorContractFailures(mutatedRecipe, mutatedSource);
      if (issues.length === 0) failures.push(`rotor self-test did not reject ${label}`);
      else if (!issues.some((issue) => expectedIssue.test(issue))) failures.push(`rotor self-test rejected ${label} for the wrong reason: ${issues.join(' | ')}`);
    }
    const validProjection = {
      mode: 'perspective-elliptic-motion-arcs',
      bladeCount: rotor.mainBladeCount,
      arcCount: rotor.mainArcCount,
      temporalTrailCount: rotor.mainMotionBlurTrailCount,
      legibleBladeSweeps: rotor.mainMinimumLegibleBladeSweeps,
      projectedBladeThresholdPixels: rotor.mainMinimumProjectedBladeLengthPixels,
      shortestProjectedBladeLengthPixels: rotor.mainMinimumProjectedBladeLengthPixels,
      projectedSweepSpanPixels: rotor.mainMinimumProjectedSweepSpanPixels,
      projectedArcSpanPixels: rotor.mainMinimumProjectedArcSpanPixels,
      authoredBladeThicknessPixels: rotor.mainMinimumAuthoredBladeThicknessPixels,
      bladeOpacity: rotor.mainMinimumBladeOpacity,
      contrastMode: rotor.mainContrastMode,
      filledDiscDetected: false,
      stageTopFraction: rotor.mainMaximumStageTopFraction,
      stageBottomFraction: rotor.mainMinimumStageBottomFraction,
      stageWidthFraction: rotor.mainMinimumScreenWidthFraction,
      stageHeightFraction: rotor.mainMinimumScreenHeightFraction,
      stageAreaFraction: rotor.mainMinimumScreenAreaFraction,
      hubDiameterPixels: rotor.mainMinimumHubDiameterPixels,
      hubCanopyOverlapPixels: rotor.mainMinimumHubCanopyOverlapPixels,
      hubCanopyOcclusionFraction: rotor.mainMaximumHubCanopyOcclusionFraction,
      mastCanopyOverlapPixels: rotor.mainMinimumMastCanopyOverlapPixels,
      structuralTieCount: 2,
      leftTieHeaderOverlapAreaPixels: rotor.mainMinimumTieHeaderOverlapAreaPixels,
      rightTieHeaderOverlapAreaPixels: rotor.mainMinimumTieHeaderOverlapAreaPixels,
      leftTieCanopyOverlapAreaPixels: rotor.mainMinimumTieCanopyOverlapAreaPixels,
      rightTieCanopyOverlapAreaPixels: rotor.mainMinimumTieCanopyOverlapAreaPixels,
      leftTieHeaderOcclusionSampled: true,
      rightTieHeaderOcclusionSampled: true,
      leftTieCanopyOcclusionSampled: true,
      rightTieCanopyOcclusionSampled: true,
      hubCanopyOcclusionSampled: true,
      mastCanopyOcclusionSampled: true,
      occlusionStackValid: true,
      reticleClear: true,
      tailOpticClear: true,
      poseResponsive: true,
      poseShiftXPixels: 0,
      poseShiftYPixels: 0,
      poseBankDegrees: 0,
      discPitchResponseDegrees: 0,
      discYawResponseDegrees: 0,
      poseTransform: 'matrix(1, 0, 0, 1, 0, 0)',
    };
    if (rotorProjectionFailures(recipe, validProjection).length > 0) failures.push('rotor receipt self-test rejected its valid measured fixture');
    for (const [label, mutation] of [
      ['missing receipt tie', { structuralTieCount: 1 }],
      ['disconnected receipt tie', { leftTieCanopyOverlapAreaPixels: 0 }],
      ['unsampled receipt tie', { rightTieHeaderOcclusionSampled: false }],
      ['declared-only hub overlap', { hubCanopyOcclusionSampled: false }],
    ]) {
      if (rotorProjectionFailures(recipe, { ...validProjection, ...mutation }).length === 0) failures.push(`rotor receipt self-test did not reject ${label}`);
    }
    try {
      await runIntegrityMutationSelfTest();
    } catch (error) {
      failures.push(`preview integrity mutation self-test failed: ${error.message}`);
    }
  }
  if (failures.length > 0) {
    console.error(`Pass 65 menu rotor verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    rotorContract: 'passed',
    selfTest: rotorSelfTest,
    mode: recipe.helicopter.rotorPresentation.mainBladeMode,
    stage: {
      topPercent: recipe.helicopter.rotorPresentation.mainStageTopPercent,
      widthPercent: recipe.helicopter.rotorPresentation.mainStageWidthPercent,
      heightPercent: recipe.helicopter.rotorPresentation.mainStageHeightPercent,
    },
    projectedSweepFloorPixels: recipe.helicopter.rotorPresentation.mainMinimumProjectedSweepSpanPixels,
    temporalTrailCount: recipe.helicopter.rotorPresentation.mainMotionBlurTrailCount,
  }, null, 2));
  process.exit(0);
}

const choreography = JSON.parse(await readFile(choreographyPath, 'utf8'));
const generatorSource = await readFile(generatorPath, 'utf8');
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
const captureReceipt = JSON.parse(await readFile(captureReceiptPath, 'utf8'));
const cacheFamilyLock = JSON.parse(await readFile(cacheFamilyLockPath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestRecord = manifest.assets.find((asset) => asset.id === provenance.assetId);
const currentCanonicalDependencies = canonicalArenaDependencies();
if (currentCanonicalDependencies?.arenaOrder?.join(',') !== arenas.join(',')) failures.push('canonical arena dependency roster/order drifted');
const currentDependencyClosure = currentCanonicalDependencies
  ? await buildDependencyClosure(root, { extraPaths: currentCanonicalDependencies.arenas.flatMap((arena) => arena.localAssetPaths) })
  : null;

if (choreography.schemaVersion !== 4
  || choreography.recipeId !== 'pass66-authoritative-runtime-menu-preview-v2'
  || choreography.captureId !== 'pass66-authoritative-runtime-menu-preview-capture-v2'
  || choreography.generatedAt !== requiredGenerationDate) failures.push('canonical runtime choreography schema/recipe/capture identity drifted');
if (choreography.media?.cacheKey !== 'pass66-runtime-preview-v6') failures.push('canonical runtime preview cache family is not the unused Pass 66 v6 family');
if (choreography.capture?.source !== 'authoritative-runtime-arena'
  || choreography.capture?.backend !== 'webgpu'
  || choreography.capture?.overlayScale !== 0.5
  || choreography.capture?.overlayReferenceViewport?.[0] !== 1280
  || choreography.capture?.overlayReferenceViewport?.[1] !== 720
  || choreography.capture?.overlayOutputScale !== 2) failures.push('canonical capture must pin authoritative WebGPU arenas and the reviewed half-scale overlay authored losslessly into 1440p');
if (choreography.fps !== 30
  || choreography.durationSeconds !== 8
  || choreography.frameCount !== 240
  || choreography.frameCount !== choreography.fps * choreography.durationSeconds
  || choreography.capture?.viewport?.[0] !== 2560
  || choreography.capture?.viewport?.[1] !== 1440) failures.push('canonical capture must be exactly 2560x1440, 30 FPS, eight seconds and 240 frames');
const encodingBudget = choreography.media?.encodingBudget;
if (encodingBudget?.minimumAverageBitrateKbps !== 3000
  || encodingBudget?.maximumAverageBitrateKbps !== 9000
  || encodingBudget?.maximumBytesPerVideo !== 9500000
  || encodingBudget?.maximumPosterBytes !== 1500000
  || encodingBudget?.maximumReviewSheetBytes !== 1200000) failures.push('canonical 1440p bitrate/file-size budget drifted');
const mp4Encoding = choreography.media?.encodingProfiles?.mp4;
const webmEncoding = choreography.media?.encodingProfiles?.webm;
const imageEncoding = choreography.media?.encodingProfiles?.images;
const colourEncoding = choreography.media?.encodingProfiles?.colour;
if (mp4Encoding?.encoder !== 'libx264'
  || mp4Encoding?.videoCodec !== 'h264'
  || mp4Encoding?.profile !== 'high'
  || mp4Encoding?.level !== '5.0'
  || mp4Encoding?.codecTag !== 'avc1'
  || mp4Encoding?.rfc6381 !== 'avc1.640032'
  || mp4Encoding?.audioCodec !== 'aac'
  || mp4Encoding?.audioRfc6381 !== 'mp4a.40.2'
  || mp4Encoding?.targetVideoBitrateKbps !== 7500
  || mp4Encoding?.minimumVideoBitrateKbps !== 6000
  || mp4Encoding?.maximumVideoBitrateKbps !== 8500
  || mp4Encoding?.bufferSizeKbps !== 17000
  || mp4Encoding?.audioBitrateKbps !== 64
  || mp4Encoding?.mimeType !== 'video/mp4; codecs="avc1.640032,mp4a.40.2"') failures.push('canonical H.264 High Level 5.0 1440p profile drifted');
if (webmEncoding?.encoder !== 'libvpx-vp9'
  || webmEncoding?.videoCodec !== 'vp9'
  || webmEncoding?.profile !== 0
  || webmEncoding?.audioCodec !== 'opus'
  || webmEncoding?.targetVideoBitrateKbps !== 6000
  || webmEncoding?.minimumVideoBitrateKbps !== 4500
  || webmEncoding?.maximumVideoBitrateKbps !== 7500
  || webmEncoding?.bufferSizeKbps !== 15000
  || webmEncoding?.crf !== 20
  || webmEncoding?.cpuUsed !== 2
  || webmEncoding?.audioBitrateKbps !== 48
  || webmEncoding?.mimeType !== 'video/webm; codecs="vp9,opus"') failures.push('canonical VP9 1440p profile drifted');
if (imageEncoding?.posterQuality !== 88
  || imageEncoding?.reviewFrameWidth !== 640
  || imageEncoding?.reviewFrameHeight !== 360
  || imageEncoding?.reviewQuality !== 88
  || colourEncoding?.pixelFormat !== 'yuv420p'
  || colourEncoding?.primaries !== 'bt709'
  || colourEncoding?.transfer !== 'bt709'
  || colourEncoding?.space !== 'bt709'
  || colourEncoding?.range !== 'tv') failures.push('canonical 1440p image/BT.709 delivery profile drifted');
if (Object.keys(choreography.arenas).join(',') !== arenas.join(',')) failures.push('choreography arena roster/order drifted');
if (provenance.schemaVersion !== 4 || provenance.releaseState !== 'HITL candidate only' || provenance.generatedAt !== requiredGenerationDate) failures.push('provenance must be schema 4 HITL-candidate media for the current capture date');
if (!manifestRecord) failures.push(`assets.manifest.json is missing ${provenance.assetId}`);
if (provenance.authoredCockpit?.assetId !== 'chopper-gunner-vehicle-v1' || provenance.authoredCockpit?.qualityTier !== 'LOD0') failures.push('provenance must retain the accepted LOD0 cockpit design reference');

const recipeDigest = createHash('sha256').update(JSON.stringify(choreography)).digest('hex');
failures.push(...rotorContractFailures(choreography, generatorSource));
if (captureReceipt.schemaVersion !== 4
  || captureReceipt.captureId !== choreography.captureId
  || captureReceipt.generatedAt !== requiredGenerationDate
  || captureReceipt.recipeId !== choreography.recipeId
  || captureReceipt.recipeDigest !== recipeDigest
  || captureReceipt.source !== 'authoritative-runtime-arena'
  || captureReceipt.backendRequired !== 'webgpu'
  || captureReceipt.overlay?.scale !== 0.5
  || JSON.stringify(captureReceipt.overlay?.referenceViewport) !== JSON.stringify(choreography.capture.overlayReferenceViewport)
  || captureReceipt.overlay?.outputScale !== choreography.capture.overlayOutputScale
  || captureReceipt.overlay?.mode !== 'offline-baked-minimal-graphite-green'
  || captureReceipt.overlay?.liveLoadingRenderer !== false) failures.push('capture receipt does not prove the canonical offline runtime capture/overlay contract');
if (JSON.stringify(captureReceipt.frameRoster) !== JSON.stringify(Array.from({ length: choreography.frameCount }, (_, index) => index + 1))) failures.push('capture receipt frame roster is not exact/full');
if ((captureReceipt.arenas ?? []).map((entry) => entry.arenaId).join(',') !== arenas.join(',')) failures.push('capture receipt arena roster/order drifted');
for (const evidence of captureReceipt.arenas ?? []) {
  if (evidence.backend !== 'webgpu' || evidence.softwareAdapter !== false || evidence.constructionHistory?.length !== 1 || evidence.constructionHistory[0] !== evidence.arenaId || evidence.residentArenaRoots !== 1 || evidence.capturedFrames !== choreography.frameCount || evidence.viewmodelHidden !== true || evidence.colliders <= 0 || evidence.raycastMeshes <= 0) failures.push(`${evidence.arenaId} capture does not prove one authoritative hardware-WebGPU arena with the gameplay viewmodel excluded`);
  const recipe = choreography.arenas[evidence.arenaId];
  const expectedFrameRoster = Array.from({ length: choreography.frameCount }, (_, index) => index + 1);
  if (evidence.frameSet?.algorithm !== 'sha256-ordered-name-size-bytes-v1'
    || evidence.frameSet?.domain !== `menu-preview-frames:${evidence.arenaId}`
    || evidence.frameSet?.fileCount !== choreography.frameCount
    || evidence.frameSet?.totalBytes < choreography.frameCount
    || !/^[0-9a-f]{64}$/.test(evidence.frameSet?.sha256 ?? '')
    || JSON.stringify(evidence.frameSet?.frameRoster) !== JSON.stringify(expectedFrameRoster)) {
    failures.push(`${evidence.arenaId} capture receipt does not bind the full ordered staged-PNG set`);
  }
  if ((evidence.reviewFrames ?? []).map((entry) => entry.frame).join(',') !== choreography.reviewFrames.join(',')) failures.push(`${evidence.arenaId} capture does not prove all deterministic review frames`);
  for (const frame of evidence.reviewFrames ?? []) {
    const positionError = Math.hypot(...frame.requestedPosition.map((value, index) => value - frame.renderedPosition[index]));
    const elapsedMs = (frame.frame - 1) / (choreography.frameCount - 1) * choreography.durationSeconds * 1_000;
    const expectedFixedTimeMs = choreography.capture.fixedTimeStartMs + (elapsedMs % (choreography.durationSeconds * 1_000));
    if (positionError > 0.01 || Math.abs(frame.requestedFov - frame.renderedFov) > 0.1 || frame.requestedFov !== recipe.fovDegrees || Math.abs(frame.fixedVisualTimeMs - expectedFixedTimeMs) > 0.01 || frame.aboveArenaFloor !== true || frame.insideHorizontalCollider !== false || !/^[0-9a-f]{64}$/.test(frame.pngSha256)) failures.push(`${evidence.arenaId} review frame ${frame.frame} camera/visual evidence is invalid`);
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
        || projection.poseTransform === 'none') failures.push(`${evidence.arenaId} review frame ${frame.frame} does not prove the perspective-elliptic rotor projection`);
      for (const issue of rotorProjectionFailures(choreography, projection)) failures.push(`${evidence.arenaId} review frame ${frame.frame}: ${issue}`);
    } else if (frame.rotorProjection !== undefined) failures.push(`${evidence.arenaId} cat review frame ${frame.frame} unexpectedly contains helicopter rotor evidence`);
  }
  const firstReview = evidence.reviewFrames?.find((entry) => entry.frame === 1);
  const seamReview = evidence.reviewFrames?.find((entry) => entry.frame === choreography.frameCount);
  if (!firstReview || !seamReview || seamReview.seamSourceFrame !== 1 || seamReview.pngSha256 !== firstReview.pngSha256) failures.push(`${evidence.arenaId} does not prove an exact copied first/final loop seam`);
}
const expectedCaptureTools = captureToolPaths.map(relative);
if ((captureReceipt.runtimeInputs?.captureTools ?? []).map((entry) => entry.path).join(',') !== expectedCaptureTools.join(',')) failures.push('capture receipt capture-tool roster drifted');
for (const record of captureReceipt.runtimeInputs?.captureTools ?? []) await checkHash(path.join(root, record.path), record.sha256, `captured tool ${record.path}`);
if (currentCanonicalDependencies
  && JSON.stringify(captureReceipt.runtimeInputs?.canonicalArenaDependencies) !== JSON.stringify(currentCanonicalDependencies)) failures.push('capture receipt canonical arena dependency manifest drifted');
if (currentDependencyClosure
  && JSON.stringify(captureReceipt.runtimeInputs?.dependencyClosure) !== JSON.stringify(currentDependencyClosure)) failures.push('capture receipt recursive dependency closure drifted');

const actualCockpitEvidenceDigest = await checkHash(path.join(root, acceptedCockpitEvidence), acceptedCockpitDigest, 'accepted cockpit evidence');
if (provenance.authoredCockpit?.evidence !== acceptedCockpitEvidence
  || provenance.authoredCockpit?.evidenceSha256 !== acceptedCockpitDigest
  || provenance.authoredCockpit?.evidenceSha256 !== actualCockpitEvidenceDigest) failures.push('provenance cockpit evidence path/digest does not equal the accepted file bytes');
await checkHash(choreographyPath, provenance.choreography.sha256, 'canonical choreography');
await checkHash(documentationPath, provenance.documentation.sha256, 'preview authoring documentation');
await checkHash(generatorPath, provenance.generator.sha256, 'runtime capture generator');
await checkHash(finalizerPath, provenance.finalizer.sha256, 'preview finalizer');
await checkHash(verifierPath, provenance.verification.sha256, 'production verifier');
await checkHash(captureReceiptPath, provenance.captureReceipt.sha256, 'runtime capture receipt');
await checkHash(cacheFamilyLockPath, provenance.cacheFamilyLock?.sha256, 'cache-family lock');
await checkHash(path.join(root, provenance.authoredCockpit.path), provenance.authoredCockpit.sha256, 'authored cockpit design source');
for (const record of provenance.captureTools ?? []) await checkHash(path.join(root, record.path), record.sha256);
if ((provenance.captureTools ?? []).map((entry) => entry.path).join(',') !== expectedCaptureTools.join(',')) failures.push('provenance capture-tool roster drifted');
for (const runtime of provenance.runtimeFiles ?? []) await checkHash(path.join(root, runtime.path), runtime.sha256);
for (const review of provenance.reviewEvidence ?? []) await checkHash(path.join(root, review.path), review.sha256);

const cacheLockIssues = cacheFamilyLockFailures(cacheFamilyLock, RETAINED_CACHE_FAMILY_BASELINE);
for (const issue of cacheLockIssues) failures.push(`cache-family lock: ${issue}`);
const actualFinalMediaSet = await digestFinalMediaSet(path.join(root, 'public/assets/original/menu-previews'), arenas);
const currentCacheFamily = cacheFamilyLock.families?.find((family) => family.cacheKey === choreography.media.cacheKey);
if (!currentCacheFamily
  || currentCacheFamily.recipeId !== choreography.recipeId
  || currentCacheFamily.finalMediaSetSha256 !== actualFinalMediaSet.sha256
  || currentCacheFamily.fileCount !== actualFinalMediaSet.fileCount
  || currentCacheFamily.totalBytes !== actualFinalMediaSet.totalBytes
  || currentCacheFamily.recordedAt !== provenance.generatedAt) failures.push('current cache key is not append-only locked to the exact aggregate final-media bytes');
if (provenance.cacheFamilyLock?.path !== relative(cacheFamilyLockPath)
  || provenance.cacheFamilyLock?.cacheKey !== choreography.media.cacheKey
  || provenance.cacheFamilyLock?.finalMediaSetSha256 !== actualFinalMediaSet.sha256) failures.push('provenance does not bind the current cache-family lock and aggregate final-media digest');
if (currentCanonicalDependencies
  && JSON.stringify(provenance.canonicalArenaDependencies) !== JSON.stringify(currentCanonicalDependencies)) failures.push('provenance canonical arena dependency manifest drifted');
if (currentDependencyClosure) {
  const expectedClosureSummary = {
    schemaVersion: currentDependencyClosure.schemaVersion,
    algorithm: currentDependencyClosure.algorithm,
    roots: currentDependencyClosure.roots,
    excludes: currentDependencyClosure.excludes,
    extraPaths: currentDependencyClosure.extraPaths,
    fileCount: currentDependencyClosure.fileCount,
    totalBytes: currentDependencyClosure.totalBytes,
    treeSha256: currentDependencyClosure.treeSha256,
  };
  if (JSON.stringify(provenance.dependencyClosure) !== JSON.stringify(expectedClosureSummary)) failures.push('provenance recursive dependency-closure summary drifted');
}

const expectedRuntime = arenas.flatMap((arena) => ['mp4', 'webm', 'webp'].map((extension) => `public/assets/original/menu-previews/${arena}.${extension}`)).sort();
const actualRuntime = (provenance.runtimeFiles ?? []).map((entry) => entry.path).sort();
if (JSON.stringify(actualRuntime) !== JSON.stringify(expectedRuntime)) failures.push('provenance runtime media inventory drifted');
const expectedReview = arenas.map((arena) => `docs/assets/pass65-menu-previews/${arena}-review-frames.webp`).sort();
if (JSON.stringify((provenance.reviewEvidence ?? []).map((entry) => entry.path).sort()) !== JSON.stringify(expectedReview)) failures.push('review evidence inventory drifted');
if ((provenance.sources ?? []).map((entry) => entry.arenaId).join(',') !== arenas.join(',')
  || (provenance.sources ?? []).some((entry) => {
    const canonical = currentCanonicalDependencies?.arenas.find((candidate) => candidate.arenaId === entry.arenaId);
    return entry.source !== 'authoritative-runtime-arena'
      || entry.dependencyClosureTreeSha256 !== currentDependencyClosure?.treeSha256
      || JSON.stringify(entry.canonicalVisualModule) !== JSON.stringify(canonical);
  })) failures.push('provenance does not pin each canonical visual module to the recursive dependency closure');

for (const [file, oldDigest] of Object.entries(supersededGunRangeDigests)) {
  const actual = await sha256(path.join(root, file));
  if (actual === oldDigest) failures.push(`${file} still has the explicitly superseded digest`);
  if (provenance.supersedes?.gunRangeByteIdenticalGate?.files?.[file] !== oldDigest) failures.push(`provenance lost superseded digest history for ${file}`);
}
if (manifestRecord) {
  if (manifestRecord.sourceScript !== 'scripts/assets/generate-pass65-runtime-menu-previews.ts' || manifestRecord.sourceScriptSha256 !== provenance.generator.sha256) failures.push('manifest runtime generator record is stale');
  if (manifestRecord.sourceProvenanceSha256 !== await sha256(provenancePath)) failures.push('manifest provenance digest is stale');
  if (!manifestRecord.format.includes('2560x1440')
    || !manifestRecord.format.includes('H.264 High Level 5.0')
    || !manifestRecord.modifications.includes('native 1440p')
    || !manifestRecord.modifications.includes('exact 2x output scale')
    || !manifestRecord.modifications.includes('actual authoritative production WebGPU arena')
    || !manifestRecord.modifications.includes('green-on-graphite cockpit avionics')
    || !manifestRecord.modifications.includes('perspective-aware elliptic rotor arcs')
    || !manifestRecord.modifications.includes('structural ties into the side canopy rails')
    || !manifestRecord.modifications.includes('charcoal/silver ears, forelegs and top-facing paws')
    || !manifestRecord.modifications.includes('one selected metadata-preload decoder with poster-first readiness')) failures.push('manifest does not disclose the 1440p authoritative runtime source, bounded playback, and reviewed cockpit/cat overlay treatment');
}

if (provenance.render?.dimensions !== '2560x1440'
  || JSON.stringify(provenance.render?.overlayReferenceViewport) !== JSON.stringify(choreography.capture.overlayReferenceViewport)
  || provenance.render?.overlayOutputScale !== choreography.capture.overlayOutputScale
  || JSON.stringify(provenance.render?.encodingProfiles) !== JSON.stringify(choreography.media.encodingProfiles)
  || JSON.stringify(provenance.render?.encodingBudget) !== JSON.stringify(choreography.media.encodingBudget)) failures.push('provenance does not bind the exact 1440p render/encoding contract');

const runtimeHashesByExtension = { mp4: new Set(), webm: new Set(), webp: new Set() };
for (const arena of arenas) {
  for (const extension of ['mp4', 'webm', 'webp']) runtimeHashesByExtension[extension].add(await sha256(path.join(root, `public/assets/original/menu-previews/${arena}.${extension}`)));
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.mp4`), 'mp4', choreography, arena);
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.webm`), 'webm', choreography, arena);
  validateImage(path.join(root, `public/assets/original/menu-previews/${arena}.webp`), choreography.capture.viewport[0], choreography.capture.viewport[1], choreography.media.encodingBudget.maximumPosterBytes);
  validateImage(
    path.join(root, `docs/assets/pass65-menu-previews/${arena}-review-frames.webp`),
    choreography.media.encodingProfiles.images.reviewFrameWidth * choreography.reviewFrames.length,
    choreography.media.encodingProfiles.images.reviewFrameHeight,
    choreography.media.encodingBudget.maximumReviewSheetBytes,
  );
}
for (const [extension, hashes] of Object.entries(runtimeHashesByExtension)) if (hashes.size !== arenas.length) failures.push(`${extension} previews are not four distinct selected-map captures`);

const documentationSource = await readFile(documentationPath, 'utf8');
for (const marker of ['chromium.launch', 'createServer', 'menuPreviewPose', 'setCaptureCameraPose', 'authoritative-runtime-arena', 'offline-menu-preview-overlay', 'offline-baked-minimal-graphite-green', 'overlayScale', 'overlayReferenceViewport', 'overlayOutputScale', 'transform:scale(${outputScale})', 'aa-canopy', 'aa-glass', 'aa-reticle', 'aa-foreleg', 'aa-main-rotor-arc', 'aa-main-rotor-plane', 'aa-main-rotor-hub', 'aa-main-rotor-structural-tie', 'aa-main-rotor-canopy-header', 'aa-main-rotor-blade:before', 'aa-main-rotor-blade:after', 'aa-tail-rotor-plane', 'aa-tail-boom-occluder', 'perspective:', 'rotateX(', 'rotateY(', 'document.elementsFromPoint']) if (!generatorSource.includes(marker)) failures.push(`runtime capture generator is missing ${marker}`);
for (const forbidden of ['import bpy', 'primitive_cube_add', 'generate_pass65_menu_previews.py']) if (generatorSource.includes(forbidden)) failures.push(`runtime capture generator still contains synthetic Blender authoring marker ${forbidden}`);
if (!documentationSource.includes('npm run author:pass65:menu-previews') || !documentationSource.includes('actual authoritative map')) failures.push('authoring documentation does not describe the fail-closed runtime capture workflow');

const runtimeSource = await readFile(runtimeSourcePath, 'utf8');
if (!runtimeSource.includes('<video id="menu-preview-video"')
  || !runtimeSource.includes('preload="metadata"')
  || runtimeSource.includes('<canvas')
  || !runtimeSource.includes('rendererSubmissions: 0')
  || !runtimeSource.includes(`const CACHE_KEY = '${choreography.media.cacheKey}'`)
  || !runtimeSource.includes(`const WEBM_MIME_TYPE = '${choreography.media.encodingProfiles.webm.mimeType}'`)
  || !runtimeSource.includes(`const MP4_MIME_TYPE = '${choreography.media.encodingProfiles.mp4.mimeType}'`)
  || !runtimeSource.includes('width: 2560;')
  || !runtimeSource.includes('height: 1440;')
  || !/if\s*\(reducedMotion\)\s*\{\s*video\.removeAttribute\('src'\)/.test(runtimeSource)) failures.push('menu runtime must remain one 1440p prerecorded selected decoder, zero submissions, and poster-only for reduced motion');
const runtimeEntry = await readFile(runtimeEntryPath, 'utf8');
if (!runtimeEntry.includes("from './ui/menu-preview-video'") || runtimeEntry.includes("from './ui/menu-preview-camera'")) failures.push('browser entry must own prerecorded media only and never import the offline camera evaluator');
if (!runtimeEntry.includes("get('menuPreviewCapture') === '1'")
  || !runtimeEntry.includes('document.hasFocus() && !offlineMenuPreviewCapture')) failures.push('offline capture watchdog exemption must remain explicitly query-gated and must not weaken normal gameplay stall detection');
const cameraSource = await readFile(cameraEvaluatorPath, 'utf8');
if (!cameraSource.includes('authoring/tests only') || !cameraSource.includes('xorshift32-cyclic-quintic-hold-v1')) failures.push('offline camera evaluator lost its authoring-only deterministic contract');

if (failures.length > 0) {
  console.error(`Pass 65 menu preview production verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({ releaseState: provenance.releaseState, recipeId: choreography.recipeId, source: choreography.capture.source, authoredCockpit: provenance.authoredCockpit.assetId, helicopterArenas, gunRange: 'authoritative-runtime-cat-pov', runtimeMode: 'prerecorded-video-only', overlay: captureReceipt.overlay, mediaAudits, imageAudits }, null, 2));
