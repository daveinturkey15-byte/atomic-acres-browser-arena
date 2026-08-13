import { describe, expect, it } from 'vitest';
import {
  PASS71_CANDIDATE_A_REQUIRED_SUCCESS_JOBS,
  computePreviewTree,
  inspectPass71CandidateAAcceptanceArtifactZip,
  inspectPreviewArtifactZip,
  parsePreviewManifest,
  validatePass71CandidateAWorkflowJobs,
  validatePass71MissingManifestLog,
  verifyPreviewProvenance,
  type PreviewIdentity,
} from '../scripts/release/verify-pr-preview-provenance.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const REPOSITORY = 'owner/repository';
const API_BASE = 'https://api.example.test';
const PREVIEW_CREATED_AT = '2026-07-30T03:00:00Z';
const NOW = new Date('2026-07-30T04:00:00Z');
const ARTIFACT_NAME = `pr-preview-41-${SOURCE_SHA}`;
const encoder = new TextEncoder();
const MISSING_PASS71_MANIFEST = 'runtime/release-shell or acceptance-finalizer changes must add or update exactly one enforced pass manifest; found 0';

function pass71CandidateAJobs(overrides: Readonly<Record<string, string>> = {}) {
  const jobs: Array<{
    id: number;
    name: string;
    status: string;
    conclusion: string;
    run_attempt: number;
    steps: Array<{ name: string; conclusion: string }>;
  }> = PASS71_CANDIDATE_A_REQUIRED_SUCCESS_JOBS.map((name, index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion: overrides[name] ?? 'success',
    run_attempt: 1,
    steps: [],
  }));
  jobs.push({
    id: 10_000,
    name: 'requirements-acceptance',
    status: 'completed',
    conclusion: overrides['requirements-acceptance'] ?? 'failure',
    run_attempt: 1,
    steps: overrides['requirements-step'] === 'predecessor'
      ? [{ name: 'Require static and supplemental browser predecessors', conclusion: 'failure' }]
      : [
        { name: 'Require static and supplemental browser predecessors', conclusion: 'success' },
        { name: 'Verify complete requirement-to-evidence coverage and exact preview approval', conclusion: 'failure' },
        { name: 'Upload acceptance coverage receipt', conclusion: 'success' },
      ],
  });
  return jobs;
}

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

describe('Pass 71 candidate A workflow provenance', () => {
  it('requires the exact green static, broad and sharded browser topology with only requirements red', () => {
    expect(validatePass71CandidateAWorkflowJobs(pass71CandidateAJobs())).toMatchObject({
      id: 10_000,
      name: 'requirements-acceptance',
      conclusion: 'failure',
    });
  });

  it.each([
    'static-and-unit (ubuntu-latest)',
    'bounded-browser-windows',
    'bounded-browser-windows-supplemental-shard (pass71-grenade-first-action)',
    'bounded-browser-linux-supplemental-shard (pass71-glass-performance-crossbow)',
    'bounded-browser-linux-supplemental',
  ])('rejects a non-green required candidate A job: %s', (name) => {
    expect(() => validatePass71CandidateAWorkflowJobs(pass71CandidateAJobs({ [name]: 'failure' })))
      .toThrow(/not green|additional non-green/);
  });

  it('rejects requirements failure in the predecessor guard rather than the manifest gate', () => {
    expect(() => validatePass71CandidateAWorkflowJobs(pass71CandidateAJobs({
      'requirements-step': 'predecessor',
    }))).toThrow(/did not fail solely in the acceptance-manifest step/);
  });

  it('rejects any additional failed workflow job even when the named topology is green', () => {
    const jobs = [...pass71CandidateAJobs(), {
      id: 20_000, name: 'future-required-check', status: 'completed', conclusion: 'failure', run_attempt: 1, steps: [],
    }];
    expect(() => validatePass71CandidateAWorkflowJobs(jobs)).toThrow(/additional non-green job/);
  });

  it('requires exactly one canonical missing-manifest error in the exact requirements job log', () => {
    expect(validatePass71MissingManifestLog(`before\n${MISSING_PASS71_MANIFEST}\nafter`)).toBe(true);
    expect(() => validatePass71MissingManifestLog('Process completed with exit code 1'))
      .toThrow(/exactly one canonical missing-manifest failure/);
    expect(() => validatePass71MissingManifestLog(`${MISSING_PASS71_MANIFEST}\n${MISSING_PASS71_MANIFEST}`))
      .toThrow(/exactly one canonical missing-manifest failure/);
  });

  it('accepts only the exact machine-readable missing-manifest coverage receipt', () => {
    const receipt = {
      schemaVersion: 1,
      ok: false,
      phase: 'ci',
      impact: 'full',
      errors: [MISSING_PASS71_MANIFEST],
    };
    const archive = storedZip([{
      name: 'acceptance-coverage.json',
      bytes: encoder.encode(`${JSON.stringify(receipt)}\n`),
    }]);
    expect(inspectPass71CandidateAAcceptanceArtifactZip(archive)).toEqual(receipt);
    for (const invalid of [
      { ...receipt, errors: [MISSING_PASS71_MANIFEST, 'another semantic failure'] },
      { ...receipt, errors: [] },
      { ...receipt, ok: true },
      { ...receipt, headSha: SOURCE_SHA },
    ]) {
      const invalidArchive = storedZip([{
        name: 'acceptance-coverage.json',
        bytes: encoder.encode(JSON.stringify(invalid)),
      }]);
      expect(() => inspectPass71CandidateAAcceptanceArtifactZip(invalidArchive))
        .toThrow(/receipt|errors|identity|schema/);
    }
    const extraFile = storedZip([
      { name: 'acceptance-coverage.json', bytes: encoder.encode(JSON.stringify(receipt)) },
      { name: 'extra.json', bytes: encoder.encode('{}') },
    ]);
    expect(() => inspectPass71CandidateAAcceptanceArtifactZip(extraFile)).toThrow(/contain only/);
  });

  it('rejects rerun-attempt jobs explicitly instead of mixing attempts', () => {
    const jobs = pass71CandidateAJobs();
    jobs[0] = { ...jobs[0], run_attempt: 2 };
    expect(() => validatePass71CandidateAWorkflowJobs(jobs)).toThrow(/required attempt 1/);
  });
});
