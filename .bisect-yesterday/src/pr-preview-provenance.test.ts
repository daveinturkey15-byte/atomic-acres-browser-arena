import { describe, expect, it } from 'vitest';
import {
  computePreviewTree,
  inspectPreviewArtifactZip,
  parsePreviewManifest,
  selectPreviewManifestFromAcceptanceReceipt,
  verifyPreviewProvenance,
  verifyPreviewProvenanceFromAcceptanceReceipt,
  type PreviewIdentity,
} from '../scripts/release/verify-pr-preview-provenance.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const REPOSITORY = 'owner/repository';
const API_BASE = 'https://api.example.test';
const PREVIEW_CREATED_AT = '2026-07-30T03:00:00Z';
const NOW = new Date('2026-07-30T04:00:00Z');
const ARTIFACT_NAME = `pr-preview-41-${SOURCE_SHA}`;
const MANIFEST_SHA256 = 'c'.repeat(64);
const encoder = new TextEncoder();

function acceptedManifest() {
  return {
    schemaVersion: 1,
    releasePass: 'PASS 66',
    feedbackReceivedAt: '2026-07-30T01:09:31Z',
    status: 'accepted',
    preview: {
      kind: 'github-actions-artifact',
      ref: ARTIFACT_NAME,
      sourceSha: SOURCE_SHA,
      createdAt: PREVIEW_CREATED_AT,
    },
    humanAcceptance: {
      state: 'approved',
      approvedBy: 'Dave',
      approvedAt: '2026-07-30T03:30:00Z',
      evidence: 'Dave\'s standing conditional publication instruction is bound after preview creation; Dave did not inspect or test this immutable preview.',
    },
    requirements: [{
      id: 'R1',
      summary: 'Preview provenance is exact',
      expected: 'The immutable preview bytes match their receipt.',
      falsifier: 'The artifact identity or bytes differ.',
      acceptance: 'mechanical',
      state: 'verified',
      evidence: [{
        kind: 'unit',
        ref: 'src/acceptance-gate.test.ts',
        command: 'vitest run src/acceptance-gate.test.ts',
        note: 'Exercises the release acceptance contract.',
      }],
    }],
  };
}

let crcTable: number[] | undefined;
function crc32(bytes: Uint8Array) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

type ZipInput = Readonly<{ name: string; bytes: Uint8Array }>;

