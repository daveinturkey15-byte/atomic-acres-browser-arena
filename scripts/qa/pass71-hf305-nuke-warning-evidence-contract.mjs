import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const PASS71_HF305_NUKE_WARNING_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-305',
  kind: 'pass71-hf305-nuke-warning-native',
  contract: 'atomic-acres/pass71-hf305-nuke-warning-native@1',
  feedbackId: 'HF-305',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
  ownerSubjectiveApproval: 'not-claimed',
});

export const PASS71_HF305_NUKE_WARNING_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF305_NUKE_WARNING_EVIDENCE.evidenceId,
  kind: PASS71_HF305_NUKE_WARNING_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF305_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF305_TIMELINE_REMAINING_MS = Object.freeze([4_400, 3_400, 2_400, 1_400, 600]);
export const PASS71_HF305_WARNING_POSITION = Object.freeze([75.75, 7.5, 6]);
export const PASS71_HF305_INSIDE_CAMERA = Object.freeze([91, 8.5, 20]);
export const PASS71_HF305_OUTSIDE_CAMERA = Object.freeze([43, 8, 12]);
export const PASS71_HF305_TOOLING_PATHS = Object.freeze([
  'src/audio.ts',
  'src/field-support.ts',
  'src/nuke-warning-presentation.ts',
  'src/legacy-main.ts',
  'src/nuke-warning-presentation.test.ts',
  'src/pass71-nuke-warning-audio.test.ts',
  'src/pass71-nuke-warning-integration.test.ts',
  'src/pass71-hf305-nuke-release-evidence.test.ts',
  'tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts',
  'scripts/qa/capture-pass71-hf305-nuke-authority.ts',
  'scripts/qa/pass71-hf305-nuke-warning-evidence-contract.mjs',
  'scripts/qa/pass71-hf305-nuke-warning-evidence-contract.test.mjs',
  'scripts/qa/pass71-hf305-nuke-warning-evidence-contract.d.mts',
  'scripts/qa/run-pass71-hf305-nuke-warning-evidence.mjs',
  'scripts/qa/pass71-edge-executable-identity.mjs',
  'scripts/qa/run-playwright-with-topology.mjs',
  'scripts/release/stage-release-topology.mjs',
  'playwright.config.ts',
  'release-channels.json',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
]);

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const SOFTWARE = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const decodedPngCache = new Map();

function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function finite(value, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function close(left, right, tolerance = 0.000001) {
  return finite(left) && finite(right) && Math.abs(left - right) <= tolerance;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function pass71Hf305RecordSha256(record) {
  const withoutDigest = { ...record };
  delete withoutDigest.receiptSha256;
  return sha256(Buffer.from(canonicalJson(withoutDigest), 'utf8'));
}

export function pass71Hf305ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-305 tooling source must be a full SHA');
  return PASS71_HF305_TOOLING_PATHS.map((path) => ({
    path,
    sha256: sha256(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )),
  }));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const prediction = a + b - c;
  const pa = Math.abs(prediction - a);
  const pb = Math.abs(prediction - b);
  const pc = Math.abs(prediction - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(image) {
  if (!exactKeys(image, ['id', 'path', 'pngBase64', 'sha256', 'byteLength', 'width', 'height'])) {
    throw new Error('image-shape');
  }
  if (typeof image.pngBase64 !== 'string' || !SHA256.test(image.sha256 ?? '')) throw new Error('image-identity');
  const bytes = Buffer.from(image.pngBase64, 'base64');
  if (bytes.length !== image.byteLength || sha256(bytes) !== image.sha256) throw new Error('image-byte-identity');
  const cached = decodedPngCache.get(image.sha256);
  if (cached) return cached;
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('image-png-signature');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('image-png-chunk-bounds');
    const typeAndData = bytes.subarray(offset + 4, dataEnd);
    if (crc32(typeAndData) !== bytes.readUInt32BE(dataEnd)) throw new Error(`image-png-crc-${type}`);
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'IDAT') idat.push(bytes.subarray(dataStart, dataEnd));
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  if (width !== image.width || height !== image.height || width !== 1_920 || height !== 1_080) {
    throw new Error('image-png-dimensions');
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0 || idat.length === 0) {
    throw new Error('image-png-format');
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error('image-png-inflated-size');
  const pixels = Buffer.alloc(width * height * 4);
  let rawOffset = 0;
  let prior = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset];
    rawOffset += 1;
    const row = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const encoded = raw[rawOffset + index];
      const left = index >= channels ? row[index - channels] : 0;
      const up = prior[index] ?? 0;
      const upLeft = index >= channels ? prior[index - channels] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? up
            : filter === 3 ? Math.floor((left + up) / 2)
              : filter === 4 ? paeth(left, up, upLeft)
                : Number.NaN;
      if (!Number.isFinite(predictor)) throw new Error('image-png-filter');
      row[index] = (encoded + predictor) & 0xff;
    }
    rawOffset += stride;
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      pixels[target] = row[source];
      pixels[target + 1] = row[source + 1];
      pixels[target + 2] = row[source + 2];
      pixels[target + 3] = channels === 4 ? row[source + 3] : 255;
    }
    prior = row;
  }
  const decoded = Object.freeze({ width, height, pixels });
  decodedPngCache.set(image.sha256, decoded);
  return decoded;
}

