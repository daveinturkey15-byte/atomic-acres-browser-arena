import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  PASS71_HF306_COCKPIT_EVIDENCE,
  PASS71_HF306_COVERAGE,
  PASS71_HF306_RENDERERS,
  PASS71_HF306_UNKNOWNS,
  assertPass71Hf306Evidence,
  pass71Hf306AssetAuditAtSource,
  pass71Hf306OwnerSourceAuditAtSource,
  pass71Hf306RecordSha256,
  pass71Hf306SourceTreeAtSource,
  pass71Hf306ToolingHashesAtSource,
} from './pass71-hf306-cockpit-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const SHA40 = /^[a-f0-9]{40}$/u;

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(['expected-source-sha', 'machine', 'preview-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-306 expected --name value; received ${token ?? '(missing)'}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) {
      throw new Error(`HF-306 rejected unknown or duplicate argument --${key}`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

function boundedPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('HF-306 preview port must be from 1024 through 65535');
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

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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
    process.env.PASS71_HF306_EDGE_EXECUTABLE,
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((value) => resolve(value));
  return candidates.find((path) => existsSync(path));
}

function exactComponent(component, sourceSha) {
  const keys = [
    'schemaVersion', 'contract', 'status', 'expectedSourceSha', 'checkoutSourceSha', 'scopes', 'faults',
  ].sort();
  if (!component || typeof component !== 'object' || Array.isArray(component)
    || JSON.stringify(Object.keys(component).sort()) !== JSON.stringify(keys)
    || component.schemaVersion !== 1
    || component.contract !== 'atomic-acres/pass71-hf306-cockpit-browser-component@1'
    || component.status !== 'passed' || component.expectedSourceSha !== sourceSha
    || component.checkoutSourceSha !== sourceSha || !Array.isArray(component.scopes)
    || component.scopes.length !== PASS71_HF306_RENDERERS.length
    || JSON.stringify(component.scopes.map((scope) => scope?.renderer)) !== JSON.stringify(PASS71_HF306_RENDERERS)
    || !Array.isArray(component.faults) || component.faults.length !== 0) {
    throw new Error('HF-306 browser component identity or exact renderer set is invalid');
  }
  return component;
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-306 requires --expected-source-sha <40 lowercase hex candidate A>');
}
if (args.machine !== 'dave-gaming-pc') {
  throw new Error('HF-306 release evidence is scoped to --machine dave-gaming-pc');
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-306 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const previewPort = boundedPort(args['preview-port'] ?? '4596');
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-306 requires one completely clean exact candidate A (${expectedSourceSha})`);
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-306 rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
if (releaseChannels?.experimental?.pass !== 'PASS 71'
  || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-306 requires the canonical Pass 71 candidate channel');
}
const edgeExecutable = installedEdge(args['edge-executable']);
if (!edgeExecutable || basename(edgeExecutable).toLowerCase() !== 'msedge.exe') {
  throw new Error('HF-306 requires an installed Microsoft Edge executable');
}
const edgeIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
const artifactRoot = resolve(root, 'artifacts/pass71/hf306-cockpit');
const componentRoot = resolve(artifactRoot, 'components');
const browserComponentPath = resolve(componentRoot, 'native-cockpit-matrix.json');
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
runNode('HF-306 lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], exactEnvironment);
runNode('HF-306 installed-Edge native cockpit matrix', [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass71-hf306-cockpit-framing.spec.ts',
  '--project=chromium', '--workers=1', '--retries=0',
], {
  ...exactEnvironment,
  QA_INSTALLED_EDGE: '1',
  QA_PREVIEW_PORT: String(previewPort),
  PASS71_HF306_EDGE_EXECUTABLE: edgeExecutable,
  PASS71_HF306_EXPECTED_SOURCE_SHA: expectedSourceSha,
  PASS71_HF306_COMPONENT_PATH: browserComponentPath,
});
if (!existsSync(browserComponentPath)) {
  throw new Error('HF-306 required native cockpit component receipt was not emitted');
}
const browserComponent = exactComponent(
  JSON.parse(readFileSync(browserComponentPath, 'utf8')),
  expectedSourceSha,
);
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-306 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
const sourceTreeSha = pass71Hf306SourceTreeAtSource(root, expectedSourceSha);
const tooling = pass71Hf306ToolingHashesAtSource(root, expectedSourceSha);
const assetAudit = pass71Hf306AssetAuditAtSource(root, expectedSourceSha);
const ownerSourceAudit = pass71Hf306OwnerSourceAuditAtSource(root, expectedSourceSha);
const scopes = browserComponent.scopes;
const servedCandidate = scopes[0].servedCandidate;
if (scopes.some((scope) => JSON.stringify(scope.servedCandidate) !== JSON.stringify(servedCandidate))) {
  throw new Error('HF-306 staged candidate identity drifted between renderer scopes');
}
const record = {
  ...PASS71_HF306_COCKPIT_EVIDENCE,
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
  servedCandidate,
  environment: { machine: args.machine, platform: process.platform, arch: process.arch },
  browser: {
    channel: 'msedge',
    installed: true,
    executableName: 'msedge.exe',
    executableSha256: sha256File(edgeExecutable),
    productVersion: edgeIdentity.productVersion,
    authenticodeStatus: edgeIdentity.signatureStatus,
    authenticodeSigner: edgeIdentity.signerSubject,
    userAgents: scopes.map((scope) => scope.browser.userAgent),
  },
  tooling,
  coverage: PASS71_HF306_COVERAGE,
  assetAudit,
  ownerSourceAudit,
  scopes,
  unknowns: PASS71_HF306_UNKNOWNS,
  faults: [],
};
record.receiptSha256 = pass71Hf306RecordSha256(record);
assertPass71Hf306Evidence(record, {
  sourceSha: expectedSourceSha,
  sourceTreeSha,
  tooling,
  assetAudit,
  ownerSourceAudit,
});
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
const temporaryPath = `${receiptPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, receiptPath);
process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  evidenceId: record.evidenceId,
  closesFeedback: record.closesFeedback,
  sourceSha: expectedSourceSha,
  renderers: record.scopes.map((scope) => scope.renderer),
  viewportCases: record.scopes.reduce((count, scope) => count + scope.viewportCases.length, 0),
  actionCells: record.scopes.reduce((count, scope) => count
    + scope.viewportCases.reduce((subtotal, viewportCase) => subtotal + viewportCase.actions.length, 0), 0),
  attributionPairs: record.scopes.reduce((count, scope) => count + scope.viewportCases.length, 0),
  receiptSha256: record.receiptSha256,
  receiptPath,
}, null, 2)}\n`);
