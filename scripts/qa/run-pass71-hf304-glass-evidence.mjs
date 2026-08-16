import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, resolve } from 'node:path';
import {
  PASS71_HF304_COVERAGE,
  PASS71_HF304_GLASS_EVIDENCE,
  PASS71_HF304_MACHINE_HOSTNAME_SHA256,
  PASS71_HF304_UNKNOWNS,
  assertPass71Hf304Evidence,
  pass71Hf304RecordSha256,
  pass71Hf304ToolingHashes,
} from './pass71-hf304-glass-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass71/hf304-glass-evidence');
const componentRoot = resolve(artifactRoot, 'components');
const mechanicalPath = resolve(componentRoot, '1-mechanical-full-cartesian.json');
const browserPath = resolve(componentRoot, '2-installed-edge-runtime-distinct-paths.json');
const SHA40 = /^[a-f0-9]{40}$/u;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected HF-304 argument ${token}`);
    const equals = token.indexOf('=');
    if (equals > 2) values[token.slice(2, equals)] = token.slice(equals + 1);
    else {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) values[token.slice(2)] = true;
      else {
        values[token.slice(2)] = next;
        index += 1;
      }
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

function sha256File(path) {
  return sha256Bytes(readFileSync(path));
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

function installedEdge() {
  const candidates = [
    process.env.PASS71_HF304_BROWSER_PATH,
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((candidate) => resolve(candidate));
  return candidates.find(existsSync);
}

function componentIdentity(index, id, kind, sourcePath, path) {
  const bytes = readFileSync(path);
  const embedded = JSON.parse(bytes.toString('utf8'));
  return {
    id,
    kind,
    status: 'passed',
    sourcePath,
    receiptPath: `artifacts/pass71/hf304-glass-evidence/components/${index}-${id}.json`,
    receiptSha256: sha256Bytes(bytes),
    receiptByteLength: bytes.length,
    embedded,
  };
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-304 requires --expected-source-sha=<40 lowercase hex candidate A>');
}
if (args.machine !== 'dave-gaming-pc') {
  throw new Error('HF-304 release evidence is scoped to --machine=dave-gaming-pc');
}
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-304 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const checkoutSourceSha = git('rev-parse', 'HEAD');
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-304 requires one completely clean candidate A (${expectedSourceSha})`);
}
const hostnameSha256 = sha256Bytes(Buffer.from(hostname().toLowerCase(), 'utf8'));
if (hostnameSha256 !== PASS71_HF304_MACHINE_HOSTNAME_SHA256) {
  throw new Error('HF-304 machine hostname does not match dave-gaming-pc');
}
const localViteOverrides = ['.env', '.env.local', '.env.production.local'].filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-304 rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
const releasePass = releaseChannels?.experimental?.pass;
if (releasePass !== 'PASS 71' || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-304 requires the canonical Pass 71 staged channel');
}
const edgeExecutable = installedEdge();
if (!edgeExecutable) throw new Error('HF-304 requires installed Microsoft Edge');
const executableIdentity = assertInstalledEdgeExecutableIdentity(
  readWindowsExecutableIdentity(edgeExecutable),
);
if (basename(edgeExecutable).toLowerCase() !== 'msedge.exe') {
  throw new Error(`HF-304 installed Edge executable name is invalid: ${basename(edgeExecutable)}`);
}

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
  RELEASE_PASS: releasePass,
  VITE_MATCH_BUILD_ID: expectedSourceSha,
  PASS71_HF304_EXPECTED_SOURCE_SHA: expectedSourceSha,
  PASS71_HF304_RELEASE_PASS: releasePass,
};
runNode('HF-304 lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], exactEnvironment);
runNode('HF-304 full Cartesian mechanical matrix', [
  'node_modules/tsx/dist/cli.mjs',
  'scripts/qa/capture-pass71-hf304-glass-matrix.ts',
  '--output', mechanicalPath,
], exactEnvironment);
runNode('HF-304 installed-Edge served runtime matrix', [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass71-glass-lifecycle-matrix.spec.ts',
  '--project=chromium', '--workers=1', '--retries=0',
], {
  ...exactEnvironment,
  QA_INSTALLED_EDGE: '1',
  PASS71_HF304_EDGE_EXECUTABLE: edgeExecutable,
  QA_PREVIEW_PORT: String(args['preview-port'] ?? '4573'),
  PASS71_HF304_BROWSER_COMPONENT_PATH: browserPath,
});
if (!existsSync(mechanicalPath) || !existsSync(browserPath)) {
  throw new Error('HF-304 component receipt was not emitted');
}

const components = [
  componentIdentity(1, 'mechanical-full-cartesian', 'unit', 'scripts/qa/capture-pass71-hf304-glass-matrix.ts', mechanicalPath),
  componentIdentity(2, 'installed-edge-runtime-distinct-paths', 'browser', 'tests/e2e/pass71-glass-lifecycle-matrix.spec.ts', browserPath),
];
const browserComponent = components[1].embedded;
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-304 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
const tooling = pass71Hf304ToolingHashes(root);
const record = {
  ...PASS71_HF304_GLASS_EVIDENCE,
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
  servedCandidate: browserComponent.servedCandidate,
  environment: { machine: args.machine, hostnameSha256, platform: process.platform, arch: process.arch },
  browser: {
    channel: 'msedge',
    installed: true,
    executableName: 'msedge.exe',
    executableSha256: sha256File(edgeExecutable),
    executableVersion: executableIdentity.productVersion,
    authenticodeStatus: executableIdentity.signatureStatus,
    authenticodeSigner: executableIdentity.signerSubject,
    userAgent: browserComponent.browser.userAgent,
    isolation: 'one-installed-edge-process-one-fresh-context-per-test',
  },
  tooling,
  coverage: PASS71_HF304_COVERAGE,
  unknowns: PASS71_HF304_UNKNOWNS,
  components,
  faults: [],
};
record.receiptSha256 = pass71Hf304RecordSha256(record);
assertPass71Hf304Evidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
const temporaryPath = `${receiptPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, receiptPath);
console.log(JSON.stringify({
  status: 'PASS',
  evidenceId: record.evidenceId,
  closesFeedback: record.closesFeedback,
  closingAuthority: record.closingAuthority,
  sourceSha: expectedSourceSha,
  stagedTreeSha256: record.servedCandidate.treeSha256,
  matrixCellCount: 480,
  browserCaseCount: 10,
  debrisLifecycleCount: 24,
  receiptSha256: record.receiptSha256,
  receiptPath,
}, null, 2));
