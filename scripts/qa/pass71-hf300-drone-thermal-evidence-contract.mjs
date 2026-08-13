import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

export const PASS71_HF300_DRONE_THERMAL_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-300',
  kind: 'pass71-hf300-piloted-drone-exact-thermal',
  contract: 'atomic-acres/pass71-hf300-piloted-drone-exact-thermal-closure@1',
  feedbackId: 'HF-300',
  status: 'passed',
  coverageDisposition: 'full-exact-native-matrix',
  closesFeedback: true,
});

export const PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF300_DRONE_THERMAL_EVIDENCE.evidenceId,
  kind: PASS71_HF300_DRONE_THERMAL_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF300_DRONE_THERMAL_SCOPES = Object.freeze([
  Object.freeze({ targetKind: 'bot', mode: 'solo', renderer: 'webgl2' }),
  Object.freeze({ targetKind: 'bot', mode: 'solo', renderer: 'webgpu' }),
  Object.freeze({ targetKind: 'remote-human', mode: 'hosted', renderer: 'webgl2' }),
  Object.freeze({ targetKind: 'remote-human', mode: 'hosted', renderer: 'webgpu' }),
]);

export const PASS71_HF300_DRONE_THERMAL_COVERAGE = Object.freeze({
  arenaId: 'atomic-acres',
  renderProfile: 'blender',
  targetKinds: Object.freeze(['bot', 'remote-human']),
  modes: Object.freeze(['solo', 'hosted']),
  renderers: Object.freeze(['webgl2', 'webgpu']),
  phases: Object.freeze(['occluded', 'line-of-sight', 'exit', 'match-end', 'rematch', 'death']),
  browser: 'installed-authenticode-valid-microsoft-edge',
  processIsolation: 'fresh-owned-edge-process-and-profile-per-scope',
  topology: 'owned-fresh-pass71-staged-candidate-a',
  runtime: 'native-hardware-webgl2-and-fail-closed-webgpu',
  authority: Object.freeze({
    sensorAdmission: 'host-killstreak-sensor-contacts',
    occlusion: 'active-world-collider-field',
    presentation: 'shared-exact-animated-thermal-operator',
    gameplayMutation: 'none',
  }),
  visualProof: 'lossless-embedded-320x320-target-roi-with-same-camera-active-cleanup-controls',
});

export const PASS71_HF300_DRONE_THERMAL_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf300-drone-thermal-evidence.mjs',
  contract: 'scripts/qa/pass71-hf300-drone-thermal-evidence-contract.mjs',
  spec: 'tests/e2e/pass71-hf300-drone-thermal.spec.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  peerSupport: 'tests/e2e/pass66-e2e-support.ts',
  thermalPresentation: 'src/thermal-ghost-presentation.ts',
  killstreakRuntime: 'src/killstreak-runtime.ts',
  supportCatalog: 'src/killstreak-support-catalog.ts',
  runtimeIntegration: 'src/legacy-main.ts',
  playwrightConfig: 'playwright.config.ts',
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8a-f][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_WIDTH = 320;
const PNG_HEIGHT = 320;
const PNG_CACHE = new Map();
const PNG_PAIR_CACHE = new Map();
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function exactKeys(value, expected, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...expected].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
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
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(bytes) {
  const digest = sha256(bytes);
  const cached = PNG_CACHE.get(digest);
  if (cached) return cached;
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > 1_500_000
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a bounded PNG');
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  let sawEnd = false;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = typeBytes.toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('truncated PNG chunk');
    const data = bytes.subarray(dataStart, dataEnd);
    if (bytes.readUInt32BE(dataEnd) !== crc32(Buffer.concat([typeBytes, data]))) {
      throw new Error(`PNG ${type} checksum mismatch`);
    }
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
      sawEnd = true;
      offset = dataEnd + 4;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!sawEnd || offset !== bytes.length || width !== PNG_WIDTH || height !== PNG_HEIGHT
    || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0 || compressed.length === 0) {
    throw new Error('PNG does not match the exact HF-300 ROI contract');
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const expectedInflatedBytes = height * (stride + 1);
  const inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedInflatedBytes });
  if (inflated.length !== expectedInflatedBytes) throw new Error('PNG scanline length mismatch');
  const reconstructed = Buffer.alloc(width * height * channels);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset++];
    if (filter > 4) throw new Error('unsupported PNG scanline filter');
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const encoded = inflated[sourceOffset + x];
      const left = x >= channels ? reconstructed[rowOffset + x - channels] : 0;
      const above = y > 0 ? reconstructed[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? reconstructed[rowOffset - stride + x - channels] : 0;
      const predictor = filter === 0 ? 0
        : filter === 1 ? left
          : filter === 2 ? above
            : filter === 3 ? Math.floor((left + above) / 2)
              : paeth(left, above, upperLeft);
      reconstructed[rowOffset + x] = (encoded + predictor) & 255;
    }
    sourceOffset += stride;
  }
  const rgb = Buffer.alloc(width * height * 3);
  let opaque = true;
  for (let source = 0, target = 0; source < reconstructed.length; source += channels, target += 3) {
    rgb[target] = reconstructed[source];
    rgb[target + 1] = reconstructed[source + 1];
    rgb[target + 2] = reconstructed[source + 2];
    if (channels === 4 && reconstructed[source + 3] !== 255) opaque = false;
  }
  const decoded = Object.freeze({ digest, width, height, bitDepth, colorType, opaque, rgb });
  PNG_CACHE.set(digest, decoded);
  return decoded;
}

function thermalOrange(red, green, blue) {
  return red >= 175 && green >= 45 && green <= 225 && blue <= 150
    && red - green >= 25 && green - blue >= 15;
}

