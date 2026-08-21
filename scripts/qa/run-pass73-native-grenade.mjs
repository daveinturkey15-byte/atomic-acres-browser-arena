import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPass73NativeGrenadeReceipt } from './pass73-native-grenade-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifactRoot = resolve(root, 'artifacts/pass73/native-grenade');
const receiptPath = resolve(artifactRoot, 'receipt.json');
const chromePath = [
  process.env.PASS73_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error('Pass 73 native grenade gate requires installed Google Chrome');

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const status = git('status', '--porcelain', '--untracked-files=all');
if (status !== '') throw new Error(`Pass 73 native grenade gate requires a clean worktree:\n${status}`);
const head = git('rev-parse', 'HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
const chromeSha256 = sha256File(chromePath);
rmSync(artifactRoot, { recursive: true, force: true });

const result = spawnSync(process.execPath, [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass73-native-grenade.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...process.env,
    PASS73_NATIVE_WEBGPU: '1',
    PASS73_NATIVE_SOURCE_SHA: head,
    PASS73_NATIVE_TREE_SHA: tree,
    PASS73_NATIVE_CHROME_PATH: chromePath,
    PASS73_NATIVE_CHROME_SHA256: chromeSha256,
  },
  stdio: 'inherit',
  windowsHide: true,
  shell: false,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 73 native grenade gate terminated by ${result.signal}`);
if (result.status !== 0) throw new Error(`Pass 73 native grenade gate failed with exit ${result.status}`);
if (!existsSync(receiptPath)) throw new Error('Pass 73 native grenade gate did not emit its receipt');

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
assertPass73NativeGrenadeReceipt(receipt, { head, tree, executableSha256: chromeSha256 });
const endingHead = git('rev-parse', 'HEAD');
const endingTree = git('rev-parse', 'HEAD^{tree}');
const endingStatus = git('status', '--porcelain', '--untracked-files=all');
if (endingHead !== head || endingTree !== tree || endingStatus !== '') {
  throw new Error('Pass 73 native grenade source changed during the exact-SHA run');
}
console.log(JSON.stringify({
  pass73NativeGrenade: 'ok',
  sourceSha: head,
  sourceTree: tree,
  chromeSha256,
  profiles: receipt.gate.profiles,
  contextsPerProfile: receipt.gate.contextsPerProfile,
  receipt: 'artifacts/pass73/native-grenade/receipt.json',
}));
