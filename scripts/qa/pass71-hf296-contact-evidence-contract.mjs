import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  PASS71_HF296_ACTIONS,
  PASS71_HF296_ARENAS,
  PASS71_HF296_FIXTURES,
  PASS71_HF296_LOCAL_KEY_SHA256,
  PASS71_HF296_LOCAL_KEYS,
  PASS71_HF296_LOCAL_ROLES,
  PASS71_HF296_MATRIX_COUNTS,
  PASS71_HF296_REMOTE_KEY_SHA256,
  PASS71_HF296_REMOTE_KEYS,
  PASS71_HF296_REMOTE_ROLES,
  PASS71_HF296_STANCES,
  PASS71_HF296_VISUAL_ACTION,
  PASS71_HF296_VISUAL_KEY_SHA256,
  PASS71_HF296_VISUAL_KEYS,
  PASS71_HF296_VISUAL_WEAPON,
  PASS71_HF296_WEAPONS,
  pass71Hf296ExactSetFailures,
  pass71Hf296KeyDigest,
  pass71Hf296LocalKey,
  pass71Hf296RemoteKey,
  pass71Hf296VisualKey,
} from './pass71-hf296-full-matrix.mjs';

export const PASS71_HF296_CONTACT_EVIDENCE = Object.freeze({
  schemaVersion: 2,
  evidenceId: 'HF-296',
  kind: 'pass71-hf296-player-viewmodel-contact-component',
  contract: 'atomic-acres/pass71-hf296-player-viewmodel-contact-closure@2',
  feedbackId: 'HF-296',
  status: 'passed',
  coverageDisposition: 'full-executable-matrix',
  closesFeedback: true,
});

// The acceptance registry freezes this four-field descriptor schema. Closure
// semantics therefore live on both the registry entry and the strict record.
export const PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF296_CONTACT_EVIDENCE.evidenceId,
  kind: PASS71_HF296_CONTACT_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF296_VISUAL_SOURCE_VIEWPORT = Object.freeze({ width: 960, height: 540 });
export const PASS71_HF296_VISUAL_CROP = Object.freeze({ x: 400, y: 396, width: 160, height: 90 });
export const PASS71_HF296_MAX_VISUAL_BYTES = 64 * 1024;
export const PASS71_HF296_MAX_RECORD_JSON_BYTES = 24 * 1024 * 1024;

export const PASS71_HF296_CONTACT_COVERAGE = Object.freeze({
  ledgerClaim: 'every arena/stance/firearm/solo-host-guest; floors/walls/diagonals/corners/door-returns; every action; camera-muzzle-projectile-hit identity',
  execution: Object.freeze({
    browser: 'installed-authenticode-valid-microsoft-edge',
    topology: 'owned-fresh-pass71-staged-candidate-a',
    renderer: 'webgl2',
    renderProfile: 'blender',
    batching: 'page-side-action-and-contact-loop-with-node-only-lossless-captures',
  }),
  composedFoundations: Object.freeze({
    bodyContact: 'shipped Rapier capsule and signed debugContactSnapshot authority',
    viewmodelContact: 'shipped contact-probe/retreat and framing telemetry',
    weaponCatalog: 'shipped all-weapon authored near-plane runner contract',
    multiplayer: 'shipped owned PeerJS topology support and remote operator projection',
  }),
  localMatrix: Object.freeze({
    arenas: PASS71_HF296_ARENAS,
    stances: PASS71_HF296_STANCES,
    weapons: PASS71_HF296_WEAPONS,
    roles: PASS71_HF296_LOCAL_ROLES,
    fixtures: PASS71_HF296_FIXTURES,
    actions: PASS71_HF296_ACTIONS,
    exactCells: PASS71_HF296_MATRIX_COUNTS.local,
    exactKeySha256: PASS71_HF296_LOCAL_KEY_SHA256,
  }),
  remoteProjectionMatrix: Object.freeze({
    arenas: PASS71_HF296_ARENAS,
    stances: PASS71_HF296_STANCES,
    weapons: PASS71_HF296_WEAPONS,
    roles: PASS71_HF296_REMOTE_ROLES,
    fixtures: PASS71_HF296_FIXTURES,
    actionDimension: 'not-applicable:remote state projects weapon/stance/pose; action authority remains local',
    exactCells: PASS71_HF296_MATRIX_COUNTS.remote,
    exactKeySha256: PASS71_HF296_REMOTE_KEY_SHA256,
  }),
  visualMatrix: Object.freeze({
    arenas: PASS71_HF296_ARENAS,
    stances: PASS71_HF296_STANCES,
    roles: PASS71_HF296_LOCAL_ROLES,
    fixtures: PASS71_HF296_FIXTURES,
    representativeWeapon: PASS71_HF296_VISUAL_WEAPON,
    representativeAction: PASS71_HF296_VISUAL_ACTION,
    exactLosslessPngCells: PASS71_HF296_MATRIX_COUNTS.visual,
    exactKeySha256: PASS71_HF296_VISUAL_KEY_SHA256,
    sourceViewport: PASS71_HF296_VISUAL_SOURCE_VIEWPORT,
    crop: PASS71_HF296_VISUAL_CROP,
    maxBytesPerPng: PASS71_HF296_MAX_VISUAL_BYTES,
    maxCompleteRecordJsonBytes: PASS71_HF296_MAX_RECORD_JSON_BYTES,
    attachmentPolicy: 'manifest-embedded-lower-centre-lossless-png-roi-with-recomputed-sha256-and-ihdr',
  }),
  identityFreeze: Object.freeze({
    camera: 'principal-first-person-camera ballistic origin and direction',
    muzzle: 'weapon-model muzzle-socket presentation-only identity',
    projectile: 'catalog weapon fire-kind identity',
    hit: 'production castShot read-only resolution identity',
    requiredAction: 'fire',
    exactEveryLocalFireCell: true,
  }),
  actionSemantics: Object.freeze({
    hip: 'shipped WeaponPresentation settled hip state',
    ads: 'shipped WeaponPresentation settled ADS state including intentional fullscreen-optic suppression',
    fire: 'shipped WeaponPresentation fire cycle plus read-only production castShot identity; no damage mutation claimed',
    reload: 'shipped WeaponPresentation reload cycle at deterministic capture progress',
    melee: 'shipped WeaponPresentation field-knife cycle at deterministic capture progress',
  }),
  mechanicalCatalog: Object.freeze({
    weapons: PASS71_HF296_WEAPONS,
    exactEntries: PASS71_HF296_MATRIX_COUNTS.weaponCatalog,
    required: Object.freeze([
      'modelId', 'modelSource', 'modelKind', 'importedSource',
      'socketContractReady', 'projectileIdentity', 'projectileAuthority',
    ]),
  }),
  scopeBoundary: Object.freeze({
    additionalRendererCartesianCoverageClaimed: false,
    additionalRenderProfileCartesianCoverageClaimed: false,
    ownerVisualInspectionClaimed: false,
    reason: 'HF-296 ledger dimensions are authority/contact/action/role dimensions; one native renderer/profile executes them exactly',
  }),
  residualUnknowns: Object.freeze([
    'Dave has not personally inspected the embedded representative frames; closure is mechanical contact/framing evidence, not owner aesthetic approval',
  ]),
});

