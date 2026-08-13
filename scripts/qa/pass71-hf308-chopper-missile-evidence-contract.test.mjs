import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PASS71_HF308_ARENAS,
  PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR,
  PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF308_MACHINE_HOSTNAME_SHA256,
  PASS71_HF308_MODES,
  PASS71_HF308_POLICY,
  PASS71_HF308_RENDERERS,
  PASS71_HF308_SCOPES,
  createPass71Hf308EvidenceFixture,
  pass71Hf308EvidenceFailures,
  pass71Hf308RecordSha256,
} from './pass71-hf308-chopper-missile-evidence-contract.mjs';

function fixture() {
  return structuredClone(createPass71Hf308EvidenceFixture());
}

function resign(record) {
  record.receiptSha256 = pass71Hf308RecordSha256(record);
  return record;
}

function failures(record) {
  return pass71Hf308EvidenceFailures(record, {
    sourceSha: record.source.expectedSourceSha,
    sourceTreeSha: record.source.sourceTreeSha,
    tooling: record.tooling,
  });
}

test('exports one optional strict closing registry entry and the exact sixteen-scope set', () => {
  assert.deepEqual(PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR, {
    evidenceId: 'HF-308',
    kind: 'pass71-hf308-chopper-missile-full-closure',
    minimumCount: 0,
    maximumCount: 1,
  });
  assert.equal(PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  assert.deepEqual(PASS71_HF308_ARENAS, [
    'atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range',
  ]);
  assert.deepEqual(PASS71_HF308_RENDERERS, ['webgl2', 'webgpu']);
  assert.deepEqual(PASS71_HF308_MODES, ['offline', 'hosted']);
  assert.equal(PASS71_HF308_SCOPES.length, 16);
  assert.equal(new Set(PASS71_HF308_SCOPES.map(({ arena, renderer, mode }) => (
    `${arena}/${renderer}/${mode}`
  ))).size, 16);
});

test('accepts only the complete signed fixture within the strict encoded byte cap', () => {
  const record = fixture();
  assert.deepEqual(failures(record), []);
  assert.ok(Buffer.byteLength(JSON.stringify(record), 'utf8') < PASS71_HF308_POLICY.maximumEncodedRecordBytes);
  const unsigned = fixture();
  unsigned.receiptSha256 = '0'.repeat(64);
  assert.ok(failures(unsigned).includes('receipt-sha256'));
  const oversized = fixture();
  oversized.browser.userAgent += 'x'.repeat(PASS71_HF308_POLICY.maximumEncodedRecordBytes);
  assert.ok(failures(resign(oversized)).includes('encoded-record-byte-cap'));
  const edge = fixture();
  edge.browser.signatureStatus = 'UnknownError';
  assert.ok(failures(resign(edge)).includes('browser-identity'));
  const hostname = fixture();
  hostname.environment.hostnameSha256 = '0'.repeat(64);
  assert.ok(failures(resign(hostname)).includes('environment'));
  const leakedHostname = fixture();
  leakedHostname.environment.hostname = 'desktop-vi3cr5q';
  assert.ok(failures(resign(leakedHostname)).includes('environment'));
  assert.match(PASS71_HF308_MACHINE_HOSTNAME_SHA256, /^[a-f0-9]{64}$/u);
});

test('rejects missing duplicate or reordered arena renderer mode coverage', () => {
  const missing = fixture();
  missing.scopes.pop();
  assert.ok(failures(resign(missing)).includes('scope-count'));
  const duplicate = fixture();
  duplicate.scopes[15] = structuredClone(duplicate.scopes[14]);
  assert.ok(failures(resign(duplicate)).includes('scope-exact-set-equality'));
  const reordered = fixture();
  [reordered.scopes[0], reordered.scopes[1]] = [reordered.scopes[1], reordered.scopes[0]];
  assert.ok(failures(resign(reordered)).includes('scope-exact-set-equality'));
});

test('rejects aircraft socket owner life epoch sequence trajectory target and impact identity drift', () => {
  const fields = [
    ['aircraftId', 'drift-aircraft'],
    ['ownerLifeId', 99],
    ['matchEpoch', 99],
    ['activationSequence', 99],
    ['controlSequence', 99],
    ['trajectoryId', 'drift-trajectory'],
    ['targetId', 'drift-target'],
    ['targetLifeId', 99],
    ['targetKind', 'player'],
    ['targetPosition', [9, 9, 9]],
    ['impactPosition', [8, 8, 8]],
    ['impactId', 'drift-impact'],
  ];
  for (const [field, value] of fields) {
    const record = fixture();
    record.scopes[0].authority.events[1][field] = value;
    assert.ok(failures(resign(record)).some((failure) => failure.includes('authority-0-identity')), field);
  }
  const socket = fixture();
  socket.scopes[0].authority.events[0].launchPosition[0] += 0.01;
  socket.scopes[0].authority.events[1].launchPosition[0] += 0.01;
  assert.ok(failures(resign(socket)).some((failure) => failure.includes('authority-0-socket')));
  const admission = fixture();
  admission.scopes[0].stage.targetAdmissions[0].targetLifeId += 1;
  assert.ok(failures(resign(admission)).some((failure) => failure.includes('stage-target-0')));
});

test('rejects cadence ammo queue seventh-shot and lifecycle cleanup regressions', () => {
  const cadence = fixture();
  for (const event of cadence.scopes[0].authority.events.filter(({ ordinal }) => ordinal === 1)) {
    event.launchAtMs -= 101;
    event.impactAtMs -= 101;
    event.atMs -= 101;
  }
  assert.ok(failures(resign(cadence)).some((failure) => failure.includes('authority-cadence-1')));
  const ammo = fixture();
  ammo.scopes[0].authority.events[0].ammoAfter = 4;
  ammo.scopes[0].authority.events[1].ammoAfter = 4;
  assert.ok(failures(resign(ammo)).some((failure) => failure.includes('authority-0-values')));
  const queued = fixture();
  queued.scopes[0].authority.cooldownClickQueued = true;
  queued.scopes[0].authority.seventhLaunchObserved = true;
  assert.ok(failures(resign(queued)).some((failure) => failure.includes('authority-policy')));
  const stale = fixture();
  stale.scopes[0].lifecycle.rematch.hostMissileShellCount = 1;
  assert.ok(failures(resign(stale)).some((failure) => failure.includes('rematch-cleanup')));
});

test('recomputes lossless ROI attribution and rejects detached trail or unrelated raster evidence', () => {
  const bytes = fixture();
  bytes.scopes[0].attribution.raster.attachments[0].pngBase64 = 'AA==';
  assert.ok(failures(resign(bytes)).some((failure) => failure.includes('attachment:0')));
  const summary = fixture();
  summary.scopes[0].attribution.raster.summary.changedPixelsAboveEight += 1;
  assert.ok(failures(resign(summary)).some((failure) => failure.includes('recomputed-raster-summary')));
  const frame = fixture();
  frame.scopes[0].attribution.hiddenControl.simulationFrame += 1;
  assert.ok(failures(resign(frame)).some((failure) => failure.includes('same-frozen-frame')));
  const detached = fixture();
  detached.scopes[0].attribution.visibleFrame.missile.worldPosition[0] += 0.25;
  detached.scopes[0].attribution.hiddenControl.missile.worldPosition[0] += 0.25;
  assert.ok(failures(resign(detached)).some((failure) => failure.includes('missile-detached-trajectory')));
  const forgedTrajectoryScalar = fixture();
  forgedTrajectoryScalar.scopes[0].attribution.raster.trajectoryErrorM = 0.0005;
  assert.ok(failures(resign(forgedTrajectoryScalar)).some((failure) => failure.includes('recomputed-socket-trajectory')));
  const trail = fixture();
  trail.scopes[0].attribution.raster.detachedTrailObserved = true;
  assert.ok(failures(resign(trail)).some((failure) => failure.includes('sky-or-detached-trail')));
});

test('rejects hosted guest replica drift and guest data in an offline scope', () => {
  const hosted = fixture();
  const hostedScope = hosted.scopes.find(({ mode }) => mode === 'hosted');
  hostedScope.guestTransport.guestAmmoAfter = 1;
  assert.ok(failures(resign(hosted)).some((failure) => failure.includes('guest-convergence')));
  const offline = fixture();
  const offlineScope = offline.scopes.find(({ mode }) => mode === 'offline');
  offlineScope.guestTransport = structuredClone(fixture().scopes.find(({ mode }) => mode === 'hosted').guestTransport);
  assert.ok(failures(resign(offline)).some((failure) => failure.includes('offline-guest-must-be-null')));
});
