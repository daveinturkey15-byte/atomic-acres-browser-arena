import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PASS71_QUALITY_VISUAL_EVIDENCE_DESCRIPTOR,
  PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY,
  assertPass71QualityVisualEvidence,
  createPass71QualityVisualEvidenceFixture,
  pass71QualityVisualEvidenceDisposition,
  pass71QualityVisualEvidenceFailures,
  pass71QualityVisualPairMetrics,
  pass71QualityVisualPngEvidence,
  pass71QualityVisualRecordSha256,
} from './pass71-quality-visual-parity-contract.mjs';

const sourceSha = 'a'.repeat(40);
const fixture = () => createPass71QualityVisualEvidenceFixture({ sourceSha });
const expected = (record) => ({ sourceSha, tooling: record.tooling });
const refreshDigest = (record) => { record.receiptSha256 = pass71QualityVisualRecordSha256(record); };

test('exports the bounded HF-303 native evidence descriptor', () => {
  assert.deepEqual(PASS71_QUALITY_VISUAL_EVIDENCE_DESCRIPTOR, {
    evidenceId: 'HF-303', kind: 'pass71-hf303-atomic-quality-visual-parity', minimumCount: 0, maximumCount: 1,
  });
  assert.equal(PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  assert.equal(PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY.ownerSubjectiveApproval, 'not-claimed');
});

test('adapts the exact closing record to the manifest registry context', () => {
  const record = fixture();
  assert.deepEqual(PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY.validate(record, {
    sourceSha,
    repositoryRoot: process.cwd(),
    options: { pass71QualityVisualTooling: record.tooling },
  }), []);
});

test('labels missing named Quality or native camera authority partial and non-closing', () => {
  for (const mutate of [
    (record) => { delete record.captures[0].quality.name; },
    (record) => { delete record.captures[0].camera.authority; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    const disposition = pass71QualityVisualEvidenceDisposition(record, expected(record));
    assert.equal(disposition.status, 'partial-non-closing');
    assert.equal(disposition.closesFeedback, false);
    assert.equal(disposition.mechanicalVisualParity, 'not-proven');
    assert.equal(disposition.ownerSubjectiveApproval, 'not-claimed');
    assert.ok(disposition.failures.length > 0);
  }
});

test('accepts a canonical exact-source Pass 70 and candidate Quality visual receipt', () => {
  const record = fixture();
  assert.doesNotThrow(() => assertPass71QualityVisualEvidence(record, expected(record)));
  assert.equal(record.pairs.length, 2);
  assert.ok(record.pairs.every(({ passed }) => passed));
});

test('canonical digest excludes only itself and is property-order independent', () => {
  const record = fixture();
  const digest = record.receiptSha256;
  record.receiptSha256 = 'f'.repeat(64);
  assert.equal(pass71QualityVisualRecordSha256(record), digest);
  assert.equal(pass71QualityVisualRecordSha256(Object.fromEntries(Object.entries(record).reverse())), digest);
  record.status = 'failed';
  assert.notEqual(pass71QualityVisualRecordSha256(record), digest);
});

for (const [label, mutate, expectedFailure] of [
  ['candidate checkout drift', (record) => { record.source.candidate.checkoutSourceSha = 'd'.repeat(40); }, 'exact-candidate-source-and-staged-provenance'],
  ['candidate dirty source', (record) => { record.source.candidate.cleanAfter = false; }, 'exact-candidate-source-and-staged-provenance'],
  ['candidate provenance schema drift', (record) => { record.source.candidate.provenanceSchemaVersion = 3; }, 'exact-candidate-source-and-staged-provenance'],
  ['candidate topology receipt drift', (record) => { record.source.candidate.topologySha256 = 'not-a-sha'; }, 'exact-candidate-source-and-staged-provenance'],
  ['Pass 70 Pages drift', (record) => { record.source.baseline.pagesSha = 'd'.repeat(40); }, 'immutable-pass70-pages-provenance'],
  ['candidate staged provenance drift', (record) => { record.captures[1].servedOrigin.provenanceSha256 = 'd'.repeat(64); }, 'capture:candidate:webgl2:capture-identity'],
  ['forged structural pixel proof', (record) => { record.structuralComparator.pixelParity.status = 'PASS'; }, 'composed-structural-baseline'],
  ['software WebGPU', (record) => { record.captures[3].runtime.adapterLabel = 'Google SwiftShader'; }, 'capture:candidate:webgpu:runtime:hardware-renderer'],
  ['WebGPU fallback', (record) => { record.captures[3].runtime.actualBackend = 'webgl2'; }, 'capture:candidate:webgpu:runtime:hardware-renderer'],
  ['camera drift', (record) => { record.captures[0].camera.position = [42.01, 28, 48]; }, 'capture:pass70:webgl2:camera:exact-camera-time-seed'],
  ['native camera authority absent', (record) => { delete record.captures[0].camera.authority; }, 'capture:pass70:webgl2:camera:exact-camera-time-seed'],
  ['native camera completion absent', (record) => { record.captures[3].camera.presentation.complete = false; }, 'capture:candidate:webgpu:camera:exact-camera-time-seed'],
  ['preset drift', (record) => { record.captures[1].quality.displayedPreset = 'custom'; }, 'capture:candidate:webgl2:quality:named-quality-settings'],
  ['named Quality absent', (record) => { delete record.captures[1].quality.name; }, 'capture:candidate:webgl2:quality:named-quality-settings'],
  ['named Quality invocation absent', (record) => { delete record.invocation.qualityName; }, 'exact-native-invocation'],
  ['LOD downgrade', (record) => { record.captures[3].lod.lod = 1; }, 'capture:candidate:webgpu:lod:quality-operator-lod'],
  ['lighting drift', (record) => { record.captures[1].lighting.sun.intensity = 2.1; }, 'capture:candidate:webgl2:lighting:lighting-policy'],
  ['shadow regression', (record) => { record.captures[1].shadows.shadowLights = 0; }, 'capture:candidate:webgl2:shadows:shadow-policy'],
  ['shadow signature drift', (record) => { record.captures[1].shadows.shadowLights += 1; }, 'pair:webgl2:shadow-parity'],
  ['authority drift', (record) => { record.captures[2].authority.profileAuthorityParity.pass = false; }, 'capture:pass70:webgpu:authority:gameplay-authority'],
  ['state signature forgery', (record) => { record.captures[2].signatures = { ...record.captures[2].signatures, authoritySha256: 'f'.repeat(64) }; }, 'capture:pass70:webgpu:exact-state-signatures'],
  ['browser fault', (record) => { record.captures[0].faults.push('pageerror'); }, 'capture:pass70:webgl2:browser-faults'],
  ['tooling mismatch', (record) => { record.tooling.runnerSha256 = 'd'.repeat(64); }, 'preview-tooling-hashes'],
]) {
  test(`rejects ${label}`, () => {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(pass71QualityVisualEvidenceFailures(record, expected(fixture())).includes(expectedFailure));
  });
}

test('recomputes lossless PNG metadata and rejects forged embedded pixels or metrics', () => {
  const record = fixture();
  record.captures[0].png = {
    ...record.captures[0].png,
    metrics: { ...record.captures[0].png.metrics, entropyBits: 0 },
  };
  refreshDigest(record);
  assert.ok(pass71QualityVisualEvidenceFailures(record, expected(record)).includes('capture:pass70:webgl2:png:png-bytes-or-metrics'));

  const corrupt = fixture();
  corrupt.captures[0].png = {
    ...corrupt.captures[0].png,
    base64: corrupt.captures[0].png.base64.slice(0, -4) + 'AAAA',
  };
  refreshDigest(corrupt);
  assert.ok(pass71QualityVisualEvidenceFailures(corrupt, expected(corrupt)).includes('capture:pass70:webgl2:png:png-bytes-or-metrics'));
});

test('recomputes pair metrics and rejects a materially different but valid frame', () => {
  const record = fixture();
  const baselineWebGpu = record.captures.find(({ id }) => id === 'pass70-webgpu').png;
  const candidateWebGl = record.captures.find(({ id }) => id === 'candidate-webgl2');
  candidateWebGl.png = structuredClone(baselineWebGpu);
  const pair = record.pairs.find(({ backend }) => backend === 'webgl2');
  pair.metrics = pass71QualityVisualPairMetrics(
    Buffer.from(record.captures[0].png.base64, 'base64'),
    Buffer.from(candidateWebGl.png.base64, 'base64'),
  );
  pair.passed = true;
  refreshDigest(record);
  assert.ok(pass71QualityVisualEvidenceFailures(record, expected(record)).includes('pair:webgl2:pixel-parity-threshold'));
});

test('rejects stale per-frame metadata even when receipt digest is refreshed', () => {
  const record = fixture();
  const candidate = record.captures[1];
  const bytes = Buffer.from(candidate.png.base64, 'base64');
  candidate.png = { ...pass71QualityVisualPngEvidence(bytes), sha256: 'f'.repeat(64) };
  refreshDigest(record);
  assert.ok(pass71QualityVisualEvidenceFailures(record, expected(record)).includes('capture:candidate:webgl2:png:png-bytes-or-metrics'));
});

test('rejects missing, duplicate and reordered captures or pairs', () => {
  for (const mutate of [
    (record) => record.captures.pop(),
    (record) => { record.captures[3] = structuredClone(record.captures[2]); },
    (record) => record.captures.reverse(),
    (record) => record.pairs.reverse(),
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    const failures = pass71QualityVisualEvidenceFailures(record, expected(record));
    assert.ok(failures.includes('all-pass70-candidate-backend-captures') || failures.includes('both-backend-pairs'));
  }
});

test('rejects unknown fields at receipt and meaningful nested schema boundaries', () => {
  for (const mutate of [
    (record) => { record.unvalidatedClaim = true; },
    (record) => { record.source.candidate.unvalidatedClaim = true; },
    (record) => { record.captures[0].runtime.unvalidatedClaim = true; },
    (record) => { record.captures[0].png = { ...record.captures[0].png, unvalidatedClaim: true }; },
    (record) => { record.pairs[0] = { ...record.pairs[0], unvalidatedClaim: true }; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(pass71QualityVisualEvidenceFailures(record, expected(record)).some((failure) => failure.endsWith(':schema-fields')));
  }
});

test('rejects malformed, reversed, and separately captured timestamps', () => {
  for (const mutate of [
    (record) => { record.startedAt = '2026-08-13T09:01:00Z'; },
    (record) => { record.startedAt = '2026-08-13T09:06:00.000Z'; },
    (record) => { record.capturedAt = '2026-08-13T09:05:00.001Z'; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(pass71QualityVisualEvidenceFailures(record, expected(record)).includes('run-timestamps'));
  }
});

test('runner source retains exact immutable-baseline, single-Edge, camera, PNG, and fail-closed hooks', () => {
  const source = readFileSync(new URL('./run-pass71-quality-visual-parity.mjs', import.meta.url), 'utf8');
  for (const marker of [
    'ecd683116163b4940566f82f7edb87ed9c964cb6', 'gitExtractPass70Pages', 'verifyAtomicQualityBaseline',
    'chromium.launch', 'browser.newContext', 'setArenaReviewCamera', 'setCaptureCameraPose',
    'awaitCommittedCameraCompletion', "page.locator('#game')", 'canvas.screenshot', 'pass71QualityVisualPngEvidence',
    'pass71QualityVisualPairMetrics', 'assertPass71QualityVisualEvidence', 'one-installed-edge-launch',
  ]) assert.ok(source.includes(marker), marker);
});
