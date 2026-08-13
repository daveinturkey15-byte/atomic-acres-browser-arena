import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  PASS71_HF305_NUKE_WARNING_DESCRIPTOR,
  PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF305_TOOLING_PATHS,
  createPass71Hf305EvidenceFixture,
  pass71Hf305EvidenceFailures,
  pass71Hf305RecordSha256,
} from './pass71-hf305-nuke-warning-evidence-contract.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const SOURCE_TREE_SHA = 'b'.repeat(40);
const BASE = createPass71Hf305EvidenceFixture({ sourceSha: SOURCE_SHA, sourceTreeSha: SOURCE_TREE_SHA });

function fixture() {
  return structuredClone(BASE);
}

function refresh(record) {
  for (const component of record.components) {
    const bytes = Buffer.from(`${JSON.stringify(component.embedded, null, 2)}\n`, 'utf8');
    component.receiptByteLength = bytes.length;
    component.receiptSha256 = createHash('sha256').update(bytes).digest('hex');
  }
  record.receiptSha256 = pass71Hf305RecordSha256(record);
  return record;
}

function failures(record) {
  return pass71Hf305EvidenceFailures(record, {
    sourceSha: SOURCE_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    tooling: BASE.tooling,
  });
}

test('accepts the exact HF-305 full native fixture', () => {
  assert.deepEqual(failures(fixture()), []);
  assert.deepEqual(PASS71_HF305_NUKE_WARNING_DESCRIPTOR, {
    evidenceId: 'HF-305',
    kind: 'pass71-hf305-nuke-warning-native',
    minimumCount: 0,
    maximumCount: 1,
  });
  assert.equal(PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  assert.equal(PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY.ownerSubjectiveApproval, 'not-claimed');
  assert.deepEqual(PASS71_HF305_TOOLING_PATHS.includes('tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts'), true);
});

test('the optional registry validates with exact source-bound tooling', () => {
  assert.deepEqual(PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY.validate(fixture(), {
    sourceSha: SOURCE_SHA,
    repositoryRoot: process.cwd(),
    options: { pass71Hf305SourceTreeSha: SOURCE_TREE_SHA, pass71Hf305Tooling: BASE.tooling },
  }), []);
});

const mutations = [
  ['non-monotonic warning', (record) => {
    record.components[1].embedded.standard.timeline[3].warning.scale = record.components[1].embedded.standard.timeline[2].warning.scale;
  }, 'non-monotonic'],
  ['missing reduced visual precedence', (record) => {
    record.components[2].embedded.reduced.timeline[4].warning.coreOpacity = record.components[2].embedded.standard.timeline[4].warning.coreOpacity;
  }, 'native-sensory-visual-precedence'],
  ['missing reduced audio policy', (record) => {
    record.components[0].embedded.audio.reduced.gainScale = 1;
  }, 'mechanical:audio-precedence'],
  ['missing native audio precedence', (record) => {
    for (const sample of record.components[1].embedded.reduced.timeline) sample.audio.peak = 0.2;
  }, 'native-sensory-audio-precedence'],
  ['changed detonation authority', (record) => {
    record.components[2].embedded.standard.detonation.targetsAfter[0].active = true;
  }, 'detonation-authority'],
  ['changed canonical Nuke damage', (record) => {
    record.components[0].embedded.nukeDamage = 100;
  }, 'mechanical:identity'],
  ['echoed rather than presented in-room camera', (record) => {
    record.components[1].embedded.standard.cameras[1].position[0] = 90;
  }, 'inside-camera'],
  ['silent WebGPU fallback', (record) => {
    record.components[2].embedded.renderer.actual = 'webgl2';
  }, 'webgpu:renderer'],
  ['image byte tampering', (record) => {
    const image = record.components[1].embedded.standard.images[1];
    image.pngBase64 = `${image.pngBase64.slice(0, -4)}AAAA`;
  }, 'image-byte-identity'],
  ['different hidden-control frame', (record) => {
    record.components[2].embedded.standard.hiddenControl.simulationFrame += 1;
  }, 'hidden-control'],
  ['software renderer', (record) => {
    record.components[1].embedded.renderer.adapterLabel = 'Google SwiftShader';
    record.components[1].embedded.renderer.softwareRenderer = true;
  }, 'webgl2:renderer'],
  ['signed binary/runtime version mismatch', (record) => {
    record.browser.executableVersion = '141.0.0.0';
  }, 'receipt-browser-runtime-version'],
  ['owner approval fabrication', (record) => {
    record.ownerSubjectiveApproval = 'approved';
  }, 'receipt-ownerSubjectiveApproval'],
];

for (const [name, mutate, expected] of mutations) {
  test(`rejects ${name}`, () => {
    const record = fixture();
    mutate(record);
    refresh(record);
    assert.ok(failures(record).some((failure) => failure.includes(expected)), failures(record).join(', '));
  });
}

test('rejects a stale source SHA even when receipt bytes are self-consistent', () => {
  const record = fixture();
  record.source.expectedSourceSha = 'd'.repeat(40);
  refresh(record);
  assert.ok(failures(record).includes('receipt-source'));
});

test('rejects receipt digest tampering', () => {
  const record = fixture();
  record.receiptSha256 = 'f'.repeat(64);
  assert.ok(failures(record).includes('receipt-digest'));
});
