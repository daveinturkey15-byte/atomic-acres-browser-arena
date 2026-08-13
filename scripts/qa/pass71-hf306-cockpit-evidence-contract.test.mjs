import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  PASS71_HF306_ACTIONS,
  PASS71_HF306_COCKPIT_REGISTRY_ENTRY,
  PASS71_HF306_RENDERERS,
  PASS71_HF306_VIEWPORTS,
  createPass71Hf306EvidenceFixture,
  pass71Hf306EvidenceFailures,
  pass71Hf306OwnerSourceFailures,
  pass71Hf306RecordSha256,
} from './pass71-hf306-cockpit-evidence-contract.mjs';

const expected = (fixture) => ({
  sourceSha: fixture.source.expectedSourceSha,
  sourceTreeSha: fixture.source.sourceTreeSha,
  tooling: fixture.tooling,
  assetAudit: fixture.assetAudit,
  ownerSourceAudit: fixture.ownerSourceAudit,
});

function resign(record) {
  record.receiptSha256 = pass71Hf306RecordSha256(record);
  return record;
}

describe('Pass 71 HF-306 cockpit evidence contract', () => {
  test('accepts the exact closing renderer/viewport/action/attribution matrix', () => {
    const fixture = createPass71Hf306EvidenceFixture();
    assert.deepEqual(pass71Hf306EvidenceFailures(fixture, expected(fixture)), []);
    assert.deepEqual(fixture.scopes.map((scope) => scope.renderer), PASS71_HF306_RENDERERS);
    assert.deepEqual(fixture.scopes[0].viewportCases.map((entry) => entry.viewport), PASS71_HF306_VIEWPORTS);
    assert.deepEqual(fixture.scopes[0].viewportCases[0].actions.map((entry) => entry.action), PASS71_HF306_ACTIONS);
  });

  test('exports one optional strict closing registry entry', () => {
    assert.deepEqual(PASS71_HF306_COCKPIT_REGISTRY_ENTRY.descriptor, {
      evidenceId: 'HF-306',
      kind: 'pass71-hf306-chopper-cockpit-framing-closure',
      minimumCount: 0,
      maximumCount: 1,
    });
    assert.equal(PASS71_HF306_COCKPIT_REGISTRY_ENTRY.closesFeedback, true);
  });

  test('rejects a missing ultrawide scope', () => {
    const fixture = createPass71Hf306EvidenceFixture();
    fixture.scopes[0].viewportCases.splice(1, 1);
    resign(fixture);
    assert.ok(pass71Hf306EvidenceFailures(fixture, expected(fixture))
      .includes('scope:webgl2:viewport-set'));
  });

  test('rejects clipped or unreadable instruments', () => {
    const fixture = createPass71Hf306EvidenceFixture();
    fixture.scopes[1].viewportCases[2].actions[1].instruments.allUnclipped = false;
    resign(fixture);
    assert.ok(pass71Hf306EvidenceFailures(fixture, expected(fixture))
      .includes('scope:webgpu:viewport:2:action:1:readable-bounded-instruments-or-centre-dom'));
  });

  test('rejects an obstructed centre corridor', () => {
    const fixture = createPass71Hf306EvidenceFixture();
    fixture.scopes[0].viewportCases[0].actions[0].firstPerson.centreSightlineClear = false;
    resign(fixture);
    assert.ok(pass71Hf306EvidenceFailures(fixture, expected(fixture))
      .includes('scope:webgl2:viewport:0:action:0:authored-first-person-owner'));
  });

  test('recomputes pixels and rejects a copied visible/hidden pair', () => {
    const fixture = createPass71Hf306EvidenceFixture();
    const attachments = fixture.scopes[0].attachments;
    const visible = attachments.find((entry) => entry.key === 'desktop/visible');
    const hidden = attachments.find((entry) => entry.key === 'desktop/hidden-control');
    Object.assign(hidden, {
      byteLength: visible.byteLength,
      width: visible.width,
      height: visible.height,
      sha256: visible.sha256,
      pngBase64: visible.pngBase64,
    });
    resign(fixture);
    const failures = pass71Hf306EvidenceFailures(fixture, expected(fixture));
    assert.ok(failures.some((failure) => failure.includes('raster')));
  });

  test('rejects software adapters and swallowed errors', () => {
    const fixture = createPass71Hf306EvidenceFixture();
    fixture.scopes[1].runtime.adapterLabel = 'Google SwiftShader';
    fixture.scopes[1].runtime.softwareAdapter = true;
    fixture.scopes[1].runtimeErrorLog = '[frame] swallowed';
    resign(fixture);
    const failures = pass71Hf306EvidenceFailures(fixture, expected(fixture));
    assert.ok(failures.includes('scope:webgpu:native-hardware-runtime'));
    assert.ok(failures.includes('scope:webgpu:swallowed-or-browser-errors'));
  });

  test('source audit rejects telemetry-only or readback control workarounds', () => {
    const failures = pass71Hf306OwnerSourceFailures({
      assetAudit: '',
      assetProjectionTest: '',
      frameOwner: 'async function freezeDebugChopperCockpitEvidenceFrame() { readPixels(); }\nasync function captureDebugChopperExteriorHiddenControl() {}',
      presentationOwner: '',
      shellOwner: '',
      hudOwner: '',
    });
    assert.ok(failures.includes('frozen-cockpit-root-control-drift'));
    assert.ok(failures.includes('cockpit-control-readback-workaround'));
    assert.ok(failures.includes('live-presentation-owner-telemetry-drift'));
  });
});
