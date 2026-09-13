#!/usr/bin/env node
/**
 * Receipt for a release-VERIFICATION run. It must never look like a publication receipt.
 *
 * `.github/workflows/release-production.yml` no longer publishes (Lane AD, PASS 87): every
 * pass since 74 ships through `scripts/orchestration/publish_pass<N>.py`, and the workflow's
 * old `gh-pages -d dist` step would have replaced the HF-400 two-channel gh-pages tree with
 * six retired channels. What the workflow still does is prove an exact main SHA is
 * publishable, so its receipt records exactly that and says, in its own fields, that nothing
 * was published and which command does the publishing.
 *
 * `write-production-receipt.mjs` remains the schema-3 envelope for a run that DID publish -
 * it requires a Pages build and a post-Pages live smoke and throws without them, which is
 * why it cannot be reused here.
 */
import { readFileSync, writeFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function durationMs(start, end) {
  const value = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid receipt timestamps: ${start} -> ${end}`);
  return value;
}

export function buildVerificationReceipt(input) {
  const { sourceSha, releasePass, releaseStartedAt, releaseBuiltAt, workflowRun, topology, acceptance, policy } = input;
  if (!/^[0-9a-f]{40}$/.test(sourceSha ?? '')) throw new Error('SOURCE_SHA must be one exact 40-character Git SHA');
  if (topology.sourceSha !== sourceSha || topology.releasePass !== releasePass) throw new Error('Topology identity mismatch');
  if (!acceptance.ok || (acceptance.releasePass && acceptance.releasePass !== releasePass)) throw new Error('Acceptance receipt mismatch');
  if (policy.ok !== true) throw new Error(`HF-400 two-channel policy not satisfied: ${(policy.errors ?? []).join('; ')}`);
  return {
    schemaVersion: 1,
    kind: 'release-verification',
    published: false,
    publishCommand: `python scripts/orchestration/publish_pass${policy.live.replace(/^pass/u, '')}.py`,
    sourceSha,
    releasePass,
    releaseStartedAt,
    releaseBuiltAt,
    workflowRun,
    durations: { startToBuildMs: durationMs(releaseStartedAt, releaseBuiltAt) },
    twoChannelPolicy: policy,
    acceptance,
    topology,
  };
}

if (process.argv[1]?.endsWith('write-verification-receipt.mjs')) {
  const receipt = buildVerificationReceipt({
    sourceSha: process.env.SOURCE_SHA,
    releasePass: process.env.RELEASE_PASS,
    releaseStartedAt: process.env.RELEASE_STARTED_AT,
    releaseBuiltAt: process.env.RELEASE_BUILT_AT,
    workflowRun: process.env.GITHUB_RUN_ID,
    topology: readJson('artifacts/pipeline/release-topology.json'),
    acceptance: readJson('artifacts/pipeline/acceptance-coverage.json'),
    policy: readJson('artifacts/pipeline/two-channel-policy.json'),
  });
  writeFileSync('artifacts/pipeline/release-verification-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}
