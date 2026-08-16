import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, relative, resolve } from 'node:path';
import {
  PASS71_HF305_NUKE_WARNING_EVIDENCE,
  PASS71_HF305_RENDERERS,
  assertPass71Hf305Evidence,
  pass71Hf305RecordSha256,
  pass71Hf305ToolingHashesAtSource,
} from './pass71-hf305-nuke-warning-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass71/hf305-nuke-warning');
const componentRoot = resolve(artifactRoot, 'components');
const SHA40 = /^[a-f0-9]{40}$/u;
const MACHINE_HOSTNAME_SHA256 = createHash('sha256').update('desktop-vi3cr5q', 'utf8').digest('hex');

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected HF-305 argument ${token}`);
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

function run(label, command, args, environment) {
  const result = spawnSync(command, args, {
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
    process.env.PASS71_HF305_BROWSER_PATH,
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((candidate) => resolve(candidate));
  return candidates.find(existsSync);
}

function componentIdentity(id, kind, sourcePath, path) {
  const bytes = readFileSync(path);
  return {
    id,
    kind,
    status: 'passed',
    sourcePath,
    receiptPath: relative(root, path).replaceAll('\\', '/'),
    receiptSha256: sha256Bytes(bytes),
    receiptByteLength: bytes.length,
    embedded: JSON.parse(bytes.toString('utf8')),
  };
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
if (!SHA40.test(expectedSourceSha ?? '')) {
  throw new Error('HF-305 requires --expected-source-sha=<40 lowercase hex candidate A>');
}
if (args.machine !== 'dave-gaming-pc') throw new Error('HF-305 release evidence requires --machine=dave-gaming-pc');
if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error(`HF-305 requires win32/x64; received ${process.platform}/${process.arch}`);
}
const checkoutSourceSha = git('rev-parse', 'HEAD');
const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
if (checkoutSourceSha !== expectedSourceSha || !clean()) {
  throw new Error(`HF-305 requires one completely clean candidate A (${expectedSourceSha})`);
}
const hostnameSha256 = sha256Bytes(Buffer.from(hostname().toLowerCase(), 'utf8'));
if (hostnameSha256 !== MACHINE_HOSTNAME_SHA256) throw new Error('HF-305 machine hostname does not match dave-gaming-pc');
const localViteOverrides = ['.env', '.env.local', '.env.production.local'].filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`HF-305 rejects Vite overrides: ${[...localViteOverrides, ...inheritedViteVariables].join(', ')}`);
}
const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
const releasePass = releaseChannels?.experimental?.pass;
if (releasePass !== 'PASS 71' || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
  throw new Error('HF-305 requires the canonical Pass 71 staged channel');
}
const edgeExecutable = installedEdge();
if (!edgeExecutable) throw new Error('HF-305 requires installed Microsoft Edge');
if (basename(edgeExecutable).toLowerCase() !== 'msedge.exe') throw new Error('HF-305 executable must be msedge.exe');
const executableIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
const executableSha256 = sha256File(edgeExecutable);

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
  PASS71_HF305_SOURCE_SHA: expectedSourceSha,
  PASS71_HF305_SOURCE_TREE_SHA: sourceTreeSha,
  PASS71_HF305_RELEASE_PASS: releasePass,
};

run('HF-305 lockfile preflight', process.execPath, ['scripts/qa/verify-npm10-lockfile.mjs'], exactEnvironment);
const mechanicalPath = resolve(componentRoot, '1-mechanical-authority.json');
run('HF-305 mechanical authority capture', process.execPath, [
  'node_modules/tsx/dist/cli.mjs',
  'scripts/qa/capture-pass71-hf305-nuke-authority.ts',
  '--output', mechanicalPath,
], exactEnvironment);
run('HF-305 focused product contracts', process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'src/field-support.test.ts',
  'src/nuke-warning-presentation.test.ts',
  'src/pass71-nuke-warning-audio.test.ts',
  'src/pass71-nuke-warning-integration.test.ts',
], exactEnvironment);

const runtimePaths = [];
for (const [rendererIndex, requestedRenderer] of PASS71_HF305_RENDERERS.entries()) {
  const runtimePath = resolve(componentRoot, `${rendererIndex + 2}-installed-edge-${requestedRenderer}.json`);
  runtimePaths.push(runtimePath);
  run(`HF-305 installed Edge ${requestedRenderer}`, process.execPath, [
    'scripts/qa/run-playwright-with-topology.mjs',
    'tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts',
    '--project=chromium', '--workers=1', '--retries=0',
  ], {
    ...exactEnvironment,
    PASS71_HF305_NATIVE: '1',
    PASS71_HF305_RENDERER: requestedRenderer,
    PASS71_HF305_COMPONENT_PATH: runtimePath,
    PASS71_HF305_EDGE_EXECUTABLE: edgeExecutable,
    PASS70_NATIVE_ENGINE_USER_AGENT: '1',
    QA_INSTALLED_EDGE: '1',
    QA_PREVIEW_PORT: String(Number(args['preview-port'] ?? '4575') + rendererIndex),
  });
}

if (![mechanicalPath, ...runtimePaths].every(existsSync)) throw new Error('HF-305 did not emit every component receipt');
const components = [
  componentIdentity('mechanical-authority', 'unit', 'scripts/qa/capture-pass71-hf305-nuke-authority.ts', mechanicalPath),
  componentIdentity('installed-edge-webgl2', 'browser', 'tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts', runtimePaths[0]),
  componentIdentity('installed-edge-webgpu', 'browser', 'tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts', runtimePaths[1]),
];
const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
const cleanAfter = clean();
if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
  throw new Error(`HF-305 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
}
if (sha256File(edgeExecutable) !== executableSha256) throw new Error('HF-305 installed Edge binary changed during evidence');
const tooling = pass71Hf305ToolingHashesAtSource(root, expectedSourceSha);
const record = {
  ...PASS71_HF305_NUKE_WARNING_EVIDENCE,
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
  environment: {
    machine: args.machine,
    hostnameSha256,
    platform: process.platform,
    arch: process.arch,
  },
  browser: {
    channel: 'msedge',
    installed: true,
    executableName: 'msedge.exe',
    executableSha256,
    executableVersion: executableIdentity.productVersion,
    authenticodeStatus: executableIdentity.signatureStatus,
    authenticodeSigner: executableIdentity.signerSubject,
    isolation: 'one-signed-installed-edge-process-and-fresh-profile-per-renderer',
  },
  tooling,
  coverage: {
    renderers: ['webgl2', 'webgpu'],
    sensoryModes: ['standard', 'reduced'],
    views: ['outside-room', 'inside-room'],
    warningDurationMs: 5_000,
    sameFrameBeaconAttribution: true,
    ownerSubjectiveInspectionPerformed: false,
  },
  components,
  faults: [],
};
record.receiptSha256 = pass71Hf305RecordSha256(record);
assertPass71Hf305Evidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
const temporaryPath = `${receiptPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
renameSync(temporaryPath, receiptPath);
process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  evidenceId: record.evidenceId,
  closesFeedback: record.closesFeedback,
  ownerSubjectiveApproval: record.ownerSubjectiveApproval,
  sourceSha: expectedSourceSha,
  receiptSha256: record.receiptSha256,
  receiptPath,
}, null, 2)}\n`);
