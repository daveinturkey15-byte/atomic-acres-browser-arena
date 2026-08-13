import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR,
  PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF296_CONTACT_TOOL_PATHS,
  assertPass71Hf296ContactEvidence,
  createPass71Hf296ContactEvidenceFixture,
  pass71Hf296ContactEvidenceFailures,
  pass71Hf296ContactRecordSha256,
} from './pass71-hf296-contact-evidence-contract.mjs';
import { PASS71_HF296_MATRIX_COUNTS } from './pass71-hf296-full-matrix.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'c'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF296_CONTACT_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const expected = { sourceSha, sourceTreeSha, tooling };

function fixture() {
  return createPass71Hf296ContactEvidenceFixture({ sourceSha, sourceTreeSha, tooling });
}

function resign(record) {
  record.receiptSha256 = pass71Hf296ContactRecordSha256(record);
  return record;
}

function mutateEmbeddedEvidence(summary, mutate) {
  const value = JSON.parse(gunzipSync(Buffer.from(summary.evidenceGzipBase64, 'base64')).toString('utf8'));
  mutate(value);
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  summary.evidenceByteLength = bytes.length;
  summary.evidenceGzipBase64 = gzipSync(bytes, { level: 9 }).toString('base64');
  summary.evidenceSha256 = createHash('sha256').update(bytes).digest('hex');
}

