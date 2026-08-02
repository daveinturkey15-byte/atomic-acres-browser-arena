import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass66/prone-contact-matrix');
const receiptPath = resolve(artifactRoot, 'receipt.json');
const receiptTempPath = `${receiptPath}.tmp`;
mkdirSync(artifactRoot, { recursive: true });
rmSync(receiptPath, { force: true });
rmSync(receiptTempPath, { force: true });

const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (dirty) throw new Error('Pass 66 prone contact matrix requires a completely clean worktree');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) throw new Error(`Invalid candidate source SHA ${sourceSha}`);

const result = spawnSync(process.execPath, [
  resolve('node_modules/@playwright/test/cli.js'),
  'test',
  'tests/e2e/pass66-prone-contact-matrix.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...process.env,
    PASS66_PRONE_CONTACT_MATRIX: '1',
    PASS66_PRONE_CONTACT_SOURCE_SHA: sourceSha,
    PASS66_PRONE_CONTACT_RENDERER: process.env.PASS66_PRONE_CONTACT_RENDERER ?? 'webgl2',
    PASS66_PRONE_CONTACT_PEER_PORT: process.env.PASS66_PRONE_CONTACT_PEER_PORT ?? '9071',
    QA_INSTALLED_EDGE: '1',
    QA_EXTERNAL_PREVIEW: '0',
    QA_REQUIRE_OWNED_FRESH_PREVIEW: '1',
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? '4524',
  },
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 66 prone contact matrix terminated by ${result.signal}`);
if (result.status === 0) {
  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    if (receipt.status !== 'PASS' || receipt.sourceSha !== sourceSha
      || receipt.contract?.soloCells !== 12 || receipt.contract?.twoPeerCells !== 12) {
      throw new Error(`Invalid Pass 66 prone contact receipt ${JSON.stringify({
        status: receipt.status,
        sourceSha: receipt.sourceSha,
        soloCells: receipt.contract?.soloCells,
        twoPeerCells: receipt.contract?.twoPeerCells,
      })}`);
    }
    const finalDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const finalSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (finalDirty || finalSha !== sourceSha) throw new Error('Pass 66 prone contact runner detected source drift');
  } catch (error) {
    rmSync(receiptPath, { force: true });
    rmSync(receiptTempPath, { force: true });
    throw error;
  }
} else {
  rmSync(receiptPath, { force: true });
  rmSync(receiptTempPath, { force: true });
}
process.exitCode = result.status ?? 1;
