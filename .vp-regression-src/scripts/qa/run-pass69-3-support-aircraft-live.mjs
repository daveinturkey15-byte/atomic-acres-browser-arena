import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const targets = Object.freeze({
  'edge-webgl2': Object.freeze({ renderer: 'webgl2', port: '4561' }),
  'edge-webgpu': Object.freeze({ renderer: 'webgpu', port: '4562' }),
});
const targetName = process.argv[2] ?? '';
const target = targets[targetName];
if (!target) {
  console.error(`Usage: node scripts/qa/run-pass69-3-support-aircraft-live.mjs ${Object.keys(targets).join('|')}`);
  process.exit(2);
}

function discardEvidence(message) {
  console.error(message);
  process.exit(1);
}

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function sourceStatus() {
  return gitOutput(['status', '--porcelain', '--untracked-files=all']);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sameArray(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function runtimeValid(runtime) {
  return runtime?.requestedBackend === target.renderer
    && runtime.actualBackend === target.renderer
    && runtime.initialized === true
    && runtime.failClosed === false
    && runtime.softwareAdapter === false
    && runtime.deviceLost === false
    && runtime.uncapturedErrors === 0
    && typeof runtime.adapterLabel === 'string'
    && runtime.adapterLabel.trim().length > 0
    && !/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu.test(runtime.adapterLabel)
    && (target.renderer === 'webgpu'
      ? runtime.adapterClass === 'GPUAdapter'
        && runtime.deviceClass === 'GPUDevice'
        && runtime.presentation?.status === 'healthy'
      : runtime.adapterClass === 'WebGL2RenderingContext'
        && runtime.presentation?.status === 'synchronous');
}

function contextValid(contextLifecycle) {
  return target.renderer === 'webgpu'
    || (contextLifecycle?.lost === false
      && contextLifecycle.losses === 0
      && contextLifecycle.restorations === 0);
}

function webglValid(webgl, runtime) {
  return target.renderer === 'webgpu'
    ? webgl === null
    : webgl?.adapterClass === 'WebGL2RenderingContext'
      && typeof webgl.unmaskedRenderer === 'string'
      && webgl.unmaskedRenderer === runtime?.adapterLabel
      && /ANGLE/iu.test(webgl.unmaskedRenderer);
}

function wingValid(wing, family) {
  return wing?.contract === 'visible-rendered-wing-span-v1'
    && wing.family === family
    && wing.passed === true
    && Number.isSafeInteger(wing.visibleMeshCount)
    && wing.visibleMeshCount > 0
    && Array.isArray(wing.span)
    && wing.span.length === 3
    && wing.span.every(Number.isFinite)
    && Array.isArray(wing.aircraftSpan)
    && wing.aircraftSpan.length === 3
    && wing.aircraftSpan.every(Number.isFinite)
    && wing.span[0] > wing.span[2] * 0.8
    && wing.lateralSpanRatio >= 0.65;
}

const expectedCaptures = Object.freeze([
  Object.freeze({ family: 'care', lodIndex: 0, label: 'near', expectedDistanceM: 40 }),
  Object.freeze({ family: 'care', lodIndex: 1, label: 'mid', expectedDistanceM: 120 }),
  Object.freeze({ family: 'care', lodIndex: 2, label: 'far', expectedDistanceM: 220 }),
  Object.freeze({ family: 'carpet', lodIndex: 0, label: 'near', expectedDistanceM: 40 }),
  Object.freeze({ family: 'carpet', lodIndex: 1, label: 'mid', expectedDistanceM: 120 }),
  Object.freeze({ family: 'carpet', lodIndex: 2, label: 'far', expectedDistanceM: 220 }),
]);

function captureValid(capture, expected) {
  const presentation = capture?.presentation;
  const screenshotPath = `artifacts/pass69-3/support-aircraft-live/${target.renderer}`
    + `/${expected.family}-lod${expected.lodIndex}-${expected.label}.png`;
  const screenshotFile = resolve(root, screenshotPath);
  return capture?.family === expected.family
    && capture.label === expected.label
    && capture.lodIndex === expected.lodIndex
    && capture.expectedDistanceM === expected.expectedDistanceM
    && presentation?.poolKey === `${expected.family}-aircraft`
    && presentation.presentationSource === 'project-original-blender-glb'
    && presentation.visible === true
    && presentation.visibleMeshCount > 0
    && presentation.visibleBounds !== null
    && presentation.activeLodIndex === expected.lodIndex
    && new RegExp(`-${expected.family === 'care' ? 'care-package' : 'carpet-bomber'}-aircraft-authored-lod${expected.lodIndex}$`, 'u')
      .test(presentation.activeLodName ?? '')
    && new RegExp(`pass65-${expected.family}-aircraft-lod${expected.lodIndex}\\.glb$`, 'u')
      .test(presentation.activeLodAsset ?? '')
    && wingValid(presentation.activeAircraftWing, expected.family)
    && Array.isArray(presentation.cameraPosition)
    && presentation.cameraPosition.length === 3
    && presentation.cameraPosition.every(Number.isFinite)
    && Number.isFinite(presentation.cameraDistanceM)
    && Math.abs(presentation.cameraDistanceM - expected.expectedDistanceM) <= 12
    && capture.screenshot?.path === screenshotPath
    && /^[a-f0-9]{64}$/u.test(capture.screenshot?.sha256 ?? '')
    && existsSync(screenshotFile)
    && statSync(screenshotFile).size > 10_000
    && sha256(screenshotFile) === capture.screenshot.sha256;
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) {
  discardEvidence(`Pass 69.3 support-aircraft live gate rejects local Vite environment overrides: ${localViteOverrides.join(', ')}`);
}
const sourceSha = gitOutput(['rev-parse', 'HEAD']);
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 69.3 support-aircraft live gate requires one completely clean source SHA');
}

const receiptPath = resolve(root, 'artifacts/pass69-3/support-aircraft-live', `receipt-${target.renderer}.json`);
rmSync(receiptPath, { force: true });
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass65-support-vehicle-assets.spec.ts',
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
    QA_PREVIEW_PORT: target.port,
    PASS69_3_SUPPORT_AIRCRAFT_RENDERER: target.renderer,
    PASS69_3_SUPPORT_AIRCRAFT_RENDER_PROFILE: 'blender',
    PASS69_3_SUPPORT_AIRCRAFT_SOURCE_SHA: sourceSha,
    PASS69_3_SUPPORT_AIRCRAFT_TARGET: targetName,
    PASS69_3_SUPPORT_AIRCRAFT_LIVE_ONLY: '1',
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 69.3 ${targetName} support-aircraft gate failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 69.3 ${targetName} support-aircraft gate terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) {
  discardEvidence(`Pass 69.3 ${targetName} support-aircraft gate failed with exit ${result.status ?? 1}`);
}

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  discardEvidence(`Pass 69.3 ${targetName} support-aircraft gate did not emit a readable receipt: ${error instanceof Error ? error.message : String(error)}`);
}