describe('Pass 71 HF-296 full contact closure contract', () => {
  it('accepts only the literal complete closure receipt', () => {
    const record = fixture();
    assert.equal(record.closesFeedback, true);
    assert.equal(record.coverageDisposition, 'full-executable-matrix');
    assert.equal(record.matrix.local.count, 18_000);
    assert.equal(record.matrix.remoteProjection.count, 2_400);
    assert.equal(record.visualAttachments.length, 180);
    assert.equal(record.matrix.weaponCatalog.count, 20);
    assert.deepEqual(PASS71_HF296_MATRIX_COUNTS, {
      local: 18_000, remote: 2_400, visual: 180, weaponCatalog: 20,
    });
    assert.deepEqual(pass71Hf296ContactEvidenceFailures(record, expected), []);
    assert.equal(assertPass71Hf296ContactEvidence(record, expected), record);
  });

  it('preserves the acceptance descriptor and marks the registry closure semantic', () => {
    assert.deepEqual(PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR, {
      evidenceId: 'HF-296',
      kind: 'pass71-hf296-player-viewmodel-contact-component',
      minimumCount: 0,
      maximumCount: 1,
    });
    assert.equal(PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
    assert.equal(PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY.descriptor,
      PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR);
  });

  it('rejects a truthful partial record from claiming closure', () => {
    const record = fixture();
    record.closesFeedback = false;
    record.coverageDisposition = 'partial-component-evidence';
    resign(record);
    assert.deepEqual(pass71Hf296ContactEvidenceFailures(record, expected), ['hf296-identity-status-or-closure']);
  });

  it('rejects unknown manifest-embedded fields', () => {
    const record = resign({ ...fixture(), overclaim: true });
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('record:schema-fields'));
  });

  it('rejects one missing local cell through count or exact-key digest', () => {
    const record = fixture();
    record.matrix.local.count -= 1;
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('matrix:local:exact-set-or-evidence'));
    const digestMutation = fixture();
    digestMutation.matrix.local.keySha256 = 'f'.repeat(64);
    resign(digestMutation);
    assert(pass71Hf296ContactEvidenceFailures(digestMutation, expected).includes('matrix:local:exact-set-or-evidence'));
    const embeddedSetMutation = fixture();
    embeddedSetMutation.matrix.local.keysGzipBase64 = embeddedSetMutation.matrix.local.keysGzipBase64.slice(4);
    resign(embeddedSetMutation);
    const embeddedFailures = pass71Hf296ContactEvidenceFailures(embeddedSetMutation, expected);
    assert(embeddedFailures.includes('matrix:local:embedded-key-set'));
    assert(embeddedFailures.includes('matrix:local:exact-set-or-evidence'));
  });

  it('rejects an incomplete remote projection or weapon catalog', () => {
    const remote = fixture();
    remote.matrix.remoteProjection.count = 2_399;
    resign(remote);
    assert(pass71Hf296ContactEvidenceFailures(remote, expected).includes('matrix:remoteProjection:exact-set-or-evidence'));
    const catalog = fixture();
    catalog.matrix.weaponCatalog.weapons.pop();
    resign(catalog);
    assert(pass71Hf296ContactEvidenceFailures(catalog, expected).includes('matrix:weaponCatalog:exact-set-or-evidence'));
  });

  it('recomputes embedded telemetry and the camera/muzzle/projectile/hit fire freeze', () => {
    const bytes = fixture();
    bytes.matrix.local.evidenceGzipBase64 = bytes.matrix.local.evidenceGzipBase64.slice(4);
    resign(bytes);
    assert(pass71Hf296ContactEvidenceFailures(bytes, expected).includes('matrix:local:embedded-evidence'));

    const identity = fixture();
    mutateEmbeddedEvidence(identity.matrix.local, (rows) => {
      const fire = rows.find((row) => row.action === 'fire');
      fire.identityAfter.hitIdentity = 'forged-hit';
    });
    resign(identity);
    assert(pass71Hf296ContactEvidenceFailures(identity, expected)
      .some((failure) => failure.endsWith(':contact-action-or-identity')));
  });

  it('rejects a missing, duplicate, or relabelled representative frame', () => {
    const missing = fixture();
    missing.visualAttachments.pop();
    resign(missing);
    assert(pass71Hf296ContactEvidenceFailures(missing, expected).includes('visual-attachments:missing'));
    const duplicate = fixture();
    duplicate.visualAttachments[1] = { ...duplicate.visualAttachments[0] };
    resign(duplicate);
    assert(pass71Hf296ContactEvidenceFailures(duplicate, expected).includes('visual-attachments:duplicate'));
    const relabelled = fixture();
    relabelled.visualAttachments[0].arena = 'gun-range';
    resign(relabelled);
    assert(pass71Hf296ContactEvidenceFailures(relabelled, expected).includes('visual:0:identity-or-lossless-bytes'));
  });

  it('rejects unresolved, lossy, or tampered visual attachment bytes', () => {
    const unresolved = fixture();
    delete unresolved.visualAttachments[0].pngBase64;
    unresolved.visualAttachments[0].path = 'artifacts/unresolved.png';
    resign(unresolved);
    const unresolvedFailures = pass71Hf296ContactEvidenceFailures(unresolved, expected);
    assert(unresolvedFailures.includes('visual:0:schema-fields'));
    assert(unresolvedFailures.includes('visual:0:embedded-bytes'));
    const tampered = fixture();
    tampered.visualAttachments[0].pngBase64 = tampered.visualAttachments[0].pngBase64.replace('i', 'j');
    resign(tampered);
    assert(pass71Hf296ContactEvidenceFailures(tampered, expected).includes('visual:0:identity-or-lossless-bytes'));
  });

  it('rejects unsigned Edge, software rendering, source drift, tooling drift, and faults', () => {
    const edge = fixture();
    edge.browser.authenticodeStatus = 'NotSigned';
    resign(edge);
    assert(pass71Hf296ContactEvidenceFailures(edge, expected).includes('installed-edge-identity'));
    const runtime = fixture();
    runtime.runtime.softwareAdapter = true;
    runtime.runtime.adapterLabel = 'SwiftShader';
    resign(runtime);
    assert(pass71Hf296ContactEvidenceFailures(runtime, expected).includes('native-webgl2-runtime'));
    const source = fixture();
    source.source.endingCheckoutSourceSha = 'b'.repeat(40);
    resign(source);
    assert(pass71Hf296ContactEvidenceFailures(source, expected).includes('exact-candidate-a-source'));
    const tool = fixture();
    tool.tooling.runnerSha256 = 'f'.repeat(64);
    resign(tool);
    assert(pass71Hf296ContactEvidenceFailures(tool, expected).includes('candidate-a-tooling-hashes'));
    const fault = fixture();
    fault.faults.push('browser error');
    resign(fault);
    assert(pass71Hf296ContactEvidenceFailures(fault, expected).includes('aggregate-faults'));
  });

  it('rejects an unsigned mutation', () => {
    const record = fixture();
    record.completedAt = '2026-08-13T19:31:00.000Z';
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('receipt-sha256'));
  });

  it('adapts directly to the existing manifest registry import', () => {
    assert.deepEqual(PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY.validate(fixture(), {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: { pass71Hf296ContactTooling: tooling, pass71Hf296ContactSourceTreeSha: sourceTreeSha },
    }), []);
  });
});
