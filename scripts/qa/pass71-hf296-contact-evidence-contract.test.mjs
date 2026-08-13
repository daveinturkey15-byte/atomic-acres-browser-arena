import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR,
  PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF296_CONTACT_TOOL_PATHS,
  PASS71_HF296_VISUAL_IDENTITIES,
  assertPass71Hf296ContactEvidence,
  createPass71Hf296ContactEvidenceFixture,
  pass71Hf296ContactEvidenceFailures,
  pass71Hf296ContactRecordSha256,
} from './pass71-hf296-contact-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF296_CONTACT_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const sourceTreeSha = 'c'.repeat(40);
const expected = { sourceSha, sourceTreeSha, tooling };

function fixture() {
  return createPass71Hf296ContactEvidenceFixture({ sourceSha, tooling });
}

function resign(record) {
  record.receiptSha256 = pass71Hf296ContactRecordSha256(record);
  return record;
}

describe('Pass 71 HF-296 contact evidence contract', () => {
  it('accepts the canonical truthful partial fixture', () => {
    const record = fixture();
    assert.deepEqual(pass71Hf296ContactEvidenceFailures(record, expected), []);
    assert.equal(assertPass71Hf296ContactEvidence(record, expected), record);
  });

  it('exports one optional manifest registry descriptor rather than claiming closure', () => {
    assert.deepEqual(PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR, {
      evidenceId: 'HF-296',
      kind: 'pass71-hf296-player-viewmodel-contact-component',
      minimumCount: 0,
      maximumCount: 1,
    });
    assert.equal(PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY.descriptor,
      PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR);
  });

  it('rejects unknown manifest-embedded fields', () => {
    const record = resign({ ...fixture(), overclaim: true });
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('record:schema-fields'));
  });

  it('rejects candidate-A source drift', () => {
    const record = fixture();
    record.source.endingCheckoutSourceSha = 'b'.repeat(40);
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('exact-candidate-a-source'));
  });

  it('rejects a stale candidate-A tooling hash', () => {
    const record = fixture();
    record.tooling.runnerSha256 = 'f'.repeat(64);
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('candidate-a-tooling-hashes'));
  });

  it('rejects staged topology provenance for another source', () => {
    const record = fixture();
    record.servedCandidate.sourceSha = 'b'.repeat(40);
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('staged-candidate-provenance'));
  });

  it('rejects converting the component matrix into a full Cartesian claim', () => {
    const record = fixture();
    record.coverage.composition.fullCartesianClaim = true;
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('truthful-partial-coverage'));
  });

  it('rejects deleting a declared unknown', () => {
    const record = fixture();
    record.coverage.knownUnknowns.pop();
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('truthful-partial-coverage'));
  });

  it('rejects a missing composed subreceipt', () => {
    const record = fixture();
    record.components[1].receiptSha256 = null;
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('prone-contact-webgl2:subreceipt'));
  });

  it('rejects cross-record staged-tree drift', () => {
    const record = fixture();
    record.components[3].servedTreeSha256 = 'e'.repeat(64);
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('near-plane-webgl2:served-tree'));
  });

  it('does not permit the composed receipts to imply missing executable attestation', () => {
    const record = fixture();
    record.components[4].browser.executableAttestation = 'signed-and-hashed';
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('near-plane-webgpu:browser-provenance'));
  });

  it('requires all existing-runner lossless visual outputs in canonical order', () => {
    const record = fixture();
    assert.equal(record.visualAttachments.length, PASS71_HF296_VISUAL_IDENTITIES.length);
    record.visualAttachments.reverse();
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).some((failure) => (
      failure.startsWith('visual:0:')
    )));
  });

  it('rejects lossy or unhashed visual attachments', () => {
    const record = fixture();
    record.visualAttachments[0].encoding = 'jpeg';
    record.visualAttachments[0].sha256 = '';
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('visual:0:identity-or-bytes'));
  });

  it('rejects aggregate faults even with a recomputed receipt digest', () => {
    const record = fixture();
    record.faults.push('browser warning');
    resign(record);
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('aggregate-faults'));
  });

  it('rejects an unsigned mutation', () => {
    const record = fixture();
    record.completedAt = '2026-08-13T19:31:00.000Z';
    assert(pass71Hf296ContactEvidenceFailures(record, expected).includes('receipt-sha256'));
  });

  it('adapts directly to the manifest evidence registry context', () => {
    const record = fixture();
    assert.deepEqual(PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY.validate(record, {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: { pass71Hf296ContactTooling: tooling, pass71Hf296ContactSourceTreeSha: sourceTreeSha },
    }), []);
  });
});