const wingsValid = ['care', 'carpet'].every((family) => (
  Array.isArray(receipt.aircraftWings?.[family])
  && receipt.aircraftWings[family].length === 3
  && receipt.aircraftWings[family].every((wing) => wingValid(wing, family))
));
const liveKeys = Array.isArray(receipt.liveAircraft)
  ? receipt.liveAircraft.map((entry) => entry.poolKey).sort()
  : [];
const liveValid = sameArray(liveKeys, ['care-aircraft', 'carpet-aircraft'])
  && receipt.liveAircraft.every((entry) => (
    entry.presentationSource === 'project-original-blender-glb'
    && entry.visible === true
    && entry.visibleMeshCount > 0
    && entry.visibleBounds !== null
  ));
const capturesValid = Array.isArray(receipt.lodCaptures)
  && receipt.lodCaptures.length === expectedCaptures.length
  && receipt.lodCaptures.every((capture, index) => captureValid(capture, expectedCaptures[index]))
  && new Set(receipt.lodCaptures.map((capture) => capture.screenshot.sha256)).size === expectedCaptures.length;

if (receipt.schemaVersion !== 1
  || receipt.status !== 'PASS'
  || receipt.contract !== 'atomic-acres/pass69-3-support-aircraft-live@1'
  || receipt.evidenceScope !== 'care-and-carpet-live-authored-near-mid-far-wing-presentation'
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
  || !contextValid(receipt.contextLifecycleBefore)
  || !contextValid(receipt.contextLifecycleAfter)
  || !webglValid(receipt.webglBefore, receipt.runtimeBefore)
  || !webglValid(receipt.webglAfter, receipt.runtimeAfter)
  || receipt.runtimeErrorVisibleBefore !== false
  || receipt.runtimeErrorVisibleAfter !== false
  || !wingsValid
  || !liveValid
  || !capturesValid
  || !Array.isArray(receipt.browserErrors)
  || receipt.browserErrors.length !== 0) {
  discardEvidence(`Pass 69.3 ${targetName} support-aircraft gate emitted invalid or stale evidence`);
}

const endingSha = gitOutput(['rev-parse', 'HEAD']);
if (endingSha !== sourceSha || sourceStatus()) {
  discardEvidence(`Pass 69.3 ${targetName} support-aircraft source drifted during verification (${sourceSha} -> ${endingSha})`);
}
console.log(JSON.stringify({
  pass69_3SupportAircraftLive: 'PASS',
  target: targetName,
  sourceSha,
  captures: receipt.lodCaptures.length,
  receiptPath,
}, null, 2));
