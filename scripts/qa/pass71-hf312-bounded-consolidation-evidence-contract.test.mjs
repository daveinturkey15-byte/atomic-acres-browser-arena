import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  PASS71_HF312_BOUNDED_CONSOLIDATION_DESCRIPTOR,
  PASS71_HF312_BOUNDED_CONSOLIDATION_REGISTRY_ENTRY,
  PASS71_HF312_TOOL_PATHS,
  PASS71_HF312_GATE_COMMANDS,
  createPass71Hf312EvidenceFixture,
  pass71Hf312EvidenceFailures,
  pass71Hf312RecordSha256,
  pass71Hf312SourceAuditAtSource,
} from './pass71-hf312-bounded-consolidation-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'b'.repeat(40);
const sourceAudit = {
  baseSourceSha: '130fd59bd2cf1e1719b802463219ddf36e2484d5',
  sourceSha,
  changedPathCount: 2,
  changedPathsSha256: 'c'.repeat(64),
  changedProductionPathCount: 1,
  changedProductionBlobs: [{ path: 'src/example.ts', sha256: 'd'.repeat(64) }],
  ownership: [{ path: 'src/example.ts', ownerTests: ['src/example.test.ts'], provenanceOwned: false }],
  unownedProductionPaths: [],
  acceptanceManifestAbsent: true,
};
const tooling = PASS71_HF312_TOOL_PATHS.map((path, index) => ({
  path, sha256: ((index % 15) + 1).toString(16).repeat(64),
}));
const expected = { sourceSha, sourceTreeSha, sourceAudit, tooling };

function fixture() {
  return createPass71Hf312EvidenceFixture(expected);
}

function resign(record) {
  record.receiptSha256 = pass71Hf312RecordSha256(record);
  return record;
}

describe('Pass 71 HF-312 bounded consolidation evidence', () => {
  it('accepts only the exact source-derived audit and full gate receipt', () => {
    assert.deepEqual(pass71Hf312EvidenceFailures(fixture(), expected), []);
    assert.deepEqual(PASS71_HF312_BOUNDED_CONSOLIDATION_DESCRIPTOR, {
      evidenceId: 'HF-312', kind: 'pass71-hf312-bounded-consolidation-audit', minimumCount: 0, maximumCount: 1,
    });
    assert.equal(PASS71_HF312_BOUNDED_CONSOLIDATION_REGISTRY_ENTRY.closesFeedback, true);
  });

  it('rejects unowned runtime paths and source-audit drift', () => {
    const record = fixture();
    record.sourceAudit.unownedProductionPaths.push('src/example.ts');
    resign(record);
    assert(pass71Hf312EvidenceFailures(record, expected).includes('source-derived-bounded-ownership-audit'));
  });

  it('rejects a missing or false-green full-core/preflight gate', () => {
    const missing = fixture();
    missing.gates.pop();
    resign(missing);
    assert(pass71Hf312EvidenceFailures(missing, expected).includes('full-core-and-clean-preflight-gates'));
    const failed = fixture();
    failed.gates[0].status = 'failed';
    resign(failed);
    assert(pass71Hf312EvidenceFailures(failed, expected).includes('full-core-and-clean-preflight-gates'));
  });

  it('rejects source, tooling, unknown-field and digest drift', () => {
    const source = fixture();
    source.source.endingCheckoutSourceSha = 'f'.repeat(40);
    resign(source);
    assert(pass71Hf312EvidenceFailures(source, expected).includes('exact-clean-source'));
    const tool = fixture();
    tool.tooling[0].sha256 = '0'.repeat(64);
    resign(tool);
    assert(pass71Hf312EvidenceFailures(tool, expected).includes('candidate-a-tooling'));
    const unknown = fixture();
    unknown.thresholdOverride = true;
    resign(unknown);
    assert(pass71Hf312EvidenceFailures(unknown, expected).includes('record-identity-or-schema'));
    const unsigned = fixture();
    unsigned.completedAt = '2026-08-13T09:49:00.000Z';
    assert(pass71Hf312EvidenceFailures(unsigned, expected).includes('receipt-sha256'));
  });

  it('rejects gate command substitution even when the claimed gate passes', () => {
    const record = fixture();
    record.gates[0].command = 'npm test -- --passWithNoTests';
    resign(record);
    assert(pass71Hf312EvidenceFailures(record, expected).includes('full-core-and-clean-preflight-gates'));
    assert.deepEqual(record.gates.slice(1).map(({ id, command }) => ({ id, command })), PASS71_HF312_GATE_COMMANDS.slice(1));
  });

  it('finds no unowned changed production path in the current integration source audit', () => {
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const audit = pass71Hf312SourceAuditAtSource(process.cwd(), headSha);
    assert.deepEqual(audit.unownedProductionPaths, []);
    assert.equal(audit.acceptanceManifestAbsent, true);
    assert(audit.changedProductionPathCount > 0);
  });
});
