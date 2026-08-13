import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  PASS71_HF296_COMPONENT_DEFINITIONS,
  PASS71_HF296_CONTACT_COVERAGE,
  PASS71_HF296_CONTACT_EVIDENCE,
  PASS71_HF296_VISUAL_IDENTITIES,
  assertPass71Hf296ContactEvidence,
  pass71Hf296ContactRecordSha256,
  pass71Hf296ContactToolingHashes,
} from './pass71-hf296-contact-evidence-contract.mjs';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass71/hf296-contact-evidence');
const componentsRoot = resolve(artifactRoot, 'components');
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}`);
    const equals = token.indexOf('=');
    if (equals > 2) {
      values[token.slice(2, equals)] = token.slice(equals + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) values[token.slice(2)] = true;
    else {
      values[token.slice(2)] = next;
      index += 1;
    }
  }
  return values;
}

function git(...args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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

function exactArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} matrix drifted: ${JSON.stringify(actual)}`);
  }
}

function copyReceipt(definition, index, sourcePath, validate) {
  const absoluteSource = resolve(root, sourcePath);
  if (!existsSync(absoluteSource)) throw new Error(`${definition.id} did not emit ${sourcePath}`);
  const bytes = readFileSync(absoluteSource);
  const receipt = JSON.parse(bytes.toString('utf8'));
  validate(receipt);
  const relativePath = `artifacts/pass71/hf296-contact-evidence/components/${String(index + 1).padStart(2, '0')}-${definition.id}.json`;
  const destination = resolve(root, relativePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  return {
    receipt,
    identity: {
      receiptPath: relativePath,
      receiptSha256: sha256Bytes(bytes),
      receiptByteLength: bytes.byteLength,
    },
  };
}

function validateProneReceipt(receipt, renderer, sourceSha) {
  if (receipt?.schema !== 'atomic-acres/pass66-prone-contact-matrix@1'
    || receipt.status !== 'PASS' || receipt.sourceSha !== sourceSha || receipt.renderer !== renderer) {
    throw new Error(`HF-296 ${renderer} prone-contact receipt identity is invalid`);
  }
  exactArray(receipt.contract?.arenas,
    PASS71_HF296_CONTACT_COVERAGE.liveProneContact.arenaIds, `${renderer} prone arenas`);
  exactArray(receipt.contract?.renderProfiles,
    PASS71_HF296_CONTACT_COVERAGE.liveProneContact.renderProfiles, `${renderer} prone profiles`);
  exactArray(receipt.contract?.actions,
    PASS71_HF296_CONTACT_COVERAGE.liveProneContact.soloActions, `${renderer} prone actions`);
  if (receipt.contract?.soloCells !== 12 || receipt.contract?.twoPeerCells !== 12
    || !Array.isArray(receipt.solo) || receipt.solo.length !== 12
    || !Array.isArray(receipt.multiplayer) || receipt.multiplayer.length !== 12) {
    throw new Error(`HF-296 ${renderer} prone-contact receipt is incomplete`);
  }
  const expectedCells = new Set();
  for (const profile of PASS71_HF296_CONTACT_COVERAGE.liveProneContact.renderProfiles) {
    for (const arena of PASS71_HF296_CONTACT_COVERAGE.liveProneContact.arenaIds) {
      expectedCells.add(`${arena}/${profile}`);
    }
  }
  for (const [kind, rows] of [['solo', receipt.solo], ['multiplayer', receipt.multiplayer]]) {
    const cells = new Set(rows.map((row) => `${row?.arena ?? ''}/${row?.profile ?? ''}`));
    if (cells.size !== expectedCells.size || [...expectedCells].some((cell) => !cells.has(cell))) {
      throw new Error(`HF-296 ${renderer} ${kind} prone-contact matrix is stale`);
    }
  }
}

function validateNearPlaneReceipt(receipt, renderer, sourceSha, releasePass) {
  if (receipt?.schemaVersion !== 3 || receipt.status !== 'PASS'
    || receipt.contract !== 'atomic-acres/pass69-3-authored-near-plane-catalog@3'
    || receipt.sourceSha !== sourceSha || receipt.endingSourceSha !== sourceSha
    || receipt.cleanSource !== true || receipt.renderer !== renderer
    || receipt.renderProfile !== 'blender' || receipt.browser?.channel !== 'msedge'
    || !/Edg\//u.test(receipt.browser?.userAgent ?? '')
    || receipt.servedCandidate?.sourceSha !== sourceSha
    || receipt.servedCandidate?.releasePass !== releasePass
    || receipt.servedCandidate?.channel !== 'the-big-one'
    || receipt.servedCandidate?.path !== 'channels/the-big-one'
    || !SHA256.test(receipt.servedCandidate?.treeSha256 ?? '')
    || !Number.isSafeInteger(receipt.servedCandidate?.exactRootFileCount)
    || receipt.servedCandidate.exactRootFileCount < 2
    || receipt.runtimeBefore?.actualBackend !== renderer
    || receipt.runtimeAfter?.actualBackend !== renderer
    || receipt.runtimeBefore?.softwareAdapter !== false
    || receipt.runtimeAfter?.softwareAdapter !== false
    || !Array.isArray(receipt.browserErrors) || receipt.browserErrors.length !== 0) {
    throw new Error(`HF-296 ${renderer} near-plane receipt identity/provenance is invalid`);
  }
  exactArray(receipt.catalog?.weapons,
    PASS71_HF296_CONTACT_COVERAGE.authoredNearPlane.weapons, `${renderer} near-plane weapons`);
  exactArray(receipt.catalog?.fireKickAgesMs,
    PASS71_HF296_CONTACT_COVERAGE.authoredNearPlane.fireKickAgesMs, `${renderer} fire ages`);
  exactArray(receipt.catalog?.reloadProgressSamples,
    PASS71_HF296_CONTACT_COVERAGE.authoredNearPlane.reloadProgressSamples, `${renderer} reload samples`);
  if (!Array.isArray(receipt.weapons)
    || receipt.weapons.length !== PASS71_HF296_CONTACT_COVERAGE.authoredNearPlane.weapons.length
    || receipt.weapons.some((entry, index) => (
      entry?.weapon !== PASS71_HF296_CONTACT_COVERAGE.authoredNearPlane.weapons[index]
      || !SHA256.test(entry?.screenshot?.sha256 ?? '')
    ))) throw new Error(`HF-296 ${renderer} near-plane weapon evidence is incomplete`);
}

function validateViewmodelReceipt(receipt, sourceSha) {
  if (receipt?.schema !== 'atomic-acres/pass66-viewmodel-framing@2'
    || receipt.verdict !== 'pass' || receipt.sourceRevision !== sourceSha
    || receipt.sourceState?.revision !== sourceSha || receipt.sourceState?.endingRevision !== sourceSha
    || receipt.sourceState?.expectedRevision !== sourceSha
    || receipt.sourceState?.exactSource !== true || receipt.sourceState?.cleanBefore !== true
    || receipt.sourceState?.cleanAfter !== true || receipt.sourceState?.dirtyDevelopmentCapture !== false
    || receipt.captureMode !== 'paused'
    || !receipt.route?.includes('renderer=webgl2') || !receipt.route.includes('render=blender')
    || !receipt.route.includes('map=gun-range')
    || !Array.isArray(receipt.browserErrors) || receipt.browserErrors.length !== 0
    || !Array.isArray(receipt.violations) || receipt.violations.length !== 0) {
    throw new Error('HF-296 viewmodel-framing receipt identity is invalid');
  }
  exactArray(receipt.viewports?.map((viewport) => viewport.id),
    PASS71_HF296_CONTACT_COVERAGE.viewportPresentation.viewports, 'viewmodel viewports');
  if (receipt.contactSheet !== 'artifacts/pass66/viewmodel-framing/contact-sheet.png'
    || receipt.temporalContactSheet !== 'artifacts/pass66/viewmodel-framing/temporal-contact-strip.png') {
    throw new Error('HF-296 viewmodel lossless contact sheets are missing');
  }
}

function pngMetadata(path) {
  const bytes = readFileSync(path);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length <= 24 || !bytes.subarray(0, 8).equals(signature)
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${path} is not a canonical PNG`);
  return {
    sha256: sha256Bytes(bytes),
    byteLength: bytes.byteLength,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function copyVisualAttachments() {
  return PASS71_HF296_VISUAL_IDENTITIES.map((identity) => {
    const source = resolve(root, identity.sourceArtifactPath);
    const destination = resolve(root, identity.path);
    if (!existsSync(source)) throw new Error(`HF-296 visual attachment is missing: ${identity.sourceArtifactPath}`);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    const sourceMetadata = pngMetadata(source);
    const copiedMetadata = pngMetadata(destination);
    if (JSON.stringify(sourceMetadata) !== JSON.stringify(copiedMetadata)
      || statSync(source).size !== statSync(destination).size) {
      throw new Error(`HF-296 visual attachment copy changed bytes: ${identity.sourceArtifactPath}`);
    }
    return {
      ...identity,
      mimeType: 'image/png',
      encoding: 'lossless-png',
      copyMode: 'byte-exact',
      ...copiedMetadata,
    };
  });
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-296 requires --expected-source-sha=<40 lowercase hex candidate A>');
}
if (args.machine && args.machine !== 'dave-gaming-pc') {
  throw new Error('HF-296 release evidence is scoped to --machine=dave-gaming-pc');
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-296 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-296 requires one completely clean candidate A (${expectedSourceSha})`);
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env)
  .filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-296 rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
