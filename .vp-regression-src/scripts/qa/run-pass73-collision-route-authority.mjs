import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = Object.freeze({
  webgl2: Object.freeze({ renderer: 'webgl2', port: '4573', nativeWebGpu: false }),
  'native-webgpu': Object.freeze({ renderer: 'webgpu', port: '4574', nativeWebGpu: true }),
});
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) throw new Error(`Pass 73 collision-route target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);

const artifactRoot = resolve(root, 'artifacts/pass73/collision-route-authority', targetName);
const receiptPath = resolve(artifactRoot, 'receipt.json');

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
}

function discardEvidence(message) {
  rmSync(artifactRoot, { recursive: true, force: true });
  throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) discardEvidence(`Pass 73 collision-route rejects local Vite overrides: ${localViteOverrides.join(', ')}`);

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 73 collision-route evidence requires one completely clean committed source SHA');
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass73-collision-route-authority.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: 'PASS 73',
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.port,
    PASS73_NATIVE_WEBGPU: target.nativeWebGpu ? '1' : '0',
    PASS73_COLLISION_RENDERER: target.renderer,
    PASS73_COLLISION_TARGET: targetName,
    PASS73_COLLISION_SOURCE_SHA: sourceSha,
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 73 ${targetName} collision-route failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 73 ${targetName} collision-route terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) discardEvidence(`Pass 73 ${targetName} collision-route failed with exit ${result.status ?? 1}`);

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  discardEvidence(`Pass 73 ${targetName} collision-route emitted no readable receipt: ${error instanceof Error ? error.message : String(error)}`);
}
const screenshotsValid = Array.isArray(receipt.screenshots)
  && receipt.screenshots.length === 12
  && receipt.screenshots.every((entry) => {
    const absolutePath = resolve(root, entry.path ?? '');
    return Array.isArray(entry.roles)
      && entry.roles.length === 5
      && /^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
      && existsSync(absolutePath)
      && sha256(absolutePath) === entry.sha256;
  });
const profilesValid = Array.isArray(receipt.profileReceipts)
  && receipt.profileReceipts.length === 2
  && receipt.profileReceipts.every((entry, index) => entry?.profile === (index === 0 ? 'performance' : 'quality')
    && entry.report?.schema === 'atomic-acres/collision-route-authority@1'
    && entry.report?.pass === true
    && entry.report?.expectedOwners === 10
    && entry.report?.passedOwners === 10
    && entry.report?.expectedRouteClearances === 48
    && entry.report?.passedRouteClearances === 48
    && Array.isArray(entry.report?.issues)
    && entry.report.issues.length === 0
    && entry.runtime?.requestedBackend === target.renderer
    && entry.runtime?.actualBackend === target.renderer
    && entry.runtime?.initialized === true
    && entry.runtime?.failClosed === false);
if (receipt.schemaVersion !== 1
  || receipt.status !== 'PASS'
  || receipt.contract !== 'atomic-acres/pass73-collision-route-authority-receipt@1'
  || receipt.sourceSha !== sourceSha
  || receipt.target !== targetName
  || receipt.renderer !== target.renderer
  || receipt.matrix?.profiles !== 2
  || receipt.matrix?.houses !== 2
  || receipt.matrix?.stances !== 3
  || receipt.matrix?.roles !== 5
  || receipt.matrix?.stagedRows !== 60
  || !Array.isArray(receipt.stagedReceipts)
  || receipt.stagedReceipts.length !== 60
  || !profilesValid
  || !screenshotsValid
  || !Array.isArray(receipt.browserErrors)
  || receipt.browserErrors.length !== 0) {
  discardEvidence(`Pass 73 ${targetName} collision-route emitted invalid, incomplete, or stale evidence`);
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 73 ${targetName} collision-route source drifted during verification (${sourceSha} -> ${endingSha})`);
}
console.log(JSON.stringify({
  pass73CollisionRouteAuthority: 'PASS', target: targetName, sourceSha, receiptPath,
}, null, 2));
