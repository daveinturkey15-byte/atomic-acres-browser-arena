import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

export const PASS71_QUALITY_VISUAL_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-303',
  feedbackId: 'HF-303',
  kind: 'pass71-hf303-atomic-quality-visual-parity',
  contract: 'atomic-acres/pass71-hf303-atomic-quality-visual-parity@1',
  gate: 'pass71-exact-camera-pass70-quality-visual-parity-v1',
  baseline: Object.freeze({
    releasePass: 'PASS 70',
    provenanceSchemaVersion: 4,
    channel: 'the-big-one',
    sourceSha: '130fd59bd2cf1e1719b802463219ddf36e2484d5',
    pagesSha: 'ecd683116163b4940566f82f7edb87ed9c964cb6',
    pagesPath: 'channels/the-big-one',
    runtimeFileCount: 515,
    completeFileCount: 516,
    runtimeTreeSha256: '1a0e90676ffc411eaefeaebef0c970481aad416084a1dc21e9bf7de6de369196',
    provenanceSha256: '021bfa5dacae617e9356c45239a1dc6bc963e42503d9a318d687e9fca78d0b6c',
  }),
  backends: Object.freeze(['webgl2', 'webgpu']),
  subjects: Object.freeze(['pass70', 'candidate']),
  namedQuality: Object.freeze({
    label: 'QUALITY',
    preset: 'high',
    storageKey: 'atomic-acres-pass65-settings-v1',
    storageVersion: 1,
    queryRenderProfileOverride: null,
    resolvedRenderProfile: 'blender',
  }),
  camera: Object.freeze({
    id: 'hf303-nuke-town-overview-exact',
    reviewCameraId: 'nuke-town-overview',
    authority: 'native-runtime-presented-camera',
    setter: 'setArenaReviewCamera+setCaptureCameraPose',
    position: Object.freeze([42, 28, 48]),
    target: Object.freeze([0, 2, 0]),
    fov: 70,
    near: 0.08,
    far: 190,
    fixedTimeMs: 63_000,
    seed: 6_401,
    hud: 'hidden',
  }),
  viewport: Object.freeze({ width: 640, height: 360, deviceScaleFactor: 1 }),
  thresholds: Object.freeze({
    maximumMeanAbsoluteChannelDelta255: 2.5,
    maximumRootMeanSquareChannelDelta255: 9,
    maximumP95AbsoluteChannelDelta255: 8,
    maximumChangedPixelRatioAt8: 0.025,
    minimumGlobalSsim: 0.995,
    minimumCandidateToBaselineLuminanceStdDevRatio: 0.97,
    minimumCandidateToBaselineEdgeEnergyRatio: 0.97,
    minimumCandidateToBaselineEntropyDeltaBits: -0.1,
  }),
});

export const PASS71_QUALITY_VISUAL_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_QUALITY_VISUAL_EVIDENCE.evidenceId,
  kind: PASS71_QUALITY_VISUAL_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_QUALITY_VISUAL_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-quality-visual-parity.mjs',
  verifier: 'scripts/qa/verify-pass71-quality-visual-evidence.mjs',
  contract: 'scripts/qa/pass71-quality-visual-parity-contract.mjs',
  contractTypes: 'scripts/qa/pass71-quality-visual-parity-contract.d.mts',
  contractTest: 'scripts/qa/pass71-quality-visual-parity-contract.test.mjs',
  structuralComparator: 'scripts/qa/verify-pass71-atomic-quality-baseline.mjs',
  structuralComparatorTest: 'scripts/qa/pass71-atomic-quality-baseline.test.mjs',
  baselineRecord: 'baselines/pass70/atomic-acres-quality.json',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  acceptanceGate: 'scripts/release/acceptance-gate.mjs',
  releaseChannels: 'release-channels.json',
  edgeIdentity: 'scripts/qa/pass71-edge-executable-identity.mjs',
  renderRuntime: 'src/rendering/render-runtime.ts',
  arenaDefinition: 'src/rendering/arenas/atomic-acres.ts',
  graphicsSettings: 'src/graphics-settings-registry.ts',
  settingsRuntime: 'src/pass65-settings.ts',
  runtimeEntry: 'src/legacy-main.ts',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
});

const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SOFTWARE = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const GPU_FAMILIES = Object.freeze(['nvidia', 'amd', 'radeon', 'intel']);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CACHE = new Map();
const PAIR_CACHE = new Map();
const FIXTURE_PNG_CACHE = new Map();
const CAPTURE_SIGNATURE_FIELDS = Object.freeze([
  'quality', 'assets', 'lod', 'materials', 'lighting', 'shadows', 'authority',
]);

export const PASS71_QUALITY_GRAPHICS = Object.freeze({
  schemaVersion: 1,
  preset: 'high',
  renderScale: 1,
  adaptiveResolution: true,
  targetFps: 240,
  frameRateLimit: 0,
  antiAliasing: 'msaa-4x',
  geometryDetail: 'full',
  shadows: 'high',
  shadowResolution: 'high',
  shadowUpdateMode: 'static',
  indirectLighting: 'high',
  ambientOcclusion: 'off',
  reflectionQuality: 'high',
  volumetricQuality: 'high',
  smokeQuality: 'high',
  particleQuality: 'high',
  anisotropy: 8,
  decalQuality: 'high',
  bloomQuality: 'cinematic',
  exposure: 1,
  toneMapping: 'aces',
  filmGrain: 0.32,
  vignette: 0.16,
});

export const PASS71_QUALITY_RUNTIME = Object.freeze({
  requestedPreset: 'high',
  effectivePreset: 'high',
  renderProfile: 'blender',
  renderScale: 1,
  adaptive: true,
  targetFps: 240,
  frameRateLimit: 0,
  antialiasSamples: 4,
  shadows: true,
  shadowMapSize: 2048,
  shadowUpdateMode: 'static',
  indirectLightScale: 1,
  ambientOcclusion: Object.freeze({ quality: 'off', enabled: false, resolutionScale: 0, samples: 0, radius: 0, strength: 0 }),
  reflectionScale: 1,
  volumetricScale: 0.8,
  maximumAnisotropy: 8,
  particleScale: 0.8,
  decalScale: 0.8,
  smokeScale: 0.8,
  post: Object.freeze({ bloomStrength: 0.14, exposureScale: 1, toneMapping: 'aces', filmGrainScale: 0.32, vignetteStrength: 0.16 }),
  reason: null,
});

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function rounded(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...keys].sort())) {
    failures.push(label + ':schema-fields');
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function sameGpuFamily(left, right) {
  const leftValue = String(left || '').toLowerCase();
  const rightValue = String(right || '').toLowerCase();
  return GPU_FAMILIES.some((family) => leftValue.includes(family) && rightValue.includes(family));
}

export function pass71QualityVisualCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 Quality visual evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(canonicalJson(unsigned) + '\n', 'utf8');
}

export function pass71QualityVisualRecordSha256(record) {
  return sha256(pass71QualityVisualCanonicalBytes(record));
}

export function pass71QualityVisualToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_QUALITY_VISUAL_TOOL_PATHS).map(
    ([name, path]) => [name + 'Sha256', sha256(readFileSync(resolve(repositoryRoot, path)))],
  )));
}

export function pass71QualityVisualToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha || '')) throw new Error('Pass 71 Quality visual tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_QUALITY_VISUAL_TOOL_PATHS).map(
    ([name, path]) => [name + 'Sha256', sha256(execFileSync(
      'git', ['-C', repositoryRoot, 'show', sourceSha + ':' + path],
      { windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    ))],
  )));
}

