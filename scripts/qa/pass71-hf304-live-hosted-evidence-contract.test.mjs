import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PASS71_HF304_GLASS_EVIDENCE } from './pass71-hf304-glass-evidence-contract.mjs';
import {
  PASS71_HF304_LIVE_HOSTED_DESCRIPTOR,
  PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES,
  PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES,
  PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256,
  PASS71_HF304_LIVE_HOSTED_SCOPES,
  PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS,
  canonicalJson,
  createPass71Hf304LiveHostedEvidenceFixture,
  pass71Hf304LiveHostedEvidenceFailures,
  pass71Hf304LiveHostedRecordSha256,
  pass71Hf304LiveHostedSourceTreeAtSource,
  pass71Hf304LiveHostedToolingHashesAtSource,
} from './pass71-hf304-live-hosted-evidence-contract.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const SOURCE_TREE_SHA = 'b'.repeat(40);
const BASE = createPass71Hf304LiveHostedEvidenceFixture({ sourceSha: SOURCE_SHA, sourceTreeSha: SOURCE_TREE_SHA });

function fixture() {
  return structuredClone(BASE);
}

function digest(value) {
  return createHash('sha256').update(Buffer.from(`${canonicalJson(value)}\n`, 'utf8')).digest('hex');
}

function refresh(record) {
  for (const component of record.components) {
    component.matrixDigestSha256 = digest({ solo: component.soloCells, hosted: component.hostedCells });
    component.crackDigestSha256 = digest(component.crackControls);
    component.debrisDigestSha256 = digest(component.debrisTrails);
    component.visualDigestSha256 = digest(component.visuals);
  }
  record.receiptSha256 = pass71Hf304LiveHostedRecordSha256(record);
  return record;
}

function failures(record) {
  return pass71Hf304LiveHostedEvidenceFailures(record, {
    sourceSha: SOURCE_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    tooling: BASE.tooling,
  });
}

test('accepts the exact 1,920-cell closing fixture while preserving the older component as non-closing', () => {
  assert.deepEqual(failures(fixture()), []);
  assert.deepEqual(PASS71_HF304_LIVE_HOSTED_DESCRIPTOR, {
    evidenceId: 'HF-304', kind: 'pass71-hf304-live-hosted-native', minimumCount: 0, maximumCount: 1,
  });
  assert.equal(PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY.closesFeedback, true);
  assert.equal(PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY.ownerSubjectiveApproval, 'not-claimed');
  assert.equal(PASS71_HF304_GLASS_EVIDENCE.closesFeedback, false);
  assert.equal(BASE.components.reduce((count, component) => (
    count + component.soloCells.length + component.hostedCells.length
  ), 0), 1_920);
  assert.equal(BASE.components.reduce((count, component) => count + component.debrisTrails.length, 0), 144);
  assert.equal(BASE.components.reduce((count, component) => count + component.crackControls.length, 0), 96);
  assert.equal(BASE.components.reduce((count, component) => count + component.visuals.length, 0), 16);
  assert.equal(PASS71_HF304_LIVE_HOSTED_SCOPES.length, 4);
  assert.ok(Buffer.byteLength(JSON.stringify(BASE, null, 2), 'utf8') < PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES);
  assert.equal(PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES, 104 * 1_024);
  assert.equal(BASE.environment.hostnameSha256, PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256);
  const maximumVisualRecord = fixture();
  const maximumBase64 = 'A'.repeat(Math.ceil(PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES / 3) * 4);
  for (const component of maximumVisualRecord.components) for (const visual of component.visuals) {
    visual.bytes = PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES;
    visual.dataUrl = `data:image/png;base64,${maximumBase64}`;
  }
  assert.ok(Buffer.byteLength(JSON.stringify(maximumVisualRecord, null, 2), 'utf8')
    < PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES);
  assert.ok(PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS.includes('src/legacy-main.ts'));
});

test('optional acceptance registry validates the exact source-bound fixture', () => {
  assert.deepEqual(PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY.validate(fixture(), {
    sourceSha: SOURCE_SHA,
    options: {
      pass71Hf304LiveHostedSourceTreeSha: SOURCE_TREE_SHA,
      pass71Hf304LiveHostedTooling: BASE.tooling,
    },
  }), []);
});

test('production acceptance resolves the exact source tree and tooling from Candidate A', () => {
  const repositoryRoot = process.cwd();
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const sourceTreeSha = pass71Hf304LiveHostedSourceTreeAtSource(repositoryRoot, sourceSha);
  const tooling = pass71Hf304LiveHostedToolingHashesAtSource(repositoryRoot, sourceSha);
  const record = createPass71Hf304LiveHostedEvidenceFixture({ sourceSha, sourceTreeSha, tooling });
  assert.deepEqual(PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY.validate(record, {
    repositoryRoot,
    sourceSha,
  }), []);
});