function storedZip(inputs: readonly ZipInput[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const input of inputs) {
    const name = Buffer.from(input.name, 'utf8');
    const bytes = Buffer.from(input.bytes);
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, bytes);
    centrals.push(central, name);
    offset += local.length + name.length + bytes.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(inputs.length, 8);
  eocd.writeUInt16LE(inputs.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

const distFiles = [
  { path: 'assets/game.js', bytes: encoder.encode('console.log("pass66")') },
  { path: 'index.html', bytes: encoder.encode('<main>The Big One</main>') },
];

function embeddedReceipt(overrides: Record<string, unknown> = {}) {
  const tree = computePreviewTree(distFiles);
  return {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    pullRequest: 41,
    createdAt: PREVIEW_CREATED_AT,
    artifactName: ARTIFACT_NAME,
    fileCount: tree.fileCount,
    treeSha256: tree.treeSha256,
    ...overrides,
  };
}

function previewZip(options: Readonly<{
  receipt?: unknown;
  receiptBytes?: Uint8Array;
  files?: readonly ZipInput[];
}> = {}) {
  const files = options.files ?? distFiles.map((file) => ({ name: `dist/${file.path}`, bytes: file.bytes }));
  const receipt = options.receipt ?? embeddedReceipt();
  return storedZip([
    ...files,
    {
      name: 'artifacts/pipeline/pr-preview.json',
      bytes: options.receiptBytes ?? encoder.encode(JSON.stringify(receipt)),
    },
  ]);
}

function artifact(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: ARTIFACT_NAME,
    expired: false,
    created_at: '2026-07-30T03:01:00Z',
    expires_at: '2026-08-01T03:01:00Z',
    archive_download_url: `${API_BASE}/repos/${REPOSITORY}/actions/artifacts/${id}/zip`,
    workflow_run: {
      id: 800 + id,
      head_sha: SOURCE_SHA,
      repository_id: 123,
      head_repository_id: 123,
    },
    ...overrides,
  };
}

function mockFetch(
  artifacts: readonly Record<string, unknown>[],
  archives: ReadonlyMap<number, Uint8Array>,
  workflowRunOverrides: ReadonlyMap<number, Record<string, unknown>> = new Map(),
) {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === `/repos/${REPOSITORY}/actions/artifacts`) {
      expect(url.searchParams.get('name')).toBe(ARTIFACT_NAME);
      return Response.json({ total_count: artifacts.length, artifacts });
    }
    const runMatch = new RegExp(`^/repos/${REPOSITORY}/actions/runs/([1-9][0-9]*)$`).exec(url.pathname);
    if (runMatch) {
      const runId = Number(runMatch[1]);
      const sourceArtifact = artifacts.find((candidate) => {
        const workflowRun = candidate.workflow_run as { id?: number } | undefined;
        return workflowRun?.id === runId;
      });
      if (!sourceArtifact) return new Response('missing', { status: 404 });
      const workflowRun = sourceArtifact.workflow_run as { head_sha: string };
      return Response.json({
        id: runId,
        head_sha: workflowRun.head_sha,
        event: 'pull_request',
        path: '.github/workflows/verify.yml',
        repository: { full_name: REPOSITORY },
        head_repository: { full_name: REPOSITORY },
        ...workflowRunOverrides.get(runId),
      });
    }
    const match = new RegExp(`^/repos/${REPOSITORY}/actions/artifacts/([1-9][0-9]*)/zip$`).exec(url.pathname);
    if (match) {
      const bytes = archives.get(Number(match[1]));
      if (!bytes) return new Response('missing', { status: 404 });
      const body = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(body).set(bytes);
      return new Response(body, {
        status: 200,
        headers: { 'content-length': String(bytes.byteLength), 'content-type': 'application/zip' },
      });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

function verify(
  artifacts: readonly Record<string, unknown>[],
  archives: ReadonlyMap<number, Uint8Array>,
  manifest = acceptedManifest(),
  workflowRunOverrides: ReadonlyMap<number, Record<string, unknown>> = new Map(),
) {
  return verifyPreviewProvenance({
    repositoryRoot: process.cwd(),
    manifest,
    repository: REPOSITORY,
    token: 'unit-test-token',
    apiBase: API_BASE,
    now: NOW,
    fetchImpl: mockFetch(artifacts, archives, workflowRunOverrides),
  });
}

function identity(): PreviewIdentity {
  return parsePreviewManifest(acceptedManifest());
}

function pinnedManifest(overrides: Record<string, unknown> = {}) {
  const manifest = acceptedManifest();
  const tree = computePreviewTree(distFiles);
  Object.assign(manifest.preview, {
    artifactId: 1,
    fileCount: tree.fileCount,
    treeSha256: tree.treeSha256,
    ...overrides,
  });
  return manifest;
}

function acceptanceReceipt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    ok: true,
    phase: 'ci',
    impact: 'full',
    manifestPath: 'acceptance/pass-72.json',
    manifestSha256: MANIFEST_SHA256,
    headSha: SOURCE_SHA,
    releasePass: 'PASS 72',
    errors: [],
    approvalParity: { ok: true, paths: [], reason: 'only process/acceptance paths changed after preview' },
    ...overrides,
  };
}

