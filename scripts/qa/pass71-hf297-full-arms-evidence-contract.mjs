import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync, gunzipSync, gzipSync } from 'node:zlib';
import {
  PASS71_HF297_FULL_LOCAL_ROLES,
  PASS71_HF297_FULL_POSE_STATES,
  PASS71_HF297_FULL_RENDERERS,
  PASS71_HF297_FULL_VIEWPORTS,
  PASS71_HF297_SOURCE_CATALOG_PATHS,
  pass71Hf297ActionTargets,
  pass71Hf297FullCellIdentity,
  pass71Hf297FullCellKey,
  pass71Hf297FullExactSetFailures,
  pass71Hf297FullKeyDigest,
  pass71Hf297FullMatrixCounts,
  pass71Hf297FullMatrixKeys,
  pass71Hf297FullVisualKeys,
  pass71Hf297SourceCatalogAtSource,
} from './pass71-hf297-full-arms-matrix.mjs';

export const PASS71_HF297_FULL_ARMS_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-297',
  kind: 'pass71-hf297-first-person-arms-full-closure',
  contract: 'atomic-acres/pass71-hf297-first-person-arms-full-closure@1',
  feedbackId: 'HF-297',
  status: 'passed',
  coverageDisposition: 'literal-source-derived-cartesian-closure',
  closesFeedback: true,
  closingAuthority: true,
  ownerSubjectiveApproval: 'not-claimed',
});

export const PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF297_FULL_ARMS_EVIDENCE.evidenceId,
  kind: PASS71_HF297_FULL_ARMS_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS = Object.freeze({
  hip: Object.freeze([null]),
  ads: Object.freeze([null]),
  fire: Object.freeze([0]),
  reload: Object.freeze([0.18, 0.46, 0.78]),
  melee: Object.freeze([0.18, 0.42, 0.68]),
});

export const PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES = 32 * 1024 * 1024;
const CONTROL_CROP_WIDTH = 128;
const CONTROL_CROP_HEIGHT = 72;
const MAXIMUM_RAW_RGBA_SCANLINE_BYTES = (CONTROL_CROP_WIDTH * 4 + 1) * CONTROL_CROP_HEIGHT;
const MAXIMUM_LOSSLESS_CODEC_AND_CONTAINER_OVERHEAD_BYTES = 952;
export const PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES = MAXIMUM_RAW_RGBA_SCANLINE_BYTES
  + MAXIMUM_LOSSLESS_CODEC_AND_CONTAINER_OVERHEAD_BYTES;
const MAX_VISUAL_CELLS = 516;
const MAX_VISUAL_PNG_BASE64_BYTES = 4 * Math.ceil(PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES / 3)
  * MAX_VISUAL_CELLS;
const MAX_TELEMETRY_EVIDENCE_BASE64_BYTES = 4 * 1024 * 1024;
const MAX_TELEMETRY_KEY_BASE64_BYTES = 512 * 1024;
const MAX_NON_PAYLOAD_JSON_BYTES = 2 * 1024 * 1024;
const WORST_CASE_ENCODED_ENVELOPE_BYTES = MAX_VISUAL_PNG_BASE64_BYTES
  + MAX_TELEMETRY_EVIDENCE_BASE64_BYTES + MAX_TELEMETRY_KEY_BASE64_BYTES
  + MAX_NON_PAYLOAD_JSON_BYTES;
export const PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY = Object.freeze({
  encoding: 'utf8-minified-json-one-trailing-lf',
  maximumEncodedRecordBytes: PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES,
  controlCropWidth: CONTROL_CROP_WIDTH,
  controlCropHeight: CONTROL_CROP_HEIGHT,
  maximumRawRgbaScanlineBytes: MAXIMUM_RAW_RGBA_SCANLINE_BYTES,
  maximumLosslessCodecAndContainerOverheadBytes: MAXIMUM_LOSSLESS_CODEC_AND_CONTAINER_OVERHEAD_BYTES,
  maximumVisualCells: MAX_VISUAL_CELLS,
  maximumPngBytesPerCell: PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES,
  maximumVisualPngBase64Bytes: MAX_VISUAL_PNG_BASE64_BYTES,
  maximumTelemetryEvidenceBase64Bytes: MAX_TELEMETRY_EVIDENCE_BASE64_BYTES,
  maximumTelemetryKeyBase64Bytes: MAX_TELEMETRY_KEY_BASE64_BYTES,
  maximumNonPayloadJsonBytes: MAX_NON_PAYLOAD_JSON_BYTES,
  worstCaseEncodedEnvelopeBytes: WORST_CASE_ENCODED_ENVELOPE_BYTES,
  githubSingleFileBoundaryBytes: 100 * 1024 * 1024,
});

if (WORST_CASE_ENCODED_ENVELOPE_BYTES > PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES) {
  throw new Error('HF-297 configured record envelope exceeds its strict record cap');
}

export function pass71Hf297FullVisualCrop(viewport) {
  const width = Math.min(PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.controlCropWidth, viewport.width);
  const height = Math.min(PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.controlCropHeight, viewport.height);
  return Object.freeze({
    x: Math.floor((viewport.width - width) / 2),
    y: Math.max(0, viewport.height - height - Math.min(108, Math.floor(viewport.height * 0.2))),
    width,
    height,
    policy: 'deterministic-centre-lower-lossless-attribution-control-v1',
  });
}

export const PASS71_HF297_FULL_ARMS_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf297-full-arms-evidence.mjs',
  contract: 'scripts/qa/pass71-hf297-full-arms-evidence-contract.mjs',
  contractTypes: 'scripts/qa/pass71-hf297-full-arms-evidence-contract.d.mts',
  contractTest: 'scripts/qa/pass71-hf297-full-arms-evidence-contract.test.mjs',
  matrix: 'scripts/qa/pass71-hf297-full-arms-matrix.mjs',
  matrixTypes: 'scripts/qa/pass71-hf297-full-arms-matrix.d.mts',
  matrixTest: 'scripts/qa/pass71-hf297-full-arms-matrix.test.mjs',
  browserSpec: 'tests/e2e/pass71-hf297-full-arms-matrix.spec.ts',
  releaseIntegrationTest: 'src/pass71-hf297-full-arms-release-evidence.test.ts',
  partialContract: 'scripts/qa/pass71-hf297-arms-evidence-contract.mjs',
  partialBrowserSpec: 'tests/e2e/pass71-hf297-arms-visual.spec.ts',
  weaponPresentation: 'src/weapon-presentation.ts',
  weaponPresentationState: 'src/weapon-presentation-state.ts',
  runtimeComposition: 'src/legacy-main.ts',
  renderRuntime: 'src/rendering/render-runtime.ts',
  ownerFeedback: PASS71_HF297_SOURCE_CATALOG_PATHS.ownerFeedback,
  protocol: PASS71_HF297_SOURCE_CATALOG_PATHS.protocol,
  weaponCatalog: PASS71_HF297_SOURCE_CATALOG_PATHS.weaponCatalog,
  adsSightProfiles: PASS71_HF297_SOURCE_CATALOG_PATHS.adsSightProfiles,
  gameplay: PASS71_HF297_SOURCE_CATALOG_PATHS.gameplay,
  firearmActions: PASS71_HF297_SOURCE_CATALOG_PATHS.firearmAuthoredActions,
  knifeActions: PASS71_HF297_SOURCE_CATALOG_PATHS.knifeAuthoredActions,
  peerSupport: 'tests/e2e/pass66-e2e-support.ts',
  edgeIdentity: 'scripts/qa/pass71-edge-executable-identity.mjs',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  playwrightConfig: 'playwright.config.ts',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KEY_SEPARATOR = '\u001f';