export function pass71QualityVisualCaptureSignatures(capture) {
  const source = object(capture) || {};
  return Object.freeze(Object.fromEntries(CAPTURE_SIGNATURE_FIELDS.map((field) => [
    field + 'Sha256', sha256(Buffer.from(canonicalJson(Object.hasOwn(source, field) ? source[field] : null), 'utf8')),
  ])));
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
  if (!Buffer.isBuffer(bytes) || bytes.length < 64 || bytes.length > 2_000_000
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('not a bounded PNG');
  }
  let offset = 8;
  let width = null;
  let height = null;
  let bitDepth = null;
  let colorType = null;
  let interlace = null;
  const compressed = [];
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error('truncated PNG chunk');
    const data = bytes.subarray(dataStart, dataEnd);
    const encodedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([bytes.subarray(offset + 4, offset + 8), data]));
    if (encodedCrc !== actualCrc) throw new Error(`PNG ${type} checksum mismatch`);
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
  if (!sawEnd || offset !== bytes.length || width !== 640 || height !== 360
    || bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0 || compressed.length === 0) {
    throw new Error('PNG does not match the exact compact lossless frame contract');
  }
  const channels = colorType === 6 ? 4 : 3;
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

function imageMetrics(decoded) {
  const luminance = new Float64Array(decoded.width * decoded.height);
  const histogram = new Uint32Array(256);
  let sum = 0;
  let sumSquares = 0;
  let index = 0;
  for (let pixel = 0; pixel < decoded.rgb.length; pixel += 3) {
    const value = 0.2126 * decoded.rgb[pixel] + 0.7152 * decoded.rgb[pixel + 1] + 0.0722 * decoded.rgb[pixel + 2];
    luminance[index] = value;
    histogram[Math.max(0, Math.min(255, Math.round(value)))] += 1;
    sum += value;
    sumSquares += value * value;
    index += 1;
  }
  const mean = sum / luminance.length;
  const variance = Math.max(0, sumSquares / luminance.length - mean * mean);
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const at = y * decoded.width + x;
      if (x + 1 < decoded.width) {
        edgeSum += Math.abs(luminance[at] - luminance[at + 1]);
        edgeCount += 1;
      }
      if (y + 1 < decoded.height) {
        edgeSum += Math.abs(luminance[at] - luminance[at + decoded.width]);
        edgeCount += 1;
      }
    }
  }
  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const probability = count / luminance.length;
    entropy -= probability * Math.log2(probability);
  }
  return Object.freeze({
    meanLuminance255: rounded(mean),
    luminanceStdDev255: rounded(Math.sqrt(variance)),
    meanEdgeDelta255: rounded(edgeSum / edgeCount),
    entropyBits: rounded(entropy),
  });
}

export function pass71QualityVisualPngEvidence(bytes) {
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

export function pass71QualityVisualPairMetrics(baselineBytes, candidateBytes) {
  const baseline = decodePng(baselineBytes);
  const candidate = decodePng(candidateBytes);
  const cacheKey = baseline.digest + ':' + candidate.digest;
  const cached = PAIR_CACHE.get(cacheKey);
  if (cached) return cached;
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) throw new Error('paired PNG dimensions differ');
  const deltas = new Uint8Array(baseline.rgb.length);
  let absolute = 0;
  let squares = 0;
  let changedPixels = 0;
  let baselineLumaSum = 0;
  let candidateLumaSum = 0;
  let baselineLumaSquares = 0;
  let candidateLumaSquares = 0;
  let covarianceSum = 0;
  const pixelCount = baseline.width * baseline.height;
  const baselineLuma = new Float64Array(pixelCount);
  const candidateLuma = new Float64Array(pixelCount);
  for (let offset = 0, pixel = 0; offset < baseline.rgb.length; offset += 3, pixel += 1) {
    let maximumPixelDelta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(baseline.rgb[offset + channel] - candidate.rgb[offset + channel]);
      deltas[offset + channel] = delta;
      absolute += delta;
      squares += delta * delta;
      maximumPixelDelta = Math.max(maximumPixelDelta, delta);
    }
    if (maximumPixelDelta > 8) changedPixels += 1;
    const left = 0.2126 * baseline.rgb[offset] + 0.7152 * baseline.rgb[offset + 1] + 0.0722 * baseline.rgb[offset + 2];
    const right = 0.2126 * candidate.rgb[offset] + 0.7152 * candidate.rgb[offset + 1] + 0.0722 * candidate.rgb[offset + 2];
    baselineLuma[pixel] = left;
    candidateLuma[pixel] = right;
    baselineLumaSum += left;
    candidateLumaSum += right;
    baselineLumaSquares += left * left;
    candidateLumaSquares += right * right;
    covarianceSum += left * right;
  }
  const sortedDeltas = [...deltas].sort((left, right) => left - right);
  const percentileIndex = Math.min(sortedDeltas.length - 1, Math.ceil(sortedDeltas.length * 0.95) - 1);
  const baselineMean = baselineLumaSum / pixelCount;
  const candidateMean = candidateLumaSum / pixelCount;
  const baselineVariance = Math.max(0, baselineLumaSquares / pixelCount - baselineMean * baselineMean);
  const candidateVariance = Math.max(0, candidateLumaSquares / pixelCount - candidateMean * candidateMean);
  const covariance = covarianceSum / pixelCount - baselineMean * candidateMean;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const ssim = ((2 * baselineMean * candidateMean + c1) * (2 * covariance + c2))
    / ((baselineMean ** 2 + candidateMean ** 2 + c1) * (baselineVariance + candidateVariance + c2));
  const baselineStats = imageMetrics(baseline);
  const candidateStats = imageMetrics(candidate);
  const result = Object.freeze({
    meanAbsoluteChannelDelta255: rounded(absolute / deltas.length),
    rootMeanSquareChannelDelta255: rounded(Math.sqrt(squares / deltas.length)),
    p95AbsoluteChannelDelta255: sortedDeltas[percentileIndex],
    changedPixelRatioAt8: rounded(changedPixels / pixelCount),
    globalSsim: rounded(ssim),
    candidateToBaselineLuminanceStdDevRatio: rounded(candidateStats.luminanceStdDev255 / Math.max(0.000001, baselineStats.luminanceStdDev255)),
    candidateToBaselineEdgeEnergyRatio: rounded(candidateStats.meanEdgeDelta255 / Math.max(0.000001, baselineStats.meanEdgeDelta255)),
    candidateToBaselineEntropyDeltaBits: rounded(candidateStats.entropyBits - baselineStats.entropyBits),
  });
  PAIR_CACHE.set(cacheKey, result);
  return result;
}

export function pass71QualityVisualPairPasses(metrics) {
  const thresholds = PASS71_QUALITY_VISUAL_EVIDENCE.thresholds;
  return metrics.meanAbsoluteChannelDelta255 <= thresholds.maximumMeanAbsoluteChannelDelta255
    && metrics.rootMeanSquareChannelDelta255 <= thresholds.maximumRootMeanSquareChannelDelta255
    && metrics.p95AbsoluteChannelDelta255 <= thresholds.maximumP95AbsoluteChannelDelta255
    && metrics.changedPixelRatioAt8 <= thresholds.maximumChangedPixelRatioAt8
    && metrics.globalSsim >= thresholds.minimumGlobalSsim
    && metrics.candidateToBaselineLuminanceStdDevRatio >= thresholds.minimumCandidateToBaselineLuminanceStdDevRatio
    && metrics.candidateToBaselineEdgeEnergyRatio >= thresholds.minimumCandidateToBaselineEdgeEnergyRatio
    && metrics.candidateToBaselineEntropyDeltaBits >= thresholds.minimumCandidateToBaselineEntropyDeltaBits;
}

