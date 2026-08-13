import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR,
  PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY,
  PASS71_HF301_TOOL_PATHS,
  assertPass71Hf301Evidence,
  createPass71Hf301EvidenceFixture,
  pass71Hf301EvidenceFailures,
  pass71Hf301OwnerSourceFailures,
  pass71Hf301RecordSha256,
} from './pass71-hf301-renderer-progress-evidence-contract.mjs';

const sourceSha = 'a'.repeat(40);
const sourceTreeSha = 'd'.repeat(40);
const tooling = Object.fromEntries(Object.keys(PASS71_HF301_TOOL_PATHS).map(
  (name, index) => [`${name}Sha256`, ((index % 15) + 1).toString(16).repeat(64)],
));
const expected = { sourceSha, sourceTreeSha, tooling };
const source = {
  legacyMain: readFileSync(new URL('../../src/legacy-main.ts', import.meta.url), 'utf8'),
  renderRuntime: readFileSync(new URL('../../src/rendering/render-runtime.ts', import.meta.url), 'utf8'),
};

function fixture() {
  return createPass71Hf301EvidenceFixture({ sourceSha, sourceTreeSha, tooling });
}

function resign(record) {
  record.receiptSha256 = pass71Hf301RecordSha256(record);
  return record;
}

describe('Pass 71 HF-301 renderer forward-progress closure', () => {
  it('accepts only the exact two-renderer four-action closing receipt', () => {
    const record = fixture();
    assert.equal(record.closesFeedback, true);
    assert.equal(record.liveNoProgressThresholdMs, 1_000);
    assert.deepEqual(record.scopes.map((scope) => scope.renderer), ['webgl2', 'webgpu']);
    assert.deepEqual(record.scopes.map((scope) => scope.traces.length), [4, 4]);
    assert.deepEqual(pass71Hf301EvidenceFailures(record, expected), []);
    assert.equal(assertPass71Hf301Evidence(record, expected), record);
  });

  it('exports one optional strict registry entry with closing authority', () => {
    assert.deepEqual(PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR, {
      evidenceId: 'HF-301',
      kind: 'pass71-hf301-renderer-forward-progress-closure',
      minimumCount: 0,
      maximumCount: 1,
    });
    assert.equal(PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY.closesFeedback, true);
    assert.equal(PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY.descriptor,
      PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR);
  });

  it('audits the real renderer/frame owner without widening the one-second fence', () => {
    assert.deepEqual(pass71Hf301OwnerSourceFailures(source), []);
    const widened = {
      ...source,
      legacyMain: source.legacyMain.replace(
        'const LIVE_WEBGPU_PRESENTATION_STALL_MS = 1_000;',
        'const LIVE_WEBGPU_PRESENTATION_STALL_MS = 1_147;',
      ),
    };
    assert(pass71Hf301OwnerSourceFailures(widened).includes('live-threshold-not-exactly-1000ms'));
    const deadlineGate = {
      ...source,
      legacyMain: source.legacyMain.replace(
        "if (liveStall?.kind === 'pending-completion') {",
        "if (liveStall?.kind === 'pending-completion' && presentation.completionDeadlineExceeded) {",
      ),
    };
    assert(pass71Hf301OwnerSourceFailures(deadlineGate).includes('pending-completion-not-unconditionally-fatal'));
    const schedulerRebase = {
      ...source,
      legacyMain: source.legacyMain.replace(
        "resetWebGpuPresentationEpoch('foreground scheduler gap', now, false);",
        "resetWebGpuPresentationEpoch('foreground scheduler gap', now);",
      ),
    };
    assert(pass71Hf301OwnerSourceFailures(schedulerRebase).includes('scheduler-gap-rebases-pending-work'));
  });

  it('rejects a readback-only workaround, boundary weakening, or unobservable caught errors', () => {
    const readback = {
      ...source,
      legacyMain: source.legacyMain.replace(
        "const el = element<HTMLElement>('#killstreak-logo-flash');",
        "canvas.toDataURL();\n  const el = element<HTMLElement>('#killstreak-logo-flash');",
      ),
    };
    assert(pass71Hf301OwnerSourceFailures(readback).includes('killstreak-action-path-canvas-readback'));
    const weakenedBoundary = {
      ...source,
      renderRuntime: source.renderRuntime.replace(
        'input.pendingForMs >= input.stallThresholdMs',
        'input.pendingForMs > input.stallThresholdMs',
      ),
    };
    assert(pass71Hf301OwnerSourceFailures(weakenedBoundary).includes('renderer-pending-detector-drift'));
    const swallowed = {
      ...source,
      legacyMain: source.legacyMain.replace("  console.error(`[atomic-acres:${context}]`, error);", ''),
    };
    assert(pass71Hf301OwnerSourceFailures(swallowed).includes('caught-frame-error-not-observable'));
  });

  it('rejects source, tooling, browser, adapter, scope, and receipt drift', () => {
    const sourceDrift = fixture();
    sourceDrift.source.endingCheckoutSourceSha = 'b'.repeat(40);
    resign(sourceDrift);
    assert(pass71Hf301EvidenceFailures(sourceDrift, expected).includes('exact-clean-candidate-a-source'));
    const toolDrift = fixture();
    toolDrift.tooling.runnerSha256 = 'f'.repeat(64);
    resign(toolDrift);
    assert(pass71Hf301EvidenceFailures(toolDrift, expected).includes('candidate-a-tooling-hashes'));
    const unsignedEdge = fixture();
    unsignedEdge.browser.authenticodeStatus = 'NotSigned';
    resign(unsignedEdge);
    assert(pass71Hf301EvidenceFailures(unsignedEdge, expected).includes('installed-edge-identity'));
    const software = fixture();
    software.scopes[1].runtime.softwareAdapter = true;
    software.scopes[1].runtime.adapterLabel = 'SwiftShader';
    resign(software);
    assert(pass71Hf301EvidenceFailures(software, expected).includes('scope:webgpu:native-runtime'));
    const missingScope = fixture();
    missingScope.scopes.pop();
    resign(missingScope);
    assert(pass71Hf301EvidenceFailures(missingScope, expected).includes('exact-renderer-scope-set'));
    const unsigned = fixture();
    unsigned.completedAt = '2026-08-13T20:03:00.000Z';
    assert(pass71Hf301EvidenceFailures(unsigned, expected).includes('receipt-sha256'));
  });

  it('rejects no-progress, missing completion, compilation, readback, and swallowed-error evidence', () => {
    const pending = fixture();
    pending.scopes[1].traces[0].samples[5].pendingForMs = 1_000;
    resign(pending);
    assert(pass71Hf301EvidenceFailures(pending, expected)
      .some((failure) => failure.includes('no-progress-fence')));
    const noCompletion = fixture();
    for (const sample of noCompletion.scopes[1].traces[0].samples) sample.completedSequence = 20;
    noCompletion.scopes[1].traces[0].summary.completionAdvances = 0;
    noCompletion.scopes[1].traces[0].summary.endingCompletedSequence = 20;
    resign(noCompletion);
    assert(pass71Hf301EvidenceFailures(noCompletion, expected).includes('webgpu:trace:0:webgpu-completed-submission'));
    const compile = fixture();
    compile.scopes[1].traces[1].samples[8].slowNodeBuildCount += 1;
    resign(compile);
    assert(pass71Hf301EvidenceFailures(compile, expected)
      .some((failure) => failure.includes('monotonicity-or-compile')));
    const readback = fixture();
    readback.scopes[0].traces[2].readbacks.webgl2ReadPixels = 1;
    resign(readback);
    assert(pass71Hf301EvidenceFailures(readback, expected).includes('webgl2:trace:2:live-canvas-readback'));
    const swallowed = fixture();
    swallowed.scopes[0].runtimeErrorLog = '[frame] Error: renderer failure';
    resign(swallowed);
    assert(pass71Hf301EvidenceFailures(swallowed, expected).includes('scope:webgl2:swallowed-or-browser-errors'));
  });

  it('rejects false action outcomes and unknown manifest fields', () => {
    const outcome = fixture();
    outcome.scopes[0].traces[1].outcome.brokenAfter = false;
    resign(outcome);
    assert(pass71Hf301EvidenceFailures(outcome, expected).includes('webgl2:trace:1:glass-outcome'));
    const unknown = fixture();
    unknown.thresholdOverride = 12_000;
    resign(unknown);
    assert(pass71Hf301EvidenceFailures(unknown, expected).includes('record:schema-fields'));
  });

  it('adapts directly to the manifest registry context', () => {
    const record = fixture();
    assert.deepEqual(PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY.validate(record, {
      sourceSha,
      repositoryRoot: process.cwd(),
      options: {
        pass71Hf301SourceTreeSha: sourceTreeSha,
        pass71Hf301Tooling: tooling,
        pass71Hf301OwnerReplay: record.ownerReplay,
      },
    }), []);
  });
});