describe('acceptance-receipt preview selector', () => {
  it('selects the one manifest already validated by the acceptance gate', () => {
    expect(selectPreviewManifestFromAcceptanceReceipt(acceptanceReceipt())).toEqual({
      exempt: false,
      manifestPath: 'acceptance/pass-72.json',
      manifestSha256: MANIFEST_SHA256,
      headSha: SOURCE_SHA,
      releasePass: 'PASS 72',
    });
  });

  it('skips GitHub access only for the exact green process-only exemption', async () => {
    const receipt = {
      schemaVersion: 1,
      ok: true,
      phase: 'ci',
      impact: 'none',
      exempt: true,
      reason: 'process-only with no enforced pass manifest change',
    };
    await expect(verifyPreviewProvenanceFromAcceptanceReceipt({
      acceptanceReceipt: receipt,
      fetchImpl: (async () => { throw new Error('must not access GitHub'); }) as typeof fetch,
    })).resolves.toMatchObject({
      ok: true,
      exempt: true,
      kind: 'pr-preview-provenance-exempt',
    });
  });

  it.each([
    ['failed gate', acceptanceReceipt({ ok: false }), /must be green/],
    ['wrong phase', acceptanceReceipt({ phase: 'release' }), /phase must be ci/],
    ['unsafe path', acceptanceReceipt({ manifestPath: '../acceptance/pass-72.json' }), /manifestPath must be exactly/],
    ['pass mismatch', acceptanceReceipt({ releasePass: 'PASS 71' }), /does not match releasePass/],
    ['bad manifest digest', acceptanceReceipt({ manifestSha256: 'nope' }), /manifestSha256/],
    ['failed parity', acceptanceReceipt({ approvalParity: { ok: false } }), /approvalParity must be green/],
    ['near exemption', {
      schemaVersion: 1,
      ok: true,
      phase: 'ci',
      impact: 'none',
      exempt: true,
      reason: 'process-only, probably safe',
    }, /exact process-only acceptance exemption/],
    ['exemption with unrecognized state', {
      schemaVersion: 1,
      ok: true,
      phase: 'ci',
      impact: 'none',
      exempt: true,
      reason: 'process-only with no enforced pass manifest change',
      errors: [],
    }, /exact process-only acceptance exemption/],
  ])('rejects %s instead of selecting or skipping provenance', (_label, receipt, expected) => {
    expect(() => selectPreviewManifestFromAcceptanceReceipt(receipt)).toThrow(expected);
  });
});

