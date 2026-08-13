import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import {
  PASS71_HF296_CONTACT_COVERAGE,
  PASS71_HF296_CONTACT_EVIDENCE,
  PASS71_HF296_MAX_RECORD_JSON_BYTES,
  PASS71_HF296_MAX_VISUAL_BYTES,
  PASS71_HF296_VISUAL_CROP,
  assertPass71Hf296ContactEvidence,
  pass71Hf296ContactRecordSha256,
  pass71Hf296ContactSourceTreeAtSource,
  pass71Hf296ContactToolingHashesAtSource,
} from './pass71-hf296-contact-evidence-contract.mjs';
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
  PASS71_HF296_VISUAL_KEYS,
  PASS71_HF296_VISUAL_WEAPON,
  PASS71_HF296_WEAPONS,
  assertPass71Hf296ExactSets,
  pass71Hf296KeyDigest,
  pass71Hf296LocalKey,
  pass71Hf296RemoteKey,
} from './pass71-hf296-full-matrix.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
const previewPort = boundedPort(args.port ?? process.env.PASS71_HF296_PORT ?? '4586', 'preview');
const peerPort = boundedPort(args['peer-port'] ?? process.env.PASS71_HF296_PEER_PORT ?? '4587', 'PeerJS');
const artifactRoot = resolve(root, 'artifacts/pass71/hf296-contact-evidence');
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
let temporaryRoot = null;

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(['expected-source-sha', 'machine', 'port', 'peer-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-296 expected --name value; received ${token ?? '(missing)'}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) {
      throw new Error(`HF-296 rejected unknown or duplicate argument --${key}`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`HF-296 ${label} port must be from 1024 through 65535`);
  }
  return port;
}

function git(...values) {
  return execFileSync('git', values, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function evidenceSha256(value) {
  return sha256(Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8'));
}

function embeddedEvidence(value) {
  const bytes = Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
  return {
    evidenceEncoding: 'gzip-base64-canonical-json',
    evidenceByteLength: bytes.length,
    evidenceGzipBase64: gzipSync(bytes, { level: 9 }).toString('base64'),
    evidenceSha256: evidenceSha256(value),
  };
}

function embeddedKeySet(keys) {
  const bytes = Buffer.from(`${[...keys].sort().join('\n')}\n`, 'utf8');
  return {
    keyEncoding: 'gzip-base64-sorted-utf8-lines',
    keyByteLength: bytes.length,
    keysGzipBase64: gzipSync(bytes, { level: 9 }).toString('base64'),
  };
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`HF-296 ${label} has unknown or missing fields`);
  }
}

function exactArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`HF-296 ${label} drifted`);
}

function finiteVector(value) {
  return Array.isArray(value) && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function validateFireIdentityReceipt(value, label) {
  exactKeys(value, [
    'cameraIdentity', 'cameraOrigin', 'cameraDirection', 'muzzleIdentity', 'muzzlePosition',
    'projectileIdentity', 'hitIdentity',
  ], label);
  if (!finiteVector(value.cameraOrigin) || !finiteVector(value.cameraDirection) || !finiteVector(value.muzzlePosition)
    || [value.cameraIdentity, value.muzzleIdentity, value.projectileIdentity, value.hitIdentity]
      .some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new Error(`HF-296 ${label} is incomplete`);
  }
}

function fireIdentityFrozen(before, after) {
  const distance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));
  return before.cameraIdentity === after.cameraIdentity
    && before.muzzleIdentity === after.muzzleIdentity
    && before.projectileIdentity === after.projectileIdentity
    && before.hitIdentity === after.hitIdentity
    && distance(before.cameraOrigin, after.cameraOrigin) <= 1e-8
    && distance(before.cameraDirection, after.cameraDirection) <= 1e-10;
}

