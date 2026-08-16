import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR,
  PASS71_HF304_GLASS_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF304_TOOL_PATHS,
  createPass71Hf304EvidenceFixture,
  pass71Hf304EvidenceFailures,
  pass71Hf304RecordSha256,
} from './pass71-hf304-glass-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'b'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF304_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const expected = { sourceSha, sourceTreeSha, tooling };

function fixture() {
  return createPass71Hf304EvidenceFixture(expected);
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalSha256(value) {
  return createHash('sha256').update(`${JSON.stringify(canonicalValue(value))}\n`).digest('hex');
}

function resign(record) {
  for (const component of record.components) {
    const bytes = `${JSON.stringify(component.embedded, null, 2)}\n`;
    component.receiptSha256 = createHash('sha256').update(bytes).digest('hex');
    component.receiptByteLength = Buffer.byteLength(bytes);
  }
  record.receiptSha256 = pass71Hf304RecordSha256(record);
  return record;
}

describe('Pass 71 HF-304 glass evidence contract', () => {
  it('exports the strict four-field optional registry descriptor', () => {
    assert.deepEqual(Object.keys(PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR).sort(), [
      'evidenceId', 'kind', 'maximumCount', 'minimumCount',
    ]);
    assert.deepEqual(PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR, {
      evidenceId: 'HF-304',
      kind: 'pass71-hf304-glass-full-mechanical-component',
      minimumCount: 0,
      maximumCount: 1,
    });
  });

  it('accepts one exact source-bound 480-cell non-closing component record', () => {
    const record = fixture();
    assert.equal(record.components[0].embedded.matrix.length, 480);
    assert.equal(record.components[0].embedded.debris.length, 24);
    assert.equal(record.components[1].embedded.cases.length, 10);
    assert.deepEqual(pass71Hf304EvidenceFailures(record, expected), []);
  });

  it('rejects source, tree and tooling drift after re-signing', () => {
    const source = fixture();
    source.source.endingCheckoutSourceSha = 'f'.repeat(40);
    resign(source);
    assert(pass71Hf304EvidenceFailures(source, expected).includes('exact-candidate-a-source'));

    const tool = fixture();
    tool.tooling.runtimeSha256 = 'f'.repeat(64);
    tool.components[0].embedded.runtimeIntegration.sourceSha256 = 'f'.repeat(64);
    resign(tool);
    assert(pass71Hf304EvidenceFailures(tool, expected).includes('candidate-a-tooling-hashes'));
  });

  it('rejects a missing, reordered or renamed Cartesian cell', () => {
    const missing = fixture();
    missing.components[0].embedded.matrix.pop();
    missing.components[0].embedded.matrixDigestSha256 = 'f'.repeat(64);
    resign(missing);
    assert(pass71Hf304EvidenceFailures(missing, expected).includes('mechanical:matrix-count-or-digest'));

    const renamed = fixture();
    renamed.components[0].embedded.matrix[317].weaponId = 'carbine';
    renamed.components[0].embedded.matrixDigestSha256 = canonicalSha256(renamed.components[0].embedded.matrix);
    resign(renamed);
    assert(pass71Hf304EvidenceFailures(renamed, expected).some((failure) => failure.includes('mechanical:cell:317')));
  });

  it('rejects hosted authority, aperture and collider divergence', () => {
    const record = fixture();
    const hosted = record.components[0].embedded.matrix[240];
    hosted.authority.replicaProjection.ballisticSolid = true;
    hosted.authority.projectionEqual = false;
    record.components[0].embedded.matrixDigestSha256 = canonicalSha256(record.components[0].embedded.matrix);
    resign(record);
    const failures = pass71Hf304EvidenceFailures(record, expected);
    assert(failures.some((failure) => failure.includes('mechanical:cell:240:authority')));

    const cracked = fixture();
    cracked.components[0].embedded.matrix[0].authority.crackProbe.hostProjection.ballisticSolid = false;
    cracked.components[0].embedded.matrixDigestSha256 = canonicalSha256(cracked.components[0].embedded.matrix);
    resign(cracked);
    assert(pass71Hf304EvidenceFailures(cracked, expected).includes('mechanical:cell:0:authority'));
  });

  it('rejects an incomplete or unbounded debris lifecycle', () => {
    const missing = fixture();
    missing.components[0].embedded.debris.pop();
    missing.components[0].embedded.debrisDigestSha256 = 'f'.repeat(64);
    resign(missing);
    assert(pass71Hf304EvidenceFailures(missing, expected).includes('mechanical:debris-count-or-digest'));

    const unbounded = fixture();
    unbounded.components[0].embedded.debris[0].bounds.maximumLifetimeMs = 45_000;
    unbounded.components[0].embedded.debrisDigestSha256 = canonicalSha256(unbounded.components[0].embedded.debris);
    resign(unbounded);
    assert(pass71Hf304EvidenceFailures(unbounded, expected).includes('mechanical:debris:0'));
  });

  it('requires all ten installed-Edge served runtime cases', () => {
    const missing = fixture();
    missing.components[1].embedded.cases.pop();
    resign(missing);
    assert(pass71Hf304EvidenceFailures(missing, expected).includes('browser:case-matrix'));

    const unsignedBrowser = fixture();
    unsignedBrowser.browser.authenticodeStatus = 'NotSigned';
    resign(unsignedBrowser);
    assert(pass71Hf304EvidenceFailures(unsignedBrowser, expected).includes('installed-edge-executable-identity'));
  });

  it('rejects floating, still-physical or non-retired served debris', () => {
    const noCollision = fixture();
    noCollision.components[1].embedded.cases[0].receipt.lifecycle.initial.physical = false;
    resign(noCollision);
    assert(pass71Hf304EvidenceFailures(noCollision, expected).includes('browser:case:quality/bullet:lifecycle'));

    const floating = fixture();
    floating.components[1].embedded.cases[3].receipt.lifecycle.settled.fallbackSettled = false;
    resign(floating);
    assert(pass71Hf304EvidenceFailures(floating, expected).includes('browser:case:quality/flare-gun:lifecycle'));

    const retained = fixture();
    retained.components[1].embedded.cases[9].receipt.retired.pool.activePhysics = 1;
    resign(retained);
    assert(pass71Hf304EvidenceFailures(retained, expected).includes('browser:case:performance/explosive-crossbow:retired-receipt'));

    const staleDebris = fixture();
    staleDebris.components[1].embedded.cases[2].receipt.retired.persistentWindowDebris.push({ id: 'stale' });
    resign(staleDebris);
    assert(pass71Hf304EvidenceFailures(staleDebris, expected).includes('browser:case:quality/grenade:retired-receipt'));

    const activeBody = fixture();
    activeBody.components[1].embedded.cases[1].receipt.retired.rapierMajorBodies = 1;
    resign(activeBody);
    assert(pass71Hf304EvidenceFailures(activeBody, expected).includes('browser:case:quality/knife:retired-receipt'));

    const wrongFinalPaneState = fixture();
    const firstPane = wrongFinalPaneState.components[1].embedded.cases[3].receipt.retired.panes[0];
    firstPane.broken = true;
    firstPane.apertureOpen = true;
    firstPane.activeWorldColliderPresent = false;
    resign(wrongFinalPaneState);
    assert(pass71Hf304EvidenceFailures(wrongFinalPaneState, expected).includes('browser:case:quality/flare-gun:retired-receipt'));
  });

  it('cannot be mutated into closing evidence', () => {
    const record = fixture();
    record.closesFeedback = true;
    record.closingAuthority = true;
    resign(record);
    assert(pass71Hf304EvidenceFailures(record, expected).includes('non-closing-authority'));

    const hiddenUnknown = fixture();
    hiddenUnknown.unknowns = hiddenUnknown.unknowns.slice(1);
    resign(hiddenUnknown);
    assert(pass71Hf304EvidenceFailures(hiddenUnknown, expected).includes('known-unknowns-contract'));
  });

  it('adapts directly to the acceptance registry context', () => {
    const record = fixture();
    assert.deepEqual(PASS71_HF304_GLASS_EVIDENCE_REGISTRY_ENTRY.validate(record, {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: { pass71Hf304Tooling: tooling, pass71Hf304SourceTreeSha: sourceTreeSha },
    }), []);
  });

  it('rejects unsigned mutations even if every component remains green', () => {
    const record = fixture();
    record.completedAt = '2026-08-13T20:21:00.000Z';
    assert(pass71Hf304EvidenceFailures(record, expected).includes('receipt-sha256'));
  });
});