function imageMetrics(decoded) {
  const histogram = new Uint32Array(256);
  let sum = 0;
  let sumSquares = 0;
  let orangePixels = 0;
  for (let offset = 0; offset < decoded.rgb.length; offset += 3) {
    const red = decoded.rgb[offset];
    const green = decoded.rgb[offset + 1];
    const blue = decoded.rgb[offset + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    histogram[Math.max(0, Math.min(255, Math.round(luminance)))] += 1;
    sum += luminance;
    sumSquares += luminance * luminance;
    if (thermalOrange(red, green, blue)) orangePixels += 1;
  }
  const pixelCount = decoded.width * decoded.height;
  const mean = sum / pixelCount;
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const probability = count / pixelCount;
    entropy -= probability * Math.log2(probability);
  }
  return Object.freeze({
    meanLuminance255: rounded(mean),
    luminanceStdDev255: rounded(Math.sqrt(Math.max(0, sumSquares / pixelCount - mean * mean))),
    entropyBits: rounded(entropy),
    thermalOrangePixels: orangePixels,
    thermalOrangeRatio: rounded(orangePixels / pixelCount),
  });
}

export function pass71Hf300PngEvidence(bytes) {
  const decoded = decodePng(bytes);
  return Object.freeze({
    encoding: 'png-base64-lossless',
    sha256: decoded.digest,
    encodedBytes: bytes.length,
    width: decoded.width,
    height: decoded.height,
    bitDepth: decoded.bitDepth,
    colorType: decoded.colorType,
    opaque: decoded.opaque,
    base64: bytes.toString('base64'),
    metrics: imageMetrics(decoded),
  });
}

export function pass71Hf300PngPairMetrics(activeBytes, cleanupBytes) {
  const active = decodePng(activeBytes);
  const cleanup = decodePng(cleanupBytes);
  const cacheKey = `${active.digest}:${cleanup.digest}`;
  const cached = PNG_PAIR_CACHE.get(cacheKey);
  if (cached) return cached;
  let changedPixelsAt12 = 0;
  let absoluteRgbDelta = 0;
  for (let offset = 0; offset < active.rgb.length; offset += 3) {
    const red = Math.abs(active.rgb[offset] - cleanup.rgb[offset]);
    const green = Math.abs(active.rgb[offset + 1] - cleanup.rgb[offset + 1]);
    const blue = Math.abs(active.rgb[offset + 2] - cleanup.rgb[offset + 2]);
    if (Math.max(red, green, blue) >= 12) changedPixelsAt12 += 1;
    absoluteRgbDelta += red + green + blue;
  }
  const pixelCount = active.width * active.height;
  const activeMetrics = imageMetrics(active);
  const cleanupMetrics = imageMetrics(cleanup);
  const result = Object.freeze({
    changedPixelsAt12,
    changedPixelRatioAt12: rounded(changedPixelsAt12 / pixelCount),
    meanAbsoluteRgbDelta255: rounded(absoluteRgbDelta / (pixelCount * 3)),
    thermalOrangePixelDelta: activeMetrics.thermalOrangePixels - cleanupMetrics.thermalOrangePixels,
  });
  PNG_PAIR_CACHE.set(cacheKey, result);
  return result;
}

export function pass71Hf300CanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-300 evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf300RecordSha256(record) {
  return sha256(pass71Hf300CanonicalBytes(record));
}

export function pass71Hf300ToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF300_DRONE_THERMAL_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256(readFileSync(resolve(repositoryRoot, path)))],
  )));
}

export function pass71Hf300ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-300 tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF300_DRONE_THERMAL_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    ))],
  )));
}

export function pass71Hf300SourceTreeAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-300 source must be a full SHA');
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!SHA40.test(expected?.sourceSha ?? '') || !SHA40.test(expected?.sourceTreeSha ?? '')
    || source?.expectedSourceSha !== expected.sourceSha || source?.checkoutSourceSha !== expected.sourceSha
    || source?.endingCheckoutSourceSha !== expected.sourceSha || source?.sourceTreeSha !== expected.sourceTreeSha
    || source?.releasePass !== 'PASS 71' || source?.cleanBefore !== true || source?.cleanAfter !== true) {
    failures.push('exact-clean-candidate-a-source');
  }
}

function validateServedCandidate(candidate, expectedSourceSha, label, failures) {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], label, failures);
  if (candidate?.schemaVersion !== 4 || candidate?.channel !== 'the-big-one'
    || candidate?.releasePass !== 'PASS 71' || candidate?.sourceSha !== expectedSourceSha
    || candidate?.path !== 'channels/the-big-one'
    || !SHA256.test(candidate?.treeSha256 ?? '')
    || !Number.isSafeInteger(candidate?.exactRootFileCount) || candidate.exactRootFileCount <= 0) {
    failures.push(`${label}:exact-candidate-a-provenance`);
  }
}

function validateBrowser(browser, aggregate, label, failures) {
  exactKeys(browser, ['channel', 'installed', 'userAgent', 'version', 'sessionNonce'], label, failures);
  const uaVersion = browser?.userAgent?.match(/Edg\/(\d+(?:\.\d+){3})/u)?.[1] ?? '';
  if (browser?.channel !== 'msedge' || browser?.installed !== true || browser?.version !== uaVersion
    || browser?.version !== aggregate?.productVersion || typeof browser?.sessionNonce !== 'string'
    || !/^[a-f0-9-]{16,}$/u.test(browser.sessionNonce)) failures.push(`${label}:installed-edge-runtime-identity`);
}

function validateRuntime(runtime, renderer, label, failures) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ], label, failures);
  const expectedPresentation = renderer === 'webgpu' ? 'healthy' : 'synchronous';
  if (runtime?.requestedBackend !== renderer || runtime?.actualBackend !== renderer || runtime?.initialized !== true
    || runtime?.softwareAdapter !== false || runtime?.deviceLost !== false || runtime?.uncapturedErrors !== 0
    || runtime?.presentationStatus !== expectedPresentation || typeof runtime?.adapterLabel !== 'string'
    || runtime.adapterLabel.trim() === '' || /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu.test(runtime.adapterLabel)
    || (renderer === 'webgl2' && (runtime.adapterClass !== 'WebGL2RenderingContext' || runtime.deviceClass !== null))
    || (renderer === 'webgpu' && (typeof runtime.adapterClass !== 'string' || runtime.adapterClass.trim() === ''
      || typeof runtime.deviceClass !== 'string' || runtime.deviceClass.trim() === ''))) {
    failures.push(`${label}:native-renderer-runtime`);
  }
}