function actionEvidencePassed(cell) {
  if (typeof cell.observedAction !== 'string' || !Number.isFinite(cell.adsProgress)
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

function requireEdgeExecutable() {
  const candidates = [
    args['edge-executable'], process.env.PASS71_HF296_EDGE_EXECUTABLE,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).map((path) => resolve(path));
  const executable = candidates.find((path) => existsSync(path));
  if (!executable || basename(executable).toLowerCase() !== 'msedge.exe') {
    throw new Error('HF-296 requires an installed Microsoft Edge executable');
  }
  return executable;
}

function portIsListening(port) {
  return new Promise((resolveListening) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (listening) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveListening(listening);
    };
    socket.setTimeout(300);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function runNode(label, values, environment) {
  const result = spawnSync(process.execPath, values, {
    cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw new Error(`${label} failed to launch: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}`);
  if ((result.status ?? 1) !== 0) throw new Error(`${label} failed with exit ${result.status ?? 1}`);
}

function validateComponent(component) {
  exactKeys(component, [
    'schemaVersion', 'contract', 'status', 'expectedSourceSha', 'checkoutSourceSha',
    'servedCandidate', 'browser', 'runtime', 'coverage', 'localCells', 'remoteCells',
    'weaponCatalog', 'visualAttachments', 'faults',
  ], 'component');
  if (component.schemaVersion !== 2
    || component.contract !== 'atomic-acres/pass71-hf296-full-contact-matrix-component@2'
    || component.status !== 'passed' || component.expectedSourceSha !== expectedSourceSha
    || component.checkoutSourceSha !== expectedSourceSha) throw new Error('HF-296 component identity is invalid');
  exactKeys(component.coverage, [
    'renderer', 'renderProfile', 'arenas', 'stances', 'weapons',
    'localRoles', 'remoteRoles', 'fixtures', 'actions',
  ], 'component coverage');
  if (component.coverage.renderer !== 'webgl2' || component.coverage.renderProfile !== 'blender') {
    throw new Error('HF-296 component renderer/profile is invalid');
  }
  for (const [actual, expected, label] of [
    [component.coverage.arenas, PASS71_HF296_ARENAS, 'arenas'],
    [component.coverage.stances, PASS71_HF296_STANCES, 'stances'],
    [component.coverage.weapons, PASS71_HF296_WEAPONS, 'weapons'],
    [component.coverage.localRoles, PASS71_HF296_LOCAL_ROLES, 'local roles'],
    [component.coverage.remoteRoles, PASS71_HF296_REMOTE_ROLES, 'remote roles'],
    [component.coverage.fixtures, PASS71_HF296_FIXTURES, 'fixtures'],
    [component.coverage.actions, PASS71_HF296_ACTIONS, 'actions'],
  ]) exactArray(actual, expected, label);
  exactKeys(component.servedCandidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ], 'served candidate');
  if (component.servedCandidate.schemaVersion !== 4 || component.servedCandidate.channel !== 'the-big-one'
    || component.servedCandidate.releasePass !== 'PASS 71'
    || component.servedCandidate.sourceSha !== expectedSourceSha
    || component.servedCandidate.path !== 'channels/the-big-one'
    || !/^[a-f0-9]{64}$/u.test(component.servedCandidate.treeSha256 ?? '')
    || !Number.isSafeInteger(component.servedCandidate.exactRootFileCount)
    || component.servedCandidate.exactRootFileCount < 2) throw new Error('HF-296 staged candidate is invalid');
  exactKeys(component.browser, ['version', 'userAgent'], 'component browser');
  if (!/^\d+(?:\.\d+){3}$/u.test(component.browser.version ?? '')
    || !/Edg\//u.test(component.browser.userAgent ?? '')) throw new Error('HF-296 component browser identity is invalid');
  if (!Array.isArray(component.faults) || component.faults.length !== 0) throw new Error('HF-296 component retained faults');

  const localKeys = component.localCells.map((cell, index) => {
    exactKeys(cell, [
      'arena', 'stance', 'weapon', 'role', 'fixture', 'action', 'contactSources',
      'signedContactDistances', 'sweepSources', 'surfaceRetreat', 'surfaceLift',
      'observedAction', 'adsProgress', 'fireKick', 'shotsPresentedBefore', 'shotsPresentedAfter',
      'knifeVisible', 'fullscreenSuppressed',
      'framingClear', 'identityFrozen', 'identityBefore', 'identityAfter',
    ], `local cell ${index}`);
    validateFireIdentityReceipt(cell.identityBefore, `local cell ${index} identity before`);
    validateFireIdentityReceipt(cell.identityAfter, `local cell ${index} identity after`);
    if (!Array.isArray(cell.contactSources) || !cell.contactSources.includes('world-floor')
      || !Array.isArray(cell.signedContactDistances)
      || cell.signedContactDistances.some((value) => !Number.isFinite(value) || value > 0.027)
      || !Array.isArray(cell.sweepSources)
      || cell.fixture !== 'floor' && !cell.contactSources.some((source) => source !== 'world-floor')
        && !cell.sweepSources.some((source) => source !== 'world-floor')
      || cell.fixture !== 'floor' && !(cell.surfaceRetreat > 0)
      || !Number.isFinite(cell.surfaceLift) || !actionEvidencePassed(cell)
      || cell.framingClear !== true || cell.identityFrozen !== true
      || cell.action === 'fire' && !fireIdentityFrozen(cell.identityBefore, cell.identityAfter)) {
      throw new Error(`HF-296 local cell ${index} lacks contact/action/identity evidence`);
    }
    return pass71Hf296LocalKey(cell);
  });
  const remoteKeys = component.remoteCells.map((cell, index) => {
    exactKeys(cell, [
      'arena', 'stance', 'weapon', 'role', 'fixture', 'sourcePlayerId',
      'authoritativePosition', 'renderedPosition', 'interpolationDistance', 'fixtureDistance', 'renderedWeapon',
    ], `remote cell ${index}`);
    if (typeof cell.sourcePlayerId !== 'string' || cell.sourcePlayerId.length === 0
      || !finiteVector(cell.authoritativePosition) || !finiteVector(cell.renderedPosition)
      || !Number.isFinite(cell.interpolationDistance) || cell.interpolationDistance < 0
      || cell.interpolationDistance > 2 || !Number.isFinite(cell.fixtureDistance)
      || cell.fixtureDistance < 0 || cell.fixtureDistance > 1.5 || cell.renderedWeapon !== cell.weapon) {
      throw new Error(`HF-296 remote cell ${index} lacks exact projected identity`);
    }
    return pass71Hf296RemoteKey(cell);
  });
  const visualKeys = component.visualAttachments.map((attachment, index) => {
    exactKeys(attachment, ['key', 'arena', 'stance', 'role', 'fixture', 'weapon', 'action', 'filename'], `visual ${index}`);
    const expectedFilename = `${attachment.arena}--${attachment.stance}--${attachment.role}--${attachment.fixture}.png`;
    if (attachment.filename !== expectedFilename || basename(attachment.filename) !== attachment.filename
      || attachment.weapon !== PASS71_HF296_VISUAL_WEAPON
      || attachment.action !== PASS71_HF296_VISUAL_ACTION) throw new Error(`HF-296 visual ${index} identity is invalid`);
    return attachment.key;
  });
  assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys });
  if (pass71Hf296KeyDigest(localKeys) !== PASS71_HF296_LOCAL_KEY_SHA256
    || pass71Hf296KeyDigest(remoteKeys) !== PASS71_HF296_REMOTE_KEY_SHA256) {
    throw new Error('HF-296 exact matrix key digest mismatch');
  }
  if (!Array.isArray(component.weaponCatalog) || component.weaponCatalog.length !== PASS71_HF296_WEAPONS.length) {
    throw new Error('HF-296 weapon catalog cardinality is invalid');
  }
  exactArray(component.weaponCatalog.map((entry) => entry.weapon), PASS71_HF296_WEAPONS, 'catalog weapon order');
  component.weaponCatalog.forEach((entry, index) => {
    exactKeys(entry, [
      'weapon', 'modelId', 'modelSource', 'modelKind', 'importedSource',
      'socketContractReady', 'projectileIdentity', 'projectileAuthority',
    ], `weapon catalog ${index}`);
    if ([entry.modelId, entry.modelSource, entry.modelKind, entry.importedSource,
      entry.projectileIdentity, entry.projectileAuthority].some((value) => typeof value !== 'string' || value.length === 0)
      || entry.socketContractReady !== true) throw new Error(`HF-296 weapon catalog ${index} is incomplete`);
  });
  return { localKeys, remoteKeys, visualKeys };
}

function embedVisualAttachments(component) {
  return [...component.visualAttachments].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0).map((identity) => {
    const path = resolve(temporaryRoot, 'component', 'visual', identity.filename);
    if (!existsSync(path)) throw new Error(`HF-296 owned visual is missing: ${identity.filename}`);
    const bytes = readFileSync(path);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length <= 24 || !bytes.subarray(0, 8).equals(signature)
      || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`HF-296 visual is not PNG: ${identity.filename}`);
    if (bytes.length > PASS71_HF296_MAX_VISUAL_BYTES
      || bytes.readUInt32BE(16) !== PASS71_HF296_VISUAL_CROP.width
      || bytes.readUInt32BE(20) !== PASS71_HF296_VISUAL_CROP.height) {
      throw new Error(`HF-296 visual exceeds its bounded ROI contract: ${identity.filename}`);
    }
    return {
      key: identity.key,
      arena: identity.arena,
      stance: identity.stance,
      role: identity.role,
      fixture: identity.fixture,
      weapon: identity.weapon,
      action: identity.action,
      mimeType: 'image/png',
      encoding: 'lossless-png-embedded-base64',
      byteLength: bytes.length,
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      sha256: sha256(bytes),
      pngBase64: bytes.toString('base64'),
    };
  });
}

function writeReceipt(record) {
  mkdirSync(artifactRoot, { recursive: true });
  const payload = JSON.stringify(record);
  if (Buffer.byteLength(payload, 'utf8') > PASS71_HF296_MAX_RECORD_JSON_BYTES) {
    throw new Error('HF-296 complete receipt exceeds its manifest evidence budget');
  }
  const bytes = Buffer.from(`${payload}\n`, 'utf8');
  writeFileSync(receiptPath, bytes);
  writeFileSync(`${receiptPath}.sha256`, `${sha256(bytes)}  ${basename(receiptPath)}\n`, 'utf8');
  return sha256(bytes);
}

async function main() {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('HF-296 requires --expected-source-sha with candidate A full SHA');
  }
  if (args.machine !== 'dave-gaming-pc') {
    throw new Error('HF-296 requires --machine dave-gaming-pc');
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`HF-296 requires win32/x64; received ${process.platform}/${process.arch}`);
  }
  const checkoutSourceSha = git('rev-parse', 'HEAD');
  if (checkoutSourceSha !== expectedSourceSha || !clean()) {
    throw new Error(`HF-296 requires one clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha})`);
  }
  if (await portIsListening(previewPort) || await portIsListening(peerPort)) {
    throw new Error(`HF-296 requires unbound owned ports ${previewPort}/${peerPort}`);
  }
  const viteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  const inheritedVite = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('VITE_'));
  if (viteOverrides.length > 0 || inheritedVite.length > 0) {
    throw new Error(`HF-296 rejects Vite overrides: ${[...viteOverrides, ...inheritedVite].join(', ')}`);
  }
  const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
  if (releaseChannels?.experimental?.pass !== 'PASS 71'
    || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
    throw new Error('HF-296 requires the canonical Pass 71 staged channel');
  }
  const edgeExecutable = requireEdgeExecutable();
  const executableIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(
    ([name]) => !name.toUpperCase().startsWith('VITE_')
      && !name.toUpperCase().startsWith('PASS71_HF296_'),
  ));
  runNode('HF-296 lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], inheritedEnvironment);
  runNode('HF-296 shipped Rapier/viewmodel foundations', [
    resolve(root, 'node_modules/vitest/vitest.mjs'), 'run',
    'src/player-capsule-contact.test.ts',
    'src/viewmodel-framing.test.ts',
    'src/viewmodel-contact-probe.test.ts',
    'src/pass69-3-authored-near-plane-catalog-runner.test.ts',
  ], inheritedEnvironment);
  temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass71-hf296-'));
  const componentRoot = join(temporaryRoot, 'component');
  mkdirSync(componentRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  runNode('HF-296 installed-Edge full contact matrix', [
    resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
    'tests/e2e/pass71-hf296-full-contact-matrix.spec.ts',
    '--project=chromium', '--workers=1', '--retries=0',
  ], {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: expectedSourceSha,
    RELEASE_PASS: 'PASS 71',
    VITE_MATCH_BUILD_ID: expectedSourceSha,
    QA_INSTALLED_EDGE: '1',
    PASS71_HF296_EDGE_EXECUTABLE: edgeExecutable,
    QA_PREVIEW_PORT: String(previewPort),
    PASS71_HF296_FULL_MATRIX: '1',
    PASS71_HF296_EXPECTED_SOURCE_SHA: expectedSourceSha,
    PASS71_HF296_COMPONENT_DIR: componentRoot,
    PASS71_HF296_PEER_PORT: String(peerPort),
  });
  const componentPath = resolve(componentRoot, 'component.json');
  if (!existsSync(componentPath)) throw new Error('HF-296 browser did not emit its owned component');
  const component = JSON.parse(readFileSync(componentPath, 'utf8'));
  validateComponent(component);
  if (component.browser.version !== executableIdentity.productVersion) {
    throw new Error(`HF-296 Edge process version ${component.browser.version} != executable ${executableIdentity.productVersion}`);
  }
  const visualAttachments = embedVisualAttachments(component);
  if (visualAttachments.length !== PASS71_HF296_MATRIX_COUNTS.visual
    || pass71Hf296KeyDigest(visualAttachments.map((entry) => entry.key)) !== pass71Hf296KeyDigest(PASS71_HF296_VISUAL_KEYS)) {
    throw new Error('HF-296 embedded visual set drifted');
  }
  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = clean();
  if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
    throw new Error(`HF-296 source drifted during evidence (${expectedSourceSha}/${endingCheckoutSourceSha})`);
  }
  const sourceTreeSha = pass71Hf296ContactSourceTreeAtSource(root, expectedSourceSha);
  const tooling = pass71Hf296ContactToolingHashesAtSource(root, expectedSourceSha);
  const runtime = component.runtime;
  const record = {
    ...PASS71_HF296_CONTACT_EVIDENCE,
    startedAt,
    completedAt: new Date().toISOString(),
    source: {
      expectedSourceSha,
      checkoutSourceSha,
      endingCheckoutSourceSha,
      sourceTreeSha,
      releasePass: 'PASS 71',
      cleanBefore: true,
      cleanAfter,
    },
    servedCandidate: component.servedCandidate,
    environment: { machine: 'dave-gaming-pc', platform: process.platform, arch: process.arch },
    browser: {
      channel: 'msedge', installed: true, executableName: basename(edgeExecutable),
      executableSha256: sha256(readFileSync(edgeExecutable)),
      productVersion: executableIdentity.productVersion,
      playwrightVersion: component.browser.version,
      installRoot: executableIdentity.installRoot,
      authenticodeStatus: executableIdentity.signatureStatus,
      authenticodeSigner: executableIdentity.signerSubject,
      userAgent: component.browser.userAgent,
      isolation: 'one-owned-edge-process-with-fresh-contexts-per-arena-role',
    },
    runtime: {
      requestedBackend: runtime.requestedBackend,
      actualBackend: runtime.actualBackend,
      initialized: runtime.initialized,
      adapterClass: runtime.adapterClass,
      deviceClass: runtime.deviceClass,
      adapterLabel: runtime.adapterLabel,
      softwareAdapter: runtime.softwareAdapter,
      deviceLost: runtime.deviceLost,
      uncapturedErrors: runtime.uncapturedErrors,
      presentationStatus: runtime.presentation?.status,
    },
    tooling,
    coverage: PASS71_HF296_CONTACT_COVERAGE,
    matrix: {
      local: {
        count: component.localCells.length,
        keySha256: PASS71_HF296_LOCAL_KEY_SHA256,
        ...embeddedKeySet(component.localCells.map((cell) => pass71Hf296LocalKey(cell))),
        ...embeddedEvidence(component.localCells),
      },
      remoteProjection: {
        count: component.remoteCells.length,
        keySha256: PASS71_HF296_REMOTE_KEY_SHA256,
        ...embeddedKeySet(component.remoteCells.map((cell) => pass71Hf296RemoteKey(cell))),
        ...embeddedEvidence(component.remoteCells),
      },
      weaponCatalog: {
        count: component.weaponCatalog.length,
        weapons: component.weaponCatalog.map((entry) => entry.weapon),
        ...embeddedEvidence(component.weaponCatalog),
      },
    },
    visualAttachments,
    faults: [],
  };
  record.receiptSha256 = pass71Hf296ContactRecordSha256(record);
  assertPass71Hf296ContactEvidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
  const receiptFileSha256 = writeReceipt(record);
  process.stdout.write(`${JSON.stringify({
    status: 'passed', evidenceId: 'HF-296', closesFeedback: true,
    sourceSha: expectedSourceSha, receiptPath, receiptFileSha256,
    canonicalReceiptSha256: record.receiptSha256,
    localCells: record.matrix.local.count,
    remoteProjectionCells: record.matrix.remoteProjection.count,
    losslessEmbeddedVisualCells: record.visualAttachments.length,
    recordJsonBytes: Buffer.byteLength(JSON.stringify(record), 'utf8'),
    maxRecordJsonBytes: PASS71_HF296_MAX_RECORD_JSON_BYTES,
    weaponCatalogEntries: record.matrix.weaponCatalog.count,
  }, null, 2)}\n`);
}

let failure = null;
try {
  await main();
} catch (error) {
  failure = error;
} finally {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
}
if (failure) {
  process.stderr.write(`${failure instanceof Error ? failure.stack ?? failure.message : String(failure)}\n`);
  process.exitCode = 1;
}
