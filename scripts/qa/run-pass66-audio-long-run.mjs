import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass66/audio-long-run');
const aggregatePath = resolve(artifactRoot, 'receipt.json');
const aggregateTempPath = `${aggregatePath}.tmp`;
const arenas = Object.freeze(['atomic-acres', 'rustworks-1v1', 'skyline-terminal', 'gun-range']);
const perArenaPaths = arenas.map((arenaId) => resolve(artifactRoot, `${arenaId}-chromium.json`));

rmSync(artifactRoot, { recursive: true, force: true });
mkdirSync(artifactRoot, { recursive: true });

function sourceStatus() {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function discardEvidence(message) {
  for (const path of [aggregatePath, aggregateTempPath, ...perArenaPaths]) rmSync(path, { force: true });
  throw new Error(message);
}

const localViteOverrides = ['.env', '.env.local', '.env.production.local']
  .filter((path) => existsSync(resolve(root, path)));
if (localViteOverrides.length > 0) {
  discardEvidence(`Pass 66 audio long-run rejects local Vite environment overrides: ${localViteOverrides.join(', ')}`);
}
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha) || sourceStatus()) {
  discardEvidence('Pass 66 audio long-run requires one completely clean source SHA');
}

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('VITE_')),
);
const result = spawnSync(process.execPath, [
  resolve(root, 'scripts/qa/run-playwright-with-topology.mjs'),
  'tests/e2e/pass66-audio-long-run.spec.ts',
  '--project=chromium',
  '--workers=1',
  '--retries=0',
], {
  cwd: root,
  env: {
    ...inheritedEnvironment,
    NODE_ENV: 'production',
    SOURCE_SHA: sourceSha,
    RELEASE_PASS: 'PASS 66',
    VITE_MATCH_BUILD_ID: sourceSha,
    PASS66_AUDIO_LONG_RUN: '1',
    PASS66_AUDIO_SOURCE_SHA: sourceSha,
    PASS66_AUDIO_ARENA: '',
    QA_PREVIEW_PORT: process.env.QA_PREVIEW_PORT ?? '4529',
  },
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) discardEvidence(`Pass 66 audio long-run failed to launch: ${result.error.message}`);
if (result.signal) discardEvidence(`Pass 66 audio long-run terminated by ${result.signal}`);
if ((result.status ?? 1) !== 0) discardEvidence(`Pass 66 audio long-run failed with exit ${result.status ?? 1}`);

const receipts = [];
let servedCandidate = null;
for (let index = 0; index < arenas.length; index += 1) {
  const arenaId = arenas[index];
  const path = perArenaPaths[index];
  let serialized;
  let receipt;
  try {
    serialized = readFileSync(path, 'utf8');
    receipt = JSON.parse(serialized);
  } catch (error) {
    discardEvidence(`Pass 66 audio long-run did not produce ${arenaId}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const expectedSampleOffsets = [2_000, 32_000, 60_000, 61_000, 62_000, 63_000, 64_000, 65_000];
  const validOutputSamples = Array.isArray(receipt.samples)
    && receipt.samples.length === expectedSampleOffsets.length
    && receipt.samples.every((sample, sampleIndex) => sample?.elapsedMs === expectedSampleOffsets[sampleIndex]
      && Number.isSafeInteger(sample.frameCount) && sample.frameCount > 0
      && sample.audio?.outputProbe?.available === true
      && sample.audio.outputProbe.fftSize === 2_048
      && Number.isFinite(sample.audio.outputProbe.rms) && sample.audio.outputProbe.rms >= 0
      && sample.audio.outputProbe.suspiciousBroadbandHiss === false
      && typeof sample.audio.outputProbe.narrowbandTonePresent === 'boolean'
      && sample.audio.ambience?.continuousSources === 0
      && Number.isSafeInteger(sample.audio.ambience?.events)
      && sample.audio.runtime?.retainedSources === 12);
  const postMinuteSamples = Array.isArray(receipt.samples) ? receipt.samples.slice(-6) : [];
  const validBoundedAmbience = postMinuteSamples.length === 6
    && postMinuteSamples.every((sample) => sample.audio.outputProbe.narrowbandTonePresent === false)
    && receipt.samples.at(-1)?.audio?.ambience?.events >= 4;
  if (receipt.schemaVersion !== 3 || receipt.status !== 'PASS' || receipt.sourceSha !== sourceSha
    || receipt.arenaId !== arenaId || receipt.browserName !== 'chromium' || receipt.durationMs !== 65_000
    || receipt.servedCandidate?.schemaVersion !== 4 || receipt.servedCandidate.channel !== 'the-big-one'
    || receipt.servedCandidate.releasePass !== 'PASS 66'
    || receipt.servedCandidate.path !== 'channels/the-big-one'
    || receipt.servedCandidate.sourceSha !== sourceSha
    || !/^[a-f0-9]{64}$/u.test(receipt.servedCandidate?.treeSha256 ?? '')
    || !Number.isSafeInteger(receipt.servedCandidate?.exactRootFileCount)
    || receipt.servedCandidate.exactRootFileCount < 2
    || !validOutputSamples || !validBoundedAmbience
    || !Array.isArray(receipt.clientRuntimeLog) || receipt.clientRuntimeLog.length !== 0
    || !Array.isArray(receipt.faults) || receipt.faults.length !== 0) {
    discardEvidence(`Pass 66 audio long-run emitted an invalid ${arenaId} receipt`);
  }
  if (servedCandidate === null) servedCandidate = receipt.servedCandidate;
  else if (JSON.stringify(receipt.servedCandidate) !== JSON.stringify(servedCandidate)) {
    discardEvidence('Pass 66 audio long-run changed served candidate identity between arenas');
  }
  receipts.push({
    arenaId,
    path: path.replace(`${root}\\`, '').replaceAll('\\', '/'),
    sha256: createHash('sha256').update(serialized).digest('hex'),
  });
}

const endingSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
}).trim();
if (sourceStatus() || endingSha !== sourceSha) {
  discardEvidence(`Pass 66 audio long-run source drifted during verification (${sourceSha} -> ${endingSha})`);
}
const aggregate = {
  schema: 'atomic-acres/pass66-audio-long-run@1',
  status: 'PASS',
  sourceSha,
  endingSha,
  servedCandidate,
  browserProject: 'chromium',
  arenas,
  durationMsPerArena: 65_000,
  receipts,
};
writeFileSync(aggregateTempPath, `${JSON.stringify(aggregate, null, 2)}\n`, 'utf8');
renameSync(aggregateTempPath, aggregatePath);
console.log(JSON.stringify({ status: 'PASS', sourceSha, receiptPath: aggregatePath, arenas }, null, 2));