export const PASS71_HF296_CONTACT_TOOL_PATHS = Object.freeze({
  runner: 'scripts/qa/run-pass71-hf296-contact-evidence.mjs',
  contract: 'scripts/qa/pass71-hf296-contact-evidence-contract.mjs',
  contractTypes: 'scripts/qa/pass71-hf296-contact-evidence-contract.d.mts',
  contractTest: 'scripts/qa/pass71-hf296-contact-evidence-contract.test.mjs',
  matrix: 'scripts/qa/pass71-hf296-full-matrix.mjs',
  matrixTypes: 'scripts/qa/pass71-hf296-full-matrix.d.mts',
  matrixTest: 'scripts/qa/pass71-hf296-full-matrix.test.mjs',
  fullSpec: 'tests/e2e/pass71-hf296-full-contact-matrix.spec.ts',
  runtimeIntegrationTest: 'src/pass71-hf296-contact-evidence-integration.test.ts',
  capsuleTest: 'src/player-capsule-contact.test.ts',
  viewmodelFramingTest: 'src/viewmodel-framing.test.ts',
  viewmodelContactProbeTest: 'src/viewmodel-contact-probe.test.ts',
  nearPlaneRunnerTest: 'src/pass69-3-authored-near-plane-catalog-runner.test.ts',
  characterPhysics: 'src/physics.ts',
  runtimeComposition: 'src/legacy-main.ts',
  weaponPresentation: 'src/weapon-presentation.ts',
  weaponCatalog: 'src/combat/weapon-catalog.ts',
  protocol: 'src/protocol.ts',
  peerSupport: 'tests/e2e/pass66-e2e-support.ts',
  playwrightConfig: 'playwright.config.ts',
  topologyRunner: 'scripts/qa/run-playwright-with-topology.mjs',
  topologyStager: 'scripts/release/stage-release-topology.mjs',
  edgeIdentityProbe: 'scripts/qa/pass71-edge-executable-identity.mjs',
  acceptanceGate: 'scripts/release/acceptance-gate.mjs',
  releaseChannels: 'release-channels.json',
  viteConfig: 'vite.config.ts',
  packageManifest: 'package.json',
  packageLock: 'package-lock.json',
  lockVerifier: 'scripts/qa/verify-npm10-lockfile.mjs',
});

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

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

function isoTimestamp(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

export function pass71Hf296ContactCanonicalBytes(record) {
  if (!object(record)) throw new Error('Pass 71 HF-296 evidence must be an object');
  const unsigned = Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'receiptSha256'));
  return Buffer.from(`${JSON.stringify(canonicalValue(unsigned))}\n`, 'utf8');
}

