import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PASS71_STUCK_CLAIMS,
  PASS71_STUCK_EVIDENCE,
  PASS71_STUCK_EVIDENCE_DESCRIPTOR,
  assertPass71StuckEvidence,
  createPass71StuckEvidenceFixture,
  pass71StuckEvidenceFailures,
  pass71StuckEvidenceRecordSha256,
} from './pass71-stuck-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const fixture = () => createPass71StuckEvidenceFixture({ sourceSha });
const expected = (record) => ({ sourceSha, tooling: record.tooling });
const refreshDigest = (record) => { record.receiptSha256 = pass71StuckEvidenceRecordSha256(record); };

function failuresAfter(mutate) {
  const record = fixture();
  mutate(record);
  refreshDigest(record);
  return pass71StuckEvidenceFailures(record, expected(record));
}

test('declares one exact manifest-embedded HF-310 component', () => {
  assert.deepEqual(PASS71_STUCK_EVIDENCE_DESCRIPTOR, {
    evidenceId: 'HF-310',
    kind: PASS71_STUCK_EVIDENCE.kind,
    minimumCount: 1,
    maximumCount: 1,
  });
  const record = fixture();
  assert.equal(record.frames.length, 12);
  assert.deepEqual(record.frames.map(({ id }) => id), [
    'desktop-semtex-attacker',
    'desktop-semtex-victim',
    'desktop-explosive-crossbow-attacker',
    'desktop-explosive-crossbow-victim',
    'mobile-landscape-semtex-attacker',
    'mobile-landscape-semtex-victim',
    'mobile-landscape-explosive-crossbow-attacker',
    'mobile-landscape-explosive-crossbow-victim',
    'reduced-sensory-semtex-attacker',
    'reduced-sensory-semtex-victim',
    'reduced-sensory-explosive-crossbow-attacker',
    'reduced-sensory-explosive-crossbow-victim',
  ]);
  assert.ok(record.frames.every(({ image }) => image.dataBase64.length > 80 && image.path === undefined));
  assert.doesNotThrow(() => assertPass71StuckEvidence(record, expected(record)));
});

test('canonical digest excludes only itself and is property-order independent', () => {
  const record = fixture();
  const digest = record.receiptSha256;
  record.receiptSha256 = 'f'.repeat(64);
  assert.equal(pass71StuckEvidenceRecordSha256(record), digest);
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(pass71StuckEvidenceRecordSha256(reordered), digest);
  reordered.status = 'failed';
  assert.notEqual(pass71StuckEvidenceRecordSha256(reordered), digest);
});

test('validation is property-order independent for browser-emitted nested objects', () => {
  const record = fixture();
  const layout = record.frames[0].layout;
  record.frames[0].layout = {
    id: layout.id,
    width: layout.width,
    height: layout.height,
    deviceScaleFactor: layout.deviceScaleFactor,
    reducedSensory: layout.reducedSensory,
  };
  refreshDigest(record);
  assert.doesNotThrow(() => assertPass71StuckEvidence(record, expected(record)));
});

for (const [label, mutate, failure] of [
  ['expected source drift', (record) => { record.source.expectedSourceSha = 'b'.repeat(40); }, 'exact-source-and-served-provenance'],
  ['served source drift', (record) => { record.source.servedSourceSha = 'b'.repeat(40); }, 'exact-source-and-served-provenance'],
  ['served channel drift', (record) => { record.source.servedChannel = 'recent-stable'; }, 'exact-source-and-served-provenance'],
  ['dirty ending source', (record) => { record.source.cleanAfter = false; }, 'exact-source-and-served-provenance'],
  ['missing required tooling hash', (record) => { delete record.tooling.legacyMainSha256; }, 'preview-tooling-hashes'],
  ['browser executable drift', (record) => { record.browser.executableSha256 = 'bad'; }, 'installed-chrome-executable'],
  ['non-canonical install scope', (record) => { record.browser.installScope = 'copied-portable'; }, 'installed-chrome-executable'],
  ['Edge user agent drift', (record) => { record.browser.userAgent += ' Edg/151.0.0.0'; }, 'installed-chrome-executable'],
  ['shared browser process', (record) => { record.browser.isolation = 'shared-process'; }, 'installed-chrome-executable'],
  ['stale PeerJS endpoint', (record) => { record.topology.peerServer.owned = false; }, 'owned-two-peer-topology'],
  ['page fault', (record) => { record.faults.push('desktop/host/pageerror: boom'); }, 'aggregate-faults'],
  ['frame clock outside the run', (record) => { record.frames[0].timing.captureStartedAtEpochMs = 0; }, 'frame-capture-run-clock'],
  ['warning hidden before capture completed', (record) => { record.frames[0].timing.visibleAtCaptureCompletion = false; }, 'frame:desktop:semtex:attacker:500ms-onset-timing'],
  ['long screenshot capture', (record) => { record.frames[0].timing.captureCompletedAtMs = record.frames[0].timing.expiresAtMs; }, 'frame:desktop:semtex:attacker:500ms-onset-timing'],
  ['off-centre warning', (record) => { record.frames[0].warning.centreErrorPx = 8; }, 'frame:desktop:semtex:attacker:true-viewport-centre'],
  ['standard animation disabled', (record) => { record.frames[0].warning.style.animationName = 'none'; }, 'frame:desktop:semtex:attacker:computed-style'],
  ['fake reduced-sensory setting', (record) => { record.frames[8].accessibility.requestedReducedSensoryEffects = false; }, 'frame:reduced-sensory:semtex:attacker:real-reduced-sensory'],
  ['forged raster metrics', (record) => { record.frames[0].pixels.brightRedPixels += 1; }, 'frame:desktop:semtex:attacker:recomputed-pixel-metrics'],
  ['untruthful projectile claim', (record) => { record.claims.unknown = 'Physical contact proved.'; }, 'truthful-bounded-claims'],
]) {
  test(`rejects ${label}`, () => {
    assert.ok(failuresAfter(mutate).includes(failure));
  });
}

