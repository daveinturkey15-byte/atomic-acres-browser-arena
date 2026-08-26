import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPass73NativeAdsRevealReceipt } from './pass73-native-ads-reveal-contract.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifactRoot = resolve(root, 'artifacts/pass73/native-ads-reveal');
const receiptPath = resolve(artifactRoot, 'receipt.json');
const chromePath = [
  process.env.PASS73_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((candidate) => existsSync(candidate));
if (!chromePath) throw new Error('Pass 73 native ADS reveal gate requires installed Google Chrome');

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

async function allocatePreviewPort() {
  const requested = Number(process.env.PASS73_NATIVE_ADS_REVEAL_PORT ?? 0);
  if (Number.isInteger(requested) && requested >= 1 && requested <= 65_535) return requested;
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('Could not allocate an owned Pass 73 ADS reveal preview port'));
        return;
      }
      server.close((error) => error ? rejectPort(error) : resolvePort(address.port));
    });
  });
}

const status = git('status', '--porcelain', '--untracked-files=all');
if (status !== '') throw new Error(`Pass 73 native ADS reveal gate requires a clean worktree:\n${status}`);
const head = git('rev-parse', 'HEAD');
const tree = git('rev-parse', 'HEAD^{tree}');
const chromeSha256 = sha256File(chromePath);
const previewPort = await allocatePreviewPort();
rmSync(artifactRoot, { recursive: true, force: true });

const result = spawnSync(process.execPath, [
  'scripts/qa/run-playwright-with-topology.mjs',
  'tests/e2e/pass73-native-ads-reveal.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...process.env,
    PASS73_NATIVE_WEBGPU: '1',
    PASS73_NATIVE_ADS_REVEAL: '1',
    PASS73_NATIVE_SOURCE_SHA: head,
    PASS73_NATIVE_TREE_SHA: tree,
    PASS73_NATIVE_CHROME_PATH: chromePath,
    PASS73_NATIVE_CHROME_SHA256: chromeSha256,
    PASS73_NATIVE_COMPOSITOR: 'headed-offscreen',
    QA_PREVIEW_PORT: String(previewPort),
  },
  stdio: 'inherit',
  windowsHide: true,
  shell: false,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 73 native ADS reveal gate terminated by ${result.signal}`);
if (result.status !== 0) throw new Error(`Pass 73 native ADS reveal gate failed with exit ${result.status}`);
if (!existsSync(receiptPath)) throw new Error('Pass 73 native ADS reveal gate did not emit its receipt');

const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
assertPass73NativeAdsRevealReceipt(receipt, { head, tree, executableSha256: chromeSha256 });
const endingHead = git('rev-parse', 'HEAD');
const endingTree = git('rev-parse', 'HEAD^{tree}');
const endingStatus = git('status', '--porcelain', '--untracked-files=all');
if (endingHead !== head || endingTree !== tree || endingStatus !== '') {
  throw new Error('Pass 73 native ADS reveal source changed during the exact-SHA run');
}
console.log(JSON.stringify({
  pass73NativeAdsReveal: 'ok',
  sourceSha: head,
  sourceTree: tree,
  chromeSha256,
  profiles: receipt.gate.profiles,
  weapons: receipt.gate.weapons,
  cells: receipt.gate.cells,
  skipped: receipt.gate.skipped,
  receipt: 'artifacts/pass73/native-ads-reveal/receipt.json',
}));
