import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPass71GrenadeNativeEvidenceFixture,
  pass71GrenadeNativeRecordSha256,
} from './pass71-grenade-native-receipt-contract.mjs';
import {
  assertPass71Hf298Coverage,
  createPass71Hf298CoverageFixture,
  createPass71Hf298CoverageRecord,
  pass71Hf298CoverageFailures,
  pass71Hf298CoverageRecordSha256,
} from './pass71-hf298-coverage-contract.mjs';

const sourceSha = 'a'.repeat(40);
const fixture = () => createPass71Hf298CoverageFixture({ sourceSha });
const expected = (record, components) => ({ sourceSha, tooling: record.tooling, components });
const refreshCoverage = (record) => { record.receiptSha256 = pass71Hf298CoverageRecordSha256(record); };

test('accepts exact representative solo/hosted x WebGL2/WebGPU HF-298 coverage', () => {
  const { record, components } = fixture();
  assert.deepEqual(components.map(({ scope }) => scope), [
    { mode: 'solo', renderer: 'webgl2', arenaId: 'atomic-acres' },
    { mode: 'solo', renderer: 'webgpu', arenaId: 'atomic-acres' },
    { mode: 'hosted', renderer: 'webgl2', arenaId: 'atomic-acres' },
    { mode: 'hosted', renderer: 'webgpu', arenaId: 'atomic-acres' },
  ]);
  assert.doesNotThrow(() => assertPass71Hf298Coverage(record, expected(record, components)));
});

test('coverage factory binds exact component receipt bytes and timestamps', () => {
  const { record, components } = fixture();
  const rebuilt = createPass71Hf298CoverageRecord({
    sourceSha, tooling: record.tooling, components, finalizedAt: record.finalizedAt,
  });
  assert.deepEqual(rebuilt, record);
  assert.equal(record.receiptSha256, pass71Hf298CoverageRecordSha256(record));
});

for (const [label, mutate, failure] of [
  ['missing component', (_record, components) => { components.pop(); }, 'exact-four-component-set'],
  ['reordered components', (_record, components) => { components.reverse(); }, 'exact-four-component-set'],
  ['duplicate binding', (record) => { record.components[3] = structuredClone(record.components[2]); }, 'exact-four-component-bindings'],
  ['unknown scope', (record) => { record.components[0].renderer = 'future-renderer'; }, 'exact-four-component-bindings'],
  ['source drift', (record) => { record.sourceSha = 'd'.repeat(40); }, 'exact-source'],
  ['tooling drift', (record) => { record.tooling.runnerSha256 = 'd'.repeat(64); }, 'preview-tooling-hashes'],
  ['component digest drift', (_record, components) => {
    components[0].browser.executableSha256 = 'd'.repeat(64);
    components[0].receiptSha256 = pass71GrenadeNativeRecordSha256(components[0]);
  }, 'coverage:component:solo:webgl2:binding'],
  ['component fault', (record, components) => {
    components[3].faults.push('pageerror');
    components[3].receiptSha256 = pass71GrenadeNativeRecordSha256(components[3]);
    record.components[3].receiptSha256 = components[3].receiptSha256;
  }, 'coverage:component:hosted:webgpu:aggregate-faults'],
  ['premature finalization', (record) => { record.finalizedAt = '2026-07-24T09:04:59.999Z'; }, 'coverage-finalization-time'],
  ['coverage fault', (record) => { record.faults.push('component process failed'); }, 'coverage-faults'],
  ['extra unvalidated claim', (record) => { record.unvalidatedClaim = true; }, 'coverage:schema-fields'],
]) {
  test(`rejects ${label}`, () => {
    const { record, components } = fixture();
    const context = { sourceSha, tooling: structuredClone(record.tooling), components };
    mutate(record, components);
    refreshCoverage(record);
    assert.ok(pass71Hf298CoverageFailures(record, context).includes(failure));
  });
}

test('rejects unknown schema, kind, forged digest and non-canonical timestamp', () => {
  for (const mutate of [
    (record) => { record.schemaVersion = 2; },
    (record) => { record.kind = 'pass71-hf298-full-scope-coverage-future'; },
    (record) => { record.finalizedAt = '2026-07-24T09:06:00Z'; },
  ]) {
    const { record, components } = fixture();
    mutate(record);
    refreshCoverage(record);
    assert.ok(pass71Hf298CoverageFailures(record, expected(record, components)).length > 0);
  }
  const { record, components } = fixture();
  record.receiptSha256 = 'f'.repeat(64);
  assert.ok(pass71Hf298CoverageFailures(record, expected(record, components)).includes('receipt-sha256'));
});

test('rejects a WebGL2 component that invents asynchronous GPU submission sequences', () => {
  const { record, components } = fixture();
  components[0] = createPass71GrenadeNativeEvidenceFixture({
    sourceSha, tooling: record.tooling, mode: 'solo', renderer: 'webgl2',
  });
  components[0].trials[0].warm.frontier.targetSubmissionSequence = 1;
  components[0].receiptSha256 = pass71GrenadeNativeRecordSha256(components[0]);
  record.components[0].receiptSha256 = components[0].receiptSha256;
  refreshCoverage(record);
  assert.ok(pass71Hf298CoverageFailures(record, expected(record, components))
    .includes('coverage:component:solo:webgl2:trial:frag:warm:completed-presentation-frontier'));
});
