import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPass71GrenadeNativeEvidence,
  createPass71GrenadeNativeEvidenceFixture,
  pass71GrenadeNativeEvidenceFailures,
  pass71GrenadeNativeRecordSha256,
} from './pass71-grenade-native-receipt-contract.mjs';

const sourceSha = 'a'.repeat(40);
const fixture = () => createPass71GrenadeNativeEvidenceFixture({ sourceSha });
const expected = (record) => ({ sourceSha, tooling: record.tooling });
const refreshDigest = (record) => { record.receiptSha256 = pass71GrenadeNativeRecordSha256(record); };

test('accepts the canonical exact-SHA installed-Edge native-WebGPU four-grenade receipt', () => {
  const record = fixture();
  assert.doesNotThrow(() => assertPass71GrenadeNativeEvidence(record, expected(record)));
});

test('canonical receipt digest excludes only the digest field and survives property reordering', () => {
  const record = fixture();
  const digest = record.receiptSha256;
  record.receiptSha256 = 'f'.repeat(64);
  assert.equal(pass71GrenadeNativeRecordSha256(record), digest);
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(pass71GrenadeNativeRecordSha256(reordered), digest);
  reordered.status = 'failed';
  assert.notEqual(pass71GrenadeNativeRecordSha256(reordered), digest);
});

for (const [label, mutate, failure] of [
  ['expected SHA drift', (record) => { record.source.expectedSourceSha = 'd'.repeat(40); }, 'exact-source-and-served-provenance'],
  ['checkout SHA drift', (record) => { record.source.checkoutSourceSha = 'd'.repeat(40); }, 'exact-source-and-served-provenance'],
  ['independently served SHA drift', (record) => { record.trials[2].servedCandidate.sourceSha = 'd'.repeat(40); }, 'trial:smoke:independent-served-provenance'],
  ['dirty source before', (record) => { record.source.cleanBefore = false; }, 'exact-source-and-served-provenance'],
  ['dirty source after', (record) => { record.source.cleanAfter = false; }, 'exact-source-and-served-provenance'],
  ['installed Edge binary drift', (record) => { record.browser.executableSha256 = 'bad'; }, 'installed-edge-executable'],
  ['Edge UA drift', (record) => { record.trials[0].browser.userAgent = 'Mozilla/5.0 Chrome/151.0.0.0'; }, 'trial:frag:installed-edge-identity'],
  ['software adapter', (record) => { record.trials[1].runtime.warm.adapterLabel = 'Google SwiftShader'; }, 'trial:flash:warm:native-webgpu-runtime'],
  ['WebGL fallback', (record) => { record.trials[1].runtime.cold.actualBackend = 'webgl2'; }, 'trial:flash:cold:native-webgpu-runtime'],
  ['device loss', (record) => { record.trials[2].runtime.cold.deviceLost = true; }, 'trial:smoke:cold:native-webgpu-runtime'],
  ['page fault', (record) => { record.trials[3].faults.push('pageerror'); }, 'trial:semtex:faults'],
  ['missing warm action', (record) => { delete record.trials[0].warm; }, 'trial:frag:warm:identity'],
  ['incomplete presentation', (record) => { record.trials[0].cold.frontier.observationComplete = false; }, 'trial:frag:cold:completed-presentation-frontier'],
  ['completion failure', (record) => { record.trials[3].warm.frontier.completionFailures = 1; }, 'trial:semtex:warm:completed-presentation-frontier'],
  ['audio allocation regression', (record) => { record.trials[2].audio.prewarm.runs = 2; }, 'trial:smoke:audio-lifecycle'],
] ) {
  test(`rejects ${label}`, () => {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(pass71GrenadeNativeEvidenceFailures(record, expected(record)).includes(failure));
  });
}

