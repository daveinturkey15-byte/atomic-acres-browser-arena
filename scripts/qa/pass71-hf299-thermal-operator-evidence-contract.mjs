import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const PASS71_HF299_THERMAL_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-299',
  kind: 'pass71-hf299-exact-thermal-operator-coverage',
  contract: 'atomic-acres/pass71-hf299-exact-thermal-operator-coverage@1',
  feedbackId: 'HF-299',
  status: 'passed',
  closesFeedback: true,
});

export const PASS71_HF299_THERMAL_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF299_THERMAL_EVIDENCE.evidenceId,
  kind: PASS71_HF299_THERMAL_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF299_SCOPES = Object.freeze([
  ...['bot', 'remote'].flatMap((targetKind) => (
    ['webgl2', 'webgpu'].flatMap((renderer) => (
      ['m14-ebr', 'railgun'].map((weapon) => Object.freeze({ targetKind, renderer, weapon }))
    ))
  )),
]);

export const PASS71_HF299_TOOL_PATHS = Object.freeze([
  'scripts/qa/pass71-hf299-thermal-operator-evidence-contract.mjs',
  'scripts/qa/run-pass71-hf299-thermal-operator-evidence.mjs',
  'tests/e2e/pass71-hf299-thermal-operator.spec.ts',
  'src/thermal-ghost-presentation.ts',
  'src/legacy-main.ts',
  'scripts/qa/run-playwright-with-topology.mjs',
  'scripts/release/stage-release-topology.mjs',
  'scripts/qa/pass71-edge-executable-identity.mjs',
  'tests/e2e/pass66-e2e-support.ts',
  'playwright.config.ts',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'release-channels.json',
]);

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CACHE = new Map();
const FIXTURE_PNG_CACHE = new Map();
const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
}));

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) failures.push(`${label}:schema`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(bytes) {
  const digest = sha256(bytes);
  const cached = PNG_CACHE.get(digest);
  if (cached) return cached;
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > 8 * 1024 * 1024
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a bounded PNG');
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const compressed = [];
  let sawEnd = false;
  let chunkIndex = 0;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('truncated PNG chunk');
    const data = bytes.subarray(dataStart, dataEnd);
    if (bytes.readUInt32BE(dataEnd) !== crc32(bytes.subarray(offset + 4, dataEnd))) throw new Error('PNG checksum mismatch');
    if (chunkIndex === 0 && type !== 'IHDR') throw new Error('PNG IHDR must be first');
    if (type === 'IHDR') {
      if (length !== 13 || width !== null) throw new Error('invalid PNG IHDR');
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0) throw new Error('unsupported PNG compression or filter');
      interlace = data[12];
    } else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') {
      if (length !== 0) throw new Error('invalid PNG end');
      sawEnd = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
    chunkIndex += 1;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (!sawEnd || offset !== bytes.length || width !== 1280 || height !== 720 || bitDepth !== 8
    || channels === null || interlace !== 0 || compressed.length < 1) throw new Error('unsupported exact HF-299 PNG');
  const stride = width * channels;
  const expectedInflatedBytes = height * (stride + 1);
  const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedInflatedBytes });
  if (inflated.length !== expectedInflatedBytes) throw new Error('PNG scanline length mismatch');
  const reconstructed = Buffer.alloc(width * height * channels);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    if (filter > 4) throw new Error('unsupported PNG scanline filter');
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const encoded = inflated[sourceOffset + x];
      const left = x >= channels ? reconstructed[rowOffset + x - channels] : 0;
      const above = y > 0 ? reconstructed[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? reconstructed[rowOffset - stride + x - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? above
        : filter === 3 ? Math.floor((left + above) / 2) : paeth(left, above, upperLeft);
      reconstructed[rowOffset + x] = (encoded + predictor) & 255;
    }
    sourceOffset += stride;
  }
  const rgb = Buffer.alloc(width * height * 3);
  for (let source = 0, target = 0; source < reconstructed.length; source += channels, target += 3) {
    if (channels === 4 && reconstructed[source + 3] !== 255) throw new Error('HF-299 PNG must be opaque');
    rgb[target] = reconstructed[source];
    rgb[target + 1] = reconstructed[source + 1];
    rgb[target + 2] = reconstructed[source + 2];
  }
  const decoded = Object.freeze({ digest, width, height, rgb });
  PNG_CACHE.set(digest, decoded);
  return decoded;
}