test('accepts Chromium user-agent reduction only when the installed Chrome major agrees', () => {
  const record = fixture();
  record.browser.userAgent = 'Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36';
  refreshDigest(record);
  assert.doesNotThrow(() => assertPass71StuckEvidence(record, expected(record)));
  record.browser.userAgent = 'Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36';
  refreshDigest(record);
  assert.ok(pass71StuckEvidenceFailures(record, expected(record)).includes('installed-chrome-executable'));
});

test('rejects missing, duplicate, reordered and unknown frame cells', () => {
  for (const mutate of [
    (record) => { record.frames.pop(); },
    (record) => { record.frames[1] = structuredClone(record.frames[0]); },
    (record) => { record.frames.reverse(); },
    (record) => { record.frames[0].id = 'desktop-frag-attacker'; },
  ]) {
    assert.ok(failuresAfter(mutate).includes('complete-ordered-twelve-frame-matrix'));
  }
});

test('rejects attacker/victim authority disagreement within a source and layout pair', () => {
  assert.ok(failuresAfter((record) => {
    record.frames[1].authority.canonicalNonce += 1;
  }).includes('frame-pair:desktop:semtex:authority-mismatch'));
});

test('rejects bare artifact locators instead of persisted visual bytes', () => {
  const failures = failuresAfter((record) => {
    delete record.frames[0].image.dataBase64;
    record.frames[0].image.path = 'artifacts/pass71/stuck-warning/desktop.png';
  });
  assert.ok(failures.includes('frame:desktop:semtex:attacker:image:schema-fields'));
  assert.ok(failures.includes('frame:desktop:semtex:attacker:embedded-png-bytes'));
});

test('rejects PNG bytes whose own CRC is invalid even when outer hashes are refreshed', () => {
  const failures = failuresAfter((record) => {
    const frame = record.frames[0];
    const bytes = Buffer.from(frame.image.dataBase64, 'base64');
    bytes[bytes.length - 1] ^= 1;
    frame.image.dataBase64 = bytes.toString('base64');
    frame.image.byteLength = bytes.length;
    frame.image.sha256 = createHash('sha256').update(bytes).digest('hex');
  });
  assert.ok(failures.includes('frame:desktop:semtex:attacker:embedded-png-bytes'));
});

test('rejects unknown schema fields at record, frame and image boundaries', () => {
  for (const mutate of [
    (record) => { record.artifact = 'copied receipt'; },
    (record) => { record.frames[0].unvalidatedClaim = true; },
    (record) => { record.frames[0].image.artifactRef = 'sha256:copied'; },
  ]) {
    assert.ok(failuresAfter(mutate).some((failure) => failure.endsWith(':schema-fields')));
  }
});

test('rejects stale tooling context, malformed timestamps and a stale digest', () => {
  const record = fixture();
  const tooling = { ...record.tooling, runnerSha256: 'e'.repeat(64) };
  assert.ok(pass71StuckEvidenceFailures(record, { sourceSha, tooling }).includes('preview-tooling-hashes'));

  assert.ok(failuresAfter((candidate) => {
    candidate.startedAt = '2026-08-13T09:01:00Z';
  }).includes('run-timestamps'));

  const staleDigest = fixture();
  staleDigest.frames[0].warning.label = 'NOT STUCK';
  assert.ok(pass71StuckEvidenceFailures(staleDigest, expected(staleDigest)).includes('receipt-sha256'));
});

test('wires the bounded runner, real setting and static contract into repository commands', () => {
  const spec = readFileSync('tests/e2e/pass66-qoder-multiplayer-authority.spec.ts', 'utf8');
  const runner = readFileSync('scripts/qa/run-pass71-stuck-evidence.mjs', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
  assert.match(spec, /Object\.freeze\(\{ id: 'mobile-landscape', width: 844, height: 390, reducedSensory: false \}\)/u);
  assert.match(spec, /page\.locator\('#reduced-sensory-effects'\)\.check\(\)/u);
  assert.match(spec, /PASS71_STUCK_EVIDENCE_COMPONENT_PATH/u);
  assert.match(spec, /dataBase64: screenshot\.toString\('base64'\)/u);
  assert.match(spec, /STUCK_EVIDENCE_CHROME_EXECUTABLE[\s\S]*executablePath: STUCK_EVIDENCE_CHROME_EXECUTABLE/u);
  assert.match(runner, /--grep=Semtex and crossbolt sticky results apply once under duplicate, reorder and guest rejoin/u);
  assert.match(runner, /PASS66_QODER_AUTHORITY_PEER_PATH/u);
  assert.match(runner, /assertPass71StuckEvidence/u);
  assert.equal(packageJson.scripts['qa:pass71:stuck-evidence:contract'], 'node --test scripts/qa/pass71-stuck-evidence-contract.test.mjs');
  assert.equal(packageJson.scripts['qa:pass71:stuck-evidence:verify'], 'node scripts/qa/verify-pass71-stuck-evidence.mjs');
  assert.equal(packageJson.scripts['qa:pass71:stuck-evidence'], 'npm run qa:pass71:stuck-evidence:contract && node scripts/qa/run-pass71-stuck-evidence.mjs');
  assert.match(workflow, /npm run qa:pass71:stuck-evidence:contract/u);
  assert.equal(PASS71_STUCK_CLAIMS.unknown, 'This bounded QA authority projection does not prove physical projectile flight or contact.');
});
