import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4523' }),
  'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4524' }),
});
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 66 ADS catalog target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const artifactDirectory = resolve('artifacts/pass66/ads-sight-catalog');
const receiptPath = resolve(artifactDirectory, `receipt-${target.renderer}.json`);
mkdirSync(artifactDirectory, { recursive: true });
rmSync(receiptPath, { force: true });
const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (status) throw new Error('Pass 66 ADS catalog requires a completely clean worktree');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) throw new Error(`Invalid Pass 66 ADS-catalog source SHA ${sourceSha}`);

const cli = resolve('node_modules/@playwright/test/cli.js');
const result = spawnSync(process.execPath, [
  cli,
  'test',
  'tests/e2e/pass66-ads-sight-catalog.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    QA_EXTERNAL_PREVIEW: '0',
    QA_REQUIRE_OWNED_FRESH_PREVIEW: '1',
    QA_INSTALLED_EDGE: '1',
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.port,
    PASS66_ADS_CATALOG_RENDERER: target.renderer,
    PASS66_ADS_CATALOG_RENDER_PROFILE: 'blender',
    PASS66_ADS_CATALOG_SOURCE_SHA: sourceSha,
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pass 66 ${targetName} ADS catalog terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) {
  process.exitCode = result.status ?? 1;
} else {
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.schemaVersion !== 2 || receipt.status !== 'PASS' || receipt.sourceSha !== sourceSha
    || receipt.renderer !== target.renderer || receipt.renderProfile !== 'blender'
    || receipt.canonicalWeaponCount < 1
    || receipt.uniqueProfileSignatures !== receipt.canonicalWeaponCount
    || receipt.uniqueIsolatedReticles !== receipt.canonicalWeaponCount) {
    rmSync(receiptPath, { force: true });
    throw new Error(`Pass 66 ${targetName} ADS catalog emitted an invalid or stale receipt`);
  }
  console.log(JSON.stringify({ pass66AdsCatalog: 'PASS', target: targetName, sourceSha, receiptPath }));
}
