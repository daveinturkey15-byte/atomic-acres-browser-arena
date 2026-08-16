#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createPass71Hf313LivePostcondition } from '../qa/pass71-hf313-release-evidence-contract.mjs';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function durationMs(start, end) {
  const value = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid receipt timestamps: ${start} -> ${end}`);
  return value;
}

export function buildProductionReceipt(input) {
  const {
    sourceSha, releasePass, releaseStartedAt, releaseBuiltAt, workflowRun,
    topology, pages, liveSmoke, acceptance, previewProvenance = null,
  } = input;
  if (topology.sourceSha !== sourceSha || topology.releasePass !== releasePass) throw new Error('Topology identity mismatch');
  if (pages.status !== 'built' || !/^[0-9a-f]{40}$/.test(pages.pagesSha ?? '')) throw new Error('Pages build is not exact and built');
  if (!liveSmoke.ok || liveSmoke.releasePass !== releasePass || liveSmoke.sourceSha !== sourceSha) throw new Error('Live smoke identity mismatch');
  if (!acceptance.ok || (acceptance.releasePass && acceptance.releasePass !== releasePass)) throw new Error('Acceptance receipt mismatch');
  const hf313 = releasePass === 'PASS 71'
    ? createPass71Hf313LivePostcondition({
      sourceSha, releasePass, topology, pages, liveSmoke, acceptance, previewProvenance,
    })
    : null;
  if (hf313 && hf313.status !== 'live-verified') throw new Error('HF-313 production postcondition is not live-verified');
  return {
    schemaVersion: 4,
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
    candidate: {
      candidateASourceSha: releasePass === 'PASS 71' ? acceptance.previewSourceSha : null,
      candidateBSourceSha: sourceSha,
      manifestOnlyFinalizer: releasePass === 'PASS 71'
        ? acceptance.approvalParity?.ok === true
          && JSON.stringify(acceptance.approvalParity.paths) === JSON.stringify(['acceptance/pass-71.json'])
        : null,
    },
    acceptance,
    previewProvenance,
    topology,
    liveSmoke,
    postconditions: hf313 ? { hf313 } : {},
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
    previewProvenance: existsSync('artifacts/pipeline/pr-preview-provenance.json')
      ? readJson('artifacts/pipeline/pr-preview-provenance.json')
      : null,
  });
  writeFileSync('artifacts/pipeline/production-release-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(receipt, null, 2));
}
