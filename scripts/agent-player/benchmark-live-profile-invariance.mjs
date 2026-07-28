#!/usr/bin/env node

/**
 * Prove that Hermes profile/model settings do not enter Atomic's deterministic
 * rendered-frame detector/aim path, then benchmark identical saved frames.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  findPurpleOperatorCandidates,
  operatorCrosshairAlignment,
} from './vision.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}`);
    values[token.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

async function localImportGraph(entry) {
  const visited = new Set();
  const visit = async (path) => {
    const absolute = resolve(path);
    if (visited.has(absolute)) return;
    visited.add(absolute);
    const source = await readFile(absolute, 'utf8');
    const importPattern = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
    for (const match of source.matchAll(importPattern)) {
      let child = resolve(dirname(absolute), match[1]);
      if (!/\.[cm]?js$/.test(child)) child += '.mjs';
      await visit(child);
    }
  };
  await visit(entry);
  return [...visited].sort();
}

async function auditControlGraph() {
  const entry = resolve(here, 'atomic-player-driver.mjs');
  const files = await localImportGraph(entry);
  const forbiddenPattern = /openai|hermes|gpt-5|service_tier|reasoning_effort|anthropic|deepseek|chat\.completions|responses\.create/i;
  const networkPattern = /\bfetch\s*\(|axios|node:https|node:http/i;
  const findings = [];
  let profileEnvironmentRead = false;
  for (const path of files) {
    const source = await readFile(path, 'utf8');
    if (forbiddenPattern.test(source)) findings.push({ path, kind: 'model-or-profile-reference' });
    if (networkPattern.test(source)) findings.push({ path, kind: 'network-client-reference' });
    if (/HERMES_PROFILE|HERMES_HOME|reasoning_effort|service_tier/.test(source)) profileEnvironmentRead = true;
  }
  return {
    entry,
    transitiveLocalFiles: files,
    transitiveLocalFileCount: files.length,
    findings,
    modelOrNetworkFree: findings.length === 0,
    profileEnvironmentRead,
  };
}

function semanticCandidate(candidate, width, height) {
  const alignment = operatorCrosshairAlignment(candidate, width, height);
  return {
    x: candidate.x,
    y: candidate.y,
    pixels: candidate.pixels,
    bounds: candidate.bounds,
    alignment: {
      horizontal: alignment.horizontal,
      vertical: alignment.vertical,
      normalized: alignment.normalized,
      aligned: alignment.aligned,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profile = args.profile ?? process.env.HERMES_PROFILE ?? 'unset';
  const iterations = Number(args.iterations ?? 5);
  const evidenceDirectory = resolve(repoRoot, args.frames ?? 'artifacts/agent-player/archive/games/G0076/fire-evidence');
  const names = (await readdir(evidenceDirectory))
    .filter((name) => /^burst-\d+\.jpg$/.test(name))
    .sort();
  if (names.length === 0) throw new Error(`No saved fire-evidence frames in ${evidenceDirectory}`);

  const frames = [];
  for (const name of names) {
    const decoded = await sharp(resolve(evidenceDirectory, name))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    frames.push({ name, raw: decoded.data, width: decoded.info.width, height: decoded.info.height, channels: decoded.info.channels });
  }

  const graphAudit = await auditControlGraph();
  const started = performance.now();
  let finalSemantics = null;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    finalSemantics = frames.map((frame) => {
      const candidates = findPurpleOperatorCandidates(frame.raw, frame.width, frame.height, frame.channels);
      return {
        frame: frame.name,
        width: frame.width,
        height: frame.height,
        rejectedReason: candidates.rejectedReason ?? null,
        candidates: candidates.map((candidate) => semanticCandidate(candidate, frame.width, frame.height)),
      };
    });
  }
  const elapsedMs = performance.now() - started;
  const semanticJson = JSON.stringify(finalSemantics);
  const semanticSha256 = createHash('sha256').update(semanticJson).digest('hex');
  const candidateCount = finalSemantics.reduce((sum, frame) => sum + frame.candidates.length, 0);
  const report = {
    schemaVersion: 1,
    kind: 'atomic-profile-live-loop-invariance',
    profileLabel: profile,
    profileEnvironment: process.env.HERMES_PROFILE ?? null,
    profileEnvironmentReadByControlPath: graphAudit.profileEnvironmentRead,
    graphAudit,
    evidence: {
      source: 'G0076 saved rendered fire-evidence JPEGs',
      frameCount: frames.length,
      iterations,
      detectorEvaluations: frames.length * iterations,
      finalCandidateCount: candidateCount,
      semanticSha256,
      detectorElapsedMs: elapsedMs,
      detectorMeanMsPerFrame: elapsedMs / (frames.length * iterations),
    },
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!graphAudit.modelOrNetworkFree || graphAudit.profileEnvironmentRead) process.exitCode = 1;
}

await main();