test('retains and gates native maximum-rAF in addition to every existing action frontier', () => {
  const fieldFailures = [
    ['internalHandlerSyncMs', 'trial:frag:cold:internal-handler-sync'],
    ['outerHandlerSyncMs', 'trial:frag:cold:outer-handler-sync'],
    ['eventToNextAnimationFrameMs', 'trial:frag:cold:event-to-next-animation-frame'],
    ['maximumAnimationFrameGapMs', 'trial:frag:cold:maximum-animation-frame-gap'],
    ['maximumFrameWorkMs', 'trial:frag:cold:maximum-frame-work'],
    ['maximumPendingForMs', 'trial:frag:cold:maximum-presentation-pending'],
    ['firstSubmissionDelayMs', 'trial:frag:cold:first-submission-delay'],
    ['firstCompletionDelayMs', 'trial:frag:cold:first-completion-delay'],
  ];
  for (const [field, failure] of fieldFailures) {
    const record = fixture();
    record.trials[0].cold.measurement[field] = record.trials[0].cold.budget[
      field === 'internalHandlerSyncMs' || field === 'outerHandlerSyncMs'
        ? 'maximumSynchronousActionMs'
        : field === 'eventToNextAnimationFrameMs' || field === 'maximumAnimationFrameGapMs'
          ? 'maximumAnimationFrameGapMs'
          : field === 'maximumFrameWorkMs' ? 'maximumFrameWorkMs'
            : field === 'maximumPendingForMs' ? 'maximumPendingForMs'
              : field === 'firstSubmissionDelayMs' ? 'maximumFirstSubmissionDelayMs'
                : 'maximumFirstCompletionDelayMs'
    ];
    refreshDigest(record);
    assert.ok(pass71GrenadeNativeEvidenceFailures(record, expected(record)).includes(failure), field);
  }
});

test('rejects forged baseline summaries, budgets, receipts and preview tooling hashes', () => {
  const baseline = fixture();
  baseline.trials[0].cold.baseline.p95GapMs = 1;
  refreshDigest(baseline);
  assert.ok(pass71GrenadeNativeEvidenceFailures(baseline, expected(baseline)).includes('trial:frag:cold:baseline-summary'));

  const budget = fixture();
  budget.trials[0].warm.budget.maximumAnimationFrameGapMs += 1;
  refreshDigest(budget);
  assert.ok(pass71GrenadeNativeEvidenceFailures(budget, expected(budget)).includes('trial:frag:warm:budget-forged-or-stale'));

  const digest = fixture();
  digest.trials[0].cold.measurement.maximumFrameWorkMs += 0.1;
  assert.ok(pass71GrenadeNativeEvidenceFailures(digest, expected(digest)).includes('receipt-sha256'));

  const tooling = fixture();
  assert.ok(pass71GrenadeNativeEvidenceFailures(tooling, {
    sourceSha,
    tooling: { ...tooling.tooling, runnerSha256: 'e'.repeat(64) },
  }).includes('preview-tooling-hashes'));
});

test('rejects missing, duplicate, reordered and unknown grenade trials', () => {
  for (const mutate of [
    (record) => { record.trials.pop(); },
    (record) => { record.trials[3] = structuredClone(record.trials[2]); },
    (record) => { record.trials.reverse(); },
    (record) => { record.trials[0].grenade = 'future-grenade'; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(pass71GrenadeNativeEvidenceFailures(record, expected(record)).includes('all-four-grenade-trials'));
  }
});

test('rejects unknown fields at canonical receipt and nested measurement boundaries', () => {
  for (const mutate of [
    (record) => { record.unvalidatedClaim = true; },
    (record) => { record.trials[0].cold.measurement.unvalidatedClaim = 1; },
    (record) => { record.trials[0].servedCandidate.unvalidatedClaim = 'copied'; },
    (record) => { record.trials[0].audio.prewarm.automations = 7; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(
      pass71GrenadeNativeEvidenceFailures(record, expected(record))
        .some((failure) => failure.endsWith(':schema-fields')),
    );
  }
});

test('rejects malformed, reversed and separately captured run timestamps', () => {
  for (const mutate of [
    (record) => { record.startedAt = '2026-07-24T09:01:00Z'; },
    (record) => { record.startedAt = '2026-07-24T09:06:00.000Z'; },
    (record) => { record.capturedAt = '2026-07-24T09:05:00.001Z'; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    assert.ok(pass71GrenadeNativeEvidenceFailures(record, expected(record)).includes('run-timestamps'));
  }
});

test('rejects Edge executable version disagreement and missing fresh-process isolation', () => {
  for (const mutate of [
    (record) => { record.browser.executableVersion = '151.0.4129.71'; },
    (record) => { record.browser.isolation = 'shared-browser-process'; },
    (record) => { record.invocation.browserProcessCount = 1; },
  ]) {
    const record = fixture();
    mutate(record);
    refreshDigest(record);
    const failures = pass71GrenadeNativeEvidenceFailures(record, expected(record));
    assert.ok(failures.includes('installed-edge-executable') || failures.includes('exact-native-invocation'));
  }
});
