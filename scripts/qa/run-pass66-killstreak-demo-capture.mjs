import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass66/killstreak-demo-capture');
const receiptPath = resolve(artifactRoot, 'capture-receipt.json');
const playwrightCli = resolve(root, 'node_modules/@playwright/test/cli.js');
const tsxCli = resolve(root, 'node_modules/tsx/dist/cli.mjs');
const finalizer = resolve(root, 'scripts/qa/finalize-pass66-killstreak-demo-media.ts');
const viteLocalOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));

if (viteLocalOverrides.length > 0) {
  throw new Error(`Pass 66 killstreak capture rejects local Vite environment overrides: ${viteLocalOverrides.join(', ')}`);
}

rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(artifactRoot, { recursive: true });

const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (dirty) throw new Error('Pass 66 killstreak video capture requires a completely clean source-freeze worktree');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) throw new Error(`Invalid capture source SHA ${sourceSha}`);

const previewPortNumber = Number(process.env.QA_PREVIEW_PORT ?? '4523');
if (!Number.isInteger(previewPortNumber) || previewPortNumber < 1 || previewPortNumber > 65_535) {
  throw new Error(`Invalid Pass 66 killstreak capture preview port ${process.env.QA_PREVIEW_PORT ?? ''}`);
}
const previewPort = String(previewPortNumber);
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const childEnvironment = {
  ...inheritedEnvironment,
  NODE_ENV: 'production',
  PASS66_KILLSTREAK_CAPTURE_SOURCE_SHA: sourceSha,
  SOURCE_SHA: sourceSha,
  RELEASE_PASS: 'PASS 68',
  RELEASE_DIST_ROOT: '',
  RELEASE_TOPOLOGY_RECEIPT_PATH: '',
  QA_EXTERNAL_PREVIEW: '0',
  QA_REQUIRE_OWNED_FRESH_PREVIEW: '1',
  QA_PREVIEW_HOST: '127.0.0.1',
  QA_PREVIEW_PORT: previewPort,
  BASE_URL: `http://127.0.0.1:${previewPort}`,
};
const capture = spawnSync(process.execPath, [
  playwrightCli,
  'test',
  'tests/e2e/pass66-gun-range-killstreak-demo-capture.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: childEnvironment,
  stdio: 'inherit',
  windowsHide: true,
});

function rejectReceipt(message) {
  rmSync(receiptPath, { force: true });
  throw new Error(message);
}

if (capture.error) rejectReceipt(capture.error.message);
if (capture.signal) rejectReceipt(`Pass 66 killstreak video capture terminated by ${capture.signal}`);
if (capture.status !== 0) rejectReceipt(`Pass 66 killstreak video capture failed with exit ${capture.status ?? 'unknown'}`);
if (!existsSync(receiptPath)) rejectReceipt('Pass 66 killstreak video capture exited successfully without a receipt');

const finalDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
const finalSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim();
if (finalDirty || finalSha !== sourceSha) rejectReceipt('Pass 66 killstreak capture source drifted during execution');

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  rejectReceipt(`Pass 66 killstreak capture receipt is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}
if (receipt.gitHead !== sourceSha || receipt.servedSourceSha !== sourceSha) {
  rejectReceipt('Pass 66 killstreak capture receipt does not bind the clean and served source SHA');
}

const validation = spawnSync(process.execPath, [tsxCli, finalizer, '--validate-capture-only'], {
  cwd: root,
  env: childEnvironment,
  stdio: 'inherit',
  windowsHide: true,
});
if (validation.error) rejectReceipt(validation.error.message);
if (validation.signal) rejectReceipt(`Pass 66 killstreak receipt validation terminated by ${validation.signal}`);
if (validation.status !== 0) rejectReceipt(`Pass 66 killstreak receipt validation failed with exit ${validation.status ?? 'unknown'}`);

console.log(JSON.stringify({ status: 'validated-clean-source-capture', sourceSha, receiptPath }, null, 2));
