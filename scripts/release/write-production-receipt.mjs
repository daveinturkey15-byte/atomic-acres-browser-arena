#!/usr/bin/env node
//
// INTENTIONALLY DORMANT (Lane AD, PASS 87). Nothing invokes this module any more: the
// production workflow became verification-only and writes a `published: false` receipt
// through scripts/release/write-verification-receipt.mjs, and the only publisher -
// scripts/orchestration/publish_pass<N>.py - asserts its own post-state and writes no
// receipt at all. This file is kept, and pinned by src/release-pipeline.test.ts and
// src/production-receipt.test.ts, because it is the schema-3 PUBLISHED receipt: it is what
// a caller must produce when publication is again performed by a machine that can observe a
// Pages build and a post-Pages live smoke (it requires both, plus the acceptance receipt,
// and refuses to write anything if their identities disagree). Whoever wires publication
// back into CI calls it there; until then, a receipt this writes would name a publication
// nobody performed. Do not call it from the verification workflow.
//
import { readFileSync, writeFileSync } from 'node:fs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function durationMs(start, end) {
  const value = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid receipt timestamps: ${start} -> ${end}`);
  return value;
}

export function buildProductionReceipt(input) {
  const { sourceSha, releasePass, releaseStartedAt, releaseBuiltAt, workflowRun, topology, pages, liveSmoke, acceptance } = input;
  if (topology.sourceSha !== sourceSha || topology.releasePass !== releasePass) throw new Error('Topology identity mismatch');
  if (pages.status !== 'built' || !/^[0-9a-f]{40}$/.test(pages.pagesSha ?? '')) throw new Error('Pages build is not exact and built');
  if (!liveSmoke.ok || liveSmoke.releasePass !== releasePass || liveSmoke.sourceSha !== sourceSha) throw new Error('Live smoke identity mismatch');
  if (!acceptance.ok || (acceptance.releasePass && acceptance.releasePass !== releasePass)) throw new Error('Acceptance receipt mismatch');
  return {
    schemaVersion: 3,
    sourceSha,
    pagesSha: pages.pagesSha,
    releasePass,
    releaseStartedAt,
    releaseBuiltAt,
    pagesStatus: pages.status,
    pagesCreatedAt: pages.createdAt,
    pagesUpdatedAt: pages.updatedAt,
    liveVerifiedAt: liveSmoke.verifiedAt,
    workflowRun,
    durations: {
      startToBuildMs: durationMs(releaseStartedAt, releaseBuiltAt),
      buildToPagesMs: durationMs(releaseBuiltAt, pages.updatedAt),
      pagesToLiveMs: durationMs(pages.updatedAt, liveSmoke.verifiedAt),
      totalMs: durationMs(releaseStartedAt, liveSmoke.verifiedAt),
    },
    acceptance,
    topology,
    liveSmoke,
  };
}

if (process.argv[1]?.endsWith('write-production-receipt.mjs')) {
  const receipt = buildProductionReceipt({
    sourceSha: process.env.SOURCE_SHA,
    releasePass: process.env.RELEASE_PASS,
    releaseStartedAt: process.env.RELEASE_STARTED_AT,
    releaseBuiltAt: process.env.RELEASE_BUILT_AT,
    workflowRun: process.env.GITHUB_RUN_ID,
    topology: readJson('artifacts/pipeline/release-topology.json'),
    pages: readJson('artifacts/pipeline/pages-build.json'),
    liveSmoke: readJson('artifacts/pipeline/live-release-smoke.json'),
    acceptance: readJson('artifacts/pipeline/acceptance-coverage.json'),
  });
  writeFileSync('artifacts/pipeline/production-release-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}