export function pass71Hf296ContactRecordSha256(record) {
  return sha256(pass71Hf296ContactCanonicalBytes(record));
}

export function pass71Hf296ContactToolingHashes(repositoryRoot) {
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF296_CONTACT_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256File(resolve(repositoryRoot, path))],
  )));
}

export function pass71Hf296ContactToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-296 tooling source must be a full SHA');
  return Object.freeze(Object.fromEntries(Object.entries(PASS71_HF296_CONTACT_TOOL_PATHS).map(
    ([name, path]) => [`${name}Sha256`, sha256(execFileSync(
      'git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`],
      { windowsHide: true, maxBuffer: 128 * 1024 * 1024 },
    ))],
  )));
}

export function pass71Hf296ContactSourceTreeAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('Pass 71 HF-296 source tree requires a full SHA');
  return execFileSync('git', ['-C', repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function validateSource(source, expected, failures) {
  exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'endingCheckoutSourceSha', 'sourceTreeSha',
    'releasePass', 'cleanBefore', 'cleanAfter',
  ], 'source', failures);
  if (!object(source) || !SHA40.test(source.expectedSourceSha ?? '')
    || source.expectedSourceSha !== expected?.sourceSha
    || source.checkoutSourceSha !== expected?.sourceSha
    || source.endingCheckoutSourceSha !== expected?.sourceSha
    || source.sourceTreeSha !== expected?.sourceTreeSha
    || source.releasePass !== 'PASS 71'
    || source.cleanBefore !== true || source.cleanAfter !== true) failures.push('exact-candidate-a-source');
}

function validateServedCandidate(candidate, expected, failures) {
  exactKeys(candidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path',
    'treeSha256', 'exactRootFileCount',
  ], 'servedCandidate', failures);
  if (!object(candidate) || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.sourceSha !== expected?.sourceSha
    || candidate.path !== 'channels/the-big-one' || !SHA256.test(candidate.treeSha256 ?? '')
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2) {
    failures.push('staged-candidate-provenance');
  }
}

function validateBrowser(browser, failures) {
  exactKeys(browser, [
    'channel', 'installed', 'executableName', 'executableSha256', 'productVersion',
    'playwrightVersion', 'installRoot', 'authenticodeStatus', 'authenticodeSigner',
    'userAgent', 'isolation',
  ], 'browser', failures);
  if (!object(browser) || browser.channel !== 'msedge' || browser.installed !== true
    || browser.executableName !== 'msedge.exe' || !SHA256.test(browser.executableSha256 ?? '')
    || !/^\d+(?:\.\d+){3}$/u.test(browser.productVersion ?? '')
    || browser.playwrightVersion !== browser.productVersion
    || !/[\\/]Microsoft[\\/]Edge[\\/]Application$/iu.test(browser.installRoot ?? '')
    || browser.authenticodeStatus !== 'Valid'
    || !/\bMicrosoft Corporation\b/iu.test(browser.authenticodeSigner ?? '')
    || !new RegExp(`Edg/${String(browser.productVersion).replaceAll('.', '\\.')}`).test(browser.userAgent ?? '')
    || browser.isolation !== 'one-owned-edge-process-with-fresh-contexts-per-arena-role') {
    failures.push('installed-edge-identity');
  }
}

function validateRuntime(runtime, failures) {
  exactKeys(runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ], 'runtime', failures);
  if (!object(runtime) || runtime.requestedBackend !== 'webgl2' || runtime.actualBackend !== 'webgl2'
    || runtime.initialized !== true || runtime.adapterClass !== 'WebGL2RenderingContext'
    || runtime.deviceClass !== null || runtime.softwareAdapter !== false
    || typeof runtime.adapterLabel !== 'string' || runtime.adapterLabel.length === 0
    || SOFTWARE_ADAPTER.test(runtime.adapterLabel) || runtime.deviceLost !== false
    || runtime.uncapturedErrors !== 0 || runtime.presentationStatus !== 'synchronous') {
    failures.push('native-webgl2-runtime');
  }
}

function finiteVector(value) {
  return Array.isArray(value) && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function validateFireIdentityReceipt(value, label, failures) {
  exactKeys(value, [
    'cameraIdentity', 'cameraOrigin', 'cameraDirection', 'muzzleIdentity', 'muzzlePosition',
    'projectileIdentity', 'hitIdentity',
  ], label, failures);
  if (!object(value) || !finiteVector(value.cameraOrigin) || !finiteVector(value.cameraDirection)
    || !finiteVector(value.muzzlePosition)
    || [value.cameraIdentity, value.muzzleIdentity, value.projectileIdentity, value.hitIdentity]
      .some((entry) => typeof entry !== 'string' || entry.length === 0)) failures.push(`${label}:identity`);
}

function fireIdentityFrozen(before, after) {
  if (!object(before) || !object(after) || !finiteVector(before.cameraOrigin)
    || !finiteVector(after.cameraOrigin) || !finiteVector(before.cameraDirection)
    || !finiteVector(after.cameraDirection)) return false;
  const distance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));
  return before.cameraIdentity === after.cameraIdentity
    && before.muzzleIdentity === after.muzzleIdentity
    && before.projectileIdentity === after.projectileIdentity
    && before.hitIdentity === after.hitIdentity
    && distance(before.cameraOrigin, after.cameraOrigin) <= 1e-8
    && distance(before.cameraDirection, after.cameraDirection) <= 1e-10;
}

