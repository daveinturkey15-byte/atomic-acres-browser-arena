import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS71_HF307_CHOPPER_MG_DESCRIPTOR,
  PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF307_SCOPES,
  PASS71_HF307_TOOLING_PATHS,
  createPass71Hf307EvidenceFixture,
  pass71Hf307EvidenceFailures,
  pass71Hf307RecordSha256,
} from './pass71-hf307-chopper-mg-evidence-contract.mjs';

const sourceSha = '1'.repeat(40);
const sourceTreeSha = '2'.repeat(40);

function fixture() {
  return createPass71Hf307EvidenceFixture({ sourceSha, sourceTreeSha });
}

function failures(record) {
  return pass71Hf307EvidenceFailures(record, {
    sourceSha,
    sourceTreeSha,
    tooling: record.tooling,
  });
}

function resign(record) {
  record.receiptSha256 = pass71Hf307RecordSha256(record);
  return record;
}

test('exports one optional strict HF-307 registry entry and the exact hosted renderer matrix', () => {
  assert.deepEqual(PASS71_HF307_CHOPPER_MG_DESCRIPTOR, {
    evidenceId: 'HF-307',
    kind: 'pass71-hf307-exact-chopper-mg-splash-coverage',
    minimumCount: 0,
    maximumCount: 1,
  });
  assert.equal(PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY.descriptor, PASS71_HF307_CHOPPER_MG_DESCRIPTOR);
  assert.equal(PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  assert.equal(PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY.ownerSubjectiveApproval, 'not-claimed');
  assert.deepEqual(PASS71_HF307_SCOPES, [
    { arena: 'atomic-acres', renderer: 'webgl2' },
    { arena: 'atomic-acres', renderer: 'webgpu' },
  ]);
  assert.equal(new Set(PASS71_HF307_TOOLING_PATHS).size, PASS71_HF307_TOOLING_PATHS.length);
});

test('accepts only the complete exact-candidate-A Chopper MG authority fixture', () => {
  const record = fixture();
  assert.deepEqual(failures(record), []);
  assert.deepEqual(PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY.validate(record, {
    sourceSha,
    repositoryRoot: 'unused-with-explicit-options',
    options: {
      pass71Hf307SourceTreeSha: sourceTreeSha,
      pass71Hf307Tooling: record.tooling,
    },
  }), []);
});

test('rejects source, tooling, staged candidate, signed Edge, and receipt drift', () => {
  const source = fixture();
  source.source.servedSourceSha = '3'.repeat(40);
  assert.ok(failures(resign(source)).includes('source-servedSourceSha'));

  const tooling = fixture();
  tooling.tooling[0].sha256 = 'f'.repeat(64);
  assert.ok(pass71Hf307EvidenceFailures(resign(tooling), {
    sourceSha, sourceTreeSha, tooling: fixture().tooling,
  }).includes('tooling'));

  const served = fixture();
  served.scopes[0].servedCandidate.channel = 'preview';
  assert.ok(failures(resign(served)).some((failure) => failure.endsWith(':served')));

  const browser = fixture();
  browser.browser.signatureStatus = 'UnknownError';
  assert.ok(failures(resign(browser)).includes('browser'));

  const digest = fixture();
  digest.receiptSha256 = 'e'.repeat(64);
  assert.ok(failures(digest).includes('receipt-sha256'));
});

test('rejects radius, LOS, relation, guest-control, cadence, and one-result drift', () => {
  const radius = fixture();
  radius.scopes[0].policy.splashRadiusM = 3.01;
  assert.ok(failures(resign(radius)).some((failure) => failure.endsWith(':policy')));

  const los = fixture();
  los.scopes[0].stage.lineOfSight = false;
  assert.ok(failures(resign(los)).some((failure) => failure.endsWith(':stage')));

  const relation = fixture();
  relation.scopes[0].stage.targetTeams[0] = relation.scopes[0].stage.ownerTeam;
  assert.ok(failures(resign(relation)).some((failure) => failure.endsWith(':stage')));

  const guest = fixture();
  guest.scopes[0].guestControl.apiAccepted = true;
  assert.ok(failures(resign(guest)).some((failure) => failure.endsWith(':guest-control')));

  const cadence = fixture();
  cadence.scopes[0].policy.cadenceMs = 279;
  assert.ok(failures(resign(cadence)).some((failure) => failure.endsWith(':policy')));

  const multiCadenceCapture = fixture();
  multiCadenceCapture.scopes[0].shot.captureDurationMs = 280;
  multiCadenceCapture.scopes[0].shot.shotTimestampCount = 2;
  assert.ok(failures(resign(multiCadenceCapture)).some((failure) => failure.endsWith(':shot')));

  const duplicate = fixture();
  duplicate.scopes[0].shot.resultIds[1] = duplicate.scopes[0].shot.resultIds[0];
  assert.ok(failures(resign(duplicate)).some((failure) => failure.endsWith(':shot')));

  const extraHostResult = fixture();
  extraHostResult.scopes[0].shot.resultIds.push('unexpected-third-result');
  extraHostResult.scopes[0].shot.targetIds.push('unexpected-third-target');
  extraHostResult.scopes[0].shot.resultCount = 3;
  extraHostResult.scopes[0].shot.uniqueTargetCount = 3;
  extraHostResult.scopes[0].shot.uniqueResultCount = 3;
  assert.ok(failures(resign(extraHostResult)).some((failure) => failure.endsWith(':shot')));

  const guestResultDrift = fixture();
  guestResultDrift.scopes[0].guestTransport.resultIds[1] = 'guest-result-drift';
  assert.ok(failures(resign(guestResultDrift)).some((failure) => failure.endsWith(':guest-transport')));
});

test('rejects incomplete renderer coverage, replica drift, faults, and a weakened focused oracle', () => {
  const incomplete = fixture();
  incomplete.scopes.pop();
  assert.ok(failures(resign(incomplete)).includes('scope-count'));

  const replica = fixture();
  replica.scopes[0].replication.guestBotHealthAfter[0] += 1;
  replica.scopes[0].replication.replicaDrift = 1;
  assert.ok(failures(resign(replica)).some((failure) => failure.endsWith(':replication')));

  const faults = fixture();
  faults.scopes[0].faults.push('pageerror');
  assert.ok(failures(resign(faults)).some((failure) => failure.endsWith(':faults')));

  const oracle = fixture();
  oracle.mechanicalOracle.requiredAssertions.pop();
  assert.ok(failures(resign(oracle)).includes('mechanical-oracle'));
});