const REVEAL_FIELDS = [
  'contract', 'trackedTargets', 'activeTargets', 'occludedTargets', 'visibleOriginalTargets',
  'activeModelLayers', 'activeThermalLayers', 'activeHaloLayers', 'activeSourceBodyLayers',
  'geometryIdentity', 'skeletonIdentity', 'bindMatrixIdentity', 'meshWorldMatrixIdentity',
  'boneWorldMatrixIdentity', 'silhouetteLayerIdentity', 'throughGeometry', 'monochromeThermal',
  'orangeHalo', 'treatmentsPerTarget', 'proxyMeshes', 'maxTargets', 'thermalMaterials',
  'exactModelMaterials', 'haloMaterials', 'ownedMaterials', 'maxOwnedMaterials',
  'materialBudgetExceeded', 'completeOperatorModels', 'incompleteTargets', 'maxBodyLayers',
];

function validateReveal(reveal, state, label, failures) {
  exactKeys(reveal, REVEAL_FIELDS, label, failures);
  const common = reveal?.contract === 'occlusion-conditioned-single-exact-animated-thermal-operator-v2'
    && Number.isSafeInteger(reveal.trackedTargets) && reveal.trackedTargets >= 0 && reveal.trackedTargets <= 16
    && reveal.activeHaloLayers === 0 && reveal.orangeHalo === false && reveal.proxyMeshes === 0
    && reveal.maxTargets === 16 && reveal.thermalMaterials === 1 && reveal.exactModelMaterials === 0
    && reveal.haloMaterials === 0 && reveal.ownedMaterials === 1 && reveal.maxOwnedMaterials === 1
    && reveal.materialBudgetExceeded === false && reveal.completeOperatorModels === true
    && reveal.incompleteTargets === 0 && reveal.maxBodyLayers === 12;
  if (!common) failures.push(`${label}:single-owned-treatment-budget`);
  if (state === 'active') {
    if (reveal?.activeTargets !== 1 || reveal?.occludedTargets !== 1 || reveal?.visibleOriginalTargets !== 0
      || !Number.isSafeInteger(reveal?.activeModelLayers) || reveal.activeModelLayers <= 0
      || reveal.activeModelLayers !== reveal.activeThermalLayers
      || reveal.activeModelLayers !== reveal.activeSourceBodyLayers || reveal.activeModelLayers > reveal.maxBodyLayers
      || reveal.geometryIdentity !== true || reveal.skeletonIdentity !== true || reveal.bindMatrixIdentity !== true
      || reveal.meshWorldMatrixIdentity !== true || reveal.boneWorldMatrixIdentity !== true
      || reveal.silhouetteLayerIdentity !== true || reveal.throughGeometry !== true
      || reveal.monochromeThermal !== true || reveal.treatmentsPerTarget !== 1) {
      failures.push(`${label}:one-exact-animated-occluded-rig`);
    }
  } else {
    const expectedVisibleOriginals = state === 'line-of-sight' ? 1 : 0;
    if (reveal?.activeTargets !== 0 || reveal?.occludedTargets !== 0
      || reveal?.visibleOriginalTargets !== expectedVisibleOriginals || reveal?.activeModelLayers !== 0
      || reveal?.activeThermalLayers !== 0 || reveal?.activeSourceBodyLayers !== 0
      || reveal?.throughGeometry !== false || reveal?.monochromeThermal !== false
      || reveal?.treatmentsPerTarget !== 0) failures.push(`${label}:thermal-cleanup`);
  }
}

function validateOperator(operator, targetKind, presentation, label, failures) {
  exactKeys(operator, [
    'source', 'assetUrl', 'appearance', 'license', 'lod', 'skinnedMeshes', 'runtimeClips',
    'runtimeActionsBound', 'activeClip', 'skeletons', 'visibleSkinnedMeshes',
    'effectivelyVisibleSkinnedMeshes', 'animationContract',
  ], label, failures);
  exactKeys(operator?.animationContract, [
    'base', 'stance', 'crouchBlend', 'proneBlend', 'pivotHeight', 'pivotPitch', 'speed', 'mixerBeforeSupportIk',
  ], `${label}:animation`, failures);
  const expectedVisibleSkinnedMeshes = presentation === 'thermal' ? 18 : 9;
  if (operator?.source !== 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative'
    || operator?.assetUrl !== './assets/original/models/operators/pass65-third-person-operator-lod0.glb'
    || operator?.appearance !== (targetKind === 'bot' ? 'neon-purple' : 'team')
    || operator?.license !== 'CC0-1.0'
    || operator?.lod !== 0 || operator?.skinnedMeshes !== 9 || operator?.runtimeClips !== 12
    || !Number.isSafeInteger(operator?.runtimeActionsBound) || operator.runtimeActionsBound <= 0
    || operator.runtimeActionsBound > operator.runtimeClips
    || (targetKind === 'bot' && operator.runtimeActionsBound !== operator.runtimeClips)
    || typeof operator?.activeClip !== 'string' || operator.activeClip.trim() === ''
    || operator?.skeletons !== 18 || operator?.visibleSkinnedMeshes !== expectedVisibleSkinnedMeshes
    || !Array.isArray(operator?.effectivelyVisibleSkinnedMeshes)
    || operator.effectivelyVisibleSkinnedMeshes.length !== expectedVisibleSkinnedMeshes
    || operator.effectivelyVisibleSkinnedMeshes.some((name) => typeof name !== 'string' || name.trim() === '')
    || operator?.animationContract?.base !== operator.activeClip
    || !['stand', 'crouch', 'prone'].includes(operator?.animationContract?.stance)
    || ![operator.animationContract.crouchBlend, operator.animationContract.proneBlend,
      operator.animationContract.pivotHeight, operator.animationContract.pivotPitch,
      operator.animationContract.speed].every(finite)
    || operator.animationContract.mixerBeforeSupportIk !== true) failures.push(`${label}:canonical-animated-operator`);
}