function actionEvidencePassed(cell) {
  if (!object(cell) || typeof cell.observedAction !== 'string' || !Number.isFinite(cell.adsProgress)
    || !Number.isFinite(cell.fireKick) || !Number.isSafeInteger(cell.shotsPresentedBefore)
    || !Number.isSafeInteger(cell.shotsPresentedAfter) || typeof cell.knifeVisible !== 'boolean'
    || typeof cell.fullscreenSuppressed !== 'boolean') return false;
  if (cell.action === 'hip') return cell.observedAction === 'hip';
  if (cell.action === 'ads') return cell.observedAction === 'ads' && cell.adsProgress >= 0.9;
  if (cell.action === 'fire') {
    return cell.fireKick > 0 && cell.shotsPresentedAfter > cell.shotsPresentedBefore;
  }
  if (cell.action === 'reload') return cell.observedAction === 'reload';
  return cell.action === 'melee' && cell.observedAction === 'melee' && cell.knifeVisible === true;
}

function validateLocalEvidence(rows, failures) {
  if (!Array.isArray(rows)) {
    failures.push('matrix:local:evidence-array');
    return [];
  }
  return rows.map((cell, index) => {
    const label = `matrix:local:evidence:${index}`;
    exactKeys(cell, [
      'arena', 'stance', 'weapon', 'role', 'fixture', 'action', 'contactSources',
      'signedContactDistances', 'sweepSources', 'surfaceRetreat', 'surfaceLift',
      'observedAction', 'adsProgress', 'fireKick', 'shotsPresentedBefore', 'shotsPresentedAfter',
      'knifeVisible', 'fullscreenSuppressed',
      'framingClear', 'identityFrozen', 'identityBefore', 'identityAfter',
    ], label, failures);
    validateFireIdentityReceipt(cell?.identityBefore, `${label}:identity-before`, failures);
    validateFireIdentityReceipt(cell?.identityAfter, `${label}:identity-after`, failures);
    if (!object(cell) || !Array.isArray(cell.contactSources)
      || cell.contactSources.some((source) => typeof source !== 'string' || source.length === 0)
      || !cell.contactSources.includes('world-floor')
      || !Array.isArray(cell.signedContactDistances)
      || cell.signedContactDistances.length !== cell.contactSources.length
      || cell.signedContactDistances.some((value) => !Number.isFinite(value) || value > 0.027)
      || !Array.isArray(cell.sweepSources)
      || cell.sweepSources.some((source) => typeof source !== 'string' || source.length === 0)
      || cell.fixture !== 'floor' && !cell.contactSources.some((source) => source !== 'world-floor')
        && !cell.sweepSources.some((source) => source !== 'world-floor')
      || !Number.isFinite(cell.surfaceRetreat)
      || cell.fixture !== 'floor' && !(cell.surfaceRetreat > 0)
      || !Number.isFinite(cell.surfaceLift) || !actionEvidencePassed(cell)
      || cell.framingClear !== true || cell.identityFrozen !== true
      || cell.action === 'fire' && !fireIdentityFrozen(cell.identityBefore, cell.identityAfter)) {
      failures.push(`${label}:contact-action-or-identity`);
    }
    return pass71Hf296LocalKey(cell ?? {});
  });
}

function validateRemoteEvidence(rows, failures) {
  if (!Array.isArray(rows)) {
    failures.push('matrix:remoteProjection:evidence-array');
    return [];
  }
  return rows.map((cell, index) => {
    const label = `matrix:remoteProjection:evidence:${index}`;
    exactKeys(cell, [
      'arena', 'stance', 'weapon', 'role', 'fixture', 'sourcePlayerId',
      'authoritativePosition', 'renderedPosition', 'interpolationDistance', 'fixtureDistance', 'renderedWeapon',
    ], label, failures);
    if (!object(cell) || typeof cell.sourcePlayerId !== 'string' || cell.sourcePlayerId.length === 0
      || !finiteVector(cell.authoritativePosition) || !finiteVector(cell.renderedPosition)
      || !Number.isFinite(cell.interpolationDistance) || cell.interpolationDistance < 0
      || cell.interpolationDistance > 2 || !Number.isFinite(cell.fixtureDistance)
      || cell.fixtureDistance < 0 || cell.fixtureDistance > 1.5 || cell.renderedWeapon !== cell.weapon) {
      failures.push(`${label}:projection`);
    }
    return pass71Hf296RemoteKey(cell ?? {});
  });
}