function luminanceMetrics(decoded) {
  const histogram = new Uint32Array(256);
  let total = 0;
  let bright = 0;
  const count = decoded.width * decoded.height;
  for (let offset = 0; offset < decoded.pixels.length; offset += 4) {
    const value = Math.max(0, Math.min(255, Math.round(
      decoded.pixels[offset] * 0.2126
      + decoded.pixels[offset + 1] * 0.7152
      + decoded.pixels[offset + 2] * 0.0722,
    )));
    histogram[value] += 1;
    total += value;
    if (value >= 248) bright += 1;
  }
  const percentile = (ratio) => {
    const target = Math.ceil(count * ratio);
    let accumulated = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      accumulated += histogram[value];
      if (accumulated >= target) return value;
    }
    return 255;
  };
  return Object.freeze({
    mean: total / count,
    p99: percentile(0.99),
    brightFraction: bright / count,
  });
}

function attributionMetrics(hidden, visible, crop) {
  if (!exactKeys(crop, ['left', 'top', 'width', 'height'])
    || ![crop.left, crop.top, crop.width, crop.height].every(Number.isSafeInteger)
    || crop.left < 0 || crop.top < 0 || crop.width < 1 || crop.height < 1
    || crop.left + crop.width > visible.width || crop.top + crop.height > visible.height
    || hidden.width !== visible.width || hidden.height !== visible.height) throw new Error('attribution-crop');
  let changedWarningPixels = 0;
  let maximumRedDelta = 0;
  for (let y = crop.top; y < crop.top + crop.height; y += 1) {
    for (let x = crop.left; x < crop.left + crop.width; x += 1) {
      const offset = (y * visible.width + x) * 4;
      const red = visible.pixels[offset];
      const green = visible.pixels[offset + 1];
      const blue = visible.pixels[offset + 2];
      const redDelta = red - hidden.pixels[offset];
      maximumRedDelta = Math.max(maximumRedDelta, redDelta);
      if (redDelta >= 34 && red >= 82 && red >= green * 1.18 && red >= blue * 1.32) {
        changedWarningPixels += 1;
      }
    }
  }
  return Object.freeze({ changedWarningPixels, maximumRedDelta });
}

function validWarning(warning, reducedSensory) {
  return exactKeys(warning, ['visible', 'arenaId', 'position', 'scale', 'coreOpacity', 'ringOpacity', 'reducedSensory'])
    && warning.visible === true && warning.arenaId === 'gun-range'
    && same(warning.position, PASS71_HF305_WARNING_POSITION)
    && finite(warning.scale, 0.65, 2.21)
    && finite(warning.coreOpacity, 0.07, 0.87)
    && finite(warning.ringOpacity, 0.08, 0.77)
    && warning.reducedSensory === reducedSensory;
}

function validAudioSample(audio) {
  return exactKeys(audio, ['contextState', 'available', 'rms', 'peak', 'suspiciousBroadbandHiss', 'voices', 'globalCap', 'supportCues'])
    && audio.contextState === 'running' && audio.available === true
    && finite(audio.rms, 0, 0.5) && finite(audio.peak, audio.rms, 0.98)
    && audio.suspiciousBroadbandHiss === false
    && Number.isSafeInteger(audio.voices) && Number.isSafeInteger(audio.globalCap)
    && audio.voices >= 0 && audio.globalCap > 0 && audio.voices <= audio.globalCap
    && Number.isSafeInteger(audio.supportCues) && audio.supportCues >= 0;
}

function timelineFailures(run, prefix) {
  const failures = [];
  if (!Array.isArray(run.timeline) || run.timeline.length !== PASS71_HF305_TIMELINE_REMAINING_MS.length) {
    return [`${prefix}:timeline-count`];
  }
  for (const [index, sample] of run.timeline.entries()) {
    if (!exactKeys(sample, ['targetRemainingMs', 'elapsedMs', 'detonateInMs', 'hudVisible', 'hudCountdown', 'warning', 'audio'])
      || sample.targetRemainingMs !== PASS71_HF305_TIMELINE_REMAINING_MS[index]
      || !finite(sample.elapsedMs, 0, 6_500)
      || !finite(sample.detonateInMs, Math.max(1, sample.targetRemainingMs - 500), sample.targetRemainingMs + 300)
      || sample.hudVisible !== true || !/^[1-5]$/u.test(sample.hudCountdown ?? '')
      || !validWarning(sample.warning, run.mode === 'reduced') || !validAudioSample(sample.audio)) {
      failures.push(`${prefix}:timeline-${index + 1}`);
    }
    if (index > 0) {
      const previous = run.timeline[index - 1];
      if (!(sample.elapsedMs > previous.elapsedMs && sample.detonateInMs < previous.detonateInMs
        && sample.warning.scale > previous.warning.scale
        && sample.warning.coreOpacity > previous.warning.coreOpacity
        && sample.warning.ringOpacity > previous.warning.ringOpacity)) {
        failures.push(`${prefix}:non-monotonic-${index + 1}`);
      }
    }
  }
  return failures;
}

function validTargetsBefore(targets) {
  return Array.isArray(targets) && targets.length === 4 && new Set(targets.map(({ id }) => id)).size === 4
    && targets.every((target) => exactKeys(target, ['id', 'kind', 'active', 'visible', 'health', 'maxHealth'])
      && target.kind === 'training-dummy' && target.active === true && target.visible === true
      && target.health === 300 && target.maxHealth === 300);
}

