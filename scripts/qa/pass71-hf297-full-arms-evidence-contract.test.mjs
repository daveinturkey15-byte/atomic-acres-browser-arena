import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  PASS71_HF297_FULL_ARMS_EVIDENCE,
  PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR,
  PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES,
  PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES,
  PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY,
  PASS71_HF297_FULL_ARMS_TOOL_PATHS,
  assertPass71Hf297FullArmsEvidence,
  createPass71Hf297FullArmsEvidenceFixture,
  pass71Hf297FullArmsEncodedRecordBytes,
  pass71Hf297FullArmsEvidenceFailures,
  pass71Hf297FullArmsRecordSha256,
} from './pass71-hf297-full-arms-evidence-contract.mjs';
import {
  PASS71_HF297_SOURCE_CATALOG_PATHS,
  pass71Hf297FullMatrixCounts,
  pass71Hf297SourceCatalogFromTexts,
} from './pass71-hf297-full-arms-matrix.mjs';
import {
  PASS71_HF297_ARMS_EVIDENCE,
  PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY,
} from './pass71-hf297-arms-evidence-contract.mjs';

const catalog = pass71Hf297SourceCatalogFromTexts(Object.fromEntries(
  Object.entries(PASS71_HF297_SOURCE_CATALOG_PATHS).map(([key, path]) => [key, readFileSync(path, 'utf8')]),
));
const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'c'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF297_FULL_ARMS_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const expected = { sourceSha, sourceTreeSha, tooling, catalog };
const base = createPass71Hf297FullArmsEvidenceFixture(expected);

function fixture() {
  return structuredClone(base);
}

function resign(record) {
  record.receiptSha256 = pass71Hf297FullArmsRecordSha256(record);
  return record;
}

function mutateTelemetry(record, mutate) {
  const summary = record.matrix.telemetry;
  const rows = JSON.parse(gunzipSync(Buffer.from(summary.evidenceGzipBase64, 'base64')).toString('utf8'));
  mutate(rows);
  const bytes = Buffer.from(`${JSON.stringify(rows)}\n`, 'utf8');
  summary.evidenceByteLength = bytes.length;
  summary.evidenceGzipBase64 = gzipSync(bytes, { level: 9 }).toString('base64');
  summary.evidenceSha256 = createHash('sha256').update(bytes).digest('hex');
}