function pngBytes(png, prefix, failures) {
  exactKeys(png, ['encoding', 'sha256', 'encodedBytes', 'width', 'height', 'bitDepth', 'colorType', 'opaque', 'base64', 'metrics'], prefix, failures);
  if (!object(png) || png.encoding !== 'png-base64-lossless' || !SHA256.test(png.sha256 || '')
    || !Number.isSafeInteger(png.encodedBytes) || png.encodedBytes < 64 || png.encodedBytes > 2_000_000
    || png.width !== 640 || png.height !== 360 || png.bitDepth !== 8 || ![2, 6].includes(png.colorType)
    || png.opaque !== true || typeof png.base64 !== 'string') {
    failures.push(prefix + ':lossless-embedded-png');
    return null;
  }
  let bytes;
  try {
    bytes = Buffer.from(png.base64, 'base64');
    if (bytes.toString('base64') !== png.base64) throw new Error('noncanonical base64');
    const recomputed = pass71QualityVisualPngEvidence(bytes);
    if (!sameJson(png, recomputed)) failures.push(prefix + ':png-bytes-or-metrics');
    const metrics = recomputed.metrics;
    if (metrics.meanLuminance255 <= 5 || metrics.meanLuminance255 >= 250
      || metrics.luminanceStdDev255 < 12 || metrics.meanEdgeDelta255 < 1 || metrics.entropyBits < 3.5) {
      failures.push(prefix + ':nontrivial-scene-raster');
    }
  } catch {
    failures.push(prefix + ':png-bytes-or-metrics');
    return null;
  }
  return bytes;
}

function validateRuntime(runtime, backend, record, prefix, failures) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterLabel', 'adapterClass', 'deviceClass',
    'softwareAdapter', 'principalHdrSamples', 'deviceLost', 'uncapturedErrors', 'presentationStatus', 'webglVersion',
    'nativeAdapter',
  ], prefix, failures);
  if (!object(runtime) || runtime.requestedBackend !== backend || runtime.actualBackend !== backend
    || runtime.initialized !== true || typeof runtime.adapterLabel !== 'string' || runtime.adapterLabel.trim() === ''
    || SOFTWARE.test(runtime.adapterLabel) || typeof runtime.adapterClass !== 'string' || runtime.adapterClass.trim() === ''
    || runtime.softwareAdapter !== false || runtime.principalHdrSamples !== 4 || runtime.deviceLost !== false
    || runtime.uncapturedErrors !== 0 || !object(runtime.nativeAdapter)
    || !sameJson(runtime.nativeAdapter, record.environment?.selectedGraphicsAdapter)
    || !sameGpuFamily(runtime.adapterLabel, runtime.nativeAdapter?.name)
    || (backend === 'webgpu' && (runtime.deviceClass !== 'GPUDevice' || runtime.presentationStatus !== 'healthy' || runtime.webglVersion !== null))
    || (backend === 'webgl2' && (runtime.deviceClass !== null || runtime.presentationStatus !== 'synchronous'
      || !/WebGL\s*2/iu.test(runtime.webglVersion || '')))) failures.push(prefix + ':hardware-renderer');
}

function validateCamera(camera, backend, prefix, failures) {
  exactKeys(camera, [
    'id', 'reviewCameraId', 'authority', 'setter', 'position', 'target', 'fov', 'near', 'far',
    'fixedTimeMs', 'seed', 'hud', 'presentation',
  ], prefix, failures);
  const expected = PASS71_QUALITY_VISUAL_EVIDENCE.camera;
  const presentation = camera?.presentation;
  exactKeys(presentation, [
    'contract', 'renderer', 'completionSemantics', 'captureRevision', 'submissionSequence',
    'completedSequence', 'complete',
  ], prefix + ':presentation', failures);
  const backendCompletion = backend === 'webgpu'
    ? presentation?.completionSemantics === 'submission-sequence-covered-by-completion-frontier'
      && Number.isSafeInteger(presentation?.submissionSequence) && presentation.submissionSequence > 0
      && Number.isSafeInteger(presentation?.completedSequence)
      && presentation.completedSequence >= presentation.submissionSequence
    : presentation?.completionSemantics === 'synchronous-render-return'
      && Number.isSafeInteger(presentation?.submissionSequence) && presentation.submissionSequence >= 0
      && Number.isSafeInteger(presentation?.completedSequence) && presentation.completedSequence >= 0;
  if (!object(camera) || !sameJson(Object.fromEntries(Object.entries(camera).filter(([key]) => key !== 'presentation')), expected)
    || !object(presentation) || presentation.contract !== 'capture-camera-committed-frame-v1'
    || presentation.renderer !== backend || !Number.isSafeInteger(presentation.captureRevision)
    || presentation.captureRevision < 1 || presentation.complete !== true || !backendCompletion) {
    failures.push(prefix + ':exact-camera-time-seed');
  }
}

function validateQuality(quality, prefix, failures) {
  exactKeys(quality, [
    'name', 'preset', 'storageKey', 'storageVersion', 'queryRenderProfileOverride',
    'requestedGraphics', 'effectiveGraphics', 'displayedPreset', 'renderProfile', 'pixelRatio', 'drawingBuffer',
  ], prefix, failures);
  const namedQuality = PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality;
  if (!object(quality) || quality.name !== namedQuality.label || quality.preset !== namedQuality.preset
    || quality.storageKey !== namedQuality.storageKey || quality.storageVersion !== namedQuality.storageVersion
    || quality.queryRenderProfileOverride !== namedQuality.queryRenderProfileOverride
    || !sameJson(quality.requestedGraphics, PASS71_QUALITY_GRAPHICS)
    || !sameJson(quality.effectiveGraphics, PASS71_QUALITY_RUNTIME) || quality.displayedPreset !== 'high'
    || quality.renderProfile !== namedQuality.resolvedRenderProfile || quality.pixelRatio !== 1
    || !sameJson(quality.drawingBuffer, [640, 360])) failures.push(prefix + ':named-quality-settings');
}

function validateAssets(assets, prefix, failures) {
  exactKeys(assets, [
    'originalArtLoaded', 'qualityStreaming', 'blenderStatus', 'asset', 'meshCount', 'materialCount',
    'texturedMaterials', 'pbrMaterials', 'textureCount', 'triangleCount', 'semanticWindows',
    'auditedApertures', 'auditedOpenApertures', 'auditedWindowApertures', 'apertureAuditSamples',
    'modeledBuses', 'largeCoverAssets', 'housePropSets', 'collisionAuditVisuals', 'surfaceSeparationPass',
    'worldIdentityPass', 'proceduralWorldHidden', 'qualityArtRootVisible', 'overlappingPrimaryArenaRoots',
    'skyStatus', 'skyAssetUrl', 'definitionId', 'authoritativeArenaRoots', 'duplicateArenaRoots',
  ], prefix, failures);
  if (!object(assets) || assets.originalArtLoaded !== true || assets.qualityStreaming !== 'ready'
    || assets.blenderStatus !== 'ready' || !String(assets.asset || '').includes('atomic-acres-blender-arena.glb')
    || !Number.isSafeInteger(assets.meshCount) || assets.meshCount < 1
    || !Number.isSafeInteger(assets.materialCount) || assets.materialCount < 1
    || !Number.isSafeInteger(assets.texturedMaterials) || assets.texturedMaterials < 1
    || !Number.isSafeInteger(assets.pbrMaterials) || assets.pbrMaterials < 1
    || !Number.isSafeInteger(assets.textureCount) || assets.textureCount < 1
    || !Number.isSafeInteger(assets.triangleCount) || assets.triangleCount < 1
    || assets.semanticWindows !== 6 || assets.auditedApertures !== 16
    || assets.auditedOpenApertures !== 10 || assets.auditedWindowApertures !== 6
    || assets.apertureAuditSamples !== 144 || assets.modeledBuses !== 2 || assets.largeCoverAssets !== 4
    || assets.housePropSets !== 2 || assets.collisionAuditVisuals !== 3
    || assets.surfaceSeparationPass !== true || assets.worldIdentityPass !== true
    || assets.proceduralWorldHidden !== true || assets.qualityArtRootVisible !== true
    || assets.overlappingPrimaryArenaRoots !== false || assets.skyStatus !== 'asset-ready'
    || !String(assets.skyAssetUrl || '').includes('atomic-acres-sunset')
    || assets.definitionId !== 'atomic-acres' || assets.authoritativeArenaRoots !== 1
    || assets.duplicateArenaRoots !== false) failures.push(prefix + ':quality-assets');
}

