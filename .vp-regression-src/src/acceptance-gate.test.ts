import { describe, expect, it } from 'vitest';
import {
  assertCiImpactMatchesPaths,
  classifyPreviewDelta,
  committedManifestBytes,
  selectCiAcceptanceManifest,
  validateAcceptanceManifest,
} from '../scripts/release/acceptance-gate.mjs';

const policy = {
  schemaVersion: 1,
  enforceFromPass: 62,
  manifestDirectory: 'acceptance',
  ownerHandle: 'Dave',
  allowedEvidenceKinds: ['unit', 'contract', 'browser', 'trace', 'visual', 'manual'],
};

function acceptedManifest() {
  return {
    schemaVersion: 1,
    releasePass: 'PASS 62',
    feedbackReceivedAt: '2026-07-24T08:00:00Z',
    status: 'accepted',
    preview: {
      kind: 'github-actions-artifact',
      ref: 'pr-preview-1-0123456789abcdef0123456789abcdef01234567',
      sourceSha: '0123456789abcdef0123456789abcdef01234567',
      createdAt: '2026-07-24T09:00:00Z',
    },
    humanAcceptance: {
      state: 'approved',
      approvedBy: 'Dave',
      approvedAt: '2026-07-24T09:10:00Z',
      evidence: 'Approved after testing the immutable candidate.',
    },
    requirements: [{
      id: 'R1',
      summary: 'Rendered chooser works',
      expected: 'The chooser exposes the intended build.',
      falsifier: 'The intended build cannot be opened.',
      acceptance: 'visual',
      state: 'verified',
      evidence: [
        {
          kind: 'browser',
          ref: 'tests/e2e/release-channel-chooser.spec.ts',
          command: 'npx playwright test tests/e2e/release-channel-chooser.spec.ts',
          note: 'Exercises the served chooser.',
        },
        { kind: 'visual', ref: 'artifact://chooser/accepted.png', note: 'Reviewed served capture.' },
      ],
    }],
  };
}

function standingPublicationManifest(): any {
  const manifest: any = acceptedManifest();
  manifest.releasePass = 'PASS 72';
  manifest.preview.ref = `pr-preview-72-${manifest.preview.sourceSha}`;
  manifest.preview.artifactId = 123;
  manifest.preview.fileCount = 1;
  manifest.preview.treeSha256 = 'a'.repeat(64);
  manifest.humanAcceptance = {
    state: 'approved',
    approvedBy: 'Dave',
    approvedAt: '2026-07-24T08:30:00Z',
    kind: 'standing-publication-authorization',
    previewInspection: 'not-performed',
    evidence: 'Dave gave standing publication-first authorization; Dave did not inspect or test the immutable preview and public HITL follows publication.',
  };
  manifest.releaseDecision = {
    state: 'publication-authorized',
    condition: 'all-required-mechanical-gates-green',
    ownerHitl: 'deferred-until-public-pages',
  };
  manifest.requirements = [
    {
      id: 'R1',
      summary: 'Mechanical release contract works',
      expected: 'The exact candidate passes its mechanical release contract.',
      falsifier: 'The mechanical release contract fails.',
      acceptance: 'mechanical',
      state: 'verified',
      evidence: [{
        kind: 'unit',
        ref: 'src/acceptance-gate.test.ts',
        command: 'npx vitest run src/acceptance-gate.test.ts',
        note: 'Exercises the release decision contract.',
      }],
    },
    {
      id: 'R2',
      summary: 'Complete public owner HITL',
      expected: 'Dave tests the exact public Pages build after publication.',
      falsifier: 'Unperformed public HITL is represented as complete.',
      acceptance: 'human',
      state: 'deferred',
      deferApproval: {
        approvedBy: 'Dave',
        approvedAt: '2026-07-24T08:30:00Z',
        reason: 'Dave requested publication first and deferred public HITL until the Pages build is live.',
      },
    },
  ];
  return manifest;
}

