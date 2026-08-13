import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  PASS71_HF297_FULL_ARMS_EVIDENCE,
  PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES,
  PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES,
  PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY,
  PASS71_HF297_FULL_ARMS_TOOL_PATHS,
  assertPass71Hf297FullArmsEvidence,
  createPass71Hf297FullArmsEmbeddedMatrix,
  pass71Hf297FullArmsCoverage,
  pass71Hf297FullArmsEncodedRecordBytes,
  pass71Hf297FullArmsRecordSha256,
  pass71Hf297FullArmsSourceTreeAtSource,
  pass71Hf297FullArmsTelemetryCellSha256,
  pass71Hf297FullArmsToolingHashesAtSource,
  pass71Hf297FullVisualCrop,
} from './pass71-hf297-full-arms-evidence-contract.mjs';
import {
  PASS71_HF297_FULL_LOCAL_ROLES,
  PASS71_HF297_FULL_RENDERERS,
  PASS71_HF297_FULL_VIEWPORTS,
  assertPass71Hf297FullExactSets,
  pass71Hf297FullCellIdentity,
  pass71Hf297FullVisualKeys,
  pass71Hf297SourceCatalogAtSource,
} from './pass71-hf297-full-arms-matrix.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function parseArgs(argv) {
  const values = {};
  const allowed = new Set([
    'expected-source-sha', 'machine', 'preview-port', 'peer-port', 'edge-executable',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-297 full-arms expected --name value; received ${token ?? '(missing)'}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) {
      throw new Error(`HF-297 full-arms rejected unknown or duplicate argument --${key}`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`HF-297 ${label} port must be from 1024 through 65535`);
  }
  return port;
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runNode(label, args, environment) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw new Error(`${label} failed to launch: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}`);
  if ((result.status ?? 1) !== 0) throw new Error(`${label} failed with exit ${result.status ?? 1}`);
}

