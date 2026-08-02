import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GRAPHICS_PRESET_VALUES } from '../../src/graphics-settings-registry.ts';
import { resolveGraphicsRuntime } from '../../src/pass65-settings.ts';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass66/profile-frame-pacing');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const profiles = Object.freeze(['performance', 'high', 'max']);
const actualRuntimeFields = Object.freeze([
  'renderProfile', 'renderScale', 'adaptive', 'targetFps', 'frameRateLimit',
  'antialiasSamples', 'shadows', 'shadowMapSize', 'shadowUpdateMode',
  'indirectLightScale', 'ambientOcclusion', 'reflectionScale', 'volumetricScale',
  'maximumAnisotropy', 'particleScale', 'decalScale', 'smokeScale', 'post',
]);
const receiptPathFor = (profile) => resolve(
  root,
  'artifacts/pass65/frame-pacing',
  `${sourceSha}${profile === 'high' ? '' : `-${profile}`}-receipt.json`,
);

await mkdir(artifactRoot, { recursive: true });
const childRuns = [];
for (const profile of profiles) {
  const startedAt = new Date().toISOString();
  const child = spawnSync(process.execPath, ['scripts/qa/verify-pass65-frame-pacing.ts'], {
    cwd: root,
    env: {
      ...process.env,
      PASS65_FRAME_PACING_PRESET: profile,
      PASS65_FRAME_PACING_GTAO: profile === 'max' ? 'ultra' : 'off',
    },
    stdio: 'inherit',
    windowsHide: true,
  });
  childRuns.push(Object.freeze({
    profile,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: child.status,
    signal: child.signal,
  }));
}

const issues = [];
const receipts = [];
for (const run of childRuns) {
  if (run.exitCode !== 0) issues.push(`${run.profile}:child-exit:${run.exitCode ?? run.signal ?? 'unknown'}`);
  try {
    const path = receiptPathFor(run.profile);
    const serialized = await readFile(path, 'utf8');
    const receipt = JSON.parse(serialized);
    receipts.push(Object.freeze({
      profile: run.profile,
      path: path.replace(`${root}\\`, '').replaceAll('\\', '/'),
      sha256: createHash('sha256').update(serialized).digest('hex'),
      receipt,
    }));
  } catch (error) {
    issues.push(`${run.profile}:receipt-unavailable:${error instanceof Error ? error.message : String(error)}`);
  }
}

const expectedRenderProfile = Object.freeze({ performance: 'performance', high: 'blender', max: 'blender' });
const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]));
  }
  return value;
};
const actualRuntimeIdentity = (state) => Object.fromEntries(
  actualRuntimeFields.map((field) => [field, stableValue(state?.[field])]),
);
const identities = [];
let adapterLabel = null;
for (const entry of receipts) {
  const { profile, receipt } = entry;
  if (receipt.status !== 'passed') issues.push(`${profile}:gate-status:${String(receipt.status)}`);
  if (receipt.source?.sha !== sourceSha) issues.push(`${profile}:source-sha:${String(receipt.source?.sha)}`);
  if (receipt.configuration?.renderProfile !== expectedRenderProfile[profile]) {
    issues.push(`${profile}:render-profile:${String(receipt.configuration?.renderProfile)}`);
  }
  const trialStates = Array.isArray(receipt.trials)
    ? receipt.trials.map((trial) => trial?.preDeployment?.graphicsPreset).filter(Boolean)
    : [];
  if (trialStates.length === 0) issues.push(`${profile}:graphics-runtime-evidence-missing`);
  const canonicalRuntime = resolveGraphicsRuntime({
    schemaVersion: 1,
    preset: profile,
    ...GRAPHICS_PRESET_VALUES[profile],
  }, false);
  const expectedActualRuntime = actualRuntimeIdentity(canonicalRuntime);
  for (const state of trialStates) {
    if (state.requestedPreset !== profile || state.effectivePreset !== profile) {
      issues.push(`${profile}:preset-not-active:${String(state.requestedPreset)}/${String(state.effectivePreset)}`);
    }
    if (state.targetFps !== 240 || state.frameRateLimit !== 0) {
      issues.push(`${profile}:not-uncapped-240-target:${String(state.targetFps)}/${String(state.frameRateLimit)}`);
    }
    const observedActualRuntime = actualRuntimeIdentity(state);
    if (JSON.stringify(observedActualRuntime) !== JSON.stringify(expectedActualRuntime)) {
      issues.push(`${profile}:runtime-not-canonical:${JSON.stringify({ expected: expectedActualRuntime, observed: observedActualRuntime })}`);
    }
  }
  const state = trialStates[0] ?? {};
  identities.push(JSON.stringify(actualRuntimeIdentity(state)));
  const trialAdapters = Array.isArray(receipt.trials)
    ? [...new Set(receipt.trials.map((trial) => trial?.preDeployment?.renderer?.adapterLabel).filter((value) => (
        typeof value === 'string' && value.trim() !== ''
      )))]
    : [];
  if (trialAdapters.length !== 1) issues.push(`${profile}:runtime-adapter-identity:${JSON.stringify(trialAdapters)}`);
  const currentAdapter = trialAdapters[0] ?? null;
  if (adapterLabel === null) adapterLabel = currentAdapter;
  else if (currentAdapter !== adapterLabel) issues.push(`${profile}:adapter-changed:${String(currentAdapter)}`);
}
if (receipts.length !== profiles.length) issues.push(`receipt-count:${receipts.length}/${profiles.length}`);
if (new Set(identities).size !== profiles.length) issues.push(`profile-runtime-identities-not-distinct:${new Set(identities).size}/${profiles.length}`);
if (typeof adapterLabel !== 'string' || adapterLabel.trim() === '') issues.push('runtime-adapter-identity-missing');