function validateLod(lod, prefix, failures) {
  exactKeys(lod, [
    'source', 'assetUrl', 'lod', 'skinnedMeshes', 'pbrMaterials', 'materialContract',
    'embeddedWeaponsSuppressed', 'visibleEmbeddedWeapons', 'effectivelyVisibleSkinnedMeshes',
    'armPoseContract', 'armsPresent', 'armsHierarchyValid', 'armsRendered', 'armsAntiTPose',
    'handsContract', 'handsPresent', 'handsDescendFromWrists', 'handsRendered', 'mergedVertexLod',
  ], prefix, failures);
  if (!object(lod) || typeof lod.source !== 'string' || !String(lod.assetUrl || '').includes('third-person-operator-lod0.glb')
    || lod.lod !== 0 || !Number.isSafeInteger(lod.skinnedMeshes) || lod.skinnedMeshes < 1
    || !Number.isSafeInteger(lod.pbrMaterials) || lod.pbrMaterials < 1
    || typeof lod.materialContract !== 'string' || lod.embeddedWeaponsSuppressed !== true
    || lod.visibleEmbeddedWeapons !== 0 || !Number.isSafeInteger(lod.effectivelyVisibleSkinnedMeshes)
    || lod.effectivelyVisibleSkinnedMeshes < 1 || lod.armPoseContract !== 'source-glb-skinned-anti-t-arm-chain-v2'
    || lod.armsPresent !== true || lod.armsHierarchyValid !== true || lod.armsRendered !== true
    || lod.armsAntiTPose !== true || lod.handsContract !== 'source-glb-weighted-five-digit-sentinels-v2'
    || lod.handsPresent !== true || lod.handsDescendFromWrists !== true || lod.handsRendered !== true
    || lod.mergedVertexLod !== true) failures.push(prefix + ':quality-operator-lod');
}

function validateMaterials(materials, prefix, failures) {
  exactKeys(materials, ['entryCount', 'triangleCount', 'inventorySha256', 'materialTypes', 'entries'], prefix, failures);
  if (!object(materials) || !Array.isArray(materials.entries) || materials.entries.length < 1
    || materials.entryCount !== materials.entries.length || !Number.isSafeInteger(materials.triangleCount)
    || materials.triangleCount < 1 || !SHA256.test(materials.inventorySha256 || '')
    || !object(materials.materialTypes) || Object.keys(materials.materialTypes).length < 1
    || materials.entries.some((entry) => !object(entry) || !sameJson(Object.keys(entry).sort(), ['material', 'name', 'triangles'].sort())
      || typeof entry.name !== 'string' || typeof entry.material !== 'string'
      || !Number.isSafeInteger(entry.triangles) || entry.triangles < 0)
    || sha256(Buffer.from(canonicalJson(materials.entries))) !== materials.inventorySha256
    || materials.entries.reduce((total, entry) => total + entry.triangles, 0) !== materials.triangleCount) {
    failures.push(prefix + ':material-inventory');
  }
}

function validateLighting(lighting, prefix, failures) {
  exactKeys(lighting, ['definitionId', 'sun', 'ambient', 'fog', 'atmosphereDefinitionId', 'profile', 'sky'], prefix, failures);
  if (!object(lighting) || lighting.definitionId !== 'atomic-acres'
    || !sameJson(lighting.sun, { color: 0xfff1ce, intensity: 3.2 })
    || !sameJson(lighting.ambient, { color: 0x8fb0bf, intensity: 0.42 })
    || !sameJson(lighting.fog, { color: 0xb1c0be, near: 58, far: 148 })
    || lighting.atmosphereDefinitionId !== 'atomic-acres'
    || !object(lighting.profile) || lighting.profile.exposure !== 1 || lighting.profile.sunIntensity !== 3.25
    || lighting.profile.ambientIntensity !== 0.18 || lighting.profile.hemisphereIntensity !== 0.72
    || lighting.profile.fogNear !== 58 || lighting.profile.fogFar !== 148
    || !object(lighting.sky) || lighting.sky.linearHdr !== true || lighting.sky.fogNear !== 58
    || lighting.sky.fogFar !== 148) failures.push(prefix + ':lighting-policy');
}

function validateShadows(shadows, prefix, failures) {
  exactKeys(shadows, ['enabled', 'authored', 'mode', 'sunCastShadow', 'mapSize', 'maximumDistance', 'normalBias', 'shadowLights', 'shadowMapPixels'], prefix, failures);
  if (!object(shadows) || shadows.enabled !== true || shadows.authored !== true || shadows.mode !== 'static'
    || shadows.sunCastShadow !== true || shadows.mapSize !== 2048 || shadows.maximumDistance !== 176
    || shadows.normalBias !== 0.035 || !Number.isSafeInteger(shadows.shadowLights) || shadows.shadowLights < 1
    || !Number.isSafeInteger(shadows.shadowMapPixels) || shadows.shadowMapPixels < 2048 * 2048) {
    failures.push(prefix + ':shadow-policy');
  }
}

function validateAuthority(authority, prefix, failures) {
  exactKeys(authority, ['arena', 'ballistics', 'houses', 'physicalCover', 'profileAuthorityParity'], prefix, failures);
  const arena = authority && authority.arena;
  if (!object(authority) || !object(arena) || arena.id !== 'atomic-acres'
    || !Array.isArray(arena.spawnCounts) || arena.spawnCounts.length !== 2
    || !Number.isSafeInteger(arena.colliders) || arena.colliders < 1
    || !Number.isSafeInteger(arena.physicsColliders) || arena.physicsColliders < 1
    || !Number.isSafeInteger(arena.physicsBoundaryWalls) || arena.physicsBoundaryWalls !== 4
    || !Number.isSafeInteger(arena.navigationColliders) || arena.navigationColliders < 1
    || arena.navigationCollidersMatchArena !== true || !Number.isSafeInteger(arena.raycastMeshes) || arena.raycastMeshes < 1
    || !object(authority.ballistics) || authority.ballistics.activeSurfaces < 1
    || authority.ballistics.raycastMeshes < 1 || authority.ballistics.shotSurfaces < 1
    || !Array.isArray(authority.houses) || authority.houses.length !== 2
    || !Array.isArray(authority.physicalCover) || authority.physicalCover.length < 1
    || !object(authority.profileAuthorityParity) || authority.profileAuthorityParity.pass !== true) {
    failures.push(prefix + ':gameplay-authority');
  }
}

