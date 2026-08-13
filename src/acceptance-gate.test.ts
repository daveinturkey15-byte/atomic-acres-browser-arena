import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptanceWorkflowOutputs,
  classifyPreviewDelta,
  createPass71NativeEvidenceRegistry,
  selectCiAcceptanceManifest,
  validateAcceptanceManifest,
} from '../scripts/release/acceptance-gate.mjs';
import {
  createPass71GrenadeNativeEvidenceFixture,
  pass71GrenadeNativeToolingHashes,
} from '../scripts/qa/pass71-grenade-native-receipt-contract.mjs';
import { createPass71Hf298CoverageFixture } from '../scripts/qa/pass71-hf298-coverage-contract.mjs';
import {
  createPass71StuckEvidenceFixture,
  pass71StuckEvidenceToolingHashes,
} from '../scripts/qa/pass71-stuck-evidence-contract.mjs';
import {
  createPass71NativeBrowserParityFixture,
  pass71NativeBrowserParityToolingHashesAtSource,
} from '../scripts/qa/pass71-native-browser-parity-contract.mjs';
import {
  createPass71QualityVisualEvidenceFixture,
  pass71QualityVisualToolingHashes,
} from '../scripts/qa/pass71-quality-visual-parity-contract.mjs';
import {
  createPass71Hf299EvidenceFixture,
  PASS71_HF299_TOOL_PATHS,
} from '../scripts/qa/pass71-hf299-thermal-operator-evidence-contract.mjs';

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

function pass71Manifest(tooling: Readonly<Record<string, string>>) {
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const manifest = acceptedManifest() as ReturnType<typeof acceptedManifest> & {
    nativeEvidence: Record<string, any>[];
  };
  manifest.releasePass = 'PASS 71';
  manifest.preview.ref = `pr-preview-71-${manifest.preview.sourceSha}`;
  manifest.humanAcceptance.evidence = 'Dave\'s standing conditional publication authorization is bound here; Dave did not inspect or test this immutable preview.';
  const requirement = manifest.requirements[0];
  requirement.evidence[1].ref = `artifact://candidate-a/pass71-linux-supplemental-pass71-nuke-warning-${manifest.preview.sourceSha}/artifacts/pass71/nuke-warning/active.png?sha256=${'a'.repeat(64)}&bytes=1`;
  manifest.requirements = Array.from({ length: 19 }, (_, index) => {
    const row = structuredClone(requirement) as typeof requirement & {
      feedbackId: string;
      deferApproval?: { approvedBy: string; approvedAt: string; reason: string };
    };
    row.id = `R${index + 1}`;
    row.feedbackId = index < 18 ? `HF-${296 + index}` : 'PUBLIC-REVIEW';
    row.summary = `Pass 71 owner outcome ${row.feedbackId}`;
    if (index === 18) row.acceptance = 'human';
    if (index === 18) {
      row.state = 'deferred';
      row.evidence = [];
      row.deferApproval = {
        approvedBy: 'Dave', approvedAt: manifest.humanAcceptance.approvedAt,
        reason: 'Synthetic unit fixture deferral; production requires the registered exact-A record.',
      };
    }
    return row;
  }) as typeof manifest.requirements;
  const stuckTooling = pass71StuckEvidenceToolingHashes(process.cwd());
  const stuck = createPass71StuckEvidenceFixture({ sourceSha: manifest.preview.sourceSha, tooling: stuckTooling });
  const parityTooling = pass71NativeBrowserParityToolingHashesAtSource(process.cwd(), headSha);
  const parity = createPass71NativeBrowserParityFixture({
    sourceSha: manifest.preview.sourceSha, tooling: parityTooling,
    startedAt: '2026-08-13T09:31:00.000Z', completedAt: '2026-08-13T09:50:00.000Z',
  });
  const qualityTooling = pass71QualityVisualToolingHashes(process.cwd());
  const quality = createPass71QualityVisualEvidenceFixture({
    sourceSha: manifest.preview.sourceSha, tooling: qualityTooling,
    startedAt: '2026-08-13T09:32:00.000Z', completedAt: '2026-08-13T09:40:00.000Z',
  });
  const hf299Tooling = PASS71_HF299_TOOL_PATHS.map((path) => ({
    path,
    sha256: createHash('sha256').update(readFileSync(join(process.cwd(), path))).digest('hex'),
  }));
  const hf299 = createPass71Hf299EvidenceFixture({
    sourceSha: manifest.preview.sourceSha, tooling: hf299Tooling,
    startedAt: '2026-08-13T09:34:00.000Z', completedAt: '2026-08-13T09:42:00.000Z',
  });
  manifest.preview.createdAt = '2026-08-13T09:00:00Z';
  manifest.humanAcceptance.approvedAt = '2026-08-13T10:00:00Z';
  for (const requirement of manifest.requirements) {
    if ('deferApproval' in requirement && requirement.deferApproval) {
      (requirement.deferApproval as { approvedAt: string }).approvedAt = manifest.humanAcceptance.approvedAt;
    }
  }
  const components = ([
    ['solo', 'webgl2'], ['solo', 'webgpu'], ['hosted', 'webgl2'], ['hosted', 'webgpu'],
  ] as const).map(([mode, renderer], index) => createPass71GrenadeNativeEvidenceFixture({
    sourceSha: manifest.preview.sourceSha, tooling, mode, renderer,
    startedAt: `2026-08-13T09:1${index}:00.000Z`, completedAt: `2026-08-13T09:2${index}:00.000Z`,
  }));
  const rebuilt = createPass71Hf298CoverageFixture({
    sourceSha: manifest.preview.sourceSha, tooling, components,
    finalizedAt: '2026-08-13T09:30:00.000Z',
  });
  manifest.nativeEvidence = [...rebuilt.components, rebuilt.record, quality, hf299, stuck, parity];
  return { manifest, coverage: rebuilt.record, components: rebuilt.components, quality, hf299 };
}

