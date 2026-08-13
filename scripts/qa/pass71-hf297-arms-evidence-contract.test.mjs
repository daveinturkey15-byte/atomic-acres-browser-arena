import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PASS71_HF297_ARMS_EVIDENCE_DESCRIPTOR,
  PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF297_COVERAGE,
  PASS71_HF297_TOOL_PATHS,
  PASS71_HF297_VIEWPORTS,
  PASS71_HF297_WEAPONS,
  assertPass71Hf297Evidence,
  createPass71Hf297EvidenceFixture,
  pass71Hf297EvidenceFailures,
  pass71Hf297RecordSha256,
} from './pass71-hf297-arms-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'c'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF297_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const expected = { sourceSha, sourceTreeSha, tooling };

function fixture() {
  return createPass71Hf297EvidenceFixture({ sourceSha, sourceTreeSha, tooling });
}

function resign(record) {
  record.receiptSha256 = pass71Hf297RecordSha256(record);
  return record;
}

describe('Pass 71 HF-297 first-person arms evidence contract', () => {
  it('accepts the canonical truthful bounded fixture', () => {
    const record = fixture();
    assert.deepEqual(pass71Hf297EvidenceFailures(record, expected), []);
    assert.equal(assertPass71Hf297Evidence(record, expected), record);
  });

  it('exports one optional manifest registry descriptor', () => {
    assert.deepEqual(PASS71_HF297_ARMS_EVIDENCE_DESCRIPTOR, {
      evidenceId: 'HF-297',
      kind: 'pass71-hf297-first-person-arms-component',
      minimumCount: 0,
      maximumCount: 1,
      closesFeedback: false,
    });
    assert.equal(PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY.descriptor,
      PASS71_HF297_ARMS_EVIDENCE_DESCRIPTOR);
  });

  it('freezes four viewports, 36 visual cells and 80 catalog action cells without claiming closure', () => {
    assert.equal(PASS71_HF297_VIEWPORTS.length, 4);
    assert.equal(PASS71_HF297_COVERAGE.visualMatrix.matrixCellCount, 36);
    assert.equal(PASS71_HF297_WEAPONS.length, 20);
    assert.equal(PASS71_HF297_COVERAGE.mechanicalCatalog.matrixCellCount, 80);
    assert.equal(PASS71_HF297_COVERAGE.composition.fullCartesianClaim, false);
    assert.equal(PASS71_HF297_COVERAGE.composition.closesFeedback, false);
    assert(PASS71_HF297_COVERAGE.uncoveredCombinations.length >= 10);
  });

  it('rejects unknown manifest-embedded fields', () => {
    const record = resign({ ...fixture(), overclaim: true });
    assert(pass71Hf297EvidenceFailures(record, expected).includes('record:schema-fields'));
  });

  it('rejects exact candidate source and staged topology drift', () => {
    const sourceDrift = fixture();
    sourceDrift.source.endingCheckoutSourceSha = 'f'.repeat(40);
    resign(sourceDrift);
    assert(pass71Hf297EvidenceFailures(sourceDrift, expected).includes('exact-candidate-a-source'));
    const servedDrift = fixture();
    servedDrift.servedCandidate.sourceSha = 'f'.repeat(40);
    resign(servedDrift);
    assert(pass71Hf297EvidenceFailures(servedDrift, expected).includes('staged-candidate-provenance'));
  });

  it('rejects a stale exact-source tooling hash', () => {
    const record = fixture();
    record.tooling.runnerSha256 = 'f'.repeat(64);
    resign(record);
    assert(pass71Hf297EvidenceFailures(record, expected).includes('candidate-a-tooling-hashes'));
  });

  it('rejects unsigned or software installed-browser identities', () => {
    const unsigned = fixture();
    unsigned.browser.authenticodeStatus = 'NotSigned';
    resign(unsigned);
    assert(pass71Hf297EvidenceFailures(unsigned, expected).includes('installed-hardware-chrome'));
    const software = fixture();
    software.browser.softwareAdapter = true;
    software.browser.adapterLabel = 'Google SwiftShader';
    resign(software);
    assert(pass71Hf297EvidenceFailures(software, expected).includes('installed-hardware-chrome'));
  });

  it('rejects replacing bounded coverage with a full Cartesian claim or deleting a gap', () => {
    const overclaim = fixture();
    overclaim.coverage.composition.fullCartesianClaim = true;
    resign(overclaim);
    assert(pass71Hf297EvidenceFailures(overclaim, expected).includes('truthful-bounded-coverage'));
    const hiddenGap = fixture();
    hiddenGap.coverage.uncoveredCombinations.pop();
    resign(hiddenGap);
    assert(pass71Hf297EvidenceFailures(hiddenGap, expected).includes('truthful-bounded-coverage'));
  });

  it('cannot be mutated into HF-297 closing authority', () => {
    const record = fixture();
    record.closingAuthority = true;
    resign(record);
    assert(pass71Hf297EvidenceFailures(record, expected).includes('non-closing-authority'));
  });

  it('rejects missing or cross-drifted component receipts', () => {
    const missing = fixture();
    missing.components.pop();
    resign(missing);
    assert(pass71Hf297EvidenceFailures(missing, expected).includes('component-matrix'));
    const drift = fixture();
    drift.components[1].receiptSha256 = 'f'.repeat(64);
    resign(drift);
    assert(pass71Hf297EvidenceFailures(drift, expected).includes('component-cross-receipt'));
  });

  it('rejects missing, reordered or lossy visual sheets', () => {
    const reordered = fixture();
    reordered.visualSheets.reverse();
    resign(reordered);
    assert(pass71Hf297EvidenceFailures(reordered, expected).some((failure) => failure.startsWith('visual-sheet:')));
    const lossy = fixture();
    lossy.visualSheets[0].encoding = 'jpeg';
    resign(lossy);
    assert(pass71Hf297EvidenceFailures(lossy, expected).includes('visual-sheet:desktop-1440p:identity-or-bytes'));
  });

  it('binds every ordered full-resolution frame into its review sheet digest', () => {
    const reordered = fixture();
    [reordered.visualFrames[0], reordered.visualFrames[1]] = [reordered.visualFrames[1], reordered.visualFrames[0]];
    resign(reordered);
    assert(pass71Hf297EvidenceFailures(reordered, expected).some((failure) => failure.startsWith('visual-frame:')));
    const drift = fixture();
    drift.visualFrames[0].sha256 = 'f'.repeat(64);
    resign(drift);
    assert(pass71Hf297EvidenceFailures(drift, expected).includes('visual-sheet:desktop-1440p:source-frame-digest'));
  });

  it('rejects incomplete or reordered all-weapon catalog telemetry', () => {
    const missing = fixture();
    missing.catalogTelemetry.pop();
    resign(missing);
    assert(pass71Hf297EvidenceFailures(missing, expected).includes('all-weapon-catalog-matrix'));
    const reordered = fixture();
    [reordered.catalogTelemetry[0], reordered.catalogTelemetry[1]] = [
      reordered.catalogTelemetry[1], reordered.catalogTelemetry[0],
    ];
    resign(reordered);
    assert(pass71Hf297EvidenceFailures(reordered, expected).some((failure) => failure.endsWith(':identity')));
  });

  it('rejects broken two-arm anatomy even when the receipt is resigned', () => {
    const record = fixture();
    record.catalogTelemetry[7].rig.riggedArms[0].bindOffsetsPreserved = false;
    resign(record);
    assert(pass71Hf297EvidenceFailures(record, expected).includes('catalog:m4a1:rig-anatomy'));
  });

  it('rejects near-plane and action-state regressions', () => {
    const clipped = fixture();
    clipped.catalogTelemetry[12].actions[2].armFraming.nearPlaneClear = false;
    resign(clipped);
    assert(pass71Hf297EvidenceFailures(clipped, expected).includes('catalog:pistol:fire:clearance'));
    const staleAction = fixture();
    staleAction.catalogTelemetry[7].actions[3].state = 'hip';
    resign(staleAction);
    assert(pass71Hf297EvidenceFailures(staleAction, expected).includes('catalog:m4a1:reload:state'));
  });

  it('rejects aggregate faults and unsigned mutations', () => {
    const fault = fixture();
    fault.faults.push('browser warning');
    resign(fault);
    assert(pass71Hf297EvidenceFailures(fault, expected).includes('aggregate-faults'));
    const unsigned = fixture();
    unsigned.completedAt = '2026-08-13T20:11:00.000Z';
    assert(pass71Hf297EvidenceFailures(unsigned, expected).includes('receipt-sha256'));
  });

  it('adapts directly to the manifest registry context', () => {
    const record = fixture();
    assert.deepEqual(PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY.validate(record, {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: { pass71Hf297Tooling: tooling, pass71Hf297SourceTreeSha: sourceTreeSha },
    }), []);
  });
});
