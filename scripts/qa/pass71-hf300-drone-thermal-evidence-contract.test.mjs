import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR,
  PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF300_DRONE_THERMAL_SCOPES,
  PASS71_HF300_DRONE_THERMAL_TOOL_PATHS,
  assertPass71Hf300Evidence,
  createPass71Hf300EvidenceFixture,
  pass71Hf300EvidenceFailures,
  pass71Hf300RecordSha256,
} from './pass71-hf300-drone-thermal-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'c'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF300_DRONE_THERMAL_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const expected = { sourceSha, sourceTreeSha, tooling };
const baseline = createPass71Hf300EvidenceFixture(expected);

function fixture() {
  return structuredClone(baseline);
}

function resign(record) {
  record.receiptSha256 = pass71Hf300RecordSha256(record);
  return record;
}

function failures(record) {
  return pass71Hf300EvidenceFailures(record, expected);
}

describe('Pass 71 HF-300 exact piloted-drone thermal closure contract', () => {
  it('accepts the literal four-scope installed-Edge native receipt', () => {
    const record = fixture();
    assert.deepEqual(failures(record), []);
    assert.equal(assertPass71Hf300Evidence(record, expected), record);
    assert.equal(record.closesFeedback, true);
    assert.equal(record.coverageDisposition, 'full-exact-native-matrix');
    assert.deepEqual(record.scopes.map(({ targetKind, mode, renderer }) => ({ targetKind, mode, renderer })), [
      { targetKind: 'bot', mode: 'solo', renderer: 'webgl2' },
      { targetKind: 'bot', mode: 'solo', renderer: 'webgpu' },
      { targetKind: 'remote-human', mode: 'hosted', renderer: 'webgl2' },
      { targetKind: 'remote-human', mode: 'hosted', renderer: 'webgpu' },
    ]);
  });

  it('exports a strict optional registry entry without weakening global minimum evidence', () => {
    assert.deepEqual(PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR, {
      evidenceId: 'HF-300',
      kind: 'pass71-hf300-piloted-drone-exact-thermal',
      minimumCount: 0,
      maximumCount: 1,
    });
    assert.equal(PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
    assert.equal(
      PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY.descriptor,
      PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR,
    );
    assert.deepEqual(PASS71_HF300_DRONE_THERMAL_SCOPES, [
      { targetKind: 'bot', mode: 'solo', renderer: 'webgl2' },
      { targetKind: 'bot', mode: 'solo', renderer: 'webgpu' },
      { targetKind: 'remote-human', mode: 'hosted', renderer: 'webgl2' },
      { targetKind: 'remote-human', mode: 'hosted', renderer: 'webgpu' },
    ]);
  });

  it('adapts to central registry validation using source-frozen tooling', () => {
    assert.deepEqual(PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY.validate(fixture(), {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: { pass71Hf300Tooling: tooling, pass71Hf300SourceTreeSha: sourceTreeSha },
    }), []);
  });

  it('rejects a partial or non-closing record', () => {
    const record = fixture();
    record.closesFeedback = false;
    record.coverageDisposition = 'partial';
    resign(record);
    assert.deepEqual(failures(record), ['hf300-identity-status-or-closure']);
  });

  it('rejects missing, duplicate, reordered, or relabelled exact scopes', () => {
    for (const mutate of [
      (record) => { record.scopes.pop(); },
      (record) => { record.scopes[1] = structuredClone(record.scopes[0]); },
      (record) => { record.scopes.reverse(); },
      (record) => { record.scopes[0].renderer = 'webgpu'; },
      (record) => { record.scopes[2].targetKind = 'bot'; },
    ]) {
      const record = fixture();
      mutate(record);
      resign(record);
      assert(failures(record).includes('exact-four-scope-matrix'));
    }
  });

  it('rejects source, tree, staged candidate, tooling, and cleanliness drift', () => {
    for (const [mutate, failure] of [
      [(record) => { record.source.endingCheckoutSourceSha = 'e'.repeat(40); }, 'exact-clean-candidate-a-source'],
      [(record) => { record.source.sourceTreeSha = 'e'.repeat(40); }, 'exact-clean-candidate-a-source'],
      [(record) => { record.source.cleanAfter = false; }, 'exact-clean-candidate-a-source'],
      [(record) => { record.servedCandidate.sourceSha = 'e'.repeat(40); }, 'served-candidate:exact-candidate-a-provenance'],
      [(record) => { record.tooling.runnerSha256 = 'e'.repeat(64); }, 'candidate-a-tooling-hashes'],
    ]) {
      const record = fixture();
      mutate(record);
      resign(record);
      assert(failures(record).includes(failure), failure);
    }
  });

  it('rejects unsigned Edge, process reuse, a shared nonce, and browser-version drift', () => {
    const signature = fixture();
    signature.browser.authenticodeStatus = 'NotSigned';
    resign(signature);
    assert(failures(signature).includes('installed-edge-process-identity'));

    const processCount = fixture();
    processCount.browser.processCount = 1;
    resign(processCount);
    assert(failures(processCount).includes('installed-edge-process-identity'));

    const nonce = fixture();
    nonce.scopes[1].browser.sessionNonce = nonce.scopes[0].browser.sessionNonce;
    resign(nonce);
    assert(failures(nonce).includes('fresh-process-profile-session-boundaries'));

    const version = fixture();
    version.scopes[0].browser.version = '151.0.4129.71';
    resign(version);
    assert(failures(version).includes('scope:bot:webgl2:browser:installed-edge-runtime-identity'));
  });

  it('rejects fallback/software rendering, device loss, or stale presentation', () => {
    for (const [mutate, scopeFailure] of [
      [(record) => { record.scopes[0].runtime.softwareAdapter = true; }, 'scope:bot:webgl2:runtime:native-renderer-runtime'],
      [(record) => { record.scopes[1].runtime.actualBackend = 'webgl2'; }, 'scope:bot:webgpu:runtime:native-renderer-runtime'],
      [(record) => { record.scopes[3].runtime.deviceLost = true; }, 'scope:remote-human:webgpu:runtime:native-renderer-runtime'],
      [(record) => { record.scopes[1].runtime.presentationStatus = 'warming'; }, 'scope:bot:webgpu:runtime:native-renderer-runtime'],
    ]) {
      const record = fixture();
      mutate(record);
      resign(record);
      assert(failures(record).includes(scopeFailure), scopeFailure);
    }
  });

  it('rejects duplicate bodies, treatments, proxies, or broken exact-rig identity', () => {
    for (const mutate of [
      (record) => { record.scopes[0].occluded.reveal.activeTargets = 2; },
      (record) => { record.scopes[0].occluded.reveal.treatmentsPerTarget = 2; },
      (record) => { record.scopes[0].occluded.reveal.proxyMeshes = 1; },
      (record) => { record.scopes[0].occluded.sensorProxyMeshes = 1; },
      (record) => { record.scopes[0].occluded.reveal.geometryIdentity = false; },
      (record) => { record.scopes[0].occluded.reveal.activeThermalLayers -= 1; },
    ]) {
      const record = fixture();
      mutate(record);
      resign(record);
      const actual = failures(record);
      assert(actual.some((failure) => failure.includes('scope:bot:webgl2:occluded')),
        `expected occluded failure, received ${actual.join(', ')}`);
    }
  });

  it('rejects incomplete canonical animation or operator identity drift across LOS', () => {
    const animation = fixture();
    animation.scopes[0].occluded.sourceOperator.runtimeActionsBound = 0;
    resign(animation);
    assert(failures(animation).includes('scope:bot:webgl2:occluded:operator:canonical-animated-operator'));

    const identity = fixture();
    identity.scopes[0].lineOfSight.sourceOperator.assetUrl = '/assets/operators/forged.glb';
    resign(identity);
    assert(failures(identity).includes('scope:bot:webgl2:operator-identity-drift'));

    const ordinary = fixture();
    ordinary.scopes[0].lineOfSight.reveal.activeTargets = 1;
    resign(ordinary);
    assert(failures(ordinary).includes('scope:bot:webgl2:line-of-sight:reveal:thermal-cleanup'));

    const root = fixture();
    root.scopes[2].staging.targetRootIdentity = 'remote-human:forged-root';
    resign(root);
    assert(failures(root).includes('scope:remote-human:webgl2:canonical-target-root-identity'));
  });

  it('rejects cleanup failures at exit, match end, rematch, and death', () => {
    for (const [mutate, expectedFragment] of [
      [(record) => { record.scopes[0].exit.afterReveal.activeTargets = 1; }, ':exit:after:thermal-cleanup'],
      [(record) => { record.scopes[0].matchEnd.possession = 'piloted-drone'; }, ':match-end:production-match-end'],
      [(record) => { record.scopes[0].matchEnd.reveal.activeThermalLayers = 1; }, ':match-end:reveal:thermal-cleanup'],
      [(record) => { record.scopes[0].rematch.nextEpoch = record.scopes[0].rematch.priorEpoch; }, ':rematch:fresh-rematch-authority'],
      [(record) => { record.scopes[0].rematch.reveal.treatmentsPerTarget = 1; }, ':rematch:reveal:thermal-cleanup'],
      [(record) => { record.scopes[0].death.targetAliveAfter = true; }, ':death:canonical-target-death'],
      [(record) => { record.scopes[0].death.afterReveal.activeTargets = 1; }, ':death:after:thermal-cleanup'],
      [(record) => { record.scopes[2].death.deathReceipt.nextLifeId = 1; }, ':death:canonical-target-death'],
      [(record) => { record.scopes[0].death.targetRootIdentity = 'forged-root'; }, ':death:canonical-target-root-identity'],
    ]) {
      const record = fixture();
      mutate(record);
      resign(record);
      assert(failures(record).some((failure) => failure.endsWith(expectedFragment)), expectedFragment);
    }
  });

  it('rejects moving-camera controls and forged raster deltas', () => {
    const camera = fixture();
    camera.scopes[0].exit.cameraPose.after.position[0] += 0.01;
    resign(camera);
    assert(failures(camera).includes('scope:bot:webgl2:exit:camera:fixed-production-camera'));

    const delta = fixture();
    delta.scopes[0].death.pixelDelta.changedPixelsAt12 += 1;
    resign(delta);
    assert(failures(delta).includes('scope:bot:webgl2:death:same-camera-control:pixel-metrics'));
  });

  it('recomputes embedded PNG bytes and measured thermal pixels', () => {
    const bytes = fixture();
    bytes.scopes[0].occluded.png.base64 = `A${bytes.scopes[0].occluded.png.base64.slice(1)}`;
    resign(bytes);
    assert(failures(bytes).includes('scope:bot:webgl2:occluded:png:png-bytes-or-metrics'));

    const metrics = fixture();
    metrics.scopes[0].occluded.png.metrics.thermalOrangePixels += 1;
    resign(metrics);
    assert(failures(metrics).includes('scope:bot:webgl2:occluded:png:png-bytes-or-metrics'));
  });

  it('rejects runtime faults, unknown fields, and an unsigned mutation', () => {
    const fault = fixture();
    fault.scopes[0].faults.push('pageerror');
    resign(fault);
    assert(failures(fault).includes('scope:bot:webgl2:runtime-faults'));

    const unknown = fixture();
    unknown.unvalidatedClaim = true;
    resign(unknown);
    assert(failures(unknown).includes('record:schema-fields'));

    const unsigned = fixture();
    unsigned.completedAt = '2026-08-13T20:11:00.000Z';
    assert(failures(unsigned).includes('receipt-sha256'));
  });

  it('canonicalizes property order while signing every claim except the digest field', () => {
    const record = fixture();
    const digest = record.receiptSha256;
    record.receiptSha256 = 'f'.repeat(64);
    assert.equal(pass71Hf300RecordSha256(record), digest);
    assert.equal(pass71Hf300RecordSha256(Object.fromEntries(Object.entries(record).reverse())), digest);
    record.status = 'failed';
    assert.notEqual(pass71Hf300RecordSha256(record), digest);
  });
});
