import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PASS71_NATIVE_BROWSER_PARITY,
  PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256,
  PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS,
  PASS71_QUALITY_REQUESTED_GRAPHICS,
  assertPass71NativeBrowserParityReceipt,
  createPass71NativeBrowserParityFixture,
  pass71NativeBrowserParityFailures,
  pass71NativeBrowserParityRecordSha256,
  pass71NativeBrowserParitySceneSignature,
  summarizePass71FrameWindow,
} from './pass71-native-browser-parity-contract.mjs';

function rehash(record) {
  record.receiptSha256 = pass71NativeBrowserParityRecordSha256(record);
  return record;
}

test('summarizes retained native frame intervals', () => {
  const summary = summarizePass71FrameWindow([10, 12, 14, 16, 20], 72);
  assert.equal(summary.medianFrameTimeMs, 14);
  assert.equal(summary.medianFps, 1_000 / 14);
  assert.equal(summary.p95FrameTimeMs, 20);
  assert.equal(summary.maximumFrameTimeMs, 20);
});

test('freezes deterministic material identities instead of random Three UUIDs', () => {
  const source = readFileSync(new URL('../../src/legacy-main.ts', import.meta.url), 'utf8');
  assert.match(source, /const materialIdentity = \(material: THREE\.Material\): string/u);
  assert.match(source, /textureIdentity\(visual\.normalMap\)/u);
  assert.doesNotMatch(source, /material\.uuid\.slice/u);
});

test('rejects a forged deterministic scene signature or hidden target drift', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.firefox.scenes[0].scene.target.position[0] += 1;
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('firefox:solo-quality-combat:deterministic-scene-signature'));
});

test('accepts exact threshold boundaries in both Quality combat scenes', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  assert.doesNotThrow(() => assertPass71NativeBrowserParityReceipt(receipt));
  assert.deepEqual(receipt.browsers.chrome.scenes.map((scene) => scene.mode), PASS71_NATIVE_BROWSER_PARITY.sceneModes);
});

test('rejects anything except the named Quality preset and complete Quality fields', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.firefox.scenes[0].displayedGraphicsPreset = 'custom';
  receipt.browsers.firefox.scenes[0].requestedGraphics = {
    ...PASS71_QUALITY_REQUESTED_GRAPHICS,
    adaptiveResolution: false,
  };
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('firefox:solo-quality-combat:named-quality-settings'));
});

test('requires the canonical Quality runtime reason and ignores object insertion order only', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  const effective = receipt.browsers.chrome.scenes[0].effectiveGraphics;
  receipt.browsers.chrome.scenes[0].effectiveGraphics = Object.fromEntries(Object.entries(effective).reverse());
  assert.doesNotThrow(() => assertPass71NativeBrowserParityReceipt(rehash(receipt)));

  delete receipt.browsers.chrome.scenes[0].effectiveGraphics.reason;
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('chrome:solo-quality-combat:effective-graphics:schema-fields'));
  assert.ok(failures.includes('chrome:solo-quality-combat:named-quality-settings'));
});

test('rejects missing hosted combat or a mismatched hosted scene signature', () => {
  const missing = createPass71NativeBrowserParityFixture();
  missing.browsers.firefox.scenes.pop();
  assert.ok(pass71NativeBrowserParityFailures(rehash(missing)).includes('firefox:scene-set'));

  const mismatch = createPass71NativeBrowserParityFixture();
  mismatch.browsers.firefox.scenes[1].scene.signature = '0'.repeat(64);
  assert.ok(pass71NativeBrowserParityFailures(rehash(mismatch))
    .includes('comparison:hosted-quality-combat:scene-signature'));
});

test('rejects synthetic or incomplete representative combat', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.chrome.scenes[1].action.trustedEvents[2].trusted = false;
  receipt.browsers.chrome.scenes[1].action.targetHealthAfter = receipt.browsers.chrome.scenes[1].action.targetHealthBefore;
  assert.ok(pass71NativeBrowserParityFailures(rehash(receipt))
    .includes('chrome:hosted-quality-combat:representative-combat-action'));
});

