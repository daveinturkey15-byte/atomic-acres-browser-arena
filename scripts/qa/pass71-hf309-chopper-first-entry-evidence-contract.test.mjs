import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS71_HF309_CHOPPER_FIRST_ENTRY_DESCRIPTOR,
  PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF309_REQUIRED_CHOPPER_ACTIONS,
  PASS71_HF309_TOOLING_PATHS,
  createPass71Hf309EvidenceFixture,
  pass71Hf309EvidenceFailures,
  pass71Hf309RecordSha256,
} from './pass71-hf309-chopper-first-entry-evidence-contract.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const SOURCE_TREE_SHA = 'b'.repeat(40);
const BASE = createPass71Hf309EvidenceFixture({ sourceSha: SOURCE_SHA, sourceTreeSha: SOURCE_TREE_SHA });

function fixture() {
  return structuredClone(BASE);
}

function refresh(record) {
  record.receiptSha256 = pass71Hf309RecordSha256(record);
  return record;
}

function failures(record) {
  return pass71Hf309EvidenceFailures(record, {
    sourceSha: SOURCE_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    tooling: BASE.tooling,
  });
}

test('accepts the exact HF-309 full-closing native fixture', () => {
  assert.deepEqual(failures(fixture()), []);
  assert.deepEqual(PASS71_HF309_CHOPPER_FIRST_ENTRY_DESCRIPTOR, {
    evidenceId: 'HF-309',
    kind: 'pass71-hf309-chopper-first-entry-native',
    minimumCount: 0,
    maximumCount: 1,
  });
  assert.equal(PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  assert.equal(PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE_REGISTRY_ENTRY.ownerSubjectiveApproval, 'not-claimed');
  assert.equal(PASS71_HF309_REQUIRED_CHOPPER_ACTIONS.length, 8);
  assert.equal(PASS71_HF309_TOOLING_PATHS.includes('tests/e2e/pass71-hf309-chopper-first-entry.spec.ts'), true);
});

test('the optional registry validates an exact source-bound receipt', () => {
  assert.deepEqual(PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE_REGISTRY_ENTRY.validate(fixture(), {
    sourceSha: SOURCE_SHA,
    repositoryRoot: process.cwd(),
    options: { pass71Hf309SourceTreeSha: SOURCE_TREE_SHA, pass71Hf309Tooling: BASE.tooling },
  }), []);
});

const mutations = [
  ['untrusted activation', (record) => {
    record.components[0].activation.keyEvent.isTrusted = false;
  }, 'trusted-slot-input'],
  ['debug-style possession instead of slot input', (record) => {
    record.components[1].firstEntry.keyEvent.code = 'SyntheticDebugToggle';
  }, 'trusted-slot-input'],
  ['preparation recorded after activation', (record) => {
    record.components[0].initial.capturedAtMs = record.components[0].activation.keyEvent.atMs + 1;
  }, 'prepare-before-activation'],
  ['missing authored cockpit family', (record) => {
    record.components[1].initial.supportVehicle.readyFamilies = ['care', 'carpet', 'crate'];
  }, 'authored-aircraft-assets'],
  ['missing gun action', (record) => {
    record.components[0].initial.pool.pooledChopperActionNames.pop();
  }, 'preowned-presentation-vocabulary'],
  ['missing missile shell pool readiness', (record) => {
    record.components[1].initial.pool.activeBombShells = 1;
  }, 'preowned-presentation-vocabulary'],
  ['missing retained missile HUD preparation', (record) => {
    record.components[0].initial.hud.requiredNodesPresent = false;
  }, 'prepared-hud'],
  ['HUD allocated after entry', (record) => {
    record.components[0].firstEntry.hud.samePreparedNode = false;
  }, 'prepared-hud-node'],
  ['rotor audio factory call on first entry', (record) => {
    record.components[1].firstEntry.resourcesAfterHandler.rotorOwnedResources[4] = 17;
  }, 'post-entry-allocation-or-reprepare'],
  ['repeated audio preparation', (record) => {
    record.components[0].warmEntry.resourcesAfterObservation.rotorOwnedResources[0] = 2;
  }, 'post-entry-allocation-or-reprepare'],
  ['unrelated retained-source allocation', (record) => {
    record.components[1].finalExit.resources.audioRetainedSources += 1;
  }, 'allocation-or-reprepare'],
  ['unrelated eager retained-source allocation', (record) => {
    record.components[0].initial.allocationSignature.audioRetainedSources = 13;
  }, 'prepared-resource-signature'],
  ['repeated renderer preparation on warm entry', (record) => {
    record.components[1].warmEntry.resourcesAfterObservation.rendererPrewarmGeneration += 1;
  }, 'post-entry-allocation-or-reprepare'],
  ['weakened native action threshold', (record) => {
    record.components[0].firstEntry.budget.maximumActionMs = 75;
    record.components[0].firstEntry.budget.maximumAnimationFrameGapMs = 75;
    record.components[0].firstEntry.budget.maximumFirstSubmissionDelayMs = 75;
    record.components[0].firstEntry.budget.maximumFirstCompletionDelayMs = 75;
    record.components[0].firstEntry.budget.maximumPendingForMs = 75;
  }, 'absolute-native-thresholds'],
  ['first-entry hitch', (record) => {
    record.components[1].firstEntry.maximumAnimationFrameGapMs = record.components[1].firstEntry.budget.maximumAnimationFrameGapMs;
  }, 'bounded-native-entry'],
  ['baseline outside the native no-freeze envelope', (record) => {
    record.components[0].firstEntry.baseline.firstCompletionDelayMs = 50;
  }, 'healthy-native-baseline'],
  ['warm-entry completion never reached', (record) => {
    record.components[1].warmEntry.endingCompletedSequence = record.components[1].warmEntry.targetSubmissionSequence - 1;
  }, 'completed-presentation-frontier'],
  ['hidden WebGPU fallback', (record) => {
    record.components[1].runtime.actualBackend = 'webgl2';
    record.components[1].initial.runtime.actualBackend = 'webgl2';
  }, 'native-hardware-runtime'],
  ['software adapter', (record) => {
    record.components[0].runtime.adapterLabel = 'Google SwiftShader';
    record.components[0].runtime.softwareAdapter = true;
    record.components[0].initial.runtime = structuredClone(record.components[0].runtime);
  }, 'native-hardware-runtime'],
  ['shared browser profile', (record) => {
    record.components[1].browser.sessionNonce = record.components[0].browser.sessionNonce;
  }, 'fresh-edge-profile-per-renderer'],
  ['trusted key record detached from the measured first entry', (record) => {
    record.components[0].keyEvents[1] = {
      ...record.components[0].keyEvents[1],
      atMs: record.components[0].keyEvents[1].atMs + 0.001,
    };
  }, 'trusted-input-binding-and-order'],
  ['signed binary and runtime mismatch', (record) => {
    record.browser.productVersion = '151.0.4129.73';
  }, 'installed-edge-runtime-identity'],
  ['fabricated owner approval', (record) => {
    record.ownerSubjectiveApproval = 'approved';
  }, 'receipt-identity-or-status'],
];

for (const [name, mutate, expected] of mutations) {
  test(`rejects ${name}`, () => {
    const record = fixture();
    mutate(record);
    refresh(record);
    const observed = failures(record);
    assert.ok(observed.some((failure) => failure.includes(expected)), observed.join(', '));
  });
}

test('rejects a stale source SHA even with a self-consistent digest', () => {
  const record = fixture();
  record.source.expectedSourceSha = 'd'.repeat(40);
  refresh(record);
  assert.ok(failures(record).includes('exact-clean-candidate-a-source'));
});

test('rejects receipt digest tampering', () => {
  const record = fixture();
  record.receiptSha256 = 'f'.repeat(64);
  assert.ok(failures(record).includes('receipt-digest'));
});
