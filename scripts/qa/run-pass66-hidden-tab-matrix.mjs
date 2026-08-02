import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_SELECTED_ARENA_CONTRACTS } from './pass66-hidden-tab-contract.mjs';

const root = process.cwd();
const verifier = fileURLToPath(new URL('./verify-pass66-hidden-tab-admission.mjs', import.meta.url));
const artifactRoot = resolve(root, 'artifacts/pass66/hidden-tab-admission');
const aggregateReceiptPath = resolve(artifactRoot, 'receipt.json');
const aggregateTempPath = `${aggregateReceiptPath}.tmp`;
const baseUrl = process.env.QA_BASE_URL ?? '';

rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(artifactRoot, { recursive: true });

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
const inheritedViteVariables = Object.keys(process.env).filter((key) => key.toUpperCase().startsWith('VITE_'));
if (localViteOverrides.length > 0 || inheritedViteVariables.length > 0) {
  throw new Error(`Pass 66 hidden-tab matrix rejects local Vite overrides (${[
    ...localViteOverrides,
    ...inheritedViteVariables,
  ].join(', ')})`);
}
if (!/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/$/u.test(baseUrl)) {
  throw new Error('Pass 66 hidden-tab matrix requires its newly owned local staged preview');
}

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  throw new Error('Pass 66 hidden-tab matrix requires one completely clean source SHA');
}

const provenanceResponse = await fetch(new URL('/channels/the-big-one/channel-provenance.json', baseUrl), {
  cache: 'no-store',
  signal: AbortSignal.timeout(10_000),
});
if (!provenanceResponse.ok) throw new Error(`Pass 66 hidden-tab candidate provenance returned HTTP ${provenanceResponse.status}`);
const servedCandidate = await provenanceResponse.json();
if (servedCandidate?.schemaVersion !== 4 || servedCandidate.channel !== 'the-big-one'
  || servedCandidate.releasePass !== 'PASS 66' || servedCandidate.path !== 'channels/the-big-one'
  || servedCandidate.sourceSha !== sourceSha || !/^[a-f0-9]{64}$/u.test(servedCandidate.treeSha256 ?? '')
  || !Number.isSafeInteger(servedCandidate.exactRootFileCount) || servedCandidate.exactRootFileCount < 2) {
  throw new Error(`Pass 66 hidden-tab served candidate is not the clean source SHA: ${JSON.stringify(servedCandidate)}`);
}

const maps = [];
for (const selectedArenaId of Object.keys(REQUIRED_SELECTED_ARENA_CONTRACTS)) {
  process.stdout.write(`\n[pass66 hidden-tab] ${selectedArenaId}\n`);
  execFileSync(process.execPath, [verifier], {
    cwd: root,
    env: {
      ...process.env,
      PASS66_HIDDEN_TAB_MAP: selectedArenaId,
      PASS66_HIDDEN_TAB_SOURCE_SHA: sourceSha,
      PASS66_HIDDEN_TAB_TREE_SHA256: servedCandidate.treeSha256,
      PASS66_HIDDEN_TAB_FILE_COUNT: String(servedCandidate.exactRootFileCount),
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  const receiptPath = resolve(artifactRoot, selectedArenaId, 'exact-sha-receipt.json');
  const serialized = readFileSync(receiptPath, 'utf8');
  const receipt = JSON.parse(serialized);
  if (receipt.schema !== 'atomic-acres/pass66-hidden-tab-admission@2' || receipt.verdict !== 'pass'
    || receipt.contract?.selectedArenaId !== selectedArenaId || receipt.sourceRevision !== sourceSha
    || receipt.sourceState?.endingRevision !== sourceSha || receipt.sourceState?.cleanAfter !== true
    || receipt.servedCandidate?.sourceSha !== sourceSha
    || receipt.servedCandidate?.treeSha256 !== servedCandidate.treeSha256
    || receipt.servedCandidate?.exactRootFileCount !== servedCandidate.exactRootFileCount) {
    throw new Error(`Pass 66 hidden-tab ${selectedArenaId} emitted an invalid exact-SHA receipt`);
  }
  maps.push({
    arenaId: selectedArenaId,
    receiptPath: receiptPath.replace(`${root}\\`, '').replaceAll('\\', '/'),
    receiptSha256: createHash('sha256').update(serialized).digest('hex'),
  });
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (sourceStatus() || endingSha !== sourceSha) {
  throw new Error(`Pass 66 hidden-tab matrix source drifted during verification (${sourceSha} -> ${endingSha})`);
}
const aggregate = {
  schema: 'atomic-acres/pass66-hidden-tab-matrix@1',
  status: 'PASS',
  sourceSha,
  endingSha,
  servedCandidate,
  maps,
};
mkdirSync(dirname(aggregateReceiptPath), { recursive: true });
writeFileSync(aggregateTempPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
renameSync(aggregateTempPath, aggregateReceiptPath);
console.log(JSON.stringify({ status: 'PASS', sourceSha, maps, receiptPath: aggregateReceiptPath }, null, 2));