const mutations = [
  ['missing weapon/pane cell', (record) => { record.components[0].hostedCells.pop(); }, 'hosted:cell-count'],
  ['reordered canonical weapon cell', (record) => {
    [record.components[0].soloCells[0], record.components[0].soloCells[1]] = [
      record.components[0].soloCells[1], record.components[0].soloCells[0],
    ];
  }, 'exact-cartesian-identity'],
  ['simulated rather than current guest action', (record) => {
    record.components[0].hostedCells[0].authority.guestActionIdentity = null;
  }, 'host-guest-convergence'],
  ['forged host authority', (record) => {
    record.components[1].hostedCells[17].protocol.windowEvent.hostAuthorityId = 'forged-host';
  }, 'exact-window-event-protocol'],
  ['replayed or absent guest event', (record) => {
    record.components[2].hostedCells[34].authority.guestWindowEventIdentity.processed = false;
  }, 'host-guest-convergence'],
  ['guest action identity copied from a different actor', (record) => {
    record.components[0].hostedCells[1].authority.guestActionIdentity.by = 'forged-actor';
  }, 'host-guest-convergence'],
  ['guest event identity copied from a different nonce', (record) => {
    record.components[0].hostedCells[2].authority.guestWindowEventIdentity.nonce += 100;
  }, 'host-guest-convergence'],
  ['guest spatial observation is detached from the host action origin', (record) => {
    record.components[0].hostedCells[2].spatial.guestObservedHostPosition[0] += 5;
  }, 'finite-spatial-authority'],
  ['claimed durable convergence with divergent guest authority', (record) => {
    record.components[1].hostedCells[3].authority.guestAfter.state.damageQ = 999;
  }, 'host-guest-convergence'],
  ['claimed mutation tick detached from runtime state', (record) => {
    record.components[1].hostedCells[4].authority.localMutationTicks.guest += 1;
  }, 'host-guest-convergence'],
  ['pane mutation detached from its exact event identity', (record) => {
    record.components[1].hostedCells[5].authority.hostAfter.state.rememberedImpactIds[0] = 'forged-impact';
  }, 'host-authority-or-collider'],
  ['projectile action not admitted to pane ledger', (record) => {
    const cell = record.components[0].hostedCells.find((entry) => entry.weaponId === 'flare-gun');
    cell.authority.guestActionIdentity.paneAdmitted = false;
  }, 'host-guest-convergence'],
  ['ordinary action falsely claims projectile pane binding', (record) => {
    record.components[0].hostedCells[0].authority.guestActionIdentity.paneAdmitted = true;
  }, 'host-guest-convergence'],
  ['immortal movement collider', (record) => {
    record.components[3].soloCells[0].authority.hostAfter.activeWorldColliderPresent = true;
  }, 'pane-authority-projection'],
  ['premature intact pass-through', (record) => {
    record.components[0].soloCells[0].authority.hostBefore.projection.ballisticSolid = false;
  }, 'pane-authority-projection'],
  ['floating shard without downward movement', (record) => {
    const trail = record.components[0].debrisTrails[0];
    trail.samples[1].position = [...trail.samples[0].position];
  }, 'fall-move-settle-retire'],
  ['unsupported suspension claim', (record) => {
    record.components[0].debrisTrails[1].unsupportedSuspension = true;
  }, 'bounded-gravity-lifecycle'],
  ['unretired fragment', (record) => {
    record.components[1].debrisTrails[20].samples[3].present = true;
  }, 'fall-move-settle-retire'],
  ['debris owner contradicts its spawned body state', (record) => {
    record.components[1].debrisTrails[20].motionOwner = 'bounded-presentation-fall';
  }, 'fall-move-settle-retire'],
  ['guest debris is detached from the host action identity', (record) => {
    record.components[1].debrisTrails[24].actionNonce += 100;
  }, 'host-guest-action-identity'],
  ['unbounded debris body growth', (record) => {
    record.components[2].debrisTrails[35].bodyCountBounded = false;
  }, 'bounded-gravity-lifecycle'],
  ['crack control opens its collider early', (record) => {
    record.components[1].crackControls[4].cracked.colliderPresent = false;
  }, 'crack-collider-projection'],
  ['crack control omits authored crack overlay', (record) => {
    record.components[2].crackControls[12].cracked.crackOverlayVisible = false;
  }, 'crack-collider-projection'],
  ['crack control detaches its authority impact identity', (record) => {
    record.components[2].crackControls[12].cracked.rememberedImpactIds[0] = 'forged-crack';
  }, 'crack-collider-projection'],
  ['visual control reuses breached raster', (record) => {
    record.components[0].visuals[0] = structuredClone(record.components[0].visuals[1]);
    record.components[0].visuals[0].id = 'quality/webgl2/solo/intact';
    record.components[0].visuals[0].phase = 'intact';
  }, 'control-diff'],
  ['embedded PNG bytes forged', (record) => {
    const dataUrl = record.components[0].visuals[0].dataUrl;
    record.components[0].visuals[0].dataUrl = `${dataUrl.slice(0, -8)}AAAAAAAA`;
  }, 'embedded-png-digest'],
  ['non-representative PNG crop dimensions', (record) => {
    record.components[0].visuals[0].width = 1;
  }, 'lossless-visual-identity'],
  ['visual crop path is not its exact scope-owned path', (record) => {
    record.components[0].visuals[0].path = 'artifacts/pass71/hf304-live-hosted/components/shared.png';
  }, 'lossless-visual-identity'],
  ['WebGPU fallback hidden as native', (record) => {
    record.components[2].runtime.actualBackend = 'webgl2';
  }, 'native-hardware-runtime'],
  ['WebGPU runtime identity hides the wrong adapter class', (record) => {
    record.components[2].runtime.adapterClass = 'WebGL2RenderingContext';
  }, 'native-hardware-runtime'],
  ['guest renderer owner diverges from its native scope', (record) => {
    record.components[2].sessions[0].hosted.guestRuntime.adapterClass = 'WebGL2RenderingContext';
  }, 'native-hardware-runtime'],
  ['software GPU adapter', (record) => {
    record.components[3].runtime.adapterLabel = 'Google SwiftShader';
    record.components[3].runtime.softwareAdapter = true;
  }, 'native-hardware-runtime'],
  ['logical machine label drift', (record) => {
    record.environment.machine = 'desktop-vi3cr5q';
  }, 'exact-machine-environment'],
  ['runtime hostname digest drift', (record) => {
    record.environment.hostnameSha256 = '0'.repeat(64);
  }, 'exact-machine-environment'],
  ['shared Edge profile', (record) => {
    record.components[3].browser.sessionNonce = record.components[2].browser.sessionNonce;
  }, 'fresh-edge-profile-per-scope'],
  ['shared PeerJS identity', (record) => {
    record.components[3].peerServer.port = record.components[2].peerServer.port;
    record.components[3].peerServer.path = record.components[2].peerServer.path;
  }, 'fresh-owned-peer-per-scope'],
  ['reused action nonce across scope owners', (record) => {
    record.components[3].hostedCells[0].actor.actionNonce = record.components[0].soloCells[0].actor.actionNonce;
    record.components[3].hostedCells[0].protocol.action.nonce = record.components[3].hostedCells[0].actor.actionNonce;
  }, 'global-action-event-nonce-identity'],
  ['reused crack impact nonce', (record) => {
    record.components[3].crackControls[0].impactNonce = record.components[0].crackControls[0].impactNonce;
  }, 'global-crack-impact-nonce-identity'],
  ['reused debris action nonce across authority owners', (record) => {
    record.components[3].debrisTrails[0].actionNonce = record.components[0].debrisTrails[0].actionNonce;
  }, 'global-debris-action-event-nonce-identity'],
  ['fabricated owner approval', (record) => { record.ownerSubjectiveApproval = 'approved'; }, 'ownerSubjectiveApproval'],
];

for (const [name, mutate, expected] of mutations) {
  test(`rejects ${name}`, () => {
    const record = fixture();
    mutate(record);
    refresh(record);
    const observed = failures(record);
    assert.ok(observed.some((failure) => failure.includes(expected)), observed.join('\n'));
  });
}

test('rejects stale exact source and tooling even with a refreshed receipt digest', () => {
  const record = fixture();
  record.source.expectedSourceSha = 'f'.repeat(40);
  record.tooling[0].sha256 = '0'.repeat(64);
  refresh(record);
  assert.ok(failures(record).includes('exact-clean-candidate-a-source'));
  assert.ok(failures(record).includes('exact-source-tooling'));
});

test('rejects receipt digest tampering', () => {
  const record = fixture();
  record.receiptSha256 = 'f'.repeat(64);
  assert.ok(failures(record).includes('receipt-digest'));
});

test('rejects an encoded record that exceeds the manifest-safe hard cap', () => {
  const record = fixture();
  record.faults.push('x'.repeat(PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES));
  refresh(record);
  assert.ok(failures(record).includes('record:encoded-byte-cap'));
});
