import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { PASS70_NATIVE_USER_AGENT_ENV } from './pass70-cross-browser-native-user-agent-contract.mjs';

const targets = Object.freeze({
  available: Object.freeze({
    engines: 'chromium,webkit,chrome,edge',
    guestEngine: 'edge',
    verifyCrossEnginePair: true,
    verifyFirefox: false,
    defaultPort: '4547',
  }),
  firefox: Object.freeze({
    engines: 'firefox',
    guestEngine: 'firefox',
    verifyCrossEnginePair: true,
    verifyFirefox: true,
    verifyOpera: false,
    defaultPort: '4548',
  }),
  firefoxWebgpu: Object.freeze({
    engines: 'firefox',
    guestEngine: 'firefox',
    verifyCrossEnginePair: true,
    verifyFirefox: true,
    verifyOpera: false,
    renderer: 'webgpu',
    renderProfile: 'blender',
    headless: false,
    hostChannel: 'chrome',
    releasePass: 'PASS 71',
    defaultPort: '4552',
  }),
  iphone15: Object.freeze({
    engines: 'webkit',
    guestEngine: 'webkit',
    verifyCrossEnginePair: false,
    verifyFirefox: false,
    verifyOpera: false,
    defaultPort: '4549',
  }),
  opera: Object.freeze({
    engines: 'opera',
    guestEngine: 'opera',
    verifyCrossEnginePair: true,
    verifyFirefox: false,
    verifyOpera: true,
    defaultPort: '4550',
  }),
});

const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 70 cross-browser target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}
const operaExecutablePath = process.env.PASS70_OPERA_EXECUTABLE_PATH
  ? resolve(process.env.PASS70_OPERA_EXECUTABLE_PATH)
  : null;
if (target.verifyOpera && (
  !operaExecutablePath
  || !existsSync(operaExecutablePath)
  || !statSync(operaExecutablePath).isFile()
  || basename(operaExecutablePath).toLowerCase() !== 'opera.exe'
)) {
  throw new Error('Pass 70 Opera verification requires an existing PASS70_OPERA_EXECUTABLE_PATH');
}
const operaBinarySha256 = operaExecutablePath
  ? createHash('sha256').update(readFileSync(operaExecutablePath)).digest('hex')
  : null;

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
}).trim();
const sourceStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus) {
  throw new Error('Pass 70 cross-browser verification requires one completely clean source SHA');
}

const result = spawnSync(process.execPath, [
  resolve('scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass70-cross-browser-firefox-multiplayer.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PASS70_VERIFY_CROSS_BROWSER: '1',
    [PASS70_NATIVE_USER_AGENT_ENV]: '1',
    PASS70_CROSS_BROWSER_SOURCE_SHA: sourceSha,
    PASS70_ENGINE_MATRIX: target.engines,
    PASS70_CROSS_GUEST_ENGINE: target.guestEngine,
    PASS70_VERIFY_CROSS_ENGINE_PAIR: target.verifyCrossEnginePair ? '1' : '0',
    PASS70_CROSS_BROWSER_RENDERER: target.renderer ?? 'webgl2',
    PASS70_CROSS_BROWSER_RENDER_PROFILE: target.renderProfile ?? 'compat',
    PASS70_CROSS_BROWSER_HEADLESS: target.headless === false ? '0' : '1',
    PASS70_CROSS_BROWSER_HOST_CHANNEL: target.hostChannel ?? 'chromium',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: target.releasePass ?? 'PASS 70',
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.defaultPort,
    ...(target.verifyFirefox ? { PASS70_VERIFY_FIREFOX: '1' } : {}),
    ...(target.verifyOpera ? {
      PASS70_VERIFY_OPERA: '1',
      PASS70_OPERA_EXECUTABLE_PATH: operaExecutablePath,
      PASS70_OPERA_BINARY_SHA256: operaBinarySha256,
    } : {}),
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 70 ${targetName} cross-browser verifier terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) process.exitCode = result.status ?? 1;
