import { describe, expect, it } from 'vitest';
import { classifyPreviewDelta, validateAcceptanceManifest } from '../scripts/release/acceptance-gate.mjs';

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
    expect(classifyPreviewDelta([manifestPath, 'src/main.ts'], manifestPath)).toMatchObject({ ok: false });
    expect(classifyPreviewDelta([manifestPath, 'src/release-channels.ts'], manifestPath)).toMatchObject({ ok: false });
  });

  it('rejects an artifact reference that does not match the approved source SHA', () => {
    const manifest = acceptedManifest();
    manifest.preview.ref = `pr-preview-1-${'f'.repeat(40)}`;
    const result = validateAcceptanceManifest(manifest, { policy });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/match preview.sourceSha/);
  });
});
