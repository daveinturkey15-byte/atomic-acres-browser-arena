import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { basename, resolve } from 'node:path';
import {
  PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE,
  PASS71_HF309_RENDERERS,
  assertPass71Hf309Evidence,
  pass71Hf309RecordSha256,
  pass71Hf309ToolingHashesAtSource,
} from './pass71-hf309-chopper-first-entry-evidence-contract.mjs';
import {
  assertInstalledEdgeExecutableIdentity,
  readWindowsExecutableIdentity,
} from './pass71-edge-executable-identity.mjs';

const root = resolve(process.cwd());
const artifactRoot = resolve(root, 'artifacts/pass71/hf309-chopper-first-entry');
const componentRoot = resolve(artifactRoot, 'components');
const SHA40 = /^[a-f0-9]{40}$/u;

function parseArgs(argv) {
  const parsed = {};
  const allowed = new Set(['expected-source-sha', 'machine', 'preview-port', 'edge-executable']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`HF-309 rejected argument ${token ?? '(missing)'}`);
    const equals = token.indexOf('=');
    const name = token.slice(2, equals > 2 ? equals : undefined);
    let value = equals > 2 ? token.slice(equals + 1) : argv[index + 1];
    if (!allowed.has(name) || Object.hasOwn(parsed, name) || !value || value.startsWith('--')) {
      throw new Error(`HF-309 requires one value for known argument --${name}`);
    }
    parsed[name] = value;
    if (equals < 0) index += 1;
  }
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
const expectedSourceSha = args['expected-source-sha'];