function validateCapture(capture, expectedSubject, expectedBackend, record, prefix, failures) {
  exactKeys(capture, [
    'id', 'subject', 'backend', 'servedOrigin', 'route', 'browser', 'runtime', 'camera',
    'quality', 'assets', 'lod', 'materials', 'lighting', 'shadows', 'authority', 'signatures', 'png', 'faults',
  ], prefix, failures);
  if (!object(capture) || capture.id !== expectedSubject + '-' + expectedBackend
    || capture.subject !== expectedSubject || capture.backend !== expectedBackend
    || !object(capture.servedOrigin) || capture.servedOrigin.subject !== expectedSubject
    || !Number.isSafeInteger(capture.servedOrigin.port) || capture.servedOrigin.port < 1024 || capture.servedOrigin.port > 65535
    || !SHA256.test(capture.servedOrigin.provenanceSha256 || '')
    || capture.servedOrigin.provenanceSha256 !== record.source?.[expectedSubject === 'pass70' ? 'baseline' : 'candidate']?.provenanceSha256) {
    failures.push(prefix + ':capture-identity');
  }
  exactKeys(capture && capture.servedOrigin, ['subject', 'port', 'provenanceSha256'], prefix + ':served-origin', failures);
  exactKeys(capture && capture.route, ['path', 'query'], prefix + ':route', failures);
  const expectedQuery = expectedBackend === 'webgpu'
    ? 'externalServices=off&map=atomic-acres&release=latest&renderer=webgpu&requireWebGPU=1&seed=6401'
    : 'externalServices=off&map=atomic-acres&release=latest&renderer=webgl2&seed=6401';
  if (capture && (capture.route?.path !== '/channels/the-big-one/' || capture.route?.query !== expectedQuery)) failures.push(prefix + ':exact-route');
  exactKeys(capture && capture.browser, ['userAgent', 'version'], prefix + ':browser', failures);
  const userAgentEdgeVersion = /\bEdg\/(\d+(?:\.\d+){3})\b/u.exec(String(capture?.browser?.userAgent || ''))?.[1] ?? null;
  if (!object(capture && capture.browser) || capture.browser.version !== record.browser?.version
    || userAgentEdgeVersion === null
    || userAgentEdgeVersion.split('.')[0] !== String(record.browser?.version ?? '').split('.')[0]) {
    failures.push(prefix + ':same-installed-edge');
  }
  validateRuntime(capture && capture.runtime, expectedBackend, record, prefix + ':runtime', failures);
  validateCamera(capture && capture.camera, expectedBackend, prefix + ':camera', failures);
  validateQuality(capture && capture.quality, prefix + ':quality', failures);
  validateAssets(capture && capture.assets, prefix + ':assets', failures);
  validateLod(capture && capture.lod, prefix + ':lod', failures);
  validateMaterials(capture && capture.materials, prefix + ':materials', failures);
  validateLighting(capture && capture.lighting, prefix + ':lighting', failures);
  validateShadows(capture && capture.shadows, prefix + ':shadows', failures);
  validateAuthority(capture && capture.authority, prefix + ':authority', failures);
  const signatureKeys = CAPTURE_SIGNATURE_FIELDS.map((field) => field + 'Sha256');
  exactKeys(capture && capture.signatures, signatureKeys, prefix + ':signatures', failures);
  if (!object(capture && capture.signatures)
    || !sameJson(capture.signatures, pass71QualityVisualCaptureSignatures(capture))) {
    failures.push(prefix + ':exact-state-signatures');
  }
  if (!Array.isArray(capture && capture.faults) || capture.faults.length !== 0) failures.push(prefix + ':browser-faults');
  return pngBytes(capture && capture.png, prefix + ':png', failures);
}

function captureBy(record, subject, backend) {
  return record.captures.find((capture) => capture && capture.subject === subject && capture.backend === backend);
}

function validatePair(pair, backend, record, bytesById, prefix, failures) {
  exactKeys(pair, ['backend', 'baselineCaptureId', 'candidateCaptureId', 'metrics', 'thresholds', 'passed'], prefix, failures);
  if (!object(pair) || pair.backend !== backend || pair.baselineCaptureId !== 'pass70-' + backend
    || pair.candidateCaptureId !== 'candidate-' + backend || !sameJson(pair.thresholds, PASS71_QUALITY_VISUAL_EVIDENCE.thresholds)
    || pair.passed !== true) failures.push(prefix + ':identity');
  const baselineBytes = bytesById.get('pass70-' + backend);
  const candidateBytes = bytesById.get('candidate-' + backend);
  if (!baselineBytes || !candidateBytes) {
    failures.push(prefix + ':missing-png');
    return;
  }
  const recomputed = pass71QualityVisualPairMetrics(baselineBytes, candidateBytes);
  if (!sameJson(pair.metrics, recomputed)) failures.push(prefix + ':pixel-metrics');
  if (!pass71QualityVisualPairPasses(recomputed)) failures.push(prefix + ':pixel-parity-threshold');
  const baselineCapture = captureBy(record, 'pass70', backend);
  const candidateCapture = captureBy(record, 'candidate', backend);
  for (const field of ['quality', 'assets', 'lod', 'materials', 'lighting', 'authority', 'signatures']) {
    if (!sameJson(baselineCapture && baselineCapture[field], candidateCapture && candidateCapture[field])) {
      failures.push(prefix + ':' + field + '-parity');
    }
  }
  if (!sameJson(candidateCapture?.shadows, baselineCapture?.shadows)) failures.push(prefix + ':shadow-parity');
  if (baselineCapture?.runtime?.adapterLabel !== candidateCapture?.runtime?.adapterLabel
    || !sameJson(baselineCapture?.runtime?.nativeAdapter, candidateCapture?.runtime?.nativeAdapter)) {
    failures.push(prefix + ':same-gpu-adapter');
  }
}