function validateCatalogEvidence(rows, failures) {
  if (!Array.isArray(rows)) {
    failures.push('matrix:weaponCatalog:evidence-array');
    return [];
  }
  return rows.map((entry, index) => {
    const label = `matrix:weaponCatalog:evidence:${index}`;
    exactKeys(entry, [
      'weapon', 'modelId', 'modelSource', 'modelKind', 'importedSource',
      'socketContractReady', 'projectileIdentity', 'projectileAuthority',
    ], label, failures);
    if (!object(entry) || [entry.modelId, entry.modelSource, entry.modelKind, entry.importedSource,
      entry.projectileIdentity, entry.projectileAuthority]
      .some((value) => typeof value !== 'string' || value.length === 0)
      || entry.socketContractReady !== true) failures.push(`${label}:catalog`);
    return entry?.weapon;
  });
}

function validateMatrix(matrix, failures) {
  exactKeys(matrix, ['local', 'remoteProjection', 'weaponCatalog'], 'matrix', failures);
  for (const [name, expectedCount, expectedKeySha] of [
    ['local', PASS71_HF296_MATRIX_COUNTS.local, PASS71_HF296_LOCAL_KEY_SHA256],
    ['remoteProjection', PASS71_HF296_MATRIX_COUNTS.remote, PASS71_HF296_REMOTE_KEY_SHA256],
  ]) {
    const value = matrix?.[name];
    exactKeys(value, [
      'count', 'keySha256', 'keyEncoding', 'keyByteLength', 'keysGzipBase64',
      'evidenceEncoding', 'evidenceByteLength', 'evidenceGzipBase64', 'evidenceSha256',
    ], `matrix:${name}`, failures);
    const expectedKeys = name === 'local' ? PASS71_HF296_LOCAL_KEYS : PASS71_HF296_REMOTE_KEYS;
    const decodedKeys = decodeEmbeddedKeySet(value, `matrix:${name}`, failures);
    const evidence = decodeEmbeddedEvidence(value, `matrix:${name}`, failures);
    const evidenceKeys = name === 'local'
      ? validateLocalEvidence(evidence, failures)
      : validateRemoteEvidence(evidence, failures);
    if (!object(value) || value.count !== expectedCount || value.keySha256 !== expectedKeySha
      || !Array.isArray(evidence) || evidence.length !== expectedCount
      || pass71Hf296ExactSetFailures(decodedKeys, expectedKeys, `matrix:${name}`).length > 0
      || pass71Hf296ExactSetFailures(evidenceKeys, expectedKeys, `matrix:${name}:evidence`).length > 0
      || pass71Hf296KeyDigest(decodedKeys) !== expectedKeySha
      || !sameJson([...decodedKeys].sort(), [...evidenceKeys].sort())) {
      failures.push(`matrix:${name}:exact-set-or-evidence`);
    }
  }
  const catalog = matrix?.weaponCatalog;
  exactKeys(catalog, [
    'count', 'weapons', 'evidenceEncoding', 'evidenceByteLength', 'evidenceGzipBase64', 'evidenceSha256',
  ], 'matrix:weaponCatalog', failures);
  const catalogEvidence = decodeEmbeddedEvidence(catalog, 'matrix:weaponCatalog', failures);
  const catalogWeapons = validateCatalogEvidence(catalogEvidence, failures);
  if (!object(catalog) || catalog.count !== PASS71_HF296_MATRIX_COUNTS.weaponCatalog
    || !Array.isArray(catalogEvidence) || catalogEvidence.length !== PASS71_HF296_MATRIX_COUNTS.weaponCatalog
    || !sameJson(catalog.weapons, PASS71_HF296_WEAPONS)
    || !sameJson(catalogWeapons, PASS71_HF296_WEAPONS)) failures.push('matrix:weaponCatalog:exact-set-or-evidence');
}

function embeddedKeySet(keys) {
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

function decodeEmbeddedEvidence(value, label, failures) {
  try {
    if (!object(value) || value.evidenceEncoding !== 'gzip-base64-canonical-json'
      || !Number.isSafeInteger(value.evidenceByteLength) || value.evidenceByteLength <= 0
      || !SHA256.test(value.evidenceSha256 ?? '')
      || typeof value.evidenceGzipBase64 !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value.evidenceGzipBase64)) throw new Error('schema');
    const compressed = Buffer.from(value.evidenceGzipBase64, 'base64');
    if (compressed.toString('base64') !== value.evidenceGzipBase64) throw new Error('canonical-base64');
    const bytes = gunzipSync(compressed, { maxOutputLength: 128 * 1024 * 1024 });
    if (bytes.length !== value.evidenceByteLength || sha256(bytes) !== value.evidenceSha256) {
      throw new Error('bytes');
    }
    const decoded = JSON.parse(bytes.toString('utf8'));
    const canonicalBytes = Buffer.from(`${JSON.stringify(canonicalValue(decoded))}\n`, 'utf8');
    if (!bytes.equals(canonicalBytes)) throw new Error('canonical-json');
    return decoded;
  } catch {
    failures.push(`${label}:embedded-evidence`);
    return null;
  }
}