function rounded(value) {
  return Number(value.toFixed(6));
}

export function pass71Hf299ThermalRasterAttribution(visibleBytes, controlBytes) {
  const visible = decodePng(visibleBytes);
  const control = decodePng(controlBytes);
  if (visible.width !== control.width || visible.height !== control.height) throw new Error('HF-299 paired PNG dimensions differ');
  let changedPixels = 0;
  let attributableThermalPixels = 0;
  let maximumChannelDelta = 0;
  for (let offset = 0; offset < visible.rgb.length; offset += 3) {
    const red = visible.rgb[offset];
    const green = visible.rgb[offset + 1];
    const blue = visible.rgb[offset + 2];
    const delta = Math.max(
      Math.abs(red - control.rgb[offset]),
      Math.abs(green - control.rgb[offset + 1]),
      Math.abs(blue - control.rgb[offset + 2]),
    );
    maximumChannelDelta = Math.max(maximumChannelDelta, delta);
    if (delta >= 24) changedPixels += 1;
    const thermalOrange = red >= 150 && green >= 35 && green <= 190 && blue <= 125
      && red >= green + 35 && red >= blue + 55;
    const controlIsNotThermal = control.rgb[offset] < 140
      || control.rgb[offset] < control.rgb[offset + 1] + 25
      || control.rgb[offset] < control.rgb[offset + 2] + 40;
    if (thermalOrange && controlIsNotThermal && delta >= 40) attributableThermalPixels += 1;
  }
  const pixelCount = visible.width * visible.height;
  return Object.freeze({
    width: visible.width,
    height: visible.height,
    pixelCount,
    changedPixelsAt24: changedPixels,
    changedPixelRatioAt24: rounded(changedPixels / pixelCount),
    attributableThermalPixels,
    attributableThermalPixelRatio: rounded(attributableThermalPixels / pixelCount),
    maximumChannelDelta,
  });
}

export function pass71Hf299CanonicalBytes(record) {
  if (!object(record)) throw new Error('HF-299 record must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonical(unsigned))}\n`, 'utf8');
}

export function pass71Hf299RecordSha256(record) {
  return sha256(pass71Hf299CanonicalBytes(record));
}

export function pass71Hf299ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-299 source must be a full SHA');
  return Object.freeze(PASS71_HF299_TOOL_PATHS.map((path) => ({
    path,
    sha256: sha256(execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
      windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    })),
  })));
}

function validReveal(reveal, targetId) {
  return object(reveal)
    && reveal.contract === 'occlusion-conditioned-single-exact-animated-thermal-operator-v2'
    && reveal.activeTargets === 1 && reveal.occludedTargets === 1
    && same(reveal.activeTargetIds, [targetId]) && same(reveal.occludedTargetIds, [targetId])
    && same(reveal.visibleOriginalTargetIds, [])
    && reveal.activeSourceBodyLayers > 0
    && reveal.activeModelLayers === reveal.activeSourceBodyLayers
    && reveal.activeThermalLayers === reveal.activeSourceBodyLayers
    && reveal.activeHaloLayers === 0 && reveal.geometryIdentity === true
    && reveal.skeletonIdentity === true && reveal.bindMatrixIdentity === true
    && reveal.meshWorldMatrixIdentity === true && reveal.boneWorldMatrixIdentity === true
    && reveal.silhouetteLayerIdentity === true && reveal.monochromeThermal === true
    && reveal.throughGeometry === true && reveal.orangeHalo === false
    && reveal.treatmentsPerTarget === 1 && reveal.completeOperatorModels === true
    && reveal.incompleteTargets === 0 && reveal.proxyMeshes === 0
    && reveal.ownedMaterials === 1 && reveal.materialBudgetExceeded === false;
}