const NETWORK_ROLE = Object.freeze({ solo: 'offline', 'host-local': 'host', 'guest-local': 'client' });

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!object(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function sameJson(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function exactKeys(value, keys, label, failures) {
  if (!object(value) || !sameJson(Object.keys(value).sort(), [...keys].sort())) {
    failures.push(`${label}:schema-fields`);
    return false;
  }
  return true;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function finiteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(finite);
}

function distance(left, right) {
  return Math.hypot(...left.map((value, index) => value - right[index]));
}

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function gitShow(repositoryRoot, sourceSha, path) {
  return execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
  });
}

export function pass71Hf297FullArmsCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-297 full-arms evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf297FullArmsRecordSha256(record) {
  return sha256(pass71Hf297FullArmsCanonicalBytes(record));
}

export function pass71Hf297FullArmsEncodedRecordBytes(record) {
  return Buffer.byteLength(`${JSON.stringify(record)}\n`, 'utf8');
}

export function pass71Hf297FullArmsTelemetryCellSha256(cell) {
  return sha256(Buffer.from(`${JSON.stringify(canonicalValue(cell))}\n`, 'utf8'));
}

export function pass71Hf297FullArmsToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (typeof repositoryRoot !== 'string' || !SHA40.test(sourceSha ?? '')) {
    throw new Error('HF-297 full-arms tooling hashes require a repository root and exact source SHA');
  }
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF297_FULL_ARMS_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256(gitShow(repositoryRoot, sourceSha, path))],
  )));
}

export function pass71Hf297FullArmsSourceTreeAtSource(repositoryRoot, sourceSha) {
  if (typeof repositoryRoot !== 'string' || !SHA40.test(sourceSha ?? '')) {
    throw new Error('HF-297 full-arms source tree requires a repository root and exact source SHA');
  }
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

export function pass71Hf297FullArmsCoverage(catalog) {
  const targets = pass71Hf297ActionTargets(catalog);
  const counts = pass71Hf297FullMatrixCounts(catalog);
  return Object.freeze({
    ledgerClaim: catalog.feedbackClaim,
    arena: 'gun-range',
    renderProfile: 'blender',
    sourceDerivedCatalog: Object.freeze({
      weapons: catalog.weaponIds,
      weaponCount: catalog.weaponIds.length,
      controllerActions: catalog.controllerActions,
      firearmActions: Object.freeze(['hip', 'ads', 'fire', 'reload']),
      knifeActions: Object.freeze(['melee']),
      fullscreenOpticWeapons: catalog.fullscreenOpticWeapons,
      actionTargetCount: targets.length,
    }),
    cartesian: Object.freeze({
      renderers: PASS71_HF297_FULL_RENDERERS,
      localRoles: PASS71_HF297_FULL_LOCAL_ROLES,
      viewports: PASS71_HF297_FULL_VIEWPORTS,
      poseStates: PASS71_HF297_FULL_POSE_STATES,
      exactTelemetryCells: counts.telemetryCells,
      exactRuntimeScopes: counts.runtimeScopes,
    }),
    actionSamples: PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS,
    visualAttribution: Object.freeze({
      exactEmbeddedLosslessPngCells: counts.embeddedVisualCells,
      policy: 'deterministic-128x72-centre-lower-lossless-attribution-control-crops-for-all-source-derived-action-targets-at-native-catalog-frame-plus-m4a1-fire-pistol-reload-field-knife-melee-across-full-cartesian-matrix',
      binding: 'explicit-cell-key-source-sha-presented-frame-and-recomputed-telemetry-cell-sha256',
      recordSizePolicy: PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY,
    }),
    invariants: Object.freeze({
      arms: 'authored-two-chain-thirty-finger-bones-opaque-depth-writing-adult-segments-bent-elbows',
      grip: 'right-grip-socket-left-support-socket-or-right-wrist-knife-plus-left-defensive-guard',
      crop: 'combined-arms-ndc-min-y-at-most-minus-1.2-and-each-branch-at-most-minus-1.05',
      nearPlane: 'finite-near-plane-clear-intersecting-arms-and-active-weapon-or-knife-at-least-0.1m',
      fullscreenOpticException: 'source-derived-ads-only-structural-suppression-with-null-effective-framing',
      contact: 'signed-floor-contact-every-cell-and-obstacle-contact-with-positive-retreat-and-lift-in-prone-contact',
      fireIdentity: 'production-principal-camera-presentation-muzzle-projectile-and-read-only-hit-identities',
    }),
    closureBoundary: 'mechanical native installed-Edge closure on exact staged candidate A; owner subjective aesthetic approval and physical mobile devices are not claimed',
  });
}

function embeddedKeys(keys) {
  const bytes = Buffer.from(`${[...keys].sort().join('\n')}\n`, 'utf8');
  return {
    keyEncoding: 'gzip-base64-sorted-utf8-lines',
    keyByteLength: bytes.length,
    keysGzipBase64: gzipSync(bytes, { level: 9 }).toString('base64'),
  };
}

function embeddedEvidence(value) {
  const bytes = Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
  return {
    evidenceEncoding: 'gzip-base64-canonical-json',
    evidenceByteLength: bytes.length,
    evidenceGzipBase64: gzipSync(bytes, { level: 9 }).toString('base64'),
    evidenceSha256: sha256(bytes),
  };
}

export function createPass71Hf297FullArmsEmbeddedMatrix(cells, catalog) {
  const expectedKeys = pass71Hf297FullMatrixKeys(catalog);
  const keys = cells.map((cell) => cell?.key);
  const failures = pass71Hf297FullExactSetFailures(keys, expectedKeys, 'telemetry-matrix');
  if (failures.length > 0) throw new Error(`HF-297 telemetry exact set failed: ${failures.join(', ')}`);
  const ordered = [...cells].sort((left, right) => left.key.localeCompare(right.key));
  return Object.freeze({
    count: expectedKeys.length,
    keySha256: pass71Hf297FullKeyDigest(expectedKeys),
    ...embeddedKeys(expectedKeys),
    ...embeddedEvidence(ordered),
  });
}

function decodeEmbeddedKeys(value, label, failures) {
  try {
    if (!object(value) || value.keyEncoding !== 'gzip-base64-sorted-utf8-lines'
      || !Number.isSafeInteger(value.keyByteLength) || value.keyByteLength <= 0
      || typeof value.keysGzipBase64 !== 'string' || !BASE64.test(value.keysGzipBase64)) throw new Error('schema');
    const compressed = Buffer.from(value.keysGzipBase64, 'base64');
    if (compressed.toString('base64') !== value.keysGzipBase64) throw new Error('canonical-base64');
    const bytes = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
    if (bytes.length !== value.keyByteLength) throw new Error('byte-length');
    const text = bytes.toString('utf8');
    if (!text.endsWith('\n')) throw new Error('line-termination');
    const keys = text.slice(0, -1).split('\n');
    if (!sameJson(keys, [...keys].sort())) throw new Error('sort-order');
    return keys;
  } catch {
    failures.push(`${label}:embedded-key-set`);
    return [];
  }
}

function decodeEmbeddedEvidence(value, label, failures) {
  try {
    if (!object(value) || value.evidenceEncoding !== 'gzip-base64-canonical-json'
      || !Number.isSafeInteger(value.evidenceByteLength) || value.evidenceByteLength <= 0
      || !SHA256.test(value.evidenceSha256 ?? '') || typeof value.evidenceGzipBase64 !== 'string'
      || !BASE64.test(value.evidenceGzipBase64)) throw new Error('schema');
    const compressed = Buffer.from(value.evidenceGzipBase64, 'base64');
    if (compressed.toString('base64') !== value.evidenceGzipBase64) throw new Error('canonical-base64');
    const bytes = gunzipSync(compressed, { maxOutputLength: 512 * 1024 * 1024 });
    if (bytes.length !== value.evidenceByteLength || sha256(bytes) !== value.evidenceSha256) throw new Error('bytes');
    const decoded = JSON.parse(bytes.toString('utf8'));
    const canonicalBytes = Buffer.from(`${JSON.stringify(canonicalValue(decoded))}\n`, 'utf8');
    if (!bytes.equals(canonicalBytes)) throw new Error('canonical-json');
    return decoded;
  } catch {
    failures.push(`${label}:embedded-evidence`);
    return null;
  }
}

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(expected?.sourceSha ?? '')
    || source.expectedSourceSha !== expected.sourceSha || source.checkoutSourceSha !== expected.sourceSha
    || source.endingCheckoutSourceSha !== expected.sourceSha || source.sourceTreeSha !== expected.sourceTreeSha
    || !SHA40.test(source.sourceTreeSha ?? '') || source.releasePass !== 'PASS 71'
    || source.cleanBefore !== true || source.cleanAfter !== true) failures.push('exact-clean-candidate-a-source');
}