function pngBytes(png, label, failures) {
  exactKeys(png, [
    'encoding', 'sha256', 'encodedBytes', 'width', 'height', 'bitDepth', 'colorType',
    'opaque', 'base64', 'metrics',
  ], label, failures);
  exactKeys(png?.metrics, [
    'meanLuminance255', 'luminanceStdDev255', 'entropyBits', 'thermalOrangePixels', 'thermalOrangeRatio',
  ], `${label}:metrics`, failures);
  if (png?.encoding !== 'png-base64-lossless' || !SHA256.test(png?.sha256 ?? '')
    || !Number.isSafeInteger(png?.encodedBytes) || png.encodedBytes < 64 || png.encodedBytes > 1_500_000
    || png?.width !== PNG_WIDTH || png?.height !== PNG_HEIGHT || png?.bitDepth !== 8
    || ![2, 6].includes(png?.colorType) || png?.opaque !== true || typeof png?.base64 !== 'string') {
    failures.push(`${label}:lossless-embedded-png`);
    return null;
  }
  try {
    const bytes = Buffer.from(png.base64, 'base64');
    if (bytes.toString('base64') !== png.base64 || !sameJson(png, pass71Hf300PngEvidence(bytes))) {
      failures.push(`${label}:png-bytes-or-metrics`);
      return null;
    }
    if (png.metrics.luminanceStdDev255 < 4 || png.metrics.entropyBits < 0.8) {
      failures.push(`${label}:nontrivial-pixels`);
    }
    return bytes;
  } catch {
    failures.push(`${label}:png-bytes-or-metrics`);
    return null;
  }
}

function validateClip(clip, label, failures) {
  exactKeys(clip, ['x', 'y', 'width', 'height'], label, failures);
  if (![clip?.x, clip?.y].every(Number.isSafeInteger) || clip?.width !== PNG_WIDTH || clip?.height !== PNG_HEIGHT
    || clip.x < 0 || clip.y < 0 || clip.x + clip.width > 1280 || clip.y + clip.height > 720) {
    failures.push(`${label}:bounded-target-roi`);
  }
}

function validateCameraSnapshot(pose, label, failures) {
  exactKeys(pose, [
    'position', 'quaternion', 'yaw', 'pitch', 'fov', 'near', 'far',
  ], label, failures);
  if (!Array.isArray(pose?.position) || pose.position.length !== 3
    || !pose.position.every(finite)
    || !Array.isArray(pose?.quaternion) || pose.quaternion.length !== 4
    || !pose.quaternion.every(finite)
    || ![pose?.yaw, pose?.pitch, pose?.fov, pose?.near, pose?.far].every(finite)
    || pose.fov < 35 || pose.fov > 100 || pose.near <= 0 || pose.far <= pose.near) {
    failures.push(`${label}:production-camera-pose`);
  }
}

function validateSameCameraPose(cameraPose, label, failures) {
  exactKeys(cameraPose, ['contract', 'captureRevision', 'before', 'after'], label, failures);
  validateCameraSnapshot(cameraPose?.before, `${label}:before`, failures);
  validateCameraSnapshot(cameraPose?.after, `${label}:after`, failures);
  if (cameraPose?.contract !== 'hf300-same-capture-camera-pose-v2'
    || !Number.isSafeInteger(cameraPose?.captureRevision) || cameraPose.captureRevision <= 0
    || !sameJson(cameraPose?.before, cameraPose?.after)) {
    failures.push(`${label}:fixed-production-camera`);
  }
}

function validatePair(pair, activePng, cleanupPng, label, failures) {
  exactKeys(pair, [
    'changedPixelsAt12', 'changedPixelRatioAt12', 'meanAbsoluteRgbDelta255', 'thermalOrangePixelDelta',
  ], label, failures);
  const active = pngBytes(activePng, `${label}:active-png`, failures);
  const cleanup = pngBytes(cleanupPng, `${label}:cleanup-png`, failures);
  if (!active || !cleanup) return;
  const recomputed = pass71Hf300PngPairMetrics(active, cleanup);
  if (!sameJson(pair, recomputed)) failures.push(`${label}:pixel-metrics`);
  if (recomputed.changedPixelsAt12 < 128 || recomputed.changedPixelRatioAt12 < 0.00125
    || recomputed.meanAbsoluteRgbDelta255 < 0.08 || recomputed.thermalOrangePixelDelta < 24) {
    failures.push(`${label}:visible-thermal-raster-delta`);
  }
}

function validateOccluded(phase, targetKind, targetId, label, failures) {
  exactKeys(phase, [
    'targetId', 'sensorContactIds', 'sensorProxyMeshes', 'sensorPresentation', 'sourceOperator',
    'screenPosition', 'clip', 'reveal', 'png',
  ], label, failures);
  if (phase?.targetId !== targetId || !sameJson(phase?.sensorContactIds, [targetId])
    || phase?.sensorProxyMeshes !== 0
    || phase?.sensorPresentation !== 'shared-exact-animated-thermal-operator'
    || !Array.isArray(phase?.screenPosition) || phase.screenPosition.length !== 3
    || !phase.screenPosition.every(finite) || Math.abs(phase.screenPosition[0]) >= 0.25
    || Math.abs(phase.screenPosition[1]) >= 0.25 || phase.screenPosition[2] <= -1 || phase.screenPosition[2] >= 1) {
    failures.push(`${label}:host-admitted-centred-occluded-target`);
  }
  validateOperator(phase?.sourceOperator, targetKind, 'thermal', `${label}:operator`, failures);
  validateClip(phase?.clip, `${label}:clip`, failures);
  validateReveal(phase?.reveal, 'active', `${label}:reveal`, failures);
  const bytes = pngBytes(phase?.png, `${label}:png`, failures);
  if (bytes && phase.png.metrics.thermalOrangePixels < 24) failures.push(`${label}:thermal-raster-pixels`);
}