function finiteTuple(value, length) {
  return Array.isArray(value) && value.length === length
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function validFrameAttribution(occluded, renderer, targetId) {
  const visible = occluded?.visibleFrame;
  const control = occluded?.hiddenControl;
  const completionSemantics = renderer === 'webgpu'
    ? 'submission-sequence-covered-by-completion-frontier'
    : 'synchronous-render-return';
  return object(visible) && object(control)
    && visible.contract === 'thermal-operator-frozen-visible-frame-v1'
    && visible.renderer === renderer && visible.completionSemantics === completionSemantics
    && Number.isSafeInteger(visible.simulationFrame) && visible.simulationFrame > 0
    && Number.isSafeInteger(visible.submissionSequence) && visible.submissionSequence >= 0
    && Number.isSafeInteger(visible.completedSequence) && visible.completedSequence >= 0
    && (renderer !== 'webgpu' || visible.completedSequence >= visible.submissionSequence)
    && visible.targetId === targetId && visible.activeSourceBodyLayers > 0
    && visible.activeModelLayers === visible.activeSourceBodyLayers
    && finiteTuple(visible.cameraPosition, 3) && finiteTuple(visible.cameraQuaternion, 4)
    && control.contract === 'thermal-operator-hidden-control-v1' && control.nonPublishable === true
    && control.renderer === renderer && control.completionSemantics === completionSemantics
    && control.simulationFrame === visible.simulationFrame
    && control.officialSubmissionSequence === visible.submissionSequence
    && Number.isSafeInteger(control.submissionSequence) && control.submissionSequence >= 0
    && Number.isSafeInteger(control.completedSequence) && control.completedSequence >= 0
    && (renderer !== 'webgpu' || (control.submissionSequence > visible.submissionSequence
      && control.completedSequence >= control.submissionSequence))
    && control.targetId === targetId
    && control.activeSourceBodyLayers === visible.activeSourceBodyLayers
    && control.activeModelLayers === visible.activeModelLayers
    && same(control.cameraPosition, visible.cameraPosition)
    && same(control.cameraQuaternion, visible.cameraQuaternion)
    && control.thermalMaterialHiddenDuringSubmission === true
    && control.thermalMaterialRestored === true;
}

function validateThermalRaster(visibleImage, controlImage, declared, label, failures) {
  exactKeys(declared, [
    'width', 'height', 'pixelCount', 'changedPixelsAt24', 'changedPixelRatioAt24',
    'attributableThermalPixels', 'attributableThermalPixelRatio', 'maximumChannelDelta',
  ], `${label}:schema`, failures);
  try {
    const actual = pass71Hf299ThermalRasterAttribution(
      Buffer.from(visibleImage?.dataBase64 ?? '', 'base64'),
      Buffer.from(controlImage?.dataBase64 ?? '', 'base64'),
    );
    if (!same(declared, actual)) failures.push(`${label}:recompute`);
    if (actual.changedPixelsAt24 < 96 || actual.changedPixelRatioAt24 < 0.0001
      || actual.attributableThermalPixels < 64 || actual.attributableThermalPixelRatio < 0.00006
      || actual.maximumChannelDelta < 64) failures.push(`${label}:thresholds`);
  } catch {
    failures.push(`${label}:recompute`);
  }
}

function validatePng(image, label, failures) {
  exactKeys(image, ['mimeType', 'width', 'height', 'byteLength', 'sha256', 'dataBase64'], label, failures);
  try {
    const bytes = Buffer.from(image?.dataBase64 ?? '', 'base64');
    if (image?.mimeType !== 'image/png' || image.dataBase64 !== bytes.toString('base64')
      || bytes.length !== image.byteLength || image.sha256 !== sha256(bytes)
      || image.width !== 1280 || image.height !== 720) throw new Error('image metadata mismatch');
    decodePng(bytes);
  } catch {
    failures.push(`${label}:bytes`);
  }
}

export function pass71Hf299EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== 1 || record.evidenceId !== 'HF-299'
    || record.kind !== PASS71_HF299_THERMAL_EVIDENCE.kind
    || record.contract !== PASS71_HF299_THERMAL_EVIDENCE.contract
    || record.feedbackId !== 'HF-299' || record.status !== 'passed' || record.closesFeedback !== true) {
    return ['hf299-identity-or-status'];
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'startedAt', 'completedAt', 'source', 'environment', 'browser', 'tooling', 'scopes',
    'faults', 'claims', 'receiptSha256',
  ], 'receipt', failures);
  const source = record.source;
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'servedSourceSha', 'endingCheckoutSourceSha',
    'cleanBefore', 'cleanAfter', 'servedSchemaVersion', 'servedReleasePass', 'servedChannel',
    'servedPath', 'servedTreeSha256', 'servedFileCount',
  ], 'source', failures);
  if (!SHA40.test(expected.sourceSha ?? '') || source?.expectedSourceSha !== expected.sourceSha
    || source.checkoutSourceSha !== expected.sourceSha || source.servedSourceSha !== expected.sourceSha
    || source.endingCheckoutSourceSha !== expected.sourceSha || source.cleanBefore !== true || source.cleanAfter !== true
    || source.servedSchemaVersion !== 4 || source.servedReleasePass !== 'PASS 71'
    || source.servedChannel !== 'the-big-one' || source.servedPath !== 'channels/the-big-one'
    || !SHA256.test(source.servedTreeSha256 ?? '') || !Number.isSafeInteger(source.servedFileCount)
    || source.servedFileCount < 2) failures.push('exact-source-and-served-candidate');
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('environment');
  exactKeys(record.browser, [
    'channel', 'installed', 'version', 'userAgent', 'executableName', 'executableVersion',
    'executableSha256', 'installRoot', 'signatureStatus', 'signer', 'isolation',
  ], 'browser', failures);
  if (record.browser?.channel !== 'msedge' || record.browser?.installed !== true
    || !/^\d+(?:\.\d+){3}$/u.test(record.browser?.version ?? '')
    || record.browser?.executableVersion !== record.browser?.version
    || !new RegExp(`\\bEdg/${String(record.browser?.version ?? '').replaceAll('.', '\\.')}(?:\\s|$)`, 'u').test(record.browser?.userAgent ?? '')
    || record.browser?.executableName !== 'msedge.exe'
    || record.browser?.signatureStatus !== 'Valid' || !/Microsoft Corporation/iu.test(record.browser?.signer ?? '')
    || !SHA256.test(record.browser?.executableSha256 ?? '') || !/Microsoft\/Edge\/Application/iu.test(record.browser?.installRoot ?? '')
    || record.browser?.isolation !== 'fresh-process-and-profile-per-scope') failures.push('installed-edge');
  if (!same(record.tooling, expected.tooling)
    || !Array.isArray(record.tooling) || record.tooling.length !== PASS71_HF299_TOOL_PATHS.length
    || record.tooling.some((entry, index) => entry?.path !== PASS71_HF299_TOOL_PATHS[index]
      || !SHA256.test(entry?.sha256 ?? ''))) failures.push('tooling');
  if (!Array.isArray(record.scopes) || record.scopes.length !== PASS71_HF299_SCOPES.length
    || !same(record.scopes.map(({ targetKind, renderer, weapon }) => ({ targetKind, renderer, weapon })), PASS71_HF299_SCOPES)) {
    failures.push('complete-scope-matrix');
  } else {
    for (const [index, scope] of record.scopes.entries()) {
      const label = `scope:${scope.targetKind}:${scope.renderer}:${scope.weapon}`;
      exactKeys(scope, [
        'targetKind', 'renderer', 'weapon', 'freshProcess', 'trustedRmb', 'runtime', 'authority', 'occluded', 'unobstructed',
        'cleanup', 'occludedImage', 'occludedControlImage', 'occludedRaster', 'unobstructedImage', 'cleanupImage',
      ], label, failures);
      exactKeys(scope.runtime, [
        'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
        'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
      ], `${label}:runtime`, failures);
      exactKeys(scope.authority, ['targetId', 'targetKind', 'living', 'hostile'], `${label}:authority`, failures);
      exactKeys(scope.occluded, ['targetId', 'wallBlocked', 'reveal', 'visibleFrame', 'hiddenControl'], `${label}:occluded`, failures);
      exactKeys(scope.occluded?.reveal, [
        'contract', 'activeTargets', 'activeTargetIds', 'occludedTargets', 'occludedTargetIds',
        'visibleOriginalTargets', 'visibleOriginalTargetIds', 'activeSourceBodyLayers', 'activeModelLayers',
        'activeThermalLayers', 'activeHaloLayers', 'geometryIdentity', 'skeletonIdentity', 'bindMatrixIdentity',
        'meshWorldMatrixIdentity', 'boneWorldMatrixIdentity', 'silhouetteLayerIdentity', 'monochromeThermal',
        'throughGeometry', 'orangeHalo', 'treatmentsPerTarget', 'completeOperatorModels',
        'incompleteTargets', 'proxyMeshes', 'ownedMaterials',
        'materialBudgetExceeded',
      ], `${label}:occluded-reveal`, failures);
      exactKeys(scope.occluded?.visibleFrame, [
        'contract', 'renderer', 'completionSemantics', 'simulationFrame', 'submissionSequence',
        'completedSequence', 'targetId', 'activeSourceBodyLayers', 'activeModelLayers',
        'cameraPosition', 'cameraQuaternion',
      ], `${label}:visible-frame`, failures);
      exactKeys(scope.occluded?.hiddenControl, [
        'contract', 'nonPublishable', 'renderer', 'completionSemantics', 'simulationFrame',
        'officialSubmissionSequence', 'submissionSequence', 'completedSequence', 'targetId',
        'activeSourceBodyLayers', 'activeModelLayers', 'cameraPosition', 'cameraQuaternion',
        'thermalMaterialHiddenDuringSubmission', 'thermalMaterialRestored',
      ], `${label}:hidden-control`, failures);
      exactKeys(scope.unobstructed, [
        'targetId', 'wallBlocked', 'reveal', 'ordinarySourceVisible', 'thermalLayers',
      ], `${label}:unobstructed`, failures);
      exactKeys(scope.unobstructed?.reveal, [
        'activeTargets', 'activeTargetIds', 'visibleOriginalTargets', 'visibleOriginalTargetIds',
      ], `${label}:unobstructed-reveal`, failures);
      exactKeys(scope.cleanup, ['release', 'swap', 'death', 'proxyMeshes', 'domBodyMarkers'], `${label}:cleanup`, failures);
      exactKeys(scope.cleanup?.release, ['activeTargets', 'activeModelLayers', 'adsHeld'], `${label}:release`, failures);
      exactKeys(scope.cleanup?.swap, ['activeTargets', 'activeModelLayers', 'weapon'], `${label}:swap`, failures);
      exactKeys(scope.cleanup?.death, ['activeTargets', 'activeModelLayers', 'targetAlive'], `${label}:death`, failures);
      if (scope.freshProcess !== true || scope.trustedRmb !== true
        || scope.runtime?.requestedBackend !== scope.renderer || scope.runtime?.actualBackend !== scope.renderer
        || scope.runtime?.initialized !== true || scope.runtime?.softwareAdapter !== false
        || scope.runtime?.deviceLost !== false || scope.runtime?.uncapturedErrors !== 0
        || scope.runtime?.presentationStatus !== (scope.renderer === 'webgpu' ? 'healthy' : 'synchronous')
        || !object(scope.authority) || scope.authority.living !== true || scope.authority.hostile !== true
        || scope.authority?.targetKind !== scope.targetKind || scope.authority?.targetId !== scope.occluded?.targetId
        || !validReveal(scope.occluded?.reveal, scope.occluded?.targetId) || scope.occluded?.wallBlocked !== true
        || !validFrameAttribution(scope.occluded, scope.renderer, scope.occluded?.targetId)
        || scope.unobstructed?.wallBlocked !== false || scope.unobstructed?.targetId !== scope.occluded?.targetId
        || scope.unobstructed?.reveal?.activeTargets !== 0 || scope.unobstructed?.reveal?.visibleOriginalTargets !== 1
        || !same(scope.unobstructed?.reveal?.activeTargetIds, [])
        || !same(scope.unobstructed?.reveal?.visibleOriginalTargetIds, [scope.occluded?.targetId])
        || scope.unobstructed?.ordinarySourceVisible !== true || scope.unobstructed?.thermalLayers !== 0
        || scope.cleanup?.release?.activeTargets !== 0 || scope.cleanup?.release?.activeModelLayers !== 0
        || scope.cleanup?.swap?.activeTargets !== 0 || scope.cleanup?.swap?.activeModelLayers !== 0
        || scope.cleanup?.death?.activeTargets !== 0 || scope.cleanup?.death?.activeModelLayers !== 0
        || scope.cleanup?.death?.targetAlive !== false || scope.cleanup?.release?.adsHeld !== false
        || scope.cleanup?.swap?.weapon === scope.weapon || scope.cleanup?.proxyMeshes !== 0
        || scope.cleanup?.domBodyMarkers !== 0) failures.push(`${label}:semantics`);
      validatePng(scope.occludedImage, `${label}:occluded-image`, failures);
      validatePng(scope.occludedControlImage, `${label}:occluded-control-image`, failures);
      validateThermalRaster(scope.occludedImage, scope.occludedControlImage, scope.occludedRaster, `${label}:occluded-raster`, failures);
      validatePng(scope.unobstructedImage, `${label}:unobstructed-image`, failures);
      validatePng(scope.cleanupImage, `${label}:cleanup-image`, failures);
      if (index > 0 && scope.occluded?.targetId === record.scopes[index - 1]?.occluded?.targetId
        && scope.targetKind !== record.scopes[index - 1]?.targetKind) failures.push(`${label}:target-kind-identity`);
    }
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('faults');
  if (!same(record.claims, {
    physicalTrustedRmb: true,
    botAndRemoteOperators: true,
    webgl2AndWebgpu: true,
    occludedAndOpenLos: true,
    sameFrameRasterAttribution: true,
    releaseSwapDeathCleanup: true,
    ownerSubjectiveApproval: 'not-claimed',
  })) failures.push('claims');
  if (!ISO.test(record.startedAt ?? '') || !ISO.test(record.completedAt ?? '')
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '') || record.receiptSha256 !== pass71Hf299RecordSha256(record)) {
    failures.push('receipt-sha256');
  }
  return [...new Set(failures)].sort();
}