function decodeEmbeddedKeySet(value, label, failures) {
  try {
    if (!object(value) || value.keyEncoding !== 'gzip-base64-sorted-utf8-lines'
      || !Number.isSafeInteger(value.keyByteLength) || value.keyByteLength <= 0
      || typeof value.keysGzipBase64 !== 'string'
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value.keysGzipBase64)) throw new Error('schema');
    const compressed = Buffer.from(value.keysGzipBase64, 'base64');
    if (compressed.toString('base64') !== value.keysGzipBase64) throw new Error('canonical-base64');
    const bytes = gunzipSync(compressed, { maxOutputLength: 16 * 1024 * 1024 });
    if (bytes.length !== value.keyByteLength) throw new Error('byte-length');
    const text = bytes.toString('utf8');
    if (!text.endsWith('\n')) throw new Error('line-termination');
    const keys = text.slice(0, -1).split('\n');
    if (JSON.stringify(keys) !== JSON.stringify([...keys].sort())) throw new Error('sort-order');
    return keys;
  } catch {
    failures.push(`${label}:embedded-key-set`);
    return [];
  }
}

function expectedVisualIdentity(key) {
  const [arena, stance, role, fixture] = key.split('\u001f');
  return { key, arena, stance, role, fixture };
}

function validateVisualAttachments(attachments, failures) {
  if (!Array.isArray(attachments)) {
    failures.push('visual-attachments:not-array');
    return;
  }
  const keys = attachments.map((attachment) => attachment?.key);
  failures.push(...pass71Hf296ExactSetFailures(keys, PASS71_HF296_VISUAL_KEYS, 'visual-attachments'));
  for (const [index, attachment] of attachments.entries()) {
    exactKeys(attachment, [
      'key', 'arena', 'stance', 'role', 'fixture', 'weapon', 'action',
      'mimeType', 'encoding', 'byteLength', 'width', 'height', 'sha256', 'pngBase64',
    ], `visual:${index}`, failures);
    const identity = expectedVisualIdentity(attachment?.key ?? '');
    let bytes = null;
    try {
      if (typeof attachment?.pngBase64 !== 'string'
        || !/^[A-Za-z0-9+/]+={0,2}$/u.test(attachment.pngBase64)) throw new Error('base64');
      bytes = Buffer.from(attachment.pngBase64, 'base64');
      if (bytes.toString('base64') !== attachment.pngBase64) throw new Error('canonical-base64');
    } catch {
      failures.push(`visual:${index}:embedded-bytes`);
    }
    if (!object(attachment) || !sameJson({
      key: attachment.key, arena: attachment.arena, stance: attachment.stance,
      role: attachment.role, fixture: attachment.fixture,
    }, identity) || attachment.weapon !== PASS71_HF296_VISUAL_WEAPON
      || attachment.action !== PASS71_HF296_VISUAL_ACTION
      || attachment.mimeType !== 'image/png' || attachment.encoding !== 'lossless-png-embedded-base64'
      || !bytes || bytes.length <= 24 || bytes.length > PASS71_HF296_MAX_VISUAL_BYTES
      || attachment.byteLength !== bytes.length
      || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || attachment.width !== bytes.readUInt32BE(16) || attachment.height !== bytes.readUInt32BE(20)
      || attachment.width !== PASS71_HF296_VISUAL_CROP.width
      || attachment.height !== PASS71_HF296_VISUAL_CROP.height
      || attachment.sha256 !== sha256(bytes)) failures.push(`visual:${index}:identity-or-lossless-bytes`);
  }
}

export function pass71Hf296ContactEvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!object(record) || record.schemaVersion !== PASS71_HF296_CONTACT_EVIDENCE.schemaVersion
    || record.evidenceId !== PASS71_HF296_CONTACT_EVIDENCE.evidenceId
    || record.kind !== PASS71_HF296_CONTACT_EVIDENCE.kind
    || record.contract !== PASS71_HF296_CONTACT_EVIDENCE.contract
    || record.feedbackId !== PASS71_HF296_CONTACT_EVIDENCE.feedbackId
    || record.status !== PASS71_HF296_CONTACT_EVIDENCE.status
    || record.coverageDisposition !== PASS71_HF296_CONTACT_EVIDENCE.coverageDisposition
    || record.closesFeedback !== true) return ['hf296-identity-status-or-closure'];
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > PASS71_HF296_MAX_RECORD_JSON_BYTES) {
    failures.push('record:encoded-size-cap');
  }
  exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status',
    'coverageDisposition', 'closesFeedback', 'startedAt', 'completedAt', 'source',
    'servedCandidate', 'environment', 'browser', 'runtime', 'tooling', 'coverage',
    'matrix', 'visualAttachments', 'faults', 'receiptSha256',
  ], 'record', failures);
  validateSource(record.source, expected, failures);
  validateServedCandidate(record.servedCandidate, expected, failures);
  exactKeys(record.environment, ['machine', 'platform', 'arch'], 'environment', failures);
  if (record.environment?.machine !== 'dave-gaming-pc' || record.environment?.platform !== 'win32'
    || record.environment?.arch !== 'x64') failures.push('release-machine-environment');
  validateBrowser(record.browser, failures);
  validateRuntime(record.runtime, failures);
  const toolingFields = Object.keys(PASS71_HF296_CONTACT_TOOL_PATHS).map((name) => `${name}Sha256`);
  if (!object(record.tooling) || !object(expected.tooling)
    || !sameJson(Object.keys(record.tooling).sort(), toolingFields.sort())
    || !sameJson(record.tooling, expected.tooling)
    || Object.values(record.tooling).some((value) => !SHA256.test(value ?? ''))) {
    failures.push('candidate-a-tooling-hashes');
  }
  if (!sameJson(record.coverage, PASS71_HF296_CONTACT_COVERAGE)) failures.push('literal-full-coverage-contract');
  validateMatrix(record.matrix, failures);
  validateVisualAttachments(record.visualAttachments, failures);
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('aggregate-faults');
  if (!isoTimestamp(record.startedAt) || !isoTimestamp(record.completedAt)
    || Date.parse(record.startedAt) > Date.parse(record.completedAt)) failures.push('run-timestamps');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf296ContactRecordSha256(record)) failures.push('receipt-sha256');
  return [...new Set(failures)].sort();
}

