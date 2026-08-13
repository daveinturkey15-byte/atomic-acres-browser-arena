import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { hostname } from 'node:os';
import { basename, resolve } from 'node:path';
import {
  PASS71_HF304_LIVE_HOSTED_ARENAS,
  PASS71_HF304_LIVE_HOSTED_EVIDENCE,
  PASS71_HF304_LIVE_HOSTED_FIRE_KINDS,
  PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256,
  PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES,
  PASS71_HF304_LIVE_HOSTED_MODES,
  PASS71_HF304_LIVE_HOSTED_PANES,
  PASS71_HF304_LIVE_HOSTED_SCOPES,
  PASS71_HF304_LIVE_HOSTED_WEAPONS,
  assertPass71Hf304LiveHostedEvidence,
  pass71Hf304LiveHostedRecordSha256,
  pass71Hf304LiveHostedToolingHashesAtSource,
} from './pass71-hf304-live-hosted-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const artifactRoot = resolve(root, 'artifacts/pass71/hf304-live-hosted');
const componentRoot = resolve(artifactRoot, 'components');
const SHA40 = /^[a-f0-9]{40}$/u;

function parseArgs(argv) {
  const values = {};
  const allowed = new Set(['expected-source-sha', 'machine', 'preview-port', 'peer-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`HF-304 live hosted rejected argument ${token ?? '(missing)'}`);
    const equals = token.indexOf('=');
    const name = token.slice(2, equals > 2 ? equals : undefined);
    const value = equals > 2 ? token.slice(equals + 1) : argv[index + 1];
    if (!allowed.has(name) || Object.hasOwn(values, name) || !value || value.startsWith('--')) {
      throw new Error(`HF-304 live hosted requires one value for known argument --${name}`);
    }
    values[name] = value;
    if (equals < 0) index += 1;
  }
  return values;
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];

function git(...values) {
  return execFileSync('git', ['-C', root, ...values], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1_024 * 1_024,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(label, command, values, environment) {
  const result = spawnSync(command, values, {
    cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw new Error(`${label} failed to launch: ${result.error.message}`);
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}`);
  if ((result.status ?? 1) !== 0) throw new Error(`${label} failed with exit ${result.status ?? 1}`);
}

function installedEdge() {
  const candidates = [
    args['edge-executable'],
    process.env.PASS71_HF304_LIVE_HOSTED_BROWSER_PATH,
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((candidate) => resolve(candidate));
  const executable = candidates.find(existsSync);
  if (!executable || basename(executable).toLowerCase() !== 'msedge.exe') {
    throw new Error('HF-304 live hosted requires an installed Microsoft Edge executable');
  }
  return executable;
}

function boundedPort(value, label) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_532) {
    throw new Error(`HF-304 ${label} base port must leave four valid sequential ports`);
  }
  return port;
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

function readComponent(path, scope, productVersion, peerPort) {
  if (!existsSync(path)) throw new Error(`HF-304 ${scope.id} did not emit its browser component`);
  const component = JSON.parse(readFileSync(path, 'utf8'));
  if (component?.contract !== 'atomic-acres/pass71-hf304-live-hosted-component@1'
    || component?.status !== 'passed' || JSON.stringify(component?.scope) !== JSON.stringify(scope)
    || component?.servedCandidate?.sourceSha !== expectedSourceSha
    || component?.servedCandidate?.releasePass !== 'PASS 71'
    || component?.servedCandidate?.channel !== 'the-big-one'
    || component?.browser?.channel !== 'msedge' || component?.browser?.installed !== true
    || component?.browser?.version !== productVersion || component?.peerServer?.port !== peerPort
    || !Array.isArray(component?.faults) || component.faults.length !== 0) {
    throw new Error(`HF-304 ${scope.id} emitted an invalid exact-scope identity`);
  }
  const visualRoot = `${resolve(componentRoot)}\\`;
  for (const visual of component.visuals ?? []) {
    const visualPath = resolve(root, visual.path ?? '');
    if (!visualPath.startsWith(visualRoot) || !existsSync(visualPath)) {
      throw new Error(`HF-304 ${scope.id} emitted an unowned visual path`);
    }
    const bytes = readFileSync(visualPath);
    if (bytes.length !== visual.bytes || sha256(bytes) !== visual.sha256
      || `data:image/png;base64,${bytes.toString('base64')}` !== visual.dataUrl) {
      throw new Error(`HF-304 ${scope.id} embedded visual drifted from ${visual.path}`);
    }
  }
  return component;
}

async function main() {
  if (!SHA40.test(expectedSourceSha ?? '')) {
    throw new Error('HF-304 live hosted requires --expected-source-sha=<40 lowercase hex candidate A>');
  }
  if (args.machine !== 'dave-gaming-pc') {
    throw new Error(`HF-304 live hosted requires the logical --machine dave-gaming-pc owner, received ${args.machine ?? 'missing'}`);
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`HF-304 live hosted requires win32/x64; received ${process.platform}/${process.arch}`);
  }
  const hostnameSha256 = sha256(Buffer.from(hostname().toLowerCase(), 'utf8'));
  if (hostnameSha256 !== PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256) {
    throw new Error('HF-304 live hosted runtime hostname does not match the dave-gaming-pc owner');
  }
  const checkoutSourceSha = git('rev-parse', 'HEAD');
  const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
  if (checkoutSourceSha !== expectedSourceSha || !clean()) {
    throw new Error(`HF-304 live hosted requires one completely clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha})`);
  }
  const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
  if (releaseChannels?.experimental?.pass !== 'PASS 71'
    || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
    throw new Error('HF-304 live hosted requires the canonical staged Pass 71 channel');
  }
  const localViteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  const inheritedVite = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('VITE_'));
  if (localViteOverrides.length > 0 || inheritedVite.length > 0) {
    throw new Error(`HF-304 live hosted rejects Vite overrides: ${[...localViteOverrides, ...inheritedVite].join(', ')}`);
  }
  const previewBase = boundedPort(args['preview-port'] ?? process.env.PASS71_HF304_LIVE_HOSTED_PREVIEW_PORT ?? '4600', 'preview');
  const peerBase = boundedPort(args['peer-port'] ?? process.env.PASS71_HF304_LIVE_HOSTED_PEER_PORT ?? '4610', 'PeerJS');
  const allPorts = [
    ...PASS71_HF304_LIVE_HOSTED_SCOPES.map((_, index) => previewBase + index),
    ...PASS71_HF304_LIVE_HOSTED_SCOPES.map((_, index) => peerBase + index),
  ];
  if (new Set(allPorts).size !== allPorts.length) throw new Error('HF-304 preview and PeerJS port ranges overlap');
  for (const port of allPorts) {
    if (await portIsListening(port)) throw new Error(`HF-304 requires fresh unowned port ${port}`);
  }
  const edgeExecutable = installedEdge();
  const edgeIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
  const edgeExecutableSha256 = sha256(readFileSync(edgeExecutable));
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(
    ([name]) => !name.toUpperCase().startsWith('VITE_')
      && !name.toUpperCase().startsWith('PASS71_HF304_'),
  ));
  const exactEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: expectedSourceSha,
    RELEASE_PASS: 'PASS 71',
    VITE_MATCH_BUILD_ID: expectedSourceSha,
    PASS71_HF304_LIVE_HOSTED: '1',
    PASS71_HF304_LIVE_HOSTED_EXPECTED_SOURCE_SHA: expectedSourceSha,
    PASS71_HF304_EDGE_EXECUTABLE: edgeExecutable,
    PASS70_NATIVE_ENGINE_USER_AGENT: '1',
    QA_INSTALLED_EDGE: '1',
  };

  run('HF-304 lockfile preflight', process.execPath, [
    'scripts/qa/verify-npm10-lockfile.mjs',
  ], inheritedEnvironment);
  run('HF-304 live hosted contract', process.execPath, [
    '--test', 'scripts/qa/pass71-hf304-live-hosted-evidence-contract.test.mjs',
  ], inheritedEnvironment);
  run('HF-304 live hosted static/runtime wiring', process.execPath, [
    'node_modules/vitest/vitest.mjs', 'run',
    'src/pass71-hf304-live-hosted-release-evidence.test.ts',
    'src/glass-authority.test.ts',
    'src/glass-main-integration.test.ts',
    'src/projectile-glass-break-admission.test.ts',
    'src/remote-shot-admission.test.ts',
    'src/hosted-bot-glass-authority.test.ts',
    'src/window-glass-debris-presentation.test.ts',
  ], inheritedEnvironment);

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(componentRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const components = [];
  for (const [index, scope] of PASS71_HF304_LIVE_HOSTED_SCOPES.entries()) {
    const previewPort = previewBase + index;
    const peerPort = peerBase + index;
    const componentPath = resolve(componentRoot, `${scope.id.replace('/', '-')}.json`);
    run(`HF-304 installed Edge ${scope.id}`, process.execPath, [
      'scripts/qa/run-playwright-with-topology.mjs',
      'tests/e2e/pass71-hf304-live-hosted.spec.ts',
      '--project=chromium', '--workers=1', '--retries=0',
    ], {
      ...exactEnvironment,
      PASS71_HF304_LIVE_HOSTED_SCOPE_ID: scope.id,
      PASS71_HF304_LIVE_HOSTED_COMPONENT_PATH: componentPath,
      PASS71_HF304_LIVE_HOSTED_PEER_PORT: String(peerPort),
      QA_PREVIEW_PORT: String(previewPort),
    });
    components.push(readComponent(componentPath, scope, edgeIdentity.productVersion, peerPort));
    if (await portIsListening(previewPort) || await portIsListening(peerPort)) {
      throw new Error(`HF-304 ${scope.id} leaked owned preview/PeerJS topology`);
    }
  }
  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = clean();
  if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
    throw new Error(`HF-304 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
  }
  if (sha256(readFileSync(edgeExecutable)) !== edgeExecutableSha256) {
    throw new Error('HF-304 installed Edge binary changed during evidence');
  }
  const tooling = pass71Hf304LiveHostedToolingHashesAtSource(root, expectedSourceSha);
  const completedAt = new Date().toISOString();
  const record = {
    ...PASS71_HF304_LIVE_HOSTED_EVIDENCE,
    startedAt,
    completedAt,
    source: {
      expectedSourceSha, checkoutSourceSha, endingCheckoutSourceSha, sourceTreeSha,
      releasePass: 'PASS 71', cleanBefore: true, cleanAfter,
    },
    environment: { machine: args.machine, hostnameSha256, platform: process.platform, arch: process.arch },
    browser: {
      channel: 'msedge', installed: true, executableName: basename(edgeExecutable),
      executableSha256: edgeExecutableSha256, productVersion: edgeIdentity.productVersion,
      installRoot: edgeIdentity.installRoot, authenticodeStatus: edgeIdentity.signatureStatus,
      authenticodeSigner: edgeIdentity.signerSubject,
      processIsolation: 'fresh-owned-installed-edge-process-and-profile-per-scope',
      processCount: components.length,
    },
    coverage: {
      scopes: PASS71_HF304_LIVE_HOSTED_SCOPES,
      arenas: PASS71_HF304_LIVE_HOSTED_ARENAS,
      authoredPaneCount: PASS71_HF304_LIVE_HOSTED_PANES.length,
      weaponCount: PASS71_HF304_LIVE_HOSTED_WEAPONS.length,
      modes: PASS71_HF304_LIVE_HOSTED_MODES,
      cellsPerScope: 480, totalCells: 1_920,
      crackControlsPerScope: 24, totalCrackControls: 96,
      debrisTrailsPerScope: 36, totalDebrisTrails: 144,
      visualsPerScope: 4, totalVisuals: 16,
      authority: 'real-private-runtime-host-canonicalization-and-replica-admission',
      ownerSubjectiveInspectionPerformed: false,
    },
    tooling,
    components,
    faults: [],
    unknowns: ['owner-subjective-inspection-not-performed'],
  };
  record.receiptSha256 = pass71Hf304LiveHostedRecordSha256(record);
  assertPass71Hf304LiveHostedEvidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
  const encodedBytes = Buffer.byteLength(JSON.stringify(record, null, 2), 'utf8');
  if (encodedBytes + 1 > PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES) {
    throw new Error(`HF-304 record exceeds its ${PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES}-byte cap`);
  }
  const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  writeFileSync(receiptPath, bytes);
  writeFileSync(`${receiptPath}.sha256`, `${sha256(bytes)}  ${basename(receiptPath)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    status: 'PASS', evidenceId: record.evidenceId, kind: record.kind,
    closesFeedback: record.closesFeedback, closingAuthority: record.closingAuthority,
    sourceSha: expectedSourceSha, scopes: record.coverage.scopes.map(({ id }) => id),
    totalCells: record.coverage.totalCells, totalCrackControls: record.coverage.totalCrackControls,
    totalDebrisTrails: record.coverage.totalDebrisTrails,
    totalVisuals: record.coverage.totalVisuals, encodedBytes,
    encodedByteCap: PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES,
    receiptSha256: record.receiptSha256, receiptPath,
  }, null, 2)}\n`);
}

await main();