describe('Pass 71 HF-297 literal full-arms closing contract', () => {
  it('accepts exactly the source-derived 9,720-cell closure and 516 attributed PNGs', () => {
    assert.deepEqual(pass71Hf297FullMatrixCounts(catalog), {
      weapons: 20,
      firearmActionTargets: 80,
      knifeActionTargets: 1,
      actionTargets: 81,
      telemetryCells: 9_720,
      embeddedVisualCells: 516,
      runtimeScopes: 6,
    });
    assert.equal(base.matrix.telemetry.count, 9_720);
    assert.equal(base.visualAttachments.length, 516);
    assert(base.visualAttachments.every((attachment) => attachment.width === 128 && attachment.height === 72));
    assert(pass71Hf297FullArmsEncodedRecordBytes(base) < PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES);
    assert.equal(PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.maximumRawRgbaScanlineBytes, 36_936);
    assert.equal(PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES, 36_936 + 952);
    assert.equal(PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.maximumVisualPngBase64Bytes, 26_068_320);
    assert.equal(PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.worstCaseEncodedEnvelopeBytes, 32_884_064);
    assert(PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY.worstCaseEncodedEnvelopeBytes
      <= PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES);
    assert(base.sizePolicy.maximumVisualCells === 516);
    assert.equal(base.closesFeedback, true);
    assert.equal(base.closingAuthority, true);
    assert.deepEqual(pass71Hf297FullArmsEvidenceFailures(base, expected), []);
    assert.equal(assertPass71Hf297FullArmsEvidence(base, expected), base);
  });

  it('rejects an inline record before it reaches the 100 MiB GitHub file boundary', () => {
    const oversized = {
      ...PASS71_HF297_FULL_ARMS_EVIDENCE,
      padding: 'x'.repeat(PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES),
    };
    assert.deepEqual(pass71Hf297FullArmsEvidenceFailures(oversized, expected), ['encoded-record-size-cap']);
  });

  it('exports a separate closing registry lane and preserves the representative lane as non-closing', () => {
    assert.deepEqual(PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR, {
      evidenceId: 'HF-297',
      kind: 'pass71-hf297-first-person-arms-full-closure',
      minimumCount: 0,
      maximumCount: 1,
    });
    assert.equal(PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
    assert.equal(PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY.closingAuthority, true);
    assert.equal(PASS71_HF297_ARMS_EVIDENCE.closesFeedback, false);
    assert.equal(PASS71_HF297_ARMS_EVIDENCE.closingAuthority, false);
    assert.equal(PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY.closesFeedback, undefined);
    assert.deepEqual(PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY.validate(base, {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: {
        pass71Hf297FullTooling: tooling,
        pass71Hf297FullSourceTreeSha: sourceTreeSha,
        pass71Hf297FullSourceCatalog: catalog,
      },
    }), []);
  });

  it('rejects missing, duplicate and unknown telemetry cells even after recompression and resigning', () => {
    const missing = fixture();
    mutateTelemetry(missing, (rows) => rows.pop());
    resign(missing);
    assert(pass71Hf297FullArmsEvidenceFailures(missing, expected)
      .includes('matrix:telemetry:exact-set-or-evidence'));

    const duplicate = fixture();
    mutateTelemetry(duplicate, (rows) => { rows[1] = structuredClone(rows[0]); });
    resign(duplicate);
    assert(pass71Hf297FullArmsEvidenceFailures(duplicate, expected)
      .includes('matrix:telemetry:exact-set-or-evidence'));

    const unknown = fixture();
    mutateTelemetry(unknown, (rows) => { rows[0].key = `unknown${String.fromCharCode(31)}cell`; });
    resign(unknown);
    assert(pass71Hf297FullArmsEvidenceFailures(unknown, expected)
      .includes('matrix:telemetry:exact-set-or-evidence'));
  });

  it('rejects anatomy, lower-crop, contact, action-sample and fullscreen-optic overclaims', () => {
    const anatomy = fixture();
    mutateTelemetry(anatomy, (rows) => { rows[0].samples[0].rig.arms[0].elbowFlexRadians = 0.1; });
    resign(anatomy);
    assert(pass71Hf297FullArmsEvidenceFailures(anatomy, expected)
      .some((failure) => failure.endsWith(':sample:0')));

    const crop = fixture();
    mutateTelemetry(crop, (rows) => {
      const visible = rows.find((row) => row.samples[0].effectiveViewmodelVisible);
      visible.samples[0].rig.armBranches.left.ndcMin[1] = -0.5;
    });
    resign(crop);
    assert(pass71Hf297FullArmsEvidenceFailures(crop, expected)
      .some((failure) => failure.endsWith(':sample:0')));

    const contact = fixture();
    mutateTelemetry(contact, (rows) => {
      const wall = rows.find((row) => row.poseState.contact);
      wall.contact.surfaceRetreat = 0;
    });
    resign(contact);
    assert(pass71Hf297FullArmsEvidenceFailures(contact, expected)
      .some((failure) => failure.endsWith(':identity-contact-or-target')));

    const staged = fixture();
    mutateTelemetry(staged, (rows) => {
      const reload = rows.find((row) => row.action === 'reload');
      reload.samples[1].progress = 0.47;
    });
    resign(staged);
    assert(pass71Hf297FullArmsEvidenceFailures(staged, expected)
      .some((failure) => failure.endsWith(':sample:1')));

    const scope = fixture();
    mutateTelemetry(scope, (rows) => {
      const railgun = rows.find((row) => row.weapon === 'railgun' && row.action === 'ads');
      railgun.samples[0].effectiveViewmodelVisible = true;
    });
    resign(scope);
    assert(pass71Hf297FullArmsEvidenceFailures(scope, expected)
      .some((failure) => failure.endsWith(':sample:0')));
  });

  it('recomputes fire identity and lossless visual attribution instead of trusting labels', () => {
    const identity = fixture();
    mutateTelemetry(identity, (rows) => {
      const fire = rows.find((row) => row.action === 'fire');
      fire.samples[0].fireIdentityAfter.camera.origin[0] += 0.01;
    });
    resign(identity);
    assert(pass71Hf297FullArmsEvidenceFailures(identity, expected)
      .some((failure) => failure.endsWith(':sample:0')));

    const relabelled = fixture();
    relabelled.visualAttachments[0].weapon = 'unknown';
    resign(relabelled);
    assert(pass71Hf297FullArmsEvidenceFailures(relabelled, expected)
      .includes('visual:0:identity-attribution-or-lossless-bytes'));

    const unbound = fixture();
    unbound.visualAttachments[0].telemetryCellSha256 = 'f'.repeat(64);
    resign(unbound);
    assert(pass71Hf297FullArmsEvidenceFailures(unbound, expected)
      .includes('visual:0:identity-attribution-or-lossless-bytes'));

    const unretired = fixture();
    const webgpu = unretired.visualAttachments.find((attachment) => attachment.renderer === 'webgpu');
    webgpu.completedSequence = webgpu.submissionSequence - 1;
    resign(unretired);
    assert(pass71Hf297FullArmsEvidenceFailures(unretired, expected)
      .some((failure) => failure.endsWith(':identity-attribution-or-lossless-bytes')));

    const tampered = fixture();
    tampered.visualAttachments[0].pngBase64 = tampered.visualAttachments[0].pngBase64.replace('i', 'j');
    resign(tampered);
    assert(pass71Hf297FullArmsEvidenceFailures(tampered, expected)
      .includes('visual:0:identity-attribution-or-lossless-bytes'));
  });

  it('rejects unsigned Edge, software/fallback renderers, source/catalog/tooling drift and faults', () => {
    const edge = fixture();
    edge.browser.authenticodeStatus = 'NotSigned';
    resign(edge);
    assert(pass71Hf297FullArmsEvidenceFailures(edge, expected).includes('installed-signed-edge-identity'));

    const runtime = fixture();
    runtime.runtimeScopes[0].runtime.softwareAdapter = true;
    runtime.runtimeScopes[0].runtime.adapterLabel = 'SwiftShader';
    resign(runtime);
    assert(pass71Hf297FullArmsEvidenceFailures(runtime, expected)
      .includes('runtime-scope:0:native-runtime-or-role'));

    const source = fixture();
    source.source.endingCheckoutSourceSha = 'b'.repeat(40);
    resign(source);
    assert(pass71Hf297FullArmsEvidenceFailures(source, expected).includes('exact-clean-candidate-a-source'));

    const sourceCatalog = fixture();
    sourceCatalog.sourceCatalog.fullscreenOpticWeapons.pop();
    resign(sourceCatalog);
    assert(pass71Hf297FullArmsEvidenceFailures(sourceCatalog, expected)
      .includes('candidate-a-source-derived-catalog'));

    const toolingDrift = fixture();
    toolingDrift.tooling.runnerSha256 = 'f'.repeat(64);
    resign(toolingDrift);
    assert(pass71Hf297FullArmsEvidenceFailures(toolingDrift, expected).includes('candidate-a-tooling-hashes'));

    const fault = fixture();
    fault.faults.push('page error');
    resign(fault);
    assert(pass71Hf297FullArmsEvidenceFailures(fault, expected).includes('aggregate-faults'));
  });
});