function validateServedCandidate(candidate, expected, failures) {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], 'servedCandidate', failures);
  if (!object(candidate) || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.sourceSha !== expected?.sourceSha
    || candidate.path !== 'channels/the-big-one' || !SHA256.test(candidate.treeSha256 ?? '')
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2) {
    failures.push('exact-staged-candidate-a');
  }
}

function validateBrowser(browser, failures) {
  exactKeys(browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'productVersion',
    'installRoot', 'authenticodeStatus', 'authenticodeSigner', 'isolation',
  ], 'browser', failures);
  if (!object(browser) || browser.channel !== 'msedge' || browser.installed !== true
    || browser.executableName !== 'msedge.exe' || !SHA256.test(browser.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(browser.productVersion ?? '')
    || !/[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(browser.installRoot ?? '')
    || browser.authenticodeStatus !== 'Valid' || !/\bMicrosoft Corporation\b/iu.test(browser.authenticodeSigner ?? '')
    || browser.isolation !== 'one-owned-signed-edge-process-with-fresh-contexts-per-renderer-role') {
    failures.push('installed-signed-edge-identity');
  }
}

function runtimeScopeKey(value) {
  return `${value?.renderer}${KEY_SEPARATOR}${value?.role}`;
}

function validateRuntimeScopes(scopes, browser, failures) {
  const expectedKeys = PASS71_HF297_FULL_RENDERERS.flatMap((renderer) => (
    PASS71_HF297_FULL_LOCAL_ROLES.map((role) => `${renderer}${KEY_SEPARATOR}${role}`)
  ));
  if (!Array.isArray(scopes)) {
    failures.push('runtime-scopes:not-array');
    return;
  }
  failures.push(...pass71Hf297FullExactSetFailures(scopes.map(runtimeScopeKey), expectedKeys, 'runtime-scopes'));
  for (const [index, scope] of scopes.entries()) {
    const label = `runtime-scope:${index}`;
    exactKeys(scope, ['renderer', 'role', 'networkRole', 'browserVersion', 'userAgent', 'runtime'], label, failures);
    const renderer = scope?.renderer;
    const role = scope?.role;
    const runtime = scope?.runtime;
    exactKeys(runtime, [
      'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
      'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
    ], `${label}:runtime`, failures);
    const expectedAdapter = renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext';
    const expectedDevice = renderer === 'webgpu' ? 'GPUDevice' : null;
    const expectedPresentation = renderer === 'webgpu' ? 'healthy' : 'synchronous';
    if (!PASS71_HF297_FULL_RENDERERS.includes(renderer) || !PASS71_HF297_FULL_LOCAL_ROLES.includes(role)
      || scope.networkRole !== NETWORK_ROLE[role] || scope.browserVersion !== browser?.productVersion
      || !new RegExp(`Edg/${String(browser?.productVersion).replaceAll('.', '\\.')}`).test(scope.userAgent ?? '')
      || !object(runtime) || runtime.requestedBackend !== renderer || runtime.actualBackend !== renderer
      || runtime.initialized !== true || runtime.adapterClass !== expectedAdapter || runtime.deviceClass !== expectedDevice
      || typeof runtime.adapterLabel !== 'string' || runtime.adapterLabel.length === 0
      || SOFTWARE_ADAPTER.test(runtime.adapterLabel) || runtime.softwareAdapter !== false
      || runtime.deviceLost !== false || runtime.uncapturedErrors !== 0
      || runtime.presentationStatus !== expectedPresentation) failures.push(`${label}:native-runtime-or-role`);
  }
}

function validFraming(value, minimumNdcY = null) {
  return exactKeys(value, [
    'finite', 'nearPlaneClear', 'intersectsViewport', 'fullyInsideViewport',
    'ndcMin', 'ndcMax', 'nearestDepth',
  ], 'framing', [])
    && value.finite === true && value.nearPlaneClear === true && value.intersectsViewport === true
    && typeof value.fullyInsideViewport === 'boolean' && finiteVector(value.ndcMin, 2)
    && finiteVector(value.ndcMax, 2) && finite(value.nearestDepth) && value.nearestDepth >= 0.1
    && (minimumNdcY === null || value.ndcMin[1] <= minimumNdcY);
}

function validateSleeves(sleeves) {
  if (!Array.isArray(sleeves) || sleeves.length !== 2) return false;
  for (const side of ['left', 'right']) {
    const sleeve = sleeves.find((entry) => entry?.side === side);
    if (!exactKeys(sleeve, [
      'side', 'contract', 'parent', 'materialKind', 'authoredSleeveMaterial', 'opaque',
    ], `sleeve:${side}`, []) || sleeve.contract !== 'shoulder-bound-authored-pbr-lower-crop-continuation-v1'
      || typeof sleeve.parent !== 'string' || sleeve.parent.length === 0
      || sleeve.materialKind !== 'MeshStandardMaterial' || sleeve.authoredSleeveMaterial !== true
      || sleeve.opaque !== true) return false;
  }
  return true;
}

function validateArmGeometry(arm) {
  if (!finiteVector(arm?.shoulder, 3) || !finiteVector(arm?.elbow, 3)
    || !finiteVector(arm?.wrist, 3) || !finiteVector(arm?.palm, 3)
    || !finite(arm.upperLength) || !finite(arm.lowerLength) || !finite(arm.elbowFlexRadians)) return false;
  const upperLength = distance(arm.shoulder, arm.elbow);
  const lowerLength = distance(arm.elbow, arm.wrist);
  const shoulderDirection = arm.shoulder.map((value, index) => value - arm.elbow[index]);
  const wristDirection = arm.wrist.map((value, index) => value - arm.elbow[index]);
  const dot = shoulderDirection.reduce((sum, value, index) => sum + value * wristDirection[index], 0);
  const elbowAngle = Math.acos(Math.max(-1, Math.min(1, dot / Math.max(upperLength * lowerLength, 1e-9))));
  const elbowFlex = Math.PI - elbowAngle;
  const ratio = upperLength / lowerLength;
  return Math.abs(arm.upperLength - upperLength) <= 1e-6
    && Math.abs(arm.lowerLength - lowerLength) <= 1e-6
    && Math.abs(arm.elbowFlexRadians - elbowFlex) <= 1e-5
    && upperLength >= 0.18 && upperLength <= 0.9 && lowerLength >= 0.18 && lowerLength <= 0.9
    && ratio >= 0.5 && ratio <= 2 && elbowFlex >= 0.36 && elbowFlex < 2.9;
}

function validateFirearmArms(arms) {
  if (!Array.isArray(arms) || arms.length !== 2) return false;
  for (const side of ['left', 'right']) {
    const arm = arms.find((entry) => entry?.side === side);
    if (!exactKeys(arm, [
      'side', 'mode', 'active', 'socket', 'contactRole', 'shoulder', 'elbow', 'wrist', 'palm',
      'upperLength', 'lowerLength', 'elbowFlexRadians', 'meaningfulElbowBend',
      'contactError', 'wristContactError', 'palmOrientationError', 'socketReachRatio',
      'gripSocketCalibration', 'segmentLengthScale', 'withinStableReach',
      'authoredSegmentDirectionsPreserved', 'bindOffsetsPreserved', 'finite',
      'poseChainContract', 'shoulderEntryPolicy', 'shoulderEntryNdc',
    ], `firearm-arm:${side}`, []) || arm.mode !== 'firearm' || arm.active !== true
      || arm.socket !== (side === 'right' ? 'grip-socket-r' : 'support-socket-l')
      || arm.contactRole !== (side === 'right' ? 'dominant-grip' : 'bilateral-support')
      || !validateArmGeometry(arm) || arm.meaningfulElbowBend !== true
      || !finite(arm.contactError) || arm.contactError > 0.02
      || !finite(arm.wristContactError) || arm.wristContactError > 0.02
      || !finite(arm.palmOrientationError) || arm.palmOrientationError > 0.2
      || !finite(arm.socketReachRatio) || arm.socketReachRatio > 1.04
      || !finite(arm.gripSocketCalibration) || arm.gripSocketCalibration > 0.01
      || arm.segmentLengthScale !== 1 || arm.withinStableReach !== true
      || arm.authoredSegmentDirectionsPreserved !== true || arm.bindOffsetsPreserved !== true
      || arm.finite !== true || arm.poseChainContract !== 'authored-palm-full-transform-to-socket-frame-v2'
      || arm.shoulderEntryPolicy !== 'camera-space-below-frame-continuation-v1'
      || !finiteVector(arm.shoulderEntryNdc, 2) || arm.shoulderEntryNdc[1] > -0.98) return false;
  }
  return true;
}

function validateKnifeArms(arms, progress) {
  if (!Array.isArray(arms) || arms.length !== 2) return false;
  for (const side of ['left', 'right']) {
    const arm = arms.find((entry) => entry?.side === side);
    if (!exactKeys(arm, [
      'side', 'mode', 'active', 'socket', 'contactRole', 'progress', 'shoulder', 'elbow', 'wrist',
      'palm', 'upperLength', 'lowerLength', 'elbowFlexRadians', 'meaningfulElbowBend',
      'shoulderBindDelta', 'elbowBindDelta', 'wristBindDelta', 'knifeAttachedToRightWrist',
      'guardArm', 'supportChainPolicy', 'supportChainScale', 'finite',
    ], `knife-arm:${side}`, []) || arm.mode !== 'knife' || arm.active !== true || arm.progress !== progress
      || arm.socket !== (side === 'right' ? 'right-wrist-knife-socket' : 'left-defensive-guard')
      || arm.contactRole !== (side === 'right' ? 'knife-grip' : 'defensive-guard')
      || !validateArmGeometry(arm) || arm.meaningfulElbowBend !== true
      || !finite(arm.shoulderBindDelta) || !finite(arm.elbowBindDelta) || !finite(arm.wristBindDelta)
      || arm.knifeAttachedToRightWrist !== (side === 'right') || arm.guardArm !== (side === 'left')
      || arm.supportChainPolicy !== (side === 'left' ? 'visible-defensive-guard-v2' : null)
      || (side === 'left' ? !finite(arm.supportChainScale) || arm.supportChainScale <= 0 : arm.supportChainScale !== null)
      || arm.finite !== true) return false;
  }
  return true;
}

function validateRig(rig, target, progress, suppressed) {
  if (!exactKeys(rig, [
    'armsSource', 'armMeshCount', 'authoredFingerBoneCount', 'armMaterials', 'armFraming',
    'armBranches', 'sleeveContinuations', 'arms', 'melee',
  ], 'rig', []) || rig.armsSource !== 'authored-two-chain'
    || !Number.isSafeInteger(rig.armMeshCount) || rig.armMeshCount < 1 || rig.authoredFingerBoneCount !== 30
    || !exactKeys(rig.armMaterials, [
      'contract', 'total', 'transparent', 'nonOpaque', 'depthWriteDisabled',
    ], 'rig:materials', []) || rig.armMaterials.contract !== 'opaque-depth-writing'
    || !Number.isSafeInteger(rig.armMaterials.total) || rig.armMaterials.total < 1
    || rig.armMaterials.transparent !== 0 || rig.armMaterials.nonOpaque !== 0
    || rig.armMaterials.depthWriteDisabled !== 0 || !validateSleeves(rig.sleeveContinuations)
    || !exactKeys(rig.armBranches, ['left', 'right'], 'rig:branches', [])) return false;
  if (suppressed) {
    if (rig.armFraming !== null || rig.armBranches.left !== null || rig.armBranches.right !== null) return false;
  } else if (!validFraming(rig.armFraming, -1.2)
    || !validFraming(rig.armBranches.left, -1.05) || !validFraming(rig.armBranches.right, -1.05)) return false;
  if (target.presentation === 'firearm') {
    return rig.melee === null && validateFirearmArms(rig.arms);
  }
  return exactKeys(rig.melee, [
    'meleeArmSource', 'knifeVisible', 'passiveKnifeVisible', 'knifeParent',
    'knifeGripError', 'knifeHandContactError',
  ], 'rig:melee', []) && rig.melee.meleeArmSource === 'authored-rigged-arms'
    && rig.melee.knifeVisible === true && rig.melee.passiveKnifeVisible === false
    && rig.melee.knifeParent === 'right-wrist-knife-socket'
    && finite(rig.melee.knifeGripError) && rig.melee.knifeGripError <= 0.001
    && finite(rig.melee.knifeHandContactError) && rig.melee.knifeHandContactError <= 0.015
    && validateKnifeArms(rig.arms, progress);
}

function validateAnimation(animation, action) {
  if (!exactKeys(animation, [
    'clips', 'activeAction', 'blendPolicy', 'trackPolicy', 'runtimeTracks', 'upperChainTracksExcluded',
  ], 'animation', []) || !Number.isSafeInteger(animation.clips) || animation.clips < 1
    || !Number.isSafeInteger(animation.runtimeTracks) || animation.runtimeTracks < 1
    || !Number.isSafeInteger(animation.upperChainTracksExcluded) || animation.upperChainTracksExcluded < 0
    || typeof animation.blendPolicy !== 'string' || animation.blendPolicy.length === 0
    || typeof animation.trackPolicy !== 'string' || animation.trackPolicy.length === 0) return false;
  if (action === 'reload') return ['reload', 'empty-reload'].includes(animation.activeAction);
  if (action === 'melee') return animation.activeAction === 'melee';
  return animation.activeAction === null || action === 'fire' && animation.activeAction === 'fire';
}

function validateFireIdentity(identity, weapon) {
  if (!exactKeys(identity, ['contract', 'weapon', 'camera', 'muzzle', 'projectile', 'hit'], 'fire-identity', [])
    || identity.contract !== 'hf296-camera-muzzle-projectile-hit-identity-v2' || identity.weapon !== weapon) return false;
  return exactKeys(identity.camera, ['identity', 'authority', 'origin', 'direction'], 'camera-identity', [])
    && identity.camera.identity === 'principal-first-person-camera'
    && identity.camera.authority === 'ballistic-origin-and-direction'
    && finiteVector(identity.camera.origin, 3) && finiteVector(identity.camera.direction, 3)
    && exactKeys(identity.muzzle, ['identity', 'authority', 'socket', 'position'], 'muzzle-identity', [])
    && typeof identity.muzzle.identity === 'string' && identity.muzzle.identity.startsWith(`${weapon}:`)
    && identity.muzzle.authority === 'presentation-only-tracer-origin' && identity.muzzle.socket === 'muzzle-socket'
    && finiteVector(identity.muzzle.position, 3)
    && exactKeys(identity.projectile, ['identity', 'authority', 'fireKind', 'pellets'], 'projectile-identity', [])
    && typeof identity.projectile.identity === 'string' && identity.projectile.identity.startsWith(`${weapon}:`)
    && typeof identity.projectile.authority === 'string' && identity.projectile.authority.length > 0
    && typeof identity.projectile.fireKind === 'string' && identity.projectile.fireKind.length > 0
    && Number.isSafeInteger(identity.projectile.pellets) && identity.projectile.pellets >= 1
    && exactKeys(identity.hit, [
      'identity', 'authority', 'kind', 'id', 'distance', 'damageMultiplier', 'traceSurfaceIds',
    ], 'hit-identity', []) && typeof identity.hit.identity === 'string' && identity.hit.identity.length > 0
    && identity.hit.authority === 'production-castShot-read-only-probe'
    && typeof identity.hit.kind === 'string' && identity.hit.kind.length > 0
    && typeof identity.hit.id === 'string' && identity.hit.id.length > 0
    && finite(identity.hit.distance) && finite(identity.hit.damageMultiplier)
    && Array.isArray(identity.hit.traceSurfaceIds)
    && identity.hit.traceSurfaceIds.every((entry) => typeof entry === 'string');
}

function frozenFireIdentity(before, after) {
  return before.camera.identity === after.camera.identity
    && before.muzzle.identity === after.muzzle.identity
    && before.projectile.identity === after.projectile.identity
    && before.hit.identity === after.hit.identity
    && distance(before.camera.origin, after.camera.origin) <= 1e-8
    && distance(before.camera.direction, after.camera.direction) <= 1e-10;
}

function validateContact(contact, poseState) {
  if (!exactKeys(contact, [
    'authority', 'contactSources', 'signedContactDistances', 'sweepSources', 'surfaceRetreat', 'surfaceLift',
  ], 'contact', []) || contact.authority !== 'hf296-player-viewmodel-contact-sample-v2'
    || !Array.isArray(contact.contactSources) || !contact.contactSources.includes('world-floor')
    || !Array.isArray(contact.signedContactDistances)
    || contact.signedContactDistances.length !== contact.contactSources.length
    || contact.signedContactDistances.some((entry) => !finite(entry) || entry > 0.027)
    || !Array.isArray(contact.sweepSources)
    || !finite(contact.surfaceRetreat) || contact.surfaceRetreat < 0
    || !finite(contact.surfaceLift) || contact.surfaceLift < 0) return false;
  const obstacle = contact.contactSources.some((entry) => entry !== 'world-floor')
    || contact.sweepSources.some((entry) => entry !== 'world-floor');
  return poseState.contact
    ? obstacle && contact.surfaceRetreat > 0 && contact.surfaceLift > 0
    : !obstacle;
}

function validateSample(sample, target, expectedProgress, catalog) {
  if (!exactKeys(sample, [
    'progress', 'observedState', 'adsProgress', 'fireKick', 'shotsPresentedBefore',
    'shotsPresentedAfter', 'effectiveViewmodelVisible', 'fullscreenSuppression', 'rig',
    'weaponFraming', 'knifeFraming', 'animation', 'fireIdentityBefore', 'fireIdentityAfter',
  ], 'sample', []) || sample.progress !== expectedProgress || !finite(sample.adsProgress)
    || !finite(sample.fireKick) || !Number.isSafeInteger(sample.shotsPresentedBefore)
    || !Number.isSafeInteger(sample.shotsPresentedAfter)
    || !exactKeys(sample.fullscreenSuppression, [
      'contract', 'active', 'rootVisible', 'rootScale',
    ], 'sample:suppression', [])
    || sample.fullscreenSuppression.contract !== 'retained-structural-lights-fullscreen-suppression-v1') return false;
  const action = target.action;
  const expectedState = action === 'ads' ? 'ads' : action === 'reload' ? 'reload' : action === 'melee' ? 'melee' : 'hip';
  if (sample.observedState !== expectedState
    || action === 'ads' && sample.adsProgress < 0.98
    || action !== 'ads' && sample.adsProgress > 0.02
    || action === 'fire' && !(sample.fireKick > 0 && sample.shotsPresentedAfter > sample.shotsPresentedBefore)
    || action !== 'fire' && sample.shotsPresentedAfter !== sample.shotsPresentedBefore) return false;
  const suppressed = action === 'ads' && catalog.fullscreenOpticWeapons.includes(target.weapon);
  if (sample.effectiveViewmodelVisible !== !suppressed
    || sample.fullscreenSuppression.active !== suppressed || sample.fullscreenSuppression.rootVisible !== true
    || sample.fullscreenSuppression.rootScale !== (suppressed ? 0.0001 : 1)) return false;
  if (!validateRig(sample.rig, target, expectedProgress, suppressed) || !validateAnimation(sample.animation, action)) return false;
  if (suppressed) {
    if (sample.weaponFraming !== null || sample.knifeFraming !== null) return false;
  } else if (target.presentation === 'firearm') {
    if (!validFraming(sample.weaponFraming) || sample.knifeFraming !== null) return false;
  } else if (sample.weaponFraming !== null || !validFraming(sample.knifeFraming)) return false;
  if (action === 'fire') {
    return validateFireIdentity(sample.fireIdentityBefore, target.weapon)
      && validateFireIdentity(sample.fireIdentityAfter, target.weapon)
      && frozenFireIdentity(sample.fireIdentityBefore, sample.fireIdentityAfter);
  }
  return sample.fireIdentityBefore === null && sample.fireIdentityAfter === null;
}

function validateTelemetryCell(cell, catalog, failures, index) {
  const label = `telemetry:${index}`;
  exactKeys(cell, [
    'key', 'renderer', 'role', 'networkRole', 'viewport', 'poseState', 'weapon',
    'equippedWeapon', 'action', 'presentation', 'contact', 'samples',
  ], label, failures);
  const identity = pass71Hf297FullCellIdentity(cell?.key ?? '');
  const viewport = PASS71_HF297_FULL_VIEWPORTS.find((entry) => entry.id === cell?.viewport?.id);
  const poseState = PASS71_HF297_FULL_POSE_STATES.find((entry) => entry.id === cell?.poseState?.id);
  const target = pass71Hf297ActionTargets(catalog).find((entry) => (
    entry.weapon === cell?.weapon && entry.action === cell?.action
  ));
  if (!identity || !sameJson(identity, {
    renderer: cell?.renderer, role: cell?.role, viewportId: cell?.viewport?.id,
    poseStateId: cell?.poseState?.id, weapon: cell?.weapon, action: cell?.action,
  }) || !PASS71_HF297_FULL_RENDERERS.includes(cell?.renderer)
    || !PASS71_HF297_FULL_LOCAL_ROLES.includes(cell?.role) || cell?.networkRole !== NETWORK_ROLE[cell?.role]
    || !viewport || !sameJson(cell.viewport, viewport) || !poseState || !sameJson(cell.poseState, poseState)
    || !target || cell.equippedWeapon !== target.equippedWeapon || cell.presentation !== target.presentation
    || !validateContact(cell.contact, poseState)) failures.push(`${label}:identity-contact-or-target`);
  const progresses = PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS[cell?.action];
  if (!Array.isArray(cell?.samples) || !progresses || cell.samples.length !== progresses.length) {
    failures.push(`${label}:sample-count`);
  } else {
    cell.samples.forEach((sample, sampleIndex) => {
      if (!validateSample(sample, target, progresses[sampleIndex], catalog)) {
        failures.push(`${label}:sample:${sampleIndex}`);
      }
    });
  }
  return cell?.key;
}

function validateMatrix(matrix, catalog, failures) {
  exactKeys(matrix, ['telemetry'], 'matrix', failures);
  const telemetry = matrix?.telemetry;
  exactKeys(telemetry, [
    'count', 'keySha256', 'keyEncoding', 'keyByteLength', 'keysGzipBase64',
    'evidenceEncoding', 'evidenceByteLength', 'evidenceGzipBase64', 'evidenceSha256',
  ], 'matrix:telemetry', failures);
  const expectedKeys = pass71Hf297FullMatrixKeys(catalog);
  const decodedKeys = decodeEmbeddedKeys(telemetry, 'matrix:telemetry', failures);
  const cells = decodeEmbeddedEvidence(telemetry, 'matrix:telemetry', failures);
  const evidenceKeys = Array.isArray(cells)
    ? cells.map((cell, index) => validateTelemetryCell(cell, catalog, failures, index)) : [];
  if (!object(telemetry) || telemetry.count !== expectedKeys.length
    || telemetry.keySha256 !== pass71Hf297FullKeyDigest(expectedKeys)
    || pass71Hf297FullExactSetFailures(decodedKeys, expectedKeys, 'matrix:telemetry').length > 0
    || pass71Hf297FullExactSetFailures(evidenceKeys, expectedKeys, 'matrix:telemetry:evidence').length > 0
    || pass71Hf297FullKeyDigest(decodedKeys) !== telemetry.keySha256
    || !sameJson([...decodedKeys].sort(), [...evidenceKeys].sort())) {
    failures.push('matrix:telemetry:exact-set-or-evidence');
  }
  return Array.isArray(cells) ? new Map(cells.map((cell) => [cell.key, cell])) : new Map();
}

function validateVisualAttachments(attachments, catalog, sourceSha, telemetryCells, failures) {
  if (!Array.isArray(attachments)) {
    failures.push('visual-attachments:not-array');
    return;
  }
  const expectedKeys = pass71Hf297FullVisualKeys(catalog);
  failures.push(...pass71Hf297FullExactSetFailures(
    attachments.map((attachment) => attachment?.key), expectedKeys, 'visual-attachments',
  ));
  for (const [index, attachment] of attachments.entries()) {
    const label = `visual:${index}`;
    exactKeys(attachment, [
      'key', 'renderer', 'role', 'viewportId', 'poseStateId', 'weapon', 'action',
      'sourceSha', 'presentedFrame', 'presentationStatus', 'submissionSequence', 'completedSequence',
      'telemetryCellSha256',
      'viewportWidth', 'viewportHeight', 'cropX', 'cropY', 'cropWidth', 'cropHeight', 'cropPolicy',
      'mimeType', 'encoding', 'byteLength', 'width', 'height', 'sha256', 'pngBase64',
    ], label, failures);
    const identity = pass71Hf297FullCellIdentity(attachment?.key ?? '');
    const viewport = PASS71_HF297_FULL_VIEWPORTS.find((entry) => entry.id === identity?.viewportId);
    const crop = viewport ? pass71Hf297FullVisualCrop(viewport) : null;
    let bytes = null;
    try {
      if (typeof attachment?.pngBase64 !== 'string' || !BASE64.test(attachment.pngBase64)) throw new Error('base64');
      bytes = Buffer.from(attachment.pngBase64, 'base64');
      if (bytes.toString('base64') !== attachment.pngBase64) throw new Error('canonical-base64');
    } catch {
      failures.push(`${label}:embedded-bytes`);
    }
    const cell = telemetryCells.get(attachment?.key);
    const presentationComplete = attachment?.renderer === 'webgpu'
      ? Number.isSafeInteger(attachment?.submissionSequence) && attachment.submissionSequence > 0
        && Number.isSafeInteger(attachment?.completedSequence)
        && attachment.completedSequence >= attachment.submissionSequence
      : attachment?.submissionSequence === 0 && attachment?.completedSequence === 0;
    if (!identity || !sameJson(identity, {
      renderer: attachment?.renderer, role: attachment?.role, viewportId: attachment?.viewportId,
      poseStateId: attachment?.poseStateId, weapon: attachment?.weapon, action: attachment?.action,
    }) || attachment.sourceSha !== sourceSha || !Number.isSafeInteger(attachment.presentedFrame)
      || attachment.presentedFrame < 1
      || attachment.presentationStatus !== (attachment.renderer === 'webgpu' ? 'healthy' : 'synchronous')
      || !presentationComplete
      || !cell || attachment.telemetryCellSha256 !== pass71Hf297FullArmsTelemetryCellSha256(cell)
      || attachment.viewportWidth !== viewport?.width || attachment.viewportHeight !== viewport?.height
      || attachment.cropX !== crop?.x || attachment.cropY !== crop?.y
      || attachment.cropWidth !== crop?.width || attachment.cropHeight !== crop?.height
      || attachment.cropPolicy !== crop?.policy
      || attachment.mimeType !== 'image/png' || attachment.encoding !== 'lossless-png-embedded-base64'
      || !bytes || bytes.length <= 24 || bytes.length > PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES
      || attachment.byteLength !== bytes.length
      || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || attachment.width !== crop?.width || attachment.height !== crop?.height
      || attachment.width !== bytes.readUInt32BE(16) || attachment.height !== bytes.readUInt32BE(20)
      || attachment.sha256 !== sha256(bytes)) failures.push(`${label}:identity-attribution-or-lossless-bytes`);
  }
}

function validateRecordSizeEnvelope(record, failures) {
  const visualBase64Bytes = Array.isArray(record?.visualAttachments)
    ? record.visualAttachments.reduce((total, attachment) => total + (
      typeof attachment?.pngBase64 === 'string' ? Buffer.byteLength(attachment.pngBase64, 'utf8') : 0
    ), 0) : 0;
  const evidenceBase64Bytes = typeof record?.matrix?.telemetry?.evidenceGzipBase64 === 'string'
    ? Buffer.byteLength(record.matrix.telemetry.evidenceGzipBase64, 'utf8') : 0;
  const keyBase64Bytes = typeof record?.matrix?.telemetry?.keysGzipBase64 === 'string'
    ? Buffer.byteLength(record.matrix.telemetry.keysGzipBase64, 'utf8') : 0;
  const encodedBytes = pass71Hf297FullArmsEncodedRecordBytes(record);
  const nonPayloadJsonBytes = encodedBytes - visualBase64Bytes - evidenceBase64Bytes - keyBase64Bytes;
  if (WORST_CASE_ENCODED_ENVELOPE_BYTES > PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES
    || !Array.isArray(record?.visualAttachments) || record.visualAttachments.length > MAX_VISUAL_CELLS
    || visualBase64Bytes > MAX_VISUAL_PNG_BASE64_BYTES
    || evidenceBase64Bytes > MAX_TELEMETRY_EVIDENCE_BASE64_BYTES
    || keyBase64Bytes > MAX_TELEMETRY_KEY_BASE64_BYTES
    || nonPayloadJsonBytes < 0 || nonPayloadJsonBytes > MAX_NON_PAYLOAD_JSON_BYTES
    || encodedBytes > PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES) failures.push('encoded-record-size-envelope');
}

export function pass71Hf297FullArmsEvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF297_FULL_ARMS_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF297_FULL_ARMS_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF297_FULL_ARMS_EVIDENCE.kind
    || record.contract !== PASS71_HF297_FULL_ARMS_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF297_FULL_ARMS_EVIDENCE.feedbackId
    || record.status !== PASS71_HF297_FULL_ARMS_EVIDENCE.status
    || record.coverageDisposition !== PASS71_HF297_FULL_ARMS_EVIDENCE.coverageDisposition
    || record.closesFeedback !== true || record.closingAuthority !== true
    || record.ownerSubjectiveApproval !== 'not-claimed') return ['hf297-full-identity-status-or-closure'];
  if (pass71Hf297FullArmsEncodedRecordBytes(record) > PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES) {
    return ['encoded-record-size-cap'];
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closesFeedback', 'closingAuthority', 'ownerSubjectiveApproval',
    'startedAt', 'completedAt', 'source', 'servedCandidate', 'environment', 'browser',
    'tooling', 'sourceCatalog', 'coverage', 'sizePolicy', 'runtimeScopes', 'matrix', 'visualAttachments',
    'faults', 'receiptSha256',
  ], 'record', failures);
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  validateBrowser(record.browser, failures);
  const toolingFields = Object.keys(PASS71_HF297_FULL_ARMS_TOOL_PATHS).map((name) => `${name}Sha256`).sort();
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingFields)
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) {
    failures.push('candidate-a-tooling-hashes');
  }
  if (!object(expected.catalog) || !sameJson(record.sourceCatalog, expected.catalog)) {
    failures.push('candidate-a-source-derived-catalog');
  }
  if (!object(expected.catalog) || !sameJson(record.coverage, pass71Hf297FullArmsCoverage(expected.catalog))) {
    failures.push('literal-full-coverage-contract');
  }
  if (!sameJson(record.sizePolicy, PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY)) failures.push('encoded-record-size-cap');
  validateRecordSizeEnvelope(record, failures);
  validateRuntimeScopes(record.runtimeScopes, record.browser, failures);
  const telemetryCells = object(expected.catalog)
    ? validateMatrix(record.matrix, expected.catalog, failures) : new Map();
  if (object(expected.catalog)) {
    validateVisualAttachments(
      record.visualAttachments, expected.catalog, expected.sourceSha, telemetryCells, failures,
    );
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf297FullArmsRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf297FullArmsEvidence(record, expected) {
  const failures = pass71Hf297FullArmsEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-297 full-arms evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf297FullArmsEvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR,
    closesFeedback: true,
    closingAuthority: true,
    validate(record, context) {
      try {
        const catalog = context?.options?.pass71Hf297FullSourceCatalog
          ?? pass71Hf297SourceCatalogAtSource(context?.repositoryRoot, context?.sourceSha);
        return pass71Hf297FullArmsEvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf297FullSourceTreeSha
            ?? pass71Hf297FullArmsSourceTreeAtSource(context?.repositoryRoot, context?.sourceSha),
          tooling: context?.options?.pass71Hf297FullTooling
            ?? pass71Hf297FullArmsToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha),
          catalog,
        });
      } catch (error) {
        return [`hf297-full-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY =
  createPass71Hf297FullArmsEvidenceRegistryEntry();

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
}));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function fixturePng(width, height) {
  const chunk = (type, data) => {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, checksum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) raw[row * stride] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function fixtureFraming() {
  return {
    finite: true, nearPlaneClear: true, intersectsViewport: true, fullyInsideViewport: false,
    ndcMin: [-0.7, -1.3], ndcMax: [0.8, 0.6], nearestDepth: 0.2,
  };
}

function fixtureFireIdentity(weapon) {
  return {
    contract: 'hf296-camera-muzzle-projectile-hit-identity-v2', weapon,
    camera: {
      identity: 'principal-first-person-camera', authority: 'ballistic-origin-and-direction',
      origin: [0, 1.6, 0], direction: [0, 0, -1],
    },
    muzzle: {
      identity: `${weapon}:fixture-model:muzzle-socket`, authority: 'presentation-only-tracer-origin',
      socket: 'muzzle-socket', position: [0.2, 1.4, -0.5],
    },
    projectile: {
      identity: `${weapon}:hitscan-principal-ray`, authority: 'castShot', fireKind: 'hitscan', pellets: 1,
    },
    hit: {
      identity: 'world-surface:fixture', authority: 'production-castShot-read-only-probe',
      kind: 'world-surface', id: 'fixture', distance: 10, damageMultiplier: 1, traceSurfaceIds: [],
    },
  };
}

function fixtureArm(side, mode, progress) {
  const shoulder = [side === 'left' ? -0.3 : 0.3, 1.3, 0];
  const elbow = [side === 'left' ? -0.45 : 0.45, 1.05, -0.18];
  const wrist = [side === 'left' ? -0.25 : 0.25, 0.78, -0.36];
  const palm = [wrist[0], wrist[1] - 0.04, wrist[2] - 0.04];
  const upperLength = distance(shoulder, elbow);
  const lowerLength = distance(elbow, wrist);
  const a = shoulder.map((value, index) => value - elbow[index]);
  const b = wrist.map((value, index) => value - elbow[index]);
  const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const elbowFlexRadians = Math.PI - Math.acos(dot / (upperLength * lowerLength));
  if (mode === 'knife') return {
    side, mode, active: true,
    socket: side === 'right' ? 'right-wrist-knife-socket' : 'left-defensive-guard',
    contactRole: side === 'right' ? 'knife-grip' : 'defensive-guard', progress,
    shoulder, elbow, wrist, palm, upperLength, lowerLength, elbowFlexRadians,
    meaningfulElbowBend: true, shoulderBindDelta: 0.2, elbowBindDelta: 0.3, wristBindDelta: 0.15,
    knifeAttachedToRightWrist: side === 'right', guardArm: side === 'left',
    supportChainPolicy: side === 'left' ? 'visible-defensive-guard-v2' : null,
    supportChainScale: side === 'left' ? 1 : null, finite: true,
  };
  return {
    side, mode, active: true, socket: side === 'right' ? 'grip-socket-r' : 'support-socket-l',
    contactRole: side === 'right' ? 'dominant-grip' : 'bilateral-support',
    shoulder, elbow, wrist, palm, upperLength, lowerLength, elbowFlexRadians,
    meaningfulElbowBend: true, contactError: 0.001, wristContactError: 0.001,
    palmOrientationError: 0.01, socketReachRatio: 0.8, gripSocketCalibration: 0.001,
    segmentLengthScale: 1, withinStableReach: true, authoredSegmentDirectionsPreserved: true,
    bindOffsetsPreserved: true, finite: true,
    poseChainContract: 'authored-palm-full-transform-to-socket-frame-v2',
    shoulderEntryPolicy: 'camera-space-below-frame-continuation-v1',
    shoulderEntryNdc: [side === 'left' ? -0.5 : 0.5, -1.1],
  };
}

function fixtureRig(target, progress, suppressed) {
  const knife = target.presentation === 'knife';
  return {
    armsSource: 'authored-two-chain', armMeshCount: 2, authoredFingerBoneCount: 30,
    armMaterials: {
      contract: 'opaque-depth-writing', total: 2, transparent: 0, nonOpaque: 0, depthWriteDisabled: 0,
    },
    armFraming: suppressed ? null : fixtureFraming(),
    armBranches: suppressed ? { left: null, right: null } : {
      left: { ...fixtureFraming(), ndcMin: [-0.9, -1.2] },
      right: { ...fixtureFraming(), ndcMin: [0.1, -1.2] },
    },
    sleeveContinuations: ['left', 'right'].map((side) => ({
      side, contract: 'shoulder-bound-authored-pbr-lower-crop-continuation-v1',
      parent: side === 'left' ? 'UpperArmL' : 'UpperArmR', materialKind: 'MeshStandardMaterial',
      authoredSleeveMaterial: true, opaque: true,
    })),
    arms: ['left', 'right'].map((side) => fixtureArm(side, knife ? 'knife' : 'firearm', progress)),
    melee: knife ? {
      meleeArmSource: 'authored-rigged-arms', knifeVisible: true, passiveKnifeVisible: false,
      knifeParent: 'right-wrist-knife-socket', knifeGripError: 0.0001, knifeHandContactError: 0.001,
    } : null,
  };
}

function fixtureSample(target, progress, catalog) {
  const suppressed = target.action === 'ads' && catalog.fullscreenOpticWeapons.includes(target.weapon);
  const fireIdentity = target.action === 'fire' ? fixtureFireIdentity(target.weapon) : null;
  return {
    progress,
    observedState: target.action === 'ads' ? 'ads'
      : target.action === 'reload' ? 'reload' : target.action === 'melee' ? 'melee' : 'hip',
    adsProgress: target.action === 'ads' ? 1 : 0,
    fireKick: target.action === 'fire' ? 1 : 0,
    shotsPresentedBefore: 4,
    shotsPresentedAfter: target.action === 'fire' ? 5 : 4,
    effectiveViewmodelVisible: !suppressed,
    fullscreenSuppression: {
      contract: 'retained-structural-lights-fullscreen-suppression-v1', active: suppressed,
      rootVisible: true, rootScale: suppressed ? 0.0001 : 1,
    },
    rig: fixtureRig(target, progress, suppressed),
    weaponFraming: suppressed || target.presentation === 'knife' ? null : fixtureFraming(),
    knifeFraming: target.presentation === 'knife' ? fixtureFraming() : null,
    animation: {
      clips: 13,
      activeAction: target.action === 'reload' ? 'reload' : target.action === 'melee' ? 'melee' : null,
      blendPolicy: 'authored-lower-chain-action-overlay-v1',
      trackPolicy: 'exclude-upper-chain-transforms-v1', runtimeTracks: 120, upperChainTracksExcluded: 18,
    },
    fireIdentityBefore: fireIdentity,
    fireIdentityAfter: fireIdentity,
  };
}

function fixtureTelemetryCells(catalog) {
  const targets = new Map(pass71Hf297ActionTargets(catalog).map((target) => (
    [`${target.weapon}${KEY_SEPARATOR}${target.action}`, target]
  )));
  return pass71Hf297FullMatrixKeys(catalog).map((key) => {
    const identity = pass71Hf297FullCellIdentity(key);
    const viewport = PASS71_HF297_FULL_VIEWPORTS.find((entry) => entry.id === identity.viewportId);
    const poseState = PASS71_HF297_FULL_POSE_STATES.find((entry) => entry.id === identity.poseStateId);
    const target = targets.get(`${identity.weapon}${KEY_SEPARATOR}${identity.action}`);
    const obstacle = poseState.contact;
    return {
      key, renderer: identity.renderer, role: identity.role, networkRole: NETWORK_ROLE[identity.role],
      viewport: { ...viewport }, poseState: { ...poseState }, weapon: target.weapon,
      equippedWeapon: target.equippedWeapon, action: target.action, presentation: target.presentation,
      contact: {
        authority: 'hf296-player-viewmodel-contact-sample-v2',
        contactSources: obstacle ? ['world-floor', 'fixture:wall'] : ['world-floor'],
        signedContactDistances: obstacle ? [0.02, 0.001] : [0.02],
        sweepSources: obstacle ? ['fixture:wall'] : [],
        surfaceRetreat: obstacle ? 0.3 : 0,
        surfaceLift: obstacle ? 0.14 : 0,
      },
      samples: PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS[target.action].map(
        (progress) => fixtureSample(target, progress, catalog),
      ),
    };
  });
}

export function createPass71Hf297FullArmsEvidenceFixture(options = {}) {
  const catalog = options.catalog;
  if (!object(catalog)) throw new Error('HF-297 full-arms fixture requires a source-derived catalog');
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'c'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(Object.keys(PASS71_HF297_FULL_ARMS_TOOL_PATHS).map(
    (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
  ));
  const cells = fixtureTelemetryCells(catalog);
  const cellMap = new Map(cells.map((cell) => [cell.key, cell]));
  const fixtureCropPng = fixturePng(
    PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.controlCropWidth,
    PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.controlCropHeight,
  );
  const visualAttachments = pass71Hf297FullVisualKeys(catalog).map((key, index) => {
    const identity = pass71Hf297FullCellIdentity(key);
    const viewport = PASS71_HF297_FULL_VIEWPORTS.find((entry) => entry.id === identity.viewportId);
    const crop = pass71Hf297FullVisualCrop(viewport);
    const png = fixtureCropPng;
    return {
      key, ...identity, sourceSha, presentedFrame: index + 1,
      presentationStatus: identity.renderer === 'webgpu' ? 'healthy' : 'synchronous',
      submissionSequence: identity.renderer === 'webgpu' ? index + 1 : 0,
      completedSequence: identity.renderer === 'webgpu' ? index + 1 : 0,
      telemetryCellSha256: pass71Hf297FullArmsTelemetryCellSha256(cellMap.get(key)),
      viewportWidth: viewport.width, viewportHeight: viewport.height,
      cropX: crop.x, cropY: crop.y, cropWidth: crop.width, cropHeight: crop.height,
      cropPolicy: crop.policy,
      mimeType: 'image/png', encoding: 'lossless-png-embedded-base64', byteLength: png.length,
      width: crop.width, height: crop.height, sha256: sha256(png), pngBase64: png.toString('base64'),
    };
  });
  const browser = {
    channel: 'msedge', installed: true, executableName: 'msedge.exe', executableSha256: 'd'.repeat(64),
    productVersion: '151.0.4129.72', installRoot: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
    authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Microsoft Corporation',
    isolation: 'one-owned-signed-edge-process-with-fresh-contexts-per-renderer-role',
  };
  const record = {
    ...PASS71_HF297_FULL_ARMS_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T21:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T23:00:00.000Z',
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      sourceTreeSha, releasePass: 'PASS 71', cleanBefore: true, cleanAfter: true,
    },
    servedCandidate: {
      schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
      path: 'channels/the-big-one', treeSha256: 'b'.repeat(64), exactRootFileCount: 500,
    },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser,
    tooling: { ...tooling },
    sourceCatalog: JSON.parse(JSON.stringify(catalog)),
    coverage: JSON.parse(JSON.stringify(pass71Hf297FullArmsCoverage(catalog))),
    sizePolicy: { ...PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY },
    runtimeScopes: PASS71_HF297_FULL_RENDERERS.flatMap((renderer) => (
      PASS71_HF297_FULL_LOCAL_ROLES.map((role) => ({
        renderer, role, networkRole: NETWORK_ROLE[role], browserVersion: browser.productVersion,
        userAgent: `Mozilla/5.0 Edg/${browser.productVersion}`,
        runtime: {
          requestedBackend: renderer, actualBackend: renderer, initialized: true,
          adapterClass: renderer === 'webgpu' ? 'GPUAdapter' : 'WebGL2RenderingContext',
          deviceClass: renderer === 'webgpu' ? 'GPUDevice' : null,
          adapterLabel: 'NVIDIA GeForce RTX 5080', softwareAdapter: false,
          deviceLost: false, uncapturedErrors: 0,
          presentationStatus: renderer === 'webgpu' ? 'healthy' : 'synchronous',
        },
      }))
    )),
    matrix: { telemetry: createPass71Hf297FullArmsEmbeddedMatrix(cells, catalog) },
    visualAttachments,
    faults: [],
  };
  record.receiptSha256 = pass71Hf297FullArmsRecordSha256(record);
  return record;
}