function git(...values) {
  return execFileSync('git', ['-C', root, ...values], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

function clean() {
  return git('status', '--porcelain', '--untracked-files=all') === '';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(label, command, values, environment) {
  const result = spawnSync(command, values, {
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
    process.env.PASS71_HF309_BROWSER_PATH,
    resolve(process.env['PROGRAMFILES(X86)'] ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.PROGRAMFILES ?? '', 'Microsoft/Edge/Application/msedge.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean).map((candidate) => resolve(candidate));
  const executable = candidates.find(existsSync);
  if (!executable || basename(executable).toLowerCase() !== 'msedge.exe') {
    throw new Error('HF-309 requires an installed Microsoft Edge executable');
  }
  return executable;
}

function boundedPort(value) {
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1_024 || port > 65_534) {
    throw new Error('HF-309 preview port must leave two valid sequential ports');
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

function readComponent(path, renderer, productVersion) {
  if (!existsSync(path)) throw new Error(`HF-309 ${renderer} did not emit its browser component`);
  const component = JSON.parse(readFileSync(path, 'utf8'));
  if (component?.renderer !== renderer || component?.arenaId !== 'gun-range'
    || component?.renderProfile !== 'performance'
    || component?.servedCandidate?.sourceSha !== expectedSourceSha
    || component?.servedCandidate?.releasePass !== 'PASS 71'
    || component?.servedCandidate?.channel !== 'the-big-one'
    || component?.browser?.channel !== 'msedge' || component?.browser?.installed !== true
    || component?.browser?.version !== productVersion
    || !Array.isArray(component?.faults) || component.faults.length !== 0) {
    throw new Error(`HF-309 ${renderer} emitted an invalid exact-scope identity`);
  }
  return component;
}

async function main() {
  if (!SHA40.test(expectedSourceSha ?? '')) {
    throw new Error('HF-309 requires --expected-source-sha=<40 lowercase hex candidate A>');
  }
  if (args.machine !== 'dave-gaming-pc') throw new Error('HF-309 requires --machine=dave-gaming-pc');
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error(`HF-309 requires win32/x64; received ${process.platform}/${process.arch}`);
  }
  const checkoutSourceSha = git('rev-parse', 'HEAD');
  const sourceTreeSha = git('rev-parse', `${expectedSourceSha}^{tree}`);
  if (checkoutSourceSha !== expectedSourceSha || !clean()) {
    throw new Error(`HF-309 requires one completely clean exact candidate A (${checkoutSourceSha}/${expectedSourceSha})`);
  }
  const releaseChannels = JSON.parse(readFileSync(resolve(root, 'release-channels.json'), 'utf8'));
  if (releaseChannels?.experimental?.pass !== 'PASS 71'
    || releaseChannels?.experimental?.path !== 'channels/the-big-one') {
    throw new Error('HF-309 requires the canonical staged Pass 71 channel');
  }
  const localViteOverrides = ['.env', '.env.local', '.env.production.local']
    .filter((path) => existsSync(resolve(root, path)));
  const inheritedVite = Object.keys(process.env).filter((name) => name.toUpperCase().startsWith('VITE_'));
  if (localViteOverrides.length > 0 || inheritedVite.length > 0) {
    throw new Error(`HF-309 rejects Vite overrides: ${[...localViteOverrides, ...inheritedVite].join(', ')}`);
  }
  const basePort = boundedPort(args['preview-port'] ?? process.env.PASS71_HF309_PREVIEW_PORT ?? '4596');
  if (await portIsListening(basePort) || await portIsListening(basePort + 1)) {
    throw new Error(`HF-309 requires fresh owned preview ports ${basePort}/${basePort + 1}`);
  }
  const edgeExecutable = installedEdge();
  const edgeIdentity = assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable));
  const edgeExecutableBytes = readFileSync(edgeExecutable);
  const edgeExecutableSha256 = sha256(edgeExecutableBytes);
  const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter(
    ([name]) => !name.toUpperCase().startsWith('VITE_')
      && !name.toUpperCase().startsWith('PASS71_HF309_'),
  ));
  const exactEnvironment = {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: expectedSourceSha,
    RELEASE_PASS: 'PASS 71',
    VITE_MATCH_BUILD_ID: expectedSourceSha,
    PASS71_HF309_NATIVE: '1',
    PASS71_HF309_SOURCE_SHA: expectedSourceSha,
    PASS71_HF309_EDGE_EXECUTABLE: edgeExecutable,
    PASS70_NATIVE_ENGINE_USER_AGENT: '1',
    QA_INSTALLED_EDGE: '1',
  };

  run('HF-309 lockfile preflight', process.execPath, [
    'scripts/qa/verify-npm10-lockfile.mjs',
  ], inheritedEnvironment);
  run('HF-309 static release wiring', process.execPath, [
    'node_modules/vitest/vitest.mjs', 'run',
    'src/pass71-hf309-chopper-first-entry-release-evidence.test.ts',
    'src/presentation-prewarm-contract.test.ts',
    'src/audio-combat-prewarm.test.ts',
  ], inheritedEnvironment);

  rmSync(artifactRoot, { recursive: true, force: true });
  mkdirSync(componentRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const components = [];
  for (const [index, renderer] of PASS71_HF309_RENDERERS.entries()) {
    const port = basePort + index;
    if (await portIsListening(port)) throw new Error(`HF-309 ${renderer} preview port ${port} is already owned`);
    const componentPath = resolve(componentRoot, `${renderer}.json`);
    // Each Playwright CLI invocation owns a newly launched installed Edge
    // process and fresh profile. Reusing one browser between renderers would
    // let WebGL2 preparation warm WebGPU evidence (or vice versa).
    run(`HF-309 installed Edge ${renderer}`, process.execPath, [
      'scripts/qa/run-playwright-with-topology.mjs',
      'tests/e2e/pass71-hf309-chopper-first-entry.spec.ts',
      '--project=chromium', '--workers=1', '--retries=0',
    ], {
      ...exactEnvironment,
      PASS71_HF309_RENDERER: renderer,
      PASS71_HF309_COMPONENT_PATH: componentPath,
      QA_PREVIEW_PORT: String(port),
    });
    components.push(readComponent(componentPath, renderer, edgeIdentity.productVersion));
    if (await portIsListening(port)) throw new Error(`HF-309 ${renderer} leaked owned preview port ${port}`);
  }
  const endingCheckoutSourceSha = git('rev-parse', 'HEAD');
  const cleanAfter = clean();
  if (endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter) {
    throw new Error(`HF-309 source drifted during evidence (${expectedSourceSha} -> ${endingCheckoutSourceSha})`);
  }
  if (sha256(readFileSync(edgeExecutable)) !== edgeExecutableSha256) {
    throw new Error('HF-309 installed Edge binary changed during evidence');
  }
  const tooling = pass71Hf309ToolingHashesAtSource(root, expectedSourceSha);
  if (components[0].browser.sessionNonce === components[1].browser.sessionNonce) {
    throw new Error('HF-309 renderer components did not receive fresh Edge profiles');
  }
  const completedAt = new Date().toISOString();
  const record = {
    ...PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE,
    startedAt,
    completedAt,
    source: {
      expectedSourceSha,
      checkoutSourceSha,
      endingCheckoutSourceSha,
      sourceTreeSha,
      releasePass: 'PASS 71',
      cleanBefore: true,
      cleanAfter,
    },
    environment: { machine: args.machine, platform: process.platform, arch: process.arch },
    browser: {
      channel: 'msedge',
      installed: true,
      executableName: basename(edgeExecutable),
      executableSha256: edgeExecutableSha256,
      productVersion: edgeIdentity.productVersion,
      installRoot: edgeIdentity.installRoot,
      authenticodeStatus: edgeIdentity.signatureStatus,
      authenticodeSigner: edgeIdentity.signerSubject,
      processIsolation: 'fresh-owned-installed-edge-process-and-profile-per-renderer',
      processCount: components.length,
    },
    coverage: {
      renderers: [...PASS71_HF309_RENDERERS],
      arenaId: 'gun-range',
      renderProfile: 'performance',
      entryPhases: ['first', 'warm'],
      trustedInputs: ['activation', 'first-entry', 'exit', 'warm-entry', 'final-exit'],
      preparedResources: [
        'authored-aircraft-lods', 'cockpit', 'gun-actions', 'missile-shell-and-impact-pools',
        'hud-dom', 'rotor-audio-pool', 'renderer-vocabulary',
      ],
      absoluteNativeFrameBudget: true,
      completedPresentationFrontiers: true,
      ownerSubjectiveInspectionPerformed: false,
    },
    tooling,
    components,
    faults: [],
  };
  record.receiptSha256 = pass71Hf309RecordSha256(record);
  assertPass71Hf309Evidence(record, { sourceSha: expectedSourceSha, sourceTreeSha, tooling });
  const receiptPath = resolve(artifactRoot, `${expectedSourceSha}-receipt.json`);
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  writeFileSync(receiptPath, bytes);
  writeFileSync(`${receiptPath}.sha256`, `${sha256(bytes)}  ${basename(receiptPath)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    evidenceId: record.evidenceId,
    closesFeedback: record.closesFeedback,
    sourceSha: expectedSourceSha,
    renderers: record.coverage.renderers,
    receiptSha256: record.receiptSha256,
    receiptPath,
  }, null, 2)}\n`);
}

await main();
