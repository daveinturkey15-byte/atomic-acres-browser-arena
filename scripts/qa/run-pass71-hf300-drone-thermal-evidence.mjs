import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import {
  PASS71_HF300_DRONE_THERMAL_COVERAGE,
  PASS71_HF300_DRONE_THERMAL_EVIDENCE,
  PASS71_HF300_DRONE_THERMAL_SCOPES,
  assertPass71Hf300Evidence,
  pass71Hf300RecordSha256,
  pass71Hf300SourceTreeAtSource,
  pass71Hf300ToolingHashesAtSource,
} from './pass71-hf300-drone-thermal-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];
const previewPort = boundedPort(args.port ?? process.env.PASS71_HF300_PORT ?? '4590', 'preview');
const peerPort = boundedPort(args['peer-port'] ?? process.env.PASS71_HF300_PEER_PORT ?? '4591', 'PeerJS');
const artifactRoot = resolve(root, 'artifacts/pass71/hf300-drone-thermal-evidence');
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
let temporaryRoot = null;

function parseArgs(argv) {
  const parsed = {};
  const allowed = new Set(['expected-source-sha', 'machine', 'port', 'peer-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`HF-300 expected --name value; received ${token ?? '(missing)'}`);
    }
    const key = token.slice(2);
    if (!allowed.has(key) || Object.hasOwn(parsed, key)) {
      throw new Error(`HF-300 rejected unknown or duplicate argument --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error(`HF-300 ${label} port must be from 1024 through 65535`);
  }
  return port;
}

function git(...values) {
  return execFileSync('git', values, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function sourceStatus() {
  return git('status', '--porcelain', '--untracked-files=all');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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

function requireEdgeExecutable() {
  const candidates = [
    args['edge-executable'],
    process.env.PASS71_HF300_EDGE_EXECUTABLE,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).map((candidate) => resolve(candidate));
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable || basename(executable).toLowerCase() !== 'msedge.exe') {
    throw new Error('HF-300 requires an installed Microsoft Edge executable');
  }
  return executable;
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

function readScope(componentRoot, identity) {
  const componentPath = resolve(componentRoot, `${identity.targetKind}-${identity.renderer}.json`);
  if (!existsSync(componentPath)) {
    throw new Error(`HF-300 browser did not emit ${identity.targetKind}/${identity.renderer}`);
  }
  const scope = JSON.parse(readFileSync(componentPath, 'utf8'));
  if (scope?.targetKind !== identity.targetKind || scope?.mode !== identity.mode
    || scope?.renderer !== identity.renderer || scope?.arenaId !== 'atomic-acres'
    || scope?.renderProfile !== 'blender') {
    throw new Error(`HF-300 component identity drifted for ${identity.targetKind}/${identity.renderer}`);
  }
  if (scope?.servedCandidate?.sourceSha !== expectedSourceSha
    || scope?.servedCandidate?.releasePass !== 'PASS 71'
    || scope?.servedCandidate?.channel !== 'the-big-one') {
    throw new Error(`HF-300 component served the wrong candidate for ${identity.targetKind}/${identity.renderer}`);
  }
  if (scope?.browser?.channel !== 'msedge' || scope.browser.installed !== true
    || !/^\d+(?:\.\d+){3}$/u.test(scope.browser.version ?? '')
    || !new RegExp(`\\bEdg/${scope.browser.version.replaceAll('.', '\\.')}\\b`, 'u').test(scope.browser.userAgent ?? '')) {
    throw new Error(`HF-300 component has invalid Edge identity for ${identity.targetKind}/${identity.renderer}`);
  }
  if (!Array.isArray(scope.faults) || scope.faults.length !== 0) {
    throw new Error(`HF-300 component retained faults for ${identity.targetKind}/${identity.renderer}`);
  }
  return scope;
}

function writeHashedReceipt(record) {
  mkdirSync(artifactRoot, { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  writeFileSync(receiptPath, bytes);
  writeFileSync(`${receiptPath}.sha256`, `${sha256(bytes)}  ${basename(receiptPath)}\n`, 'utf8');
  return sha256(bytes);
}

async function main() {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('HF-300 requires --expected-source-sha with candidate A full SHA');
  }
  if (args.machine !== 'dave-gaming-pc') {
    throw new Error('HF-300 requires --machine dave-gaming-pc');
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`HF-300 requires win32/x64; received ${process.platform}/${process.arch}`);
  }
  const checkoutSourceSha = git('rev-parse', 'HEAD');
  const cleanBefore = sourceStatus() === '';
  if (checkoutSourceSha !== expectedSourceSha || !cleanBefore) {
    throw new Error(`HF-300 requires one clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha}; clean=${cleanBefore})`);
  }
  if (await portIsListening(previewPort) || await portIsListening(peerPort)) {
    throw new Error(`HF-300 requires unbound owned ports ${previewPort}/${peerPort}`);
  }
  const localViteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  const inheritedVite = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('VITE_'));
  if (localViteOverrides.length > 0 || inheritedVite.length > 0) {
    throw new Error(`HF-300 rejects Vite overrides: ${[...localViteOverrides, ...inheritedVite].join(', ')}`);
  }
  const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
  if (releaseChannels?.experimental?.pass !== 'PASS 71'
    || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
    throw new Error('HF-300 requires the canonical Pass 71 staged channel');
  }
  const edgeExecutable = requireEdgeExecutable();
  const executableIdentity = assertInstalledEdgeExecutableIdentity(
    readWindowsExecutableIdentity(edgeExecutable),
  );
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(
    ([name]) => !name.toUpperCase().startsWith('VITE_')
      && !name.toUpperCase().startsWith('PASS71_HF300_'),
  ));
  runNode('HF-300 lockfile preflight', [
    resolve(root, 'scripts/qa/verify-npm10-lockfile.mjs'),
  ], inheritedEnvironment);

  temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass71-hf300-'));
  const componentRoot = join(temporaryRoot, 'components');
  mkdirSync(componentRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const scopes = [];
  for (const identity of PASS71_HF300_DRONE_THERMAL_SCOPES) {
    if (await portIsListening(previewPort) || await portIsListening(peerPort)) {
      throw new Error(`HF-300 ${identity.targetKind}/${identity.renderer} requires fresh unbound owned ports`);
    }
    // A separate Playwright CLI invocation is the process/profile boundary:
    // every exact scope receives a newly launched installed Edge process and a
    // newly staged candidate-A topology rather than sharing GPU/browser state.
    runNode(`HF-300 ${identity.targetKind}/${identity.renderer} native scope`, [
      resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
      'tests/e2e/pass71-hf300-drone-thermal.spec.ts',
      '--project=chromium', '--workers=1', '--retries=0',
    ], {
      ...inheritedEnvironment,
      NODE_ENV: 'production',
      SOURCE_SHA: expectedSourceSha,
      RELEASE_PASS: 'PASS 71',
      VITE_MATCH_BUILD_ID: expectedSourceSha,
      QA_INSTALLED_EDGE: '1',
      QA_PREVIEW_PORT: String(previewPort),
      PASS71_HF300_DRONE_THERMAL: '1',
      PASS71_HF300_SOURCE_SHA: expectedSourceSha,
      PASS71_HF300_TARGET_KIND: identity.targetKind,
      PASS71_HF300_RENDERER: identity.renderer,
      PASS71_HF300_COMPONENT_DIR: componentRoot,
      PASS71_HF300_PEER_PORT: String(peerPort),
      PASS71_HF300_EDGE_EXECUTABLE: edgeExecutable,
    });
    const scope = readScope(componentRoot, identity);
    if (scope.browser.version !== executableIdentity.productVersion) {
      throw new Error(
        `HF-300 ${identity.targetKind}/${identity.renderer} Edge ${scope.browser.version}`
          + ` != installed executable ${executableIdentity.productVersion}`,
      );
    }
    scopes.push(scope);
    if (await portIsListening(previewPort) || await portIsListening(peerPort)) {
      throw new Error(`HF-300 ${identity.targetKind}/${identity.renderer} leaked an owned listener`);
    }
  }

  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = sourceStatus() === '';
  if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
    throw new Error(`HF-300 source drifted during evidence (${expectedSourceSha}/${endingCheckoutSourceSha})`);
  }
  const sourceTreeSha = pass71Hf300SourceTreeAtSource(root, expectedSourceSha);
  const tooling = pass71Hf300ToolingHashesAtSource(root, expectedSourceSha);
  const servedCandidate = scopes[0]?.servedCandidate;
  if (!servedCandidate || scopes.some((scope) => !sameJson(scope.servedCandidate, servedCandidate))) {
    throw new Error('HF-300 staged candidate provenance drifted across exact scopes');
  }
  const completedAt = new Date().toISOString();
  const record = {
    ...PASS71_HF300_DRONE_THERMAL_EVIDENCE,
    startedAt,
    completedAt,
    source: {
      expectedSourceSha,
      checkoutSourceSha,
      endingCheckoutSourceSha,
      sourceTreeSha,
      releasePass: 'PASS 71',
      cleanBefore,
      cleanAfter,
    },
    servedCandidate,
    environment: { machine: 'dave-gaming-pc', platform: process.platform, arch: process.arch },
    browser: {
      channel: 'msedge',
      installed: true,
      executableName: basename(edgeExecutable),
      executableSha256: sha256(readFileSync(edgeExecutable)),
      productVersion: executableIdentity.productVersion,
      installRoot: executableIdentity.installRoot,
      authenticodeStatus: executableIdentity.signatureStatus,
      authenticodeSigner: executableIdentity.signerSubject,
      processIsolation: PASS71_HF300_DRONE_THERMAL_COVERAGE.processIsolation,
      processCount: scopes.length,
    },
    tooling,
    coverage: PASS71_HF300_DRONE_THERMAL_COVERAGE,
    scopes,
    faults: [],
  };
  record.receiptSha256 = pass71Hf300RecordSha256(record);
  assertPass71Hf300Evidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
  const receiptFileSha256 = writeHashedReceipt(record);
  process.stdout.write(`${JSON.stringify({
    status: 'passed',
    evidenceId: record.evidenceId,
    closesFeedback: record.closesFeedback,
    sourceSha: expectedSourceSha,
    exactScopeCount: record.scopes.length,
    receiptPath,
    receiptFileSha256,
    canonicalReceiptSha256: record.receiptSha256,
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