function pass71ValidationOptions(tooling: Readonly<Record<string, string>>) {
  const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return {
    policy, pass71NativeEvidenceTooling: tooling,
    pass71StuckEvidenceTooling: pass71StuckEvidenceToolingHashes(process.cwd()),
    pass71QualityVisualTooling: pass71QualityVisualToolingHashes(process.cwd()),
    pass71NativeBrowserParityTooling: pass71NativeBrowserParityToolingHashesAtSource(process.cwd(), headSha),
    pass71Hf299Tooling: PASS71_HF299_TOOL_PATHS.map((path) => ({
      path,
      sha256: createHash('sha256').update(readFileSync(join(process.cwd(), path))).digest('hex'),
    })),
  };
}

describe('release acceptance manifest', () => {
  it('exposes a strict static registration hook for later native evidence contracts', () => {
    const future = {
      descriptor: { evidenceId: 'HF-311', kind: 'pass71-native-parity', minimumCount: 0, maximumCount: 1 },
      validate: () => [],
    };
    expect(createPass71NativeEvidenceRegistry([future])).toHaveLength(3);
    expect(() => createPass71NativeEvidenceRegistry([{
      ...future,
      descriptor: { ...future.descriptor, unexpected: true },
    } as never])).toThrow(/registry entry is invalid/);
    expect(() => createPass71NativeEvidenceRegistry([future, future])).toThrow(/duplicated/);
  });

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

  it('rejects generic artifact references in Pass 71 verified evidence', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest } = pass71Manifest(tooling);
    manifest.requirements[2].evidence[1].ref = 'artifact://chooser/accepted.png';
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/candidate artifact reference has an invalid canonical shape/);
  }, 20_000);

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
    expect(classifyPreviewDelta([manifestPath, 'tests/e2e/atomic-acres.spec.ts'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, 'src/admission-debug-contract.test.ts'], manifestPath).ok).toBe(true);
    expect(classifyPreviewDelta([manifestPath, 'src/main.ts'], manifestPath)).toMatchObject({ ok: false });
    expect(classifyPreviewDelta([manifestPath, 'src/release-channels.ts'], manifestPath)).toMatchObject({ ok: false });
  });

  it('does not exempt a process-only CI delta that changes an enforced acceptance manifest', () => {
    expect(selectCiAcceptanceManifest('none', [])).toBeNull();
    expect(selectCiAcceptanceManifest('none', ['acceptance/pass-66.json'])).toBe('acceptance/pass-66.json');
    expect(() => selectCiAcceptanceManifest('none', ['acceptance/pass-65.json', 'acceptance/pass-66.json'])).toThrow(/found 2/);
    expect(() => selectCiAcceptanceManifest('full', [])).toThrow(/found 0/);
  });

  it('exports the exact selected manifest for provenance verification across passes', () => {
    expect(acceptanceWorkflowOutputs({
      ok: true,
      phase: 'ci',
      manifestPath: 'acceptance/pass-71.json',
      releasePass: 'PASS 71',
    })).toEqual({ manifest_selected: 'true', manifest_path: 'acceptance/pass-71.json' });
    expect(acceptanceWorkflowOutputs({
      ok: true,
      phase: 'ci',
      manifestPath: 'acceptance/pass-69.json',
      releasePass: 'PASS 69',
    })).toEqual({ manifest_selected: 'true', manifest_path: 'acceptance/pass-69.json' });
    expect(acceptanceWorkflowOutputs({ ok: true, phase: 'ci', exempt: true }))
      .toEqual({ manifest_selected: 'false', manifest_path: '' });
  });

  it('rejects a provenance manifest output that is not the selected release pass', () => {
    expect(() => acceptanceWorkflowOutputs({
      ok: true,
      phase: 'ci',
      manifestPath: 'acceptance/pass-69.json',
      releasePass: 'PASS 71',
    })).toThrow(/does not match releasePass/);
    expect(() => acceptanceWorkflowOutputs({
      ok: true,
      phase: 'ci',
      manifestPath: '../acceptance/pass-71.json',
      releasePass: 'PASS 71',
    })).toThrow(/invalid manifestPath/);
    expect(() => acceptanceWorkflowOutputs({ ok: false, phase: 'ci' }))
      .toThrow(/successful CI acceptance receipt/);
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

  it('requires the truthful standing-conditional, no-preview-inspection statement for Pass 71', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest } = pass71Manifest(tooling);
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .not.toMatch(/standing conditional|did not inspect or test/);

    manifest.humanAcceptance.evidence = 'Dave gave standing conditional publication authorization for this immutable preview.';
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n')).toMatch(/did not inspect or test/);

    manifest.humanAcceptance.evidence = 'Dave did not inspect this immutable preview; publication may proceed.';
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n')).toMatch(/standing conditional/);
  }, 30_000);

  it('requires canonical full-scope HF-298 coverage before R3 can be verified', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest, coverage, components } = pass71Manifest(tooling);
    const accepted = validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling));
    expect(accepted.errors.join('\n')).not.toMatch(/R3\/HF-298|HF-298 native|canonical HF-298/);
    expect(accepted.summary?.nativeEvidence).toContainEqual(expect.objectContaining({
      evidenceId: 'HF-298',
      kind: 'pass71-hf298-full-scope-coverage',
      receiptSha256: coverage.receiptSha256,
      finalizedAt: coverage.finalizedAt,
    }));

    manifest.nativeEvidence = [components[1]];
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/verified R3\/HF-298 requires all four/);
    manifest.nativeEvidence = [components[0]];
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/retain the canonical HF-298 solo\/WebGPU component/);
    manifest.nativeEvidence = [...components, coverage, coverage];
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/record count must be 0\.\.1/);
    manifest.nativeEvidence = [...components, coverage, {
      evidenceId: 'HF-FUTURE', kind: 'unregistered-component', schemaVersion: 1,
    } as never];
    const unregistered = validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling));
    expect(unregistered.errors.join('\n')).toMatch(/no registered evidence validator/);
    manifest.nativeEvidence = [...components, coverage];
    (manifest.requirements[2] as unknown as { feedbackId: string }).feedbackId = 'HF-UNKNOWN';
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/R3\.feedbackId must be HF-298/);
  }, 20_000);

  it('freezes the eighteen owner outcomes plus one deferred public review', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest } = pass71Manifest(tooling);
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .not.toMatch(/exactly R1\.\.R19|R[1-9][0-9]?\/HF-[0-9]+ must be mechanically verified/);

    manifest.requirements.pop();
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/exactly R1\.\.R19/);

    const { manifest: mislabeled } = pass71Manifest(tooling);
    (mislabeled.requirements[7] as unknown as { feedbackId: string }).feedbackId = 'HF-999';
    expect(validateAcceptanceManifest(mislabeled, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/R8\.feedbackId must be HF-303/);

    const { manifest: prematureReview } = pass71Manifest(tooling);
    prematureReview.requirements[18].state = 'verified';
    expect(validateAcceptanceManifest(prematureReview, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/R19 must be the deferred PUBLIC-REVIEW human requirement/);

    const { manifest: deferredOwnerOutcome } = pass71Manifest(tooling);
    deferredOwnerOutcome.requirements[7].state = 'deferred';
    (deferredOwnerOutcome.requirements[7] as unknown as { deferApproval: unknown }).deferApproval = {
      approvedBy: 'Dave', approvedAt: deferredOwnerOutcome.humanAcceptance.approvedAt,
      reason: 'Synthetic attempted deferral.',
    };
    expect(validateAcceptanceManifest(deferredOwnerOutcome, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/R8\/HF-303 must be mechanically verified before publication/);
  }, 20_000);

  it('cannot use the representative HF-297 arms component as closing evidence', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest } = pass71Manifest(tooling);
    manifest.requirements[1].state = 'verified';
    delete (manifest.requirements[1] as unknown as { deferApproval?: unknown }).deferApproval;
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/representative non-closing component: hf297-closing-evidence-required/);
  }, 20_000);

  it('requires the exact-camera native Quality record before HF-303 can be verified', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest, quality } = pass71Manifest(tooling);
    const accepted = validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling));
    expect(accepted.errors.join('\n')).not.toMatch(/verified R8\/HF-303|hf303-/);

    manifest.nativeEvidence = manifest.nativeEvidence.filter((record) => record !== quality);
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/verified R8\/HF-303 requires its canonical registered native evidence record/);

    manifest.nativeEvidence.push(structuredClone(quality));
    (manifest.nativeEvidence.at(-1)?.captures?.[0]?.png as { base64: string }).base64 = 'not-a-png';
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/nativeEvidence\[[0-9]+\]: (?:capture-pass70-webgl2-png|receipt-sha256)/);
  }, 30_000);

  it('requires exact bot and remote M14/Railgun thermal attribution before HF-299 can be verified', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest, hf299 } = pass71Manifest(tooling);
    const accepted = validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling));
    expect(accepted.errors.join('\n')).not.toMatch(/verified R4\/HF-299|hf299-/);

    manifest.nativeEvidence = manifest.nativeEvidence.filter((record) => record !== hf299);
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/verified R4\/HF-299 requires its canonical registered native evidence record/);

    const forged = structuredClone(hf299);
    forged.scopes[0].occluded.reveal.throughGeometry = false;
    manifest.nativeEvidence.push(forged);
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/nativeEvidence\[[0-9]+\]: (?:scope:bot:webgl2:m14-ebr:semantics|receipt-sha256)/);
  }, 30_000);

  it('orders every HF-298 component and coverage finalization between preview and approval', () => {
    const tooling = pass71GrenadeNativeToolingHashes(process.cwd());
    const { manifest, components } = pass71Manifest(tooling);
    const beforePreview = createPass71GrenadeNativeEvidenceFixture({
      sourceSha: manifest.preview.sourceSha,
      tooling,
      mode: 'solo',
      renderer: 'webgl2',
      startedAt: '2026-08-13T08:59:59.000Z',
    });
    manifest.nativeEvidence[0] = beforePreview;
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/startedAt cannot precede preview/);

    const afterApproval = createPass71GrenadeNativeEvidenceFixture({
      sourceSha: manifest.preview.sourceSha,
      tooling,
      mode: 'hosted',
      renderer: 'webgpu',
      startedAt: '2026-08-13T09:40:00.000Z',
      completedAt: '2026-08-13T10:00:00.001Z',
    });
    const { record: afterCoverage } = createPass71Hf298CoverageFixture({
      sourceSha: manifest.preview.sourceSha,
      tooling,
      components: [...components.slice(0, 3), afterApproval],
      finalizedAt: '2026-08-13T10:00:00.002Z',
    });
    const retained = manifest.nativeEvidence.slice(-4);
    manifest.nativeEvidence = [...components.slice(0, 3), afterApproval, afterCoverage, ...retained];
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/completedAt cannot follow humanAcceptance/);
    expect(validateAcceptanceManifest(manifest, pass71ValidationOptions(tooling)).errors.join('\n'))
      .toMatch(/finalizedAt cannot follow humanAcceptance/);
  }, 20_000);

  it('permits only the Pass 71 manifest in candidate B after immutable candidate A', () => {
    const manifestPath = 'acceptance/pass-71.json';
    const sha = 'a'.repeat(40);
    expect(classifyPreviewDelta([manifestPath], manifestPath, sha)).toMatchObject({ ok: true });
    for (const path of [
      'docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md',
      'scripts/release/acceptance-gate.mjs',
      'scripts/qa/pass71-grenade-native-receipt-contract.mjs',
      'tests/e2e/pass71-grenade-first-action.spec.ts',
    ]) expect(classifyPreviewDelta([manifestPath, path], manifestPath, sha), path).toMatchObject({ ok: false });
    expect(classifyPreviewDelta([], manifestPath, sha)).toMatchObject({ ok: false });
  });

  it('leaves exactly the owner-approval error on a complete pre-HITL manifest', () => {
    const manifest = acceptedManifest();
    delete (manifest as { humanAcceptance?: unknown }).humanAcceptance;
    const result = validateAcceptanceManifest(manifest, { policy });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(['humanAcceptance must be approved by Dave with timestamped evidence']);
  });
});