function validTargetsAfter(before, after) {
  return Array.isArray(after) && after.length === 4 && same(before.map(({ id }) => id).sort(), after.map(({ id }) => id).sort())
    && after.every((target) => exactKeys(target, ['id', 'kind', 'active', 'visible', 'health', 'maxHealth'])
      && target.kind === 'training-dummy' && target.active === false && target.visible === false
      && target.health === 0 && target.maxHealth === 300);
}

function runFailures(run, renderer) {
  const prefix = `${renderer}:${run?.mode ?? 'unknown'}`;
  const failures = [];
  if (!exactKeys(run, [
    'mode', 'accessibility', 'physicalStart', 'targetsBefore', 'activation', 'timeline', 'cameras',
    'images', 'frozenFrame', 'hiddenControl', 'attributionCrop', 'detonation',
  ])) return [`${prefix}:shape`];
  const reduced = run.mode === 'reduced';
  if (!(run.mode === 'standard' || reduced)) failures.push(`${prefix}:mode`);
  if (!exactKeys(run.accessibility, ['requested', 'effective', 'reasons', 'html'])
    || run.accessibility.requested !== reduced || run.accessibility.effective !== reduced
    || run.accessibility.html !== (reduced ? 'true' : 'false')
    || !Array.isArray(run.accessibility.reasons)
    || (reduced && !run.accessibility.reasons.includes('Reduced sensory effects'))) failures.push(`${prefix}:accessibility`);
  if (!exactKeys(run.physicalStart, ['selector', 'eventType', 'isTrusted', 'audioContext'])
    || run.physicalStart.selector !== '#solo' || run.physicalStart.eventType !== 'pointerdown'
    || run.physicalStart.isTrusted !== true || run.physicalStart.audioContext !== 'running') failures.push(`${prefix}:physical-start`);
  if (!validTargetsBefore(run.targetsBefore)) failures.push(`${prefix}:targets-before`);
  if (!exactKeys(run.activation, [
    'activatedAtMs', 'activationsBefore', 'activationsAfter', 'detonationsBefore', 'supportCuesBefore',
    'supportCuesAfter', 'active', 'detonated', 'detonateInMs', 'warning',
  ]) || !finite(run.activation.activatedAtMs, 0)
    || run.activation.activationsAfter !== run.activation.activationsBefore + 1
    || run.activation.supportCuesAfter !== run.activation.supportCuesBefore + 1
    || run.activation.active !== true || run.activation.detonated !== false
    || !finite(run.activation.detonateInMs, 4_650, 5_000)
    || !validWarning(run.activation.warning, reduced)) failures.push(`${prefix}:activation`);
  failures.push(...timelineFailures(run, prefix));
  const expectedCameras = reduced ? ['inside-room'] : ['outside-room', 'inside-room'];
  if (!Array.isArray(run.cameras) || !same(run.cameras.map(({ id }) => id), expectedCameras)) failures.push(`${prefix}:cameras`);
  else for (const camera of run.cameras) {
    if (!exactKeys(camera, [
      'id', 'position', 'classification', 'committed', 'renderer', 'arenaId', 'captureRevision',
      'simulationFrame', 'submissionSequence', 'completedSequence', 'door',
    ]) || camera.committed !== true || camera.renderer !== renderer || camera.arenaId !== 'gun-range'
      || !Number.isSafeInteger(camera.captureRevision) || camera.captureRevision < 1
      || !Number.isSafeInteger(camera.simulationFrame) || camera.simulationFrame < 1
      || !Number.isSafeInteger(camera.submissionSequence) || camera.submissionSequence < 0
      || !Number.isSafeInteger(camera.completedSequence) || camera.completedSequence < camera.submissionSequence
      || !same(camera.door, {
        phase: 'open', openness: 1, dynamicColliderCount: 0, dynamicBallisticSurfaceCount: 0,
      })) failures.push(`${prefix}:camera-${camera.id}`);
    if (camera.id === 'inside-room' && (!same(camera.position, PASS71_HF305_INSIDE_CAMERA) || camera.classification !== 'inside')) failures.push(`${prefix}:inside-camera`);
    if (camera.id === 'outside-room' && (!same(camera.position, PASS71_HF305_OUTSIDE_CAMERA) || camera.classification !== 'outside' || !(camera.position[0] < 52))) failures.push(`${prefix}:outside-camera`);
  }
  if (!reduced && run.cameras?.length === 2
    && !(run.cameras[1].captureRevision > run.cameras[0].captureRevision)) failures.push(`${prefix}:camera-revision-order`);
  const expectedImages = reduced ? ['reduced-inside'] : ['standard-outside', 'standard-inside-visible', 'standard-inside-hidden-control'];
  if (!Array.isArray(run.images) || !same(run.images.map(({ id }) => id), expectedImages)) failures.push(`${prefix}:images`);
  const decoded = new Map();
  for (const image of run.images ?? []) {
    try {
      const raster = decodePng(image);
      decoded.set(image.id, raster);
      const luma = luminanceMetrics(raster);
      if (!(luma.mean <= 210 && luma.p99 <= 252 && luma.brightFraction <= 0.12)) failures.push(`${prefix}:${image.id}:luminance`);
    } catch (error) {
      failures.push(`${prefix}:${image?.id ?? 'image'}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (reduced) {
    if (run.frozenFrame !== null || run.hiddenControl !== null || run.attributionCrop !== null) failures.push(`${prefix}:unexpected-control`);
  } else {
    const frozen = run.frozenFrame;
    const control = run.hiddenControl;
    if (!object(frozen) || frozen.contract !== 'nuke-warning-frozen-visible-frame-v1'
      || frozen.renderer !== renderer || frozen.active !== true || frozen.detonated !== false
      || frozen.beaconVisible !== true || !same(frozen.beaconPosition, PASS71_HF305_WARNING_POSITION)
      || frozen.captureRevision !== run.cameras?.at(-1)?.captureRevision
      || !same(frozen.cameraPosition, PASS71_HF305_INSIDE_CAMERA)
      || !finite(frozen.detonateInMs, 100, 1_100)) failures.push(`${prefix}:frozen-frame`);
    if (!object(control) || control.contract !== 'nuke-warning-hidden-control-v1'
      || control.nonPublishable !== true || control.renderer !== renderer
      || control.simulationFrame !== frozen?.simulationFrame
      || control.captureRevision !== frozen?.captureRevision
      || control.officialSubmissionSequence !== frozen?.submissionSequence
      || control.beaconHiddenDuringSubmission !== true || control.beaconRestored !== true) failures.push(`${prefix}:hidden-control`);
    if (renderer === 'webgpu' && (!(control?.submissionSequence > control?.officialSubmissionSequence)
      || !(control?.completedSequence >= control?.submissionSequence))) failures.push(`${prefix}:webgpu-control-frontier`);
    try {
      const attribution = attributionMetrics(
        decoded.get('standard-inside-hidden-control'),
        decoded.get('standard-inside-visible'),
        run.attributionCrop,
      );
      if (attribution.maximumRedDelta < 72 || attribution.changedWarningPixels < 240) failures.push(`${prefix}:beacon-raster-attribution`);
    } catch (error) {
      failures.push(`${prefix}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const detonation = run.detonation;
  if (!exactKeys(detonation, [
    'observedElapsedMs', 'activationsDelta', 'detonationsDelta', 'targetsAfter', 'warningHidden',
    'nukeActive', 'nukeDetonated', 'explosionSource', 'explosionFrameSources',
  ]) || !finite(detonation.observedElapsedMs, 4_650, 6_500)
    || detonation.activationsDelta !== 1 || detonation.detonationsDelta !== 1
    || !validTargetsAfter(run.targetsBefore, detonation.targetsAfter)
    || detonation.warningHidden !== true || detonation.nukeActive !== true || detonation.nukeDetonated !== true
    || detonation.explosionSource !== 'nuke'
    || !same(detonation.explosionFrameSources, ['nuke'])) failures.push(`${prefix}:detonation-authority`);
  return failures;
}

function mechanicalFailures(mechanical, sourceSha, sourceTreeSha) {
  const failures = [];
  if (!exactKeys(mechanical, [
    'schemaVersion', 'contract', 'status', 'sourceSha', 'sourceTreeSha', 'warningDurationMs', 'nukeDamage',
    'authorityCases', 'standardSamples', 'reducedSamples', 'audio', 'faults',
  ])) return ['mechanical:shape'];
  if (mechanical.schemaVersion !== 1 || mechanical.contract !== 'atomic-acres/pass71-hf305-nuke-mechanical@1'
    || mechanical.status !== 'PASS' || mechanical.sourceSha !== sourceSha || mechanical.sourceTreeSha !== sourceTreeSha
    || mechanical.warningDurationMs !== 5_000 || mechanical.nukeDamage !== 1_000 || mechanical.faults?.length !== 0) failures.push('mechanical:identity');
  if (!same(mechanical.authorityCases, [
    { ownerTeam: 0, targetTeam: 1, alive: true, damage: 1_000 },
    { ownerTeam: 0, targetTeam: 0, alive: true, damage: 0 },
    { ownerTeam: 0, targetTeam: 1, alive: false, damage: 0 },
  ])) failures.push('mechanical:hostile-only-authority');
  if (!Array.isArray(mechanical.standardSamples) || mechanical.standardSamples.length !== 5
    || !Array.isArray(mechanical.reducedSamples) || mechanical.reducedSamples.length !== 5) failures.push('mechanical:timeline-count');
  else for (let index = 0; index < 5; index += 1) {
    const standard = mechanical.standardSamples[index];
    const reduced = mechanical.reducedSamples[index];
    if (!finite(standard.charge, 0, 1) || !finite(standard.skyFlash, 0, 0.181)
      || !finite(standard.fogBlend, 0, 0.241) || reduced.charge !== standard.charge
      || !(reduced.scale <= standard.scale && reduced.rotationY <= standard.rotationY
        && reduced.coreOpacity < standard.coreOpacity && reduced.ringOpacity < standard.ringOpacity
        && reduced.skyFlash <= standard.skyFlash && reduced.fogBlend === standard.fogBlend)) failures.push(`mechanical:sensory-${index + 1}`);
    if (index > 0) {
      const previous = mechanical.standardSamples[index - 1];
      if (!(standard.charge > previous.charge && standard.scale > previous.scale
        && standard.rotationY > previous.rotationY && standard.coreOpacity > previous.coreOpacity
        && standard.ringOpacity > previous.ringOpacity && standard.fogBlend > previous.fogBlend)) failures.push(`mechanical:monotonic-${index + 1}`);
    }
  }
  const audio = mechanical.audio;
  if (!exactKeys(audio, ['standard', 'reduced'])
    || !exactKeys(audio?.standard, ['gainScale', 'maximumLayerGain', 'scheduledVoices', 'broadbandNoiseLayers', 'durationSeconds'])
    || !exactKeys(audio?.reduced, ['gainScale', 'maximumLayerGain', 'scheduledVoices', 'broadbandNoiseLayers', 'durationSeconds'])
    || audio.standard.gainScale !== 1 || audio.reduced.gainScale !== 0.42
    || !close(audio.standard.maximumLayerGain, 0.107, 1e-12)
    || !close(audio.reduced.maximumLayerGain, 0.04494, 1e-12)
    || audio.standard.scheduledVoices !== 11 || audio.reduced.scheduledVoices !== 11
    || audio.standard.broadbandNoiseLayers !== 0 || audio.reduced.broadbandNoiseLayers !== 0
    || audio.standard.durationSeconds !== 5 || audio.reduced.durationSeconds !== 5) failures.push('mechanical:audio-precedence');
  return failures;
}

function runtimeFailures(runtime, renderer, sourceSha) {
  const failures = [];
  if (!exactKeys(runtime, [
    'schemaVersion', 'contract', 'status', 'sourceSha', 'servedCandidate', 'renderer', 'browser', 'profile',
    'standard', 'reduced', 'clientRuntimeLog', 'faults',
  ])) return [`${renderer}:runtime-shape`];
  if (runtime.schemaVersion !== 1 || runtime.contract !== 'atomic-acres/pass71-hf305-nuke-runtime@1'
    || runtime.status !== 'PASS' || runtime.sourceSha !== sourceSha) failures.push(`${renderer}:runtime-identity`);
  const served = runtime.servedCandidate;
  if (!exactKeys(served, ['schemaVersion', 'channel', 'releasePass', 'sourceSha', 'treeSha256', 'exactRootFileCount', 'path'])
    || served.schemaVersion !== 4 || served.channel !== 'the-big-one' || served.releasePass !== 'PASS 71'
    || served.sourceSha !== sourceSha || !SHA256.test(served.treeSha256 ?? '')
    || !Number.isSafeInteger(served.exactRootFileCount) || served.exactRootFileCount < 1
    || served.path !== 'channels/the-big-one') failures.push(`${renderer}:served-candidate`);
  if (!exactKeys(runtime.renderer, ['requested', 'actual', 'adapterLabel', 'softwareRenderer', 'requireWebGpu'])
    || runtime.renderer.requested !== renderer || runtime.renderer.actual !== renderer
    || typeof runtime.renderer.adapterLabel !== 'string' || runtime.renderer.adapterLabel.length < 3
    || SOFTWARE.test(runtime.renderer.adapterLabel) || runtime.renderer.softwareRenderer !== false
    || runtime.renderer.requireWebGpu !== (renderer === 'webgpu')) failures.push(`${renderer}:renderer`);
  if (!exactKeys(runtime.browser, ['version', 'userAgent']) || !/^\d+(?:\.\d+){3}$/u.test(runtime.browser.version ?? '')
    || !/\bEdg\/(\d+)/u.test(runtime.browser.userAgent ?? '')
    || runtime.browser.version.split('.')[0] !== runtime.browser.userAgent.match(/\bEdg\/(\d+)/u)?.[1]) failures.push(`${renderer}:browser`);
  if (!same(runtime.profile, { name: 'Quality', render: 'blender' })) failures.push(`${renderer}:profile`);
  failures.push(...runFailures(runtime.standard, renderer), ...runFailures(runtime.reduced, renderer));
  if (runtime.standard?.timeline?.length === 5 && runtime.reduced?.timeline?.length === 5) {
    const standard = runtime.standard.timeline.at(-1).warning;
    const reduced = runtime.reduced.timeline.at(-1).warning;
    if (!(reduced.scale < standard.scale && reduced.coreOpacity < standard.coreOpacity * 0.55
      && reduced.ringOpacity < standard.ringOpacity * 0.55)) failures.push(`${renderer}:native-sensory-visual-precedence`);
    const standardPeak = Math.max(...runtime.standard.timeline.map(({ audio }) => audio.peak));
    const reducedPeak = Math.max(...runtime.reduced.timeline.map(({ audio }) => audio.peak));
    if (!(standardPeak > 0.0001 && reducedPeak <= standardPeak * 0.9)) failures.push(`${renderer}:native-sensory-audio-precedence`);
  }
  if (runtime.clientRuntimeLog?.length !== 0 || runtime.faults?.length !== 0) failures.push(`${renderer}:runtime-faults`);
  return failures;
}

export function pass71Hf305EvidenceFailures(record, expected = {}) {
  const failures = [];
  const sourceSha = expected.sourceSha;
  const sourceTreeSha = expected.sourceTreeSha;
  const tooling = expected.tooling;
  if (!exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'closingAuthority', 'ownerSubjectiveApproval', 'startedAt', 'completedAt', 'source', 'environment',
    'browser', 'tooling', 'coverage', 'components', 'faults', 'receiptSha256',
  ])) return ['receipt-shape'];
  for (const [key, value] of Object.entries(PASS71_HF305_NUKE_WARNING_EVIDENCE)) {
    if (record[key] !== value) failures.push(`receipt-${key}`);
  }
  if (!ISO.test(record.startedAt ?? '') || !ISO.test(record.completedAt ?? '')
    || new Date(record.startedAt).toISOString() !== record.startedAt
    || new Date(record.completedAt).toISOString() !== record.completedAt
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('receipt-timestamps');
  if (!exactKeys(record.source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha', 'releasePass', 'cleanBefore', 'cleanAfter',
  ]) || !SHA40.test(sourceSha ?? '') || record.source.expectedSourceSha !== sourceSha
    || record.source.checkoutSourceSha !== sourceSha || record.source.endingCheckoutSourceSha !== sourceSha
    || record.source.sourceTreeSha !== sourceTreeSha || !SHA40.test(sourceTreeSha ?? '')
    || record.source.releasePass !== 'PASS 71' || record.source.cleanBefore !== true || record.source.cleanAfter !== true) failures.push('receipt-source');
  if (!exactKeys(record.environment, ['machine', 'hostnameSha256', 'platform', 'arch'])
    || record.environment.machine !== 'dave-gaming-pc' || !SHA256.test(record.environment.hostnameSha256 ?? '')
    || record.environment.platform !== 'win32' || record.environment.arch !== 'x64') failures.push('receipt-environment');
  if (!exactKeys(record.browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion',
    'authenticodeStatus', 'authenticodeSigner', 'isolation',
  ]) || record.browser.channel !== 'msedge' || record.browser.installed !== true
    || record.browser.executableName !== 'msedge.exe' || !SHA256.test(record.browser.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(record.browser.executableVersion ?? '')
    || record.browser.authenticodeStatus !== 'Valid' || !/Microsoft Corporation/iu.test(record.browser.authenticodeSigner ?? '')
    || record.browser.isolation !== 'one-signed-installed-edge-process-and-fresh-profile-per-renderer') failures.push('receipt-browser');
  if (!Array.isArray(record.tooling) || !same(record.tooling.map(({ path }) => path), PASS71_HF305_TOOLING_PATHS)
    || record.tooling.some((entry) => !exactKeys(entry, ['path', 'sha256']) || !SHA256.test(entry.sha256 ?? ''))
    || (tooling && !same(record.tooling, tooling))) failures.push('receipt-tooling');
  if (!same(record.coverage, {
    renderers: ['webgl2', 'webgpu'],
    sensoryModes: ['standard', 'reduced'],
    views: ['outside-room', 'inside-room'],
    warningDurationMs: 5_000,
    sameFrameBeaconAttribution: true,
    ownerSubjectiveInspectionPerformed: false,
  })) failures.push('receipt-coverage');
  if (!Array.isArray(record.components) || !same(record.components.map(({ id }) => id), [
    'mechanical-authority', 'installed-edge-webgl2', 'installed-edge-webgpu',
  ])) failures.push('receipt-components');
  else {
    for (const component of record.components) {
      if (!exactKeys(component, ['id', 'kind', 'status', 'sourcePath', 'receiptPath', 'receiptSha256', 'receiptByteLength', 'embedded'])
        || component.status !== 'passed' || !SHA256.test(component.receiptSha256 ?? '')
        || !Number.isSafeInteger(component.receiptByteLength) || component.receiptByteLength < 2) {
        failures.push(`${component.id}:component-identity`);
        continue;
      }
      const bytes = Buffer.from(`${JSON.stringify(component.embedded, null, 2)}\n`, 'utf8');
      if (bytes.length !== component.receiptByteLength || sha256(bytes) !== component.receiptSha256) failures.push(`${component.id}:component-bytes`);
    }
    failures.push(...mechanicalFailures(record.components[0].embedded, sourceSha, sourceTreeSha));
    failures.push(...runtimeFailures(record.components[1].embedded, 'webgl2', sourceSha));
    failures.push(...runtimeFailures(record.components[2].embedded, 'webgpu', sourceSha));
    if (record.components[1].embedded?.browser?.version !== record.browser?.executableVersion
      || record.components[2].embedded?.browser?.version !== record.browser?.executableVersion) {
      failures.push('receipt-browser-runtime-version');
    }
  }
  if (record.faults?.length !== 0) failures.push('receipt-faults');
  if (record.receiptSha256 !== pass71Hf305RecordSha256(record)) failures.push('receipt-digest');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf305Evidence(record, expected) {
  const failures = pass71Hf305EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-305 Nuke warning evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf305EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF305_NUKE_WARNING_DESCRIPTOR,
    closesFeedback: true,
    ownerSubjectiveApproval: 'not-claimed',
    validate(record, context) {
      try {
        return pass71Hf305EvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf305SourceTreeSha
            ?? execFileSync('git', ['-C', context?.repositoryRoot, 'rev-parse', `${context?.sourceSha}^{tree}`], { encoding: 'utf8', windowsHide: true }).trim(),
          tooling: context?.options?.pass71Hf305Tooling
            ?? pass71Hf305ToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha),
        });
      } catch (error) {
        return [`hf305-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY = createPass71Hf305EvidenceRegistryEntry();

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([header, name, data, checksum]);
}

function fixturePng(redBox = false, reduced = false) {
  const width = 1_920;
  const height = 1_080;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const beacon = redBox && x >= 800 && x < (reduced ? 825 : 850) && y >= 500 && y < (reduced ? 525 : 550);
      raw[offset] = beacon ? 220 : 42;
      raw[offset + 1] = beacon ? 44 : 52;
      raw[offset + 2] = beacon ? 24 : 62;
      raw[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const bytes = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return { bytes, width, height };
}

function fixtureImage(id, redBox = false, reduced = false) {
  const png = fixturePng(redBox, reduced);
  return {
    id,
    path: `artifacts/pass71/hf305-nuke-warning/${id}.png`,
    pngBase64: png.bytes.toString('base64'),
    sha256: sha256(png.bytes),
    byteLength: png.bytes.length,
    width: png.width,
    height: png.height,
  };
}

function fixtureWarning(index, reduced) {
  const charge = [0.12, 0.32, 0.52, 0.72, 0.88][index];
  return {
    visible: true,
    arenaId: 'gun-range',
    position: [...PASS71_HF305_WARNING_POSITION],
    scale: 0.65 + charge * (reduced ? 0.75 : 1.55),
    coreOpacity: (0.18 + charge * 0.68) * (reduced ? 0.42 : 1),
    ringOpacity: (0.2 + charge * 0.56) * (reduced ? 0.42 : 1),
    reducedSensory: reduced,
  };
}

function fixtureTargets(active) {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `dummy-${index + 1}`,
    kind: 'training-dummy',
    active,
    visible: active,
    health: active ? 300 : 0,
    maxHealth: 300,
  }));
}

function fixtureCamera(id, renderer, captureRevision, simulationFrame) {
  return {
    id,
    position: [...(id === 'inside-room' ? PASS71_HF305_INSIDE_CAMERA : PASS71_HF305_OUTSIDE_CAMERA)],
    classification: id === 'inside-room' ? 'inside' : 'outside',
    committed: true,
    renderer,
    arenaId: 'gun-range',
    captureRevision,
    simulationFrame,
    submissionSequence: simulationFrame,
    completedSequence: simulationFrame,
    door: { phase: 'open', openness: 1, dynamicColliderCount: 0, dynamicBallisticSurfaceCount: 0 },
  };
}

function fixtureRun(renderer, reduced) {
  const mode = reduced ? 'reduced' : 'standard';
  const timeline = PASS71_HF305_TIMELINE_REMAINING_MS.map((targetRemainingMs, index) => ({
    targetRemainingMs,
    elapsedMs: 600 + index * 1_000,
    detonateInMs: targetRemainingMs,
    hudVisible: true,
    hudCountdown: String(Math.ceil(targetRemainingMs / 1_000)),
    warning: fixtureWarning(index, reduced),
    audio: {
      contextState: 'running', available: true, rms: reduced ? 0.018 : 0.05,
      peak: reduced ? 0.09 : 0.2, suspiciousBroadbandHiss: false,
      voices: 12, globalCap: 48, supportCues: 1,
    },
  }));
  const images = reduced
    ? [fixtureImage('reduced-inside', true, true)]
    : [
        fixtureImage('standard-outside', true),
        fixtureImage('standard-inside-visible', true),
        fixtureImage('standard-inside-hidden-control', false),
      ];
  const frozenFrame = reduced ? null : {
    contract: 'nuke-warning-frozen-visible-frame-v1', renderer,
    simulationFrame: 710, captureRevision: 2, submissionSequence: 200, completedSequence: 200,
    renderedAtMs: 5_000, detonateAtMs: 5_600, detonateInMs: 600,
    active: true, detonated: false, cameraPosition: [...PASS71_HF305_INSIDE_CAMERA],
    cameraQuaternion: [0, 0, 0, 1], beaconPosition: [...PASS71_HF305_WARNING_POSITION],
    beaconScale: timeline.at(-1).warning.scale, coreOpacity: timeline.at(-1).warning.coreOpacity,
    ringOpacity: timeline.at(-1).warning.ringOpacity, beaconVisible: true,
  };
  const hiddenControl = reduced ? null : {
    contract: 'nuke-warning-hidden-control-v1', nonPublishable: true, renderer,
    simulationFrame: 710, captureRevision: 2, officialSubmissionSequence: 200,
    submissionSequence: renderer === 'webgpu' ? 201 : 200,
    completedSequence: renderer === 'webgpu' ? 201 : 200,
    beaconPosition: [...PASS71_HF305_WARNING_POSITION], beaconScale: frozenFrame.beaconScale,
    coreOpacity: frozenFrame.coreOpacity, ringOpacity: frozenFrame.ringOpacity,
    beaconHiddenDuringSubmission: true, beaconRestored: true,
  };
  return {
    mode,
    accessibility: { requested: reduced, effective: reduced, reasons: reduced ? ['Reduced sensory effects'] : [], html: reduced ? 'true' : 'false' },
    physicalStart: { selector: '#solo', eventType: 'pointerdown', isTrusted: true, audioContext: 'running' },
    targetsBefore: fixtureTargets(true),
    activation: {
      activatedAtMs: 1_000, activationsBefore: 0, activationsAfter: 1, detonationsBefore: 0,
      supportCuesBefore: 0, supportCuesAfter: 1, active: true, detonated: false, detonateInMs: 4_980,
      warning: fixtureWarning(0, reduced),
    },
    timeline,
    cameras: reduced
      ? [fixtureCamera('inside-room', renderer, 1, 100)]
      : [fixtureCamera('outside-room', renderer, 1, 100), fixtureCamera('inside-room', renderer, 2, 200)],
    images,
    frozenFrame,
    hiddenControl,
    attributionCrop: reduced ? null : { left: 480, top: 302, width: 960, height: 540 },
    detonation: {
      observedElapsedMs: 5_030, activationsDelta: 1, detonationsDelta: 1,
      targetsAfter: fixtureTargets(false), warningHidden: true, nukeActive: true, nukeDetonated: true,
      explosionSource: 'nuke', explosionFrameSources: ['nuke'],
    },
  };
}

export function createPass71Hf305EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'b'.repeat(40);
  const hash = 'c'.repeat(64);
  const tooling = options.tooling ?? PASS71_HF305_TOOLING_PATHS.map((path) => ({ path, sha256: hash }));
  const samples = [0, 1_250, 2_500, 3_750, 5_000];
  const sample = (elapsedMs, reduced) => {
    const charge = elapsedMs / 5_000;
    const scale = reduced ? 0.42 : 1;
    return {
      elapsedMs, charge,
      scale: 0.65 + charge * (reduced ? 0.75 : 1.55),
      rotationY: charge * Math.PI * (reduced ? 0.35 : 1.5),
      coreOpacity: (0.18 + charge * 0.68) * scale,
      ringOpacity: (0.2 + charge * 0.56) * scale,
      skyFlash: (elapsedMs === 0 ? 0 : 0.12 * charge) * scale,
      fogBlend: charge * 0.24,
    };
  };
  const mechanical = {
    schemaVersion: 1, contract: 'atomic-acres/pass71-hf305-nuke-mechanical@1', status: 'PASS',
    sourceSha, sourceTreeSha, warningDurationMs: 5_000, nukeDamage: 1_000,
    authorityCases: [
      { ownerTeam: 0, targetTeam: 1, alive: true, damage: 1_000 },
      { ownerTeam: 0, targetTeam: 0, alive: true, damage: 0 },
      { ownerTeam: 0, targetTeam: 1, alive: false, damage: 0 },
    ],
    standardSamples: samples.map((elapsedMs) => sample(elapsedMs, false)),
    reducedSamples: samples.map((elapsedMs) => sample(elapsedMs, true)),
    audio: {
      standard: { gainScale: 1, maximumLayerGain: 0.107, scheduledVoices: 11, broadbandNoiseLayers: 0, durationSeconds: 5 },
      reduced: { gainScale: 0.42, maximumLayerGain: 0.04494, scheduledVoices: 11, broadbandNoiseLayers: 0, durationSeconds: 5 },
    },
    faults: [],
  };
  const servedCandidate = { schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha, treeSha256: hash, exactRootFileCount: 500, path: 'channels/the-big-one' };
  const runtime = (renderer) => ({
    schemaVersion: 1, contract: 'atomic-acres/pass71-hf305-nuke-runtime@1', status: 'PASS', sourceSha, servedCandidate,
    renderer: { requested: renderer, actual: renderer, adapterLabel: 'NVIDIA GeForce RTX 5080', softwareRenderer: false, requireWebGpu: renderer === 'webgpu' },
    browser: { version: '140.0.0.0', userAgent: 'Mozilla/5.0 Edg/140.0.0.0' },
    profile: { name: 'Quality', render: 'blender' },
    standard: fixtureRun(renderer, false), reduced: fixtureRun(renderer, true), clientRuntimeLog: [], faults: [],
  });
  const embedded = [mechanical, runtime('webgl2'), runtime('webgpu')];
  const definitions = [
    ['mechanical-authority', 'unit', 'scripts/qa/capture-pass71-hf305-nuke-authority.ts'],
    ['installed-edge-webgl2', 'browser', 'tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts'],
    ['installed-edge-webgpu', 'browser', 'tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts'],
  ];
  const components = definitions.map(([id, kind, sourcePath], index) => {
    const bytes = Buffer.from(`${JSON.stringify(embedded[index], null, 2)}\n`, 'utf8');
    return {
      id, kind, status: 'passed', sourcePath,
      receiptPath: `artifacts/pass71/hf305-nuke-warning/components/${index + 1}-${id}.json`,
      receiptSha256: sha256(bytes), receiptByteLength: bytes.length, embedded: embedded[index],
    };
  });
  const record = {
    ...PASS71_HF305_NUKE_WARNING_EVIDENCE,
    startedAt: '2026-08-13T20:00:00.000Z', completedAt: '2026-08-13T20:10:00.000Z',
    source: { expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha, sourceTreeSha, releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true },
    environment: { machine: 'dave-gaming-pc', hostnameSha256: hash, platform: 'win32', arch: 'x64' },
    browser: { channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: hash, executableVersion: '140.0.0.0', authenticodeStatus: 'Valid', authenticodeSigner: 'Microsoft Corporation', isolation: 'one-signed-installed-edge-process-and-fresh-profile-per-renderer' },
    tooling,
    coverage: { renderers: ['webgl2', 'webgpu'], sensoryModes: ['standard', 'reduced'], views: ['outside-room', 'inside-room'], warningDurationMs: 5_000, sameFrameBeaconAttribution: true, ownerSubjectiveInspectionPerformed: false },
    components, faults: [],
  };
  record.receiptSha256 = pass71Hf305RecordSha256(record);
  return record;
}