test('retains exact ordered trusted input types, buttons, key codes and monotonic timestamps', () => {
  const fixture = createPass71NativeBrowserParityFixture();
  const retained = fixture.browsers.firefox.scenes[1].action.trustedEvents;
  assert.deepEqual(retained.map(({ phase, type, button, key, code }) => ({ phase, type, button, key, code })),
    PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS);

  const mutations = [
    (events) => { [events[4], events[5]] = [events[5], events[4]]; },
    (events) => { events[3].button = 0; },
    (events) => { events[8].code = ''; },
    (events) => { events[6].type = 'mouseup'; },
    (events) => { events[7].eventTimestampMs = events[6].eventTimestampMs - 1; },
    (events) => { events[7].observedAtMs = events[6].observedAtMs - 1; },
    (events) => { events[7].sequence = events[6].sequence; },
    (events) => { events[4].pointerLocked = false; },
    (events) => { events.pop(); },
  ];
  for (const mutate of mutations) {
    const receipt = createPass71NativeBrowserParityFixture();
    mutate(receipt.browsers.firefox.scenes[1].action.trustedEvents);
    const failures = pass71NativeBrowserParityFailures(rehash(receipt));
    assert.ok(failures.includes('firefox:hosted-quality-combat:trusted-action-events'));
    assert.ok(failures.includes('firefox:hosted-quality-combat:representative-combat-action'));
  }
});

test('rejects software adapters and runtime/watchdog faults', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.firefox.scenes[0].runtime.softwareAdapter = true;
  receipt.browsers.firefox.scenes[0].runtime.adapterLabel = 'llvmpipe';
  receipt.browsers.firefox.scenes[0].faults.watchdogIncidents = 1;
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('firefox:solo-quality-combat:hardware-webgl2'));
  assert.ok(failures.includes('firefox:solo-quality-combat:runtime-or-watchdog-fault'));
});

test('rejects executable, runtime and user-agent browser version drift', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.chrome.identity.runtimeVersion = '150.9.9';
  receipt.browsers.firefox.identity.userAgent = 'Mozilla/5.0 Firefox/149.0';
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('chrome:installed-browser-identity'));
  assert.ok(failures.includes('firefox:installed-browser-identity'));
});

test('rejects hidden renderer allocations, material drift and draw-budget drift', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.chrome.scenes[0].resources.after.cachedTextures += 1;
  receipt.browsers.chrome.scenes[0].renderInventory.after.entries[0].material = 'MeshBasicMaterial:downgrade';
  receipt.browsers.chrome.scenes[0].renderInventory.after.sha256 = '0'.repeat(64);
  receipt.browsers.chrome.scenes[0].renderBudget.after.drawCalls += 1;
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('chrome:solo-quality-combat:renderer-allocation-drift'));
  assert.ok(failures.includes('chrome:solo-quality-combat:material-or-drawable-drift'));
  assert.ok(failures.includes('chrome:solo-quality-combat:draw-budget-drift'));
});

test('rejects unstable renderer samples and scene observations not aligned to those frames', () => {
  const renderer = createPass71NativeBrowserParityFixture();
  renderer.browsers.chrome.scenes[0].renderBudget.before.rendererSamples[1].calls += 1;
  assert.ok(pass71NativeBrowserParityFailures(rehash(renderer))
    .includes('chrome:solo-quality-combat:render-budget:before:stable-renderer-sampling'));

  const sceneDrift = createPass71NativeBrowserParityFixture();
  sceneDrift.browsers.firefox.scenes[1].scene.samples.before[1].targetPosition[0] += 0.03;
  assert.ok(pass71NativeBrowserParityFailures(rehash(sceneDrift))
    .includes('firefox:hosted-quality-combat:deterministic-scene-signature'));

  const misaligned = createPass71NativeBrowserParityFixture();
  misaligned.browsers.chrome.scenes[1].scene.samples.after[1].frameCount += 10;
  assert.ok(pass71NativeBrowserParityFailures(rehash(misaligned))
    .includes('chrome:hosted-quality-combat:scene-render-sample-alignment:after'));

  const forgedStage = createPass71NativeBrowserParityFixture();
  const hosted = forgedStage.browsers.firefox.scenes[1];
  hosted.scene.staging.targetPosition[0] += 1;
  hosted.scene.signature = pass71NativeBrowserParitySceneSignature({ mode: hosted.mode, ...hosted.scene });
  assert.ok(pass71NativeBrowserParityFailures(rehash(forgedStage))
    .includes('firefox:hosted-quality-combat:deterministic-scene-signature'));
});

test('rejects healthy rAF hiding a slow game loop', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  const performance = receipt.browsers.firefox.scenes[0].performance;
  performance.gameFrameDelta = Math.floor(performance.sampleCount / 2);
  performance.presentedFps = performance.gameFrameDelta * 1_000 / performance.elapsedMs;
  performance.gameFrameToCallbackRatio = performance.gameFrameDelta / performance.sampleCount;
  const failures = pass71NativeBrowserParityFailures(rehash(receipt));
  assert.ok(failures.includes('firefox:solo-quality-combat:presentation-cadence'));
  assert.ok(failures.includes('comparison:solo-quality-combat:presented-fps-ratio'));
});