export function assertPass71Hf296ContactEvidence(record, expected) {
  const failures = pass71Hf296ContactEvidenceFailures(record, expected);
  if (failures.length > 0) throw new Error(`Pass 71 HF-296 contact evidence failed: ${failures.join(', ')}`);
  return record;
}

export function createPass71Hf296ContactEvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR,
    closesFeedback: true,
    validate(record, context) {
      try {
        const tooling = context?.options?.pass71Hf296ContactTooling
          ?? pass71Hf296ContactToolingHashesAtSource(context?.repositoryRoot, context?.sourceSha);
        return pass71Hf296ContactEvidenceFailures(record, {
          sourceSha: context?.sourceSha,
          sourceTreeSha: context?.options?.pass71Hf296ContactSourceTreeSha
            ?? pass71Hf296ContactSourceTreeAtSource(context?.repositoryRoot, context?.sourceSha),
          tooling,
        });
      } catch (error) {
        return [`hf296-tooling-unavailable:${error instanceof Error ? error.message : String(error)}`];
      }
    },
  });
}

export const PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY = createPass71Hf296ContactEvidenceRegistryEntry();

const FIXTURE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABaCAYAAAA/xl1SAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAB5ElEQVR4nO2UQQ3AQACDTgpSJmX+TdxkrAk8MFBID897ow34aYNTfMXHjxsUYAHeAiyCa92gBxyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmAIckICYAhyQgJgCHJCAmA8dej1/RG5UgAAAAABJRU5ErkJggg==';
const fixtureFireIdentity = (weapon) => ({
  cameraIdentity: 'principal-first-person-camera',
  cameraOrigin: [0, 1.6, 0],
  cameraDirection: [0, 0, -1],
  muzzleIdentity: `${weapon}:fixture-model:muzzle-socket`,
  muzzlePosition: [0.2, 1.4, -0.5],
  projectileIdentity: `${weapon}:fixture-projectile-kind`,
  hitIdentity: 'world-surface:fixture-surface',
});
const FIXTURE_LOCAL_EVIDENCE = PASS71_HF296_LOCAL_KEYS.map((key) => {
  const [arena, stance, weapon, role, fixture, action] = key.split('\u001f');
  const contactSources = fixture === 'floor' ? ['world-floor'] : ['world-floor', `fixture:${fixture}`];
  return {
    arena, stance, weapon, role, fixture, action,
    contactSources,
    signedContactDistances: contactSources.map((source) => source === 'world-floor' ? 0.025 : 0.001),
    sweepSources: fixture === 'floor' ? [] : [`fixture:${fixture}`],
    surfaceRetreat: fixture === 'floor' ? 0 : 0.12,
    surfaceLift: 0,
    observedAction: action === 'ads' ? 'ads' : action === 'reload' ? 'reload' : action === 'melee' ? 'melee' : 'hip',
    adsProgress: action === 'ads' ? 1 : 0,
    fireKick: action === 'fire' ? 1 : 0,
    shotsPresentedBefore: 0,
    shotsPresentedAfter: action === 'fire' ? 1 : 0,
    knifeVisible: action === 'melee',
    fullscreenSuppressed: false,
    framingClear: true,
    identityFrozen: true,
    identityBefore: fixtureFireIdentity(weapon),
    identityAfter: fixtureFireIdentity(weapon),
  };
});
const FIXTURE_REMOTE_EVIDENCE = PASS71_HF296_REMOTE_KEYS.map((key, index) => {
  const [arena, stance, weapon, role, fixture] = key.split('\u001f');
  return {
    arena, stance, weapon, role, fixture,
    sourcePlayerId: `fixture-player-${index % 2}`,
    authoritativePosition: [0, 1.6, 0],
    renderedPosition: [0, 1.6, 0],
    interpolationDistance: 0,
    fixtureDistance: 0,
    renderedWeapon: weapon,
  };
});
const FIXTURE_WEAPON_CATALOG = PASS71_HF296_WEAPONS.map((weapon) => ({
  weapon,
  modelId: `${weapon}:fixture-model`,
  modelSource: `fixture://${weapon}`,
  modelKind: 'imported',
  importedSource: `fixture://${weapon}`,
  socketContractReady: true,
  projectileIdentity: `${weapon}:fixture-projectile-kind`,
  projectileAuthority: 'fixture-production-authority',
}));
const FIXTURE_LOCAL_EMBEDDED_EVIDENCE = Object.freeze(embeddedEvidence(FIXTURE_LOCAL_EVIDENCE));
const FIXTURE_REMOTE_EMBEDDED_EVIDENCE = Object.freeze(embeddedEvidence(FIXTURE_REMOTE_EVIDENCE));
const FIXTURE_CATALOG_EMBEDDED_EVIDENCE = Object.freeze(embeddedEvidence(FIXTURE_WEAPON_CATALOG));

