import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  PASS71_HF307_CHOPPER_MG_EVIDENCE,
  PASS71_HF307_MECHANICAL_TEST_FILES,
  PASS71_HF307_REQUIRED_ASSERTIONS,
  PASS71_HF307_SCOPES,
  pass71Hf307EvidenceFailures,
  pass71Hf307RecordSha256,
  pass71Hf307ToolingHashesAtSource,
} from './pass71-hf307-chopper-mg-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
const firstPreviewPort = boundedPort(args['preview-port'] ?? '4661', 'preview');
const firstPeerPort = boundedPort(args['peer-port'] ?? '4681', 'PeerJS');
const artifactRoot = resolve(root, 'artifacts/pass71/hf307-chopper-mg');
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
let temporaryRoot = null;

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(['expected-source-sha', 'machine', 'preview-port', 'peer-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-307 expected --name value; received ${token ?? '(missing)'}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(values, key)) throw new Error(`HF-307 rejected --${key}`);
    values[key] = value;
    index += 1;
  }
  return values;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`HF-307 ${label} port must be from 1024 through 65535`);
  }
  return port;
}

function git(...values) {
  return execFileSync('git', ['-C', root, ...values], {
    encoding: 'utf8', windowsHide: true,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function runNode(label, values, environment) {
  const result = spawnSync(process.execPath, values, {
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
    args['edge-executable'],
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((value) => resolve(value));
  return candidates.find((path) => existsSync(path));
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

function exactComponent(component, expectedScope) {
  const keys = ['schemaVersion', 'contract', 'status', 'expectedSourceSha', 'checkoutSourceSha', 'scope'].sort();
  if (!component || typeof component !== 'object' || Array.isArray(component)
    || JSON.stringify(Object.keys(component).sort()) !== JSON.stringify(keys)
    || component.schemaVersion !== 1
    || component.contract !== 'atomic-acres/pass71-hf307-native-scope-component@1'
    || component.status !== 'passed'
    || component.expectedSourceSha !== expectedSourceSha
    || component.checkoutSourceSha !== expectedSourceSha
    || JSON.stringify({ arena: component.scope?.arena, renderer: component.scope?.renderer })
      !== JSON.stringify(expectedScope)
    || !Array.isArray(component.scope?.faults)
    || component.scope.faults.length !== 0) {
    throw new Error(`HF-307 component is invalid for ${JSON.stringify(expectedScope)}`);
  }
  return component;
}

function focusedOracle(reportPath, startedAt, completedAt) {
  const bytes = readFileSync(reportPath);
  const report = JSON.parse(bytes.toString('utf8'));
  const suites = Array.isArray(report.testResults) ? report.testResults : [];
  const assertions = suites.flatMap((suite) => Array.isArray(suite.assertionResults) ? suite.assertionResults : []);
  const titles = assertions.flatMap((assertion) => [assertion.title, assertion.fullName].filter(
    (value) => typeof value === 'string',
  ));
  const missingAssertions = PASS71_HF307_REQUIRED_ASSERTIONS.filter((required) => (
    !titles.some((title) => title === required || title.endsWith(` ${required}`))
  ));
  const testCount = Number(report.numTotalTests ?? assertions.length);
  const passedCount = Number(report.numPassedTests ?? assertions.filter(({ status }) => status === 'passed').length);
  const failedCount = Number(report.numFailedTests ?? assertions.filter(({ status }) => status === 'failed').length);
  const testFileCount = suites.length;
  if (missingAssertions.length > 0 || testFileCount < PASS71_HF307_MECHANICAL_TEST_FILES.length
    || testCount < PASS71_HF307_REQUIRED_ASSERTIONS.length || passedCount !== testCount || failedCount !== 0) {
    throw new Error(`HF-307 focused oracle is incomplete: ${JSON.stringify({
      missingAssertions, testFileCount, testCount, passedCount, failedCount,
    })}`);
  }
  return {
    contract: 'atomic-acres/pass71-hf307-focused-vitest-oracle@1',
    status: 'passed',
    command: `vitest run ${PASS71_HF307_MECHANICAL_TEST_FILES.join(' ')}`,
    testFiles: [...PASS71_HF307_MECHANICAL_TEST_FILES],
    requiredAssertions: [...PASS71_HF307_REQUIRED_ASSERTIONS],
    testFileCount,
    testCount,
    passedCount,
    failedCount,
    startedAt,
    completedAt,
    reportSha256: sha256(bytes),
  };
}

async function main() {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('HF-307 requires --expected-source-sha <40 lowercase hex candidate A>');
  }
  if (args.machine !== 'dave-gaming-pc' || process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`HF-307 requires --machine dave-gaming-pc on win32/x64; received ${args.machine}/${process.platform}/${process.arch}`);
  }
  const checkoutSourceSha = git('rev-parse', 'HEAD');
  const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
  if (checkoutSourceSha !== expectedSourceSha || !clean()) {
    throw new Error(`HF-307 requires one completely clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha})`);
  }
  const allPorts = PASS71_HF307_SCOPES.flatMap((_, index) => [firstPreviewPort + index, firstPeerPort + index]);
  if (new Set(allPorts).size !== allPorts.length || allPorts.some((port) => port > 65_535)) {
    throw new Error('HF-307 owned port set overlaps or exceeds 65535');
  }
  for (const port of allPorts) if (await portIsListening(port)) throw new Error(`HF-307 owned port ${port} is already bound`);
  const viteOverrides = ['.env.local', '.env.production.local'].filter((path) => existsSync(resolve(root, path)));
  const inheritedVite = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('VITE_'));
  if (viteOverrides.length > 0 || inheritedVite.length > 0) {
    throw new Error(`HF-307 rejects Vite overrides: ${[...viteOverrides, ...inheritedVite].join(', ')}`);
  }
  const channels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
  if (channels?.schemaVersion !== 4 || channels?.experimental?.pass !== 'PASS 71'
    || channels?.experimental?.path !== 'channels/the-big-one') {
    throw new Error('HF-307 requires the canonical Pass 71 staged channel');
  }
  const edgeExecutable = installedEdge();
  if (!edgeExecutable || basename(edgeExecutable).toLowerCase() !== 'msedge.exe') {
    throw new Error('HF-307 requires installed Microsoft Edge');
  }
  const edgeIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
  temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass71-hf307-'));
  const componentRoot = join(temporaryRoot, 'components');
  mkdirSync(componentRoot, { recursive: true });
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(
    ([name]) => !name.toUpperCase().startsWith('VITE_') && !name.toUpperCase().startsWith('PASS71_HF307_'),
  ));
  const exactEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: expectedSourceSha,
    RELEASE_PASS: 'PASS 71',
    VITE_MATCH_BUILD_ID: expectedSourceSha,
  };
  runNode('HF-307 lockfile preflight', ['scripts/qa/verify-npm10-lockfile.mjs'], exactEnvironment);
  runNode('HF-307 evidence contract', [
    '--test', 'scripts/qa/pass71-hf307-chopper-mg-evidence-contract.test.mjs',
  ], exactEnvironment);
  const startedAt = new Date().toISOString();
  const focusedReportPath = join(temporaryRoot, 'focused-vitest.json');
  const mechanicalStartedAt = new Date().toISOString();
  runNode('HF-307 focused Vitest oracle', [
    'node_modules/vitest/vitest.mjs',
    'run',
    ...PASS71_HF307_MECHANICAL_TEST_FILES,
    '--reporter=json',
    `--outputFile=${focusedReportPath}`,
  ], exactEnvironment);
  const mechanicalCompletedAt = new Date().toISOString();
  const mechanicalOracle = focusedOracle(focusedReportPath, mechanicalStartedAt, mechanicalCompletedAt);
  const components = [];
  for (const [index, scope] of PASS71_HF307_SCOPES.entries()) {
    const componentPath = resolve(componentRoot, `${scope.arena}-${scope.renderer}.json`);
    runNode(`HF-307 ${scope.arena}/${scope.renderer}`, [
      'scripts/qa/run-playwright-with-topology.mjs',
      'tests/e2e/pass71-hf307-chopper-mg.spec.ts',
      '--project=chromium',
      '--workers=1',
      '--retries=0',
    ], {
      ...exactEnvironment,
      QA_INSTALLED_EDGE: '1',
      QA_PREVIEW_PORT: String(firstPreviewPort + index),
      PASS71_HF307_CHOPPER_MG_EVIDENCE: '1',
      PASS71_HF307_EDGE_EXECUTABLE: edgeExecutable,
      PASS71_HF307_EXPECTED_SOURCE_SHA: expectedSourceSha,
      PASS71_HF307_COMPONENT_PATH: componentPath,
      PASS71_HF307_ARENA: scope.arena,
      PASS71_HF307_RENDERER: scope.renderer,
      PASS71_HF307_PEER_PORT: String(firstPeerPort + index),
    });
    if (!existsSync(componentPath)) throw new Error(`HF-307 browser did not emit ${basename(componentPath)}`);
    components.push(exactComponent(JSON.parse(readFileSync(componentPath, 'utf8')), scope));
  }
  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = clean();
  if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
    throw new Error(`HF-307 source drifted during evidence (${expectedSourceSha}/${endingCheckoutSourceSha})`);
  }
  const servedCandidate = components[0].scope.servedCandidate;
  if (components.some((component) => JSON.stringify(component.scope.servedCandidate) !== JSON.stringify(servedCandidate))) {
    throw new Error('HF-307 staged candidate identity drifted between renderers');
  }
  if (components.some((component) => component.scope.browser.version !== edgeIdentity.productVersion)) {
    throw new Error('HF-307 browser process and signed executable versions differ');
  }
  const exactEdgeExecutable = edgeIdentity.executablePath.replaceAll('\\', '/');
  if (components.some((component) => component.scope.browser.launchedExecutablePath !== exactEdgeExecutable)) {
    throw new Error('HF-307 browser process did not bind the exact audited Edge executable');
  }
  const tooling = pass71Hf307ToolingHashesAtSource(root, expectedSourceSha);
  const record = {
    ...PASS71_HF307_CHOPPER_MG_EVIDENCE,
    startedAt,
    completedAt: new Date().toISOString(),
    source: {
      expectedSourceSha,
      checkoutSourceSha,
      sourceTreeSha,
      servedSourceSha: servedCandidate.sourceSha,
      endingCheckoutSourceSha,
      cleanBefore: true,
      cleanAfter,
      servedSchemaVersion: servedCandidate.schemaVersion,
      servedReleasePass: servedCandidate.releasePass,
      servedChannel: servedCandidate.channel,
      servedPath: servedCandidate.path,
      servedTreeSha256: servedCandidate.treeSha256,
      servedFileCount: servedCandidate.exactRootFileCount,
    },
    environment: { machine: args.machine, platform: process.platform, arch: process.arch },
    browser: {
      channel: 'msedge',
      installed: true,
      version: edgeIdentity.productVersion,
      userAgent: components[0].scope.browser.userAgent,
      executableName: 'msedge.exe',
      executableVersion: edgeIdentity.productVersion,
      executablePath: exactEdgeExecutable,
      executableSha256: sha256(readFileSync(edgeExecutable)),
      installRoot: edgeIdentity.installRoot,
      signatureStatus: edgeIdentity.signatureStatus,
      signer: edgeIdentity.signerSubject,
      isolation: 'fresh-process-and-profile-per-scope',
    },
    tooling,
    mechanicalOracle,
    scopes: components.map((component) => component.scope),
    faults: components.flatMap((component) => component.scope.faults),
    claims: {
      exactThreeTimesRadius: true,
      hostAuthoritative: true,
      lineOfSightBounded: true,
      relationBounded: true,
      oneResultPerTarget: true,
      cadenceRetained: true,
      hostedAtomicAcres: true,
      webgl2AndWebgpu: true,
      ownedHostedTopology: true,
      ownerSubjectiveApproval: 'not-claimed',
    },
  };
  record.receiptSha256 = pass71Hf307RecordSha256(record);
  const failures = pass71Hf307EvidenceFailures(record, {
    sourceSha: expectedSourceSha,
    sourceTreeSha,
    tooling,
  });
  if (failures.length > 0) throw new Error(`HF-307 evidence failed: ${failures.join(', ')}`);
  mkdirSync(artifactRoot, { recursive: true });
  const temporaryPath = `${receiptPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, receiptPath);
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    evidenceId: 'HF-307',
    closesFeedback: true,
    sourceSha: expectedSourceSha,
    scopeCount: record.scopes.length,
    embeddedLosslessPngCount: 0,
    visualClaims: false,
    receiptSha256: record.receiptSha256,
    receiptPath,
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