test('rejects retained long tasks even when aggregate FPS is healthy', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.browsers.firefox.scenes[0].performance.longTasks = {
    entries: [{ startTimeMs: 2_000, durationMs: 75 }],
    count: 1,
    totalDurationMs: 75,
    maximumDurationMs: 75,
  };
  assert.ok(pass71NativeBrowserParityFailures(rehash(receipt))
    .includes('firefox:solo-quality-combat:long-task-budget'));
});

test('rejects Firefox below 0.80 Chrome median or presented FPS', () => {
  const median = createPass71NativeBrowserParityFixture();
  median.browsers.firefox.scenes[0].performance.medianFps = median.browsers.chrome.scenes[0].performance.medianFps * 0.799;
  assert.ok(pass71NativeBrowserParityFailures(rehash(median))
    .includes('comparison:solo-quality-combat:median-fps-ratio'));

  const presented = createPass71NativeBrowserParityFixture();
  const firefox = presented.browsers.firefox.scenes[1].performance;
  const chrome = presented.browsers.chrome.scenes[1].performance;
  firefox.gameFrameDelta = Math.floor(chrome.gameFrameDelta * 0.799);
  firefox.presentedFps = firefox.gameFrameDelta * 1_000 / firefox.elapsedMs;
  firefox.gameFrameToCallbackRatio = firefox.gameFrameDelta / firefox.sampleCount;
  assert.ok(pass71NativeBrowserParityFailures(rehash(presented))
    .includes('comparison:hosted-quality-combat:presented-fps-ratio'));
});

test('rejects Firefox above 1.25 Chrome p95 or maximum frame time', () => {
  const p95 = createPass71NativeBrowserParityFixture();
  p95.browsers.firefox.scenes[0].performance.p95FrameTimeMs = p95.browsers.chrome.scenes[0].performance.p95FrameTimeMs * 1.251;
  assert.ok(pass71NativeBrowserParityFailures(rehash(p95))
    .includes('comparison:solo-quality-combat:p95-frame-time-ratio'));

  const maximum = createPass71NativeBrowserParityFixture();
  maximum.browsers.firefox.scenes[1].performance.maximumFrameTimeMs = maximum.browsers.chrome.scenes[1].performance.maximumFrameTimeMs * 1.251;
  assert.ok(pass71NativeBrowserParityFailures(rehash(maximum))
    .includes('comparison:hosted-quality-combat:maximum-frame-time-ratio'));
});

test('rejects tool, source, served candidate and receipt digest drift', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.source.endingCheckoutSourceSha = '9'.repeat(40);
  receipt.servedCandidate.sourceSha = '8'.repeat(40);
  receipt.tooling.runnerSha256 = 'not-a-digest';
  receipt.receiptSha256 = '7'.repeat(64);
  const failures = pass71NativeBrowserParityFailures(receipt, { sourceSha: 'a'.repeat(40) });
  assert.ok(failures.includes('exact-source-identity'));
  assert.ok(failures.includes('staged-candidate-provenance'));
  assert.ok(failures.includes('exact-source-tooling'));
  assert.ok(failures.includes('receipt-sha256'));
});

test('binds the native receipt to the approved machine when requested', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  assert.ok(pass71NativeBrowserParityFailures(rehash(receipt), { machine: 'another-machine' })
    .includes('native-windows-environment'));
});

test('rejects logical-machine drift, physical-host drift and missing host attestation', () => {
  const wrongLogicalId = createPass71NativeBrowserParityFixture();
  wrongLogicalId.environment.machine = 'desktop-vi3cr5q';
  assert.ok(pass71NativeBrowserParityFailures(rehash(wrongLogicalId)).includes('native-windows-environment'));

  const wrongPhysicalHost = createPass71NativeBrowserParityFixture();
  wrongPhysicalHost.environment.hostnameSha256 = '0'.repeat(64);
  assert.ok(pass71NativeBrowserParityFailures(rehash(wrongPhysicalHost)).includes('native-windows-environment'));

  const missingAttestation = createPass71NativeBrowserParityFixture();
  delete missingAttestation.environment.hostnameSha256;
  const failures = pass71NativeBrowserParityFailures(rehash(missingAttestation));
  assert.ok(failures.includes('environment:schema-fields'));
  assert.ok(failures.includes('native-windows-environment'));
  assert.match(PASS71_NATIVE_BROWSER_PARITY_MACHINE_HOSTNAME_SHA256, /^[a-f0-9]{64}$/u);
});

test('rejects unknown receipt fields rather than carrying unvalidated claims', () => {
  const receipt = createPass71NativeBrowserParityFixture();
  receipt.unvalidatedClaim = 'Firefox is perfect everywhere';
  assert.ok(pass71NativeBrowserParityFailures(rehash(receipt)).includes('receipt:schema-fields'));
});