export function createPass71Hf296ContactEvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? 'a'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? 'c'.repeat(40);
  const tooling = options.tooling ?? Object.fromEntries(Object.keys(PASS71_HF296_CONTACT_TOOL_PATHS).map(
    (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
  ));
  const png = Buffer.from(FIXTURE_PNG_BASE64, 'base64');
  const visualAttachments = PASS71_HF296_VISUAL_KEYS.map((key) => ({
    ...expectedVisualIdentity(key),
    weapon: PASS71_HF296_VISUAL_WEAPON,
    action: PASS71_HF296_VISUAL_ACTION,
    mimeType: 'image/png',
    encoding: 'lossless-png-embedded-base64',
    byteLength: png.length,
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    sha256: sha256(png),
    pngBase64: FIXTURE_PNG_BASE64,
  }));
  const record = {
    ...PASS71_HF296_CONTACT_EVIDENCE,
    startedAt: options.startedAt ?? '2026-08-13T19:00:00.000Z',
    completedAt: options.completedAt ?? '2026-08-13T19:30:00.000Z',
    source: {
      expectedSourceSha: sourceSha,
      checkoutSourceSha: sourceSha,
      endingCheckoutSourceSha: sourceSha,
      sourceTreeSha,
      releasePass: 'PASS 71',
      cleanBefore: true,
      cleanAfter: true,
    },
    servedCandidate: {
      schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
      path: 'channels/the-big-one', treeSha256: 'b'.repeat(64), exactRootFileCount: 500,
    },
    environment: { machine: 'dave-gaming-pc', platform: 'win32', arch: 'x64' },
    browser: {
      channel: 'msedge', installed: true, executableName: 'msedge.exe',
      executableSha256: 'd'.repeat(64), productVersion: '151.0.4129.72',
      playwrightVersion: '151.0.4129.72',
      installRoot: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application',
      authenticodeStatus: 'Valid', authenticodeSigner: 'CN=Microsoft Corporation',
      userAgent: 'Mozilla/5.0 Edg/151.0.4129.72',
      isolation: 'one-owned-edge-process-with-fresh-contexts-per-arena-role',
    },
    runtime: {
      requestedBackend: 'webgl2', actualBackend: 'webgl2', initialized: true,
      adapterClass: 'WebGL2RenderingContext', deviceClass: null,
      adapterLabel: 'ANGLE NVIDIA GeForce RTX 5080', softwareAdapter: false,
      deviceLost: false, uncapturedErrors: 0, presentationStatus: 'synchronous',
    },
    tooling: { ...tooling },
    coverage: JSON.parse(JSON.stringify(PASS71_HF296_CONTACT_COVERAGE)),
    matrix: {
      local: {
        count: PASS71_HF296_MATRIX_COUNTS.local,
        keySha256: PASS71_HF296_LOCAL_KEY_SHA256,
        ...embeddedKeySet(PASS71_HF296_LOCAL_KEYS),
        ...FIXTURE_LOCAL_EMBEDDED_EVIDENCE,
      },
      remoteProjection: {
        count: PASS71_HF296_MATRIX_COUNTS.remote,
        keySha256: PASS71_HF296_REMOTE_KEY_SHA256,
        ...embeddedKeySet(PASS71_HF296_REMOTE_KEYS),
        ...FIXTURE_REMOTE_EMBEDDED_EVIDENCE,
      },
      weaponCatalog: {
        count: PASS71_HF296_MATRIX_COUNTS.weaponCatalog,
        weapons: [...PASS71_HF296_WEAPONS],
        ...FIXTURE_CATALOG_EMBEDDED_EVIDENCE,
      },
    },
    visualAttachments,
    faults: [],
  };
  record.receiptSha256 = pass71Hf296ContactRecordSha256(record);
  return record;
}

export { pass71Hf296VisualKey };