describe('release acceptance manifest', () => {
  it('accepts numbered requirements with falsifiers, evidence, and exact preview approval', () => {
    const result = validateAcceptanceManifest(acceptedManifest(), { policy });
    expect(result).toMatchObject({ ok: true, summary: { total: 1, verified: 1, deferred: 0, acceptanceRatio: 1 } });
  });

  it('rejects visual self-attestation without browser and visual proof', () => {
    const manifest = acceptedManifest();
    manifest.requirements[0].evidence = [{ kind: 'manual', ref: 'owner', note: 'Looks fine.' } as never];
    const result = validateAcceptanceManifest(manifest, { policy });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/served-browser evidence/);
    expect(result.errors.join('\n')).toMatch(/visual artifact/);
  });

  it('allows only explicitly owner-approved deferrals', () => {
    const manifest = acceptedManifest();
    manifest.requirements[0] = {
      ...manifest.requirements[0],
      state: 'deferred',
      evidence: [],
      deferApproval: { approvedBy: 'Dave', approvedAt: '2026-07-24T09:11:00Z', reason: 'Move to Pass 63.' },
    } as never;
    expect(validateAcceptanceManifest(manifest, { policy })).toMatchObject({ ok: true, summary: { deferred: 1 } });
    (manifest.requirements[0] as unknown as { deferApproval: { approvedBy: string } }).deferApproval.approvedBy = 'agent';
    expect(validateAcceptanceManifest(manifest, { policy }).ok).toBe(false);
  });

  it('invalidates approval when runtime or release-shell bytes change after the preview', () => {
    const manifestPath = 'acceptance/pass-62.json';
    expect(classifyPreviewDelta([manifestPath, 'docs/VERIFICATION_AND_RELEASE_HYGIENE.md'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, '.github/workflows/verify.yml'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, 'scripts/release/acceptance-gate.mjs'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, 'tests/e2e/atomic-acres.spec.ts'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, 'src/admission-debug-contract.test.ts'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, 'src/main.ts'], manifestPath)).toMatchObject({ ok: false });
    expect(classifyPreviewDelta([manifestPath, 'src/release-channels.ts'], manifestPath)).toMatchObject({ ok: false });
    expect(classifyPreviewDelta([manifestPath, '.github/workflows/release-production.yml'], manifestPath))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/production shipping controls/) });
    expect(classifyPreviewDelta([manifestPath, 'scripts/release/stage-release-topology.mjs'], manifestPath))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/production shipping controls/) });
  });

  it('does not exempt a process-only CI delta that changes an enforced acceptance manifest', () => {
    expect(selectCiAcceptanceManifest('none', [])).toBeNull();
    expect(selectCiAcceptanceManifest('none', ['acceptance/pass-66.json'])).toBe('acceptance/pass-66.json');
    expect(() => selectCiAcceptanceManifest('none', ['acceptance/pass-65.json', 'acceptance/pass-66.json'])).toThrow(/found 2/);
    expect(() => selectCiAcceptanceManifest('full', [])).toThrow(/found 0/);
  });

  it('independently rejects a caller-supplied process-only impact for runtime paths', () => {
    expect(assertCiImpactMatchesPaths('none', ['docs/release-notes.md'])).toMatchObject({ mode: 'none' });
    expect(assertCiImpactMatchesPaths('smoke', ['src/release-channel.ts'])).toMatchObject({ mode: 'smoke' });
    expect(assertCiImpactMatchesPaths('full', ['src/main.ts'])).toMatchObject({ mode: 'full' });
    expect(() => assertCiImpactMatchesPaths('none', ['src/main.ts'])).toThrow(/does not match independently classified full/);
    expect(() => assertCiImpactMatchesPaths('none', [])).toThrow(/does not match independently classified full/);
  });

  it('cannot validate or receipt mutable manifest bytes that differ from the selected head', () => {
    const head = 'a'.repeat(40);
    const committed = Buffer.from('{"releasePass":"PASS 72","status":"accepted"}\n', 'utf8');
    expect(committedManifestBytes(Buffer.from(committed), committed, 'acceptance/pass-72.json', head))
      .toBe(committed);

    const mutatedWorktree = Buffer.from('{"releasePass":"PASS 72","status":"accepted","injected":true}\n', 'utf8');
    expect(() => committedManifestBytes(mutatedWorktree, committed, 'acceptance/pass-72.json', head))
      .toThrow(/worktree bytes differ from committed/);
  });

  it('retains preview approval only for the finalizer exact-SHA receipt set', () => {
    const manifestPath = 'acceptance/pass-66.json';
    const sha = 'a'.repeat(40);
    const ownerReceipt = `artifacts/pass65-owner-feedback/t-owner-gate-${sha}.json`;
    const hardwareReceipt = `artifacts/pass65-owner-feedback/hardware-webgl2-admission-${sha}.json`;
    const hardwareDetail = `artifacts/pass65/hardware-webgl2-admission/${sha}-receipt.json`;
    const hardwareManifest = `artifacts/pass65/hardware-webgl2-admission/${sha}-dist-manifest.json`;
    const graph = {
      candidateEvidenceSourceSha: sha,
      testCatalog: [{ id: 'T-OWNER-GATE' }, { id: 'T-COLD-HARDWARE-WEBGL2' }],
      artifactCatalog: [
        { sourceSha: sha, testRefs: ['T-OWNER-GATE'], path: ownerReceipt },
        {
          sourceSha: sha,
          testRefs: ['T-COLD-HARDWARE-WEBGL2'],
          path: hardwareReceipt,
          detailedReceiptPath: hardwareDetail,
          buildManifestPath: hardwareManifest,
        },
      ],
    };
    const finalizerPaths = [
      manifestPath,
      'docs/PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md',
      'docs/PASS65_OWNER_FEEDBACK_COMPLETENESS_GRAPH.json',
      ownerReceipt,
      hardwareReceipt,
      hardwareDetail,
      hardwareManifest,
    ];
    expect(classifyPreviewDelta(finalizerPaths, manifestPath, sha, { graph })).toMatchObject({ ok: true });

    for (const path of [
      `artifacts/pass65-owner-feedback/runtime-${sha}.json`,
      `artifacts/pass65-owner-feedback/t-extra-${sha}.json`,
      `artifacts/pass65-owner-feedback/t-owner-gate-${'b'.repeat(40)}.json`,
      `artifacts/pass65/hardware-webgl2-admission/${sha}-other.json`,
      'artifacts/pass65-owner-feedback/runtime.ts',
      'tests/e2e/atomic-acres.spec.ts',
      'docs/VERIFICATION_AND_RELEASE_HYGIENE.md',
      '.github/workflows/verify.yml',
      'scripts/release/acceptance-gate.mjs',
      'acceptance/policy.json',
      'src/main.ts',
    ]) {
      expect(classifyPreviewDelta([...finalizerPaths, path], manifestPath, sha, { graph }), path).toMatchObject({ ok: false });
    }
    expect(classifyPreviewDelta(finalizerPaths.slice(1), manifestPath, sha, { graph })).toMatchObject({ ok: false });
    expect(classifyPreviewDelta(finalizerPaths, manifestPath, 'b'.repeat(40), { graph })).toMatchObject({ ok: false });
  });

  it('rejects an artifact reference that does not match the approved source SHA', () => {
    const manifest = acceptedManifest();
    manifest.preview.ref = `pr-preview-1-${'f'.repeat(40)}`;
    const result = validateAcceptanceManifest(manifest, { policy });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/match preview.sourceSha/);
  });

  it('requires the truthful standing-conditional, no-preview-inspection statement for Pass 66', () => {
    const manifest = acceptedManifest();
    manifest.releasePass = 'PASS 66';
    manifest.preview.ref = `pr-preview-66-${manifest.preview.sourceSha}`;
    manifest.humanAcceptance.evidence = 'Dave\'s standing conditional publication authorization is bound here; Dave did not inspect this immutable preview.';
    expect(validateAcceptanceManifest(manifest, { policy })).toMatchObject({ ok: true });

    manifest.humanAcceptance.evidence = 'Dave gave standing conditional publication authorization for this immutable preview.';
    expect(validateAcceptanceManifest(manifest, { policy }).errors.join('\n')).toMatch(/did not inspect or test/);

    manifest.humanAcceptance.evidence = 'Dave did not inspect this immutable preview; publication may proceed.';
    expect(validateAcceptanceManifest(manifest, { policy }).errors.join('\n')).toMatch(/standing conditional/);
  });

  it('binds standing publication-first authorization without fabricating preview inspection', () => {
    const manifest = standingPublicationManifest();
    expect(Date.parse(manifest.humanAcceptance.approvedAt)).toBeLessThan(Date.parse(manifest.preview.createdAt));
    expect(validateAcceptanceManifest(manifest, { policy })).toMatchObject({
      ok: true,
      summary: { total: 2, verified: 1, deferred: 1, acceptanceRatio: 0.5 },
    });
  });

  it('requires the complete structured decision and a deferred public HITL for standing authorization', () => {
    const missingInspection = standingPublicationManifest();
    delete missingInspection.humanAcceptance.previewInspection;
    expect(validateAcceptanceManifest(missingInspection, { policy }).errors.join('\n')).toMatch(/previewInspection.*not-performed/);

    const missingDecision = standingPublicationManifest();
    delete missingDecision.releaseDecision;
    expect(validateAcceptanceManifest(missingDecision, { policy }).errors.join('\n')).toMatch(/exact publication-authorized/);

    const noInspectionDisclaimer = standingPublicationManifest();
    noInspectionDisclaimer.humanAcceptance.evidence = 'Dave gave standing publication-first authorization.';
    expect(validateAcceptanceManifest(noInspectionDisclaimer, { policy }).errors.join('\n')).toMatch(/did not inspect or test/);

    const noDeferredPublicHitl = standingPublicationManifest();
    noDeferredPublicHitl.requirements = noDeferredPublicHitl.requirements.slice(0, 1);
    expect(validateAcceptanceManifest(noDeferredPublicHitl, { policy }).errors.join('\n')).toMatch(/deferred human public-HITL/);
  });

  it('keeps the normal preview-approval timestamp boundary and rejects unknown authorization kinds', () => {
    const previewApproval = acceptedManifest() as any;
    previewApproval.humanAcceptance.kind = 'preview-approval';
    previewApproval.humanAcceptance.previewInspection = 'performed';
    previewApproval.humanAcceptance.approvedAt = '2026-07-24T08:30:00Z';
    expect(validateAcceptanceManifest(previewApproval, { policy }).errors.join('\n')).toMatch(/cannot precede preview.createdAt/);

    const unknownKind = acceptedManifest() as any;
    unknownKind.humanAcceptance.kind = 'agent-self-approval';
    expect(validateAcceptanceManifest(unknownKind, { policy }).errors.join('\n')).toMatch(/humanAcceptance.kind/);
  });

  it('requires structured authorization and exact preview pins from Pass 72 without changing legacy manifests', () => {
    expect(validateAcceptanceManifest(acceptedManifest(), { policy })).toMatchObject({ ok: true });

    const unstructured = standingPublicationManifest();
    delete unstructured.humanAcceptance.kind;
    delete unstructured.humanAcceptance.previewInspection;
    delete unstructured.releaseDecision;
    unstructured.humanAcceptance.approvedAt = '2026-07-24T09:30:00Z';
    unstructured.humanAcceptance.evidence = 'Approved.';
    unstructured.requirements = unstructured.requirements.slice(0, 1);
    expect(validateAcceptanceManifest(unstructured, { policy }).errors.join('\n'))
      .toMatch(/PASS 72\+ requires an explicit structured humanAcceptance.kind/);

    const missingPin = standingPublicationManifest();
    delete missingPin.preview.artifactId;
    expect(validateAcceptanceManifest(missingPin, { policy }).errors.join('\n'))
      .toMatch(/preview exact pins require/);

    const immutableUrl = standingPublicationManifest();
    immutableUrl.preview.kind = 'immutable-url';
    immutableUrl.preview.ref = `https://example.test/${immutableUrl.preview.sourceSha}`;
    expect(validateAcceptanceManifest(immutableUrl, { policy }).errors.join('\n'))
      .toMatch(/PASS 72\+ requires a GitHub Actions preview artifact/);
  });

  it('leaves exactly the owner-approval error on a complete pre-HITL manifest', () => {
    const manifest = acceptedManifest();
    delete (manifest as { humanAcceptance?: unknown }).humanAcceptance;
    const result = validateAcceptanceManifest(manifest, { policy });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['humanAcceptance must be approved by Dave with timestamped evidence']);
  });
});