function validateLineOfSight(phase, targetKind, targetId, label, failures) {
  exactKeys(phase, [
    'targetId', 'sensorContactIds', 'normalSource', 'sourceOperator', 'clip', 'reveal', 'png',
  ], label, failures);
  exactKeys(phase?.normalSource, ['rootEffectivelyVisible', 'visibleMeshCount'], `${label}:normal-source`, failures);
  if (phase?.targetId !== targetId || !sameJson(phase?.sensorContactIds, [targetId])
    || phase?.normalSource?.rootEffectivelyVisible !== true
    || !Number.isSafeInteger(phase?.normalSource?.visibleMeshCount) || phase.normalSource.visibleMeshCount <= 0) {
    failures.push(`${label}:ordinary-visible-source`);
  }
  validateOperator(phase?.sourceOperator, targetKind, 'ordinary', `${label}:operator`, failures);
  validateClip(phase?.clip, `${label}:clip`, failures);
  validateReveal(phase?.reveal, 'line-of-sight', `${label}:reveal`, failures);
  pngBytes(phase?.png, `${label}:png`, failures);
}

function validateExit(phase, label, failures) {
  exactKeys(phase, [
    'possessionBefore', 'possessionAfter', 'cameraPose', 'clip', 'beforeReveal', 'afterReveal',
    'beforePng', 'afterPng', 'pixelDelta',
  ], label, failures);
  if (phase?.possessionBefore !== 'piloted-drone' || phase?.possessionAfter !== null) {
    failures.push(`${label}:production-exit-transition`);
  }
  validateSameCameraPose(phase?.cameraPose, `${label}:camera`, failures);
  validateClip(phase?.clip, `${label}:clip`, failures);
  validateReveal(phase?.beforeReveal, 'active', `${label}:before`, failures);
  validateReveal(phase?.afterReveal, 'cleanup', `${label}:after`, failures);
  validatePair(phase?.pixelDelta, phase?.beforePng, phase?.afterPng, `${label}:same-camera-control`, failures);
}

function validateMatchEnd(phase, label, failures) {
  exactKeys(phase, ['priorEpoch', 'phase', 'possession', 'reveal'], label, failures);
  if (!Number.isSafeInteger(phase?.priorEpoch) || phase.priorEpoch <= 0
    || phase?.phase !== 'ended' || phase?.possession !== null) failures.push(`${label}:production-match-end`);
  validateReveal(phase?.reveal, 'cleanup', `${label}:reveal`, failures);
}

function validateRematch(phase, priorEpoch, label, failures) {
  exactKeys(phase, ['priorEpoch', 'nextEpoch', 'phase', 'possession', 'reveal'], label, failures);
  if (phase?.priorEpoch !== priorEpoch || !Number.isSafeInteger(phase?.nextEpoch)
    || phase.nextEpoch <= priorEpoch || phase?.phase !== 'active' || phase?.possession !== null) {
    failures.push(`${label}:fresh-rematch-authority`);
  }
  validateReveal(phase?.reveal, 'cleanup', `${label}:reveal`, failures);
}

function validateDeath(phase, targetKind, targetId, label, failures) {
  exactKeys(phase, [
    'targetId', 'targetRootIdentity', 'sourceOperator', 'targetAliveBefore', 'targetAliveAfter',
    'deathReceipt', 'cameraPose', 'clip',
    'beforeReveal', 'afterReveal', 'beforePng', 'afterPng', 'pixelDelta',
  ], label, failures);
  exactKeys(phase?.deathReceipt, targetKind === 'bot' ? ['kind', 'targetId'] : ['kind', 'targetId', 'nextLifeId'], `${label}:receipt`, failures);
  if (phase?.targetId !== targetId || phase?.targetAliveBefore !== true || phase?.targetAliveAfter !== false
    || phase?.deathReceipt?.kind !== targetKind || phase?.deathReceipt?.targetId !== targetId
    || (targetKind === 'remote-human' && (!Number.isSafeInteger(phase?.deathReceipt?.nextLifeId)
      || phase.deathReceipt.nextLifeId <= 1))) failures.push(`${label}:canonical-target-death`);
  validateOperator(phase?.sourceOperator, targetKind, 'thermal', `${label}:operator`, failures);
  const expectedRemoteRootIdentity = phase?.sourceOperator
    ? `remote-human:${targetId}:${phase.sourceOperator.source}:${phase.sourceOperator.assetUrl}:${phase.sourceOperator.lod}`
    : '';
  if (targetKind === 'bot'
    ? !UUID.test(phase?.targetRootIdentity ?? '')
    : phase?.targetRootIdentity !== expectedRemoteRootIdentity) {
    failures.push(`${label}:canonical-target-root-identity`);
  }
  validateSameCameraPose(phase?.cameraPose, `${label}:camera`, failures);
  validateClip(phase?.clip, `${label}:clip`, failures);
  validateReveal(phase?.beforeReveal, 'active', `${label}:before`, failures);
  validateReveal(phase?.afterReveal, 'cleanup', `${label}:after`, failures);
  validatePair(phase?.pixelDelta, phase?.beforePng, phase?.afterPng, `${label}:same-camera-control`, failures);
}

