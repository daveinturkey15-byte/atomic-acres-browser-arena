import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const targets = Object.freeze({
  available: Object.freeze({
    engines: 'chromium,webkit,chrome,edge',
    guestEngine: 'edge',
    verifyFirefox: false,
    defaultPort: '4547',
  }),
  firefox: Object.freeze({
    engines: 'firefox',
    guestEngine: 'firefox',
    verifyFirefox: true,
    defaultPort: '4548',
  }),
});

const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 70 cross-browser target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

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
    PASS70_CROSS_BROWSER_SOURCE_SHA: sourceSha,
    PASS70_ENGINE_MATRIX: target.engines,
    PASS70_CROSS_GUEST_ENGINE: target.guestEngine,
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: 'PASS 70',
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.defaultPort,
    ...(target.verifyFirefox ? { PASS70_VERIFY_FIREFOX: '1' } : {}),
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 70 ${targetName} cross-browser verifier terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) process.exitCode = result.status ?? 1;