export const PASS71_HF299_THERMAL_EVIDENCE_REGISTRY_ENTRY = Object.freeze({
  descriptor: PASS71_HF299_THERMAL_EVIDENCE_DESCRIPTOR,
  validate(record, context) {
    try {
      return pass71Hf299EvidenceFailures(record, {
        sourceSha: context?.sourceSha,
        tooling: context?.options?.pass71Hf299Tooling
          ?? pass71Hf299ToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha),
      });
    } catch (error) {
      return [`hf299-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
    }
  },
});

function fixturePng(thermal) {
  const cached = FIXTURE_PNG_CACHE.get(thermal);
  if (cached) return cached;
  const width = 1280;
  const height = 720;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 3;
      const highlighted = thermal && x >= 600 && x < 640 && y >= 320 && y < 360;
      raw[offset] = highlighted ? 245 : 28;
      raw[offset + 1] = highlighted ? 88 : 34;
      raw[offset + 2] = highlighted ? 18 : 42;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const bytes = Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  const evidence = Object.freeze({
    mimeType: 'image/png', width, height, byteLength: bytes.length,
    sha256: sha256(bytes), dataBase64: bytes.toString('base64'),
  });
  FIXTURE_PNG_CACHE.set(thermal, evidence);
  return evidence;
}

function fixtureReveal(targetId, active = true) {
  if (!active) {
    return Object.freeze({
      activeTargets: 0, activeTargetIds: [], visibleOriginalTargets: 1,
      visibleOriginalTargetIds: [targetId],
    });
  }
  return Object.freeze({
    contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2',
    activeTargets: 1, activeTargetIds: [targetId], occludedTargets: 1,
    occludedTargetIds: [targetId], visibleOriginalTargets: 0, visibleOriginalTargetIds: [],
    activeSourceBodyLayers: 9, activeModelLayers: 9, activeThermalLayers: 9,
    activeHaloLayers: 0, geometryIdentity: true, skeletonIdentity: true,
    bindMatrixIdentity: true, meshWorldMatrixIdentity: true, boneWorldMatrixIdentity: true,
    silhouetteLayerIdentity: true, monochromeThermal: true, throughGeometry: true,
    orangeHalo: false, treatmentsPerTarget: 1, completeOperatorModels: true,
    incompleteTargets: 0, proxyMeshes: 0, ownedMaterials: 1, materialBudgetExceeded: false,
  });
}

export function createPass71Hf299EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const tooling = options.tooling ?? PASS71_HF299_TOOL_PATHS.map((path, index) => ({
    path, sha256: String(index + 1).padStart(64, '0'),
  }));
  const visibleImage = fixturePng(true);
  const controlImage = fixturePng(false);
  const record = {
    ...PASS71_HF299_THERMAL_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T09:01:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T09:05:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, servedSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha, cleanBefore: true, cleanAfter: true,
      servedSchemaVersion: 4, servedReleasePass: 'PASS 71', servedChannel: 'the-big-one',
      servedPath: 'channels/the-big-one', servedTreeSha256: 'b'.repeat(64), servedFileCount: 515,
    },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, version: '151.0.4129.72',
      userAgent: 'Mozilla/5.0 Edg/151.0.4129.72', executableName: 'msedge.exe',
      executableVersion: '151.0.4129.72', executableSha256: 'c'.repeat(64),
      installRoot: 'C:/Program Files (x86)/Microsoft/Edge/Application', signatureStatus: 'Valid',
      signer: 'Microsoft Corporation', isolation: 'fresh-process-and-profile-per-scope',
    },
    tooling,
    scopes: PASS71_HF299_SCOPES.map((scope, index) => {
      const targetId = `${scope.targetKind}-${index}`;
      const completionSemantics = scope.renderer === 'webgpu'
        ? 'submission-sequence-covered-by-completion-frontier' : 'synchronous-render-return';
      const submissionSequence = scope.renderer === 'webgpu' ? 5 : 0;
      const visibleFrame = {
        contract: 'thermal-operator-frozen-visible-frame-v1', renderer: scope.renderer,
        completionSemantics, simulationFrame: 500, submissionSequence,
        completedSequence: submissionSequence, targetId, activeSourceBodyLayers: 9,
        activeModelLayers: 9, cameraPosition: [-9, 1.7, -12.5], cameraQuaternion: [0, 0, 0, 1],
      };
      const hiddenControl = {
        contract: 'thermal-operator-hidden-control-v1', nonPublishable: true,
        renderer: scope.renderer, completionSemantics, simulationFrame: 500,
        officialSubmissionSequence: submissionSequence,
        submissionSequence: scope.renderer === 'webgpu' ? 6 : 0,
        completedSequence: scope.renderer === 'webgpu' ? 6 : 0,
        targetId, activeSourceBodyLayers: 9, activeModelLayers: 9,
        cameraPosition: [-9, 1.7, -12.5], cameraQuaternion: [0, 0, 0, 1],
        thermalMaterialHiddenDuringSubmission: true, thermalMaterialRestored: true,
      };
      return {
        ...scope, freshProcess: true, trustedRmb: true,
        runtime: {
          requestedBackend: scope.renderer, actualBackend: scope.renderer, initialized: true,
          adapterClass: scope.renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
          deviceClass: scope.renderer === 'webgpu' ? 'GPUDevice' : null,
          adapterLabel: 'NVIDIA GeForce RTX 5080', softwareAdapter: false, deviceLost: false,
          uncapturedErrors: 0, presentationStatus: scope.renderer === 'webgpu' ? 'healthy' : 'synchronous',
        },
        authority: { targetId, targetKind: scope.targetKind, living: true, hostile: true },
        occluded: {
          targetId, wallBlocked: true, reveal: fixtureReveal(targetId), visibleFrame, hiddenControl,
        },
        unobstructed: {
          targetId, wallBlocked: false, reveal: fixtureReveal(targetId, false),
          ordinarySourceVisible: true, thermalLayers: 0,
        },
        cleanup: {
          release: { activeTargets: 0, activeModelLayers: 0, adsHeld: false },
          swap: { activeTargets: 0, activeModelLayers: 0, weapon: 'carbine' },
          death: { activeTargets: 0, activeModelLayers: 0, targetAlive: false },
          proxyMeshes: 0, domBodyMarkers: 0,
        },
        occludedImage: visibleImage, occludedControlImage: controlImage,
        occludedRaster: pass71Hf299ThermalRasterAttribution(
          Buffer.from(visibleImage.dataBase64, 'base64'), Buffer.from(controlImage.dataBase64, 'base64'),
        ),
        unobstructedImage: controlImage, cleanupImage: controlImage,
      };
    }),
    faults: [],
    claims: {
      physicalTrustedRmb: true, botAndRemoteOperators: true, webgl2AndWebgpu: true,
      occludedAndOpenLos: true, sameFrameRasterAttribution: true,
      releaseSwapDeathCleanup: true, ownerSubjectiveApproval: 'not-claimed',
    },
  };
  record.receiptSha256 = pass71Hf299RecordSha256(record);
  return record;
}