describe('Pass 66 immutable preview provenance', () => {
  it('binds the manifest, workflow head, embedded receipt, and recomputed dist bytes', async () => {
    const zip = previewZip();
    const result = await verify([artifact(1)], new Map([[1, zip]]));
    expect(result).toMatchObject({
      ok: true,
      artifactId: 1,
      artifactName: ARTIFACT_NAME,
      sourceSha: SOURCE_SHA,
      pullRequest: 41,
      fileCount: 2,
      exactNameArtifactCount: 1,
      matchingLiveArtifactCount: 1,
    });
  });

  it('binds optional manifest artifact pins to the exact artifact and recomputed dist tree', async () => {
    const zip = previewZip();
    await expect(verify([artifact(1)], new Map([[1, zip]]), pinnedManifest()))
      .resolves.toMatchObject({ ok: true, artifactId: 1, fileCount: 2 });

    await expect(verify([artifact(1)], new Map([[1, zip]]), pinnedManifest({ artifactId: 2 })))
      .rejects.toThrow(/does not match manifest preview\.artifactId 2/);
    await expect(verify([artifact(1)], new Map([[1, zip]]), pinnedManifest({ fileCount: 99 })))
      .rejects.toThrow(/manifest preview\.fileCount 99 does not match/);
    await expect(verify([artifact(1)], new Map([[1, zip]]), pinnedManifest({ treeSha256: '0'.repeat(64) })))
      .rejects.toThrow(/manifest preview\.treeSha256 .* does not match/);
  });

  it('requires all exact manifest pins together and uses artifactId to resolve same-name reruns', async () => {
    const incomplete = acceptedManifest();
    Object.assign(incomplete.preview, { artifactId: 1 });
    expect(() => parsePreviewManifest(incomplete)).toThrow(/preview\.fileCount must be a positive safe integer/);

    const zip = previewZip();
    await expect(verify(
      [artifact(1), artifact(2)],
      new Map([[1, zip], [2, zip]]),
      pinnedManifest({ artifactId: 2 }),
    )).resolves.toMatchObject({ ok: true, artifactId: 2, exactNameArtifactCount: 2, matchingLiveArtifactCount: 1 });
  });

  it('follows the signed archive redirect without forwarding the GitHub token', async () => {
    const metadata = artifact(1);
    const zip = previewZip();
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === `/repos/${REPOSITORY}/actions/artifacts`) {
        return Response.json({ total_count: 1, artifacts: [metadata] });
      }
      if (url.pathname === `/repos/${REPOSITORY}/actions/runs/801`) {
        return Response.json({
          id: 801,
          head_sha: SOURCE_SHA,
          event: 'pull_request',
          path: '.github/workflows/verify.yml',
          repository: { full_name: REPOSITORY },
          head_repository: { full_name: REPOSITORY },
        });
      }
      if (url.pathname === `/repos/${REPOSITORY}/actions/artifacts/1/zip`) {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer unit-test-token');
        return new Response(null, { status: 302, headers: { location: 'https://objects.example.test/archive.zip?signature=fake' } });
      }
      if (url.origin === 'https://objects.example.test') {
        expect(new Headers(init?.headers).get('authorization')).toBeNull();
        const body = new ArrayBuffer(zip.byteLength);
        new Uint8Array(body).set(zip);
        return new Response(body, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;
    await expect(verifyPreviewProvenance({
      repositoryRoot: process.cwd(),
      manifest: acceptedManifest(),
      repository: REPOSITORY,
      token: 'unit-test-token',
      apiBase: API_BASE,
      now: NOW,
      fetchImpl,
    })).resolves.toMatchObject({ ok: true, artifactId: 1 });
  });

  it('rejects an invalid acceptance manifest before making a GitHub request', async () => {
    const manifest = acceptedManifest();
    manifest.requirements[0].evidence = [];
    let calls = 0;
    await expect(verifyPreviewProvenance({
      repositoryRoot: process.cwd(),
      manifest,
      repository: REPOSITORY,
      token: 'unit-test-token',
      apiBase: API_BASE,
      now: NOW,
      fetchImpl: (async () => { calls += 1; return Response.json({}); }) as typeof fetch,
    })).rejects.toThrow(/acceptance manifest is invalid/);
    expect(calls).toBe(0);
  });

  it.each([
    ['ref SHA', { ref: `pr-preview-41-${OTHER_SHA}` }, /sourceSha must exactly match/],
    ['zero PR', { ref: `pr-preview-0-${SOURCE_SHA}` }, /preview\.ref must be exactly/],
    ['artifact name', { ref: `preview-41-${SOURCE_SHA}` }, /preview\.ref must be exactly/],
  ])('rejects a malformed manifest %s identity', (_label, preview, expected) => {
    const manifest = acceptedManifest();
    Object.assign(manifest.preview, preview);
    expect(() => parsePreviewManifest(manifest)).toThrow(expected);
  });

  it('rejects wrong workflow heads, fork-origin workflows, and expired artifacts', async () => {
    await expect(verify([artifact(1, {
      workflow_run: { id: 801, head_sha: OTHER_SHA, repository_id: 123, head_repository_id: 123 },
    })], new Map([[1, previewZip()]]))).rejects.toThrow(/workflow head/);
    await expect(verify([artifact(1, {
      workflow_run: { id: 801, head_sha: SOURCE_SHA, repository_id: 123, head_repository_id: 456 },
    })], new Map([[1, previewZip()]]))).rejects.toThrow(/head repository/);
    await expect(verify([artifact(1, { expired: true })], new Map([[1, previewZip()]]))).rejects.toThrow(/marked expired/);
  });

  it.each([
    ['workflow path', { path: '.github/workflows/release-production.yml' }, /did not use .*verify\.yml/],
    ['event', { event: 'workflow_dispatch' }, /was not a pull_request event/],
    ['head SHA', { head_sha: OTHER_SHA }, /head_sha does not match/],
  ])('rejects a canonical-run lookup with the wrong %s', async (_label, runOverride, expected) => {
    await expect(verify(
      [artifact(1)],
      new Map([[1, previewZip()]]),
      acceptedManifest(),
      new Map([[801, runOverride]]),
    )).rejects.toThrow(expected);
  });

  it.each([
    ['source SHA', { sourceSha: OTHER_SHA }, /sourceSha does not match/],
    ['pull request', { pullRequest: 42 }, /pullRequest does not match/],
    ['artifact name', { artifactName: `pr-preview-42-${SOURCE_SHA}` }, /artifactName does not match/],
    ['createdAt', { createdAt: '2026-07-30T03:00:01Z' }, /createdAt does not exactly match/],
  ])('rejects an embedded receipt with the wrong %s', async (_label, overrides, expected) => {
    const zip = previewZip({ receipt: embeddedReceipt(overrides) });
    await expect(verify([artifact(1)], new Map([[1, zip]]))).rejects.toThrow(expected);
  });

  it('rejects malformed receipts and recomputed file-count or tree-digest drift', async () => {
    const malformed = previewZip({ receiptBytes: encoder.encode('{not-json') });
    await expect(verify([artifact(1)], new Map([[1, malformed]]))).rejects.toThrow(/not valid UTF-8 JSON/);

    const badCount = previewZip({ receipt: embeddedReceipt({ fileCount: 99 }) });
    await expect(verify([artifact(1)], new Map([[1, badCount]]))).rejects.toThrow(/fileCount 99 does not match/);

    const badDigest = previewZip({ receipt: embeddedReceipt({ treeSha256: '0'.repeat(64) }) });
    await expect(verify([artifact(1)], new Map([[1, badDigest]]))).rejects.toThrow(/treeSha256 .* does not match/);
  });

  it('rejects traversal and duplicate ZIP paths before digesting them', () => {
    const traversal = previewZip({
      files: [{ name: 'dist/../escape.txt', bytes: encoder.encode('escape') }],
    });
    expect(() => inspectPreviewArtifactZip(traversal, identity())).toThrow(/path is unsafe/);

    const duplicate = previewZip({
      files: [
        { name: 'dist/index.html', bytes: encoder.encode('one') },
        { name: 'dist/index.html', bytes: encoder.encode('two') },
      ],
    });
    expect(() => inspectPreviewArtifactZip(duplicate, identity())).toThrow(/duplicate ZIP entry path/);
  });

  it('allows only the workflow-owned acceptance auxiliaries outside dist and the receipt', () => {
    const allowed = previewZip({
      files: [
        ...distFiles.map((file) => ({ name: `dist/${file.path}`, bytes: file.bytes })),
        { name: 'acceptance/pass-63.json', bytes: encoder.encode('{"releasePass":"PASS 63"}') },
      ],
    });
    expect(inspectPreviewArtifactZip(allowed, identity())).toMatchObject({ fileCount: 2 });

    const unexpected = previewZip({
      files: [
        ...distFiles.map((file) => ({ name: `dist/${file.path}`, bytes: file.bytes })),
        { name: 'acceptance/notes.txt', bytes: encoder.encode('not workflow-owned') },
      ],
    });
    expect(() => inspectPreviewArtifactZip(unexpected, identity())).toThrow(/unexpected file/);
  });

  it('rejects malformed or mismatched GitHub archive digests', async () => {
    const zip = previewZip();
    await expect(verify([artifact(1, { digest: 'sha256:not-a-digest' })], new Map([[1, zip]])))
      .rejects.toThrow(/digest is malformed/);
    await expect(verify([artifact(1, { digest: `sha256:${'0'.repeat(64)}` })], new Map([[1, zip]])))
      .rejects.toThrow(/GitHub digest does not match/);
  });

  it('accepts the GitHub archive digest when it matches the downloaded ZIP bytes', async () => {
    const zip = previewZip();
    const digest = await crypto.subtle.digest('SHA-256', zip);
    const hex = Buffer.from(digest).toString('hex');
    await expect(verify([artifact(1, { digest: `sha256:${hex}` })], new Map([[1, zip]])))
      .resolves.toMatchObject({ ok: true, githubArtifactDigest: `sha256:${hex}` });
  });

  it('fails on two exact valid artifacts instead of silently choosing the newest', async () => {
    const zip = previewZip();
    await expect(verify([artifact(1), artifact(2)], new Map([[1, zip], [2, zip]])))
      .rejects.toThrow(/ambiguous preview provenance/);
  });

  it('can single out one exact artifact when another same-name archive proves a different receipt time', async () => {
    const wrong = previewZip({ receipt: embeddedReceipt({ createdAt: '2026-07-30T03:00:01Z' }) });
    const exact = previewZip();
    await expect(verify([artifact(1), artifact(2)], new Map([[1, wrong], [2, exact]])))
      .resolves.toMatchObject({ ok: true, artifactId: 2, exactNameArtifactCount: 2, matchingLiveArtifactCount: 2 });
  });
});