function validateScope(scope, expectedScope, aggregate, expectedSourceSha, label, failures) {
  exactKeys(scope, [
    'targetKind', 'mode', 'renderer', 'arenaId', 'renderProfile', 'startedAt', 'completedAt',
    'servedCandidate', 'browser', 'runtime', 'staging', 'occluded', 'lineOfSight', 'exit',
    'matchEnd', 'rematch', 'death', 'faults',
  ], label, failures);
  if (scope?.targetKind !== expectedScope.targetKind || scope?.mode !== expectedScope.mode
    || scope?.renderer !== expectedScope.renderer || scope?.arenaId !== 'atomic-acres'
    || scope?.renderProfile !== 'blender' || !isoTimestamp(scope?.startedAt)
    || !isoTimestamp(scope?.completedAt) || Date.parse(scope.startedAt) > Date.parse(scope.completedAt)) {
    failures.push(`${label}:scope-identity`);
  }
  validateServedCandidate(scope?.servedCandidate, expectedSourceSha, `${label}:served`, failures);
  validateBrowser(scope?.browser, aggregate, `${label}:browser`, failures);
  validateRuntime(scope?.runtime, expectedScope.renderer, `${label}:runtime`, failures);
  exactKeys(scope?.staging, [
    'source', 'targetId', 'targetRootIdentity', 'wallWitnessTargetId', 'rangeM',
    'sensorMaximumRangeM', 'hostedMemberCount',
  ], `${label}:staging`, failures);
  const targetId = scope?.staging?.targetId;
  if (scope?.staging?.source !== 'real-active-world-collider-stage'
    || typeof targetId !== 'string' || targetId.trim() === ''
    || typeof scope?.staging?.targetRootIdentity !== 'string' || scope.staging.targetRootIdentity.trim() === ''
    || typeof scope?.staging?.wallWitnessTargetId !== 'string' || scope.staging.wallWitnessTargetId.trim() === ''
    || !finite(scope?.staging?.rangeM) || !finite(scope?.staging?.sensorMaximumRangeM)
    || scope.staging.rangeM < 1 || scope.staging.rangeM >= scope.staging.sensorMaximumRangeM
    || scope.staging.hostedMemberCount !== (expectedScope.mode === 'hosted' ? 2 : 0)) {
    failures.push(`${label}:real-collider-host-authority-stage`);
  }
  validateOccluded(scope?.occluded, expectedScope.targetKind, targetId, `${label}:occluded`, failures);
  validateLineOfSight(scope?.lineOfSight, expectedScope.targetKind, targetId, `${label}:line-of-sight`, failures);
  const expectedRemoteRootIdentity = scope?.occluded?.sourceOperator
    ? `remote-human:${targetId}:${scope.occluded.sourceOperator.source}:${scope.occluded.sourceOperator.assetUrl}:${scope.occluded.sourceOperator.lod}`
    : '';
  if (expectedScope.targetKind === 'bot'
    ? !UUID.test(scope?.staging?.targetRootIdentity ?? '') || scope?.staging?.wallWitnessTargetId !== targetId
    : scope?.staging?.targetRootIdentity !== expectedRemoteRootIdentity
      || scope?.staging?.wallWitnessTargetId === targetId) {
    failures.push(`${label}:canonical-target-root-identity`);
  }
  if (scope?.death?.targetRootIdentity !== scope?.staging?.targetRootIdentity
    || (scope?.occluded?.sourceOperator && scope?.death?.sourceOperator
      && !sameJson(scope.occluded.sourceOperator, scope.death.sourceOperator))) {
    failures.push(`${label}:canonical-target-death-identity-drift`);
  }
  if (scope?.occluded?.sourceOperator && scope?.lineOfSight?.sourceOperator) {
    for (const field of ['source', 'assetUrl', 'lod', 'skinnedMeshes', 'runtimeClips', 'runtimeActionsBound', 'skeletons']) {
      if (!sameJson(scope.occluded.sourceOperator[field], scope.lineOfSight.sourceOperator[field])) {
        failures.push(`${label}:operator-identity-drift`);
        break;
      }
    }
  }
  validateExit(scope?.exit, `${label}:exit`, failures);
  validateMatchEnd(scope?.matchEnd, `${label}:match-end`, failures);
  validateRematch(scope?.rematch, scope?.matchEnd?.priorEpoch, `${label}:rematch`, failures);
  validateDeath(scope?.death, expectedScope.targetKind, targetId, `${label}:death`, failures);
  if (!Array.isArray(scope?.faults) || scope.faults.length !== 0) failures.push(`${label}:runtime-faults`);
}