function installedEdge(override) {
  const candidates = [
    override,
    process.env.PASS71_HF297_FULL_EDGE_EXECUTABLE,
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((value) => resolve(value));
  return candidates.find((path) => existsSync(path));
}

function exactComponent(component, sourceSha, catalog) {
  const keys = [
    'schemaVersion', 'contract', 'status', 'expectedSourceSha', 'checkoutSourceSha',
    'servedCandidate', 'sourceCatalog', 'runtimeScopes', 'cells', 'visualAttachments', 'faults',
  ].sort();
  if (!component || typeof component !== 'object' || Array.isArray(component)
    || !sameJson(Object.keys(component).sort(), keys)
    || component.schemaVersion !== 1
    || component.contract !== 'atomic-acres/pass71-hf297-full-arms-matrix-component@1'
    || component.status !== 'passed' || component.expectedSourceSha !== sourceSha
    || component.checkoutSourceSha !== sourceSha || !sameJson(component.sourceCatalog, catalog)
    || !Array.isArray(component.runtimeScopes)
    || component.runtimeScopes.length !== PASS71_HF297_FULL_RENDERERS.length * PASS71_HF297_FULL_LOCAL_ROLES.length
    || !Array.isArray(component.cells) || !Array.isArray(component.visualAttachments)
    || !Array.isArray(component.faults) || component.faults.length !== 0) {
    throw new Error('HF-297 full-arms browser component identity or source-derived catalog is invalid');
  }
  const candidate = component.servedCandidate;
  if (!candidate || candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== 'PASS 71' || candidate.sourceSha !== sourceSha
    || candidate.path !== 'channels/the-big-one' || !SHA256.test(candidate.treeSha256 ?? '')
    || !Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2) {
    throw new Error('HF-297 full-arms staged candidate identity is invalid');
  }
  assertPass71Hf297FullExactSets({
    telemetryKeys: component.cells.map((cell) => cell?.key),
    visualKeys: component.visualAttachments.map((attachment) => attachment?.key),
  }, catalog);
  return component;
}

function embedVisualAttachments(component, visualRoot, sourceSha, catalog) {
  const expectedKeys = pass71Hf297FullVisualKeys(catalog);
  const cellMap = new Map(component.cells.map((cell) => [cell.key, cell]));
  const rawByKey = new Map(component.visualAttachments.map((attachment) => [attachment.key, attachment]));
  return expectedKeys.map((key) => {
    const raw = rawByKey.get(key);
    const identity = pass71Hf297FullCellIdentity(key);
    const viewport = PASS71_HF297_FULL_VIEWPORTS.find((entry) => entry.id === identity?.viewportId);
    const crop = viewport ? pass71Hf297FullVisualCrop(viewport) : null;
    const expectedFilename = `${sha256(Buffer.from(key, 'utf8'))}.png`;
    if (!raw || !identity || raw.filename !== expectedFilename || !sameJson({
      renderer: raw.renderer,
      role: raw.role,
      viewportId: raw.viewportId,
      poseStateId: raw.poseStateId,
      weapon: raw.weapon,
      action: raw.action,
    }, identity) || !Number.isSafeInteger(raw.presentedFrame) || raw.presentedFrame < 1
      || raw.presentationStatus !== (identity.renderer === 'webgpu' ? 'healthy' : 'synchronous')
      || !Number.isSafeInteger(raw.submissionSequence) || !Number.isSafeInteger(raw.completedSequence)
      || (identity.renderer === 'webgpu'
        ? raw.submissionSequence <= 0 || raw.completedSequence < raw.submissionSequence
        : raw.submissionSequence !== 0 || raw.completedSequence !== 0)
      || raw.viewportWidth !== viewport?.width || raw.viewportHeight !== viewport?.height
      || raw.cropX !== crop?.x || raw.cropY !== crop?.y
      || raw.cropWidth !== crop?.width || raw.cropHeight !== crop?.height
      || raw.cropPolicy !== crop?.policy) {
      throw new Error(`HF-297 visual attribution is invalid for ${JSON.stringify(identity)}`);
    }
    const path = resolve(visualRoot, expectedFilename);
    if (!existsSync(path)) throw new Error(`HF-297 visual source is absent: ${expectedFilename}`);
    const bytes = readFileSync(path);
    if (bytes.length <= 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
      || bytes.toString('ascii', 12, 16) !== 'IHDR'
      || bytes.length > PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES
      || bytes.readUInt32BE(16) !== crop.width || bytes.readUInt32BE(20) !== crop.height) {
      throw new Error(`HF-297 visual source is not the exact lossless attribution-control crop: ${expectedFilename}`);
    }
    const cell = cellMap.get(key);
    if (!cell) throw new Error(`HF-297 visual source has no telemetry cell: ${expectedFilename}`);
    return {
      key,
      ...identity,
      sourceSha,
      presentedFrame: raw.presentedFrame,
      presentationStatus: raw.presentationStatus,
      submissionSequence: raw.submissionSequence,
      completedSequence: raw.completedSequence,
      telemetryCellSha256: pass71Hf297FullArmsTelemetryCellSha256(cell),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      cropX: crop.x,
      cropY: crop.y,
      cropWidth: crop.width,
      cropHeight: crop.height,
      cropPolicy: crop.policy,
      mimeType: 'image/png',
      encoding: 'lossless-png-embedded-base64',
      byteLength: bytes.length,
      width: crop.width,
      height: crop.height,
      sha256: sha256(bytes),
      pngBase64: bytes.toString('base64'),
    };
  });
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-297 full-arms requires --expected-source-sha <40 lowercase hex candidate A>');
}
if (args.machine !== 'dave-gaming-pc') {
  throw new Error('HF-297 full-arms evidence is scoped to --machine dave-gaming-pc');
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-297 full-arms requires win32/x64; received ${process.platform}/${process.arch}`);
}
const previewPort = boundedPort(args['preview-port'] ?? '4596', 'preview');
const peerPort = boundedPort(args['peer-port'] ?? '4597', 'peer');
if (previewPort === peerPort) throw new Error('HF-297 preview and peer ports must be distinct');
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-297 full-arms requires one completely clean exact candidate A (${expectedSourceSha})`);
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-297 full-arms rejects Vite overrides: ${[
    ...localViteOverrides, ...inheritedViteVariables,
  ].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
if (releaseChannels?.experimental?.pass !== 'PASS 71'
  || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-297 full-arms requires the canonical Pass 71 candidate channel');
}
const edgeExecutable = installedEdge(args['edge-executable']);
if (!edgeExecutable || basename(edgeExecutable).toLowerCase() !== 'msedge.exe') {
  throw new Error('HF-297 full-arms requires an installed Microsoft Edge executable');
}
const edgeIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
const sourceCatalog = pass71Hf297SourceCatalogAtSource(root, expectedSourceSha);
const artifactRoot = resolve(root, 'artifacts/pass71/hf297-full-arms');
const componentRoot = resolve(artifactRoot, 'components');
const visualRoot = resolve(componentRoot, 'visual');
const browserComponentPath = resolve(componentRoot, 'component.json');
rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(componentRoot, { recursive: true });
const startedAt = new Date().toISOString();
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const exactEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: 'production',
  SOURCE_SHA: expectedSourceSha,
  RELEASE_PASS: 'PASS 71',
  VITE_MATCH_BUILD_ID: expectedSourceSha,
};
runNode('HF-297 full-arms lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], exactEnvironment);
runNode('HF-297 installed-Edge native full-arms matrix', [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass71-hf297-full-arms-matrix.spec.ts',
  '--project=chromium', '--workers=1', '--retries=0',
], {
  ...exactEnvironment,
  QA_INSTALLED_EDGE: '1',
  QA_PREVIEW_PORT: String(previewPort),
  PASS71_HF297_FULL_EDGE_EXECUTABLE: edgeExecutable,
  PASS71_HF297_FULL_ARMS: '1',
  PASS71_HF297_FULL_SOURCE_SHA: expectedSourceSha,
  PASS71_HF297_FULL_COMPONENT_DIR: componentRoot,
  PASS71_HF297_FULL_PEER_PORT: String(peerPort),
});
if (!existsSync(browserComponentPath)) {
  throw new Error('HF-297 full-arms native browser component receipt was not emitted');
}
const component = exactComponent(
  JSON.parse(readFileSync(browserComponentPath, 'utf8')),
  expectedSourceSha,
  sourceCatalog,
);
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-297 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
const sourceTreeSha = pass71Hf297FullArmsSourceTreeAtSource(root, expectedSourceSha);
const tooling = pass71Hf297FullArmsToolingHashesAtSource(root, expectedSourceSha);
const matrix = { telemetry: createPass71Hf297FullArmsEmbeddedMatrix(component.cells, sourceCatalog) };
const visualAttachments = embedVisualAttachments(
  component, visualRoot, expectedSourceSha, sourceCatalog,
);
const record = {
  ...PASS71_HF297_FULL_ARMS_EVIDENCE,
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
  environment: { machine: args.machine, platform: process.platform, arch: process.arch },
  browser: {
    channel: 'msedge',
    installed: true,
    executableName: 'msedge.exe',
    executableSha256: sha256(readFileSync(edgeExecutable)),
    productVersion: edgeIdentity.productVersion,
    installRoot: edgeIdentity.installRoot,
    authenticodeStatus: edgeIdentity.signatureStatus,
    authenticodeSigner: edgeIdentity.signerSubject,
    isolation: 'one-owned-signed-edge-process-with-fresh-contexts-per-renderer-role',
  },
  tooling,
  sourceCatalog,
  coverage: pass71Hf297FullArmsCoverage(sourceCatalog),
  sizePolicy: PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY,
  runtimeScopes: component.runtimeScopes,
  matrix,
  visualAttachments,
  faults: [],
};
record.receiptSha256 = pass71Hf297FullArmsRecordSha256(record);
assertPass71Hf297FullArmsEvidence(record, {
  sourceSha: expectedSourceSha,
  sourceTreeSha,
  tooling,
  catalog: sourceCatalog,
});
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
const temporaryPath = `${receiptPath}.tmp`;
const encodedRecord = `${JSON.stringify(record)}\n`;
const encodedRecordBytes = Buffer.byteLength(encodedRecord, 'utf8');
if (encodedRecordBytes !== pass71Hf297FullArmsEncodedRecordBytes(record)
  || encodedRecordBytes > PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES) {
  throw new Error(`HF-297 inline evidence record is ${encodedRecordBytes} bytes; maximum is ${PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES}`);
}
writeFileSync(temporaryPath, encodedRecord, 'utf8');
renameSync(temporaryPath, receiptPath);
process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  evidenceId: record.evidenceId,
  kind: record.kind,
  closesFeedback: record.closesFeedback,
  closingAuthority: record.closingAuthority,
  sourceSha: expectedSourceSha,
  weaponCount: sourceCatalog.weaponIds.length,
  actionTargets: 81,
  telemetryCells: component.cells.length,
  embeddedLosslessPngs: visualAttachments.length,
  attributionCrop: { width: 128, height: 72 },
  encodedRecordBytes,
  maximumEncodedRecordBytes: PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES,
  runtimeScopes: component.runtimeScopes.map((scope) => `${scope.renderer}/${scope.role}`),
  receiptSha256: record.receiptSha256,
  receiptPath,
  toolingPaths: Object.values(PASS71_HF297_FULL_ARMS_TOOL_PATHS).length,
}, null, 2)}\n`);