export function pass71QualityVisualEvidenceFailures(record, expected) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_QUALITY_VISUAL_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_QUALITY_VISUAL_EVIDENCE.evidenceId
    || record.feedbackId !== PASS71_QUALITY_VISUAL_EVIDENCE.feedbackId
    || record.kind !== PASS71_QUALITY_VISUAL_EVIDENCE.kind
    || record.contract !== PASS71_QUALITY_VISUAL_EVIDENCE.contract
    || record.gate !== PASS71_QUALITY_VISUAL_EVIDENCE.gate || record.status !== 'passed') return ['receipt-identity-or-status'];
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'feedbackId', 'kind', 'contract', 'gate', 'status', 'startedAt', 'completedAt',
    'capturedAt', 'claim', 'invocation', 'source', 'structuralComparator', 'environment', 'browser',
    'tooling', 'captures', 'pairs', 'faults', 'receiptSha256',
  ], 'receipt', failures);
  exactKeys(record.claim, ['mechanicalVisualParity', 'subjectiveOwnerApproval', 'baselineLimitationBeforeCapture'], 'claim', failures);
  if (record.claim?.mechanicalVisualParity !== 'proven-by-this-native-receipt'
    || record.claim?.subjectiveOwnerApproval !== 'not-claimed'
    || record.claim?.baselineLimitationBeforeCapture !== 'UNPROVEN') failures.push('truthful-claim-boundary');
  exactKeys(record.invocation, [
    'runner', 'expectedSourceSha', 'viewport', 'cameraId', 'cameraAuthority', 'qualityName',
    'graphicsPreset', 'settingsStorageKey', 'settingsStorageVersion', 'queryRenderProfileOverride',
    'resolvedRenderProfile', 'fixedTimeMs', 'seed',
    'backends', 'browserChannel', 'browserLaunchCount', 'browserContextCount', 'headless', 'captureEncoding',
    'previewOwnership', 'dependencyPreflight',
  ], 'invocation', failures);
  if (record.invocation?.runner !== PASS71_QUALITY_VISUAL_TOOL_PATHS.runner
    || record.invocation.expectedSourceSha !== expected?.sourceSha
    || !sameJson(record.invocation.viewport, PASS71_QUALITY_VISUAL_EVIDENCE.viewport)
    || record.invocation.cameraId !== PASS71_QUALITY_VISUAL_EVIDENCE.camera.id
    || record.invocation.cameraAuthority !== PASS71_QUALITY_VISUAL_EVIDENCE.camera.authority
    || record.invocation.qualityName !== PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.label
    || record.invocation.graphicsPreset !== PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.preset
    || record.invocation.settingsStorageKey !== PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageKey
    || record.invocation.settingsStorageVersion !== PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageVersion
    || record.invocation.queryRenderProfileOverride !== PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.queryRenderProfileOverride
    || record.invocation.resolvedRenderProfile !== PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.resolvedRenderProfile
    || record.invocation.fixedTimeMs !== PASS71_QUALITY_VISUAL_EVIDENCE.camera.fixedTimeMs
    || record.invocation.seed !== PASS71_QUALITY_VISUAL_EVIDENCE.camera.seed
    || !sameJson(record.invocation.backends, PASS71_QUALITY_VISUAL_EVIDENCE.backends)
    || record.invocation.browserChannel !== 'msedge' || record.invocation.browserLaunchCount !== 1
    || record.invocation.browserContextCount !== 4 || record.invocation.headless !== true
    || record.invocation.captureEncoding !== 'lossless-png-embedded'
    || record.invocation.previewOwnership !== 'two-owned-loopback-static-servers-one-installed-edge-launch'
    || record.invocation.dependencyPreflight !== 'npm@10.9.8-ci-dry-run') failures.push('exact-native-invocation');
  exactKeys(record.source, ['candidate', 'baseline'], 'source', failures);
  exactKeys(record.source?.candidate, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'cleanBefore', 'cleanAfter',
    'releasePass', 'provenanceSchemaVersion', 'channel', 'pagesPath', 'runtimeFileCount',
    'completeFileCount', 'runtimeTreeSha256', 'provenanceSha256', 'topologySchemaVersion', 'topologySha256',
  ], 'source:candidate', failures);
  const candidate = record.source?.candidate;
  if (!SHA40.test(expected?.sourceSha || '') || candidate?.expectedSourceSha !== expected.sourceSha
    || candidate.checkoutSourceSha !== expected.sourceSha || candidate.endingCheckoutSourceSha !== expected.sourceSha
    || candidate.cleanBefore !== true || candidate.cleanAfter !== true || candidate.releasePass !== 'PASS 71'
    || candidate.provenanceSchemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.pagesPath !== 'channels/the-big-one' || !Number.isSafeInteger(candidate.runtimeFileCount)
    || candidate.runtimeFileCount < 2 || candidate.completeFileCount !== candidate.runtimeFileCount + 1
    || !SHA256.test(candidate.runtimeTreeSha256 || '') || !SHA256.test(candidate.provenanceSha256 || '')
    || candidate.topologySchemaVersion !== 4 || !SHA256.test(candidate.topologySha256 || '')) {
    failures.push('exact-candidate-source-and-staged-provenance');
  }
  exactKeys(record.source?.baseline, [
    'releasePass', 'provenanceSchemaVersion', 'channel', 'sourceSha', 'pagesSha', 'pagesPath', 'runtimeFileCount', 'completeFileCount',
    'runtimeTreeSha256', 'provenanceSha256', 'extractedTreeSha256', 'pagesSubject',
  ], 'source:baseline', failures);
  const baseline = record.source?.baseline;
  if (!object(baseline) || !sameJson(Object.fromEntries(Object.entries(baseline).filter(([key]) => !['extractedTreeSha256', 'pagesSubject'].includes(key))), PASS71_QUALITY_VISUAL_EVIDENCE.baseline)
    || baseline.extractedTreeSha256 !== PASS71_QUALITY_VISUAL_EVIDENCE.baseline.runtimeTreeSha256
    || baseline.pagesSubject !== 'PASS 70 from ' + PASS71_QUALITY_VISUAL_EVIDENCE.baseline.sourceSha) {
    failures.push('immutable-pass70-pages-provenance');
  }
  const structural = record.structuralComparator;
  exactKeys(structural, ['status', 'claim', 'candidateSha', 'baseline', 'checks', 'pixelParity', 'problems'], 'structural-comparator', failures);
  if (!object(structural) || structural.status !== 'PASS' || structural.claim !== 'pass70-source-asset-scene-structural-parity'
    || structural.candidateSha !== expected?.sourceSha || !sameJson(structural.baseline, {
      sourceSha: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.sourceSha,
      pagesSha: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.pagesSha,
      pagesPath: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.pagesPath,
      runtimeFileCount: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.runtimeFileCount,
      runtimeTreeSha256: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.runtimeTreeSha256,
      guardPolicySha256: '3f0b6bfee0acf87ac06d77779ea9b2c62a0bbdbd8bc4ab8308636f46305357ad',
    }) || structural.checks?.candidateDistChecked !== true || structural.pixelParity?.status !== 'UNPROVEN'
    || typeof structural.pixelParity?.blocker !== 'string' || structural.pixelParity.blocker.trim() === ''
    || !Array.isArray(structural.problems) || structural.problems.length !== 0) failures.push('composed-structural-baseline');
  exactKeys(record.environment, ['machine', 'platform', 'arch', 'osRelease', 'graphicsAdapters', 'selectedGraphicsAdapter'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment.platform !== 'win32'
    || typeof record.environment.arch !== 'string' || record.environment.arch.trim() === ''
    || typeof record.environment.osRelease !== 'string' || record.environment.osRelease.trim() === ''
    || !Array.isArray(record.environment.graphicsAdapters) || record.environment.graphicsAdapters.length < 1
    || record.environment.graphicsAdapters.some((adapter) => !object(adapter)
      || !sameJson(Object.keys(adapter).sort(), ['driverVersion', 'name'].sort())
      || typeof adapter.name !== 'string' || adapter.name.trim() === '' || SOFTWARE.test(adapter.name)
      || !/^\d+(?:\.\d+)+$/u.test(adapter.driverVersion || ''))
    || !object(record.environment.selectedGraphicsAdapter)
    || !record.environment.graphicsAdapters.some((adapter) => sameJson(adapter, record.environment.selectedGraphicsAdapter))) {
    failures.push('same-native-gpu-driver-environment');
  }
  exactKeys(record.browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'executableVersion', 'version',
    'installRoot', 'authenticodeStatus', 'authenticodeSigner', 'headless', 'isolation',
  ], 'browser', failures);
  if (record.browser?.channel !== 'msedge' || record.browser.installed !== true
    || String(record.browser.executableName || '').toLowerCase() !== 'msedge.exe'
    || !SHA256.test(record.browser.executableSha256 || '') || record.browser.executableVersion !== record.browser.version
    || !/^\d+(?:\.\d+)+$/u.test(record.browser.version || '') || typeof record.browser.installRoot !== 'string'
    || record.browser.installRoot.trim() === '' || record.browser.authenticodeStatus !== 'Valid'
    || !/Microsoft/iu.test(record.browser.authenticodeSigner || '') || record.browser.headless !== true
    || record.browser.isolation !== 'one-installed-edge-launch-shared-across-all-pass70-candidate-pairs') {
    failures.push('installed-edge-executable');
  }
  if (!object(record.tooling) || !sameJson(record.tooling, expected?.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value))) failures.push('preview-tooling-hashes');
  const expectedCaptureKeys = PASS71_QUALITY_VISUAL_EVIDENCE.backends.flatMap((backend) => [
    ['pass70', backend], ['candidate', backend],
  ]);
  if (!Array.isArray(record.captures) || record.captures.length !== expectedCaptureKeys.length
    || !sameJson(record.captures.map((capture) => [capture?.subject, capture?.backend]), expectedCaptureKeys)) {
    failures.push('all-pass70-candidate-backend-captures');
  }
  const bytesById = new Map();
  for (const [index, [subject, backend]] of expectedCaptureKeys.entries()) {
    const capture = record.captures?.[index];
    const bytes = validateCapture(capture, subject, backend, record, 'capture:' + subject + ':' + backend, failures);
    if (bytes && capture?.id) bytesById.set(capture.id, bytes);
  }
  if (!Array.isArray(record.pairs) || record.pairs.length !== PASS71_QUALITY_VISUAL_EVIDENCE.backends.length
    || !sameJson(record.pairs.map((pair) => pair?.backend), PASS71_QUALITY_VISUAL_EVIDENCE.backends)) {
    failures.push('both-backend-pairs');
  }
  for (const [index, backend] of PASS71_QUALITY_VISUAL_EVIDENCE.backends.entries()) {
    validatePair(record.pairs?.[index], backend, record, bytesById, 'pair:' + backend, failures);
  }
  const authorityRecords = record.captures?.map((capture) => capture.authority) || [];
  if (authorityRecords.length === 4 && !authorityRecords.every((authority) => sameJson(authority, authorityRecords[0]))) {
    failures.push('authority-independent-of-release-and-backend');
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt) || !isoTimestamp(record.capturedAt)
    || Date.parse(record.completedAt) < Date.parse(record.startedAt) || record.capturedAt !== record.completedAt) {
    failures.push('run-timestamps');
  }
  if (!SHA256.test(record.receiptSha256 || '') || record.receiptSha256 !== pass71QualityVisualRecordSha256(record)) {
    failures.push('receipt-sha256');
  }
  return [...new Set(failures)];
}