export function pass71Hf300EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF300_DRONE_THERMAL_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF300_DRONE_THERMAL_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF300_DRONE_THERMAL_EVIDENCE.kind
    || record.contract !== PASS71_HF300_DRONE_THERMAL_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF300_DRONE_THERMAL_EVIDENCE.feedbackId
    || record.status !== 'passed' || record.coverageDisposition !== 'full-exact-native-matrix'
    || record.closesFeedback !== true) return ['hf300-identity-status-or-closure'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closesFeedback', 'startedAt', 'completedAt', 'source',
    'servedCandidate', 'environment', 'browser', 'tooling', 'coverage', 'scopes',
    'faults', 'receiptSha256',
  ], 'record', failures);
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected?.sourceSha, 'served-candidate', failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  exactKeys(record.browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'productVersion', 'installRoot',
    'authenticodeStatus', 'authenticodeSigner', 'processIsolation', 'processCount',
  ], 'browser', failures);
  if (record.browser?.channel !== 'msedge' || record.browser?.installed !== true
    || record.browser?.executableName !== 'msedge.exe' || !SHA256.test(record.browser?.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(record.browser?.productVersion ?? '')
    || !/[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(record.browser?.installRoot ?? '')
    || record.browser?.authenticodeStatus !== 'Valid'
    || !/\bMicrosoft Corporation\b/iu.test(record.browser?.authenticodeSigner ?? '')
    || record.browser?.processIsolation !== PASS71_HF300_DRONE_THERMAL_COVERAGE.processIsolation
    || record.browser?.processCount !== PASS71_HF300_DRONE_THERMAL_SCOPES.length) failures.push('installed-edge-process-identity');
  const toolingFields = Object.keys(PASS71_HF300_DRONE_THERMAL_TOOL_PATHS).map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected?.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingFields)
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) failures.push('candidate-a-tooling-hashes');
  if (!sameJson(record.coverage, PASS71_HF300_DRONE_THERMAL_COVERAGE)) failures.push('literal-full-coverage-contract');
  if (!Array.isArray(record.scopes) || record.scopes.length !== PASS71_HF300_DRONE_THERMAL_SCOPES.length
    || !sameJson(record.scopes.map(({ targetKind, mode, renderer }) => ({ targetKind, mode, renderer })), PASS71_HF300_DRONE_THERMAL_SCOPES)) {
    failures.push('exact-four-scope-matrix');
  } else {
    for (const [index, expectedScope] of PASS71_HF300_DRONE_THERMAL_SCOPES.entries()) {
      validateScope(record.scopes[index], expectedScope, record.browser, expected?.sourceSha,
        `scope:${expectedScope.targetKind}:${expectedScope.renderer}`, failures);
    }
    const nonces = record.scopes.map((scope) => scope.browser?.sessionNonce);
    if (new Set(nonces).size !== nonces.length) failures.push('fresh-process-profile-session-boundaries');
    if (record.scopes.some((scope) => !sameJson(scope.servedCandidate, record.servedCandidate))) {
      failures.push('served-candidate-drift-across-scopes');
    }
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)
    || record.scopes?.some((scope) => !isoTimestamp(scope.completedAt)
      || Date.parse(scope.completedAt) > Date.parse(record.completedAt))) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf300RecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf300Evidence(record, expected) {
  const failures = pass71Hf300EvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-300 evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf300EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR,
    closesFeedback: true,
    validate(record, context) {
      try {
        const tooling = context?.options?.pass71Hf300Tooling
          ?? pass71Hf300ToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
        return pass71Hf300EvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf300SourceTreeSha
            ?? pass71Hf300SourceTreeAtSource(context?.repositoryRoot, context?.sourceSha),
          tooling,
        });
      } catch (error) {
        return [`hf300-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY = createPass71Hf300EvidenceRegistryEntry();

function fixturePng(kind, ordinal) {
  const rows = Buffer.alloc(PNG_HEIGHT * (1 + PNG_WIDTH * 3));
  for (let y = 0; y < PNG_HEIGHT; y += 1) {
    const row = y * (1 + PNG_WIDTH * 3);
    rows[row] = 0;
    for (let x = 0; x < PNG_WIDTH; x += 1) {
      const at = row + 1 + x * 3;
      const checker = ((x >> 4) + (y >> 4) + ordinal) & 1;
      let red = 55 + checker * 22 + (x % 13);
      let green = 68 + checker * 18 + (y % 11);
      let blue = 74 + checker * 16 + ((x + y) % 9);
      const torso = x >= 137 && x <= 183 && y >= 92 && y <= 225;
      const head = (x - 160) ** 2 + (y - 68) ** 2 <= 24 ** 2;
      const limbs = (x >= 116 && x <= 204 && y >= 118 && y <= 145)
        || (x >= 126 && x <= 150 && y >= 216 && y <= 292)
        || (x >= 170 && x <= 194 && y >= 216 && y <= 292);
      if (kind === 'thermal' && (torso || head || limbs)) [red, green, blue] = [255, 122, 26];
      if (kind === 'ordinary' && (torso || head || limbs)) [red, green, blue] = [117, 142, 158];
      rows[at] = red;
      rows[at + 1] = green;
      rows[at + 2] = blue;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(PNG_WIDTH, 0);
  ihdr.writeUInt32BE(PNG_HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fixtureReveal(state) {
  const active = state === 'active';
  const visible = state === 'line-of-sight';
  return {
    contract: 'occlusion-conditioned-single-exact-animated-thermal-operator-v2',
    trackedTargets: state === 'rematch' ? 0 : 1,
    activeTargets: active ? 1 : 0,
    occludedTargets: active ? 1 : 0,
    visibleOriginalTargets: visible ? 1 : 0,
    activeModelLayers: active ? 9 : 0,
    activeThermalLayers: active ? 9 : 0,
    activeHaloLayers: 0,
    activeSourceBodyLayers: active ? 9 : 0,
    geometryIdentity: true,
    skeletonIdentity: true,
    bindMatrixIdentity: true,
    meshWorldMatrixIdentity: true,
    boneWorldMatrixIdentity: true,
    silhouetteLayerIdentity: true,
    throughGeometry: active,
    monochromeThermal: active,
    orangeHalo: false,
    treatmentsPerTarget: active ? 1 : 0,
    proxyMeshes: 0,
    maxTargets: 16,
    thermalMaterials: 1,
    exactModelMaterials: 0,
    haloMaterials: 0,
    ownedMaterials: 1,
    maxOwnedMaterials: 1,
    materialBudgetExceeded: false,
    completeOperatorModels: true,
    incompleteTargets: 0,
    maxBodyLayers: 12,
  };
}

function fixtureOperator(targetKind, presentation) {
  const thermal = presentation === 'thermal';
  return {
    source: 'Atomic Acres Pass 65 operator / Quaternius CC0 derivative',
    assetUrl: './assets/original/models/operators/pass65-third-person-operator-lod0.glb',
    appearance: targetKind === 'bot' ? 'neon-purple' : 'team',
    license: 'CC0-1.0',
    lod: 0,
    skinnedMeshes: 9,
    runtimeClips: 12,
    runtimeActionsBound: targetKind === 'bot' ? 12 : 1,
    activeClip: 'Idle_Gun_Pointing',
    skeletons: 18,
    visibleSkinnedMeshes: thermal ? 18 : 9,
    effectivelyVisibleSkinnedMeshes: Array.from(
      { length: thermal ? 18 : 9 },
      (_, index) => index < 9 ? `Operator_Skinned_${index}` : 'through-wall-single-thermal-operator-model',
    ),
    animationContract: {
      base: 'Idle_Gun_Pointing', stance: 'stand', crouchBlend: 0, proneBlend: 0,
      pivotHeight: 0, pivotPitch: 0, speed: 0, mixerBeforeSupportIk: true,
    },
  };
}

function fixtureCandidate(sourceSha) {
  return {
    schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
    path: 'channels/the-big-one', treeSha256: 'b'.repeat(64), exactRootFileCount: 500,
  };
}

function fixtureRuntime(renderer) {
  return {
    requestedBackend: renderer, actualBackend: renderer, initialized: true,
    adapterClass: renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
    deviceClass: renderer === 'webgpu' ? 'GPUDevice' : null,
    adapterLabel: 'ANGLE NVIDIA GeForce RTX 5080', softwareAdapter: false,
    deviceLost: false, uncapturedErrors: 0,
    presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
  };
}

function fixtureScope(scope, sourceSha, ordinal) {
  const targetId = scope.targetKind === 'bot' ? 'bot:0' : 'remote-player-1';
  const candidate = fixtureCandidate(sourceSha);
  const operator = fixtureOperator(scope.targetKind, 'thermal');
  const thermal = pass71Hf300PngEvidence(fixturePng('thermal', ordinal));
  const cleanup = pass71Hf300PngEvidence(fixturePng('cleanup', ordinal));
  const ordinary = pass71Hf300PngEvidence(fixturePng('ordinary', ordinal));
  const delta = pass71Hf300PngPairMetrics(
    Buffer.from(thermal.base64, 'base64'), Buffer.from(cleanup.base64, 'base64'),
  );
  const clip = { x: 480, y: 200, width: PNG_WIDTH, height: PNG_HEIGHT };
  const pose = {
    position: [1, 18, 2], quaternion: [0, 0, 0, 1],
    yaw: 0, pitch: -0.25, fov: 70, near: 0.05, far: 180,
  };
  const cameraPose = {
    contract: 'hf300-same-capture-camera-pose-v2', captureRevision: ordinal + 1,
    before: structuredClone(pose), after: structuredClone(pose),
  };
  const priorEpoch = 7 + ordinal;
  return {
    ...scope,
    arenaId: 'atomic-acres', renderProfile: 'blender',
    startedAt: `2026-08-13T20:0${ordinal}:00.000Z`,
    completedAt: `2026-08-13T20:0${ordinal}:30.000Z`,
    servedCandidate: candidate,
    browser: {
      channel: 'msedge', installed: true, userAgent: 'Mozilla/5.0 Edg/151.0.4129.72',
      version: '151.0.4129.72', sessionNonce: `00000000-0000-4000-8000-00000000000${ordinal}`,
    },
    runtime: fixtureRuntime(scope.renderer),
    staging: {
      source: 'real-active-world-collider-stage', targetId,
      targetRootIdentity: scope.targetKind === 'bot'
        ? `00000000-0000-4000-8000-0000000000${String(ordinal).padStart(2, '0')}`
        : `remote-human:${targetId}:${operator.source}:${operator.assetUrl}:${operator.lod}`,
      wallWitnessTargetId: scope.targetKind === 'bot' ? targetId : 'hosted-bot:wall-witness',
      rangeM: 18, sensorMaximumRangeM: 42, hostedMemberCount: scope.mode === 'hosted' ? 2 : 0,
    },
    occluded: {
      targetId, sensorContactIds: [targetId], sensorProxyMeshes: 0,
      sensorPresentation: 'shared-exact-animated-thermal-operator',
      sourceOperator: fixtureOperator(scope.targetKind, 'thermal'),
      screenPosition: [0, 0, 0.5], clip, reveal: fixtureReveal('active'), png: thermal,
    },
    lineOfSight: {
      targetId, sensorContactIds: [targetId], normalSource: { rootEffectivelyVisible: true, visibleMeshCount: 1 },
      sourceOperator: fixtureOperator(scope.targetKind, 'ordinary'),
      clip, reveal: fixtureReveal('line-of-sight'), png: ordinary,
    },
    exit: {
      possessionBefore: 'piloted-drone', possessionAfter: null, cameraPose, clip,
      beforeReveal: fixtureReveal('active'), afterReveal: fixtureReveal('cleanup'),
      beforePng: thermal, afterPng: cleanup, pixelDelta: delta,
    },
    matchEnd: { priorEpoch, phase: 'ended', possession: null, reveal: fixtureReveal('cleanup') },
    rematch: { priorEpoch, nextEpoch: priorEpoch + 1, phase: 'active', possession: null, reveal: fixtureReveal('rematch') },
    death: {
      targetId,
      targetRootIdentity: scope.targetKind === 'bot'
        ? `00000000-0000-4000-8000-0000000000${String(ordinal).padStart(2, '0')}`
        : `remote-human:${targetId}:${operator.source}:${operator.assetUrl}:${operator.lod}`,
      sourceOperator: fixtureOperator(scope.targetKind, 'thermal'),
      targetAliveBefore: true, targetAliveAfter: false,
      deathReceipt: scope.targetKind === 'bot'
        ? { kind: 'bot', targetId }
        : { kind: 'remote-human', targetId, nextLifeId: 2 },
      cameraPose, clip, beforeReveal: fixtureReveal('active'), afterReveal: fixtureReveal('cleanup'),
      beforePng: thermal, afterPng: cleanup, pixelDelta: delta,
    },
    faults: [],
  };
}

export function createPass71Hf300EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'c'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(Object.keys(PASS71_HF300_DRONE_THERMAL_TOOL_PATHS).map(
    (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
  ));
  const scopes = PASS71_HF300_DRONE_THERMAL_SCOPES.map((scope, index) => fixtureScope(scope, sourceSha, index));
  const record = {
    ...PASS71_HF300_DRONE_THERMAL_EVIDENCE,
    startedAt: '2026-08-13T20:00:00.000Z',
    completedAt: '2026-08-13T20:10:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      sourceTreeSha, releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true,
    },
    servedCandidate: fixtureCandidate(sourceSha),
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'd'.repeat(64),
      productVersion: '151.0.4129.72', installRoot: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
      authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Microsoft Corporation',
      processIsolation: PASS71_HF300_DRONE_THERMAL_COVERAGE.processIsolation,
      processCount: PASS71_HF300_DRONE_THERMAL_SCOPES.length,
    },
    tooling,
    coverage: JSON.parse(JSON.stringify(PASS71_HF300_DRONE_THERMAL_COVERAGE)),
    scopes,
    faults: [],
  };
  record.receiptSha256 = pass71Hf300RecordSha256(record);
  return record;
}