const matrix = {
  schemaVersion: 1,
  gate: 'pass66-native-webgpu-performance-quality-max-frame-pacing',
  status: issues.length === 0 ? 'passed' : 'failed',
  sourceSha,
  generatedAt: new Date().toISOString(),
  profiles,
  viewport: { width: 2_560, height: 1_440, deviceScaleFactor: 1 },
  contract: {
    canonicalPresetRuntime: true,
    targetFps: 240,
    frameRateLimit: 0,
    steadyNativeWebGpuMinimumCadenceHz: 45,
    distinctRuntimeIdentityPerPreset: true,
    arenas: ['atomic-acres', 'skyline-terminal'],
  },
  adapterLabel,
  childRuns,
  receipts: receipts.map(({ profile, path, sha256, receipt }) => ({
    profile,
    path,
    sha256,
    status: receipt.status,
    configuration: receipt.configuration,
    environment: receipt.environment,
    aggregates: receipt.aggregates,
    issues: receipt.issues,
  })),
  issues: [...new Set(issues)],
  claimStates: {
    observed: 'Three canonical presets are applied in fresh installed-Chrome native-WebGPU contexts at 2560x1440, with exact settings, queue telemetry and callback intervals retained by the child receipts.',
    inference: 'A pass rejects the reported fixed 38/45/60-style software cap: all profiles request 240 FPS with no frame limiter and independently sustain the retained native-WebGPU cadence floor.',
    assumption: 'The automated compositor and deterministic movement workload represent the same GPU/display path used by foreground play on this machine.',
    unknown: 'A browser cannot prove the monitor panel refresh or owner-perceived smoothness; final headed HITL remains separate.',
    falsifiers: 'Any profile substitution, nonzero limiter, target below 240, duplicate runtime identity, software/fallback adapter, sub-threshold child gate, device fault or source mismatch fails the matrix.',
  },
};
const serializedMatrix = `${JSON.stringify(matrix, null, 2)}\n`;
const matrixPath = resolve(artifactRoot, `${sourceSha}-receipt.json`);
await writeFile(matrixPath, serializedMatrix, 'utf8');
await writeFile(
  `${matrixPath}.sha256`,
  `${createHash('sha256').update(serializedMatrix).digest('hex')}  ${sourceSha}-receipt.json\n`,
  'utf8',
);

console.log(JSON.stringify({ status: matrix.status, sourceSha, matrixPath, profiles, issues: matrix.issues }, null, 2));
if (matrix.issues.length > 0) process.exitCode = 1;