export function assertPass71QualityVisualEvidence(record, expected) {
  const failures = pass71QualityVisualEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error('Pass 71 Quality visual evidence rejected:\n- ' + failures.join('\n- '));
  return record;
}

export function pass71QualityVisualEvidenceDisposition(record, expected) {
  const failures = pass71QualityVisualEvidenceFailures(record, expected);
  return Object.freeze({
    status: failures.length === 0 ? 'closing' : 'partial-non-closing',
    closesFeedback: failures.length === 0,
    mechanicalVisualParity: failures.length === 0 ? 'proven-by-this-native-receipt' : 'not-proven',
    ownerSubjectiveApproval: 'not-claimed',
    failures: Object.freeze(failures),
  });
}

export function createPass71QualityVisualEvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_QUALITY_VISUAL_EVIDENCE_DESCRIPTOR,
    closesFeedback: true,
    ownerSubjectiveApproval: 'not-claimed',
    validate(record, context) {
      try {
        const tooling = context?.options?.pass71QualityVisualTooling
          ?? pass71QualityVisualToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
        return pass71QualityVisualEvidenceFailures(record, { sourceSha: context?.sourceSha, tooling });
      } catch (error) {
        return [`hf303-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY = createPass71QualityVisualEvidenceRegistryEntry();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return output;
}

function fixturePng(backend, candidate) {
  const key = backend + ':' + candidate;
  if (FIXTURE_PNG_CACHE.has(key)) return FIXTURE_PNG_CACHE.get(key);
  const width = 640;
  const height = 360;
  const rows = Buffer.alloc(height * (1 + width * 3));
  const backendOffset = backend === 'webgpu' ? 11 : 0;
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    rows[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3;
      const tinyDelta = candidate && (x + y * width) % 257 === 0 ? 1 : 0;
      rows[at] = (x * 3 + y + backendOffset + tinyDelta) & 255;
      rows[at + 1] = (x + y * 2 + 71 + backendOffset + tinyDelta) & 255;
      rows[at + 2] = (x * 2 + y * 3 + 139 + backendOffset + tinyDelta) & 255;
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
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  FIXTURE_PNG_CACHE.set(key, bytes);
  return bytes;
}

function fixtureMaterials() {
  const entries = [
    { name: 'Atomic Acres Quality Graphics arena', material: 'MeshStandardMaterial:brick-pbr', triangles: 120_000 },
    { name: 'Atomic Acres sunset sky', material: 'MeshBasicMaterial:sky-backdrop', triangles: 2 },
  ];
  return {
    entryCount: entries.length,
    triangleCount: entries.reduce((total, entry) => total + entry.triangles, 0),
    inventorySha256: sha256(Buffer.from(canonicalJson(entries))),
    materialTypes: { MeshBasicMaterial: 1, MeshStandardMaterial: 1 },
    entries,
  };
}

function fixtureCapture(subject, backend, version) {
  const bytes = fixturePng(backend, subject === 'candidate');
  const provenanceSha256 = subject === 'pass70'
    ? PASS71_QUALITY_VISUAL_EVIDENCE.baseline.provenanceSha256
    : sha256(Buffer.from('candidate-provenance'));
  const capture = {
    id: subject + '-' + backend,
    subject,
    backend,
    servedOrigin: { subject, port: subject === 'pass70' ? 4571 : 4570, provenanceSha256 },
    route: {
      path: '/channels/the-big-one/',
      query: backend === 'webgpu'
        ? 'externalServices=off&map=atomic-acres&release=latest&renderer=webgpu&requireWebGPU=1&seed=6401'
        : 'externalServices=off&map=atomic-acres&release=latest&renderer=webgl2&seed=6401',
    },
    browser: { userAgent: 'Mozilla/5.0 Edg/' + version, version },
    runtime: {
      requestedBackend: backend,
      actualBackend: backend,
      initialized: true,
      adapterLabel: backend === 'webgpu' ? 'NVIDIA GeForce RTX 5080' : 'ANGLE (NVIDIA GeForce RTX 5080, D3D11)',
      adapterClass: backend === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
      deviceClass: backend === 'webgpu' ? 'GPUDevice' : null,
      softwareAdapter: false,
      principalHdrSamples: 4,
      deviceLost: false,
      uncapturedErrors: 0,
      presentationStatus: backend === 'webgpu' ? 'healthy' : 'synchronous',
      webglVersion: backend === 'webgl2' ? 'WebGL 2.0 (OpenGL ES 3.0 Chromium)' : null,
      nativeAdapter: { name: 'NVIDIA GeForce RTX 5080', driverVersion: '32.0.15.9999' },
    },
    camera: {
      ...PASS71_QUALITY_VISUAL_EVIDENCE.camera,
      presentation: {
        contract: 'capture-camera-committed-frame-v1',
        renderer: backend,
        completionSemantics: backend === 'webgpu'
          ? 'submission-sequence-covered-by-completion-frontier'
          : 'synchronous-render-return',
        captureRevision: 1,
        submissionSequence: backend === 'webgpu' ? 10 : 0,
        completedSequence: backend === 'webgpu' ? 10 : 0,
        complete: true,
      },
    },
    quality: {
      name: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.label,
      preset: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.preset,
      storageKey: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageKey,
      storageVersion: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageVersion,
      queryRenderProfileOverride: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.queryRenderProfileOverride,
      requestedGraphics: PASS71_QUALITY_GRAPHICS,
      effectiveGraphics: PASS71_QUALITY_RUNTIME,
      displayedPreset: 'high',
      renderProfile: 'blender',
      pixelRatio: 1,
      drawingBuffer: [640, 360],
    },
    assets: {
      originalArtLoaded: true, qualityStreaming: 'ready', blenderStatus: 'ready',
      asset: './assets/original/models/atomic-acres-blender-arena.glb?v=pass63-20260724-apertures1',
      meshCount: 200, materialCount: 30, texturedMaterials: 28, pbrMaterials: 25, textureCount: 40,
      triangleCount: 800_000, semanticWindows: 6, auditedApertures: 16, auditedOpenApertures: 10,
      auditedWindowApertures: 6, apertureAuditSamples: 144, modeledBuses: 2, largeCoverAssets: 4,
      housePropSets: 2, collisionAuditVisuals: 3, surfaceSeparationPass: true, worldIdentityPass: true,
      proceduralWorldHidden: true, qualityArtRootVisible: true, overlappingPrimaryArenaRoots: false,
      skyStatus: 'asset-ready', skyAssetUrl: '/assets/original/skies/atomic-acres-sunset.webp', definitionId: 'atomic-acres',
      authoritativeArenaRoots: 1, duplicateArenaRoots: false,
    },
    lod: {
      source: 'project-authored-rigged-operator',
      assetUrl: './assets/original/models/operators/pass65-third-person-operator-lod0.glb',
      lod: 0, skinnedMeshes: 1, pbrMaterials: 2, materialContract: 'project-authored-pbr',
      embeddedWeaponsSuppressed: true, visibleEmbeddedWeapons: 0, effectivelyVisibleSkinnedMeshes: 1,
      armPoseContract: 'source-glb-skinned-anti-t-arm-chain-v2', armsPresent: true, armsHierarchyValid: true,
      armsRendered: true, armsAntiTPose: true, handsContract: 'source-glb-weighted-five-digit-sentinels-v2',
      handsPresent: true, handsDescendFromWrists: true, handsRendered: true, mergedVertexLod: true,
    },
    materials: fixtureMaterials(),
    lighting: {
      definitionId: 'atomic-acres', sun: { color: 0xfff1ce, intensity: 3.2 },
      ambient: { color: 0x8fb0bf, intensity: 0.42 }, fog: { color: 0xb1c0be, near: 58, far: 148 },
      atmosphereDefinitionId: 'atomic-acres',
      profile: { exposure: 1, sunIntensity: 3.25, ambientIntensity: 0.18, hemisphereIntensity: 0.72, fogNear: 58, fogFar: 148 },
      sky: { linearHdr: true, fogNear: 58, fogFar: 148 },
    },
    shadows: {
      enabled: true, authored: true, mode: 'static', sunCastShadow: true, mapSize: 2048,
      maximumDistance: 176, normalBias: 0.035, shadowLights: 3, shadowMapPixels: 12_582_912,
    },
    authority: {
      arena: {
        id: 'atomic-acres', bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 }, spawnCounts: [8, 8],
        colliders: 80, physicsColliders: 70, physicsBoundaryWalls: 4, navigationColliders: 80,
        navigationCollidersMatchArena: true, raycastMeshes: 100, targets: 0,
      },
      ballistics: { activeSurfaces: 100, raycastMeshes: 100, shotSurfaces: 90, fallbackSurfaces: [] },
      houses: [{ id: 'aqua', routeAnchors: 6 }, { id: 'coral', routeAnchors: 6 }],
      physicalCover: [{ id: 'bus-west', blocksMovement: true, blocksShots: true }],
      profileAuthorityParity: { pass: true, profile: 'quality' },
    },
    png: pass71QualityVisualPngEvidence(bytes),
    faults: [],
  };
  capture.signatures = pass71QualityVisualCaptureSignatures(capture);
  return capture;
}

export function createPass71QualityVisualEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha || 'a'.repeat(40);
  const version = '151.0.4129.72';
  const captures = PASS71_QUALITY_VISUAL_EVIDENCE.backends.flatMap((backend) => [
    fixtureCapture('pass70', backend, version),
    fixtureCapture('candidate', backend, version),
  ]);
  const pairs = PASS71_QUALITY_VISUAL_EVIDENCE.backends.map((backend) => {
    const baseline = captures.find((capture) => capture.id === 'pass70-' + backend);
    const candidate = captures.find((capture) => capture.id === 'candidate-' + backend);
    const metrics = pass71QualityVisualPairMetrics(
      Buffer.from(baseline.png.base64, 'base64'),
      Buffer.from(candidate.png.base64, 'base64'),
    );
    return {
      backend,
      baselineCaptureId: baseline.id,
      candidateCaptureId: candidate.id,
      metrics,
      thresholds: PASS71_QUALITY_VISUAL_EVIDENCE.thresholds,
      passed: pass71QualityVisualPairPasses(metrics),
    };
  });
  const tooling = options.tooling || Object.fromEntries(Object.keys(PASS71_QUALITY_VISUAL_TOOL_PATHS).map((name, index) => [name + 'Sha256', String(index + 1).padStart(64, '0')]));
  const record = {
    schemaVersion: PASS71_QUALITY_VISUAL_EVIDENCE.schemaVersion,
    evidenceId: PASS71_QUALITY_VISUAL_EVIDENCE.evidenceId,
    feedbackId: PASS71_QUALITY_VISUAL_EVIDENCE.feedbackId,
    kind: PASS71_QUALITY_VISUAL_EVIDENCE.kind,
    contract: PASS71_QUALITY_VISUAL_EVIDENCE.contract,
    gate: PASS71_QUALITY_VISUAL_EVIDENCE.gate,
    status: 'passed',
    startedAt: options.startedAt || '2026-08-13T09:01:00.000Z',
    completedAt: options.completedAt || '2026-08-13T09:05:00.000Z',
    capturedAt: options.completedAt || '2026-08-13T09:05:00.000Z',
    claim: {
      mechanicalVisualParity: 'proven-by-this-native-receipt',
      subjectiveOwnerApproval: 'not-claimed',
      baselineLimitationBeforeCapture: 'UNPROVEN',
    },
    invocation: {
      runner: PASS71_QUALITY_VISUAL_TOOL_PATHS.runner,
      expectedSourceSha: sourceSha,
      viewport: PASS71_QUALITY_VISUAL_EVIDENCE.viewport,
      cameraId: PASS71_QUALITY_VISUAL_EVIDENCE.camera.id,
      cameraAuthority: PASS71_QUALITY_VISUAL_EVIDENCE.camera.authority,
      qualityName: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.label,
      graphicsPreset: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.preset,
      settingsStorageKey: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageKey,
      settingsStorageVersion: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.storageVersion,
      queryRenderProfileOverride: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.queryRenderProfileOverride,
      resolvedRenderProfile: PASS71_QUALITY_VISUAL_EVIDENCE.namedQuality.resolvedRenderProfile,
      fixedTimeMs: PASS71_QUALITY_VISUAL_EVIDENCE.camera.fixedTimeMs,
      seed: PASS71_QUALITY_VISUAL_EVIDENCE.camera.seed,
      backends: PASS71_QUALITY_VISUAL_EVIDENCE.backends,
      browserChannel: 'msedge', browserLaunchCount: 1, browserContextCount: 4, headless: true,
      captureEncoding: 'lossless-png-embedded',
      previewOwnership: 'two-owned-loopback-static-servers-one-installed-edge-launch',
      dependencyPreflight: 'npm@10.9.8-ci-dry-run',
    },
    source: {
      candidate: {
        expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
        cleanBefore: true, cleanAfter: true, releasePass: 'PASS 71', pagesPath: 'channels/the-big-one',
        provenanceSchemaVersion: 4, channel: 'the-big-one',
        runtimeFileCount: 520, completeFileCount: 521, runtimeTreeSha256: 'b'.repeat(64),
        provenanceSha256: sha256(Buffer.from('candidate-provenance')),
        topologySchemaVersion: 4, topologySha256: 'c'.repeat(64),
      },
      baseline: {
        ...PASS71_QUALITY_VISUAL_EVIDENCE.baseline,
        extractedTreeSha256: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.runtimeTreeSha256,
        pagesSubject: 'PASS 70 from ' + PASS71_QUALITY_VISUAL_EVIDENCE.baseline.sourceSha,
      },
    },
    structuralComparator: {
      status: 'PASS', claim: 'pass70-source-asset-scene-structural-parity', candidateSha: sourceSha,
      baseline: {
        sourceSha: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.sourceSha,
        pagesSha: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.pagesSha,
        pagesPath: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.pagesPath,
        runtimeFileCount: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.runtimeFileCount,
        runtimeTreeSha256: PASS71_QUALITY_VISUAL_EVIDENCE.baseline.runtimeTreeSha256,
        guardPolicySha256: '3f0b6bfee0acf87ac06d77779ea9b2c62a0bbdbd8bc4ab8308636f46305357ad',
      },
      checks: {
        pagesRuntimeFiles: 515, protectedSourceFiles: 37, auditedSourceVariants: 2, protectedTextures: 94,
        protectedRuntimeAssets: 7, semanticDeclarations: 5, semanticFunctions: 14, semanticMethods: 5,
        semanticTokens: 15, candidateDistChecked: true,
      },
      pixelParity: { status: 'UNPROVEN', blocker: 'No earlier exact-camera native-GPU corpus existed.' },
      problems: [],
    },
    environment: {
      machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64', osRelease: '10.0.26200',
      graphicsAdapters: [{ name: 'NVIDIA GeForce RTX 5080', driverVersion: '32.0.15.9999' }],
      selectedGraphicsAdapter: { name: 'NVIDIA GeForce RTX 5080', driverVersion: '32.0.15.9999' },
    },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'c'.repeat(64),
      executableVersion: version, version, installRoot: 'C:/Program Files (x86)/Microsoft/Edge/Application',
      authenticodeStatus: 'Valid', authenticodeSigner: 'Microsoft Corporation', headless: true,
      isolation: 'one-installed-edge-launch-shared-across-all-pass70-candidate-pairs',
    },
    tooling,
    captures,
    pairs,
    faults: [],
  };
  record.receiptSha256 = pass71QualityVisualRecordSha256(record);
  return record;
}
