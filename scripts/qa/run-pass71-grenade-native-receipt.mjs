import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';
import {
  PASS71_GRENADE_NATIVE_EVIDENCE,
  assertPass71GrenadeNativeEvidence,
  pass71GrenadeNativeRecordSha256,
  pass71GrenadeNativeToolingHashesAtSource,
} from './pass71-grenade-native-receipt-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const values = parseArgs(process.argv.slice(2));
const expectedSourceSha = values['expected-source-sha'];
const previewPort = boundedPort(values.port ?? process.env.PASS71_GRENADE_NATIVE_PORT ?? '4564');
const peerPort = boundedPort(values['peer-port'] ?? process.env.PASS71_GRENADE_PEER_PORT ?? '4565');
const requestedScope = `${values.mode ?? ''}/${values.renderer ?? ''}`;
const scope = PASS71_GRENADE_NATIVE_EVIDENCE.scopes.find((candidate) => (
  `${candidate.mode}/${candidate.renderer}` === requestedScope
));
const checkoutSourceSha = git('rev-parse', 'HEAD');
const cleanBefore = sourceStatus() === '';
let temporaryRoot = null;
let componentDirectory = null;
const artifactRoot = resolve(root, 'artifacts/pass71/grenade-native');
const scopeSlug = scope ? `${scope.mode}-${scope.renderer}` : 'invalid-scope';
const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-${scopeSlug}-receipt.json`);
const evidencePath = resolve(artifactRoot, `${expectedSourceSha}-${scopeSlug}-native-evidence.json`);
let edgeExecutable = null;

function parseArgs(argv) {
  const parsed = {};
  const allowed = new Set(['expected-source-sha', 'mode', 'renderer', 'port', 'peer-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error(`Pass 71 grenade native runner expected --name value; received ${name ?? '(missing)'}`);
    }
    const key = name.slice(2);
    if (!allowed.has(key) || Object.hasOwn(parsed, key)) {
      throw new Error(`Pass 71 grenade native runner rejected unknown or duplicate argument --${key}`);
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function boundedPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_535) {
    throw new Error('Pass 71 grenade native preview port must be from 1024 through 65535');
  }
  return port;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function sourceStatus() {
  return git('status', '--porcelain', '--untracked-files=all');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function requireEdgeExecutable() {
  const candidates = [
    values['edge-executable'],
    process.env.PASS71_GRENADE_EDGE_EXECUTABLE,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).map((path) => resolve(path));
  const executable = candidates.find((path) => existsSync(path));
  if (!executable || basename(executable).toLowerCase() !== 'msedge.exe') {
    throw new Error('Pass 71 grenade native evidence requires an installed Microsoft Edge executable');
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

function readComponent(grenade) {
  const path = resolve(componentDirectory, `${grenade}.json`);
  if (!existsSync(path)) throw new Error(`Pass 71 grenade native run did not emit ${grenade}.json`);
  const component = JSON.parse(readFileSync(path, 'utf8'));
  if (component?.schemaVersion !== 1
    || component.expectedSourceSha !== expectedSourceSha
    || component.checkoutSourceSha !== expectedSourceSha
    || component.trial?.grenade !== grenade
    || component.trial?.mode !== scope?.mode
    || component.trial?.renderer !== scope?.renderer) {
    throw new Error(`Pass 71 grenade native ${grenade} component has invalid source or trial identity`);
  }
  return component.trial;
}

function writeHashedJson(path, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  writeFileSync(path, bytes);
  writeFileSync(`${path}.sha256`, `${sha256(bytes)}  ${basename(path)}\n`, 'utf8');
  return sha256(bytes);
}

async function main() {
  if (!/^[a-f0-9]{40}$/u.test(expectedSourceSha ?? '')) {
    throw new Error('Pass 71 grenade native runner requires --expected-source-sha with candidate A full SHA');
  }
  if (!scope) {
    throw new Error('Pass 71 grenade native runner requires --mode solo|hosted and --renderer webgl2|webgpu');
  }
  if (process.platform !== 'win32') throw new Error('Pass 71 grenade native evidence is Windows installed-Edge evidence');
  if (checkoutSourceSha !== expectedSourceSha || !cleanBefore) {
    throw new Error(`Pass 71 grenade native evidence requires clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha}; clean=${cleanBefore})`);
  }
  if (await portIsListening(previewPort)) throw new Error(`Pass 71 grenade native runner requires unbound port ${previewPort}`);
  if (scope.mode === 'hosted' && await portIsListening(peerPort)) {
    throw new Error(`Pass 71 grenade hosted runner requires unbound PeerJS port ${peerPort}`);
  }
  const viteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  if (viteOverrides.length > 0) throw new Error(`Pass 71 grenade native runner rejects Vite overrides: ${viteOverrides.join(', ')}`);
  const lockfilePreflight = spawnSync(process.execPath, [
    resolve(root, 'scripts/qa/verify-npm10-lockfile.mjs'),
  ], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (lockfilePreflight.error || lockfilePreflight.signal || lockfilePreflight.status !== 0) {
    throw new Error(`Pass 71 grenade native lockfile preflight failed: ${lockfilePreflight.error?.message ?? lockfilePreflight.signal ?? lockfilePreflight.status}`);
  }
  edgeExecutable = requireEdgeExecutable();
  const executableIdentity = assertInstalledEdgeExecutableIdentity(
    readWindowsExecutableIdentity(edgeExecutable),
  );
  const executableVersion = executableIdentity.productVersion;
  temporaryRoot = mkdtempSync(join(tmpdir(), 'atomic-acres-pass71-grenade-native-'));
  componentDirectory = join(temporaryRoot, 'components');
  mkdirSync(componentDirectory, { recursive: true });
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(
    ([name]) => !name.toUpperCase().startsWith('VITE_')
      && !name.toUpperCase().startsWith('PASS71_GRENADE_'),
  ));
  const startedAt = new Date().toISOString();
  for (const grenade of PASS71_GRENADE_NATIVE_EVIDENCE.grenades) {
    if (await portIsListening(previewPort)) {
      throw new Error(`Pass 71 ${grenade} native trial requires unbound owned-preview port ${previewPort}`);
    }
    // One Playwright process gives every grenade a fresh Edge process, profile,
    // and GPU cache boundary while retaining cold+warm actions within the trial.
    const result = spawnSync(process.execPath, [
      resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
      'tests/e2e/pass71-grenade-first-action.spec.ts',
      '--project=chromium', '--workers=1', '--retries=0',
      `--grep=${grenade} cold and warm throws`,
    ], {
      cwd: root,
      env: {
        ...inheritedEnvironment,
        NODE_ENV: 'production',
        SOURCE_SHA: expectedSourceSha,
        RELEASE_PASS: 'PASS 71',
        VITE_MATCH_BUILD_ID: expectedSourceSha,
        QA_INSTALLED_EDGE: '1',
        PASS71_GRENADE_EDGE_EXECUTABLE: edgeExecutable,
        QA_PREVIEW_PORT: String(previewPort),
        PASS71_GRENADE_RENDERER: scope.renderer,
        PASS71_GRENADE_RENDER_PROFILE: 'performance',
        PASS71_GRENADE_EVIDENCE_MODE: 'native-no-freeze',
        PASS71_GRENADE_EXPECTED_SOURCE_SHA: expectedSourceSha,
        PASS71_GRENADE_NATIVE_COMPONENT_DIR: componentDirectory,
        PASS71_GRENADE_NATIVE_MODE: scope.mode,
        PASS71_GRENADE_PEER_PORT: String(peerPort),
      },
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error) throw new Error(`Pass 71 ${grenade} native browser failed to launch: ${result.error.message}`);
    if (result.signal) throw new Error(`Pass 71 ${grenade} native browser terminated by ${result.signal}`);
    if ((result.status ?? 1) !== 0) {
      throw new Error(`Pass 71 ${grenade} native browser failed with exit ${result.status ?? 1}`);
    }
  }

  const trials = PASS71_GRENADE_NATIVE_EVIDENCE.grenades.map(readComponent);
  const completedAt = new Date().toISOString();
  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = sourceStatus() === '';
  const served = trials[0].servedCandidate;
  const version = trials[0].browser.version;
  const tooling = pass71GrenadeNativeToolingHashesAtSource(root, expectedSourceSha);
  const record = {
    schemaVersion: PASS71_GRENADE_NATIVE_EVIDENCE.schemaVersion,
    evidenceId: PASS71_GRENADE_NATIVE_EVIDENCE.evidenceId,
    kind: PASS71_GRENADE_NATIVE_EVIDENCE.kind,
    contract: PASS71_GRENADE_NATIVE_EVIDENCE.contract,
    gate: PASS71_GRENADE_NATIVE_EVIDENCE.gate,
    status: 'passed',
    startedAt,
    completedAt,
    capturedAt: completedAt,
    scope: { ...scope, arenaId: 'atomic-acres' },
    invocation: {
      runner: 'scripts/qa/run-pass71-grenade-native-receipt.mjs',
      expectedSourceSha,
      previewPort,
      renderer: scope.renderer,
      renderProfile: 'performance',
      evidenceMode: 'native-no-freeze',
      playwrightProject: 'chromium',
      workers: 1,
      retries: 0,
      browserProcessCount: PASS71_GRENADE_NATIVE_EVIDENCE.grenades.length,
      dependencyPreflight: 'npm@10.9.8-ci-dry-run',
      previewOwnership: 'owned-fresh-staged-topology-per-grenade',
    },
    source: {
      expectedSourceSha,
      checkoutSourceSha,
      servedSourceSha: served?.sourceSha,
      endingCheckoutSourceSha,
      cleanBefore,
      cleanAfter,
      servedTreeSha256: served?.treeSha256,
      servedFileCount: served?.exactRootFileCount,
    },
    environment: { platform: process.platform, arch: process.arch },
    browser: {
      channel: 'msedge', installed: true, executableName: basename(edgeExecutable),
      executableSha256: sha256File(edgeExecutable), executableVersion, version,
      installRoot: executableIdentity.installRoot,
      authenticodeStatus: executableIdentity.signatureStatus,
      authenticodeSigner: executableIdentity.signerSubject,
      isolation: 'fresh-edge-process-and-profile-per-grenade',
    },
    tooling,
    trials,
    faults: [],
  };
  record.receiptSha256 = pass71GrenadeNativeRecordSha256(record);
  assertPass71GrenadeNativeEvidence(record, { sourceSha: expectedSourceSha, tooling });
  mkdirSync(artifactRoot, { recursive: true });
  const evidenceFileSha256 = writeHashedJson(evidencePath, record);
  const fullReceipt = {
    schemaVersion: 1,
    gate: PASS71_GRENADE_NATIVE_EVIDENCE.gate,
    status: 'passed',
    sourceSha: expectedSourceSha,
    nativeEvidence: record,
    nativeEvidenceCanonicalSha256: record.receiptSha256,
    nativeEvidenceFileSha256: evidenceFileSha256,
  };
  const receiptFileSha256 = writeHashedJson(receiptPath, fullReceipt);
  process.stdout.write(`${JSON.stringify({
    status: 'passed', sourceSha: expectedSourceSha, receiptPath, receiptFileSha256,
    nativeEvidencePath: evidencePath, nativeEvidenceCanonicalSha256: record.receiptSha256,
    scope: scopeSlug,
    next: 'Retain this component for the HF-298 coverage finalizer; all four representative scopes are required.',
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
