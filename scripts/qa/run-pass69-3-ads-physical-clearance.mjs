import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4537' }),
  'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4538' }),
});
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  throw new Error(`Pass 69.3 physical ADS target must be one of ${Object.keys(targets).join(', ')}; received ${targetName || '(missing)'}`);
}

const artifactBase = resolve(root, 'artifacts/pass69-3/ads-physical-clearance');
const rendererArtifacts = resolve(artifactBase, target.renderer);
const receiptPath = resolve(artifactBase, `receipt-${target.renderer}.json`);
mkdirSync(artifactBase, { recursive: true });
rmSync(receiptPath, { force: true });

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function discardEvidence(message) {
  rmSync(receiptPath, { force: true });
  rmSync(rendererArtifacts, { recursive: true, force: true });
  throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) {
  discardEvidence(`Pass 69.3 physical ADS rejects local Vite environment overrides: ${localViteOverrides.join(', ')}`);
}
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 69.3 physical ADS requires one completely clean source SHA');
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass69-3-ads-physical-clearance.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: 'PASS 69',
    VITE_MATCH_BUILD_ID: sourceSha,
    QA_INSTALLED_EDGE: '1',
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? target.port,
    PASS69_3_ADS_PHYSICAL_RENDERER: target.renderer,
    PASS69_3_ADS_PHYSICAL_RENDER_PROFILE: 'blender',
    PASS69_3_ADS_PHYSICAL_SOURCE_SHA: sourceSha,
    PASS69_3_ADS_PHYSICAL_TARGET: targetName,
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 69.3 ${targetName} physical ADS failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 69.3 ${targetName} physical ADS terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) discardEvidence(`Pass 69.3 ${targetName} physical ADS failed with exit ${result.status ?? 1}`);

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  discardEvidence(`Pass 69.3 ${targetName} physical ADS did not emit a readable receipt: ${error instanceof Error ? error.message : String(error)}`);
}
const runtimeValid = (runtime) => runtime?.requestedBackend === target.renderer
  && runtime.actualBackend === target.renderer
  && runtime.initialized === true
  && runtime.failClosed === false
  && runtime.softwareAdapter === false
  && runtime.deviceLost === false
  && runtime.uncapturedErrors === 0
  && (target.renderer === 'webgpu'
    ? runtime.adapterClass === 'GPUAdapter'
      && runtime.deviceClass === 'GPUDevice'
      && runtime.presentation?.status === 'healthy'
    : runtime.adapterClass === 'WebGL2RenderingContext'
      && runtime.presentation?.status === 'synchronous');
const expectedWeapons = ['carbine', 'mini-uzi'];
const weaponsValid = Array.isArray(receipt.weapons)
  && receipt.weapons.length === expectedWeapons.length
  && receipt.weapons.every((entry, index) => {
    const weapon = expectedWeapons[index];
    const hipPath = `artifacts/pass69-3/ads-physical-clearance/${target.renderer}/${index + 1}-${weapon}-hip-retention.png`;
    const adsPath = `artifacts/pass69-3/ads-physical-clearance/${target.renderer}/${index + 1}-${weapon}-physical-ads-corridor.png`;
    const hipFile = resolve(root, hipPath);
    const adsFile = resolve(root, adsPath);
    return entry?.weapon === weapon
      && entry.hip?.materials?.materialCount >= 5
      && entry.hip.materials.restoredCount === entry.hip.materials.materialCount
      && entry.ads?.rearOccluderTrim?.applied === true
      && entry.ads.rearOccluderTrim.contract === 'rear-sight-axis-spatial-degenerate-v1'
      && entry.ads.rearOccluderTrim.suppressionRatio < 0.08
      && entry.ads?.sightBore?.applied === true
      && entry.ads.sightBore.contract === 'physical-aperture-spatial-degenerate-v1'
      && entry.ads.sightBore.rayCount === 9
      && entry.ads?.opaqueSightWindow?.blockedRays === 0
      && entry.ads.opaqueSightWindow.maximumHits === 0
      && entry.ads?.materials?.nonOpaqueCount === entry.ads.materials.materialCount
      && entry.ads.materials.depthWriteDisabledCount === entry.ads.materials.materialCount
      && entry.restored?.restoredCount === entry.restored?.materialCount
      && entry.hip?.screenshot?.path === hipPath
      && entry.ads?.screenshot?.path === adsPath
      && /^[a-f0-9]{64}$/u.test(entry.hip.screenshot.sha256 ?? '')
      && /^[a-f0-9]{64}$/u.test(entry.ads.screenshot.sha256 ?? '')
      && existsSync(hipFile) && sha256(hipFile) === entry.hip.screenshot.sha256
      && existsSync(adsFile) && sha256(adsFile) === entry.ads.screenshot.sha256;
  });
if (receipt.schemaVersion !== 1
  || receipt.status !== 'PASS'
  || receipt.contract !== 'atomic-acres/pass69-3-ads-physical-clearance@1'
  || receipt.evidenceScope !== 'live-physical-viewmodel-clearance'
  || receipt.target !== targetName
  || receipt.sourceSha !== sourceSha
  || receipt.endingSourceSha !== sourceSha
  || receipt.cleanSource !== true
  || receipt.renderer !== target.renderer
  || receipt.renderProfile !== 'blender'
  || receipt.browser?.project !== 'chromium'
  || receipt.browser?.channel !== 'msedge'
  || !/Edg\//u.test(receipt.browser?.userAgent ?? '')
  || receipt.servedCandidate?.schemaVersion !== 4
  || receipt.servedCandidate.channel !== 'the-big-one'
  || receipt.servedCandidate.releasePass !== 'PASS 69'
  || receipt.servedCandidate.path !== 'channels/the-big-one'
  || receipt.servedCandidate.sourceSha !== sourceSha
  || !/^[a-f0-9]{64}$/u.test(receipt.servedCandidate?.treeSha256 ?? '')
  || !Number.isSafeInteger(receipt.servedCandidate?.exactRootFileCount)
  || receipt.servedCandidate.exactRootFileCount < 2
  || !runtimeValid(receipt.runtimeBefore)
  || !runtimeValid(receipt.runtimeAfter)
  || !weaponsValid
  || !Array.isArray(receipt.browserErrors)
  || receipt.browserErrors.length !== 0) {
  discardEvidence(`Pass 69.3 ${targetName} physical ADS emitted invalid or stale evidence`);
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 69.3 ${targetName} physical ADS source drifted during verification (${sourceSha} -> ${endingSha})`);
}
console.log(JSON.stringify({
  pass69_3PhysicalAds: 'PASS', target: targetName, sourceSha, receiptPath,
}, null, 2));
