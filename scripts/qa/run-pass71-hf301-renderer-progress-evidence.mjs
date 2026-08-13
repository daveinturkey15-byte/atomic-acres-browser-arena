import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  PASS71_HF301_COVERAGE,
  PASS71_HF301_RENDERER_PROGRESS_EVIDENCE,
  PASS71_HF301_RENDERERS,
  assertPass71Hf301Evidence,
  pass71Hf301OwnerReplayAtSource,
  pass71Hf301RecordSha256,
  pass71Hf301SourceTreeAtSource,
  pass71Hf301ToolingHashesAtSource,
} from './pass71-hf301-renderer-progress-evidence-contract.mjs';
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
      throw new Error(`HF-301 expected --name value; received ${token ?? '(missing)'}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) {
      throw new Error(`HF-301 rejected unknown or duplicate argument --${key}`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

function boundedPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('HF-301 preview port must be from 1024 through 65535');
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
    process.env.PASS71_HF301_EDGE_EXECUTABLE,
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
    || component.contract !== 'atomic-acres/pass71-hf301-renderer-progress-browser-component@1'
    || component.status !== 'passed' || component.expectedSourceSha !== sourceSha
    || component.checkoutSourceSha !== sourceSha || !Array.isArray(component.scopes)
    || component.scopes.length !== PASS71_HF301_RENDERERS.length
    || JSON.stringify(component.scopes.map((scope) => scope?.renderer)) !== JSON.stringify(PASS71_HF301_RENDERERS)
    || !Array.isArray(component.faults) || component.faults.length !== 0) {
    throw new Error(`HF-301 browser component is invalid: ${JSON.stringify(component)}`);
  }
  return component;
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-301 requires --expected-source-sha <40 lowercase hex candidate A>');
}
if (args.machine !== 'dave-gaming-pc') {
  throw new Error('HF-301 release evidence is scoped to --machine dave-gaming-pc');
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-301 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const previewPort = boundedPort(args['preview-port'] ?? '4591');
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-301 requires one completely clean exact candidate A (${expectedSourceSha})`);
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-301 rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
if (releaseChannels?.experimental?.pass !== 'PASS 71'
  || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-301 requires the canonical Pass 71 candidate channel');
}
const edgeExecutable = installedEdge(args['edge-executable']);
if (!edgeExecutable || basename(edgeExecutable).toLowerCase() !== 'msedge.exe') {
  throw new Error('HF-301 requires an installed Microsoft Edge executable');
}
const edgeIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
const artifactRoot = resolve(root, 'artifacts/pass71/hf301-renderer-progress');
const componentRoot = resolve(artifactRoot, 'components');
const ownerReplayPath = resolve(componentRoot, 'real-owner-replay.json');
const browserComponentPath = resolve(componentRoot, 'native-action-matrix.json');
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
runNode('HF-301 exact owner replay', [
  'node_modules/tsx/dist/cli.mjs',
  'scripts/qa/capture-pass71-hf301-renderer-owner.mts',
  '--output', ownerReplayPath,
], exactEnvironment);
runNode('HF-301 installed-Edge native renderer matrix', [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass71-hf301-renderer-progress.spec.ts',
  '--project=chromium', '--workers=1', '--retries=0',
], {
  ...exactEnvironment,
  QA_INSTALLED_EDGE: '1',
  QA_PREVIEW_PORT: String(previewPort),
  PASS71_HF301_EDGE_EXECUTABLE: edgeExecutable,
  PASS71_HF301_EXPECTED_SOURCE_SHA: expectedSourceSha,
  PASS71_HF301_COMPONENT_PATH: browserComponentPath,
});
if (!existsSync(ownerReplayPath) || !existsSync(browserComponentPath)) {
  throw new Error('HF-301 required component receipt was not emitted');
}
const ownerReplay = JSON.parse(readFileSync(ownerReplayPath, 'utf8'));
const expectedOwnerReplay = pass71Hf301OwnerReplayAtSource(root, expectedSourceSha);
if (JSON.stringify(ownerReplay) !== JSON.stringify(expectedOwnerReplay)) {
  throw new Error(`HF-301 owner replay drifted from candidate A: ${JSON.stringify(ownerReplay)}`);
}
const browserComponent = exactComponent(JSON.parse(readFileSync(browserComponentPath, 'utf8')), expectedSourceSha);
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-301 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
const sourceTreeSha = pass71Hf301SourceTreeAtSource(root, expectedSourceSha);
const tooling = pass71Hf301ToolingHashesAtSource(root, expectedSourceSha);
const scopes = browserComponent.scopes;
const servedCandidate = scopes[0].servedCandidate;
if (scopes.some((scope) => JSON.stringify(scope.servedCandidate) !== JSON.stringify(servedCandidate))) {
  throw new Error('HF-301 staged candidate identity drifted between renderer scopes');
}
const record = {
  ...PASS71_HF301_RENDERER_PROGRESS_EVIDENCE,
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
    executableVersion: edgeIdentity.productVersion,
    authenticodeStatus: edgeIdentity.signatureStatus,
    authenticodeSigner: edgeIdentity.signerSubject,
    userAgents: scopes.map((scope) => scope.browser.userAgent),
  },
  tooling,
  coverage: PASS71_HF301_COVERAGE,
  ownerReplay,
  scopes,
  faults: [],
};
record.receiptSha256 = pass71Hf301RecordSha256(record);
assertPass71Hf301Evidence(record, {
  sourceSha: expectedSourceSha,
  sourceTreeSha,
  tooling,
  ownerReplay: expectedOwnerReplay,
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
  traces: record.scopes.reduce((count, scope) => count + scope.traces.length, 0),
  liveNoProgressThresholdMs: record.liveNoProgressThresholdMs,
  receiptSha256: record.receiptSha256,
  receiptPath,
}, null, 2)}\n`);