const releasePass = releaseChannels?.experimental?.pass;
if (releasePass !== 'PASS 71' || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-296 requires the canonical Pass 71 staged channel');
}

rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(componentsRoot, { recursive: true });
const startedAt = new Date().toISOString();
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const stagedEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: 'production',
  SOURCE_SHA: expectedSourceSha,
  RELEASE_PASS: releasePass,
  VITE_MATCH_BUILD_ID: expectedSourceSha,
};

runNode('HF-296 lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], inheritedEnvironment);
runNode('HF-296 shipped Rapier capsule', [
  resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/player-capsule-contact.test.ts',
], inheritedEnvironment);

const componentResults = [{ receipt: null, identity: {} }];
for (const [renderer, index, previewPort, peerPort] of [
  ['webgl2', 1, '4550', '9081'],
  ['webgpu', 2, '4551', '9082'],
]) {
  runNode(`HF-296 ${renderer} prone contact`, ['scripts/qa/run-pass66-prone-contact-matrix.mjs'], {
    ...stagedEnvironment,
    PASS66_PRONE_CONTACT_RENDERER: renderer,
    PASS66_PRONE_CONTACT_PEER_PORT: peerPort,
    QA_PREVIEW_PORT: previewPort,
  });
  const definition = PASS71_HF296_COMPONENT_DEFINITIONS[index];
  componentResults[index] = copyReceipt(
    definition,
    index,
    'artifacts/pass66/prone-contact-matrix/receipt.json',
    (receipt) => validateProneReceipt(receipt, renderer, expectedSourceSha),
  );
}

for (const [target, renderer, index, previewPort] of [
  ['edge-webgl2', 'webgl2', 3, '4553'],
  ['edge-webgpu', 'webgpu', 4, '4554'],
]) {
  runNode(`HF-296 ${renderer} all-weapon near plane`, [
    'scripts/qa/run-pass69-3-authored-near-plane-catalog.mjs', target,
  ], {
    ...inheritedEnvironment,
    PASS69_3_NEAR_PLANE_RELEASE_PASS: releasePass,
    QA_PREVIEW_PORT: previewPort,
  });
  const definition = PASS71_HF296_COMPONENT_DEFINITIONS[index];
  componentResults[index] = copyReceipt(
    definition,
    index,
    `artifacts/pass69-3/authored-near-plane-catalog/receipt-${renderer}.json`,
    (receipt) => validateNearPlaneReceipt(receipt, renderer, expectedSourceSha, releasePass),
  );
}

runNode('HF-296 viewport viewmodel framing', ['scripts/qa/verify-pass66-viewmodel-framing.mjs'], {
  ...inheritedEnvironment,
  PASS66_VIEWMODEL_SOURCE_SHA: expectedSourceSha,
  PASS66_VIEWMODEL_CAPTURE_MODE: 'paused',
  PASS66_VIEWMODEL_PORT: '4555',
});
componentResults[5] = copyReceipt(
  PASS71_HF296_COMPONENT_DEFINITIONS[5],
  5,
  'artifacts/pass66/viewmodel-framing/receipt.json',
  (receipt) => validateViewmodelReceipt(receipt, expectedSourceSha),
);

const nearPlaneReceipts = [componentResults[3].receipt, componentResults[4].receipt];
const servedCandidate = nearPlaneReceipts[0].servedCandidate;
if (JSON.stringify(nearPlaneReceipts[1].servedCandidate) !== JSON.stringify(servedCandidate)) {
  throw new Error('HF-296 staged candidate changed between WebGL2 and WebGPU evidence');
}
const visualAttachments = copyVisualAttachments();
const components = PASS71_HF296_COMPONENT_DEFINITIONS.map((definition, index) => {
  const receipt = componentResults[index]?.receipt;
  const browser = definition.kind === 'unit' ? null : {
    channel: definition.id === 'viewmodel-framing-webgl2' ? 'chrome' : 'msedge',
    installedRequested: true,
    version: definition.id === 'viewmodel-framing-webgl2'
      ? receipt.browser
      : definition.id.startsWith('near-plane-') ? receipt.browser.version : 'not-recorded',
    userAgent: definition.id.startsWith('near-plane-') ? receipt.browser.userAgent : null,
    executableAttestation: 'not-recorded-by-composed-source-receipt',
  };
  return {
    id: definition.id,
    kind: definition.kind,
    status: 'passed',
    command: definition.command,
    renderer: definition.renderer,
    sourceSha: expectedSourceSha,
    provenanceMode: definition.provenanceMode,
    browser,
    receiptPath: componentResults[index]?.identity.receiptPath ?? null,
    receiptSha256: componentResults[index]?.identity.receiptSha256 ?? null,
    receiptByteLength: componentResults[index]?.identity.receiptByteLength ?? null,
    servedTreeSha256: definition.id.startsWith('near-plane-') ? servedCandidate.treeSha256 : null,
  };
});

const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-296 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
const tooling = pass71Hf296ContactToolingHashes(root);
const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
const record = {
  ...PASS71_HF296_CONTACT_EVIDENCE,
  startedAt,
  completedAt: new Date().toISOString(),
  source: {
    expectedSourceSha,
    checkoutSourceSha,
    endingCheckoutSourceSha,
    sourceTreeSha,
    releasePass,
    cleanBefore: true,
    cleanAfter,
  },
  servedCandidate,
  environment: { machine: 'dave-gaming-pc', platform: process.platform, arch: process.arch },
  tooling,
  coverage: PASS71_HF296_CONTACT_COVERAGE,
  components,
  visualAttachments,
  faults: [],
};
record.receiptSha256 = pass71Hf296ContactRecordSha256(record);
assertPass71Hf296ContactEvidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
const tempPath = `${receiptPath}.tmp`;
writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
renameSync(tempPath, receiptPath);
console.log(JSON.stringify({
  status: 'PASS',
  evidenceId: record.evidenceId,
  coverageDisposition: record.coverageDisposition,
  sourceSha: expectedSourceSha,
  stagedTreeSha256: servedCandidate.treeSha256,
  componentCount: components.length,
  visualAttachmentCount: visualAttachments.length,
  receiptSha256: record.receiptSha256,
  receiptPath,
}, null, 2));
